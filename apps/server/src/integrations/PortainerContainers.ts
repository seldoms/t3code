// @effect-diagnostics nodeBuiltinImport:off globalFetchInEffect:off -- 配置文件读取与一次 Portainer 只读请求；包成 Effect 服务只会让这 150 行变复杂，收益为零。
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import * as Effect from "effect/Effect";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

/**
 * 本机集成配置：`~/.t3/integrations.json`，不进 git。密钥只写「去哪里取」：
 * apiKeyEnv（环境变量名，默认 PORTAINER_TOKEN）或 apiKeyKeychain（钥匙串服务名）。
 * portainer: { url, endpointId, apiKeyEnv?, apiKeyKeychain?, skipTlsVerify? }。
 */
export interface PortainerConfig {
  readonly url: string;
  readonly endpointId: number;
  readonly apiKeyEnv: string;
  readonly apiKeyKeychain?: string;
  readonly skipTlsVerify: boolean;
}

export interface IntegrationsConfig {
  readonly portainer: PortainerConfig | null;
}

const CONFIG_PATH = NodePath.join(NodeOS.homedir(), ".t3", "integrations.json");

function readRaw(): Record<string, unknown> | null {
  try {
    return JSON.parse(NodeFS.readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parsePortainer(value: unknown): PortainerConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const url = typeof raw.url === "string" ? raw.url.trim().replace(/\/+$/, "") : "";
  if (!/^https?:\/\//.test(url)) return null;
  const endpointId = typeof raw.endpointId === "number" ? raw.endpointId : Number(raw.endpointId);
  if (!Number.isFinite(endpointId)) return null;
  return {
    url,
    endpointId,
    apiKeyEnv:
      typeof raw.apiKeyEnv === "string" && raw.apiKeyEnv ? raw.apiKeyEnv : "PORTAINER_TOKEN",
    ...(typeof raw.apiKeyKeychain === "string" && raw.apiKeyKeychain
      ? { apiKeyKeychain: raw.apiKeyKeychain }
      : {}),
    skipTlsVerify: raw.skipTlsVerify === true,
  };
}

function readIntegrations(): IntegrationsConfig {
  const raw = readRaw();
  return { portainer: raw ? parsePortainer(raw.portainer) : null };
}

/** 密钥只在这里取：钥匙串优先，其次环境变量；缓存 60 秒，不每次请求都跑 security。 */
let keyCache: { readonly at: number; readonly value: string | null } | null = null;

async function resolveApiKey(config: PortainerConfig): Promise<string | null> {
  if (keyCache && Date.now() - keyCache.at < 60_000) return keyCache.value;
  let value: string | null = null;
  if (config.apiKeyKeychain) {
    try {
      const { stdout } = await execFileAsync(
        "security",
        ["find-generic-password", "-s", config.apiKeyKeychain, "-w"],
        { encoding: "utf8", timeout: 3000 },
      );
      value = stdout.trim() || null;
    } catch {
      // 钥匙串没有就继续尝试环境变量。
    }
  }
  if (!value) {
    const fromEnv = process.env[config.apiKeyEnv];
    value = fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
  }
  keyCache = { at: Date.now(), value };
  return value;
}

export interface ContainerSummary {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly state: string;
  readonly status: string;
  readonly ports: string;
  readonly created: number;
  readonly stack: string | null;
}

export interface ContainersResult {
  readonly configured: boolean;
  readonly error?: string;
  readonly url?: string;
  readonly endpointId?: number;
  readonly containers: ReadonlyArray<ContainerSummary>;
}

/**
 * 读 Portainer 的容器列表（只读）。
 *
 * 用 Portainer 的 Docker 代理接口：`GET /api/endpoints/{id}/docker/containers/json?all=1`，
 * 头部 `X-API-Key`。读不到就返回 error，前端显示原因，不静默失败。
 */
export const listContainers = Effect.fn("integrations.portainer.containers")(function* () {
  const config = readIntegrations().portainer;
  if (!config) {
    return { configured: false, containers: [] } satisfies ContainersResult;
  }

  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) {
    return {
      configured: true,
      url: config.url,
      endpointId: config.endpointId,
      error: `no-api-key (${config.apiKeyKeychain ?? config.apiKeyEnv})`,
      containers: [],
    } satisfies ContainersResult;
  }

  // 用 Effect.promise + 内部 try/catch：这个函数永远返回结果对象，不抛错，
  // 免得把 error channel 传给调用方（也免得 Effect 报 unknown 需求）。
  return yield* Effect.promise<ContainersResult>(async () => {
    try {
      const response = await fetch(
        `${config.url}/api/endpoints/${config.endpointId}/docker/containers/json?all=1`,
        { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(6000) },
      );
      if (!response.ok) {
        return {
          configured: true,
          url: config.url,
          endpointId: config.endpointId,
          error: `http-${response.status}`,
          containers: [],
        };
      }
      const body = (await response.json()) as ReadonlyArray<Record<string, unknown>>;
      return {
        configured: true,
        url: config.url,
        endpointId: config.endpointId,
        containers: body.map((entry) => {
          const names = Array.isArray(entry.Names) ? (entry.Names as ReadonlyArray<string>) : [];
          const labels = (entry.Labels ?? {}) as Record<string, string>;
          const ports = Array.isArray(entry.Ports)
            ? (entry.Ports as ReadonlyArray<{ PublicPort?: number; PrivatePort?: number }>)
            : [];
          return {
            id: String(entry.Id ?? ""),
            name: (names[0] ?? "").replace(/^\//, ""),
            image: String(entry.Image ?? ""),
            state: String(entry.State ?? ""),
            status: String(entry.Status ?? ""),
            ports:
              ports.length > 0
                ? ports
                    .map((port) =>
                      port.PublicPort
                        ? `${port.PublicPort}→${port.PrivatePort}`
                        : String(port.PrivatePort ?? ""),
                    )
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(", ")
                : "·",
            created: Number(entry.Created ?? 0),
            stack: labels["com.docker.compose.project"] ?? null,
          };
        }),
      };
    } catch (cause) {
      return {
        configured: true,
        url: config.url,
        endpointId: config.endpointId,
        error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
        containers: [],
      };
    }
  });
});

export type ContainerAction = "start" | "stop" | "restart";

export interface ContainerActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * 容器写操作（启动/停止/重启），走 Portainer 的 Docker 代理。
 * 只接受三个固定动作和十六进制容器 id，其余一律拒绝。
 * 前端负责二次确认；这里不做业务判断，Docker 说不行就如实报错。
 */
export const containerAction = Effect.fn("integrations.portainer.action")(function* (
  id: string,
  action: ContainerAction,
) {
  const config = readIntegrations().portainer;
  if (!config) return { ok: false, error: "not-configured" } satisfies ContainerActionResult;
  if (!/^[a-f0-9]{12,64}$/i.test(id)) {
    return { ok: false, error: "bad-id" } satisfies ContainerActionResult;
  }
  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) return { ok: false, error: "no-api-key" } satisfies ContainerActionResult;

  return yield* Effect.promise<ContainerActionResult>(async () => {
    try {
      const response = await fetch(
        `${config.url}/api/endpoints/${config.endpointId}/docker/containers/${id}/${action}`,
        { method: "POST", headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(15000) },
      );
      // Docker 成功返回 204；304 表示已经是目标状态（如停止已停止的容器）。
      if (response.ok || response.status === 304) return { ok: true };
      const text = await response.text().catch(() => "");
      return { ok: false, error: `http-${response.status} ${text.slice(0, 120)}`.trim() };
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
      };
    }
  });
});

export interface ContainerLogsResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly logs?: string;
}

/** Docker 非 TTY 日志是多路复用流：8 字节头（类型 + 4 字节大端长度）+ 载荷。 */
function demuxDockerStream(buffer: ArrayBuffer): string {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  let offset = 0;
  let out = "";
  while (offset + 8 <= bytes.length) {
    const streamType = bytes[offset];
    if (streamType !== 1 && streamType !== 2) {
      // 头不合法：可能是 TTY 纯文本流，整体当文本解。
      return decoder.decode(buffer);
    }
    const size = view.getUint32(offset + 4);
    if (offset + 8 + size > bytes.length) return decoder.decode(buffer);
    out += decoder.decode(bytes.subarray(offset + 8, offset + 8 + size));
    offset += 8 + size;
  }
  return out || decoder.decode(buffer);
}

/** 读容器最近 tail 行日志（只读）。 */
export const containerLogs = Effect.fn("integrations.portainer.logs")(function* (
  id: string,
  tail: number,
) {
  const config = readIntegrations().portainer;
  if (!config) return { ok: false, error: "not-configured" } satisfies ContainerLogsResult;
  if (!/^[a-f0-9]{12,64}$/i.test(id)) {
    return { ok: false, error: "bad-id" } satisfies ContainerLogsResult;
  }
  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) return { ok: false, error: "no-api-key" } satisfies ContainerLogsResult;
  const lines = Math.min(2000, Math.max(10, Math.floor(tail)));

  return yield* Effect.promise<ContainerLogsResult>(async () => {
    try {
      const response = await fetch(
        `${config.url}/api/endpoints/${config.endpointId}/docker/containers/${id}/logs?stdout=1&stderr=1&tail=${lines}`,
        { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(10000) },
      );
      if (!response.ok) return { ok: false, error: `http-${response.status}` };
      return { ok: true, logs: demuxDockerStream(await response.arrayBuffer()) };
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
      };
    }
  });
});
