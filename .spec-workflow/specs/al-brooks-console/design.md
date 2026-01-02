# Design — al-brooks-console

## 0. Design Principles
- **对照优先**：MVP 以 Dataview 版为基准，先实现“同样的可见结果”，再重构更聪明的逻辑。
- **只读安全**：MVP 阶段只读取与解析，不自动改写用户笔记。
- **增量索引**：用 Obsidian 原生事件驱动增量更新，避免频繁全量扫描。

## 1. High-Level Architecture

### 1.1 Modules
- `ConsolePlugin`（主插件）
- `DashboardView`（ItemView + React Root）
- `TradeIndex`（发现/解析/缓存/聚合/事件）
- `FieldMapper`（双语字段映射、类型安全解析）

Advanced（非 MVP，但需为强交互与并行开发预留清晰边界）：
- `InspectorEngine`（只读诊断：生成 Issue 列表与 FixPlan）
- `ManagerEngine`（写入治理：预览/执行/回滚/报告）

### 1.2 Data Flow
1) `TradeIndex.buildInitialIndex()` 扫描 vault → 生成 `TradeRecord[]` 与聚合 `TradeStats`。
2) `TradeIndex` 发出 `changed` 事件。
3) `DashboardView` 订阅事件并刷新 React state。
4) vault 发生事件（modify/rename/delete）→ `TradeIndex.handleEvent()` → 仅更新受影响文件 → 再次 emit。

Advanced 写入治理数据流（保持“读写分离”）：
1) `InspectorEngine.scan()` 基于 `TradeIndex`/`metadataCache` 生成 `Issue[]`（只读）。
2) 用户在 UI 选择问题 → `InspectorEngine.buildFixPlan(selectedIssues)` 生成 `FixPlan`（只读）。
3) 用户点击“应用修复” → 将 `FixPlan` 交给 `ManagerEngine.preview(plan)` 生成 `WritePreview`（包含 before/after）。
4) 用户二次确认后 → `ManagerEngine.apply(preview)` 执行写入（逐文件、失败隔离）。
5) 写入结束 → `ManagerEngine.report()` 返回结果；可在同一会话内 `ManagerEngine.undoLast()` 做最小回滚。

## 2. Trade Note Discovery (识别策略)
MVP：
- 主要规则：带 `#PA/Trade` tag。
- 读取来源：优先用 `metadataCache.getFileCache(file)` 的 tags/frontmatter。
- 初始扫描：遍历 vault 的 Markdown 文件（可先按路径粗过滤以提速）。

增量更新：
- `app.vault.on('modify')`：重新解析该文件。
- `app.vault.on('rename')`：更新 key（旧 path → 新 path），必要时重新解析。
- `app.vault.on('delete')`：从索引移除。
- `app.metadataCache.on('changed')`：用于捕捉 frontmatter/tag 变化（与 modify 互补）。

## 3. Data Model

### 3.1 Canonical TradeRecord
建议最小字段：
- `path: string`（主键）
- `name: string`
- `dateIso: string`（YYYY-MM-DD）
- `ticker?: string`
- `pnl?: number`（净利润）
- `outcome?: 'win'|'loss'|'scratch'|'unknown'`（可选，作为兜底或展示）
- `mtime?: number`

### 3.2 TradeStats
- `countTotal`
- `countCompleted`（可定义：有 pnl 或 outcome）
- `countWins`
- `winRatePct`
- `netProfit`

### 3.3 Data Governance Models (Advanced)
- `Issue`：描述一个文件的一个问题（path + field + reason + severity）。
- `FixPlan`：一组“建议变更”（不包含写入副作用）；可由 Inspector 生成，也可由 Manager 手工构造。
- `WritePreview`：将 FixPlan 具象化为 per-file 的 before/after diff，用于 UI 预览与二次确认。
- `WriteResult`：每个文件的成功/失败、错误信息、实际写入字段统计。

## 4. Field Mapping & Parsing

### 4.1 FieldMapper
- 维护一个 mapping 表：canonical → 候选字段名数组。
- MVP 必须支持：
  - `pnl` ← [`净利润/net_profit`, `net_profit`]
  - `ticker` ← [`品种/ticker`, `ticker`]

### 4.2 类型解析
- `pnl`：允许 number / string（如 "100"）→ parseFloat；失败则 undefined。
- `dateIso`：优先 frontmatter `date`；否则从文件名/创建时间推断（MVP 可用 mtime/ctime 兜底）。

## 5. Win Rate Canonicalization
统一口径：
- 若 `pnl` 可用：
  - pnl > 0 → win
  - pnl < 0 → loss
  - pnl === 0 → scratch（计入 completed 但不计 win；或按配置）
- 若 `pnl` 不可用：根据 outcome 字符串映射（Win/Loss/Scratch/止盈/止损/保本）。

说明：该设计显式修复现状 core 中“stats 与 coachFocus 口径不一致”的问题。

## 6. UI Design (MVP)

### 6.1 Dashboard Layout
- 顶部：三张统计卡片（交易次数 / 胜率 / 净利润）
- 下方：交易列表（最近 N 笔，可配置，默认 50）

### 6.2 Interactions
- 点击列表项：打开对应文件（使用 Obsidian API 打开 leaf）。

### 6.3 UI Design (Advanced, minimal)
- Inspector：问题列表 + 打开文件 + 生成修复方案 + 进入 Manager 预览。
- Manager：预览（文件/字段/改前改后）+ 二次确认 + 执行进度 + 汇总报告 + 会话内撤销。
- 设置：少量 Course/Memory 参数（不引入复杂面板）。

## 7. Performance & Debounce
- 初始扫描可能耗时：
  - 允许显示 loading 状态。
  - 增量更新采用 debounce（例如 300~800ms），批处理多个快速 modify。

## 8. Compatibility / Migration Strategy
- MVP 期间不删除旧版 Dataview 控制台。
- 迁移对照：可用同一组样本 trade notes 对比：
  - 总交易数
  - 净利润
  - 胜率（按 pnl 口径）

写入治理兼容性：
- 写入相关能力默认关闭，避免对现有 Dataview 工作流产生副作用。
- 所有归一化逻辑必须复用 `FieldMapper`（单一信源），避免“看板口径”与“写入口径”分叉。

## 9. Testing Strategy (轻量)
- 单元测试（可选）：FieldMapper 解析 pnl/ticker；winrate 计算。
- 手工验收脚本：
  - 修改任意 trade note 的 pnl，观察仪表盘更新。
  - 重命名 trade note，观察链接与计数保持一致。
