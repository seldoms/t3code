/**
 * 安全汉化层（本地魔改）：只翻界面控件文本（按钮/标题/导航/设置项/placeholder），
 * 跳过 contenteditable、输入框、pre/code、聊天消息 [data-message-id]、prose，精确整段匹配。
 * 审计 A03 教训：无差别替换会改坏用户内容且切语言不还原，这里必须可逆。
 */
import { getClientSettings, subscribeClientSettings } from "../hooks/useSettings";

/** 英文原文 → 中文。只收界面固定文案，动态插值文本一律跳过。 */
const ZH: Readonly<Record<string, string>> = {
  Search: "搜索",
  Back: "返回",
  "New Thread": "新对话",
  "New thread": "新对话",
  Settled: "已收敛",
  Settings: "设置",
  Usage: "用量",
  Projects: "项目",
  "Project board": "项目板",
  Environments: "环境",
  "Add environment": "添加环境",
  "Local environment": "本机环境",
  "This app": "本应用",
  Providers: "供应商",
  Threads: "对话",
  Browser: "浏览器",
  Devices: "设备",
  "Scheduled tasks": "定时任务",
  "Source control": "源代码管理",
  Worktrees: "工作树",
  Connections: "连接",
  "Sharing & access": "共享与访问",
  Secrets: "密钥",
  Maintenance: "维护",
  About: "关于",
  Archive: "归档",
  General: "常规",
  Appearance: "外观",
  Chat: "对话",
  "Diffs & pull requests": "差异与 PR",
  Keybindings: "快捷键",
  SnapShots: "快照",
  "Load balancing": "负载均衡",
  "Pull request sharing": "PR 共享",
  "Current checkout": "当前工作区",
  "Full access": "完全权限",
  Send: "发送",
  Stop: "停止",
  Copy: "复制",
  Retry: "重试",
  Cancel: "取消",
  Save: "保存",
  Close: "关闭",
  Open: "打开",
  Delete: "删除",
  Remove: "移除",
  Pin: "置顶",
  Unpin: "取消置顶",
  Rename: "重命名",
  Approve: "批准",
  Deny: "拒绝",
  Allow: "允许",
  "Always allow": "始终允许",
  Working: "进行中",
  Done: "完成",
  Failed: "失败",
  "No project": "无项目",
  "New project": "新建项目",
  "No threads found": "没找到对话",
  "Select project": "选择项目",
  "or start without a project": "或直接开始，不选项目",
  "Ask anything. @ files, $ skills, / commands": "随便问。@ 文件、$ 技能、/ 命令",
  "Archived threads": "归档对话",
  "Pull requests": "PR",
  "Thread storage": "会话存储",
  "Default model": "默认模型",
  "Appearance mode": "外观模式",
  Theme: "主题",
  Light: "浅色",
  Dark: "深色",
  System: "跟随系统",
  Language: "语言",
};

const CONTROL_SELECTOR =
  "button, [role='button'], [role='menuitem'], [role='tab'], [role='option'], h1, h2, h3, h4, label, th, summary, dt";
const BLOCKED_SELECTOR =
  "[contenteditable='true'], [contenteditable=''], textarea, input, select, pre, code, [data-message-id], .prose";

const translated = new WeakMap<Text, string>();
const translatedAttrs = new WeakMap<Element, Map<string, string>>();
let observer: MutationObserver | null = null;
let running = false;

function isBlocked(node: Node): boolean {
  const element = node.parentElement;
  if (!element) return true;
  return element.closest(BLOCKED_SELECTOR) !== null;
}

function inControl(node: Node): boolean {
  const element = node.parentElement;
  if (!element) return false;
  return element.closest(CONTROL_SELECTOR) !== null;
}

function translateNode(node: Text): void {
  if (isBlocked(node) || !inControl(node)) return;
  const current = node.nodeValue ?? "";
  const trimmed = current.trim();
  const replacement = ZH[trimmed];
  if (replacement === undefined) return;
  if (translated.has(node)) return;
  translated.set(node, current);
  tracked.add(node);
  node.nodeValue = current.replace(trimmed, replacement);
}

const ATTRS = ["placeholder", "aria-label", "alt"] as const;

function translateAttributes(element: Element): void {
  if (element.closest(BLOCKED_SELECTOR) !== null) return;
  if (element.closest(CONTROL_SELECTOR) === null) return;
  for (const attr of ATTRS) {
    const value = element.getAttribute(attr);
    if (value === null) continue;
    const replacement = ZH[value.trim()];
    if (replacement === undefined) continue;
    let originals = translatedAttrs.get(element);
    if (!originals) {
      originals = new Map();
      translatedAttrs.set(element, originals);
      trackedAttrs.add(element);
    }
    if (originals.has(attr)) continue;
    originals.set(attr, value);
    element.setAttribute(attr, replacement);
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    translateNode(root as Text);
    return;
  }
  if (!(root instanceof Element)) return;
  translateAttributes(root);
  for (const element of root.querySelectorAll(CONTROL_SELECTOR)) translateAttributes(element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node !== null) {
    translateNode(node as Text);
    node = walker.nextNode();
  }
}

function restore(): void {
  // WeakMap 没法遍历，只能保留一份强引用的文本节点列表用于还原。
  for (const node of tracked) {
    const original = translated.get(node);
    if (original !== undefined && node.isConnected) node.nodeValue = original;
  }
  tracked.clear();
  for (const element of trackedAttrs) {
    const originals = translatedAttrs.get(element);
    if (!originals || !element.isConnected) continue;
    for (const [attr, value] of originals) element.setAttribute(attr, value);
  }
  trackedAttrs.clear();
}

const tracked = new Set<Text>();
const trackedAttrs = new Set<Element>();

function start(): void {
  if (running) return;
  running = true;
  const apply = () => {
    walk(document.body);
    for (const node of document.querySelectorAll("*")) {
      if (node instanceof Element) translateAttributes(node);
    }
  };
  apply();
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData" && record.target.nodeType === Node.TEXT_NODE) {
        translateNode(record.target as Text);
      }
      for (const added of record.addedNodes) walk(added);
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function stop(): void {
  running = false;
  observer?.disconnect();
  observer = null;
  restore();
}

function isChinese(): boolean {
  return getClientSettings().language.startsWith("zh");
}

/** 语言变中文时启用，切回英文时还原。幂等，可重复调用。 */
export function startZhChrome(): void {
  const apply = () => {
    if (isChinese()) start();
    else stop();
  };
  subscribeClientSettings(apply);
  apply();
}
