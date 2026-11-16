// @effect-diagnostics nodeBuiltinImport:off globalConsole:off -- 探针异步跑一条 ssh + 解析行文本，限并发 + single-flight，不阻塞主线程。
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";

import type { HostMetrics } from "./HostMetrics.ts";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

/**
 * 远程主机负载：只读、按需、缓存 10 秒。主机来自 ssh config 的 private 标记，
 * production 一律不碰。一条 POSIX shell 探针，远端无需 node；限并发 3 + single-flight。
 */

const SSH_BIN = NodeFS.existsSync("/usr/bin/ssh") ? "/usr/bin/ssh" : "ssh";
const CACHE_MS = 10_000;
const SSH_TIMEOUT_MS = 2500;

/** 一条命令拿齐需要的数字，远端只输出 KEY=VALUE。 */
const PROBE = [
  "hostname",
  "uname -s",
  "nproc 2>/dev/null || sysctl -n hw.ncpu",
  'cat /proc/loadavg 2>/dev/null | cut -d" " -f1-3 || sysctl -n vm.loadavg | tr -d "{}"',
  'cat /proc/meminfo 2>/dev/null | awk "/MemTotal/{t=\\$2}/MemAvailable/{a=\\$2}END{if(t>0)print t\\",\\"(t-a);else print \\"0,0\\"}" || echo "0,0"',
  'df -k / | tail -1 | awk "{print \\$2\\",\\"\\$3}"',
  'grep "cpu " /proc/stat 2>/dev/null | head -1',
  "sysctl -n vm_stat 2>/dev/null | head -5",
].join("; ");

export interface RemoteHostMetrics extends Partial<HostMetrics> {
  readonly host: string;
  readonly online: boolean;
  readonly error?: string;
}

interface CacheEntry {
  readonly at: number;
  readonly value: RemoteHostMetrics;
}

const cache = new Map<string, CacheEntry>();

/** 读 ssh config 里标了 private 的 Host 别名。 */
export function readPrivateSshHosts(): ReadonlyArray<string> {
  try {
    const configPath = NodePath.join(NodeOS.homedir(), ".ssh", "config");
    const text = NodeFS.readFileSync(configPath, "utf8");
    const hosts: string[] = [];
    let pendingTag: string | null = null;
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      const tag = /^#\s*tag:\s*(\S+)/.exec(line);
      if (tag?.[1]) {
        pendingTag = tag[1];
        continue;
      }
      const host = /^Host\s+(\S+)/.exec(line);
      if (host?.[1] && host[1] !== "*") {
        if (pendingTag === "private") hosts.push(host[1]);
        pendingTag = null;
      }
    }
    return hosts;
  } catch (error) {
    console.warn("[hostmetrics] 读 ~/.ssh/config 失败", error);
    return [];
  }
}

function parseProbe(output: string, alias: string): RemoteHostMetrics {
  const lines = output
    .trim()
    .split("\n")
    .map((line) => line.trim());
  const [hostnameLine, platform, cores, load, mem, disk] = lines;

  const [load1 = "0", load5 = "0", load15 = "0"] = (load ?? "").split(/\s+/);
  const [memTotalKb = "0", memUsedKb = "0"] = (mem ?? "0,0").split(",");
  const [diskTotalKb = "0", diskUsedKb = "0"] = (disk ?? "0,0").split(",");

  const memTotal = Number(memTotalKb) * 1024;
  const memUsed = Number(memUsedKb) * 1024;
  const diskTotal = Number(diskTotalKb) * 1024;
  const diskUsed = Number(diskUsedKb) * 1024;

  return {
    host: hostnameLine || alias,
    online: true,
    platform: platform ?? "",
    cores: Number(cores ?? 0) || 0,
    load: [Number(load1) || 0, Number(load5) || 0, Number(load15) || 0],
    memTotal,
    memUsed,
    memPercent: memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0,
    diskTotal,
    diskUsed,
    diskPercent: diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0,
    // CPU 百分比需要两次采样，跨 ssh 不划算；远端只给负载均值，由前端按核数换算展示。
    cpu: null,
  };
}

async function probeHost(alias: string): Promise<RemoteHostMetrics> {
  try {
    const { stdout: output } = await execFileAsync(
      SSH_BIN,
      [
        "-o",
        "BatchMode=yes",
        "-o",
        `ConnectTimeout=${Math.ceil(SSH_TIMEOUT_MS / 1000)}`,
        "-o",
        "StrictHostKeyChecking=accept-new",
        alias,
        PROBE,
      ],
      { encoding: "utf8", timeout: SSH_TIMEOUT_MS },
    );
    const parsed = parseProbe(output, alias);
    console.log(`[hostmetrics] ${alias} → ${parsed.host}`);
    return parsed;
  } catch (error) {
    console.warn(`[hostmetrics] ${alias} 探测失败`, error instanceof Error ? error.message : error);
    return {
      host: alias,
      online: false,
      error: error instanceof Error ? error.message.slice(0, 120) : "probe-failed",
    };
  }
}

/** 限并发探测：离线主机再多也不会叠加出几十条 ssh。 */
async function probeAll(hosts: ReadonlyArray<string>): Promise<RemoteHostMetrics[]> {
  const results = new Array<RemoteHostMetrics>(hosts.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(3, hosts.length) }, async () => {
    while (next < hosts.length) {
      const index = next;
      next += 1;
      const alias = hosts[index];
      if (alias !== undefined) results[index] = await probeHost(alias);
    }
  });
  await Promise.all(workers);
  return results;
}

let inFlight: Promise<void> | null = null;

/** 采一轮所有 private 主机的负载；单台失败只标记离线。 */
export const sampleRemoteHosts = Effect.fn("hostMetrics.remotes")(function* () {
  const hosts = readPrivateSshHosts();
  if (hosts.length === 0) return [] as ReadonlyArray<RemoteHostMetrics>;

  const now = Number(yield* Clock.currentTimeMillis);
  const missing = hosts.filter((host) => {
    const entry = cache.get(host);
    return !entry || now - entry.at > CACHE_MS;
  });

  if (missing.length > 0) {
    // single-flight：并发请求共用一轮探测，缓存写回按别名存。
    if (!inFlight) {
      const batch = missing;
      inFlight = probeAll(batch)
        .then((results) => {
          const stampedAt = Date.now();
          for (const [index, result] of results.entries()) {
            const alias = batch[index];
            // 缓存一定要按「别名」存：探测成功时 value.host 是对方的 hostname，
            // 用它当键会让别名查不到、主机在看板上静默消失（这个 bug 现场抓到的）。
            if (alias !== undefined) cache.set(alias, { at: stampedAt, value: result });
          }
        })
        .finally(() => {
          inFlight = null;
        });
    }
    yield* Effect.promise(() => inFlight);
  }

  const seen = new Set<string>();
  const unique: RemoteHostMetrics[] = [];
  for (const host of hosts) {
    // 配置里有的主机一定出现在结果里：采不到就带 error，别静默消失。
    const value = cache.get(host)?.value ?? {
      host,
      online: false,
      error: "not-sampled",
    };
    // gitserver 和 ubuntu 可能指向同一台机器：按对方 hostname 去重。
    const key = value.online ? value.host : `offline:${host}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique;
});
