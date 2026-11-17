import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { MachineColor } from "../../environmentColors";
import { EnvironmentColorDot } from "../EnvironmentColorDot";
import {
  batterySensor,
  gpuNeedsAttention,
  hottestSensor,
  latencyLevel,
  loadLevel,
  machineConnectionLabel,
  monitorAlert,
  temperatureLevel,
  type MonitoredMachine,
  type MonitorLevel,
} from "./machineMonitor.logic";

export type MonitorMetric =
  | "cpu"
  | "memory"
  | "disk"
  | "gpu"
  | "network"
  | "latency"
  | "temperature";

/** 状态文字策略：默认只在异常时出现，数据在刷新就说明连着，不必常驻「已连接」。 */
export type MonitorStatusText = "auto" | "always" | "never";
export type MonitorStyle = "bars" | "dots";

const LEVEL_BAR: Record<MonitorLevel, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-error",
  unknown: "bg-muted-foreground/40",
};
const LEVEL_TEXT: Record<MonitorLevel, string> = {
  ok: "text-muted-foreground",
  warn: "text-warning",
  bad: "text-error",
  unknown: "text-muted-foreground",
};
const LEVEL_LABEL: Record<MonitorLevel, string> = {
  ok: "正常",
  warn: "偏高",
  bad: "过高",
  unknown: "未获取",
};

const formatBytesPerSecond = (value: number) => {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB/s`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB/s`;
  return `${value} B/s`;
};

interface MeterProps {
  readonly label: string;
  readonly value: number | null;
  readonly text: string;
  readonly level: MonitorLevel;
  readonly cores?: readonly number[];
}

function LoadMeter({ label, value, text, level }: MeterProps) {
  return (
    <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-2 text-2xs">
      <span className="text-muted-foreground">{label}</span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={text}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        {value !== null ? (
          <div
            className={`h-full rounded-full ${LEVEL_BAR[level]}`}
            style={{ width: `${value}%` }}
          />
        ) : null}
      </div>
      <span className={`text-right tabular-nums ${LEVEL_TEXT[level]}`}>{text}</span>
    </div>
  );
}

/**
 * 点阵视图：CPU 一格一个真实核心（拿到每核占用才这么画），
 * 其余指标用固定格数表达百分比，不假装自己有逐核数据。
 */
function DotMeter({ label, value, text, level, cores }: MeterProps) {
  const segments = cores && cores.length > 0 ? cores.length : 20;
  const filled = value === null ? 0 : Math.round((value / 100) * segments);
  return (
    <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_4rem] items-center gap-2 text-2xs">
      <span className="text-muted-foreground">{label}</span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={text}
        className="flex min-w-0 flex-wrap items-center gap-0.5"
      >
        {Array.from({ length: segments }, (_, index) => {
          const coreValue = cores?.[index];
          const on = coreValue !== undefined ? coreValue > 0 : index < filled;
          const segmentLevel = coreValue !== undefined ? loadLevel(coreValue) : level;
          return (
            <span
              key={index}
              className={`size-1.25 rounded-xs ${on ? LEVEL_BAR[segmentLevel] : "bg-muted"}`}
            />
          );
        })}
      </div>
      <span className={`text-right tabular-nums ${LEVEL_TEXT[level]}`}>{text}</span>
    </div>
  );
}

interface MetricRow {
  readonly key: MonitorMetric;
  readonly label: string;
  /** 0–100 的进度值；null 只显示文字。 */
  readonly percent: number | null;
  readonly text: string;
  readonly level: MonitorLevel;
  readonly cores?: readonly number[];
  readonly ariaLabel?: string;
}

function metricRows(
  machine: MonitoredMachine,
  metrics: ReadonlyArray<MonitorMetric>,
): Array<MetricRow> {
  const rows: Array<MetricRow> = [];
  const percentText = (value: number | null) => (value === null ? "未知" : `${value}%`);
  for (const metric of metrics) {
    switch (metric) {
      case "cpu":
        rows.push({
          key: metric,
          label: "CPU",
          percent: machine.cpu,
          text: percentText(machine.cpu),
          level: loadLevel(machine.cpu),
          ...(machine.coreUtilization.length > 0 ? { cores: machine.coreUtilization } : {}),
        });
        break;
      case "memory":
        rows.push({
          key: metric,
          label: "内存",
          percent: machine.memory,
          text: percentText(machine.memory),
          level: loadLevel(machine.memory),
        });
        break;
      case "disk":
        rows.push({
          key: metric,
          label: "硬盘",
          percent: machine.disk,
          text: percentText(machine.disk),
          level: loadLevel(machine.disk),
        });
        break;
      case "gpu":
        // 没问题就不占版面：GPU 正常或读不到时整行消失。
        if (!gpuNeedsAttention(machine)) break;
        rows.push({
          key: metric,
          label: "GPU",
          percent: machine.gpu,
          text:
            machine.gpu !== null
              ? `${machine.gpu}%`
              : machine.gpuMemoryPercent !== null
                ? `显存 ${machine.gpuMemoryPercent}%`
                : "偏热",
          level:
            machine.gpu !== null && machine.gpu >= 75
              ? loadLevel(machine.gpu)
              : machine.gpuMemoryPercent !== null && machine.gpuMemoryPercent >= 90
                ? loadLevel(machine.gpuMemoryPercent)
                : temperatureLevel(machine.sensors.find((sensor) => sensor.kind === "gpu") ?? null),
          ...(machine.gpuName ? { ariaLabel: `GPU ${machine.gpuName}` } : {}),
        });
        break;
      case "network":
        if (machine.netRx === null && machine.netTx === null) break;
        rows.push({
          key: metric,
          label: "网络",
          percent: null,
          text: `↓${machine.netRx === null ? "?" : formatBytesPerSecond(machine.netRx)} ↑${machine.netTx === null ? "?" : formatBytesPerSecond(machine.netTx)}`,
          level: "ok",
        });
        break;
      case "latency":
        if (machine.latencyMs === null) break;
        rows.push({
          key: metric,
          label: "延迟",
          percent: null,
          text: `${machine.latencyMs} ms`,
          level: latencyLevel(machine.latencyMs),
        });
        break;
      case "temperature": {
        const hottest = hottestSensor(machine.sensors);
        if (hottest !== null)
          rows.push({
            key: metric,
            label: "温度",
            percent: null,
            text: `${hottest.celsius}°C`,
            level: temperatureLevel(hottest),
            ariaLabel: `温度 ${hottest.label}`,
          });
        const battery = batterySensor(machine.sensors);
        if (battery !== null)
          rows.push({
            key: "temperature",
            label: "电池",
            percent: null,
            text: `${battery.celsius}°C`,
            level: temperatureLevel(battery),
            ariaLabel: `电池温度 ${battery.label}`,
          });
        break;
      }
    }
  }
  return rows;
}

function statusDots(machine: MonitoredMachine, metrics: ReadonlyArray<MonitorMetric>) {
  const dot = (level: MonitorLevel, label: string) => (
    <span
      aria-label={`${label} ${LEVEL_LABEL[level]}`}
      className={`inline-block size-1.5 rounded-full ${LEVEL_BAR[level]}`}
    />
  );
  const battery = batterySensor(machine.sensors);
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {metrics.includes("cpu") ? dot(loadLevel(machine.cpu), "CPU") : null}
      {metrics.includes("memory") ? dot(loadLevel(machine.memory), "内存") : null}
      {metrics.includes("disk") ? dot(loadLevel(machine.disk), "硬盘") : null}
      {metrics.includes("gpu") && gpuNeedsAttention(machine)
        ? dot(loadLevel(machine.gpu ?? machine.gpuMemoryPercent), "GPU")
        : null}
      {metrics.includes("network") && (machine.netRx !== null || machine.netTx !== null)
        ? dot("ok", "网络")
        : null}
      {metrics.includes("latency") && machine.latencyMs !== null
        ? dot(latencyLevel(machine.latencyMs), "延迟")
        : null}
      {metrics.includes("temperature") &&
      (hottestSensor(machine.sensors) !== null || battery !== null)
        ? dot(temperatureLevel(hottestSensor(machine.sensors) ?? battery), "温度")
        : null}
    </span>
  );
}

function MachineRow({
  machine,
  color,
  single,
  metrics,
  meterStyle,
  statusText,
  onProjects,
  selected,
  compact,
}: {
  compact: boolean;
  metrics: ReadonlyArray<MonitorMetric>;
  meterStyle: MonitorStyle;
  statusText: MonitorStatusText;
  selected: boolean;
  machine: MonitoredMachine;
  color: MachineColor;
  single: boolean;
  onProjects?: ((machine: MonitoredMachine) => void) | undefined;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  // Changing from one machine to many returns to the compact overview automatically.
  const open = single ? override !== false : override === true;
  const alert = monitorAlert(machine);
  const status =
    statusText === "never"
      ? null
      : statusText === "always"
        ? machineConnectionLabel(machine)
        : alert;
  const rows = metricRows(machine, metrics);
  const Meter = meterStyle === "dots" ? DotMeter : LoadMeter;
  return (
    <div
      className="min-w-0 border-t border-border/60 first:border-t-0"
      data-testid="machine-monitor-row"
    >
      <div className="flex min-w-0 items-center gap-1 py-1">
        <button
          type="button"
          onClick={() => setOverride(!open)}
          aria-expanded={open}
          aria-label={`${open ? "收起" : "展开"} ${machine.name} 负载`}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          {open ? (
            <ChevronDownIcon className="size-3 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-3 shrink-0" />
          )}
          <EnvironmentColorDot color={color} />
          <span className="min-w-0 flex-1 truncate text-2xs font-medium">
            {machine.name}
            {machine.local ? " · 本机" : ""}
          </span>
          {!open ? (
            <>
              {statusDots(machine, metrics)}
              {metrics.includes("latency") && machine.latencyMs !== null ? (
                <span
                  className={`shrink-0 text-3xs tabular-nums ${LEVEL_TEXT[latencyLevel(machine.latencyMs)]}`}
                >
                  {machine.latencyMs}ms
                </span>
              ) : null}
            </>
          ) : null}
        </button>
        {onProjects ? (
          <button
            type="button"
            aria-label={`查看 ${machine.name} 的项目并发起对话`}
            onClick={() => onProjects(machine)}
            aria-pressed={selected}
            className="shrink-0 rounded px-1 py-0.5 text-3xs text-muted-foreground hover:bg-muted"
          >
            {selected ? "已选" : "项目"}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-1.5 px-1 pb-2">
          {status !== null ? (
            <p className={`text-3xs ${alert !== null ? "text-warning" : "text-muted-foreground"}`}>
              {status}
            </p>
          ) : null}
          {/* 指标可以一直加，但不能把侧栏撑爆：超出高度自己滚，不抢主滚动区。 */}
          <div
            className="max-h-44 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5"
            data-testid="machine-monitor-metrics"
          >
            {rows.map((row) =>
              row.percent === null ? (
                <div
                  key={`${row.key}:${row.label}`}
                  className="flex items-center justify-between text-2xs tabular-nums"
                >
                  <span className="text-muted-foreground" aria-label={row.ariaLabel}>
                    {row.label}
                  </span>
                  <span className={LEVEL_TEXT[row.level]}>{row.text}</span>
                </div>
              ) : (
                <Meter
                  key={`${row.key}:${row.label}`}
                  label={row.label}
                  value={row.percent}
                  text={row.text}
                  level={row.level}
                  {...(row.cores ? { cores: row.cores } : {})}
                />
              ),
            )}
          </div>
          {machine.stale && !compact ? (
            <p className="text-3xs text-warning">
              指标更新失败或已过期，上方不是实时数据；连接恢复后将自动重试。
            </p>
          ) : null}
          {!compact && machine.cpu === null && machine.reachable ? (
            <p className="text-3xs text-muted-foreground">
              CPU 等待下一次有效采样，不用平均负载冒充百分比。
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MachineMonitor({
  machines,
  colorFor,
  metrics = ["cpu", "memory", "disk"],
  meterStyle = "bars",
  statusText = "auto",
  onProjects,
  selectedHostKey = null,
  compact = false,
}: {
  compact?: boolean;
  metrics?: ReadonlyArray<MonitorMetric>;
  meterStyle?: MonitorStyle;
  statusText?: MonitorStatusText;
  selectedHostKey?: string | null;
  machines: ReadonlyArray<MonitoredMachine>;
  colorFor: (machine: MonitoredMachine) => MachineColor;
  onProjects?: ((machine: MonitoredMachine) => void) | undefined;
}) {
  if (machines.length === 0) return null;
  return (
    <div className="min-w-0" aria-label="机器负载监控">
      {!compact ? (
        <p className="mb-1 text-3xs text-muted-foreground">
          {onProjects
            ? "点击主机查看负载，点「项目」发起对话。"
            : "点击主机查看 CPU、内存和硬盘负载。"}
        </p>
      ) : null}
      {!compact && machines.length > 1 ? (
        <div className="mb-0.5 flex text-3xs text-muted-foreground">
          <span>主机 · 点击展开</span>
          <span className="ml-auto">C CPU% · M 内存% · D 硬盘%</span>
        </div>
      ) : null}
      {machines.map((machine) => (
        <MachineRow
          key={`${machines.length === 1 ? "single" : "multi"}:${machine.key}`}
          machine={machine}
          color={colorFor(machine)}
          single={machines.length === 1}
          metrics={metrics}
          meterStyle={meterStyle}
          statusText={statusText}
          onProjects={onProjects}
          selected={selectedHostKey === machine.key}
          compact={compact}
        />
      ))}
    </div>
  );
}
