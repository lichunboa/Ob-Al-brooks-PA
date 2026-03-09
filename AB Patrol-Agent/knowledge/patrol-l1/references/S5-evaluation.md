# S5 交易评估 — 这笔交易值得做吗？

> 每一笔交易都必须过这一关。不过 → 不做。没有例外。
> Al Brooks: "它的本质就是一个问题：我能不能在这次交易中赚到钱？"

---

## Trader's Equation

```
P(成功概率) × R(盈利) > (1-P)(失败概率) × Risk(亏损)
```

**统一公式**：P × R > (1-P) — 期望值为正才值得做。没有 "1.2" 绝对门槛。

**快速验证表**（完整公式 = P×R vs (1-P)）：

| 风格 | P 门槛 | R 门槛 | 验证示例 |
|------|--------|--------|---------|
| **Swing** (强势顺势) | ≥ 50% | ≥ 1.5:1 | P=55% R=2 → 1.1 > 0.45 ✓ |
| **Swing** (弱势/MTR) | ≥ 40% | ≥ 2:1 | P=40% R=2 → 0.8 > 0.6 ✓ |
| **Scalp** | ≥ 50% | ≥ 1:1 | P=55% R=1 → 0.55 > 0.45 ✓ |
| **反转试探** | ≈ 40% | ≥ 2:1 | P=40% R=2 → 0.8 > 0.6 ✓ |

**关键**：概率不同，门槛不同 — P=60% 时 R≥0.67 即可；P=40% 时 R≥1.5 才行。

**⚠️ 重要案例**（2026-03-09 优化修复）：
- P=45% R=1.5 → 0.675 > 0.55 ✓ **这是正 TE，应该执行！**
- 之前可能被错误拒绝，现已修正

### Edge 的本质

- **Edge 是短暂且微小的** — HFT 公司的算法仅维持几天到几周就更换
- **完美交易不存在** — 高概率 + 高回报 + 低风险 = 不可能同时存在。**总有不尽如人意之处。**
- 没有机构会站在"完美交易"的另一侧
- **"Both the bulls and bears can lose more than 50% of time and still make money"**

---

## 怎么估算 P（成功概率）

P 不是精确数字，是基于 context 的**粗略估计**。大多数交易在 40%-60% 之间。

### P 的锚点

| 场景 | P 的大致范围 |
|------|-------------|
| 强趋势中的 H2/L2 PB | ~60% |
| 强 BO 后的第一次 PB | ~55-60% |
| EMA PB in strong trend | ~60% |
| TR 边缘的反转（DB/DT） | ~60% |
| Channel 中的 Wedge PB | ~55% |
| MTR（强信号 + 多 TF 确认） | ~45-50% |
| MTR（一般信号） | ~40% |
| 趋势中逆向交易 | ~20-30% ❌ 不做 |
| TR 中间区域 | ~50% ❌ 盈亏比太差 |

### P 的调整因素

- 多 TF 同向 → P + 5-10%
- 多 TF 矛盾 → P - 10-15%
- 信号 K 线质量差 → P - 5-10%
- 连续亏损 → **不调 P**（情绪不影响概率）

### 40-60 Rule — 不确定性的海洋

- **90% 的 K 线在 Channel 或 TR 中** → 只有 10% 是 Strong BO
- 概率通常在 40-60%（大多是 40-50%）→ 无需精确知道
- **"Simply always go for reward at least 2x risk → compensates for low probability → positive TE"**
- **不是强 BO → 假设 channel 或 TR**

### TR 中的概率分布

| TR 位置 | 先涨 X 的概率 | 先跌 X 的概率 |
|---------|-------------|-------------|
| 底部 1/3 | **60%** | 40% |
| 中间 1/3 | 50% | 50% |
| 顶部 1/3 | 40% | **60%** |

### 50% PB 定理 — 最实用的量化规则

- 强趋势中 50% PB 入场: **至少 60% 概率**测试前高/前低
- Risk ≈ Reward（入场在目标和止损的中点），但概率 > 50% → 正 TE
- **→ 强趋势中，50% PB 是最可靠的限价入场位**

---

## 怎么估算 R（盈亏比）

```
R = TP 距离 / SL 距离
```

### SL（止损）怎么定

- 趋势中：信号 K 线的对侧极值 + buffer
- BO 后：BO leg 的起点下方
- 反转：反转信号前的极值下方
- **不能为了好看的 R 而把 SL 设太近** → 会被止损扫掉

### TP（目标）怎么定

- Measured Move（等距移动）：前一波的幅度
- 前方 S/R 位（支撑/阻力）
- TR 的对侧边界（TR 中交易时）
- **不能为了好看的 R 而把 TP 设太远** → 可能到不了

### Measured Move（MM）— TP 计算核心

**三种测量基准**：
1. 前一波走势段的高度（Leg height）
2. 交易区间的高度（TR height）
3. 前一次突破的高度（BO height）

**趋势强度决定 MM 的意义**：

| 趋势强度 | PB 深度 | MM 含义 | 之后 |
|---------|--------|--------|------|
| **强趋势 (BO)** | 浅 PB | MM 是**最小目标** | 可能继续 |
| **弱趋势/TR内** | 深 PB (~50%) | MM 是**反弹终点** | → TR |
| **Spike & Channel** | 中等 | Leg 2 是通道 | → TR |

**嵌套 MM**：多重 MM 目标重合 = 强 S/R 区域 → 获利了结点
**强 BO 中**：第一个阻力位通常挡不住 → 不在第一个 S/R 提前止盈

#### MM 计算示例（使用 ab_mm 模块）

**场景 1**: BNB BO 失败,考虑做空

```
[R 计算] BNB 5m:

  当前价: 622.16

  SL 位置:
    - {sr_info.nearest_resistance} = 625.5 (bo_origin)
    - SL = 625.5 + buffer(0.1%) = 625.6
    - SL 距离 = 625.6 - 622.16 = 3.44 (0.55%)

  TP 位置:
    - {mm_info.nearest_bear_target.price} = 618.0
    - {mm_info.nearest_bear_target.type} = tr_height
    - {mm_info.nearest_bear_target.basis} = TR 高度 8.5 点
    - TP = 618.0
    - TP 距离 = 622.16 - 618.0 = 4.16 (0.67%)

  R 计算:
    - R = TP距离 / SL距离 = 4.16 / 3.44 = 1.21:1

  评估:
    - 风格: Scalp (TR 边缘)
    - P 估计: ~55% (TR 边缘 DB)
    - 门槛: P≥50%, R≥1:1
    - P×R = 0.55 × 1.21 = 0.67 vs (1-P) = 0.45 ✓
    - 结论: 勉强达标,但 R 偏低

  决策: PASS-WAIT (等更好的 R,如价格反弹到 623.5)
```

**场景 2**: ETH H2 入场,R 充足

```
[R 计算] ETH 5m:

  当前价: 2055.15 (H2 信号)

  SL 位置:
    - {sr_info.nearest_support} = 2050.5 (swing_low)
    - SL = 2050.5 - buffer(0.1%) = 2048.0
    - SL 距离 = 2055.15 - 2048.0 = 7.15 (0.35%)

  TP 位置:
    - {mm_info.nearest_bull_target.price} = 2070.0
    - {mm_info.nearest_bull_target.type} = leg_height
    - {mm_info.nearest_bull_target.basis} = 前一波上涨 15 点
    - TP1 = 2070.0 (2R)
    - TP2 = 2076.5 (3R,嵌套 MM)
    - TP 距离 = 2070.0 - 2055.15 = 14.85 (0.72%)

  R 计算:
    - R = 14.85 / 7.15 = 2.08:1

  评估:
    - 风格: Swing (Bull Channel H2)
    - P 估计: ~60% (强趋势 H2)
    - 门槛: P≥50%, R≥1.5:1
    - P×R = 0.60 × 2.08 = 1.25 vs (1-P) = 0.40 ✓
    - 结论: 优秀 setup

  决策: 执行入场
    - 仓位: 0.3% 风险 (首仓)
    - TP1: 2070.0 (减仓 50%)
    - TP2: 2076.5 (再减 25%)
    - 余下 25% trail
```

**场景 3**: 多重 MM 目标重合

```
[R 计算] BTC 15m:

  当前价: 69500 (Wedge PB 完成)

  TP 分析:
    - {mm_info.bull_targets[0]} = 70200 (leg_height, 前波上涨 700 点)
    - {mm_info.bull_targets[1]} = 70250 (tr_height, TR 高度 750 点)
    - {mm_info.bull_targets[2]} = 70180 (bo_height, BO 幅度 680 点)
    - **嵌套 MM 区域**: 70180-70250 (3 个目标重合)

  结论: 70200 是强 S/R 区域,高概率获利了结点
  策略: TP1 设在 70150 (略低于嵌套区域,避免被挤出)
```

---

## 实际风险 vs 初始风险

| | 初始风险 (Initial Risk) | 实际风险 (Actual Risk) |
|---|---|---|
| **定义** | 入场价到初始止损的距离 | 入场价到"完美止损"的距离 |
| **何时已知** | 入场时 | **交易朝有利方向走之后** |
| **共识度** | 低（多种选择） | 高（everyone agrees） |
| **用途** | 初始仓位管理 | **机构获利了结的基础** |

- **Perfect Stop = 不会被震出的最小止损** — BO+FT 后的最深 PB
- **2x Actual Risk 止盈 → "Always results in positive TE"**（90% 时间有效）
- **获利目标本身就是 S/R** — 1x 和 2x actual risk 处的止盈经常造成 PB
- **Actual Risk 很小时**（强 BO 后 PB 很浅）→ 改用 MM / trend line / prior H/L

---

## Scalp vs Swing — 入场前必须确定

| 特性 | Scalp | Swing |
|------|-------|-------|
| 概率 | **≥50%**（理想 60%+） | **≥40%** 可接受 |
| 回报 | R = 风险 (1:1) | R ≥ **2x 风险** |
| 持仓 | 1-5 根 K 线 | **10+ 根 K 线** |
| 回调 | **不允许** | **允许**回调 |
| 止损 | 紧止损 | swing 止损（Major HL 下方） |

**→ 核心判定**：回报 ≥ 2x 风险 = swing，< 2x = scalp

## 路由一致性检查（执行前必过）

> S5 不只是算 P×R，还要检查“这笔单的风格、市场状态、订单类型”是否互相匹配。若不匹配，说明不是执行问题，而是 playbook 还没成熟。

| 环境 | 合法风格 | 合法订单类型 | 典型升级条件 |
|------|---------|-------------|-------------|
| **强 BO / Tight Channel** | Swing 优先 | `STOP_MARKET` / `MARKET` | PB 完成 + signal trigger |
| **Normal Channel** | Swing / Scalp | `STOP_MARKET` | H1/H2/L1/L2 或 first PB 完成 |
| **Broad Channel 顺势** | Scalp→Swing | `STOP_MARKET` | 恢复信号 + 接受清晰 |
| **Broad Channel 逆势** | 反转试探 / Scalp | `LIMIT` | 到边缘 + H2/L2/HL/LH MTR |
| **TR 边缘** | Scalp | `LIMIT` | 边缘 + 二次信号/清晰 signal bar |
| **TR 中部** | — | — | 不做 |
| **MTR 第一次尝试** | 反转试探 | `LIMIT` 或继续等待 | 先记录试探，不直接 swing |

### 若出现以下冲突 → 继续等待，不执行

- `TR` 环境却想用 `STOP_MARKET` 追突破
- `Broad Channel` 逆势 fade 想直接用市价/stop 追单
- 只有第一次反转线索，却把风格写成 `Swing executable`
- `Scalp` 的结构，却用 `Swing` 的止损和管理
- `candidate` 还没有明确 `entry_price / entry_zone`，却直接当 `executable`

### 初学者只应做波段 — 铁律

- **"Beginners should look for swings rather than scalps"**
- **"Beginners should NEVER scalp against even a weak trend"**
- 逆势 scalp → "Bleed to death from thousand paper cuts"（千刀万剐慢慢失血）

### 最小 Scalp 规模

- 取**较大者**：近期平均 K 线高度 / 近期日均波幅 5-10%
- **"I have never met a trader making a living only going for minimum scalps"**
- 佣金/滑点在小目标下占比巨大 → 需 80-90% 胜率才能盈利 → **不现实**

### 致命错误：混淆 Scalp 和 Swing

- **"Traders lose by mixing scalp and swing trade entries and exits"**
- 入场前确定风格 → **按计划执行到底**
- Scalp 的 SL + Swing 的时间 = 致命组合
- Swing 的 SL + Scalp 的退出 = 同样致命

### 强势 BO 中 → Swing 几乎总是更好

- **"Almost always more profitable to swing trade"**
- **"Most great setups go far, so better to swing"**
- 默认 swing，不 scalp

---

## 硬门槛

### 统一门槛（P × R > (1-P)）

| 风格 | P 门槛 | R 门槛 | TE 验证 | 不满足 → |
|------|--------|--------|---------|---------|
| **Swing (顺势)** | ≥ 50% | ≥ 1.5:1 | P×R > (1-P) | 放弃 |
| **Swing (逆势/MTR)** | ≥ 40% | ≥ 2:1 | P×R > (1-P) | 放弃 |
| **Scalp** | ≥ 50% | ≥ 1:1 | P×R > (1-P) | 放弃（Scalp 需更高 P 因为 R 低） |
| **反转试探** | ≈ 40% | ≥ 2:1 | P×R > (1-P) | 放弃 |

**公式统一**：所有风格用同一个 `P×R > (1-P)` 验证。P 和 R 门槛是最低准入，公式是最终决定。

### 手续费影响（100x 杠杆）
- 往返 ≈ 0.1% × 名义价值
- **Scalp 中手续费占比更大** — 1R 目标若 SL 只有 0.3%，费用吃掉 1/3
- 评估 R 时必须**扣除手续费后**再比较门槛

---

## 市场只能做 6 种事 — 完整决策矩阵

| 状态 | 多头版本 | 空头版本 | 交易方式 |
|------|---------|---------|---------|
| **强 BO** | Bull BO | Bear BO | 随时入场，任何理由，swing |
| **紧密通道** | Tight Bull Ch | Tight Bear Ch | 只顺势，像 BO 一样 |
| **宽幅通道** | Broad Bull Ch | Broad Bear Ch | 主要顺势 + 可逆势 scalp |
| **TR** | TR | TR | BLSHS（低买高卖 scalp） |

**90% 的 K 线可以做多也可以做空** — 只有 10% 在强 BO 中只能顺势。

---

## 默认获利计划

1. 在 **2x 初始风险**处减仓 50%
2. 在 **3x 初始风险**处再减仓 25%
3. 剩余 25% 用跟踪止损 → 在反转信号/止损触及时全平

**通道中的买卖区域**：

| 通道类型 | 买入区域 | 卖出区域 |
|---------|---------|---------|
| Bull Channel | 最近上涨段底部 **2/3** | — |
| Bear Channel | — | 最近下跌段顶部 **2/3** |
| TR | 下 **1/3** | 上 **1/3** |

---

## Z-Score 系统质量评估

| Z-Score | 含义 | 风险承受 |
|---------|------|---------|
| ~5 | 极好（罕见） | 可以激进 |
| 2-3 | 大多数优秀交易者 | 每笔 2% 风险 |
| < 2 | 不可靠 | 不应交易 |

- **坏系统特征**: 大部分利润来自单一大赢 → 低 Z-Score → 不可信
- **追求稳定的小赢，不是一两笔大赢**

---

## 评估过程（30 秒）

> → 原话锚点详见 [Q5-te.md](quotes/Q5-te.md) + [Q3-fear.md](quotes/Q3-fear.md)

1. **⚠️ 先声明风格**（由市场状态 + 路由表决定，不是由 R 倒推）：
   - 强 BO / TC / Channel 中的 H2/L2 → **Swing**
   - TR 边缘 BLSHS → **Scalp**
   - EMA PB / 不确定 → 看路由表
2. **SL 放哪里？** 技术上合理的位置（PA 结构位）
3. **TP 放哪里？** 最近的合理目标（MM > 前高/低 > EMA > 整数）
4. **R = TP/SL**？扣除手续费后
5. **P 大概多少？** 用锚点值，只因结构性变化调整（详见下方 P 值规则）
6. **P × R > (1-P)？** 用步骤 1 声明的风格对应标准验证
   - Yes → 计算仓位 → 执行
   - No → 不做，记录 `[PASS-RULE] P×R不达标`

**⚠️ 步骤 1 决定了步骤 6 用什么标准。不允许中途换标准。**

### 仓位计算（禁止手算）

- 每笔最大风险 = **1% 余额**
- 确信度一般 → 先小仓（0.3%），确认后可加仓到 1%
- 仓位计算由执行层完成；这里定义的是风险原则，不是接口细节
- 风格与评估纪律统一看 [Q3-fear.md](quotes/Q3-fear.md) + [Q5-te.md](quotes/Q5-te.md)

### PASS 分类系统（只有两类，没有第三类）

| 分类 | 含义 | 示例 | 频率预期 |
|------|------|------|---------|
| `[PASS-RULE]` | 硬规则不满足 | TR 中间、PB>2/3、TC 逆势、R<门槛 | 正常，多数 pass 应在此类 |
| `[PASS-WAIT]` | 条件接近但不足 | PB 未完成、信号 K 线未出现、pre_signal 未触发 | 正常，更新 pre_signal |

**⚠️ 不存在 PASS-JUDGMENT。TE 达标 = 必须入场。**

**反恐惧硬检查**（每次想 PASS 时）：
> P×R 达标了吗？如果达标，为什么不做？
> - "规则不满足" → `[PASS-RULE]`
> - "条件未形成" → `[PASS-WAIT]`
> - 说不出来 → **你在恐惧。立即执行。**

**连续 2 轮所有品种都 PASS 且无 RULE/WAIT 理由** → `[AUDIT] FEAR_DETECTED` → 强制执行

**P 值调整规则** — 只因结构性变化调整，不因微观瑕疵调整：

> → 原话锚点详见 [Q5-te.md](quotes/Q5-te.md)

- P 是粗略估计（40-60 Rule），不是精确数学
- Context 确定方向后，P 使用对应锚点值（如 H2 in trend = 60%）

| 可以调整 P 的情况（结构性） | 不调整 P 的情况（微观） |
|---|---|
| 大周期方向矛盾 (-5~10%) | signal bar 有影线 |
| 市场状态改变（Channel→TR） | 5m 出现 TTR |
| PB 深度异常（>2/3 腿） | "感觉不太对" |
| 多周期信号叠加 (+5~10%) | K 线实体偏小 |

**⚠️ 不要混淆 Scalp 和 Swing 标准**：
- L2 in trend = Swing setup → 用 Swing 标准评估（P≥40%, R≥1.5）
- 用 Scalp 标准（P≥50%, R≥1）否决 Swing setup = **致命错误**（S5 铁律）
- **入场前先声明风格**，然后用对应标准评估，不混用

### 入场前路由验证（5 步自检）

每次入场决策前必过，确保决策与知识体系一致：

1. 当前市场状态 = ___（从缓存或 S3 分析）
2. 路由表对应行 = ___（风格/订单类型/H1有效性）
3. 多周期关系 = ___（顺势/逆势/TR）→ S2 概率矩阵调整 P
4. 我选择的入场方式 = ___
5. 和路由表+概率调整一致吗？**不一致 → 修正，或写 S 文件引用说明偏离理由**

### "用 Risk 找 Trade" — 反向思维

- **正向思维**（初学者）：找到信号 → 算 SL → 看 R → 够不够？
- **反向思维**（专家）：先看 SL 在哪里最合理 → 算 R → 值不值得？
- **好处**：SL 位置决定了 trade 质量。好的 SL 位 = 好的 trade，不管信号多漂亮
- **"Where is the obvious stop?"** → 从 SL 出发倒推是否值得入场

---

## 评估完你应该能回答

1. P = ?%, R = ?:1, P×R = ?
2. SL 在哪里？为什么？
3. TP 在哪里？为什么？
4. **风格**：Scalp 还是 Swing？为什么？
5. 手续费大约多少？扣除后 R 还满足门槛吗？
6. 如果亏了，亏多少（$）？能接受吗？

---

## 通过评估后

→ 执行：下单 + 写信号日志（必须包含 P、R、P×R 和理由）

### 预信号 / 候选单 / 可执行单

评估输出必须明确区分 4 个阶段：

| 阶段 | 含义 | 应输出什么 |
|------|------|-----------|
| `WATCH` | 只是观察结构 | thesis + invalid_if |
| `planned_trade` | 交易计划已明确，但价格/触发未到 | `entry_price/entry_zone` + `stop_loss` + `take_profit` + `order_type` + `style` |
| `candidate` | 接近执行，等待最后接受/trigger | `planned_trade` + `why not executable yet` |
| `executable` | 已通过评估，可直接执行 | 动作 + 风格 + 交易方程 + 无效条件 |

### 计划委托（Planned Orders）

当 setup 已明确但价格尚未到位时，应优先考虑 **计划委托**，而不是等价于“没有机会”：

- `LIMIT`
  - TR 边缘、50% PB、buy/sell zone、limit order market
- `STOP_MARKET`
  - breakout acceptance、信号条高低点突破
- `MARKET`
  - 强 BO、Scalp 快速通道、必须立即跟随的 setup

计划委托必须同时给出：

- `invalid_if`
- `cancel_if`
- `degrade_to_watch_if`

## 没通过评估

→ 记录"该品种有潜在信号但 P×R 不达标"，等下次机会。
→ **不要降低标准去"凑"一笔交易**
→ 理论背景与原话统一看 [Q5-te.md](quotes/Q5-te.md)。

---

## 评估完后去哪里

→ **通过** → 执行下单（SKILL.md Step 3f）+ 之后进 [S7-management.md](S7-management.md) 管理持仓
→ **没通过** → 记录 PASS 分类，回 Quick Scan 等下一轮
