# S3 市场状态 — 市场处于周期的哪个阶段？

> 市场永远在循环：TR → BO → Channel → TR。知道你在哪里，决定你该怎么做。

---

## 判断目标

确定当前是 **BO / Channel / TR / BC** 中的哪一个。不同状态有完全不同的交易方式。

## 四种状态

### BO（突破中）

- 连续大趋势 K 线，方向一致，Gap 不断产生
- 发生在 TR 或 Channel 被 BO 之后
- **特征**：快、猛、K 线实体大、方向一致

**你该想什么**：
- 80% 的 BO 会失败 → 默认怀疑
- 有没有 FT？10 根内没有 FT → 可能假 BO
- 强度：连续 3+ 大趋势 K 线 + gap = 强；1-2 根就停了 = 弱
- 强 BO → 等 PB 入场（不追）；弱 BO → 期望深 PB 或失败

**BO 后续判断 — EG vs MG**：
- 趋势开始（前 10 bar）的大 K 线 → MG 概率高 → MM 目标 = 起点到 gap × 2
- 趋势末期（20+ bar）的大 K 线 → EG 概率高（60%）→ 等 gap 关了才确认
- **Gap 关闭 = EG 确认** → 可以 fade；**Gap 保持 = MG** → 继续顺势
- 在 gap 关闭之前，你不知道是哪个

**BO 强弱评估**：

| 强 BO | 弱 BO |
|-------|-------|
| 连续大趋势 K 线，收盘在极端 | 明显影线，重叠，小实体 |
| 收盘在 20 bar 最低/高 | 2-4 普通反向 K 线 |
| → BO 方占优，等 PB 入场 | → 预期深 PB 或 TR leg |

- 双方势均力敌 → 等待！10 bar 内无 FT → BOM（50/50）

---

### Channel（趋势通道）

**基础识别**：
- 价格在两条大致平行的线之间运动
- 有明显的 HH+HL（bull）或 LH+LL（bear）
- EMA20 方向与通道一致

#### 紧密 vs 宽幅通道 — 唯一区别是交易方式

| | Tight Channel | Broad Channel |
|---|---|---|
| **PB 深度** | < 2x avg bar, 1-3 bar | > 50%, 可到 100% |
| **做多** | ✅ **只做多** | ✅ 做多为主 |
| **做空** | ❌ **绝不做空** | ⚠️ 可以 scalp |
| **HTF 关系** | = HTF 上的 **BO** | = HTF 上的趋势 |
| **概率** | 60%+ 续涨 | 60% 顺势但双向 |
| **结束后** | 75% 变 Broad→TR, 25% 更强 BO | 继续变宽变平→TR |

#### Tight Channel 深度

**识别清单**：
1. PBs 多数持续 1-3 bar
2. PB 幅度 < 最小 scalp 的 2-3 倍 / < avg bar 的 2 倍
3. PBs 只有前一波上涨段的 1/3 到 1/2
4. PB 与 BO point 之间有 gap
5. 用 stop entry 做空 = 多数亏损

> "Never Trade Against Trend in Tight Channel" — 即使 70% 准确做空也会亏，因为那 30% 被趋势带走很远（R:R 极差）

> 🔴 **原话锚点** → 详见 [Q3-fear.md](quotes/Q3-fear.md) + [Q4-entry.md](quotes/Q4-entry.md)
> 核心: "Buy, right now, this minute! Trust your stop" / "Whenever there is fear, there is opportunity"

**紧密通道 = HTF BO**：5m tight channel = 15m/30m 上的强势 BO → 只顺势买入

**紧密通道买入方法（7 种，选一个）**：
1. Buy close of strong bull bar / follow-through bar
2. Buy close of strong bear bar（押注 reversal fails）
3. Buy at market（无法决定时）
4. Buy PB at 33-50% of prior bull leg（限价单）
5. Buy below 1st/2nd bar of PB（限价单）
6. Buy PB to support（MA, prior high, 50% PB, BO point）
7. Buy BO of Bull Flag

**止损管理**：
- 每次强 BO 到新高 → trail stop 到其 low 下方
- 窄止损 vs 宽止损：100 次交易后利润大致相同
- "Even when scalping, more likely to make money if use swing stop"

**空头在紧密通道中的困境**：
- "Most great traders rarely short in Tight Bull Channel"
- Scale in 逆势需要 90% 概率 → 只有高手才可以

**通道结束信号（~20 bar 后开始看）**：
- Consecutive Wedge Tops, Leg1=Leg2 MM
- 最大 K 线 = Exhaustion Gap
- H2 late = possible Final Flag
- → 75% 变 Broad Channel → TR；25% 更强 BO
- "Trends almost always enter TR before reversing"

**BO 阶段 vs Channel 阶段行为差异**：

| | BO 阶段 | Channel 阶段 |
|---|---|---|
| 新低/新高 | **加仓** | **获利了结** |
| PB 深度 | 很浅 | 较深 → stairs |
| 对手方 | 不敢入场 | 偶尔可以 scalp |

- Stairs 判断法：PB rally 超过了 prior low (BO point) → Channel phase has begun
- 1st reversal usually minor（70%）→ 趋势方有时间以小亏出局

#### Broad Channel 深度

> "Broad Channel is just TR that is tilted up/down"

**识别标准**：
- 波段持续 5+ 根 K 线，大小 ≥ 3x 最小 scalp
- PB 经常 > 50%，有时 100%
- 5m 宽幅通道 = 60m 紧密通道

**Buy Zone / Sell Zone**：
- Buy Zone：前一波走势段的**底部 1/3**
- Sell Zone：前一波走势段的**顶部 1/3**

**50% PB 核心策略**：
- 50% PB → 风险 = 回报；多头趋势 → 60% 获利概率 → **正期望值**
- 用限价单/止损单在 50-70% PB 处入场

**Vacuum Dynamics（真空效应）**：
- 多头等待底部 → 上半部缺乏买家 → 卖方真空
- 强势空头突破 → 到达 Buy Zone → 多头积极入场 → 快速反转
- **看起来像崩溃实际是诱空**

**Major vs Minor HL/LH**：
- 跌破 Major HL → 不再是多头趋势 → 市场周期重大变化
- 跌破 Minor HL → 常见，只要在 Major HL 之上就仍是宽幅通道

**2nd Leg Trap**：宽幅通道 ≈ 倾斜 TR → 经常出现 2nd Leg Trap → 强 2nd leg + 无 FT → 立即减仓

**反转需 3 推**：通常需要 3 次推动才能结束通道（Wedge Top/Bottom）

---

### TR（交易区间）

**基础识别**：
- 上下边界可画出，K 线重叠多，影线长
- 大阳线后跟大阴线，EMA20 变平或来回穿越
- **你感到困惑** → 就是 TR

> "90% 的 K 线处于 TR 中" → 大多数时候面对的就是 TR

**TR 的本质**：买卖双方均衡，没有 conviction。多空都在做同一件事：低买高卖 + 快速止盈。

#### Broad TR vs Tight TR

**TTR（≤3 K 线高度）**：
- 最好不做，等 BO
- TTR 里用 stop order 风险大
- 条件检查：大多数 bar > scalp size + TR height > 3× avg bar → 不满足则不做
- TTR 可以是 Final Flag

**Broad TR**：
- BLSHS（Buy Low Sell High Scalp）
- 每个 leg 内可做小 trend trade，但在对面边界止盈

#### 识别 TR 的三个早期信号

1. **概率失灵**（最可靠）：高概率 setup 频繁失败 + 低概率 setup 频繁成功 → **觉得"这不应该发生"→ 已在 TR** → 立即切 BLSHS
2. **Leg 结构**：至少 2 leg up + 2 leg down 在同一区域 → TR 确认
3. **Fractal 信号**：Small body bar、Big tails bar、多个 local TTR

#### 80% 规则（自我强化机制）

- TR 中 80% 的 BO 失败
- 机制：交易者确信跌不远 → 底部买入 → 快速止盈 → 市场不走远 → 确信加强 → 正反馈循环

**Gap 是区分 TR leg 和 Trend leg 的金标准**：
- Trend leg 有 GAP → conviction
- TR leg 没有 GAP → lack of conviction = TR

#### BLSHS

- TR 下半部/下三分之一买入
- TR 上半部/上三分之一卖出
- 中间不做（50/50）
- 简单但需纪律：**在边缘等，不追中间**

#### 2nd Leg Trap（初学者最大的坑）

- TR 中价格做 2 leg 冲到边缘 → 触发 BO
- 初学者："趋势确认！" → 追入
- 高手："2nd Leg Trap！EG！" → fade
- **第 3 次信号不入场**：到第 3 次 = 可能是 channel 不是 TR

#### Fade BO

- BO bar 后下一根：反向 bar → fade；FT bar → 不 fade
- Scale in：surprise BO 后 scale in，80% 至少保本
- Scale in interval：至少 1 scalp 距离

#### TR 入场分阶段成长

| 阶段 | 入场方式 | 适合 |
|------|---------|------|
| 基础 | Stop order 在 reversal bar 后 | 打好基础 |
| 进阶 | 等 2nd entry → stop 入场 | 提高胜率 |
| 高手 | Limit order + scale in | 灵活刮头皮 |

#### TR = 限价单市场 (LOM)

- **趋势 = 止损单市场** → swing trade
- **TR = 限价单市场** → scalp
- K 线重叠多 + 影线大 + 频繁反转 → 不用止损单追方向
- 清晰趋势中 → swing trade → 依赖止损 → 不急于 scalp 平仓

**TR 中获利**：
- Scalp: 1-2x actual risk
- Broad TR 可 swing：Legs 持续 10-20 bar → 到对面边界止盈
- TTR 只能 scalp

**TR → Trend 转换**：
- 强 BO + FT + gap 打开 → 可能真正的 BO → 立即停止 TR 思维
- 即便如此先 50% 仓位做，因为 80% 会失败

**Open 磁力**：TR day 经常在尾盘测试当日 open 价格

---

### BC（Buy/Sell Climax — 高潮）

- 趋势末期最大、最快的移动
- 连续大趋势 K 线 + 可能有 Exhaustion Gap
- 和 BO 的区别：BO 在趋势早期，BC 在趋势末期

**你该想什么**：
- 这是 MG 还是 Exhaustion？（见 BO 节的 EG vs MG 判断）
- BC 后**不立即反做**：60% 变 TR，40% MTR
- 等 1-3 根 K 线看 FT

> Al Brooks PPT: "Most climaxes lead to 3-10 bar TR. Then, the trend can reverse or resume"
> Al Brooks PPT: "Series of consecutive Buy Climaxes usually leads to exhaustion — No more buyers"

### BC/SC 后操作指南

**保护步骤**（发现 BC/SC 后依次执行）：

| 步骤 | 操作 | 条件 |
|------|------|------|
| 1. **停止顺势新仓** | 不追方向，不下新单 | 立即 |
| 2. **有持仓 → 移紧 SL** | SL 移到 climax K 线的中点或保本位 | 持仓浮盈 > 0 |
| 3. **等 TBTL** | 10 根 + 2 legs 反向 → 确认趋势结束 | 2-3 根内观察 |
| 4. **判断 MG vs EG** | Gap 保持+3根恢复=MG(假Climax) / Gap 关闭=EG(真Climax) | Gap 关闭前不做 |

**MG 确认后**（假 Climax）：
- 恢复顺势操作 → 更新缓存 `bc_sc_guard.active: false, gap_status: "MG"`
- 可在恢复后的 PB 入场（H1/H2）

**EG 确认后**（真 Climax）：
- 预期变 TR（60%）或 MTR（40%）
- 可做：fade Climax（如在 channel line → 70% swing reversal）、等 TR 形成后 BLSHS
- 不可做：继续追顺势新仓
- 更新缓存 `bc_sc_guard.gap_status: "EG"`

> Al Brooks PPT: "Channel, so 75% reverse into TR or opposite trend"

### Climax 快速检测（Quick Scan 可用）

**纯数值检测（不需读 S 文件）**：

| 检测项 | 条件 | 权重 |
|--------|------|------|
| 最新 bar 是 20+ 根中最大 | range > 2x avg_bar_size | +2 |
| 连续 3+ 同向大 bar | 3+ bars body>50% range 同向 | +2 |
| 趋势已持续 20+ 根 | bars_since_last_BO ≥ 20 | +1 |
| Gap 产生（本轮新 gap） | 相邻 bar 无 overlap | +1 |
| 加速（最近 3 根斜率 > 前 10 根） | 计算斜率比 | +1 |

**总分 ≥ 4 → `climax_suspected` 事件 → Phase B 深分析（Read S3 BC 章节）**

> 目的：在 Quick Scan 阶段就能检测到可能的 Climax，不需要等到 Phase B 才发现。
> 这是第 7 类 Quick Scan 事件（补充原有 6 类）。

---

## Look for Change — 状态转换识别

> "Most days change behavior after 1-3 hours. Always be ready to change how you trade."

**强趋势的 5 个衰减信号**：
1. 连续 Buy/Sell Climax → 不可持续
2. 第 3 波 leg 变弱（实体变小、doji、overlap、tails 增多）
3. 抛物线楔形（Parabolic Wedge）→ TBTL sideways-to-反向
4. Disappointment + confusion 增多
5. TTR 形成 → Limit Order Market

**弱趋势识别**：
- 没有连续大 trend bar 以极端价收盘
- 回调 5-10 bar 且回补 gap
- 对手方在 new H/L 获利了结而不追入
→ "Probable leg in TR, not trend"

**BOM（突破模式）阈值**：
- TR 达到 **20 bar** → BOM
- **30-40 bar** 后 → reversal ≈ resumption（各约 50%）

**Open MTR 特殊**：开盘阶段不确定性高 → transition 更快 → 三部曲压缩 → 需更少 bar 数

### 状态转换精确触发器

| 从 | 到 | 触发条件 | 确认 |
|----|-----|---------|------|
| **BO** → TC | 有 FT + PB 浅 | 3-5 根回调 + 回调 < 50% | PB 后继续原方向 |
| **BO** → TR | FT 弱或无 | 10 根无新极值 | 双向 K 线交替 |
| **TC** → BC | 加速 + 大 K 线 | TC 末期最大 K 线 | Climax 恢复速度（<3 根 = 可能继续；5+ 根 = EG） |
| **TC** → BC(宽) | PB 逐渐变深 | 第一次 PB > 50% | Stairs pattern 出现 |
| **BC** → TR | PB 反复 + 无方向 | 20+ 根横盘 | 来回穿 EMA |
| **TR** → BO | 强 BO + FT | 连续 3+ 大趋势 K 线 | Gap 产生 + 未回补 |
| **Channel** → TR | 3 推完成 + 弱化 | Wedge top/bottom | 反向 BO 后横盘 |

---

## 关键概率

| 规则 | 概率 |
|------|------|
| K 线在 TR 中 | 90% |
| BO 后有 PB | 90% |
| BO 直接反转 | 仅 10% |
| Channel BO 在 5 根内失败 | 75% |
| BC 后变 TR (非直接反转) | 60% |
| TR 中 BO 失败 | 80% |
| Tight Channel 结束 → Broad/TR | 75% |
| 趋势后期大 K 线 = Exhaustion | 60% |
| Channel line BO → swing reversal | 70% |
| Micro Channel → TBTL | 70% |
| 20 bar PB → 按 TR 处理 | 必须 |
| 30-40 bar TR → 两个方向 | 50/50 |

**Gap 金标准**：Trend leg 有 gap，TR leg 无 gap

## 判完后你应该能回答

1. **当前是什么状态？** BO / Channel(Tight/Broad) / TR(Broad/Tight) / BC
2. **在状态中的位置？** 早期/中期/末期？上沿/下沿/中间？
3. **最可能的下一步？** TR→BO→Channel→TR
4. **有状态转换信号吗？** 5 个衰减信号 / BOM / gap 变化

## 判完后去哪里

**所有状态**都经过完整路径：**S3b**（关键位置）→ **S4**（策略匹配）→ **S6-bo/S6-channel/S6-reversal**（入场）

| 状态 | → S3b | → S4 | → 入场 |
|------|-------|-------|--------|
| BO + AI 方向一致 | 标注 S/R + MM 目标 | 匹配 T1/T5 | → **S6-bo**（等 FT 或 PB） |
| Tight Channel | 标注通道线 + EMA | 匹配 T2/T3/T5/T6 | → **S6-channel**（只顺势） |
| Broad Channel | 标注 Buy/Sell Zone | 匹配 T2/T3/T4/T6 | → **S6-channel**（顺势 + 逆势 Scalp） |
| TR | 标注 TR 边界 + 1/3 线 | 匹配 TR1-TR4 | → **S6-tr**（限价单） |
| BC | 标注 Climax 起止点 | 匹配 R1/R2/R3 | → **S6-reversal**（等反转）或等待 |
| Channel 末期 + 3 推 | 标注 Wedge + MM | 匹配 R3 | → **S6-reversal**（可能反转） |
| 有持仓 | — | — | → 先去 **S7** |

---

## ab_patterns 模块使用示例

**ab_patterns 模块提供压力方向和形态数据**，辅助市场状态判断，但 S3 的深度分析逻辑（为什么是这个状态、如何转换）仍然需要学习。

### 场景 1: ETH 5m 压力方向确认

```
[市场状态] ETHUSDT 5m:

  # 使用 ab_patterns 模块的压力数据
  {pat_info.pressure.direction} = "bull_pressure"
  {pat_info.pressure.bull_bars_pct} = 65%
  {pat_info.pressure.avg_close_position} = 0.6 (偏上方)
  {pat_info.pressure.consecutive_bull} = 3 根

  # 结合 K 线分析
  最近 20 根: 13 根多头 K, 7 根空头 K
  EMA 20: 价格在 EMA 上方 +2.3%
  PB 深度: 最深回调 30% (浅 PB)

  → 状态判断: Tight Channel (Bull)
  → 理由: 65% 多头 K + 浅 PB + 连续 3 根多头 K
```

**思考过程（S3 知识）**:
- ✅ bull_bars_pct = 65% → 多头控制（> 60% 门槛）
- ✅ avg_close_position = 0.6 → K 线收在上半部（强势）
- ✅ consecutive_bull = 3 → 动能持续
- 📋 结论: Tight Channel → 只做顺势 Scalp/Swing

### 场景 2: BTC 15m 状态转换检测

```
[状态转换] BTCUSDT 15m:

  缓存状态: Tight Channel (Bull)

  # 使用 ab_patterns 模块检测变化
  {pat_info.pressure.direction} = "mixed"
  {pat_info.pressure.bull_bars_pct} = 52%
  {pat_info.pressure.bear_bars_pct} = 48%
  {pat_info.pressure.avg_close_position} = 0.5 (中间)

  # 形态检测
  {pat_info.wedge_up} = True
  {pat_info.wedge_up.is_mtr} = False (标准 Wedge)
  {pat_info.wedge_up.push_count} = 3

  → 状态转换信号: Tight Channel → Broad Channel
  → 理由: 压力平衡 (52% vs 48%) + Wedge 出现
```

**思考过程（S3 知识）**:
- ⚠️ bull_bars_pct 从 65% 降到 52% → 多头力量减弱
- ⚠️ avg_close_position = 0.5 → K 线收在中间（犹豫）
- ⚠️ Wedge 出现 → 趋势衰减信号（5 个衰减信号之一）
- 📋 结论: 从 Tight Channel 转为 Broad Channel → 降级为 Scalp

### 场景 3: SOL 5m Climax 检测

```
[Climax 检测] SOLUSDT 5m:

  # 使用 ab_patterns 模块的形态数据
  {pat_info.latest_h} = "H4" (第 4 次做多入场)
  {pat_info.h4_bar_index} = 2 (2 根前)
  {pat_info.pressure.consecutive_bull} = 5 根

  # Climax 评分（S3 快速检测）
  - 连续 5+ 同向 K: ✓ (2 分)
  - H4/L4 出现: ✓ (2 分)
  - K 线变大 (> 2x avg): ✓ (1 分)
  - Gap 出现: ✗ (0 分)
  - 总分: 5 分 (≥ 4 = Climax 可能)

  → BC (Buying Climax) 可能
  → 操作: 等待 MG/EG 确认，不追进
```

**思考过程（S3 知识）**:
- ⚠️ H4 出现 → 第 4 次入场，概率降低（Al Brooks: "H4/L4 = low probability"）
- ⚠️ consecutive_bull = 5 → 过度延伸
- ⚠️ Climax 评分 5 分 → 高概率 BC
- 📋 结论: 等待 MG (Measuring Gap) 或 EG (Exhaustion Gap) 确认反转

### 场景 4: BNB 5m TR 压力平衡

```
[TR 确认] BNBUSDT 5m:

  # 使用 ab_patterns 模块的压力数据
  {pat_info.pressure.direction} = "mixed"
  {pat_info.pressure.bull_bars_pct} = 51%
  {pat_info.pressure.bear_bars_pct} = 49%
  {pat_info.pressure.avg_close_position} = 0.5

  # TR 特征
  最近 20 根: 横盘，无明显方向
  EMA 20: 价格来回穿越 EMA
  PB 深度: 多次 50% PB

  → 状态判断: TR (Trading Range)
  → 理由: 压力完全平衡 (51% vs 49%)
```

**思考过程（S3 知识）**:
- ✅ bull_bars_pct ≈ bear_bars_pct → 多空平衡（TR 核心特征）
- ✅ avg_close_position = 0.5 → K 线收在中间（犹豫）
- ✅ 多次 50% PB → TR 特征（Al Brooks: "TR = 50% PB"）
- 📋 结论: TR → 只在边缘 1/3 做 BLSHS

---

## 两层架构总结

| 层次 | 负责内容 | 工具 |
|------|---------|------|
| **计算层** | 压力方向、形态检测（数值） | ab_patterns 模块 |
| **决策层** | 状态判断、转换逻辑 | S3 文件（本文件） |

**agent 工作流程**:
1. 调用 `analyze_ab_patterns()` → 获取压力数据 + 形态
2. Read S3-market-state.md → 学习"为什么是这个状态"
3. 结合数值 + 知识 → 做出决策（状态判断、转换检测）

**S3 不可替代的部分**:
- ✅ 5 个状态的定义（BO/TC/BC/TR/Climax）
- ✅ 状态转换逻辑（为什么从 TC 变 BC）
- ✅ 5 个衰减信号（为什么趋势结束）
- ✅ 80% BO 失败定律（为什么不追 BO）
- ✅ TR 1/3 规则（为什么中间不做）

