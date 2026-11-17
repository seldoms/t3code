// @effect-diagnostics globalTimers:off globalDate:off - 浏览器侧共享轮询，不在 Effect runtime 里。
import { useSyncExternalStore } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";
import { primaryRawFetch } from "../../environments/primary/rawFetch";

export interface RemoteHostSnapshot {
  readonly host: string;
  readonly online: boolean;
  readonly alias?: string;
  readonly cpu?: number | null;
  readonly error?: string;
  readonly cores?: number;
  readonly coreUtilization?: readonly number[];
  readonly load?: readonly [number, number, number];
  readonly memPercent?: number | null;
  readonly memUsed?: number;
  readonly memTotal?: number;
  readonly diskPercent?: number | null;
  readonly diskUsed?: number;
  readonly diskTotal?: number;
  readonly gpu?: number | null;
  readonly gpuName?: string;
  readonly gpuMemoryUsed?: number;
  readonly gpuMemoryTotal?: number;
  readonly sensors?: ReadonlyArray<HostSensorReading>;
  readonly interfaces?: ReadonlyArray<HostNetworkInterface>;
  readonly uptimeSeconds?: number;
  readonly netRx?: number | null;
  readonly netTx?: number | null;
  readonly latencyMs?: number | null;
  readonly sampledAt?: number;
  readonly cpuHistory?: readonly number[];
}

/** 与 apps/server/src/hostmetrics/sensors.ts 保持同一口径。 */
export interface HostSensorReading {
  readonly label: string;
  readonly kind: "cpu" | "gpu" | "battery" | "board";
  readonly celsius: number;
}

export interface HostNetworkInterface {
  readonly name: string;
  readonly rxTotal: number;
  readonly txTotal: number;
  readonly rxPerSecond?: number | null;
  readonly txPerSecond?: number | null;
}

export interface HostMetricsSnapshot {
  readonly host: string;
  readonly platform: string;
  readonly cores: number;
  readonly cpu: number | null;
  readonly load: readonly [number, number, number];
  readonly memUsed: number;
  readonly memTotal: number;
  readonly memPercent: number;
  readonly diskUsed: number;
  readonly diskTotal: number;
  readonly diskPercent: number;
  readonly gpu: number | null;
  readonly coreUtilization?: readonly number[];
  readonly gpuName?: string;
  readonly gpuMemoryUsed?: number;
  readonly gpuMemoryTotal?: number;
  readonly sensors?: ReadonlyArray<HostSensorReading>;
  readonly interfaces?: ReadonlyArray<HostNetworkInterface>;
  readonly uptimeSeconds: number;
  readonly sampledAt?: number;
  readonly receivedAt?: number;
  readonly error?: string;
  readonly remotes?: ReadonlyArray<RemoteHostSnapshot>;
  readonly netRxTotal?: number;
  readonly netTxTotal?: number;
  readonly diskReadTotal?: number;
  readonly diskWriteTotal?: number;
  readonly cpuHistory?: readonly number[];
}

const REFRESH_MS = 2000;

export interface HostMetricsRates {
  readonly netRx: number | null;
  readonly netTx: number | null;
  readonly diskRead: number | null;
  readonly diskWrite: number | null;
}

/** 一阶差分算本机网络与磁盘速率；远程主机由探针直接给出网络速率。 */
export function hostRates(
  previous: HostMetricsSnapshot | null,
  current: HostMetricsSnapshot,
): HostMetricsRates | null {
  if (previous === null || previous.host !== current.host) return null;
  const seconds = ((current.receivedAt ?? 0) - (previous.receivedAt ?? 0)) / 1000;
  if (seconds <= 0) return null;
  const rate = (prev: number | undefined, next: number | undefined) =>
    typeof prev === "number" && typeof next === "number" && next >= prev
      ? Math.round((next - prev) / seconds)
      : null;
  return {
    netRx: rate(previous.netRxTotal, current.netRxTotal),
    netTx: rate(previous.netTxTotal, current.netTxTotal),
    diskRead: rate(previous.diskReadTotal, current.diskReadTotal),
    diskWrite: rate(previous.diskWriteTotal, current.diskWriteTotal),
  };
}

const CPU_HISTORY_LIMIT = 60;

/** 只追加真收到的采样；同一个 sampledAt 不重复入队，趋势线不会被重渲染灌水。 */
function appendCpuHistory(
  previous: readonly number[] | undefined,
  cpu: number | null | undefined,
): readonly number[] {
  const series = previous ?? [];
  if (typeof cpu !== "number" || !Number.isFinite(cpu)) return series;
  return [...series, cpu].slice(-CPU_HISTORY_LIMIT);
}

function withHistories(
  previous: HostMetricsSnapshot | null,
  next: HostMetricsSnapshot,
): HostMetricsSnapshot {
  const sameSample = previous !== null && previous.sampledAt === next.sampledAt;
  const remotes = next.remotes?.map((remote) => {
    const before = previous?.remotes?.find((entry) => entry.host === remote.host);
    return before?.sampledAt === remote.sampledAt
      ? { ...remote, cpuHistory: before?.cpuHistory ?? [] }
      : { ...remote, cpuHistory: appendCpuHistory(before?.cpuHistory, remote.cpu) };
  });
  return {
    ...next,
    cpuHistory: sameSample
      ? (previous?.cpuHistory ?? [])
      : appendCpuHistory(previous?.cpuHistory, next.cpu),
    ...(remotes ? { remotes } : {}),
  };
}

function endpoint(): string {
  try {
    return resolvePrimaryEnvironmentHttpUrl("/api/host/metrics");
  } catch {
    return "/api/host/metrics";
  }
}

// 取数与校验放在 hook 之外：React Compiler 不支持 hook 内的 try/finally 与 try 内 throw。
async function fetchSnapshot(signal: AbortSignal): Promise<HostMetricsSnapshot | null> {
  try {
    const response = await primaryRawFetch(endpoint(), {
      headers: { accept: "application/json" },
      signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (typeof body !== "object" || body === null) return null;
    const value = body as HostMetricsSnapshot;
    return typeof value.host === "string" ? value : null;
  } catch {
    return null;
  }
}

// 一份快照喂所有消费者：侧栏、看板、设置页、桌面小组件共用同一条 2s 轮询和同一份趋势历史。
// 每个组件各起一条链的话，开四个界面就是四倍请求和四倍重渲染，点设置都会卡。
let snapshot: HostMetricsSnapshot | null = null;
let rates: HostMetricsRates | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let controller: AbortController | null = null;
let inFlight = false;

function emit() {
  for (const listener of listeners) listener();
}

async function load() {
  if (inFlight || controller === null) return;
  inFlight = true;
  const value = await fetchSnapshot(
    AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
  );
  inFlight = false;
  if (controller === null) return;
  if (value === null) {
    if (snapshot === null) return;
    snapshot = { ...snapshot, error: "refresh-failed" };
  } else {
    const next = { ...value, receivedAt: Date.now() };
    // 差分失败（首帧/计数器回绕）保留上一次速率，别闪成空白。
    rates = hostRates(snapshot, next) ?? rates;
    snapshot = withHistories(snapshot, next);
  }
  emit();
}

function start() {
  controller = new AbortController();
  void load();
  timer = setInterval(() => void load(), REFRESH_MS);
}

function stop() {
  if (timer !== null) clearInterval(timer);
  timer = null;
  controller?.abort();
  controller = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

const getSnapshot = () => snapshot;
const getRates = () => rates;
const getServerSnapshot = () => null;

/** 每 2 秒一次本机负载；订阅者归零就停表，没有后台定时器。 */
export function useHostMetrics(): HostMetricsSnapshot | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 本机只有累计字节，速率由共享 store 差分得出。 */
export function useHostRates(): HostMetricsRates | null {
  return useSyncExternalStore(subscribe, getRates, getServerSnapshot);
}
