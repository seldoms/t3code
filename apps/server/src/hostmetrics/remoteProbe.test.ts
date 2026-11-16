import { describe, expect, it } from "vite-plus/test";
import { parseRemoteProbe } from "./remoteProbe.ts";

describe("remote metrics sampling", () => {
  it("uses counter deltas for CPU and available disk space rather than load average", () => {
    const header = "remote-host\nLinux\n4\n9.00 8.00 7.00\n1000,500\n1000,800,100\n";
    const first = parseRemoteProbe(header + "cpu 100 0 100 800 0 0 0 0 0 0", "alias");
    expect(first.metrics.cpu).toBeNull();
    expect(first.metrics.memPercent).toBe(50);
    expect(first.metrics.diskPercent).toBe(89);
    expect(first.metrics.alias).toBe("alias");
    const second = parseRemoteProbe(
      header + "cpu 120 0 110 870 0 0 0 0 0 0",
      "alias",
      first.counters!,
    );
    expect(second.metrics.cpu).toBe(30);
    expect(second.metrics.load).toEqual([9, 8, 7]);
    expect(
      parseRemoteProbe(header + "cpu 1 0 1 1", "alias", second.counters!).metrics.cpu,
    ).toBeNull();
  });
  it("does not present missing metrics as zero utilization", () => {
    const parsed = parseRemoteProbe("host\nDarwin\n8\n0 0 0\n0,0\n0,0\n", "alias");
    expect(parsed.metrics.cpu).toBeNull();
    expect(parsed.metrics.memPercent).toBeNull();
    expect(parsed.metrics.diskPercent).toBeNull();
  });
});
