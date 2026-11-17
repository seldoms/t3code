import { describe, expect, it } from "vite-plus/test";
import { parseRemoteProbe } from "./remoteProbe.ts";

describe("remote metrics sampling", () => {
  it("uses two CPU readings from the same probe and available disk space rather than load average", () => {
    const header = "remote-host\nLinux\n4\n9.00 8.00 7.00\n1000,500\n1000,800,100\n";
    const first = parseRemoteProbe(
      header + "cpu 100 0 100 800 0 0 0 0 0 0\ncpu 120 0 110 870 0 0 0 0 0 0",
      "alias",
    );
    expect(first.metrics.cpu).toBe(30);
    expect(first.metrics.memPercent).toBe(50);
    expect(first.metrics.diskPercent).toBe(89);
    expect(first.metrics.alias).toBe("alias");
    const second = parseRemoteProbe(
      header + "cpu 120 0 110 870 0 0 0 0 0 0\ncpu 140 0 120 940 0 0 0 0 0 0",
      "alias",
    );
    expect(second.metrics.cpu).toBe(30);
    expect(second.metrics.load).toEqual([9, 8, 7]);
    expect(parseRemoteProbe(header + "cpu 1 0 1 1\ncpu 1 0 1 1", "alias").metrics.cpu).toBeNull();
  });
  it("does not present missing metrics as zero utilization", () => {
    const parsed = parseRemoteProbe("host\nDarwin\n8\n0 0 0\n0,0\n0,0\n", "alias");
    expect(parsed.metrics.cpu).toBeNull();
    expect(parsed.metrics.memPercent).toBeNull();
    expect(parsed.metrics.diskPercent).toBeNull();
  });
  it("pairs per-core readings by label so a hot core cannot borrow another core's baseline", () => {
    const header = "remote-host\nLinux\n2\n1.00 1.00 1.00\n1000,500\n1000,800,100\n";
    const { metrics } = parseRemoteProbe(
      header +
        [
          "cpu 100 0 100 800 0 0 0 0 0 0",
          "cpu0 50 0 50 400 0 0 0 0 0 0",
          "cpu1 50 0 50 400 0 0 0 0 0 0",
          "cpu 120 0 110 870 0 0 0 0 0 0",
          // cpu0 全忙、cpu1 全空闲：顺序配对才会得出 100/0。
          "cpu0 150 0 50 400 0 0 0 0 0 0",
          "cpu1 50 0 50 500 0 0 0 0 0 0",
        ].join("\n"),
      "alias",
    );
    expect(metrics.coreUtilization).toEqual([100, 0]);
  });
  it("reads gpu, thermal zones and per-interface rates from the prefixed probe lines", () => {
    const header = "remote-host\nLinux\n4\n1.00 1.00 1.00\n1000,500\n1000,800,100\n";
    const { metrics } = parseRemoteProbe(
      header +
        [
          "cpu 100 0 100 800 0 0 0 0 0 0",
          "iface eth0 1000 2000",
          "cpu 120 0 110 870 0 0 0 0 0 0",
          "iface eth0 1200 2400",
          "gpu Quadro RTX 5000, 4, 54, 11598, 16384",
          "sensor x86_pkg_temp 64000",
          "sensor INT3400 Thermal 20000",
          "sensor broken_zone -273150",
        ].join("\n"),
      "alias",
    );
    expect(metrics.gpu).toBe(4);
    expect(metrics.gpuName).toBe("Quadro RTX 5000");
    expect(metrics.gpuMemoryUsed).toBe(11598 * 1024 * 1024);
    expect(metrics.gpuMemoryTotal).toBe(16384 * 1024 * 1024);
    // 0.2s 采样窗口：(1200-1000)/0.2 = 1000 B/s。
    expect(metrics.interfaces).toEqual([
      { name: "eth0", rxTotal: 1200, txTotal: 2400, rxPerSecond: 1000, txPerSecond: 2000 },
    ]);
    expect(metrics.sensors).toEqual([
      { label: "x86_pkg_temp", kind: "cpu", celsius: 64 },
      { label: "INT3400 Thermal", kind: "board", celsius: 20 },
      { label: "Quadro RTX 5000", kind: "gpu", celsius: 54 },
    ]);
  });
  it("omits gpu and sensors entirely when the host has neither", () => {
    const { metrics } = parseRemoteProbe(
      "host\nLinux\n2\n0 0 0\n1000,500\n1000,800,100\ncpu 1 0 1 1\ncpu 1 0 1 1",
      "alias",
    );
    expect(metrics.gpu).toBeUndefined();
    expect(metrics.gpuName).toBeUndefined();
    expect(metrics.sensors).toBeUndefined();
    expect(metrics.interfaces).toBeUndefined();
    expect(metrics.coreUtilization).toBeUndefined();
  });
});
