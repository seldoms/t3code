import { expect, it } from "vite-plus/test";
import "../../index.css";
import { render } from "../../../test/render";
import { MachineWidget, formatBytes, formatRate, formatUptime } from "./MachineWidget";
import type { MonitoredMachine } from "./machineMonitor.logic";

const machine: MonitoredMachine = {
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

it("renders a ServerCat-style card with rings, a per-core dot matrix and readable numbers", async () => {
  await using screen = await render(<MachineWidget machines={[machine]} />);
  const card = screen.getByTestId("monitor-widget-card");
  await expect.element(card).toBeVisible();
  await expect.element(screen.getByText("CPU · 10 核")).toBeVisible();
  await expect.element(screen.getByText("18%", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("3D 3H", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("11.2G/14.9G")).toBeVisible();
  await expect.element(screen.getByText("2.3M/s", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("32.5°C", { exact: true })).toBeVisible();
  expect(card.element().querySelectorAll("svg").length).toBeGreaterThan(2);
  // 本机 GPU 正常，小组件也不给它版面。
  expect(screen.container.textContent).not.toContain("GPU");
});

it("lists physical adapters with their own rates and collapses the virtual ones", async () => {
  const p15: MonitoredMachine = {
    ...machine,
    key: "p15",
    name: "sobey-ThinkPad-P15",
    local: false,
    cores: 12,
    coreUtilization: Array.from({ length: 12 }, (_, index) => index * 5),
    uptimeSeconds: 3_600,
    gpu: 4,
    gpuName: "Quadro RTX 5000",
    gpuMemoryUsed: 12_161_384_448,
    gpuMemoryTotal: 17_179_869_184,
    gpuMemoryPercent: 71,
    latencyMs: 880,
    sensors: [{ label: "x86_pkg_temp", kind: "cpu", celsius: 64 }],
    interfaces: [
      {
        name: "wlp0s20f3",
        rxTotal: 10,
        txTotal: 20,
        rxPerSecond: 4_757_265,
        txPerSecond: 139_610,
        virtual: false,
      },
      {
        name: "docker0",
        rxTotal: 1,
        txTotal: 2,
        rxPerSecond: null,
        txPerSecond: null,
        virtual: true,
      },
      {
        name: "veth9",
        rxTotal: 1,
        txTotal: 2,
        rxPerSecond: null,
        txPerSecond: null,
        virtual: true,
      },
    ],
  };
  await using screen = await render(<MachineWidget machines={[p15]} />);
  await expect.element(screen.getByText("↓4.5M/s ↑136K/s", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("2 张", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("64°C", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("1H 0M", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("880 ms", { exact: true })).toBeVisible();
});

it("shows a placeholder for readings the machine never reported", async () => {
  const bare: MonitoredMachine = {
    ...machine,
    cpu: null,
    memory: null,
    disk: null,
    netRx: null,
    netTx: null,
    uptimeSeconds: null,
    memUsedBytes: null,
    memTotalBytes: null,
    sensors: [],
  };
  await using screen = await render(<MachineWidget machines={[bare]} />);
  const text = screen.getByTestId("monitor-widget-card").element().textContent ?? "";
  expect(text).toContain("--");
  expect(text).not.toContain("NaN");
  expect(text).not.toContain("null");
  expect(text).not.toContain("undefined");
});

it("formats bytes, rates and uptime without inventing precision", () => {
  expect(formatBytes(null)).toBe("--");
  expect(formatBytes(512)).toBe("512B");
  expect(formatBytes(2_400_000)).toBe("2.3M");
  expect(formatBytes(17_179_869_184)).toBe("16.0G");
  expect(formatRate(null)).toBe("--");
  expect(formatRate(139_610)).toBe("136K/s");
  expect(formatUptime(null)).toBe("--");
  expect(formatUptime(90)).toBe("1M");
  expect(formatUptime(3_660)).toBe("1H 1M");
  expect(formatUptime(270_000)).toBe("3D 3H");
});
