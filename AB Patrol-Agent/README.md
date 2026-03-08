# AB Patrol-Agent

`AB Patrol-Agent` 是 `PA交易 Crypto` 的独立 runtime 根目录。

当前结构：

- `knowledge/patrol-l1/`
  - 从原 `.claude/skills/patrol-l1/` 镜像出来的 `SKILL.md + S0-S7 + quotes`
- `runtime/pa_runtime.py`
  - 常驻 patrol loop
- `services/consumption/query-service/`
  - Query Service，统一输出 status / recent / decision
- `scripts/watchdog.py`
  - 15 分钟无新 cycle / query 异常时自动恢复 patrol loop
- `scripts/start.sh`
  - `start|stop|restart|recover|once|loop|status|recent|decision|logs`
- `run/`
  - PID 与 runtime 日志

设计原则：

- 尽量保持原 `patrol-l1` skill 的 Al Brooks 交易逻辑
- 把模型会话和交易状态拆开：状态落到 `AB Patrol-Agent/data/pa_trader/`
- `OpenClaw agent ab-patrol-runtime` 只负责 TG / operator host
- `ab-patrol-loop` 的 decision 现在走可切换 provider
- 每轮输出 `runtime_state / cycle / decision / execution_log`
- 每轮可推送状态到 TG 话题 `PA交易 Crypto`
- 可以通过 Query Service / Web / TG 三个入口查看状态

当前目录边界：

- `AB Patrol-Agent/knowledge/`
  - 原 Claude `skill + S 文件` 的运行副本
- `AB Patrol-Agent/tools/`
  - patrol 专用图表、AB 上下文、交易闸门、回测/回放脚本
- `AB Patrol-Agent/indicators/batch/`
  - `ab_ema / ab_sr / ab_mm / ab_patterns`
- `AB Patrol-Agent/data/`
  - patrol 状态、cycle、journal、charts
- `AB Patrol-Agent/.venv/`
  - patrol 自己的 Python 运行环境，不再依赖 `AB Console-Backend` 的虚拟环境
- `AB Patrol-Agent/config/`
  - patrol 自己的配置模板与本地 `.env`
- `AB Patrol-Agent/services/consumption/query-service/`
  - Patrol 专用 Query Service

当前外部基础设施依赖：

- `execution-service`：通过 HTTP 提供 K 线、持仓、下单、改止损
- `OpenClaw`：只负责 TG 话题、operator agent、可选 decision provider

当前已经借自上游 `tradecat` 的工程思路：

- Query Service 作为消费层统一读出口
- 更保守的默认启动链
- Agent 自己的 `config/.env`
- host / provider 解耦

当前真正使用中的原始资产：

- 原始 Claude skill：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/SKILL.md`
- 当前 runtime 副本：
  - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/SKILL.md`
- 当前 runtime 会按阶段加载 `S0-S7`：
  - `BOOTSTRAP`：全量读盘与建模
  - `ENTRY_READY`：方向/状态/关键位/评估/入场/管理
  - `MANAGE`：方向/关键位/评估/通用规则/管理

## 与原 Claude skill 的差异

保持不变的部分：

- `SKILL.md + S0-S7` 是当前决策 authority
- `tools/patrol_trade.py` 仍然是开仓前硬校验
- `execution-service` 仍然是仓位计算、下单、平仓、改止损入口
- `runtime_state / cycle / journal` 继续保留 patrol 语义
- `execution-service` 提供每周期 150 根 K 线；runtime 现在按原 S1 思路保留“浏览 80 根 + 精读 20 根”的读盘目标
- `tools/chart_gen.py` 已接入 patrol runtime 的 `analysis_board.chart_context`
- 图表上下文会调用 `ab_ema / ab_sr / ab_mm / ab_patterns`

当前还没完全接回的部分：

- `tools/sim_server.py` 逐根模拟还有一部分 backtest 依赖待清理
- `tools/backtest_v4.py / tools/backtest_tool.py` 还需要继续从参考项目抽离
- OpenClaw runtime 仍是“单轮 JSON 决策 + 外部状态持久化”，不是旧 Claude 那种单终端隐式长会话
- 目前仍然依赖外部基础设施服务本身（如 `execution-service`），但不再依赖 Backend 里的 patrol 脚本或 Python 环境

初始化：

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
./scripts/init.sh
```

这会创建 `AB Patrol-Agent/.venv` 并安装本项目自己的运行依赖。

本地配置模板：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/config/.env.example`

也就是说：

- 核心分析逻辑已经接回
- 图表上下文已经重新纳入 patrol loop 主循环
- 回测 / 逐根回放继续保持按需启动，不放进常驻巡逻里
- Query Service 是 Patrol 的统一可视化读出口
- watchdog 负责 15 分钟卡死自动恢复

常用命令：

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"

# 单轮 dry-run
./scripts/start.sh once

# 常驻 dry-run
./scripts/start.sh start

# 常驻真实执行（demo 环境）
./scripts/start.sh start --execute

# 走 OpenClaw host、decision 直连独立 provider
AB_PATROL_DECISION_PROVIDER=openai_compat \
AB_PATROL_LLM_API_BASE=http://127.0.0.1:11434/v1 \
AB_PATROL_LLM_MODEL=qwen2.5:14b \
./scripts/start.sh start --execute

# 查看状态
./scripts/start.sh status

# 最近几轮巡逻
./scripts/start.sh recent

# 最新决策 JSON
./scripts/start.sh decision

# 单独管理 watchdog
./scripts/start.sh watchdog-start
./scripts/start.sh watchdog-stop

# 看日志
./scripts/start.sh logs

# 停止
./scripts/start.sh stop
```

Web 看板：

- `AB Patrol-Web`：`http://127.0.0.1:3001`
