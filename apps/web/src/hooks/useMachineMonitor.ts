// @effect-diagnostics globalTimers:off globalDate:off - 浏览器侧共享轮询，不在 Effect runtime 里。
import { useAtomValue } from "@effect/atom-react";
import { useClientSettings } from "./useSettings";
import { useNowSecond } from "./useNowSecond";
import { Atom } from "effect/reactivity";
import { AuthOrchestrationReadScope, type EnvironmentId } from "@t3tools/contracts";
import { useEffect, useSyncExternalStore } from "react";
import {
  readPreparedConnection,
  readEnvironmentScope,
  useEnvironmentsWithScope,
} from "../state/session";

import { useEnvironments, usePrimaryEnvironmentId } from "../state/environments";
import { serverEnvironment } from "../state/server";
import {
  useHostMetrics,
  useHostRates,
  type HostMetricsSnapshot,
} from "../components/board/useHostMetrics";
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

// 取数放在 hook 之外：React Compiler 不支持 hook 内的 try/finally。
async function fetchEnvironmentSnapshots(
  ids: readonly EnvironmentId[],
  signal: AbortSignal,
): Promise<Array<readonly [EnvironmentId, HostMetricsSnapshot]>> {
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
          signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
        });
        if (!response.ok) return null;
        const data = (await response.json()) as HostMetricsSnapshot;
        if (typeof data.host !== "string" || typeof data.diskPercent !== "number") return null;
        return [id, { ...data, receivedAt: Date.now() }] as const;
      } catch {
        return null;
      }
    }),
  );
  return entries.filter((entry) => entry !== null);
}

// 远端明细同样共享：一条 10s 链喂所有界面，最后一个订阅者走人才停。
let remoteKey = "";
let remoteDetails: ReadonlyMap<EnvironmentId, HostMetricsSnapshot> = new Map();
const remoteListeners = new Set<() => void>();
let remoteHolders = 0;
let remoteTimer: ReturnType<typeof setInterval> | null = null;
let remoteController: AbortController | null = null;
let remoteInFlight = false;

function emitRemote() {
  for (const listener of remoteListeners) listener();
}

async function loadRemote() {
  if (remoteInFlight || remoteController === null) return;
  remoteInFlight = true;
  const ids = remoteKey ? (remoteKey.split("\n") as EnvironmentId[]) : [];
  const entries = await fetchEnvironmentSnapshots(ids, remoteController.signal);
  remoteInFlight = false;
  if (remoteController === null) return;
  const next = new Map<EnvironmentId, HostMetricsSnapshot>();
  for (const id of ids) {
    const fresh = entries.find((entry) => entry[0] === id);
    const old = remoteDetails.get(id);
    if (fresh) next.set(id, fresh[1]);
    else if (old) next.set(id, { ...old, error: "refresh-failed" });
  }
  remoteDetails = next;
  emitRemote();
}

function stopRemote() {
  if (remoteTimer !== null) clearInterval(remoteTimer);
  remoteTimer = null;
  remoteController?.abort();
  remoteController = null;
}

function acquireRemote(key: string) {
  remoteHolders += 1;
  if (remoteKey !== key) {
    stopRemote();
    remoteKey = key;
    remoteDetails = new Map();
  }
  if (remoteTimer === null) {
    remoteController = new AbortController();
    void loadRemote();
    remoteTimer = setInterval(() => void loadRemote(), 10_000);
  }
  return () => {
    // 显式计数，别赌 effect 清理和 store 退订的先后顺序；最后一个人走了才停表。
    remoteHolders -= 1;
    if (remoteHolders === 0) stopRemote();
  };
}

function subscribeRemote(listener: () => void) {
  remoteListeners.add(listener);
  return () => {
    remoteListeners.delete(listener);
  };
}

const getRemoteDetails = () => remoteDetails;

export function useMachineMonitor() {
  const preferences = useClientSettings();
  const now = useNowSecond();
  const metrics = useHostMetrics();
  const rates = useHostRates();
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
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 订阅共享的远端快照，环境集合变化时重启那一条轮询
  useEffect(() => acquireRemote(remoteIdsKey), [remoteIdsKey]);
  const details = useSyncExternalStore(subscribeRemote, getRemoteDetails, getRemoteDetails);
  const resources = useAtomValue(
    resourcesByEnvironment(
      connected
        .map((entry) => entry.environmentId)
        .sort()
        .join("\n"),
    ),
  );
  const rows = monitoredMachines(metrics, environments, primaryId, now, rates);
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
        const gpu = detail?.gpu ?? machine.gpu;
        const gpuMemoryUsed = detail?.gpuMemoryUsed ?? machine.gpuMemoryUsed;
        const gpuMemoryTotal = detail?.gpuMemoryTotal ?? machine.gpuMemoryTotal;
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
        return {
          ...machine,
          cpu,
          memory,
          disk,
          netRx: machine.netRx,
          netTx: machine.netTx,
          latencyMs: machine.latencyMs,
          sampledAt,
          stale,
          // 环境直连的鉴权快照比 SSH 探针新，有就用它覆盖整份明细。
          cores: detail?.cores ?? machine.cores,
          coreUtilization:
            detail?.coreUtilization && detail.coreUtilization.length > 0
              ? detail.coreUtilization
              : machine.coreUtilization,
          cpuHistory:
            detail?.cpuHistory && detail.cpuHistory.length > 0
              ? detail.cpuHistory
              : machine.cpuHistory,
          uptimeSeconds: detail?.uptimeSeconds ?? machine.uptimeSeconds,
          memUsedBytes: detail?.memUsed ?? machine.memUsedBytes,
          memTotalBytes: detail?.memTotal ?? machine.memTotalBytes,
          diskUsedBytes: detail?.diskUsed ?? machine.diskUsedBytes,
          diskTotalBytes: detail?.diskTotal ?? machine.diskTotalBytes,
          gpu,
          gpuName: detail?.gpuName ?? machine.gpuName,
          gpuMemoryUsed,
          gpuMemoryTotal,
          gpuMemoryPercent:
            gpuMemoryUsed !== null && gpuMemoryTotal !== null && gpuMemoryTotal > 0
              ? Math.round((gpuMemoryUsed / gpuMemoryTotal) * 100)
              : machine.gpuMemoryPercent,
          sensors: detail?.sensors ?? machine.sensors,
          interfaces:
            detail?.interfaces && detail.interfaces.length > 0
              ? detail.interfaces.map((entry) => ({
                  name: entry.name,
                  rxTotal: entry.rxTotal,
                  txTotal: entry.txTotal,
                  rxPerSecond: entry.rxPerSecond ?? null,
                  txPerSecond: entry.txPerSecond ?? null,
                  virtual:
                    machine.interfaces.find((known) => known.name === entry.name)?.virtual ?? false,
                }))
              : machine.interfaces,
        };
      }),
  };
}
