import { useEffect, useRef, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { boardRelativeTime } from "../board/boardStages";
import {
  fetchContainerLogs,
  runContainerAction,
  useContainers,
  type ContainerAction,
  type ContainerEntry,
} from "../board/useContainers";

const ACTION_LABEL: Record<ContainerAction, string> = {
  start: "启动",
  stop: "停止",
  restart: "重启",
};

/**
 * 容器管理独立页：按 compose 栈分组，写操作必须二次确认（设计稿的确认弹窗），
 * 日志只读。配置与密钥规则见服务端 PortainerContainers.ts。
 */
export function ContainersPage() {
  const { snapshot, refresh } = useContainers();
  const now = Date.parse(useNowMinute());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "running" | "stopped">("all");
  const [confirm, setConfirm] = useState<{
    container: ContainerEntry;
    action: ContainerAction;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [logsTarget, setLogsTarget] = useState<ContainerEntry | null>(null);

  const containers = snapshot?.containers ?? [];
  const q = query.trim().toLowerCase();
  const visible = containers.filter((container) => {
    if (filter === "running" && container.state !== "running") return false;
    if (filter === "stopped" && container.state === "running") return false;
    if (!q) return true;
    return (
      container.name.toLowerCase().includes(q) ||
      container.image.toLowerCase().includes(q) ||
      (container.stack ?? "").toLowerCase().includes(q)
    );
  });

  const byStack = new Map<string, ContainerEntry[]>();
  for (const container of visible) {
    const key = container.stack ?? "未归栈";
    const list = byStack.get(key);
    if (list) list.push(container);
    else byStack.set(key, [container]);
  }
  const stacks = [...byStack.entries()].sort((a, b) => {
    if (a[0] === "未归栈") return 1;
    if (b[0] === "未归栈") return -1;
    return b[1].length - a[1].length;
  });

  const running = containers.filter((container) => container.state === "running").length;

  const execute = async (container: ContainerEntry, action: ContainerAction) => {
    setBusy(container.id);
    setActionError(null);
    const result = await runContainerAction(container.id, action);
    setBusy(null);
    setConfirm(null);
    if (!result.ok) {
      setActionError(
        `${container.name} ${ACTION_LABEL[action]}失败：${result.error ?? "未知错误"}`,
      );
    }
    refresh();
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex flex-none flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight">容器</h1>
          {snapshot?.configured ? (
            <span className="text-2xs text-muted-foreground">
              {containers.length} 个 · 运行 {running} · 停止 {containers.length - running}
            </span>
          ) : null}
          {snapshot?.url ? (
            <span className="text-3xs text-muted-foreground/70">{snapshot.url}</span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["all", "running", "stopped"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={
                  filter === mode
                    ? "bg-accent px-2 py-1 text-2xs font-medium text-accent-foreground"
                    : "px-2 py-1 text-2xs text-muted-foreground hover:bg-muted/60"
                }
              >
                {mode === "all" ? "全部" : mode === "running" ? "运行中" : "已停止"}
              </button>
            ))}
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索名称 / 镜像 / 栈"
            className="h-7 w-52 rounded-md border border-border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted/60"
          >
            刷新
          </button>
        </div>
      </header>

      {actionError !== null ? (
        <div className="flex-none border-b border-border px-4 py-1.5 text-2xs text-warning">
          {actionError}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {snapshot === null ? (
          <p className="text-2xs text-muted-foreground">读取容器列表…</p>
        ) : !snapshot.configured ? (
          <div className="max-w-lg text-2xs leading-relaxed text-muted-foreground">
            <p className="text-xs font-medium text-foreground">还没配置 Portainer</p>
            <p className="mt-1">
              在 ~/.t3/integrations.json 里写 portainer 的 url 和 endpointId，
              密钥只写「去哪里取」（apiKeyEnv 或 apiKeyKeychain），不写进文件。
            </p>
          </div>
        ) : snapshot.error ? (
          <p className="text-2xs text-warning">容器读取失败：{snapshot.error}</p>
        ) : stacks.length === 0 ? (
          <p className="text-2xs text-muted-foreground">没有匹配的容器。</p>
        ) : (
          <div className="flex flex-col gap-4">
            {stacks.map(([stack, entries]) => {
              const stackRunning = entries.filter((entry) => entry.state === "running").length;
              return (
                <section key={stack}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="text-xs font-semibold">{stack}</span>
                    <span className="rounded bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
                      {stackRunning}/{entries.length}
                    </span>
                  </div>
                  <div className="overflow-hidden rounded-lg border border-border">
                    {entries.map((container, index) => {
                      const isRunning = container.state === "running";
                      const isBusy = busy === container.id;
                      return (
                        <div
                          key={container.id || container.name}
                          className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${index > 0 ? "border-t border-border/60" : ""} ${isBusy ? "opacity-60" : ""}`}
                        >
                          <span
                            className={`size-1.5 flex-none rounded-full ${isRunning ? "bg-success" : container.state === "dead" ? "bg-error" : "bg-muted-foreground/40"}`}
                          />
                          <span className="w-44 truncate text-xs font-medium">
                            {container.name}
                          </span>
                          <span className="w-56 truncate font-mono text-3xs text-muted-foreground">
                            {container.image}
                          </span>
                          <span className="w-32 truncate text-2xs text-muted-foreground">
                            {container.status}
                          </span>
                          <span className="w-28 truncate font-mono text-3xs text-muted-foreground">
                            {container.ports}
                          </span>
                          <span className="text-2xs tabular-nums text-muted-foreground/70">
                            {boardRelativeTime(container.created * 1000, now)}创建
                          </span>
                          <span className="ml-auto flex items-center gap-1">
                            {isRunning ? (
                              <>
                                <RowButton
                                  disabled={isBusy}
                                  onClick={() => setConfirm({ container, action: "restart" })}
                                >
                                  重启
                                </RowButton>
                                <RowButton
                                  disabled={isBusy}
                                  danger
                                  onClick={() => setConfirm({ container, action: "stop" })}
                                >
                                  停止
                                </RowButton>
                              </>
                            ) : (
                              <RowButton
                                disabled={isBusy}
                                onClick={() => setConfirm({ container, action: "start" })}
                              >
                                启动
                              </RowButton>
                            )}
                            <RowButton disabled={isBusy} onClick={() => setLogsTarget(container)}>
                              日志
                            </RowButton>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {confirm !== null ? (
        <ConfirmDialog
          container={confirm.container}
          action={confirm.action}
          busy={busy === confirm.container.id}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void execute(confirm.container, confirm.action)}
        />
      ) : null}

      {logsTarget !== null ? (
        <LogsDrawer
          key={logsTarget.id}
          container={logsTarget}
          onClose={() => setLogsTarget(null)}
        />
      ) : null}
    </div>
  );
}

function RowButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        danger
          ? "rounded border border-error/40 px-1.5 py-0.5 text-2xs text-error hover:bg-error-surface disabled:opacity-50"
          : "rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
      }
    >
      {children}
    </button>
  );
}

/** 写操作二次确认：设计稿要求停止/重启这类动作必须先问一句。 */
function ConfirmDialog({
  container,
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  container: ContainerEntry;
  action: ContainerAction;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-background/60 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        className="w-[400px] rounded-xl border border-border bg-popover p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">
          {ACTION_LABEL[action]}「{container.name}」？
        </h2>
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
          {action === "stop"
            ? "停止后依赖它的服务会中断，确认这个容器现在可以停。"
            : action === "restart"
              ? "重启期间容器会短暂不可用。"
              : "启动后会按镜像默认命令运行。"}
        </p>
        <p className="mt-1 font-mono text-3xs text-muted-foreground/70">{container.image}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted/60"
          >
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={
              action === "stop"
                ? "rounded-md bg-error px-2 py-1 text-2xs font-medium text-error-foreground hover:brightness-110 disabled:opacity-50"
                : "rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
            }
          >
            {busy ? "执行中…" : `确认${ACTION_LABEL[action]}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsDrawer({ container, onClose }: { container: ContainerEntry; onClose: () => void }) {
  const [logs, setLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef<() => void>(() => {});
  const preRef = useRef<HTMLPreElement | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 挂载时拉取外部容器日志（HTTP 只读）同步进 React；手动刷新走 loadRef
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchContainerLogs(container.id, 200).then((result) => {
        if (cancelled) return;
        setLoading(false);
        if (result.ok) {
          setLogs(result.logs ?? "");
          requestAnimationFrame(() => {
            if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight;
          });
        } else {
          setError(result.error ?? "未知错误");
        }
      });
    };
    loadRef.current = load;
    load();
    return () => {
      cancelled = true;
    };
  }, [container.id]);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[520px] flex-col border-l border-border bg-background shadow-2xl">
      <div className="flex flex-none items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="truncate text-2xs font-medium">{container.name} 日志</span>
        <span className="text-3xs text-muted-foreground">最近 200 行</span>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            setError(null);
            loadRef.current();
          }}
          className="ml-auto rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60"
        >
          刷新
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭日志"
          className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {loading ? (
          <p className="text-2xs text-muted-foreground">读取日志…</p>
        ) : error !== null ? (
          <p className="text-2xs text-warning">日志读取失败：{error}</p>
        ) : (
          <pre
            ref={preRef}
            className="h-full overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/40 p-2 font-mono text-3xs leading-relaxed text-foreground/80"
          >
            {logs === "" ? "（没有日志输出）" : logs}
          </pre>
        )}
      </div>
    </aside>
  );
}
