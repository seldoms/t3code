import { memo } from "react";
import {
  batterySensor,
  gpuNeedsAttention,
  hottestSensor,
  latencyLevel,
  loadLevel,
  monitorAlert,
  temperatureLevel,
  type MonitoredMachine,
  type MonitorLevel,
} from "./machineMonitor.logic";
import type { MonitorStyle } from "./MachineMonitor";

/** ServerCat 那套读数的配色口径：绿=正常、黄=偏高、红=过高、灰=没数据。 */
const LEVEL_STROKE: Record<MonitorLevel, string> = {
  ok: "var(--color-success)",
  warn: "var(--color-warning)",
  bad: "var(--color-error)",
  unknown: "var(--color-muted-foreground)",
};
const LEVEL_TEXT: Record<MonitorLevel, string> = {
  ok: "text-foreground",
  warn: "text-warning",
  bad: "text-error",
  unknown: "text-muted-foreground",
};
const LEVEL_FILL: Record<MonitorLevel, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-error",
  unknown: "bg-muted-foreground/40",
};

const DASH = "--";

export function formatBytes(value: number | null): string {
  if (value === null) return DASH;
  const units = ["B", "K", "M", "G", "T"];
  let scaled = value;
  let unit = 0;
  while (scaled >= 1024 && unit < units.length - 1) {
    scaled /= 1024;
    unit += 1;
  }
  return `${scaled >= 100 || unit === 0 ? Math.round(scaled) : scaled.toFixed(1)}${units[unit]}`;
}

export function formatRate(value: number | null): string {
  return value === null ? DASH : `${formatBytes(value)}/s`;
}

export function formatUptime(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return DASH;
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}D ${hours}H`;
  if (hours > 0) return `${hours}H ${minutes}M`;
  return `${minutes}M`;
}

/** 环形仪表：ServerCat 的内存/硬盘读数就是这个形状，中心放百分比。 */
function Ring({
  label,
  percent,
  caption,
  level,
}: {
  label: string;
  percent: number | null;
  caption: string;
  level: MonitorLevel;
}) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const filled = percent === null ? 0 : (percent / 100) * circumference;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div className="relative size-14">
        <svg viewBox="0 0 56 56" className="size-14 -rotate-90">
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke="var(--color-muted)"
            strokeWidth="5"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={LEVEL_STROKE[level]}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center font-mono text-xs tabular-nums ${LEVEL_TEXT[level]}`}
        >
          {percent === null ? DASH : `${percent}%`}
        </span>
      </div>
      <span className="text-3xs text-muted-foreground">{label}</span>
      <span className="max-w-full truncate font-mono text-3xs tabular-nums text-muted-foreground">
        {caption}
      </span>
      <span className="sr-only">{`${label} ${percent === null ? "未获取" : `${percent}%`}`}</span>
    </div>
  );
}

/** 点阵：CPU 一格一个真实核心；没有逐核数据时按总占用点亮固定格数，不假装分解。 */
function DotGrid({
  percent,
  cores,
  level,
}: {
  percent: number | null;
  cores: readonly number[];
  level: MonitorLevel;
}) {
  const segments = cores.length > 0 ? cores.length : 24;
  const filled = percent === null ? 0 : Math.round((percent / 100) * segments);
  return (
    <div className="flex flex-wrap gap-0.75" aria-hidden>
      {Array.from({ length: segments }, (_, index) => {
        const core = cores[index];
        const on = core !== undefined ? core > 0 : index < filled;
        const segmentLevel = core !== undefined ? loadLevel(core) : level;
        return (
          <span
            key={index}
            className={`size-2 rounded-xs ${on ? LEVEL_FILL[segmentLevel] : "bg-muted"}`}
          />
        );
      })}
    </div>
  );
}

function Bar({ percent, level }: { percent: number | null; level: MonitorLevel }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      {percent !== null ? (
        <div
          className={`h-full rounded-full ${LEVEL_FILL[level]}`}
          style={{ width: `${percent}%` }}
        />
      ) : null}
    </div>
  );
}

/** 迷你趋势线：只画客户端真实收到过的样本，没有历史就画一条基线。 */
function Sparkline({ values, level }: { values: readonly number[]; level: MonitorLevel }) {
  if (values.length < 2) return <div className="h-6" />;
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 24 - (value / max) * 22;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke={LEVEL_STROKE[level]}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Readout({
  label,
  value,
  level = "ok",
}: {
  label: string;
  value: string;
  level?: MonitorLevel;
}) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2">
      <span className="shrink-0 text-3xs text-muted-foreground">{label}</span>
      <span className={`truncate font-mono text-2xs tabular-nums ${LEVEL_TEXT[level]}`}>
        {value}
      </span>
    </div>
  );
}

const MachineCard = memo(function MachineCard({
  machine,
  meterStyle,
}: {
  machine: MonitoredMachine;
  meterStyle: MonitorStyle;
}) {
  const alert = monitorAlert(machine);
  const hottest = hottestSensor(machine.sensors);
  const battery = batterySensor(machine.sensors);
  const physical = machine.interfaces.filter((entry) => !entry.virtual);
  const virtualCount = machine.interfaces.length - physical.length;
  const cpuLevel = loadLevel(machine.cpu);
  const showGpu = gpuNeedsAttention(machine);
  const gpuSensor = machine.sensors.find((sensor) => sensor.kind === "gpu") ?? null;
  return (
    <section
      className="rounded-2xl border border-border/70 bg-card/80 p-3 shadow-sm backdrop-blur-md"
      aria-label={`${machine.name} 机器状态`}
      data-testid="monitor-widget-card"
    >
      <header className="mb-2 flex min-w-0 items-center gap-2">
        <span
          aria-label={alert === null ? "正常" : alert}
          className={`size-2 shrink-0 rounded-full ${alert === null ? "bg-success" : "bg-warning"}`}
        />
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold">{machine.name}</h2>
        {machine.local ? (
          <span className="shrink-0 rounded bg-muted px-1 text-3xs text-muted-foreground">
            本机
          </span>
        ) : null}
        <span className="shrink-0 font-mono text-3xs tabular-nums text-muted-foreground">
          {formatUptime(machine.uptimeSeconds)}
        </span>
      </header>
      {alert !== null ? <p className="mb-2 text-3xs text-warning">{alert}</p> : null}
      <div className="mb-2 flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-3xs text-muted-foreground">
              CPU
              {machine.cores !== null ? ` · ${machine.cores} 核` : ""}
            </span>
            <span className={`font-mono text-sm tabular-nums ${LEVEL_TEXT[cpuLevel]}`}>
              {machine.cpu === null ? DASH : `${machine.cpu}%`}
            </span>
          </div>
          {meterStyle === "dots" ? (
            <DotGrid percent={machine.cpu} cores={machine.coreUtilization} level={cpuLevel} />
          ) : (
            <Bar percent={machine.cpu} level={cpuLevel} />
          )}
        </div>
      </div>
      <Sparkline values={machine.cpuHistory} level={cpuLevel} />
      <div className="mt-2 flex items-start justify-around gap-2">
        <Ring
          label="内存"
          percent={machine.memory}
          level={loadLevel(machine.memory)}
          caption={`${formatBytes(machine.memUsedBytes)}/${formatBytes(machine.memTotalBytes)}`}
        />
        <Ring
          label="硬盘"
          percent={machine.disk}
          level={loadLevel(machine.disk)}
          caption={`${formatBytes(machine.diskUsedBytes)}/${formatBytes(machine.diskTotalBytes)}`}
        />
        {showGpu ? (
          <Ring
            label="GPU"
            percent={machine.gpu ?? machine.gpuMemoryPercent}
            level={
              machine.gpu !== null && machine.gpu >= 75
                ? loadLevel(machine.gpu)
                : machine.gpuMemoryPercent !== null && machine.gpuMemoryPercent >= 90
                  ? loadLevel(machine.gpuMemoryPercent)
                  : temperatureLevel(gpuSensor)
            }
            caption={
              machine.gpuMemoryTotal !== null
                ? `${formatBytes(machine.gpuMemoryUsed)}/${formatBytes(machine.gpuMemoryTotal)}`
                : gpuSensor?.celsius !== undefined
                  ? `${gpuSensor.celsius}°C`
                  : DASH
            }
          />
        ) : null}
      </div>
      <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
        <Readout label="网络 ↓" value={formatRate(machine.netRx)} />
        <Readout label="网络 ↑" value={formatRate(machine.netTx)} />
        {physical.slice(0, 3).map((entry) => (
          <Readout
            key={entry.name}
            label={entry.name}
            value={`↓${formatRate(entry.rxPerSecond)} ↑${formatRate(entry.txPerSecond)}`}
          />
        ))}
        {virtualCount > 0 ? <Readout label="虚拟网卡" value={`${virtualCount} 张`} /> : null}
        {machine.diskRead !== null || machine.diskWrite !== null ? (
          <Readout
            label="磁盘 I/O"
            value={`读 ${formatRate(machine.diskRead)} 写 ${formatRate(machine.diskWrite)}`}
          />
        ) : null}
        {machine.latencyMs !== null ? (
          <Readout
            label="延迟"
            value={`${machine.latencyMs} ms`}
            level={latencyLevel(machine.latencyMs)}
          />
        ) : null}
        {hottest !== null ? (
          <Readout
            label={`温度 · ${hottest.label}`}
            value={`${hottest.celsius}°C`}
            level={temperatureLevel(hottest)}
          />
        ) : null}
        {battery !== null ? (
          <Readout
            label="电池温度"
            value={`${battery.celsius}°C`}
            level={temperatureLevel(battery)}
          />
        ) : null}
        {showGpu && machine.gpuName !== null ? (
          <Readout label="显卡" value={machine.gpuName} />
        ) : null}
      </div>
    </section>
  );
});

export function MachineWidget({
  machines,
  meterStyle = "dots",
}: {
  machines: ReadonlyArray<MonitoredMachine>;
  meterStyle?: MonitorStyle;
}) {
  if (machines.length === 0)
    return (
      <p className="rounded-2xl border border-border/70 bg-card/80 p-3 text-2xs text-muted-foreground backdrop-blur-md">
        没有可监控的机器。到设置 → 项目板 → 机器监控里打开显示范围。
      </p>
    );
  return (
    <div className="space-y-2">
      {machines.map((machine) => (
        <MachineCard key={machine.key} machine={machine} meterStyle={meterStyle} />
      ))}
    </div>
  );
}
