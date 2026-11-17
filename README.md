<p align="center">
  <a href="https://t3.codes">
    <img src="./assets/prod/t3-black-web-icon-192x192.png" width="80" height="80" alt="T3 Code logo" />
  </a>
</p>

<h1 align="center">T3 Code（个人魔改版）</h1>

<p align="center">基于 [T3 Code](https://github.com/pingdotgg/t3code) 的个人增强分支 —— 面向"一人多机 + 多 CLI Agent"的重度使用场景。</p>

<p align="center">
  <a href="https://github.com/pingdotgg/t3code">上游官方仓库</a> ·
  <a href="./docs/README.md">文档</a> ·
  <a href="#与本分支的差异">魔改清单</a>
</p>

---

## 这是什么

[T3 Code](https://github.com/pingdotgg/t3code) 是 Theo 与 T3 团队做的开源"编码 Agent 控制面"：一个 Node 服务器包着各家 Provider CLI（Claude Code、Codex、Cursor、OpenCode、Grok、Antigravity、Kiro、Pi、Muse Code、fx 及任何 ACP Agent），Web、桌面、手机三端共用同一线程。核心理念是用你自己的订阅、远程可用、性能优先、MIT 开源。**这些官方能力本分支全部保留**，官方的安装方式、文档、上游更新路径也都适用。

这个分支是我在官方基础上的个人魔改，出发点很实际：**我不只有一台机器、不止用一个 CLI，而且我希望看板替我盯着所有项目，而不是我盯着看板。**官方 T3 解决了"多个 Agent 一个界面"，但没有完全解决我遇到的几件事：

1. 侧栏是一串扁平的对话，项目多了根本找不到东西；
2. 项目分散在 Mac、Ubuntu 笔记本、VPS 上，没有一个地方能一眼看出"哪些项目在等我、哪些机器还活着"；
3. CLI 生态远不止三家，我在终端里跑的会话希望也能被看见、被收编管理；
4. 界面里越来越多我不需要的英文说明和冗余区块，中文环境下体验割裂。

于是有了这个分支。所有改动都保持小步提交、可单独回滚，尽量贴着上游架构走，方便长期跟进官方更新。

## 与本分支的差异（魔改清单）

### 对话与项目管理

- **项目树嵌套**：所有状态（运行中、空闲、已收敛、草稿）的对话都嵌在所属项目下，折叠项目即隐藏整棵子树。主机单选会同时过滤项目树、对话和搜索，再点同一次恢复全部。
- **看板（项目板）**：扫描本机与远端的项目目录（`~/.projwall` 采集器，Git 仓库 + 显式登记的非 Git 工程），按"待启动 / 进行中 / 等我把关 / 待交付 / 暂停"泳道展示，卡片可跨泳道拖动、右键直接对任意状态的项目发起新对话或打开已有对话。
- **采集与看板解耦**：项目发现由独立只读采集器完成（支持 Git-only 自动发现 + 显式登记非 Git 工程，禁区不进入），T3 只读快照。

### 机器监控

- **侧栏机器状态**：每台机器一行，折叠时显示 CPU/内存/硬盘的状态色点（75%/90% 分级）与 SSH 探针延迟，展开显示进度条、网络 ↓↑ 速率、采样时间；数据过期或采样失败明确标"旧快照"，不用旧数据冒充实时的。
- **SSH 探针**：单条 POSIX shell 命令同窗口读两次 CPU/网卡计数器，CPU 是真实差分而不是平均负载冒充；网络速率字节/秒。只扫 SSH 配置里标记 `private` 的主机，production 一律不碰。
- **显示范围可配置**：全部主机 / 本机 + T3 环境 / 仅本机 / 隐藏，支持逐台隐藏；侧栏显示哪些指标（CPU/内存/硬盘/网络/延迟）可在设置里逐项开关。

### 多 CLI 会话扫描与导入

- 官方支持 Claude Code / Codex / Pi 三家。本分支扩展了 **OpenCode**（只读 SQLite）、**Cursor Agent**（含 slug→项目路径贪心解码）、**Qwen Code** 三种来源，首次扫描就能把终端里已有的会话收编进 T3 管理。
- 新来源未配置时默认不扫，不碰未授权的数据。

### 模型与环境隔离

- 跨环境新建对话不继承上一环境的模型选择，一律落到目标环境的默认值，避免"在 VPS 上误用了 Mac 的模型"这类串环境的坑。

### 中文化

- 设置页 100+ 条解释文案、权限引导悬浮窗、动态提示等已翻译为中文，并有回归测试防止回退。主界面语言仍是官方 i18n 机制。

### Git 操作

- 看板项目详情里内置代码版本管理（提交/推送/拉取），复用 T3 的权限与确认流程，明确绑定所属环境；托管平台标识为 Gitea / Forgejo。

## 没改的部分

- **上游核心架构**：WebSocket 服务层、环境（Environment）模型、事件溯源、MCP、T3 Connect 隧道、移动端——全部沿用官方实现，便于跟进上游。
- **商业与账号体系**：T3 Connect、Clerk 登录等按官方默认。
- 上游的安装文档、Provider 配置文档在本分支同样适用。

## 安装

与官方相同，见 [官方安装文档](https://github.com/pingdotgg/t3code#install)。从源码构建本分支：

```bash
git clone https://github.com/seldoms/t3code.git
cd t3code
vp i          # 安装依赖（vite-plus）
vp run dev    # 启动开发服务器
vp run dist:desktop:dmg:arm64   # 构建 macOS arm64 DMG
```

## 使用建议

这个分支按"自用优先"迭代，提交粒度小、每批独立可回滚。如果你有类似场景（多机、多 CLI、中文环境），欢迎参考或 fork；遇到问题请先看 [上游文档](./docs/README.md)，魔改部分的问题可以提 issue。

## 致谢

核心当然归功于 [T3 Code 的官方团队与社区](https://github.com/pingdotgg/t3code)。本分支所有魔改都是在他们的架构上做的增量，规则与品味（性能即功能、小模型优于大机器、能不抽象就不抽象）也全部继承自上游的 [AGENTS.md](./AGENTS.md)。

## License

[MIT](./LICENSE)
