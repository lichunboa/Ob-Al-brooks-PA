# 当前交易主链

> 更新于 2026-03-28

本文档只描述当前仓库里真实在跑的交易主链，不记录已下线的旧口径。

## 1. 当前结论

当前 Patrol 的 live 交易链是：

```text
实时/历史 K 线
  -> signal-service / PA 引擎
  -> runtime 统一补齐 live patch
  -> Brooks filter
  -> rule engine
  -> trade gate 预检
  -> execution-service
  -> runtime_state / cycle / journal
  -> AB Patrol-Web
```

关键口径：

- live 决策主链现在以规则引擎为主，不再依赖 LLM 决策。
- live 开仓默认只使用 `15m` 交易周期。
- `1h` 只负责背景、边界、顺逆势语义，不直接开仓。
- 图表主链现在是 `lightweight-charts + Python Brooks overlay`，不是静态图片回显。
- 当前图表已经拆成 `策略图 + 市场图` 双标签：
  - `策略图` 承载 Brooks 信号、计划价、实际成交和事件
  - `市场图` 使用 TradingView widget 做原始行情与社区指标对照
- 当前 Web 摘要和执行口径已经拆成两层：
  - `当前轮次候选 / 可执行 / Gate 拒绝`
  - `真实持仓 / 活动挂单 / 账户快照`
- 当前 orders / overview 图表在没有历史主事件、没有当前持仓时，也能直接按交易品种生成 `实时信号总览图`
- 策略图当前已支持分组勾选信号图层，重点包括：
  - `H1-Hn / L1-Ln`
  - `Signal Bar / 风险`
  - `ii / ioi / oo`
  - `mDT / mDB`
  - `DT / DB / Wedge / MTR / PW`
  - `Gap / MAG / MM / 前一交易日关键价位`

## 2. 当前部署策略

当前 live 主要围绕 3 条策略家族运行：

- `T1: H1/L1 after BO`
- `T2: H2/L2 trend second entry`
- `T2: H2/L2 broad channel recovery`

这些策略的共同流程是：

1. 在交易周期上识别 Brooks signal
2. 围绕 signal bar 生成 `计划入场 / 计划止损 / 计划止盈`
3. 经过 Brooks filter 判断是 `watching / pre_signal / entry_ready`
4. 经过 trade gate 检查结构、订单语义、盈亏比、保护位
5. 通过后才进入 execution-service 下真实单

当前 trade gate 的口径也已经更新：

- `40%` 反转 / `COUNTERTREND_PROBE` 继续维持更严的 `2R`
- 顺势 continuation 不再机械统一卡在 `2R`
- 如果模板明确 `first_profit_at_1x_actual_risk`，则允许围绕 `1x actual risk` 审核首个合理目标

## 3. 当前为什么会“有信号但没成交”

当前没有成交，不再意味着“系统没识别到”。

更常见的真实原因有两类：

- 没有升级到 `entry_ready`
  - 只停在 `watching / pre_signal`
- 已经升级到 `entry_ready`
  - 但被 `trade gate` 拒绝
  - 常见原因是：
    - `R:R` 不达标
    - `SL / TP` 结构无效
    - 订单会立即触发
    - 保护位不完整
    - 同品种已持仓，被 `[HELD_POSITION]` 阻塞
    - 账户已存在真实持仓 / 保护单，占用风险预算
    - 交易所余额、可用保证金或最小名义价值不满足执行条件
    - 交易所没有确认主开仓单，执行层按失败处理

因此，当前判断“系统有没有工作”，不能只看有没有订单，还要看：

- latest cycle 的 `status`
- 当前轮次 `currentActions`
- 是否有 `entry_ready`
- 是否被 `trade gate` 拒绝
- execution journal 里的 `OPEN_ORDER` 是否被交易所二次确认

## 4. 当前图表主链

当前图表主链是：

```text
execution-service / historical bars
  -> trade_chart_data.py
  -> brooks_chart_overlay.py
  -> /api/pa-bot/live-chart
  -> trade-chart-panel.tsx
```

当前图表承担的不只是行情展示，还要承载：

- Brooks 信号
- 计划入场 / 实际成交
- 计划止损 / 实际止损
- 计划止盈 / 实际止盈
- backtest 事件
- live runtime 状态

## 4.1 当前 Web 可视化口径

- 图表顶部支持：
  - `策略图 / 市场图`
  - 交易品种切换
  - 周期切换
  - 监控池快捷品种切换
- 信号按钮支持：
  - 复选
  - 全选 / 清空
  - 按组管理
- 总览页与账户页已经吸收 `tradecat` 两类优点：
  - 更紧凑的摘要条与顶部指标卡
  - 按交易所切换的账户视图、账户覆盖摘要和驾驶舱控制条

因此，当前主图不能简单替换成外部黑盒 widget。

## 5. 与旧文档的区别

下面这些口径已经过时，不应再用：

- “当前主链是代码编排 + 触发式 LLM + 执行桥”
- “当前是否下单主要看 LLM 是否介入”
- “当前主图仍是静态图片生成”
- “交易周期和大周期都直接参与同级别开仓”

当前正确口径是：

- 规则引擎主导
- `15m` 执行、`1h` 背景
- trade gate 决定能否真正下单
- 图表是可交互 K 线和可选信号层

## 6. 当前权威入口

- [AGENTS.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AGENTS.md)
- [AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md)
- [AB Patrol-Agent/docs/RUNTIME_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/RUNTIME_FLOW.md)
- [AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md)
