import { expect, it, vi } from "vite-plus/test";
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
  netRx: 2_400_000,
  netTx: 512_000,
  latencyMs: null,
  sampledAt: 1_800_000_000_000,
  stale: false,
  cores: 10,
  coreUtilization: [40, 20, 10, 5, 0, 0, 0, 0, 0, 0],
  cpuHistory: [10, 40, 18],
  uptimeSeconds: 270_000,
  memUsedBytes: 12_000_000_000,
  memTotalBytes: 16_000_000_000,
  diskUsedBytes: 400_000_000_000,
  diskTotalBytes: 500_000_000_000,
  diskRead: null,
  diskWrite: null,
  netRxTotal: 56_000_000_000,
  netTxTotal: 9_000_000_000,
  gpu: 12,
  gpuName: "Apple M4",
  gpuMemoryUsed: 1_700_000_000,
  gpuMemoryTotal: null,
  gpuMemoryPercent: null,
  sensors: [{ label: "电池", kind: "battery", celsius: 32.5 }],
  interfaces: [],
};
const remote: MonitoredMachine = {
  ...local,
  key: "vps",
  name: "uslab-gw-01",
  local: false,
  cpu: 25,
  memory: 55,
  disk: null,
  latencyMs: 120,
};

it("expands a single machine, switches to one-row-per-host for multiple machines, and restores details on demand", async () => {
  await page.viewport(1280, 800);
  using _time = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
  const colorFor = () => "slate" as const;
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
  // 折叠行显示状态色点；默认指标不包含网络/延迟，不出现对应元素。
  await expect.element(screen.getByLabelText("CPU 正常").first()).toBeVisible();
  expect(screen.container.textContent).not.toContain("120ms");
  await screen.rerender(
    <MachineMonitor
      machines={[local, remote]}
      colorFor={colorFor}
      metrics={["cpu", "memory", "disk", "network", "latency"]}
    />,
  );
  await expect.element(screen.getByLabelText("网络 正常").first()).toBeVisible();
  await expect.element(screen.getByText("120ms")).toBeVisible();
  await screen.getByRole("button", { name: "展开 uslab-gw-01 负载", exact: true }).click();
  await expect.element(screen.getByText(/↓.*↑/)).toBeVisible();
  await expect.element(screen.getByText("120 ms")).toBeVisible();
  // 硬盘未知显示文字行，不伪造 0%。
  await expect.element(screen.getByText("未知").first()).toBeVisible();
  expect(screen.container.scrollWidth).toBeLessThanOrEqual(screen.container.clientWidth);
  await page.screenshot({ path: "/tmp/t3-machine-monitor-multiple.png" });
  await screen.rerender(
    <MachineMonitor compact machines={[local, { ...remote, stale: true }]} colorFor={colorFor} />,
  );
  await expect.element(screen.getByText(/旧快照/)).toBeVisible();
  expect(screen.container.textContent).not.toContain("点击主机查看");
  expect(screen.container.textContent).not.toContain("连接恢复后将自动重试");
  await page.screenshot({ path: "/tmp/t3-sidebar-machine-monitor-compact.png" });
  await screen.rerender(
    <MachineMonitor
      compact
      machines={[local, { ...remote, sampledAt: local.sampledAt! + 10_000, stale: false, cpu: 40 }]}
      colorFor={colorFor}
    />,
  );
  await expect
    .element(screen.getByRole("progressbar", { name: "CPU", exact: true }))
    .toHaveAttribute("aria-valuenow", "40");
  expect(screen.container.textContent).not.toContain("旧快照");
});

const dotColor = () => "slate" as const;

it("stays silent while the machine is healthy and never prints a sampling timestamp", async () => {
  await using screen = await render(<MachineMonitor machines={[local]} colorFor={dotColor} />);
  // 只有一台机器时默认展开。
  await expect.element(screen.getByLabelText("收起 Mac 负载")).toBeVisible();
  expect(screen.container.textContent).not.toContain("已连接");
  expect(screen.container.textContent).not.toContain("采样");
  expect(screen.container.textContent).not.toContain("21:00");
});

it("still reports the connection state when the user asks for permanent status text", async () => {
  await using screen = await render(
    <MachineMonitor machines={[local]} colorFor={dotColor} statusText="always" />,
  );
  await expect.element(screen.getByText(/已连接/)).toBeVisible();
});

it("keeps the GPU row out of the way until the GPU is actually a problem", async () => {
  const metrics = ["cpu", "memory", "disk", "gpu"] as const;
  await using screen = await render(
    <MachineMonitor machines={[local]} colorFor={dotColor} metrics={metrics} />,
  );
  await expect.element(screen.getByRole("progressbar", { name: "CPU", exact: true })).toBeVisible();
  expect(screen.container.textContent).not.toContain("GPU");
  await screen.rerender(
    <MachineMonitor machines={[{ ...local, gpu: 92 }]} colorFor={dotColor} metrics={metrics} />,
  );
  await expect
    .element(screen.getByRole("progressbar", { name: "GPU", exact: true }))
    .toHaveAttribute("aria-valuenow", "92");
});

it("scrolls the expanded metrics and highlights hot latency and temperatures", async () => {
  const hot: MonitoredMachine = {
    ...remote,
    disk: 40,
    latencyMs: 1_400,
    sensors: [
      { label: "x86_pkg_temp", kind: "cpu", celsius: 94 },
      { label: "电池", kind: "battery", celsius: 46 },
    ],
  };
  await using screen = await render(
    <MachineMonitor
      machines={[hot]}
      colorFor={dotColor}
      metrics={["cpu", "latency", "temperature"]}
    />,
  );
  await expect
    .element(screen.getByTestId("machine-monitor-metrics"))
    .toHaveClass(/overflow-y-auto/);
  const cpuTemperature = screen.getByText("94°C", { exact: true });
  await expect.element(cpuTemperature).toHaveClass(/text-error/);
  await expect.element(screen.getByText("46°C", { exact: true })).toHaveClass(/text-error/);
  await expect.element(screen.getByText("1400 ms", { exact: true })).toHaveClass(/text-error/);
});

it("draws one dot per real core in the dot style", async () => {
  await using screen = await render(
    <MachineMonitor machines={[local]} colorFor={dotColor} meterStyle="dots" />,
  );
  const cpu = screen.getByRole("progressbar", { name: "CPU", exact: true });
  await expect.element(cpu).toBeVisible();
  expect(cpu.element().querySelectorAll("span").length).toBe(local.coreUtilization.length);
});
