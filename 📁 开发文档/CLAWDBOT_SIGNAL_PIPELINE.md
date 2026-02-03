# OpenClaw 交易信号管道配置手册

**版本**: v2.1
**更新**: 2026-02-03
**适用**: AB Console Backend + OpenClaw 双机器人信号集成

---

## 1. 架构总览

### 1.1 双机器人架构

```
                              ┌─────────────────────────────────────┐
                              │         signal-service              │
                              │         (129条规则)                  │
                              └──────────────┬──────────────────────┘
                                             │
                                   SignalPublisher.publish()
                                             │
                              ┌──────────────┴──────────────────────┐
                              │      telegram-service/adapter.py     │
                              │         (strength >= 60)             │
                              └──────────────┬──────────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
            通道1: 文件              通道2: HTTP Webhook        失败队列
    ~/.clawdbot/signals/       POST /hooks/al-brooks-signal    failed_queue.jsonl
        signals.jsonl                        │
                    │                        │
                    └────────────────────────┼────────────────────────┘
                                             │
                              ┌──────────────┴──────────────────────┐
                              │         OpenClaw AI Agent             │
                              │         @chunboClawd_bot             │
                              │                                      │
                              │  1. Al Brooks 七步分析法              │
                              │  2. 匹配11大策略卡片                   │
                              │  3. 条件累积评分 (0-100)              │
                              │  4. 生成交易计划                      │
                              └──────────────┬──────────────────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
            用户 Telegram              后端 API 回调            Obsidian 笔记
         (简版报告 + 互动)        POST /api/clawdbot-report    POST /api/create-trade-note
                                         │                        │
                              ┌──────────┴──────────┐    ┌────────┴────────┐
                              │ @abconsole_backend_bot│    │ Daily/Trades/   │
                              │   (详版分析报告)       │    │ 自动创建交易笔记  │
                              └─────────────────────┘    └─────────────────┘
```

### 1.2 双机器人职责

| 机器人 | Token | 职责 |
|--------|-------|------|
| `@chunboClawd_bot` | OpenClaw 配置 | 用户交互、简版报告、AI 分析 |
| `@abconsole_backend_bot` | `8507333164:AAG_...` | 详版报告存档、原有 39 卡片/快照功能 |

---

## 2. OpenClaw 配置

### 2.1 配置文件位置

```
~/.clawdbot/openclaw.json
```

### 2.2 信号处理脚本（当前方案）

OpenClaw 使用文件轮询方式处理信号：

```
脚本位置: ~/.openclaw/workspace/al_brooks_processor.py
信号文件: ~/.clawdbot/signals/signals.jsonl
状态文件: ~/.clawdbot/signals/.processed
```

处理流程：
1. 定时检查信号文件修改时间
2. 读取新信号（JSON Lines 格式）
3. 调用 `al-brooks-trader` skill 进行七步分析
4. POST 详细报告到后端 API
5. 发送简要报告给用户

### 2.3 Hooks 配置（备用方案 - webhook 接收）

```json
{
  "hooks": {
    "enabled": true,
    "token": "<GATEWAY_TOKEN>",
    "mappings": [
      {
        "id": "al-brooks-signal",
        "match": {
          "path": "al-brooks-signal"
        },
        "action": "agent",
        "wakeMode": "now",
        "name": "Al Brooks Signal",
        "deliver": true,
        "channel": "telegram",
        "transform": "al-brooks-dual-send",
        "messageTemplate": "..."
      }
    ]
  }
}
```

### 2.4 Transform 模块

Transform 模块位于 `~/.clawdbot/transforms/al-brooks-dual-send.js`，负责：

1. 接收原始信号 payload
2. 提取后端 API 回调地址
3. 构造指令消息，指导 AI Agent 执行双输出

```javascript
// al-brooks-dual-send.js 核心逻辑
export default async function transform(ctx) {
    const payload = ctx.payload;
    const reportUrl = payload.backend_api?.report_url || 'http://127.0.0.1:8090/api/clawdbot-report';
    const noteUrl = payload.backend_api?.note_url || 'http://127.0.0.1:8090/api/create-trade-note';

    // 返回指令消息，AI Agent 将：
    // 1. 发送简版报告给用户
    // 2. POST 详版报告到 reportUrl
    // 3. (可选) POST 交易笔记到 noteUrl
    return { message: [...].join('\n') };
}
```

### 2.5 Skill 文档

AI Agent 的分析能力由 Skill 文档定义：

```
docs/clawdbot-integration/al-brooks-skill/SKILL.md
```

Skill 文档包含：
- 11 大策略卡片速查表
- 双输出格式要求
- 知识库引用指南
- 演进机制说明

---

## 3. 后端适配器配置

### 3.1 文件位置

```
AB Console-Backend/services/telegram-service/src/signals/adapter.py
```

### 3.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAWDBOT_WEBHOOK_URL` | `http://host.docker.internal:18789/hooks/al-brooks-signal` | Webhook 端点 |
| `CLAWDBOT_WEBHOOK_TOKEN` | `hooks-5fed4a9a7de03c2...` | **hooks.token**（非 gateway.auth.token） |
| `CLAWDBOT_THRESHOLD` | `60` | 推送阈值 (0-100 整数刻度) |
| `BACKEND_REPORT_URL` | `http://127.0.0.1:8090/api/clawdbot-report` | 详版报告回调 |
| `BACKEND_NOTE_URL` | `http://127.0.0.1:8090/api/create-trade-note` | 交易笔记回调 |

> **重要**: OpenClaw 有两个 token：
> - `gateway.auth.token` — Gateway API 认证
> - `hooks.token` — Webhook 端点认证（后端使用这个）
>
> 查看命令：`cat ~/.openclaw/openclaw.json | jq '.hooks.token'`

### 3.3 Docker 网络注意事项

在 Docker 容器中运行时：
- OpenClaw 运行在宿主机，容器内需使用 `host.docker.internal` 访问
- docker-compose.yml 已配置 `extra_hosts: host.docker.internal:host-gateway`
- 后端 API 回调地址使用容器内地址 `127.0.0.1:8090`

### 3.4 推送重试机制

adapter.py 实现了指数退避重试：

```python
async def _post_with_retry(url, json_data, headers, max_retries=2):
    for attempt in range(max_retries + 1):
        try:
            async with _http_session.post(url, json=json_data, headers=headers, timeout=10) as resp:
                if resp.status in (200, 202):
                    return True
        except Exception as e:
            if attempt < max_retries:
                await asyncio.sleep(2 ** attempt)  # 1s, 2s
    return False
```

### 3.5 推送统计

```python
from signals.adapter import get_push_stats

stats = get_push_stats()
# {'webhook_ok': 42, 'webhook_fail': 3, 'file_ok': 45, 'file_fail': 0}
```

---

## 4. 后端 API 端点

### 4.1 详版报告接收

```
POST /api/clawdbot-report
```

请求体：
```json
{
  "symbol": "BTCUSDT",
  "direction": "BUY",
  "strength": 82,
  "timeframe": "5m",
  "price": 97500.5,
  "signal_type": "20均线缺口",
  "analysis": "详细的 Al Brooks 分析内容...",
  "strategy_match": "策略卡片名称",
  "entry_price": 97500,
  "stop_loss": 97000,
  "take_profit": 98500,
  "position_size": "2%",
  "score": 82,
  "timestamp": "2026-02-02T08:30:00Z"
}
```

### 4.2 交易笔记创建

```
POST /api/create-trade-note
```

请求体：
```json
{
  "symbol": "BTCUSDT",
  "direction": "BUY",
  "timeframe": "5m",
  "entry_price": 97500,
  "stop_loss": 97000,
  "take_profit": 98500,
  "strategy": "20均线缺口",
  "score": 82,
  "analysis": "分析摘要..."
}
```

响应：
```json
{
  "success": true,
  "file_path": "Daily/Trades/260202_0830_模拟_BTCUSDT.md"
}
```

---

## 5. 服务端口汇总

| 服务 | 端口 | 协议 | 说明 |
|------|------|------|------|
| OpenClaw Gateway | 18789 | WebSocket + HTTP | OpenClaw AI Agent |
| API Service | 8088 | HTTP | 主 API 服务 |
| Sync Service | 8089 | HTTP | Obsidian 同步 |
| Telegram Service | 8090 | HTTP | Bot + 回调 API |
| Signal Service | 8083 | HTTP | 信号检测健康检查 |
| TimescaleDB | 5434 | PostgreSQL | 时序数据库 |
| Web Dashboard | 3000 | HTTP | 前端面板 |

---

## 6. 服务启动方式

### 6.1 启动方式汇总

| 服务 | 启动方式 | 重启后自动启动 | 说明 |
|------|----------|----------------|------|
| Docker Desktop | 一键启动脚本 | ❌ | 脚本会自动启动 |
| 后端微服务 | Docker Compose | ❌ | 随 Docker 启动 |
| OpenClaw Gateway | macOS LaunchAgent | ✅ | `RunAtLoad=true` |
| 信号处理脚本 | OpenClaw HEARTBEAT | ✅ | 随 Gateway 心跳触发 |

### 6.2 OpenClaw LaunchAgent 配置

```
~/Library/LaunchAgents/ai.openclaw.gateway.plist
```

- **RunAtLoad**: true（登录自动启动）
- **KeepAlive**: true（崩溃自动重启）
- **端口**: 18789

手动管理命令：
```bash
# 查看状态
launchctl list | grep openclaw

# 重启
launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway

# 停止
launchctl stop gui/$(id -u)/ai.openclaw.gateway

# 查看日志
tail -f ~/.openclaw/logs/gateway.log
```

### 6.3 信号处理触发机制

`al_brooks_processor.py` 由 OpenClaw HEARTBEAT 机制触发：
- OpenClaw 每次心跳时检查 `~/.clawdbot/signals/signals.jsonl`
- 如果文件修改时间 > 上次处理时间，执行信号处理
- 处理完成后更新 `~/.clawdbot/signals/.processed`

**无需配置 cron 或额外 LaunchAgent**。

---

## 7. Docker Compose 部署

### 7.1 启动所有服务

```bash
cd "AB Console-Backend"
export DOCKER_HOST="unix://$HOME/.docker/run/docker.sock"
docker compose up -d
```

### 7.2 查看服务状态

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ab-
```

### 7.3 查看日志

```bash
docker logs -f ab-telegram-service --tail 50
```

---

## 8. 故障排查

### 8.1 OpenClaw 无法从容器访问

```bash
# 检查 host.docker.internal 是否可达
docker exec ab-telegram-service python -c "
import urllib.request
try:
    r = urllib.request.urlopen('http://host.docker.internal:18789/', timeout=3)
    print(f'OpenClaw reachable: HTTP {r.status}')
except Exception as e:
    print(f'OpenClaw unreachable: {e}')
"
```

### 8.2 详版报告未发送到后端 Bot

1. 检查 transform 模块是否正确加载
2. 检查 AI Agent 是否执行了 HTTP POST
3. 查看 telegram-service 日志中的 `/api/clawdbot-report` 请求

```bash
docker logs ab-telegram-service 2>&1 | grep clawdbot-report
```

### 8.3 交易笔记未创建

1. 检查评分是否 >= 70（笔记创建阈值）
2. 检查 Obsidian vault 路径配置
3. 查看 API 响应

```bash
curl -X POST http://localhost:8090/api/create-trade-note \
  -H "Content-Type: application/json" \
  -d '{"symbol":"BTCUSDT","direction":"BUY","timeframe":"5m","entry_price":97500,"stop_loss":97000,"take_profit":98500,"strategy":"测试","score":85}'
```

---

## 9. 配置变更历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-02-03 | v2.1 | 修复 webhook 401 认证（使用 hooks.token 而非 gateway.auth.token） |
| 2026-02-03 | v2.1 | 修复 data-service common 模块缺失、信号文件 volume 映射 |
| 2026-02-03 | v2.1 | OpenClaw 文件轮询方案确认、信号处理脚本配置、API 端点验证通过 |
| 2026-02-02 | v2.0 | 双机器人架构、Transform 模块、后端 API 回调、交易笔记自动创建 |
| 2026-02-02 | v2.0 | 推送阈值 50 -> 60、重试机制、推送统计 |
| 2026-02-02 | v2.0 | Docker 网络修复 (host.docker.internal) |
| 2026-02-02 | v2.0 | Skill 文档重写（灵活分析 vs 模板化） |
| 2026-02-01 | v1.1 | 初始 OpenClaw 集成 |

---

## 10. 关键文件路径

| 用途 | 路径 |
|------|------|
| OpenClaw 配置 | `~/.clawdbot/openclaw.json` |
| 信号处理脚本 | `~/.openclaw/workspace/al_brooks_processor.py` |
| 信号文件 | `~/.clawdbot/signals/signals.jsonl` |
| 处理状态文件 | `~/.clawdbot/signals/.processed` |
| Transform 模块 | `~/.clawdbot/transforms/al-brooks-dual-send.js` |
| Skill 文档 | `docs/clawdbot-integration/al-brooks-skill/SKILL.md` |
| 后端适配器 | `services/telegram-service/src/signals/adapter.py` |
| Bot 主程序 | `services/telegram-service/src/bot/app.py` |
| Docker Compose | `docker-compose.yml` + `docker-compose.override.yml` |
| 启动工具 | `📁 启动工具/🚀 一键启动.command` |
| 状态检查 | `📁 启动工具/📊 状态检查.command` |
