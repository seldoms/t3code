import type { ContextMenuItem } from "@t3tools/contracts";

import { contextMenuSourceOf } from "../../contextMenuSource";
import { readLocalApi } from "../../localApi";

/**
 * 打开应用上下文菜单：桌面走 Electron 原生菜单，网页走 DOM 回退。
 * 用 preventDefault 吃掉浏览器默认菜单，右键不再弹出「重新加载/检查」。
 */
export async function showAppContextMenu<T extends string>(
  event: React.MouseEvent,
  items: ReadonlyArray<ContextMenuItem<T>>,
): Promise<T | null> {
  event.preventDefault();
  event.stopPropagation();
  const api = readLocalApi();
  if (!api) return null;
  return api.contextMenu.show(
    items,
    { x: event.clientX, y: event.clientY },
    contextMenuSourceOf(event.nativeEvent),
  );
}

/** 复制文本并静默失败：剪贴板不可用时不该打断右键操作。 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 没权限就算了，菜单动作不该因此报错。
  }
}
