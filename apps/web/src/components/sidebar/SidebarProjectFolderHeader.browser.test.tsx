import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { SidebarProjectFolderHeader } from "./SidebarProjectFolderHeader";
import "../../index.css";

vi.mock("../../environmentColors", () => ({
  useEnvironmentColors: () => new Map(),
  ENVIRONMENT_COLOR_DOT_CLASS: {},
}));
vi.mock("../ProjectFavicon", () => ({ ProjectFavicon: () => <span aria-hidden /> }));

it("keeps conversations nested inside the project and hides all of them when its name is clicked, without coupling the plus action", async () => {
  const group = {
    id: ProjectId.make("repo"),
    environmentId: EnvironmentId.make("remote"),
    projectKey: "remote:repo",
    displayName: "远程项目",
    pinned: false,
    memberProjects: [],
  } as unknown as SidebarProjectSnapshot;
  const start = vi.fn();
  function Tree() {
    const [collapsed, setCollapsed] = useState(false);
    return (
      <ul>
        <SidebarProjectFolderHeader
          group={group}
          collapsed={collapsed}
          hiddenThreads={[]}
          onToggle={() => setCollapsed((value) => !value)}
          onNewThread={start}
          onContextMenu={vi.fn()}
        >
          <li>
            <button type="button">运行中的对话</button>
          </li>
          <li>
            <button type="button">置顶对话</button>
          </li>
          <li>
            <button type="button">未发送草稿</button>
          </li>
        </SidebarProjectFolderHeader>
      </ul>
    );
  }
  await using screen = await render(<Tree />);
  await expect.element(screen.getByRole("list", { name: "远程项目 的对话" })).toBeVisible();
  expect(
    screen.container.querySelector('[data-testid="sidebar-project-folder"] ul button')?.textContent,
  ).toBe("运行中的对话");
  const parent = screen.getByRole("button", { name: "远程项目", exact: true });
  await parent.click();
  await expect.element(parent).toHaveAttribute("aria-expanded", "false");
  await expect
    .element(screen.getByRole("button", { name: "运行中的对话", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "置顶对话", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "未发送草稿", exact: true }))
    .not.toBeInTheDocument();
  await screen.getByRole("button", { name: "在 远程项目 新建对话", exact: true }).click();
  expect(start).toHaveBeenCalledExactlyOnceWith(group);
  await expect.element(parent).toHaveAttribute("aria-expanded", "false");
  await parent.click();
  await expect
    .element(screen.getByRole("button", { name: "运行中的对话", exact: true }))
    .toBeVisible();
});
