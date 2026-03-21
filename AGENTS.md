# laoda - Project Manifesto

极简本地项目管理中心：实时监控 Git 状态，一键启动 IDE。

## 1. 核心架构 (Core Architecture)

- CLI 模式为唯一入口。
- 数据存储: `~/.laoda.json` 持久化项目路径。
- OS 适配: 抽象 OS 层，当前仅支持 macOS。
- 技术栈: pnpm + esbuild (CLI) | Hono (Server API)。
- 目录结构: `apps/cli` (终端) | `apps/server` (后端 API) | `apps/capability` (文件夹操作)。

### CLI 模式

- 入口: `laoda` 直接终端输出项目列表 + Git 状态。
- 子命令: `add`, `rm`, `clear`, `open`, `list`。
- 存储: `~/.laoda.json` 持久化项目路径。

## 2. CLI 交互

- Flow engine 驱动：capability（能力）通过 glue（胶水）组合成 flow（业务流程）。
- 意图识别：LLM 将自由文本分类为 task / review / manage workers 等意图。
- Worker 管理：每个项目文件夹分配一个 AI worker。
