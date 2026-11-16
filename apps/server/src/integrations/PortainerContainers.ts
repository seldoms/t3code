// @effect-diagnostics nodeBuiltinImport:off -- 配置读取与 Portainer HTTP 请求；包成 Effect 服务只会让这几百行变复杂，收益为零。
// @effect-diagnostics globalDate:off globalJsonInEffect:off -- 与文件内既定的 async 风格一致：快取时间戳和 JSON 解析不为此引入 Clock/Schema。
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeHttps from "node:https";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import * as Effect from "effect/Effect";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

interface PortainerResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly buffer: ArrayBuffer;
  readonly text: string;
}

/**
 * Portainer 请求走 node:https/http：skipTlsVerify 只决定这一个请求的证书校验，
 * 不改全局 NODE_TLS_REJECT_UNAUTHORIZED，也不影响其他集成（审计 A07）。
 */
function portainerRequest(
  config: PortainerConfig,
  apiKey: string,
  path: string,
  method: "GET" | "POST" | "DELETE",
  timeoutMs: number,
): Promise<PortainerResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${config.url}${path}`);
    const tls = url.protocol === "https:";
    const request = (tls ? NodeHttps : NodeHttp).request(
      url,
      {
        method,
        headers: { "X-API-Key": apiKey },
        ...(tls ? { rejectUnauthorized: !config.skipTlsVerify } : {}),
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          const status = response.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            buffer: body.buffer.slice(
              body.byteOffset,
              body.byteOffset + body.byteLength,
            ) as ArrayBuffer,
            text: body.toString("utf8"),
          });
        });
      },
    );
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`timeout-${timeoutMs}ms`)));
    request.on("error", reject);
    request.end();
  });
}

// ~/.t3/integrations.json stores only key lookup locations, not secrets.
// Omitting endpointId enumerates every Docker endpoint; skipTlsVerify is request-local.
export interface PortainerConfig {
  readonly url: string;
  readonly endpointId: number | null;
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
  // endpointId 省略：多主机模式，运行时枚举全部 endpoint。
  const endpointId =
    raw.endpointId === undefined || raw.endpointId === null
      ? null
      : typeof raw.endpointId === "number"
        ? raw.endpointId
        : Number(raw.endpointId);
  if (endpointId !== null && (!Number.isSafeInteger(endpointId) || endpointId <= 0)) return null;
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

/** 一台 Docker 主机（Portainer endpoint）上的容器集合。 */
export interface HostContainers {
  readonly endpointId: number;
  readonly name: string;
  readonly online: boolean;
  readonly error?: string;
  readonly containers: ReadonlyArray<ContainerSummary>;
}

export interface ImageSummary {
  readonly id: string;
  readonly tags: ReadonlyArray<string>;
  readonly sizeBytes: number;
  readonly created: number;
  readonly containers: number;
}

export interface ContainersResult {
  readonly configured: boolean;
  readonly error?: string;
  readonly url?: string;
  readonly hosts: ReadonlyArray<HostContainers>;
}

export interface ImagesResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly images: ReadonlyArray<ImageSummary>;
}

/**
 * 读 Portainer 的容器列表（只读），按主机（endpoint）分组返回。
 *
 * 配置了 endpointId 就只读那一台；否则 GET /api/endpoints 枚举全部可达主机，
 * 每台用 `GET /api/endpoints/{id}/docker/containers/json?all=1` 拉容器，
 * 头部 `X-API-Key`。单台失败不影响其他主机，error 写进那一台的结果。
 */
export const listContainers = Effect.fn("integrations.portainer.containers")(function* () {
  const config = readIntegrations().portainer;
  if (!config) {
    return { configured: false, hosts: [] } satisfies ContainersResult;
  }

  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) {
    return {
      configured: true,
      url: config.url,
      error: `no-api-key (${config.apiKeyKeychain ?? config.apiKeyEnv})`,
      hosts: [],
    } satisfies ContainersResult;
  }

  return yield* Effect.promise<ContainersResult>(async () => {
    try {
      const endpoints = await resolveEndpoints(config, apiKey);
      if (endpoints.length === 0) {
        return {
          configured: true,
          url: config.url,
          error: "no-endpoints",
          hosts: [],
        };
      }
      const hosts = await Promise.all(
        endpoints.map(async (endpoint) => {
          const base = { endpointId: endpoint.id, name: endpoint.name };
          try {
            const response = await portainerRequest(
              config,
              apiKey,
              `/api/endpoints/${endpoint.id}/docker/containers/json?all=1`,
              "GET",
              6000,
            );
            if (!response.ok) {
              return { ...base, online: false, error: `http-${response.status}`, containers: [] };
            }
            const body = JSON.parse(response.text) as ReadonlyArray<Record<string, unknown>>;
            return {
              ...base,
              online: true,
              containers: body.map(parseContainerEntry),
            };
          } catch (cause) {
            return {
              ...base,
              online: false,
              error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
              containers: [],
            };
          }
        }),
      );
      return { configured: true, url: config.url, hosts };
    } catch (cause) {
      return {
        configured: true,
        url: config.url,
        error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
        hosts: [],
      };
    }
  });
});

interface EndpointRef {
  readonly id: number;
  readonly name: string;
}

/** 配置了 endpointId 就只用那一台；否则枚举全部 endpoint（在线的）。 */
async function resolveEndpoints(
  config: PortainerConfig,
  apiKey: string,
): Promise<ReadonlyArray<EndpointRef>> {
  if (config.endpointId !== null) {
    return [{ id: config.endpointId, name: `endpoint ${config.endpointId}` }];
  }
  const response = await portainerRequest(config, apiKey, "/api/endpoints", "GET", 6000);
  if (!response.ok) throw new Error(`endpoints-http-${response.status}`);
  const body = JSON.parse(response.text) as ReadonlyArray<Record<string, unknown>>;
  return body
    .filter((entry) => [1, 2, 4].includes(Number(entry.Type)))
    .map((entry) => ({
      id: Number(entry.Id),
      name: String(entry.Name ?? `endpoint ${entry.Id}`),
    }))
    .filter((entry) => Number.isSafeInteger(entry.id) && entry.id > 0);
}

function parseContainerEntry(entry: Record<string, unknown>): ContainerSummary {
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
}

function endpointAllowed(config: PortainerConfig, endpointId: number): boolean {
  return (
    Number.isSafeInteger(endpointId) &&
    endpointId > 0 &&
    (config.endpointId === null || config.endpointId === endpointId)
  );
}

export type ContainerAction = "start" | "stop" | "restart" | "remove";

export interface ContainerActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * 容器写操作（启动/停止/重启/删除），走 Portainer 的 Docker 代理。
 * 只接受固定动作和十六进制容器 id，其余一律拒绝；删除仅允许已停止的容器。
 * 前端负责二次确认；这里不做业务判断，Docker 说不行就如实报错。
 */
export const containerAction = Effect.fn("integrations.portainer.action")(function* (
  endpointId: number,
  id: string,
  action: ContainerAction,
) {
  const config = readIntegrations().portainer;
  if (!config) return { ok: false, error: "not-configured" } satisfies ContainerActionResult;
  if (!/^[a-f0-9]{12,64}$/i.test(id)) {
    return { ok: false, error: "bad-id" } satisfies ContainerActionResult;
  }
  if (!endpointAllowed(config, endpointId)) {
    return { ok: false, error: "bad-endpoint" } satisfies ContainerActionResult;
  }
  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) return { ok: false, error: "no-api-key" } satisfies ContainerActionResult;

  // 删除只允许已停止的容器，先查一次状态，避免删正在跑的。
  if (action === "remove") {
    const state = yield* Effect.promise(() => containerState(endpointId, id, config, apiKey));
    if (state !== "exited" && state !== "created" && state !== "dead") {
      return { ok: false, error: state === null ? "state-unknown" : "container-running" };
    }
  }

  return yield* Effect.promise<ContainerActionResult>(async () => {
    try {
      // 删除不清理卷（不带 v=1）：生产 Portainer 上删卷不可逆，容器卷留给用户手动处理。
      const path =
        action === "remove"
          ? `/api/endpoints/${endpointId}/docker/containers/${id}`
          : `/api/endpoints/${endpointId}/docker/containers/${id}/${action}`;
      const response = await portainerRequest(
        config,
        apiKey,
        path,
        action === "remove" ? "DELETE" : "POST",
        15000,
      );
      // Docker 成功返回 204；304 表示已经是目标状态（如停止已停止的容器）。
      if (response.ok || response.status === 304) return { ok: true };
      return { ok: false, error: `http-${response.status} ${response.text.slice(0, 120)}`.trim() };
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
      };
    }
  });
});

/** 查单容器状态：删除前的安全检查用。读不到返回 null。 */
async function containerState(
  endpointId: number,
  id: string,
  config: PortainerConfig,
  apiKey: string,
): Promise<string | null> {
  try {
    const response = await portainerRequest(
      config,
      apiKey,
      `/api/endpoints/${endpointId}/docker/containers/${id}/json`,
      "GET",
      6000,
    );
    if (!response.ok) return null;
    const body = JSON.parse(response.text) as Record<string, unknown>;
    const state = body.State;
    if (typeof state !== "object" || state === null || !("Status" in state)) return null;
    return typeof state.Status === "string" ? state.Status : null;
  } catch {
    return null;
  }
}

/**
 * 读一台主机的镜像列表（只读）。给页面按主机展示，含大小和被引用容器数。
 */
export const listImages = Effect.fn("integrations.portainer.images")(function* (
  endpointId: number,
) {
  const config = readIntegrations().portainer;
  if (!config) return { ok: false, error: "not-configured", images: [] } satisfies ImagesResult;
  if (!endpointAllowed(config, endpointId)) {
    return { ok: false, error: "bad-endpoint", images: [] } satisfies ImagesResult;
  }
  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) {
    return { ok: false, error: "no-api-key", images: [] } satisfies ImagesResult;
  }

  return yield* Effect.promise<ImagesResult>(async () => {
    try {
      const response = await portainerRequest(
        config,
        apiKey,
        `/api/endpoints/${endpointId}/docker/images/json?shared-size=1`,
        "GET",
        8000,
      );
      if (!response.ok) {
        return { ok: false, error: `http-${response.status}`, images: [] } satisfies ImagesResult;
      }
      const body = JSON.parse(response.text) as ReadonlyArray<Record<string, unknown>>;
      const images: ReadonlyArray<ImageSummary> = body.map((entry) => {
        const tags = Array.isArray(entry.RepoTags) ? (entry.RepoTags as ReadonlyArray<string>) : [];
        return {
          id: String(entry.Id ?? "").replace(/^sha256:/, ""),
          tags: tags.filter((tag) => tag && tag !== "<none>:<none>").slice(0, 4),
          sizeBytes: Number(entry.Size ?? 0),
          created: Number(entry.Created ?? 0),
          containers: Number(entry.Containers ?? 0),
        };
      });
      return { ok: true, images } satisfies ImagesResult;
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
        images: [],
      } satisfies ImagesResult;
    }
  });
});

export interface ImageActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * 删除镜像。只接受十六进制镜像 id；被容器引用时 Docker 返回 409，如实透传。
 * 前端负责二次确认。
 */
export const imageAction = Effect.fn("integrations.portainer.imageAction")(function* (
  endpointId: number,
  id: string,
  action: "remove",
) {
  const config = readIntegrations().portainer;
  if (!config) return { ok: false, error: "not-configured" } satisfies ImageActionResult;
  if (!/^[a-f0-9]{64}$/i.test(id) || action !== "remove") {
    return { ok: false, error: "bad-id" } satisfies ImageActionResult;
  }
  if (!endpointAllowed(config, endpointId)) {
    return { ok: false, error: "bad-endpoint" } satisfies ImageActionResult;
  }
  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) return { ok: false, error: "no-api-key" } satisfies ImageActionResult;

  return yield* Effect.promise<ImageActionResult>(async () => {
    try {
      const response = await portainerRequest(
        config,
        apiKey,
        `/api/endpoints/${endpointId}/docker/images/${id}?force=0`,
        "DELETE",
        15000,
      );
      if (response.ok) return { ok: true };
      return { ok: false, error: `http-${response.status} ${response.text.slice(0, 120)}`.trim() };
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
  endpointId: number,
  id: string,
  tail: number,
) {
  const config = readIntegrations().portainer;
  if (!config) return { ok: false, error: "not-configured" } satisfies ContainerLogsResult;
  if (!/^[a-f0-9]{12,64}$/i.test(id)) {
    return { ok: false, error: "bad-id" } satisfies ContainerLogsResult;
  }
  if (!endpointAllowed(config, endpointId)) {
    return { ok: false, error: "bad-endpoint" } satisfies ContainerLogsResult;
  }
  const apiKey = yield* Effect.promise(() => resolveApiKey(config));
  if (!apiKey) return { ok: false, error: "no-api-key" } satisfies ContainerLogsResult;
  const lines = Math.min(2000, Math.max(10, Math.floor(tail)));

  return yield* Effect.promise<ContainerLogsResult>(async () => {
    try {
      const response = await portainerRequest(
        config,
        apiKey,
        `/api/endpoints/${endpointId}/docker/containers/${id}/logs?stdout=1&stderr=1&tail=${lines}`,
        "GET",
        10000,
      );
      if (!response.ok) return { ok: false, error: `http-${response.status}` };
      return { ok: true, logs: demuxDockerStream(response.buffer) };
    } catch (cause) {
      return {
        ok: false,
        error: cause instanceof Error ? cause.message.slice(0, 120) : "fetch-failed",
      };
    }
  });
});
