# 20-gap 归零法第二阶段审计

## 1. 这轮要回答的问题

不是继续猜阈值，而是先确认：

1. `20-gap` 现在到底有没有把频率放出来。
2. `signal_created -> 正式成交 -> 最终交易` 的收束链里，主损耗发生在哪一层。
3. 成交后持续亏损的主簇，到底是 `signal bar` 问题，还是背景/目标/管理预期问题。

## 2. 当前已确认的事实

### 2.1 频率不是主问题

在 `R1 BTCUSDT 5m 2024Q3`：

- `valid::20均线缺口 = 190`
- `passed_signal_bar = 76`
- 正式信号约 `35`
- 最终成交 `8`

结论：

- `20-gap` 现在已经不是“放不出来”。
- 真正卡住的是：
  - 候选压缩成正式信号
  - `entry_block` 的目标/成本/预期层级
  - 正式成交后的质量

### 2.2 `signal bar` 类型不是当前第一根因

`P1 BTCUSDT 5m 2022Q1` 逐笔分桶：

- `trend_bar`: `12` 笔，`6 赢 6 亏`
- `reversal_bar`: `1` 笔，`0 赢 1 亏`

`F1 BTCUSDT 15m 2022` 逐笔分桶：

- 全部都是 `trend_bar`

结论：

- 现在不能靠“砍掉 reversal_bar/inside_bar”来解决。
- 主体亏损来自 `trend_bar` 本身。

### 2.3 当前坏单主簇

`P1 BTCUSDT 5m 2022Q1`：

- 主体是 `broad_range`
- 主体是 `ema_gap_expectation = close_test`
- 主体管理风格是 `brooks_scalp`
- `ema_gap_bars` 主要落在 `20-30`

这说明：

- 问题不是 “bars_away 不够”
- 问题也不是 “signal bar 类型错了”
- 更像是：
  - 在弱背景里，系统把很多 `20-gap` 都当成了 `close_test + scalp`
  - 但这批单里，哪些真的有“可测试磁体”，哪些只是看起来像 `close_test`，还没拆清

## 3. 这轮已经证伪的方向

### 3.1 “区间背景直接不做 20-gap”

已证伪。

它会把 `20-gap` 主体一起砍掉，不是有效边界。

### 3.2 “所有 20-gap 都直接提成 swing target”

已证伪。

它只改善部分 `5m` 样本，但会拖坏 `15m` 与另外一批 `5m`。

### 3.3 “弱 close-test 且最近磁体过远就全部不做”

已证伪。

这条规则会先把 `F1 BTC 15m 2022` 做差：

- `11 -> 9` 笔
- PF `0.759 -> 0.643`

所以它不是通用正优化。

## 4. 这轮真正保留的成果

### 4.1 gap 字段透传已经修好

成交单里不再丢：

- `ema_gap_bars`
- `ema_gap_variant`
- `ema_gap_context_tier`
- `ema_gap_expectation`
- `ema_gap_expectation_reason`

这让后续逐笔审计终于可信。

### 4.2 gap 动态管理 `plan=None` 崩溃已修

现在 `ema_gap_continuation / ema_gap_mag_final_leg / first_ema_gap_reentry`
已经能走动态管理，不再因为空 `plan` 直接报错。

### 4.3 新增了正式逐笔审计工具

脚本：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/ema_gap_trade_audit.py`

用途：

- 固定输出 `valid_previous_entry`
- `close_test_target_distance_r`
- `rescue_target_distance_r`
- `signal_bar_type`
- `market_state / higher_market_state`

后面不再依赖临时内联脚本。

## 5. 当前最像根因的地方

现在最像真根因的，不是 detector 放量不足，而是：

**在 `broad_range + trend_bar + close_test + brooks_scalp` 这簇里，系统还没分清：**

1. 哪些 `20-gap` 真的有有效前一次入场点（`valid_previous_entry`）
2. 哪些真的有可测试的 `close_test_target`
3. 哪些只是“形式上像 close-test”，但其实没有足够好的磁体

也就是说，下一刀应该落在：

- `valid_previous_entry`
- `close_test_target_distance_r`
- `rescue_target_distance_r`

这三个字段的组合边界上。

## 6. 下一步建议

只做一件事：

- 用正式审计脚本同时跑：
  - `F1 BTCUSDT 15m 2022`
  - `P1 BTCUSDT 5m 2022Q1`

然后只比较这几个维度：

1. `valid_previous_entry`
2. `close_test_target_distance_r`
3. `rescue_target_distance_r`
4. `market_state`
5. `signal_bar_type`

等这一步确认后，再只加一条条件，不再回到拍脑袋调阈值。
