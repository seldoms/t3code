import { useAtomValue } from "@effect/atom-react";
import {
  resolveEnvironmentColorKind,
  type EnvironmentColorKind,
  type EnvironmentId,
} from "@t3tools/contracts";

import { clientHostEnvironmentAtom, isClientHostEnvironment } from "./state/clientHostEnvironment";
import { useEnvironments } from "./state/environments";
import { hostEnvironmentIdAtom } from "./state/primaryEnvironment";

export const ENVIRONMENT_COLOR_DOT_CLASS: Record<EnvironmentColorKind, string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  orange: "bg-orange-500",
  purple: "bg-purple-500",
  cyan: "bg-cyan-500",
  pink: "bg-pink-500",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

export const ENVIRONMENT_COLOR_LABELS: Record<EnvironmentColorKind, string> = {
  green: "绿色",
  blue: "蓝色",
  orange: "橙色",
  purple: "紫色",
  cyan: "青色",
  pink: "粉色",
  yellow: "黄色",
  red: "红色",
};

const REMOTE_COLORS = ["blue", "orange", "purple", "cyan", "pink", "yellow", "red"] as const;
export type MachineColor = EnvironmentColorKind | "gray";

/** Green stays local; stale conflicting settings never produce duplicate machine colors. */
export function allocateEnvironmentColors(
  entries: ReadonlyArray<{ id: EnvironmentId; local: boolean; color: EnvironmentColorKind | null }>,
): ReadonlyMap<EnvironmentId, MachineColor> {
  const result = new Map<EnvironmentId, MachineColor>();
  const used = new Set<EnvironmentColorKind>(["green"]);
  const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
  for (const entry of sorted) {
    if (entry.local) result.set(entry.id, "green");
    else if (entry.color && !used.has(entry.color)) {
      result.set(entry.id, entry.color);
      used.add(entry.color);
    }
  }
  for (const entry of sorted) {
    if (result.has(entry.id)) continue;
    const color = REMOTE_COLORS.find((candidate) => !used.has(candidate));
    result.set(entry.id, color ?? "gray");
    if (color) used.add(color);
  }
  return result;
}

export function useEnvironmentColors() {
  const { environments } = useEnvironments();
  const hostId = useAtomValue(hostEnvironmentIdAtom);
  const hostFlags = environments.map((entry) => ({
    id: entry.environmentId,
    local: isClientHostEnvironment(
      entry.environmentId,
      hostId,
      entry.entry.target,
      window.desktopBridge !== undefined,
    ),
    color: resolveEnvironmentColorKind(entry.serverConfig),
  }));
  return allocateEnvironmentColors(hostFlags);
}

export function useIsLocalEnvironment(environmentId: EnvironmentId) {
  return useAtomValue(clientHostEnvironmentAtom(environmentId));
}
