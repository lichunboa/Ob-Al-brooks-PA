# S0 Daily 偏置 — 每轮第一步：先看大方向

> 没有大方向就是盲目交易。Daily 决定今天你能做什么、不能做什么。

---

## 数据

`/klines/{SYM}/multi` 返回的 `1d` 周期 20 根

## 分析 Daily K 线，回答 3 个问题

### Q1: Daily AI 方向是什么？
- HH + HL 序列 → **Daily AIL**（偏多）
- LH + LL 序列 → **Daily AIS**（偏空）
- 不确定 → **Daily TR**

### Q2: Daily 处于什么市场状态？
- 连续大阳/阴 + Gap → **Daily BO** → 5m/15m 只顺势
- HH+HL/LH+LL 有序 → **Daily Channel** → 顺势为主
- 来回反复 → **Daily TR** → BLSHS
- 大 K 线 + Exhaustion 迹象 → **Daily BC** → 等方向明确

### Q3: Daily 有什么关键结构？
- 微通道（每个低点≥前低）→ 极强偏多，PB = 买点
- Wedge 三推 → 可能反转
- 20+ 根后最大 K 线 → Exhaustion，不追

## Daily 偏置表

Daily 偏置 = **概率偏向**，不是绝对禁令。只有 Strong BO 才接近“只顺势”。
理论边界统一看 `canonical/C0-foundations.md` + `canonical/C1-market-cycle-and-state.md`。

| Daily 状态 | 偏置 | 操作限制 |
|-----------|------|---------|
| **AIL + Strong BO** | 只做多。PB = 买点 | 逆势 Swing 禁止；逆势 Scalp 仅限 Climax 处 |
| **AIL + Channel/TC** | 偏多。做多 P 更高 + R:R 更好 | 逆势可 Scalp（P 下调 5-10%） |
| **AIL + BC** | 偏多但谨慎。看有没有 MTR | Swing 多，Scalp 可双向 |
| **AIS + Strong BO** | 只做空。反弹 = 卖点 | 逆势 Swing 禁止；逆势 Scalp 仅限 Climax 处 |
| **AIS + Channel/TC** | 偏空。做空 P 更高 + R:R 更好 | 逆势可 Scalp（P 下调 5-10%） |
| **AIS + BC** | 偏空但谨慎 | Swing 空，Scalp 可双向 |
| **TR** | 无偏置。BLSHS | 双向 Scalp |
| **不确定** | 无偏置 | 只做高确信度 setup |

**Strong BO 判定**：连续 2+ 根大趋势 K 线 + 少重叠 + Gap 未关 → 10% 场景。其余都是 Channel/TR。

## 49F 的核心规则

- **Daily AIL**: 90% 的交易日开盘有回调 → 回调就是买点（5m 反转上升）
- **Daily AIS**: 90% 的交易日开盘有反弹 → 反弹就是卖点（5m 反转下跌）
- **Daily TR + 昨天大阳收顶部**: 次日 fade 做空 → 目标 TR 中间
- **Daily TR + 昨天大阴收底部**: 次日 fade 做多 → 目标 TR 中间

## 日线 Context → 5m 映射（48C 核心机制）

- **日线 Bull Trend** → 日线 K 线需要下影线 → 在 5m 上 = **failed bear BO on open + reversal up**
  - 多头自信：买阴线收盘 + 买 2nd signal（bull signal bar）
- **日线 Bear Trend** → 日线 K 线需要上影线 → 在 5m 上 = **failed bull BO on open + reversal down**
  - 空头自信：在弱 buy signal bar 上方做空 + 做空 2nd signal

## 昨日收盘状态 → 今日概率（48C 50/75/25）

| 昨日结束状态 | 今日概率 |
|-------------|---------|
| Buy Climax | 50% 继续做多 1-2h → 75% 出现 2h sideways-to-down → 25% 直接 early reversal down |
| Sell Climax | 50% 继续做空 1-2h → 75% 出现 2h sideways-to-up → 25% 直接 early reversal up |

## 交易时段分析 — 时间也是 Context

> "Trend from Open is trend at start of any session, no different from BO any time of day."

### 核心原则

**每个交易时段都有自己的 "Open"。时段开始 = BO 机会。** 加密 24/7，但流动性随全球时段变化。外汇/指数同理：Asian → European → US，每个时段开始都是方向建立点。

### 一天的三段（48A）

| 阶段 | 时间 | 特征 | 策略 |
|------|------|------|------|
| **Opening** | 时段前 6-12 根 5m | 建立 setup，**50% 有 failed BO + 反转** | 不追开盘方向，等确认 |
| **Middle** | 主体时段 | 主要行情发展，趋势腿出现 | 按已建立方向执行 |
| **Close** | 时段最后 1h | 止盈/调仓，流动性下降 | 新仓谨慎，持仓考虑减仓 |

- 90% 的日子至少有 2 种 PA 类型（BO→Channel、TR→BO 等）→ 时刻留意转换
- 只有 10% 是全天一个方向的强趋势日
- **成交量在第一和最后一小时最大** — BO 和 Swing 多出现在这两个时段

### Opening Reversal（50% 概率）

- 开盘前几根 K 线的方向**经常反转**
- Failed BO of yesterday H/L → 最常见 Opening 模式
- Gap open → 可能 fill（EG）或成为 measuring gap（MG）
- **连续 2+ 大趋势 K 线收盘在极端 + 少重叠 → 70% 至少达到 MM**
- 如果初始 move < 平均 range 25-50% → 通常形成 TR Day
- 如果初始 move > 平均 range 50-100% → 反转后通常出现大趋势

### End of Session 管理

- 接近时段结束时：
  - 新建仓需要**立即有 FT**，否则耗尽时间 → 被迫亏损出局
  - 只在出现 Micro Channel（持续趋势）时持有新仓
  - 没有立即下跌/上涨 → 快速退出，不等
  - Swing 可以跨时段，但要考虑下一时段流动性

### 时段表

| 时段 | UTC | 特征 | 策略偏好 |
|------|-----|------|---------|
| **亚盘** | 01:00-09:00 | 低量，TR-like，常以 TTR 结束 | Scalp 为主，不追 trend |
| **欧盘开盘** | ~07:00 | 新时段 "Open"，流动性上升 | Opening Reversal + BO 机会 |
| **欧美交叉** | 13:00-17:00 | **黄金时段**，最大波动 | 积极找 Swing，主要趋势腿 |
| **美盘后半** | 19:00+ | 尾盘，常以 TTR 结束 | 减仓时段，不追新 trend |
| **日线边界** | UTC 00:00 | 加密 "Daily Open" | 磁力效应 + 概率锚重置 |

### 时段转换 = BO 机会

- **亚盘 TR → 欧盘 BO**：亚盘 TR 在欧盘被 BO → "Trend from Open"
- **欧美交叉 = 主要行情**：最大趋势腿通常在这个时段
- **美盘 TTR → 亚盘 BO**：美盘结尾的 TTR 可能在亚盘被打破（但亚盘 BO 较弱）
- **时段交接 = 潜在方向变化** — 留意 AI 方向是否改变

## 日型分类 (Day Types)

| 日型 | 特征 | 5m 策略 |
|------|------|--------|
| **Trend from Open** | 开盘即方向明确，全天一个方向 | 顺势 Swing，不逆势 |
| **Trending TR** | 有方向但波动大，range 逐段翻倍 | 顺势为主 + 边缘 Scalp |
| **TR Day** | 全天横盘，无方向 | BLSHS，纯 Scalp |
| **SPB Day** | Small PB trend，极强但回调极浅 | **只顺势**，不做反转 |
| **Reversal Day** | 上午一个方向，下午反转 | 上午 Swing → 下午 MTR |

**用法**：
- **开盘 1h 后判断日型** → 调整当天策略
- Trend from Open + SPB → Swing 为主
- TR Day → Scalp 为主，降低目标
- Reversal Day → 上午获利后下午小心

---

## 输出格式

```
Daily偏置: {SYM}
AI方向: AIL/AIS/TR | 状态: BO/Channel/TR/BC
结构: [微通道/Wedge三推/Exhaustion/无特殊]
昨日收盘: [Bull Climax/Sell Climax/TR day/其他]
→ 今日操作限制: {具体限制}
```

---

## 判完后去哪里

→ **[S1-reading.md](S1-reading.md)** — 带着 Daily 偏置去读盘（知道大方向后逐根读 K 线）
