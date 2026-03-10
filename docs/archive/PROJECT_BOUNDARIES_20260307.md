# 项目边界与模块归属（2026-03-07）

这份文档只做一件事：把当前仓库里几套系统彻底分开，避免再把 `AB Patrol-Agent`、`AB Console-Backend`、`AB Console-Obsidian` 和 Web 混成一套。

## 1. 四套系统

| 系统 | 根目录 | 定位 | 是否当前主线 |
| --- | --- | --- | --- |
| `AB Patrol-Agent` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent` | 基于 Al Brooks 理念的 patrol 交易 runtime | 是 |
| `AB Console-Backend` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend` | 数据、执行、信号、Telegram、Web、量化/威科夫/通用后端底座 | 是 |
| `AB Console-Obsidian` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian` | Obsidian 知识库与插件系统 | 是 |
| `Web` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/web` | 面板与可视化入口 | 是 |

结论：

- `AB Patrol-Agent` 是交易脑子。
- `AB Console-Backend` 是后端基础设施和执行底座。
- `AB Console-Obsidian` 是知识库和工作流工具。
- `Web` 是展示层，不是独立交易引擎。

## 2. 当前主链

```text
AB Patrol-Agent
  -> 读取原 patrol-l1 skill + S 文件
  -> 通过 OpenClaw 调 GPT 做单轮决策
  -> 调 execution-service 查询持仓 / 风控 / 下单
  -> 读取 AB Console-Backend 的行情和状态数据
  -> 把状态推送到 TG 话题 "PA交易 Crypto"
```

也就是说：

- `AB Patrol-Agent` 依赖 `AB Console-Backend`
- 但它不应该再被当作 `AB Console-Backend` 的一个零散脚本

## 3. AB Patrol-Agent 当前使用的原 Claude 资产

### 3.1 已接回

| 资产 | 当前状态 | 位置 |
| --- | --- | --- |
| `SKILL.md` 主流程 | 已接回 | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/SKILL.md` |
| `S0-S7` 参考文件 | 已接回 | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/` |
| `patrol_trade.py` 交易校验网关 | 已接回 | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/scripts/patrol_trade.py` |
| execution-service 下单/改止损/平仓 | 已接回 | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/execution-service/` |
| cycle / runtime_state / journal | 已接回 | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/data/pa_trader/` |

### 3.2 还没有完全接回主循环

| 资产 | 当前状态 | 说明 |
| --- | --- | --- |
| `chart_gen.py` 图表生成 | 已部分接回 patrol loop | 当前 runtime 会生成图并把图表上下文写入 `analysis_board.chart_context` |
| `ab_ema.py / ab_sr.py / ab_mm.py / ab_patterns.py` | 已部分接回 patrol loop | 目前主要通过 `chart_gen.py` 间接参与分析板，不是独立结构化字段输入 |
| `sim_server.py` 模拟逐根回放 | 未接回 | 仍是独立调试工具 |
| `backtest_v4.py / backtest_tool.py` | 未接回 | 仍是独立回测工具 |
| `patrol_watchdog.py / patrol_trigger_listener.py / patrol_l1_event_driver.py` | 部分逻辑保留 | 旧 Claude/OpenClaw 触发链还在，但新的主循环已经独立出来 |

## 4. 当前交易逻辑 vs 原 Claude skill

### 4.1 保持不变的部分

- 仍然以 `patrol-l1` 的 `SKILL.md + S0-S7` 为核心交易逻辑。
- 仍然保留 `Daily Bias -> 方向 -> 市场状态 -> 关键位 -> 策略匹配 -> 评估 -> 管理` 这条主线。
- 仍然保留 `patrol_trade.py` 的硬校验，不允许绕过。
- 仍然通过 `execution-service` 做 `can_trade`、仓位计算、下单、平仓、移损。

### 4.2 当前已经变化的部分

- 从“Claude 单终端隐式记忆”改成了“`runtime_state.json + cycles + journal` 显式状态”。
- 从“Claude 单会话边思考边定时”改成了“OpenClaw 单轮决策 + 外部 loop 调度”。
- 从“图表优先”改成了“结构化行情快照优先”。
- 自动巡逻和 TG 对话拆成了两个 agent：
  - `ab-patrol-loop` 负责内部决策
  - `ab-patrol-runtime` 负责 TG 对话

### 4.3 现在最像原 Claude skill、但还没完全恢复的点

- 图表生成和图片驱动分析
- 旧版 skill 内一些更强的“会话连续感”
- 一些独立调试脚本之间的联动

## 5. AB Console-Backend 的服务盘点

### 5.1 核心服务目录

| 服务 | 路径 | 当前对 AB Patrol-Agent 是否必需 |
| --- | --- | --- |
| `data-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/data-service` | 必需 |
| `trading-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/trading-service` | 重要 |
| `signal-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/signal-service` | 重要 |
| `execution-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/execution-service` | 必需 |
| `telegram-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/telegram-service` | 重要 |
| `ai-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/ai-service` | 非当前 patrol 主链必需 |
| `forex-data-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/forex-data-service` | 未来外汇 patrol 会用 |
| `sync-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/sync-service` | 非当前 patrol 主链必需 |

### 5.2 preview 服务目录

| 服务 | 路径 | 当前对 AB Patrol-Agent 是否必需 |
| --- | --- | --- |
| `api-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services-preview/api-service` | 可选 |
| `markets-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services-preview/markets-service` | 未来指数/宏观会用 |
| `vis-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services-preview/vis-service` | 可借鉴 |
| `order-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services-preview/order-service` | 当前不必需 |
| `predict-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services-preview/predict-service` | 当前无关 |
| `fate-service` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services-preview/fate-service` | 当前无关 |

## 6. 哪些后端模块值得借给 AB Patrol-Agent

### 6.1 直接可借

- `execution-service`
  - 统一的 `can_trade`、仓位计算、下单、平仓、移损接口
- `data-service`
  - 行情采集、缺口补齐、延迟检测
- `trading-service` 里的 `ab_*` 指标模块
  - `ab_ema.py`
  - `ab_sr.py`
  - `ab_mm.py`
  - `ab_patterns.py`
- `vis-service`
  - 如果后面要做图表渲染服务，可以借其服务化设计

### 6.2 设计上很值得借

- `signal-service`
  - 规则引擎和 cooldown 持久化思路
- `data-service` 的 `auto_align.py`
  - 数据延迟自动修复和告警机制
- `scripts/sim_server.py`
  - 逐根回放测试框架
- `scripts/backtest_tool.py`
  - 回测引擎和市场状态抽象

## 7. 哪些 Al Brooks 资产更应该从 Backend 收回到 AB Patrol-Agent

这些文件目前物理上还在 `AB Console-Backend/scripts/`，但从业务归属上更偏 `AB Patrol-Agent`：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/scripts/chart_gen.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/scripts/patrol_trade.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/scripts/backtest_v4.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/scripts/backtest_tool.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/scripts/sim_server.py`

建议：

- 短期不搬代码，只先在文档中归属到 `AB Patrol-Agent`。
- 中期再决定是“移动到 `AB Patrol-Agent`”还是“提成共享库”。

## 8. `execution-service + AB Patrol-Agent 正式纳入` 的意思

不是要把它们塞进同一个目录。

意思是：

- `AB Console-Backend/scripts/start.sh` 过去只把 `data/trading/signal/telegram` 当成正式启动链。
- 但对现在这套 Al Brooks patrol 来说，真正完整的运行链应该是：

```text
data-service
trading-service
signal-service
telegram-service
execution-service
AB Patrol-Agent
```

也就是：

- `execution-service` 不是“额外服务”，而是正式执行层
- `AB Patrol-Agent` 不是“外围脚本”，而是正式决策层

## 9. 当前最需要用户记住的边界

- `PA交易 Crypto` 对应的是 `AB Patrol-Agent`
- `@abconsole_backend_bot` 对应的是 `AB Console-Backend`
- `@abconsole_backend_bot` 发的数据延迟告警，不是 `AB Patrol-Agent` 自己发的
- `AB Console-Backend` 更像通用交易后端底座
- `AB Patrol-Agent` 才是这条 Al Brooks patrol 主线
