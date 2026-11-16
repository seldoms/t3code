import { useNavigate } from "@tanstack/react-router";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { useSidebarHostFilter } from "../../sidebarHostFilter";
import { useStartProjectThread } from "../../hooks/useStartProjectThread";
import { useProjects } from "../../state/entities";
import { useEnvironmentsWithScope } from "../../state/session";
import { resolveSnapshotEnvironment } from "../board/projectThreadTarget";
import { ActivityIcon, BoxesIcon, FolderIcon } from "lucide-react";

import { useClientSettings } from "../../hooks/useSettings";
import { useProjwallLatest } from "../board/useProjwallLatest";
import { useEnvironments } from "../../state/environments";
import { useMachineMonitor } from "../../hooks/useMachineMonitor";
import { MachineMonitor } from "../board/MachineMonitor";
import { useEnvironmentColors } from "../../environmentColors";
import { EnvironmentColorDot } from "../EnvironmentColorDot";
import { useSidebar } from "../ui/sidebar";

/** Monitoring is separate from the project/thread tree, not another project hierarchy. */
export function SidebarBoardSections() {
  const { machines } = useMachineMonitor();
  const projwall = useProjwallLatest();
  const prefs = useClientSettings();
  const { environments } = useEnvironments();
  const colors = useEnvironmentColors();
  const projects = useProjects();
  const operable = useEnvironmentsWithScope(environments, AuthOrchestrationOperateScope);
  const hostFilter = useSidebarHostFilter((state) => state.selected);
  const selectHost = useSidebarHostFilter((state) => state.select);
  const selectedEnvironmentId = hostFilter?.environmentId ?? null;
  const starter = useStartProjectThread();
  const selectedEnvironment = environments.find(
    (entry) => entry.environmentId === selectedEnvironmentId,
  );
  const candidates = new Map<string, { path: string; title: string; scanned: boolean }>();
  if (selectedEnvironment) {
    for (const project of projects) {
      if (project.environmentId === selectedEnvironmentId && project.archivedAt === null) {
        candidates.set(project.workspaceRoot.replace(/\/+$/, ""), {
          path: project.workspaceRoot,
          title: project.title,
          scanned: false,
        });
      }
    }
    for (const snapshot of projwall.remotes) {
      if (resolveSnapshotEnvironment(environments, snapshot) !== selectedEnvironmentId) continue;
      for (const project of snapshot.projects) {
        const key = project.path.replace(/\/+$/, "");
        if (project.path.startsWith("/") && !candidates.has(key))
          candidates.set(key, { path: project.path, title: project.name, scanned: true });
      }
    }
  }
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const openBoard = (search: { machine?: string; dir?: string; env?: string } = {}) => {
    if (isMobile) setOpenMobile(false);
    void navigate({ to: "/board", search });
  };
  const directories = new Map<string, number>();
  if (prefs.boardSidebarDirs) {
    for (const project of projwall.projects) {
      const dir = project.path.slice(0, project.path.lastIndexOf("/"));
      if (dir) directories.set(dir, (directories.get(dir) ?? 0) + 1);
    }
  }
  return (
    <section className="select-none rounded-lg border border-sidebar-border p-2" aria-label="监控">
      <div className="mb-1 flex items-center gap-2 text-xs font-medium">
        <ActivityIcon className="size-3.5" />
        监控
        <button
          type="button"
          onClick={() => openBoard()}
          className="ml-auto text-2xs text-sidebar-muted-foreground hover:text-sidebar-foreground"
        >
          项目板
        </button>
        <button
          type="button"
          onClick={() => void navigate({ to: "/containers" })}
          aria-label="容器管理"
          className="text-sidebar-muted-foreground hover:text-sidebar-foreground"
        >
          <BoxesIcon className="size-3.5" />
        </button>
      </div>
      <MachineMonitor
        machines={machines}
        colorFor={(machine) =>
          machine.local
            ? "green"
            : machine.environmentId
              ? (colors.get(machine.environmentId) ?? "gray")
              : "gray"
        }
        selectedHostKey={hostFilter?.key ?? null}
        onProjects={(machine) =>
          selectHost({ key: machine.key, environmentId: machine.environmentId, name: machine.name })
        }
      />
      <button
        type="button"
        aria-pressed={hostFilter === null}
        onClick={() => selectHost(null)}
        className="mt-1 w-full rounded px-1 py-1 text-left text-2xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover"
      >
        {hostFilter
          ? `当前仅看：${hostFilter.name} · 点击显示全部主机`
          : "全部主机 · 选择一台仅看它的项目"}
      </button>
      {hostFilter !== null && selectedEnvironment === undefined ? (
        <p className="mt-1 text-2xs text-warning">此主机尚未连接 T3 环境；没有可列出的会话项目。</p>
      ) : null}
      {selectedEnvironment ? (
        <div className="mt-2 border-t border-sidebar-border pt-2" aria-label="选择目标环境项目">
          <div className="mb-1 flex items-center text-2xs text-sidebar-muted-foreground">
            已筛选此主机；下面为尚未接管的目录
            <button
              type="button"
              onClick={() => openBoard({ env: selectedEnvironment.environmentId })}
              className="ml-auto"
            >
              项目板
            </button>
          </div>
          {selectedEnvironment.connection.phase !== "connected" ? (
            <p className="text-2xs text-warning">环境未连接，请先在设置 → 环境中连接。</p>
          ) : !operable.has(selectedEnvironment.environmentId) ? (
            <p className="text-2xs text-warning">当前连接没有发起对话的权限。</p>
          ) : null}
          <div className="max-h-64 overflow-y-auto">
            {[...candidates.values()]
              .filter((project) => project.scanned)
              .map((project) => (
                <div key={project.path} className="flex items-center gap-1 py-1">
                  <EnvironmentColorDot
                    color={colors.get(selectedEnvironment.environmentId) ?? "gray"}
                  />
                  <span className="min-w-0 flex-1 truncate text-2xs">{project.title}</span>
                  {project.scanned ? (
                    <span className="text-3xs text-sidebar-muted-foreground">未接管</span>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`在 ${project.title} 发起远程对话`}
                    disabled={
                      starter.busy ||
                      selectedEnvironment.connection.phase !== "connected" ||
                      !operable.has(selectedEnvironment.environmentId)
                    }
                    onClick={() => {
                      void starter
                        .start(selectedEnvironment.environmentId, project.path)
                        .then((opened) => {
                          if (opened && isMobile) setOpenMobile(false);
                        });
                    }}
                    className="grid size-6 shrink-0 place-items-center rounded hover:bg-sidebar-row-hover disabled:opacity-40"
                  >
                    ＋
                  </button>
                </div>
              ))}
            {[...candidates.values()].every((project) => !project.scanned) ? (
              <p className="py-1 text-2xs text-sidebar-muted-foreground">
                已接管项目与对话显示在下方项目树。
              </p>
            ) : null}
          </div>
          {starter.error ? (
            <p role="alert" className="mt-1 text-2xs text-warning">
              {starter.error}
            </p>
          ) : null}
        </div>
      ) : null}
      {directories.size > 0 ? (
        <details className="mt-2 text-2xs text-sidebar-muted-foreground">
          <summary className="cursor-pointer">目录快捷筛选</summary>
          {[...directories]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([dir, count]) => (
              <button
                key={dir}
                type="button"
                onClick={() => openBoard({ dir })}
                className="mt-1 flex w-full items-center gap-1 text-left"
              >
                <FolderIcon className="size-3 shrink-0" />
                <span className="truncate">{dir.split("/").slice(-2).join("/")}</span>
                <span className="ml-auto">{count}</span>
              </button>
            ))}
        </details>
      ) : null}
    </section>
  );
}
