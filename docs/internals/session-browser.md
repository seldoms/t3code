# 项目内会话浏览（多 CLI 统一列表）

> 目标：进入一个项目，就能按时间看到**所有 CLI** 在这个目录里留下的会话，会话头用各自的 CLI 图标区分，可一键收编继续工作。

## 现状

| 能力                                       | 位置                                                        | 状态                                  |
| ------------------------------------------ | ----------------------------------------------------------- | ------------------------------------- |
| 项目级聚合（路径、来源、会话数、最后活跃） | `AgentSessionScanner.scan` → `AgentSessionProjectCandidate` | ✅ 有                                 |
| 单条会话枚举                               | `AgentSessionScanner.recentThreads(workspaceRoot)`          | ⚠️ 仅供导入，隐含 30 天窗口与导入预算 |
| 已导入会话                                 | 侧栏项目树 `threadShells`                                   | ✅ 有（导入后才出现）                 |
| 展示入口                                   | 欢迎页/导入页（`WelcomePage`）                              | ⚠️ 一次性引导，不是常驻视图           |

**缺口**：扫描结果只有"这个项目有 30 个会话、来自 codex+cursor+qwen"，没有"这 30 个会话分别是什么、什么时候、哪个 CLI"，也没有常驻入口。用户必须先跑一次导入，才能看到它们，而且导入后会混进 T3 线程列表、抹掉时间顺序之外的来源视图。

## 方案

三层，逐层可独立交付。

### 1. 服务端：新增只读列表 RPC `agentSessions.list`

输入：`{ workspaceRoot }`（environment 由 RPC 外层决定；扫描目录尚未接管时也能列，但 `imported` 恒为 false）。

输出 `AgentSessionListResult`：

```ts
interface AgentSessionListResult {
  sessions: AgentSessionListEntry[]; // 按 lastActiveAtMs 倒序
  truncated?: boolean; // 该项目还有更早的会话没进列表
}

interface AgentSessionListEntry {
  source: "claudeAgent" | "codex" | "pi" | "opencode" | "cursor" | "qwenCode";
  providerInstanceId: ProviderInstanceId;
  providerSessionId: string; // resume 与去重的稳定键
  title: string | null; // 首个用户消息推导，或 CLI 自带标题
  lastActiveAtMs: number;
  model: string | null;
  filePath: string | null; // sqlite 来源（opencode）为 null
  imported: boolean; // 与已导入记录命中即 true
  importable: boolean; // 该来源是否有 driver（决定能否"继续"）
}
```

实现要点：

- 复用 `discoverClaudeTranscripts / discoverCodexTranscripts / discoverPiTranscripts / discoverCursorTranscripts / discoverQwenTranscripts`，按 cwd 过滤（Cursor 用 slug 解码后的目录，不读转录即可过滤）。
- **标题只读文件前缀**：现有 `TRANSCRIPT_PREFIX_BYTES = 32 KiB` 足够覆盖首条用户消息；Claude/Codex 还需跳过 `<environment_context>`、`<user_instruction>` 等前导块（`deriveTitle` 已有该逻辑）。
- OpenCode 直接查 `session` 表拿 `title` 与 `time_updated`，零文件读取。
- **不计入导入预算**：这是浏览，不是导入；预算只管真正的导入路径。
- **每个项目只列最近 5 条**（`MAX_LISTED_TRANSCRIPTS`，按转录 mtime 取前 5），更多时置 `truncated: true`。不设 30 天窗口，所以老会话只要还在前 5 就能看到。
- 服务端按解析后的 `workspaceRoot` 缓存 60 秒（`LIST_CACHE_MS`），避免每次打开项目都重读转录；客户端另有 30 秒 staleTime。

### 2. 前端：项目内"全部会话"视图

入口三处（同一份数据）：

1. **侧栏项目行**：展开项目后，在 T3 线程下方加一个可折叠分区"CLI 历史会话 (N)"，行首是 CLI 图标 + 标题 + 相对时间；点击 = 导入并打开。
2. **看板卡片详情**：已有项目详情抽屉，加"会话历史"页签，时间倒序列表。
3. **命令面板**：`project.sessions` 动作直达。

图标复用现有 `ProviderInstanceIcon`（已支持 codex/claudeAgent/cursor/opencode/pi 的品牌图标；`qwenCode` 无内置图标时退化为首字母色块，这是现有行为）。

排序：纯 `lastActiveAt` 倒序，不按 CLI 分组——用户要的就是"一条时间线"。CLI 只由图标与 tooltip 表达，不额外加列。

### 3. 导入与"继续"语义（必须先说清）

- 导入 = 把该 CLI 会话的历史写成一个 T3 线程（`historyOrigin: "v1_import"`），`nativeThreadRef.nativeId` 记录原始会话 ID。
- **Claude / Pi / Codex / Cursor / OpenCode 已有 driver**：在 T3 里继续对话会走该 driver 的 resume 路径（Claude 传 `resume: nativeId`，Pi 用会话文件路径），因此"导入后继续"实际是接着原会话跑，符合"先起 CLI、恢复会话接着干"的习惯。
- **qwenCode 没有 driver**：可以导入历史（只读可看），但发送新消息会因为没有适配器而失败。落地时必须二选一：
  - 通过 ACP 注册 Qwen（`provider-acp-registry`），让它成为真正可续跑的来源；
  - 或者 UI 上把它标成"仅历史"，禁用输入框并给出说明。
    **本轮先做后者，不假装能继续。**
- OpenCode 的会话在 sqlite 里，没有转录文件，导入路径需要单独读 `message`+`part` 表；在它跑通之前，列表里只展示 + 标记"暂不支持导入"。

## 性能与边界

| 项                  | 处理                                                                              |
| ------------------- | --------------------------------------------------------------------------------- |
| 大项目（100+ 会话） | 每个项目只列最近 5 条 + `truncated` 标记；每份转录只读前 32 KiB                   |
| 打开项目即扫描      | 60 秒服务端缓存（按路径）+ 客户端 30 秒 staleTime，复用现有 query 层              |
| 远端环境            | RPC 属于 environment 范围，天然在目标机器执行；不要在客户端读本地路径             |
| 未接管目录          | 只有 path 没有 projectId，`imported` 恒为 false，点击走"接管并导入"流程           |
| 权限                | 读 scope 即可列出；导入需要 operate scope，沿用现有 `agentSessions.import` 的授权 |

## 已知缺陷（落地时不要假装不存在）

1. **Cursor 转录里没有 cwd**：只能靠 slug 贪心解码，目录被重命名后解码失败 → 该会话从列表消失（不是错，是限制）。
2. **Codex 子 agent rollout 不算独立会话**：现有 `extractCwd` 已按 `payload.source.subagent` 过滤，列表需保持同一规则。
3. **标题质量**：Codex 的首条用户消息常带环境上下文，标题需走 `CODEX_TITLE_PREAMBLE` 剥离；否则一排会话全是 `<environment_context>`。
4. **30 天窗口**：现有 `recentThreads` 的 `RECENT_THREAD_WINDOW_MS` 会隐藏老会话；`listSessions` 已绕开它，只按每项目最近 5 条截断。
5. **qwenCode 无法续跑**（见上）。

## 分阶段

1. **P1（只读可见）**：`agentSessions.list` + 侧栏项目内折叠分区 + CLI 图标 + 点击导入打开。只覆盖 Claude/Codex/Pi/Cursor（有 driver 且已有导入路径）。
2. **P2（补齐来源）**：OpenCode 会话列表（已有 sqlite 读取）+ 导入（读 message/part 表）；qwenCode 列表 + "仅历史"锁定态。
3. **P3（体验）**：命令面板入口、看板详情页签、按 CLI 过滤、会话预览（只读前几轮，不导入）。

P1 的价值最大：它把"能看到项目"补成"能看到这个项目里的每一段工作"，且完全复用现有扫描与导入代码，不引入新模型。
