import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { allocateEnvironmentColors } from "./environmentColors";

describe("machine color allocation", () => {
  it("reserves green locally, keeps explicit colors, and resolves defaults and duplicate settings deterministically", () => {
    const entries = [
      { id: EnvironmentId.make("local"), local: true, color: "red" as const },
      { id: EnvironmentId.make("remote-a"), local: false, color: "green" as const },
      { id: EnvironmentId.make("remote-b"), local: false, color: "purple" as const },
      { id: EnvironmentId.make("remote-c"), local: false, color: "purple" as const },
      { id: EnvironmentId.make("remote-d"), local: false, color: null },
    ];
    const colors = allocateEnvironmentColors(entries);
    expect(colors.get(EnvironmentId.make("local"))).toBe("green");
    expect(colors.get(EnvironmentId.make("remote-b"))).toBe("purple");
    expect(new Set(colors.values()).size).toBe(entries.length);
    expect([...allocateEnvironmentColors([...entries].reverse())]).toEqual([...colors]);
  });
});
