import { useEffect, useState } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";
import { primaryRawFetch } from "../../environments/primary/rawFetch";

export interface RemoteHostSnapshot {
  readonly host: string;
  readonly online: boolean;
  readonly alias?: string;
  readonly cpu?: number | null;
  readonly error?: string;
  readonly cores?: number;
  readonly load?: readonly [number, number, number];
  readonly memPercent?: number | null;
  readonly diskPercent?: number | null;
  readonly gpu?: number | null;
  readonly netRx?: number | null;
  readonly netTx?: number | null;
  readonly latencyMs?: number | null;
  readonly sampledAt?: number;
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
  readonly uptimeSeconds: number;
  readonly sampledAt?: number;
  readonly receivedAt?: number;
  readonly error?: string;
  readonly remotes?: ReadonlyArray<RemoteHostSnapshot>;
  readonly netRxTotal?: number;
  readonly netTxTotal?: number;
  readonly diskReadTotal?: number;
  readonly diskWriteTotal?: number;
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

function endpoint(): string {
  try {
    return resolvePrimaryEnvironmentHttpUrl("/api/host/metrics");
  } catch {
    return "/api/host/metrics";
  }
}

/**
 * 每 2 秒拉一次本机负载。节奏跟面板可见性绑定：组件卸载就停，没有后台定时器。
 */
export function useHostMetrics(): HostMetricsSnapshot | null {
  const [metrics, setMetrics] = useState<HostMetricsSnapshot | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 轮询服务端 /api/host/metrics，把外部负载快照同步进 React，卸载即停
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      try {
        const response = await primaryRawFetch(endpoint(), {
          headers: { accept: "application/json" },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        if (!response.ok) throw new Error("metrics-request-failed");
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null) throw new Error("invalid-metrics");
        const value = body as HostMetricsSnapshot;
        if (typeof value.host !== "string") throw new Error("invalid-metrics");
        if (!cancelled) setMetrics({ ...value, receivedAt: Date.now() });
      } catch {
        if (!cancelled) setMetrics((old) => (old ? { ...old, error: "refresh-failed" } : null));
      } finally {
        inFlight = false;
      }
    };

    void load();
    timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, []);

  return metrics;
}
