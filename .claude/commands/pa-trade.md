# PA 交易管理

你是 PA 交易员。这个命令用来管理你的交易系统。

## 用法
- `/pa-trade` — 查看持仓 + 分析 + 建议操作
- `/pa-trade start` — 启动自动交易（5分钟循环）
- `/pa-trade stop` — 停止自动交易
- `/pa-trade dry` — 模拟分析（不下单）

## 无参数时：交易状态总览

### 1. 检查服务健康
```bash
curl -s http://localhost:8092/health | python3 -m json.tool
```

### 2. 检查持仓
```bash
curl -s http://localhost:8092/positions | python3 -m json.tool
```

### 3. 检查 Bot 状态
```bash
curl -s http://localhost:8092/trading/bot-summary/al-brooks | python3 -m json.tool
```

### 4. 检查 PA Bot 是否在运行
```bash
pgrep -f "pa_trader" && echo "PA Bot 运行中" || echo "PA Bot 未运行"
```

### 5. 读最新日志（最后 30 行）
```bash
tail -30 "AB Console-Backend/data/pa_trader/pa_trader.log"
```

### 6. 分析并建议
对每个持仓：
- 读取对应品种的 K 线数据：`curl -s http://localhost:8092/klines/{SYMBOL}?interval=5m&limit=50`
- 判断 Always-In 方向（参考 `references/1-direction.md`）
- 如果持仓方向与 AI 方向冲突 → **建议平仓**
- 如果浮盈 > 2R → **建议移动止损到保本**
- 如果 climax 出现 → **建议止盈**

## start 参数
```bash
cd "AB Console-Backend" && nohup python3 -u scripts/pa_trader.py --live --interval 300 > /tmp/pa_trader_live.log 2>&1 &
echo "PA Bot 已启动 (PID: $!)"
```

## stop 参数
```bash
pkill -f "pa_trader" && echo "PA Bot 已停止" || echo "PA Bot 未在运行"
```

## dry 参数
```bash
cd "AB Console-Backend" && python3 -u scripts/pa_trader.py --dry-run --once 2>&1 | tail -50
```

## 知识体系（只读参考）
```
~/.openclaw/skills/al-brooks-simtrade/references/
├── 0-reading.md      # K线三分类、Signal Bar
├── 1-direction.md    # Always-In 方向判断
├── 2-market-state.md # Spike→TC→BC→TR 循环
├── 3a-trend-entries.md  # H1/H2/L1/L2, BO-PB
├── 3b-reversal-entries.md # MTR, Wedge, DT/DB
├── 4-evaluation.md   # Trader's Equation, 评分
├── 5-execution.md    # 5m 主力 + 止损 + 仓位
└── 6-management.md   # 止盈分段 + Trailing Stop
```

遇到概念不确定时，读取对应文件学习后再决策。
