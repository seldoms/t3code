import { useEffect, useRef, useState } from "react";
import { AuthOrchestrationOperateScope, EnvironmentId } from "@t3tools/contracts";
import { useStartProjectThread } from "../../hooks/useStartProjectThread";
import { useEnvironmentsWithScope } from "../../state/session";
import { resolveSnapshotEnvironment } from "./projectThreadTarget";
import { useEnvironmentColors } from "../../environmentColors";
import { EnvironmentColorDot } from "../EnvironmentColorDot";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { LayoutGridIcon, Rows3Icon } from "lucide-react";
import { MachineMonitor } from "./MachineMonitor";
import { BoardWorkspace } from "./BoardWorkspace";
import { useMachineMonitor } from "../../hooks/useMachineMonitor";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { threadRuntimeIsActive } from "@t3tools/client-runtime/state/models";

import { newProjectId } from "../../lib/utils";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useProjects, useThreadShells } from "../../state/entities";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useClientSettings } from "../../hooks/useSettings";
import {
  BOARD_STAGES,
  type BoardStage,
  boardLastActiveAt,
  boardNeedsMe,
  boardRelativeTime,
  boardThreadCounts,
  deriveBoardStage,
} from "./boardStages";
import { copyText, showAppContextMenu } from "./appContextMenu";
import { pullRemoteSnapshots, useProjwallLatest, type ProjwallProject } from "./useProjwallLatest";
import { useHostMetrics } from "./useHostMetrics";

const boardRoute = getRouteApi("/_chat/board");

const normalisePath = (path: string) => path.replace(/\/+$/, "");
const SLEEPING_AFTER_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;

/** 服务端存的是字符串，读回来按列收敛一次，未知值当没设。 */
function asBoardStage(value: string | null | undefined): BoardStage | null {
  if (!value) return null;
  return BOARD_STAGES.some((stage) => stage.id === value) ? (value as BoardStage) : null;
}

type ThreadStatus = "approval" | "input" | "running" | "idle" | "settled";

const THREAD_STATUS_META: Record<ThreadStatus, { label: string; dot: string; rank: number }> = {
  approval: { label: "待审批", dot: "bg-warning", rank: 0 },
  input: { label: "待我回", dot: "bg-guest", rank: 1 },
  running: { label: "运行中", dot: "bg-info", rank: 2 },
  idle: { label: "空闲", dot: "bg-muted-foreground/50", rank: 3 },
  settled: { label: "已收敛", dot: "bg-muted-foreground/30", rank: 4 },
};

interface CardThread {
  readonly id: string;
  readonly environmentId: string;
  readonly title: string;
  readonly status: ThreadStatus;
}

interface CardModel {
  readonly key: string;
  readonly projectId: string | null;
  readonly environmentId: string | null;
  readonly title: string;
  readonly machineColor: import("../../environmentColors").MachineColor;
  readonly machineId: string;
  readonly machineLabel: string;
  readonly machineOnline: boolean;
  readonly path: string;
  readonly stage: BoardStage;
  readonly manualStage: boolean;
  readonly counts: {
    approval: number;
    input: number;
    running: number;
    settled: number;
    total: number;
  };
  readonly needsMe: boolean;
  readonly urgency: number;
  readonly lastActiveAt: number;
  readonly sleeping: boolean;
  readonly pr: string | null;
  readonly branch: string | null;
  readonly dirty: boolean;
  readonly purpose: string | null;
  readonly lastCommitSubject: string | null;
  /** 采集器里有、T3 里没接管：只能看，不能开会话。 */
  readonly external: boolean;
  /** 远端快照必须绑定对应 T3 环境，禁止把路径发给本机。 */
  readonly remote: boolean;
  /** 扫描到的目录最近 7 天有活动的 agent。 */
  readonly agents: ReadonlyArray<string>;
  readonly threads: ReadonlyArray<CardThread>;
}

interface MachineModel {
  readonly id: string;
  readonly label: string;
  readonly online: boolean;
  readonly count: number;
}

type View = "board" | "table";
type SortKey = "name" | "stage" | "machine" | "threads" | "approval" | "pr" | "active";

const shortHost = (host: string) => host.replace(/\.(local|lan)$/i, "");

/** 机器短标识：卡片/抽屉上不重复显示长主机名。 */
const MACHINE_SHORT: Readonly<Record<string, string>> = {
  mac: "本机",
  "huawei-matebook-14": "本机",
  "sobey-thinkpad-p15-gen-1": "P15",
  "uslab-gw-01": "uslab",
};

const shortMachineName = (label: string): string => {
  const key = shortHost(label).toLowerCase();
  const known = MACHINE_SHORT[key];
  if (known !== undefined) return known;
  return (
    shortHost(label)
      .replace(/^sobey-/i, "")
      .split("-")[0]
      ?.slice(0, 12) || shortHost(label).slice(0, 12)
  );
};

/** 路径展示去掉用户主目录前缀，避免「seldoms/sobey」这种截断标签。 */
const displayPath = (path: string) => path.replace(/^\/(Users|home)\/[^/]+/, "~");

/**
 * 采集器项目没有会话，git 活动只能证明「有人动过」，不能证明「已验收」：
 * 有未提交改动算「进行中」，其余一律「待启动」；完成状态必须另行核验，
 * 不拿最近提交冒充已收敛（审计 A09）。「暂停」只能手动设置。
 */
function derivedExternalStage(project: ProjwallProject): BoardStage {
  return project.dirty === true ? "active" : "backlog";
}

function toggleInSet<T>(set: ReadonlySet<T>, value: T): ReadonlySet<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

/**
 * 项目板：一屏看全部项目（T3 里接管的 + projwall 采集器扫到的）。
 * 列由会话状态推导，手动拖拽覆盖（存服务端）。规格：docs/internals/board-spec.md。
 */
export function BoardPage() {
  const projects = useProjects();
  // 用全量 shell 而不是 visible：后者滤掉了用户隐藏的会话，
  // 但看板要回答"这个项目有多少会话"，隐藏的也得算上。
  const threads = useThreadShells();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const starter = useStartProjectThread();
  const operable = useEnvironmentsWithScope(environments, AuthOrchestrationOperateScope);
  const projwall = useProjwallLatest();
  const hostMetrics = useHostMetrics();
  const environmentColors = useEnvironmentColors();
  const snapshotColor = (label: string): import("../../environmentColors").MachineColor => {
    const env = environments.find(
      (entry) => shortHost(entry.label).toLowerCase() === shortHost(label).toLowerCase(),
    );
    if (env) return environmentColors.get(env.environmentId) ?? "gray";
    const index = projwall.remotes.findIndex((entry) => entry.label === label);
    return (
      (["blue", "orange", "purple", "cyan", "pink", "yellow", "red"] as const)[index] ?? "gray"
    );
  };
  const navigate = useNavigate();
  const search = boardRoute.useSearch();
  const boardPrefs = useClientSettings();
  // 分钟级时钟：相对时间只需要分钟精度，避免整块板每秒重渲染。
  const now = Date.parse(useNowMinute());

  const navigateBoard = (next: Record<string, string | undefined>) => {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(next)) {
      if (typeof value === "string" && value.length > 0) cleaned[key] = value;
    }
    void navigate({ to: "/board", search: cleaned as never, replace: true });
  };

  const [view, setView] = useState<View>(boardPrefs.boardDefaultView);
  const [flat, setFlat] = useState(boardPrefs.boardDefaultFlat);
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [machineFilter, setMachineFilter] = useState<ReadonlySet<string>>(new Set());
  const [collapsed, setCollapsed] = useState<ReadonlySet<BoardStage>>(
    boardPrefs.boardDoneCollapsed ? new Set(["done"]) : new Set(),
  );
  const [showSleeping, setShowSleeping] = useState<ReadonlySet<BoardStage>>(new Set());
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "active", dir: -1 });
  const [dialog, setDialog] = useState<{ stage: BoardStage | null } | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullError, setPullError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<BoardStage | null>(null);
  const [panning, setPanning] = useState(false);
  const draggingCardRef = useRef<CardModel | null>(null);
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ startX: number; startScroll: number; moved: boolean } | null>(null);

  const envLabel = new Map<string, string>();
  const envOnline = new Map<string, boolean>();
  for (const env of environments) {
    envLabel.set(String(env.environmentId), env.label);
    envOnline.set(String(env.environmentId), env.connection.phase === "connected");
  }

  const updateProject = useAtomCommand(projectEnvironment.update, { reportFailure: false });
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });

  // 拖拽落点：写服务端 project.update，多设备看到同一块板；失败要看得见。
  const [stageError, setStageError] = useState<string | null>(null);
  const setStage = (projectId: string, environmentId: string, stage: BoardStage | null) => {
    void updateProject({
      environmentId: environmentId as never,
      input: { projectId: projectId as never, boardStage: stage },
    }).then((result) => {
      setStageError(result._tag === "Failure" ? "阶段保存失败：环境可能离线或无权限。" : null);
    });
  };

  const cardContextMenu = (card: CardModel) => async (event: React.MouseEvent) => {
    const choice = await showAppContextMenu(event, [
      { id: "open", label: "查看详情" },
      { id: "new-thread", label: card.external ? "接管并发起对话" : "发起对话" },
      { id: "copy", label: "复制路径" },
      ...(card.projectId && card.environmentId
        ? [
            {
              id: "stage",
              label: "设置阶段",
              separatorBefore: true,
              children: [
                ...BOARD_STAGES.map((entry) => ({
                  id: `stage:${entry.id}`,
                  label: entry.name,
                  checked: card.stage === entry.id,
                })),
                ...(card.manualStage
                  ? [{ id: "stage:auto", label: "恢复自动", separatorBefore: true }]
                  : []),
              ],
            },
          ]
        : []),
    ]);
    if (choice === null) return;
    if (choice === "open") selectCard(card.key);
    else if (choice === "copy") void copyText(card.path);
    else if (choice === "new-thread") {
      void starter.start(
        card.environmentId ? EnvironmentId.make(card.environmentId) : null,
        card.path,
      );
    } else if (choice.startsWith("stage:") && card.projectId && card.environmentId) {
      const stage = choice.slice("stage:".length);
      setStage(card.projectId, card.environmentId, stage === "auto" ? null : (stage as BoardStage));
    }
  };

  const threadsByProject = new Map<string, Array<(typeof threads)[number]>>();
  for (const thread of threads) {
    const key = `${thread.environmentId}:${thread.projectId}`;
    const list = threadsByProject.get(key);
    if (list) list.push(thread);
    else threadsByProject.set(key, [thread]);
  }

  // 同一台机器可能同时是 T3 环境、SSH 主机、快照来源：按主机名归一到同一个过滤 id。
  const remoteMachineId = (machine: string, label: string) => {
    const normalized = shortHost(label).toLowerCase();
    for (const env of environments) {
      if (shortHost(env.label).toLowerCase() === normalized) return env.label;
    }
    for (const host of hostMetrics?.remotes ?? []) {
      if (shortHost(host.host).toLowerCase() === normalized) return host.host;
    }
    return `remote:${machine}`;
  };

  const cards: CardModel[] = [];
  const coveredPaths = new Set<string>();

  for (const project of projects) {
    if (project.archivedAt !== null) continue;
    const key = `${project.environmentId}:${project.id}`;
    const projectThreads = threadsByProject.get(key) ?? [];
    const path = normalisePath(project.workspaceRoot);
    const derived = deriveBoardStage({ threads: projectThreads, now });
    const counts = boardThreadCounts(projectThreads);
    const isLocal = primaryEnvironmentId === null || project.environmentId === primaryEnvironmentId;
    // 只拿本机项目的路径去重：远程同路径项目不该遮住本机的未接管卡片。
    if (isLocal) coveredPaths.add(path);
    const machineId = isLocal
      ? "local"
      : (envLabel.get(String(project.environmentId)) ?? "未知环境");

    const cardThreads: CardThread[] = projectThreads
      .map((thread) => {
        const status: ThreadStatus = thread.hasPendingApprovals
          ? "approval"
          : thread.hasPendingUserInput
            ? "input"
            : threadRuntimeIsActive(thread.runtime)
              ? "running"
              : thread.settledAt !== null
                ? "settled"
                : "idle";
        return {
          id: String(thread.id),
          environmentId: String(thread.environmentId),
          title: thread.title,
          status,
        };
      })
      .sort((a, b) => THREAD_STATUS_META[a.status].rank - THREAD_STATUS_META[b.status].rank);

    const openPr = projectThreads
      .flatMap((thread) => thread.pullRequests)
      .find((link) => link.snapshot?.state === "open");
    const branch = projectThreads.find((thread) => thread.branch !== null)?.branch ?? null;

    cards.push({
      key: `t3:${key}`,
      projectId: String(project.id),
      environmentId: String(project.environmentId),
      title: project.title,
      machineId,
      machineColor: environmentColors.get(project.environmentId) ?? "gray",
      machineLabel: isLocal ? shortHost(hostMetrics?.host ?? "本机") : machineId,
      machineOnline: isLocal || (envOnline.get(String(project.environmentId)) ?? false),
      path,
      stage: asBoardStage(project.boardStage) ?? derived,
      manualStage: asBoardStage(project.boardStage) !== null,
      counts,
      needsMe: boardNeedsMe(projectThreads),
      urgency: counts.approval > 0 ? 0 : counts.input > 0 ? 1 : counts.running > 0 ? 2 : 3,
      lastActiveAt: boardLastActiveAt(projectThreads),
      sleeping: false,
      pr: openPr?.snapshot ? `#${openPr.number}` : null,
      branch,
      dirty: false,
      purpose: null,
      lastCommitSubject: null,
      external: false,
      remote: false,
      agents: [],
      threads: cardThreads,
    });
  }

  // 采集器扫到、但 T3 还没接管的项目：只读展示。
  const localLabel = shortHost(hostMetrics?.host ?? "本机");
  for (const project of projwall.projects) {
    const path = normalisePath(project.path);
    // 采集器里的占位项（路径不是绝对路径，例如 "-"）不当作项目。
    if (!path.startsWith("/")) continue;
    if (coveredPaths.has(path)) continue;
    const parsed = project.last_commit_at ? Date.parse(project.last_commit_at) : Number.NaN;
    const lastActiveAt = Number.isFinite(parsed) ? parsed : 0;
    cards.push({
      key: `pw:${path}`,
      projectId: null,
      environmentId: primaryEnvironmentId,
      title: project.name,
      machineId: "local",
      machineColor: "green",
      machineLabel: localLabel,
      machineOnline: true,
      path,
      stage: derivedExternalStage(project),
      manualStage: false,
      counts: { approval: 0, input: 0, running: 0, settled: 0, total: 0 },
      needsMe: false,
      urgency: 3,
      lastActiveAt,
      sleeping:
        project.dirty !== true && lastActiveAt > 0 && now - lastActiveAt > SLEEPING_AFTER_MS,
      pr: null,
      branch: project.branch ?? null,
      dirty: project.dirty === true,
      purpose: project.purpose?.trim() || null,
      lastCommitSubject: project.last_commit_subject ?? null,
      external: true,
      remote: false,
      agents: project.clis_7d ?? [],
      threads: [],
    });
  }

  // 远端机器拉回来的快照：同样只读展示，但不能在本机接管。
  for (const remote of projwall.remotes) {
    const machineId = remoteMachineId(remote.machine, remote.label);
    const sourceEnvironmentId = resolveSnapshotEnvironment(environments, remote);
    for (const project of remote.projects) {
      const path = normalisePath(project.path);
      if (!path.startsWith("/")) continue;
      const parsed = project.last_commit_at ? Date.parse(project.last_commit_at) : Number.NaN;
      const lastActiveAt = Number.isFinite(parsed) ? parsed : 0;
      cards.push({
        key: `pwr:${remote.machine}:${path}`,
        projectId: null,
        environmentId: sourceEnvironmentId,
        title: project.name,
        machineId,
        machineColor: snapshotColor(remote.label),
        machineLabel: remote.label,
        machineOnline: true,
        path,
        stage: derivedExternalStage(project),
        manualStage: false,
        counts: { approval: 0, input: 0, running: 0, settled: 0, total: 0 },
        needsMe: false,
        urgency: 3,
        lastActiveAt,
        sleeping:
          project.dirty !== true && lastActiveAt > 0 && now - lastActiveAt > SLEEPING_AFTER_MS,
        pr: null,
        branch: project.branch ?? null,
        dirty: project.dirty === true,
        purpose: project.purpose?.trim() || null,
        lastCommitSubject: project.last_commit_subject ?? null,
        external: true,
        remote: true,
        agents: project.clis_7d ?? [],
        threads: [],
      });
    }
  }

  const machines: MachineModel[] = [];
  const seenMachines = new Set<string>();
  const pushMachine = (id: string, label: string, online: boolean) => {
    if (seenMachines.has(id)) return;
    seenMachines.add(id);
    machines.push({
      id,
      label,
      online,
      count: cards.filter((card) => card.machineId === id).length,
    });
  };
  pushMachine("local", localLabel, true);
  for (const env of environments) {
    if (primaryEnvironmentId !== null && env.environmentId === primaryEnvironmentId) continue;
    pushMachine(env.label, env.label, env.connection.phase === "connected");
  }
  for (const remote of hostMetrics?.remotes ?? []) {
    pushMachine(remote.host, shortHost(remote.host), remote.online);
  }
  for (const remote of projwall.remotes) {
    pushMachine(remoteMachineId(remote.machine, remote.label), shortHost(remote.label), true);
  }

  const q = query.trim().toLowerCase();
  // 侧边栏点机器 → /board?machine=<id>，这里把它并进机器过滤。
  const urlMachine = search.machine;
  const effectiveMachineFilter = urlMachine ? new Set([urlMachine]) : machineFilter;
  const visible = cards.filter((card) => {
    if (search.dir && card.path !== search.dir && !card.path.startsWith(`${search.dir}/`)) {
      return false;
    }
    if (search.env && card.environmentId !== search.env) return false;
    if (effectiveMachineFilter.size > 0 && !effectiveMachineFilter.has(card.machineId)) {
      return false;
    }
    if (onlyMine && !card.needsMe) return false;
    if (!q) return true;
    return card.title.toLowerCase().includes(q) || card.path.toLowerCase().includes(q);
  });

  // 选中卡片走 URL：侧边栏点项目、浏览器后退都能对上同一块板。
  const selectedKey = search.card ?? null;
  const selectCard = (key: string | null) => {
    navigateBoard({ ...search, card: key ?? undefined });
  };
  const selected = cards.find((card) => card.key === selectedKey) ?? null;

  // 接管/新建只绑快照来源（主要环境）：来源离线就拒绝，不改投别的机器。
  const writableEnvironment =
    environments.find(
      (env) =>
        env.connection.phase === "connected" &&
        (primaryEnvironmentId === null || env.environmentId === primaryEnvironmentId),
    ) ?? null;

  const [adopting, setAdopting] = useState<string | null>(null);
  const [adoptError, setAdoptError] = useState<string | null>(null);
  const [adoptingAll, setAdoptingAll] = useState<{ done: number; total: number } | null>(null);

  const adoptPath = async (path: string, stage: BoardStage | null): Promise<boolean> => {
    if (!writableEnvironment) {
      setAdoptError("本机环境未连接，无法接管。");
      return false;
    }
    setAdopting(path);
    setAdoptError(null);
    const projectId = newProjectId();
    const result = await createProject({
      environmentId: writableEnvironment.environmentId,
      input: {
        projectId,
        title: inferProjectTitleFromPath(path),
        workspaceRoot: path,
        createWorkspaceRootIfMissing: false,
        defaultModelSelection: null,
      },
    });
    setAdopting(null);
    if (result._tag === "Failure") {
      setAdoptError("接管失败，看看路径是否还在、环境是否连着。");
      return false;
    }
    if (stage !== null) {
      setStage(String(projectId), String(writableEnvironment.environmentId), stage);
    }
    return true;
  };

  const adoptAll = async (paths: ReadonlyArray<string>) => {
    if (!writableEnvironment || paths.length === 0) return;
    setAdoptError(null);
    setAdoptingAll({ done: 0, total: paths.length });
    let failed = 0;
    for (const [index, path] of paths.entries()) {
      const ok = await adoptPath(path, null);
      if (!ok) failed += 1;
      setAdoptingAll({ done: index + 1, total: paths.length });
    }
    setAdoptingAll(null);
    if (failed > 0) setAdoptError(`${failed} 个接管失败（路径可能已不存在），其余成功。`);
  };

  const openThread = (environmentId: string, threadId: string) => {
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId, threadId },
    });
  };

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 全局 Escape 键监听，随组件挂载/卸载，用来关抽屉和弹窗
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setDialog(null);
      selectCard(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectCard]);

  // 看板空白处按住拖动 → 横向平移。交互元素（卡片/按钮/输入框）上不启动，
  // 否则 pointer capture 会把 click  retarget 到容器，吃掉点击。
  const handleBoardPanStart = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, [draggable=true], .cursor-pointer")) return;
    const el = boardScrollRef.current;
    if (!el) return;
    panRef.current = { startX: event.clientX, startScroll: el.scrollLeft, moved: false };
  };
  const handleBoardPanMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    const el = boardScrollRef.current;
    if (!pan || !el) return;
    const delta = event.clientX - pan.startX;
    if (Math.abs(delta) > 3) {
      // 超过阈值才捕获指针：纯点击不会被 capture 影响。
      if (!pan.moved) el.setPointerCapture(event.pointerId);
      pan.moved = true;
      setPanning(true);
    }
    if (pan.moved) el.scrollLeft = pan.startScroll - delta;
  };
  const handleBoardPanEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    panRef.current = null;
    setPanning(false);
    const el = boardScrollRef.current;
    if (el?.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  };

  const needsMeCount = visible.filter((card) => card.needsMe).length;
  const runningCount = visible.reduce((sum, card) => sum + card.counts.running, 0);
  const activeToday = visible.filter(
    (card) => card.lastActiveAt > 0 && now - card.lastActiveAt < DAY_MS,
  ).length;
  const offlineMachines = machines.filter((machine) => !machine.online).length;
  // 远端快照的路径不在本机，不能接管：只统计本机的未接管项目。
  const adoptableCards = cards.filter((card) => card.external && !card.remote);
  const externalCount = adoptableCards.length;
  const totalThreads = cards.reduce((sum, card) => sum + card.counts.total, 0);

  const handleDrop = (stage: BoardStage) => {
    const dragged = draggingCardRef.current;
    if (dragged?.projectId && dragged.environmentId) {
      setStage(dragged.projectId, dragged.environmentId, stage);
    }
    setDragging(null);
    setDropTarget(null);
  };

  const cardDragProps = (card: CardModel) =>
    card.external
      ? {}
      : {
          draggable: true,
          onDragStart: (event: React.DragEvent) => {
            // Chrome 要求 dragstart 里写 data，否则整次拖拽被取消。
            event.dataTransfer.setData("text/plain", card.path);
            event.dataTransfer.effectAllowed = "move";
            setDragging(card.key);
            draggingCardRef.current = card;
          },
          onDragEnd: () => {
            setDragging(null);
            draggingCardRef.current = null;
            setDropTarget(null);
          },
        };

  return (
    <BoardWorkspace>
      <header className="drag-region flex flex-none flex-wrap select-none items-center gap-3 border-b border-border px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight">项目板</h1>
          <span className="text-2xs text-muted-foreground">
            {cards.length} 个项目 · {totalThreads} 个会话
          </span>
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-border">
            {(["board", "table"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={
                  view === mode
                    ? "bg-accent px-2 py-1 text-2xs font-medium text-accent-foreground"
                    : "px-2 py-1 text-2xs text-muted-foreground hover:bg-muted/60"
                }
              >
                {mode === "board" ? "看板" : "表格"}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label={flat ? "切换成卡片" : "切换成分隔线"}
            onClick={() => setFlat((value) => !value)}
            className={
              flat
                ? "grid size-7 place-items-center rounded-md border border-primary/50 bg-accent text-accent-foreground"
                : "grid size-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted/60"
            }
          >
            {flat ? <Rows3Icon className="size-3.5" /> : <LayoutGridIcon className="size-3.5" />}
          </button>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索项目 / 路径"
            className="h-7 w-52 max-w-full rounded-md border border-border bg-transparent px-2 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
          />
          <button
            type="button"
            disabled={pulling}
            onClick={() => {
              setPulling(true);
              setPullError(null);
              void pullRemoteSnapshots()
                .then((result) => {
                  setPulling(false);
                  if (!result.ok) setPullError(result.error ?? "采集失败");
                  projwall.refresh();
                })
                .catch(() => setPulling(false));
            }}
            className="rounded-md border border-border px-2 py-1 text-2xs text-muted-foreground hover:bg-muted/60 disabled:opacity-50"
          >
            {pulling ? "采集中…" : "立即采集"}
          </button>
          <button
            type="button"
            disabled={!writableEnvironment}
            onClick={() => setDialog({ stage: null })}
            className="rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            + 新项目
          </button>
        </div>
      </header>

      <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-1.5">
        <Stat
          value={needsMeCount}
          label="等我把关"
          tone={needsMeCount > 0 ? "warning" : undefined}
        />
        <Stat value={runningCount} label="运行中" tone={runningCount > 0 ? "info" : undefined} />
        <Stat
          value={activeToday}
          label="今日有活动"
          tone={activeToday > 0 ? "success" : undefined}
        />
        {offlineMachines > 0 ? (
          <Stat value={offlineMachines} label="离线机器" tone="error" />
        ) : (
          <Stat value={machines.length} label="台机器正常" tone="success" />
        )}
        {urlMachine !== undefined ? (
          <button
            type="button"
            onClick={() => navigateBoard({ ...search, machine: undefined })}
            className="flex items-center gap-1 rounded-full border border-primary/50 bg-accent px-2 py-0.5 text-2xs text-accent-foreground"
          >
            机器：{shortMachineName(machines.find((m) => m.id === urlMachine)?.label ?? urlMachine)}{" "}
            ✕
          </button>
        ) : null}
        {search.dir ? (
          <button
            type="button"
            onClick={() => navigateBoard({ ...search, dir: undefined })}
            className="flex items-center gap-1 rounded-full border border-primary/50 bg-accent px-2 py-0.5 text-2xs text-accent-foreground"
          >
            目录：{displayPath(search.dir).split("/").slice(-2).join("/")} ✕
          </button>
        ) : null}
        {search.env ? (
          <button
            type="button"
            onClick={() => navigateBoard({ ...search, env: undefined })}
            className="flex items-center gap-1 rounded-full border border-primary/50 bg-accent px-2 py-0.5 text-2xs text-accent-foreground"
          >
            环境：{envLabel.get(search.env) ?? search.env} ✕
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {machines.map((machine) => {
            const on = effectiveMachineFilter.has(machine.id);
            return (
              <button
                key={machine.id}
                type="button"
                onClick={() => {
                  if (urlMachine !== undefined) {
                    navigateBoard({ ...search, machine: undefined });
                    setMachineFilter(new Set([machine.id]));
                    return;
                  }
                  setMachineFilter((set) => toggleInSet(set, machine.id));
                }}
                className={
                  on
                    ? "flex items-center gap-1.5 rounded-full border border-primary/50 bg-accent px-2 py-0.5 text-2xs text-accent-foreground"
                    : "flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60"
                }
              >
                <MachineDot online={machine.online} local={machine.id === "local"} />
                {shortMachineName(machine.label)}
                <span className="tabular-nums opacity-70">{machine.count}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setOnlyMine((value) => !value)}
            className={
              onlyMine
                ? "rounded-full border border-primary/50 bg-accent px-2 py-0.5 text-2xs text-accent-foreground"
                : "rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60"
            }
          >
            只看需要我
          </button>
          {externalCount > 0 ? (
            <button
              type="button"
              disabled={adoptingAll !== null || !writableEnvironment}
              onClick={() => void adoptAll(adoptableCards.map((card) => card.path))}
              className="rounded-full border border-border px-2 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60 disabled:opacity-50"
            >
              {adoptingAll
                ? `接管中 ${adoptingAll.done}/${adoptingAll.total}`
                : `全部接管（${externalCount}）`}
            </button>
          ) : null}
        </div>
      </div>

      {adoptError && dialog === null ? (
        <div className="flex-none border-b border-border px-4 py-1 text-2xs text-warning">
          {adoptError}
        </div>
      ) : null}
      {pullError !== null ? (
        <div className="flex-none border-b border-border px-4 py-1 text-2xs text-warning">
          远端采集失败：{pullError}
        </div>
      ) : null}
      {stageError !== null ? (
        <div className="flex-none border-b border-border px-4 py-1 text-2xs text-warning">
          {stageError}
        </div>
      ) : null}

      <HostStrip scannedAt={projwall.available ? projwall.scannedAt : null} />

      {view === "board" ? (
        <div
          ref={boardScrollRef}
          className={`flex min-h-0 flex-1 gap-2.5 overflow-x-auto overflow-y-hidden px-4 py-3 ${panning ? "cursor-grabbing select-none" : "cursor-grab"}`}
          onPointerDown={handleBoardPanStart}
          onPointerMove={handleBoardPanMove}
          onPointerUp={handleBoardPanEnd}
          onPointerLeave={handleBoardPanEnd}
          onContextMenu={(event) => {
            void showAppContextMenu(event, [
              // 这段 JSX 只在看板分支渲染，所以「看板视图」恒为选中。
              { id: "board", label: "看板视图", checked: true },
              { id: "table", label: "表格视图", checked: false },
              {
                id: "new",
                label: "新建项目",
                separatorBefore: true,
                disabled: writableEnvironment === null,
              },
              {
                id: "adopt",
                label: `全部接管（${externalCount}）`,
                disabled:
                  externalCount === 0 || adoptingAll !== null || writableEnvironment === null,
              },
            ]).then((choice) => {
              if (choice === "board") setView("board");
              else if (choice === "table") setView("table");
              else if (choice === "new") setDialog({ stage: null });
              else if (choice === "adopt") {
                void adoptAll(adoptableCards.map((card) => card.path));
              }
            });
          }}
        >
          {BOARD_STAGES.map((stage) => {
            const items = visible
              .filter((card) => card.stage === stage.id)
              .sort((a, b) => a.urgency - b.urgency || b.lastActiveAt - a.lastActiveAt);
            const isCollapsed = collapsed.has(stage.id);
            const isDropTarget = dropTarget === stage.id;

            if (isCollapsed) {
              return (
                <section key={stage.id} className="flex w-8 flex-none flex-col">
                  <button
                    type="button"
                    onClick={() => setCollapsed((set) => toggleInSet(set, stage.id))}
                    className="flex h-full flex-col items-center gap-2 rounded-lg border border-border/60 bg-muted/30 py-2 text-muted-foreground hover:bg-muted/60"
                    aria-label={`展开「${stage.name}」`}
                  >
                    <span className="rounded bg-muted px-1 text-2xs tabular-nums">
                      {items.length}
                    </span>
                    <span className="text-2xs" style={{ writingMode: "vertical-rl" }}>
                      {stage.name}
                    </span>
                  </button>
                </section>
              );
            }

            const awake = items.filter((card) => !card.sleeping);
            const asleep = items.filter((card) => card.sleeping);
            const sleepingShown = showSleeping.has(stage.id);

            return (
              <section
                key={stage.id}
                className="flex min-w-[240px] flex-1 basis-[272px] flex-col"
                onDragOver={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  setDropTarget(stage.id);
                }}
                onDragLeave={() =>
                  setDropTarget((current) => (current === stage.id ? null : current))
                }
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(stage.id);
                }}
              >
                <div className="group mb-2 flex items-center gap-1.5 px-1">
                  <button
                    type="button"
                    className="flex items-center gap-1.5"
                    onClick={() => setCollapsed((set) => toggleInSet(set, stage.id))}
                    aria-label={`折叠「${stage.name}」`}
                  >
                    <span className="text-xs font-semibold">{stage.name}</span>
                    <span className="rounded bg-muted px-1 text-2xs tabular-nums text-muted-foreground">
                      {items.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="在这个列新建项目"
                    disabled={!writableEnvironment}
                    onClick={() => setDialog({ stage: stage.id })}
                    className="ml-auto grid size-5 place-items-center rounded text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 disabled:hidden"
                  >
                    +
                  </button>
                </div>
                <div
                  className={
                    isDropTarget
                      ? "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg pb-3 outline outline-1 outline-dashed outline-primary/60"
                      : flat
                        ? "flex min-h-0 flex-1 flex-col overflow-y-auto pb-3"
                        : "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pb-3"
                  }
                >
                  {items.length === 0 ? (
                    <div className="grid h-12 place-items-center rounded-lg border border-dashed border-border text-2xs text-muted-foreground">
                      {stage.hint}
                    </div>
                  ) : (
                    <>
                      {awake.map((card) => (
                        <BoardCard
                          key={card.key}
                          card={card}
                          now={now}
                          flat={flat}
                          selected={selectedKey === card.key}
                          dragging={dragging === card.key}
                          dragProps={cardDragProps(card)}
                          onSelect={() => selectCard(card.key)}
                          onContextMenu={cardContextMenu(card)}
                        />
                      ))}
                      {sleepingShown
                        ? asleep.map((card) => (
                            <BoardCard
                              key={card.key}
                              card={card}
                              now={now}
                              flat={flat}
                              selected={selectedKey === card.key}
                              dragging={dragging === card.key}
                              dragProps={cardDragProps(card)}
                              onSelect={() => selectCard(card.key)}
                              onContextMenu={cardContextMenu(card)}
                            />
                          ))
                        : null}
                      {asleep.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowSleeping((set) => toggleInSet(set, stage.id))}
                          className="mt-1 rounded-md border border-dashed border-border px-2 py-1.5 text-2xs text-muted-foreground hover:bg-muted/60"
                        >
                          {sleepingShown ? "收起沉睡项目" : `${asleep.length} 个沉睡项目`}
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <BoardTable
          cards={visible}
          now={now}
          sort={sort}
          onSort={(key) =>
            setSort((current) =>
              current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 },
            )
          }
          selectedKey={selectedKey}
          onSelect={selectCard}
        />
      )}

      {selected ? (
        <BoardDrawer
          card={selected}
          now={now}
          adopting={adopting === selected.path || starter.busy}
          adoptError={starter.error ?? adoptError}
          canStart={
            selected.environmentId !== null &&
            operable.has(EnvironmentId.make(selected.environmentId)) &&
            environments.some(
              (entry) =>
                entry.environmentId === selected.environmentId &&
                entry.connection.phase === "connected",
            )
          }
          canAdopt={writableEnvironment !== null}
          onAdopt={() => void adoptPath(selected.path, null)}
          onStage={(stage) => {
            if (selected.projectId && selected.environmentId) {
              setStage(selected.projectId, selected.environmentId, stage);
            }
          }}
          onOpenThread={openThread}
          onClose={() => selectCard(null)}
          onNewThread={() => {
            void starter.start(
              selected.environmentId ? EnvironmentId.make(selected.environmentId) : null,
              selected.path,
            );
          }}
        />
      ) : null}

      {dialog !== null ? (
        <NewProjectDialog
          stage={dialog.stage}
          busy={adopting !== null}
          error={adoptError}
          onCancel={() => setDialog(null)}
          onSubmit={async (path) => {
            const ok = await adoptPath(path, dialog.stage);
            if (ok) setDialog(null);
          }}
        />
      ) : null}
    </BoardWorkspace>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "warning" | "info" | "success" | "error" | undefined;
}) {
  const color =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
        ? "text-info"
        : tone === "success"
          ? "text-success"
          : tone === "error"
            ? "text-error"
            : "text-foreground";
  return (
    <span className="flex items-baseline gap-1">
      <span className={`text-sm font-semibold tabular-nums ${color}`}>{value}</span>
      <span className="text-2xs text-muted-foreground">{label}</span>
    </span>
  );
}

function MachineDot({ online, local = false }: { online: boolean; local?: boolean }) {
  return (
    <span
      className={`inline-block size-1.5 flex-none rounded-full ${
        !online ? "bg-muted-foreground/40" : local ? "bg-success" : "bg-info"
      }`}
    />
  );
}

/** 无会话、无 PR、无改动的项目用单行细卡，避免待启动列被大卡刷满。 */
function isSlim(card: CardModel): boolean {
  return card.counts.total === 0 && card.pr === null && !card.dirty;
}

function BoardCard({
  card,
  now,
  flat,
  selected,
  dragging,
  dragProps,
  onSelect,
  onContextMenu,
}: {
  card: CardModel;
  now: number;
  flat: boolean;
  selected: boolean;
  dragging: boolean;
  dragProps: Record<string, unknown>;
  onSelect: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const slim = isSlim(card);
  const base = dragging ? "opacity-40 " : "";
  const skin = flat
    ? "border-b border-border/60 bg-transparent hover:bg-muted/50"
    : "rounded-lg border border-border bg-card hover:border-ring/40 hover:bg-muted/40";
  const selectedSkin = selected ? (flat ? "bg-accent" : "border-primary/60 bg-accent") : "";

  if (slim) {
    return (
      <div
        {...dragProps}
        onClick={onSelect}
        onContextMenu={onContextMenu}
        className={`${base}${skin} ${selectedSkin} flex cursor-pointer items-center gap-1.5 px-2 py-1 ${flat ? "" : "rounded-md"}`}
      >
        <EnvironmentColorDot color={card.machineColor} />
        <span className="min-w-0 flex-1 truncate text-2xs text-foreground/90">{card.title}</span>
        <span className="flex-none text-3xs tabular-nums text-muted-foreground/70">
          {boardRelativeTime(card.lastActiveAt, now)}
        </span>
      </div>
    );
  }

  return (
    <div
      {...dragProps}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`${base}${skin} ${selectedSkin} relative cursor-pointer p-2 ${card.external && !flat ? "bg-card/50" : ""}`}
    >
      {card.counts.approval > 0 ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-warning" />
      ) : null}
      <div className="flex items-start gap-1.5">
        <EnvironmentColorDot color={card.machineColor} className="mt-1" />
        <span className="line-clamp-2 text-xs font-medium leading-snug">{card.title}</span>
        {card.external ? (
          <span className="ml-auto flex-none rounded bg-muted px-1 text-3xs text-muted-foreground">
            未接管
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {card.counts.approval > 0 ? (
          <Badge tone="approval">{card.counts.approval} 待审批</Badge>
        ) : null}
        {card.counts.input > 0 ? <Badge tone="input">{card.counts.input} 待我回</Badge> : null}
        {card.counts.running > 0 ? (
          <Badge tone="running">{card.counts.running} 运行中</Badge>
        ) : null}
        {card.pr !== null ? <Badge tone="pr">PR {card.pr}</Badge> : null}
        {card.dirty ? <Badge tone="approval">有改动</Badge> : null}
        {card.external && card.agents.length > 0 ? (
          <Badge tone="input">{card.agents.slice(0, 2).join(" / ")}</Badge>
        ) : null}
        {!card.external &&
        card.counts.total > 0 &&
        card.counts.running === 0 &&
        card.counts.approval === 0 &&
        card.counts.input === 0 ? (
          <Badge>{card.counts.total} 会话 · 已收敛</Badge>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-2xs text-muted-foreground">
        {card.branch !== null ? (
          <span className="max-w-24 truncate font-mono text-3xs opacity-80">{card.branch}</span>
        ) : null}
        <span className="ml-auto flex-none tabular-nums">
          {boardRelativeTime(card.lastActiveAt, now)}
        </span>
      </div>
    </div>
  );
}

const TABLE_COLUMNS: ReadonlyArray<{ key: SortKey; label: string; align?: "right" }> = [
  { key: "name", label: "名称" },
  { key: "stage", label: "阶段" },
  { key: "machine", label: "机器" },
  { key: "threads", label: "会话", align: "right" },
  { key: "approval", label: "待审批", align: "right" },
  { key: "pr", label: "PR" },
  { key: "active", label: "最近活动" },
];

const STAGE_DOT: Record<BoardStage, string> = {
  backlog: "bg-muted-foreground/40",
  active: "bg-info",
  review: "bg-warning",
  ship: "bg-success",
  paused: "bg-muted-foreground/60",
  done: "bg-muted-foreground/30",
};

function BoardTable({
  cards,
  now,
  sort,
  onSort,
  selectedKey,
  onSelect,
}: {
  cards: ReadonlyArray<CardModel>;
  now: number;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (key: SortKey) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const value = (card: CardModel): string | number => {
    switch (sort.key) {
      case "name":
        return card.title.toLowerCase();
      case "stage":
        return BOARD_STAGES.findIndex((stage) => stage.id === card.stage);
      case "machine":
        return card.machineLabel;
      case "threads":
        return card.counts.total;
      case "approval":
        return card.counts.approval;
      case "pr":
        return card.pr !== null ? 1 : 0;
      case "active":
        return card.lastActiveAt;
    }
  };
  const sorted = [...cards].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    return (x === y ? 0 : x < y ? -1 : 1) * sort.dir;
  });

  return (
    <div className="min-h-0 flex-1 overflow-auto px-4 py-2">
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b border-border">
            {TABLE_COLUMNS.map((column) => (
              <th
                key={column.key}
                className={`px-2 py-1.5 font-medium text-muted-foreground ${column.align === "right" ? "text-right" : "text-left"}`}
              >
                <button
                  type="button"
                  onClick={() => onSort(column.key)}
                  className="inline-flex items-center gap-0.5 hover:text-foreground"
                >
                  {column.label}
                  {sort.key === column.key ? (
                    <span className="text-3xs">{sort.dir === 1 ? "↑" : "↓"}</span>
                  ) : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => {
            const stage = BOARD_STAGES.find((entry) => entry.id === card.stage);
            return (
              <tr
                key={card.key}
                onClick={() => onSelect(card.key)}
                className={`cursor-pointer border-b border-border/50 hover:bg-muted/50 ${selectedKey === card.key ? "bg-accent" : ""}`}
              >
                <td className="max-w-72 px-2 py-1.5">
                  <div className="flex items-center gap-1.5 truncate font-medium">
                    <EnvironmentColorDot color={card.machineColor} />
                    {card.title}
                  </div>
                  <div className="truncate font-mono text-3xs text-muted-foreground/70">
                    {card.path}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1.5 text-2xs">
                    <span className={`size-1.5 rounded-full ${STAGE_DOT[card.stage]}`} />
                    {stage?.name}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                    <EnvironmentColorDot color={card.machineColor} />
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {card.counts.total || "·"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {card.counts.approval > 0 ? (
                    <Badge tone="approval">{card.counts.approval}</Badge>
                  ) : (
                    <span className="text-muted-foreground/50">·</span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {card.pr !== null ? (
                    <Badge tone="pr">{card.pr}</Badge>
                  ) : (
                    <span className="text-muted-foreground/50">·</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-2xs text-muted-foreground">
                  {boardRelativeTime(card.lastActiveAt, now)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BoardDrawer({
  card,
  now,
  adopting,
  adoptError,
  canAdopt,
  canStart,
  onAdopt,
  onStage,
  onOpenThread,
  onNewThread,
  onClose,
}: {
  card: CardModel;
  now: number;
  adopting: boolean;
  adoptError: string | null;
  canAdopt: boolean;
  canStart: boolean;
  onAdopt: () => void;
  onStage: (stage: BoardStage | null) => void;
  onOpenThread: (environmentId: string, threadId: string) => void;
  onNewThread: () => void;
  onClose: () => void;
}) {
  const stage = BOARD_STAGES.find((entry) => entry.id === card.stage);
  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-[360px] max-w-full flex-col border-l border-border bg-background shadow-2xl">
      <div className="flex flex-none items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="text-2xs text-muted-foreground">{stage?.name}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="关闭（Esc）"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold leading-snug">
          <EnvironmentColorDot color={card.machineColor} />
          {card.title}
        </h2>
        <div className="mt-1 break-all font-mono text-3xs text-muted-foreground">{card.path}</div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <EnvironmentColorDot color={card.machineColor} />
          </span>
          {card.branch !== null ? <Badge>{card.branch}</Badge> : null}
          {card.dirty ? <Badge tone="approval">有改动</Badge> : null}
          {card.external && card.agents.length > 0 ? (
            <Badge tone="input">{card.agents.slice(0, 2).join(" / ")}</Badge>
          ) : null}
          {card.pr !== null ? <Badge tone="pr">PR {card.pr}</Badge> : null}
          {card.external ? <Badge>未接管</Badge> : null}
          {card.manualStage ? <Badge tone="input">手动阶段</Badge> : null}
          <span className="ml-auto tabular-nums">{boardRelativeTime(card.lastActiveAt, now)}</span>
        </div>

        {!card.external ? (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-2xs font-medium text-muted-foreground">阶段</span>
              {card.manualStage ? (
                <button
                  type="button"
                  onClick={() => onStage(null)}
                  className="ml-auto rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  恢复自动
                </button>
              ) : (
                <span className="ml-auto text-3xs text-muted-foreground/60">按会话状态推导</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {BOARD_STAGES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onStage(entry.id)}
                  className={
                    entry.id === card.stage
                      ? "rounded-md border border-primary/60 bg-accent px-1.5 py-0.5 text-2xs text-accent-foreground"
                      : "rounded-md border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60"
                  }
                >
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {card.external ? (
          <div className="mt-3 flex flex-col gap-2">
            {card.purpose !== null ? (
              <p className="text-2xs text-muted-foreground">{card.purpose}</p>
            ) : null}
            {card.lastCommitSubject !== null ? (
              <p className="text-2xs text-muted-foreground">最近提交：{card.lastCommitSubject}</p>
            ) : null}
            {card.agents.length > 0 ? (
              <p className="text-2xs text-muted-foreground">
                最近 7 天的 agent：{card.agents.join(" / ")}
              </p>
            ) : null}
            {card.remote ? (
              <p className="text-2xs text-muted-foreground">
                {card.environmentId === null
                  ? "未找到唯一对应的 T3 环境。请先在设置 → 环境中连接这台机器。"
                  : !canStart
                    ? "目标环境未连接或缺少操作权限。请先检查设置 → 环境。"
                    : "目录将在对应远程环境登记，对话与 Agent 都运行在那台机器上。"}
              </p>
            ) : (
              <>
                <p className="text-2xs text-muted-foreground">采集器扫到的项目，T3 还没接管。</p>
                <button
                  type="button"
                  disabled={adopting || !canAdopt}
                  onClick={onAdopt}
                  className="self-start rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
                >
                  {adopting ? "接管中…" : "在 T3 中接管"}
                </button>
                {adoptError !== null ? (
                  <span className="text-2xs text-warning">{adoptError}</span>
                ) : null}
              </>
            )}
            <button
              type="button"
              onClick={onNewThread}
              disabled={adopting || !canStart}
              className="self-start rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {adopting ? "正在打开…" : "接管并发起对话"}
            </button>
            {card.remote && adoptError !== null ? (
              <p role="alert" className="text-2xs text-warning">
                {adoptError}
              </p>
            ) : null}
          </div>
        ) : card.threads.length === 0 ? (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-2xs text-muted-foreground">这个项目还没有会话。</p>
            <button
              type="button"
              onClick={onNewThread}
              disabled={adopting || !canStart}
              className="self-start rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:brightness-110"
            >
              发起对话
            </button>
          </div>
        ) : (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-2xs font-medium text-muted-foreground">
                会话（{card.threads.length}）
              </span>
              <button
                type="button"
                onClick={onNewThread}
                disabled={adopting || !canStart}
                className="ml-auto rounded border border-border px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              >
                + 发起对话
              </button>
            </div>
            <div className="flex flex-col">
              {card.threads.map((thread) => (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => onOpenThread(thread.environmentId, thread.id)}
                  className="flex items-center gap-1.5 rounded px-1 py-1 text-left text-2xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                >
                  <span
                    className={`size-1.5 flex-none rounded-full ${THREAD_STATUS_META[thread.status].dot}`}
                    aria-label={THREAD_STATUS_META[thread.status].label}
                  />
                  <span className="truncate">{thread.title}</span>
                  {thread.status === "approval" || thread.status === "input" ? (
                    <span className="ml-auto flex-none text-3xs text-warning">
                      {THREAD_STATUS_META[thread.status].label}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function NewProjectDialog({
  stage,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  stage: BoardStage | null;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (path: string) => Promise<void>;
}) {
  const [path, setPath] = useState("");
  const stageName = stage !== null ? BOARD_STAGES.find((entry) => entry.id === stage)?.name : null;
  const trimmed = path.trim();
  return (
    <div
      className="absolute inset-0 z-40 grid place-items-center bg-background/60 backdrop-blur-xs"
      onClick={onCancel}
    >
      <div
        className="w-[420px] rounded-xl border border-border bg-popover p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-sm font-semibold">新建项目</h2>
        <p className="mt-0.5 text-2xs text-muted-foreground">
          输入本机已有目录的绝对路径，接管进 T3{stageName ? `，放入「${stageName}」` : ""}。
        </p>
        <input
          autoFocus
          value={path}
          onChange={(event) => setPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && trimmed.startsWith("/") && !busy) {
              void onSubmit(trimmed);
            }
          }}
          placeholder="/Users/you/projects/my-app"
          className="mt-3 h-8 w-full rounded-md border border-border bg-transparent px-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
        />
        {trimmed !== "" && trimmed.startsWith("/") ? (
          <p className="mt-1 text-2xs text-muted-foreground">
            标题：{inferProjectTitleFromPath(trimmed)}
          </p>
        ) : null}
        {error !== null ? <p className="mt-1 text-2xs text-warning">{error}</p> : null}
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
            disabled={busy || !trimmed.startsWith("/")}
            onClick={() => void onSubmit(trimmed)}
            className="rounded-md bg-primary px-2 py-1 text-2xs font-medium text-primary-foreground hover:brightness-110 disabled:opacity-50"
          >
            {busy ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HostStrip({ scannedAt }: { scannedAt: string | null }) {
  const colors = useEnvironmentColors();
  const { machines } = useMachineMonitor();
  return (
    <div className="max-h-[35vh] shrink-0 overflow-y-auto border-b border-border px-4 py-1.5">
      <MachineMonitor
        machines={machines}
        colorFor={(machine) =>
          machine.local
            ? "green"
            : machine.environmentId
              ? (colors.get(machine.environmentId) ?? "gray")
              : "gray"
        }
      />
      {scannedAt ? (
        <p className="mt-1 text-3xs text-muted-foreground/60">项目快照采集于 {scannedAt}</p>
      ) : null}
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "approval" | "input" | "running" | "pr";
}) {
  const toneClass =
    tone === "approval"
      ? "bg-warning-surface text-warning"
      : tone === "input"
        ? "bg-guest-surface text-guest"
        : tone === "running"
          ? "bg-info/15 text-info"
          : tone === "pr"
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex h-4 items-center rounded px-1 text-2xs tabular-nums ${toneClass}`}
    >
      {children}
    </span>
  );
}
