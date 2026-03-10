# Al Brooks 回调与计数系统深度解析

> 本文基于Al Brooks价格行为学09A、09B、09C三章深度整理
> 目标：彻底掌握H1/H2/H3/H4回调计数系统及其应用

---

## 一、核心概念：什么是Leg（腿）？

### 1.1 Leg的定义

**Leg是趋势中的一个推动段**，代表价格向趋势方向的持续运动。在回调(Pullback)中，leg则是回调中的小波段。

**识别Leg结束的信号：**

| 趋势方向 | Leg结束信号 |
|---------|------------|
| **Bull Trend中的PB** | 一个bar的high比前一个bar的high更高 |
| **Bear Trend中的PB** | 一个bar的low比前一个bar的low更低 |

> 本质：当回调中出现**趋势恢复信号**（更高的high或更低的low），当前leg即告结束。

### 1.2 为什么数腿如此重要？

- **H1（第一腿）**：通常趋势会继续，**不建议入场**
- **H2/H3（第二/三腿）**：最佳入场时机，概率与风险收益比平衡
- **H4+（第四腿及以上）**：警惕，可能不是简单回调，而是趋势反转或进入交易区间(TR)

**核心规则**：
> "一般PB的第一个LEG还会继续趋势，所以一般等待第二个或者第三个LEG再entry。但是如果持续4个以上的PB的话，有可能就不是PB那么简单，有可能是reversal。"

---

## 二、H1/H2/H3/H4 系统详解

### 2.1 High/Low系统定义

| 标识 | 定义 | 入场条件 | 适用场景 |
|-----|------|---------|---------|
| **H1** | Bull Trend PB中的第一腿 | 通常不交易 | 观察阶段 |
| **H2** | Bull Trend PB中的第二腿 | High信号bar上方1 tick挂stop buy | 最佳顺势入场点 |
| **H3** | Bull Trend PB中的第三腿 | High信号bar上方1 tick挂stop buy | Wedge形态/最后机会 |
| **H4+** | Bull Trend PB中的第四腿及以上 | 警惕！可能反转 | 考虑做空或观望 |
| **L1** | Bear Trend PB中的第一腿 | 通常不交易 | 观察阶段 |
| **L2** | Bear Trend PB中的第二腿 | Low信号bar下方1 tick挂stop sell | 最佳顺势入场点 |
| **L3** | Bear Trend PB中的第三腿 | Low信号bar下方1 tick挂stop sell | Wedge形态/最后机会 |
| **L4+** | Bear Trend PB中的第四腿及以上 | 警惕！可能反转 | 考虑做多或观望 |

### 2.2 Double Top/Bottom与H/L系统的对应

```
Double Top = Low 2 (L2)
Double Bottom = High 2 (H2)
Wedge Top = Low 3 (L3)
Wedge Bottom = High 3 (H3)
```

**关键洞察**：每一个Double Bottom都是High 2！

### 2.3 具体入场规则

**做多入场（Bull Trend PB）：**
1. 识别当前处于Bull Trend
2. 等待回调并数leg
3. 在H2或H3信号bar的高点上方的1 tick处挂stop buy单
4. 止损放在Major HL（主要低点）下方

**做空入场（Bear Trend PB）：**
1. 识别当前处于Bear Trend
2. 等待回调并数leg
3. 在L2或L3信号bar的低点下方的1 tick处挂stop sell单
4. 止损放在Major LH（主要高点）上方

---

## 三、数腿重置规则

### 3.1 何时重置计数？

**每次Breakout(BO)后都要重新数腿！**

> "因为数腿只在一个PB内，所以BO后产生不同的PB要重新数。"

**具体场景：**

1. **PB后创新高/新低**：新的突破意味着新的回调开始，重置H1/L1
2. **进入新的Trading Range**：趋势性质改变，重置计数
3. **时间frame切换**：不同时间维度需要独立计数

### 3.2 实例说明

```
场景：Bull Trend
第一组PB：H1 → H2 → H3 → BO创新高
         ↓ 重置计数
第二组PB：H1 → H2 → ...

关键：如果你在第二个PB的H1入场，止损必须放在第一个PB的H1底部（Major HL）！
```

---

## 四、50%回调的战术意义

### 4.1 为什么是50%？

**Risk/Reward平衡点**：
- 在50%回调点，多空双方的risk/reward比下降到1:1
- 对于顺势交易者，概率优势使这个点位成为合理的入场时机

**心理博弈**：
> "在bull眼里，这是个反弹，自己的阵地(stop loss是50）而目标地是100，抓住了risk/reward 1:1心理。"

### 4.2 50%回调的动态挂单策略

**双方挂单逻辑：**

| 交易者类型 | 进攻性挂单 | 防御性挂单 |
|-----------|-----------|-----------|
| **Bulls** | 在Bear 50% PB点挂Buy Limit | 在Rally 50%中点动态挂Buy Limit |
| **Bears** | 在Bull 50% PB点挂Sell Limit | 在Selloff 50%中点动态挂Sell Limit |

**动态更新机制：**
1. 初始50% PB挂单基于：Stop Loss位置 ↔ 最远触及价格
2. 当价格突破新的阵地后，更新Stop Loss
3. 基于新的Stop Loss和新的最远点，重新计算50% PB挂单

### 4.3 战术应用

```
Bear从100打到50，回撤到75(50% PB)
→ Bear会在此处Sell（risk到100，reward到50，1:1）
→ Bull会在此处Buy（risk到50，reward到100，1:1）
→ 双方交战！但顺势方（Bear）概率占优
```

---

## 五、Major HL vs Minor HL 的区别

### 5.1 定义对比

| 类型 | Major HL（主要低点） | Minor HL（次要低点） |
|-----|---------------------|---------------------|
| **特征** | 后续有强势突破创新高 | 后续没有强势创新高，只是TR的一部分 |
| **支撑强度** | 强支撑，突破意味着趋势可能改变 | 弱支撑，被突破是常见现象 |
| **心理意义** | 市场共识的关键阵地 | 只是暂时的歇脚点 |
| **交易意义** | 止损放置点，突破需警惕 | 不应作为关键止损点 |

### 5.2 识别方法

**Major HL识别：**
- 后续出现强劲的bull breakout
- 突破幅度大、跟随质量好
- 市场情绪确认趋势延续

**Minor HL识别：**
- 后续走势疲弱，没有明确方向
- 价格在区间波动，形成TR
- 很快就被后续走势突破

### 5.3 实战应用

> "在bear trend中，每一个LH都是resistance，但是有一些LH是次要的（后续没有强势突破新低的高点，是次要高点），他们只是TR的一部分，因此市场会反弹到次要高点的上方，然后继续下跌，这是很常见的。"

**关键心态**：突破minor位置不需要panic！

---

## 六、移动止损策略

### 6.1 核心原则

**止损不是取决于你在哪里买，而是取决于price action！**

### 6.2 移动止损的具体规则

**Bull Trend中的移动止损：**

1. **初始入场**：止损放在Major HL下方
2. **第一个PB后**：如果买入第一个PB的H2，止损放在该H1底部
3. **创新高后**：止损上移至最近的HL
4. **每个新PB**：更新止损到前一个PB的关键HL

**具体示例：**
```
Bull Trend → PB1(H1, H2, H3) → BO创新高 → PB2(H1, H2)
     ↓                              ↓
  初始止损                    止损上移至
  在Trend起点                PB1的H1底部
                                    ↓
                              买入PB2的H2
```

### 6.3 为什么需要宽止损？

> "这里老爷爷说要设置wide stop loss，因为你跟随trend，概率高，但是风险也变大了。"

**风险控制逻辑：**
- Strong trend中，窄止损容易被噪音触发
- 宽止损让你留在趋势中，享受高概率收益
- 通过仓位管理控制总体风险

### 6.4 移动止损的执行时机

**更新Stop Loss的信号：**
1. 价格突破新高/新低后企稳
2. 完成50% PB并确认趋势继续
3. 形成新的Double Bottom/Top结构

---

## 七、复合型反转：H4/L4系统

### 7.1 Consecutive Reversals定义

当第一个底部/顶部反转尝试失败后，形成新的底部/顶部，构成**复合型反转**。

**复合型底部构成：**
- 第一个bottom：H1, H2, H3组成
- 第二个bottom：H4, H5组成（或H4, H5, H6如果是wedge）

**入场信号：**
- 如果第二个底部是2个H组成 → 买入最后一个H（H5）
- 如果第二个底部是3个H组成的wedge → 买入最后一个H（H6）

### 7.2 复合型反转的类型

| 类型 | 构成 | 意义 |
|-----|------|------|
| H3 + H2 复合型底部 | 第一个底3腿，第二个底2腿 | 强反转信号 |
| H2 + H2 复合型底部 | 两个底各2腿 | 标准双底 |
| L3 + L2 复合型顶部 | 第一个顶3腿，第二个顶2腿 | 强反转信号 |
| L2 + L2 复合型顶部 | 两个顶各2腿 | 标准双顶 |

### 7.3 重要警告

> **不要在strong trend中找复合型bottom/top！**

在强趋势中，复合型反转往往只是minor reversal，很容易失败。

---

## 八、Endless Pullback（无尽回调）

### 8.1 识别信号

以下因素会降低resume trend的概率：

| 因素 | 影响 |
|-----|------|
| **通道太窄** | Tight channel预示趋势力量在减弱 |
| **回调太长** | 20+ bar的PB很可能变成TR |
| **反转bar太少** | Few bull bar（bull trend中）显示买方力量弱 |

### 8.2 概率变化

- 一般bull flag被bear BO概率：**40%**
- 如果bear channel持续20+ bar（tight channel）：**50%**

### 8.3 应对策略

**必须等待：**
1. **BO（突破）** - 确认方向
2. **Follow Through Bar** - 确认突破有效

> "一般而言bull flag被bear BO机率是40%。但是如果bear channel持续20+ bar，尤其是一个tight chanel的话，那么这个机率就来到50%。这里需要耐心等待看BO和follow through bar这两个东西。"

---

## 九、多时间框架分析

### 9.1 不同Timeframe的视角

- **更高timeframe**：可能显示清晰的Double Top/Bottom或Wedge
- **当前timeframe**：可能只看到复杂的PB
- **更低timeframe**：可能显示严格的leg计数

### 9.2 应用原则

1. 如果当前timeframe不清晰，切换到更高timeframe观察
2. 如果leg计数模糊，查看更低timeframe的微观结构
3. 始终以大timeframe的趋势方向为主导

---

## 十、完整交易流程示例

### 10.1 Bull Trend做多流程

```
1. 确认Bull Trend（ higher highs + higher lows）
        ↓
2. 等待回调开始，准备数leg
        ↓
3. H1出现 - 观察，不入场
        ↓
4. H2出现（Double Bottom形态）- 准备入场
        ↓
5. 在H2信号bar高点上方1 tick挂stop buy
        ↓
6. 止损放在Major HL或前一个H1底部
        ↓
7. 成交后，跟随价格移动止损
        ↓
8. 突破新高后，更新止损到新的HL
        ↓
9. 如果有新的PB，重复步骤2-8
```

### 10.2 Bear Trend做空流程

```
1. 确认Bear Trend（ lower highs + lower lows）
        ↓
2. 等待回调开始，准备数leg
        ↓
3. L1出现 - 观察，不入场
        ↓
4. L2出现（Double Top形态）- 准备入场
        ↓
5. 在L2信号bar低点下方1 tick挂stop sell
        ↓
6. 止损放在Major LH或前一个L1顶部
        ↓
7. 成交后，跟随价格移动止损
        ↓
8. 突破新低后，更新止损到新的LH
        ↓
9. 如果有新的PB，重复步骤2-8
```

---

## 十一、关键总结与 checklist

### 11.1 核心记忆点

1. **数腿是为了等待最佳入场时机** - H2/H3是最佳入场点
2. **每次BO后重置计数** - 不要在新的PB中继续旧计数
3. **区分Major/Minor HL,LH** - 止损只放在Major位置
4. **50% PB是战术要地** - 双方交战点，顺势概率占优
5. **H4+警惕反转** - 超过4腿不再是简单回调
6. **移动止损跟上趋势** - 保护利润，留在趋势中

### 11.2 入场前Checklist

- [ ] 当前趋势方向明确吗？
- [ ] 这是第几腿回调？（等待H2/H3或L2/L3）
- [ ] 有清晰的信号bar吗？
- [ ] 止损位置确定了吗？（Major HL/LH）
- [ ] 如果失败，我能接受这个亏损吗？
- [ ] 这是strong trend还是TR？（Strong trend才顺势交易）

### 11.3 常见错误

| 错误 | 正确做法 |
|-----|---------|
| H1就急于入场 | 等待H2/H3 |
| 把Minor HL当止损 | 识别Major HL |
| 超过H4还认为是回调 | H4+考虑反转可能 |
| BO后不重置计数 | 每次BO重新数leg |
| 止损设置太窄 | 用wide stop，让概率发挥作用 |

---

## 十二、Countertrend Traders的退出策略

### 12.1 H2/L2作为countertrend exit

**在Bull Trend中做空的countertrend traders：**
- 应该在H2时exit（平空）
- H2是趋势恢复的信号

**在Bear Trend中做多的countertrend traders：**
- 应该在L2时exit（平多）
- L2是趋势恢复的信号

### 12.2 为什么H2/L2是关键exit点？

- H2/L2代表趋势可能恢复
- 此时risk/reward对countertrend不利
- 继续持仓可能面临trend resumption的风险

---

*本文档基于Al Brooks价格行为学系列课程整理，旨在提供系统性的回调交易指南。实际交易请结合市场环境和个人风险管理策略。*
