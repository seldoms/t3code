import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { MachineColor } from "../../environmentColors";
import { EnvironmentColorDot } from "../EnvironmentColorDot";
import { machineConnectionLabel, type MonitoredMachine } from "./machineMonitor.logic";

export type MonitorMetric = "cpu" | "memory" | "disk" | "network" | "latency";

const loadColor = (value: number) =>
  value >= 90 ? "bg-error" : value >= 75 ? "bg-warning" : "bg-success";

const formatBytesPerSecond = (value: number) => {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB/s`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB/s`;
  return `${value} B/s`;
};

function LoadMeter({ label, value, text }: { label: string; value: number | null; text: string }) {
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
            className={`h-full rounded-full ${loadColor(value)}`}
            style={{ width: `${value}%` }}
          />
        ) : null}
      </div>
      <span className="text-right tabular-nums text-muted-foreground">{text}</span>
    </div>
  );
}

interface MetricRow {
  readonly key: MonitorMetric;
  readonly label: string;
  /** 0–100 的进度条值；null 只显示文字。 */
  readonly percent: number | null;
  readonly text: string;
}

function metricRows(
  machine: MonitoredMachine,
  metrics: ReadonlyArray<MonitorMetric>,
): Array<MetricRow | null> {
  return metrics.map((metric) => {
    switch (metric) {
      case "cpu":
        return {
          key: metric,
          label: "CPU",
          percent: machine.cpu,
          text: machine.cpu === null ? "未知" : `${machine.cpu}%`,
        };
      case "memory":
        return {
          key: metric,
          label: "内存",
          percent: machine.memory,
          text: machine.memory === null ? "未知" : `${machine.memory}%`,
        };
      case "disk":
        return {
          key: metric,
          label: "硬盘",
          percent: machine.disk,
          text: machine.disk === null ? "未知" : `${machine.disk}%`,
        };
      case "network":
        return machine.netRx === null && machine.netTx === null
          ? null
          : {
              key: metric,
              label: "网络",
              percent: null,
              text: `↓${machine.netRx === null ? "?" : formatBytesPerSecond(machine.netRx)} ↑${machine.netTx === null ? "?" : formatBytesPerSecond(machine.netTx)}`,
            };
      case "latency":
        return machine.latencyMs === null
          ? null
          : { key: metric, label: "延迟", percent: null, text: `${machine.latencyMs} ms` };
    }
  });
}

type DotLevel = "ok" | "warn" | "bad" | "unknown";

function statusDots(machine: MonitoredMachine, metrics: ReadonlyArray<MonitorMetric>) {
  const dot = (level: DotLevel, label: string) => (
    <span
      aria-label={`${label} ${level === "ok" ? "正常" : level === "warn" ? "偏高" : level === "bad" ? "过高" : "未获取"}`}
      className={`inline-block size-1.5 rounded-full ${
        level === "ok"
          ? "bg-success"
          : level === "warn"
            ? "bg-warning"
            : level === "bad"
              ? "bg-error"
              : "bg-muted-foreground/40"
      }`}
    />
  );
  const level = (value: number | null): DotLevel =>
    value === null ? "unknown" : value >= 90 ? "bad" : value >= 75 ? "warn" : "ok";
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {metrics.includes("cpu") ? dot(level(machine.cpu), "CPU") : null}
      {metrics.includes("memory") ? dot(level(machine.memory), "内存") : null}
      {metrics.includes("disk") ? dot(level(machine.disk), "硬盘") : null}
      {metrics.includes("network") && (machine.netRx !== null || machine.netTx !== null)
        ? dot("ok", "网络")
        : null}
      {metrics.includes("latency") && machine.latencyMs !== null
        ? dot(machine.latencyMs > 1000 ? "warn" : "ok", "延迟")
        : null}
    </span>
  );
}

function MachineRow({
  machine,
  color,
  single,
  metrics,
  onProjects,
  selected,
  compact,
}: {
  compact: boolean;
  metrics: ReadonlyArray<MonitorMetric>;
  selected: boolean;
  machine: MonitoredMachine;
  color: MachineColor;
  single: boolean;
  onProjects?: ((machine: MonitoredMachine) => void) | undefined;
}) {
  const [override, setOverride] = useState<boolean | null>(null);
  // Changing from one machine to many returns to the compact overview automatically.
  const open = single ? override !== false : override === true;
  const label = machineConnectionLabel(machine);
  const rows = metricRows(machine, metrics).flatMap((row) => (row ? [row] : []));
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
                <span className="shrink-0 text-3xs tabular-nums text-muted-foreground">
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
          <p
            className={`text-3xs ${machine.reachable === false || machine.stale ? "text-warning" : "text-muted-foreground"}`}
          >
            {label}
            {machine.sampledAt !== null
              ? ` · ${machine.stale ? "旧快照" : "采样"} ${new Date(machine.sampledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
              : ""}
          </p>
          {rows.map((row) =>
            row.percent === null ? (
              <div
                key={row.key}
                className="flex items-center justify-between text-2xs tabular-nums"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span>{row.text}</span>
              </div>
            ) : (
              <LoadMeter key={row.key} label={row.label} value={row.percent} text={row.text} />
            ),
          )}
          {machine.stale && !compact ? (
            <p className="text-3xs text-warning">
              指标更新失败或已过期，下方不是实时数据；连接恢复后将自动重试。
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
  onProjects,
  selectedHostKey = null,
  compact = false,
}: {
  compact?: boolean;
  metrics?: ReadonlyArray<MonitorMetric>;
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
          onProjects={onProjects}
          selected={selectedHostKey === machine.key}
          compact={compact}
        />
      ))}
    </div>
  );
}
