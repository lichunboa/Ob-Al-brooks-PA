# 项目边界说明（2026-03-08）

## 四套系统

### 1. AB Patrol-Agent

定位：

- Al Brooks 交易主脑
- 使用原始 `SKILL.md + S0-S7`
- 当前默认通过 `codex_cli` 长会话做 live 决策
- 负责巡逻、候选单判断、交易前校验、运行态写入

不负责：

- 替代后端基础设施
- 替代 Telegram operator 壳
- 作为通用 Web 项目宿主

### 2. AB Patrol-Web

定位：

- 独立 Patrol 展示层
- 通过 Query Service 读取 Patrol 当前状态
- 当前主 Web 入口已经迁到这里

不负责：

- 交易决策
- 执行下单
- 承担 Backend 的旧模块宿主职责

### 3. AB Console-Backend

定位：

- 基础设施与参考后端
- 目前主要提供：
  - `execution-service`
  - 数据/日志/部分兼容脚本来源
  - 参考实现和旧系统底座

不应再被描述成：

- 当前 Al Brooks Patrol 主脑
- 当前 Patrol 主 Web 入口

### 4. AB Console-Obsidian

定位：

- Al Brooks 知识库
- 课程纲要
- 图表百科
- 旧交易样本与复盘

它是知识 authority，不是 live 决策宿主。

## 当前主链

```text
AB Console-Obsidian 完整知识库
  -> Canonical Rulebook
  -> .claude / AB Patrol-Agent 中的原始知识副本
  -> AB Patrol-Agent
  -> codex_cli 长会话
  -> patrol_trade.py
  -> execution-service
  -> Binance demo
  -> Query Service / AB Patrol-Web / TG
```

当前默认模式：

- 升级期默认观察模式
- 只有显式 `--execute` 才恢复自动交易

## OpenClaw 的角色

当前 `OpenClaw` 主要负责：

- TG operator
- host
- workspace memory

当前它不是唯一决策 provider，也不是当前交易主脑本体。

## 当前仍未完成的边界问题

- `AB Patrol-Agent` 仍依赖 `AB Console-Backend` 的 `execution-service`
- 新架构下首笔自然新单还未稳定复现
- `S7-management` 还缺 live 仓位闭环验证
- `codex_cli` timeout 噪音仍在
- Canonical -> SKILL/S -> 代码的完全回写仍在进行中
