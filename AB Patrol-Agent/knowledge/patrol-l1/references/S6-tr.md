# S6-tr TR 中怎么做 — 横盘市场的赚钱艺术

> 状态: S3 判定 TR → 来这里。Al Brooks: "Buy low, sell high. Don't believe moves will go far, so scalp."

> TR 是限价单市场。趋势中止损单赚钱，TR 中限价单赚钱。
> Al Brooks: "When traders see evidence of a TR, they should do exactly what the institutions are doing: Buy Low, Sell High, Scalp (BLSHS)"

---

## TR 入场的本质

- **TR = 80% BO 失败** → 你赚钱的方式是**押注失败**
- **止损单在 TR 中亏钱** — 大信号 K 线迫使你高买低卖，止损远 + 概率低 = 负 TE
- **限价单在 TR 中赚钱** — 在 K 线上方做空、K 线下方做多，押注 BO 失败
- **概率在 TR 中都约 50%** — 趋势中的高概率 setup 在 TR 中只有 ~50%

> Al Brooks 47B: "Strong signal bars that are often big force traders to buy high or sell low. Bad math: stop is far (risk is high), and TR, so stop orders are low probability"

---

## TR1: BLSHS（低买高卖刮头皮）

> Al Brooks 47A: "If TR is broad, buy and sell for scalps and some swings"

### 前提条件
- 确认 TR（S3 判定 state=TR）
- TR 高度 > 3× avg bar（不是 TTR）
- 多数 bar > 最小 scalp size

### 入场区域

| 位置 | 做什么 | 概率 | 订单类型 |
|------|--------|------|---------|
| **底部 1/3** | 做多 | ~60% 先涨 | 限价单（在支撑附近挂买单）|
| **中间 1/3** | **不做** | 50/50 | — |
| **顶部 1/3** | 做空 | ~60% 先跌 | 限价单（在阻力附近挂卖单）|

### 入场确认（不盲挂，等信号）

1. 价格到达 TR 边缘 1/3 区域
2. 出现**反转信号 K 线**（底部→阳线收上半，顶部→阴线收下半）
3. 下一根 K 线确认方向（H1 多 / L1 空）
4. 限价单入场 或 反转 K 线收盘时市价入场

### SL / TP
- **SL**: TR 对侧外（如果太远 → 不做，或用更紧的结构位 + 接受更高失败率）
- **TP**: TR 中间（保守）或 TR 对侧（如果 leg 强劲）
- **风格**: 纯 Scalp（1-1.5R）

### 机构在做什么

> Al Brooks 47B: "Bulls sell to take profits in the top half, where bears are shorting. Bears buy to take profits in the bottom half, where bulls are buying. With both bulls and bears buying low, selling high, and taking quick profits (scalping), the market continues sideways"

- **多头和空头做同一件事**：低买高卖 + 快速止盈
- 这个自我强化机制就是 TR 持续横盘的原因
- 你要做的就是**跟机构做同样的事**

### Scale In（限特定场景）

> Al Brooks 47B: "They sell near top and scale in higher and buy near the bottom and scale in lower"

- 在 TR 边缘入场后，如果被 surprise BO 打过 → 可以在更远处加仓（scale in）
- 前提：**80% BO 会失败** → 加仓押注回归
- **仅限经验丰富时使用** — 初学者不 scale in

## 从 pre_signal 到可执行限价单

> TR 里“有信号”不等于“已经能挂单”。Brooks 的关键是：边缘 + 二次信号 + 数学。

### `PRE_SIGNAL`

满足任一即可进入预信号：
- 到达上/下三分之一边缘
- 出现第一次反转线索
- 出现失败突破但还没确认

### `CANDIDATE_LIMIT`

必须同时满足：
1. 位置在边缘，不在中部
2. 出现 **二次信号**（H2/L2 / 第二腿失败 / 明确 signal bar）
3. 已经有 `entry_zone` 或计划委托草案

### `EXECUTABLE_LIMIT`

必须在 `candidate` 基础上再满足：
1. 有明确 `entry_price`
2. `LIMIT` 是正确订单类型
3. `P×R` 通过
4. 没有因为 TTR/中部位置而失去优势

### 哪些情况继续等待

- 只有第一次信号，没有第二次确认
- 在边缘附近，但 signal bar 质量差
- 价格已回到中部
- TTR 高度过小

---

## TR2: Failed BO Fade（突破失败反做）

> Al Brooks 47C: "Traders betting on failures make money"

### 本质
- TR 中 80% 的 BO 失败 → **fade BO** 是 TR 中最高概率的策略
- 不是猜 BO 会失败 — 是**等 BO 失败后才入场**

### 入场流程

1. **BO 发生** — 价格突破 TR 边界
2. **等 1-3 根** — 观察有没有 FT
3. **失败信号**：
   - BO bar 后下一根反向收盘（BO 回 TR 内）
   - 连续 1-3 根后无新极值 + 反向 K 线出现
   - BO bar 的 gap 被回补
4. **入场** — 反向信号 K 线的对侧（多→阳线上方止损单，空→阴线下方止损单）

### SL / TP
- **SL**: BO 的极值外（BO 高点上方 / BO 低点下方）
- **TP**: TR 中间（保守）或 TR 对侧（如果反转力度强）
- **风格**: Scalp（1R）到小 Swing（如果 leg 有力量 → 可持有到对侧）

### 不 Fade 的情况
- **连续 3+ 大趋势 K 线 + Gap 未回补** → 可能真 BO → 不 fade
- **FT 强劲**（2+ 根大趋势 K 线收在极端）→ 不 fade
- **第 3 次同方向 BO** → 可能是真的（channel 不是 TR）→ 不 fade

### "第 3 次不入场" 规则

> Al Brooks 47C: 第 1 次和第 2 次可以 fade，到第 3 次 = 可能是 channel 不是 TR

---

## TR3: 2nd Leg Trap（第二腿陷阱）

> Al Brooks 47A: "Skilled traders see 2 legs up to LH after nested 2 legged moves in TR day. Probable 2nd Leg Trap"

### 本质
- TR 中价格做 **2 leg 冲到边缘** → 看起来像 BO → 初学者追入
- 高手识别为 **2nd Leg Trap** → fade 第二腿

### 识别条件
1. 确认在 TR 中（S3 判定）
2. 价格做了 **2 leg 到达 TR 边缘或略超**
3. 第 2 leg 通常比第 1 leg **更陡更急**（看起来最强 = 最危险）
4. 到达位置接近 **前高/前低** 或 **MM 目标**

### 入场流程
1. 识别 2 leg 到达 TR 上沿 → 出现反转 K 线（阴线收下半，或 doji 后阴线）
2. **等确认**：下一根收盘在反转 K 线低点下方
3. 入场做空 → SL 在 2nd leg 高点上方
4. TP: TR 中间

### 关键区分：2nd Leg Trap vs 真 BO
- **Trap**: 2nd leg 到达边缘后**立即出现反向 K 线** + 无 FT
- **真 BO**: 2nd leg 后有 **FT**（连续同向 K 线 + Gap）→ 不 fade

### 和 S3 的关系
- S3 定义了 2nd Leg Trap 的概念 → S6-tr 提供入场执行细节
- 持仓中看到 2nd Leg Trap → S7 减仓（强 2nd leg + 无 FT → 立即减仓）

---

## TR4: Daily TR Fade（日线 TR 反做）

> Al Brooks 49F: 当 Daily 处于 TR + 昨天大阳/阴收极端 → 次日 fade

### 前提条件
- S0 判定 Daily = TR
- 昨天大阳收顶部 → 今天 fade 做空
- 昨天大阴收底部 → 今天 fade 做多
- 确认 5m 有对应的反转信号

### 入场流程
1. **S0 Daily 偏置**: Daily TR + 昨日大 K 线收极端
2. **5m 开盘前 6-12 根**: 等待 opening reversal（50% 概率）
3. **确认信号**: 5m 出现反向 H1/H2（fade 做空）或 L1/L2（fade 做多）
4. **入场**: 信号 K 线确认后

### SL / TP
- **SL**: 今日极值外（或昨日 H/L 外）
- **TP**: TR 中间（即 Daily TR 的中间区域）
- **风格**: Scalp/小 Swing

### 时段敏感
- **欧盘开盘 / 欧美交叉** 时段最佳（流动性高，反转力度大）
- 亚盘 fade → 力度弱，只做 micro scalp

---

## S1: HTF S/R Reversal（高级别 S/R 反转）

### 本质
- 1h/Daily 在强 S/R 位 → 到 5m/15m 找反转入场
- **不是在大周期入场** — 是用大周期的 S/R 作为 context，在小周期找精确入场

### 前提条件
1. 1h 或 Daily 到达**明确的 S/R**（前高/前低、MM 目标、整数关口、周线 H/L）
2. 该 S/R 在 S3b 标注中可见
3. 5m/15m 出现**反转信号**（H1/H2 或 L1/L2 + 反转 K 线）

### 入场流程
1. **大周期定位**: 1h/Daily K 线到达 S/R
2. **等小周期反转**: 5m 出现反转 K 线 + H1 确认
3. **多 S/R 重合检查**: 多个 S/R 重合 = 更高概率反转
4. **入场**: 小周期反转确认后

### SL / TP
- **SL**: S/R 的另一侧（如果 S/R 被真 BO → 止损）
- **TP**: MM（从 S/R 反弹的 MM）或回到 TR 中间
- **风格**: Swing（大周期 S/R 反转往往走得远）

### 和 S3b 真空效应的关系
- S3b 的 ≤25% 真空加速区 → 价格接近 S/R 时加速 → **不是 BO 信号**
- 到达 S/R 后磁力消失 → 反转条件成立

---

## S2: Micro Channel 反转

### 本质
- Daily 出现微通道（每个低点 ≥ 前低）→ 极强趋势
- **前日低/高外反转** = 微通道被打破 → 可能 MTR 的第一步

### 前提条件
1. S0 判定 Daily 为微通道（连续 N 天低点不破前日低）
2. 当天价格**突破到前日低/高外**
3. 5m 出现**反转信号**

### 入场流程
1. **Daily 微通道 + 突破前日极值** → 微通道被破坏
2. **5m 等反转确认**: H1/H2（多头反转）或 L1/L2（空头反转）
3. **入场**: 反转信号确认后

### SL / TP
- **SL**: 信号 K 线的对侧
- **TP**: 前高/前低（回到微通道内的第一个目标）
- **风格**: Swing（微通道破坏往往有 MM 目标）

### 注意
- 微通道 = 极强趋势 → 第一次破坏 **70% 只是 minor reversal**
- 默认 Scalp 或小 Swing → 有 MTR 三部曲确认后才升级

---

## TTR 处理（特殊）

> Al Brooks 47A: "When Trading Range is tight, better to not trade. If trade, use limit orders, scale in, and scalp"

| 条件 | 操作 |
|------|------|
| TR 高度 ≤ 3 根 K 线 | **不做** — 等 BO |
| TTR 中 BO 尝试 | 可以 fade（80% 失败）但利润极小 |
| TTR 可能是 Final Flag | 留意反向 BO（[S6-reversal.md](S6-reversal.md) Final Flags） |
| TTR 在趋势末期 | 50% 导致 MTR → 关注反转方向 BO |

---

## TR 入场分阶段成长

> 从 S3 移入，作为执行指南

| 阶段 | 入场方式 | 适合 |
|------|---------|------|
| **基础** | Stop order 在 reversal bar 后 | 打好基础 |
| **进阶** | 等 2nd entry → stop 入场 | 提高胜率 |
| **高手** | Limit order + scale in | 灵活刮头皮 |

---

## 关键概率

| 规则 | 概率 |
|------|------|
| TR 中 BO 失败 | **80%** |
| TR 边缘 1/3 → 先到对侧 | **60%** |
| 概率在 TR 中 | 大多 **~50%** |
| 2nd Leg Trap 失败 | **~60-70%** |
| Daily TR + 昨日大 K → 次日 fade | **~55-60%** |
| 微通道首次破坏 = minor | **70%** |
| TTR 中 stop order 亏钱 | 大多数时候 |

---

## 入场前你必须确认

1. **确认 TR**（不是 Channel 弱化伪装成 TR）— S3 已判定
2. **TR 宽度够**（Broad TR，不是 TTR）
3. **价格在边缘 1/3**（不是中间）
4. **有反转信号 K 线**（不盲挂限价单）
5. **订单类型 = 限价单**（TR 中禁止止损单追 BO）
6. **P×R 达标**（Scalp ≥ 1.0）

## 入场后管理

→ **S7-management.md** — 管理 Playbook M3（TR 固定 SL）或 M5（Scalp 快出）

## 没找到信号

→ 正常。TR 中等边缘，不追中间。
→ "宁可错过也不强做"

> 原话锚点 → 详见 [Q3-fear.md](quotes/Q3-fear.md)
