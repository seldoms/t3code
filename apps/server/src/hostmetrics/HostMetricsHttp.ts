import { HttpRouter, HttpServerResponse } from "effect/http";
import * as Effect from "effect/Effect";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";

import { authenticateRawRouteWithScope } from "../http.ts";
import { sampleHostMetrics } from "./HostMetrics.ts";
import { readPrivateSshHosts, sampleRemoteHosts } from "./RemoteHostMetrics.ts";

/**
 * 只读暴露本机负载快照（CPU / 内存 / 磁盘 / GPU / 负载 / 开机时长）。
 * 走环境鉴权（read scope）：指标会触发 SSH、暴露私有主机别名，不是匿名可读的。
 * 不接受任何客户端参数，采不到就返回 null 让前端显示「—」而不是编数字。
 */
export const layerHostMetricsRoute = HttpRouter.add(
  "GET",
  "/api/host/metrics",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const [metrics, remotes] = yield* Effect.all([sampleHostMetrics(), sampleRemoteHosts()]);
    return HttpServerResponse.text(
      JSON.stringify({ ...metrics, remotes, hostsConfigured: readPrivateSshHosts() }),
      {
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
      },
    );
  }),
);
