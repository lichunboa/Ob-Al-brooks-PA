---
cover:
categories:
  - 交易日记
tags:
  - PA/Trade
  - Quant/Analysis
date: {{date}}
账户类型/account_type: 模拟 (Demo)
机器人/bot: 量化分析师
品种/ticker: {{ticker}}
时间周期/timeframe: {{timeframe}}
分析类型/analysis_type: 多周期量化分析
策略名称/strategy_name: {{strategy}}
方向/direction: {{direction}}
入场/entry_price: {{entry_price}}
止损/stop_loss: {{stop_loss}}
目标位/take_profit: {{take_profit}}
初始风险/initial_risk: {{initial_risk}}
盈亏比/risk_reward: {{risk_reward}}
净利润/net_profit:
结果/outcome:
出场原因/exit_reason:
信号评分/signal_score: {{score}}
追踪状态/tracking_status: 活跃
订单ID/order_id: {{order_id}}
止损订单ID/sl_order_id: {{sl_order_id}}
止盈订单ID/tp_order_id: {{tp_order_id}}
综合评估/overall: {{overall}}
置信度/confidence: {{confidence}}
多周期共振/confluence: {{confluence}}
---

# 📊 量化分析报告 - {{ticker}}

## 综合评估

| 项目 | 评估 |
|------|------|
| **方向** | {{overall}} |
| **置信度** | {{confidence}}% |
| **多周期共振** | {{confluence}} |

## 多周期技术分析

### 5 分钟
{{5m_analysis}}

### 15 分钟
{{15m_analysis}}

### 1 小时
{{1h_analysis}}

### 4 小时
{{4h_analysis}}

### 日线
{{1d_analysis}}

## 关键价位

| 类型 | 价位 |
|------|------|
| 阻力 R2 | {{r2}} |
| 阻力 R1 | {{r1}} |
| 当前价 | {{current}} |
| 支撑 S1 | {{s1}} |
| 支撑 S2 | {{s2}} |

## 订单簿深度

{{orderbook_analysis}}

## 资金流向

{{fund_flow}}

## 交易计划

| 策略 | 入场 | 止损 | 目标 | R:R |
|------|------|------|------|-----|
| 谨慎左侧 | {{left_entry}} | {{left_stop}} | {{left_target}} | {{left_rr}} |
| 右侧突破 | {{right_entry}} | {{right_stop}} | {{right_target}} | {{right_rr}} |

## 风险评估

- **风险等级**: {{risk_level}}
- **建议仓位**: {{position_size}}%
- **风险预警**: {{risk_warning}}

---

*分析时间: {{timestamp}}*
*分析师: 量化分析师*
