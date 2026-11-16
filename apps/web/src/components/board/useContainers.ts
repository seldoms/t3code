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

/** 一台 Docker 主机（Portainer endpoint）的容器集合。 */
export interface HostContainers {
  readonly endpointId: number;
  readonly name: string;
  readonly online: boolean;
  readonly error?: string;
  readonly containers: ReadonlyArray<ContainerEntry>;
}

export interface ContainersSnapshot {
  readonly configured: boolean;
  readonly error?: string;
  readonly url?: string;
  readonly hosts: ReadonlyArray<HostContainers>;
}

export interface ImageEntry {
  readonly id: string;
  readonly tags: ReadonlyArray<string>;
  readonly sizeBytes: number;
  readonly created: number;
  readonly containers: number;
}

export interface ImagesSnapshot {
  readonly ok: boolean;
  readonly error?: string;
  readonly images: ReadonlyArray<ImageEntry>;
}

const REFRESH_MS = 15_000;

function endpoint(): string {
  try {
    return resolvePrimaryEnvironmentHttpUrl("/api/integrations/containers");
  } catch {
    return "/api/integrations/containers";
  }
}

function imagesEndpoint(endpointId: number): string {
  try {
    return resolvePrimaryEnvironmentHttpUrl(`/api/integrations/images?endpointId=${endpointId}`);
  } catch {
    return `/api/integrations/images?endpointId=${endpointId}`;
  }
}

/** 每 15 秒读一次容器列表（按主机分组），返回快照和手动刷新。 */
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

/** 按需拉一台主机的镜像列表（不轮询，点开主机时取）。 */
export async function fetchImages(endpointId: number): Promise<ImagesSnapshot | null> {
  try {
    const response = await primaryRawFetch(imagesEndpoint(endpointId));
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null ? (body as ImagesSnapshot) : null;
  } catch {
    return null;
  }
}

export type ContainerAction = "start" | "stop" | "restart" | "remove";

/** 容器写操作：服务端只监听回环，页面负责二次确认；删除仅限已停止的容器。 */
export async function runContainerAction(
  endpointId: number,
  id: string,
  action: ContainerAction,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await primaryRawFetch(`${endpoint()}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpointId, id, action }),
    });
    return (await response.json()) as { ok: boolean; error?: string };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "fetch-failed" };
  }
}

/** 读容器最近 tail 行日志。 */
export async function fetchContainerLogs(
  endpointId: number,
  id: string,
  tail = 200,
): Promise<{ ok: boolean; error?: string; logs?: string }> {
  try {
    const response = await primaryRawFetch(
      `${endpoint()}/logs?endpointId=${endpointId}&id=${encodeURIComponent(id)}&tail=${tail}`,
    );
    return (await response.json()) as { ok: boolean; error?: string; logs?: string };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "fetch-failed" };
  }
}

/** 删除镜像：被容器引用时 Docker 409，如实报错。 */
export async function removeImage(
  endpointId: number,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const base = imagesEndpoint(endpointId).split("?")[0];
    const response = await primaryRawFetch(`${base}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ endpointId, id, action: "remove" }),
    });
    return (await response.json()) as { ok: boolean; error?: string };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "fetch-failed" };
  }
}
