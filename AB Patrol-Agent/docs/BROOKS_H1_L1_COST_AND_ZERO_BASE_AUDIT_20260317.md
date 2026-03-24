# H1/L1 成本口径与归零法审计报告（2026-03-17）

## 1. 目的

这份报告只做两件事：

1. 把当前系统里 `费率 / 滑点 / buffer / risk_percent / 杠杆 / 单笔成本上限` 的真实代码口径摊开。
2. 按 Brooks 的语境，说明这些口径里哪些已经合理，哪些仍然偏工程化，后面该怎么继续收。

这份报告不按“某个品种特调”展开，而是按**通用模块**审计。

---

## 2. 当前代码位置

本轮直接核对的代码位置：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- [report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py)
- [models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [trading_state.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/execution-service/src/trading_state.py)
- [__main__.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/execution-service/src/__main__.py)

本轮直接对照的 Brooks / Ali 资料：

- [H1/H2 文本页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- ![H1/H2 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)
- [Disappointed Bulls 文本页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- ![Disappointed Bulls 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [1x Actual Risk 文本页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md)
- ![1x Actual Risk 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)

---

## 3. 当前费率与滑点怎么算

### 3.1 回测侧成本模型

回测成本入口在 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)：

- `SimExchange.__init__(fee_rate=0.0004, ...)`
- `_market_cost_profile(...)`
- `_cost_rates(...)`
- `_calc_trade_leg_pnl(...)`

默认单边基础费率：

- `fee_rate = 0.0004`
- 也就是 `0.04%` 单边

但回测并不是所有市场都强行用这一档，而是按品种粗分成 4 类：

| 市场分类 | maker 费率 | taker 费率 | maker 滑点 | taker 滑点 |
| --- | ---: | ---: | ---: | ---: |
| `crypto_futures` | `0.0002` | `0.0004` | `0.00002` | `0.00008` |
| `forex_cfd` | `0.00002` | `0.00004` | `0.00001` | `0.00003` |
| `metals_cfd` | `0.00004` | `0.00007` | `0.00002` | `0.00005` |
| `index_cfd` | `0.00005` | `0.00008` | `0.00002` | `0.00005` |

换成百分比后，更直观：

### `crypto_futures`

- maker 单边成本：`(0.0002 + 0.00002) * 100 = 0.022%`
- taker 单边成本：`(0.0004 + 0.00008) * 100 = 0.048%`

典型往返：

- `STOP` 入场 + `SL` 出场：`0.048% + 0.048% = 0.096%`
- `STOP` 入场 + `TP` 出场：`0.048% + 0.022% = 0.070%`
- `LIMIT` 入场 + `TP` 出场：`0.022% + 0.022% = 0.044%`

### `forex_cfd`

- maker 单边：`0.003%`
- taker 单边：`0.007%`

### `metals_cfd`

- maker 单边：`0.006%`
- taker 单边：`0.012%`

### `index_cfd`

- maker 单边：`0.007%`
- taker 单边：`0.013%`

### 3.2 maker / taker 怎么判

当前逻辑不是按真实盘口回放，而是按执行语义近似：

- **入场**
  - `entry_type == LIMIT` 视为 `maker`
  - 其他（`STOP / MARKET`）视为 `taker`

- **出场**
  - `reason == TP` 视为 `maker`
  - `reason == PARTIAL` 且 `profit_exit_type in {full_tp, tp_after_scaleout}` 视为 `maker`
  - 其他（`SL / protective / trailing / zombie` 等）视为 `taker`

### 3.3 当前成本模型的优点与限制

优点：

- 已经不是“零成本回测”
- 已经粗分市场，不再把外汇、贵金属、加密全混成一档
- `STOP` / `LIMIT` 的成本差异已经体现

限制：

- 还没有动态点差
- 滑点不是随波动率、时段、成交方向变化，而是固定常数
- `TP=maker` 这个近似对部分市场合理，但对真实成交细节仍然偏粗

结论：

- **当前成本模型已经比早期合理很多**
- 但它仍然是“分市场粗口径”，不是实盘级逐品种逐时段成本仿真

---

## 4. 当前 buffer 怎么算

### 4.1 结构 buffer

在 [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)：

- `_structure_buffer(candles, reference_price)`

当前公式：

- 取最近 `3` 根 K 线最大振幅 `recent_range`
- `buffer = max(recent_range * 0.08, abs(reference_price) * 0.0001, 1e-9)`

翻成中文：

- 先取最近结构波动的 `8%`
- 如果太小，就至少用价格的 `0.01%`
- 绝不为 `0`

这个 `buffer` 当前主要用于：

- `major_hl_lh_stop`
- 区间边缘容差
- 突破/假突破的结构超出量容忍

### 4.2 最小波动单位

在 [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)：

- `_minimum_price_increment(candles, reference_price)`

当前逻辑：

- 从最近 `12` 根 K 线的 `open/high/low/close` 去重
- 取最小正差值作为最小波动单位
- 如果推不出来，就退回 `price * 0.0001`

这个量用于：

- `signal bar` 外一跳的 `STOP trigger`
- `target_buffer`
- `signal_bar_stop`

### 4.3 swing tolerance

在同文件：

- `_swing_tolerance(candles, reference_price)`

当前公式：

- 最近 `10` 根平均振幅 `avg_range`
- `tolerance = max(avg_range * 1.2, abs(reference_price) * 0.001)`

它主要用于：

- 双顶/双底“允许不完全相等”的结构容差

### 4.4 现在的 buffer 和 Brooks 是否一致

一致的部分：

- `STOP` 入场外一跳，和 Brooks 的“一跳验证 signal bar”一致
- 结构止损放在 `signal bar / swing / major HL-LH` 外面，本质也一致

不完全一致的部分：

- `_structure_buffer = recent_range * 0.08` 仍然偏工程化
- 它不是直接来自 Brooks 原文，而是为了把“放在结构外面一点”数值化
- `target_buffer` 当前几乎等于一个最小跳动单位，更像成交容差，不是完整的目标管理语义

结论：

- `buffer` 方向是对的
- 但部分公式仍然是“Brooks 结构语义的工程化近似”，不是原文直接给出来的数字

---

## 5. 当前 risk_percent、杠杆、单笔 1% 成本上限怎么算

这里要把**回测侧**和**执行侧**分开。

### 5.1 回测侧的 `risk_percent`

入口在 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)：

- `_signal_risk_percent(signal)`

默认值：

- 普通开仓：`0.3`
- `ADD_ON / SCALE_IN`：`0.3`
- `PYRAMID_ADD`：`0.4`

再结合 [report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py)：

- `risk_amount = equity * risk_percent / 100`
- `position_size_estimate = risk_amount / initial_risk`
- `position_notional_estimate = position_size_estimate * entry_price`
- `account_pnl_pct = r_multiple * risk_percent`

这说明：

- **当前回测的账户收益曲线，是按“风险百分比”缩放**
- **不是按 100 倍杠杆直接放大**

也就是说：

- 当前回测里，`risk_percent` 代表“单笔账户风险”
- 不是“实际使用了多少倍杠杆”

### 5.2 执行侧的杠杆与 1% 上限

执行侧入口在 [trading_state.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/execution-service/src/trading_state.py)：

- `BotAllocation.max_leverage`
- `BotAllocation.max_cost_pct_per_order = 1.0`
- `get_per_order_cost_limit(...)`
- `calculate_position_budget(...)`

关键公式：

- `max_cost = account_balance * max_cost_pct_per_order / 100`
- `max_cost_notional = max_cost * leverage`

注意这里的 `cost`：

- **当前代码里的 `max_cost_pct_per_order` 指的是保证金占用上限**
- **不是手续费成本上限**

这是一个非常重要的口径区别。

举例：

如果账户总额 `$10,000`，杠杆 `100x`，单笔上限 `1%`

那么：

- `max_cost = 10000 * 1% = $100`
- `max_notional = 100 * 100 = $10,000`

也就是：

- 你这笔单最多占用 `$100` 保证金
- 对应最多开 `$10,000` 名义仓位

### 5.3 当前默认并不是 100x

在 [trading_state.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/execution-service/src/trading_state.py) 默认配置里：

- `max_leverage = 10`

所以：

- **当前默认 bot 配置不是 100 倍**
- 如果你要按 100 倍跑，需要改 bot allocation 或下单请求里的 `leverage`

### 5.4 风险、杠杆、成本三者现在的关系

当前执行侧仓位预算是：

1. 先算风险预算  
   `risk_amount = available * actual_risk%`

2. 用止损距离折成名义仓位  
   `position_value = risk_amount / stop_percent`

3. 再同时受 3 个上限约束  
   - `max_position = available * leverage`
   - `configured_max_notional`
   - `max_cost_notional = account_balance * 1% * leverage`

最终：

- `effective_notional = min(position_value, max_position, configured_max_notional, max_cost_notional)`

这套逻辑本身是合理的。

但要注意：

- 回测里的 `risk_percent` 是风险缩放
- 执行里的 `max_cost_pct_per_order` 是保证金占用上限
- 手续费/滑点是另一套成本

这三者现在**概念上没有混在同一公式里**，但名字容易让人误解。

---

## 6. 用一个数字例子说明

假设：

- 账户可用资金：`$10,000`
- 杠杆：`100x`
- 单笔成本上限：`1%`
- `risk_percent = 0.3`
- 入场价：`100`
- 止损价：`99.5`

则：

- 止损距离：`0.5`
- `stop_percent = 0.5 / 100 = 0.5%`
- 风险金额：`10000 * 0.3% = $30`
- 按风险反推名义仓位：`30 / 0.5% = $6000`
- 保证金上限：`10000 * 1% = $100`
- 100x 对应名义上限：`$100 * 100 = $10,000`

最终：

- 这笔单按风险应开 `$6000`
- 没超过 `$10,000` 名义上限
- 所以 `effective_notional = $6000`
- 实际保证金占用约：`$6000 / 100 = $60`

这说明：

- 100x 不会自动改变策略胜率或 PF
- 它只是让同样的风险/止损结构下，你用更少保证金持有同样名义仓位

---

## 7. 从 Brooks 语境看，哪些地方已经合理

### 7.1 已经合理的部分

1. `STOP trigger`
   - `signal bar` 外一跳
   - 只有真实触发才进场

2. `actual risk`
   - 已经和 [1x Actual Risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md) 的语义一致

3. first-entry 的期望分层
   - 已经开始区分：
     - `rescue_target`
     - `close_test_target`
     - `swing_target`

4. 弱 setup 的降级
   - 已经有：
     - `no-trade`
     - `scalp_only`
     - `fade_candidate`

### 7.2 这些说明了什么

说明当前系统已经不是“单一策略独立死跑”，而是：

- 背景
- setup
- signal bar
- `STOP`
- risk
- target
- 管理风格

这一整条 Brooks 主链。

---

## 8. 还没完全对齐 Brooks 的地方

### 8.1 `max_cost_pct_per_order` 命名容易误导

当前它表示的是：

- **保证金占用上限**

不是：

- 手续费成本上限

这个名字会让人误以为“单笔交易成本最多占账户 1%”，其实不是。

更准确的语义应该是：

- `max_margin_pct_per_order`
- 或 `max_capital_cost_pct_per_order`

### 8.2 回测侧没有真正把杠杆压进权益曲线逻辑

当前回测账户曲线看的是：

- `risk_percent`
- `r_multiple`

不是：

- 杠杆后的保证金占用
- 追加保证金压力
- 强平风险

所以当前回测更像“策略边际 + 风险缩放”评估，不是完整的合约资金曲线模拟。

### 8.3 `buffer` 仍有工程化成分

现在的 `_structure_buffer`、`_swing_tolerance` 方向是对的，但数值仍然是：

- 结构语义的工程近似

而不是 Brooks 原文直接给出的固定比例。

### 8.4 5m 的成本与空间问题仍在放大

`5m` 上更容易出现：

- 目标太近
- follow-through 太差
- `broad_range / weak trend`
- 看起来 hit 了 `TP`，但净利润很薄

这不是 5m 理论不同，而是：

- 同一套 Brooks 规则，在更短周期上需要更严格地检查
  - 是否有空间
  - 是否有 valid previous entry / highest close test
  - 是否只能当 scalp

---

## 9. 归零法结论

### 9.1 当前最大的好消息

我们现在已经能明确说：

- 费率、滑点、buffer、risk、杠杆不是完全没建模
- 系统也不是只会“识别信号然后机械开单”
- `H1/L1` 已经开始具备 Brooks 式的：
  - first-entry 试单
  - close-test/rescue target
  - weak setup 降级

### 9.2 当前最大的未完成项

1. 需要把“成本”这个词拆开  
   - 手续费/滑点成本
   - 保证金占用成本

2. 需要在回测里决定：
   - 是否继续只看 `risk_percent` 曲线
   - 还是引入更完整的保证金/杠杆层

3. `buffer` 仍需继续按策略模板细化  
   - 不是统一一套公式打全系统

4. `H1/L1` 还要继续收：
   - valid previous entry
   - highest close / lowest close
   - rescue target
   - weak 5m 背景的 no-trade / scalp / fade

---

## 10. 建议的下一步

按优先级：

1. **先统一术语**
   - 把执行侧 `max_cost_pct_per_order` 在文档和接口解释里明确为“保证金占用上限”

2. **回测报告新增两套成本摘要**
   - 交易成本：手续费 + 滑点
   - 资金占用：杠杆后保证金占用

3. **继续沿 H1/L1 深挖**
   - 把 `rescue_target / close_test_target / swing_target` 模块彻底做稳
   - 然后再复制到 `H2/L2`、突破回调、gap 族

4. **补 5m 扩展验证**
   - `BTC / ETH / BNB / SOL`
   - 多季度
   - 继续只看单策略，不混全系统噪音

---

## 11. 一句话结论

当前系统里的费率、滑点、buffer、risk、杠杆口径已经足够支撑“继续往 Brooks 对齐”，不是一片空白；但它们还没完全统一成一套清晰术语，尤其 `交易成本` 和 `保证金占用成本` 还容易混淆。下一阶段最重要的不是再乱加过滤，而是把这套成本/风险/目标层级彻底说清并固化，再继续把 `H1/L1` 打稳。
