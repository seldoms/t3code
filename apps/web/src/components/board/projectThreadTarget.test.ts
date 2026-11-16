import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { projectThreadTargetError, resolveSnapshotEnvironment } from "./projectThreadTarget";

const environment = (id: string, label: string, hostname?: string) => ({
  environmentId: EnvironmentId.make(id),
  label,
  serverConfig: hostname === undefined ? null : { hostname, environment: { label: id } },
});

describe("remote project thread targets", () => {
  it("matches a scanned hostname only when exactly one environment owns it", () => {
    expect(
      resolveSnapshotEnvironment([environment("remote", "P15", "thinkpad.local")], {
        machine: "thinkpad",
        label: "P15",
      }),
    ).toBe("remote");
    expect(
      resolveSnapshotEnvironment([environment("a", "box.local"), environment("b", "box.lan")], {
        machine: "box",
        label: "box",
      }),
    ).toBeNull();
    expect(
      resolveSnapshotEnvironment([environment("a", "other")], { machine: "box", label: "box" }),
    ).toBeNull();
  });
  it("requires a connected, authorized target and an absolute path", () => {
    const valid = {
      environmentId: EnvironmentId.make("remote"),
      connected: true,
      canOperate: true,
      path: "/home/user/project",
    };
    expect(projectThreadTargetError(valid)).toBeNull();
    expect(projectThreadTargetError({ ...valid, environmentId: null })).toMatch(/唯一对应/);
    expect(projectThreadTargetError({ ...valid, connected: false })).toMatch(/未连接/);
    expect(projectThreadTargetError({ ...valid, canOperate: false })).toMatch(/权限/);
    expect(projectThreadTargetError({ ...valid, path: "relative/path" })).toMatch(/绝对路径/);
    expect(projectThreadTargetError({ ...valid, path: "C:\\work\\project" })).toBeNull();
  });
});
