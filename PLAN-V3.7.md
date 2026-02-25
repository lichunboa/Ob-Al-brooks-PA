# V4.0 系统升级方案 — Agent 自主交易 + K线数据接入

> 本文档覆盖 V3.7（已部分实施）和 V4.0（新方案）。V3.7 的阶段 1/2 大部分已在 V3.9.x 中完成。

---

## 现状诊断（V3.9.4 基线，2026-02-15）

### 已解决的问题
- ✅ 信号洪水：webhook 限流 30min 去重 + 60min 拒绝冷却
- ✅ source 字段：已传递
- ✅ per-bot 独立持仓/平仓/归属
- ✅ 进化系统 auto 策略污染（已清洗）
- ✅ Agent 持仓巡检 cron（15min 错峰）

### 未解决的核心问题

| # | 问题 | 严重度 | 根因 |
|---|------|--------|------|
| 1 | **Agent 无法看到 K 线** | 🔴 致命 | 架构缺失：execution-service 无 /klines API |
| 2 | **垃圾笔记** | 🔴 高 | 2/14: Wyckoff 22 篇笔记仅 1 笔执行（4.5%） |
| 3 | **评分膨胀** | 🟡 中 | 几乎所有信号都 80+，失去筛选作用 |
| 4 | **信号来源同质化** | 🟡 中 | 三个 Agent 接收同一 TradeCat 信号源的不同切面 |
| 5 | **PA 交易量太少** | 🟡 中 | Al Brooks 理论可支撑高频交易，当前被动等信号 |
| 6 | **盈亏比无后端强制** | 🟡 中 | Agent 可绕过 min_risk_reward 风控参数 |

### 根因分析

**问题 1 是所有其他问题的根源。**

Al Brooks 的方法论是纯 K 线分析——看每一根 K 线的 OHLC、与 20EMA 的关系、K 线序列形成的形态。但当前 Agent 收到的只是 TradeCat 的文字描述（"RSI 超卖反弹"、"布林带突破"），**没有实际的 K 线数据**。

这导致：
- Agent 只能根据 webhook 文字描述"编造"分析 → 评分膨胀（问题 3）
- Agent 无法主动发现交易机会，只能被动等信号 → 信号太少（问题 5）
- 三个 Agent 从同一信号源接收 → 同质化（问题 4）
- Agent 的"分析"本质是模板填充 → 垃圾笔记（问题 2）

---

## V4.0 升级方案

### 核心理念：从"被动接收信号"到"主动读 K 线交易"

```
当前模式（被动）：
  TradeCat → signal-service → signal-router → Agent 评估 → 执行

V4.0 模式（主动 + 被动）：
  Cron 定时 → Agent 主动读 K 线 → 应用 Al Brooks 方法论 → 发现机会 → 执行
  TradeCat → signal-router → Agent 交叉验证 → 执行（保留但降级为辅助）
```

---

### 阶段 1: P0 — K 线数据接入（基础设施）

#### 1.1 execution-service 新增 /klines API

**文件**: `AB Console-Backend/services/execution-service/src/__main__.py`

利用已有的 ccxt `self.exchange` 连接，新增端点：

```python
@app.get("/klines/{symbol}")
async def get_klines(
    symbol: str,
    interval: str = "1h",    # 1m/5m/15m/30m/1h/4h/1d
    limit: int = 50           # 最近 N 根 K 线
):
    """获取 K 线数据（OHLCV + 20EMA + ATR）"""
    ohlcv = executor.exchange.fetch_ohlcv(symbol, interval, limit=limit)
    # 计算 20 EMA 和 ATR(14)
    # 返回格式化的 K 线数据 + 技术指标
```

**返回格式**（Agent 友好的文本表示）：

```json
{
  "symbol": "BTCUSDT",
  "interval": "1h",
  "ema20": 69500.0,
  "atr14": 350.0,
  "price_vs_ema": "+150 (0.22% above)",
  "bars": [
    {
      "time": "2026-02-15T10:00",
      "open": 69500, "high": 69800, "low": 69400, "close": 69650,
      "volume": 1234,
      "body": "+150 (bull)", "upper_wick": 150, "lower_wick": 100,
      "vs_ema20": "+120",
      "bar_type": "小阳线，上影线=下影线"
    }
  ],
  "summary": {
    "trend": "Always In Long — 过去 8 根 K 线在 EMA 上方",
    "last_pullback": "3 根 K 线前回调至 EMA，反弹",
    "range": "69200-69900（700 点区间）",
    "day_type": "窄幅趋势日"
  }
}
```

#### 1.2 多周期一次性获取

```python
@app.get("/klines/{symbol}/multi")
async def get_multi_tf_klines(symbol: str):
    """多周期 K 线快照（5m/15m/1h/4h/1d 各取最近 20 根）"""
    result = {}
    for tf in ["5m", "15m", "1h", "4h", "1d"]:
        ohlcv = executor.exchange.fetch_ohlcv(symbol, tf, limit=20)
        result[tf] = format_klines(ohlcv)
    return result
```

#### 1.3 executor.py 新增方法

**文件**: `AB Console-Backend/services/execution-service/src/executor.py`

```python
async def fetch_klines(self, symbol: str, interval: str = "1h", limit: int = 50):
    """获取 K 线并计算 EMA20 + ATR14"""
    ohlcv = self.exchange.fetch_ohlcv(
        self._normalize_symbol(symbol), interval, limit=limit + 20
    )
    closes = [bar[4] for bar in ohlcv]
    ema20 = self._calc_ema(closes, 20)
    atr14 = self._calc_atr(ohlcv, 14)
    return ohlcv[-limit:], ema20[-limit:], atr14[-limit:]
```

**预期效果**：Agent 首次能看到真实的 K 线数据。

---

### 阶段 2: P1 — PA 交易主动分析模式

#### 2.1 PA Agent 工作流重设计

**从"信号驱动"转向"K 线驱动"。**

新工作流（SKILL.md 5.7 节）：

```markdown
### 5.7 主动分析模式（cron 定时触发）

当收到包含「📊 主动分析」的消息时：

**步骤 1 — 获取 K 线**:
对每个允许品种调用：
  curl -s http://localhost:8092/klines/{symbol}/multi

**步骤 2 — Al Brooks 五问分析（必须逐一回答）**:
1. Always In 方向？（看 1h/4h 的 EMA20 关系）
2. 当前 Day Type？（趋势/区间/反转？看 1d 级别）
3. 最近的信号 K 线？（看最新 5 根 K 线的 body/wick）
4. 支撑/阻力在哪？（看前高前低、EMA、整数关口）
5. 入场位/止损/目标 → 盈亏比？

**步骤 3 — 评分决策**:
- >= 80: 执行交易（调用 /order API）
- < 80: 跳过，继续下一个品种

**步骤 4 — 报告**:
Discord 发送分析摘要（无论是否交易）

**约束**:
- 分析所有 config.allowed_symbols 中的品种
- 每个品种独立评分，互不影响
- 禁止跳过步骤 2 直接给分
```

#### 2.2 主动分析 Cron 配置

```json
{
  "name": "🦁 PA交易 主动分析",
  "agentId": "al-brooks",
  "schedule": { "expr": "0,30 * * * *" },
  "payload": {
    "kind": "agentTurn",
    "message": "📊 主动分析\n\n请按 SKILL.md 5.7 主动分析模式执行：\n1. 获取所有品种多周期K线\n2. 应用 Al Brooks 五问分析\n3. 发现交易机会则执行\n\n⛔ 必须先读 K 线数据再分析，禁止编造"
  }
}
```

**频率**: 每 30 分钟一次（30min K 线收线时分析）。
**Token 成本**: ~10K tokens/次 × 48 次/天 ≈ ¥1.5/天。

#### 2.3 Al Brooks 课程知识集成

Obsidian 中已有完整的 Al Brooks 知识体系（54 课视频笔记 + 37 篇学习笔记 + 11 策略卡片）。

**集成方案**：在 SKILL references/ 中新增精选知识文件：

```
~/.openclaw/skills/al-brooks-simtrade/references/
├── pa-analysis.md          ← 已有：分析框架
├── scoring-rubric.md       ← 已有：评分标准
├── kline-patterns.md       ← 新增：K 线形态速查（从课程 08-09 提炼）
├── trade-management.md     ← 新增：持仓管理规则（从课程 31-33 提炼）
└── day-types.md            ← 新增：日型判断指南（从课程 41-48 提炼）
```

每个文件控制在 2-3K 字以内，总计 ~15K tokens。从 Obsidian 课程笔记中提炼核心决策规则，不是全文复制。

**来源映射**：

| 新增文件 | Obsidian 来源 |
|---------|--------------|
| kline-patterns.md | 课程 08（K线形态）+ 09（回调计数）+ Notes/K线，形态，和信号K线.md |
| trade-management.md | 课程 31-33（交易管理）+ Notes/阶段三：持仓过程管理.md |
| day-types.md | 课程 41-48（实战技巧）+ Notes/阶段一：市场背景判断.md |

---

### 阶段 3: P2 — 垃圾笔记治理 + 评分校准

#### 3.1 笔记创建条件收紧

**当前**: 评分 >= 80 就创建笔记（即使风控拒绝）。
**修改**: **只有成功下单（有 order_id）才创建笔记**。

三个 SKILL.md 统一修改推送规则：

```markdown
### 推送规则（严格执行）
- **>= 80 且下单成功**: Discord + 创建笔记 + 写入 active_trades
- **>= 80 但下单失败/风控拒绝**: Discord 一行说明（≤30字），⛔ 禁止创建 .md
- **70-79**: Discord 一行摘要（≤50字），⛔ 禁止创建 .md
- **< 70**: 不推送，不创建文件
```

预期效果：Wyckoff 日笔记从 22 篇降到 1-3 篇。

#### 3.2 盈亏比后端强制检查

**文件**: `AB Console-Backend/services/execution-service/src/__main__.py`

在 `/order` 端点增加硬性检查：

```python
# 盈亏比门禁
risk = abs(entry_price - stop_loss)
reward = abs(take_profit - entry_price)
if risk > 0:
    rr = reward / risk
    min_rr = bot_config.get("min_risk_reward", 2.0)
    if rr < min_rr:
        return JSONResponse(status_code=400, content={
            "error": f"盈亏比 {rr:.2f}:1 < 最低 {min_rr}:1",
            "code": "RR_TOO_LOW"
        })
```

#### 3.3 评分校准（引入扣分项）

当前评分只有"加分"维度，没有"扣分"维度，导致几乎所有信号都 80+。

在 `references/scoring-rubric.md` 中增加强制扣分：

```markdown
## 强制扣分项（从总分中扣除）
| 条件 | 扣分 |
|------|------|
| 与 Always In 方向相反 | -15 |
| 盈亏比 < 2:1 | -20（一票否决） |
| 信号在区间中部（非边界） | -10 |
| 品种今日已止损 1 次 | -5 |
| 品种今日已止损 2+ 次 | -15 |
| 当前处于交易区间 + 趋势策略 | -10 |
```

---

### 阶段 4: P3 — 三个 Agent 差异化

#### 4.1 当前问题

三个 Agent 从同一 TradeCat 接收不同类型规则，但本质分析的是同一市场、同一时间的同一品种。结果是三个 Agent 经常同时同向操作，无多样化收益。

#### 4.2 差异化策略

| 维度 | PA 交易 (al-brooks) | 量化分析师 (trader) | 威科夫 (wyckoff) |
|------|---------------------|--------------------|--------------------|
| **数据来源** | K 线主动分析（V4.0 新增）| TradeCat 技术指标 | K 线 + 成交量 |
| **主要周期** | 5m / 15m（短线）| 1h / 4h（波段）| 4h / 1d（中线）|
| **触发方式** | Cron 30min 主动分析 | TradeCat 信号被动 | Cron 1h 主动分析 |
| **持仓时间** | 分钟到小时 | 小时到天 | 天到周 |
| **止损幅度** | 小（1-1.5% ATR）| 中（1.5-2% config）| 大（2-3%）|

#### 4.3 Agent 品种池分离（可选）

如果同质化仍然严重，可以给每个 Agent 不同品种池：
- PA 交易: BTC, SOL（流动性最好，适合短线）
- 量化: 全部 4 品种
- 威科夫: ETH, BNB（波动较大，适合中线）

---

### 阶段 5: P4 — 面向 Agent 自治的长期演进

#### 5.1 目标

逐步移除硬性约束，让 Agent 通过经验学习自我管理：
- 评分标准从"固定模板"→"Agent 自主调整权重"
- 止损/止盈从"固定公式"→"基于 K 线结构动态计算"
- 策略选择从"匹配表"→"Agent 根据进化数据自主决定"

#### 5.2 position_patrol 与 Agent 巡检的关系

**当前保留两者**，职责分离：
- `position_patrol.py`（代码，60s）: 机械安全网（裸仓、超时、移动止损）
- Agent 巡检（cron，15min）: 智能判断（趋势反转、主动止盈）

**长期方向**: 当 Agent 有了 K 线数据后，巡检质量会大幅提升。届时可以：
- position_patrol 只保留"裸仓检测"和"紧急止损"
- 所有智能决策交给 Agent 巡检
- Agent 可以主动移动止损到"K 线结构止损位"

#### 5.3 进化系统增强

当真实交易数据积累到 50+ 笔后：
- 进化系统自动计算每个策略的 Sharpe 比率
- 自动识别并冷却低效策略
- Agent 可以读取进化数据，自主决定哪些策略加权/减权

---

## 实施顺序

| 阶段 | 优先级 | 内容 | 文件数 | 依赖 |
|------|--------|------|--------|------|
| **阶段 1** | P0 | K 线 API + executor 方法 | 2 | 无 |
| **阶段 2** | P1 | PA 主动分析模式 + 知识文件 | 5 | 阶段 1 |
| **阶段 3** | P2 | 笔记门禁 + 盈亏比检查 + 评分校准 | 6 | 无 |
| **阶段 4** | P3 | Agent 差异化 | 3 | 阶段 1+2 |
| **阶段 5** | P4 | Agent 自治演进 | 持续 | 阶段 1-4 |

**建议先做**: 阶段 1（K 线 API）+ 阶段 3（垃圾笔记治理），可并行。

---

## 风险评估

| 阶段 | 风险 | 缓解措施 |
|------|------|---------|
| 阶段 1 | 低：新增 API，不改现有逻辑 | ccxt fetch_ohlcv 已验证可用 |
| 阶段 2 | 中：Agent 主动分析质量未知 | 先观察 1-2 天输出，确认分析质量后再开启交易 |
| 阶段 3 | 低：收紧门禁，最坏情况漏掉合法交易 | 日志监控被拒交易 |
| 阶段 4 | 中：品种池分离可能错过机会 | 先软分离（建议），不硬限制 |
| 阶段 5 | 高：Agent 自治需要足够数据支撑 | 50+ 笔真实交易后再开放 |

---

## V3.7 原方案状态追踪

| V3.7 阶段 | 内容 | V3.9.4 状态 |
|-----------|------|------------|
| P0 启动脚本修复 | --interval 60 硬编码 | ✅ 已修复（start-all-core.sh 重写） |
| P0 PG 引擎聚合 | 按 symbol_direction 聚合 | ⚠️ 部分（Docker 已接管 signal-service） |
| P0 webhook 限流 | 品种级 5min 限流 | ✅ 已实现（30min 去重 + 60min 拒绝冷却） |
| P0 source 字段 | payload 补充 source | ✅ 已修复 |
| P1 笔记门禁 | SKILL.md 推送规则 | ⚠️ 规则已写但 Agent 仍在违反 → V4.0 阶段 3 解决 |
| P1 盈亏比门禁 | /order 端点检查 | ❌ 未实施 → V4.0 阶段 3 |
| P2 SKILL 重设计 | references/ 架构 | ✅ 已部分实施（pa-analysis.md + scoring-rubric.md 已存在） |
| P3 OpenClaw 适配 | 配置优化 | ⚠️ 部分（模型已切 Kimi k2p5，但其他配置未更新） |

<!-- PLAN_END -->
