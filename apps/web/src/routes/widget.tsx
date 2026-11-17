import { createFileRoute } from "@tanstack/react-router";
import { PinIcon, PinOffIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { MachineWidget } from "../components/board/MachineWidget";
import { useMachineMonitor } from "../hooks/useMachineMonitor";
import { persistClientSettingsPatch, useClientSettings } from "../hooks/useSettings";

export const Route = createFileRoute("/widget")({
  component: MonitorWidgetSurface,
});

const BOUNDS_STORAGE_KEY = "t3.monitorWidget.bounds";

interface WidgetBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function readStoredBounds(): WidgetBounds | null {
  try {
    const raw = window.localStorage.getItem(BOUNDS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { x, y, width, height } = parsed as Record<string, unknown>;
    if (
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      ![x, y, width, height].every(Number.isFinite)
    )
      return null;
    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  } catch {
    return null;
  }
}

function MonitorWidgetSurface() {
  const settings = useClientSettings();
  const { machines } = useMachineMonitor();
  const bridge = window.desktopBridge?.monitorWidget;
  const restored = useRef(false);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- 与原生浮窗对齐：恢复上次位置并订阅主进程的移动/缩放回调，卸载即退订
  useEffect(() => {
    if (!bridge || restored.current) return;
    restored.current = true;
    const stored = readStoredBounds();
    if (stored) void bridge.setBounds(stored).catch(() => undefined);
    return bridge.onBounds((bounds) => {
      try {
        window.localStorage.setItem(BOUNDS_STORAGE_KEY, JSON.stringify(bounds));
      } catch {
        // 隐私模式下写不进去就算了，下次回到默认位置。
      }
    });
  }, [bridge]);

  const pinned = settings.monitorWidgetPinned;
  return (
    <div className="flex h-screen min-h-0 flex-col bg-transparent text-foreground">
      <header className="drag-region flex shrink-0 items-center gap-1 rounded-t-2xl px-2 py-1">
        <span className="flex-1 truncate text-3xs font-medium text-muted-foreground">机器监控</span>
        <button
          type="button"
          aria-label={pinned ? "取消置顶" : "窗口置顶"}
          aria-pressed={pinned}
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={() => {
            void persistClientSettingsPatch({ monitorWidgetPinned: !pinned });
            void bridge?.setPinned(!pinned).catch(() => undefined);
          }}
        >
          {pinned ? <PinIcon className="size-3" /> : <PinOffIcon className="size-3" />}
        </button>
        <button
          type="button"
          aria-label="关闭小组件"
          className="rounded p-1 text-muted-foreground hover:bg-muted"
          onClick={() => {
            void persistClientSettingsPatch({ monitorWidgetEnabled: false });
            void bridge?.setOpen(false).catch(() => undefined);
          }}
        >
          <XIcon className="size-3" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
        <MachineWidget machines={machines} meterStyle={settings.monitorWidgetStyle} />
      </div>
    </div>
  );
}
