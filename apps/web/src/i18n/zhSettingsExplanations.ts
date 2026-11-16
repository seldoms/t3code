export const zhSettingsExplanations: Readonly<Record<string, string>> = {
  "The environment's server signs in to Expo and starts the sessions. Without a token here it uses EXPO_TOKEN, then its eas login.":
    "由目标环境的服务端登录 Expo 并启动会话。这里未填令牌时，先使用 EXPO_TOKEN，再使用 eas 的登录信息。",
  "Sessions bill the project's Expo account. \"From the thread's project\" reads extra.eas.projectId from the project's app config.":
    "会话费用计入项目的 Expo 账户。「从对话项目读取」会使用项目应用配置中的 extra.eas.projectId。",
  "This checkout is no longer available in the selected project and environment.":
    "此工作副本在选中的项目和环境中已不可用。",
  "Grouping rule decides how each checkout joins project groups in the sidebar. Changing it can move a checkout to a different project.":
    "分组规则决定各工作副本在侧栏中归属哪个项目。修改后，副本可能移动到另一个项目分组。",
  "Press your shortcut. Esc cancels.": "按下要设置的快捷键，按 Esc 取消。",
  "Only these changes will be saved. We'll keep a backup.": "只保存列出的更改，并保留备份。",
  "Allow T3 Code to read your desktop settings. You'll review any changes here before saving.":
    "允许 T3 Code 读取桌面设置。保存前会在这里展示变更，供你检查。",
  "T3 Code also reads any files included by this file.":
    "T3 Code 也会读取此文件引用的其他配置文件。",
  "Eligible usage in T3 Code uses your ChatGPT plan. Manage your shared usage and any credit settings in ChatGPT.":
    "T3 Code 中符合条件的用量使用你的 ChatGPT 套餐。共享用量和额度设置请在 ChatGPT 中管理。",
  "Checking for an API key…": "正在检查 API 密钥…",
  "Loading transcription models…": "正在加载语音识别模型…",
  "This choice applies only to this device. Choose Off to stop sharing.":
    "此选择只在当前设备生效。选择「关闭」可停止共享。",
  "Could not play this recording. Try recording again.": "无法播放这段录音，请重新录制。",
  "Configure non-secret routing. Headers are write-only.":
    "配置不含密钥的路由信息。请求头只允许写入，不会显示已保存的值。",
  "Send traces, metrics, and logs to an OTLP HTTP receiver. Restart the server to apply. Environment variables override these settings.":
    "将调用链、指标和日志发送到 OTLP HTTP 接收端。重启服务端后生效；环境变量优先于这里的设置。",
  "Choose an icon, emoji, or monogram.": "选择图标、表情或文字缩写。",
  "One or two letters or numbers.": "输入一至两个字母或数字。",
  "New threads in shared projects start on the machine with the most free CPU and memory, weighted by each machine's preference.":
    "共享项目的新对话会按机器偏好权重，优先选择 CPU 和内存空闲资源较多的机器。",
  "No licenses match that search.": "没有匹配的许可证。",
  "Loading open-source notices…": "正在加载开源声明…",
  "This machine is on your T3 Connect account. Use it as a fallback route.":
    "此机器已关联你的 T3 Connect 账户，可将它作为备用连接路由。",
  "Machines you trust here can read PR data through each other's source control access. Enable both machines. Read and act may use broader permissions than the machine that owns them. This applies only to this device.":
    "在这里互相信任的机器可以借助对方的源代码管理权限读取合并请求。需要两台机器都启用。「读取并操作」可能使用比资源所属机器更大的权限；此设置仅对当前设备生效。",
  "Tune the shared power policy and the background intervals that feed it.":
    "调整共享电源策略和相关后台任务的执行间隔。",
  "Controls whether background work may run after a subscribed interval fires.":
    "控制定时间隔到达后是否允许执行后台任务。",
  "Refresh remote branch status in the background.": "在后台刷新远端分支状态。",
  "Refresh provider availability, versions, and auth state. Model catalog updates follow Provider update checks.":
    "刷新提供方的可用性、版本和登录状态。模型目录更新遵循「提供方更新检查」设置。",
  "Poll host power state while clients are active.": "客户端活跃时，定期读取主机电源状态。",
  "Poll host power state when no foreground client is active.":
    "没有活跃前台客户端时，定期读取主机电源状态。",
  "Configure background activity": "配置后台活动",
  "No device has connected through T3 Connect yet.": "还没有设备通过 T3 Connect 连接。",
  "Optional. Resolved separately on each environment.": "选填；在每个环境中分别解析。",
  "Loading sign-in terminal…": "正在加载登录终端…",
  "Connect to an environment to remove this profile and its data.":
    "连接到对应环境后，才能删除此配置及其数据。",
  "Find open-source themes from Open VSX.": "在 Open VSX 中查找开源主题。",
  "No supported open-source themes found": "没有找到受支持的开源主题",
  "Try a broader search.": "请尝试范围更广的搜索词。",
  "Overridden for this project": "此项目已设置覆盖值",
  "Model preferences and custom models are saved on the selected environment and shared across connected devices.":
    "模型偏好和自定义模型保存在选中的环境中，并在连接到该环境的设备间共享。",
  "No actions configured.": "尚未配置操作。",
  "Enter a valid value. It was not saved.": "请输入有效值；当前内容尚未保存。",
  "Create a new link to share from this client.": "从当前客户端创建新的共享链接。",
  "Copy the token and pair from another client using this backend&apos;s reachable host.":
    "复制令牌，在另一客户端填写可访问的后端主机地址进行配对。",
  "Copy the token and pair from another client using this backend's reachable host.":
    "复制令牌，在另一客户端填写可访问的后端主机地址进行配对。",
  "Reach this machine via": "访问这台机器的地址",
  "No QR for this endpoint. Another device scanning a loopback link would dial itself; copy the URL for use on this machine instead.":
    "此端点不提供二维码。其他设备扫描回环地址会连接到它自己；请复制链接，仅在当前机器使用。",
  "Generate a one-time link that another device can use to pair with this backend as an authorized client.":
    "生成一次性链接，让其他设备与此后端配对并成为授权客户端。",
  "Limit what the paired client can do.": "限制配对客户端允许执行的操作。",
  "Select at least one permission.": "请至少选择一项权限。",
  "This client can create or revoke access for other devices.":
    "此客户端可以为其他设备创建或撤销访问权限。",
  "No pairing links or client sessions.": "没有配对链接或客户端会话。",
  "Edit name and options": "编辑名称与选项",
  "Remove custom model": "移除自定义模型",
  "Show a toast when another thread finishes, fails, or needs input or approval while this app has focus.":
    "应用在前台时，其他对话完成、失败或需要输入、审批时显示提示通知。",
  "Combine matching repositories across environments.":
    "将不同环境中的同一仓库合并为一个项目分组。",
  "Order of projects in the sidebar project picker and command palette.":
    "侧栏项目选择器和命令面板中的项目排序方式。",
  "Fold working and monitoring threads into a Working section. They return to the top of the inbox when they need you. The boring sidebar in Labs has no Working section.":
    "将正在运行和监控的对话收进「工作中」区域；需要你处理时移回收件箱顶部。按项目分组的侧栏不使用此独立区域。",
  "Ask before unpinning a thread from the pinned section.": "从置顶区域取消对话置顶前询问确认。",
  "Require a second click on the inline archive action before a thread is archived.":
    "点击对话行的归档按钮后，需要再次点击确认才会归档。",
  "Ask before deleting a thread and its chat history.": "删除对话及其聊天记录前询问确认。",
  "Hold mode also quits on two quick presses.": "按住模式下，快速连按两次也可以退出。",
  "System default follows your browser or OS language.":
    "选择系统默认时，跟随浏览器或操作系统语言。",
  "System default follows your browser or OS clock preference.":
    "选择系统默认时，跟随浏览器或操作系统的时间格式。",
  "Run only when every filter matches. Other requests are logged as filtered. Separate “is one of” values with commas; a value can't contain a comma.":
    "所有筛选条件都满足时才运行；其余请求记录为已过滤。「属于以下之一」的多个值用逗号分隔，单个值不能含逗号。",
  "Connect an environment to manage scheduled tasks.": "连接到一个环境后管理定时任务。",
  "Recent requests to this task's webhook URL.": "最近发送到此任务 Webhook 地址的请求。",
  "Loading deliveries…": "正在加载投递记录…",
  "The URL appears after you save.": "保存后会显示链接。",
  "Deleting the thread also deletes this task.": "删除所属对话时也会删除此任务。",
  "Run a prompt automatically on an interval, at a fixed time, once at a set date, or when a webhook is called.":
    "按间隔、固定时间、指定日期单次执行，或收到 Webhook 时自动运行提示词。",
  "Reconnect this environment before saving.": "保存前请重新连接此环境。",
  "This scheduled task no longer exists.": "此定时任务已不存在。",
  "This task uses a legacy interval below one minute. Saving updates it to at least one minute.":
    "此任务仍使用旧版小于一分钟的间隔；保存后将调整为至少一分钟。",
  "Requests with the same key run only once within 7 days.": "相同键的请求在七天内只执行一次。",
  "Coalescing runs the latest payload once when the window from the first delivery closes. Empty keys run normally.":
    "合并模式从首次投递开始计时，窗口结束后仅执行最新载荷一次；空键请求仍正常执行。",
  "Reject requests without a valid HMAC-SHA256 signature of the body.":
    "拒绝请求正文未通过 HMAC-SHA256 签名校验的请求。",
  "Disabled tasks stay saved but do not run.": "停用任务会保留配置，但不会执行。",
  "Network exposure changes restart the backend and must be controlled where the server process is launched.":
    "更改网络访问范围会重启后端，必须在启动服务端进程的机器上操作。",
  "This connection can create access links but cannot view authorized clients.":
    "当前连接可以创建访问链接，但无权查看已授权客户端。",
  "T3 Code will restart the local backend with Tailscale Serve enabled and ask Tailscale to proxy HTTPS traffic to this backend.":
    "T3 Code 将启用 Tailscale Serve 并重启本机后端，由 Tailscale 将 HTTPS 请求代理到此后端。",
  "Enter a port from 1 to 65535.": "请输入 1 至 65535 之间的端口号。",
  "This may take a moment.": "这可能需要一点时间。",
  "On OpenAI, sign in with the account you choose here.": "在 OpenAI 中登录此处选中的账户。",
  "The account shorthand, sign-in address without https://, or ID that op account list shows.":
    "填写账户简称、不含 https:// 的登录地址，或 op account list 显示的账户标识。",
  "No custom options. The composer uses the provider's default options.":
    "没有自定义选项，输入框使用提供方的默认选项。",
  "No compatible agents found": "没有找到兼容的智能体",
  "Offer when adding or publishing a project": "添加或发布项目时提供此选项",
  "Rescan Git and hosting integrations": "重新扫描 Git 和代码托管集成",
  "Connect an environment to inspect its version control tools and hosting integrations.":
    "连接到一个环境，查看它的版本控制工具和代码托管集成。",
  "Same on all machines": "所有机器保持一致",
  "No languages match.": "没有匹配的语言。",
  "Say a sentence. Cleanup is skipped, so you see exactly what the model heard.":
    "说一句话。测试不会润色转写文本，因此你看到的就是模型原始识别结果。",
  "Agents here can then launch, message and wait on threads there. It appears under Authorized clients in that environment's Sharing & access, where it can be revoked.":
    "关联后，此环境的智能体可以在目标环境启动对话、发送消息并等待结果。授权会列在目标环境「共享与访问 → 已授权客户端」中，可在那里撤销。",
  "Already linked. Linking again renews it with the access you pick.":
    "已关联；再次关联会按所选权限更新授权。",
  "Refresh provider status": "刷新提供方状态",
  "If sign-in doesn't return to T3 Code, paste the URL from the final localhost page.":
    "如果登录后没有返回 T3 Code，请粘贴最后打开的 localhost 页面的完整地址。",
  "Add actions declared by this checkout without editing them first.":
    "直接添加此工作副本声明的操作，无需先编辑。",
  "This driver has no required configuration. You can add the instance now.":
    "此驱动没有必填配置，可以直接添加实例。",
  "Two colors, rest derived": "设置两种基础色，其余颜色自动派生",
  "Saved with this theme and included when you export it. Web and desktop only. Rules that load remote files are ignored.":
    "随主题保存并包含在导出文件中，仅在网页和桌面端生效；加载远程文件的规则会被忽略。",
  "Refresh telemetry snapshot": "刷新资源遥测快照",
  "Live native counters for the server, providers, terminals, desktop processes, and the monitor itself.":
    "显示服务端、模型提供方、终端、桌面进程和监控自身的实时原生资源计数。",
  "Power, idle, lock, and thermal state are supplied by the desktop host. Process telemetry remains fully active in this browser session.":
    "电源、空闲、锁屏和温度状态由桌面宿主提供；进程资源监控在当前浏览器会话中仍正常运行。",
  "Capture needs attention. Go back to check access.": "截取功能需要处理，请返回检查访问权限。",
  "Couldn't finish this step. Try again or check Advanced for help.":
    "未能完成此步骤，请重试或在「高级」中查看帮助。",
  "Included with T3 Code. No download needed.": "已随 T3 Code 安装，无需另外下载。",
  "Scan with your phone camera.": "使用手机相机扫描。",
  "Uses the custom binary path below. Installation keeps that path.":
    "使用下方自定义可执行文件路径；安装时保留此路径。",
  "Automatic installation unavailable. Set a binary path or use another environment.":
    "无法自动安装，请设置可执行文件路径或使用其他环境。",
  "Connect an environment to manage the secret providers its provider variables read from.":
    "连接到一个环境，管理其提供方变量使用的密钥来源。",
  "Environment-wide setting. Select an environment to change it.":
    "此设置对整个环境生效；请选择环境后修改。",
};
