# S2 方向判断 — 如果被迫现在入场，你站哪边？

> Always-In Direction 是 Al Brooks 体系的核心。方向判断错了，后面全错。

---

## 方向判断的目标

一个清晰的回答：**如果此刻必须在市场中持仓，我做多还是做空？**

如果答不出来 → 说明当前是 TR → 不要强判方向。

## 怎么判断

### 主力判断：5m 图

看最近 10-20 根 K 线的**整体印象**（不是机械匹配条件）：

**偏向 AIL（做多）的证据**：
- 在形成 Higher High + Higher Low
- 多数 K 线收在上半部
- 阳线实体 > 阴线实体
- EMA20 向上且价格在 EMA 上方
- 回调浅、短、弱（阴线小、有下影线）

**偏向 AIS（做空）的证据**：
- 在形成 Lower High + Lower Low
- 多数 K 线收在下半部
- 阴线实体 > 阳线实体
- EMA20 向下且价格在 EMA 下方
- 反弹浅、短、弱（阳线小、有上影线）

**不确定 = TR**：
- K 线重叠多，上下影线都长
- 大阳线后紧跟大阴线（来回拉锯）
- 价格围绕 EMA 交叉
- 你犹豫了 → 那就是 TR

### 主导特征优先级 — 判断冲突时怎么选

当多个信号矛盾时，按**优先级排序**：

```
主导特征（Dominant Feature）> K 线序列（HH/HL/LH/LL） > EMA 位置
```

- **主导特征**：最近的一个 strong move 或 pattern（例如强 BO + FT → 即使 EMA 还是反向也信 BO）
- **K 线序列**：HH+HL 序列优先于 EMA 位置（EMA 是滞后指标）
- **EMA 位置**：最后才看（有时价格已变方向但 EMA 还没跟上）

**15m 否决权**：5m 方向和 15m 矛盾时 → **15m 优先**。5m 的 trend 可能只是 15m 的一个 PB leg。

**控场丧失量化**：
- 趋势方连续 3+ 根反向 K 线 + 回调超过 50% → **控场丧失**，方向要重新评估
- 但单独 1-2 根反向 K 线 ≠ 控场丧失（正常 PB）

> Al Brooks: "当你不确定市场当前是趋势还是交易区间时，那它就是交易区间。"
> Al Brooks: "如果你一直在等待回调但它却一直未出现，那它就处在趋势当中。"

> 🔴 **原话锚点** → 详见 [Q2-direction.md](quotes/Q2-direction.md)
> 核心: 方向确定后找入场理由，不找否决理由。"MUST BUY / MUST SELL"。

### 多周期确认：15m + 1h + Daily

5m 判完后，看大周期：
- **15m/1h 同向** → 确信度高，可以正常仓位入场
- **15m/1h 逆向** → 确信度降低，这可能是大周期 PB 中的小周期 trend，要小心
- **15m/1h 也不确定** → 大概率是大级别 TR，5m 的趋势可能很快反转
- **Daily 偏置**（S0）与 5m 方向一致 → 概率上调；矛盾 → 概率下调，倾向 Scalp

> Al Brooks: "Context > 形态 > 信号K线"。大级别方向 > 小级别形态。
> Al Brooks: "Channels: Can Be Opposite on Different Time Frames" — 大周期方向≠禁止，是概率背景。

### 多周期概率调整矩阵

大周期是**context（背景）**，不是**constraint（限制）**。Al Brooks 从不因大周期方向而禁止小周期交易。

| 大周期关系 | P 调整 | 仓位/风格 | 示例 |
|-----------|--------|----------|------|
| **顺势（交易+大周期同向）** | +5~10% | 正常仓位，Swing 优先 | 5m AIL + 1h AIL |
| **逆势（交易+大周期反向）** | -5~10% | 更宽 SL + 更小仓位，倾向 Scalp | 5m AIL + 1h AIS → 仍可做多 |
| **大周期 TR** | 不调整 | 看交易周期自身方向 | 1h TR → 5m 自由操作 |
| **"顺双势"（全同向）** | 最高概率 | Swing + 正常仓位 | 5m+15m+1h 全 AIL |

> PPT 进阶篇: "Usually only slight reduction in probability, and big reduction in risk" — 用小周期入场+大周期方向不矛盾时概率变化不大
> PPT 进阶篇: "Bull BO on higher time frame → More likely at least 2 legs up" — 大周期 BO 确认 = 小周期概率显著提升

**实战示例**：
- **5m 牛趋势 + Daily 熊通道 → 仍可做多 5m**：但知道 Daily 阻力位在哪 → TP 设在 Daily 阻力前，SL 用更宽结构位
- Tight Channel on 交易周期 = BO on 大周期 → 顺交易周期方向操作（大周期确认只增加信心）

### [MULTI-TF] 瀑布式多周期分析（Phase B 深分析时使用）

不只用大周期"确认"小周期。每个周期独立产生信号，然后汇总。

**分析流程**：

```
1h:  AI方向={} | 状态={} | 有setup? {Y/N: 具体}
30m: AI方向={} | 状态={} | 有setup? {Y/N: 具体}
15m: AI方向={} | 状态={} | 有setup? {Y/N: 具体}
 5m: AI方向={} | 状态={} | 有setup? {Y/N: 具体}
汇总: {N}个周期同向 | 最佳信号={周期}:{setup} | P调整={+X%/-X%}
```

**规则**：
- 每个周期的 H2/EMA-PB/Wedge 都是**独立入场信号**，不只是"确认"
- 5m 没信号 → **必须检查 15m/30m/1h** → 低周期无机会 ≠ 无机会
- 多个周期同时出现信号 → P 上调 → 优先执行
- 5m trend + 1h TR → 5m 趋势可能是 1h 的一个 leg → TP 设在 1h 边界前

> Al Brooks: "5 Minute TR: Think about Higher Time Frame"
> Al Brooks: "Price action is same for all markets, and all time frames"

---

## 缺口 (Gap) — 方向判断的重要证据

### Gap 基础分类
**按位置分**：
1. **BO Gap**：PB 与之前 BO 点之间的距离 → Gap 存在 = trend 强
2. **Within-trend Gap**：bar by bar 看 gap 产生/消失 → 持续产生 = 强；被填补 = 弱

**按阶段分（Traditional Gap）**：
1. **Break Away Gap**：trend 早期 → 强势启动
2. **Measuring Gap**：trend 中期 → 可做 MM（起点到 gap 中点 × 2）；区分：tight + 少 PB
3. **Exhaustion Gap**：trend 末期 → **60% 被填补**；填补目标：1)climax起点 2)trend起点

### Trend Bar ↔ Gap 等价性
- Trend bar 可以看作 BO、Gap、Climax；大 trend bar = gap → 可做 MM

### MAG — Moving Average Gap
- 前提：20+ bar 在 EMA20 一侧 → 突然穿越到另一侧
- 60% 出现 MTR attempt（最后一腿）；MTR attempt 中 60% PB/TR，40% MTR 成功
- **双20买点**：20+ bar 在 EMA 上后首次碰 EMA → 高概率反弹 scalp 机会

### Gap 开/闭变化 = 动能方向指标
- bull gap 关 + bear gap 开 → bear 占优
- Micro Gap：一个 trend bar 前后两个 bar 没有 overlap → 增加 FT 概率

### Stairs Pattern
- Trend 后期 gap 被快速关闭 → broad channel → 趋势弱化 → 快变 TR 或 reversal

**用法**：
- gap 开/闭变化判断动能方向；measuring gap 设 TP
- exhaustion gap → 准备止盈；MAG → 可能最后一腿；stairs → 移 SL 到保本

## 方向可以改变

AI 方向不是一成不变的。新的信息可以改变方向。
- 关键是：**方向改变需要足够的证据**，一根 K 线不够
- MTR 需要：趋势线被 BO + 回测失败 + 更高低位（多）/更低高位（空）

### Endless Pullback — PB 的生命周期（9A + 9C）
| 阶段 | K线数 | 状态 | 操作 |
|------|-------|------|------|
| 正常 PB | 1-10 | 趋势中回调 | 顺势入场（H1/L1, H2/L2） |
| 深度 PB | 10-20 | 趋势减弱 | 谨慎，等 premise 确认 |
| Endless PB | 20+ | TR（50/50） | 切换 TR 思维，等 BO |
| 新趋势 | 20+ + BO+FT | 可能反转 | 跟随新方向 |

- **Bull Flag 有 40% 概率被空头 BO**（9C）→ 旗形并非100%顺势解决

### 50% PB = 关键决策位（9A）
- 50% PB → Risk = Reward → 只要 P > 50% 就值得做
- 趋势中 P 通常 > 50% → **50% PB 是机构最爱的入场位**

### DT = L2，DB = H2（9B）
- 所有双顶（DT）都是 L2 做空架构
- 所有双底（DB）都是 H2 做多架构
- 所有楔形顶都是 L3，所有楔形底都是 H3
- 形态名称和 bar counting 是同一件事的两种描述

### 5m TR = 高级别 Setup（9C）
- 5m TR = 60m H2 buy setup 或 60m L2 sell setup
- 5m 无信号时不要沮丧，**检查更高周期是否有清晰的 setup**

### BO 中所有 minor S/R 失效（7A）
- 在强突破中，所有次要阻力位都将失效
- **止损放在 bull leg 底部下方**，而非最近 swing low（很多初学者止损放太近）

## 关键概率

- 趋势中 **80% 的反转会失败** → 别急着判方向改变
- TR 中 **80% 的 BO 会失败** → 别急着判新趋势开始
- 最好的 setup 也只有 **60% 胜率** → 永远不要"确信"
- 不确定 = TR → 按 TR 规则交易（BLSHS）

## 判完后你应该能回答

1. **5m AI 方向是什么？** AIL / AIS / 不确定（列出你看到的证据）
2. **15m/1h 确认还是矛盾？** 同向 / 逆向 / 也不确定
3. **Daily 偏置**和 5m 方向一致吗？（S0 回答过了）
4. **确信度如何？** 高（多 TF 一致）/ 中（5m 清晰但大 TF 模糊）/ 低（不确定）

## 判完后去哪里

- AI 方向清晰 + 确信度高 → **S3-market-state.md**（判断是 BO 还是 Channel 还是 PB）
- AI 方向不确定 → **S3-market-state.md**（大概率进入 TR 分析）
- 有持仓且 AI 方向与持仓方向矛盾 → **S7-management.md**（优先处理持仓）
