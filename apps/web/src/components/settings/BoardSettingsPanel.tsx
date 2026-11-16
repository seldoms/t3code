import { persistClientSettingsPatch, useClientSettings } from "../../hooks/useSettings";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

/** 项目板与侧边栏的展示偏好（本机保存，不参与项目级覆盖）。 */
export function BoardSettingsPanel() {
  const settings = useClientSettings();
  const update = (patch: Parameters<typeof persistClientSettingsPatch>[0]) => {
    void persistClientSettingsPatch(patch);
  };

  return (
    <SettingsPageContainer>
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
        <SettingsRow
          devicePreference
          title="显示目录快捷筛选"
          description="可选的高级筛选入口，不再与项目、对话混排。"
          control={
            <Switch
              checked={settings.boardSidebarDirs}
              onCheckedChange={(checked) => update({ boardSidebarDirs: checked })}
              aria-label="显示业务目录"
            />
          }
        />
        <p className="px-3 py-2 text-xs text-muted-foreground">
          机器负载始终显示。单机默认展开，多机默认每台一行；点击主机名查看 CPU、内存和硬盘进度条。
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
