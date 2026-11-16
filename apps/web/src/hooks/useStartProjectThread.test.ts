import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, vi } from "vite-plus/test";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";

const state = vi.hoisted(() => ({
  connected: true,
  allowed: true,
  projects: [] as { id: ProjectId; environmentId: EnvironmentId; workspaceRoot: string }[],
  result: { _tag: "Success" } as { _tag: "Success" | "Failure" },
  calls: [] as { environmentId: EnvironmentId; path: string }[],
  drafts: [] as string[],
}));
vi.mock("../state/projects", () => ({ projectEnvironment: { create: {} } }));
vi.mock("../lib/utils", () => ({ newProjectId: () => "created-project" }));
vi.mock("@t3tools/client-runtime/state/projects", () => ({
  inferProjectTitleFromPath: () => "project",
}));
vi.mock("../state/entities", () => ({ readProjects: () => state.projects }));
vi.mock("../state/environments", () => ({
  readEnvironment: () => ({ connection: { phase: state.connected ? "connected" : "error" } }),
}));
vi.mock("../state/session", () => ({ readEnvironmentScope: () => state.allowed }));
vi.mock("../state/use-atom-command", () => ({
  useAtomCommand:
    () => async (input: { environmentId: EnvironmentId; input: { workspaceRoot: string } }) => {
      state.calls.push({ environmentId: input.environmentId, path: input.input.workspaceRoot });
      return state.result;
    },
}));
vi.mock("./useHandleNewThread", () => ({
  useNewThreadHandler: () => async (ref: { environmentId: EnvironmentId }) => {
    state.drafts.push(ref.environmentId);
    return { draftId: "draft", threadId: "thread" };
  },
}));
vi.mock("react", async (original) => {
  const react = (await original()) as typeof import("react");
  return {
    ...react,
    useRef: (value: unknown) => ({ current: value }),
    useState: (value: unknown) => [value, () => undefined],
  };
});
import { useStartProjectThread } from "./useStartProjectThread";

describe("starting remote project drafts", () => {
  it.effect("does not register or navigate on a disconnected target", () =>
    Effect.gen(function* () {
      state.calls.length = 0;
      state.drafts.length = 0;
      state.connected = false;
      state.allowed = true;
      state.projects = [];
      expect(
        yield* Effect.promise(() =>
          useStartProjectThread().start(EnvironmentId.make("remote"), "/home/user/project"),
        ),
      ).toBe(false);
      expect(state.calls).toHaveLength(0);
      expect(state.drafts).toHaveLength(0);
      state.connected = true;
      state.allowed = false;
      expect(
        yield* Effect.promise(() =>
          useStartProjectThread().start(EnvironmentId.make("remote"), "/home/user/project"),
        ),
      ).toBe(false);
      expect(state.calls).toHaveLength(0);
      expect(state.drafts).toHaveLength(0);
    }),
  );
  it.effect(
    "registers an untracked path on the selected environment, reuses existing IDs, and opens its draft",
    () =>
      Effect.gen(function* () {
        state.calls.length = 0;
        state.drafts.length = 0;
        state.connected = true;
        state.allowed = true;
        state.result = { _tag: "Success" };
        const id = EnvironmentId.make("remote");
        state.projects = [];
        expect(
          yield* Effect.promise(() => useStartProjectThread().start(id, "/home/user/project/")),
        ).toBe(true);
        expect(state.calls[0]?.environmentId).toBe(id);
        expect(state.drafts).toEqual([id]);
        const projectId = ProjectId.make("existing");
        state.projects = [
          { id: projectId, environmentId: id, workspaceRoot: "/home/user/project" },
        ];
        expect(
          yield* Effect.promise(() => useStartProjectThread().start(id, "/home/user/project")),
        ).toBe(true);
        expect(state.calls).toHaveLength(1);
        expect(state.drafts).toEqual([id, id]);
        state.result = { _tag: "Failure" };
        state.projects = [];
        expect(yield* Effect.promise(() => useStartProjectThread().start(id, "/missing"))).toBe(
          false,
        );
        expect(state.drafts).toHaveLength(2);
      }),
  );
});
