# AB Patrol-Agent 文档索引

`AB Patrol-Agent` 是当前项目中独立的 Al Brooks 交易主脑。

当前文档入口统一遵循以下前提：

- 完整 Obsidian Al Brooks 知识库是最高权威
- `canonical/` 是理论规范层
- `SKILL/S` 是 agent 的可执行子集
- 升级期默认观察模式，先做 parity 和回放，再恢复自动交易

它负责：

- 读取完整知识库回写后的 `canonical + SKILL.md + S0-S7`
- 基于 Al Brooks 体系做巡逻、分析、候选单判断
- 通过 `patrol_trade.py` 做执行前安全校验
- 调用 `execution-service` 执行 Binance demo 交易动作
- 写入运行态、cycle、journal、预信号与状态卡

它不负责：

- 承载主 Web 站点
- 承载 Telegram operator 壳
- 替代 `AB Console-Backend` 的基础设施能力

## 当前真实架构

- `AB Patrol-Agent` = Al Brooks 决策主脑
- `AB Patrol-Web` = 独立 Web 展示层
- `AB Console-Backend` = 执行、数据、参考后端
- `AB Console-Obsidian` = 知识库、课程笔记、旧交易样本

当前决策路径是：

1. 完整 Obsidian 知识库
2. Canonical Rulebook
3. 原始 `SKILL.md + S0-S7`
4. `AB Patrol-Agent`
5. `codex_cli` 长会话
6. `patrol_trade.py`
7. `execution-service`
8. Binance demo
9. Query Service / Web / TG

升级期间默认策略：

- 保留分析、推送、回放、可观测性
- 默认暂停自动交易
- 只有 parity / replay / demo 验证完成后才恢复 `--execute`

`OpenClaw` 当前只负责：

- host / TG operator
- workspace memory
- 对话入口

## 当前已修复

- `runtime-brief` 不再作为主知识源
- `canonical` 已接入运行时知识选择
- `S5` 交易方程已改回服从原规则
- `S6` 路由增强，支持多事件补足
- `S7` 动作已扩展到更多持仓管理动作
- 执行桥与 Binance demo 时间同步问题已修
- 决策已切到 `codex_cli` 长会话，而不是每轮冷启动

## 当前未完成

- `codex_cli` 仍可能超时
- 新架构下首笔自然新单还没稳定出现
- `S7-management` 还缺 live 持仓闭环验证
- Step 5 动态扫描规则仍在继续对齐原 Claude 版本
- 代码中仍有部分流程编排型硬规则，需继续下放给 agent

## 优先阅读

- 总览：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_SYSTEM_OVERVIEW_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/CURRENT_SYSTEM_OVERVIEW_20260308.md)
- Canonical 升级说明：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/AL_BROOKS_CANONICAL_UPGRADE_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/AL_BROOKS_CANONICAL_UPGRADE_20260308.md)
- 规则偏差审计：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/PARITY_RULE_AUDIT_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/PARITY_RULE_AUDIT_20260308.md)
- 硬编码规则矩阵：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/HARDCODED_RULE_MATRIX_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/HARDCODED_RULE_MATRIX_20260308.md)
- 目标状态：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/GOAL_STATUS_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/GOAL_STATUS_20260308.md)
- 运行流程：
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/RUNTIME_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/RUNTIME_FLOW.md)
