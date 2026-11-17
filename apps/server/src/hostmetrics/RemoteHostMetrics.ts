// @effect-diagnostics nodeBuiltinImport:off globalConsole:off -- SSH边界记录采样时刻；探针异步限并发。
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import * as Clock from "effect/Clock";
import { parseRemoteProbe } from "./remoteProbe.ts";
import * as Effect from "effect/Effect";

import type { HostMetrics } from "./HostMetrics.ts";

const execFileAsync = NodeUtil.promisify(NodeChildProcess.execFile);

/**
 * 远程主机负载：只读、按需、缓存 10 秒。主机来自 ssh config 的 private 标记，
 * production 一律不碰。一条 POSIX shell 探针，远端无需 node；限并发 3 + single-flight。
 */

const SSH_BIN = NodeFS.existsSync("/usr/bin/ssh") ? "/usr/bin/ssh" : "ssh";
const CACHE_MS = 10_000;
const SSH_TIMEOUT_MS = 5000;

/**
 * 一条命令拿齐需要的数字，远端只输出 KEY=VALUE。
 * 前 6 行按位置解析（hostname/uname/cores/load/mem/disk），其余一律带前缀，
 * 新增指标只能往后追加，不能插队。末尾必须 true：热力循环未命中时测试失败，
 * 会把整条探针的退出码拖成非 0，execFile 直接 reject → 主机被误判离线。
 */
const PROBE = [
  "hostname",
  "uname -s",
  "nproc 2>/dev/null || sysctl -n hw.ncpu",
  `cat /proc/loadavg 2>/dev/null | cut -d" " -f1-3 || sysctl -n vm.loadavg | tr -d "{}"`,
  'cat /proc/meminfo 2>/dev/null | awk "/MemTotal/{t=\\$2}/MemAvailable/{a=\\$2}END{if(t>0)print t\\",\\"(t-a);else print \\"0,0\\"}" || echo "0,0"',
  `df -k / | tail -1 | awk '{print $2 "," $3 "," $4}'`,
  `grep "^cpu " /proc/stat 2>/dev/null | head -1`,
  `grep -E "^cpu[0-9]+ " /proc/stat 2>/dev/null`,
  `awk '!/lo:/&&/:/{rx+=$2;tx+=$10}END{print "net",rx+0,tx+0}' /proc/net/dev 2>/dev/null`,
  `awk '!/lo:/&&/:/{gsub(/:/,"",$1);print "iface",$1,$2,$10}' /proc/net/dev 2>/dev/null`,
  `if command -v python3 >/dev/null 2>&1; then python3 -c "import time;time.sleep(0.2)"; else sleep 1; fi`,
  `grep "^cpu " /proc/stat 2>/dev/null | head -1`,
  `grep -E "^cpu[0-9]+ " /proc/stat 2>/dev/null`,
  `awk '!/lo:/&&/:/{rx+=$2;tx+=$10}END{print "net",rx+0,tx+0}' /proc/net/dev 2>/dev/null`,
  `awk '!/lo:/&&/:/{gsub(/:/,"",$1);print "iface",$1,$2,$10}' /proc/net/dev 2>/dev/null`,
  // GPU 与温度只支持 Linux 远端：/sys/class/thermal 不需要 lm-sensors，nvidia-smi 没装就缺省。
  `if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi --query-gpu=name,utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits 2>/dev/null | sed "s/^/gpu /"; fi`,
  `for z in /sys/class/thermal/thermal_zone*; do [ -r "$z/temp" ] && echo "sensor $(cat $z/type 2>/dev/null) $(cat $z/temp 2>/dev/null)"; done`,
  `cut -d" " -f1 /proc/uptime 2>/dev/null | sed "s/^/uptime /"`,
  "true",
].join("; ");

export interface RemoteHostMetrics extends Omit<
  Partial<HostMetrics>,
  "memPercent" | "diskPercent"
> {
  readonly netRx?: number | null;
  readonly netTx?: number | null;
  readonly latencyMs?: number | null;
  readonly alias?: string;
  readonly memPercent?: number | null;
  readonly diskPercent?: number | null;
  readonly host: string;
  readonly online: boolean;
  readonly error?: string;
  readonly sampledAt?: number;
}

interface CacheEntry {
  readonly at: number;
  readonly value: RemoteHostMetrics;
  readonly attemptedAt?: number;
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

async function probeHost(
  alias: string,
  currentTimeMillis: () => number,
): Promise<RemoteHostMetrics> {
  const startedAt = currentTimeMillis();
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
    const { metrics: parsed } = parseRemoteProbe(output, alias);
    console.log(`[hostmetrics] ${alias} → ${parsed.host}`);
    return {
      ...parsed,
      latencyMs: Math.max(1, currentTimeMillis() - startedAt),
      sampledAt: currentTimeMillis(),
    };
  } catch (error) {
    console.warn(`[hostmetrics] ${alias} 探测失败`, error instanceof Error ? error.message : error);
    return {
      host: alias,
      alias,
      online: false,
      sampledAt: currentTimeMillis(),
      error: error instanceof Error ? error.message.slice(0, 120) : "probe-failed",
    };
  }
}

/** 限并发探测：离线主机再多也不会叠加出几十条 ssh。 */
async function probeAll(
  hosts: ReadonlyArray<string>,
  currentTimeMillis: () => number,
): Promise<RemoteHostMetrics[]> {
  const results = new Array<RemoteHostMetrics>(hosts.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(3, hosts.length) }, async () => {
    while (next < hosts.length) {
      const index = next;
      next += 1;
      const alias = hosts[index];
      if (alias !== undefined) results[index] = await probeHost(alias, currentTimeMillis);
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

  const clock = yield* Clock.Clock;
  const currentTimeMillis = () => clock.currentTimeMillisUnsafe();
  const now = currentTimeMillis();
  const missing = hosts.filter((host) => {
    const entry = cache.get(host);
    return !entry || now - (entry.attemptedAt ?? entry.at) >= CACHE_MS;
  });

  if (missing.length > 0) {
    // single-flight：并发请求共用一轮探测，缓存写回按别名存。
    if (!inFlight) {
      const batch = missing;
      inFlight = probeAll(batch, currentTimeMillis)
        .then((results) => {
          const stampedAt = currentTimeMillis();
          for (const [index, result] of results.entries()) {
            const alias = batch[index];
            // 缓存一定要按「别名」存：探测成功时 value.host 是对方的 hostname，
            // 用它当键会让别名查不到、主机在看板上静默消失（这个 bug 现场抓到的）。
            if (alias !== undefined) {
              const old = cache.get(alias);
              cache.set(alias, {
                at: result.online ? stampedAt : (old?.at ?? stampedAt),
                attemptedAt: stampedAt,
                value: result.online
                  ? result
                  : old?.value
                    ? { ...old.value, error: result.error ?? "probe-failed" }
                    : result,
              });
            }
          }
        })
        .finally(() => {
          inFlight = null;
        });
    }
    const pending = inFlight;
    if (pending) yield* Effect.promise(() => pending);
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
