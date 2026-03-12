# Knowledge 流程实现审计

> 更新于 2026-03-13

本文档回答 3 个问题：

1. `knowledge/patrol-l1/SKILL.md` 与 `S0-S7` 规定的主流程，当前代码到底实现到哪一步。
2. 代码里还有哪些逻辑不完全符合 Al Brooks 主链。
3. 现存的“重复模块”哪些只是兼容包装，哪些值得继续清理。

## 一、当前已经真正落地的主流程

当前主链已经固定为：

`knowledge`
-> `signal-service/pa_engine`
-> `risk`
-> `execution-service` 或 `libs/backtest/runner`
-> `trading/position_management`

对照 `SKILL + S0-S7`，当前明确已经落地的部分有：

- `S2/S3/S4/S6`
  - 已落到 `services/signal-service/src/engines/pa_engine.py`
  - 负责信号检测、状态优先预筛、playbook 路由
- `S4` 的 15 个 playbook
  - 已全部具备独立 `playbook_id`
  - 其中 `T4/R3/TR4/S1/S2` 已新增专属 detector 标注层，会在 `pa_engine` 内显式写入 `playbook_hint / playbook_profile / detector_reason`
- `S7` 的核心持仓管理
  - 已落到 `trading/position_management/`
  - 当前已实现 `Premise Check / Strength Check / Partial Close / Take Profit Update / Trailing Stop`
- `Step 5`
  - 已落到 `runtime/scan_timing.py`
  - 当前有明确的分桶规则、来源引用和压秒理由

## 二、还没有完全落地的流程点

这些不是“完全没有”，而是“只做了核心子集”。

### 1. `S7` 已有统一动作层，add-on / re-entry 已接入共享 follow-up 语义

当前 `trading/position_management/manager.py` 已能统一输出：

- `CLOSE_POSITION`
- `PARTIAL_CLOSE`
- `MODIFY_STOP_LOSS`
- `MODIFY_TAKE_PROFIT`
- `CANCEL_ALL_ORDERS`
- `OPEN_ORDER`（add-on / scale-in / re-entry）

现状是：

- `MODIFY_TAKE_PROFIT` 已通过目标磁体路由统一纳入主管理器
- `CANCEL_ALL_ORDERS` 已支持显式失效/过期/错误加仓场景下的统一撤单
- `OPEN_ORDER` 仍支持显式 `add_on_plan / scale_in_plan / reentry_plan` 输入
- live 主链现在会在 `trading/position_management/followup.py` 内自动生成 `winner scaling` 计划
- 权威回测链现在也会通过同一 helper 把事件标成 `ADD_ON / PYRAMID_ADD / REENTRY`

结论：

- **S7 的统一动作语义已经落到主管理器**
- **S7 的 add-on / re-entry 语义已共享到 live 与回测主链**
- **live 侧自动生成的是 add-on；re-entry 仍主要由回测观察窗口和显式计划输入驱动**

### 2. `SKILL Step 3` 的两阶段扫描不是 100% 硬编码闭环

当前有这些落点：

- `runtime/event_detection.py`
- `runtime/execution_semantics.py`
- `runtime/market_scanner.py`
- `runtime/scan_timing.py`

说明：

- `pre_signal / candidate / executable / planned_trade` 这些状态已经有代码表达
- `Quick Scan` 事件和 `S6` 文件路由也已经有对应实现

但还存在一个差异：

- `SKILL.md` 里的流程是“强编排语义”
- 当前代码里有一部分仍然是“状态字段 + 条件组合”的实现，而不是一条完全显式、统一的状态机

结论：

- **流程语义已经有**
- **但不是一套单一的、完全中心化的状态机实现**

## 三、当前最明显的非 Brooks 主链逻辑

### 1. `pa_engine` 仍保留会话强度乘数能力，但默认已退出 Brooks 主评分

文件：

- `services/signal-service/src/engines/pa/analysis.py`
- `services/signal-service/src/engines/pa_engine.py`

现状：

- `TradingSession.adjust_signal_strength()` 仍然存在
- 但 `PA_ENABLE_SESSION_STRENGTH_ADJUST=0` 时默认不再参与主评分，只保留 `session` 上下文字段

问题：

- 这不属于 `knowledge/patrol-l1` 里的 Brooks 核心决策主链
- 更像执行层的经验性偏置，而不是 `S4/S5/S6` 明确规定的概率语义

结论：

- **它不是指标污染**
- **但它属于额外启发式，因此现在已经降成可选开关**

### 2. 仓库里仍保留非 PA 规则库

文件：

- `services/signal-service/src/rules/core/`
- `services/signal-service/src/rules/trend/`
- `services/signal-service/src/rules/volatility/`
- `services/signal-service/src/rules/pattern/`

其中包含：

- RSI
- MACD
- SuperTrend
- Ichimoku
- 布林带
- VWAP
- Fibonacci

结论：

- 这些模块**还在仓库里**
- 但当前我们保留的 PA 主链并**不依赖**它们做 Brooks playbook 入场
- 它们属于历史规则库，不应再和 `knowledge/patrol-l1` 的 Brooks 主链混用

## 四、重复模块审计

### 1. 兼容包装层，当前可以保留

- `trading/position_management/checks.py`
- `trading/position_management/exits.py`
- `runtime/utils/`

这些文件当前主要是：

- 旧导入路径兼容
- 对新目录的薄包装

结论：

- **它们是重复入口，不是重复实现**
- 现阶段还能接受，后面可以继续压缩调用点再删

### 2. 真正值得继续清理的重复点

- `pa_engine` 与 `libs/backtest/runner` 的 playbook 路由过去是两套逻辑
- 这轮已经抽到 `trading/market/playbook_router.py`

结论：

- 这轮已经消掉了一处核心重复
- 后续还值得继续收的是：
  - `runtime/execution_semantics.py`
  - `trading/utils/brooks_analysis.py`
  - `runtime/event_detection.py`

因为这三处都还在表达 `pre_signal/candidate/executable` 的相近语义

## 五、当前审计结论

如果问题是“`knowledge` 里的主流程有没有真正实现”，答案是：

- **主链已经实现**
- **但不是全部细枝末节都已代码化**

更准确地说：

- `S2-S6` 的入场与路由主干已经落地
- `S4` 的 15 个 playbook 已具备独立路由标签
- `S7` 的持仓保护与动作语义已落地
- `S7` 的 follow-up 计划生成已中心化到共享 helper，但 live 侧的 re-entry 仍不是独立扫描入口
- 仓库里仍有一批非 Brooks 指标规则模块，但已不属于当前 PA 主链

## 六、下一步建议

优先级从高到低：

1. 把 live 侧的 re-entry 也补成独立扫描入口，而不只是回测观察窗口 / 显式计划
2. 把 `execution_semantics / brooks_analysis / event_detection` 的状态语义再合并一层
3. 明确隔离 `services/signal-service/src/rules/*`，避免后续又把指标规则混回 PA 主链
