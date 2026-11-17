// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- 采样器异步跑 ioreg/statfs，Date.now 做 GPU 缓存；子进程不走主线程同步 IO。
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodeFSP from "node:fs/promises";
import * as NodeUtil from "node:util";

import * as Effect from "effect/Effect";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { roundCelsius, saneCelsius, sensorKind, type HostSensorReading } from "./sensors.ts";

export type { HostSensorReading } from "./sensors.ts";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

/**
 * 本机负载采样：无订阅者不采样、不留历史，每次请求现采。
 * GPU 与温度传感器走 5 秒缓存（子进程贵）；CPU 需两次采样求差，无基线时返回 null。
 * 拿不到的指标一律缺省，不编数字：macOS 无 sudo 读不到 CPU/GPU 核心温度，只有电池温度。
 */

/** 单张网卡的累计字节；速率由客户端一阶差分算。 */
export interface HostNetworkInterface {
  readonly name: string;
  readonly rxTotal: number;
  readonly txTotal: number;
  /** SSH 远端探针直接给速率（它自己睡 0.2s 差分）；本机缺省，由客户端差分。 */
  readonly rxPerSecond?: number | null;
  readonly txPerSecond?: number | null;
}

export interface HostMetrics {
  readonly host: string;
  readonly platform: string;
  readonly cores: number;
  readonly cpu: number | null;
  readonly load: readonly [number, number, number];
  readonly memUsed: number;
  readonly memTotal: number;
  readonly memPercent: number;
  readonly diskUsed: number;
  readonly diskTotal: number;
  readonly diskPercent: number;
  readonly gpu: number | null;
  /** 每核占用 0–100；拿不到基线时缺省。点阵视图按核算，不是拿总占用假装分解。 */
  readonly coreUtilization?: readonly number[];
  readonly gpuName?: string;
  /** GPU 已用显存字节。Apple Silicon 是统一内存，没有独立总量，不给 gpuMemoryTotal。 */
  readonly gpuMemoryUsed?: number;
  readonly gpuMemoryTotal?: number;
  readonly sensors?: readonly HostSensorReading[];
  readonly interfaces?: readonly HostNetworkInterface[];
  readonly uptimeSeconds: number;
  /** 累计字节：客户端一阶差分出速率；拿不到为 undefined，不编数字。 */
  readonly netRxTotal?: number;
  readonly netTxTotal?: number;
  readonly diskReadTotal?: number;
  readonly diskWriteTotal?: number;
}

interface CpuTimes {
  readonly idle: number;
  readonly total: number;
}

interface CpuSample extends CpuTimes {
  readonly cores: readonly CpuTimes[];
}

let previousCpu: CpuSample | null = null;

function cpuSample(): CpuSample {
  let idle = 0;
  let total = 0;
  const cores: CpuTimes[] = [];
  for (const cpu of NodeOS.cpus()) {
    const times = cpu.times;
    const coreTotal = times.user + times.nice + times.sys + times.idle + times.irq;
    cores.push({ idle: times.idle, total: coreTotal });
    idle += times.idle;
    total += coreTotal;
  }
  return { idle, total, cores };
}

function utilization(current: CpuTimes, previous: CpuTimes): number | null {
  if (current.total <= previous.total || current.idle < previous.idle) return null;
  return Math.round(
    100 * (1 - (current.idle - previous.idle) / Math.max(1, current.total - previous.total)),
  );
}

/** 慢采样：GPU 与温度传感器。子进程/ioreg 贵，5 秒内复用同一份。 */
interface SlowSample {
  readonly gpu: number | null;
  readonly gpuName?: string;
  readonly gpuMemoryUsed?: number;
  readonly gpuMemoryTotal?: number;
  readonly sensors: readonly HostSensorReading[];
}

const EMPTY_SLOW: SlowSample = { gpu: null, sensors: [] };
let slowCache: { readonly at: number; readonly value: SlowSample } | null = null;
let slowInFlight: Promise<SlowSample> | null = null;

/**
 * macOS：GPU 利用率与已用显存读 IOAccelerator；温度只有电池能无 sudo 读到。
 * CPU/GPU 核心温度要 powermetrics（sudo）或第三方 SMC 工具，这里不碰，也不编。
 */
async function readSlowMac(architecture: string): Promise<SlowSample> {
  const [accelerator, battery, chip] = await Promise.all([
    execFileAsync("ioreg", ["-r", "-d", "1", "-l", "-c", "IOAccelerator"], {
      encoding: "utf8",
      timeout: 2000,
    }).catch(() => ({ stdout: "" })),
    // 温度藏在 BatteryData 字典里，必须带 -l，否则 ioreg 只吐精简属性集。
    execFileAsync("ioreg", ["-r", "-l", "-w", "0", "-c", "AppleSmartBattery"], {
      encoding: "utf8",
      timeout: 2000,
    }).catch(() => ({ stdout: "" })),
    architecture === "arm64"
      ? execFileAsync("sysctl", ["-n", "machdep.cpu.brand_string"], {
          encoding: "utf8",
          timeout: 2000,
        }).catch(() => ({ stdout: "" }))
      : Promise.resolve({ stdout: "" }),
  ]);
  const utilizationMatch = /"Device Utilization %"=(\d+)/.exec(accelerator.stdout);
  const memoryMatch = /"In use system memory"=(\d+)/.exec(accelerator.stdout);
  // AppleSmartBattery 的 Temperature 单位是 0.01°C。
  const batteryMatch = /"Temperature"=(\d+)/.exec(battery.stdout);
  const batteryCelsius = batteryMatch ? Number(batteryMatch[1]) / 100 : Number.NaN;
  const name = chip.stdout.trim();
  const gpuMemoryUsed = memoryMatch ? Number(memoryMatch[1]) : Number.NaN;
  return {
    gpu: utilizationMatch ? Number(utilizationMatch[1]) : null,
    ...(name ? { gpuName: name } : {}),
    ...(Number.isFinite(gpuMemoryUsed) && gpuMemoryUsed > 0 ? { gpuMemoryUsed } : {}),
    sensors: saneCelsius(batteryCelsius)
      ? [{ label: "电池", kind: "battery" as const, celsius: roundCelsius(batteryCelsius) }]
      : [],
  };
}

/** Linux：独显走 nvidia-smi（没有就缺省）；温度读 /sys/class/thermal，不需要 lm-sensors。 */
async function readSlowLinux(): Promise<SlowSample> {
  const [nvidia, zones] = await Promise.all([
    execFileAsync(
      "nvidia-smi",
      [
        "--query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total",
        "--format=csv,noheader,nounits",
      ],
      { encoding: "utf8", timeout: 2000 },
    ).catch(() => ({ stdout: "" })),
    readThermalZones(),
  ]);
  const columns = (nvidia.stdout.trim().split("\n")[0] ?? "").split(",").map((part) => part.trim());
  const [name, util, temp, memoryUsed, memoryTotal] = columns;
  const gpu = Number(util);
  const gpuCelsius = Number(temp);
  // nvidia-smi 的显存单位是 MiB。
  const usedMiB = Number(memoryUsed);
  const totalMiB = Number(memoryTotal);
  const sensors = [...zones];
  if (name && saneCelsius(gpuCelsius))
    sensors.push({ label: name, kind: "gpu", celsius: gpuCelsius });
  return {
    gpu: name && Number.isFinite(gpu) ? gpu : null,
    ...(name ? { gpuName: name } : {}),
    ...(Number.isFinite(usedMiB) && usedMiB >= 0
      ? { gpuMemoryUsed: Math.round(usedMiB * 1024 * 1024) }
      : {}),
    ...(Number.isFinite(totalMiB) && totalMiB > 0
      ? { gpuMemoryTotal: Math.round(totalMiB * 1024 * 1024) }
      : {}),
    sensors,
  };
}

async function readThermalZones(): Promise<readonly HostSensorReading[]> {
  const base = "/sys/class/thermal";
  const entries = await NodeFSP.readdir(base).catch(() => [] as string[]);
  const readings = await Promise.all(
    entries
      .filter((entry) => entry.startsWith("thermal_zone"))
      .map(async (entry): Promise<HostSensorReading | null> => {
        const [type, raw] = await Promise.all([
          NodeFSP.readFile(`${base}/${entry}/type`, "utf8").catch(() => ""),
          NodeFSP.readFile(`${base}/${entry}/temp`, "utf8").catch(() => ""),
        ]);
        const celsius = Number(raw.trim()) / 1000;
        if (!saneCelsius(celsius)) return null;
        const label = type.trim() || entry;
        return { label, kind: sensorKind(label), celsius: roundCelsius(celsius) };
      }),
  );
  return readings.filter((reading): reading is HostSensorReading => reading !== null);
}

async function sampleSlow(platform: string, architecture: string): Promise<SlowSample> {
  const now = Date.now();
  if (slowCache && now - slowCache.at < 5000) return slowCache.value;
  // single-flight：并发请求共用一次 ioreg/nvidia-smi，不叠加子进程。
  if (!slowInFlight) {
    slowInFlight = (platform === "darwin" ? readSlowMac(architecture) : readSlowLinux())
      .catch(() => EMPTY_SLOW)
      .then((value) => {
        slowCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        slowInFlight = null;
      });
  }
  return slowInFlight;
}

/**
 * macOS 的 os.freemem 只算 free，把可回收的 inactive 页也算成"已用"，
 * 结果动辄 98%，看着像要炸。用 vm_stat 按 active + wired + compressed 计算才接近活动集。
 */
async function readMacMemoryUsed(total: number): Promise<number | null> {
  try {
    const { stdout: output } = await execFileAsync("vm_stat", [], {
      encoding: "utf8",
      timeout: 2000,
    });
    // 逐行解析，别用拼出来的正则：模板字符串里的反斜杠太容易在转义层丢一次。
    let pageSize = 0;
    const pages = new Map<string, number>();
    for (const line of output.split("\n")) {
      const size = /page size of (\d+) bytes/.exec(line);
      if (size?.[1]) pageSize = Number(size[1]);
      const row = /^(.*?):\s+(\d+)\.?$/.exec(line.trim());
      if (row?.[1] !== undefined && row[2] !== undefined) pages.set(row[1].trim(), Number(row[2]));
    }
    if (pageSize <= 0) return null;
    const usedPages =
      (pages.get("Pages active") ?? 0) +
      (pages.get("Pages wired down") ?? 0) +
      (pages.get("Pages occupied by compressor") ?? 0);
    const used = usedPages * pageSize;
    return used > 0 && used <= total ? used : null;
  } catch {
    return null;
  }
}

async function readDisk(): Promise<{ used: number; total: number; avail: number }> {
  try {
    const stats = await NodeFSP.statfs("/");
    const total = stats.blocks * stats.bsize;
    const free = stats.bfree * stats.bsize;
    // 容量口径跟 df 对齐：used/(used+avail)，保留块不能算进百分比。
    const avail = stats.bavail * stats.bsize;
    return { used: total - free, total, avail };
  } catch {
    return { used: 0, total: 0, avail: 0 };
  }
}

/** 采一份当前快照。CPU 需要基线，没有基线时这一项为 null。 */
export const sampleHostMetrics = Effect.fn("hostMetrics.sample")(function* () {
  let current = cpuSample();
  let previous = previousCpu;
  previousCpu = current;

  // 首个请求没有基线：隔 120ms 再采一次，别让用户盯着空的 CPU 等一个轮询周期。
  if (previous === null) {
    yield* Effect.sleep("120 millis");
    previous = current;
    current = cpuSample();
    previousCpu = current;
  }

  const cpu = utilization(current, previous);
  // 核数变了（热插拔/虚拟机改配）就不给每核数字，别拿错位的基线相减。
  const coreUtilization =
    current.cores.length === previous.cores.length
      ? current.cores
          .map((core, index) => {
            const baseline = previous.cores[index];
            return baseline ? utilization(core, baseline) : null;
          })
          .filter((value): value is number => value !== null)
      : [];

  const platform = yield* HostProcess.Platform;
  const architecture = yield* HostProcess.Architecture;
  const memTotal = NodeOS.totalmem();
  const macUsed =
    platform === "darwin" ? yield* Effect.promise(() => readMacMemoryUsed(memTotal)) : null;
  const memUsed = macUsed ?? memTotal - NodeOS.freemem();
  const disk = yield* Effect.promise(readDisk);
  const load = NodeOS.loadavg();
  const totals = yield* Effect.promise(() => readIoTotals(platform));
  const slow = yield* Effect.promise(() => sampleSlow(platform, architecture));

  const metrics: HostMetrics = {
    host: NodeOS.hostname(),
    platform: `${platform}/${architecture}`,
    cores: NodeOS.cpus().length,
    cpu,
    load: [
      Number(load[0]?.toFixed(2) ?? 0),
      Number(load[1]?.toFixed(2) ?? 0),
      Number(load[2]?.toFixed(2) ?? 0),
    ],
    memUsed,
    memTotal,
    memPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
    diskUsed: disk.used,
    diskTotal: disk.total,
    diskPercent:
      disk.total > 0 ? Math.round((disk.used / Math.max(1, disk.used + disk.avail)) * 100) : 0,
    gpu: slow.gpu,
    ...(coreUtilization.length > 0 ? { coreUtilization } : {}),
    ...(slow.gpuName !== undefined ? { gpuName: slow.gpuName } : {}),
    ...(slow.gpuMemoryUsed !== undefined ? { gpuMemoryUsed: slow.gpuMemoryUsed } : {}),
    ...(slow.gpuMemoryTotal !== undefined ? { gpuMemoryTotal: slow.gpuMemoryTotal } : {}),
    ...(slow.sensors.length > 0 ? { sensors: slow.sensors } : {}),
    uptimeSeconds: Math.round(NodeOS.uptime()),
    ...totals,
  };

  return metrics;
});

/** Linux 读 /proc 计数器；macOS 用 netstat -ib 与 ioreg IODiskSwapBlockDevice；拿不到就缺省，不编数字。 */
async function readIoTotals(
  platform: string,
): Promise<
  Pick<HostMetrics, "netRxTotal" | "netTxTotal" | "diskReadTotal" | "diskWriteTotal" | "interfaces">
> {
  try {
    if (platform === "linux") {
      const [netStat, diskStat] = await Promise.all([
        NodeFSP.readFile("/proc/net/dev", "utf8").catch(() => ""),
        NodeFSP.readFile("/proc/diskstats", "utf8").catch(() => ""),
      ]);
      let netRxTotal = 0;
      let netTxTotal = 0;
      const interfaces: HostNetworkInterface[] = [];
      for (const line of netStat.split("\n")) {
        const columns = line.trim().split(/[|:]*\s+/);
        const name = columns[0]?.replace(":", "");
        if (!name || name === "lo") continue;
        const rxTotal = Number(columns[1]) || 0;
        const txTotal = Number(columns[9]) || 0;
        netRxTotal += rxTotal;
        netTxTotal += txTotal;
        interfaces.push({ name, rxTotal, txTotal });
      }
      let diskReadTotal = 0;
      let diskWriteTotal = 0;
      for (const line of diskStat.split("\n")) {
        const columns = line.trim().split(/\s+/);
        const name = columns[2];
        if (!name || /\d$/.test(name)) continue;
        diskReadTotal += (Number(columns[5]) || 0) * 512;
        diskWriteTotal += (Number(columns[9]) || 0) * 512;
      }
      return { netRxTotal, netTxTotal, diskReadTotal, diskWriteTotal, interfaces };
    }
    if (platform === "darwin") {
      const [{ stdout: netstat }, { stdout: ioreg }] = await Promise.all([
        // -n 关掉地址反解：不带它 netstat 会去做 DNS/服务名反查，实测要 5 秒以上，
        // 直接撞破下面的 2 秒超时被 catch 吞掉，本机流量于是一直是空的。
        execFileAsync("netstat", ["-ibn"], { encoding: "utf8", timeout: 2000 }).catch(() => ({
          stdout: "",
        })),
        execFileAsync("ioreg", ["-r", "-d", "1", "-w", "0", "-c", "IOBlockStorageDriver"], {
          encoding: "utf8",
          timeout: 2000,
        }).catch(() => ({ stdout: "" })),
      ]);
      let netRxTotal = 0;
      let netTxTotal = 0;
      const interfaces: HostNetworkInterface[] = [];
      for (const line of netstat.split("\n").slice(1)) {
        const columns = line.trim().split(/\s+/);
        const name = columns[0];
        // netstat -ib 每张网卡会按地址族重复输出同一份计数器（en0 能有 5 行），
        // 全部相加会把流量算成好几倍。只认链路层那一行。
        if (!name || !columns[2]?.startsWith("<Link#")) continue;
        if (
          name.startsWith("lo") ||
          name.startsWith("awdl") ||
          name.startsWith("llw") ||
          name.startsWith("bridge") ||
          name.startsWith("utun") ||
          name.startsWith("anon")
        )
          continue;
        // 没有 MAC 的链路行（gif0/stf0）少一列 Address，下标整体前移一位。
        const offset = columns.length >= 11 ? 0 : -1;
        const rxTotal = Number(columns[6 + offset]) || 0;
        const txTotal = Number(columns[9 + offset]) || 0;
        netRxTotal += rxTotal;
        netTxTotal += txTotal;
        interfaces.push({ name, rxTotal, txTotal });
      }
      let diskReadTotal = 0;
      let diskWriteTotal = 0;
      const readBytes = /"Bytes \(Read\)"=(\d+)/.exec(ioreg);
      const writeBytes = /"Bytes \(Write\)"=(\d+)/.exec(ioreg);
      if (readBytes && writeBytes) {
        diskReadTotal = Number(readBytes[1]);
        diskWriteTotal = Number(writeBytes[1]);
      }
      return { netRxTotal, netTxTotal, diskReadTotal, diskWriteTotal, interfaces };
    }
  } catch {
    return {};
  }
  return {};
}

/** 采样器预热：让下一个请求就有 CPU 数字。 */
export const warmHostMetrics = Effect.sync(() => {
  previousCpu = cpuSample();
});
