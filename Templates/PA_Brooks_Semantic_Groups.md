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

## 2) 术语标签（#PA/Term/\*）按 Brooks 语义分组

### 市场状态与结构 (Market State & Structure)

| Tag           | Abbr | 中文名                                  | 英文全称                 |
| ------------- | ---- | --------------------------------------- | ------------------------ |
| #PA/Term/bom  | BOM  | 突破模式 (Breakout Mode)                | Breakout Mode            |
| #PA/Term/ch   | CH   | 通道 (Channel)                          | Channel                  |
| #PA/Term/hft  | HFT  | 高频交易 (HFT)                          | High Frequency Trading   |
| #PA/Term/lom  | LOM  | 限价单市场 (Limit Order Market)         | Limit Order Market       |
| #PA/Term/scb  | SCB  | 尖峰通道底部 (Spike & Channel Bottom)   | Spike and Channel Bottom |
| #PA/Term/sct  | SCT  | 尖峰通道顶部 (Spike & Channel Top)      | Spike and Channel Top    |
| #PA/Term/tr   | TR   | 交易区间 (Trading Range)                | Trading Range            |
| #PA/Term/trd  | TRD  | 交易区间日 (Trading Range Day)          | Trading Range Day        |
| #PA/Term/tro  | TRO  | 交易区间开盘 (Trading Range Open)       | Trading Range Open       |
| #PA/Term/ttr  | TTR  | 紧凑交易区间 (Tight Trading Range)      | Tight Trading Range      |
| #PA/Term/ttrd | TTRD | 趋势交易区间日 (Trending Trading Range) | Trending Trading Range   |

### 市场倾向 (Market Bias)

| Tag          | Abbr | 中文名                          | 英文全称           |
| ------------ | ---- | ------------------------------- | ------------------ |
| #PA/Term/ail | AIL  | 总是多头 (Always In Long)       | Always In Long     |
| #PA/Term/ais | AIS  | 总是空头 (Always In Short)      | Always In Short    |
| #PA/Term/dbl | DBL  | 失望的多头 (Disappointed Bulls) | Disappointed Bulls |
| #PA/Term/dbr | DBR  | 失望的空头 (Disappointed Bears) | Disappointed Bears |

### 关键点位与参考 (Levels & References)

| Tag          | Abbr | 中文名                        | 英文全称                   |
| ------------ | ---- | ----------------------------- | -------------------------- |
| #PA/Term/ath | ATH  | 历史最高点 (ATH)              | All Time High              |
| #PA/Term/brn | BRN  | 大整数关口 (Big Round Number) | Big Round Number           |
| #PA/Term/c   | C    | 收盘价 (Close)                | Close                      |
| #PA/Term/ema | EMA  | 均线 (EMA)                    | Exponential Moving Average |
| #PA/Term/h   | H    | 最高价 (High)                 | High / High of Day         |
| #PA/Term/hh  | HH   | 更高高点 (Higher High)        | Higher High                |
| #PA/Term/hl  | HL   | 更高低点 (Higher Low)         | Higher Low                 |
| #PA/Term/hod | HOD  | 日高 (High of Day)            | High of the Day            |
| #PA/Term/hoy | HOY  | 昨日高点 (High of Yesterday)  | High of Yesterday          |
| #PA/Term/l   | L    | 最低价 (Low)                  | Low / Low of Day           |
| #PA/Term/lh  | LH   | 更低高点 (Lower High)         | Lower High                 |
| #PA/Term/ll  | LL   | 更低低点 (Lower Low)          | Lower Low                  |
| #PA/Term/lod | LOD  | 日低 (Low of Day)             | Low of the Day             |
| #PA/Term/loy | LOY  | 昨日低点 (Low of Yesterday)   | Low of Yesterday           |
| #PA/Term/ma  | MA   | 均线 (Moving Average)         | Moving Average             |
| #PA/Term/mag | MAG  | 均线缺口 K 线 (MA Gap Bar)    | Moving Average Gap Bar     |
| #PA/Term/mga | MGA  | 上方磁铁 (Magnet Above)       | Magnet Above               |
| #PA/Term/mgb | MGB  | 下方磁铁 (Magnet Below)       | Magnet Below               |
| #PA/Term/mgn | MGN  | 磁铁效应 (Magnet)             | Magnet                     |
| #PA/Term/mp  | MP   | 中点 (Midpoint)               | Midpoint                   |
| #PA/Term/nl  | NL   | 颈线 (Neckline)               | NeckLine                   |
| #PA/Term/ood | OOD  | 日开盘价 (Open of Day)        | Open of Day                |
| #PA/Term/ph  | PH   | 可能的高点 (Possible High)    | Possible High              |
| #PA/Term/pl  | PL   | 可能的低点 (Possible Low)     | Possible Low               |
| #PA/Term/sh  | SH   | 波段高点 (Swing High)         | Swing High                 |
| #PA/Term/sl  | SL   | 波段低点 (Swing Low)          | Swing Low                  |
| #PA/Term/tl  | TL   | 趋势线 (Trendline)            | Trendline                  |

### 供需与支撑阻力 (S/R & Orderflow)

| Tag         | Abbr | 中文名              | 英文全称   |
| ----------- | ---- | ------------------- | ---------- |
| #PA/Term/rs | RS   | 阻力位 (Resistance) | Resistance |
| #PA/Term/sp | SP   | 支撑位 (Support)    | Support    |

### K 线类型与信号 (Bars & Signals)

| Tag                      | Abbr     | 中文名                                   | 英文全称                 |
| ------------------------ | -------- | ---------------------------------------- | ------------------------ |
| #PA/Term/aodd            | AODD     | 几乎外包下跌日 (AODD)                    | Almost Outside Down Day  |
| #PA/Term/aoud            | AOUD     | 几乎外包上涨日 (AOUD)                    | Almost Outside Up Day    |
| #PA/Term/bsb             | BSB      | 买入信号 K 线 (Buy Signal Bar)           | Buy Signal Bar           |
| #PA/Term/eb              | EB       | 入场 K 线 (Entry Bar)                    | Entry Bar                |
| #PA/Term/ft              | FT       | 跟进 (Follow Through)                    | Follow Through           |
| #PA/Term/gub             | GUB      | 放弃 K 线 (Give-up Bar)                  | Give-up Bar              |
| #PA/Term/ib              | ib       | 内包 K 线 (ib / Inside Bar)              | Inside Bar               |
| #PA/Term/ii              | ii       | 连续内包 (ii / Consecutive Inside Bars)  | Consecutive inside bars  |
| #PA/Term/iii             | iii      | 三连内包 (Three Inside Bars)             | Three inside bars        |
| #PA/Term/ioi             | ioi      | 外包夹内包 (ioi / Inside-Outside-Inside) | Inside-Outside-Inside    |
| #PA/Term/ioii            | ioii     | 外包后接内包 (Inside after Outside)      | Consecutive IB after OB  |
| #PA/Term/ob              | OB       | 外包 K 线 (Outside Bar)                  | Outside Bar              |
| #PA/Term/od              | OD       | 外包下跌 K 线 (Outside Down Bar)         | Outside Down Bar         |
| #PA/Term/odd             | ODD      | 外包下跌日 (Outside Down Day)            | Outside Down Day         |
| #PA/Term/oo              | OO       | 连续外包 (Consecutive Outside Bars)      | Consecutive Outside Bars |
| #PA/Term/ou              | OU       | 外包上涨 K 线 (Outside Up Bar)           | Outside Up Bar           |
| #PA/Term/oud             | OUD      | 外包上涨日 (Outside Up Day)              | Outside Up Day           |
| #PA/Term/rb #PA/Term/rev | RB / REV | 反转 (Reversal)                          | Reversal Bar             |
| #PA/Term/sb              | SB       | 下方有卖家 (Sellers Below)               | Sellers Below            |
| #PA/Term/ssb             | SSB      | 卖出信号 K 线 (Sell Signal Bar)          | Sell Signal Bar          |

### 形态结构 (Patterns & Structures)

| Tag          | Abbr | 中文名                           | 英文全称                  |
| ------------ | ---- | -------------------------------- | ------------------------- |
| #PA/Term/db  | DB   | 双底 (Double Bottom)             | Double Bottom             |
| #PA/Term/dt  | DT   | 双顶 (Double Top)                | Double Top                |
| #PA/Term/et  | ET   | 扩张三角形 (Expanding Triangle)  | Expanding Triangle        |
| #PA/Term/ff  | FF   | 最终旗帜 (Final Flag)            | Final Flag                |
| #PA/Term/h4  | H4   | 牛旗/H4 (H4)                     | High 4 / Bull Flag        |
| #PA/Term/hsb | HSB  | 头肩底 (Head & Shoulders Bottom) | Head and Shoulders Bottom |
| #PA/Term/hst | HST  | 头肩顶 (Head & Shoulders Top)    | Head and Shoulders Top    |
| #PA/Term/l4  | L4   | 熊旗/L4 (L4)                     | Low 4 / Bear Flag         |
| #PA/Term/mdb | MDB  | 微型双底 (Micro Double Bottom)   | Micro Double Bottom       |
| #PA/Term/mdt | MDT  | 微型双顶 (Micro Double Top)      | Micro Double Top          |
| #PA/Term/mw  | MW   | 微型楔形 (Micro Wedge)           | Micro Wedge               |
| #PA/Term/nw  | NW   | 嵌套楔形 (Nested Wedge)          | Nested Wedge              |
| #PA/Term/pw  | PW   | 抛物线楔形 (Parabolic Wedge)     | Parabolic Wedge           |
| #PA/Term/tri | TRI  | 三角形 (Triangle)                | Triangle                  |
| #PA/Term/tw  | TW   | 截断楔形 (Truncated Wedge)       | Truncated Wedge           |
| #PA/Term/w   | W    | 楔形 (Wedge)                     | Wedge                     |

### 入场、订单与触发 (Entries & Orders)

| Tag            | Abbr  | 中文名                                 | 英文全称                     |
| -------------- | ----- | -------------------------------------- | ---------------------------- |
| #PA/Term/17t   | 17t   | 17 跳陷阱 (17t)                        | 17 Tick Trap                 |
| #PA/Term/41t   | 41t   | 41 跳陷阱 (41t)                        | 41 Tick Trap                 |
| #PA/Term/5t    | 5t    | 5 跳陷阱 (5t)                          | 5 Tick Trap                  |
| #PA/Term/9t    | 9t    | 9 跳陷阱 (9t)                          | 9 Tick Trap                  |
| #PA/Term/b     | B     | 买入 (Buy)                             | Buy / Long                   |
| #PA/Term/ba    | BA    | 高点买入 (Buy Above)                   | Buy Above                    |
| #PA/Term/bb    | BB    | 低点买入 (Buy Below)                   | Buy Below                    |
| #PA/Term/blshs | BLSHS | 低买高卖剥头皮 (Scalp)                 | Buy Low, Sell High, Scalp    |
| #PA/Term/bo    | BO    | 突破 (Breakout)                        | Breakout                     |
| #PA/Term/bp    | BP    | 突破回撤 (Breakout Pullback)           | Breakout Pullback            |
| #PA/Term/bt    | BT    | 突破测试 (Breakout Test)               | Breakout Test                |
| #PA/Term/btc   | BTC   | 买入收盘 (Buy The Close)               | Buy The Close                |
| #PA/Term/bvt   | BVT   | 买入真空测试 (Buy Vacuum Test)         | Buy Vacuum Test              |
| #PA/Term/bx    | BX    | 买入高潮 (Buy Climax)                  | Buy Climax                   |
| #PA/Term/fbo   | FBO   | 突破失败 (Failed Breakout)             | Failed BreakOut              |
| #PA/Term/h1    | H1    | 一腿回调 (H1)                          | One legged pullback (Bull)   |
| #PA/Term/h2    | H2    | 两腿回调 (H2)                          | Two legged pullback (Bull)   |
| #PA/Term/h3    | H3    | 三腿回调 (H3)                          | Three legged pullback (Bull) |
| #PA/Term/l1    | L1    | 一腿回调-熊 (L1)                       | One legged PullBack (Bear)   |
| #PA/Term/l2    | L2    | 两腿回调-熊 (L2)                       | Two legged PullBack (Bear)   |
| #PA/Term/l3    | L3    | 三腿回调-熊 (L3)                       | Three legged PullBack (Bear) |
| #PA/Term/pb    | PB    | 回调 (Pullback)                        | Pullback                     |
| #PA/Term/pbx   | PBX   | 抛物线买入高潮 (Parabolic Buy Climax)  | Parabolic Buy Climax         |
| #PA/Term/psx   | PSX   | 抛物线卖出高潮 (Parabolic Sell Climax) | Parabolic Sell Climax        |
| #PA/Term/pt    | PT    | 盈利目标 (Profit Target)               | Profit Target                |
| #PA/Term/ptg   | PTG   | 止盈 (Profit Taking)                   | Profit Taking                |
| #PA/Term/s     | S     | 卖出 (Sell)                            | Sell / Short                 |
| #PA/Term/sa    | SA    | 上方有卖家 (Sellers Above)             | Sellers Above                |
| #PA/Term/stc   | STC   | 卖出收盘 (Sell The Close)              | Sell The Close               |
| #PA/Term/svt   | SVT   | 卖出真空测试 (Sell Vacuum Test)        | Sell Vacuum Test             |
| #PA/Term/sx    | SX    | 卖出高潮 (Sell Climax)                 | Sell Climax                  |
| #PA/Term/tbtl  | TBTL  | 十条 K 线两腿 (Ten Bars Two Legs)      | Ten Bars Two Legs            |
| #PA/Term/tga   | TGA   | 上方目标 (Target Above)                | Target Above                 |
| #PA/Term/tgb   | TGB   | 下方目标 (Target Below)                | Target Below                 |

### 趋势与反转 (Trend & Reversal)

| Tag           | Abbr | 中文名                              | 英文全称             |
| ------------- | ---- | ----------------------------------- | -------------------- |
| #PA/Term/mdr  | MDR  | 午间反转 (Midday Reversal)          | Midday Reversal      |
| #PA/Term/mrv  | MRV  | 小趋势反转 (Minor Trend Reversal)   | Minor Trend Reversal |
| #PA/Term/mtr  | MTR  | 主要趋势反转 (Major Trend Reversal) | Major Trend Reversal |
| #PA/Term/orv  | ORV  | 开盘反转 (Opening Reversal)         | Opening Reversal     |
| #PA/Term/tres | TRES | 趋势恢复 (Trend Resumption)         | Trend Resumption     |
| #PA/Term/trev | TREV | 趋势反转 (Trend Reversal)           | Trend Reversal       |

### 缺口与测量 (Gaps & Measured Moves)

| Tag           | Abbr | 中文名                       | 英文全称        |
| ------------- | ---- | ---------------------------- | --------------- |
| #PA/Term/20gb | 20GB | 20 根缺口 K 线 (20 Gap Bars) | Twenty Gap Bars |
| #PA/Term/eg   | EG   | 衰竭缺口 (Exhaustion Gap)    | Exhaustion Gap  |
| #PA/Term/g    | G    | 缺口 (Gap)                   | Gap             |
| #PA/Term/gb   | GB   | 缺口 K 线 (Gap Bar)          | Gap Bar         |
| #PA/Term/gd   | GD   | 向下缺口 (Gap Down)          | Gap Down        |
| #PA/Term/gu   | GU   | 向上缺口 (Gap Up)            | Gap Up          |
| #PA/Term/mg   | MG   | 测量缺口 (Measuring Gap)     | Measuring Gap   |
| #PA/Term/mm   | MM   | 测量移动 (Measured Move)     | Measured Move   |

### 高潮与极端 (Climax & Extremes)

| Tag            | Abbr  | 中文名                        | 英文全称                  |
| -------------- | ----- | ----------------------------- | ------------------------- |
| #PA/Term/bdbu  | BDBU  | 大跌大涨 (Big Down Big Up)    | Big Down, Big Up          |
| #PA/Term/bdbuc | BDBUC | 大跌大涨混乱 (BDBU Confusion) | Big Down Big Up Confusion |
| #PA/Term/bubd  | BUBD  | 大涨大跌 (Big Up Big Down)    | Big Up, Big Down          |
| #PA/Term/bubdc | BUBDC | 大涨大跌混乱 (BUBD Confusion) | Big Up Big Down Confusion |

### 仓位与管理 (Position & Management)

| Tag          | Abbr | 中文名                         | 英文全称         |
| ------------ | ---- | ------------------------------ | ---------------- |
| #PA/Term/sbl | SBL  | 牛市加仓 (Scale in Bulls)      | Scale in Bulls   |
| #PA/Term/sbr | SBR  | 熊市加仓 (Scale in Bears)      | Scale in Bears   |
| #PA/Term/te  | TE   | 交易员方程 (Trader's Equation) | Traders Equation |

### 风险与概率 (Risk & Probability)

| Tag         | Abbr | 中文名                    | 英文全称          |
| ----------- | ---- | ------------------------- | ----------------- |
| #PA/Term/hp | HP   | 高概率 (High Probability) | High Probability  |
| #PA/Term/lp | LP   | 低概率 (Low Probability)  | Low Probability   |
| #PA/Term/p  | P    | 概率 (Probability)        | Probability       |
| #PA/Term/rr | RR   | 风险回报比 (Risk Reward)  | Risk Reward Ratio |

### 时间与时段 (Time & Session)

| Tag           | Abbr | 中文名                    | 英文全称                      |
| ------------- | ---- | ------------------------- | ----------------------------- |
| #PA/Term/eod  | EOD  | 日终 (End of Day)         | End of Day                    |
| #PA/Term/fomc | FOMC | 美联储会议 (FOMC)         | Federal Open Market Committee |
| #PA/Term/gx   | GX   | Globex 时段 (Globex)      | Globex Session                |
| #PA/Term/gxh  | GXH  | Globex 高点 (Globex High) | Globex High                   |
| #PA/Term/gxl  | GXL  | Globex 低点 (Globex Low)  | Globex Low                    |
| #PA/Term/ow   | OW   | 周开盘价 (Open of Week)   | Open of Week                  |

---

自动分组统计：术语总数=145；未分组=0（后续可手工归位）。
