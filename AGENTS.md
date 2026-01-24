# Lead - Project Manifesto

极简本地项目管理中心：实时监控 Git 状态，一键启动 IDE。

## 1. 核心架构 (Core Architecture)
*   权威源: 前端 localStorage 为数据唯一真理；后端仅作 Git 数据增强。
*   通信: WebSocket 实时推送；具备自动重连与路径同步机制。
*   OS 适配: 抽象 OS 层，当前仅支持 macOS (osa脚本选择文件夹/open命令启动)。
*   技术栈: Bun + Hono (Server) | React + RSBuild + Jotai (Web)。

## 2. 交互与设计规范 (Hard Rules)

### 禁止清单 (Strictly Forbidden)
*   无图标 (No Icons): 全局禁止使用任何图标库或自定义图标。
*   无手型指针 (No Pointer): 全局强制 cursor: default !important，严禁出现“小手”。
*   色彩禁区: 严禁使用任何比 zinc-700 更深的颜色（zinc-800/900/950 或 black）作为填充色。

### 视觉规范 (Graphite Industrial)
*   调色盘: 锁定在 zinc-50 (卡片内底) 至 zinc-700 (重度填充) 的石墨灰阶。
*   字体: 全面使用 Monospace (JetBrains Mono)，强化指令感。
*   几何: 锋利直角或 rounded-sm；禁用 Web 动效，仅允许颜色瞬时变化。
*   局部滚动: 全局布局 h-screen overflow-hidden；仅限内容容器内部滚动。

### 交互哲学
*   物理反馈: 通过背景色加深 (bg-zinc-700) 和内阴影模拟物理按键。
*   功能分区: 左右分离。主体展示信息，右侧固定宽度区域为唯一的“GO”触发区。
*   连接反馈: 仅使用 500 色系的实心圆点表示状态（如绿色脉冲表示在线）。

## 3. 视图定义
*   TERMINAL: 主项目列表，展示分支、Diff 计数、Commit 信息。
*   DATA: 原始数据视图，直接映射 localStorage 内容。
