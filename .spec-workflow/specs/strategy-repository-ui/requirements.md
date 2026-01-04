# Spec: strategy-repository-ui — Requirements

日期: 2026-01-03
作者: 自动生成（由 Copilot 协助）

## 目标（Goal）
在插件 Dashboard 中新增完整的“策略仓库 (Strategy Repository)”面板，复现 v5.0 Dataview 版的策略库功能，消除用户对“策略仓库缺失”的感知差。

## 范围（In scope）
- 在 `Dashboard` 中新增一个可折叠/展开的 `Strategy Repository` 区块。
- 顶部统计卡：总策略、实战中、学习中、总使用次数（4 格统计）。
- 今日推荐（基于 `TodayContext` 的市场周期或 coach focus）。
- 按 `marketCycles` 分组的策略列表（每组标题含数量）。
- 每个策略卡显示：名称、状态标签、R/R、胜率、使用次数、最近使用日期、设置类别、来源；卡片可展开显示更多详情并可打开策略笔记。
- 策略实战表现表（Strategy Performance）：策略 / 胜率 / 盈亏 / 次数，按盈亏排序。
- 可复用现有数据源：`ObsidianStrategyIndex` (`.obsidian/plugins/al-brooks-console/src/platforms/obsidian/obsidian-strategy-index.ts`)、`TradeIndex` 和已存在的策略归因逻辑（`scripts/pa-view-playbook.js` 中的 perf 计算或 `core/analytics` 提供函数）。
- 支持中英文显示（与现有 Dashboard 文案保持一致）和主题变量适配（暗/亮色）。

## 非功能要求（NFRs）
- 交互：折叠/展开延时 ≤ 180ms，视觉过渡 150–250ms，键盘可聚焦并可用 Enter/Space 展开。
- 性能：首次渲染基于现有 `strategyIndex`，不重复全库扫描；渲染应在 300ms 内完成（典型库 100 条策略）。
- 可访问性：卡片与按钮可用键盘操作，焦点有明显可见样式。
- 兼容性：保留现有 `Dashboard` 的设置订阅/主题变量，不影响其他区块。

## Success / 验收标准
- 在 `Dashboard` 打开时能看到 `Strategy Repository` 区块，且顶部统计数字与 `strategyIndex.list().length` 与计算结果一致。
- 点击卡片的“查看详情”能打开对应策略笔记（`openFile(path)`）。
- 实战表现表与 `TradeIndex` 的归因统计一致（同一套计算逻辑）。
- UI 文案为中文（遵循现有翻译），暗色主题显示正常。
- 单元/集成验证：构建通过 `npm run build` 且 Dashboard 无 runtime 报错（至少在本地 dev 环境验证）。

## 约束与假设
- 假设 `strategyIndex` 已初始化并提供 `list()`、`lookup()`、`byPattern()` 等方法。
- 假设 `TradeIndex` 提供交易记录（`tradesAsc` 或 `getAll()`），以便计算策略表现。
- 本 spec 仅负责 UI/交互与数据绑定；不负责新增策略卡 YAML 字段的规范化逻辑（如需扩展，另起 spec）。

## 复用/参考代码位置
- `ObsidianStrategyIndex`: `.obsidian/plugins/al-brooks-console/src/platforms/obsidian/obsidian-strategy-index.ts`
- `Dashboard` 入口: `.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx`
- Dataview 版参考实现（可移植逻辑）: `scripts/pa-view-playbook.js`（策略分组、perf 计算、排序、HTML 结构）
- 策略归因/分析辅助: `core/analytics.ts`（若存在 computeStrategyAttribution）

## 验收测试用例（高层）
1. 数据准备：在 `策略仓库 (Strategy Repository)` 中创建 5 个策略卡，部分标记为实战中并在交易中有对应记录。
2. 打开 `Dashboard`：检查顶部统计匹配策略数量与使用次数。
3. 点击“今日推荐”中的策略：能跳转并打开文件。
4. 展开任意策略卡：显示详情（市场周期、设置类别、来源）；表格中能看到对应的胜率/盈亏/次数。

## 时间估计（快速预估）
- Requirements → Design: 1 工作日（文档与 review）
- Design → Tasks: 0.5 工作日
- 实现（UI + 数据绑定 + 样式）: 2–3 工作日
- 测试与修复: 1 工作日

---

下一步：我将生成 `design.md`，包含组件分解、数据流、文件/函数落点和交互草图。若你有额外验收项或偏好（比如表格必须使用可复制列、或卡片需包含策略 tag 列），请现在告诉我。