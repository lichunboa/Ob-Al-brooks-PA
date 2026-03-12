# SKILL Runtime Reference (2026-03-09)

这份文件承接从 `knowledge/patrol-l1/SKILL.md` 中剥离出去的运行维护信息。

原则：

- `SKILL.md` 只保留编排、状态机、Step 0-5 和路由
- 命令、端口、API、缓存字段、运行模式说明放在这里
- 交易理论仍然以 `canonical + S + Q` 为准

## 当前运行架构

- 决策：`codex_cli` 长会话
- Host/TG：`OpenClaw`
- 巡逻主脑：`AB Patrol-Agent`
- 展示：`query-service + AB Patrol-Web + TG`
- 恢复：`watchdog`

## 关键目录

- 运行状态：`AB Patrol-Agent/data/pa_trader/state`
- 周期文件：`AB Patrol-Agent/data/pa_trader/cycles`
- 决策日志：`AB Patrol-Agent/data/pa_trader/journal`
- 服务日志：`AB Patrol-Agent/run`

## 主要端口

- `8092`：execution-service
- `8086`：query-service
- `3001`：AB Patrol-Web
- `18789`：OpenClaw gateway

## 默认分析约束

- 多周期统一读取 `150 bars`
- 读盘约束：`浏览 80 + 精读最近 20`
- 缓存负责承接历史结构，不替代理论判断

## 当前启动入口

### Patrol-Agent

```bash
cd "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent"
bash scripts/start.sh start
bash scripts/start.sh status
bash scripts/start.sh stop
```

### 一键启动

```bash
bash "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/📁 启动工具/🚀 一键启动.command"
```

## 主要执行 API

- `GET /balance`
- `GET /positions`
- `GET /trading/bot-summary/{bot_id}`
- `GET /trading/can-trade/{bot_id}`
- `GET /klines/{symbol}/multi`
- `GET /trading/calculate-size/{bot_id}`
- `POST /order`
- `POST /order/{symbol}/close`
- `POST /order/{symbol}/modify-sl`
- `POST /order/{symbol}/modify-tp`

## 维护说明

- 如果要调理论，优先改 `canonical`
- 如果要调可执行规则，优先改 `S`
- 如果要调纪律与纠偏，改 `Q`
- 只有流程、阶段切换和路由变化，才改 `SKILL`

## 从 SKILL 移出的运行内容

以下内容不再属于 `SKILL` 主链，统一由 runtime / start.sh / Web / TG 维护：

- 命令行启动与停止方式
- 端口、API、执行桥细节
- 图表生成命令与输出目录
- TG / Web 推送格式与消息模板
- 周期汇报、预信号消息和图片推送实现
- 等待期间后台任务的具体命令
- 刷新、看门狗与 sidecar 的实现细节

如果这些内容需要调整，改这里或改 runtime，不要再塞回 `SKILL.md`。
