/**
 * 安全汉化层（本地魔改）：只翻界面控件文本（按钮/标题/导航/设置项/placeholder），
 * 跳过 contenteditable、输入框、pre/code、聊天消息 [data-message-id]、prose，精确整段匹配。
 * 审计 A03 教训：无差别替换会改坏用户内容且切语言不还原，这里必须可逆。
 */
import { getClientSettings, subscribeClientSettings } from "../hooks/useSettings";
import { zhSettingsExplanations } from "./zhSettingsExplanations";

/** 英文原文 → 中文。只收界面固定文案，动态插值文本一律跳过。 */
const ZH: Readonly<Record<string, string>> = {
  ...zhSettingsExplanations,
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
  "A t3.json exists in this checkout but fails to parse, so every action and icon it declares is ignored. Check the JSON syntax and icon values.":
    "这个工作副本里的 t3.json 解析失败，它声明的操作和图标都会被忽略。检查 JSON 语法和图标值。",
  "API keys, base URLs, and other per-instance CLI settings.":
    "API 密钥、Base URL 等每个实例独立的 CLI 设置。",
  "Add a 1Password account, then pick it as the source of a provider variable.":
    "添加 1Password 账户后，可把它选为提供方变量的来源。",
  "Add a Guide tab to pull requests. An agent explains the changes and points out decisions that need review.":
    "在 PR 里加一个 Guide 标签页，由 agent 讲解改动并指出需要重点评审的决策。",
  "Add a model API to write thread titles, commit messages, and other short text without starting a coding agent.":
    "接入一个模型 API 来生成会话标题、提交信息等短文本，不必启动编码 agent。",
  "Adjust the contrast of colors and borders across the interface.":
    "调整整个界面颜色和边框的对比度。",
  "Also include skills in the / command menu. Skills always appear when you type $.":
    "在 / 命令菜单里也列出技能；输入 $ 时技能始终出现。",
  "Animate captured windows into your draft.": "把截取的窗口以动画收进草稿。",
  "Any new activity un-settles a thread automatically.": "任何新活动都会自动让会话重新变为未收敛。",
  "Appended to the naming prompt. The model returns the complete branch name; no prefix or suffix is added.":
    "追加到命名提示词后面。模型返回完整分支名，不会再自动加前后缀。",
  "Appended to the prompt for new and regenerated thread titles.":
    "追加到新建和重新生成会话标题的提示词后面。",
  "Auto uses the environment’s GPU when it has one.": "自动：环境有 GPU 时就用 GPU。",
  "Automatically resume interrupted threads after an update, crash, or machine restart on the selected environments.":
    "所选环境在更新、崩溃或重启后，自动恢复被中断的会话。",
  "Automatically resume threads when their usage limits reset. You can cancel auto-resume in each thread.":
    "用量限额重置后自动恢复会话，可在每个会话里取消。",
  "Check installed provider CLIs for newer available versions and fetch model catalog updates. When off, new models may not appear.":
    "检查已安装的提供方 CLI 是否有新版本，并获取模型目录更新；关闭后新模型可能不显示。",
  "Choices in every snooze menu, listed soonest first. Weekdays mean the next one after today.":
    "各个稍后提醒菜单里的选项，按最近时间排序；工作日指今天之后的下一个。",
  "Choose colors for additions and deletions, including change counts.":
    "选择新增/删除的颜色，包括变更计数。",
  "Choose how new worktree branches are named from your first message.":
    "选择新建工作树分支如何根据你的第一条消息命名。",
  "Choose the sound played when capture starts.": "选择开始截取时播放的声音。",
  "Choose what the thread details card shows. You can also right-click the card.":
    "选择会话详情卡显示的内容，也可以右键卡片。",
  "Choose when Enter sends a prompt or inserts a new line": "选择回车是发送还是换行。",
  "Clicking a pull request link opens it in T3 Code. Turn off to open pull request links like any other link, on your git host.":
    "点击 PR 链接时在 T3 Code 内打开；关闭后按普通链接在你的 Git 托管上打开。",
  "Clones go to github.com/owner/repo under the folder above, like ghq.":
    "克隆到上方文件夹下，路径为 github.com/owner/repo，类似 ghq。",
  "Code blocks, diffs, file previews, and the terminal.": "代码块、差异、文件预览和终端。",
  "Commands that run in this project's checkout or its worktree, with optional shortcuts.":
    "在这个项目的工作副本或工作树里运行的命令，可带快捷键。",
  "Connect an environment to view its settings and access.":
    "连接一个环境后即可查看它的设置与权限。",
  "Connect to your server from your phone or tablet.": "用手机或平板连接你的服务器。",
  "Couldn't load the WSL backend state.": "无法加载 WSL 后端状态。",
  "Current version of the application.": "当前应用版本。",
  "Delete inactive rotated log files after this many days. Current logs are kept.":
    "多少天后删除不活跃的轮转日志；当前日志保留。",
  "Delete saved browser captures after this many days. Older capture links will no longer open.":
    "多少天后删除保存的浏览器截取；旧链接将不再打开。",
  "Device that runs this provider.": "运行这个提供方的设备。",
  "Devices that sign in to your T3 Connect account wait until someone already connected here approves them.":
    "登录你 T3 Connect 账户的设备，需要这里已连接的设备批准。",
  "Drop “um” and “uh” from transcripts.": "从转写里去掉「呃」「嗯」这类语气词。",
  "Each account has its own Codex instance and sign-in. Choose the other account on the sign-in page.":
    "每个账户有独立的 Codex 实例和登录；在登录页选择另一个账户。",
  "Everything outside code blocks and the terminal.": "代码块和终端之外的所有文本。",
  "Folder where new worktrees are created, on any drive, such as D:\\\\worktrees or ~/worktrees. Existing worktrees stay where they are. Leave empty to use the T3 home folder.":
    "新建工作树所在文件夹（任意磁盘），如 D:\\\\worktrees 或 ~/worktrees；已有工作树不动，留空使用 T3 主目录。",
  "For example, t3 or t3/ produces t3/add-search. Leave empty for no prefix.":
    "例如 t3 或 t3/ 会生成 t3/add-search；留空则不加前缀。",
  "For thread titles and other generated text. Source control has its own setting. Text generators from Providers also appear here.":
    "用于会话标题等生成文本；源代码管理有单独设置。Providers 里的文本生成器也会出现在这里。",
  "Group sidebar threads into project folders. Pinned threads stay on top, and Snoozed and Settled stay below the folders.":
    "把侧边栏会话按项目分组；置顶会话在最上，稍后提醒和已收敛在文件夹下方。",
  "Hide the commands, edits, and searches agents run. Hide successful keeps failures. Zen shows only final answers. Approvals, questions, and errors always show.":
    "隐藏 agent 执行的命令、编辑和搜索；「仅隐藏成功项」会保留失败。Zen 只显示最终答案；审批、提问和错误始终显示。",
  "Higher values make menus, dialogs, and the composer more solid.":
    "数值越大，菜单、对话框和输入框越不透明。",
  "Highlight mouse presses and held buttons in new recordings.":
    "在新录制里高亮鼠标按下和按住状态。",
  "Inactivity does not settle threads with a pull request. Merge and close still do.":
    "有 PR 的会话不会因不活跃而收敛；合并或关闭仍会。",
  "Include text and controls when the app makes them available.": "应用提供文本和控件时一并包含。",
  "Install and manage Antigravity.": "安装和管理 Antigravity。",
  "Keep branch and worktree controls below the composer after a thread starts.":
    "会话开始后，把分支和工作树控件留在输入框下方。",
  "Keep webhook requests for up to 24 hours while this environment is offline, then deliver them. Off: T3 Connect only forwards requests and stores nothing.":
    "环境离线时最多保留 webhook 请求 24 小时再投递；关闭后 T3 Connect 只转发、不存储。",
  "Link another machine running T3 Code, such as a VPS, so agents here can launch and drive threads there.":
    "连接另一台运行 T3 Code 的机器（如 VPS），这里的 agent 就能在那台上发起和驱动会话。",
  "Maximum recording rate. 30 fps saves CPU and storage; 60 fps is smoother.":
    "最大录制帧率。30fps 省 CPU 和存储；60fps 更流畅。",
  "Model for commit messages, pull request text, and branch or bookmark names. When disabled, use the text generation model configured for this environment.":
    "用于提交信息、PR 文案、分支/书签名；关闭时使用该环境配置的文本生成模型。",
  "Model for transcript cleanup, such as a cheaper or faster one. When disabled, use the text generation model configured for this environment.":
    "用于转写清理（可换更便宜更快的模型）；关闭时使用该环境配置的文本生成模型。",
  "Must be a coding agent: it reads the pull request over many steps. Off uses the writer model, or Codex or Claude if that model is a text generator.":
    "必须是编码 agent：它要分多步读 PR。关闭时用写作模型；若那是文本生成器则用 Codex 或 Claude。",
  "Names and terms to spell your way, saved on this device.":
    "按你的写法记住的名称和术语，保存在本机。",
  "Narrow the selection above to one checkout to edit its list. Adding an action here adds it to every selected checkout.":
    "把上面的选择缩小到单个工作副本才能编辑它的列表；在这里添加会加到所有选中的副本。",
  "No tasks match this environment and project selection.":
    "没有匹配当前环境和项目选择的定时任务。",
  "Notices for dependencies, assets, and optional tools used by T3 Code.":
    "T3 Code 所用依赖、资源和可选工具的声明。",
  "Off by default. Sends the transcript and nearby draft text, never audio, to the cleanup model.":
    "默认关闭。把转写和附近的草稿文本（绝不含音频）发给清理模型。",
  "On a Mac, clone new worktrees from a checkout cached in the T3 home folder instead of writing every file. Uses Git’s normal checkout when it can’t. Turning it off deletes the cache.":
    "在 Mac 上，新建工作树从 T3 主目录缓存的工作副本克隆，而不是逐文件写出；不行时回退到普通 git checkout。关闭会删掉缓存。",
  "One literal argument per row, in launch order.": "每行一个字面参数，按启动顺序。",
  "Only the box you write prompts in. Mono works well here.":
    "只作用于写提示词的输入框；等宽字体在这里效果好。",
  "Open linked pull requests first. Otherwise, open Changes for edits to at least 3 files or 50 lines.":
    "优先打开已关联的 PR；否则当改动 ≥3 个文件或 50 行时打开 Changes。",
  "Optional marker shown in the picker.": "选择器里显示的可选标记。",
  "Page zoom applied to new browser tabs.": "新浏览器标签页的缩放比例。",
  "Pinned projects come first in project pickers.": "项目选择器里置顶项目排最前。",
  "Preparing managed setup.": "正在准备托管配置。",
  "Preparing sign-in.": "正在准备登录。",
  "Profiles separate cookies and logins. Incognito data is cleared when the app closes.":
    "配置文件隔离 Cookie 和登录；无痕数据在应用关闭时清除。",
  "Provider setup is read-only.": "提供方配置为只读。",
  "Reconnect this device to set up its provider, or select another device.":
    "重新连接此设备来配置提供方，或选择另一台设备。",
  "Record ten seconds and play it back. The audio stays on this device.":
    "录十秒并回放，音频只留在本机。",
  "Refresh provider status, versions, and models in the background. Set to 0 to disable.":
    "后台刷新提供方状态、版本和模型；设为 0 关闭。",
  "Release the model’s memory on the environment after it sits idle.":
    "模型空闲一段时间后在环境上释放内存。",
  "Remove recognized agent credit lines from merge and squash messages on hosts that support it, keeping human co-authors. Includes auto-merge. Excludes merge queues, stack merges, and existing commits.":
    "合并/压缩提交时去掉 agent 署名行（保留人类协作者），含自动合并；不含合并队列、栈合并和已有提交。",
  "Remove unused worktrees when active or archived threads are deleted. Worktrees with local changes are kept.":
    "删除活跃或归档会话时清理无用工作树；有本地改动的保留。",
  "Remove worktrees after their threads have been inactive for this many days. Branches and thread history are kept.":
    "会话不活跃这么多天后删除工作树；分支和会话历史保留。",
  "Remove worktrees this many days after their thread settles. Set 0 days to remove them at the next cleanup. Branches and thread history are kept.":
    "会话收敛这么多天后删除工作树（0 天=下次清理时删）；分支和会话历史保留。",
  "Remove worktrees whose pull request is merged and whose commits are included in the default branch.":
    "删除 PR 已合并且提交已进入默认分支的工作树。",
  "Remove worktrees with no commits beyond the default branch.":
    "删除相对默认分支没有额外提交的工作树。",
  "Resume agent-owned conversations as T3 threads.": "把 agent 自己的会话恢复为 T3 会话。",
  "Run `t3 connect link` on the host, then restart T3 Code there.":
    "在主机上运行 `t3 connect link`，然后重启那里的 T3 Code。",
  "Run only the WSL backend. T3 Code restarts when this changes.":
    "只运行 WSL 后端；切换后 T3 Code 会重启。",
  "Run the selected WSL distro alongside Windows. Projects remain on their current filesystem.":
    "在 Windows 之外运行所选 WSL 发行版；项目保留在当前文件系统。",
  "See your agents, import projects, and set up your phone.": "查看 agent、导入项目、配置手机。",
  "Selected by T3 Code.": "由 T3 Code 选择。",
  "Set how fast panels open and close.": "设置面板开合速度。",
  "Set how wide messages and the composer can grow on large screens.":
    "设置大屏上消息和输入框的最大宽度。",
  "Set the prompt, code, and terminal fonts separately instead of one monospace font.":
    "分别设置提示词、代码和终端字体，而不是共用一个等宽字体。",
  "Set whether the diff panel ignores whitespace-only edits by default.":
    "设置差异面板默认是否忽略纯空白改动。",
  "Settle a thread when its pull request merges. Closed pull requests still settle automatically.":
    "PR 合并时会话自动收敛；PR 关闭仍会自动收敛。",
  "Share a thread with a guest who watches it live in a browser and sends messages you approve. Sign in to T3 Connect to use guest links.":
    "把会话分享给访客，他在浏览器里实时观看并可发送需要你批准的消息。需登录 T3 Connect。",
  "Shared Codex config, sessions, and state.": "共享的 Codex 配置、会话和状态。",
  "Show a gentle cue on the captured window.": "在被截取的窗口上显示轻微提示。",
  "Show a predicted next message in the empty composer after a Claude or Codex turn. Tab uses it. Each is an extra cached request on your plan. Needs Codex 0.165+. Claude threads update on restart.":
    "Claude/Codex 一轮结束后在空输入框里预测下一条消息，按 Tab 采用；每次都是额外的缓存请求。需 Codex 0.165+；Claude 会话重启后生效。",
  "Show diffs stacked or side by side. The toggle in the diff toolbar changes this too.":
    "差异以堆叠或并排显示；差异工具栏里的切换也能改。",
  "Show folder threads on two lines: the title, then the branch, pull request, and agent.":
    "文件夹里的会话显示两行：标题，然后分支、PR 和 agent。",
  "Show formatted Markdown as you type.": "输入时实时显示 Markdown 效果。",
  "Show pressed keys and shortcuts in new recordings. Password fields are excluded.":
    "在新录制里显示按键和快捷键（密码框除外）。",
  "Show reasoning effort in the composer as its name, such as High, or as bars.":
    "在输入框里把推理强度显示为名称（如 High）或条形。",
  "Show the floating preview when an agent opens a browser or device unless the agent says otherwise.":
    "agent 打开浏览器或设备时显示浮动预览（除非 agent 另有说明）。",
  "Shown in the provider list and model picker.": "显示在提供方列表和模型选择器里。",
  "Sidebar threads with no activity for this long settle automatically.":
    "侧边栏会话不活跃这么久后自动收敛。",
  "Snooze threads until their usage limits reset. Enable auto-resume to continue the agent after the reset.":
    "把会话稍后提醒到用量限额重置；开启自动恢复可在重置后继续。",
  "Speak any language and get English text.": "说任何语言，得到英文文本。",
  "Start the window title with the thread's status, like Needs approval, and its name, so screen readers read them first when you switch apps. Taskbars, shared screens, and time trackers see it too.":
    "窗口标题以会话状态（如「需要审批」）和名称开头，读屏软件切换应用时先读到；任务栏、共享屏幕和时间统计也能看到。",
  "Start with files expanded or collapsed when opening diffs or a pull request's Code tab.":
    "打开差异或 PR 的 Code 标签时，文件默认展开还是收起。",
  "Stop the computer from going to sleep while agents are working, and let it sleep once they finish. Closing a laptop lid still puts it to sleep.":
    "agent 工作时阻止电脑休眠，完成后允许休眠；合盖仍会休眠。",
  "Switches the hosted app release channel.": "切换托管应用的发布通道。",
  "Tab size for you and agents. Fill fits the panel; other sizes show the device toolbar.":
    "你和 agent 的标签页尺寸；Fill 铺满面板，其他尺寸显示设备工具栏。",
  "Terminal output, independent from code blocks and diffs.": "终端输出，独立于代码块和差异。",
  "The color scheme pages are told to prefer. System follows your OS setting.":
    "告诉网页优先使用的配色；System 跟随系统设置。",
  "The phrase you say to fix a mistake, like “scratch that”.":
    "用来纠正错误的口令，例如「说错了」。",
  "The shared name for this project group in the sidebar and thread lists.":
    "这个项目分组在侧边栏和会话列表里的共享名称。",
  "This environment was removed from T3 Connect. Run `t3 connect link` on the host to link it again.":
    "这个环境已从 T3 Connect 移除；在主机上运行 `t3 connect link` 重新关联。",
  "This task was deleted or belongs to a different project. Check your project filter.":
    "这个任务已被删除或属于其他项目；检查你的项目筛选。",
  "To edit these settings, pair this connection with both View relay and Manage relay permissions.":
    "要编辑这些设置，需要给这个连接同时授予 View relay 和 Manage relay 权限。",
  "Typeset LaTeX math, such as $x^2$ or \\[x^2\\], in messages and Markdown previews. The composer keeps TeX source editable.":
    "在消息和 Markdown 预览里排版 LaTeX 公式（如 $x^2$）；输入框保留可编辑的 TeX 源码。",
  "Update this environment to manage Antigravity.": "更新这个环境后才能管理 Antigravity。",
  "Use %s where the search terms go.": "用 %s 表示搜索词的位置。",
  "Use the repository's pull request template when it has one.": "仓库有 PR 模板时使用它。",
  "Use thinner grayscale text smoothing instead of the macOS default.":
    "使用更细的灰度字体平滑，替代 macOS 默认。",
  "Used for new threads when the default model's provider is out of usage.":
    "默认模型提供方额度用尽时，新会话使用它。",
  "Uses the latest commit of the base branch’s tracked remote branch, even if its name differs. Otherwise uses the same-named branch on origin. Uses your local branch if that remote branch is missing.":
    "使用基线分支所跟踪远端分支的最新提交（名字不同也行）；否则用 origin 上同名分支；都没有则用本地分支。",
  "Using CURSOR_API_KEY. Remove it from this provider's environment to use browser sign-in.":
    "正在使用 CURSOR_API_KEY；想用浏览器登录，就从该提供方的环境变量里移除它。",
  "Voice input uses the first connected microphone in this list.":
    "语音输入使用列表里第一个已连接的麦克风。",
  "WSL is unavailable, so Windows is running instead. Turn WSL off to clear this preference.":
    "WSL 不可用，改用 Windows 运行；关掉 WSL 可清除此偏好。",
  "What a screen reader hears from the open thread: a turn starting, needing you, and ending. Status and messages adds what the agent writes before its last message. Everything adds each step.":
    "读屏软件从当前会话听到的内容：开始、需要你、结束。「状态和消息」会加上 agent 最后一条消息前写的内容；「全部」包括每一步。",
  "What the address bar searches when you type something that isn't a URL.":
    "在地址栏输入非 URL 时用什么搜索。",
  "When to compact an idle Claude thread over 200,000 tokens: after you return, just before its prompt cache expires, or never. Each Claude provider can override this.":
    "空闲 Claude 会话超过 20 万 token 时何时压缩：你回来时、提示缓存过期前，或从不；每个 Claude 提供方可覆盖。",
  "Where links in the chat and terminal open. Hold ⌘ or Ctrl while clicking a link to open it in your default browser either way.":
    "聊天和终端里的链接在哪打开；按住 ⌘/Ctrl 点击始终用默认浏览器。",
  "Wrap long lines in code blocks, diffs, and file previews by default.":
    "代码块、差异和文件预览默认自动换行。",
  "Writes thread titles, commit messages, and other short text without starting a coding agent. Your API key is stored on this environment.":
    "不启动编码 agent 就能生成会话标题、提交信息等短文本；API 密钥存在该环境上。",
  "Your preferences for review guides: what to show first, dwell on, or skip. The guide's format and coverage stay the same.":
    "评审指南偏好：先看什么、停在哪、跳过什么；指南的格式和覆盖面不变。",
  Accent: "强调色",
  Access: "访问",
  Accessibility: "辅助功能",
  Action: "操作",
  Agent: "Agent",
  All: "全部",
  Always: "始终",
  Amount: "数额",
  Android: "Android",
  Auto: "自动",
  Background: "背景",
  Border: "边框",
  Build: "构建",
  "Cancel sign-in": "取消登录",
  "Checking…": "检查中…",
  Command: "命令",
  Condition: "条件",
  Contrast: "对比度",
  Default: "默认",
  Desktop: "桌面",
  Destination: "目标",
  Device: "设备",
  Encoding: "编码",
  Enter: "回车",
  Error: "错误",
  Fast: "快速",
  Foundation: "基础色",
  Header: "请求头",
  High: "高",
  Idle: "空闲",
  Interval: "间隔",
  Label: "标签",
  Loading: "加载中",
  Low: "低",
  Max: "最大",
  Medium: "中",
  Memory: "内存",
  Minimal: "最小",
  More: "更多",
  Navigation: "导航",
  None: "无",
  Off: "关",
  Optional: "可选",
  Other: "其他",
  Permissions: "权限",
  Plan: "计划",
  Prefix: "前缀",
  "Privacy policy": "隐私政策",
  Prompt: "提示词",
  Reasoning: "推理",
  Recommended: "推荐",
  Refresh: "刷新",
  Sample: "示例",
  Samples: "采样",
  Secret: "密钥",
  Service: "服务",
  Session: "会话",
  Speed: "速度",
  Standard: "标准",
  Starting: "启动中",
  Surface: "表面",
  Terminal: "终端",
  Text: "文本",
  Themes: "主题",
  Thinking: "思考中",
  Time: "时间",
  Toggle: "切换",
  Translate: "翻译",
  Unit: "单位",
  Value: "值",
  Warning: "警告",
  When: "时机",
  Word: "词语",
  Write: "写入",
  Read: "读取",
  "Extra High": "极高",
  Misspelling: "拼写错误",
  Hold: "按住",
  "Accent color hue": "强调色色相",
  "Actions not saved": "操作未保存",
  "Add project base directory": "添加项目的根目录",
  "Add project starts in": "添加项目时从这里开始",
  "Add secret provider": "添加密钥提供方",
  "Add words, separated by commas": "添加词语，用逗号分隔",
  "Agent browser access": "Agent 浏览器访问",
  "Agent device access": "Agent 设备访问",
  "Agent token": "Agent 令牌",
  "Agents can use devices": "Agent 可以使用设备",
  "All checkouts": "所有工作副本",
  "All environments": "所有环境",
  "All projects": "所有项目",
  "Allow GNOME extensions": "允许 GNOME 扩展",
  "Allow snapshots": "允许快照",
  "Already downloaded elsewhere? Paste the model file or folder path":
    "已经在别处下载过？直接粘贴模型文件或目录路径",
  "Animate snapshots": "快照动画",
  "Antigravity download": "Antigravity 下载",
  "Antigravity setup": "Antigravity 设置",
  "API key": "API 密钥",
  "Auto-settle inactive threads": "自动收敛不活跃会话",
  "Auto-settle merged threads": "自动收敛已合并会话",
  "Auto-show floating preview": "自动显示浮动预览",
  "Automatic capture isn't available": "自动截取不可用",
  "Automatically balance load": "自动均衡负载",
  "Backend + agents": "后端 + Agent",
  "Backend added": "后端已添加",
  "Background activity profile": "后台活动配置",
  "Background policy details": "后台策略详情",
  "Base branch": "基线分支",
  "Best rated": "评分最高",
  "Boring sidebar (group by project)": "简洁侧栏（按项目分组）",
  "Browse models by language": "按语言浏览模型",
  "Browser profiles": "浏览器配置",
  "Browser recording frame rate": "浏览器录制帧率",
  "Browser storage is unavailable, so the change was not kept.": "浏览器存储不可用，更改没有保存。",
  "Can't connect": "连不上",
  "Cancel new keybinding": "取消新快捷键",
  "Capture animations": "截取动画",
  "Capture flash": "截取闪光",
  "Capture is ready": "截取已就绪",
  "Capture shortcut": "截取快捷键",
  "Capture sound": "截取音效",
  "Capture the window you're using.": "截取你正在使用的窗口。",
  "Chat width": "聊天宽度",
  "ChatGPT account to connect": "要连接的 ChatGPT 账户",
  "ChatGPT sign-in redirect URL": "ChatGPT 登录回跳地址",
  "Check capture access": "检查截取权限",
  "Check provider versions": "检查提供方版本",
  "Check T3 Code SnapShots in GNOME Extensions, then try again.":
    "在 GNOME 扩展里检查 T3 Code SnapShots，然后再试。",
  "Checkout path": "工作副本路径",
  "Child Processes": "子进程",
  "Choice label": "选项名称",
  "Choice value": "选项值",
  "Choose a project icon": "选择项目图标",
  "Choose a project icon file": "选择项目图标文件",
  "Choose a window each time": "每次选择窗口",
  "Choose files": "选择文件",
  "Choose project icon": "选择项目图标",
  "Choose your shortcut": "选择你的快捷键",
  "Cleanup instructions": "清理说明",
  "Cleanup model not saved": "清理模型未保存",
  "Clear access token": "清除访问令牌",
  "Clear agent token": "清除 Agent 令牌",
  "Client scopes": "客户端权限范围",
  "Clone into host folders": "克隆到主机目录",
  "Close model test": "关闭模型测试",
  "Close the theme editor": "关闭主题编辑器",
  "Coalesce key": "合并键",
  "Coalesce window": "合并窗口",
  "Coalesce window must be whole seconds from 10 to 3600.": "合并窗口必须是 10–3600 的整数秒。",
  "Code and terminal need a fixed-width font, so the current font was kept.":
    "代码和终端需要等宽字体，所以保留了当前字体。",
  "Code blocks, diffs, and file previews.": "代码块、差异和文件预览。",
  "Code font": "代码字体",
  "Code font size": "代码字号",
  "Code surface": "代码区背景",
  "Codex binary path": "Codex 可执行文件路径",
  "Codex home path": "Codex 主目录路径",
  "Codex setup": "Codex 设置",
  "Codex shadow home path": "Codex 影子主目录路径",
  "Collection time": "采集时间",
  "Color scheme": "配色方案",
  "Commit messages and pull request titles and descriptions match each project's history.":
    "提交信息和 PR 标题/描述跟随各项目的历史风格。",
  "Commit messages, pull requests, and branch names": "提交信息、PR 和分支名",
  "Complete sign-in in your browser.": "在浏览器里完成登录。",
  "Configure advanced background activity": "配置高级后台活动",
  "Continue threads after restarts": "重启后继续会话",
  "Conventional Commit prefixes, with short pull request titles and descriptions.":
    "约定式提交前缀，PR 标题和描述保持简短。",
  "Conventional Commits": "约定式提交",
  "Copy code": "复制代码",
  "Copy options from a built-in model": "从内置模型复制选项",
  "Copy sign-in link": "复制登录链接",
  "Copy update command": "复制更新命令",
  "Could not add backend": "添加后端失败",
  "Could not add provider instance": "添加提供方实例失败",
  "Could not change WSL backend": "切换 WSL 后端失败",
  "Could not check for updates": "检查更新失败",
  "Could not confirm signal": "信号确认失败",
  "Could not confirm update": "更新确认失败",
  "Could not continue authentication": "无法继续登录",
  "Could not copy diagnostics": "复制诊断信息失败",
  "Could not copy MCP URL": "复制 MCP 地址失败",
  "Could not copy trace ID": "复制 Trace ID 失败",
  "Could not copy version": "复制版本号失败",
  "Could not create pairing URL": "创建配对链接失败",
  "Could not delete provider instance": "删除提供方实例失败",
  "Could not disable Tailscale HTTPS": "关闭 Tailscale HTTPS 失败",
  "Could not install update": "安装更新失败",
  "Could not load transcription models": "转写模型加载失败",
  "Could not open image picker": "打不开图标选择器",
  "Could not open System Settings": "打不开系统设置",
  "Could not remove backend": "移除后端失败",
  "Could not reset provider instance": "重置提供方实例失败",
  "Could not restart resource monitor": "重启资源监控失败",
  "Could not revoke client access": "撤销客户端访问失败",
  "Could not revoke other clients": "撤销其他客户端失败",
  "Could not revoke pairing link": "撤销配对链接失败",
  "Could not rotate webhook URL": "轮换 Webhook 地址失败",
  "Could not save grouping rule": "保存分组规则失败",
  "Could not save pull request routing permission": "保存 PR 路由权限失败",
  "Could not save your theme": "主题保存失败",
  "Could not set up Tailscale HTTPS": "设置 Tailscale HTTPS 失败",
  "Could not update network access": "更新网络访问失败",
  "Could not update provider instance": "更新提供方实例失败",
  "Could not update scheduled task": "更新定时任务失败",
  "Couldn't check snapshots. Try again to continue.": "快照检查失败，重试后继续。",
  "Couldn't set up the extension": "扩展设置失败",
  "Couldn’t remove theme": "主题删除失败",
  "Couldn’t restore theme settings": "主题设置恢复失败",
  "Couldn’t save theme selection": "主题选择保存失败",
  "CPU speed limit": "CPU 限速",
  "CPU Time": "CPU 时间",
  "Current CPU": "当前 CPU",
  "Current match": "当前匹配",
  "Custom cleanup instructions": "自定义清理说明",
  "Custom commit and pull request instructions": "自定义提交与 PR 说明",
  "Custom commit and pull request instructions for all selected environments":
    "给所有选中环境的自定义提交与 PR 说明",
  "Custom CSS": "自定义 CSS",
  "Custom emoji": "自定义 emoji",
  "Custom hex accent color": "自定义十六进制强调色",
  "Custom instructions": "自定义说明",
  "Days of inactivity before auto-settle": "不活跃多少天后自动收敛",
  "Days to run": "运行日",
  Decrease: "减少",
  "default automatic pull": "默认自动拉取",
  "Default automatic pull": "默认自动拉取",
  "default browser access": "默认浏览器权限",
  "Default browser appearance": "默认浏览器外观",
  "Default browser profile": "默认浏览器配置",
  "default browser viewport": "默认浏览器视口",
  "Default browser viewport": "默认浏览器视口",
  "default browser zoom": "默认浏览器缩放",
  "Default browser zoom": "默认浏览器缩放",
  "Default choice": "默认选项",
  "default diff file state": "默认差异文件状态",
  "Default diff file state": "默认差异文件状态",
  "default merge method": "默认合并方式",
  "Default merge method": "默认合并方式",
  "Default model not saved": "默认模型未保存",
  "default permissions": "默认权限",
  "Default permissions": "默认权限",
  "Default pull request merge method": "默认 PR 合并方式",
  "Default viewport height": "默认视口高度",
  "Default viewport width": "默认视口宽度",
  "default workspace": "默认工作区",
  "Default workspace": "默认工作区",
  "Defaults to the hub's host name": "默认用 Hub 的主机名",
  "Delete now": "立即删除",
  "Desktop only": "仅桌面",
  "Device host not saved": "设备主机未保存",
  "Device hub": "设备 Hub",
  "Device settings not saved on all environments": "设备设置没有在所有环境保存",
  "Dictation shortcut mode": "听写快捷键模式",
  "Diff colors": "差异颜色",
  "Diff layout": "差异布局",
  "diff whitespace changes": "差异空白变更",
  "Duplicate request key": "重复的请求键",
  "e.g. Check for Sentry issues": "例如检查 Sentry 问题",
  "e.g. dsh": "例如 dsh",
  "e.g. Living room iPad": "例如客厅 iPad",
  "e.g. Personal or Work": "例如个人或工作",
  "e.g. Work": "例如工作",
  "effort display": "推理强度显示",
  "Effort display": "推理强度显示",
  "Electron main process": "Electron 主进程",
  "Enable network access": "启用网络访问",
  "Enable snapshots": "启用快照",
  "Enable T3 Code SnapShots to start capturing windows.": "启用 T3 Code SnapShots 后才能截取窗口。",
  "Enable Tailscale HTTPS": "启用 Tailscale HTTPS",
  "Enable the extension": "启用扩展",
  "Endpoint the pairing QR code and URL use": "配对二维码和链接使用的端点",
  "Enter a backend host and pairing code.": "输入后端主机和配对码。",
  "Enter an HTTP or HTTPS endpoint, or leave empty to disable export.":
    "填 HTTP/HTTPS 地址，留空则关闭导出。",
  "Enter API key": "输入 API 密钥",
  "Environment icon": "环境图标",
  "environment identification": "环境标识",
  "Environment identification": "环境标识",
  "Executable name or path on this environment.": "这个环境上的可执行文件名或路径。",
  "Expo access token": "Expo 访问令牌",
  "Expo project": "Expo 项目",
  "Expo Simulators": "Expo 模拟器",
  "Extension installed": "扩展已安装",
  "Failed to save project actions": "项目操作保存失败",
  Failures: "失败",
  "fallback model": "备用模型",
  "Fallback model": "备用模型",
  "Fallback model not saved": "备用模型未保存",
  "Fast worktree checkout": "快速工作副本检出",
  "Fast Mode": "快速模式",
  "Filter colors": "筛选颜色",
  "Filter models": "筛选模型",
  "Flash captured window": "截取时闪烁窗口",
  "Follow pull request templates": "跟随 PR 模板",
  "follow-up behavior": "追问行为",
  "Follow-up behavior": "追问行为",
  "font smoothing": "字体平滑",
  "Font smoothing": "字体平滑",
  "Full Disk Access": "完全磁盘访问权限",
  "Git fetch interval": "Git 拉取间隔",
  "glass opacity": "毛玻璃透明度",
  "Glass opacity": "毛玻璃透明度",
  "Guest links": "访客链接",
  "Having trouble signing in?": "登录遇到问题？",
  "Health check interval": "健康检查间隔",
  "Hide whitespace changes": "隐藏空白变更",
  "Hide whitespace changes by default": "默认隐藏空白变更",
  "Highlight surface": "高亮表面",
  "Hold webhooks while offline": "离线时挂起 Webhook",
  "Icon color": "图标颜色",
  "Icon type": "图标类型",
  Inaccessible: "不可访问",
  "Include app text": "包含应用文本",
  "Include app text in snapshots": "快照包含应用文本",
  Increase: "增加",
  "Install the extension": "安装扩展",
  "Install the update, then sign out and back in.": "先装更新，然后退出重新登录。",
  "Interface font": "界面字体",
  "Interface font size": "界面字号",
  "Invalid age limit": "时限无效",
  "Invalid provider headers": "提供方请求头无效",
  "Invalid run time": "运行时间无效",
  "Invalid webhook settings": "Webhook 设置无效",
  "It’s now active.": "现已启用。",
  "keep awake while agents work": "Agent 工作时保持唤醒",
  "Keep awake while agents work": "Agent 工作时保持唤醒",
  "Keep commit subjects under 60 characters. Keep pull request descriptions short and plain.":
    "提交标题控制在 60 字以内，PR 描述保持简短平实。",
  "Keep composer context visible in active threads": "活跃会话里保持输入框上下文可见",
  "Keep worktrees with local changes": "保留有本地改动的工作副本",
  'Leave empty to use "~/" when the Add Project browser opens.':
    "留空时，添加项目对话框从「~/」开始。",
  "Less often": "较少",
  "Let's fix capture access": "修复截取权限",
  "Let's try that again": "再试一次",
  "Light and dark theme variants": "浅色和深色主题变体",
  "link environment": "关联环境",
  "link target": "链接目标",
  "Linked environments": "关联环境",
  "Live preview": "实时预览",
  "Local ACP": "本地 ACP",
  "Local simulators": "本地模拟器",
  Logs: "日志",
  "Low power mode": "低电量模式",
  "Mac mini": "Mac mini",
  "Management key": "管理密钥",
  "Manual only": "仅手动",
  "math rendering": "公式渲染",
  "MCP URL copied": "MCP 地址已复制",
  "Microphone input level": "麦克风输入电平",
  "Microphones, preferred first": "麦克风，常用在前",
  "Mobile app": "移动应用",
  "Monitor overhead": "监控开销",
  "More actions for this machine": "这台机器的更多操作",
  "More providers": "更多提供方",
  "Most downloaded": "下载最多",
  "Most relevant": "最相关",
  "Muted text": "弱化文本",
  Native: "原生",
  "Native process monitor": "原生进程监控",
  "Negate group": "取反分组",
  "Network access": "网络访问",
  "New threads": "新会话",
  "new worktrees start from remote": "新工作副本从远端开始",
  Newest: "最新",
  "Next, choose your shortcut.": "下一步，选你的快捷键。",
  "Open all environments": "打开所有环境",
  "Open GNOME Extensions and turn on extensions, then check again.":
    "打开 GNOME 扩展并开启扩展，然后再检查。",
  "Open keybindings.json": "打开 keybindings.json",
  "Open links in": "链接打开位置",
  "Open logs folder": "打开日志目录",
  "Open Privacy & Security → Full Disk Access manually.":
    "手动打开 系统设置 → 隐私与安全性 → 完全磁盘访问权限。",
  "Open pull requests and changes panels proactively": "主动打开 PR 和变更面板",
  "open pull requests in T3 Code": "在 T3 Code 内打开 PR",
  "Open pull requests in T3 Code": "在 T3 Code 内打开 PR",
  "Open source licenses": "开源许可证",
  "OpenRouter model": "OpenRouter 模型",
  "Option id": "选项 ID",
  "Option label": "选项标签",
  "Option type": "选项类型",
  "Other paired clients will need a new pairing link before reconnecting.":
    "其他已配对的客户端重连前需要新的配对链接。",
  Overlay: "浮层",
  "Overridden for this project. Show where this value comes from":
    "已被本项目覆盖。查看这个值的来源",
  "Pairing link scopes": "配对链接权限",
  "Panel animation duration": "面板动画时长",
  "panel animations": "面板动画",
  "Panel animations": "面板动画",
  "Parse Errors": "解析错误",
  "Paste an emoji": "粘贴一个 emoji",
  "Paste the URL from the sign-in tab": "粘贴登录页的链接",
  "Path to a model file or folder already on this environment":
    "这个环境上已有的模型文件或目录路径",
  "Pause on battery": "用电池时暂停",
  "Pause on client low power": "客户端低电量时暂停",
  "Pause on host low power": "主机低电量时暂停",
  "Pause when host is locked": "主机锁定时暂停",
  "Pin project": "置顶项目",
  "Play Click": "播放咔哒声",
  "Play Whoosh": "播放嗖声",
  "Power source": "电源",
  Prefer: "偏好",
  "Preview & diff": "预览与差异",
  "proactive panels": "主动面板",
  "Process already exited": "进程已退出",
  "Process count": "进程数",
  "Process history period": "进程历史区间",
  "Process scan": "进程扫描",
  Processes: "进程",
  "Project defaults and overrides": "项目默认值与覆盖",
  "Project dictionary": "项目词典",
  "Project for ACP providers": "ACP 提供方的项目",
  "Project for ACP sessions": "ACP 会话的项目",
  "project grouping": "项目分组",
  "project icon": "项目图标",
  "project name": "项目名称",
  "Project name": "项目名称",
  "project order": "项目排序",
  "Project overview": "项目概览",
  "Project scripts": "项目脚本",
  "Project title cannot be empty": "项目名不能为空",
  "Prompt font": "提示词字体",
  "Prompt font size": "提示词字号",
  "Provider deleted, but managed files remain": "提供方已删除，但托管文件还在",
  "provider health check interval": "提供方健康检查间隔",
  "provider health interval": "提供方健康检查间隔",
  "Provider instance added": "提供方实例已添加",
  "Provider sign-in terminal": "提供方登录终端",
  "provider update checks": "提供方更新检查",
  "Provider update checks": "提供方更新检查",
  "Publish agent activity": "公开 Agent 活动",
  "quit shortcut behavior": "退出快捷键行为",
  "Raised surface": "凸起表面",
  "Read and act": "读取并操作",
  "Read PRs": "读 PR",
  "Read throughput": "读取吞吐",
  "Recording playback position": "录音回放位置",
  "Recording time": "录音时长",
  "Refresh microphones": "刷新麦克风",
  "Refresh process diagnostics": "刷新进程诊断",
  "Refresh resource history": "刷新资源历史",
  "Refresh resource telemetry": "刷新资源遥测",
  "Refresh the provider and start the authentication flow again.": "刷新提供方并重新开始登录流程。",
  "Refresh trace diagnostics": "刷新链路诊断",
  "Remote link": "远程链接",
  "Remove agent credits when merging": "合并时移除 Agent 额度",
  "Remove choice": "移除选项",
  "Remove downloaded runtime": "删除已下载的运行时",
  "Render math": "渲染公式",
  "Replay panel animation preview": "重放面板动画预览",
  "Repository conventions": "仓库约定",
  "Require approval for new devices": "新设备需要批准",
  "Rescan server environment": "重新扫描服务端环境",
  "Resident memory": "常驻内存",
  "Resource history period": "资源历史区间",
  "response streaming": "响应流式输出",
  "Response streaming": "响应流式输出",
  Restarts: "重启次数",
  "Resume after usage limits": "额度恢复后继续",
  "review guide instructions": "评审指南说明",
  "Review guide instructions": "评审指南说明",
  "Review guide model": "评审指南模型",
  "Review guide model not saved": "评审指南模型未保存",
  "Review guides": "评审指南",
  "Review guides (beta)": "评审指南（测试版）",
  "rich text composer": "富文本输入框",
  "Rich text composer": "富文本输入框",
  "Route added": "路由已添加",
  "Run every request": "每次请求都运行",
  "Run it in a terminal when you are ready to update.": "准备好更新后在终端里运行。",
  "Run WSL only": "仅用 WSL 运行",
  "Runs on": "运行于",
  "save source control providers": "保存源代码管理提供方",
  "Save your work, then sign out and back in. Your setup will be waiting here.":
    "保存工作，退出后重新登录；配置会原样保留。",
  "Schedule type": "计划类型",
  "scheduled task delete": "定时任务删除",
  "scheduled task enabled": "定时任务已启用",
  "scheduled task rotate webhook token": "定时任务轮换 Webhook 令牌",
  "scheduled task run now": "定时任务立即运行",
  "scheduled task upsert": "定时任务保存",
  "screen reader announcements": "读屏播报",
  "Screen reader announcements": "读屏播报",
  "screen reader window title": "读屏窗口标题",
  "Screen reader window title": "读屏窗口标题",
  "Screen Recording": "屏幕录制",
  "Search ACP Registry": "搜索 ACP 注册表",
  "Search agents…": "搜索 Agent…",
  "Search all Lucide icons": "搜索全部 Lucide 图标",
  "Search all threads...": "搜索全部会话…",
  "search engine": "搜索引擎",
  "Search engine": "搜索引擎",
  "Search fonts…": "搜索字体…",
  "Search hosts or type devbox": "搜索主机或输入 devbox",
  "Search image files…": "搜索图片文件…",
  "Search keybindings": "搜索快捷键",
  "Search languages": "搜索语言",
  "Search licenses": "搜索许可证",
  "Search Lucide icons": "搜索 Lucide 图标",
  "Search matches": "搜索匹配",
  "Search models": "搜索模型",
  "Search Open VSX themes": "搜索 Open VSX 主题",
  "Search open-source licenses": "搜索开源许可证",
  "Search themes...": "搜索主题…",
  "Search threads": "搜索会话",
  "Search transcription models": "搜索转写模型",
  "Select a project": "选择项目",
  "send shortcut": "发送快捷键",
  "Send shortcut": "发送快捷键",
  "Send SIGINT": "发送 SIGINT",
  "Send SIGKILL": "发送 SIGKILL",
  "Separate fonts": "分开设置字体",
  "Server PID": "服务端 PID",
  "Setting not saved": "设置未保存",
  "Shared background policy": "共享后台策略",
  Shortcut: "快捷键",
  "Shortcut changes": "快捷键变更",
  "Shortcut saved": "快捷键已保存",
  "Show key presses in recordings": "录制里显示按键",
  "Show mouse presses in recordings": "录制里显示鼠标点击",
  "Show skills in slash menu": "斜杠菜单里显示技能",
  "Sidyebar selection": "侧栏选中",
  "Sidebar background": "侧栏背景",
  "Sidebar controls": "侧栏控件",
  "Sidebar selection": "侧栏选中",
  Sidecar: "伴随进程",
  "Sign-in method": "登录方式",
  Simlock: "设备锁",
  "Simlock device hosts": "设备锁主机",
  "Simlock device hosts (alpha)": "设备锁主机（早期版）",
  "Skip requests older than": "跳过早于此的请求",
  "Slow Spans": "慢 Span",
  "snooze options": "稍后提醒选项",
  "Snooze options": "稍后提醒选项",
  "Snooze until limits reset": "稍后提醒到额度重置",
  "Sort themes": "主题排序",
  "Source control writer model": "源代码写作模型",
  "Source control writer model not saved": "源代码写作模型未保存",
  Spans: "Span",
  "SSH config default": "SSH 配置默认值",
  "Start from remote": "从远端开始",
  "Start new worktrees from remote by default": "新建工作副本默认从远端开始",
  "Status unknown": "状态未知",
  "Stop recording": "停止录音",
  Submodules: "子模块",
  "Subtle surface": "细腻表面",
  "Suggest next prompt": "建议下一条提示词",
  "T3 Code": "T3 Code",
  "t3 command": "t3 命令",
  "T3 Connect": "T3 Connect",
  "T3 Connect devices": "T3 Connect 设备",
  "Tailscale HTTPS": "Tailscale HTTPS",
  "Terminal background": "终端背景",
  "Terminal font": "终端字体",
  "Terminal font preview": "终端字体预览",
  "Terminal font size": "终端字号",
  "Test model": "测试模型",
  "Test transcript": "测试转写",
  "Testing connection": "正在测试连接",
  "text generation model": "文本生成模型",
  "Text generation model": "文本生成模型",
  "Text generation model not saved": "文本生成模型未保存",
  "Text generators": "文本生成",
  "That time does not exist in your time zone.": "这个时间在你的时区里不存在。",
  "The environment is saved and will reconnect on app startup.":
    "环境已保存，应用启动时会自动重连。",
  "The extension isn't ready yet. Try again in a moment.": "扩展还没就绪，稍后再试。",
  "The process is not a child of the T3 Server. It might already have exited.":
    "这个进程不是 T3 Server 的子进程，可能已经退出了。",
  "The T3 Code GNOME extension lets you capture other windows and bring them into your draft. Sign out once after installing.":
    "T3 Code GNOME 扩展让你截取其他窗口收进草稿；装完注销一次。",
  "Theme appearance": "主题外观",
  "Theme JSON": "主题 JSON",
  Thermal: "温度",
  "This machine": "这台机器",
  "thread details": "会话详情",
  "Thread details": "会话详情",
  "Thread notifications": "会话通知",
  "thread title instructions": "会话标题说明",
  "Thread title instructions": "会话标题说明",
  "Thread titles and other generated text": "会话标题和其他生成文本",
  "time format": "时间格式",
  "tool calls in chat": "聊天中的工具调用",
  "Tool calls in chat": "聊天中的工具调用",
  Traces: "链路",
  "Transcription hardware": "转写硬件",
  "Transcription hardware and model unloading": "转写硬件与模型卸载",
  "Transcription language": "转写语言",
  "Transcription models": "转写模型",
  "Try again.": "再试一次。",
  "Try reinstalling the capture helper, then check again.": "重装截取助手后再检查。",
  "Two-line folder rows": "文件夹行显示两行",
  "Unable to open keybindings file": "打不开快捷键文件",
  "Unable to remove keybinding": "快捷键删除失败",
  "Unable to save keybinding": "快捷键保存失败",
  Unarchive: "取消归档",
  Unavailable: "不可用",
  "unlink environment": "取消关联环境",
  "unpin confirmation": "取消置顶确认",
  "Update available": "有可用更新",
  "Update the extension": "更新扩展",
  "Update track": "更新通道",
  "Usage providers": "用量提供方",
  "Use a separate cleanup model": "用单独的清理模型",
  "Use a separate review guide model": "用单独的评审指南模型",
  "Use a separate source control writer model": "用单独的源代码写作模型",
  "Use advanced theme colors": "使用高级主题色",
  "Use devices": "使用设备",
  "Use local SSH config, agent, and tunnels for the backend.":
    "后端使用本机 SSH 配置、agent 和隧道。",
  "Use Take snapshot from the command palette to choose a window.":
    "用命令面板的「截取快照」来选窗口。",
  "user@host or SSH alias": "user@host 或 SSH 别名",
  "Voice transcript cleanup": "语音转写清理",
  "Webhook URL": "Webhook 地址",
  "Welcome page": "欢迎页",
  "What should the agent do each time this runs?": "每次运行时 agent 该做什么？",
  "When expression": "when 表达式",
  "Word wrap": "自动换行",
  "word wrapping": "自动换行",
  "working section": "工作区段",
  "Worktree branch naming": "工作副本分支命名",
  "Worktree cleanup": "工作副本清理",
  "worktree location": "工作副本位置",
  "Worktree location": "工作副本位置",
  "worktree submodules": "工作副本子模块",
  "Worktree submodules": "工作副本子模块",
  "Wrap code, diffs, and file previews by default": "代码块、差异和文件预览默认自动换行",
  "Write the instructions each selected environment should use.": "写下每个选中环境要用的说明。",
  "Write throughput": "写入吞吐",
  "Writer model not saved": "写作模型未保存",
  "WSL backend": "WSL 后端",
  "You're not connected to a server yet.": "还没连接到服务端。",
  "Your desktop doesn't support automatic capture. You'll choose the window to capture instead.":
    "你的桌面不支持自动截取，改为每次手动选窗口。",
  "Your instructions shape commit messages and pull request titles and descriptions.":
    "这些说明会决定提交信息和 PR 标题/描述的写法。",
  Authenticated: "已登录",
  "Authentication request expired": "登录请求已过期",
  "Brand & content": "品牌与内容",
  "Commit and pull request writing": "提交与 PR 写作",
  "Compact idle threads": "压缩空闲会话",
  "Composer context": "输入框上下文",
  Context: "上下文",
  "Message surface": "消息区背景",
  Metrics: "指标",
  Normal: "正常",
  "Not authenticated": "未登录",
  "Not checked": "未检查",
  Personal: "个人",
  "Pick a date and time.": "选一个日期和时间。",
  "Pick a time.": "选一个时间。",
  "Secret providers": "密钥提供方",
  "T3 Code's capture helper lets you capture other apps and return to your draft. It's included with T3 Code.":
    "T3 Code 截取助手让你截取其他应用窗口收进草稿；它随 T3 Code 一起安装。",
};

const CONTROL_SELECTOR =
  "button, [role='button'], [role='menuitem'], [role='tab'], [role='option'], [role='tooltip'], [data-slot='settings-row'], [data-settings-page-scroll], h1, h2, h3, h4, label, th, summary, dt";
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
  const replacement = ZH[trimmed] ?? ZH[trimmed.replace(/\s+/g, " ")];
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
    translated.delete(node);
  }
  tracked.clear();
  for (const element of trackedAttrs) {
    const originals = translatedAttrs.get(element);
    if (!originals || !element.isConnected) continue;
    for (const [attr, value] of originals) element.setAttribute(attr, value);
    translatedAttrs.delete(element);
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
