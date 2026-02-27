# 突破-反转-TR 综合参考手册

> 基于 Al Brooks 课程 15A-H, 22A-D, 42A-C, 47A-D, 51A-B, MTR 提炼

---

## Part 1: 突破分析

### 1.1 突破的定义与分类

**定义：** 一根或一系列趋势K线突破支撑/阻力。突破的阻力越多，后续多腿延续的可能性越大。

**核心法则 -- 80%规则：** 大多数突破失败。反转本质上也是突破，因此大多数反转也会失败。

### 1.2 突破强弱判断

| 强突破特征 | 弱突破特征 |
|---|---|
| 连续大实体K线，少影线 | K线实体小，带抵抗影线 |
| 保持 Micro Gap | Gap 被关闭 |
| Follow-Through 持续 | 缺乏后续跟进 |
| 突破多层阻力 | 仅突破单一位置 |

- **条件：** 强趋势K线 + 突破关键S/R + 保持Gap
- **入场：** 突破K线收盘后市价入场，或回撤至BO点附近止损单入场
- **止损：** 突破K线中点或起点下方
- **目标：** Measured Move（突破起点open到终点close的等距测量）
- **放弃条件：** 无Follow-Through，Gap被关闭

### 1.3 Follow-Through 规则

突破后**必须**有跟进确认。有FT的突破，最低目标是第二腿（2nd Leg）。

- Good BO + Good FT → 高概率延续为趋势
- Bad BO + Bad FT → 大概率失败，进入TR
- 强趋势总会尝试反转，但失败的反转变成Flag（旗形）

### 1.4 第二腿突破（2nd Leg）

突破是Surprise，引发多空双方一致性行为，导致2nd Leg：

- 顺势方等回调加仓，逆势方止损离场 → 双方行为共识造成2nd Leg
- 强2nd Leg可引发更多Leg（多腿趋势）
- 2nd Leg可能只是一根K线，也可能不清晰
- **2nd Leg Trap：** TR中出现两腿同向运动，第二腿更强，诱导以为是新趋势，实际仍是TR

### 1.5 Exhaustion Gap vs Measuring Gap

| Measuring Gap | Exhaustion Gap |
|---|---|
| 趋势早中期 | 趋势晚期 |
| 可做等距测量 | 实体异常大 |
| Gap保持打开 | 60%概率进入TR/反转 |

**关键线索：** Gap能否保持打开是判断EG还是MG的最重要依据。

### 1.6 突破失败处理

- 趋势早期Failed BO → 回调 → 趋势恢复
- 趋势晚期Failed BO → 趋势反转
- **判断方法：** 比较突破力量与反转力量的强弱；结合Context

**Context决定一切：**
- Bull BO in tight bear channel → Minor Reversal
- DT + Bull BO in broad bear channel → TR
- DT + Bull BO in TR → MTR

### 1.7 陷阱识别

- **Fade弱Setup：** 弱Bull Setup就做空，弱Bear Setup就做多
- **Surprise Bar：** 可能是BO/Exhaustion/Reversal/Give-up Bar
- **Big Bar = Big Risk：** 考虑在50%回撤位入场以降低风险

---

## Part 2: 反转

### 2.1 Major vs Minor Reversal

| | Minor Reversal | Major Reversal (MTR) |
|---|---|---|
| 幅度 | Two legs sideways/down | 完整趋势反转 |
| 概率 | 常见，约60% | 较少，约40% |
| 后果 | 变成Flag或进入TR | 新方向趋势形成 |

### 2.2 MTR 触发三部曲

1. **破线：** Minor Reversal突破趋势线，使下次反转成为MTR的概率升至40%
2. **回望：** 趋势恢复但未达旧高/低，至少回撤Minor Reversal的1/3（充分测试）
3. **破发：** 第二次反转伴随强突破K线

**HH vs LH MTR 选择：**
- DT/HH前的Selloff弱 → 等待Wedge Top三推 → LH MTR
- DT/HH前的Selloff强 → 需要HH作为最后冲刺 → HH MTR

**失败处理：** 60%的MTR会失败。失败后常导致2 Leg MM。三部曲重置，需重新等待破线。

### 2.3 气候性反转（Climactic Reversal）

**Major Climax：**
- **条件：** 趋势晚期出现异常大的趋势K线
- **入场：** 反转K线 + FT K线的极值外（止损单）
- **止损：** Climax的MM位置，或好Context时放在Signal Bar外
- **目标：** 第一目标Climax起点，第二目标Climax高度的MM
- **放弃条件：** 反转方的止损线被突破

**Minor Climax：** 尊重Market Cycle（Trend → TR → Trend），第一次PB几乎不可能是反向趋势。

**Micro Channel = Climax：** 70%会产生TBTL PB或反转。强趋势中避免首次入场做反转，等待2nd Entry。

### 2.4 反转确认要素

- MAG（Moving Average Gap）：通常代表趋势的Final Flag，之后MTR概率增大
- 大多数顶部是Double Top形态
- Head & Shoulders本质就是LH/HL MTR
- TTR中的DT/DB是MTR的潜在信号
- Anti-trend压力可从**时间**（10+小K线）和**价格**（几根大K线）两维度展示

---

## Part 3: TR 高级策略

### 3.1 TR 宽窄判断

- **宽TR（Broad）：** 可以BLSH（Buy Low Sell High）
- **窄TR（Tight/TTR）：** 最好不交易（止损单Risk高概率小）
- **TR早期识别：** 高概率Setup不灵了 + 低概率事件频发 + 出现在S&R之间 + 分形小TR（doji/TTR）

### 3.2 80%规则在TR中的应用

- 80%的BO会失败 → Fade BO是高期望值策略
- TR中概率多在50%附近 → 低概率事件比平时发生得更多
- TR中大多数Gap会被关闭
- TR中的Leg缺乏连续大实体K线（lack of conviction，见好就收）
- **区分TR Leg vs Trend：** Trend有Gap（来源于突破后的加仓点），TR的Leg没有

### 3.3 下1/3买 上1/3卖

- **条件：** 确认处于Broad TR
- **入场：** 价格在TR下1/3用限价单做多，上1/3用限价单做空
- **止损：** TR边界外
- **目标：** 对面边界或TR中间位置
- **放弃条件：** 强BO + FT突破TR边界并保持Gap

### 3.4 Fade BO 策略

- **条件：** 确认TR环境 + BO缺乏conviction（无连续大实体K线）
- **入场：** BO失败后的反转K线（2nd Entry更佳）
- **止损：** BO极值外
- **目标：** TR对面边界
- **放弃条件：** BO形成Measuring Gap，Always-In方向确立

### 3.5 限价单 vs 止损单入场

| | 限价单 | 止损单 |
|---|---|---|
| 适用环境 | TR、Channel | Strong BO、Trend |
| 优势 | 更好的入场价 | 确认方向后入场 |
| 劣势 | 可能不成交 | 入场价较差 |
| Scale-in间距 | 至少1-3倍minimal scalp | N/A |

**TR Day特性：** Open是磁力位，尤其当Open处于中间1/3时，磁力更强。

---

## Part 4: 常见错误

### 4.1 最常见的亏损原因

1. **Hopeful交易：** 明知概率低仍做，期待小概率事件发生
2. **与强BO对抗：** 10%的K线是强突破K线，不要与之作对；90%是Channel/TR
3. **追晚期趋势：** 在趋势最后一根K线入场 → 形成DT/DB被套
4. **忽视概率只看风险：** 止损放的位置不对（"臭止损"）

### 4.2 仓位管理错误

| 错误类型 | 描述 |
|---|---|
| Swing单用Scalp止损 | Risk太小，趋势发展不起来就被扫掉 |
| Scalp单用Swing止损 | 亏损时错误放大止损，小亏变大亏 |
| 逆势加仓 | 在趋势中越亏越加，灾难性错误 |
| Scale-in间距太密 | 至少需要1倍scalp距离才有意义 |

### 4.3 心理陷阱

- **Bad Trade一直拿：** 见势不好还不走，不设止损
- **Good Trade拿不住：** 好交易过早平仓
- **Quick to React缺失：** 高手在BO无FT时立刻离场，不心存侥幸
- **90%的情况下，好的管理可以挽救坏的交易：** Wide Stop + Scale-in / 快速反应止损
- **初学者不要Scale-in：** 先掌握基础止损管理

> **核心原则：** 交易者方程式 = 概率 x 盈亏比。初学者应避免Scalp（容错低概率低），避免逆势交易，专注于高概率顺势Swing。
