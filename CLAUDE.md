# Rules

- 每次对话结束时，先运行 `pnpm run lint`、`tsc --noEmit`、`pnpm run format`，修复所有问题后，再自动提交一个 commit，message 用当前时间（格式：`YYYY-MM-DD HH:MM`），然后自动 push。
- 只使用 `type`，不使用 `interface`。
- Type-driven development：实现功能前先定义类型，类型确认后再编写实现。
