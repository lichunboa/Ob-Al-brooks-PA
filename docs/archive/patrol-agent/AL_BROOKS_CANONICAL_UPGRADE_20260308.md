# Al Brooks Canonical 升级说明（2026-03-08）

## 目标

这次升级不再围绕单笔订单打补丁，而是把完整 Al Brooks 知识库变成系统最高权威：

1. `AB Console-Obsidian/Categories 分类/Al brooks`
2. `AB Patrol-Agent/knowledge/patrol-l1/canonical/`
3. `AB Patrol-Agent/knowledge/patrol-l1/SKILL.md + references/S0-S7`
4. 代码中的执行安全、状态持久化、展示与恢复

## 当前已经完成

- 已建立 `canonical/` 规范层，覆盖：
  - 市场周期与状态
  - 触发与反转分类
  - 风格、交易方程与计划委托
  - 持仓管理与退出动作
  - Step 5 动态定时
- 运行时知识选择已接入 canonical
- `runtime-brief` 已退出主知识链
- 自动交易升级期默认关闭

## 当前运行原则

- 理论判断尽量交给 agent
- 代码只保留：
  - 交易所接口
  - 执行安全
  - 动作白名单
  - 状态持久化
  - watchdog
  - Query / Web / TG 展示

## 当前仍在做的事

- 把 `SKILL.md + S0-S7` 继续重写成 canonical 的可执行子集
- 继续把流程编排型硬规则从代码下放给 agent
- 构建回放集，对齐旧 Claude 成交样本和 Al Brooks 知识库示例
- 在恢复自动交易前完成：
  - 候选单 dry-run
  - Binance demo 动作验证
  - `OPEN_ORDER -> S7-management -> EXIT` 闭环

## 当前默认操作建议

- 默认使用观察模式：
  - `./scripts/start.sh start`
- 仅在 parity / replay / demo 全部通过后，才使用：
  - `./scripts/start.sh start --execute`

## 相关文档

- Canonical 规范层：
  - `../knowledge/patrol-l1/canonical/README.md`
- 硬编码规则矩阵：
  - `HARDCODED_RULE_MATRIX_20260308.md`
- 当前目标状态：
  - `GOAL_STATUS_20260308.md`
