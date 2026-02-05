# OpenClaw 配置备份

此目录包含 OpenClaw 系统的关键配置文件备份，用于版本控制和灾难恢复。

## 目录结构

```
openclaw-config/
├── transforms/           # Webhook transform 脚本
│   └── al-brooks-multi-channel.js  # 信号处理和多渠道分发
├── scripts/              # 系统脚本
│   └── health-check.sh   # 健康检查和 session 清理
└── agents/               # Agent 配置
    ├── trader/           # 交易员 agent
    │   ├── agent.json    # Agent 配置
    │   └── MEMORY.md     # Agent 记忆
    └── xiaoming/         # 小明模拟交易 agent
        ├── agent.json    # Agent 配置
        └── MEMORY.md     # Agent 记忆
```

## 实际位置

这些文件的实际运行位置在 `~/.openclaw/`：

| 备份文件 | 实际位置 |
|---------|---------|
| `transforms/*` | `~/.openclaw/transforms/` |
| `scripts/*` | `~/.openclaw/scripts/` |
| `agents/trader/*` | `~/.openclaw/agents/trader/` |
| `agents/xiaoming/*` | `~/.openclaw/agents/xiaoming/` |

## 同步说明

修改配置后，需要手动同步：

```bash
# 从备份恢复到 OpenClaw
cp openclaw-config/transforms/* ~/.openclaw/transforms/
cp openclaw-config/scripts/* ~/.openclaw/scripts/
cp openclaw-config/agents/trader/* ~/.openclaw/agents/trader/
cp openclaw-config/agents/xiaoming/* ~/.openclaw/agents/xiaoming/

# 从 OpenClaw 备份到 git
cp ~/.openclaw/transforms/al-brooks-multi-channel.js openclaw-config/transforms/
cp ~/.openclaw/scripts/health-check.sh openclaw-config/scripts/
cp ~/.openclaw/agents/trader/{agent.json,MEMORY.md} openclaw-config/agents/trader/
cp ~/.openclaw/agents/xiaoming/{agent.json,MEMORY.md} openclaw-config/agents/xiaoming/
```

## 排除的文件

以下文件不纳入版本控制：

- `sessions/` - 会话文件（临时数据）
- `sessions.json` - 会话索引（临时数据）
- `*.backup.*` - 备份文件
- `credentials/` - 凭证文件（敏感数据）
- `workspace/*.json` - 运行时数据（如 active_trades.json）

## 更新时间

最后更新：2026-02-06
