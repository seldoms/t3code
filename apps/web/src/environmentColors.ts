import {
  resolveEnvironmentColorKind,
  type EnvironmentColorKind,
  type EnvironmentId,
} from "@t3tools/contracts";

import { useEnvironments } from "./state/environments";

// 素色板：低饱和、彼此可分辨，且不撞红/绿/黄状态色。
export const ENVIRONMENT_COLOR_DOT_CLASS: Record<EnvironmentColorKind, string> = {
  slate: "bg-slate-400",
  stone: "bg-stone-400",
  steel: "bg-sky-600/70",
  indigo: "bg-indigo-400",
  mauve: "bg-purple-400/80",
  ink: "bg-cyan-700/70",
  clay: "bg-orange-300",
  rose: "bg-rose-300",
};

export const ENVIRONMENT_COLOR_LABELS: Record<EnvironmentColorKind, string> = {
  slate: "灰蓝",
  stone: "石灰",
  steel: "钢青",
  indigo: "靛蓝",
  mauve: "藕紫",
  ink: "墨青",
  clay: "陶土",
  rose: "豆沙",
};

/** 自动分配与看板兜底共用同一套顺序，别处再抄一份就会漂。 */
export const MACHINE_COLOR_ORDER = [
  "slate",
  "stone",
  "steel",
  "indigo",
  "mauve",
  "ink",
  "clay",
  "rose",
] as const satisfies readonly EnvironmentColorKind[];

export type MachineColor = EnvironmentColorKind | "gray";

/**
 * 用户显式挑过的颜色一律照办（哪怕撞色），只有没挑过的才自动补一个没被占用的。
 * 以前本机被钉死成绿色、撞色还会被静默改色，设置里就表现为「点了没反应」。
 */
export function allocateEnvironmentColors(
  entries: ReadonlyArray<{ id: EnvironmentId; color: EnvironmentColorKind | null }>,
): ReadonlyMap<EnvironmentId, MachineColor> {
  const result = new Map<EnvironmentId, MachineColor>();
  const used = new Set<EnvironmentColorKind>();
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of sorted) {
    if (entry.color === null) continue;
    result.set(entry.id, entry.color);
    used.add(entry.color);
  }
  for (const entry of sorted) {
    if (result.has(entry.id)) continue;
    const color = MACHINE_COLOR_ORDER.find((candidate) => !used.has(candidate));
    result.set(entry.id, color ?? "gray");
    if (color) used.add(color);
  }
  return result;
}

/** 各机器存下来的显式选择，null 表示交给自动分配。 */
export function useEnvironmentColorChoices(): ReadonlyMap<
  EnvironmentId,
  EnvironmentColorKind | null
> {
  const { environments } = useEnvironments();
  return new Map(
    environments.map((entry) => [
      entry.environmentId,
      resolveEnvironmentColorKind(entry.serverConfig),
    ]),
  );
}

export function useEnvironmentColors() {
  const { environments } = useEnvironments();
  return allocateEnvironmentColors(
    environments.map((entry) => ({
      id: entry.environmentId,
      color: resolveEnvironmentColorKind(entry.serverConfig),
    })),
  );
}
