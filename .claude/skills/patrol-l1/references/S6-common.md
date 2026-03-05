# S6-common 通用入场规则 — 所有市场状态共享

> 信号K线评估、订单类型、关键概率 — 不论你在 BO、Channel 还是 TR 中

---

## 订单类型

### 四种类型

| 类型 | 用途 | 适用 |
|------|------|------|
| **止损单 (Stop)** | 入场/止损 | 趋势中 |
| **限价单 (Limit)** | 入场/止盈 | TR 中 |
| **篮子单 (Bracket/OCO)** | 止盈+止损 | 入场后 |
| **市价单 (Market)** | 紧急入/出场 | 不确定时 |

### 止损单 vs 限价单 = 同一交易的对立面

- **止损单** = 押注 BO 成功 → 适用**趋势**
- **限价单** = 押注 BO 失败 → 适用 **TR**
- **90% 的时间，两者都有同样有效的 Trader's Equation**
- **TR 中禁用止损入场** — TR = 限价订单市场 (LOM)

### PA 决定订单类型

| PA 特征 | 订单选择 |
|---------|----------|
| 连续趋势K线、不重叠、大波段 | 止损单或任何类型 |
| 重叠K线、多反转、突出影线 | **限价单** |
| 强势 BO + 良好 FT | 任何类型 |
| 不确定时 | 等第 2-3 个信号 / 不交易 |

---

## 信号 K 线质量评估

**好的信号 K 线**：
- 实体在正确方向（多→阳线，空→阴线）
- 收盘在 K 线的正确端
- 大小合适（不太小=没说服力，不太大=止损太远）
- 上下文支持（处于 PB 的合理位置）

**差的信号 K 线（考虑跳过）**：
- Doji 或反向收盘
- 太大（止损远，盈亏比差）
- 孤立出现（没有 setup 支撑）

> "setups 永远看起来不够好，这就是为什么大多数人错过了它们"

---

## 关键概率

| 规则 | 概率 |
|------|------|
| 高概率 setup（H2/Wedge PB） | **60%** 胜率 |
| BO 后有 PB | **90%** |
| 通道 BO 在 5 根内失败 | **75%** |
| 惊喜 K 线后有 MM | **70%** |
| 永远不超过确定 | **60%** |
| 开盘 failed BO + 反转 | **50%** |

---

## Quick Scan 事件检测表

Quick Scan 对每个品种 × 每个周期独立检测以下事件：

| # | 事件 | 检测规则（纯数值） | 操作 |
|---|------|------------------|------|
| 1 | `anomaly` | 最新 bar body > 2x `avg_bar_size` | Phase B 深分析 |
| 2 | `level_break` | close 穿越任一 `key_levels[].price` | Phase B 深分析 |
| 3 | `tr_edge` | state=TR + close 在 TR 上/下 1/3 | Scalp 快速通道 |
| 4 | `momentum` | 3+ 连续同向趋势 K 线（body>50%range, 同向） | Phase B 深分析 |
| 5 | `ema_touch` | abs(close - ema20) / close < 0.003 | 更新 pre_signal |
| 6 | `signal_trigger` | `pre_signal.condition` 被满足 | Phase B 深分析 (P0) |
| 7 | `climax_suspected` | S3 Climax 快速检测评分 ≥ 4 | Phase B 深分析 |
| 8 | **`h2_l2_trigger`** | **PB 完成 + 信号 bar 出现**（见下方定义） | **Scalp 快速通道 或 Phase B** |
| 9 | **`pb_complete`** | **趋势方向 K 线在 PB 后出现**（body>50%, 方向正确） | **更新 pre_signal** |

### H2/L2 触发检测（机械规则，每个周期独立）

- **H2 LONG**: 最近出现 2+ 根 bear bars（PB），然后当前 bar 是 bull bar 且 close > 前一根 high → **H2 触发**
- **L2 SHORT**: 最近出现 2+ 根 bull bars（PB），然后当前 bar 是 bear bar 且 close < 前一根 low → **L2 触发**
- **H1 LONG**: 强 BO/Spike 后第 1 根 bear bar 后出现 bull bar close > prior high → **H1 触发**（仅 BO/TC 状态）
- **PB 完成**: 趋势方向出现 body>50% 的 K 线 + 不再创新极值 → **pre_signal 升级**

**⚠️ H2/L2 触发 ≠ 自动入场**。触发后进入 Scalp 快速通道（Context 清晰时）或 Phase B（需要深分析时）。

**⚠️ Al Brooks 特殊形态**：标准 TA 的 Wedge/三推要求每推更低/高，Al Brooks 的三推只要求**逐推弱化**（第三推可以不破新低/高 = 头肩底/顶 = MTR）。

---

## 入场前你必须确认

1. **AI 方向**已确认（S2 回答过了）
2. **市场状态**已确认（S3 回答过了）
3. **关键位置**已标注（S3b 回答过了）
4. **入场模式**匹配当前状态
5. **信号 K 线质量**至少中等
6. 以上任何一条不满足 → **不做，等下一个**

## 找到信号后

→ **S5-evaluation.md**（Trader's Equation 评估）

## 没找到信号

→ 这是正常的。大多数扫描不会产生交易。
→ **"宁可错过也不强做"**

---

> 原话锚点 → 详见 [Q4-entry.md](quotes/Q4-entry.md) + [Q5-te.md](quotes/Q5-te.md)

---

> **导航**: [S6-bo.md](S6-bo.md) (BO 入场) | [S6-channel.md](S6-channel.md) (通道入场) | [S6-tr.md](S6-tr.md) (TR 入场) | [S6-reversal.md](S6-reversal.md) (反转入场)
