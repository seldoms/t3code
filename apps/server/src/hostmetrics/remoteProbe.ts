/** Both CPU lines belong to one SSH probe; never subtract boot counters from an old cached sample. */
export function parseRemoteProbe(output: string, alias: string) {
  const [hostname, platform, cores, load, memory, disk, ...cpuLines] = output
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
  const counters = cpuLines.map((line) => {
    const ticks = line.startsWith("cpu ") ? line.split(/\s+/).slice(1, 9).map(Number) : [];
    // Linux guest time is already included in user/nice; do not count it twice.
    return ticks.length >= 5 && ticks.every(Number.isFinite)
      ? {
          total: ticks.reduce((sum, tick) => sum + tick, 0),
          idle: (ticks[3] ?? 0) + (ticks[4] ?? 0),
        }
      : null;
  });
  const first = counters[0];
  const second = counters[1];
  const delta = first && second ? second.total - first.total : 0;
  const cpu =
    first && second && delta > 0 && second.idle >= first.idle
      ? Math.round(Math.max(0, Math.min(100, 100 * (1 - (second.idle - first.idle) / delta))))
      : null;
  const loads = numbers(load);
  return {
    counters: second,
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
