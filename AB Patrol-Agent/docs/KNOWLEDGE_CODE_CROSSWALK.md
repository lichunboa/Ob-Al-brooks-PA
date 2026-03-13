# Knowledge -> Code 对照表

> 更新于 2026-03-14
> 目的：把 `knowledge/patrol-l1` 的理论层、执行层与当前代码一一对齐，明确哪些已经落地，哪些仍是部分实现。

## 1. 主流程总览

当前主链按 Brooks 语义应理解成：

`S0/S1 读盘`
-> `S2 方向`
-> `S3 状态`
-> `S4 playbook 路由`
-> `S5 风格 / 数学 / 订单规划`
-> `S6 入场执行`
-> `S7 持仓管理`

当前代码里的主落点是：

- `services/signal-service/src/engines/pa/analysis.py`
- `services/signal-service/src/engines/pa_engine.py`
- `services/signal-service/src/engines/pa/strategy_advanced.py`
- `services/signal-service/src/engines/pa/structure_stops.py`
- `trading/market/playbook_router.py`
- `libs/backtest/runner.py`
- `trading/position_management/`
- `libs/backtest/sim_exchange.py`

---

## 2. 分层对照

| 知识层 | 核心问题 | 当前代码落点 | 现状 |
|---|---|---|---|
| `S0/S1` | 今天偏置是什么，图表在讲什么故事 | `runtime/*`、`analysis.py`、`knowledge` 装配 | **部分实现**。运行时会装配背景，但还不是完全显式的 S0/S1 状态机 |
| `S2` | Always In 方向站哪边 | `analysis.py`、`pa_engine.py`、`S2-direction` 引用链 | **已落地** |
| `S3` | 当前是 BO / Channel / TR / Climax / 转换区 | `analysis.py`、`playbook_router.py`、`runner.py` | **已落地** |
| `S4` | 状态下应该匹配哪个 playbook | `playbook_router.py`、`pa_engine.py`、`runner.py` | **已落地**，15 个 playbook 已有路由标签 |
| `S5` | 值不值得做，风格和订单类型对不对 | `structure_stops.py`、`risk.py`、`runner.py`、`strategy_filters.py` | **部分实现**。已有结构止损、目标路径、管理模板，但还不是完全 playbook 专属 |
| `S6` | 入场触发和执行边界 | `pa_engine.py`、`strategy_advanced.py`、`runner.py` | **已落地** |
| `S7` | premise / strength / 减仓 / 移损 / TP / re-entry | `trading/position_management/`、`followup.py`、`sim_exchange.py` | **核心已落地**，但仍需继续优化结果质量 |

---

## 3. 策略家族对照

Brooks 代码化时，最容易走偏的不是“有没有策略名”，而是“是不是把同一类形态拆成多套互相矛盾的逻辑”。

### 3.1 当前建议使用的家族语义

| 家族 | 原始策略名 | 知识依据 | 当前代码处理 |
|---|---|---|---|
| `MTR反转族` | `双重顶/双重底/楔形顶/楔形底/头肩顶MTR/头肩底MTR` | `canonical/C2`、`S6-reversal` | **已统一到同一管理族** |
| `高潮/陷阱反转族` | `急速通道/末端旗形/看衰突破/第二腿陷阱` | `S6-reversal`、`S6-tr` | **已统一到同一管理族** |
| `趋势恢复族` | `高1/低1/高2/低2/突破回调` | `S6-channel` | 保持独立 |
| `均线缺口族` | `20均线缺口/MAG 20/20 Setup/第一均线缺口` | `S6-channel` | 保持独立 |
| `突破追随族` | `收线追进/ii突破/ioi突破/iii突破/HOY突破/LOY突破` | `S6-bo` | **已统一到同一管理族** |

### 3.2 为什么要把 `双重顶底 / 楔形 / 头肩MTR` 放成一族

对应知识依据：

- `knowledge/patrol-l1/canonical/C2-triggers-and-reversal-taxonomy.md`
  - `DT/DB` 是真实 test，不是独立于 MTR 的另一套理论
  - `wedge` 不能脱离上下文单独看
  - `MTR` 多数会表现成 `DT/DB + test`
- `knowledge/patrol-l1/references/S6-reversal.md`
  - 反转文件本身就是把 `wedge / MTR / DB / DT / Final Flag` 当成同一套执行规则
  - `H&S = MTR 的扩展版`

结论：

- `双重顶底`
- `楔形`
- `头肩 MTR`

应视作 **同一反转家族在不同外观下的表达**，不能各自挂一套彼此冲突的持仓管理。

### 3.3 为什么 `ii / ioi / iii / HOY / LOY / 收线追进` 也应视作同一族

对应知识依据：

- `knowledge/patrol-l1/references/S6-common.md`
  - `ii / ioi / iii` 都属于 breakout mode 的 inside 组合
- `knowledge/patrol-l1/references/S6-channel.md`
  - `High 1 / High 2 / first pullback / breakout pullback` 是趋势恢复家族，不应和 breakout mode 混成一套
- `knowledge/patrol-l1/references/S4-strategy-match.md`
  - 突破追随和趋势恢复在订单风格、管理目标、可接受背景上都不同

结论：

- `收线追进`
- `ii突破`
- `ioi突破`
- `iii突破`
- `HOY突破`
- `LOY突破`

应视作 **同一 breakout / breakout-mode 追随家族**，区别只在触发外观，不应继续拆成 `swing` 和 `breakout` 两套互相冲突的管理模板。

### 3.4 时间周期不应该成为策略本体

对应知识依据：

- `knowledge/patrol-l1/references/S2-direction.md`
  - 大周期是**背景**，不是**禁止条件**
  - 每个周期都能独立产生信号
- `knowledge/patrol-l1/SKILL.md`
  - 每个周期自己的 `market_state` 可能不同，必须按**该周期自己的状态**路由
- `knowledge/patrol-l1/references/S1-reading.md`
  - 大周期 K 线可以拆成小周期结构，小周期结构也能组成大周期的一根 K 线

结论：

- 时间周期是 **背景角色 / 验证层级 / 持仓时长换算**，不是策略本体
- 不应该出现“这个 setup 只属于 5m”这种写法
- 更合理的抽象应该是：
  - 入场周期
  - 背景周期
  - 质量周期
  - 管理周期

当前代码已经对齐的地方：

- `signal-service` 生成层不再按时间周期白名单裁掉策略
- 多周期趋势验证改成“当前周期 -> 更高一级背景”的通用校验，而不是只写 `5m -> 15m`
- `Daily TR fade` 改成“日内前 90 分钟”的结构条件，而不是只认 `5m`
- 回测里的 `premise / strength` 管理不再只让 `1m/5m` 生效

---

## 4. S7 管理链对照

| 知识动作 | 当前代码落点 | 现状 |
|---|---|---|
| `Premise Check` | `trading/position_management/evaluation/premise.py` | 已落地 |
| `Strength Check` | `trading/position_management/evaluation/strength.py` | 已落地 |
| `PARTIAL_CLOSE` | `trading/position_management/risk_controls/partial_close.py`、`sim_exchange.py` | 已落地 |
| `MODIFY_STOP_LOSS` | `trading/position_management/risk_controls/trailing_stop.py`、`sim_exchange.py` | 已落地 |
| `MODIFY_TAKE_PROFIT` | `trading/position_management/risk_controls/take_profit.py`、`manager.py` | 已落地 |
| `CANCEL_ALL_ORDERS` | `manager.py` | 已落地 |
| `OPEN_ORDER(add-on / re-entry)` | `followup.py`、`manager.py`、`runtime/pa_runtime.py` | 已落地 |

当前真正需要继续优化的，不是“有没有这些动作”，而是：

1. 哪些家族更容易触发 `premise failure`
2. 哪些家族的 `plain stop loss` 过重
3. `partial close / trailing / TP` 是否真的把 trade 从普通利润推成超额利润

---

## 5. 下一阶段该怎么做

### 5.1 不建议只按“原始策略名”逐个修

原因：

- `双重顶/双重底/楔形/头肩MTR` 明明是同一反转家族
- `高1/高2/低1/低2/突破回调` 也大量共享同一套趋势恢复语义
- 如果按原始策略名逐个调，很容易把同一知识点调出多套不一致参数

### 5.2 更合理的做法

优化时按两层进行：

1. **按知识家族 / 管理动作优化**
   - 例如：`MTR反转族` 的 premise / partial / trail / re-entry
   - 例如：`趋势恢复族` 的 FT 失败、保护性止盈、余仓 trailing
2. **按原始策略名回测验证**
   - 确认家族优化后，是否真的同时改善 `双重底`、`楔形底`、`头肩底MTR`
   - 确认没有只优化一个标签、牺牲另一个同族标签

### 5.3 当前建议的优化顺序

1. `MTR反转族`
   - premise failure 触发条件
   - 2R 附近的 partial close
   - breakeven / trail 的节奏
2. `趋势恢复族`
   - plain stop loss 为什么偏重
   - H1/H2/L1/L2 的余仓是否过早出清
3. `突破追随族`
   - TP1/TP2 后的余仓是否能保留超额利润

---

## 6. 当前结论

这轮对照之后，可以把当前工程理解成：

- **信号主链已经基本接通**
- **下一阶段不该继续大规模加策略名**
- **应转到 S7 管理链的族级优化**

更准确地说：

- 先按 `知识家族` 做管理优化
- 再按 `原始策略名` 和 `时间窗口` 验证结果
- 而不是把每个标签当成完全独立的理论体系
