# P0 Stabilization — Manual Regression Checklist

适用 spec：`al-brooks-console-stabilization`

目标：在 10 分钟内确认 P0 修复生效（反污染 + dateIso 稳定 + 可导出快照），并为后续“功能完全移植”提供可复用的回归基线。

## Preconditions

- 已在 Obsidian 中启用插件 `al-brooks-console`。
- Vault 内仍保留 Dataview 版控制台（作为对照）。

## Checklist

### 1) Templates 不得进入交易索引（反污染）

1. 在 vault 中确认模板文件存在：`Templates/单笔交易模版 (Trade Note).md`。
2. 打开插件控制台（命令：`打开交易员控制台`）。
3. 在交易列表中搜索/目视确认：模板文件不应出现。
4. 若你有调试日志：确认 TradeIndex 构建时不会把 `Templates/` 下文件计入 trades。

**Pass 条件**：模板文件不在 trades 列表、也不影响统计。

补充（防误入库）：
- 打开任意包含“`#PA/Trade`”示例文字的文档（例如迁移报告）。
- 确认它不会因为正文里出现 `#PA/Trade` 字样而被 TradeIndex 当成交易。

### 2) dateIso 必须总是合法 YYYY-MM-DD

1. 找一条交易文件名为 `YYMMDD_...` 形式的交易（例如 `251219_0036.md`）。
2. 打开该交易笔记，确保它确实被识别为交易（tag/fileClass 满足规则）。
3. 在插件控制台的交易列表中确认该交易：
   - 能正常显示/排序（不会跑到顶部/底部异常）。
4. 若该交易 frontmatter `date` 缺失：确认仍能生成合理日期（来自文件名或 ctime/mtime fallback）。

**Pass 条件**：无论该交易的 frontmatter/date 是否存在，插件输出的 `dateIso` 都是合法 `YYYY-MM-DD`，且排序稳定。

### 3) 导出索引快照命令可用

1. 在命令面板执行：`导出索引快照 (Index Snapshot)`。
2. 确认出现 Notice 提示导出路径。
3. 到目录 `Exports/al-brooks-console/` 确认生成 `snapshot_*.json` 文件。

**Pass 条件**：命令可触发、文件可落盘、路径稳定。

### 4) 快照最小字段与来源区分

1. 打开最新 `snapshot_*.json`。
2. 确认存在字段：
   - `meta.schemaVersion`
   - `meta.exportedAt`
   - `meta.pluginVersion`
   - `trades`
   - `statsByAccountType`
   - （可选）`today`
   - （可选）`strategyIndex`
3. 确认 `meta.pluginVersion` 为插件版本号（例如当前 `1.0.0`），而不是 `dry-run-from-legacy`。

**Pass 条件**：快照字段齐全，且能与离线脚本快照来源区分。

补充（Today 联动最小回归）：
- 若当天已填写 market cycle（TodayContext 可读到）：确认 `today.marketCycle` 存在。
- 确认 `today.strategyPicks` 为非空数组，且元素包含 `strategyName`（用于验证“今日市场周期 → 策略推荐”链路稳定）。

### 5) 最小数值对照（建议抽样）

1. 随机抽一小批样本交易（例如最近 20 笔）。
2. 对比 Dataview 版与插件版在同一批样本上的：
   - 交易数
   - 净利润
   - 胜率（按 account_type + All）

**Pass 条件**：关键指标一致，或差异可解释（且不来自 Templates 污染/日期错乱）。

## If Failed

- 若出现模板被计入：检查是否有自定义 folder allowlist 影响，或是否存在非 `Templates/` 的模板目录。
- 若 dateIso 异常：确认文件名是否符合 `YYMMDD` / `YYYYMMDD` / `YYYY-MM-DD` 前缀；否则应由 ctime/mtime 兜底。
- 若导出失败：检查是否存在 `Exports/al-brooks-console/` 目录创建权限/文件同名冲突。
