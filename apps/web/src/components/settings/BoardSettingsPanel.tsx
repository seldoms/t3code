import { persistClientSettingsPatch, useClientSettings } from "../../hooks/useSettings";
import { useMachineMonitor } from "../../hooks/useMachineMonitor";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const SIDEBAR_METRIC_ROWS = [
  { key: "cpu", title: "CPU", description: "处理器占用百分比与状态色点。" },
  { key: "memory", title: "内存", description: "内存占用百分比与状态色点。" },
  { key: "disk", title: "硬盘", description: "根分区占用百分比与状态色点。" },
  { key: "network", title: "网络", description: "下行/上行速率；远程主机由 SSH 探针测得。" },
  { key: "latency", title: "延迟", description: "SSH 探针往返耗时；本机不显示。" },
] as const;

/** 项目板与侧边栏的展示偏好（本机保存，不参与项目级覆盖）。 */
export function BoardSettingsPanel() {
  const settings = useClientSettings();
  const { allMachines } = useMachineMonitor();
  const update = (patch: Parameters<typeof persistClientSettingsPatch>[0]) => {
    void persistClientSettingsPatch(patch);
  };

  return (
    <SettingsPageContainer>
      <SettingsSection title="机器监控">
        <SettingsRow
          devicePreference
          title="监控显示范围"
          description="默认只显示本机和已添加的 T3 环境。全部主机还包含 SSH 配置中标记 private 的主机；不会自动扫描 production 主机。"
          control={
            <Select
              value={settings.machineMonitorScope}
              onValueChange={(value) => {
                if (
                  value === "hidden" ||
                  value === "local" ||
                  value === "environments" ||
                  value === "all"
                )
                  update({ machineMonitorScope: value });
              }}
            >
              <SelectTrigger size="sm" aria-label="监控显示范围">
                <SelectValue>
                  {
                    {
                      hidden: "不显示监控",
                      local: "仅本机",
                      environments: "本机和 T3 环境",
                      all: "全部可监控主机",
                    }[settings.machineMonitorScope]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="hidden">不显示监控</SelectItem>
                <SelectItem value="local">仅本机</SelectItem>
                <SelectItem value="environments">本机和 T3 环境</SelectItem>
                <SelectItem value="all">全部可监控主机</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <div className="space-y-1 rounded-lg border border-border/60 p-2">
          <p className="text-xs font-medium">侧栏机器行字段</p>
          {SIDEBAR_METRIC_ROWS.map((row) => (
            <SettingsRow
              key={row.key}
              devicePreference
              title={row.title}
              description={row.description}
              control={
                <Switch
                  checked={settings.monitorSidebarMetrics.includes(row.key)}
                  aria-label={`侧栏显示${row.title}`}
                  onCheckedChange={(checked) =>
                    update({
                      monitorSidebarMetrics: checked
                        ? [...settings.monitorSidebarMetrics, row.key]
                        : settings.monitorSidebarMetrics.filter((key) => key !== row.key),
                    })
                  }
                />
              }
            />
          ))}
        </div>
        {allMachines.map((machine) => (
          <SettingsRow
            key={machine.key}
            devicePreference
            title={machine.name}
            description={
              machine.local
                ? "本机负载"
                : machine.environmentId
                  ? "已添加的 T3 环境"
                  : "SSH private 主机"
            }
            control={
              <Switch
                checked={!settings.hiddenMonitorMachines.includes(machine.key)}
                aria-label={`显示 ${machine.name} 的监控`}
                onCheckedChange={(checked) =>
                  update({
                    hiddenMonitorMachines: checked
                      ? settings.hiddenMonitorMachines.filter((key) => key !== machine.key)
                      : [...settings.hiddenMonitorMachines, machine.key],
                  })
                }
              />
            }
          />
        ))}
      </SettingsSection>
      <SettingsSection title="侧边栏">
        <SettingsRow
          devicePreference
          title="默认显示方式"
          description="监控独立放在顶部；下面选择对话列表、项目列表，或展开项目查看对话。项目旁的加号创建新对话。"
          control={
            <Select
              value={settings.sidebarDisplayMode}
              onValueChange={(value) => {
                if (value === "threads" || value === "projects" || value === "project-threads")
                  update({ sidebarDisplayMode: value });
              }}
            >
              <SelectTrigger size="sm" aria-label="侧栏显示方式">
                <SelectValue>
                  {settings.sidebarDisplayMode === "threads"
                    ? "对话"
                    : settings.sidebarDisplayMode === "projects"
                      ? "项目"
                      : "项目展开对话"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="threads">对话</SelectItem>
                <SelectItem value="projects">项目</SelectItem>
                <SelectItem value="project-threads">项目展开对话</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <p className="px-3 py-2 text-xs text-muted-foreground">
          监控按上方显示范围生效。侧栏只保留机器、项目和对话状态；扫描目录与接管操作在项目板中管理。
        </p>
      </SettingsSection>

      <SettingsSection title="看板">
        <SettingsRow
          devicePreference
          title="默认视图"
          description="打开项目板时先用看板还是表格。"
          control={
            <Select
              value={settings.boardDefaultView}
              onValueChange={(value) => {
                if (value === "board" || value === "table") update({ boardDefaultView: value });
              }}
            >
              <SelectTrigger size="sm" className="w-full min-w-0" aria-label="默认视图">
                <SelectValue>{settings.boardDefaultView === "board" ? "看板" : "表格"}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="board">看板</SelectItem>
                <SelectItem value="table">表格</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          devicePreference
          title="默认密度"
          description="卡片更醒目，分隔线一屏能塞更多项目。"
          control={
            <Select
              value={settings.boardDefaultFlat ? "flat" : "card"}
              onValueChange={(value) => {
                if (value === "flat" || value === "card") {
                  update({ boardDefaultFlat: value === "flat" });
                }
              }}
            >
              <SelectTrigger size="sm" className="w-full min-w-0" aria-label="默认密度">
                <SelectValue>{settings.boardDefaultFlat ? "分隔线" : "卡片"}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem value="card">卡片</SelectItem>
                <SelectItem value="flat">分隔线</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          devicePreference
          title="已收敛列默认折叠"
          description="收敛的项目多数时候不用看，折成窄列给活跃项目让位。"
          control={
            <Switch
              checked={settings.boardDoneCollapsed}
              onCheckedChange={(checked) => update({ boardDoneCollapsed: checked })}
              aria-label="已收敛列默认折叠"
            />
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
