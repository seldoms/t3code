import { useEffect, useRef, useState } from "react";

import { resolvePrimaryEnvironmentHttpUrl } from "../../environments/primary/target";
import { primaryRawFetch } from "../../environments/primary/rawFetch";

/** 快照字段多且随采集器变，只取看板需要的几个，避免被上游字段拖着走。 */
export interface ProjwallProject {
  readonly name: string;
  readonly path: string;
  readonly kind?: string;
  readonly purpose?: string | null;
  readonly branch?: string | null;
  readonly last_commit_at?: string | null;
  readonly last_commit_subject?: string | null;
  readonly dirty?: boolean;
  /** 最近 7 天在这个目录里跑过的 agent CLI（codex/claude/pi…）。 */
  readonly clis_7d?: ReadonlyArray<string>;
  readonly ahead?: number;
  readonly behind?: number;
}

/** 远端机器拉回来的快照（~/.projwall/remotes/<machine>.json）。 */
export interface RemoteProjwall {
  readonly machine: string;
  readonly label: string;
  readonly scannedAt: string | null;
  readonly mtime: number | null;
  readonly projects: ReadonlyArray<ProjwallProject>;
}

export interface ProjwallLatest {
  readonly available: boolean;
  readonly mtime: number | null;
  readonly projects: ReadonlyArray<ProjwallProject>;
  readonly scannedAt: string | null;
  readonly remotes: ReadonlyArray<RemoteProjwall>;
}

const EMPTY: ProjwallLatest = {
  available: false,
  mtime: null,
  projects: [],
  scannedAt: null,
  remotes: [],
};

const REFRESH_MS = 60_000;

function endpoint(): string {
  try {
    return resolvePrimaryEnvironmentHttpUrl("/api/projwall/latest");
  } catch {
    // 桌面端没有 primary environment 时退回同源相对路径。
    return "/api/projwall/latest";
  }
}

function parseProjects(snapshot: unknown): ProjwallProject[] {
  if (typeof snapshot !== "object" || snapshot === null) return [];
  const rawProjects = Array.isArray((snapshot as { projects?: unknown }).projects)
    ? (snapshot as { projects: unknown[] }).projects
    : [];
  const projects: ProjwallProject[] = [];
  for (const entry of rawProjects) {
    if (typeof entry !== "object" || entry === null) continue;
    const project = entry as Record<string, unknown>;
    // 禁区条目只是「知道它在」，不是项目，看板不展示。
    if (project.kind === "forbidden") continue;
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
      ...(Array.isArray(project.clis_7d)
        ? { clis_7d: project.clis_7d.filter((tool): tool is string => typeof tool === "string") }
        : {}),
      ...(typeof project.ahead === "number" ? { ahead: project.ahead } : {}),
      ...(typeof project.behind === "number" ? { behind: project.behind } : {}),
    });
  }
  return projects;
}

function parse(body: unknown): ProjwallLatest {
  if (typeof body !== "object" || body === null) return EMPTY;
  const envelope = body as {
    available?: unknown;
    mtime?: unknown;
    snapshot?: unknown;
    remotes?: unknown;
  };
  if (envelope.available !== true) return EMPTY;
  const snapshot = envelope.snapshot as { scanned_at?: unknown } | null;
  const remotes: RemoteProjwall[] = [];
  for (const entry of Array.isArray(envelope.remotes) ? envelope.remotes : []) {
    if (typeof entry !== "object" || entry === null) continue;
    const remote = entry as { machine?: unknown; mtime?: unknown; snapshot?: unknown };
    if (typeof remote.machine !== "string") continue;
    const remoteSnapshot = remote.snapshot as { host?: unknown; scanned_at?: unknown } | null;
    remotes.push({
      machine: remote.machine,
      label:
        typeof remoteSnapshot?.host === "string" && remoteSnapshot.host.length > 0
          ? remoteSnapshot.host
          : remote.machine,
      scannedAt: typeof remoteSnapshot?.scanned_at === "string" ? remoteSnapshot.scanned_at : null,
      mtime: typeof remote.mtime === "number" ? remote.mtime : null,
      projects: parseProjects(remoteSnapshot),
    });
  }
  return {
    available: true,
    mtime: typeof envelope.mtime === "number" ? envelope.mtime : null,
    projects: parseProjects(snapshot),
    scannedAt: typeof snapshot?.scanned_at === "string" ? snapshot.scanned_at : null,
    remotes,
  };
}

export function useProjwallLatest(): ProjwallLatest & { refresh: () => void } {
  const [latest, setLatest] = useState<ProjwallLatest>(EMPTY);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 每分钟拉一次采集器快照（外部 HTTP 资源），跟采集器同节奏，卸载即停
  useEffect(() => {
    let cancelled = false;
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
    loadRef.current = load;
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return { ...latest, refresh: () => void loadRef.current() };
}
/** 让本机立刻拉一次远端快照（看板上的「立即采集」）。 */
export async function pullRemoteSnapshots(): Promise<{
  ok: boolean;
  error?: string;
  output?: string;
}> {
  try {
    const url = (() => {
      try {
        return resolvePrimaryEnvironmentHttpUrl("/api/projwall/pull-remotes");
      } catch {
        return "/api/projwall/pull-remotes";
      }
    })();
    const response = await primaryRawFetch(url, { method: "POST" });
    return (await response.json()) as { ok: boolean; error?: string; output?: string };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "pull-failed" };
  }
}
