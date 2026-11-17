import { persistClientSettingsPatch, useClientSettings } from "../../hooks/useSettings";
import { useMachineMonitor } from "../../hooks/useMachineMonitor";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const SIDEBAR_METRIC_ROWS = [
  { key: "cpu", title: "CPU", description: "处理器占用百分比与状态色点。" },
  { key: "memory", title: "内存", description: "内存占用百分比与状态色点。" },
  { key: "disk", title: "硬盘", description: "根分区占用百分比与状态色点。" },
  {
    key: "gpu",
    title: "GPU（仅异常时）",
    description: "利用率≥75%、显存≥90% 或 GPU 温度≥80°C 才出现；正常或读不到就不占版面。",
  },
  {
    key: "network",
    title: "网络",
    description: "下行/上行速率；本机由累计计数器差分，远程主机由 SSH 探针测得。",
  },
  {
    key: "latency",
    title: "延迟",
    description: "SSH 探针往返耗时；≥200ms 黄、≥1s 红。本机不显示。",
  },
  {
    key: "temperature",
    title: "温度",
    description:
      "Linux 读热区与显卡温度（≥80°C 黄、≥90°C 红）；macOS 只能拿到电池温度（≥40°C 黄、≥45°C 红），CPU/GPU 芯片温度需 sudo 或第三方驱动，本应用不碰。",
  },
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
        <SettingsRow
          devicePreference
          title="状态文字"
          description="默认只在异常时提示（旧快照、未连接、指标未获取）。数据在刷新就说明连着，不必常驻「已连接」；采样时间戳一律不显示。"
          control={
            <Select
              value={settings.monitorStatusText}
              onValueChange={(value) => {
                if (value === "auto" || value === "always" || value === "never")
                  update({ monitorStatusText: value });
              }}
            >
              <SelectTrigger size="sm" aria-label="监控状态文字">
                <SelectValue>
                  {
                    { auto: "仅异常时", always: "始终显示", never: "不显示" }[
                      settings.monitorStatusText
                    ]
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="auto">仅异常时</SelectItem>
                <SelectItem value="always">始终显示</SelectItem>
                <SelectItem value="never">不显示</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <SettingsRow
          devicePreference
          title="指标样式"
          description="点阵风格下 CPU 一格一个真实核心（拿到逐核占用才这么画），其余指标用固定格数表达百分比。"
          control={
            <Select
              value={settings.monitorStyle}
              onValueChange={(value) => {
                if (value === "bars" || value === "dots") update({ monitorStyle: value });
              }}
            >
              <SelectTrigger size="sm" aria-label="侧栏指标样式">
                <SelectValue>{settings.monitorStyle === "bars" ? "进度条" : "点阵"}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="bars">进度条</SelectItem>
                <SelectItem value="dots">点阵</SelectItem>
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
      <SettingsSection title="桌面小组件">
        <SettingsRow
          devicePreference
          title="在桌面上显示机器监控"
          description="独立无边框浮窗，不占任务栏；关掉主窗口也能看。需要桌面客户端，浏览器里无效。系统自带小组件（WidgetKit）最快只能分钟级刷新，做不了实时监控，所以用浮窗。"
          control={
            <Switch
              checked={settings.monitorWidgetEnabled}
              aria-label="开启桌面监控小组件"
              onCheckedChange={(checked) => update({ monitorWidgetEnabled: checked })}
            />
          }
        />
        <SettingsRow
          devicePreference
          title="小组件置顶"
          description="浮在普通窗口之上并跟随所有桌面；关掉后可被其他窗口遮住。"
          control={
            <Switch
              checked={settings.monitorWidgetPinned}
              aria-label="小组件置顶"
              onCheckedChange={(checked) => update({ monitorWidgetPinned: checked })}
            />
          }
        />
        <SettingsRow
          devicePreference
          title="小组件样式"
          description="点阵：逐核 CPU 点阵 + 环形仪表 + 等宽数字；进度条：更紧凑的条形读数。"
          control={
            <Select
              value={settings.monitorWidgetStyle}
              onValueChange={(value) => {
                if (value === "bars" || value === "dots") update({ monitorWidgetStyle: value });
              }}
            >
              <SelectTrigger size="sm" aria-label="小组件样式">
                <SelectValue>
                  {settings.monitorWidgetStyle === "dots" ? "点阵" : "进度条"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="dots">点阵</SelectItem>
                <SelectItem value="bars">进度条</SelectItem>
              </SelectPopup>
            </Select>
          }
        />
        <p className="px-3 py-2 text-xs text-muted-foreground">
          小组件显示哪些机器，跟上方「监控显示范围」与主机开关一致；拖顶部标题栏移动，位置下次启动自动恢复。
        </p>
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
