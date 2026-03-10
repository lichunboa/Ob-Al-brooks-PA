# Al Brooks 价格行为学 - 止损与交易管理

## 一、止损设置原则

### 1. 核心原则

**止损决定仓位大小**
- 先确定logical stop位置（基于price action）
- 再计算position size（基于风险承受度）
- 公式：Position Size = Risk Amount / Stop Distance

### 2. 止损类型

#### A. 基于主要高低点的止损

**多头交易止损**：
- 设在**主要HL (Higher Low)**下方
- 主要HL = 创造强突破新高的低点
- 移动止损：随新的主要HL形成而提高

**空头交易止损**：
- 设在**主要LH (Lower High)**上方
- 主要LH = 创造强突破新低的高点
- 移动止损：随新的主要LH形成而降低

#### B. 基于Signal Bar的止损

**初学者方法**：
- Buy entry：止损设在signal bar low下方
- Sell entry：止损设在signal bar high上方
- 适用于scalping

**进阶方法**：
- 考虑wider stop
- 配合scale in策略
- 基于premise而非单根bar

#### C. 基于结构形态的止损

| 形态 | 止损位置 |
|------|----------|
| Double Bottom | 第一底/第二底下方 |
| Double Top | 第一顶/第二顶上方 |
| Wedge | Wedge extreme外侧 |
| HSB | Shoulder线外侧 |
| MTR | 反转结构的高/低点外侧 |
| BO | 突破点外侧 |

---

## 二、不同情境的止损设置

### 1. 趋势交易止损

**多头趋势**：
```
Initial Stop：主要HL下方
Move Stop to：新的主要HL
Trail Stop：跟随HL上移
Exit：遇到credible top或破主要HL
```

**空头趋势**：
```
Initial Stop：主要LH上方
Move Stop to：新的主要LH  
Trail Stop：跟随LH下移
Exit：遇到credible bottom或破主要LH
```

### 2. 回调交易止损

**H2/L2 Entry**：
- 止损设在Double Top/Bottom的另一侧
- 或设在主要HL/LH外侧

**H3/L3 Entry**：
- 止损设在Wedge extreme外侧
- 考虑wedge内部的 HL/LH

### 3. MTR交易止损

**MTR Sell**：
- 初始止损：HH上方（如果是HH MTR）
- 或 LH上方（如果是LH MTR）
- 移动止损：随新的LH形成而降低

**MTR Buy**：
- 初始止损：LL下方（如果是LL MTR）
- 或 HL下方（如果是HL MTR）
- 移动止损：随新的HL形成而提高

### 4. 突破交易止损

**BO Entry**：
- 止损设在突破点外侧
- 如突破被测试，可能变成TR，考虑减仓

**2nd Leg Entry**：
- 止损设在第一leg的extreme
- 或主要HL/LH外侧

---

## 三、移动止损策略

### 1. 阶梯式移动

**方法**：
- 每形成一个新的主要HL/LH，移动止损
- 保留一定的buffer（如1-2 ticks）

**示例**（多头趋势）：
```
Entry at: 100
Initial Stop: 90 (主要HL)
New HL at: 95 → Move stop to 89
New HL at: 98 → Move stop to 94
New HL at: 102 → Move stop to 97
```

### 2. 盈亏平衡移动

**方法**：
- 达到一定profit（如1R）后，移动止损到entry
- 保护本金，让利润奔跑

**适用**：
- Swing trade
- 不确定性增加时

### 3. 分批止盈配合移动止损

**方法**：
1. 第一目标（如1R）：部分止盈+移动止损到entry
2. 第二目标（如2R）：部分止盈+移动止损到第一目标
3. 剩余仓位：跟随趋势直到反转信号

---

## 四、止盈策略

### 1. Measure Move 止盈

**计算方法**：
| 类型 | 测量方法 |
|------|----------|
| Gap MM | 趋势起点到gap中点，延伸相同距离 |
| TR Height MM | TR高度，从突破点延伸 |
| Leg MM | Leg 1 = Leg 2 |
| BO MM | 突破距离，从突破点延伸 |

**使用**：
- 当价格接近MM目标，考虑减仓
- 多个MM目标重合，高概率反转点

### 2. Risk:Reward 止盈

**常见比例**：
- Scalping：1:1 或 1:1.5
- Swing：1:2 或 1:3

**计算**：
- 止损 = 10 ticks
- 1:2 target = 20 ticks profit

### 3. 结构止盈

**信号**：
- 遇到主要阻力/支撑
- 形成Double Top/Bottom
- Wedge形态完成
- MTR信号出现
- MAG信号出现

---

## 五、交易管理规则

### 1. 入场后管理

**立即评估**：
- Entry bar是否强势？
- Follow through是否出现？
- Premise是否仍然valid？

**如果premise改变**：
- 立即exit
- 不要等待止损被触发
- 承认错误，重新评估

### 2. 加仓策略 (Scaling In)

**原则**：
- 只在premise valid时加仓
- 每次加仓独立评估
- 整体风险控制在可承受范围

**方法**：
- Scale in on pullback
- Scale in on new setup
- 使用wider stop配合scale in

### 3. 减仓策略 (Scaling Out)

**方法**：
- 达到1R：减仓25-50%
- 达到2R：减仓25-50%
- 剩余：跟随趋势

**好处**：
- 锁定部分利润
- 降低风险
- 心理更舒适

---

## 六、止损被触发后的处理

### 1. 立即评估

**问题**：
- Premise是否仍然valid？
- 是正常波动还是trend改变？
- Stop位置是否正确？

### 2. 重新入场

**如果premise valid**：
- 可以在更好的价格重新entry
- 使用更宽的stop
- 减小position size

**如果premise invalid**：
- 放弃该setup
- 等待新的机会
- 重新分析市场

### 3. 常见错误

| 错误 | 正确做法 |
|------|----------|
| 立即反向entry | 先评估premise |
| 不止损，希望回来 | 严格止损 |
| 频繁调整止损 | 基于price action调整 |
| 情绪化加仓 | 理性评估后决策 |

---

## 七、不同交易风格的管理

### 1. Scalping (剥头皮)

**止损**：
- Tight stop（2-4 ticks）
- 基于signal bar
- 快速cut loss

**止盈**：
- 1:1 或 1:1.5
- 固定target（如4-8 ticks）
- Quick take profit

### 2. Day Trading (日内交易)

**止损**：
- 中等stop（8-15 ticks）
- 基于主要HL/LH
- 允许一定波动

**止盈**：
- 1:2 或更高
- 使用MM target
- 分段止盈

### 3. Swing Trading (波段交易)

**止损**：
- Wide stop（基于swing结构）
- 基于主要trend structure
- 允许deep PB

**止盈**：
- 1:3 或更高
- 多目标位
- 主要reversal signal才exit

---

## 八、心理与纪律

### 1. 接受止损

- 止损是交易成本的一部分
- 80%的规则意味着很多止损是正常的
- 关注长期期望收益，而非单次交易

### 2. 避免情绪化

- 预设交易计划
- 机械执行
- 不在交易中改变规则

### 3. 记录与复盘

**记录**：
- Entry/Exit价格
- Stop位置
- Premise是否valid
- 实际vs应该

**复盘**：
- 止损是否合理
- 止盈是否最优
- 管理是否可以改进

---

## 九、关键管理原则

1. **Risk First**：先考虑风险，再考虑收益
2. **Premise Valid**：只要premise valid，可以re-entry
3. **Cut Loss Fast**：premise invalid，立即exit
4. **Let Profit Run**：用移动止损让利润奔跑
5. **Scale Wisely**：合理加仓减仓
6. **Be Mechanical**：机械化执行，减少情绪
7. **Review Often**：经常复盘，持续改进

---

*好的交易管理比好的entry更重要*
