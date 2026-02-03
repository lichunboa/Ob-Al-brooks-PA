# Gateway 超时问题分析报告

**日期**: 2026-02-04 02:00
**状态**: 待解决（下次升级处理）

---

## 问题现象

```
Gateway 超时，无法通过 API 删除 cron job f40e7cf5-d211-4494-b08e-2be11d16c480
```

- Cron job 删除失败
- Gateway RPC 调用超时（默认 10 秒）
- Session lock 频繁超时

---

## 根本原因

从日志分析，问题是 **Cron Lane 队列堆积**：

```
lane=cron queueSize=8
lane=cron queueSize=9
lane wait exceeded: waitedMs=450629 queueAhead=7  # 等待了 7.5 分钟！
```

### 核心问题

| 问题 | 说明 |
|------|------|
| **Cron 任务队列堆积** | 队列中有 7-9 个任务在排队 |
| **单任务执行时间过长** | 每个任务执行 33-87 秒 |
| **等待时间过长** | 任务等待超过 7 分钟才能执行 |
| **Gateway 超时** | 默认 10 秒超时，但任务需要等待 7+ 分钟 |

### 为什么会堆积？

| 原因 | 说明 |
|------|------|
| **信号密集** | 每 5 分钟多个币种同时触发信号 |
| **Cron Job 过多** | 每个模拟交易创建一个 cron job |
| **模型 Rate Limit** | 所有模型都在 cooldown，任务执行慢 |
| **Session Lock** | 并发访问导致 lock 超时 |

---

## 解决方案

### 短期（立即）

```bash
# 1. 重启 Gateway 清空队列
openclaw gateway restart

# 2. 清理过期的 cron jobs（手动）
openclaw cron list | grep trade-tracker | head -20
# 然后逐个删除已完成的

# 3. 清理 session locks
rm -f ~/.openclaw/agents/main/sessions/*.lock
```

### 中期（本周）

1. **减少 Cron Job 数量** — 改用 Heartbeat 统一追踪
2. **提高信号阈值** — 已从 60 调到 80，减少模拟交易数量
3. **减少监控币种** — 比如只保留 BTC/ETH

### 长期（架构优化）

1. **批量追踪** — 一个 Heartbeat 检查所有活跃交易，而不是每个交易一个 Cron
2. **增加 Gateway 超时** — 配置更长的超时时间
3. **优化 Session Lock** — 减少并发冲突
4. **信号去重** — 避免重复信号触发

---

## Heartbeat vs Cron 追踪模式对比

| 模式 | 优点 | 缺点 |
|------|------|------|
| **Cron（每交易一个）** | 精确追踪、独立隔离 | 任务堆积、Gateway 压力大、删除困难 |
| **Heartbeat（批量）** | 减少任务数、统一管理 | 检查间隔不精确、可能漏检、依赖主会话 |

### 建议方案

采用 **混合模式**：
1. 使用 Heartbeat 进行批量状态检查（每 5 分钟）
2. 在 `active_trades.json` 中维护所有活跃交易
3. Heartbeat 触发时遍历检查所有交易状态
4. 不再为每个交易创建独立的 Cron job

---

## 相关配置

### 信号阈值（已调整）

```bash
# 后端 .env
CLAWDBOT_THRESHOLD=80  # 从 60 调整到 80
```

### Skill 阈值（已调整）

```
# al-brooks-skill/SKILL.md
评分 >= 75 推送到 Telegram
评分 >= 80 创建模拟交易
```

---

## 临时解决方案

当 Gateway 超时时，手动执行：

```bash
# 1. 清理 session locks
rm -f ~/.openclaw/agents/main/sessions/*.lock

# 2. 重启 Gateway
openclaw gateway restart

# 3. 检查 cron jobs
openclaw cron list | grep trade-tracker

# 4. 删除已完成的 cron jobs
openclaw cron rm <job-id>
```

---

## 下次升级待办

- [ ] 实现 Heartbeat 批量追踪模式
- [ ] 增加 Gateway 超时配置
- [ ] 优化 Session Lock 机制
- [ ] 添加信号去重逻辑
- [ ] 减少 Cron job 数量

---

## 已实施的解决方案（2026-02-04 02:33）

### 使用 exec 替代 cron tool

**问题**：`cron` tool 通过 Gateway RPC 操作，经常超时

**解决方案**：改用 `exec` 执行 `openclaw cron` CLI 命令

**已更新文件**：`~/.openclaw/skills/al-brooks-simtrade/SKILL.md`

**修改内容**：

| 章节 | 修改 |
|------|------|
| 3.5 创建 Cron 追踪任务 | 改用 `exec` 执行 CLI 命令 |
| 5.3 删除 Cron Job | 改用 `exec` 执行 CLI 命令 |
| 9. Cron Job 管理命令 | 所有操作都改用 `exec` |

**代码示例**：

```python
# 之前（使用 cron tool，经常超时）
cron(action="add", job={...})

# 现在（使用 exec + CLI，更稳定）
exec(
    command='openclaw cron add --name "trade-tracker-xxx" --every 5m ...',
    timeout=30
)
```

**优点**：
1. **更稳定** — CLI 命令不依赖 Gateway RPC
2. **超时可控** — exec 有 timeout 参数（建议 30 秒）
3. **失败可重试** — 如果失败，可以立即重试

**注意**：即使使用 exec，当 Gateway 负载过重时仍可能超时。根本解决方案仍需要减少 cron job 数量或优化 Gateway 性能。

---

*报告更新时间: 2026-02-04 02:37*
