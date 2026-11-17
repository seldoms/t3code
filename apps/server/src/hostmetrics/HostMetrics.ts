// @effect-diagnostics nodeBuiltinImport:off globalDate:off -- 采样器异步跑 ioreg/statfs，Date.now 做 GPU 缓存；子进程不走主线程同步 IO。
import * as NodeChildProcess from "node:child_process";
import * as NodeOS from "node:os";
import * as NodeFSP from "node:fs/promises";
import * as NodeUtil from "node:util";

import * as Effect from "effect/Effect";
import * as HostProcess from "@t3tools/shared/HostProcess";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

/**
 * 本机负载采样：无订阅者不采样、不留历史，每次请求现采。
 * GPU 走 ioreg 缓存 5 秒；CPU 需两次采样求差，无基线时返回 null。
 */

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
  readonly uptimeSeconds: number;
  /** 累计字节：客户端一阶差分出速率；拿不到为 undefined，不编数字。 */
  readonly netRxTotal?: number;
  readonly netTxTotal?: number;
  readonly diskReadTotal?: number;
  readonly diskWriteTotal?: number;
}

interface CpuSample {
  readonly idle: number;
  readonly total: number;
}

let previousCpu: CpuSample | null = null;
let gpuCache: { readonly at: number; readonly value: number | null } | null = null;

function cpuSample(): CpuSample {
  let idle = 0;
  let total = 0;
  for (const cpu of NodeOS.cpus()) {
    const times = cpu.times;
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

/** macOS 上用 ioreg 读 GPU 利用率；拿不到就返回 null，不编造数字。 */
async function readGpuMac(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ioreg", ["-r", "-d", "1", "-c", "IOAccelerator"], {
      encoding: "utf8",
      timeout: 2000,
    });
    const match = /"Device Utilization %"=(\d+)/.exec(stdout);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

async function readGpuLinux(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(
      "nvidia-smi",
      ["--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
      { encoding: "utf8", timeout: 2000 },
    );
    const first = stdout.trim().split("\n")[0];
    const value = Number(first);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
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

let gpuInFlight: Promise<number | null> | null = null;

async function sampleGpu(platform: string): Promise<number | null> {
  const now = Date.now();
  if (gpuCache && now - gpuCache.at < 5000) return gpuCache.value;
  // single-flight：并发请求共用一次 ioreg/nvidia-smi，不叠加子进程。
  if (!gpuInFlight) {
    gpuInFlight = (platform === "darwin" ? readGpuMac() : readGpuLinux())
      .then((value) => {
        gpuCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        gpuInFlight = null;
      });
  }
  return gpuInFlight;
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

  const cpu =
    current.total <= previous.total
      ? null
      : Math.round(
          100 * (1 - (current.idle - previous.idle) / Math.max(1, current.total - previous.total)),
        );

  const platform = yield* HostProcess.Platform;
  const architecture = yield* HostProcess.Architecture;
  const memTotal = NodeOS.totalmem();
  const macUsed =
    platform === "darwin" ? yield* Effect.promise(() => readMacMemoryUsed(memTotal)) : null;
  const memUsed = macUsed ?? memTotal - NodeOS.freemem();
  const disk = yield* Effect.promise(readDisk);
  const load = NodeOS.loadavg();
  const totals = yield* Effect.promise(() => readIoTotals(platform));

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
    gpu: yield* Effect.promise(() => sampleGpu(platform)),
    uptimeSeconds: Math.round(NodeOS.uptime()),
    ...totals,
  };

  return metrics;
});

/** Linux 读 /proc 计数器；macOS 用 netstat -ib 与 ioreg IODiskSwapBlockDevice；拿不到就缺省，不编数字。 */
async function readIoTotals(
  platform: string,
): Promise<Pick<HostMetrics, "netRxTotal" | "netTxTotal" | "diskReadTotal" | "diskWriteTotal">> {
  try {
    if (platform === "linux") {
      const [netStat, diskStat] = await Promise.all([
        NodeFSP.readFile("/proc/net/dev", "utf8").catch(() => ""),
        NodeFSP.readFile("/proc/diskstats", "utf8").catch(() => ""),
      ]);
      let netRxTotal = 0;
      let netTxTotal = 0;
      for (const line of netStat.split("\n")) {
        const columns = line.trim().split(/[|:]*\s+/);
        const name = columns[0]?.replace(":", "");
        if (!name || name === "lo") continue;
        netRxTotal += Number(columns[1]) || 0;
        netTxTotal += Number(columns[9]) || 0;
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
      return { netRxTotal, netTxTotal, diskReadTotal, diskWriteTotal };
    }
    if (platform === "darwin") {
      const [{ stdout: netstat }, { stdout: ioreg }] = await Promise.all([
        execFileAsync("netstat", ["-ib"], { encoding: "utf8", timeout: 2000 }).catch(() => ({
          stdout: "",
        })),
        execFileAsync("ioreg", ["-r", "-d", "1", "-w", "0", "-c", "IOBlockStorageDriver"], {
          encoding: "utf8",
          timeout: 2000,
        }).catch(() => ({ stdout: "" })),
      ]);
      let netRxTotal = 0;
      let netTxTotal = 0;
      for (const line of netstat.split("\n").slice(1)) {
        const columns = line.trim().split(/\s+/);
        const name = columns[0];
        if (
          !name ||
          name.startsWith("lo") ||
          name.startsWith("awdl") ||
          name.startsWith("llw") ||
          name.startsWith("bridge") ||
          name.startsWith("utun") ||
          name.startsWith("anon")
        )
          continue;
        netRxTotal += Number(columns[6]) || 0;
        netTxTotal += Number(columns[9]) || 0;
      }
      let diskReadTotal = 0;
      let diskWriteTotal = 0;
      const readBytes = /"Bytes \(Read\)"=(\d+)/.exec(ioreg);
      const writeBytes = /"Bytes \(Write\)"=(\d+)/.exec(ioreg);
      if (readBytes && writeBytes) {
        diskReadTotal = Number(readBytes[1]);
        diskWriteTotal = Number(writeBytes[1]);
      }
      return { netRxTotal, netTxTotal, diskReadTotal, diskWriteTotal };
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
