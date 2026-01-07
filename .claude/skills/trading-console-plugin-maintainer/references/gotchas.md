# Gotchas（常见坑与处理）

## 1) Dashboard.tsx 删除块导致“半截 JSX”

症状：错误面板爆炸（数百个 TS/TSX 解析错误），通常从文件开头附近开始连锁。

处理：

- 立刻停止继续编辑
- 回到“最后一次 build 通过”的状态（优先用 git restore/checkout 单文件回退）
- 重新用稳定锚点夹住删除范围，分小步做

## 2) 重复块残留

症状：UI 里出现重复模块；或搜索关键词出现 2+ 次。

处理：

- 全局搜索统计命中数
- 每次只删除一个命中点，并在删除后重新统计
- 用“命中数 == 目标数”作为验收，不靠肉眼

## 3) 条件渲染嵌套层级错误

症状：某页内容跑到另一页；或某 tab 下空白。

处理：

- 优先改成“顺序渲染”而非多层三元嵌套
- 确保 `activePage === "xxx"` 的块不被其它条件包裹

## 4) 外部集成未做 capability 检测

症状：用户未安装 Tasks/QuickAdd 时点击即报错。

处理：

- 统一加 `can("...")` 分支
- 缺失则提示“需要安装/启用 xx 插件”而不是隐藏

## 5) Obsidian 中 window.prompt/confirm 不弹（属性管理器“点了没反应”）

症状：按钮点击事件已触发（例如能看到 Notice/日志），但不会出现输入框/确认框；因此重命名/改值/追加/注入都无法继续。

原因：Obsidian 桌面端对 `window.prompt()` / `window.confirm()` 的行为不稳定，部分情况下会被拦截或不显示。

处理：

- 不要在插件 UI 逻辑里用 `window.prompt/confirm`
- 改用 Obsidian 原生 `Modal(this.app)` 实现输入与确认
- React 组件里若拿不到 `app`：在 `ConsoleView`（宿主）实现 `promptText/confirmDialog` 并通过 props 注入到 `ConsoleComponent`
- 验证：在 Obsidian 内实际点一次“重命名/追加/注入”，能弹出 Modal 且写入生效

## 6) UI 颜色/图表色到处硬编码（导致主题漂移、维护困难）

症状：

- 同一语义（例如“实盘/模拟/回测”）在不同页面颜色不一致
- Obsidian 主题一换，颜色语义跟着漂（例如 success/warning/accent 被主题重定义）
- 代码里散落很多 `#...` / `rgba(...)`，很难统一调整

处理：

- 背景/边框/按钮 hover/focus：继续使用 Obsidian CSS 变量（`var(--background-*)`、`var(--interactive-accent)` 等）
- 语义色/图表色（实盘/模拟/回测、盈亏、强调色）：统一从 `src/ui/tokens.ts` 读取（v5 palette）
- 禁止在 `Dashboard.tsx` 这种超大文件里新增硬编码色值（除非是 Obsidian 的 CSS 变量）
- 验证：全局搜索 `#` 的新增命中应为 0（或仅出现在 `src/ui/tokens.ts`）
