# H1/L1 单策略 Fixed / Random 验证报告

更新时间：2026-03-17

## 1. 目的

本轮不再看全策略总和，只看 `高1/低1` 单策略：

1. 判断 `H1/L1 setup` 的结构确认改造是否本身有效
2. 避免被 `H2/L2`、`突破回调`、`gap` 等别的策略噪音稀释
3. 明确 `H1/L1` 自己在哪些场景盈利、哪些场景亏损

## 2. 本轮验证口径

- 策略白名单：`高1,低1`
- 管理模板：`brooks_pdf`
- 手续费：`0.0004`
- 数据目录：`AB Patrol-Agent/data/history/hf_parquet`

结果文件：

- Fixed 汇总：
  - [/tmp/h1l1_setup_fixed_20260317_summary.json](/tmp/h1l1_setup_fixed_20260317_summary.json)
- Random 汇总：
  - [/tmp/h1l1_setup_random_20260317.json](/tmp/h1l1_setup_random_20260317.json)
- 单场景：
  - [/tmp/h1l1_setup_f1_20260317.json](/tmp/h1l1_setup_f1_20260317.json)
  - [/tmp/h1l1_setup_f2_20260317.json](/tmp/h1l1_setup_f2_20260317.json)
  - [/tmp/h1l1_setup_f3_20260317.json](/tmp/h1l1_setup_f3_20260317.json)
- 逐笔明细：
  - [/tmp/h1l1_btc_5m_2024q3_trades_20260317.json](/tmp/h1l1_btc_5m_2024q3_trades_20260317.json)

## 3. 总结果

### 3.1 Fixed 3

- 总交易：`29`
- 加权胜率：`27.59%`
- 场景平均 PF：`1.3532`
- 平均日频：`0.3118`
- `高1` 总交易：`13`
- `低1` 总交易：`16`

### 3.2 Random 4

- 总交易：`31`
- 加权胜率：`29.03%`
- 场景平均 PF：`1.3234`
- 平均日频：`0.25`
- `高1` 总交易：`17`
- `低1` 总交易：`14`

## 4. 分场景结果

### 4.1 Fixed

1. `F1_BTC_15m_2022`
   - 交易：`10`
   - 胜率：`50.0%`
   - PF：`3.0194`
   - `高1=5`，`低1=5`

2. `F2_BTC_5m_2024Q3`
   - 交易：`15`
   - 胜率：`13.33%`
   - PF：`0.5088`
   - `高1=6`，`低1=9`

3. `F3_ETH_15m_2024Q2`
   - 交易：`4`
   - 胜率：`25.0%`
   - PF：`0.5315`
   - `高1=2`，`低1=2`

### 4.2 Random

1. `R1_BTC_5m_2024Q3`
   - 交易：`15`
   - 胜率：`13.33%`
   - PF：`0.5088`
   - `高1=6`，`低1=9`

2. `R2_ETH_15m_2024Q2`
   - 交易：`4`
   - 胜率：`25.0%`
   - PF：`0.5315`
   - `高1=2`，`低1=2`

3. `R3_BNB_15m_2023Q4`
   - 交易：`7`
   - 胜率：`42.86%`
   - PF：`3.3299`
   - `高1=5`，`低1=2`

4. `R4_SOL_15m_2025Q3`
   - 交易：`5`
   - 胜率：`60.0%`
   - PF：`0.9232`
   - `高1=4`，`低1=1`

## 5. 结论

### 5.1 这轮最重要的正结论

`H1/L1 setup` 结构确认改造这条路是通的。

不是所有窗口都好，但至少说明：

- `H1/L1` 本身不是天然亏损策略
- 在部分 15m 场景里，这套实现已经可以稳定盈利
- 单策略口径下，fixed / random 两组汇总的平均 PF 都已经大于 `1`

### 5.2 当前最大拖累

最差窗口非常集中：

- `BTCUSDT 5m 2024Q3`
- `ETHUSDT 15m 2024Q2`

也就是说，当前不是 `H1/L1` 整体都不行，而是：

- 有些背景里已经明显对齐 Brooks
- 有些背景里 detector + 管理仍然不够对齐

## 6. BTC 5m 2024Q3 逐笔拆解

逐笔文件：

- [/tmp/h1l1_btc_5m_2024q3_trades_20260317.json](/tmp/h1l1_btc_5m_2024q3_trades_20260317.json)

### 6.1 统计

- 总交易：`15`
- 结果：`LOSS=13`，`WIN=2`
- 退出原因：
  - `SL=10`
  - `TP=3`
  - `SCALP=2`
- 管理状态：
  - `protective_scalp=9`
  - `normal=6`
- trailing 退出类型：
  - `protective_stop=7`
  - `runner_trailing=1`

### 6.2 说明

这组最关键的结论不是“没信号”，而是：

1. `H1/L1` 在 5m 弱背景里，很多单很快退化成 `protective_scalp -> protective_stop`
2. 真正跑成 `runner_trailing` 的很少
3. 也就是说，当前最大的拖累不只是 detector，而是 first-entry 后续管理仍然不够对齐 Brooks

## 7. 还暴露出的一个实现问题

当前成交记录里，这些字段仍然是空的：

- `signal_bar_type`
- `stop_type`
- `actual_risk`
- `setup_valid`
- `setup_clear_trend_leg`
- `setup_first_pullback_shape`

这不代表 detector 没算，而是说明：

- detector 里塞进 `extra` 的 H1/L1 结构信息
- 还没有完整透传到回测成交记录

这会直接影响后续排查效率，因为我们没法从成交明细里直接看到：

- 这是哪种 signal bar
- 用的是哪种 stop
- setup 当时被判成了什么结构

## 8. 当前判断

现在最合理的判断是：

1. 不回退 `STOP trigger`
2. 不回退新的 `H1/L1 setup` 结构确认方向
3. 下一步优先做两件事：
   - 把 detector 的结构字段完整透传到 trade 记录
   - 单独修 `BTC 5m 2024Q3` 里 `protective_stop` 过大的问题

## 9. 下一步建议

1. 先补 `H1/L1` detector -> trade 明细透传
2. 再针对 `BTC 5m 2024Q3` 拆：
   - `高1` vs `低1`
   - `protective_stop`
   - `signal bar` 类型
   - `stop_type`
3. 然后再决定是继续修 detector，还是先修 first-entry 管理
