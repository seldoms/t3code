import type { ContextMenuItem } from "@t3tools/contracts";
import { BOARD_STAGES, type BoardStage } from "./boardStages";

export interface BoardActionCard {
  readonly external: boolean;
  readonly stage: BoardStage;
  readonly manualStage: boolean;
  readonly threads: ReadonlyArray<{ readonly id: string; readonly title: string }>;
}

export function boardCardActions(
  card: BoardActionCard,
  canStart: boolean,
): ReadonlyArray<ContextMenuItem<string>> {
  return [
    { id: "open", label: "查看项目详情" },
    {
      id: "new-thread",
      label: card.external ? "接管并发起新对话" : "发起新对话",
      disabled: !canStart,
    },
    ...(card.threads.length > 0
      ? [
          {
            id: "threads",
            label: `打开已有对话（${card.threads.length}）`,
            children: card.threads.map((thread) => ({
              id: `thread:${thread.id}`,
              label: thread.title,
            })),
          },
        ]
      : []),
    {
      id: "stage",
      label: card.external ? "移动到阶段（仅此设备）" : "移动到阶段",
      separatorBefore: true,
      children: [
        ...BOARD_STAGES.map((stage) => ({
          id: `stage:${stage.id}`,
          label: stage.name,
          checked: stage.id === card.stage,
        })),
        ...(card.manualStage
          ? [{ id: "stage:auto", label: "恢复自动判断", separatorBefore: true }]
          : []),
      ],
    },
    { id: "copy", label: "复制项目路径", separatorBefore: true },
  ];
}

/** Machine and path, not a display name or project title, own a scanned card's manual stage. */
export function scannedStageKey(machineId: string, path: string): string {
  return JSON.stringify([machineId, path.replace(/\/+$/, "") || "/"]);
}

export function updateScannedStage(
  stages: Readonly<Record<string, BoardStage>>,
  key: string,
  stage: BoardStage | null,
): Record<string, BoardStage> {
  const next = { ...stages };
  if (stage === null) delete next[key];
  else next[key] = stage;
  return next;
}
