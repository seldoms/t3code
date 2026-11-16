import type { EnvironmentId } from "@t3tools/contracts";

interface EnvironmentIdentity {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly serverConfig: {
    readonly hostname?: string;
    readonly environment: { readonly label: string };
  } | null;
}

const hostKey = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\.(local|lan)$/, "");

/** Ambiguous names must never route a filesystem path to an arbitrary machine. */
export function resolveSnapshotEnvironment(
  environments: ReadonlyArray<EnvironmentIdentity>,
  source: { readonly machine: string; readonly label: string },
): EnvironmentId | null {
  const names = new Set([hostKey(source.machine), hostKey(source.label)].filter(Boolean));
  const matches = environments.filter((environment) =>
    [
      environment.label,
      environment.serverConfig?.hostname,
      environment.serverConfig?.environment.label,
    ].some((name) => name !== undefined && names.has(hostKey(name))),
  );
  return matches.length === 1 ? matches[0]!.environmentId : null;
}

export function projectThreadTargetError(input: {
  readonly environmentId: EnvironmentId | null;
  readonly connected: boolean;
  readonly canOperate: boolean;
  readonly path: string;
}): string | null {
  if (input.environmentId === null)
    return "未找到唯一对应的 T3 环境，请先在设置 → 环境中连接这台机器。";
  if (!input.connected) return "目标环境未连接，请先在设置 → 环境中连接后重试。";
  if (!input.canOperate) return "当前连接没有在目标环境创建项目或发起对话的权限。";
  if (!input.path.startsWith("/") && !/^[a-z]:[\\/]/i.test(input.path))
    return "项目路径必须是目标机器上的绝对路径。";
  return null;
}
