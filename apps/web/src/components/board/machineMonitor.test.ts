import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  gpuNeedsAttention,
  hottestSensor,
  latencyLevel,
  machineConnectionLabel,
  monitorAlert,
  monitoredMachines,
  temperatureLevel,
} from "./machineMonitor.logic";
import type { HostMetricsSnapshot } from "./useHostMetrics";

it("merges matching remote metrics with connection identity without conflating SSH and T3", () => {
  const now = 1_800_000_000_000;
  const metrics = {
    host: "Mac",
    cpu: 12,
    sampledAt: now,
    memPercent: 50,
    diskPercent: 70,
    remotes: [
      {
        host: "P15.local",
        alias: "ubuntu",
        sampledAt: now,
        online: true,
        cpu: 30,
        memPercent: 60,
        diskPercent: 40,
        netRx: 1500,
        netTx: 3000,
        latencyMs: 120,
      },
      { host: "5060", online: false },
    ],
  } as unknown as HostMetricsSnapshot;
  const environment = (id: string, label: string, hostname: string, phase = "connected") => ({
    environmentId: EnvironmentId.make(id),
    label,
    connection: { phase },
    serverConfig: { hostname, environment: { label } },
  });
  const rows = monitoredMachines(
    metrics,
    [
      environment("mac", "本机", "Mac"),
      environment("p15", "Ubuntu", "P15"),
      environment("vps", "VPS", "uslab", "connecting"),
    ],
    EnvironmentId.make("mac"),
    now,
  );
  expect(rows).toHaveLength(4);
  expect(rows[1]?.environmentId).toBe("p15");
  expect(rows[1]?.cpu).toBe(30);
  expect(rows[1]?.netRx).toBe(1500);
  expect(rows[1]?.netTx).toBe(3000);
  expect(rows[1]?.latencyMs).toBe(120);
  expect(rows[1]?.stale).toBe(false);
  expect(rows[1]?.sampledAt).not.toBeNull();
  expect(machineConnectionLabel(rows[1]!)).toBe("T3 已连接");
  expect(machineConnectionLabel(rows[2]!)).toBe("SSH 未连接");
  expect(rows[3]?.cpu).toBeNull();
  expect(machineConnectionLabel(rows[3]!)).toBe("T3 连接中");
  const sshOnly = monitoredMachines(metrics, [], null);
  expect(machineConnectionLabel(sshOnly[1]!)).toBe("SSH 可访问 · T3 未连接");
});

describe("machine metric values", () => {
  it("marks old or failed remote snapshots instead of presenting them as live data", () => {
    const now = 1_800_000_000_000;
    const metrics = {
      host: "Mac",
      cpu: 12,
      memPercent: 50,
      diskPercent: 70,
      sampledAt: now - 60_000,
      remotes: [
        {
          host: "remote",
          online: true,
          cpu: 10,
          memPercent: 40,
          diskPercent: 50,
          sampledAt: now - 60_000,
        },
      ],
    } as unknown as HostMetricsSnapshot;
    const rows = monitoredMachines(metrics, [], null, now);
    expect(rows.every((row) => row.stale)).toBe(true);
    expect(rows[1]?.cpu).toBe(10);
  });
  it("shows missing data as unknown and clamps invalid percentages", () => {
    const one = monitoredMachines(null, [], null);
    expect(one).toHaveLength(1);
    expect(one[0]?.cpu).toBeNull();
    const data = monitoredMachines(
      { host: "Mac", cpu: NaN, memPercent: 150, diskPercent: -10 } as HostMetricsSnapshot,
      [],
      null,
    );
    expect(data[0]?.cpu).toBeNull();
    expect(data[0]?.memory).toBe(100);
    expect(data[0]?.disk).toBe(0);
  });
});

describe("extended machine metrics", () => {
  const now = 1_800_000_000_000;
  it("takes local network and disk rates from counter differences instead of inventing them", () => {
    const metrics = {
      host: "Mac",
      cpu: 20,
      sampledAt: now,
      receivedAt: now,
      netRxTotal: 1000,
      netTxTotal: 500,
    } as unknown as HostMetricsSnapshot;
    const withoutBaseline = monitoredMachines(metrics, [], null, now, null);
    expect(withoutBaseline[0]?.netRx).toBeNull();
    const withRates = monitoredMachines(metrics, [], null, now, {
      netRx: 2048,
      netTx: 1024,
      diskRead: 4096,
      diskWrite: null,
    });
    expect(withRates[0]?.netRx).toBe(2048);
    expect(withRates[0]?.netTx).toBe(1024);
    expect(withRates[0]?.diskRead).toBe(4096);
    expect(withRates[0]?.diskWrite).toBeNull();
  });
  it("carries per-core load, sensors and interfaces, and separates virtual adapters", () => {
    const metrics = {
      host: "Mac",
      sampledAt: now,
      receivedAt: now,
      coreUtilization: [100, 0, 42],
      sensors: [{ label: "电池", kind: "battery", celsius: 32.5 }],
      interfaces: [
        { name: "en0", rxTotal: 10, txTotal: 20 },
        { name: "veth1234", rxTotal: 1, txTotal: 2 },
        { name: "docker0", rxTotal: 1, txTotal: 2 },
      ],
      remotes: [
        {
          host: "p15",
          online: true,
          sampledAt: now,
          gpu: 4,
          gpuName: "Quadro RTX 5000",
          gpuMemoryUsed: 12_161_384_448,
          gpuMemoryTotal: 17_179_869_184,
          sensors: [
            { label: "x86_pkg_temp", kind: "cpu", celsius: 64 },
            { label: "acpitz", kind: "board", celsius: 65 },
            { label: "Quadro RTX 5000", kind: "gpu", celsius: 54 },
          ],
          interfaces: [
            {
              name: "wlp0s20f3",
              rxTotal: 10,
              txTotal: 20,
              rxPerSecond: 4_757_265,
              txPerSecond: 139_610,
            },
          ],
        },
      ],
    } as unknown as HostMetricsSnapshot;
    const rows = monitoredMachines(metrics, [], null, now);
    expect(rows[0]?.coreUtilization).toEqual([100, 0, 42]);
    expect(rows[0]?.interfaces.map((entry) => entry.virtual)).toEqual([false, true, true]);
    // 本机单卡速率拿不到就是 null，不拿整机速率冒充。
    expect(rows[0]?.interfaces[0]?.rxPerSecond).toBeNull();
    expect(rows[1]?.gpuName).toBe("Quadro RTX 5000");
    expect(rows[1]?.gpuMemoryPercent).toBe(71);
    expect(rows[1]?.interfaces[0]?.rxPerSecond).toBe(4_757_265);
    // 核心/显卡优先于板载，即使板载数字更高。
    expect(hottestSensor(rows[1]!.sensors)?.label).toBe("x86_pkg_temp");
  });
  it("only surfaces GPU when utilization, VRAM or its temperature is actually a problem", () => {
    const base = monitoredMachines(null, [], null, now)[0]!;
    expect(gpuNeedsAttention({ ...base, gpu: 12, gpuName: "Apple M4" })).toBe(false);
    expect(gpuNeedsAttention({ ...base, gpu: null })).toBe(false);
    expect(gpuNeedsAttention({ ...base, gpu: 80 })).toBe(true);
    expect(gpuNeedsAttention({ ...base, gpu: 3, gpuMemoryPercent: 95 })).toBe(true);
    expect(
      gpuNeedsAttention({
        ...base,
        gpu: 3,
        sensors: [{ label: "GPU", kind: "gpu", celsius: 85 }],
      }),
    ).toBe(true);
  });
  it("uses separate temperature scales for battery and silicon, and warns on slow links", () => {
    expect(temperatureLevel({ label: "电池", kind: "battery", celsius: 32.5 })).toBe("ok");
    expect(temperatureLevel({ label: "电池", kind: "battery", celsius: 41 })).toBe("warn");
    expect(temperatureLevel({ label: "电池", kind: "battery", celsius: 46 })).toBe("bad");
    expect(temperatureLevel({ label: "x86_pkg_temp", kind: "cpu", celsius: 66 })).toBe("ok");
    expect(temperatureLevel({ label: "x86_pkg_temp", kind: "cpu", celsius: 85 })).toBe("warn");
    expect(temperatureLevel({ label: "x86_pkg_temp", kind: "cpu", celsius: 95 })).toBe("bad");
    expect(temperatureLevel(null)).toBe("unknown");
    expect(latencyLevel(120)).toBe("ok");
    expect(latencyLevel(250)).toBe("warn");
    expect(latencyLevel(1500)).toBe("bad");
    expect(latencyLevel(null)).toBe("unknown");
  });
  it("stays silent while data is fresh and only alerts on real problems", () => {
    const metrics = {
      host: "Mac",
      cpu: 20,
      memPercent: 40,
      diskPercent: 50,
      sampledAt: now,
      receivedAt: now,
      remotes: [{ host: "down", online: false }],
    } as unknown as HostMetricsSnapshot;
    const rows = monitoredMachines(metrics, [], null, now);
    expect(monitorAlert(rows[0]!)).toBeNull();
    expect(monitorAlert(rows[1]!)).toBe("SSH 未连接");
    const stale = monitoredMachines(
      { ...metrics, receivedAt: now - 60_000 } as HostMetricsSnapshot,
      [],
      null,
      now,
    );
    expect(monitorAlert(stale[0]!)).toBe("旧快照 · 指标已过期");
    expect(monitorAlert(monitoredMachines(null, [], null, now)[0]!)).toBe("指标未获取");
  });
});
