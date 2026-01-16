---
name: trading-console-plugin-maintainer
description: This skill should be used when maintaining, upgrading, or UI-polishing the Obsidian native plugin console (TypeScript/React) at `.obsidian/plugins/al-brooks-console` for the 🦁 AL-Brooks 交易员控制台. It focuses on safe edits, build gating (`npm run build`), parity with v5.0 UX, and preventing regressions in the huge `Dashboard.tsx`.
---

# 🛠️ Trading Console Plugin Maintainer（原生插件控制台维护/升级）

## 目标

- 维护 Obsidian 原生插件控制台（TypeScript + React），确保：
  - **功能不丢**（尤其是对照 v5.0 的模块/入口）
  - **只做必要变更**（不引入额外 UX）
  - **每次改动都能 build**（门禁：`npm run build`）
  - **可回滚、可定位**（避免在 `Dashboard.tsx` 及其子组件里“迷路”）
  - **UI 一致性**（严格使用 Design System 组件）

## 何时触发本 Skill

- 修复插件控制台报错、TS/TSX 编译失败、运行时报错
- 调整控制台信息架构/页面布局（“UI 整理但不动功能”）
- 迁移/合并模块入口（例如把“每日行动”并入“交易中心”）
- 升级依赖、调整构建配置、处理 Obsidian API 变动
- 需要在 `.obsidian/plugins/al-brooks-console` 下做任何代码修改

## 关键约束（硬规则）

1.  **保持 UX 合同**：实现“被描述的 UX”，不新增页面/弹窗/筛选/动画。
2.  **不删除功能**：允许“换入口/换位置”，不允许“砍掉逻辑”。
3.  **UI 组件一致性**（⭐⭐⭐）：
    *   **严禁使用原生 `<button>`**：必须使用 `src/ui/components/Button.tsx`。
    *   **容器统一**：使用 `GlassPanel` 包裹卡片，`SectionHeader` 做标题。
4.  **架构分层**：
    *   `Dashboard.tsx` 是 **数据容器 (State Container)**：负责加载数据、订阅设置、定义回调。
    *   `src/views/tabs/*` 是 **布局层 (Layout)**：负责组织页面结构（如 `TradingHubTab`）。
    *   **不要在 Dashboard.tsx 里写长 JSX**，应抽取到 Tab 或 Component。
5.  **构建门禁**：每个结构性改动后必须通过构建：`cd .obsidian/plugins/al-brooks-console && npm run build`。

## Repo 导航（高频路径）

- **插件根目录**：`.obsidian/plugins/al-brooks-console/`
- **数据容器**：`.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx` (State/Props orchestration)
- **页面布局**：`.obsidian/plugins/al-brooks-console/src/views/tabs/` (e.g. `TradingHubTab.tsx`, `AnalyticsTab.tsx`)
- **UI 组件库**：`.obsidian/plugins/al-brooks-console/src/ui/components/` (Button, GlassPanel, etc.)
- **业务组件**：`.obsidian/plugins/al-brooks-console/src/views/components/`
    - **交易核心**：`trading/OpenTradeAssistant.tsx` (智能推荐/开仓助手 - **高频变更**)
    - **计划组件**：`plan/PlanWidget.tsx` (Plan integration)
- **核心逻辑**：`.obsidian/plugins/al-brooks-console/src/core/` (`strategy-recommender.ts`, `trade-index.ts`)
- **构建命令**：`npm run build`

## 标准维护工作流（强制按顺序）

### 0) 先读“自进化记忆”

- 读取：`memory/system_evolution.md`
- 目的：复用过去踩坑经验（特别是 Dashboard 大改、Tasks 集成、UI 条件渲染嵌套）

### 1) 明确变更类型（只选一种）

- UI 归类/移动入口（不动逻辑）
- Bug 修复（尽量最小 diff）
- 依赖/构建升级（优先锁住输出与行为）
- **新功能组件开发**（如 Execution Panel, Smart Recommender）

输出：用 3–7 条 bullet 写出“要改什么、不改什么”。

### 2) 建立可回滚锚点

- 确认当前在正确分支
- 在编辑 `Dashboard.tsx` 或 `OpenTradeAssistant.tsx` 前，先定位明确的锚点（如 `export function` 或 `interface Props`）。

### 3) 代码修改原则

- **UI 修改**：优先检查 `src/ui/components` 是否有现成组件。
- **Props 传递**：若需要 `app` 或 `enumPresets`，确保从 `Dashboard.tsx` -> `Tab` -> `Component` 一路传下去，不要尝试在子组件里重新获取 context（除非使用 Context API，但目前不仅限于 Props）。
- **逻辑修改**：对于 `StrategyRecommender` 等复杂逻辑，增加必要的 `console.log` 调试，但在提交前清理。

### 4) 立即跑构建门禁

- 执行：`cd .obsidian/plugins/al-brooks-console && npm run build`
- 若失败：只修复本次引入的问题；不要顺手修其它无关问题。

### 5) 变更完成后补记录（必须写）

- 更新：`memory/system_evolution.md`
- 更新：`references/changelog.md`

## 核心组件专项说明

### Dashboard.tsx (The Orchestrator)
不再是单体巨石 UI，而是**指挥官**。
- **职责**：
    - `loadAllFrontmatterFiles()`
    - `subscribeSettings()`
    - `ConsoleComponent.run()`
- **修改建议**：只改数据加载和 Props 传递。不要往里塞 `div`。

### OpenTradeAssistant.tsx (The Brain)
- **职责**：处理开仓逻辑、智能策略推荐。
- **近期演进**：已集成 "Smart Recommender" (百分比匹配、动态推荐)。
- **注意**：此处逻辑复杂，修改推荐算法时需小心 `strategy-matcher-v2` 的评分逻辑。

### TradingHubTab.tsx (The Layout)
- **职责**：组合 `PlanWidget`, `TodayKpiCard`, `OpenTradeAssistant`, `TodayTradesSection`。
- **模式**：接受 `app`, `index`, `onUpdate` 等 props 并分发。

## v5 UI 优点提炼与迁移

目标：复用 **信息层级 + 结构节奏 + 模块语义**。

### 1) 通用结构（顺序固定）

1.  **模块标题条**（SectionHeader component）：
    - `<SectionHeader title="中文" subtitle="English" icon="Emoji" />`
2.  **主卡片容器**（GlassPanel component）：
    - `<GlassPanel> ...content... </GlassPanel>`
3.  **主 CTA**（Button component）：
    - `<Button variant="primary" onClick={...}>Action</Button>`

### 2) 视觉语言（严格遵守）

- **中性色**：只用 Obsidian 主题变量。
- **交互**：所有可点元素必须有 `cursor: pointer` 和 hover 态（`Button` 组件已内置）。

## 常见坑位（快速排雷）

- **Props Drilling 丢失**：在 `Dashboard.tsx` 加了 prop，但在 `TradingHubTab.tsx` 忘了接，导致孙组件拿不到。
- **UI 样式错乱**：使用了原生的 `<button>` 导致样式与 Design System 不统一。
- **推荐算法异常**：修改 `strategy-matcher` 时未考虑旧数据的兼容性（如缺失 `direction` 字段）。
- **构建报错**：修改了 `types.ts` 但没有更新所有引用处。
- **列表状态跳动（Jumping）**：在渲染可变列表（如 `openTrades`）时，严禁使用 index 作为 `key` 或选中态依据。必须使用稳定唯一标识（如 `file.path`），否则列表重排（如 mtime 变更）会导致选中项意外跳变。
- **引导文案冲突**：当页面存在多个类似功能模块（如“推荐分析”与“推荐执行”）时，避免使用通用的“建议下一步”，应明确命名上下文（如“建议完善分析” vs “建议补充执行”）。
- **数据响应性丢失**：UI 组件（如策略百分比列表）必须订阅所有影响计算的 Props（如 `setupCategory`, `patterns`），漏掉一个就会导致数据计算停滞（如死锁在 20%）。
- **同步失效隐患 (Sync Failures)**：
    *   **字段遗漏**：如果 UI 显示“未填写”但实际已填写，优先检查 `contracts.ts` 和 `obsidian-trade-index.ts`。若索引层未显式读取该字段，前端永远拿到 `undefined`。
    *   **分隔符误判**：若预设值包含斜杠（如 "Set/Forget"），默认的 `normalizeStringArray` 会将其拆分为 `["Set", "Forget"]`，导致与前端预设值不匹配。必须使用自定义 Splitter（仅逗号/分号）。

## 资源

- `memory/system_evolution.md`：强制读取/强制写入的经验库
- `references/checklists.md`：可复制执行的检查清单
- `references/gotchas.md`：高频坑位与处理模式
- `references/changelog.md`：skill 与插件版本演进记录
