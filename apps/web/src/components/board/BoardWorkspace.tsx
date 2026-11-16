import type { ReactNode } from "react";

/** Fill the flex app shell; content-based width leaves unused space beside the board. */
export function BoardWorkspace({ children }: { children: ReactNode }) {
  return (
    <div
      data-testid="board-workspace"
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {children}
    </div>
  );
}
