import { assert, describe, it } from "@effect/vitest";
import { buildRemoteT3RunnerScript } from "@t3tools/ssh/tunnel";

import {
  FORK_ARCHIVE_PUBLISHED,
  FORK_RELEASE_BASE_URL,
  FORK_RUNTIME_VERSION,
  REMOTE_RUNTIME_VERSION_ENV,
  forkArchiveRunner,
} from "./DesktopSshForkRuntime.ts";

describe("forkArchiveRunner", () => {
  it("keeps upstream until the fork archive is actually published", () => {
    // 归档没发布就指过去，远端会 404 连不上；发布后把 FORK_ARCHIVE_PUBLISHED 翻 true。
    const runner = forkArchiveRunner({});
    if (FORK_ARCHIVE_PUBLISHED) {
      assert.strictEqual(runner?.archiveVersion, FORK_RUNTIME_VERSION);
    } else {
      assert.isNull(runner);
    }
  });

  it("points packaged remotes at the fork release once a mirror is given", () => {
    const runner = forkArchiveRunner({ [REMOTE_RUNTIME_VERSION_ENV]: FORK_RUNTIME_VERSION })!;
    assert.strictEqual(runner.archiveVersion, FORK_RUNTIME_VERSION);
    assert.strictEqual(runner.releaseBaseUrl, FORK_RELEASE_BASE_URL);
    assert.notStrictEqual(
      runner.releaseBaseUrl,
      "https://github.com/pingdotgg/t3code/releases/download",
    );
  });

  it("produces a launcher script the remote accepts", () => {
    const script = buildRemoteT3RunnerScript(
      forkArchiveRunner({ [REMOTE_RUNTIME_VERSION_ENV]: FORK_RUNTIME_VERSION })!,
    );
    assert.include(script, `T3_ARCHIVE_VERSION='${FORK_RUNTIME_VERSION}'`);
    assert.include(script, `T3_RELEASE_BASE_URL='${FORK_RELEASE_BASE_URL}'`);
  });

  it("honours env overrides for a local mirror", () => {
    const runner = forkArchiveRunner({
      [REMOTE_RUNTIME_VERSION_ENV]: "0.1.9-fork.2",
      T3CODE_RELEASE_BASE_URL: "https://mirror.example/t3",
    })!;
    assert.strictEqual(runner.archiveVersion, "0.1.9-fork.2");
    assert.strictEqual(runner.releaseBaseUrl, "https://mirror.example/t3");
  });

  it("falls back to the fork defaults when only one override is given", () => {
    const runner = forkArchiveRunner({
      [REMOTE_RUNTIME_VERSION_ENV]: "   ",
      T3CODE_RELEASE_BASE_URL: "https://mirror.example/t3",
    })!;
    assert.strictEqual(runner.archiveVersion, FORK_RUNTIME_VERSION);
    assert.strictEqual(runner.releaseBaseUrl, "https://mirror.example/t3");
  });
});
