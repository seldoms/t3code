import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  ProviderDriverKind,
  type AgentSessionListEntry,
  type AgentSessionSource,
  type EnvironmentId,
  type ProjectId,
} from "@t3tools/contracts";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import { CheckIcon } from "lucide-react";
import { memo, useState } from "react";

import { cn } from "~/lib/utils";
import { useNowMinute } from "../../hooks/useNowMinute";
import { agentSessionImport, agentSessionList } from "../../state/agentSessions";
import { useEnvironmentScope } from "../../state/session";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { toastManager } from "../ui/toast";
import type { SidebarProviderEntry } from "./SidebarThreadRow";

const SOURCE_LABELS: Record<AgentSessionSource, string> = {
  claudeAgent: "Claude",
  codex: "Codex",
  pi: "Pi",
  opencode: "OpenCode",
  cursor: "Cursor",
  qwenCode: "Qwen Code",
};

function sessionKey(session: AgentSessionListEntry): string {
  return `${session.providerInstanceId}\u0000${session.providerSessionId}`;
}

function sessionTitle(session: AgentSessionListEntry): string {
  const title = session.title?.trim();
  if (title) return title;
  const fileName = session.filePath?.split(/[\\/]/u).at(-1)?.trim();
  return fileName || session.providerSessionId;
}

function relativeSessionTime(lastActiveAtMs: number, nowMinute: string): string {
  return formatRelativeTimeLabel(
    new Date(lastActiveAtMs).toISOString(),
    Date.parse(`${nowMinute}:00.000Z`),
  );
}

function SessionRow(props: {
  session: AgentSessionListEntry;
  imported: boolean;
  disabled: boolean;
  pending: boolean;
  providerEntry: SidebarProviderEntry | undefined;
  navigationParent: string;
  onActivate: (session: AgentSessionListEntry) => void;
}) {
  const { session } = props;
  const nowMinute = useNowMinute();
  const entry = props.providerEntry;
  const title = sessionTitle(session);
  const unavailableLabel =
    props.disabled && !session.importable
      ? "仅历史"
      : props.disabled
        ? "先接管目录"
        : props.pending
          ? "导入中"
          : null;
  return (
    <li className="list-none">
      <button
        type="button"
        data-sidebar-row={`cli-session:${sessionKey(session)}`}
        data-sidebar-parent={props.navigationParent}
        data-testid="sidebar-project-session-row"
        disabled={props.disabled}
        aria-label={`${SOURCE_LABELS[session.source]}: ${title}`}
        onClick={() => props.onActivate(session)}
        className={cn(
          "group/cli-session flex h-7 w-full min-w-0 items-center gap-1.5 rounded-(--control-radius) px-(--sidebar-row-content-inset) text-left text-xs outline-none",
          props.disabled
            ? "cursor-not-allowed text-sidebar-muted-foreground/70"
            : "cursor-pointer text-sidebar-foreground/80 hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
          props.pending && "opacity-60",
        )}
      >
        <ProviderInstanceIcon
          driverKind={entry?.driverKind ?? ProviderDriverKind.make(session.source)}
          displayName={entry?.displayName ?? SOURCE_LABELS[session.source]}
          accentColor={entry?.accentColor}
          acpRegistryAgentId={entry?.acpRegistryAgentId}
          acpRegistryIconUrl={entry?.acpRegistryIconUrl}
          size="compact"
          iconClassName="size-3.5"
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {unavailableLabel === null ? null : (
          <span className="shrink-0 rounded border border-sidebar-border px-1 text-4xs text-sidebar-muted-foreground">
            {unavailableLabel}
          </span>
        )}
        {props.imported ? (
          <CheckIcon aria-label="已导入" className="size-3 shrink-0 text-success" />
        ) : null}
        <span className="shrink-0 text-3xs tabular-nums text-sidebar-muted-foreground">
          {relativeSessionTime(session.lastActiveAtMs, nowMinute)}
        </span>
      </button>
    </li>
  );
}

/**
 * The CLI sessions a project already contains, as one time line under its thread rows.
 * Importing is all-or-nothing per project, so every row imports and then opens its own
 * deterministic thread id; sources without a driver stay read-only here.
 */
export const SidebarProjectSessions = memo(function SidebarProjectSessions(props: {
  environmentId: EnvironmentId;
  projectId: ProjectId | null;
  workspaceRoot: string;
  providerEntryByInstanceId: ReadonlyMap<string, SidebarProviderEntry>;
  navigationParent: string;
  onOpenSession: (input: {
    environmentId: EnvironmentId;
    providerInstanceId: AgentSessionListEntry["providerInstanceId"];
    providerSessionId: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [locallyImported, setLocallyImported] = useState<ReadonlySet<string>>(() => new Set());
  const canOperate = useEnvironmentScope(props.environmentId, AuthOrchestrationOperateScope);
  const importSessions = useOrchestrationCommand(agentSessionImport, { reportFailure: false });
  const listAtom = agentSessionList({
    environmentId: props.environmentId,
    input: { workspaceRoot: props.workspaceRoot },
  });
  const list = useAtomValue(listAtom);
  const sessions = AsyncResult.isSuccess(list)
    ? [...list.value.sessions].sort((left, right) => right.lastActiveAtMs - left.lastActiveAtMs)
    : [];
  if (sessions.length === 0) return null;

  const sectionRowId = `cli-sessions:${props.projectId ?? props.workspaceRoot}`;
  const canImport = props.projectId !== null && canOperate;

  const openSession = (session: AgentSessionListEntry) => {
    props.onOpenSession({
      environmentId: props.environmentId,
      providerInstanceId: session.providerInstanceId,
      providerSessionId: session.providerSessionId,
    });
  };
  const activate = (session: AgentSessionListEntry) => {
    if (!session.importable) return;
    const key = sessionKey(session);
    if (session.imported || locallyImported.has(key)) {
      openSession(session);
      return;
    }
    const projectId = props.projectId;
    if (projectId === null || !canOperate || pendingKey !== null) return;
    setPendingKey(key);
    void (async () => {
      const result = await importSessions({
        environmentId: props.environmentId,
        input: { projectId, expectedWorkspaceRoot: props.workspaceRoot },
      });
      setPendingKey(null);
      if (result._tag === "Success") {
        setLocallyImported((current) => new Set(current).add(key));
        openSession(session);
        return;
      }
      if (isAtomCommandInterrupted(result)) return;
      toastManager.add({
        type: "error",
        title: "导入 CLI 会话失败",
        description: "历史会话没有导入，请稍后重试。",
      });
    })();
  };

  return (
    <li data-testid="sidebar-project-sessions" className="mt-1 list-none">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger
          render={
            <CollapsibleSectionHeader
              expanded={open}
              data-sidebar-row={sectionRowId}
              data-sidebar-parent={props.navigationParent}
              data-testid="sidebar-project-sessions-toggle"
            />
          }
        >
          CLI 会话 ({sessions.length})
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <ul aria-label="CLI 历史会话">
            {props.projectId === null ? (
              <li className="list-none px-2 py-1 text-3xs text-sidebar-muted-foreground">
                先接管该目录，才能导入这些会话。
              </li>
            ) : null}
            {sessions.map((session) => {
              const imported = session.imported || locallyImported.has(sessionKey(session));
              return (
                <SessionRow
                  key={sessionKey(session)}
                  session={session}
                  imported={imported}
                  disabled={
                    !session.importable || (!imported && (!canImport || pendingKey !== null))
                  }
                  pending={pendingKey === sessionKey(session)}
                  providerEntry={props.providerEntryByInstanceId.get(session.providerInstanceId)}
                  navigationParent={sectionRowId}
                  onActivate={activate}
                />
              );
            })}
          </ul>
        </CollapsiblePanel>
      </Collapsible>
    </li>
  );
});
