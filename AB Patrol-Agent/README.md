# AB Patrol-Agent

`AB Patrol-Agent` 是当前项目中独立的 Al Brooks 巡逻交易主脑。

当前目标不是“先想办法下几笔单”，而是先把整套 Patrol 升级到尽可能接近完整 Al Brooks 理论的状态，再恢复稳定的多市场自动执行。

## 当前最高权威

当前权威层级已经固定为：

1. `AB Console-Obsidian` 中完整的 Al Brooks 知识库
2. `knowledge/patrol-l1/canonical/` Canonical Rulebook
3. `knowledge/patrol-l1/SKILL.md + references/S0-S7`
4. 代码中的执行安全 / 持久化 / 展示逻辑

关键点：

- `canonical` 是理论层
- `SKILL/S` 是 agent 的可执行子集
- 代码不允许再发明新的策略门槛、偏见或固定过滤器
- `runtime-brief` 已退出主链，不再作为知识源

## 升级期默认策略

当前处于 Parity 升级期。默认行为是：

- 保留采集、分析、推送、回放、Query、Web
- 暂停自动交易
- 先完成理论层、`SKILL/S`、代码规则、回放验证
- 达到门槛后再恢复 Binance demo 自动执行

默认模式由以下配置控制：

- `config/.env.example`
  - `AB_PATROL_ENABLE_AUTOTRADE=0`

也就是说：

- `./scripts/start.sh start` 默认是观察模式
- 只有显式 `--execute` 或设置 `AB_PATROL_ENABLE_AUTOTRADE=1` 才会自动交易

## 当前真实架构

```text
完整 Al Brooks 知识库 (AB Console-Obsidian)
  -> Canonical Rulebook
  -> SKILL.md + S0-S7
  -> AB Patrol-Agent
  -> codex_cli 长会话
  -> patrol_trade.py 执行安全校验
  -> execution-service
  -> Binance demo / cTrader demo
  -> Query Service / AB Patrol-Web / TG
```

`OpenClaw` 当前只负责：

- TG operator
- host
- workspace memory

它不是当前交易主脑，也不是唯一决策 provider。

## 当前目录边界

- `knowledge/patrol-l1/`
  - 巡逻知识树
  - 包含 `canonical/`、`SKILL.md`、`references/`
- `runtime/`
  - 巡逻循环、决策、状态机、执行编排、TG 渲染
- `tools/`
  - `patrol_trade.py`、`patrol_scan.py`、`chart_gen.py`、回放/回测工具
- `services/consumption/query-service/`
  - 状态与审计出口
- `data/pa_trader/`
  - `runtime_state / decision_session / cycles / journals / charts`
- `scripts/`
  - 启停脚本、watchdog、初始化

## 当前已经接回的核心能力

- 原始 `SKILL.md + S0-S7`
- `ab_ema / ab_sr / ab_mm / ab_patterns`
- `150 bars / 浏览 80 / 精读 20`
- `codex_cli` 长会话决策
- `Query Service / Web / TG` 可见性
- `watchdog` 自恢复骨架
- `execution-service` 的 Binance demo / cTrader demo 执行链

## 当前仍未完成的重点

- `codex_cli` 长会话稳定性仍需继续打磨
- 新架构下首笔自然 `OPEN_ORDER` 还没稳定复现
- `S7-management` 还缺新架构下的 live 闭环验证
- `SKILL/S` 与完整知识库的回写式重构仍在进行中
- 代码中仍有部分流程编排型硬规则，需要继续下放给 agent

## 当前最重要的文档

- 规范层：
  - `knowledge/patrol-l1/canonical/README.md`
- Patrol 文档入口：
  - `docs/README.md`
- 当前规则偏差审计：
  - `../docs/archive/patrol-agent/HARDCODED_RULE_MATRIX_20260308.md`
- 当前运行链：
  - `docs/RUNTIME_FLOW.md`

## 初始化

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/init.sh
```

这会创建 `AB Patrol-Agent/.venv` 并安装本项目自己的运行依赖。

## 常用命令

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"

# 单轮观察
./scripts/start.sh once

# 常驻观察（升级期默认）
./scripts/start.sh start

# 查看状态 / 最近几轮 / 最新决策
./scripts/start.sh status
./scripts/start.sh recent
./scripts/start.sh decision

# 单独管理 watchdog
./scripts/start.sh watchdog-start
./scripts/start.sh watchdog-stop

# 看日志
./scripts/start.sh logs

# 停止
./scripts/start.sh stop
```

只有在 parity / replay / demo 验证通过后，才应启用：

```bash
./scripts/start.sh start --execute
```

## Web 看板

- `AB Patrol-Web`：
  - [http://127.0.0.1:3001](http://127.0.0.1:3001)
