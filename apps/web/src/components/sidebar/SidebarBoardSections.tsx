import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronRightIcon, FolderIcon, PlusIcon } from "lucide-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";

import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { newProjectId } from "../../lib/utils";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { toastManager } from "../ui/toast";
import { copyText, showAppContextMenu } from "../board/appContextMenu";
import { useClientSettings } from "../../hooks/useSettings";
import { useProjwallLatest } from "../board/useProjwallLatest";
import { useHostMetrics, type RemoteHostSnapshot } from "../board/useHostMetrics";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "../ui/sidebar";

const sectionLabel = "px-2 pb-1 pt-3 text-2xs font-medium text-sidebar-muted-foreground";
const loadLine = "px-2 pb-1 text-3xs tabular-nums text-sidebar-muted-foreground";
const shortHost = (host: string) => host.replace(/\.(local|lan)$/i, "");
const displayPath = (path: string) => path.replace(/^\/(Users|home)\/[^/]+/, "~");

/**
 * 项目板配套侧边栏：扫描出来的核心业务目录 + 全部机器（本机 / T3 远程环境 / SSH 主机）。
 * 远程环境点开展开它的项目，项目行「+」直接发起对话，点名称进看板抽屉恢复对话；
 * 纯 SSH 主机点开展开负载明细。展示形式在 设置 → 项目板 里调。
 */
export function SidebarBoardSections() {
  const projects = useProjects();
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projwall = useProjwallLatest();
  const hostMetrics = useHostMetrics();
  const prefs = useClientSettings();
  const navigate = useNavigate();
  const handleNewThread = useNewThreadHandler();
  const { isMobile, setOpenMobile } = useSidebar();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [startingIn, setStartingIn] = useState<string | null>(null);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  const toggle = (id: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const threadCountByProject = new Map<string, number>();
  for (const thread of threads) {
    const key = `${thread.environmentId}:${thread.projectId}`;
    threadCountByProject.set(key, (threadCountByProject.get(key) ?? 0) + 1);
  }

  // 业务目录：项目聚在哪些父目录，就展示哪些（≥2 个项目才算核心）。
  const dirCounts = new Map<string, number>();
  const countDir = (path: string) => {
    const index = path.lastIndexOf("/");
    if (index <= 0) return;
    const dir = path.slice(0, index);
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  };
  for (const project of projects) {
    if (project.archivedAt === null) countDir(project.workspaceRoot.replace(/\/+$/, ""));
  }
  for (const project of projwall.projects) {
    if (project.path.startsWith("/")) countDir(project.path.replace(/\/+$/, ""));
  }
  const dirs = [...dirCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  // 快照按主机名索引：侧边栏展开时把「T3 登记的」和「扫描到的目录」并排展示。
  const snapshotForHost = (label: string) =>
    projwall.remotes.find(
      (remote) => shortHost(remote.label).toLowerCase() === shortHost(label).toLowerCase(),
    );
  const normalizePath = (path: string) => path.replace(/\/+$/, "");

  /**
   * 在某个远程目录发起对话：先在该环境登记项目（已存在就复用），再开新对话。
   * agent 会跑在那台机器上，本机只做控制端——断网不影响远端业务。
   */
  const startThreadInPath = async (
    environmentId: Parameters<typeof scopeProjectRef>[0],
    path: string,
    label: string,
  ) => {
    setStartingIn(path);
    try {
      const normalized = normalizePath(path);
      const existing = projects.find(
        (project) =>
          project.environmentId === environmentId &&
          normalizePath(project.workspaceRoot) === normalized,
      );
      let projectId = existing?.id ?? null;
      if (projectId === null) {
        const id = newProjectId();
        const result = await createProject({
          environmentId,
          input: {
            projectId: id,
            title: inferProjectTitleFromPath(path),
            workspaceRoot: path,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: null,
          },
        });
        if (result._tag === "Failure") {
          toastManager.add({
            type: "error",
            title: "登记项目失败",
            description: `${label} 可能路径不存在，或环境当前离线。`,
          });
          return;
        }
        projectId = id;
      }
      closeMobile();
      void handleNewThread(scopeProjectRef(environmentId, projectId));
    } finally {
      setStartingIn(null);
    }
  };

  const remoteEnvironments = environments.filter(
    (env) => primaryEnvironmentId === null || env.environmentId !== primaryEnvironmentId,
  );
  const localProjectCount =
    projects.filter(
      (project) =>
        project.archivedAt === null &&
        (primaryEnvironmentId === null || project.environmentId === primaryEnvironmentId),
    ).length + projwall.projects.filter((project) => project.path.startsWith("/")).length;

  // SSH 主机里没被 T3 环境覆盖的，也列出来：状态可见是底线，项目等接管后再说。
  const envHostKeys = new Set(remoteEnvironments.map((env) => shortHost(env.label).toLowerCase()));
  const extraHosts: ReadonlyArray<RemoteHostSnapshot> = (hostMetrics?.remotes ?? []).filter(
    (remote) => !envHostKeys.has(shortHost(remote.host).toLowerCase()),
  );

  const openBoard = (search: { dir?: string; env?: string; card?: string }) => {
    closeMobile();
    void navigate({ to: "/board", search });
  };

  const remoteLoadText = (remote: RemoteHostSnapshot) =>
    remote.online
      ? `内存 ${remote.memPercent ?? "?"}% · 磁盘 ${remote.diskPercent ?? "?"}%`
      : "离线";

  return (
    <>
      {prefs.boardSidebarDirs && dirs.length > 0 ? (
        <>
          <div className={sectionLabel}>业务目录</div>
          <SidebarMenu>
            {dirs.map(([dir, count]) => (
              <SidebarMenuItem key={dir}>
                <SidebarMenuButton
                  size="sm"
                  onClick={() => openBoard({ dir })}
                  onContextMenu={(event) => {
                    void showAppContextMenu(event, [
                      { id: "filter", label: "按此目录过滤看板" },
                      { id: "copy", label: "复制路径" },
                      { id: "all", label: "打开全部项目", separatorBefore: true },
                    ]).then((choice) => {
                      if (choice === "filter") openBoard({ dir });
                      else if (choice === "copy") void copyText(dir);
                      else if (choice === "all") openBoard({});
                    });
                  }}
                  aria-label={`按目录 ${dir} 过滤项目板`}
                >
                  <FolderIcon />
                  <span className="truncate">
                    {displayPath(dir).split("/").slice(-2).join("/")}
                  </span>
                  <span className="ml-auto text-2xs tabular-nums text-sidebar-muted-foreground">
                    {count}
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </>
      ) : null}

      <div className={sectionLabel}>机器</div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            size="sm"
            onClick={() => openBoard({})}
            onContextMenu={(event) => {
              void showAppContextMenu(event, [
                { id: "board", label: "打开项目板" },
                { id: "copy", label: "复制本机名" },
              ]).then((choice) => {
                if (choice === "board") openBoard({});
                else if (choice === "copy") void copyText(shortHost(hostMetrics?.host ?? "本机"));
              });
            }}
            aria-label="打开项目板"
          >
            <span className="size-1.5 flex-none rounded-full bg-success" />
            <span className="truncate">本机</span>
            <span className="ml-auto text-2xs tabular-nums text-sidebar-muted-foreground">
              {localProjectCount}
            </span>
          </SidebarMenuButton>
          {prefs.boardSidebarMachineLoad && hostMetrics ? (
            <div className={loadLine}>
              CPU {hostMetrics.cpu ?? "…"}% · 内存 {hostMetrics.memPercent}% · 磁盘{" "}
              {hostMetrics.diskPercent}%
            </div>
          ) : null}
        </SidebarMenuItem>

        {remoteEnvironments.map((env) => {
          const envId = String(env.environmentId);
          const online = env.connection.phase === "connected";
          const envProjects = projects.filter(
            (project) => project.environmentId === env.environmentId && project.archivedAt === null,
          );
          const snapshot = snapshotForHost(env.label);
          const snapshotProjects = snapshot?.projects ?? [];
          // 侧边栏只列最近维护的 10 个，其余看板上看。
          const recentSnapshotProjects = [...snapshotProjects]
            .sort((a, b) => {
              const at = a.last_commit_at ? Date.parse(a.last_commit_at) : 0;
              const bt = b.last_commit_at ? Date.parse(b.last_commit_at) : 0;
              return bt - at;
            })
            .slice(0, 10);
          const totalCount = envProjects.length + snapshotProjects.length;
          const isOpen = expanded.has(envId);
          const matchedRemote = (hostMetrics?.remotes ?? []).find(
            (remote) => shortHost(remote.host).toLowerCase() === shortHost(env.label).toLowerCase(),
          );
          return (
            <SidebarMenuItem key={envId}>
              <SidebarMenuButton
                size="sm"
                onClick={() => toggle(envId)}
                aria-label={`展开 ${env.label} 的项目`}
              >
                {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                <span
                  className={`size-1.5 flex-none rounded-full ${online ? "bg-info" : "bg-sidebar-muted-foreground/40"}`}
                />
                <span className="truncate">{env.label}</span>
                <span className="ml-auto text-2xs tabular-nums text-sidebar-muted-foreground">
                  {totalCount}
                </span>
              </SidebarMenuButton>
              {prefs.boardSidebarMachineLoad && matchedRemote ? (
                <div className={loadLine}>{remoteLoadText(matchedRemote)}</div>
              ) : null}
              {isOpen ? (
                <SidebarMenuSub>
                  {envProjects.length === 0 && snapshotProjects.length === 0 ? (
                    <li className="px-2 py-1 text-2xs text-sidebar-muted-foreground">
                      {online ? "还没有项目" : "环境离线，连上后显示项目"}
                    </li>
                  ) : (
                    envProjects.map((project) => {
                      const projectId = String(project.id);
                      const count = threadCountByProject.get(`${envId}:${projectId}`) ?? 0;
                      return (
                        <SidebarMenuSubItem key={projectId}>
                          <SidebarMenuSubButton
                            size="sm"
                            onClick={() =>
                              openBoard({ env: envId, card: `t3:${envId}:${projectId}` })
                            }
                          >
                            <span className="truncate">{project.title}</span>
                            <span className="ml-auto text-2xs tabular-nums text-sidebar-muted-foreground">
                              {count}
                            </span>
                            <button
                              type="button"
                              aria-label={`在 ${project.title} 发起对话`}
                              onClick={(event) => {
                                event.stopPropagation();
                                closeMobile();
                                void handleNewThread(
                                  scopeProjectRef(env.environmentId, project.id),
                                );
                              }}
                              className="grid size-4 flex-none place-items-center rounded text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
                            >
                              <PlusIcon className="size-3" />
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })
                  )}
                  {snapshot !== undefined && snapshotProjects.length > 0 ? (
                    <>
                      <li className="px-2 pt-1 text-3xs text-sidebar-muted-foreground">
                        最近维护（{recentSnapshotProjects.length}/{snapshotProjects.length}）
                      </li>
                      {recentSnapshotProjects.map((project) => (
                        <SidebarMenuSubItem key={project.path}>
                          <SidebarMenuSubButton
                            size="sm"
                            onClick={() =>
                              openBoard({
                                card: `pwr:${snapshot.machine}:${normalizePath(project.path)}`,
                              })
                            }
                          >
                            <span className="truncate">{project.name}</span>
                            {project.dirty === true ? (
                              <span className="ml-auto text-3xs text-warning">有改动</span>
                            ) : null}
                            <button
                              type="button"
                              aria-label={`在 ${project.name} 发起对话`}
                              disabled={startingIn === project.path}
                              onClick={(event) => {
                                event.stopPropagation();
                                void startThreadInPath(
                                  env.environmentId,
                                  normalizePath(project.path),
                                  project.name,
                                );
                              }}
                              className="grid size-4 flex-none place-items-center rounded text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground disabled:opacity-50"
                            >
                              <PlusIcon className="size-3" />
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                      {snapshotProjects.length > recentSnapshotProjects.length ? (
                        <li className="px-2 py-1 text-3xs text-sidebar-muted-foreground">
                          ……还有 {snapshotProjects.length - recentSnapshotProjects.length}{" "}
                          个，看板上查看全部
                        </li>
                      ) : null}
                    </>
                  ) : null}
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
          );
        })}

        {extraHosts.map((remote) => {
          const isOpen = expanded.has(remote.host);
          return (
            <SidebarMenuItem key={remote.host}>
              <SidebarMenuButton
                size="sm"
                onClick={() => toggle(remote.host)}
                aria-label={`展开 ${remote.host} 的负载明细`}
              >
                {isOpen ? <ChevronDownIcon /> : <ChevronRightIcon />}
                <span
                  className={`size-1.5 flex-none rounded-full ${remote.online ? "bg-info" : "bg-sidebar-muted-foreground/40"}`}
                />
                <span className="truncate">{shortHost(remote.host)}</span>
              </SidebarMenuButton>
              {prefs.boardSidebarMachineLoad ? (
                <div className={loadLine}>{remoteLoadText(remote)}</div>
              ) : null}
              {isOpen ? (
                <SidebarMenuSub>
                  <li className="px-2 py-1 text-2xs leading-relaxed text-sidebar-muted-foreground">
                    {remote.online ? (
                      <>
                        {remote.cores ?? "?"} 核 · 内存 {remote.memPercent ?? "?"}% · 磁盘{" "}
                        {remote.diskPercent ?? "?"}%
                        {remote.load ? (
                          <>
                            <br />
                            负载 {remote.load.map((value) => value.toFixed(1)).join(" / ")}
                          </>
                        ) : null}
                        <br />
                        还没接管成 T3 环境，暂无项目。
                      </>
                    ) : (
                      "离线，连上后显示负载。"
                    )}
                  </li>
                </SidebarMenuSub>
              ) : null}
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </>
  );
}
