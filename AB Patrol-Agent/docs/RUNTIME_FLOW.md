# AB Patrol-Agent 运行流程

> 更新于 2026-03-11

本文只描述当前 `AB Patrol-Agent` 的真实运行链，不再记录旧架构或一次性迁移流程。

## 1. 当前运行模式

当前 Patrol 是“代码主导、LLM 触发式介入、交易前经确定性 gate 校验、是否发单取决于 dry-run”的结构。

当前配置上：

- `AB_PATROL_DECISION_PROVIDER=openclaw`
- `AB_PATROL_LLM_TRIGGER_OPTIMIZATION=1`
- `AB_PATROL_RULE_ENGINE_PRIORITY=0`
- `AB_PATROL_FORCE_LLM=0`

所以现在不是“每轮都调 LLM”，也不是“配置上全局强制纯规则”。  
更准确的说法是：大部分轮次走规则引擎，少数轮次在触发器命中时才走 LLM。

## 2. 一轮巡逻如何开始

入口在 `runtime/pa_runtime.py`：

1. `PatrolRuntime.loop()`
2. `PatrolRuntime.run_cycle()`

`run_cycle()` 本轮会先读取：

- `runtime_state.json`
- `market_state_l1.json`
- execution-service 快照
  - 余额
  - 持仓
  - 挂单
  - `can_trade`
  - bot summary

然后通过 `select_phase_plan()` 计算本轮 phase，例如：

- `BOOTSTRAP`
- `SCAN`
- `PRE_SIGNAL`
- `ENTRY_READY`
- `MANAGE`

## 3. 决策分流

`run_cycle()` 会调用 `should_use_llm()`。

### 3.1 未触发 LLM

走 `rule_engine_decision()`：

- `runtime/rule_engine.py`
  - `get_executable_trades()`
- `runtime/position_manager.py`
  - `manage_position()`

这条路径负责：

- 识别可执行候选单
- 对已有仓位做 Premise / Strength / 止损止盈管理
- 生成 `actions`
- 生成 `position_management`

### 3.2 触发 LLM

走：

1. `build_prompt_from_context()`
2. `invoke_decision_provider()`
3. `extract_decision()`

如果 provider 超时，则回退到：

- `timeout_fallback_decision()`

当前 provider 适配器在 `runtime/providers.py`，支持：

- `openclaw`
- `codex_cli`

## 4. LLM 会在什么情况下被调用

当前不是“只有订单变动才会调用 LLM”。

更准确的触发条件来自 `runtime/llm_trigger_manager.py`：

- 新的 `entry_ready` / 新信号
- 新开仓
- 平仓
- 止损变化
- 止盈变化
- 持仓数量变化
- 浮盈转负或回撤异常
- 定期持仓分析
- 定期扫描分析

订单变动只是其中一类，不是唯一条件。

## 5. 这轮会读取哪些知识

知识入口仍然来自：

- `knowledge/patrol-l1/SKILL.md`
- `knowledge/patrol-l1/references/`
- `knowledge/patrol-l1/canonical/`

但当前主链不是“每轮都整段靠 LLM 重新分析”。  
知识主要在以下场景发挥作用：

- 触发 LLM 时组装 prompt
- 规则和阶段路由对齐 canonical / references
- 定时说明、上下文解释、通知渲染

## 6. 执行阶段

动作进入 `hydrate_open_order_action()` 后，会统一交给 `execute_action()`。

当前主要调用的执行接口：

- `GET /trading/calculate-size/{bot_id}`
- `POST /order`
- `POST /order/{symbol}/close`
- `POST /order/{symbol}/modify-sl`
- `POST /order/{symbol}/modify-tp`
- `DELETE /orders`

这些接口由 `services/execution-service/src/__main__.py` 提供。

## 7. 当前执行链的真实现状

有一点必须明确：

- `tools/patrol_trade.py` 仍然存在，但现在承担的是规则来源，不再作为外部子进程执行壳
- `validate_trade_gate()` 当前已经重新挂回 `OPEN_ORDER` 分支，并在运行时进程内直接完成校验

当前真实行为是：

- 规则引擎或 LLM 生成动作
- Runtime 做 action 水合
- `validate_trade_gate()` 先做确定性校验
- 通过后才做仓位计算并提交 execution-service
- 在 `dry_run` 下把结果记成 `DRY_RUN_VALIDATED`
- 只有 loop 带 `--execute` 时才真正向交易所发送订单

所以现在的 Patrol 交易链是：

- 代码级主导执行
- 交易前保留确定性 gate
- 实际下单唯一出口是 execution-service
- 是否实发单由运行模式决定

## 8. 结果落盘与对外可见性

每轮结果会写到：

- `data/pa_trader/cycles/`
- `data/pa_trader/journal/decision_log.jsonl`
- `data/pa_trader/journal/execution_log.jsonl`
- `data/pa_trader/state/runtime_state.json`
- `data/pa_trader/state/next_scan.json`

对外可见链路：

- `services/consumption/query-service`
  - `/api/v1/runtime/full`
- `tools/pa_crypto_control.py`
  - 本地控制入口
- `AB Patrol-Web/src/app/api/pa-bot/runtime/route.ts`
  - Web 当前主聚合接口

## 9. 如何确认本轮到底走了哪条链

看这几个文件最直接：

- 最新 prompt：
  - `AB Patrol-Agent/data/pa_trader/logs/decision/last_request.md`
- 最新 provider 响应：
  - `AB Patrol-Agent/data/pa_trader/logs/decision/last_response.json`
- 最新 cycle：
  - `AB Patrol-Agent/data/pa_trader/cycles/cycle_*.json`
- 最新状态：
  - `AB Patrol-Agent/data/pa_trader/state/runtime_state.json`
