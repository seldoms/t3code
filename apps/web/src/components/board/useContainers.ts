import { useEffect, useRef, useState } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";
import { primaryRawFetch } from "../../environments/primary/rawFetch";

export interface ContainerEntry {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly state: string;
  readonly status: string;
  readonly ports: string;
  readonly created: number;
  readonly stack: string | null;
}

export interface ContainersSnapshot {
  readonly configured: boolean;
  readonly error?: string;
  readonly url?: string;
  readonly containers: ReadonlyArray<ContainerEntry>;
}

const REFRESH_MS = 15_000;

function endpoint(): string {
  try {
    return resolvePrimaryEnvironmentHttpUrl("/api/integrations/containers");
  } catch {
    return "/api/integrations/containers";
  }
}

/** 每 15 秒读一次容器列表（Portainer 只读接口），返回快照和手动刷新。 */
export function useContainers(): {
  snapshot: ContainersSnapshot | null;
  refresh: () => void;
} {
  const [snapshot, setSnapshot] = useState<ContainersSnapshot | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 轮询 Portainer 容器快照（外部 HTTP 资源），卸载即停；手动刷新走 loadRef
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await primaryRawFetch(endpoint());
        if (!response.ok) return;
        const body: unknown = await response.json();
        if (typeof body !== "object" || body === null) return;
        if (!cancelled) setSnapshot(body as ContainersSnapshot);
      } catch {
        // 保持上一次结果
      }
    };
    loadRef.current = load;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { snapshot, refresh: () => void loadRef.current() };
}

export type ContainerAction = "start" | "stop" | "restart";

/** 容器写操作：服务端只监听回环，页面负责二次确认。 */
export async function runContainerAction(
  id: string,
  action: ContainerAction,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await primaryRawFetch(`${endpoint()}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    return (await response.json()) as { ok: boolean; error?: string };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "fetch-failed" };
  }
}

/** 读容器最近 tail 行日志。 */
export async function fetchContainerLogs(
  id: string,
  tail = 200,
): Promise<{ ok: boolean; error?: string; logs?: string }> {
  try {
    const response = await primaryRawFetch(
      `${endpoint()}/logs?id=${encodeURIComponent(id)}&tail=${tail}`,
    );
    return (await response.json()) as { ok: boolean; error?: string; logs?: string };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "fetch-failed" };
  }
}
