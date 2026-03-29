# AB Patrol-Agent 文档索引

> 更新于 2026-03-28

当前 `AB Patrol-Agent/docs/` 里同时存在两类文档：

- 活文档：描述当前真实运行链、当前目录边界、当前图表与执行链
- 历史审计文档：用于回溯某次优化、某个策略家族、某个阶段问题

如果你的目标是继续开发当前系统，应该优先看下面这些权威入口。

## 当前权威入口

- [PROJECT_STRUCTURE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/PROJECT_STRUCTURE.md)
  - 当前 `AB Patrol-Agent` 目录边界、`data/` 与 `libs/` 落位规则
- [BACKEND_STRUCTURE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BACKEND_STRUCTURE.md)
  - 当前后端服务分层、职责边界、共享模块位置
- [RUNTIME_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/RUNTIME_FLOW.md)
  - Patrol 主循环、规则引擎、执行桥、图表生成入口
- [CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md)
  - 当前 live / backtest 主链、部署策略、交易周期与大周期分工
- [CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md)
  - 当前图表栈、`tradecat` 对比结论、是否适合替换
- [BROOKS_SIGNAL_VISUALIZATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_SIGNAL_VISUALIZATION_20260327.md)
  - 当前图表已显示的 Brooks 信号、图层分组与按钮语义
- [BROOKS_SIGNAL_CATALOG_AND_TEMPLATE_VIS_20260328.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_SIGNAL_CATALOG_AND_TEMPLATE_VIS_20260328.md)
  - 当前图表信号目录、模板字段、tradecat 吸收结果与后续信号树落位
- [CTRADER_SETUP.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CTRADER_SETUP.md)
  - cTrader 接入与检查
- [BINANCE_DEMO_SETUP.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BINANCE_DEMO_SETUP.md)
  - Binance 接入与检查

## 当前必须知道的事实

- 当前 live 主链以规则引擎为主，不再依赖 LLM 决策。
- 当前 live 开仓默认只使用 `15m` 交易周期；`1h` 只做背景与边界，不直接开仓。
- 当前 Web 主图是 `lightweight-charts + Python Brooks overlay`，不是静态图片链。
- 当前图表已经是 `策略图 + 市场图` 双标签，并支持按组勾选 Brooks 信号图层。
- 当前 Web 摘要已经明确拆开：
  - `当前轮次候选 / 可执行 / Gate 拒绝`
  - `真实持仓 / 活动挂单 / 账户快照`
- 当前账户与总览页已经按 `tradecat` 风格吸收为更紧凑的驾驶舱和账户控制条。
- `AB Patrol-Agent/docs/` 里大量带日期的审计文档仍保留，但默认视为历史背景，不应覆盖当前权威入口。

## 文档使用原则

### 开发当前系统时优先读取

- `PROJECT_STRUCTURE.md`
- `BACKEND_STRUCTURE.md`
- `RUNTIME_FLOW.md`
- `CURRENT_TRADING_FLOW.md`
- `CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md`

### 做 Brooks 理论与代码映射时再补充读取

- `BROOKS_LOGIC_MAP.md`
- `BROOKS_RULE_AUDIT.md`
- `KNOWLEDGE_IMPLEMENTATION_AUDIT.md`
- `BROOKS_PINE_REFERENCE_AUDIT_20260327.md`

### 这些文档默认按“历史审计”理解

- 文件名带日期、且主题是 `AUDIT / EVAL / REPORT / OPTIMIZATION / ZERO_BASE`
- 它们用于保留排查过程，不作为当前唯一真相

## 一句话约束

看不确定的地方，先以：

- [AGENTS.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AGENTS.md)
- [CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md)
- [CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md)

为准。
