import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { allocateEnvironmentColors } from "./environmentColors";

describe("machine color allocation", () => {
  it("honours every explicit choice, including the local machine and duplicates", () => {
    const entries = [
      { id: EnvironmentId.make("local"), color: "clay" as const },
      { id: EnvironmentId.make("remote-a"), color: "steel" as const },
      { id: EnvironmentId.make("remote-b"), color: "steel" as const },
      { id: EnvironmentId.make("remote-c"), color: null },
    ];
    const colors = allocateEnvironmentColors(entries);
    expect(colors.get(EnvironmentId.make("local"))).toBe("clay");
    expect(colors.get(EnvironmentId.make("remote-a"))).toBe("steel");
    expect(colors.get(EnvironmentId.make("remote-b"))).toBe("steel");
    expect(colors.get(EnvironmentId.make("remote-c"))).toBe("slate");
    expect([...allocateEnvironmentColors([...entries].reverse())]).toEqual([...colors]);
  });

  it("gives the local machine a neutral default and never a status colour", () => {
    const colors = allocateEnvironmentColors([
      { id: EnvironmentId.make("local"), color: null },
      { id: EnvironmentId.make("remote-a"), color: null },
    ]);
    expect(colors.get(EnvironmentId.make("local"))).toBe("slate");
    expect(colors.get(EnvironmentId.make("remote-a"))).toBe("stone");
    expect([...colors.values()]).not.toContain("green");
  });

  it("falls back to gray once the palette is exhausted", () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      id: EnvironmentId.make(`env-${index}`),
      color: null,
    }));
    const colors = allocateEnvironmentColors(entries);
    expect([...colors.values()].filter((color) => color === "gray")).toHaveLength(2);
  });
});
