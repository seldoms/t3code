import { useRef, useState } from "react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { inferProjectTitleFromPath } from "@t3tools/client-runtime/state/projects";
import { AuthOrchestrationOperateScope, type EnvironmentId } from "@t3tools/contracts";

import { newProjectId } from "../lib/utils";
import { readProjects } from "../state/entities";
import { readEnvironment } from "../state/environments";
import { readEnvironmentScope } from "../state/session";
import { projectEnvironment } from "../state/projects";
import { useAtomCommand } from "../state/use-atom-command";
import { projectThreadTargetError } from "../components/board/projectThreadTarget";
import { useNewThreadHandler } from "./useHandleNewThread";

/** Opens a draft on the exact target; scanned folders are registered there first. */
export function useStartProjectThread() {
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const newThread = useNewThreadHandler();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async (environmentId: EnvironmentId | null, path: string) => {
    if (inFlight.current) return false;
    const check = () =>
      projectThreadTargetError({
        environmentId,
        connected:
          environmentId !== null &&
          readEnvironment(environmentId)?.connection.phase === "connected",
        canOperate:
          environmentId !== null &&
          readEnvironmentScope(environmentId, AuthOrchestrationOperateScope),
        path,
      });
    const denial = check();
    if (denial !== null || environmentId === null) {
      setError(denial);
      return false;
    }
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const normalized = path.replace(/[\\/]+$/, "") || path;
      const existing = readProjects().find(
        (project) =>
          project.environmentId === environmentId &&
          (project.workspaceRoot.replace(/[\\/]+$/, "") || project.workspaceRoot) === normalized,
      );
      const projectId = existing?.id ?? newProjectId();
      if (!existing) {
        const result = await createProject({
          environmentId,
          input: {
            projectId,
            title: inferProjectTitleFromPath(path),
            workspaceRoot: path,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: null,
          },
        });
        if (result._tag === "Failure")
          throw new Error("无法在目标环境登记项目：检查目录是否存在、连接和操作权限是否正常。");
      }
      const revoked = check();
      if (revoked) throw new Error(revoked);
      const opened = await newThread(scopeProjectRef(environmentId, projectId));
      if (!opened) throw new Error("未打开新对话，请重试。目标环境未被切换。");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "发起对话失败，请重试。");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return { start, busy, error };
}
