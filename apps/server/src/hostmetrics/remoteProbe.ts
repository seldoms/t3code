export interface CpuCounters {
  readonly total: number;
  readonly idle: number;
}

export function parseRemoteProbe(output: string, alias: string, previous?: CpuCounters) {
  const [hostname, platform, cores, load, memory, disk, cpuLine] = output
    .trim()
    .split("\n")
    .map((line) => line.trim());
  const numbers = (value: string | undefined) => (value ?? "").split(/[\s,]+/).map(Number);
  const memoryValues = numbers(memory);
  const memTotal = (memoryValues[0] ?? 0) * 1024;
  const memUsed = (memoryValues[1] ?? 0) * 1024;
  const diskValues = numbers(disk);
  const diskTotal = (diskValues[0] ?? 0) * 1024;
  const diskUsed = (diskValues[1] ?? 0) * 1024;
  const diskAvail =
    diskValues[2] === undefined ? Math.max(0, diskTotal - diskUsed) : diskValues[2] * 1024;
  // Linux guest counters are already included in user/nice; do not count them twice.
  const ticks = cpuLine?.startsWith("cpu ") ? cpuLine.split(/\s+/).slice(1, 9).map(Number) : [];
  const counters =
    ticks.length >= 4 && ticks.every(Number.isFinite)
      ? {
          total: ticks.reduce((sum, tick) => sum + tick, 0),
          idle: (ticks[3] ?? 0) + (ticks[4] ?? 0),
        }
      : null;
  const delta = counters && previous ? counters.total - previous.total : 0;
  const cpu =
    counters && previous && delta > 0 && counters.idle >= previous.idle
      ? Math.round(Math.max(0, Math.min(100, 100 * (1 - (counters.idle - previous.idle) / delta))))
      : null;
  const loads = numbers(load);
  return {
    counters,
    metrics: {
      host: hostname || alias,
      alias,
      online: true,
      platform: platform ?? "",
      cores: Number(cores) || 0,
      load: [loads[0] || 0, loads[1] || 0, loads[2] || 0] as const,
      cpu,
      memTotal,
      memUsed,
      memPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : null,
      diskTotal,
      diskUsed,
      diskPercent:
        diskTotal > 0 && diskUsed + diskAvail > 0
          ? Math.round((diskUsed / (diskUsed + diskAvail)) * 100)
          : null,
    },
  };
}
