# H1/L1 字段透传与 Protective 路径复盘

日期：2026-03-17

## 1. 本轮目标

这轮只做两件事：

1. 补齐 `H1/L1 detector -> pending order -> trade -> report` 的结构字段与 first-entry 管理意图透传。
2. 针对 `BTC 5m 2024Q3` 暴露出的 `protective_stop_exit` 共性路径，按 Brooks 语义收紧弱结构 `H1/L1` 的 `tr_scalp_protect`。

核心要求：

- 不按某个品种、某个时间周期特调。
- 所有改动都必须能回到 Brooks 语义：
  - `signal bar`
  - 外一跳 `STOP`
  - `1x actual risk`
  - `first entry` 优先 `partial / BE / 小 runner`
  - 弱结构在区间/弱趋势里更像 `scratch / scalp`

## 2. 这轮真正修到的关键问题

### 2.1 之前的隐藏断点

`H1/L1` 大多数成交都是 `STOP` 挂单成交，而不是当根 K 线直接入场。

之前虽然在 detector 里已经写了：

- `management_template = "h1_l1_first_entry"`
- `first_entry_signal = True`
- `first_profit_at_1x_actual_risk`
- `allow_be_after_first_target`
- `prefer_partial_over_full_swing`
- `allow_small_runner`
- `handoff_to_h2_l2_if_failed`
- `prefer_lower_entry_be_rescue`
- `disappointed_bull_bear_mode`

但这些字段在 `PendingOrder -> signal_stub.extra` 这层没有完整透传，导致：

- detector 侧看起来像 `H1/L1 first-entry`
- 成交后的 trade 却未必真按 `H1/L1 first-entry` 管理

这就是本轮最重要的修复点。

### 2.2 现在已经确认透传成功

当前用 `BTCUSDT 15m 2022-01-24 ~ 2022-02-23` 抽查成交单，已经能看到：

- `management_template = "h1_l1_first_entry"`
- `first_entry_signal = True`
- `first_profit_at_1x_actual_risk = True/False`
- `allow_be_after_first_target = True`
- `prefer_partial_over_full_swing = True`
- `handoff_to_h2_l2_if_failed = True`
- `prefer_lower_entry_be_rescue = True`
- `disappointed_bull_bear_mode = True`
- `runner_handoff_stop`
- `runner_handoff_stop_type`

这说明 `STOP` 成交路径上的 first-entry 语义已经真正进入回测执行层。

## 3. 代码改动

### 3.1 字段透传

涉及文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py`

新增/透传的核心字段：

- `management_template`
- `first_entry_signal`
- `first_profit_at_1x_actual_risk`
- `allow_be_after_first_target`
- `prefer_partial_over_full_swing`
- `allow_small_runner`
- `handoff_to_h2_l2_if_failed`
- `prefer_lower_entry_be_rescue`
- `first_target_is_close_test`
- `disappointed_bull_bear_mode`
- `exit_on_failed_follow_through`
- `exit_on_return_to_range`
- `exit_on_major_channel_break`
- `runner_handoff_stop`
- `runner_handoff_stop_type`

### 3.2 Protective 路径

涉及文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`

新增逻辑：

- `_weak_h1_l1_tr_scalp_structure(trade)`

它识别的是：

- `高1/低1`
- 落在 `broad_range / tight_range / weak_trend / bc / tr_* route`
- 且 `setup_valid`、`setup_clear_trend_leg`、`setup_first_pullback_shape` 之一失效
- 或 pullback 太深 / overlap 太重

这类结构不再按“正常趋势恢复 swing”去期望，而更接近 Brooks 的：

- 弱趋势 / 区间里的 first-entry
- 容易退化成 `scratch / scalp`

## 4. 回测结果

### 4.1 口径

只看 `H1/L1` 单策略，不混其他策略。

固定窗口：

- `BTCUSDT 15m 2022-01-24 ~ 2022-02-23`
- `BTCUSDT 5m 2024-08-10 ~ 2024-09-09`
- `ETHUSDT 15m 2024-05-15 ~ 2024-06-14`

随机窗口：

- `BTCUSDT 5m 2024Q3`
- `ETHUSDT 15m 2024Q2`
- `BNBUSDT 15m 2023Q4`
- `SOLUSDT 15m 2025Q3`

### 4.2 相对最早 H1/L1 基线

对比：

- fixed 基线：`/tmp/h1l1_setup_fixed_20260317_summary.json`
- random 基线：`/tmp/h1l1_setup_random_20260317.json`
- 当前 fixed：`/tmp/h1l1_setup_fixed_20260317_v4.json`
- 当前 random：`/tmp/h1l1_setup_random_20260317_v4.json`

结果：

- fixed
  - 总交易：`29 -> 29`
  - 加权胜率：`27.59% -> 31.03%`
  - 场景平均 PF：`1.353 -> 1.284`
  - 平均日频：`0.312 -> 0.312`

- random
  - 总交易：`31 -> 31`
  - 加权胜率：`29.03% -> 29.03%`
  - 场景平均 PF：`1.323 -> 1.072`
  - 平均日频：`0.250 -> 0.250`

### 4.3 相对上一轮 v3

对比：

- fixed v3：`/tmp/h1l1_setup_fixed_20260317_v3.json`
- random v3：`/tmp/h1l1_setup_random_20260317_v3.json`

结果：

- fixed：`PF 1.308 -> 1.284`
- random：`PF 1.120 -> 1.072`

也就是：

- 这轮“字段透传 + 弱结构 protective 收口”后，`H1/L1` 单策略仍然整体为正 PF。
- 但作为优化增量，它不是当前最优版本。

## 5. 最重要的分场景结论

### 5.1 BTCUSDT 15m 2022

- `PF 3.019 -> 3.180`
- `win_rate 50% -> 60%`

说明：

- `H1/L1 first-entry` 语义真正落到执行层后，在更标准的趋势恢复背景里是正向的。

### 5.2 BTCUSDT 5m 2024Q3

- `PF 0.509 -> 0.533`
- 胜率不变，仍然很低

说明：

- 弱结构 `tr_scalp_protect` 的收口方向是对的
- 但还不够，主问题仍在更早一层：
  - 这批单本身更像弱趋势/区间里的 first-entry 试单
  - 不是 detector 完全错误，而是语义仍然偏弱

### 5.3 ETHUSDT 15m 2024Q2

- `PF 0.532 -> 0.140`

这组是本轮最差拖累。

逐笔拆解后可见：

- 多数 trade 仍是 `management_style = brooks_swing`
- 但 `setup_valid = False`
- 且 `management_reason = WEAK_SCALP`
- 说明这类单子已经不是“标准 first-entry continuation”
- 却仍然有一部分被归在偏 swing 的路由里

这说明下一步最值的，不是再继续改 `protective_scalp`，而是回到更早一层：

- 为什么这类 `setup_valid = False` 的 `H1/L1` 还会进入 `brooks_swing`
- 也就是 `setup -> route_style / management_style` 这一层还没完全对齐 Brooks

## 6. 当前判断

### 6.1 可以确认的

- `H1/L1` 这条路是通的。
- `STOP trigger` 不该回退。
- detector 里 first-entry 管理语义，之前确实在挂单成交路径丢过一次。
- 这轮透传修复是“正确性修复”，不是纯粹调参。

### 6.2 不能直接宣称完成的

- 这轮不是当前最优增量。
- `protective_stop_exit` 的共性问题还没有彻底解决。
- 尤其 `ETH 15m 2024Q2` 说明：更大的问题可能已经上移到
  - `setup_valid`
  - `route_style`
  - `management_style`
  的映射关系，而不只是 `protective_scalp` 的细节。

## 7. 下一步建议

下一步不该继续只打 `protective_stop`，而应该直接查：

1. `setup_valid=False` 的 `H1/L1` 为什么还会进入偏 swing 的管理模板。
2. `broad_range / weak_trend` 下的 `H1/L1`，哪些本质上应该视为 `tr_scalp`，哪些应该直接不做。
3. `ETH 15m 2024Q2` 这 4 笔单子，逐笔回到 Brooks 资料做案例对照。

一句话：

这轮最大的收获，不是 PF 抬了多少，而是终于确认了 **`STOP` 成交路径曾经把 H1/L1 的 first-entry 管理语义丢掉**。这条链现在已经打通，后面才有资格继续精调。 
