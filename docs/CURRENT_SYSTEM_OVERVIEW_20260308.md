# 当前系统总览（2026-03-08）

这份文档只记录 2026-03-08 时点的真实状态，不回避当前还没完成的部分。

## 当前目录结构

```text
Al-brooks-PA/
├── AB Patrol-Agent/                 # Al Brooks 交易主脑
│   ├── knowledge/patrol-l1/         # 运行中的 SKILL.md + S0-S7 副本
│   ├── runtime/                     # loop / decision / TG 渲染 / 执行编排
│   ├── tools/                       # patrol_trade / patrol_scan / chart_gen 等
│   ├── services/consumption/query-service/
│   ├── data/pa_trader/              # runtime_state / cycles / journals
│   └── scripts/                     # start / watchdog / init
├── AB Patrol-Web/                   # 独立 Web 展示层（3001）
├── AB Console-Backend/              # 数据、执行、Telegram、数据库底座 + 参考项目
├── AB Console-Obsidian/             # Al Brooks 知识库、课程资料、复盘
├── docs/                            # 项目级文档
└── ~/.openclaw/                     # OpenClaw host、TG operator、工作区记忆
```

## 当前真实主链

```text
完整 Al Brooks 知识库
  -> Canonical Rulebook
  -> 原始 patrol-l1 SKILL.md + S0-S7
  -> AB Patrol-Agent
  -> codex_cli 长会话
  -> patrol_trade.py
  -> execution-service :8092
  -> Binance demo
  -> Query Service :8086 / AB Patrol-Web :3001 / TG 话题 "PA交易 Crypto"
```

### 关键说明

- 当前默认决策不是 `OpenClaw GPT 5.4`。
- 当前默认决策是 `codex_cli` 长会话。
- 当前默认运行模式不是自动交易，而是观察模式。
- `OpenClaw` 当前负责：
  - TG operator
  - 工作区记忆
  - 启停与状态查询外壳
- `AB Patrol-Agent` 不再使用 `runtime-brief` 作为主知识源。
- 当前运行 authority 是 `完整知识库 -> canonical -> 原始 SKILL.md + S0-S7`。

## 当前 OpenClaw / TG 映射

| 话题 | TG 链接 | Agent | 作用 |
| --- | --- | --- | --- |
| 涟漪 | `https://t.me/c/3512657369/2` | `ripple` | 个人助理 |
| PA交易 Crypto | `https://t.me/c/3512657369/3` | `ab-patrol-runtime` | 交易状态、解释、控制入口 |
| 系统维护 | `https://t.me/c/3512657369/4` | `system-maintenance` | 项目系统维护 |

当前身份分工：

- `ab-patrol-runtime`：TG 人机交互壳
- `codex_cli` 长会话：默认 live 决策执行层
- `claude-pa`：execution-service 里的 bot allocation / 执行身份

## 当前真实运行状态

以最近一次状态检查为准：

- `patrol = UP`
- `execution-service = UP`
- `provider = codex_cli`
- `can_trade = True`
- `dry_run = False`
- `positions = 0`
- `open_orders = 0`
- `latest_cycle = cycle_20260308_175307`

当前这轮结论：

- `BTC / ETH / BNB` 背景整体仍偏空
- 但都从支撑磁体打出反弹，尚未完成 break-and-hold 接受
- 所以这轮是 `LOG_ONLY`，不是自动开仓

## 当前已修

- `P×R` gate 已对齐 `S5-evaluation`
- `S6` 路由已增强
- `S7` 动作已扩展：
  - `OPEN_ORDER`
  - `CLOSE_POSITION`
  - `MODIFY_STOP_LOSS`
  - `MODIFY_TAKE_PROFIT`
  - `PARTIAL_CLOSE`
  - `CANCEL_ALL_ORDERS`
  - `LOG_ONLY`
- `execution-service` 已修 Binance 时间漂移自动校时
- 手动模拟盘执行链已验证：
  - 下单成功
  - 撤单成功
  - 市价成交和平仓成功

## 当前未完成

### 1. 决策层稳定性还不够

- `codex_cli` 仍会 timeout
- timeout 时系统会 fallback，不代表真实自然交易恢复

### 2. 新架构下首笔自然自动新单还没稳定出现

- 已出现过候选单
- 执行桥的大 bug 已修
- 但还没有稳定自然积累新订单

### 3. `S7-management` 还缺 live 闭环验证

- 代码已经支持更多管理动作
- 但还没有在“新架构自动新仓”上完整验证：
  - 开仓
  - 分批止盈
  - 调整止损
  - 调整止盈
  - 平仓

### 4. 可观测性外围还不够稳

- `query-service / watchdog` 有时会显示掉线或驻留不稳
- 不影响核心代码方向，但影响“是不是活着”的判断体验

### 5. 升级期仍未到恢复自动交易的门槛

- 当前默认维持观察模式
- 需要先完成：
  - Canonical -> SKILL/S 回写
  - 代码硬规则矩阵继续清理
  - 回放集对齐
  - 新架构下 `OPEN_ORDER -> S7-management -> EXIT` demo 闭环

## 关键路径

| 路径 | 用途 |
| --- | --- |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/SKILL.md` | 当前运行中的 patrol 主 skill |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/` | 当前运行中的 S0-S7 |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/SKILL.md` | 原始 Claude authority |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/state/runtime_state.json` | 当前 runtime 状态 |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/state/decision_session.json` | codex_cli 长会话 session |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/cycles/` | cycle 输出 |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/journal/execution_log.jsonl` | 执行日志 |
| `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Backend/services/execution-service/src/` | 执行 API |
| `http://127.0.0.1:8086/api/v1/runtime/card` | Query Service |
| `http://127.0.0.1:3001/pa-bot` | Patrol Web |
