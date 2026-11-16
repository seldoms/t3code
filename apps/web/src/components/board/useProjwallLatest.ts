import { useEffect, useState } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";
import { primaryRawFetch } from "../../environments/primary/rawFetch";

/** 快照字段多且随采集器变，只取看板需要的几个，避免被上游字段率着走。 */
export interface ProjwallProject {
  readonly name: string;
  readonly path: string;
  readonly kind?: string;
  readonly purpose?: string | null;
  readonly branch?: string | null;
  readonly last_commit_at?: string | null;
  readonly last_commit_subject?: string | null;
  readonly dirty?: boolean;
  readonly ahead?: number;
  readonly behind?: number;
}

export interface ProjwallLatest {
  readonly available: boolean;
  readonly mtime: number | null;
  readonly projects: ReadonlyArray<ProjwallProject>;
  readonly scannedAt: string | null;
}

const EMPTY: ProjwallLatest = { available: false, mtime: null, projects: [], scannedAt: null };

const REFRESH_MS = 60_000;

function endpoint(): string {
  try {
    return resolvePrimaryEnvironmentHttpUrl("/api/projwall/latest");
  } catch {
    // 桌面端没有 primary environment 时退回同源相对路径。
    return "/api/projwall/latest";
  }
}

function parse(body: unknown): ProjwallLatest {
  if (typeof body !== "object" || body === null) return EMPTY;
  const envelope = body as {
    available?: unknown;
    mtime?: unknown;
    snapshot?: unknown;
  };
  if (envelope.available !== true) return EMPTY;
  const snapshot = envelope.snapshot as { projects?: unknown; scanned_at?: unknown } | null;
  const rawProjects = Array.isArray(snapshot?.projects) ? snapshot.projects : [];
  const projects: ProjwallProject[] = [];
  for (const entry of rawProjects) {
    if (typeof entry !== "object" || entry === null) continue;
    const project = entry as Record<string, unknown>;
    const path = typeof project.path === "string" ? project.path : null;
    const name =
      typeof project.name === "string" ? project.name : (path?.split("/").at(-1) ?? null);
    if (!path || !name) continue;
    projects.push({
      name,
      path,
      ...(typeof project.kind === "string" ? { kind: project.kind } : {}),
      purpose: typeof project.purpose === "string" ? project.purpose : null,
      branch: typeof project.branch === "string" ? project.branch : null,
      last_commit_at: typeof project.last_commit_at === "string" ? project.last_commit_at : null,
      last_commit_subject:
        typeof project.last_commit_subject === "string" ? project.last_commit_subject : null,
      dirty: project.dirty === true,
      ...(typeof project.ahead === "number" ? { ahead: project.ahead } : {}),
      ...(typeof project.behind === "number" ? { behind: project.behind } : {}),
    });
  }
  return {
    available: true,
    mtime: typeof envelope.mtime === "number" ? envelope.mtime : null,
    projects,
    scannedAt: typeof snapshot?.scanned_at === "string" ? snapshot.scanned_at : null,
  };
}

export function useProjwallLatest(): ProjwallLatest {
  const [latest, setLatest] = useState<ProjwallLatest>(EMPTY);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 每分钟拉一次采集器快照（外部 HTTP 资源），跟采集器同节奏，卸载即停
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const load = async () => {
      try {
        const response = await primaryRawFetch(endpoint(), {
          headers: { accept: "application/json" },
        });
        if (!response.ok) return;
        const parsed = parse(await response.json());
        if (!cancelled) setLatest(parsed);
      } catch {
        // 采集器没跑、或服务端没这个路由时保持上一次结果，不打断看板。
      }
    };

    void load();
    timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  return latest;
}
