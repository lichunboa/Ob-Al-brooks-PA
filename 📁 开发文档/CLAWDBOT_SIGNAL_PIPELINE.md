# OpenClaw 交易信号管道配置手册

**版本**: v2.2
**更新**: 2026-02-03
**适用**: AB Console Backend + OpenClaw 双机器人信号集成

---

## 1. 架构总览

### 1.1 完整信号流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           信号检测层 (Signal Detection)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  signal-service (129条规则)                                                  │
│  ├── core/        核心规则 (价格突破、均线交叉等)                              │
│  ├── momentum/    动量规则 (RSI、MACD、KDJ等)                                 │
│  ├── trend/       趋势规则 (趋势强度、方向等)                                  │
│  ├── volatility/  波动率规则 (ATR、布林带等)                                  │
│  ├── volume/      成交量规则 (放量、缩量等)                                   │
│  ├── futures/     合约规则 (持仓量、资金费率等)                               │
│  ├── pattern/     形态规则 (双顶双底、楔形等)                                 │
│  └── misc/        其他规则                                                   │
│                                                                              │
│  检测周期: 60秒                                                              │
│  评分阈值: strength >= 60 才推送给 Clawdbot                                  │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                         SignalPublisher.publish()
                                   │
┌──────────────────────────────────┴──────────────────────────────────────────┐
│                           信号分发层 (Signal Distribution)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  telegram-service/adapter.py                                                │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ 通道1: 文件写入  │  │ 通道2: Webhook  │  │ 通道3: 用户推送  │             │
│  │                 │  │                 │  │                 │             │
│  │ ~/.clawdbot/    │  │ POST /hooks/    │  │ @catbo26bot     │             │
│  │ signals/        │  │ al-brooks-signal│  │ (简版信号)      │             │
│  │ signals.jsonl   │  │                 │  │                 │             │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘             │
│           │                    │                                            │
│           │    双通道冗余设计   │                                            │
│           └────────────────────┘                                            │
│                    │                                                        │
│                    ▼                                                        │
│           失败队列 (failed_queue.jsonl)                                     │
│           - 双通道都失败时写入                                               │
│           - 支持后续重试                                                    │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┴──────────────────────────────────────────┐
│                           AI 分析层 (AI Analysis)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OpenClaw Gateway (端口 18789)                                              │
│       │                                                                      │
│       ▼                                                                      │
│  Hook 处理 (/hooks/al-brooks-signal)                                        │
│       │                                                                      │
│       ▼                                                                      │
│  Transform 模块 (al-brooks-dual-send.js)                                    │
│  - 解析信号 payload                                                         │
│  - 提取后端 API 回调地址                                                    │
│  - 构造 Agent Action                                                        │
│       │                                                                      │
│       ▼                                                                      │
│  AI Agent 执行分析                                                          │
│  - 加载 al-brooks-trader skill                                              │
│  - 七步分析法                                                               │
│  - 匹配策略卡片 (Obsidian 策略仓库)                                         │
│  - 条件累积评分 (0-100)                                                     │
│       │                                                                      │
│       ├─────────────────────────────────────────────────────────────────┐   │
│       │                                                                 │   │
│       ▼                                                                 ▼   │
│  简要报告 (2-5行)                                          详细报告 (JSON)  │
│  → 直接发送给用户 Telegram                                 → POST 后端 API  │
│                                                                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
┌──────────────────────────────────┴──────────────────────────────────────────┐
│                           输出层 (Output)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ 用户 Telegram       │  │ 后端 Bot            │  │ Obsidian 笔记       │ │
│  │ @chunboClawd_bot    │  │ @abconsole_backend  │  │ Daily/Trades/       │ │
│  │                     │  │ _bot                │  │                     │ │
│  │ 简版报告:           │  │ 详版报告:           │  │ 交易笔记:           │ │
│  │ - Always In 方向    │  │ - 完整七步分析      │  │ - 自动创建          │ │
│  │ - 策略匹配          │  │ - 策略匹配详情      │  │ - 评分 >= 70 时     │ │
│  │ - 入场/止损/目标    │  │ - 评分明细          │  │ - 标准属性格式      │ │
│  │ - Al Brooks 金句    │  │ - 风险警告          │  │                     │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 双机器人职责

| 机器人 | Token | 职责 |
|--------|-------|------|
| `@chunboClawd_bot` | OpenClaw 配置 | 用户交互、简版报告、AI 分析、互动问答 |
| `@abconsole_backend_bot` | `8507333164:AAG_...` | 详版报告存档、原有 39 卡片/快照功能 |

---

## 2. 策略匹配机制

### 2.1 策略卡片属性

策略卡片位于 Obsidian 笔记库：
```
AB Console-Obsidian/策略仓库 (Strategy Repository)/Al Brooks 策略/
├── 策略卡片_20均线缺口.md
├── 策略卡片_区间突破回调.md
├── 策略卡片_双重顶底.md
├── 策略卡片_失败突破.md
├── 策略卡片_市价追进.md
├── 策略卡片_末端旗形.md
├── 策略卡片_极速与通道.md
├── 策略卡片_楔形顶底.md
├── 策略卡片_磁铁吸引.md
├── 策略卡片_首次均线缺口.md
└── 高1低1 (High 1Low 1).md
```

### 2.2 策略卡片 Frontmatter 属性

每张策略卡片包含标准化的 frontmatter 属性，用于信号匹配：

```yaml
---
策略名称/strategy_name: 20均线缺口 (20 EMA Gap)
策略状态/strategy_status: 学习中 (Learning)
方向/direction:
  - 做多 (Long)
  - 做空 (Short)
市场周期/market_cycle:
  - 强趋势 (Strong Trend)
  - 突破模式 (Breakout Mode)
设置类别/setup_category: 趋势回调 (Trend Pullback)
时间周期/timeframe:
  - 5m
  - 15m
  - 1H
风险等级/risk_level: 中 (Medium)
观察到的形态/patterns_observed:
  - 20均线缺口 (20 EMA Gap)
  - 过度延伸 (Overextended)
信号K/signal_bar_quality:
  - 强阳收盘 (Strong Bull Close)
  - 强阴收盘 (Strong Bear Close)
入场条件/entry_criteria:
  - K线连续20-30根未触及EMA
  - 首次回调触及EMA
风险提示/risk_alerts:
  - 如果超过40根K线未触及，可能已演变为宽通道
止损建议/stop_loss_recommendation:
  - 保守 - 前一波段极值外2ticks
目标建议/take_profit_recommendation:
  - 首选 - 测试前极值 (Old High/Low)
盈亏比/risk_reward: 2:1 - 3:1
---
```

### 2.3 信号与策略匹配逻辑

AI Agent 在分析信号时，应该：

1. **读取信号属性**：
   - `signal_type`: 信号类型（如 "20均线缺口"、"双顶形态"）
   - `direction`: 方向（BUY/SELL）
   - `timeframe`: 时间周期
   - `patterns_observed`: 观察到的形态

2. **匹配策略卡片**：
   - 根据 `signal_type` 匹配 `策略名称/strategy_name`
   - 根据 `direction` 匹配 `方向/direction`
   - 根据 `timeframe` 匹配 `时间周期/timeframe`
   - 根据 `patterns_observed` 匹配 `观察到的形态/patterns_observed`

3. **引用策略卡片内容**：
   - 入场条件检查清单
   - 止损/目标建议
   - 风险提示
   - 盈亏比要求

### 2.4 属性标准枚举值

交易笔记和策略卡片使用以下标准枚举值：

| 属性 | 枚举值 |
|------|--------|
| 账户类型 | 实盘/模拟/回测 |
| 品种 | NQ/ES/BTC/ETH/SOL/BNB/GC/CL 等 |
| 市场周期 | 强趋势/弱趋势/交易区间/突破模式 |
| 方向 | 做多/做空 |
| 设置类别 | 趋势突破/趋势回调/趋势反转/区间逆势 |

---

## 3. OpenClaw 配置

### 3.1 配置文件位置

```
~/.openclaw/openclaw.json
```

### 3.2 Hooks 配置

```json
{
  "hooks": {
    "enabled": true,
    "token": "<HOOKS_TOKEN>",
    "transformsDir": "/Users/mitchellcb/.openclaw/workspace/transforms",
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
        "transform": {
          "module": "al-brooks-dual-send.js"
        }
      }
    ]
  }
}
```

### 3.3 Transform 模块

Transform 模块位于 `~/.openclaw/workspace/transforms/al-brooks-dual-send.js`

**职责**：
1. 接收原始信号 payload
2. 验证必要字段
3. 构造 Agent Action（包含分析指令）
4. 返回 `{ kind: "agent", message: "...", deliver: true, channel: "telegram" }`

**关键点**：
- Transform 只负责解析和转发，不做分析
- 分析逻辑由 AI Agent 根据 `al-brooks-trader` skill 执行
- 双输出要求在 skill 中定义，Agent 负责执行

### 3.4 Skill 配置

AI Agent 的分析能力由 Skill 文档定义：

```
~/.openclaw/skills/al-brooks-skill/SKILL.md
```

Skill 文档包含：
- 11 大策略卡片速查表
- 七步分析流程
- 双输出格式要求
- 知识库引用指南
- 策略匹配逻辑

---

## 4. 后端适配器配置

### 4.1 文件位置

```
AB Console-Backend/services/telegram-service/src/signals/adapter.py
```

### 4.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `CLAWDBOT_WEBHOOK_URL` | `http://host.docker.internal:18789/hooks/al-brooks-signal` | Webhook 端点 |
| `CLAWDBOT_WEBHOOK_TOKEN` | `hooks-5fed4a9a7de03c2...` | **hooks.token**（非 gateway.auth.token） |
| `CLAWDBOT_THRESHOLD` | `60` | 推送阈值 (0-100 整数刻度) |
| `BACKEND_REPORT_URL` | `http://127.0.0.1:8090/api/clawdbot-report` | 详版报告回调 |
| `BACKEND_NOTE_URL` | `http://127.0.0.1:8090/api/create-trade-note` | 交易笔记回调 |

### 4.3 信号 Payload 格式

后端发送给 OpenClaw 的信号 payload：

```json
{
  "symbol": "BTCUSDT",
  "direction": "BUY",
  "strength": 85,
  "timeframe": "5m",
  "price": 97500.5,
  "signal_type": "20均线缺口",
  "patterns_observed": ["20均线缺口", "H2"],
  "timestamp": "2026-02-03T08:30:00Z",
  "user_id": "756069822",
  "backend_api": {
    "report_url": "http://127.0.0.1:8090/api/clawdbot-report",
    "note_url": "http://127.0.0.1:8090/api/create-trade-note"
  }
}
```

---

## 5. 双输出要求

### 5.1 简要报告（发给用户 Telegram）

用自然的对话语气，2-5 行：

```
示例1（有机会）:
🦁 BTCUSDT 5m — Always In Long，紧通道中
20均线缺口回调入场机会，H2 形成中
建议关注 97,500 附近的回调买点，止损 97,200
准备好了吗？可以聊聊细节

示例2（观望）:
🦁 ETHUSDT 1h — 区间震荡，不确定方向
这不是一个好的入场点。等两边之一被突破再说
耐心等待是最重要的技能
```

### 5.2 详细报告（POST 给后端 Bot API）

```json
{
  "user_id": "756069822",
  "report": {
    "symbol": "BTCUSDT",
    "direction": "BUY",
    "strength": 82,
    "timeframe": "5m",
    "analysis": {
      "always_in": "Long — HH+HL 结构完整",
      "cycle": "紧通道，回调小于 2 倍 bar size",
      "leg": "H2 — 第二腿回调底部",
      "signal_bar": "强阳收盘，下影线长，实体大",
      "context": "连续 25 根未触及 EMA，首次回调"
    },
    "strategy": "20均线缺口",
    "strategy_card_match": {
      "matched_attributes": ["方向", "市场周期", "时间周期", "形态"],
      "match_score": 85,
      "entry_criteria_met": ["K线连续20-30根未触及EMA", "首次回调触及EMA"],
      "risk_alerts": ["如果超过40根K线未触及，可能已演变为宽通道"]
    },
    "trade_plan": {
      "direction": "做多",
      "entry": 97500,
      "stop_loss": 97200,
      "target": 98400,
      "risk_reward": "3:1"
    },
    "score": 78,
    "quote": "H1不交易，H2是最佳入场点。",
    "risk_warnings": ["回调可能加深", "关注 97,100 支撑"]
  },
  "source": "clawdbot",
  "timestamp": "2026-02-03T08:30:00Z"
}
```

### 5.3 交易笔记创建（评分 >= 70 时）

POST 到 `backend_api.note_url`：

```json
{
  "symbol": "BTCUSDT",
  "direction": "做多",
  "timeframe": "5m",
  "entry_price": 97500,
  "stop_loss": 97200,
  "take_profit": 98400,
  "strategy_name": "20均线缺口",
  "market_cycle": "强趋势",
  "always_in": "总是多头",
  "setup_category": "趋势回调",
  "patterns_observed": ["20均线缺口", "H2"],
  "signal_bar_quality": ["强阳收盘", "下影线长"],
  "analysis_summary": "紧通道中25根K线首次回调至EMA，H2形成，强阳确认",
  "score": 78
}
```

---

## 6. 服务端口汇总

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

## 7. 故障排查

### 7.1 Hook 返回 "hook mapping failed"

**可能原因**：
1. Transform 文件语法错误
2. Transform 函数签名不正确
3. Gateway 缓存了旧版本

**解决方案**：
```bash
# 检查 transform 文件
cat ~/.openclaw/workspace/transforms/al-brooks-dual-send.js

# 重启 Gateway 清除缓存
openclaw gateway restart

# 查看日志
tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | grep -i hook
```

### 7.2 详版报告未发送到后端 Bot

**检查步骤**：
1. 确认 AI Agent 执行了 curl 命令
2. 检查后端 API 是否可达
3. 查看 telegram-service 日志

```bash
docker logs ab-telegram-service 2>&1 | grep clawdbot-report
```

### 7.3 策略卡片未匹配

**检查步骤**：
1. 确认信号 `signal_type` 与策略卡片 `策略名称` 匹配
2. 检查 Obsidian 笔记库路径配置
3. 确认 AI Agent 有权限读取策略卡片

---

## 8. 配置变更历史

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-02-03 | v2.2 | 完善策略匹配机制文档、添加属性枚举值、更新架构图 |
| 2026-02-03 | v2.1 | 修复 webhook 401 认证、Transform 函数签名修复 |
| 2026-02-02 | v2.0 | 双机器人架构、Transform 模块、后端 API 回调 |
| 2026-02-01 | v1.1 | 初始 OpenClaw 集成 |

---

## 9. 关键文件路径

| 用途 | 路径 |
|------|------|
| OpenClaw 配置 | `~/.openclaw/openclaw.json` |
| Transform 模块 | `~/.openclaw/workspace/transforms/al-brooks-dual-send.js` |
| Skill 文档 | `~/.openclaw/skills/al-brooks-skill/SKILL.md` |
| 信号文件 | `~/.clawdbot/signals/signals.jsonl` |
| 后端适配器 | `services/telegram-service/src/signals/adapter.py` |
| 策略卡片 | `AB Console-Obsidian/策略仓库 (Strategy Repository)/Al Brooks 策略/` |
| 开发文档 | `📁 开发文档/CLAWDBOT_SIGNAL_PIPELINE.md` |
