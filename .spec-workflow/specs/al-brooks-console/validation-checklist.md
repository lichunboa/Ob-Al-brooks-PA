# MVP Validation Checklist (Manual) — al-brooks-console

> 目标：以 Dataview 版“交易员控制台”为对照基准，手工验证原生插件 MVP 已满足 AC-1..AC-6，且不会破坏旧系统。

## 0. Preconditions（准备）

- Obsidian 已启用插件：`al-brooks-console`
- Dataview 版控制台仍可打开（作为 baseline / fallback）
- 建议在开始前关闭“自动同步/批量写入类操作”，避免同时有大量文件变更干扰验收

## 1. Choose a Sample Set（选择样本交易集合）

选择一组**可重复**的样本交易笔记，用于对照：

- 样本规模建议：10–30 条（越小越容易手工核对）
- 覆盖面建议：
  - 至少 1 条：`pnl > 0`
  - 至少 1 条：`pnl < 0`
  - 至少 1 条：`pnl = 0`（验证 scratch）
  - 至少 1 条：无 `pnl` 但有 `outcome`（验证兜底）
  - 若数据中存在：覆盖 `account_type` 的 Live/Demo/Backtest（用于分桶校验）

记录你选的样本（建议直接复制文件路径列表到这里，后续复测可复用）：

- Sample paths:
  - 
  - 

## 2. Baseline: Dataview Console（记录对照基准值）

在 Dataview 版控制台中，记录以下值（All + 分账户，如果 Dataview 版支持/可见）：

- All
  - count = ___
  - netProfit = ___
  - winRate = ___
- Live
  - count = ___
  - netProfit = ___
  - winRate = ___
- Demo
  - count = ___
  - netProfit = ___
  - winRate = ___
- Backtest
  - count = ___
  - netProfit = ___
  - winRate = ___

备注：允许存在纯“显示格式差异”（例如四舍五入、百分号显示、单位），但数值语义应一致。

## 3. Plugin: Dashboard（记录插件值并对比）

打开原生插件仪表盘（ItemView），记录同样的值：

- All
  - count = ___
  - netProfit = ___
  - winRate = ___
- Live
  - count = ___
  - netProfit = ___
  - winRate = ___
- Demo
  - count = ___
  - netProfit = ___
  - winRate = ___
- Backtest
  - count = ___
  - netProfit = ___
  - winRate = ___

验收判定：

- AC-1：打开仪表盘后，应在可接受时间内显示统计与列表（不需要手动刷新）。
- 数值对照：插件（All + 分账户）与 Dataview baseline 在语义上应一致。

## 4. Live Updates（实时增量更新）

从你的样本集合里挑 1–3 条做以下变更，验证仪表盘自动更新（无需重启/手动刷新）：

1) **Modify（正文或 frontmatter）**
- 操作：修改一条交易的 `pnl`（例如从 -1 改为 +1，或 +1 改为 -1）
- 期望：仪表盘统计与列表自动更新
- 覆盖：AC-2、AC-4

2) **Rename（重命名）**
- 操作：重命名该交易文件
- 期望：仍被识别为交易；列表项可点击打开且打开的是新路径
- 覆盖：AC-3

3) **Move（移动路径）**
- 操作：把交易文件移动到另一个文件夹
- 期望：仍被识别为交易；统计/列表正确；点击可打开
- 覆盖：AC-3

4) **Delete（删除）**
- 操作：删除一条交易文件（建议用测试样本）
- 期望：该交易从统计与列表移除
- 覆盖：AC-2、AC-3

## 5. WinRate Semantics（胜率口径）

1) **pnl 优先**
- 选择：`pnl` 可解析的交易
- 期望：
  - `pnl > 0` → win
  - `pnl < 0` → loss
  - `pnl = 0` → scratch（不应计为 win）
- 覆盖：AC-4

2) **outcome 兜底**
- 选择：无 `pnl`，但有 `outcome` 的交易（例如 Win/Loss/Scratch 或中文同义）
- 期望：胜率允许回退到 outcome 规则
- 覆盖：AC-5

## 6. Compatibility（不破坏 Dataview 版）

- 操作：在插件启用状态下，打开 Dataview 版控制台并执行一次刷新/渲染
- 期望：Dataview 版仍能正常运行（不被插件修改/写入破坏）
- 覆盖：AC-6

## 7. Sign-off（签字/结论）

- 验收日期：____
- vault / 样本说明：____
- 结论：通过 / 不通过
- 若不通过：记录最小复现步骤与截图/日志
