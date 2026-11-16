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
          title="显示业务目录"
          description="把扫描到的项目按父目录聚合，点击按目录过滤项目板。"
          control={
            <Switch
              checked={settings.boardSidebarDirs}
              onCheckedChange={(checked) => update({ boardSidebarDirs: checked })}
              aria-label="显示业务目录"
            />
          }
        />
        <SettingsRow
          devicePreference
          title="机器行显示负载"
          description="在本机和远程机器行下显示 CPU / 内存摘要，不用展开就能扫一眼状态。"
          control={
            <Switch
              checked={settings.boardSidebarMachineLoad}
              onCheckedChange={(checked) => update({ boardSidebarMachineLoad: checked })}
              aria-label="机器行显示负载"
            />
          }
        />
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
          title="负载条默认展开"
          description="收起时只显示一行本机摘要，展开看全部仪表和远程机器明细。"
          control={
            <Switch
              checked={settings.boardHostStripOpen}
              onCheckedChange={(checked) => update({ boardHostStripOpen: checked })}
              aria-label="负载条默认展开"
            />
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
