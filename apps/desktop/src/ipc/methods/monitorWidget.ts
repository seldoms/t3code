// @effect-diagnostics globalTimers:off -- Electron 的 moved/resized 回调在 Effect fiber 之外，落定去抖只能用原生定时器。
import { DesktopMonitorWidgetBoundsSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Electron from "electron";

import * as DesktopEnvironment from "../../app/DesktopEnvironment.ts";
import * as ElectronWindow from "../../electron/ElectronWindow.ts";
import { getDesktopUrl } from "../../electron/ElectronProtocol.ts";
import * as IpcChannels from "../channels.ts";
import * as DesktopIpc from "../DesktopIpc.ts";

/**
 * 桌面机器小组件窗口：无边框浮窗渲染同一个 app 的 /widget 路由，认证与指标与主窗口一致。
 * 不用 WidgetKit，系统小组件靠 timeline 刷新，最快分钟级，做不了实时监控。
 *
 * 窗口是 auxiliary 的：绝不能被当成主窗口回落目标，否则主窗口关掉后
 * 通知点击、revealWindow 会把浮窗当主界面抬起来。
 */
let widgetWindow: Electron.BrowserWindow | null = null;
let boundsTimer: ReturnType<typeof setTimeout> | null = null;

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 420;

const liveWidget = (): Electron.BrowserWindow | null =>
  widgetWindow !== null && !widgetWindow.isDestroyed() ? widgetWindow : null;

const applyPinned = (window: Electron.BrowserWindow, pinned: boolean, platform: string) => {
  window.setAlwaysOnTop(pinned, platform === "darwin" ? "floating" : "normal");
  if (platform === "darwin")
    window.setVisibleOnAllWorkspaces(pinned, {
      visibleOnFullScreen: pinned,
      // Electron 默认的 UIElement 变换会把整个 app 从 Dock 里抹掉。
      skipTransformProcessType: true,
    });
};

/** 拖动过程中 move 每帧都触发，落定后再上报一次，别把 localStorage 写爆。 */
const publishBounds = (window: Electron.BrowserWindow) => {
  if (boundsTimer !== null) clearTimeout(boundsTimer);
  boundsTimer = setTimeout(() => {
    boundsTimer = null;
    if (window.isDestroyed()) return;
    const bounds = window.getBounds();
    window.webContents.send(IpcChannels.MONITOR_WIDGET_BOUNDS_CHANNEL, bounds);
  }, 400);
};

export const setMonitorWidgetOpen = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.MONITOR_WIDGET_SET_OPEN_CHANNEL,
  payload: Schema.Boolean,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.monitorWidget.setOpen")(function* (open: boolean) {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const electronWindow = yield* ElectronWindow.ElectronWindow;
    const existing = liveWidget();
    if (!open) {
      if (existing) existing.close();
      widgetWindow = null;
      return;
    }
    if (existing) {
      existing.showInactive();
      return;
    }
    const window = yield* electronWindow.create(
      {
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        minWidth: 240,
        minHeight: 160,
        title: "机器监控",
        show: false,
        frame: false,
        transparent: true,
        // 透明窗口在 Windows 上缩放会留黑边，索性固定尺寸靠内容滚动。
        resizable: true,
        maximizable: false,
        minimizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        hasShadow: true,
        ...(environment.platform === "darwin" ? { type: "panel" as const } : {}),
        webPreferences: {
          preload: environment.preloadPath,
          backgroundThrottling: false,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      },
      { auxiliary: true },
    );
    widgetWindow = window;
    window.once("closed", () => {
      if (widgetWindow === window) widgetWindow = null;
      if (boundsTimer !== null) {
        clearTimeout(boundsTimer);
        boundsTimer = null;
      }
    });
    const report = () => publishBounds(window);
    window.on("moved", report);
    window.on("resized", report);
    applyPinned(window, true, environment.platform);
    // 默认贴右上角，避开 Dock 与主窗口标题栏。
    const display = Electron.screen.getPrimaryDisplay().workArea;
    window.setBounds({
      x: Math.round(display.x + display.width - DEFAULT_WIDTH - 24),
      y: Math.round(display.y + 24),
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
    });
    yield* Effect.promise(() =>
      window.loadURL(`${getDesktopUrl(environment.isDevelopment)}widget`).catch(() => undefined),
    );
    window.showInactive();
  }),
});

export const setMonitorWidgetPinned = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.MONITOR_WIDGET_SET_PINNED_CHANNEL,
  payload: Schema.Boolean,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.monitorWidget.setPinned")(function* (pinned: boolean) {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const window = liveWidget();
    if (window === null) return;
    applyPinned(window, pinned, environment.platform);
  }),
});

export const setMonitorWidgetBounds = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.MONITOR_WIDGET_SET_BOUNDS_CHANNEL,
  payload: DesktopMonitorWidgetBoundsSchema,
  result: Schema.Void,
  handler: (bounds: typeof DesktopMonitorWidgetBoundsSchema.Type) =>
    Effect.sync(() => {
      const window = liveWidget();
      if (window === null) return;
      // 只接受落在某块屏幕可见范围内的位置，否则上次外接屏的坐标会让浮窗彻底消失。
      const visible = Electron.screen.getAllDisplays().some((display) => {
        const area = display.workArea;
        return (
          bounds.x + bounds.width > area.x &&
          bounds.x < area.x + area.width &&
          bounds.y + bounds.height > area.y &&
          bounds.y < area.y + area.height
        );
      });
      if (!visible) return;
      window.setBounds(bounds);
    }),
});
