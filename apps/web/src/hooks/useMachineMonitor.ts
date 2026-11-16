import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { AuthOrchestrationReadScope, type EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import {
  readPreparedConnection,
  readEnvironmentScope,
  useEnvironmentsWithScope,
} from "../state/session";

import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { serverEnvironment } from "../state/server";
import { useHostMetrics, type HostMetricsSnapshot } from "../components/board/useHostMetrics";
import { monitoredMachines } from "../components/board/machineMonitor.logic";

const resourcesByEnvironment = Atom.family((key: string) =>
  Atom.make((get) => {
    const ids = key ? (key.split("\n") as EnvironmentId[]) : [];
    const values = ids.map((environmentId) => {
      const query = serverEnvironment.hostResources({ environmentId, input: {} });
      const result = get(query);
      return { environmentId, data: result._tag === "Success" ? result.value : null };
    });
    const timer = setInterval(() => {
      for (const environmentId of ids)
        get.refresh(serverEnvironment.hostResources({ environmentId, input: {} }));
    }, 5000);
    get.addFinalizer(() => clearInterval(timer));
    return values;
  }),
);

export function useMachineMonitor() {
  const metrics = useHostMetrics();
  const { environments } = useEnvironments();
  const primaryId = usePrimaryEnvironmentId();
  const readable = useEnvironmentsWithScope(environments, AuthOrchestrationReadScope);
  const connected = environments.filter(
    (entry) => entry.connection.phase === "connected" && readable.has(entry.environmentId),
  );
  const remoteIdsKey = connected
    .filter((entry) => entry.environmentId !== primaryId)
    .map((entry) => entry.environmentId)
    .sort()
    .join("\n");
  const [details, setDetails] = useState<ReadonlyMap<EnvironmentId, HostMetricsSnapshot>>(
    new Map(),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Poll authenticated host snapshots from connected environments; abort on disconnect/unmount.
  useEffect(() => {
    const ids = remoteIdsKey ? (remoteIdsKey.split("\n") as EnvironmentId[]) : [];
    let cancelled = false;
    let active = false;
    const controller = new AbortController();
    const load = async () => {
      if (active) return;
      active = true;
      try {
        const entries = await Promise.all(
          ids.map(async (id) => {
            const prepared = readPreparedConnection(id);
            if (
              !prepared ||
              !readEnvironmentScope(id, AuthOrchestrationReadScope) ||
              prepared.httpAuthorization?._tag === "Dpop"
            )
              return null;
            try {
              const response = await fetch(new URL("/api/host/metrics", prepared.httpBaseUrl), {
                credentials: prepared.httpAuthorization === null ? "include" : "omit",
                headers:
                  prepared.httpAuthorization?._tag === "Bearer"
                    ? { authorization: `Bearer ${prepared.httpAuthorization.token}` }
                    : {},
                redirect: "error",
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(6000)]),
              });
              if (!response.ok) return null;
              const data = (await response.json()) as HostMetricsSnapshot;
              if (typeof data.host !== "string" || typeof data.diskPercent !== "number")
                return null;
              return [id, data] as const;
            } catch {
              return null;
            }
          }),
        );
        if (!cancelled) setDetails(new Map(entries.filter((entry) => entry !== null)));
      } finally {
        active = false;
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [remoteIdsKey]);
  const resources = useAtomValue(
    resourcesByEnvironment(
      connected
        .map((entry) => entry.environmentId)
        .sort()
        .join("\n"),
    ),
  );
  const rows = monitoredMachines(metrics, environments, primaryId);
  return {
    metrics,
    machines: rows.map((machine) => {
      if (machine.local || !machine.environmentId || machine.connection !== "connected")
        return machine;
      const detail = details.get(machine.environmentId);
      const resource = resources.find(
        (entry) => entry.environmentId === machine.environmentId,
      )?.data;
      if (!resource && !detail) return machine;
      if (!resource)
        return {
          ...machine,
          cpu: detail?.cpu ?? machine.cpu,
          memory: detail?.memPercent ?? machine.memory,
          disk: detail?.diskPercent ?? machine.disk,
        };
      return {
        ...machine,
        disk: detail?.diskPercent ?? machine.disk,
        cpu:
          resource.cpuUtilization === null
            ? machine.cpu
            : Math.round(resource.cpuUtilization * 100),
        memory:
          resource.totalMemoryBytes > 0
            ? Math.round((1 - resource.availableMemoryBytes / resource.totalMemoryBytes) * 100)
            : machine.memory,
      };
    }),
  };
}
