import { expect, it } from "vite-plus/test";
import { boardCardActions, scannedStageKey, updateScannedStage } from "./boardCardActions";
import { BOARD_STAGES } from "./boardStages";

it("offers new and existing conversations plus stage movement at every stage, including scanned projects", () => {
  for (const stage of BOARD_STAGES)
    for (const external of [false, true]) {
      const items = boardCardActions(
        {
          external,
          stage: stage.id,
          manualStage: true,
          threads: [{ id: "thread", title: "Existing conversation" }],
        },
        false,
      );
      expect(items.find((item) => item.id === "new-thread")?.disabled).toBe(true);
      expect(items.find((item) => item.id === "threads")?.children).toEqual([
        { id: "thread:thread", label: "Existing conversation" },
      ]);
      expect(
        items
          .find((item) => item.id === "stage")
          ?.children?.find((item) => item.id === `stage:${stage.id}`)?.checked,
      ).toBe(true);
      expect(
        items
          .find((item) => item.id === "stage")
          ?.children?.some((item) => item.id === "stage:auto"),
      ).toBe(true);
    }
});
it("keeps scanned stages separate by machine and path and supports restoring automatic state", () => {
  const a = scannedStageKey("mac", "/repo/");
  const b = scannedStageKey("vps", "/repo");
  expect(a).not.toBe(b);
  expect(a).toBe(scannedStageKey("mac", "/repo"));
  const stages = updateScannedStage({}, a, "review");
  expect(stages[a]).toBe("review");
  expect(updateScannedStage(stages, b, "active")[a]).toBe("review");
  expect(updateScannedStage(stages, a, null)).toEqual({});
});
