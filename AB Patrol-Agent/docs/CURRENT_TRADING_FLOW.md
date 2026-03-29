# 当前交易流程与策略覆盖

> 更新于 2026-03-28

本文档只描述当前 `AB Patrol-Agent` 里真实连通的 live / backtest 主链。

## 1. 当前 live 主链

当前 live 交易主链是：

```text
实时 K 线 / 历史 K 线
  -> signal-service / pa_engine
  -> runtime._prepare_live_rule_patch
  -> Brooks filter
  -> rule engine
  -> trade gate
  -> execution-service
  -> runtime_state / cycle / journal
  -> AB Patrol-Web
```

### 当前必须知道的口径

- 当前 live 开仓默认只使用 `15m`
- `1h` 只做背景、边界与顺逆势判断
- 当前 live 决策主链是纯规则引擎，不再依赖 LLM 决策
- 当前 `OPEN_ORDER` 在进入执行器前，必须先通过 trade gate 预检
- 当前 Web 摘要已经拆成：
  - `当前轮次候选 / 可执行 / Gate 拒绝`
  - `真实持仓 / 活动挂单 / 账户快照`

## 2. 当前 backtest 主链

当前权威回测主链是：

```text
历史 K 线
  -> signal-service / pa_engine
  -> libs.backtest.runner
  -> strategy filters / playbook route
  -> trading.position_management
  -> 回测结果 / 图表 / API
```

这意味着：

- live 与 backtest 共用同一套 Brooks 信号引擎
- live 与 backtest 主要差别在于：
  - live 有实时状态、交易所校验、trade gate、execution-service
  - backtest 有回测路由、绩效汇总、历史对账

## 3. 当前部署的 live 策略家族

当前 live 主要围绕 3 个策略家族运行：

- `T1: H1/L1 after BO`
- `T2: H2/L2 trend second entry`
- `T2: H2/L2 broad channel recovery`

### 当前 live 策略语义

- `T1: H1/L1 after BO`
  - 趋势突破后第一次像样回调
  - 围绕 `H1 / L1` signal bar 用 stop-entry
- `T2: H2/L2 trend second entry`
  - 趋势里第二次进场
  - 强调 pullback leg、second entry 与顺势 continuation
- `T2: H2/L2 broad channel recovery`
  - 宽通道 / 趋势交易区间里的顺势恢复
  - 不是机械追价，而是恢复条件成立后再用 stop

## 4. 当前为什么会“不成交”

当前“不成交”有 3 种完全不同的状态，必须分开看：

### 1. `watching`

- 只识别到背景
- 还没到可执行 setup

### 2. `pre_signal`

- 已识别到 Brooks signal
- 但还没满足触发或接受

### 3. `entry_ready`

- 已满足 stop-entry 候选结构
- 但仍可能被 `trade gate` 拒绝

最常见的拒绝原因：

- `R:R` 不达标
- `SL / TP` 结构不合法
- 订单会立即触发
- 缺少同源保护位
- 已有真实持仓 / 保护单，占用风险预算或触发同品种冲突
- 交易所余额、可用保证金或最小名义价值不满足执行条件

因此，“没有成交”不等于“没有识别到信号”。

## 5. 当前图表主链

当前图表栈不是图片回显，而是：

```text
trade_chart_data.py
  -> brooks_chart_overlay.py
  -> Web /api/pa-bot/live-chart
  -> trade-chart-panel.tsx
```

### 图表当前职责

- K 线显示
- EMA / 成交量
- Brooks 信号与模式
- 计划入场 / 实际成交
- 计划止损 / 实际止损
- 计划止盈 / 实际止盈
- 回测事件与 live 事件
- 图层按钮复选
- 周期切换
- 监控池快捷品种切换
- `策略图 / 市场图` 双标签
- 市场图使用 TradingView widget 做原始行情对照
- 策略图继续使用 `lightweight-charts + Python Brooks overlay`
- 策略图当前已支持分组勾选：
  - `H1-Hn / L1-Ln`
  - `Signal Bar / 风险`
  - `ii / ioi / oo`
  - `mDT / mDB`
  - `DT / DB / Wedge / MTR / PW`
  - `Gap / MAG / MM / 前一交易日关键价位`

当前主图采用：

- `lightweight-charts`
- Python 计算的 Brooks overlay

当前市场图采用：

- TradingView Advanced Chart widget
- 只负责原始行情、社区指标和更长历史浏览
- 不承载计划入场、实际成交、回测事件和 runtime 状态

## 5.1 当前 trade gate 口径

- `40%` 反转和 `COUNTERTREND_PROBE` 继续要求至少 `2R`
- 顺势 continuation（如 `H1/L1 after BO`、`H2/L2 trend second entry`、`broad channel recovery`）不再机械统一要求 `2R`
- 如果模板已经明确 `first_profit_at_1x_actual_risk=true`，则允许按 `1x actual risk` 审核首个合理目标
- 震荡区里的普通 `swing` 仍然要求更高空间，但门槛已经改成更贴近 Brooks 合理目标的动态审核

详见：

- [BROOKS_SIGNAL_VISUALIZATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_SIGNAL_VISUALIZATION_20260327.md)
- [CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md)

## 6. 当前最应该看的文件

### 运行时入口

- [pa_runtime.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py)
- [brooks_filter.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/brooks_filter.py)

### 信号入口

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [h1_l1_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/h1_l1_template.py)
- [h2_l2_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/h2_l2_template.py)

### 图表入口

- [trade_chart_data.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/trade_chart_data.py)
- [brooks_chart_overlay.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/brooks_chart_overlay.py)
- [trade-chart-panel.tsx](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web/src/components/pa-bot/trade-chart-panel.tsx)
