import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import { it, expect } from "@effect/vitest";
import { vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({ calls: 0, succeed: true }));
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => "# tag: private\nHost test-host\n"),
  existsSync: () => true,
}));
vi.mock("node:child_process", () => ({
  execFile: (
    _command: string,
    _args: string[],
    _options: unknown,
    callback: (error: Error | null, result: { stdout: string }) => void,
  ) => {
    mocks.calls++;
    const line = `cpu ${mocks.calls * 100} 0 100 ${mocks.calls * 800} 0 0 0 0 0 0`;
    queueMicrotask(() =>
      callback(mocks.succeed ? null : new Error("connection reset"), {
        stdout: `remote-host\nLinux\n4\n1 1 1\n1000,500\n1000,800,100\n${line}\n${line.replace(String(mocks.calls * 100), String(mocks.calls * 100 + 30)).replace(String(mocks.calls * 800), String(mocks.calls * 800 + 70))}\n`,
      }),
    );
  },
}));
import { sampleRemoteHosts } from "./RemoteHostMetrics.ts";

it.effect(
  "retries failed SSH samples, preserves old values with their timestamp, and refreshes CPU on each successful probe",
  () =>
    Effect.gen(function* () {
      mocks.calls = 0;
      mocks.succeed = true;
      const first = (yield* sampleRemoteHosts())[0]!;
      expect(first.cpu).toBe(30);
      expect(first.sampledAt).toBe(0);
      yield* TestClock.adjust("11 seconds");
      mocks.succeed = false;
      const failed = (yield* sampleRemoteHosts())[0]!;
      expect(failed.sampledAt).toBe(first.sampledAt);
      expect(failed.memPercent).toBe(50);
      expect(failed.error).toBeDefined();
      expect(mocks.calls).toBe(2);
      expect(yield* sampleRemoteHosts()).toEqual([failed]);
      expect(mocks.calls).toBe(2);
      yield* TestClock.adjust("11 seconds");
      mocks.succeed = true;
      const recovered = (yield* sampleRemoteHosts())[0]!;
      expect(recovered.cpu).toBe(30);
      expect(recovered.sampledAt).toBe(22_000);
      expect(recovered.error).toBeUndefined();
      expect(mocks.calls).toBe(3);
      expect(yield* sampleRemoteHosts()).toEqual([recovered]);
      expect(mocks.calls).toBe(3);
    }),
);
