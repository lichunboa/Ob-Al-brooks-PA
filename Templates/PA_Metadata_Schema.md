---
fileClass: fileClass
mapWithTag: false
icon: database
fields:
  - name: account_type
    type: Select
    options:
      - 实盘 (Live)
      - 模拟 (Demo)
      - 回测 (Backtest)
  - name: ticker
    type: Select
    options:
      - NQ (纳指)
      - ES (标普)
      - BTC (比特币)
      - GC (黄金)
      - CL (原油)
  - name: timeframe
    type: Select
    options:
      - 1m
      - 5m
      - 15m
      - 1H
      - 4H
      - Daily
  - name: always_in
    type: Select
    options:
      - 总是多头 (Always In Long)
      - 总是空头 (Always In Short)
      - 中性/不确定 (Neutral)
  - name: day_type
    type: Select
    options:
      - 趋势日 (Trend Day)
      - 交易区间日/TRD (Trading Range Day)
      - 趋势交易区间日/TTRD (Trend From Trading Range Day)
      - 极速与通道 (Spike and Channel)
  - name: htf_bias
    type: Select
    options:
      - 多头 (Bull)
      - 空头 (Bear)
      - 区间 (Range)
      - 中性/不确定 (Neutral)
  - name: key_level
    type: MultiSelect
    options:
      - 前高/前低 (Prior High/Low)
      - 区间边界 (Range Boundary)
      - 开盘价/收盘价 (Open/Close)
      - 均线/20EMA (MA / 20 EMA)
      - 缺口 (Gap)
      - 整数关口 (Round Number)
      - 测量目标 (Measured Move Target)
      - 磁体位 (Magnet)
  - name: entry_trigger
    type: Select
    options:
      - 高1/低1 (High 1/Low 1)
      - 二次入场 (Second Entry)
      - 趋势K收盘入场 (Trend Bar Close)
      - 突破入场 (Breakout)
      - 突破回调 (Breakout Pullback)
      - 失败突破反转 (Failed Breakout Reversal)
  - name: management_plan
    type: Select
    options:
      - 一次性下单/不管理 (Set & Forget)
      - 移动止损跟踪 (Trailing)
      - 分批/加减仓 (Scale)
      - 平手/止损离场 (Scratch)
  - name: management_actions
    type: MultiSelect
    options:
      - 不管理 (No Management)
      - 移动止损到平手 (Move Stop to BE)
      - 跟踪止损 (Trail Stop)
      - 分批减仓 (Scale Out)
      - 分批加仓 (Scale In)
      - 缩小止损 (Tighten Stop)
  - name: exit_reason
    type: Select
    options:
      - 止盈-到目标 (Target Hit)
      - 止损-被动 (Stop Hit)
      - 移动止损-跟踪 (Trailing Stop)
      - 平手-策略退出 (Scratch)
      - 时间止损-到点/收盘 (Time Exit)
      - 信号反转-提前退出 (Reversal Signal)
      - 分批止盈-减仓 (Scale Out)
  - name: plan_adherence
    type: Select
    options:
      - 严格遵守 (Followed)
      - 部分遵守 (Partial)
      - 未遵守 (Violated)
  - name: market_cycle
    type: MultiSelect
    options:
      - 强趋势 (Strong Trend)
      - 弱趋势 (Weak Trend)
      - 交易区间 (Trading Range)
      - 突破模式 (Breakout Mode)
  - name: direction
    type: Select
    options:
      - 做多 (Long)
      - 做空 (Short)
  - name: setup_category
    type: Select
    options:
      - 趋势突破 (Trend Breakout)
      - 趋势回调 (Trend Pullback)
      - 趋势反转 (Reversal)
      - 区间逆势 (TR Fade)
  - name: probability
    type: Select
    options:
      - P1-低 (Low)
      - P2-中 (Medium)
      - P3-高 (High)
  - name: confidence
    type: Select
    options:
      - 1 (Low)
      - 2 (Medium)
      - 3 (High)
  - name: signal_bar_quality
    type: MultiSelect
    options:
      - 强阳收盘 (Strong Bull Close)
      - 强阴收盘 (Strong Bear Close)
      - 弱势/长影线 (Weak / Tail)
      - 十字星 (Doji)
      - 顺势K线 (Trend Bar)
      - 强趋势K线 (Strong Trend Bar)
      - 反转K线 (Reversal Bar)
      - 强反转K线 (Strong Reversal Bar)
      - 内包K线 (ib / Inside Bar)
      - 连续内包 (ii / Consecutive Inside Bars)
      - 三连内包 (Three Inside Bars)
      - 外包夹内包 (ioi / Inside-Outside-Inside)
      - 外包K线 (Outside Bar)
  - name: patterns_observed
    type: MultiSelect
    options:
      - 20均线缺口 (20 EMA Gap)
      - 第一均线缺口 (First MA Gap)
      - 收线追进 (Trend Bar Entry)
      - 过度延伸 (Overextended)
      - 楔形顶底 (Wedge Top/Bottom)
      - 双顶双底 (Double Top/Bottom)
      - 末端旗形 (Terminal Flag)
      - 急赴磁体 (Rush to Magnet)
      - 高1/低1 (High 1/Low 1)
      - 看衰突破 (Failed Breakout)
      - 强趋势通道 (Strong Trend Channel)
      - 区间突破回调 (Breakout Pullback)
      - 突破缺口 (Breakout Gap)
      - 急速上涨下跌 (Spike Up/Down)
      - 三角形区间 (Triangle)
      - 头肩顶底 (Head & Shoulders)
      - 高潮式反转 (Climactic Reversal)
      - 测量移动 (Measured Move)
  - name: order_type
    type: Select
    options:
      - 突破入场 (Stop Entry)
      - 限价入场 (Limit Entry)
      - 市价入场 (Market Entry)
  - name: entry_price
    type: Number
  - name: stop_loss
    type: Number
  - name: take_profit
    type: Number
  - name: initial_risk
    type: Number
  - name: net_profit
    type: Number
  - name: risk_reward
    type: Number
  - name: backtest_sample_size
    type: Number
  - name: backtest_win_rate
    type: Number
  - name: backtest_avg_r
    type: Number
  - name: backtest_expectancy_r
    type: Number
  - name: outcome
    type: Select
    options:
      - 止盈 (Win)
      - 止损 (Loss)
      - 保本/平手 (Scratch)
  - name: execution_quality
    type: Select
    options:
      - 🟢 完美执行 (Perfect)
      - 🟡 主动离场/避险 (Valid Scratch)
      - 🔴 恐慌平仓 (Panic Exit)
      - 🔴 追涨杀跌 (FOMO)
      - 🔴 扛单/不止损 (No Stop)
      - 🔴 过度交易 (Overtrading)
  - name: review_depth
    type: Select
    options:
      - 1-快速回顾 (Quick)
      - 2-深度分析 (Deep)
      - 3-写入Playbook (Playbook)
  - name: missed_reason
    type: Select
    options:
      - 犹豫不决 (Hesitation)
      - 没在电脑前 (Away)
      - 点差过大 (Spread)
      - 信号不清晰 (Unclear Signal)
      - 逆势操作 (Counter Trend)
  - name: trader_equation
    type: Select
    options:
      - 波段 (Swing)
      - 剥头皮 (Scalp)
  - name: strategy_status
    type: Select
    options:
      - 学习中 (Learning)
      - 实战中 (Active)
  - name: studied
    type: Select
    options:
      - true
      - false
  - name: strategy_name
    type: Select
    options:
      - 20均线缺口 (20 EMA Gap)
      - 第一均线缺口 (First MA Gap)
      - 极速与通道 (Spike and Channel)
      - 急赴磁体 (Rush to Magnet)
      - 看衰突破 (Fade Breakout)
      - 末端旗形 (Final Flag)
      - 高1/低1 (High 1/Low 1)
      - 区间突破回调 (Breakout Pullback)
      - 收线追进 (Buy/Sell NOW)
      - 双顶双底 (Double Top/Bottom)
      - 楔形顶底 (Wedge Top/Bottom)
---

# Metadata Menu Schema

此文件定义了 Metadata Menu 插件的 FileClass。
请在 Metadata Menu 设置中：

1. 进入 **FileClass settings**
2. 设置 **Class Files path** 为 `Templates/`
3. 刷新后，您应该能看到 `PA_Metadata_Schema` 这个 Class。
4. 将此 Class 绑定到您的交易日记或策略卡片（通过 fileClass 属性或文件夹映射）。
