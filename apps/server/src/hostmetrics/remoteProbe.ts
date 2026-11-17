import { roundCelsius, saneCelsius, sensorKind, type HostSensorReading } from "./sensors.ts";
import type { HostNetworkInterface } from "./HostMetrics.ts";

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
  const counters = cpuLines
    .filter((line) => line.startsWith("cpu "))
    .map((line) => {
      const ticks = line.split(/\s+/).slice(1, 9).map(Number);
      // Linux guest time is already included in user/nice; do not count it twice.
      return ticks.length >= 5 && ticks.every(Number.isFinite)
        ? {
            total: ticks.reduce((sum, tick) => sum + tick, 0),
            idle: (ticks[3] ?? 0) + (ticks[4] ?? 0),
          }
        : null;
    });
  const netLines = cpuLines.filter((line) => line.startsWith("net "));
  const netValues = netLines.map((line) => line.split(/\s+/).slice(1, 3).map(Number));
  const [netFirst, netSecond] = netValues;
  // The probe sleeps a fixed 0.2s between the two reads; loopback is excluded by the probe.
  const netRates =
    netFirst && netSecond && netFirst.every(Number.isFinite) && netSecond.every(Number.isFinite)
      ? {
          netRx: Math.max(0, Math.round((netSecond[0]! - netFirst[0]!) / 0.2)),
          netTx: Math.max(0, Math.round((netSecond[1]! - netFirst[1]!) / 0.2)),
        }
      : { netRx: null, netTx: null };
  const first = counters[0];
  const second = counters[1];
  const delta = first && second ? second.total - first.total : 0;
  const cpu =
    first && second && delta > 0 && second.idle >= first.idle
      ? Math.round(Math.max(0, Math.min(100, 100 * (1 - (second.idle - first.idle) / delta))))
      : null;
  const loads = numbers(load);
  // 每核与分网卡都是「睡前一次、睡后一次」，按标签配对，不能拿两次不同读数的顺序硬猜。
  const coreUtilization = perCoreUtilization(cpuLines);
  const interfaces = perInterfaceRates(cpuLines);
  const gpu = parseGpuLine(cpuLines.find((line) => line.startsWith("gpu ")));
  const sensors = parseSensors(cpuLines, gpu);
  const uptimeLine = cpuLines.find((line) => line.startsWith("uptime "));
  const uptimeSeconds = uptimeLine ? Number(uptimeLine.slice(7).trim()) : Number.NaN;
  return {
    counters: second,
    metrics: {
      host: hostname || alias,
      alias,
      online: true,
      platform: platform ?? "",
      cores: Number(cores) || 0,
      load: [loads[0] || 0, loads[1] || 0, loads[2] || 0] as const,
      netRx: netRates.netRx,
      netTx: netRates.netTx,
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
      ...(coreUtilization.length > 0 ? { coreUtilization } : {}),
      ...(interfaces.length > 0 ? { interfaces } : {}),
      ...gpu,
      ...(sensors.length > 0 ? { sensors } : {}),
      ...(Number.isFinite(uptimeSeconds) && uptimeSeconds > 0
        ? { uptimeSeconds: Math.round(uptimeSeconds) }
        : {}),
    },
  };
}

interface Ticks {
  readonly idle: number;
  readonly total: number;
}

function tickSample(line: string): Ticks | null {
  const ticks = line.split(/\s+/).slice(1, 9).map(Number);
  if (ticks.length < 5 || !ticks.every(Number.isFinite)) return null;
  // Linux guest time is already included in user/nice; do not count it twice.
  return {
    total: ticks.reduce((sum, tick) => sum + tick, 0),
    idle: (ticks[3] ?? 0) + (ticks[4] ?? 0),
  };
}

/** 同一核的两行按出现顺序配对；只出现一次的核（热插拔）直接丢弃。 */
function perCoreUtilization(lines: ReadonlyArray<string>): readonly number[] {
  const samples = new Map<string, Ticks[]>();
  for (const line of lines) {
    if (!/^cpu\d+\s/.test(line)) continue;
    const label = line.split(/\s+/)[0];
    const sample = tickSample(line);
    if (!label || !sample) continue;
    const existing = samples.get(label);
    if (existing) existing.push(sample);
    else samples.set(label, [sample]);
  }
  const values: number[] = [];
  for (const [, pair] of [...samples.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "en", { numeric: true }),
  )) {
    const [first, second] = pair;
    if (!first || !second) continue;
    const delta = second.total - first.total;
    if (delta <= 0 || second.idle < first.idle) continue;
    values.push(
      Math.round(Math.max(0, Math.min(100, 100 * (1 - (second.idle - first.idle) / delta)))),
    );
  }
  return values;
}

/** 探针固定睡 0.2s，两次读数差分得每张卡的速率；rxTotal/txTotal 给累计值。 */
function perInterfaceRates(lines: ReadonlyArray<string>) {
  const samples = new Map<string, Array<readonly [number, number]>>();
  for (const line of lines) {
    if (!line.startsWith("iface ")) continue;
    const [, name, rx, tx] = line.split(/\s+/);
    const rxTotal = Number(rx);
    const txTotal = Number(tx);
    if (!name || !Number.isFinite(rxTotal) || !Number.isFinite(txTotal)) continue;
    const existing = samples.get(name);
    if (existing) existing.push([rxTotal, txTotal] as const);
    else samples.set(name, [[rxTotal, txTotal] as const]);
  }
  const interfaces: Array<HostNetworkInterface> = [];
  for (const [name, pair] of samples) {
    const last = pair.at(-1);
    if (!last) continue;
    const first = pair[0];
    const rate = (index: 0 | 1) =>
      pair.length >= 2 && first
        ? Math.max(0, Math.round((last[index] - first[index]) / 0.2))
        : null;
    interfaces.push({
      name,
      rxTotal: last[0],
      txTotal: last[1],
      rxPerSecond: rate(0),
      txPerSecond: rate(1),
    });
  }
  return interfaces;
}

/** `gpu Name, util, temp, memUsedMiB, memTotalMiB`；没装 nvidia-smi 就没这行。 */
function parseGpuLine(line: string | undefined) {
  if (!line) return null;
  const [name, util, temp, usedMiB, totalMiB] = line
    .slice(4)
    .split(",")
    .map((part) => part.trim());
  if (!name) return null;
  const gpu = Number(util);
  const celsius = Number(temp);
  const used = Number(usedMiB);
  const total = Number(totalMiB);
  return {
    gpu: Number.isFinite(gpu) ? gpu : null,
    gpuName: name,
    ...(Number.isFinite(used) && used >= 0
      ? { gpuMemoryUsed: Math.round(used * 1024 * 1024) }
      : {}),
    ...(Number.isFinite(total) && total > 0
      ? { gpuMemoryTotal: Math.round(total * 1024 * 1024) }
      : {}),
    ...(saneCelsius(celsius) ? { gpuCelsius: celsius } : {}),
  };
}

function parseSensors(
  lines: ReadonlyArray<string>,
  gpu: { gpuName?: string; gpuCelsius?: number } | null,
): readonly HostSensorReading[] {
  const sensors: HostSensorReading[] = [];
  for (const line of lines) {
    if (!line.startsWith("sensor ")) continue;
    // type 里可能带空格（INT3400 Thermal），所以从右侧切最后一个数字。
    const match = /^(.*)\s+(-?\d+)$/.exec(line.slice(7).trim());
    if (!match?.[1] || match[2] === undefined) continue;
    const celsius = Number(match[2]) / 1000;
    if (!saneCelsius(celsius)) continue;
    const label = match[1].trim();
    sensors.push({ label, kind: sensorKind(label), celsius: roundCelsius(celsius) });
  }
  if (gpu?.gpuName && gpu.gpuCelsius !== undefined)
    sensors.push({ label: gpu.gpuName, kind: "gpu", celsius: roundCelsius(gpu.gpuCelsius) });
  return sensors;
}
