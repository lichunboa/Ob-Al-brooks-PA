# Al Brooks 信号推送完整解决方案

## 📋 方案概述

**目标**: 后端检测到交易信号 → Clawdbot深度分析 → 用户收到专业交易建议

**当前状态**: 后端已配置双通道推送（文件 + HTTP备用）

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                        后端微服务架构                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │ data-service │────▶│signal-service│────▶│telegram-svc  │    │
│  │ (币安API)    │     │ (129条规则)  │     │ (@catbo26bot)│    │
│  └──────────────┘     └──────┬───────┘     └──────────────┘    │
│                              │                                   │
│                         SignalPublisher                          │
│                              │                                   │
│                              ▼                                   │
│              ┌───────────────────────────────┐                  │
│              │   on_signal_event()            │                  │
│              │   - 推送给订阅用户              │                  │
│              │   - 推送给Clawdbot ⭐          │                  │
│              └───────────────────────────────┘                  │
│                              │                                   │
│              ┌───────────────┴───────────────┐                  │
│              │                               │                  │
│              ▼                               ▼                  │
│    ┌──────────────────┐          ┌──────────────────┐          │
│    │ 写入信号文件      │          │ HTTP Webhook     │          │
│    │ /tmp/clawdbot_   │          │ (备用通道)       │          │
│    │ signals.jsonl    │          │                  │          │
│    └────────┬─────────┘          └──────────────────┘          │
│             │                                                   │
│             ▼                                                   │
│    ┌──────────────────┐                                        │
│    │ Clawdbot读取     │                                        │
│    │ (HEARTBEAT轮询)  │                                        │
│    └────────┬─────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│    ┌──────────────────┐                                        │
│    │ Al Brooks分析    │                                        │
│    │ - 七步分析法     │                                        │
│    │ - 策略匹配       │                                        │
│    │ - 条件评分       │                                        │
│    │ - 交易计划       │                                        │
│    └────────┬─────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│    ┌──────────────────┐                                        │
│    │ Telegram推送     │                                        │
│    │ (详细交易计划)   │                                        │
│    └──────────────────┘                                        │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
                    ┌──────────────────┐
                    │ 用户收到         │
                    │ - 简单信号(后端) │
                    │ - 深度分析(我)   │
                    └──────────────────┘
```

---

## 📁 关键配置文件

### 1. 后端适配器 (`telegram-service/src/signals/adapter.py`)

**已实现功能**:
```python
# 信号阈值
_CLAWDBOT_THRESHOLD = 0.5  # 测试阶段，可调整

# 信号文件路径
_CLAWDBOT_SIGNAL_FILE = "/tmp/clawdbot_signals.jsonl"

# 双通道推送
async def _notify_clawdbot(event: SignalEvent):
    # 通道1: 写入JSONL文件
    with open(_CLAWDBOT_SIGNAL_FILE, "a") as f:
        f.write(json.dumps(signal_data) + "\n")
    
    # 通道2: HTTP Webhook (备用)
    async with session.post(_CLAWDBOT_WEBHOOK_URL, ...)
```

### 2. HEARTBEAT配置 (`clawd/HEARTBEAT.md`)

**每分钟检查项**:
- [x] 读取后端信号文件 (`/tmp/clawdbot_signals.jsonl`)
- [x] 对新信号进行 Al Brooks 深度分析
- [x] 计算6条件评分
- [x] 分级响应

---

## 🔄 工作流程

### 阶段1: 信号检测 (后端自动)
1. signal-service 每60秒检测一次 (129条规则)
2. 检测到信号后调用 `SignalPublisher.publish(event)`
3. `on_signal_event()` 被执行:
   - 推送给所有订阅用户 (@catbo26bot)
   - 推送给 Clawdbot (写入文件)

### 阶段2: 信号读取 (Clawdbot每分钟)
1. 收到 HEARTBEAT 触发
2. 检查 `/tmp/clawdbot_signals.jsonl` 是否有新内容
3. 读取新信号并清空/记录位置

### 阶段3: 深度分析 (Clawdbot)
1. Al Brooks 七步分析
2. 匹配11大策略
3. 计算条件评分 (0-100分)
4. 生成交易计划:
   - 入场点
   - 止损点
   - 目标位
   - 盈亏比
   - 仓位建议

### 阶段4: 推送提醒 (Clawdbot)
- 评分 >80: 🚨 立即发送详细交易计划
- 评分 60-80: ⚠️ 发送关注提醒
- 评分 <60: 👁️ 记录观察

---

## ⚙️ 配置参数

### 阈值设置
```python
# 测试阶段 (所有信号都推送)
_CLAWDBOT_THRESHOLD = 0.5

# 生产环境 (只推送高概率信号)
# _CLAWDBOT_THRESHOLD = 0.75
```

### 信号文件格式
```jsonl
{"symbol": "BTCUSDT", "direction": "BUY", "strength": 0.82, "timeframe": "5m", "price": 77850.5, "signal_type": "20均线缺口", "timestamp": 1706789100, "received_at": "2026-02-01T08:30:00"}
{"symbol": "ETHUSDT", "direction": "SELL", "strength": 0.75, "timeframe": "15m", "price": 4320.2, "signal_type": "双重顶", "timestamp": 1706789160, "received_at": "2026-02-01T08:31:00"}
```

---

## 🚀 启动步骤

### 1. 确保后端服务运行
```bash
cd "AB Console-Backend"
make status
```

### 2. 重启 telegram-service (加载新配置)
```bash
cd services/telegram-service
pkill -f app.py
source .venv/bin/activate
python src/bot/app.py
```

### 3. 等待第一个信号
- 后端自动检测 (60秒间隔)
- 信号写入 `/tmp/clawdbot_signals.jsonl`
- Clawdbot 每分钟检查并分析

---

## 📝 输出示例

### 用户收到 (@catbo26bot - 简单版)
```
🟢 BUY | BTCUSDT

📌 20均线缺口
⏱ 周期: 5m
💰 价格: 77,850.50
📊 强度: [████████░░] 82%

💬 检测到做多信号
```

### 用户收到 (Clawdbot - 详细版)
```
🚨 Clawdbot 深度分析 - BTCUSDT

【后端信号】0.82 强度 | BUY | 5m

【Al Brooks 七步分析】
1. Always In: Long ✅
2. 周期: 强趋势 (20均线缺口)
3. Leg: H2确认 ✅
4. 计数: MTR已完成
5. 信号K: 趋势K ✅
6. 入场点: H2或市价
7. 保护位: H1低点

【策略匹配】
🔥 20均线缺口 (匹配度: 95%)

【条件评分】88分 - 提前准备！
├─ 后端信号: 25/25
├─ Always In: 20/20
├─ 策略匹配: 25/25
├─ 形态质量: 10/15
├─ 盈亏比: 8/10
└─ 多周期共振: 0/5

【交易计划】
方向: 做多 BTCUSDT
入场: 77,850 (H2或市价)
止损: 77,600 (-250点)
目标: 78,350 (+500点)
盈亏比: 2.0:1 ✅
仓位: 60%

【Al Brooks 金句】
"20均线缺口是高概率setup，H2是最佳入场点"
```

---

## 🔧 故障排查

### 问题1: 没有信号写入文件
**检查**:
```bash
cat /tmp/clawdbot_signals.jsonl
ls -la /tmp/clawdbot_signals.jsonl
```

**解决**:
- 确认 `signal-service` 正在运行
- 检查 `adapter.py` 中 `_CLAWDBOT_THRESHOLD` 设置
- 查看 `telegram.log` 是否有 Clawdbot 推送日志

### 问题2: 信号重复推送
**原因**: Clawdbot 和 @catbo26bot 分别推送

**解决**: 这是设计如此，Clawdbot 提供深度分析，@catbo26bot 提供简单提醒

### 问题3: 信号延迟
**原因**: 
- 后端检测间隔: 60秒
- Clawdbot 检查间隔: 60秒 (HEARTBEAT)
- 最大延迟: 2分钟

**优化**: 可调整 HEARTBEAT 为30秒检查一次

---

## ✅ 验证清单

- [ ] 后端服务全部运行 (`make status`)
- [ ] telegram-service 使用最新配置
- [ ] `/tmp/clawdbot_signals.jsonl` 文件可写入
- [ ] HEARTBEAT.md 包含信号文件检查
- [ ] Clawdbot 每分钟执行检查
- [ ] 测试信号能正常被检测和分析

---

*方案版本: v1.0*
*更新时间: 2026-02-01*
