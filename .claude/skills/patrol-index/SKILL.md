---
name: patrol-index
description: "PA 交易 V5.0 指数黄金版 — US500/XAUUSD × 3周期 (API: 8096)"
---

# PA 交易 — 指数+黄金终端

**本 skill 是 patrol-l1 的指数+黄金市场版本。** PA 分析流程完全相同，仅市场参数不同。

## 市场参数（覆盖 patrol-l1 默认值）

```bash
cd ~/Desktop/Obsidian/Al-brooks-PA/AB\ Console-Backend
echo "index" > data/pa_trader/patrol_market.conf
```

| 参数 | 值 |
|------|-----|
| **API** | `http://localhost:8096` (forex-data-service) |
| **品种** | US500, XAUUSD |
| **日志** | `data/pa_trader/pa_trader_l1_index.log` |
| **缓存** | `data/pa_trader/market_state_l1_index.json` |
| **下单** | 仅分析（cTrader OAuth2 待审批，无 /order API） |
| **适配参考** | `~/.openclaw/skills/al-brooks-simtrade/references/forex-adaptations.md` |

**US500 = Al Brooks 课程"原配"品种**：
> Al Brooks 课程的所有 pattern、概率、策略都基于 ES (E-mini S&P 500) 5 分钟图验证。
> US500 是 ES 的 CFD 版本，PA 分析最直接适用。

**交易时段（北京时间）**：
- **美盘开盘 21:30-22:30** — 对应 Al Brooks 的"开盘 2 小时"，最重要
- 美盘主力 22:30-04:00 — 趋势确认和延续
- 欧洲盘 15:00-21:30 — 波动增加
- 亚洲 06:00-15:00 — 低波动，主要跟随隔夜走势

**品种特点**：
| 品种 | 类型 | 日均波幅 | 特点 |
|------|------|---------|------|
| US500 | S&P 500 指数 | 30-60 点 | Al Brooks 课程标的，最适合 PA |
| XAUUSD | 黄金 | 200-400 pips | 避险资产，波动大，spread 较宽 |

**注意**：
- US500 和 XAUUSD 波动特性差异大，独立分析
- XAUUSD 与 USD 负相关（美元强 → 黄金弱）
- 重大新闻（NFP/CPI/利率决议）影响巨大，新闻前 15 分钟不开新仓

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
- 所有 `BTCUSDT/ETHUSDT/BNBUSDT` → `US500/XAUUSD`
- 缓存文件 → `market_state_l1_index.json`
- 日志文件 → `pa_trader_l1_index.log`
- 遇到 /balance, /positions, /order 调用 → 跳过（输出 `[SKIP] index 模式无下单 API`）
- 遇到 /trading/can-trade → 默认 true（仅分析）
- S 系列知识文件 → 同一套，references/ 目录不变

**US500 特殊规则**：
- Al Brooks 所有概率和策略都是基于 ES 验证的，US500 可以直接使用原版参数
- 不需要像加密/外汇那样调整概率估计
