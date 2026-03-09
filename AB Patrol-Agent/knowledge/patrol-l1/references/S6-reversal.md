# S6-reversal 反转怎么做 — 最危险的交易，最高的回报

> 反转可从任何市场状态触发: Channel末期、BC后、TR中。不由状态限制，但需满足严格条件。

> 默认立场：**不做反转**，除非证据压倒性地支持。
> "在你认为 90% 确定会反转的时候，实际概率只有 60%"

## 文件职责与边界

- 本文件只负责：
  - `wedge / MTR / DB / DT / Final Flag / Climax reversal` 的执行规则
  - `反转试探 -> candidate -> executable` 的升级条件
  - 反转类 setup 的订单类型与无效条件
- 本文件不负责：
  - Broad Channel / TR 的边缘限价单细节 → 分别看 `S6-channel.md` / `S6-tr.md`
  - 最终 TE 与风格一致性 → 看 `S5-evaluation.md`
  - 反转之后的持仓管理 → 看 `S7-management.md`

---

## 反转的本质

- 反转 = 向相反价格行为的转变 — **不一定是相反趋势**
- Bull → TR、TR → Bear、Bear → TR 都算反转
- **大多数反转涉及 TR** — 趋势很少直接 V 反转
- **默认假设每个反转都是次要的** → 直到证明是主要的

### 次要 vs 主要反转

| 类型 | 定义 | 结果 | 交易方式 |
|------|------|------|---------|
| **次要** | 趋势中的 PB | 变成 flag 或 TR | scalp 或小波段 |
| **主要** | 趋势方向根本改变 | 新趋势开始 | **必须 swing** |

- 下一次反转有 **40% 概率**成为主要反转
- **80% 的趋势反转尝试会失败** → 你在跟 80% 概率对赌

---

## 什么时候可以考虑反转

**必须同时满足 5/5 条件**（缺一不可）：

1. **Climax 出现** — 趋势末期（20+ 根后）出现大 K 线 / Exhaustion Gap
2. **趋势线被突破** — 真正的 BO，不是碰一下就回来
3. **回测不创新高/新低** — 回测后形成 HL 或 LH
4. **强反转 K 线** — 有说服力的反向趋势 K 线（不是 doji）
5. **多周期确认** — 15m 或 1h 也出现反转迹象

满足 5/5 → 可以考虑入场
满足 3-4/5 → 观察但不入场
满足 <3 → 不考虑

## 反转试探的升级规则

> 反转不是一下子从“看到楔形”跳成“可以 swing”。Brooks 的默认立场是：第一次反转通常较小，先按试探处理。

### `PRE_SIGNAL / 反转试探`

出现以下任一线索时进入：
- `wedge`
- `MTR`
- `DB / DT`
- `Final Flag`
- `climax + trendline break`

但此时仍然默认：
- 只够 `反转试探`
- 不直接做 swing executable

### `CANDIDATE`

必须至少再出现一项：
1. `H2/L2`
2. `HL/LH MTR`
3. 失败突破后的接受
4. 明确的二次反转信号

### `EXECUTABLE`

在 `candidate` 基础上还要满足：
1. 有明确 `entry_price`
2. 风格与订单类型匹配
3. `P×R` 达标
4. 若背景仍是强 BO / Tight Channel，必须再看到接受/跟进

### 订单类型原则

- `TR` / `Broad Channel` 边缘的反转试探 → 优先 `LIMIT`
- 强突破后的真正反转确认 → 可转 `STOP_MARKET`
- 没有 acceptance，就不要把第一次反转升级成可执行 swing

---

## MTR 三部曲 — 核心机制

```
1. Minor reversal break trend line → MTR 概率变成 40%
2. Trend resume but fail to reach old extreme（至少 33% PB 测试）
3. 2nd reversal with strong BO → MTR 确认
```

**三部曲本质**：不是机械三步，而是**对手方逐步证明力量的过程**。
- 第 1 步：对手方第一次展示力量 → 60% 原 trend 继续
- 第 2 步：原 trend resume 但力竭 → 证明原方失去部分控制
- 第 3 步：对手方第二次进攻 + strong BO → 控制权正式转移

**MTR 经常需要多次尝试才成功** — market resist change → 三部曲可能重置多次。

### 概率转换的精确阈值

- **入场时 MTR 概率 = 40%**（2x risk 盈利）
- **→ 60% 转换条件** = 明确的 AI 方向改变（strong BO 或 3+ strong opposite bars）
- 入场时按 40% 管理 → **看到 3+ 强 BO bar 后**才升级为 swing

### 60% = 小赚/小亏，不是全亏

- 60% MTR 结果是**小利润或小亏损**，只有 40% 走出 swing
- MTR 的真实风险比想象的小：60% 保本，40% 赚大
- 前提：**止损和仓位管理正确**

### 33% PB 最小测试阈值

- 回测至少到达前低/高的 33% 才算有效测试
- < 33% = 测试不充分 → 对手方没真正展示力量 → MTR 不太可能

### Minor Reversal 最小压力量化

- 正常路径：**5-10 根**K线积累压力 → 破趋势线
- 快速路径：**1-3 根强势**大实体K线 → 直接破线
- 不足：< 5 根普通 + < 3 根强势 → 只是 minor → scalp only

---

## HH MTR vs LH MTR — 在哪里做反转

**判断标准 = DT/HH 形成前的 selloff 强度**：
- Selloff **弱**（PB 小/短/tight）→ 强弩之末 → 等 **LH MTR**（更安全）
- Selloff **强**（PB 大/深/有 stair）→ 对手方已展示力量 → 可做 **HH MTR**

**与 channel 类型挂钩**：
- **Tight channel** → 只做 **LH MTR**（tight = 更高周期的 BO，first reversal 70% minor）
- **Broad channel**（有 stair）→ 可做 **HH MTR**
- **Small PB trend** → **绝对不做 MTR**（最强 trend = 大周期 BO）

### HH → LH 过渡区域概率

- 40% MTR 成功 | 40% 变 TR | 20% Trend resume
- 最聪明做法：**sell at the top**
  - MTR 成功 → 赚大
  - 变 TR → 也是 sell at top → scalp 到 TR 中间
  - 只有 20% 风险

---

## MTR 完整条件清单

1. Break trend line 的 minor reversal 足够强（10+ small bars 或 几个 big bars）
2. **Broad Channel** 而非 tight channel
3. **Good signal bar** at reversal point
4. **Final leg 特征**：有 exhaustion 迹象
5. **多个理由重合**：wedge + MM + MAG + good signal bar + context

### 所有 MTR 都是 DT/DB

- HL MTR = DB 的一种 | LH MTR = DT 的一种
- **"You might not see them as DT or DB, but computers do"**
- H&S = MTR 的扩展版 | right shoulder = 最佳入场位

### LL/DB MTR → 通常跟随 HL MTR

- 错过了 LL MTR 的入场 → **等 HL MTR**，更高概率

### MAG → MTR

- MAG = final flag before MTR attempt → 最重要的前兆之一

---

## Climax Reversal — 高潮反转

### Climax 的测试本质

- Climax = 结束 leg 或 trend 的加速 BO
- **市场出现 climax 后必须回去测试** — 不是巧合，是必然
- **50/50 基础概率** — 无 context 时 reversal 和 continuation 各半
- **Climax 是事后才能确定的** — 发生时你不知道是 climax 还是 BO

### Climax 四种形式

1. **1-3 个大 trend bar**（最典型）
2. **很多小 trend bar**（micro channel，70% TBTL）
3. **Micro channel 本身 = climax**
4. **Tight channel** = 也是 climax 形式（但交易方式不同）

### Exhaustion Bar ≠ 自动反转

> Exhaustion bar 只是说明趋势方**止盈了**，不是对手方来了。

**常见错误**：看到 late trend 大 bar → "exhaustion！做反转！" → 错！

**Exhaustion 后真正发生的事**：
1. Trend 方 take profit（这才是 exhaustion 的意思）
2. 他们**没有消失** — 只是观望
3. 等 10 bar → 回撤浅+对手弱 → trend 继续
4. 回撤深+对手强 → 可能 TR 或 reversal

**确认方法**：
- **Gap 关闭 = EG 确认** → 可以 fade → 最小目标 = climax 起点
- **Gap 保持 = MG** → 继续顺势
- **在 gap 关闭之前，你不知道是哪个！**

### Climax 关键概率表

| 场景 | 概率 | 实战含义 |
|------|------|---------|
| Climax 基础概率 | **50/50** | 无 context 时各半 |
| 大部分 climactic reversal | 多数是 minor | **别急着反做！** |
| Late channel line BO | **70% swing reversal** | **最好的 climax trade** |
| Late TR line BO | **60% MM** | 不做反转！做 MM 顺势 |
| Late trend 大 bar | **60% exhaustion** | exhaustion ≠ 反转 |
| Climax 后 TTR | **50% 导致 MTR** | 高概率转换区 |
| Open Climax（前日 trend day） | **75% 2h 内 TBTL** | 等 TBTL 再决定 |
| Micro Channel | **70% TBTL** | 等回撤再入场 |
| 连续 climax in channel | **75% 反向 BO** | 累积反转能量 |
| SPB（小回调 trend） | **不做反转** | climax 不够极端 |

### 四方博弈模型

| 角色 | 牛市 climax 中 | 熊市 climax 中 |
|------|---------------|---------------|
| **Strong Bull** | 止盈（创造 exhaustion） | 在 climax 低点"接 Gift" |
| **Weak Bull** | 追涨（买在顶部） | 不停抄底 |
| **Strong Bear** | 在 climax 高点"送 Gift" | 止盈（创造 exhaustion） |
| **Weak Bear** | 不停做空 | 追跌（卖在底部） |

**自检**（每次想做 climax reversal 前）：
1. 我是不是在 strong trend 中做 1st entry reversal？→ Weak trader
2. 有没有等 10+ bar？→ 没等 = 冲动
3. 是不是看到大 bar 就想反做？→ 60% exhaustion 但 ≠ reversal
4. 位置是 channel line（70%）还是 TR line（60% MM）？→ 后者不做反转
5. 目标是 scalp 还是妄想 swing？→ **默认 scalp，有 MTR 再升级**

---

## 末端旗形 (Final Flags)

- FF 是趋势末期的执行语境，不是单独脱离 context 的入场理由
- 用法只保留两条：
  1. 持仓中看到 FF 特征 → 进入保护/止盈预案
  2. FF + MM 完成 + 缺乏 FT → 允许反转 `Scalp`
- 详细理论边界统一看：
  - `canonical/C2-triggers-and-reversal-taxonomy.md`
  - `canonical/C4-management-and-exit-operations.md`

---

## R3: Channel Line BO Fade — 通道线突破反做

> Al Brooks: "Late channel line BO → 70% swing reversal" — 这是最高概率的 climax trade

### 本质

- 通道在**末端**（20+ 根 K 线后），价格突破通道线
- 看起来像加速 BO → 实际是**通道 climax**
- **70% 概率**产生 swing 级别的反转 — 所有反转策略中概率最高

### 前提条件（全部必须满足）

1. **确认通道** — S3 判定为 Channel（不是 TR 也不是 BO）
2. **通道末期** — 已有 **20+ 根 K 线** 或 **3 次触通道线**
3. **BO 发生在通道线外** — 价格真正突破通道边界（不是碰了回来）
4. **BO 缺乏 FT** — 1-3 根后无连续同向 K 线
5. **出现反转 K 线** — 反向大实体 K 线，收盘在通道内或接近通道线

### 入场流程

1. **等 BO** — 价格突破通道线（Bull Channel → 突破上轨，Bear Channel → 突破下轨）
2. **观察 1-3 根** — 看有没有 FT
3. **确认失败** — 无 FT + 反向 K 线出现（收盘方向回通道内）
4. **入场** — 反向信号 K 线后止损单入场（Bull Channel → 做空，Bear Channel → 做多）

### 和 Climax Reversal (R2) 的区别

| 特征 | R3 Channel Line BO Fade | R2 Climax Reversal |
|------|------------------------|-------------------|
| **位置** | 通道线外 | 趋势任意位置 |
| **概率** | **70%** swing reversal | **50/50** 基础概率 |
| **识别** | 通道+末端+BO通道线 | 大K线+Exhaustion |
| **入场时机** | BO失败后立即 | 需等更多确认 |
| **默认风格** | **Swing** | **Scalp** 优先 |

### SL / TP

- **SL**: BO 的极值外（通道线 BO 的最高/低点 + buffer）
- **TP1**: 通道内回归（通道中线）— Scalp 目标
- **TP2**: 通道对侧 — Swing 目标
- **TP3**: MM（从 BO 极值到通道线的距离 = 回归距离）
- **风格**: **默认 Swing**（70% 概率 = 所有反转中最高）

### 不做的情况

- BO 有 **strong FT**（2+ 根大趋势 K 线 + Gap 保持）→ 可能真 BO → 不 fade
- 通道才 **< 15 根** → 不算末端 → fade 概率下降到 ~50%
- BO 方向和 **Daily AI 方向一致** → 更可能是真 BO → 谨慎

### 和 S3 / S6-tr 的关系

- S3 判定通道 + 末端特征 → 启用 R3 关注
- 如果 S3 判定 TR 而不是通道 → 用 [S6-tr.md](S6-tr.md) TR 策略，不用 R3
- R3 成功后 → 通道可能变 TR → 后续切换到 [S6-tr.md](S6-tr.md) TR 策略

---

## Market Cycle 纪律

- 强 trend 的 climax → 默认先看成 `TR / probe / final flag`
- 第一次反转通常不直接升级成反向趋势
- 只有经过 test、acceptance、follow-through 后，才允许从 `probe` 升级
- 理论背景统一看 `canonical/C1-market-cycle-and-state.md`

---

## 常见陷阱

- **V 反转** → 极少见，大多数会变 TR。小周期上总有其他形态
- **BC 后立即反做** → 60% 变 TR，不是直接反转。等 2-3 根 K 线
- **一根大反转 K 线就入场** → 需要结构，单根不够
- **圆弧形态** → "总有别的解释"，50% 概率任何方向，当 TR 处理
- **Endless PB** → 看起来像反转但可能只是深回调，等 BO 确认
- **初学者的致命陷阱**：到处看到反转信号 → 小亏累积 → 账户消失
- **4 根阳线 ≠ 新趋势** — 在 tight channel 中，4 根反弹全是 minor reversal

---

## 反转交易管理

### 入场后特殊规则

- **必须有 R ≥ 2:1**（课程标准：P≈40% + R≥2:1 → P×R > (1-P) ✓ 正期望值）
- **前 2-3 根 K 线是关键**：没有 FT → 立即考虑平仓
- **不加仓**：反转仓位不加仓，盈利后才考虑
- **移止损要快**：一旦有利润 → 移 SL 到保本

### 如果做了反转 → 必须按 Swing 管理

- **不能因为是反转就 scalp**（低P + 低R = 必亏策略）
- TBTL（10 bar + 2 legs）是反转最低目标，不到不平
- 达到 TBTL + 2x 风险后 → 至少部分获利了结

### 动态 Premise 管理

| 场景 | 市场表现 | 操作 |
|------|---------|------|
| Strong BO + FT + 到达 support | Premise 成立 | 持有到 target |
| 到了 MM target，大家都在走 | Premise 部分成立 | 跟着 take profit |
| Spike 后 TTR，多次下不去 | Premise 改变 | 小利离场 |
| 对手方 H2 flag 出现 | 原军回来了 | 平仓 |

### 数学与入场方式

- 反转的数学与风格判断统一回看 `S5-evaluation.md`
- “早入场 vs 等确认”的理论边界统一看：
  - `canonical/C2-triggers-and-reversal-taxonomy.md`
  - `quotes/Q5-te.md`

---

## 多周期嵌套视角

**从大到小**：
- 1h 出现 MTR 三部曲 → 5m 上的 2nd reversal BO = 1h MTR 的早期入场

**从小到大**：
- 5m MTR → 问："在 1h 中是什么角色？"
  - 1h TC 中 → 5m MTR = 只是 1h minor PB → **不做**
  - 1h late wedge → 5m MTR = 1h 反转早期信号 → 可以做
  - 1h TR 边缘 → 5m MTR = TR leg reversal → 可以做（fade TR）

**Open MTR**：
- 开盘 MTR 需要**更少 bar 数**
- 但仍然只有 40% swing，60% 变 TR

---

## 反转前必须确认

1. 列出 5 个条件，**逐条打勾**，缺了哪条？
2. Trader's Equation：P ≈ 40%, R ≥ 2:1, 完整公式 P×R > (1-P)?（0.4×2=0.8 > 0.6 ✓）
3. **你是不是在 FOMO？** 如果是 → 不做
4. 如果失败，损失多少？能接受吗？
5. **不确定或条件不足 → 不做**

→ 纪律与原话锚点统一看 `quotes/Q3-fear.md`。
