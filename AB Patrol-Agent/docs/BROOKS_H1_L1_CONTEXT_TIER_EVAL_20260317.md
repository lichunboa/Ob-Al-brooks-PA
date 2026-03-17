# H1/L1 上下文分层模块复盘

更新时间：2026-03-17

## 一、本轮目标

这轮只做一件事：

- 把 `valid previous entry / highest-close-lowest-close / rescue target`
  做成真正的 `H1/L1` 上下文分层模块；
- 不做任何 `5m`、`15m`、`BTC`、`ETH` 的特调；
- 规则必须可以迁移到后续 `H2/L2`、突破回调和 gap 族。

本轮采用的分层语义：

- 强背景：优先 `swing / router`
- 中等背景：优先 `close-test`
- 弱背景：优先 `rescue`

另外补了一条和 Brooks 区间语义一致的通用规则：

- `double broad range + weak trend bar continuation`
  更像 `no-trade / fade`，
  不再继续按 continuation 放过。

## 二、理论依据

本轮继续只按知识库里的原文和案例，不引入新的工程化阈值来源。

主要对照：

- [H1/H2 文本页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- ![H1/H2 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)
- [Disappointed Bulls / Buy More Lower](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- ![Disappointed Bulls 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [Ali Flash Cards 16](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0016.md)
- ![Ali 16 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0016.jpg)
- [Ali Flash Cards 73](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0073.md)
- ![Ali 73 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0073.jpg)
- [1x Actual Risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md)
- ![1x Actual Risk 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)

本轮采用的 Brooks 语义：

1. `first entry` 并不天然等于 `continuation swing`
2. 有效的前一次入场点/最高收盘/最低收盘，才能支持 `close-test`
3. 弱背景 first entry 更像：
   - `rescue`
   - `BE`
   - `small scalp`
4. `trading range` 里的弱 `trend bar continuation`
   本来就常常更像 `no-trade / fade`

## 三、代码改动

核心文件：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py)

### 3.1 新增 `H1/L1 context tier`

现在 `H1/L1` 会先做统一分层：

- `strong`
- `medium`
- `weak`

分层输入不再只看一个字段，而是一起看：

- `setup_valid`
- `setup_clear_trend_leg`
- `setup_first_pullback_shape`
- `setup_still_trend_side`
- `follow_through / higher_follow_through`
- `acceptance_ready / reclaimed_prior_close`
- `trendline_break_confirmed`
- `market_state / higher_market_state`
- `signal_bar_type`

### 3.2 新增 `valid_previous_entry`

现在只有满足下面这类条件时，才把 `close-test` 当成有效目标：

- 仍在趋势一侧
- 有结构确认或接受确认
- 当前周期或更大一级有同向背景支持
- 不是 `double broad range`

也就是说：

- `highest close / lowest close`
  不再被无差别拿来当弱背景的第一目标。

### 3.3 新增 `double broad range weak trend-bar` 过滤

对于：

- 当前周期 `broad_range`
- 更大一级也 `broad_range`
- 信号棒是弱 `trend_bar`
- 且没有 `acceptance / reclaimed prior close / FT`

现在会优先：

- `no-trade`
- 或继续进入 `fade_candidate`

不再默认当成可交易 continuation。

### 3.4 透传修复

本轮把这些字段真正打通到了成交单和报告里：

- `first_target`
- `first_target_type`
- `valid_previous_entry`
- `h1_l1_context_tier`

这样后面再拆差样本时，不会只看到 `effective_target`，而看不到真正的目标层级来源。

## 四、回测结果

### 4.1 fixed 对照

当前基线：

- 文件：[/tmp/h1l1_setup_fixed_current_20260317.json](/tmp/h1l1_setup_fixed_current_20260317.json)
- 总交易：`23`
- 胜率：`60.87%`
- 平均 PF：`6.825`
- 日均：`0.247`

本轮 `v14`：

- 文件：[/tmp/h1l1_setup_fixed_20260317_v14.json](/tmp/h1l1_setup_fixed_20260317_v14.json)
- 总交易：`22`
- 胜率：`63.64%`
- 平均 PF：`6.916`
- 日均：`0.237`

结论：

- fixed 小幅正向
- 强背景 `15m` 没被伤到

### 4.2 random 对照

当前基线：

- 文件：[/tmp/h1l1_setup_random_current_20260317.json](/tmp/h1l1_setup_random_current_20260317.json)
- 总交易：`22`
- 胜率：`59.09%`

本轮 `v14`：

- 文件：[/tmp/h1l1_setup_random_20260317_v14.json](/tmp/h1l1_setup_random_20260317_v14.json)
- 总交易：`21`
- 胜率：`61.90%`

说明：

- `random` 的平均 PF 仍然会被 `BNB 15m` 这类极端值拉歪
- 更可信的信号是：
  - `BTC 5m 2024Q3`：`PF 0.361 -> 0.636`
  - `SOL 15m 2025Q3`：`PF 11.134 -> 15.002`
  - `ETH 15m 2024Q2`：持平

### 4.3 5m 压力测试

当前基线：

- 文件：[/tmp/h1l1_setup_stress5m_current_20260317.json](/tmp/h1l1_setup_stress5m_current_20260317.json)
- 总交易：`93`
- 胜率：`39.78%`
- 平均 PF：`1.392`
- 日均：`0.429`

本轮 `v14`：

- 文件：[/tmp/h1l1_setup_stress5m_with_trades_20260317_v14.json](/tmp/h1l1_setup_stress5m_with_trades_20260317_v14.json)
- 总交易：`79`
- 胜率：`44.30%`
- 平均 PF：`1.552`
- 日均：`0.364`
- 聚合 `gross PF`：`1.313`

场景变化：

- `P1_BTC_5m_2022Q1`：`PF 2.661 -> 2.647`，基本持平
- `P2_BTC_5m_2024Q1`：`PF 0.189 -> 0.011`，明显变差
- `P3_BTC_5m_2024Q3`：`PF 0.361 -> 0.636`，改善
- `P4_ETH_5m_2022Q1`：`PF 3.931 -> 3.568`，小幅回落
- `P5_ETH_5m_2024Q3`：`PF 0.179 -> 0.216`，略改善但仍弱
- `P6_BNB_5m_2024Q3`：`PF 1.927 -> 2.427`，改善
- `P7_SOL_5m_2025Q3`：`PF 0.494 -> 1.356`，明显改善

## 五、这轮说明了什么

### 5.1 可以确认成立的

1. 这轮改动不是 `5m` 特调。  
   它修的是：
   - `double broad range weak continuation`
   - `valid previous entry`
   - `close-test / rescue / swing`
   这些都是跨周期、跨品种的 Brooks 通用问题。

2. `H1/L1` 仍然是可盈利模块。  
   而且现在不只是 `15m`，`5m` 压力组整体也已经站上 `gross PF 1`。

3. 透传链更完整了。  
   后面继续拆差样本时，不会再卡在“看不到 first target / context tier”。

### 5.2 仍未收官的

1. `P2_BTC_5m_2024Q1` 明显变差，说明这轮新规则对某些弱背景仍然有误伤。
2. `P5_ETH_5m_2024Q3` 虽然略有改善，但还远没收官。
3. `valid_previous_entry` 目前在 `5m` 压力样本里几乎没有真正放出来，
   说明这条条件链现在仍偏严。

## 六、当前判断

这轮不是完美收官，但已经足够说明：

- 优化空间仍然存在；
- 方向必须继续走 Brooks 的上下文分层；
- 不是简单“所有弱背景都不做”；
- 而是继续把弱背景细分成：
  - `no-trade`
  - `fade`
  - `rescue / scalp`

## 七、下一步建议

下一轮如果继续，最值的不是再碰 `STOP trigger`，也不是再加成本硬门槛，而是：

1. 放松 `valid_previous_entry` 的条件链  
   让真正有 `previous entry / highest-close-lowest-close` 语义的中等背景单被识别出来。

2. 专门复盘 `P2_BTC_5m_2024Q1`  
   因为这轮它是最明显的反例。

3. 等 `H1/L1` 最后一层站稳，再把现在成熟的共用模块扩到：
   - `H2/L2`
   - 突破回调
   - `20均线缺口 / 第一均线缺口 / MAG`
