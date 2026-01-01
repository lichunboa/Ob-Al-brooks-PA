# 📋 原生插件迁移 - View 依赖矩阵（Dataview Baseline → Native Plugin）

> 目的：把现有 DataviewJS 控制台的“读哪些数据/调用哪些命令/会不会写入笔记”整理成可迁移清单。
> 原则：迁移期保留 Dataview 版作为对照基准；原生插件先做 MVP（Skeleton + Brain + Face）。

---

## 1) 全局数据契约（现状：`window.paData`）

原生插件需要提供的核心数据面（至少覆盖以下 key）：

- `trades`: 交易列表（倒序/近期优先）
- `tradesAsc`: 交易列表（升序，用于曲线/累计/按时间遍历）
- `stats`: 引擎计算好的统计（部分 view 直接消费）
- `daily.todayJournal`: 今日复盘日记（用于 market_cycle 与策略推荐）
- `strategyIndex`: 策略索引（`list/byName/lookup/byPattern/repoPath`）
- `sr`: 记忆库汇总（总数、到期、曲线、题库、focusFile 等）
- `course`: 课程/学习数据（含 `hybridRec`）
- `coach`: 复盘焦点（`combined/today/week/last30` 的 focus）
- `recommendations.ranked`: 综合推荐（trade/course/sr）

---

## 2) View 级依赖（读哪些字段）

### 2.1 `scripts/pa-view-hub-trading.js`（Trading Hub）
读取：
- `paData.trades` / `paData.tradesAsc`
- `paData.daily.todayJournal.market_cycle`
- `paData.coach.(combined|today|week|last30).focus`
- `paData.recommendations.ranked[]`

交易字段使用：
- `t.date`, `t.mtime`, `t.pnl`, `t.outcome`, `t.dir`, `t.patterns`, `t.link`, `t.r`, `t.type`

外部命令：
- QuickAdd：`quickadd:choice:New Live Trade` / `New Demo Trade` / `New Backtest`

### 2.2 `scripts/pa-view-hub-analytics.js`（Analytics Hub）
读取：
- `paData.trades`, `paData.tradesAsc`, `paData.stats`
- `paData.strategyIndex`（明确“单一信源”，不自扫策略仓库）

交易字段使用：
- `t.type`, `t.pnl`, `t.date`
- 策略归因：`t.strategyName`（优先）→ `t.patterns` → `t.setupKey / t.setup`

说明：
- 此 view 内部直接用 `pnl > 0` 统计胜率（属于“pnl-first”口径）。

### 2.3 `scripts/pa-view-today.js`（今日实时监控面板）
读取：
- `paData.tradesAsc`
- `paData.daily.todayJournal.market_cycle`
- `paData.strategyIndex`（策略推荐 + 策略助手）

交易字段使用：
- `t.date`, `t.mtime`, `t.outcome`（空=进行中）, `t.patterns`, `t.signal`, `t.market_cycle`, `t.setup`

外部命令：
- QuickAdd：`quickadd:choice:New Live Trade`（底部按钮）

### 2.4 `scripts/pa-view-memory.js`（记忆库 UI）
读取：
- `paData.sr`: `total/due/cnt/load/quizPool/focusFile/fileList` 等
- `paData.course.hybridRec`

外部命令：
- Dataview 强制刷新：`dataview:force-refresh-views`（当 `window.paRefreshViews` 不存在时兜底）
- Spaced Repetition：`obsidian-spaced-repetition:srs-review-flashcards`

状态交互：
- 使用 `window.paIgnoreFocus` 作为“跳过优先卡片”的临时状态。

### 2.5 `scripts/pa-view-playbook.js`（策略库/Playbook）
读取：
- `paData.strategyIndex`（策略列表、别名 lookup、pattern 映射、repoPath）
- `paData.tradesAsc`
- `paData.daily.todayJournal.market_cycle`（今日推荐）

交易字段使用：
- `t.strategyName`, `t.patterns`, `t.pnl`, `t.date`

### 2.6 `scripts/pa-view-inspector.js`（全景巡检仪）
读取：
- `paData.trades`, `paData.sr`, `paData.strategyIndex`
- `Templates/属性值预设.md`（允许值白名单 + 别名归一）

交易字段使用（已确认在头部逻辑中使用）：
- `t.ticker`, `t.tf`, `t.setup`, `t.pnl`, `t.r`, `t.strategyName`, `t.patterns`, `t.link`

说明：
- Inspector 同样强调复用 `strategyIndex`，避免自己扫描造成口径漂移。

### 2.7 `scripts/pa-view-schema.js`（Metadata Monitor）
读取：
- Dataview 扫描 `dv.pages('#PA')` + `app.metadataCache.getFileCache(file)`
- 交易/策略识别：通过标签 `#PA/Trade`、`#PA/Strategy`
- 引擎聚合：可选使用 `window.paData.trades` 来做分布图（ticker/setup/exec）

关键规则（减负/必填校验）：
- 仅当交易“完结”（`outcome` 非空/非 Unknown/Empty）才检查必填字段
- 必填：`ticker/timeframe/direction`
- “形态/策略”二选一必须有一个

### 2.8 `scripts/pa-view-manager.js`（上帝模式：属性管理器）
读取：
- 全库扫描：`dv.pages('""')` + `app.metadataCache.getFileCache(file)`

写入（重要风险点）：
- 批处理写 frontmatter：`app.fileManager.processFrontMatter(tFile, (fm) => { ... })`
- 支持操作：
  - `RENAME_KEY`（重命名字段，带“目标字段存在则跳过”的保护）
  - `DELETE_KEY`
  - `UPDATE_VAL`
  - `APPEND_VAL`
  - `DELETE_VAL`
  - `INJECT_PROP`（注入属性/值）

说明：
- manager 明确“不会自动触发 Dataview 刷新”，避免页面跳动/丢滚动。
- 迁移到原生插件时，这个能力属于高风险（大规模写入），建议后置到 Advanced 阶段。

---

## 3) 外部依赖（插件耦合点清单）

- Dataview 命令：`dataview:force-refresh-views`
- QuickAdd 命令：
  - `quickadd:choice:New Live Trade`
  - `quickadd:choice:New Demo Trade`
  - `quickadd:choice:New Backtest`
- Spaced Repetition 命令：`obsidian-spaced-repetition:srs-review-flashcards`

迁移含义：
- 原生插件 MVP 不需要“调用这些外部命令”就能完成核心看板；但如果要保留同等按钮/入口，需要做：
  - `app.commands.findCommand(id)` 检测存在性
  - 不存在时降级（隐藏按钮或提示）

---

## 4) 对原生插件数据层的直接要求（从 view 反推）

- 必须支持 pnl-first：所有统计优先以 `pnl`（净利润）判断 win/loss；仅在 `pnl` 缺失时才用 `outcome` 兜底。
- 必须支持 strategyIndex：
  - `byPattern` 用于 “patterns -> 策略卡”
  - `lookup` 用于 “别名 -> canonicalName”
  - `byName` 用于 “canonicalName -> 策略卡对象（含 entryCriteria/riskAlerts/stopLossRecommendation/signalBarRequirements 等字段）”
- 必须支持 daily.todayJournal.market_cycle：用于“今日推荐/策略推荐”。
- SR/课程可以先做最小可用：
  - MVP 阶段：允许显示“未接入/加载中”，但要保证不影响交易看板。

---

## 5) 迁移阶段建议（基于风险与收益）

- MVP（先做）：Trading Hub / Analytics Hub 的核心统计与交易列表（低风险，只读）
- Next（再做）：Today / Playbook（需要 strategyIndex 与 daily）
- Later（后置）：Memory（涉及 SR/课程聚合 + 外部命令）
- Advanced（最后）：Manager（批处理写 frontmatter，高风险，需要更严格的确认/回滚策略）
