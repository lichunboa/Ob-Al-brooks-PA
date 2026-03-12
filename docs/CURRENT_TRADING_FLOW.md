# 当前交易流程

> 更新于 2026-03-11

本文只回答三个问题：

1. 现在的 Patrol 交易链到底怎么跑
2. LLM 在什么情况下会被调用
3. 当前到底有没有实际把订单发出去

## 1. 当前结论

当前 Patrol 已经是“代码编排 + 触发式 LLM + 执行桥”的结构。

从代码和当前配置看，真实结论是：

- 巡逻主循环、候选单识别、持仓管理、执行请求拼装，已经主要由代码完成
- LLM 不是每轮都调用，只在触发器命中时介入
- 当前 `.env` 是智能触发模式，不是强制规则引擎优先，也不是强制每轮 LLM
- 当前 Patrol 是否真实发单，取决于启动时是否带 `--execute`
- 当前 execution-service 已支持 `binance / okx / ctrader`

当前关键配置：

- `AB_PATROL_DECISION_PROVIDER=openclaw`
- `AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1`
- `AB_PATROL_RULE_ENGINE_PRIORITY=0`
- `AB_PATROL_FORCE_LLM=0`
- `AB_PATROL_EXCHANGE=ctrader`

当前执行侧状态：

- `execution-service` 健康检查为 `healthy`
- `execution-service` 返回 `trading_enabled=true`
- 当前主栈已运行在 `ctrader demo / multi_asset`
- 当前次栈已运行在 `binance demo / crypto`
- 当前默认观察名单为 `EURUSD / GBPUSD / USDJPY / XAUUSD / US 30 / US TECH 100`
- 当前 Binance 自动候选池已暂时收缩为 `BTCUSDT / SOLUSDT`
- `OPEN_ORDER` 现在会先经过运行时内置的确定性 gate 校验，再进入 execution-service

这意味着：

- 执行服务本身具备真实交易能力
- Web 已经能同时展示主 `cTrader` 和次 `Binance Demo` 两套执行账户
- 当前已经有主 `cTrader` + 次 `Binance Demo` 两套 runtime
- `/pa-bot` 会同时展示两套 runtime，但两者仍是各自独立循环，不共享状态
- Patrol 主链是否下单，要看当前 loop 是否运行在 `dry_run`

## 2. 双 runtime 结构

当前实际结构是：

- 主 runtime
  - `data/pa_trader`
  - `execution-service: 8092`
  - `bot_id=claude-pa`
  - `exchange=ctrader`
  - `market_profile=multi_asset`
- 次 runtime
  - `data/pa_trader_crypto`
  - `execution-service: 8094`
  - `bot_id=al-brooks`
  - `exchange=binance`
  - `market_profile=crypto`
  - `watch_symbols=BTCUSDT / SOLUSDT`

两条循环共享知识库和大部分代码，但运行状态、cycle、journal、执行账户是隔离的。

## 3. 主流程

```text
知识库
  -> Runtime 载入状态与市场缓存
  -> 拉执行快照
  -> 计算本轮 phase
  -> 判断本轮是否触发 LLM
      -> 否: 规则引擎路径
      -> 是: LLM 决策路径
  -> 统一水合 action
  -> 进入 execution-service
  -> 写 cycle / journal / runtime_state / next_scan
  -> query-service 汇总
  -> Web / 控制脚本 / TG 展示
```

## 4. 入口与编排模块

主入口在 `AB Patrol-Agent/runtime/pa_runtime.py`。

关键方法顺序：

1. `PatrolRuntime.loop()`
2. `PatrolRuntime.run_cycle()`
3. `load_runtime_state()` / `load_market_cache()` / `execution_snapshot()`
4. `select_phase_plan()`
5. `should_use_llm()`
6. `rule_engine_decision()` 或 `build_prompt_from_context() + invoke_decision_provider()`
7. `hydrate_open_order_action()`
8. `execute_action()`
9. `persist cycle + journal + next_scan`

## 5. 规则引擎路径

当本轮没有命中 LLM 触发器时，`run_cycle()` 会走 `rule_engine_decision()`。

这个路径当前调用的核心模块：

- `runtime/rule_engine.py`
  - `get_executable_trades()`
  - 负责把市场缓存转成可执行交易候选
- `runtime/position_manager.py`
  - `manage_position()`
  - 负责已有仓位的 Premise / Strength / 止损止盈 / 减仓管理
- `runtime/pa_runtime.py`
  - 负责把候选单转换成 `actions`
  - 负责把持仓管理转换成 `position_management`

规则引擎路径生成的典型动作包括：

- `OPEN_ORDER`
- `PARTIAL_CLOSE`
- `REDUCE_POSITION`
- `CLOSE_POSITION`
- `MODIFY_STOP_LOSS`
- `MODIFY_TAKE_PROFIT`
- `CANCEL_ORDER`
- `LOG_ONLY`

## 6. LLM 路径

当 `should_use_llm()` 返回 `True` 时，本轮会走 LLM 决策链。

核心模块：

- `runtime/llm_trigger_integration.py`
  - 统一决定本轮是否需要 LLM
- `runtime/llm_trigger_manager.py`
  - 维护“是否命中新信号 / 持仓变化 / 定期分析”的状态
- `runtime/prompt_builder.py`
  - 组装系统提示词、用户提示词、引用知识和运行态上下文
- `runtime/providers.py`
  - 调用实际 provider
  - 当前配置是 `openclaw`
  - 也保留了 `codex_cli` provider

当前不是“只有订单变动才调 LLM”。

更准确地说，当前会在这些场景触发 LLM：

- 新的 `entry_ready` / 新信号出现
- 持仓新开、平仓、数量变化
- 止损 / 止盈变动
- 浮盈转负或回撤异常，需要重新检查 premise
- 定期持仓分析或定期扫描分析

所以“订单变动”只是触发条件的一部分，不是全部。

## 7. 执行链

动作水合后会进入 `execute_action()`。

当前主要调用的执行侧接口：

- `GET /trading/calculate-size/{bot_id}`
- `POST /order`
- `POST /order/{symbol}/close`
- `POST /order/{symbol}/modify-sl`
- `POST /order/{symbol}/modify-tp`
- `DELETE /orders`

接口实际由 `AB Patrol-Agent/services/execution-service/src/__main__.py` 提供。

执行服务内部核心模块：

- `executor.py`
- `risk_manager.py`
- `trading_state.py`
- `order_tracker.py`
- `reconciliation.py`
- `position_patrol.py`
- `service_bootstrap.py`

## 8. 当前需要特别知道的一点

`tools/patrol_trade.py` 里的确定性交易规则当前已经重新挂回 `OPEN_ORDER` 主链，但不再通过额外子进程执行。

当前真实行为是：

- 规则引擎或 LLM 生成 `OPEN_ORDER`
- Runtime 先做 action 水合
- `validate_trade_gate()` 在进程内复用 `patrol_trade.py` 的规则函数
- 通过后再计算仓位并请求 execution-service
- 若 loop 处于 `dry_run`，状态记为 `DRY_RUN_VALIDATED`
- 若 loop 带 `--execute`，则会真实发单

## 9. 为什么现在看起来像“代码在自己跑”

因为当前大多数 cycle 实际都会停在规则引擎路径：

- 规则引擎识别候选单
- 规则引擎做持仓管理
- Runtime 自己拼接动作
- Execution Service 自己计算仓位和准备订单
- 最终写回 cycle / runtime_state / journal

只有触发器命中时，才会额外引入 LLM。

所以现在最准确的描述是：

- “代码级主导执行”是对的
- “只有订单变动才调用 LLM”不完全对
- “当前 Patrol 一定会真实发单”不对，是否真实发单取决于当前 loop 启动模式

## 10. 目前为什么没有订单

需要把“过去没单”和“当前没单”分开看。

过去已确认的原因：

- 早期 loop 运行在 `dry_run`
- Binance Demo key / secret 之前有过错配
- `runtime_state / market_cache` 和 execution 交易所不一致，出现过 `binance runtime + ctrader execution`
- 旧链路里 `patrol_trade.py` 是外部脚本壳，执行链不够稳定
- 某些阶段存在规则引擎与管理模块导入问题

当前主栈已经修复到：

- `runtime=ctrader / multi_asset`
- `execution=ctrader / demo`
- `dry_run=false`
- `can_trade=true`
- TG / query / Web 都已显示多资产运行态

所以当前最新几轮“没有订单”的直接原因，不再是配置或链路断开，而是：

- 当前多资产观察名单里没有品种满足可执行条件
- 最新 cycle 已回到 `规则引擎执行路径：识别到 0 个可执行交易`
- 当前三只焦点品种 `USDJPY / EURUSD / GBPUSD` 都停在 `watching`
- 当前结构更偏 `TR 边缘限价单环境`，还没到升级成可执行候选单的门槛
