# Clawdbot 交易信号管道配置手册

**版本**: v1.1
**更新**: 2026-02-01
**适用**: AB Console Backend + Clawdbot 信号集成

---

## 1. 架构总览

```
signal-service (129规则)
       |
  SignalPublisher.publish()
       |
  on_signal_event()
       |
       +---> push()          --> Telegram @catbo26bot (简单信号)
       |
       +---> _notify_clawdbot()
                |
                +---> 通道1: ~/.clawdbot/signals/signals.jsonl (文件，带锁)
                |
                +---> 通道2: POST /hooks/al-brooks-signal (HTTP webhook)
                |
                +---> 失败队列: ~/.clawdbot/signals/failed_queue.jsonl
                            |
                      Clawdbot AI Agent
                            |
                      Al Brooks 深度分析
                            |
                      Telegram @chunboClawd_bot (详细交易计划)
```

---

## 2. Clawdbot 配置

### 2.1 配置文件位置

```
~/.clawdbot/clawdbot.json
```

### 2.2 Hooks 配置（webhook 接收）

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
        "messageTemplate": "【交易信号到达】请使用 Al Brooks 价格行为分析法进行深度分析：\n\n品种: {{symbol}}\n方向: {{direction}}\n强度: {{strength}}\n周期: {{timeframe}}\n价格: {{price}}\n信号类型: {{signal_type}}\n时间戳: {{timestamp}}\n来源: {{source}}\n\n请执行以下分析：\n1. Al Brooks 七步分析法\n2. 匹配11大交易策略\n3. 计算条件累积评分（0-100分）\n4. 生成详细交易计划（入场点、止损、目标、仓位）\n5. 给出明确的操作建议"
      }
    ]
  }
}
```

### 2.3 Hooks 配置字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `hooks.enabled` | bool | Y | 启用 webhook 功能 |
| `hooks.token` | string | Y | Bearer 认证 token |
| `hooks.path` | string | N | 基础路径前缀，默认 `/hooks` |
| `hooks.maxBodyBytes` | int | N | 最大请求体，默认 256KB |
| `hooks.mappings` | array | N | 自定义端点映射列表 |
| `hooks.presets` | string[] | N | 预设映射，如 `["gmail"]` |

### 2.4 Mapping 对象字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 映射唯一标识 |
| `match.path` | string | URL 路径匹配（不含 `/hooks/` 前缀） |
| `match.source` | string | 按 payload 中的 source 字段匹配 |
| `action` | `"wake"` / `"agent"` | wake=唤醒主会话, agent=启动独立代理 |
| `wakeMode` | `"now"` / `"next-heartbeat"` | 立即执行或等下次心跳 |
| `name` | string | 显示名称 |
| `deliver` | bool | 是否将结果发送到 channel |
| `channel` | string | 投递渠道: telegram/whatsapp/discord/slack/last |
| `to` | string | 目标用户（可选） |
| `messageTemplate` | string | 消息模板，支持 `{{field}}` 变量 |
| `model` | string | 指定 AI 模型（可选） |
| `sessionKey` | string | 会话 key（可选，用于保持上下文） |
| `timeoutSeconds` | int | 超时秒数（可选） |

### 2.5 模板变量

模板支持以下变量来源：

```
{{field}}           -> payload 顶层字段
{{payload.field}}   -> 显式 payload 字段
{{headers.field}}   -> 请求头
{{query.field}}     -> URL 查询参数
{{path}}            -> 匹配的路径
{{now}}             -> 当前 ISO 时间戳
```

数组访问: `{{messages[0].subject}}`

---

## 3. 后端适配器配置

### 3.1 文件位置

```
AB Console-Backend/services/telegram-service/src/signals/adapter.py
```

### 3.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAWDBOT_WEBHOOK_URL` | `http://127.0.0.1:18789/hooks/al-brooks-signal` | Webhook 端点 |
| `CLAWDBOT_WEBHOOK_TOKEN` | (内置默认) | Bearer 认证 token |
| `CLAWDBOT_THRESHOLD` | `50` | 推送阈值 (0-100 整数刻度) |
| `CLAWDBOT_SIGNAL_DIR` | `~/.clawdbot/signals` | 信号文件目录 |

### 3.3 strength 字段语义

**统一规范**: `strength` 是 `int` 类型，范围 `0-100`。

| 范围 | 含义 | 后端行为 |
|------|------|---------|
| 0-49 | 低强度信号 | 仅推送给 Telegram 订阅用户 |
| 50-100 | 中高强度信号 | 推送给用户 + Clawdbot 深度分析 |

**阈值调整**:
- 测试阶段: `CLAWDBOT_THRESHOLD=50`（大部分信号都推送）
- 生产环境: `CLAWDBOT_THRESHOLD=75`（仅高概率信号）

### 3.4 双通道推送机制

| 通道 | 方式 | 优先级 | 失败处理 |
|------|------|--------|---------|
| 文件通道 | `~/.clawdbot/signals/signals.jsonl` | 主通道 | 记录错误日志 |
| HTTP 通道 | `POST /hooks/al-brooks-signal` | 辅助通道 | 记录详细错误（状态码+响应体） |
| 失败队列 | `~/.clawdbot/signals/failed_queue.jsonl` | 兜底 | 双通道都失败时写入 |

### 3.5 信号文件格式 (JSONL)

```jsonl
{"symbol":"BTCUSDT","direction":"BUY","strength":82,"timeframe":"5m","price":97500.5,"signal_type":"20均线缺口","timestamp":"2026-02-01T08:30:00","received_at":"2026-02-01T08:30:01+00:00"}
```

### 3.6 文件轮转

- 阈值: 5MB
- 轮转后文件名: `signals.20260201_083000.jsonl`
- 保留最近 5 个归档
- 带 `fcntl.flock` 文件锁，防并发写入损坏

---

## 4. 信号发布器持久化

### 4.1 文件位置

```
AB Console-Backend/services/signal-service/src/events/publisher.py
```

### 4.2 失败恢复机制

当 `SignalPublisher.publish()` 的**所有回调都失败**时，信号会被写入磁盘：

```
~/.clawdbot/signals/publish_failures.jsonl
```

可通过以下方法访问：

```python
from events import SignalPublisher

# 读取失败信号
failed = SignalPublisher.get_failed_signals()

# 重试成功后清空
SignalPublisher.clear_failed_signals()
```

---

## 5. 服务管理

### 5.1 Clawdbot Gateway

```bash
# 状态检查
launchctl list | grep clawdbot
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:18789/

# 重启
launchctl kickstart -k gui/$(id -u)/com.clawdbot.gateway

# 日志
tail -f ~/.clawdbot/logs/gateway.log       # 主日志
tail -f ~/.clawdbot/logs/gateway.err.log   # 错误日志
tail -f /tmp/clawdbot/clawdbot-$(date +%Y-%m-%d).log  # 详细运行日志
```

### 5.2 LaunchAgent 配置

```
~/Library/LaunchAgents/com.clawdbot.gateway.plist
```

- 命令: `node clawdbot/dist/entry.js gateway --port 18789`
- KeepAlive: true（崩溃自动重启）
- RunAtLoad: true（登录自动启动）

### 5.3 Telegram Service

```bash
# 启动
cd "AB Console-Backend/services/telegram-service"
source .venv/bin/activate
python src/bot/app.py &

# 停止
pkill -f "telegram-service.*app.py"
```

### 5.4 Webhook 手动测试

```bash
curl -X POST http://127.0.0.1:18789/hooks/al-brooks-signal \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "direction": "BUY",
    "strength": 85,
    "timeframe": "5m",
    "price": 97500.5,
    "signal_type": "20均线缺口",
    "timestamp": "2026-02-01T08:30:00",
    "source": "signal-service"
  }'

# 成功返回: {"ok":true,"runId":"<uuid>"}  HTTP 202
```

---

## 6. 关键文件路径

| 用途 | 路径 |
|------|------|
| Clawdbot 主配置 | `~/.clawdbot/clawdbot.json` |
| Clawdbot gateway 日志 | `~/.clawdbot/logs/gateway.log` |
| Clawdbot 错误日志 | `~/.clawdbot/logs/gateway.err.log` |
| Clawdbot 运行时日志 | `/tmp/clawdbot/clawdbot-YYYY-MM-DD.log` |
| 信号文件 | `~/.clawdbot/signals/signals.jsonl` |
| 失败队列 | `~/.clawdbot/signals/failed_queue.jsonl` |
| 发布失败队列 | `~/.clawdbot/signals/publish_failures.jsonl` |
| 后端适配器 | `AB Console-Backend/services/telegram-service/src/signals/adapter.py` |
| 信号发布器 | `AB Console-Backend/services/signal-service/src/events/publisher.py` |
| 事件类型定义 | `AB Console-Backend/services/signal-service/src/events/types.py` |
| LaunchAgent | `~/Library/LaunchAgents/com.clawdbot.gateway.plist` |
| Al Brooks Skill 文档 | `docs/clawdbot-integration/al-brooks-skill/` |

---

## 7. 端口汇总

| 服务 | 端口 | 协议 |
|------|------|------|
| Clawdbot Gateway | 18789 | WebSocket + HTTP |
| Clawdbot Browser Control | 18791 | HTTP |
| API Service | 8088 | HTTP |
| Sync Service | 8089 | HTTP |
| TimescaleDB | 5434 | PostgreSQL |
| Web Dashboard | 3000 | HTTP |

---

## 8. 已知问题与待修复项

### 已修复 (2026-02-01)

| 编号 | 问题 | 修复内容 |
|------|------|---------|
| C-3 | asyncio 死路 | `_notify_clawdbot` 合并到 `push_all()` 协程，统一通过 `run_coroutine_threadsafe` 调度 |
| H-2 | strength 类型混乱 | 阈值统一为 int(0-100)，`_CLAWDBOT_THRESHOLD=50` |
| H-1 | 信号丢失无恢复 | 添加磁盘失败队列 `publish_failures.jsonl` + `failed_queue.jsonl` |
| H-5 | HTTP 错误被吞没 | 分类记录 HTTP 状态码、响应体、连接错误 |
| H-6 | 信号文件无限增长 | 5MB 轮转 + 保留最近 5 个归档 |
| - | 无文件锁 | 添加 `fcntl.flock` 防并发损坏 |
| - | session 不复用 | 模块级 `_http_session` 复用 |
| - | hooks 配置格式错误 | `hooks.entries` -> `hooks.mappings` 数组格式 |
| - | webhook URL 路径错误 | `/webhook/` -> `/hooks/` |
| - | webhook 缺少认证 | 添加 `Authorization: Bearer` 头 |

### 待修复

| 编号 | 严重度 | 问题 | 建议 |
|------|--------|------|------|
| C-1 | CRITICAL | 凭证硬编码 | 所有 token/apiKey 迁移到环境变量或 secret manager |
| C-2 | CRITICAL | `/tmp` 仍被旧代码引用 | 更新 `signal_listener.py` 和 `HEARTBEAT.md` 中的路径 |
| H-3 | HIGH | PG 引擎冷却键不含 timeframe | 冷却键格式改为 `pg:{symbol}_{signal_type}_{timeframe}` |
| H-4 | HIGH | DB 单连接无连接池 | 引入连接池或至少指数退避重试 |
| M-1 | MEDIUM | `SignalEvent.from_dict()` 无验证 | 添加 direction/strength 范围校验 |
| M-3 | MEDIUM | `signal_listener.py` bare except | 改为具体异常类型 + 日志 |
| M-6 | MEDIUM | daemon 线程无优雅停止 | 主进程退出时调用 `engine.stop()` |
| M-7 | MEDIUM | SQLite 表名 f-string 拼接 | 已有白名单保护，低优先级 |

---

## 9. 故障排查

### 9.1 Clawdbot 无法启动

```bash
# 检查配置是否合法
cat ~/.clawdbot/logs/gateway.err.log | tail -20

# 常见错误:
# "Unrecognized key" -> 配置字段名错误，参考本文档第 2 节
# "hooks.enabled requires hooks.token" -> 缺少 token
# "MODULE_NOT_FOUND" -> node 版本或 clawdbot 安装损坏

# 修复后重启
launchctl kickstart -k gui/$(id -u)/com.clawdbot.gateway
```

### 9.2 信号没有推送到 Clawdbot

```bash
# 1. 检查信号文件是否有新内容
ls -la ~/.clawdbot/signals/signals.jsonl

# 2. 检查失败队列
cat ~/.clawdbot/signals/failed_queue.jsonl

# 3. 手动测试 webhook
curl -X POST http://127.0.0.1:18789/hooks/al-brooks-signal \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"symbol":"TEST","direction":"BUY","strength":90,"timeframe":"5m","price":100,"signal_type":"test","source":"manual"}'

# 4. 检查 telegram-service 日志
grep -i clawdbot AB\ Console-Backend/services/telegram-service/logs/*.log
```

### 9.3 Telegram 没有收到消息

```bash
# 检查 clawdbot 是否连接了 Telegram
grep telegram ~/.clawdbot/logs/gateway.log | tail -5

# 检查 bot 是否在线
curl -s "https://api.telegram.org/bot<BOT_TOKEN>/getMe"
```

---

## 10. 配置变更历史

| 日期 | 变更 | 原因 |
|------|------|------|
| 2026-02-01 | `hooks.entries` -> `hooks.mappings` | 原格式不被 clawdbot 识别，导致服务崩溃 |
| 2026-02-01 | webhook URL `/webhook/` -> `/hooks/` | 对齐 clawdbot 实际路由前缀 |
| 2026-02-01 | 添加 Bearer 认证头 | clawdbot hooks 要求 token 认证 |
| 2026-02-01 | strength 阈值 0.5 -> 50 | 统一为 int(0-100) 刻度 |
| 2026-02-01 | 信号文件从 `/tmp` -> `~/.clawdbot/signals/` | 安全加固 |
| 2026-02-01 | 添加文件锁、轮转、失败队列 | 可靠性加固 |
