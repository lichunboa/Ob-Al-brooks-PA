# AB Patrol-Agent 文档索引

`AB Patrol-Agent` 是当前仓库里的巡逻主脑与后端主目录。

它负责：

- 读取 `knowledge/patrol-l1/` 中的 canonical / references / `SKILL.md`
- 运行 `runtime/pa_runtime.py` 主循环
- 基于规则引擎和触发式 LLM 做决策
- 通过 `execution-service` 做仓位计算、订单动作和持仓管理
- 写入 `cycle / journal / runtime_state / next_scan`
- 通过 `query-service / sync-service / vis-service` 对外提供可见性

它不负责：

- 承载主 Web 站点
- 承载 Obsidian 知识库本体
- 充当个人工作区或历史资料仓

## 当前真实模式

当前真实运行模式是：

- 决策 provider 配置为 `openclaw`
- LLM 使用智能触发，不是每轮都调用
- 规则引擎承担大部分巡逻与管理路径
- `OPEN_ORDER` 先经过运行时内置的确定性 gate 校验，再进入 execution-service
- 交易执行层支持 `binance / okx / ctrader`
- 是否真实下单，仍由 Patrol 启动参数里的 `dry_run / --execute` 决定
- 当前主栈已切到 `ctrader demo / multi_asset`

对应权威说明：

- 根文档总览：
  [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/README.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/README.md)
- 当前交易流程：
  [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_TRADING_FLOW.md)
- 当前目录结构：
  [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/FOLDER_STRUCTURE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/FOLDER_STRUCTURE.md)

## 当前应优先阅读

- `RUNTIME_FLOW.md`
  - Patrol 主循环、LLM 触发、规则引擎路径、执行链
- `PROJECT_MEMORY.md`
  - 已验证的回测经验、回撤经验、Brooks 对齐结论
- `BROOKS_ARCH_AUDIT_20260312.md`
  - 当前真实链 / 回测链偏差、非 Brooks 污染层、修正优先级
- `BROOKS_LOGIC_MAP.md`
  - 理论步骤、代码模块、当前缺口与后续拆分方向
- `LLM_TRIGGER_CONFIG.md`
  - LLM 触发相关配置说明
- `BINANCE_DEMO_SETUP.md`
  - Binance Demo 接入说明
- `CTRADER_SETUP.md`
  - cTrader 接入说明
- `MULTI_SYMBOL_SCANNING.md`
  - 多品种扫描与观察名单说明

## 本轮归档后的边界

当前继续保留在 `AB Patrol-Agent/docs/` 的，是这三类文档：

- 当前运行入口、交易流程、执行链、配置说明
- 仍会指导接入或操作的交易所说明
- 仍会指导策略落地的活跃设计文档

已经继续归档到 `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/archive/patrol-agent/` 的，是这几类文档：

- 2026-03-07 ~ 2026-03-10 的审计报告
- 知识迁移映射、差异分析、目标状态这类阶段性整理文档
- 不再代表当前目录和当前执行链的历史过程说明

## 历史文档说明

- 03-10 那批阶段总结、拆分计划、系统检查、Web 适配和 LLM 优化过程文档，已经统一挪到：
  `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/archive/patrol-agent/`
- 本轮又追加归档了 canonical 升级说明、硬编码规则矩阵、交易漏斗、执行提案、旧版 cTrader 集成方案和旧重构计划。
- 这些归档文档只用于追溯，不再作为当前操作依据。
- 当前所有实际路径，以 `AB Patrol-Agent/`、`AB Patrol-Web/`、`AB Console-Obsidian/` 为准。
