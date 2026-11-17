import { useNavigate } from "@tanstack/react-router";
import { ActivityIcon, BoxesIcon } from "lucide-react";

import { useSidebarHostFilter } from "../../sidebarHostFilter";
import { useMachineMonitor } from "../../hooks/useMachineMonitor";
import { useClientSettings } from "../../hooks/useSettings";
import { useEnvironmentColors } from "../../environmentColors";
import { MachineMonitor, type MonitorMetric } from "../board/MachineMonitor";
import { useSidebar } from "../ui/sidebar";

const MONITOR_METRICS: ReadonlyArray<MonitorMetric> = [
  "cpu",
  "memory",
  "disk",
  "gpu",
  "network",
  "latency",
  "temperature",
];

export function SidebarBoardSections() {
  const { machines } = useMachineMonitor();
  const settings = useClientSettings();
  const colors = useEnvironmentColors();
  const hostFilter = useSidebarHostFilter((state) => state.selected);
  const selectHost = useSidebarHostFilter((state) => state.select);
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const openBoard = () => {
    if (isMobile) setOpenMobile(false);
    void navigate({
      to: "/board",
      search: hostFilter?.environmentId ? { env: hostFilter.environmentId } : {},
    });
  };
  if (machines.length === 0) return null;
  return (
    <section
      className="select-none rounded-lg border border-sidebar-border p-2"
      aria-label="机器状态"
    >
      <div className="mb-1 flex items-center gap-2 text-xs font-medium">
        <ActivityIcon className="size-3.5" />
        机器
        <button
          type="button"
          onClick={() => selectHost(null)}
          aria-pressed={hostFilter === null}
          className="ml-auto rounded px-1 py-0.5 text-2xs text-sidebar-muted-foreground hover:bg-sidebar-row-hover"
        >
          全部
        </button>
        <button
          type="button"
          onClick={openBoard}
          className="text-2xs text-sidebar-muted-foreground hover:text-sidebar-foreground"
        >
          看板
        </button>
        <button
          type="button"
          onClick={() => void navigate({ to: "/containers" })}
          aria-label="容器管理"
          className="text-sidebar-muted-foreground hover:text-sidebar-foreground"
        >
          <BoxesIcon className="size-3.5" />
        </button>
      </div>
      <MachineMonitor
        compact
        metrics={MONITOR_METRICS.filter((metric) =>
          settings.monitorSidebarMetrics.includes(metric),
        )}
        machines={machines}
        meterStyle={settings.monitorStyle}
        statusText={settings.monitorStatusText}
        colorFor={(machine) =>
          machine.local
            ? "green"
            : machine.environmentId
              ? (colors.get(machine.environmentId) ?? "gray")
              : "gray"
        }
        selectedHostKey={hostFilter?.key ?? null}
        onProjects={(machine) =>
          selectHost({ key: machine.key, environmentId: machine.environmentId, name: machine.name })
        }
      />
    </section>
  );
}
