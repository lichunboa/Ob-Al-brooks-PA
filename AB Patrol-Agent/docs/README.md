# AB Patrol-Agent 文档索引

当前 `docs/` 只保留还能指导“当前目录、当前运行链、当前接入方式”的活文档。

## 当前应优先阅读

- `PROJECT_STRUCTURE.md`
  - 根目录分层、`data/` 子目录和落位规则
- `BACKEND_STRUCTURE.md`
  - 当前后端分层、目录边界、策略落位规则
- `RUNTIME_FLOW.md`
  - Patrol 主循环、规则引擎 / LLM 分流、执行链
- `CURRENT_TRADING_FLOW.md`
  - 当前策略覆盖、live / 回测主链、交易链断点
- `STRATEGY_COVERAGE_AUDIT.md`
  - 按 `S4` 的 15 个 Brooks playbook 审计当前覆盖率
- `BROOKS_LOGIC_MAP.md`
  - Brooks 理论步骤与当前代码映射
- `LLM_TRIGGER_CONFIG.md`
  - LLM 触发策略与运行配置
- `MULTI_SYMBOL_SCANNING.md`
  - 多品种扫描与观察名单说明
- `BINANCE_DEMO_SETUP.md`
  - Binance 接入说明
- `CTRADER_SETUP.md`
  - cTrader 接入说明

## 文档边界

保留在 `docs/` 主目录的文档，只允许属于这三类：

- 当前运行与编排说明
- 当前开发结构与落位规则
- 当前交易所接入与操作说明

不再放在 `docs/` 主目录的内容：

- 一次性重构总结
- 阶段性回测分析
- 旧结构清理记录
- 已经不代表当前目录结构的历史说明

## 历史说明

2026-03 这轮重构产生的阶段性总结已经全部清理，不再在仓库里保留 archive 入口。

如果需要追溯当前结构或交易链，以主目录下这些权威文档为准：

- `PROJECT_STRUCTURE.md`
- `BACKEND_STRUCTURE.md`
- `RUNTIME_FLOW.md`
- `CURRENT_TRADING_FLOW.md`
