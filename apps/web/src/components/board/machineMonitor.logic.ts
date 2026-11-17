import type { EnvironmentId } from "@t3tools/contracts";
import type { HostMetricsSnapshot } from "./useHostMetrics";

export interface MonitoredMachine {
  readonly key: string;
  readonly name: string;
  readonly local: boolean;
  readonly environmentId: EnvironmentId | null;
  readonly connection: string;
  readonly reachable: boolean | null;
  readonly cpu: number | null;
  readonly memory: number | null;
  readonly disk: number | null;
  /** 字节/秒；拿不到为 null。 */
  readonly netRx: number | null;
  readonly netTx: number | null;
  /** 本机往返探测耗时毫秒；本机为 null，SSH 主机为整条探针耗时。 */
  readonly latencyMs: number | null;
  readonly sampledAt: number | null;
  readonly stale: boolean;
}
interface MonitorEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly connection: { readonly phase: string };
  readonly serverConfig: {
    readonly hostname?: string;
    readonly environment: { readonly label: string };
  } | null;
}
const keyFor = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/\.(local|lan)$/, "");
const sampleTime = (value: number | undefined, receivedAt?: number) => value ?? receivedAt ?? null;
const staleAt = (at: number | null, now: number) => at !== null && now - at > 30_000;
const percent = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
const bytesPerSecond = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;

export function monitoredMachines(
  metrics: HostMetricsSnapshot | null,
  environments: ReadonlyArray<MonitorEnvironment>,
  localEnvironmentId: EnvironmentId | null,
  now = Date.now(),
): MonitoredMachine[] {
  const matched = new Set<EnvironmentId>();
  const local = environments.find((entry) => entry.environmentId === localEnvironmentId);
  if (local) matched.add(local.environmentId);
  const machines: MonitoredMachine[] = [
    {
      key: "local",
      name: metrics?.host ?? local?.serverConfig?.hostname ?? "本机",
      local: true,
      environmentId: localEnvironmentId,
      connection: local?.connection.phase ?? "unknown",
      reachable: metrics ? true : null,
      cpu: percent(metrics?.cpu),
      memory: percent(metrics?.memPercent),
      disk: percent(metrics?.diskPercent),
      netRx: null,
      netTx: null,
      latencyMs: null,
      sampledAt: sampleTime(metrics?.sampledAt, metrics?.receivedAt),
      stale:
        metrics?.error !== undefined ||
        staleAt(sampleTime(metrics?.receivedAt, metrics?.sampledAt), now),
    },
  ];
  for (const remote of metrics?.remotes ?? []) {
    const names = new Set(
      [remote.host, remote.alias].filter((value): value is string => Boolean(value)).map(keyFor),
    );
    const candidates = environments.filter(
      (entry) =>
        entry.environmentId !== localEnvironmentId &&
        [entry.label, entry.serverConfig?.hostname, entry.serverConfig?.environment.label].some(
          (name) => name !== undefined && names.has(keyFor(name)),
        ),
    );
    const env = candidates.length === 1 ? candidates[0] : undefined;
    if (env) matched.add(env.environmentId);
    machines.push({
      key: `ssh:${remote.alias ?? remote.host}`,
      name: remote.host,
      local: false,
      environmentId: env?.environmentId ?? null,
      connection: env?.connection.phase ?? "none",
      reachable: remote.online,
      cpu: remote.online ? percent(remote.cpu) : null,
      memory: remote.online ? percent(remote.memPercent) : null,
      disk: remote.online ? percent(remote.diskPercent) : null,
      netRx: remote.online ? bytesPerSecond(remote.netRx) : null,
      netTx: remote.online ? bytesPerSecond(remote.netTx) : null,
      latencyMs: remote.online ? (remote.latencyMs ?? null) : null,
      sampledAt: remote.sampledAt ?? null,
      stale:
        metrics?.error !== undefined ||
        remote.error !== undefined ||
        staleAt(metrics?.receivedAt ?? metrics?.sampledAt ?? null, now) ||
        staleAt(
          remote.sampledAt === undefined
            ? null
            : (metrics?.receivedAt ?? now) -
                Math.max(0, (metrics?.sampledAt ?? now) - remote.sampledAt),
          now,
        ),
    });
  }
  for (const env of environments) {
    if (matched.has(env.environmentId)) continue;
    machines.push({
      key: `environment:${env.environmentId}`,
      name: env.serverConfig?.hostname ?? env.label,
      local: false,
      environmentId: env.environmentId,
      connection: env.connection.phase,
      reachable: null,
      cpu: null,
      memory: null,
      disk: null,
      netRx: null,
      netTx: null,
      latencyMs: null,
      sampledAt: null,
      stale: false,
    });
  }
  return machines;
}

export function machineConnectionLabel(machine: MonitoredMachine): string {
  if (machine.connection === "connected")
    return machine.reachable === false ? "T3 已连接 · 指标未获取" : "T3 已连接";
  if (machine.connection === "connecting" || machine.connection === "reconnecting")
    return machine.reachable ? "SSH 可访问 · T3 连接中" : "T3 连接中";
  if (machine.reachable) return machine.local ? "本机采样正常" : "SSH 可访问 · T3 未连接";
  if (machine.reachable === false) return "SSH 未连接";
  return "指标未获取";
}
