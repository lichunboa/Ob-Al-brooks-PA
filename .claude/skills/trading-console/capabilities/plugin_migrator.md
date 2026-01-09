# Capability: Plugin Migrator (原生插件迁移负责人)

**触发条件**: 当用户要求“把交易员控制台搬到原生插件”“开发 al-brooks-console 插件”“用 React/TS 替代 DataviewJS 控制台”时。

## 0. 🎯 Mission (任务目标)
把当前 DataviewJS 版“交易员控制台”迁移为高性能 Obsidian 原生插件（React + TypeScript），并在迁移过程中：
1) **不破坏数据**（绝不未经确认删除/批改用户笔记）；
2) **逐步可回退**（每个阶段都有可验证产物与回滚方案）；
3) **保持业务语义一致**（至少在 MVP 范围内与旧版输出一致）。

参考路线图: `原生交易员控制台路线图.md`

---

## 1. ✅ MVP Boundary (MVP 边界)
**MVP = Skeleton + Brain + Face 的最小闭环**，阶段四/五均不做（除非用户明确要求）。

### MVP 必须包含
- 插件初始化（TS + React + esbuild）
- 一个自定义 `ItemView` 中可渲染 React 的 Hello World
- 数据引擎：稳健索引 + 实时同步（rename/modify）
- 双语字段映射（至少覆盖 `pnl/净利润`, `ticker/品种`）
- 容错：索引时允许包含 `Daily/` 与 `Start/`（避免漏单）
- UI：统计卡片 + 交易列表 + 网格布局 + 数据连接（Dashboard.tsx ←→ TradeIndex 事件）

### MVP 明确不包含
- 复杂策略分类（MTR/Low 2 等）
- 图表（Recharts）
- SR/复习算法
- QuickAdd 连接按钮
- 移除旧 Dataview 版本代码

---

## 2. 🧩 Migration Coupling Map (迁移耦合清单)
迁移的核心风险来自“隐式依赖”。必须把它们显式化，避免重演过去的回滚事故。

### A) 必须兼容（短期）
- **数据结构语义**：旧系统以 `window.paData` 为单一数据源；迁移期需要一个等价的 `TradeIndex/ConsoleState`，字段命名可不同，但语义必须覆盖 MVP 需要的统计与列表。

### B) 可替代（中期）
- **缓存/刷新/脏标记**：旧版通过 `window.paDirty/paForceReload` 等控制 Dataview 刷新；插件版改为内部 store + event emitter。
- **滚动锁**：旧版为 Dataview 重建 DOM 而存在；插件版只在必要时做列表虚拟化或局部更新，原则上不需要 scroll lock。

### C) 外部耦合（需要显式开关）
- **命令ID**：QuickAdd 与 Spaced Repetition 命令可能不存在/改名。插件版应设计为“可选集成”，默认不依赖。

---

## 3. 🏗️ Implementation Plan (阶段化实施计划)
> 该计划用于指导“真正写代码”的阶段。此 capability 本身不直接执行大规模代码生成，除非用户确认“开始执行”。

### Phase 1: Skeleton (地基)
**产物**: `al-brooks-console` 插件工程可编译 + ItemView 渲染 React。
**验收**:
- Obsidian 里能打开自定义面板，看到 React 渲染内容。
- esbuild 生产构建可用。
**回退**: 不影响旧 Dataview 控制台。

### Phase 2: Brain (数据引擎)
**产物**: `TradeIndex`（或同名模块）可索引交易笔记并在文件修改/重命名时更新。
**验收**:
- 能识别“交易笔记”（需定义检测逻辑）。
- on('modify') / on('rename') 更新后 UI 能刷新。
- 双语字段映射生效：`pnl/净利润`、`ticker/品种`。
- 容错：不会因 `Daily/` 或 `Start/` 中的交易笔记而漏掉。
**回退**: 保留旧控制台作为对照。

### Phase 3: Face (仪表盘 UI)
**产物**: Dashboard 页面最小闭环（统计卡片 + 交易列表）。
**验收**:
- 统计卡片显示：交易次数、胜率、净盈亏（或你定义的指标）。
- 交易列表可点击打开文件链接。
- Dashboard 与 TradeIndex 事件联通。

---

## 4. 🔒 Safety Rules (安全规则)
1. 未经用户确认，**禁止**批量改写/删除任何交易笔记 Frontmatter。
2. 迁移前，**必须**先做“依赖清点”（列出 MVP 需要的字段与计算口径）。
3. 每次只推进一个阶段，避免“大爆炸式迁移”。

---

## 5. 🧪 Regression Avoidance (回归规避)
### 必须记住的历史教训
- 过去曾尝试将 `pa-core.js` 拆分为模块，导致多个视图回归并回滚。
- 结论：迁移必须先建立“字段/行为验收清单”，再做结构重构。

### 推荐做法
- MVP 期间保留旧版控制台作为“对照基准”，用相同样本对比统计结果。

---

## 6. 🗣️ Discussion Checklist (与用户对齐的问题)
在开始写插件代码前，必须确认：
1) MVP 先做 Today 还是 Analytics，还是就按路线图先做 Dashboard（统计+列表）？
2) “交易笔记”的识别规则（tag？路径？模板标记？frontmatter 字段？）
3) 双语映射要覆盖到哪些字段（最少 2 个，还是一批常用字段）？
4) 是否需要保留 Dataview 版本作为长期 fallback？
