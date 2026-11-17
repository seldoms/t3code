import type { EnvironmentId } from "@t3tools/contracts";
import type { HostMetricsRates, HostMetricsSnapshot } from "./useHostMetrics";

/** 一个温度传感器读数。kind 决定阈值：电池 40°C 就该紧张，核心 40°C 属于凉快。 */
export interface MonitorSensor {
  readonly label: string;
  readonly kind: "cpu" | "gpu" | "battery" | "board";
  readonly celsius: number;
}

export interface MonitorInterface {
  readonly name: string;
  readonly rxTotal: number;
  readonly txTotal: number;
  readonly rxPerSecond: number | null;
  readonly txPerSecond: number | null;
  /** docker 网桥、veth、隧道这些不是物理网卡，默认折叠，别把 62 张卡糊用户脸上。 */
  readonly virtual: boolean;
}

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
  readonly cores: number | null;
  /** 每核真实占用，点阵视图按这个画，不拿总占用假装分解。 */
  readonly coreUtilization: readonly number[];
  readonly cpuHistory: readonly number[];
  readonly uptimeSeconds: number | null;
  readonly memUsedBytes: number | null;
  readonly memTotalBytes: number | null;
  readonly diskUsedBytes: number | null;
  readonly diskTotalBytes: number | null;
  readonly diskRead: number | null;
  readonly diskWrite: number | null;
  readonly netRxTotal: number | null;
  readonly netTxTotal: number | null;
  readonly gpu: number | null;
  readonly gpuName: string | null;
  readonly gpuMemoryUsed: number | null;
  readonly gpuMemoryTotal: number | null;
  readonly gpuMemoryPercent: number | null;
  readonly sensors: readonly MonitorSensor[];
  readonly interfaces: readonly MonitorInterface[];
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
const bytes = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const VIRTUAL_INTERFACE =
  /^(br-|veth|docker|virbr|vnet|tun|tap|vmnet|bridge|utun|awdl|llw|anpi|gif|stf|ap\d|vlan|nan)/i;

const EMPTY_DETAIL = {
  cores: null,
  coreUtilization: [],
  cpuHistory: [],
  uptimeSeconds: null,
  memUsedBytes: null,
  memTotalBytes: null,
  diskUsedBytes: null,
  diskTotalBytes: null,
  diskRead: null,
  diskWrite: null,
  netRxTotal: null,
  netTxTotal: null,
  gpu: null,
  gpuName: null,
  gpuMemoryUsed: null,
  gpuMemoryTotal: null,
  gpuMemoryPercent: null,
  sensors: [],
  interfaces: [],
} satisfies Omit<
  MonitoredMachine,
  | "key"
  | "name"
  | "local"
  | "environmentId"
  | "connection"
  | "reachable"
  | "cpu"
  | "memory"
  | "disk"
  | "netRx"
  | "netTx"
  | "latencyMs"
  | "sampledAt"
  | "stale"
>;

function monitorSensors(sensors: HostMetricsSnapshot["sensors"]): readonly MonitorSensor[] {
  return (sensors ?? []).flatMap((sensor) =>
    typeof sensor?.celsius === "number" && Number.isFinite(sensor.celsius)
      ? [{ label: sensor.label, kind: sensor.kind, celsius: sensor.celsius }]
      : [],
  );
}

function monitorInterfaces(
  interfaces: HostMetricsSnapshot["interfaces"],
): readonly MonitorInterface[] {
  return (interfaces ?? []).flatMap((entry) =>
    typeof entry?.name === "string"
      ? [
          {
            name: entry.name,
            rxTotal: entry.rxTotal ?? 0,
            txTotal: entry.txTotal ?? 0,
            // 远端探针自己睡 0.2s 差分，直接给速率；本机只有累计值，
            // 单卡速率留空，不拿整机速率冒充每张卡。
            rxPerSecond: bytesPerSecond(entry.rxPerSecond),
            txPerSecond: bytesPerSecond(entry.txPerSecond),
            virtual: VIRTUAL_INTERFACE.test(entry.name),
          },
        ]
      : [],
  );
}

const percentList = (values: readonly number[] | undefined): readonly number[] =>
  (values ?? []).flatMap((value) => {
    const parsed = percent(value);
    return parsed === null ? [] : [parsed];
  });

/** GPU 显存占比只有独显（给了总量）才算得出来；Apple Silicon 统一内存不编百分比。 */
function gpuMemoryPercent(used: number | null, total: number | null): number | null {
  if (used === null || total === null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}

export function monitoredMachines(
  metrics: HostMetricsSnapshot | null,
  environments: ReadonlyArray<MonitorEnvironment>,
  localEnvironmentId: EnvironmentId | null,
  now = Date.now(),
  rates: HostMetricsRates | null = null,
): MonitoredMachine[] {
  const matched = new Set<EnvironmentId>();
  const local = environments.find((entry) => entry.environmentId === localEnvironmentId);
  if (local) matched.add(local.environmentId);
  const localGpuMemoryUsed = bytes(metrics?.gpuMemoryUsed);
  const localGpuMemoryTotal = bytes(metrics?.gpuMemoryTotal);
  const machines: MonitoredMachine[] = [
    {
      ...EMPTY_DETAIL,
      key: "local",
      name: metrics?.host ?? local?.serverConfig?.hostname ?? "本机",
      local: true,
      environmentId: localEnvironmentId,
      connection: local?.connection.phase ?? "unknown",
      reachable: metrics ? true : null,
      cpu: percent(metrics?.cpu),
      memory: percent(metrics?.memPercent),
      disk: percent(metrics?.diskPercent),
      netRx: bytesPerSecond(rates?.netRx),
      netTx: bytesPerSecond(rates?.netTx),
      latencyMs: null,
      sampledAt: sampleTime(metrics?.sampledAt, metrics?.receivedAt),
      stale:
        metrics?.error !== undefined ||
        staleAt(sampleTime(metrics?.receivedAt, metrics?.sampledAt), now),
      cores: metrics?.cores ?? null,
      coreUtilization: percentList(metrics?.coreUtilization),
      cpuHistory: percentList(metrics?.cpuHistory),
      uptimeSeconds: metrics?.uptimeSeconds ?? null,
      memUsedBytes: bytes(metrics?.memUsed),
      memTotalBytes: bytes(metrics?.memTotal),
      diskUsedBytes: bytes(metrics?.diskUsed),
      diskTotalBytes: bytes(metrics?.diskTotal),
      diskRead: bytesPerSecond(rates?.diskRead),
      diskWrite: bytesPerSecond(rates?.diskWrite),
      netRxTotal: bytes(metrics?.netRxTotal),
      netTxTotal: bytes(metrics?.netTxTotal),
      gpu: percent(metrics?.gpu),
      gpuName: metrics?.gpuName ?? null,
      gpuMemoryUsed: localGpuMemoryUsed,
      gpuMemoryTotal: localGpuMemoryTotal,
      gpuMemoryPercent: gpuMemoryPercent(localGpuMemoryUsed, localGpuMemoryTotal),
      sensors: monitorSensors(metrics?.sensors),
      interfaces: monitorInterfaces(metrics?.interfaces),
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
    const gpuMemoryUsed = remote.online ? bytes(remote.gpuMemoryUsed) : null;
    const gpuMemoryTotal = remote.online ? bytes(remote.gpuMemoryTotal) : null;
    machines.push({
      ...EMPTY_DETAIL,
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
      cores: remote.online ? (remote.cores ?? null) : null,
      coreUtilization: remote.online ? percentList(remote.coreUtilization) : [],
      cpuHistory: remote.online ? percentList(remote.cpuHistory) : [],
      uptimeSeconds: remote.online ? (remote.uptimeSeconds ?? null) : null,
      memUsedBytes: remote.online ? bytes(remote.memUsed) : null,
      memTotalBytes: remote.online ? bytes(remote.memTotal) : null,
      diskUsedBytes: remote.online ? bytes(remote.diskUsed) : null,
      diskTotalBytes: remote.online ? bytes(remote.diskTotal) : null,
      gpu: remote.online ? percent(remote.gpu) : null,
      gpuName: remote.online ? (remote.gpuName ?? null) : null,
      gpuMemoryUsed,
      gpuMemoryTotal,
      gpuMemoryPercent: gpuMemoryPercent(gpuMemoryUsed, gpuMemoryTotal),
      sensors: remote.online ? monitorSensors(remote.sensors) : [],
      interfaces: remote.online ? monitorInterfaces(remote.interfaces) : [],
    });
  }
  for (const env of environments) {
    if (matched.has(env.environmentId)) continue;
    machines.push({
      ...EMPTY_DETAIL,
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

export type MonitorLevel = "ok" | "warn" | "bad" | "unknown";

export const loadLevel = (value: number | null): MonitorLevel =>
  value === null ? "unknown" : value >= 90 ? "bad" : value >= 75 ? "warn" : "ok";

/** 延迟：200ms 起手感变差，1s 以上基本没法交互。 */
export const latencyLevel = (value: number | null): MonitorLevel =>
  value === null ? "unknown" : value >= 1000 ? "bad" : value >= 200 ? "warn" : "ok";

/** 电池和核心不是一个量级：锂电 45°C 已在损伤区，CPU 90°C 才开始降频。 */
export const temperatureLevel = (sensor: MonitorSensor | null): MonitorLevel => {
  if (sensor === null) return "unknown";
  const warn = sensor.kind === "battery" ? 40 : 80;
  const bad = sensor.kind === "battery" ? 45 : 90;
  return sensor.celsius >= bad ? "bad" : sensor.celsius >= warn ? "warn" : "ok";
};

/** 最该盯的温度：核心/GPU 优先，其次板载；电池单独看，不跟核心抢那一行。 */
export function hottestSensor(sensors: ReadonlyArray<MonitorSensor>): MonitorSensor | null {
  const core = sensors.filter((sensor) => sensor.kind === "cpu" || sensor.kind === "gpu");
  const pool = core.length > 0 ? core : sensors.filter((sensor) => sensor.kind === "board");
  return pool.reduce<MonitorSensor | null>(
    (hottest, sensor) => (hottest === null || sensor.celsius > hottest.celsius ? sensor : hottest),
    null,
  );
}

export function batterySensor(sensors: ReadonlyArray<MonitorSensor>): MonitorSensor | null {
  return sensors.find((sensor) => sensor.kind === "battery") ?? null;
}

export function gpuNeedsAttention(machine: MonitoredMachine): boolean {
  if (machine.gpu !== null && machine.gpu >= 75) return true;
  if (machine.gpuMemoryPercent !== null && machine.gpuMemoryPercent >= 90) return true;
  const gpuSensor = machine.sensors.find((sensor) => sensor.kind === "gpu") ?? null;
  return gpuSensor !== null && temperatureLevel(gpuSensor) !== "ok";
}

/**
 * 常态不显示状态文字：数据在刷新就说明连着。只有真出问题才值得一行告警。
 * 返回 null 表示一切正常，UI 什么都不显示。
 */
export function monitorAlert(machine: MonitoredMachine): string | null {
  if (machine.reachable === false)
    return machine.connection === "connected" ? "指标未获取" : "SSH 未连接";
  if (machine.stale) return "旧快照 · 指标已过期";
  if (machine.connection === "connecting" || machine.connection === "reconnecting")
    return "T3 连接中";
  if (machine.cpu === null && machine.memory === null && machine.disk === null) return "指标未获取";
  return null;
}
