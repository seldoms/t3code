import { expect, it } from "vite-plus/test";
import "../../index.css";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { MachineMonitor } from "./MachineMonitor";
import type { MonitoredMachine } from "./machineMonitor.logic";

const local: MonitoredMachine = {
  key: "local",
  name: "Mac",
  local: true,
  environmentId: null,
  connection: "connected",
  reachable: true,
  cpu: 18,
  memory: 74,
  disk: 87,
};
const remote: MonitoredMachine = {
  ...local,
  key: "vps",
  name: "uslab-gw-01",
  local: false,
  cpu: 25,
  memory: 55,
  disk: null,
};

it("expands a single machine, switches to one-row-per-host for multiple machines, and restores details on demand", async () => {
  await page.viewport(1280, 800);
  const colorFor = () => "green" as const;
  const container = document.createElement("div");
  container.style.width = "320px";
  await using screen = await render(<MachineMonitor machines={[local]} colorFor={colorFor} />, {
    container,
  });
  await expect
    .element(screen.getByRole("progressbar", { name: "CPU", exact: true }))
    .toHaveAttribute("aria-valuenow", "18");
  await screen.rerender(<MachineMonitor machines={[local, remote]} colorFor={colorFor} />);
  await expect
    .element(screen.getByRole("button", { name: "展开 Mac 负载", exact: true }))
    .toHaveAttribute("aria-expanded", "false");
  await expect
    .element(screen.getByRole("button", { name: "展开 uslab-gw-01 负载", exact: true }))
    .toBeVisible();
  expect(screen.container.querySelectorAll('[role="progressbar"]')).toHaveLength(0);
  await screen.getByRole("button", { name: "展开 uslab-gw-01 负载", exact: true }).click();
  await expect
    .element(screen.getByRole("progressbar", { name: "硬盘", exact: true }))
    .toHaveAttribute("aria-valuetext", "未获取");
  expect(screen.container.scrollWidth).toBeLessThanOrEqual(screen.container.clientWidth);
  await page.screenshot({ path: "/tmp/t3-machine-monitor-multiple.png" });
});
