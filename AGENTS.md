# laoda - Project Manifesto

极简本地项目管理中心：实时监控 Git 状态，一键启动 IDE。

## 1. 核心架构 (Core Architecture)

- 双模式: CLI (默认) 终端使用 | Web (`--web` 启动) 浏览器使用。
- 数据存储: CLI 使用 `~/.laoda.json`；Web 使用前端 `localStorage`。
- OS 适配: 抽象 OS 层，当前仅支持 macOS (osa脚本选择文件夹/open命令启动)。
- 技术栈: pnpm + esbuild (CLI) | Hono (Server) + React + RSBuild + Jotai (Web)。
- 目录结构: `apps/cli` (终端) | `apps/web` (前端) | `apps/server` (后端) | `apps/shared` (共享类型)。

### CLI 模式 (Default)

- 入口: `laoda` 直接终端输出项目列表 + Git 状态。
- 子命令: `add`, `rm`, `clear`, `open`, `list`。
- 存储: `~/.laoda.json` 持久化项目路径。

### Web 模式 (`--web`)

- 入口: `laoda --web [-p port]` 启动 Hono 服务器 + 静态前端。
- 权威源: 前端 `localStorage` 为数据唯一真理；后端仅作 Git 数据增强。
- 通信: WebSocket 实时推送；具备自动重连与路径同步机制。
- 主动请求: 前端连接时主动发送路径列表，后端返回对应的 Git 信息映射。
- WebSocket 更新: 文件变化时，后端通过 `GIT_INFO_UPDATE` 消息推送单个路径的 Git 信息更新。

### 乐观更新规则 (Web Optimistic Update Rules)

- 立即响应: 所有异步操作（复制、删除、导入、移动）必须立即更新前端状态，无需等待后端响应。
- 失败回滚: 操作失败时自动回滚到原始状态，确保数据一致性。
- 操作独立: 每条数据的操作必须独立跟踪，通过路径或 ID 匹配，避免并发操作互相影响。
- 部分失败: 批量操作中，只回滚失败的项，成功的项保持更新状态。

## 2. 交互与设计规范 (Hard Rules)

### 禁止清单 (Strictly Forbidden)

- 无图标 (No Icons): 全局禁止使用任何图标库或自定义图标。
- 无手型指针 (No Pointer): 全局强制 cursor: default !important，严禁出现“小手”。
- 色彩禁区: 严禁使用任何比 zinc-700 更深的颜色（zinc-800/900/950 或 black）作为填充色。

### 视觉规范 (Graphite Industrial)

- 调色盘: 锁定在 zinc-50 (卡片内底) 至 zinc-700 (重度填充) 的石墨灰阶。
- 字体: 全面使用 Monospace (JetBrains Mono)，强化指令感。
- 几何: 锋利直角或 rounded-sm；禁用 Web 动效，仅允许颜色瞬时变化。
- 局部滚动: 全局布局 h-screen overflow-hidden；仅限内容容器内部滚动。

### 交互哲学

- 物理反馈: 通过背景色加深 (bg-zinc-700) 和内阴影模拟物理按键。
- 功能分区: 左右分离。主体展示信息，右侧固定宽度区域为唯一的“GO”触发区。
- 连接反馈: 仅使用 500 色系的实心圆点表示状态（如绿色脉冲表示在线）。

## 3. 视图定义

- TERMINAL: 主项目列表，展示分支、Diff 计数、Commit 信息。
- SYNC: 配置文件同步视图，支持智能前缀匹配与根目录分发。
- DATA: 原始数据视图，映射 `localStorage` 内容，支持全量 JSON 导出与覆盖式导入。
