# Brooks 逻辑与代码结构对照

> 更新于 2026-03-12
> 目的：把 `patrol-l1 / PDF` 的理论步骤，对齐到当前代码模块，避免后续优化跑偏或重复试错。

## 1. 理论主流程

Brooks 视角下，一笔交易的完整流程应当是：

1. `S0/S1` 读大局
   - Daily 偏置
   - 当前是趋势、通道、还是交易区间
   - 关键位、磁体、被困盘在哪里
2. `S2/S3` 定方向与状态
   - Always In 方向
   - 市场状态：强趋势 / 弱趋势 / 宽通道 / 紧通道 / TR / TTR
3. `S4` 匹配 playbook
   - T1-T6 / R1-R3 / TR1-TR4 / S1-S2
4. `S5` 评估数学
   - 订单类型
   - 止损位置
   - 第一目标是否太近
   - 是否值得做
5. `S6` 执行入场
   - watch -> candidate -> executable
6. `S7` 持仓管理
   - premise / strength
   - 分批止盈
   - 保本、拖尾、减仓、重入

## 2. 当前代码映射

### A. 真实信号检测

- 市场状态识别：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py`
  - `CycleIdentifier.identify()`
- 形态 / setup 检测：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py`
- 结构止损后处理：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/structure_stops.py`

### B. 回测链里的 Brooks 路由与执行筛选

- 主回测编排：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`
- 关键步骤：
  - `_build_market_state_context()`
  - `_attach_higher_tf_context()`
  - `_attach_structure_context()`
  - `_attach_playbook_context()`
  - `_check_route_consistency()`
  - `_check_entry_readiness()`

### C. 回测执行与管理

- 挂单 / 成交 / 管理：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`
- 当前管理模板：
  - `brooks_swing`
  - `brooks_breakout`
  - `brooks_tr_blshs`
  - `brooks_mtr_reversal`
  - `brooks_wedge_reversal`

### D. 报告与审计

- 结果输出：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py`
- 交易级上下文审计：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/backtest/backtest_trade_context_audit.py`
- 矩阵工具：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/backtest/backtest_matrix.py`

## 3. 当前已经对齐的部分

- `TR 中部不做单`
- `TR 边缘反做优先`
- `15m 为 TR 时，5m 不再随意顺势追单`
- `低2 + second-leg trap + 近端磁体过近` 的坏样本过滤
- `看衰突破` 已开始按 `1-3 根失败突破` 检测，而不是只看一根
- 回测已使用账户口径，而不再只看 `PF`

## 4. 当前仍然偏离 Brooks 的部分

### 4.1 playbook 检测仍偏窄

当前真实成交主要还是：

- `高2 / 低2`
- `双重顶底`
- `头肩 MTR`
- `楔形顶底`

而 `patrol-l1` 里已经定义、但当前检测仍偏弱的还有：

- `TR2 Failed BO Fade`
- `TR3 2nd Leg Trap`
- `TR4 Daily TR Fade`
- `R3 Channel Line BO Fade`
- `T6 Broad Channel / TR leg 内的恢复单`

### 4.2 S7 持仓管理仍不是完整状态机

当前已经有：

- premise 检查
- weak follow-through 快退出
- 固定的分批 / 保本 / 拖尾模板

但仍缺：

- 真正按 playbook 区分的加仓逻辑
- `0.3% + 0.3% + 0.4% <= 1%` 的完整多腿风控状态机
- 每一腿独立止损与解套逻辑
- 被困盘 scale-in 后的 break-even 处理

### 4.3 Daily / HTF 偏置仍未完全成为第一层路由

当前有 Daily/H4 背景过滤，但还没有完全做到：

- `S0 -> S1 -> S2 -> S4 -> S5 -> S6 -> S7`

更准确地说，现在是：

- `信号先出来`
- 再被背景、路由、结构、评分逐层挡掉

这在工程上可用，但从 Brooks 理论顺序看，仍然偏“先检测、再过滤”，不是“先读盘、再只检测允许的 playbook”。

### 4.4 `S5` 的止损模板仍然没有按 playbook 真正拆开

当前已经补了一层统一的结构止损后处理：

- `structure_stops.py`

它能略微减少“止损没有放到结构位外”的坏样本，但还不够。

原因是 Brooks 的止损不是一个统一模板，而是至少分成这些族：

- `H1/H2/L1/L2` 趋势回调止损
- `TR2 / TR3` 的失败突破 / 第二腿陷阱止损
- `R1/R2/R3` 的反转结构止损
- `T6` Broad Channel / TR leg 恢复止损

所以后续真正该改的，不是继续调统一 buffer，而是把 stop 模板下沉回各检测函数。

## 5. 当前最值得继续优化的顺序

以后继续优化，建议严格按这个顺序：

1. 先补 `S1/S2/S3 -> S4` 的理论路由
   - 让每个状态只检测对应 playbook
2. 再补 `TR2 / TR3 / R3`
   - 抬高合法交易频率
3. 再补 `S5` 的 playbook 专属止损模板
   - 解决“止损没有放到结构位外”
4. 再补 `S7` 的多腿风险和加仓状态机
   - 提升账户增长质量
5. 最后才调局部阈值

## 6. 文件结构建议

当前最合理的边界是：

- `services/signal-service/src/engines/`
  - 只负责真实 setup 检测、市场状态识别、playbook 专属止损
- `libs/backtest/`
  - 只负责回测路由、执行模拟、报告与审计
- `knowledge/patrol-l1/references/`
  - 只负责理论定义，不混工程细节
- `docs/`
  - 只放“当前权威解释”和“理论到代码映射”

后续如果继续整理，最值得拆的是：

- 把 `runner.py` 继续拆成：
  - `context_router.py`
  - `entry_gate.py`
  - `playbook_mapper.py`
- 把 `pa_engine.py` 里的止损模板继续下沉成：
  - `pa/playbook_stops.py`
  - 或 `pa/stops/trend.py`
  - `pa/stops/tr.py`
  - `pa/stops/reversal.py`
- 把 `sim_exchange.py` 继续拆成：
  - `pending_orders.py`
  - `management_engine.py`
  - `risk_model.py`

这样后面做“哪一块偏离 Brooks，就只优化哪一块”会更清晰。
