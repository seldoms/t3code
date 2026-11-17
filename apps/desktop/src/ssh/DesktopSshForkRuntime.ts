import { CLI_RELEASE_BASE_URL_ENV } from "@t3tools/shared/cliRelease";
import type { RemoteT3RunnerOptions } from "@t3tools/ssh/tunnel";

/**
 * 打包态的远程 runtime 必须来自本 fork 的 release：上游 archive 没有 fork 新增的
 * RPC（agentSessions.list、扩展主机指标），远程项目会静默少功能。
 * 远程按版本号目录缓存并写 .install-complete，所以后缀必须随每次发布递增。
 */
export const FORK_RUNTIME_VERSION = "0.1.9-fork.1";
export const FORK_RELEASE_BASE_URL = "https://github.com/seldoms/t3code/releases/download";
export const REMOTE_RUNTIME_VERSION_ENV = "T3CODE_REMOTE_RUNTIME_VERSION";

export function forkArchiveRunner(env: NodeJS.ProcessEnv): RemoteT3RunnerOptions {
  return {
    archiveVersion: env[REMOTE_RUNTIME_VERSION_ENV]?.trim() || FORK_RUNTIME_VERSION,
    releaseBaseUrl: env[CLI_RELEASE_BASE_URL_ENV]?.trim() || FORK_RELEASE_BASE_URL,
  };
}
