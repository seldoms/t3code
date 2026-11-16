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
  "Accent color": "强调色",
  Account: "账户",
  "Account name": "账户名称",
  Actions: "操作",
  Activity: "活动",
  "Add provider": "添加提供方",
  Advanced: "高级",
  "Agent access": "Agent 访问",
  App: "应用",
  Arguments: "参数",
  "Artifacts and logs": "产物与日志",
  "Authorized clients": "已授权客户端",
  "Auto-settle": "自动收敛",
  "Automatic worktree cleanup": "自动清理工作树",
  "Automatically pull": "自动拉取",
  "Background activity": "后台活动",
  Beta: "测试版",
  "Binary path": "可执行文件路径",
  "Branch naming instructions": "分支命名说明",
  "Branch prefix": "分支前缀",
  Branches: "分支",
  Browsing: "浏览",
  "CODEX_HOME path": "CODEX_HOME 路径",
  "ChatGPT account": "ChatGPT 账户",
  Checkouts: "工作副本",
  "Clean up transcripts": "清理会话记录",
  Cleanup: "清理",
  "Cleanup model": "清理模型",
  "Codex runtime": "Codex 运行时",
  "Colors & themes": "颜色与主题",
  "Commits & pull requests": "提交与 PR",
  Composer: "输入框",
  "Correction cue": "纠正提示",
  "Could not load linked environments": "无法加载关联环境",
  "Could not load scheduled tasks": "无法加载定时任务",
  "Created for these cookies": "针对这些 Cookie 创建",
  Creation: "创建",
  "Cursor account": "Cursor 账户",
  "Custom search URL": "自定义搜索地址",
  Danger: "危险操作",
  Database: "数据库",
  "Delete inactive worktrees": "删除不活跃工作树",
  "Delete merged worktrees": "删除已合并工作树",
  "Delete old browser artifacts": "删除旧的浏览器产物",
  "Delete old rotated logs": "删除旧的轮转日志",
  "Delete settled worktrees": "删除已收敛工作树",
  "Delete unchanged worktrees": "删除未变更工作树",
  "Delete worktrees with deleted threads": "删除已删对话的工作树",
  "Device sources": "设备来源",
  "Device unavailable": "设备不可用",
  Diagnostics: "诊断",
  "Dictation shortcut": "听写快捷键",
  Dictionary: "词典",
  "Different actions across checkouts": "不同副本间操作不一致",
  Diffs: "差异",
  "Display name": "显示名称",
  Driver: "驱动",
  Environment: "环境",
  "Environment disconnected": "环境已断开",
  "Existing profile": "已有配置",
  "Follow-ups": "追问",
  Hardware: "硬件",
  Headers: "请求头",
  "Host & collection": "主机与采集",
  Input: "输入",
  Instructions: "说明",
  "Instrumented application I/O": "应用 I/O 埋点",
  Interface: "界面",
  "Keep threads with a PR": "保留有 PR 的对话",
  "Last run": "上次运行",
  "Latest Failures": "最近失败",
  Legal: "法律信息",
  "Limited permissions": "权限受限",
  "Live Processes": "实时进程",
  "Live process tree": "实时进程树",
  "Loading linked environments…": "正在加载关联环境…",
  "Loading scheduled tasks…": "正在加载定时任务…",
  Microphone: "麦克风",
  Model: "模型",
  Models: "模型",
  "Monospace font": "等宽字体",
  "Most Common Failures": "最常见的失败",
  Name: "名称",
  "Native sessions": "原生会话",
  "New keybinding": "新快捷键",
  "New profile": "新配置",
  "New projects": "新项目",
  "No environment selected": "未选择环境",
  "No hubs configured.": "未配置 Hub。",
  "No linked environments": "没有关联环境",
  "No scheduled tasks": "没有定时任务",
  "No secret providers configured.": "未配置密钥提供方。",
  "No text generators yet": "还没有文本生成器",
  "OpenTelemetry export": "OpenTelemetry 导出",
  Organization: "组织",
  "Pairing link. Scan to open on another device": "配对链接：扫码在另一台设备打开",
  Project: "项目",
  "Project icon": "项目图标",
  "Project source": "项目来源",
  Query: "查询",
  "Reclaim freed database space": "回收数据库空间",
  Recordings: "录制",
  "Remove filler words": "去除语气词",
  "Resource History": "资源历史",
  "Resource monitor": "资源监控",
  "Resource timeline": "资源时间线",
  Runtime: "运行时",
  "Screen reader": "屏幕阅读器",
  "Server environment": "服务端环境",
  Setup: "设置",
  "Setup unavailable": "无法设置",
  "Shadow home path": "影子主目录路径",
  "Silence filtering": "静音过滤",
  "Slowest Spans": "最慢的 Span",
  Snooze: "稍后提醒",
  "Source control providers": "源代码管理提供方",
  "Span Logs": "Span 日志",
  Status: "状态",
  "Task unavailable": "任务不可用",
  "Test microphone": "测试麦克风",
  "Text generation": "文本生成",
  "Third-party notices": "第三方声明",
  "Top Span Names": "高频 Span 名",
  "Trace Diagnostics": "链路诊断",
  "Transcribe with": "转写引擎",
  Transcription: "转写",
  "Translate to English": "翻译成英文",
  Typography: "排版",
  "Unavailable selection": "选择不可用",
  "Unload model": "卸载模型",
  "Update required": "需要更新",
  Updates: "更新",
  "Usage limits": "用量限额",
  Variables: "变量",
  Version: "版本",
  "WSL only": "仅 WSL",
  Workspace: "工作区",
  "Your dictionary": "你的词典",
  "t3.json is invalid": "t3.json 无效",
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
