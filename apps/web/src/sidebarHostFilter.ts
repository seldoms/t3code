import type { EnvironmentId } from "@t3tools/contracts";
import { create } from "zustand";

export interface SidebarHostFilter {
  readonly key: string;
  readonly environmentId: EnvironmentId | null;
  readonly name: string;
}

export const useSidebarHostFilter = create<{
  selected: SidebarHostFilter | null;
  select: (host: SidebarHostFilter | null) => void;
}>((set) => ({
  selected: null,
  select: (host) =>
    set((state) => ({ selected: host !== null && state.selected?.key === host.key ? null : host })),
}));

export function matchesSidebarHost(
  environmentId: EnvironmentId,
  host: SidebarHostFilter | null,
): boolean {
  return host === null || host.environmentId === environmentId;
}
