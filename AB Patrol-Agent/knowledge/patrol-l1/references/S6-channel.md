# S6-channel 通道中怎么做 — TC 只顺势，BC 可双向

> 状态: S3 判定 Tight/Broad Channel → 来这里。
> TC: "Only buy, especially PB. Take partial profits at new high."
> BC: "Mostly buy, but can sell. Scalp more, swing less. Use limit orders."

---

## 多周期入场 — 不只看 5m

**15m 不是只用来"确认"的。15m 上的 H2 就是一个独立的 Swing 入场信号。**

| 周期 | 角色 | 入场类型 | 目标 |
|------|------|----------|------|
| **1h** | 大方向 + 主要 S/R | 很少直接入场 | 定义大局 |
| **15m/30m** | 结构 + Swing 入场 | H2/L2/EMA-PB/Wedge | 2R+，持有 |
| **5m** | 主力图 + Scalp/Swing | 所有 setup | 1R(scalp) 或 2R+(swing) |

**用法**：先看 1h 定方向 → 15m 找 Swing setup → 5m 找入场时机 → 15m 和 5m 都有信号优先 15m

---

## 回调入场 — H1/H2/L1/L2

**最经典的 Al Brooks setup。**

### H1/L1：第一次回调
- Bull: BO 后第一根阴线/doji 后的第一根阳线上方买入
- Bear: 第一根阳线/doji 后的第一根阴线下方卖出
- 最强趋势中使用（BO 阶段）

### H1 场景有效性

| 场景 | H1 有效性 | 操作 |
|------|---------|------|
| **Spike 后（BO 阶段）** | ✅ 高 — **默认 H1 入场，不等 H2** | Spike 后 PB 浅 → H1 就是好入场 |
| **强 TC 中** | ✅ 中高 | PB 天然很浅 → H1 够了 |
| **BC 中** | ⚠️ 中 | 有 FT 的话可以 |
| **TR 中** | ❌ 低 | H1 在 TR 中太弱，等 H2 |
| **弱趋势中** | ⚠️ 低-中 | PB 可能继续 → 等 H2 更安全 |

**"Spike 后默认 H1"**：在强 BO/Spike 后，第一次回调入场（H1）的成功率远高于通常。等 H2 可能错过整个 move。

### L1 Fail → H1 Succeed — 计数的本质

**核心逻辑**：L1 = 第一次逆势尝试。强趋势中 L1 **80% 会失败**。L1 的失败本身就是 H1 的入场信号。

- Bull trend 中：第一根阴线 (L1 attempt) → 下一根阳线 = H1 入场
- L1 失败 = 空头第一次试探被多头吃掉 → **确认趋势仍强**
- 这不是两个独立事件，而是**同一个博弈**：L1 的失败**就是** H1 的成功

**实战含义**：
- 不要等 L1 "是否成功"再决定 — 在强 BO/Spike 后，**默认 L1 会失败**
- L1 失败后的 H1 = 最高概率的趋势入场之一
- 如果 L1 居然成功了（深度 > 50%）→ 趋势可能弱化 → 切换到等 H2

### H2/L2：第二次回调
- Bull: 两根阴线后的阳线上方买入
- Bear: 两根阳线后的阴线下方卖出
- 成功率 ~60%，盈亏比需要 > 1.5:1
- 通道中最经典的入场方式

### Tight Channel 量化

- Al Brooks 原话："如果 PB < 平均 K 线实体的 2 倍 → tight channel"
- Tight channel 中逆势做，**即使 70% 准确也会亏钱**（那 30% 被趋势带走很远）
- 5m tight channel = 15m/30m 级别的一根 BO K 线 → **只能顺势**

### PB 深度与趋势强度

| PB 深度 | 趋势状态 | 操作 |
|---------|---------|------|
| < 1/3 腿 | Tight channel（极强） | 顺势 any PB 入场 |
| 1/3 - 1/2 腿 | 正常 channel | 顺势 H1/L1 |
| 1/2 - 2/3 腿 | Broad channel（弱化） | 顺势 H2/L2 更安全 |
| > 2/3 腿 | TR 临界 | 等 BO 确认再入 |
| > 100% 腿 | 已反转或 TR | 切换方向 |

### EMA PB

- 强趋势中 EMA 是天然支撑/阻力
- **"双 20 买点"**：20+ 根在 EMA 一侧后首次碰 EMA → 高概率反弹
- 60% 出现 MTR attempt（最后一腿）；其中 60% PB/TR，40% MTR 成功

### 20 Gap Bar — 极强趋势信号

- **定义**：连续 20+ 根 K 线没有触碰 EMA → 极强趋势，AI 方向确定无疑
- **交易含义**：
  - 这期间**不做反转**，即使看到 climax 迹象 → 等 EMA 被碰后再说
  - 首次回到 EMA 附近 = "双 20 买点"（上方已提）→ **高概率反弹**
  - 20 Gap 期间的 PB 都是浅 PB → H1 入场即可

### First EMA Gap Bar — 趋势恢复确认

- **定义**：PB 碰触/穿越 EMA 后，第一根重新远离 EMA 的 K 线（收盘回到 EMA 正确一侧 + Gap 出现）
- **意义**：PB 结束 + 趋势恢复的**早期信号**
- 常和 H1/H2 重合 → 额外确认
- **注意**：如果 PB 期间 EMA 被反复穿越（多次 gap-close-gap）→ 不是 first gap bar → 当 TR 处理

### PB 完成确认清单（入场前必检）

> Al Brooks PPT: "PB in Bull Ends: Bar Goes above High of Prior Bar"
> "PB in Bear Ends: Bar Goes below Low of Prior Bar"

PB 未完成 = 不是 PB，可能是趋势转换。**必须确认 PB 完成才能入场。**

| PB 完成信号（满足任一） | 说明 | 周期适用 |
|------------------------|------|---------|
| **H1/H2 触发**（多）或 **L1/L2 触发**（空） | 价格突破前一根 K 线高点/低点 = PB 结束确认 | 所有 |
| **3+ bars 窄幅结构** | 极值不再创新低(多)/新高(空)，range 收窄 | 5m/15m |
| **强趋势方向 K 线出现** | body > 50% range，方向和趋势同向 = 买方/卖方重回 | 所有 |
| **First EMA Gap Bar** | PB 碰 EMA 后首根远离 EMA 的 K 线 | 所有 |
| **15m 级别 1-3 根完成** | 15m 一根 = 5m 三根，天然满足"3+ bars" | 跨周期 |

**PB 未完成 → 不入场**：
- PB 还在创新低(多)/新高(空) = 趋势方可能已失去控制
- 此时入场 = 信号 K 线还没出现 = SL 只能放微观位 = 必然太紧
- 记录 `[PASS-WAIT] PB_NOT_COMPLETE`

## Broad Channel 的执行语义

> 这是 Patrol 最容易误判的地方。Brooks 的核心不是“BC 一律做多/做空”，而是：**scalp more, swing less；逆势优先 limit，顺势恢复才考虑 stop。**

### Broad Channel 逆势 fade

- 默认只算 **反转试探**
- 必须先到边缘（上沿/下沿或明显通道线测试）
- 只有在以下条件出现后，才允许从 `pre_signal` 升到 `candidate`
  1. `H2/L2`
  2. `HL/LH MTR`
  3. 双顶/双底 + 失败突破后的接受
- 真正 `executable` 还要求：
  - 明确 `entry_price`
  - `LIMIT` 委托
  - 正 TE

### Broad Channel 顺势恢复

- 典型模式：
  - `first pullback`
  - `EMA PB`
  - `H2/L2 in Channel`
  - `PB 完成后恢复`
- 从 `pre_signal` 升到 `candidate` 的条件：
  - PB 完成
  - 恢复方向的 signal 出现
  - 有接受/跟进证据
- 真正 `executable` 时：
  - 默认 `STOP_MARKET`
  - 没有 trigger 价，不得提前追单

### Broad Channel 的铁律

- **逆势不要追 stop**
- **顺势不要在中部乱挂 limit**
- 边缘不清晰、接受不清晰时，继续观察

---

## 趋势形态

### 楔形 (Wedge) — 三推收缩通道

**好 Wedge 的 5 个条件**：
1. Stair pattern（对手盘能获利）
2. Anti-trend bar（close 好）
3. 两条线收敛 (convergent)
4. 不在 TTR 中
5. 各 leg bar count 均衡

**三种 Wedge**：
- **普通 Wedge**: 满足 5 条件 → 高概率反转（75%）
- **Parabolic Wedge**: 三次 climax + slope 加速 → exhaustion 反转
- **Bad Wedge**: strong trend 中 + gap → **只是 minor reversal → 不做反转**

**Failed Wedge**：失败 → 继续原方向 → look for MM

**用法**：
- 持仓中看到好 wedge + stair → 准备止盈
- 反转入场：只做好 wedge + 等 BO FT
- Wedge + Stairs = trend 弱化信号

### 双顶/双底 (DT/DB)

**关键判断：Flag 还是 Reversal？**
- **作为 Flag**：DT/DB = L2/H2 setup → 两次 anti-trend 失败 → trend 继续
- **作为 Reversal**：所有 MTR 都是 DT/DB → 跌破 neckline = 确认
- 趋势中 DT/DB → **默认 Flag**（顺势做）
- 末期 + 好 context → 可能反转

**Neckline & MM**：neckline 穿越 = 确认方向 → 从 neckline 做 MM 设 TP
**Failed DT/DB**：失败 → 顺原趋势 MM

### 三角形 (Triangle)

- Triangle = TTR = BO mode = **50/50** 上下突破
- Late trend triangle → 通常是 Final Flag
- 确认 BO + FT → 入场
- 扩展三角形 (ET)：Late trend 大 ET 可能是 MTR（5 次反转 + break trend line）

### 头肩 (H&S)

- **H&S = MTR** + **大多数 H&S reversal 是 minor**
- H&S 也是 TR → 可以 BLSHS
- 优先 right shoulder 入场 > 等 neckline BO
- 需 TBTL + break major channel 才 swing

---

## 趋势晚期 — FOMO / Exhaustion

### FOMO 趋势的本质

- FOMO 趋势 = 紧密通道：每个人都在买小量，没有回调
- **"Buy The Close" / "Sell The Close"**：在每根强趋势K线收盘价附近入场

### Final Trend Bar — 趋势终结信号

- 趋势中最后一根强势趋势K线，之后不再出现更强 FT
- 识别信号：bad FT + 影线出现 + 反转K线实体
- **"Disappointment is a warning of possible reversal"**

### Give-up Bar — 趋势方投降

- 趋势方最终放弃 → 多头和空头**都在同方向操作** → 强反转K线
- PB 无法超过 High/Low Close → 急于出局

### Fade Late BO

| 情景 | 策略 | 原因 |
|------|------|------|
| 趋势 20+ bar 后最大趋势K线 | 反做 | Climax = 衰竭 |
| Climax + Wedge + MM 完成 | 在 MM 处反做 | 60% 概率到达目标 |
| 连续 Sell Climax 后最大 bear bar | 做多 | 超卖 + 真空测试 |
| TTR 在趋势顶部/底部 | 留意 MTR | 趋势方不再愿意 swing |

- **"Big BO late in trend is usually the END, not the beginning"**
- **高潮总是在 S/R 结束** — 前高/低、MM、通道线

### TTR 可能是 MTR

- 趋势 10+ bar → TTR → 内部 DT/DB → MTR 成功概率 > 通常的 40%
- TTR = 趋势方不再愿意 buy-and-hold for swing → 力量在转移

### 回调递进弱化 — 趋势老化的指纹

趋势中的 PB 序列会呈现**递进弱化**模式：

| PB 序号 | 典型深度 | 含义 | 操作 |
|---------|---------|------|------|
| PB1（首次回调） | < 1/3 腿 | 趋势极强，PB 浅 | H1 入场，不犹豫 |
| PB2 | 1/3 - 1/2 腿 | 正常弱化 | H2 入场 |
| PB3+ | > 1/2 腿 | 趋势疲软 | H2 要求更高质量信号 K 线 |
| PB > 2/3 腿 | — | TR 临界 | 停止顺势 Swing |

**实战用法**：
- 跟踪当前趋势是第几次 PB → 判断趋势所处阶段
- PB 深度突然加深（如从 1/3 跳到 2/3）→ 趋势方 exhaustion → **降低仓位或只 Scalp**
- PB 序列 + Wedge + MM 完成 = 强反转前兆

---

## 日内模式

### 开盘反转 (Opening Reversal)

- **50% 的开盘有 failed BO + 反转** → 不追开盘方向，等确认
- 连续 2+ 大趋势K线收盘在极端 + 少重叠 → **70% 概率至少达到 MM**

### Spike and Channel

- **90% 的 BO 阶段**之后 → PB → Channel 或 TR
- 只有 **10%** 直接反转

### Micro Channel = Climax

- 16+ bar 微型通道 = **不可持续** = Climax
- 止损太远 → 强势方需要减仓 → TR 即将到来
- **70% TBTL** → 等回撤再入场

### 弱信号 = TR 概率高

- 不确定时 → **默认 TR** → BLSHS → 不追方向
- **"Uncertainty means TR likely"**

---

> **导航**: [S6-bo.md](S6-bo.md) (BO 入场) | [S6-tr.md](S6-tr.md) (TR 入场) | [S6-reversal.md](S6-reversal.md) (反转入场) | [S6-common.md](S6-common.md) (通用规则)

---

## 指标层与决策层的边界

- `ab_ema` 提供 EMA 斜率、MAG、First PB、EMA 触碰等数值证据
- `S6-channel` 只负责把这些数值转成执行语义：
  - 这是 First PB 还是普通 PB
  - 这是 Swing 还是只能降级成 Scalp
  - 这是 `STOP_MARKET` 还是继续 `WATCH`
- 具体理论背景统一看：
  - `canonical/C1-market-cycle-and-state.md`
  - `canonical/C2-triggers-and-reversal-taxonomy.md`
  - `quotes/Q4-entry.md`
