import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import * as Effect from "effect/Effect";
import { AuthOrchestrationOperateScope, AuthOrchestrationReadScope } from "@t3tools/contracts";

import { authenticateRawRouteWithScope } from "../http.ts";
import {
  containerAction,
  containerLogs,
  imageAction,
  listContainers,
  listImages,
  type ContainerAction,
} from "./PortainerContainers.ts";

const json = (body: unknown, status = 200) =>
  HttpServerResponse.text(JSON.stringify(body), {
    status,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
  });

/**
 * 容器列表（只读），按主机分组。配置来自 `~/.t3/integrations.json`
 * （见 PortainerContainers.ts 顶部注释），密钥只写"去哪里取"，不写进配置文件。
 */
export const layerIntegrationsRoute = HttpRouter.add(
  "GET",
  "/api/integrations/containers",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const result = yield* listContainers();
    return json(result);
  }),
);

const ACTIONS: ReadonlyArray<ContainerAction> = ["start", "stop", "restart", "remove"];

/**
 * 容器写操作（启动/停止/重启/删除）。服务只监听本机回环，前端负责二次确认；
 * 这里只校验动作和 id 形状，删除已停止的容器由服务端再查一次状态兜底，
 * Docker 的拒绝如实透传。
 */
export const layerContainerActionRoute = HttpRouter.add(
  "POST",
  "/api/integrations/containers/action",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* Effect.orElseSucceed(request.json, () => null)) as {
      endpointId?: unknown;
      id?: unknown;
      action?: unknown;
    } | null;
    const endpointId = Number(body?.endpointId);
    const id = typeof body?.id === "string" ? body.id : "";
    const action = ACTIONS.find((candidate) => candidate === body?.action);
    if (!id || !action || !Number.isFinite(endpointId)) {
      return json({ ok: false, error: "bad-request" }, 400);
    }
    const result = yield* containerAction(endpointId, id, action);
    return json(result, result.ok ? 200 : 502);
  }),
);

/** 容器日志（只读），tail 默认 200 行。 */
export const layerContainerLogsRoute = HttpRouter.add(
  "GET",
  "/api/integrations/containers/logs",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://localhost");
    const endpointId = Number(url.searchParams.get("endpointId"));
    const id = url.searchParams.get("id") ?? "";
    const tail = Number(url.searchParams.get("tail") ?? "200");
    if (!id || !Number.isFinite(endpointId)) return json({ ok: false, error: "bad-request" }, 400);
    const result = yield* containerLogs(endpointId, id, Number.isFinite(tail) ? tail : 200);
    return json(result, result.ok ? 200 : 502);
  }),
);

/** 一台主机的镜像列表（只读）。 */
export const layerImagesRoute = HttpRouter.add(
  "GET",
  "/api/integrations/images",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, "http://localhost");
    const endpointId = Number(url.searchParams.get("endpointId"));
    if (!Number.isFinite(endpointId)) return json({ ok: false, error: "bad-request" }, 400);
    const result = yield* listImages(endpointId);
    return json(result, result.ok ? 200 : 502);
  }),
);

/** 镜像删除。前端二次确认；被容器引用时 Docker 409 如实透传。 */
export const layerImageActionRoute = HttpRouter.add(
  "POST",
  "/api/integrations/images/action",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationOperateScope);
    const request = yield* HttpServerRequest.HttpServerRequest;
    const body = (yield* Effect.orElseSucceed(request.json, () => null)) as {
      endpointId?: unknown;
      id?: unknown;
      action?: unknown;
    } | null;
    const endpointId = Number(body?.endpointId);
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id || body?.action !== "remove" || !Number.isFinite(endpointId)) {
      return json({ ok: false, error: "bad-request" }, 400);
    }
    const result = yield* imageAction(endpointId, id, "remove");
    return json(result, result.ok ? 200 : 502);
  }),
);
