# AB 项目文档中心

> 更新于 2026-03-28

当前仓库的权威开发入口只有三套：

| 系统 | 根目录 | 当前定位 |
| --- | --- | --- |
| `AB Patrol-Agent` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent` | 当前后端、巡逻主脑、规则引擎、执行桥、图表数据层 |
| `AB Patrol-Web` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web` | 当前 Web 控制台与图表交互层 |
| `AB Console-Obsidian` | `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian` | Al Brooks 知识库、课程、原文资料与插件 |

## 当前最重要的事实

- live 决策主链现在是纯规则引擎主导，不再以 LLM 作为开仓必经链路。
- 当前 live 开仓默认只做 `15m` 交易周期；`1h` 只做背景、边界与顺逆势判断。
- 当前 Web 总览已经拆成两套口径：
  - `当前轮次候选 / 可执行 / Gate 拒绝`
  - `真实持仓 / 活动挂单 / 账户快照`
- 图表主链现在是：
  - 数据：`execution-service / historical bars`
  - 覆盖层：Python 计算 Brooks overlay
  - Web：`lightweight-charts`
- Web 图表现在是 `策略图 + 市场图` 双标签：
  - `策略图` 继续承载 Brooks 信号、计划价、实际成交、回测与 runtime 状态
  - `市场图` 使用 TradingView widget 做原始行情、社区指标与长历史浏览
- 总览页和账户页已经按 `tradecat` 的思路收成更紧凑的驾驶舱：
  - 顶部摘要条
  - 交易所切换
  - 账户控制条
  - 监控池快捷入口
- 用户指定的 Al Brooks 原文资料目录现在统一是：
  `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/al brooks参考资料agent专用版`

## 当前权威文档

### 仓库级入口

- [AGENTS.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AGENTS.md)
  - 当前协作规则、目录边界、命令约束、原文资料目录
- [CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_TRADING_FLOW.md)
  - 当前真实交易主链、部署策略、图表主链与执行口径
- [ARCHITECTURE_RESET_PLAN_20260329.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/ARCHITECTURE_RESET_PLAN_20260329.md)
  - 应有架构图、当前偏差、重整顺序，以及图表 / 信号 / 策略 / 回测的一体化目标
- [FOLDER_STRUCTURE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/FOLDER_STRUCTURE.md)
  - 当前目录结构与归属
- [ROOT_LAYOUT.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/ROOT_LAYOUT.md)
  - 顶层边界与历史目录说明

### Patrol 主脑入口

- [AB Patrol-Agent/docs/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/README.md)
  - Patrol 专属文档索引
- [AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md)
  - Patrol 当前 live / backtest 主链说明
- [AB Patrol-Agent/docs/RUNTIME_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/RUNTIME_FLOW.md)
  - 主循环、rule engine、执行链、状态持久化
- [AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md)
  - 当前图表栈与 `tradecat` 替换评估
- [AB Patrol-Agent/docs/BROOKS_SIGNAL_CATALOG_AND_TEMPLATE_VIS_20260328.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_SIGNAL_CATALOG_AND_TEMPLATE_VIS_20260328.md)
  - 当前已集成的 Brooks 信号目录、模板字段与 Web 可视化落位

## 文档使用规则

- 如果文档里还在写：
  - `LLM 触发式主链`
  - `dry_run` 是当前默认实盘状态
  - `AB Console-Backend` 是当前运行目录
  - Web 图表仍是静态图片链
  那么默认按历史信息处理，不要拿来指导当前开发。

- 当前开发若遇到冲突，优先级按下面顺序：
  1. [AGENTS.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AGENTS.md)
  2. [docs/CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_TRADING_FLOW.md)
  3. [AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CURRENT_TRADING_FLOW.md)
  4. [AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/CHART_STACK_AND_TRADECAT_EVALUATION_20260327.md)

## 历史资料说明

- `docs/archive/` 仍然保留，用于追溯旧结构和旧结论。
- `AB Patrol-Agent/docs/` 中大量带日期的 `AUDIT / EVAL / REPORT` 文档也仍然保留。
- 这些历史资料可以参考，但不能覆盖当前权威文档。
