/**
 * 中文化显示层（本地魔改）：只换显示层文本节点，不碰逻辑值/枚举/key。
 * 已知问题（审计 A03）：会误改用户内容且不随语言切换还原，待移除或改 opt-in。
 * 维护：往 ZH 加条目，key 与界面英文完全一致；缩写保持英文。
 */

const ZH: Readonly<Record<string, string>> = {
  // 导航与分区
  Search: "搜索",
  Usage: "用量",
  Settings: "设置",
  Projects: "项目",
  "All projects": "全部项目",
  Threads: "会话",
  "New thread": "新会话",
  "New project": "新建项目",
  "Add project": "添加项目",
  "Remove project": "移除项目",
  "Project settings": "项目设置",
  "Project actions": "项目操作",
  "Pin project": "置顶项目",
  "Unpin project": "取消置顶",
  "Search projects": "搜索项目",
  "Search project contents": "搜索项目内容",
  "Collapse all folders": "收起全部文件夹",
  "Expand all folders": "展开全部文件夹",
  Environments: "环境",
  "All environments": "全部环境",
  "No project": "未归入项目",
  "Command palette": "命令面板",
  "Side chat": "侧边会话",
  "Pull requests": "拉取请求",
  Terminal: "终端",
  Files: "文件",
  Browser: "浏览器",
  Device: "设备",
  "Device hub": "设备中心",
  "Device host": "设备主机",
  Models: "模型",
  Workspace: "工作区",
  Changes: "变更",
  Diff: "差异",
  Preview: "预览",
  Message: "消息",
  Summary: "摘要",
  Checks: "检查",
  "This machine": "本机",
  Remote: "远程",
  System: "跟随系统",

  // 状态
  Working: "进行中",
  Idle: "空闲",
  Settled: "已收敛",
  Pinned: "已置顶",
  Active: "活跃",
  Running: "运行中",
  Waiting: "等待中",
  Preparing: "准备中",
  Stopped: "已停止",
  Completed: "已完成",
  Failed: "失败",
  Failure: "失败",
  Success: "成功",
  "Pending Approval": "待审批",
  "Awaiting Input": "待输入",
  "Plan Ready": "方案就绪",
  "Guest Request": "访客请求",
  Subagent: "子代理",
  Thinking: "思考中",
  Resolved: "已解决",
  Unknown: "未知",
  Unavailable: "不可用",
  "Environment unavailable": "环境不可用",
  Connecting: "连接中",
  Loading: "加载中",
  "Preparing...": "准备中…",
  "Saving...": "保存中…",
  Updating: "更新中",
  Disabled: "已禁用",
  Off: "关闭",
  Mixed: "混合",

  // 操作
  Save: "保存",
  "Save changes": "保存更改",
  Cancel: "取消",
  Confirm: "确认",
  Create: "创建",
  Select: "选择",
  Add: "添加",
  Delete: "删除",
  Remove: "移除",
  Edit: "编辑",
  Rename: "重命名",
  Copy: "复制",
  "Copy path": "复制路径",
  "Copy prompt link": "复制提示链接",
  Copied: "已复制",
  "Copied!": "已复制！",
  Open: "打开",
  "Open file": "打开文件",
  Close: "关闭",
  Back: "返回",
  Continue: "继续",
  Retry: "重试",
  "Try again": "再试一次",
  "Try again.": "再试一次。",
  Refresh: "刷新",
  Update: "更新",
  "Update all": "全部更新",
  Install: "安装",
  Approve: "批准",
  Dismiss: "忽略",
  Hide: "隐藏",
  Show: "显示",
  "Show less": "收起",
  "Show more": "展开",
  "Zoom in": "放大",
  "Zoom out": "缩小",
  Connect: "连接",
  Reconnect: "重连",
  "Check again": "重新检查",
  "Run on": "运行于",
  "Add to chat": "加入对话",
  "Add action": "添加动作",
  "Add project script": "添加项目脚本",
  "Settle thread": "收敛会话",
  Done: "完成",

  // 外观 / 设置项
  Light: "浅色",
  Dark: "深色",
  Default: "默认",
  Custom: "自定义",
  "System default": "跟随系统",
  Language: "语言",
  "Change theme": "切换主题",
  "Diff layout": "差异布局",
  "Diff colors": "差异配色",
  "In-app notifications": "应用内通知",
  "Project order": "项目排序",
  "Working section": "进行中分区",
  "Auto-settle inactive threads": "自动收敛不活跃会话",
  "Auto-settle merged threads": "自动收敛已合并会话",
  "Resume after usage limits": "额度恢复后继续",
  "Snooze until limits reset": "休眠至额度重置",
  "Default diff file state": "默认文件展开状态",
  "Show skills in slash menu": "在斜杠菜单显示技能",
  "Update track": "更新通道",
  "Current version of the application.": "当前应用版本。",
  "Search settings": "搜索设置",
  "Search languages": "搜索语言",
  Diagnostics: "诊断",
  "Open source licenses": "开源许可证",

  // 差异 / 文件
  "Show whitespace changes": "显示空白变更",
  "Hide whitespace changes": "隐藏空白变更",
  "Hide test files": "隐藏测试文件",
  "Show file tree": "显示文件树",
  "Hide file tree": "隐藏文件树",
  "Expand all files": "展开全部文件",
  "Collapse all files": "收起全部文件",

  // 错误与提示
  "An error occurred.": "出错了。",
  "An unexpected error occurred.": "发生了意外错误。",
  "Failed to add project": "添加项目失败",
  "Failed to open project": "打开项目失败",
  "Clone failed": "克隆失败",
  "This connection cannot add projects.": "当前连接不能添加项目。",
  "Relative paths require an active project.": "相对路径需要先选中一个项目。",
  "The composer is not ready": "输入框尚未就绪",
  "The settings update failed.": "设置保存失败。",
  "Could not check for updates": "检查更新失败",
  "Could not install update": "安装更新失败",
  "Could not open the link": "无法打开该链接",
  "Reconnect to the environment and try again.": "请重连环境后重试。",
  "Unable to open file": "无法打开文件",
  "Unable to add to chat": "无法加入对话",
  "Preview limited to files under 50 MB.": "预览仅支持 50 MB 以内的文件。",
  "Confirm merge?": "确认合并？",
  "Confirm auto-merge?": "确认自动合并？",
  "Changes requested": "已请求修改",
  "Merging...": "合并中…",
  "Added to the composer": "已加入输入框",
  "Toggle main sidebar": "切换主侧边栏",
  "Toggle account email visibility": "切换邮箱可见性",
  "Click to reveal email": "点击显示邮箱",
  "Click to hide email": "点击隐藏邮箱",
  "Keep threads with a PR": "保留有 PR 的会话",
  "Failed to settle thread": "收敛会话失败",
  "Failed to un-settle thread": "取消收敛失败",
  "Failed to wake thread": "唤醒会话失败",
  "Failed to pin thread": "置顶会话失败",
  "Failed to unpin thread": "取消置顶失败",
  "Dismiss Woke notification": "忽略唤醒通知",
};

/** 这些标签里的文字不替换：代码、预格式化。 */
const SKIP = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "TEXTAREA", "KBD", "SAMP", "SVG"]);

const ATTRS = ["placeholder", "title", "aria-label"] as const;

/** 当前节点是否应跳过（自己在排除标签里，或祖先在排除标签里）。 */
function shouldSkip(node: Node): boolean {
  const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  if (!el) return true;
  if (SKIP.has(el.tagName)) return true;
  return el.closest("code, pre, kbd, textarea, svg") !== null;
}

function translateText(node: Text): void {
  const raw = node.nodeValue;
  if (!raw) return;
  const trimmed = raw.trim();
  if (!trimmed) return;
  const hit = ZH[trimmed];
  if (hit === undefined) return;
  // 保留原有前后空白，避免相邻内联元素被挤在一起。
  const start = raw.indexOf(trimmed);
  node.nodeValue = raw.slice(0, start) + hit + raw.slice(start + trimmed.length);
}

function translateAttrs(el: Element): void {
  if (SKIP.has(el.tagName)) return;
  for (const name of ATTRS) {
    const value = el.getAttribute(name);
    if (!value) continue;
    const hit = ZH[value.trim()];
    if (hit !== undefined && hit !== value) el.setAttribute(name, hit);
  }
}

function walk(node: Node): void {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!shouldSkip(node)) translateText(node as Text);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const root = node as Element;
  if (shouldSkip(root)) return;

  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (current.nodeType === Node.TEXT_NODE) {
      if (!shouldSkip(current)) translateText(current as Text);
    } else {
      translateAttrs(current as Element);
    }
  }
}

/** 只在界面语言是中文时生效。 */
export function startZhDomOverrides(): void {
  if (typeof document === "undefined") return;
  const active = () => document.documentElement.lang.toLowerCase().startsWith("zh");

  const run = () => {
    if (active()) walk(document.body);
  };

  const observer = new MutationObserver((records) => {
    if (!active()) return;
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof Element) {
        translateAttrs(record.target);
        continue;
      }
      for (const added of record.addedNodes) walk(added);
    }
  });

  walk(document.body);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });

  // 切换语言后补一遍：切回英文不再替换，切回中文重新替换。
  new MutationObserver(run).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });
}
