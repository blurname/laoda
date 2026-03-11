# Rules

- 每次对话结束时，先运行 `pnpm run lint`、`tsc --noEmit`、`pnpm run format`，修复所有问题后，再自动提交一个 commit，message 用当前时间（格式：`YYYY-MM-DD HH:MM`），然后自动 push。
- 只使用 `type`，不使用 `interface`。
