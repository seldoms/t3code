import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import type { MachineColor } from "../../environmentColors";
import { EnvironmentColorDot } from "../EnvironmentColorDot";
import { machineConnectionLabel, type MonitoredMachine } from "./machineMonitor.logic";

function LoadMeter({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-2xs">
      <span className="text-muted-foreground">{label}</span>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? "未获取" : `${value}%`}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        {value !== null ? (
          <div
            className={`h-full rounded-full ${value >= 90 ? "bg-error" : value >= 75 ? "bg-warning" : "bg-success"}`}
            style={{ width: `${value}%` }}
          />
        ) : null}
      </div>
      <span className="text-right tabular-nums text-muted-foreground">
        {value === null ? "未知" : `${value}%`}
      </span>
    </div>
  );
}

function MachineRow({
  machine,
  color,
  single,
  onProjects,
  selected,
}: {
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
            <span className="shrink-0 whitespace-nowrap text-3xs tabular-nums text-muted-foreground">
              {machine.connection !== "connected" && machine.reachable === false ? (
                "未连接"
              ) : (
                <>
                  C {machine.cpu ?? "?"} · M {machine.memory ?? "?"} · D {machine.disk ?? "?"}
                </>
              )}
            </span>
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
            className={`text-3xs ${machine.reachable === false ? "text-warning" : "text-muted-foreground"}`}
          >
            {label}
          </p>
          <LoadMeter label="CPU" value={machine.cpu} />
          <LoadMeter label="内存" value={machine.memory} />
          <LoadMeter label="硬盘" value={machine.disk} />
          {machine.cpu === null && machine.reachable ? (
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
  onProjects,
  selectedHostKey = null,
}: {
  selectedHostKey?: string | null;
  machines: ReadonlyArray<MonitoredMachine>;
  colorFor: (machine: MonitoredMachine) => MachineColor;
  onProjects?: ((machine: MonitoredMachine) => void) | undefined;
}) {
  return (
    <div className="min-w-0" aria-label="机器负载监控">
      <p className="mb-1 text-3xs text-muted-foreground">
        {onProjects
          ? "点击主机查看负载，点「项目」发起对话。"
          : "点击主机查看 CPU、内存和硬盘负载。"}
      </p>
      {machines.length > 1 ? (
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
          onProjects={onProjects}
          selected={selectedHostKey === machine.key}
        />
      ))}
    </div>
  );
}
