import { HttpRouter, HttpServerResponse } from "effect/http";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";

import { authenticateRawRouteWithScope } from "../http.ts";

// 这个模块只做只读透传，用不到 Effect 的 JSON 编解码：路径和 mtime 都是我们自己的值。
const quote = (value: string) => JSON.stringify(value);

/**
 * 只读透传 projwall 采集器快照（~/.projwall/latest.json），带 mtime 供客户端判断新鲜度。
 * 只读、不触发采集、不写文件；快照缺失/损坏返回 available:false，客户端照常工作。
 * 路径固定不接受客户端传参；原始 JSON 透传，不在服务端解析。
 */
const SNAPSHOT_DIR = ".projwall";
const SNAPSHOT_FILE = "latest.json";
const REMOTE_DIR = "remotes";

/** 只取合法 JSON，坏文件单独跳过，不拖垮整份响应。 */
function parseSnapshot(raw: string): string | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    return raw;
  } catch {
    return null;
  }
}

const unavailable = (snapshotPath: string | null, mtime: number | null) =>
  HttpServerResponse.text(
    JSON.stringify({ available: false, path: snapshotPath, mtime, snapshot: null }),
    {
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "no-store" },
    },
  );

export const layerProjwallSnapshotRoute = HttpRouter.add(
  "GET",
  "/api/projwall/latest",
  Effect.gen(function* () {
    yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const home = yield* HostProcess.HomeDirectory;
    const snapshotPath = path.join(home, SNAPSHOT_DIR, SNAPSHOT_FILE);

    const info = yield* fileSystem.stat(snapshotPath).pipe(Effect.orElseSucceed(() => null));
    if (info === null || info.type !== "File") {
      return unavailable(snapshotPath, null);
    }

    const mtime = Option.match(info.mtime, {
      onNone: () => null,
      onSome: (at) => at.getTime(),
    });

    const raw = yield* fileSystem
      .readFileString(snapshotPath)
      .pipe(Effect.orElseSucceed(() => null));
    if (raw === null) return unavailable(snapshotPath, mtime);

    // 客户端要的是 { available, mtime, snapshot }，服务端不再解析一遍原始快照：
    // 把原文嵌进信封会需要序列化，这里改用包一层的 JSON 文本拼接。
    // remotes/ 下是本机拉回来的远端快照（每台一个文件，文件名即机器名）。
    const remotesDir = path.join(home, SNAPSHOT_DIR, REMOTE_DIR);
    const remoteNames = yield* fileSystem
      .readDirectory(remotesDir)
      .pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
    const remoteParts: string[] = [];
    for (const name of remoteNames.filter((entry) => entry.endsWith(".json")).sort()) {
      const filePath = path.join(remotesDir, name);
      const info = yield* fileSystem.stat(filePath).pipe(Effect.orElseSucceed(() => null));
      if (info === null || info.type !== "File") continue;
      const rawRemote = yield* fileSystem
        .readFileString(filePath)
        .pipe(Effect.orElseSucceed(() => null));
      const parsed = rawRemote === null ? null : parseSnapshot(rawRemote);
      if (parsed === null) continue;
      const remoteMtime = Option.match(info.mtime, {
        onNone: () => null,
        onSome: (at) => at.getTime(),
      });
      remoteParts.push(
        `{"machine":${quote(name.replace(/\.json$/, ""))},"mtime":${remoteMtime ?? "null"},"snapshot":${parsed}}`,
      );
    }

    return HttpServerResponse.text(
      `{"available":true,"path":${quote(snapshotPath)},"mtime":${mtime ?? "null"},"snapshot":${raw},"remotes":[${remoteParts.join(",")}]}`,
      {
        status: 200,
        contentType: "application/json",
        headers: { "cache-control": "no-store" },
      },
    );
  }),
);
