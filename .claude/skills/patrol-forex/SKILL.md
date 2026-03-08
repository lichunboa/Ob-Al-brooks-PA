---
name: patrol-forex
description: "PA 交易 V5.0 外汇版 — EURUSD/GBPUSD/USDJPY/AUDUSD × 3周期 (API: 8096)"
---

# PA 交易 — 外汇终端

**本 skill 是 patrol-l1 的外汇市场版本。** PA 分析流程完全相同，仅市场参数不同。

## 市场参数（覆盖 patrol-l1 默认值）

```bash
cd ~/Desktop/Obsidian/Al-brooks-PA/AB\ Console-Backend
echo "forex" > data/pa_trader/patrol_market.conf
```

| 参数 | 值 |
|------|-----|
| **API** | `http://localhost:8096` (forex-data-service) |
| **品种** | EURUSD, GBPUSD, USDJPY, AUDUSD |
| **日志** | `data/pa_trader/pa_trader_l1_forex.log` |
| **缓存** | `data/pa_trader/market_state_l1_forex.json` |
| **下单** | 仅分析（cTrader OAuth2 待审批，无 /order API） |
| **适配参考** | `~/.openclaw/skills/al-brooks-simtrade/references/forex-adaptations.md` |

**外汇交易时段（北京时间）**：
- 亚洲 06:00-15:00 — 低波动，TR 居多，可少扫描
- **伦敦 15:00-24:00** — BO 频繁，核心交易时段
- **伦敦-纽约重叠 21:00-24:00** — 全天最高波动

**品种特点**：
| 品种 | 日均波幅 | 特点 |
|------|---------|------|
| EURUSD | 60-80 pips | 流动性最好，spread 最低，最适合 PA |
| GBPUSD | 80-120 pips | 波动较大，假突破较多 |
| USDJPY | 50-80 pips | 趋势性强 |
| AUDUSD | 50-70 pips | 受大宗商品影响，亚洲时段活跃 |

**当前限制（临时）**：
- 数据为模拟随机走势，仅验证分析流程
- 无余额/持仓/下单 API — 跳过 Step 1a 余额持仓、Step 2 持仓管理、Step 3f 下单
- 仅执行: Quick Scan + Phase B 深分析 + 输出信号建议

## 执行流程

**Read 并执行 patrol-l1 的完整 SKILL.md 流程**：

```bash
# 读取主 skill 文件获取完整分析流程
cat .claude/skills/patrol-l1/SKILL.md
```

按主 SKILL.md 的 Step 0 → Step 4 执行，但用以上市场参数替换。

**关键替换**：
- 所有 `http://localhost:8094` → `http://localhost:8096`
- 所有 `BTCUSDT/ETHUSDT/BNBUSDT` → `EURUSD/GBPUSD/USDJPY/AUDUSD`
- 缓存文件 → `market_state_l1_forex.json`
- 日志文件 → `pa_trader_l1_forex.log`
- 遇到 /balance, /positions, /order 调用 → 跳过（输出 `[SKIP] forex 模式无下单 API`）
- 遇到 /trading/can-trade → 默认 true（仅分析）
- S 系列知识文件 → 同一套，references/ 目录不变
