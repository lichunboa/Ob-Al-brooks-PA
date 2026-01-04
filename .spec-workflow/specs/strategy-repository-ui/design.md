# Spec: strategy-repository-ui — Design

日期: 2026-01-03
作者: Copilot 协助

## 概览
在 `Dashboard` 中新增 `StrategyRepository` 区块，提供策略汇总、分组列表、可展开卡片与策略表现表。目标是最大化复用现有索引与归因逻辑（`ObsidianStrategyIndex`、`TradeIndex`、`scripts/pa-view-playbook.js` 的 perf 计算）。

## 组件分解与文件落点
- `StrategyRepository`（容器）
  - 文件: `.obsidian/plugins/al-brooks-console/src/views/StrategyRepository.tsx` 或放在 `views/components/index.tsx` 并由 `Dashboard.tsx` 引入。
  - 责任: 加载数据、构建分组（marketCycle）、提供过滤/排序状态、负责可折叠面板行为。

- `StrategyStats`（顶部统计卡）
  - 文件: `.obsidian/plugins/al-brooks-console/src/views/components/StrategyStats.tsx`
  - Props: `{ total, activeCount, learningCount, totalUses }`
  - 显示四格统计与小图标，可点击过滤。

- `StrategyList`（按组渲染）
  - 文件: `.obsidian/plugins/al-brooks-console/src/views/components/StrategyList.tsx`
  - Props: `{ groups: { name:string, items:StrategyCardData[] }[] }`
  - 责任: 渲染每个 group header（含数量）与内部 `StrategyCard` 列表。

- `StrategyCard`（单个策略卡）
  - 文件: `.obsidian/plugins/al-brooks-console/src/views/components/StrategyCard.tsx`
  - Props: `{ data: StrategyCardData, onOpen: (path)=>void }`
  - 显示字段: 名称、状态标签(实战/学习)、RR、胜率、使用次数、最近使用、tags、来源；支持展开详情（描述、笔记链接、上次交易片段），并支持键盘操作。

- `StrategyPerformanceTable`（表现表）
  - 文件: `.obsidian/plugins/al-brooks-console/src/views/components/StrategyPerformanceTable.tsx`
  - Props: `{ rows: PerformanceRow[], sortBy?, onSort? }`
  - 责任: 列出策略维度的胜率/盈亏/次数，支持排序与复制表格列。

- shared types & helpers
  - 文件: `.obsidian/plugins/al-brooks-console/src/views/components/types.ts`
  - 含 `StrategyCardData`, `PerformanceRow` 等类型定义。

## 数据流（Data Flow）
1. `StrategyRepository` mount 时调用 `strategyIndex.list()` 获取所有策略元数据（名称、path、tags、meta 字段）。
2. 从 `TradeIndex` 获取交易记录（如 `tradeIndex.getAll()`），并聚合以计算每个策略的胜率/盈亏/次数（复用 `scripts/pa-view-playbook.js` 中的算法或 `core/analytics`）。
3. 构建 `groups`：根据策略元数据中的 `marketCycle` 或 `semanticGroup` 字段做分组，按 group 名称排序。
4. 将数据传下发到 `StrategyStats`, `StrategyList`, `StrategyPerformanceTable`。
5. 用户点击卡片 `onOpen` 调用插件 API 打开文件（`app.workspace.openFileByPath()` 或现有 helper）。

## 交互细节
- 折叠/展开：组内支持全部折叠/展开，单卡支持展开详情。
- 过滤/排序：支持按胜率/使用次数/最近使用排序；顶部统计卡点击进行快速过滤。
- 可访问性：卡片与 control 元素使用 `button`，支持 `tab` 聚焦、`Enter/Space` 激活，焦点样式与 Dashboard 保持一致。
- 过渡：展开/折叠使用 CSS transition，动画时长 150–220ms。

## 性能/优化
- 数据聚合在第一次打开时计算并缓存（内存缓存），当 `strategyIndex` 或 `tradeIndex` 发出更新事件时重新计算。
- 对于大库（>500 策略），`StrategyList` 使用虚拟化（可选）或分页显示。

## 样式 & 本地化
- 使用插件现有主题变量（`--pa-bg`, `--pa-foreground` 等）。
- 文案以中文为主，遵循 `requirements.md` 中的翻译；若项目中有 i18n 管理（例如 `locales/zh.json`），则把字符串放入对应文件。

## 复用与依赖
- 必须复用 `ObsidianStrategyIndex`（无需改动索引逻辑）。
- 优先调用 `core/analytics` 中已有的策略归因函数；若不存在，则从 `scripts/pa-view-playbook.js` 中移植必要函数到 `core/analytics` 或 `views/helpers/analytics.ts`。

## 任务映射（快速版）
- D1: 创建 `views/components` 目录与 types 文件。
- D2: 实现 `StrategyStats`、`StrategyCard` 基础样式与交互。
- D3: 在 `Dashboard.tsx` 中插入 `StrategyRepository` 容器并挂载数据加载逻辑。
- D4: 移植或复用 perf 计算并生成 `StrategyPerformanceTable` 数据。
- D5: 本地化与样式微调，加入键盘可访问性。
- D6: 构建、测试、记录实现日志。

---

下一步：将把 `tasks.md`（原子任务清单）写入同级目录，然后开始实现 `StrategyStats.tsx`。如需我现在开始实现第一个组件，请确认。