import { useEffect } from "react";

import { useClientSettings } from "../../hooks/useSettings";

/**
 * 把「桌面小组件」这个设备偏好落成真正的窗口。
 * 只在主窗口挂载：小组件自己关掉时会写回设置，主窗口下次读到即同步。
 */
export function MonitorWidgetCoordinator() {
  const settings = useClientSettings();
  const enabled = settings.monitorWidgetEnabled;
  const pinned = settings.monitorWidgetPinned;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 把设置同步给原生浮窗的开关状态，React 之外只有一个真窗口
  useEffect(() => {
    const bridge = window.desktopBridge?.monitorWidget;
    if (!bridge) return;
    void bridge.setOpen(enabled).catch(() => undefined);
  }, [enabled]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 置顶是原生窗口层级，只能在窗口存在时跟着设置走
  useEffect(() => {
    const bridge = window.desktopBridge?.monitorWidget;
    if (!bridge || !enabled) return;
    void bridge.setPinned(pinned).catch(() => undefined);
  }, [enabled, pinned]);
  return null;
}
