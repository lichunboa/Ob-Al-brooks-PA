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
- Patrol 体系自身的基础设施能力

## 当前真实架构

- `AB Patrol-Agent` = Al Brooks 决策主脑与当前后端主目录
- `AB Patrol-Web` = 独立 Web 展示层
- `AB Console-Obsidian` = 知识库、课程笔记、旧交易样本

## 近期代码结构调整

- `runtime/pa_runtime.py` 已持续拆分为多 mixin 与工具模块
- `services/signal-service/src/engines/pa_engine.py` 的共享层已抽到 `services/signal-service/src/engines/pa/`
- `engines/pa/models.py` 负责 PA 数据模型
- `engines/pa/analysis.py` 负责 K 线/周期/时段分析工具
- `engines/pa/risk.py` 负责 PA 信号风控

## 历史文档说明

- 2026-03-10 之前的迁移、隔离、审计文档里，可能仍会提到 `AB Console-Backend`。
- 这些文档保留是为了追踪迁移决策，不代表当前运行目录仍然存在。
- 顶层项目里带旧路径的快照文档，已经统一移动到 `docs/archive/`。
- 当前所有实际代码、命令、脚本路径，以 `AB Patrol-Agent` 和 `AB Patrol-Web` 为准。

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
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/archive/CURRENT_SYSTEM_OVERVIEW_20260308.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/docs/archive/CURRENT_SYSTEM_OVERVIEW_20260308.md)
- Canonical 升级说明：
  - `AL_BROOKS_CANONICAL_UPGRADE_20260308.md`
- 规则偏差审计：
  - `PARITY_RULE_AUDIT_20260308.md`
- 硬编码规则矩阵：
  - `HARDCODED_RULE_MATRIX_20260308.md`
- 目标状态：
  - `GOAL_STATUS_20260308.md`
- 运行流程：
  - `RUNTIME_FLOW.md`
