import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { machineConnectionLabel, monitoredMachines } from "./machineMonitor.logic";
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
