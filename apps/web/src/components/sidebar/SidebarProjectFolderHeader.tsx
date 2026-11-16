import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { ArchiveIcon, ChevronDownIcon, PinIcon, PlusIcon } from "lucide-react";
import { useEnvironmentColors } from "../../environmentColors";
import { EnvironmentColorDot } from "../EnvironmentColorDot";
import { memo, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useUiStateStore } from "../../uiStateStore";
import { resolveSidebarFolderDot, resolveThreadLastVisitedAt } from "../Sidebar.logic";
import { ProjectFavicon } from "../ProjectFavicon";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const FOLDER_DOT_CLASS_NAME = {
  attention: "bg-warning",
  failed: "bg-error",
  unread: "bg-success",
  working: "bg-info",
} as const;

const FOLDER_DOT_LABEL = {
  attention: ", needs you",
  failed: ", failed",
  unread: ", done",
  working: ", working",
} as const;

/** The folder's sidebar tree row; its thread rows name it as their parent. */
export function sidebarFolderRowId(projectKey: string) {
  return `folder:${projectKey}`;
}

/**
 * A project folder in the boring sidebar. It reads like a shelf header: a trailing
 * count and chevron, with the count and a status dot only while it is closed, so a
 * closed folder still says when a hidden thread needs you.
 */
export const SidebarProjectFolderHeader = memo(function SidebarProjectFolderHeader(props: {
  group: SidebarProjectSnapshot;
  collapsed: boolean;
  hiddenThreads: readonly EnvironmentThreadShell[];
  children?: ReactNode;
  onToggle: (group: SidebarProjectSnapshot) => void;
  onNewThread: (group: SidebarProjectSnapshot) => void;
  onPin?: ((group: SidebarProjectSnapshot) => void) | undefined;
  onArchive?: ((group: SidebarProjectSnapshot) => void) | undefined;
  onContextMenu: (group: SidebarProjectSnapshot, position: { x: number; y: number }) => void;
}) {
  const { group, collapsed, hiddenThreads } = props;
  const colors = useEnvironmentColors();
  const rowId = sidebarFolderRowId(group.projectKey);
  const localLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const dot = collapsed
    ? resolveSidebarFolderDot(
        hiddenThreads.map((thread) => ({
          ...thread,
          lastVisitedAt: resolveThreadLastVisitedAt(
            thread.lastVisitedAt,
            localLastVisitedAtById[
              scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))
            ],
          ),
        })),
      )
    : null;
  return (
    <li
      data-testid="sidebar-project-folder"
      className="group/project-folder relative mt-2 select-none list-none first:mt-0"
    >
      <div className="flex min-w-0 items-center">
        <button
          type="button"
          data-sidebar-row={rowId}
          aria-expanded={!collapsed}
          onClick={() => props.onToggle(group)}
          onContextMenu={(event) => {
            event.preventDefault();
            props.onContextMenu(group, { x: event.clientX, y: event.clientY });
          }}
          className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-(--control-radius) px-(--sidebar-row-content-inset) text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-sidebar-muted-foreground",
              collapsed && "-rotate-90",
            )}
          />
          <ProjectFavicon project={group} className="size-4 shrink-0" />
          <EnvironmentColorDot color={colors.get(group.environmentId) ?? "gray"} />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-sidebar-foreground/90">
            {group.displayName}
          </span>
          {dot ? (
            <span className={cn("size-1.5 shrink-0 rounded-full", FOLDER_DOT_CLASS_NAME[dot])}>
              <span className="sr-only">{FOLDER_DOT_LABEL[dot]}</span>
            </span>
          ) : null}
          {collapsed && hiddenThreads.length > 0 ? (
            <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground group-hover/project-folder:invisible group-has-[[data-sidebar-action-for]:focus]/project-folder:invisible pointer-coarse:invisible">
              {hiddenThreads.length}
            </span>
          ) : null}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-sidebar-muted-foreground transition-transform",
              collapsed && "-rotate-90",
            )}
          />
        </button>
        <span className="flex shrink-0 items-center">
          {props.onPin ? (
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label={group.pinned ? "取消置顶项目" : "置顶项目"}
              onClick={() => props.onPin?.(group)}
            >
              <PinIcon className={group.pinned ? "fill-current" : undefined} />
            </Button>
          ) : null}
          {props.onArchive ? (
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="屏蔽项目"
              onClick={() => props.onArchive?.(group)}
            >
              <ArchiveIcon />
            </Button>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  data-sidebar-action-for={rowId}
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={`在 ${group.displayName} 新建对话`}
                  onClick={() => props.onNewThread(group)}
                />
              }
            >
              <PlusIcon aria-hidden />
            </TooltipTrigger>
            <TooltipPopup>在 {group.displayName} 新建对话</TooltipPopup>
          </Tooltip>
        </span>
      </div>
      {!collapsed && props.children ? (
        <ul
          aria-label={`${group.displayName} 的对话`}
          className="ml-3 border-l border-sidebar-border pl-2"
        >
          {props.children}
        </ul>
      ) : null}
    </li>
  );
});
