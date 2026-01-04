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
  - name: direction
    type: Select
    options:
      - 做多 (Long)
      - 做空 (Short)
  - name: market_cycle
    type: MultiSelect
    options:
      - 强趋势 (Strong Trend)
      - 弱趋势 (Weak Trend)
      - 交易区间 (Trading Range)
      - 突破模式 (Breakout Mode)
  - name: setup_category
    type: Select
    options:
      - 趋势突破 (Trend Breakout)
      - 趋势回调 (Trend Pullback)
      - 趋势反转 (Reversal)
      - 区间逆势 (TR Fade)
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
