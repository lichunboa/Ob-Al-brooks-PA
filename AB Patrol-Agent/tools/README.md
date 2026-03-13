## tools 目录分层

当前 `tools/` 只保留共享引导与分组目录，不再把所有脚本平铺在根下。

- `backtest/`
  - 权威回测入口、矩阵评估、上下文审计
- `ops/`
  - 巡逻控制、交易接入、图表生成、交易所配置
- `diagnostics/`
  - 系统诊断、上下文审计、数据质量检查、恢复检查
  - 策略机会审计，例如 `audit_strategy_opportunities.py`
  - 策略质量审计，例如 `audit_strategy_quality.py`
  - 持仓管理链拆解，例如 `audit_management_chain.py`

规则：

- 新脚本优先放对应子目录。
- 只有跨子目录共享的引导代码保留在 `tools/_bootstrap.py`。
- 文档、脚本和服务入口引用工具路径时，统一使用新子目录路径。
