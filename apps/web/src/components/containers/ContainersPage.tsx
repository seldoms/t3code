import { useEffect, useRef, useState } from "react";

import { useNowMinute } from "../../hooks/useNowMinute";
import { formatBytes } from "../../lib/formatBytes";
import { boardRelativeTime } from "../board/boardStages";
import {
  fetchContainerLogs,
  fetchImages,
  removeImage,
  runContainerAction,
  useContainers,
  type ContainerAction,
  type ContainerEntry,
  type HostContainers,
  type ImageEntry,
} from "../board/useContainers";

const ACTION_LABEL: Record<ContainerAction, string> = {
  start: "启动",
  stop: "停止",
  restart: "重启",
  remove: "删除",
};

/**
 * 容器管理独立页：以主机（Portainer endpoint）为单位分组，点开主机看容器和镜像。
 * 容器支持启动/停止/重启/删除（删除仅限已停止的，服务端二次校验），
 * 镜像可删（被引用时 Docker 拒绝）。写操作必须二次确认，日志只读。
 */
export function ContainersPage() {
  const { snapshot, refresh } = useContainers();
  const now = Date.parse(useNowMinute());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "running" | "stopped">("all");
  const [openHosts, setOpenHosts] = useState<ReadonlySet<number>>(new Set());
  const [expandedHost, setExpandedHost] = useState<{
    id: number;
    tab: "containers" | "images";
  } | null>(null);
  const [confirm, setConfirm] = useState<{
    host: HostContainers;
    container?: ContainerEntry;
    image?: ImageEntry;
    action: ContainerAction | "remove-image";
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [imageRevision, setImageRevision] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [logsTarget, setLogsTarget] = useState<{
    host: HostContainers;
    container: ContainerEntry;
  } | null>(null);

  const q = query.trim().toLowerCase();
  const matchContainer = (container: ContainerEntry) => {
    if (filter === "running" && container.state !== "running") return false;
    if (filter === "stopped" && container.state === "running") return false;
    if (!q) return true;
    return (
      container.name.toLowerCase().includes(q) ||
      container.image.toLowerCase().includes(q) ||
      (container.stack ?? "").toLowerCase().includes(q)
    );
  };

  const hosts = (snapshot?.hosts ?? []).map((host) => ({
    ...host,
    containers: host.containers.filter(matchContainer),
  }));
  const allContainers = hosts.flatMap((host) => host.containers);
  const running = allContainers.filter((container) => container.state === "running").length;

  const toggleHost = (id: number) =>
    setOpenHosts((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const execute = async () => {
    if (confirm === null) return;
    const { host, container, image, action } = confirm;
    const key = container?.id ?? image?.id ?? "";
    setBusy(key);
    setActionError(null);
    const result =
      container && action !== "remove-image"
        ? await runContainerAction(host.endpointId, container.id, action)
        : image
          ? await removeImage(host.endpointId, image.id)
          : { ok: false, error: "bad-request" };
    setBusy(null);
    setConfirm(null);
    if (!result.ok) {
      const name = container?.name ?? image?.tags[0] ?? image?.id ?? key;
      const label =
        action === "remove-image" ? "删除镜像" : ACTION_LABEL[action as ContainerAction];
      setActionError(`${name} ${label}失败：${result.error ?? "未知错误"}`);
    }
    refresh();
    if (result.ok) setImageRevision((revision) => revision + 1);
  };

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <header className="drag-region flex flex-none flex-wrap select-none items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight">容器</h1>
          {snapshot?.configured ? (
            <span className="text-2xs text-muted-foreground">
              {hosts.length} 台主机 · {allContainers.length} 个容器 · 运行 {running}
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
              在 ~/.t3/integrations.json 里写 portainer 的 url（endpointId 可省略，省略时自动列出
              Portainer 上的全部主机），密钥只写「去哪里取」（apiKeyEnv 或
              apiKeyKeychain），不写进文件。
            </p>
          </div>
        ) : snapshot.error ? (
          <p className="text-2xs text-warning">容器读取失败：{snapshot.error}</p>
        ) : hosts.length === 0 ? (
          <p className="text-2xs text-muted-foreground">Portainer 上没有可用的 Docker 主机。</p>
        ) : (
          <div className="flex flex-col gap-3">
            {hosts.map((host) => {
              const isOpen = openHosts.has(host.endpointId);
              const hostRunning = host.containers.filter(
                (container) => container.state === "running",
              ).length;
              return (
                <section key={host.endpointId}>
                  <div className="mb-1.5 flex w-full items-center gap-2">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggleHost(host.endpointId)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span
                        className={`size-1.5 flex-none rounded-full ${host.online ? "bg-success" : "bg-error"}`}
                        aria-label={host.error ?? (host.online ? "在线" : "离线")}
                      />
                      <span className="text-xs font-semibold">{host.name}</span>
                      <span className="rounded bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
                        {host.online ? `${hostRunning}/${host.containers.length}` : host.error}
                      </span>
                    </button>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedHost(
                            expandedHost?.id === host.endpointId
                              ? null
                              : { id: host.endpointId, tab: "images" },
                          );
                        }}
                        className="rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        镜像
                      </button>
                    </span>
                  </div>
                  {isOpen ? (
                    host.containers.length === 0 ? (
                      <p className="px-1 py-2 text-2xs text-muted-foreground">
                        {host.online ? "这台主机上没有匹配的容器。" : `读不到容器：${host.error}`}
                      </p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-border">
                        {host.containers.map((container, index) => {
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
                                      onClick={() =>
                                        setConfirm({ host, container, action: "restart" })
                                      }
                                    >
                                      重启
                                    </RowButton>
                                    <RowButton
                                      disabled={isBusy}
                                      danger
                                      onClick={() =>
                                        setConfirm({ host, container, action: "stop" })
                                      }
                                    >
                                      停止
                                    </RowButton>
                                  </>
                                ) : (
                                  <>
                                    <RowButton
                                      disabled={isBusy}
                                      onClick={() =>
                                        setConfirm({ host, container, action: "start" })
                                      }
                                    >
                                      启动
                                    </RowButton>
                                    <RowButton
                                      disabled={isBusy}
                                      danger
                                      onClick={() =>
                                        setConfirm({ host, container, action: "remove" })
                                      }
                                    >
                                      删除
                                    </RowButton>
                                  </>
                                )}
                                <RowButton
                                  disabled={isBusy}
                                  onClick={() => setLogsTarget({ host, container })}
                                >
                                  日志
                                </RowButton>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : null}
                  {expandedHost?.id === host.endpointId && expandedHost.tab === "images" ? (
                    <HostImagesPanel
                      key={`${host.endpointId}:${imageRevision}`}
                      host={host}
                      busy={busy}
                      onRemove={(image) => setConfirm({ host, image, action: "remove-image" })}
                      onClose={() => setExpandedHost(null)}
                    />
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {confirm !== null ? (
        <ConfirmDialog
          target={confirm}
          busy={busy === (confirm.container?.id ?? confirm.image?.id ?? "")}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void execute()}
        />
      ) : null}

      {logsTarget !== null ? (
        <LogsDrawer
          key={logsTarget.container.id}
          host={logsTarget.host}
          container={logsTarget.container}
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

/** 一台主机的镜像面板：点「镜像」展开，按需拉取，可删未被引用的镜像。 */
function HostImagesPanel({
  host,
  busy,
  onRemove,
  onClose,
}: {
  host: HostContainers;
  busy: string | null;
  onRemove: (image: ImageEntry) => void;
  onClose: () => void;
}) {
  const [images, setImages] = useState<ReadonlyArray<ImageEntry> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef<() => void>(() => {});

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 展开时拉取外部镜像列表（HTTP 只读），手动刷新走 loadRef
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchImages(host.endpointId).then((result) => {
        if (cancelled) return;
        if (result === null) setError("读取失败");
        else if (result.ok) {
          setError(null);
          setImages([...result.images].sort((a, b) => b.sizeBytes - a.sizeBytes));
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
  }, [host.endpointId]);

  return (
    <div className="mt-1.5 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5">
        <span className="text-2xs font-semibold">{host.name} 镜像</span>
        {images !== null ? (
          <span className="rounded bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
            {images.length}
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setImages(null);
            loadRef.current();
          }}
          className="ml-auto rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60"
        >
          刷新
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="收起镜像"
          className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ✕
        </button>
      </div>
      {images === null ? (
        <p className="px-3 py-2 text-2xs text-muted-foreground">{error ?? "读取镜像列表…"}</p>
      ) : images.length === 0 ? (
        <p className="px-3 py-2 text-2xs text-muted-foreground">这台主机上没有镜像。</p>
      ) : (
        <div>
          {images.map((image, index) => {
            const inUse = image.containers > 0;
            const isBusy = busy === image.id;
            return (
              <div
                key={image.id}
                className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 ${index > 0 ? "border-t border-border/40" : ""} ${isBusy ? "opacity-60" : ""}`}
              >
                <span className="w-64 truncate font-mono text-3xs text-foreground/80">
                  {image.tags[0] ?? `（无标签） ${image.id}`}
                </span>
                {image.tags.length > 1 ? (
                  <span className="text-3xs text-muted-foreground/60">
                    +{image.tags.length - 1} 标签
                  </span>
                ) : null}
                <span className="w-20 text-2xs tabular-nums text-muted-foreground">
                  {formatBytes(image.sizeBytes)}
                </span>
                <span
                  className={`w-24 text-2xs ${inUse ? "text-info" : "text-muted-foreground/60"}`}
                >
                  {inUse ? `${image.containers} 个容器在用` : "未被引用"}
                </span>
                <span className="text-2xs tabular-nums text-muted-foreground/70">
                  {new Date(image.created * 1000).toLocaleDateString()} 创建
                </span>
                <span className="ml-auto">
                  <RowButton disabled={isBusy || inUse} danger onClick={() => onRemove(image)}>
                    删除
                  </RowButton>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** 写操作二次确认：停止/重启/删除这类动作必须先问一句。 */
function ConfirmDialog({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: {
    host: HostContainers;
    container?: ContainerEntry;
    image?: ImageEntry;
    action: ContainerAction | "remove-image";
  };
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { container, image, action } = target;
  const isImage = action === "remove-image";
  const isRemove = action === "remove" || isImage;
  const name = container?.name ?? image?.tags[0] ?? image?.id ?? "";
  const detail = isImage
    ? `从 ${target.host.name} 删除这个镜像；被容器引用时 Docker 会拒绝。`
    : action === "stop"
      ? "停止后依赖它的服务会中断，确认这个容器现在可以停。"
      : action === "restart"
        ? "重启期间容器会短暂不可用。"
        : action === "remove"
          ? "删除容器不可恢复；保留数据卷和镜像。只能删除已停止的容器。"
          : "启动后会按镜像默认命令运行。";
  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-background/60 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        className="w-[400px] max-w-[calc(100%-2rem)] rounded-xl border border-border bg-popover p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">
          {isImage ? "删除镜像" : ACTION_LABEL[action as ContainerAction]}「{name}」？
        </h2>
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{detail}</p>
        <p className="mt-1 font-mono text-3xs break-all text-muted-foreground/70">
          {container?.image ?? image?.tags.join(" ") ?? image?.id}
        </p>
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
              isRemove
                ? "rounded-md bg-error px-2 py-1 text-2xs font-medium text-error-foreground hover:brightness-110 disabled:opacity-50"
                : "rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
            }
          >
            {busy
              ? "执行中…"
              : isImage
                ? "确认删除"
                : `确认${ACTION_LABEL[action as ContainerAction]}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogsDrawer({
  host,
  container,
  onClose,
}: {
  host: HostContainers;
  container: ContainerEntry;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadRef = useRef<() => void>(() => {});
  const preRef = useRef<HTMLPreElement | null>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 挂载时拉取外部容器日志（HTTP 只读）同步进 React；手动刷新走 loadRef
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void fetchContainerLogs(host.endpointId, container.id, 200).then((result) => {
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
  }, [container.id, host.endpointId]);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[520px] max-w-full flex-col border-l border-border bg-background shadow-2xl">
      <div className="flex flex-none items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="truncate text-2xs font-medium">
          {host.name} / {container.name} 日志
        </span>
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
