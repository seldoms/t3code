import { useEffect, useState } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";
import { primaryRawFetch } from "../../environments/primary/rawFetch";

export interface RemoteHostSnapshot {
  readonly host: string;
  readonly online: boolean;
  readonly cores?: number;
  readonly load?: readonly [number, number, number];
  readonly memPercent?: number;
  readonly diskPercent?: number;
  readonly gpu?: number | null;
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
  readonly remotes?: ReadonlyArray<RemoteHostSnapshot>;
}

const REFRESH_MS = 2000;

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
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const response = await primaryRawFetch(endpoint(), {
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null) return;
        const value = body as HostMetricsSnapshot;
        if (typeof value.host !== "string") return;
        if (!cancelled) setMetrics(value);
      } catch {
        // 拿不到就保持上一次的数字，不闪成 0。
      }
    };

    void load();
    timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return metrics;
}
