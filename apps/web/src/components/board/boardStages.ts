import {
  threadRuntimeIsActive,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";

/**
 * 项目板的列。
 *
 * 这一层是纯函数：只吃线程快照，不碰网络、不碰时间以外的副作用，
 * 所以列是「推导」出来的，不需要给 project 加字段，也不需要数据库迁移。
 * 之后要加手填阶段时，在这一层加一个 override 入参即可。
 */
export type BoardStage = "backlog" | "active" | "review" | "ship" | "paused" | "done";

export const BOARD_STAGES: ReadonlyArray<{
  readonly id: BoardStage;
  readonly name: string;
  readonly hint: string;
}> = [
  { id: "backlog", name: "待启动", hint: "还没有会话" },
  { id: "active", name: "进行中", hint: "有会话在跑" },
  { id: "review", name: "等我把关", hint: "卡在审批或提问" },
  { id: "ship", name: "待交付", hint: "有 PR 开着" },
  { id: "paused", name: "暂停", hint: "有意搁置" },
  { id: "done", name: "已收敛", hint: "会话都收敛了" },
];

/** 会话是否正在跑：复用 runtime 活跃判断，终态（completed/failed/…）不算活跃。 */
function isWorking(thread: EnvironmentThreadShell): boolean {
  if (thread.hasPendingApprovals || thread.hasPendingUserInput) return false;
  return threadRuntimeIsActive(thread.runtime);
}

export interface BoardStageInput {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  /** 毫秒时间戳；测试注入用，正式调用传 Date.now()。 */
  readonly now: number;
}

export function deriveBoardStage({ threads, now }: BoardStageInput): BoardStage {
  if (threads.length === 0) return "backlog";

  if (threads.some((thread) => thread.hasPendingApprovals)) return "review";
  if (threads.some((thread) => thread.hasPendingUserInput)) return "review";
  if (threads.some((thread) => thread.hasActionableProposedPlan)) return "review";

  if (threads.some((thread) => isWorking(thread))) return "active";

  // 有开着（未合并/未关闭）的 PR 就算待交付。
  const hasOpenPullRequest = threads.some((thread) =>
    thread.pullRequests.some((link) => link.snapshot?.state === "open" || link.snapshot === null),
  );
  if (hasOpenPullRequest) return "ship";

  const snoozed = threads.some((thread) => {
    const until = thread.snoozedUntil;
    if (until === null) return false;
    const at = Date.parse(until);
    return Number.isFinite(at) && at > now;
  });
  if (snoozed) return "paused";

  return "done";
}

/** 卡片上要显示的计数徽章。 */
export function boardThreadCounts(threads: ReadonlyArray<EnvironmentThreadShell>) {
  let approval = 0;
  let input = 0;
  let running = 0;
  let settled = 0;
  for (const thread of threads) {
    if (thread.hasPendingApprovals) approval += 1;
    else if (thread.hasPendingUserInput) input += 1;
    else if (isWorking(thread)) running += 1;
    else if (thread.settledAt !== null) settled += 1;
  }
  return { approval, input, running, settled, total: threads.length };
}

/** 「需要我」的项目：有审批或待输入。 */
export function boardNeedsMe(threads: ReadonlyArray<EnvironmentThreadShell>): boolean {
  return threads.some((thread) => thread.hasPendingApprovals || thread.hasPendingUserInput);
}

/** 最近活动时间（毫秒），用于列内排序。 */
export function boardLastActiveAt(threads: ReadonlyArray<EnvironmentThreadShell>): number {
  let latest = 0;
  for (const thread of threads) {
    const at = Date.parse(thread.updatedAt);
    if (Number.isFinite(at) && at > latest) latest = at;
  }
  return latest;
}

/** 相对时间，尽量短。 */
export function boardRelativeTime(ms: number, now: number): string {
  if (ms <= 0) return "无记录";
  const diff = Math.max(0, now - ms);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  const month = Math.floor(day / 30);
  return month < 12 ? `${month} 个月前` : `${Math.floor(month / 12)} 年前`;
}
