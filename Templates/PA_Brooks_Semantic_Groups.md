---
categories:
  - 模版
tags:
  - PA
---

# 🧭 Brooks 语义分组底稿 (Semantic Groups)

说明：

- 这是“分组阶段”的底稿：把 **属性（字段）** 与 **术语标签（#PA/Term/\*）** 按 Brooks 语义归类。
- 术语清单来源：`Templates/PA_Brooks_Term_Tags_Preset.md`；属性清单来源：`Templates/PA_Properties_Inventory.md`。
- 规则：先自动分组，后续你可以手工把少数边界项挪到更合适的组。

## 1) 属性（字段）按 Brooks 语义分组

### 市场背景 (Context)

| field        | type        | options(若有)                                                                                                                                    |
| ------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| direction    | Select      | 做多 (Long)<br>做空 (Short)                                                                                                                      |
| always_in    | Select      | 总是多头 (Always In Long)<br>总是空头 (Always In Short)<br>中性/不确定 (Neutral)                                                                 |
| day_type     | Select      | 趋势日 (Trend Day)<br>交易区间日/TRD (Trading Range Day)<br>趋势交易区间日/TTRD (Trend From Trading Range Day)<br>极速与通道 (Spike and Channel) |
| market_cycle | MultiSelect | 强趋势 (Strong Trend)<br>弱趋势 (Weak Trend)<br>交易区间 (Trading Range)<br>突破模式 (Breakout Mode)                                             |
| ticker       | Select      | NQ (纳指)<br>ES (标普)<br>BTC (比特币)<br>GC (黄金)<br>CL (原油)                                                                                 |
| timeframe    | Select      | 1m<br>5m<br>15m<br>1H<br>4H<br>Daily                                                                                                             |

### 形态与信号 (Setup & Signal)

| field              | type        | options(若有)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| patterns_observed  | MultiSelect | 20 均线缺口 (20 EMA Gap)<br>第一均线缺口 (First MA Gap)<br>收线追进 (Trend Bar Entry)<br>过度延伸 (Overextended)<br>楔形顶底 (Wedge Top/Bottom)<br>双顶双底 (Double Top/Bottom)<br>末端旗形 (Terminal Flag)<br>急赴磁体 (Rush to Magnet)<br>高 1/低 1 (High 1/Low 1)<br>看衰突破 (Failed Breakout)<br>强趋势通道 (Strong Trend Channel)<br>区间突破回调 (Breakout Pullback)<br>突破缺口 (Breakout Gap)<br>急速上涨下跌 (Spike Up/Down)<br>三角形区间 (Triangle)<br>头肩顶底 (Head & Shoulders)<br>高潮式反转 (Climactic Reversal)<br>测量移动 (Measured Move) |
| setup_category     | Select      | 趋势突破 (Trend Breakout)<br>趋势回调 (Trend Pullback)<br>趋势反转 (Reversal)<br>区间逆势 (TR Fade)                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| signal_bar_quality | MultiSelect | 强阳收盘 (Strong Bull Close)<br>强阴收盘 (Strong Bear Close)<br>弱势/长影线 (Weak / Tail)<br>十字星 (Doji)<br>顺势 K 线 (Trend Bar)<br>强趋势 K 线 (Strong Trend Bar)<br>反转 K 线 (Reversal Bar)<br>强反转 K 线 (Strong Reversal Bar)<br>内包 K 线 (ib / Inside Bar)<br>连续内包 (ii / Consecutive Inside Bars)<br>三连内包 (Three Inside Bars)<br>外包夹内包 (ioi / Inside-Outside-Inside)<br>外包 K 线 (Outside Bar)                                                                                                                                       |
| strategy_status    | Select      | 学习中 (Learning)<br>实战中 (Active)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| studied            | Select      | true<br>false                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| strategy_name      | Select      | 20 均线缺口 (20 EMA Gap)<br>第一均线缺口 (First MA Gap)<br>极速与通道 (Spike and Channel)<br>急赴磁体 (Rush to Magnet)<br>看衰突破 (Fade Breakout)<br>末端旗形 (Final Flag)<br>高 1/低 1 (High 1/Low 1)<br>区间突破回调 (Breakout Pullback)<br>收线追进 (Buy/Sell NOW)<br>双顶双底 (Double Top/Bottom)<br>楔形顶底 (Wedge Top/Bottom)                                                                                                                                                                                                                         |

### 入场与风险计划 (Entry & Risk Plan)

| field           | type   | options(若有)                                                                                                 |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| management_plan | Select | 一次性下单/不管理 (Set & Forget)<br>移动止损跟踪 (Trailing)<br>分批/加减仓 (Scale)<br>平手/止损离场 (Scratch) |
| probability     | Select | P1-低 (Low)<br>P2-中 (Medium)<br>P3-高 (High)                                                                 |
| confidence      | Select | 1 (Low)<br>2 (Medium)<br>3 (High)                                                                             |
| entry_price     | Number |                                                                                                               |
| initial_risk    | Number |                                                                                                               |
| order_type      | Select | 突破入场 (Stop Entry)<br>限价入场 (Limit Entry)<br>市价入场 (Market Entry)                                    |
| risk_reward     | Number |                                                                                                               |
| stop_loss       | Number |                                                                                                               |
| take_profit     | Number |                                                                                                               |

### 结果与复盘 (Outcome & Review)

| field             | type   | options(若有)                                                                                                                                                        |
| ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| execution_quality | Select | 🟢 完美执行 (Perfect)<br>🟡 主动离场/避险 (Valid Scratch)<br>🔴 恐慌平仓 (Panic Exit)<br>🔴 追涨杀跌 (FOMO)<br>🔴 扛单/不止损 (No Stop)<br>🔴 过度交易 (Overtrading) |
| missed_reason     | Select | 犹豫不决 (Hesitation)<br>没在电脑前 (Away)<br>点差过大 (Spread)<br>信号不清晰 (Unclear Signal)<br>逆势操作 (Counter Trend)                                           |
| net_profit        | Number |                                                                                                                                                                      |
| outcome           | Select | 止盈 (Win)<br>止损 (Loss)<br>保本/平手 (Scratch)                                                                                                                     |
| review_depth      | Select | 1-快速回顾 (Quick)<br>2-深度分析 (Deep)<br>3-写入 Playbook (Playbook)                                                                                                |

### 账户与执行环境 (Account & Environment)

| field        | type   | options(若有)                                 |
| ------------ | ------ | --------------------------------------------- |
| account_type | Select | 实盘 (Live)<br>模拟 (Demo)<br>回测 (Backtest) |

### 交易风格 (Trading Style)

| field           | type   | options(若有)                  |
| --------------- | ------ | ------------------------------ |
| trader_equation | Select | 波段 (Swing)<br>剥头皮 (Scalp) |

