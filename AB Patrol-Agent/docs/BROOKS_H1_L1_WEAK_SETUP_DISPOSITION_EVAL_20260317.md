# H1/L1 弱 Setup 分流与最低净目标门槛复盘

## 1. 这轮改了什么

这轮只改 `H1/L1` 的两条通用规则，位置在：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`

目标不是按单一品种或单一周期特调，而是把弱 `H1/L1` 在所有市场里都共用的一层 Brooks 语义补齐：

1. 弱 `H1/L1` 的 `no-trade / scalp-only / fade-candidate` 分流更明确
2. 弱 `H1/L1` 加入“最低净目标门槛”，第一目标近到覆盖不了成本时，不再继续当 continuation 单

## 2. 对齐的 Brooks 语义

这轮直接对照了：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0073.md`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0588.md`

对应页图：

![H1/H2](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

![Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)

![Ali 73](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0073.jpg)

![Ali 588](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0588.jpg)

本轮采用的 Brooks 语义是：

- 弱 `H1/L1` 不该继续按正常 swing continuation 去拿
- 区间/弱趋势里的 `H1/L1`，很多更像 `TR scalp`，甚至应该 `no-trade / fade`
- 如果第一目标近到连成本都覆盖不了，即使命中 TP，也可能净亏；这类 setup 不该继续按 continuation 放过
- 单独的 `trendline break` 在 TR/弱趋势里不够，不能因为它出现就默认 continuation 成立

## 3. 实现要点

### 3.1 最低净目标门槛

新增了按市场粗分类的成本模型：

- `crypto_futures`
- `forex_cfd`
- `metals_cfd`
- `index_cfd`

并把往返成本换算成最小净目标的 `R`：

- `_market_cost_profile()`
- `_estimated_round_trip_cost_rate()`
- `_minimum_net_target_distance_r()`

### 3.2 弱 H1/L1 的分流

当前分成三类：

- `fade_candidate`
  - 错误半区 / 明显 TR 弱背景 / 深重叠 / 净目标也不够
  - 当前系统没有单独 fade 执行器，所以先按 `no-trade`
- `no_trade_too_close`
  - 第一目标小于覆盖成本所需的最小净目标
- `scalp_only`
  - 仍可交易，但不再当 continuation swing 管
  - 直接强制改走 `brooks_tr_blshs / brooks_scalp`

### 3.3 关键修正

这轮真正起作用的点是：

- `scalp_only` 不再只是写标签，而是通过 `management_style_override` 真正改写后续管理模板
- `trendline_break_confirmed=True` 但缺少：
  - `follow_through`
  - `higher_follow_through`
  - `acceptance_ready`
  - `reclaimed_prior_close`

  这种只靠 `TLB` 支撑的弱 `H1/L1`，仍然会被视为弱 continuation，不再因为“有 TLB”就直接放过

## 4. 回测结果

### 4.1 只看最差样本：BTCUSDT 5m 2024Q3

旧版 `v5`：

- 交易：`15`
- 胜率：`13.33%`
- PF：`0.215`

本轮 `v8`：

- 交易：`6`
- 胜率：`33.33%`
- PF：`0.502`

结论：

- 还没有盈利
- 但这轮确实把最差那批弱 `H1/L1` 砍掉了
- 这是明确的正方向，不是偶然波动

### 4.2 fixed 3 窗口（H1/L1 单策略）

`v5 -> v8`

- 总交易：`33 -> 20`
- 加权胜率：`36.36% -> 60.00%`
- 平均 PF：`4.416 -> 4.744`
- 平均日频：`0.355 -> 0.215`

### 4.3 random 4 窗口（H1/L1 单策略）

`v5 -> v8`

- 总交易：`37 -> 22`
- 加权胜率：`37.84% -> 59.09%`
- 平均 PF：`5.617 -> 6.562`
- 平均日频：`0.298 -> 0.177`

结果文件：

- `/tmp/h1l1_setup_F1_20260317_v7.json`
- `/tmp/h1l1_setup_F2_20260317_v8.json`
- `/tmp/h1l1_setup_F3_20260317_v8.json`
- `/tmp/h1l1_setup_R3_20260317_v8.json`
- `/tmp/h1l1_setup_R4_20260317_v8.json`
- `/tmp/h1l1_setup_compare_v8_20260317.json`

## 5. 这轮说明了什么

这轮最重要的不是“PF 变高了多少”，而是：

1. `H1/L1` 这条路继续成立，不能回退
2. 弱 `H1/L1` 的通用分流规则确实能改善跨场景结果
3. `BTC 5m 2024Q3` 这种差样本，不是“这个周期特例”，而是把所有市场里都会出现的弱 continuation 问题暴露出来
4. 但当前 `H1/L1` 还没到“频率、胜率、PF 全部平衡”的状态

## 6. 剩余问题

当前仍然没彻底解决的主要是：

- 弱 `H1/L1` 里哪些该 `fade`，当前系统还只能先 `no-trade`
- `signal bar` 类型学仍有继续细化空间
- `first-entry` 后续管理虽然已经更像 Brooks，但在弱背景里仍可能过早掉进 `protective_stop / protective_scalp`

## 7. 下一步建议

继续只打 `H1/L1`，顺序建议：

1. 继续拆弱 `H1/L1` 的 `fade-candidate`
2. 复查 `signal_bar` 的弱 bar 放行边界
3. 再看 `first-entry -> lower buy / higher sell rescue` 的后续管理
