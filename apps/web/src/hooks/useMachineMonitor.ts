import { useAtomValue } from "@effect/atom-react";
import { useClientSettings } from "./useSettings";
import { useNowSecond } from "./useNowSecond";
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
      return {
        environmentId,
        data: result._tag === "Success" ? result.value : null,
        receivedAt: result._tag === "Success" ? result.timestamp : null,
        error: result._tag === "Failure",
      };
    });
    return values;
  }),
);

export function useMachineMonitor() {
  const preferences = useClientSettings();
  const now = useNowSecond();
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
      if (active || cancelled) return;
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
              return [id, { ...data, receivedAt: Date.now() }] as const;
            } catch {
              return null;
            }
          }),
        );
        if (!cancelled)
          setDetails((previous) => {
            const next = new Map<EnvironmentId, HostMetricsSnapshot>();
            for (const id of ids) {
              const fresh = entries.find((entry) => entry?.[0] === id);
              const old = previous.get(id);
              if (fresh) next.set(id, fresh[1]);
              else if (old) next.set(id, { ...old, error: "refresh-failed" });
            }
            return next;
          });
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
  const rows = monitoredMachines(metrics, environments, primaryId, now);
  return {
    metrics,
    allMachines: rows,
    machines: rows
      .filter(
        (machine) =>
          preferences.machineMonitorScope !== "hidden" &&
          !preferences.hiddenMonitorMachines.includes(machine.key) &&
          (preferences.machineMonitorScope === "all" ||
            machine.local ||
            (preferences.machineMonitorScope === "environments" && machine.environmentId !== null)),
      )
      .map((machine) => {
        if (machine.local || !machine.environmentId || machine.connection !== "connected")
          return machine;
        const detail = details.get(machine.environmentId);
        const sample = resources.find((entry) => entry.environmentId === machine.environmentId);
        const resource = sample?.data;
        const cpu =
          resource?.cpuUtilization != null
            ? Math.round(resource.cpuUtilization * 100)
            : (detail?.cpu ?? machine.cpu);
        const memory =
          resource && resource.totalMemoryBytes > 0
            ? Math.round((1 - resource.availableMemoryBytes / resource.totalMemoryBytes) * 100)
            : (detail?.memPercent ?? machine.memory);
        const disk = detail?.diskPercent ?? machine.disk;
        const sampledAt =
          resource?.sampledAt ?? detail?.sampledAt ?? detail?.receivedAt ?? machine.sampledAt;
        const receivedAt = sample?.receivedAt ?? detail?.receivedAt ?? machine.sampledAt;
        const stale =
          (detail === undefined && machine.disk !== null && machine.stale) ||
          sample?.error === true ||
          detail?.error !== undefined ||
          receivedAt === null ||
          now - receivedAt > 30_000 ||
          (detail?.receivedAt !== undefined && now - detail.receivedAt > 30_000);
        return { ...machine, cpu, memory, disk, sampledAt, stale };
      }),
  };
}
