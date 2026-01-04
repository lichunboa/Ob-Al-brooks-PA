# Spec Tasks: strategy-repository-ui — Atomic Tasks

## 概览
将 `Strategy Repository` 从设计到实现拆成可执行的小任务，便于逐步实现与回退。

## 原子任务
- T1: 初始化组件目录 `views/components` 与类型文件 `types.ts`。
- T2: 实现 `StrategyStats.tsx`（顶部统计卡，含过滤回调）。
- T3: 实现 `StrategyCard.tsx`（单卡，支持展开/收起与打开笔记）。
- T4: 实现 `StrategyList.tsx`（按分组渲染，含组折叠/展开）。
- T5: 实现 `StrategyPerformanceTable.tsx`（表现表，支持排序与复制列）。
- T6: 将组件导入 `Dashboard.tsx` 并添加容器 `StrategyRepository`，实现数据加载与首次渲染。
- T7: 移植或复用 perf 计算逻辑（`scripts/pa-view-playbook.js` 中的聚合），在 `core/analytics` 或 `views/helpers/analytics.ts` 中实现辅助函数。
- T8: 本地化：将文本放入现有翻译结构或在组件中使用中文默认文案。
- T9: 样式与主题：使用现有 CSS 变量完成 UI 样式，并做暗/亮主题测试。
- T10: 性能与缓存：实现第一次聚合后的内存缓存，并在索引更新时刷新。
- T11: 测试：`npm run build`，在 dev 环境验证 Dashboard 中无 runtime 错误并通过验收测试用例。
- T12: 文档：记录 implementation log 并提交审批。

## 优先级
- 优先级 P0: T1–T6（UI 与数据绑定）
- 优先级 P1: T7–T9（计算、样式、i18n）
- 优先级 P2: T10–T12（优化、测试、文档）

---

下一步：实现 `T1` 与 `T2`（创建类型文件并实现 `StrategyStats.tsx`）。