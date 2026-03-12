# Brooks 架构审查 2026-03-12

## 结论先行

这次审查确认，最近“越优化越远离目标”的主因，不是单一参数，而是回测链和真实链逐渐分叉了。

最核心的问题有 3 个：

1. 活跃回测链在真实 PA 引擎外，又叠了一层非 Brooks 前置世界观  
   具体是 `BackgroundAnalyzer + ScoringEngine + Wyckoff / RSI / OBV / No Demand`。
2. 回测链多了一套额外的全局评分阈值，而真实链没有这一层。  
   真实链主要依赖 `signal_threshold + Brooks 路由 + 结构检查`。
3. Patrol 主交易链并不直接走 `services/signal-service/src/engines/pa_engine.py`。  
   当前 Patrol 主链实际是 `runtime/rule_engine.py + runtime/position_manager.py`。

因此，之前很多“回测优化”并不一定能改善 Patrol 真实交易。

## 本轮已修复

### 1. 纯化活跃回测链

文件：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/libs/backtest/runner.py)

已移除活跃执行路径中的这些前置过滤：

- `BackgroundAnalyzer`
- `ScoringEngine`
- `Wyckoff`
- `RSI`
- `OBV`
- `No Demand`
- `quality_score / min_q`
- `daily / h4` 背景硬过滤

当前回测链改为：

1. 真实 `PA Engine` 产生 `PASignal`
2. 回测侧只补 Brooks 路由上下文
3. 用真实信号的 `strength` 作为唯一执行分数
4. 再走 `route consistency / entry readiness / management template`

也就是现在的回测更接近：

`真实 PA 信号 -> Brooks 路由 -> 结构检查 -> 模拟执行`

而不再是：

`真实 PA 信号 -> 非 Brooks 指标层 -> 额外评分器 -> Brooks 路由 -> 模拟执行`

### 2. 去掉了回测链额外的全局分数阈值

之前 `runner.py` 会在真实引擎已经做过 `signal_threshold` 之后，
再把 `cfg.threshold` 当成第二套后置执行门槛。

这会把很多本来已经通过真实链门槛的信号，再次挡掉。

本轮后：

- 真实引擎仍负责各周期自己的 `signal_threshold`
- `cfg.threshold` 现在只用于覆盖真实引擎各周期的全局 `signal_threshold`
- 回测只保留 Brooks 自己的 `management_score_floor`
- 不再在真实信号生成之后再叠第二套后置分数门槛

## 当前仍存在的偏差

### 1. Patrol 主链和回测链仍未完全统一

Patrol 主交易链：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/runtime/pa_runtime.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/rule_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/runtime/rule_engine.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/position_manager.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/runtime/position_manager.py)

当前回测主链：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/libs/backtest/runner.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

这说明：

- 回测链已经更纯，但仍不是 Patrol 主执行链的 1:1 镜像
- 后续要么把 Patrol 主链迁到统一 playbook 引擎
- 要么让回测直接基于 `runtime/rule_engine.py` 跑

### 2. 旧回测 API 曾指向旧脚本，现已切到新链

文件：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/api-service/src/routers/backtest.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/api-service/src/routers/backtest.py)

本轮之前调用：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/backtest_tool.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/tools/backtest_tool.py)

而这个旧脚本内部还保留着自己的一套 `BackgroundAnalyzer / ScoringEngine`。

本轮修正后：

- API 已改成直接调用 `libs.backtest.runner.BacktestRunner`
- 不再经由 `tools/backtest_tool.py`

因此当前权威回测口径应以：

- `libs/backtest/runner.py`
- `tools/backtest_matrix.py`
- `services/api-service/src/routers/backtest.py`

这三处为准，不要再把旧脚本结果混入当前 Brooks 纯化链。

### 3. 真实 PA 引擎仍有几层额外启发式

文件：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

当前仍保留：

- `signal_threshold`
- `TrendValidator`
- `TradingSession`
- `Always In` 方向约束

这些并不等于“偏离 Brooks”，但它们属于工程化启发式，不是原课里的独立 setup。

后续需要逐个确认：

- 哪些是必要的交易纪律
- 哪些其实是重复过滤

## 当前最重要的修正原则

后续所有优化都必须遵守：

1. 先看 Brooks 状态，再决定允许生成哪些 playbook
2. 不要再在 Brooks 路由前叠外围指标层
3. 不要再在真实引擎后叠第二套全局评分世界观
4. 频率不足时，优先检查
   - `state-first` 是否做到位
   - `TR / Broad Channel` 是否生成了对的 setup
   - `target path / stop structure / trapped trader` 是否判断过严
5. 不要靠“放松中部做单”“放松弱突破追单”去堆频率

## 下一步

最值得继续做的是：

1. 让 `TR / Broad Channel` 在信号生成层更早分化为：
   - `TR2 Failed BO Fade`
   - `TR3 2nd Leg Trap`
   - `R2 TR Edge Reversal`
   - `T6 Broad Channel Recovery`
2. 审查 `pa_engine.py` 里仍保留的 `TrendValidator / TradingSession / signal_threshold`
   是否存在重复过滤
3. 继续把 `TR2 / TR3 / R2 / T6` 从“后置路由语义”前推到“前置生成语义”

## 2026-03-12 本轮增量结论

### 1. `state-first` 已经前移到真实 `pa_engine.py`

本轮在：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

新增了最小 Brooks 状态快照和生成层预筛：

- `range_position / range_edge / range_zone`
- `playbook_id`
- `tight_range / broad_range / weak_trend_*` 下的生成层前置剔除

这意味着当前链路已经从：

- `先生成大量 setup -> runner 后置裁单`

往：

- `先按 Brooks state 约束生成 -> 再做后置结构检查`

迈了一步。

### 2. 效果：频率仍高，但亏损明显收敛

报告：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/reports/backtest/all4_5m_global_brooks_v44_state_first.json](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/reports/backtest/all4_5m_global_brooks_v44_state_first.json)

结果说明：

- 频率已经不是主要矛盾
  - `BTC/ETH/BNB/SOL` 的单品种日均都在 `7-9` 笔
- 但质量仍然不够
  - `PF` 仍低于 `1`
- `state-first` 前移后，亏损和回撤已经开始收敛
  - `BTC`: `PF 0.85 -> 0.94`，账户回撤 `4.74% -> 3.02%`
  - `SOL`: `PF 0.36 -> 0.48`，账户回撤 `10.78% -> 7.54%`

因此当前主矛盾是：

- 不是“有没有交易机会”
- 而是“生成层里哪些 `H1/H2/L1/L2 / reversal` 本来就不该被升级到 executable”
