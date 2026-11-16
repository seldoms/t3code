import { expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { BoardWorkspace } from "./BoardWorkspace";
import "../../index.css";

it("fills the main workspace at wide and narrow widths without reserving a blank right column", async () => {
  await page.viewport(2560, 1440);
  const container = document.createElement("div");
  container.style.cssText = "width:100%;height:100vh;display:flex";
  await using screen = await render(
    <>
      <div style={{ width: 300, flexShrink: 0 }} />
      <BoardWorkspace>
        <header className="shrink-0 border-b p-3">项目板</header>
        <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-4">
          {["待启动", "进行中", "等我把关", "待交付", "暂停"].map((label) => (
            <section key={label} className="min-w-[240px] flex-1 basis-[272px]">
              <h2>{label}</h2>
              <div className="mt-2 rounded border p-2">测试项目</div>
            </section>
          ))}
        </div>
      </BoardWorkspace>
    </>,
    { container, router: "/board" },
  );
  const board = screen.container.children[1] as HTMLElement;
  expect(
    Math.abs(board.getBoundingClientRect().right - screen.container.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(1);
  expect(Math.abs(board.clientWidth - (screen.container.clientWidth - 300))).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "/tmp/t3-board-layout-2560.png" });
  await page.viewport(1000, 800);
  expect(
    Math.abs(board.getBoundingClientRect().right - screen.container.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(1);
  expect(board.clientWidth).toBeLessThanOrEqual(700);
  await expect.element(screen.getByRole("heading", { name: "进行中", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/t3-board-layout-1000.png" });
});
