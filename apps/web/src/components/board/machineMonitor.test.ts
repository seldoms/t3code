import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { machineConnectionLabel, monitoredMachines } from "./machineMonitor.logic";
import type { HostMetricsSnapshot } from "./useHostMetrics";

it("merges matching remote metrics with connection identity without conflating SSH and T3", () => {
  const metrics = {
    host: "Mac",
    cpu: 12,
    memPercent: 50,
    diskPercent: 70,
    remotes: [
      {
        host: "P15.local",
        alias: "ubuntu",
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
  );
  expect(rows).toHaveLength(4);
  expect(rows[1]?.environmentId).toBe("p15");
  expect(rows[1]?.cpu).toBe(30);
  expect(machineConnectionLabel(rows[1]!)).toBe("T3 已连接");
  expect(machineConnectionLabel(rows[2]!)).toBe("SSH 未连接");
  expect(rows[3]?.cpu).toBeNull();
  expect(machineConnectionLabel(rows[3]!)).toBe("T3 连接中");
  const sshOnly = monitoredMachines(metrics, [], null);
  expect(machineConnectionLabel(sshOnly[1]!)).toBe("SSH 可访问 · T3 未连接");
});

describe("machine metric values", () => {
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
