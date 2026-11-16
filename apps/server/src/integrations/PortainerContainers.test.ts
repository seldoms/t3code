import * as NodeEvents from "node:events";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as Effect from "effect/Effect";
import { describe, expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";

vi.mock("node:fs", () => ({ readFileSync: vi.fn() }));
vi.mock("node:http", () => ({ request: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_file, _args, _options, callback) => callback(null, "fixture-key", "")),
}));
import { containerAction, listContainers, imageAction } from "./PortainerContainers.ts";

function setup(state = "exited") {
  const calls: { method: string; path: string }[] = [];
  vi.mocked(NodeFS.readFileSync).mockReturnValue(
    JSON.stringify({
      portainer: { url: "http://fixture.invalid", endpointId: 7, apiKeyKeychain: "fixture" },
    }),
  );
  vi.mocked(NodeHttp.request).mockImplementation(((
    url: URL,
    options: { method: string },
    callback: (response: NodeEvents.EventEmitter & { statusCode: number }) => void,
  ) => {
    calls.push({ method: options.method, path: url.pathname + url.search });
    const request = new NodeEvents.EventEmitter();
    Object.assign(request, {
      setTimeout: () => request,
      end: () => {
        const response = Object.assign(new NodeEvents.EventEmitter(), {
          statusCode: options.method === "DELETE" ? 204 : 200,
        });
        callback(response);
        const body =
          url.pathname.endsWith("/json") && !url.pathname.endsWith("/containers/json")
            ? { State: { Status: state } }
            : [{ Id: "a".repeat(64), Names: ["/fixture"], Image: "test:latest", State: state }];
        response.emit("data", Buffer.from(JSON.stringify(body)));
        response.emit("end");
      },
    });
    return request;
  }) as typeof NodeHttp.request);
  return calls;
}

describe("Portainer host-scoped actions", () => {
  it.effect(
    "deletes only stopped containers, with DELETE and without force or volume removal",
    () =>
      Effect.gen(function* () {
        const calls = setup();
        expect(yield* containerAction(7, "a".repeat(64), "remove")).toEqual({ ok: true });
        expect(calls).toEqual([
          { method: "GET", path: `/api/endpoints/7/docker/containers/${"a".repeat(64)}/json` },
          { method: "DELETE", path: `/api/endpoints/7/docker/containers/${"a".repeat(64)}` },
        ]);
        const runningCalls = setup("running");
        expect(yield* containerAction(7, "a".repeat(64), "remove")).toEqual({
          ok: false,
          error: "container-running",
        });
        expect(runningCalls).toHaveLength(1);
      }),
  );
  it.effect("rejects invalid and unconfigured host targets before contacting Docker", () =>
    Effect.gen(function* () {
      const calls = setup();
      for (const endpoint of [0, -1, 7.5, NaN, 8]) {
        expect(yield* containerAction(endpoint, "a".repeat(64), "stop")).toEqual({
          ok: false,
          error: "bad-endpoint",
        });
      }
      expect(calls).toHaveLength(0);
    }),
  );
  it.effect("keeps host identity on snapshots and uses full image IDs for deletion", () =>
    Effect.gen(function* () {
      const calls = setup();
      const snapshot = yield* listContainers();
      expect(snapshot.hosts[0]?.endpointId).toBe(7);
      expect(snapshot.hosts[0]?.containers[0]?.name).toBe("fixture");
      expect(yield* imageAction(7, "b".repeat(64), "remove")).toEqual({ ok: true });
      expect(calls.at(-1)).toEqual({
        method: "DELETE",
        path: `/api/endpoints/7/docker/images/${"b".repeat(64)}?force=0`,
      });
      expect(yield* imageAction(7, "short", "remove")).toEqual({ ok: false, error: "bad-id" });
    }),
  );
});
