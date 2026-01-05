# 📋 UI 迭代技能（插件控制台）

> 目标：让控制台 UI **统一走 class 风格**、中性色 **跟随 Obsidian 主题**、功能色（Live/Demo/Backtest、Win/Loss 等）**保持 v5 固定语义色**；按模块“小步改、可回滚、门禁构建通过”。

## 0. 硬约束（不可破）
- 只使用 Obsidian 主题变量/系统 token：`--background-*`、`--text-*`、`--background-modifier-*`。
- 语义/功能色只从 v5 palette 来（例如 `--pa-v5-live/demo/back/win/loss`），**不改现有语义色值**。
- 避免大重构：每次只改一个模块、一个文件的一个区域；每步都跑 `npm run build`。

## 1. 模块化迭代顺序（推荐）
1) 顶部信息层（标题/状态/动作）+ Tab 导航：统一 class，建立“信息层级”。
2) 卡片系统（`pa-card`）：中性色主题对齐，压制花哨效果，保证密集信息可读。
3) 分区系统（Trading/Analytics/Learn/Manage）：模块边界清晰、标题一致、重点数据更突出。

## 2. 信息层级规则（突出重点）
- **一行只做一件事**：标题行只承载“标题 + 版本 + 状态 + 关键动作”。
- 状态信息统一用 `pa-dashboard-title-meta`（弱化但可读）。
- 动作区统一用 `pa-dashboard-title-actions` 并靠右（`margin-left: auto`）。

## 3. 主题对齐规则（中性色）
- 容器/卡片背景优先用：`var(--background-primary)` 或 `var(--background-secondary)`。
- 边框用：`var(--background-modifier-border)`。
- 弱文本用：`var(--text-muted)` / `var(--text-faint)`。
- 避免引入新的透明灰底（除非是极轻且能跨主题稳定）。

## 4. 动效/质感（保守原则）
- 控制台是“信息密集面板”，优先 **稳定**：
  - 避免 hover 位移（`transform: translateY(...)`）。
  - 谨慎使用 `backdrop-filter`（不同主题/性能下会脏/灰/卡）。

## 4.1 精致化检查（Typography & Borders）
- 字体：优先使用 Obsidian 的 `--font-ui-small` 来整体收一档（必要时带 fallback），避免“大字压屏”。
- 边框/阴影：卡片默认不加阴影、不做位移；用主题的 `--background-modifier-border` 保持细而克制。
- 透明灰底慎用：尽量用 `--background-secondary` / `--background-modifier-hover`。

## 5. 操作流程（每次改动）
1) 先截屏/对照 v5.0 预期。
2) 只改一个模块（单点改动）。
3) 跑 `npm run build` 作为门禁。
4) 观感不对立刻回滚到上一步，再调一次。

## 6. 本轮变更记录（2026-01-05）
- 顶部动作区自动靠右：`.pa-dashboard-title-actions { margin-left: auto; }`
- 移除顶部“刷新 DV”按钮（减少噪音/提升精致度）。
- 卡片系统收敛为主题风格：去 blur/去 hover 位移/去阴影，背景改 `--background-secondary`。
