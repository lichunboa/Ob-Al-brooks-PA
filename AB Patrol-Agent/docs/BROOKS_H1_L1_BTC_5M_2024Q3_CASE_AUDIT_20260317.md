# H1/L1 个案拆解：BTCUSDT 5m 2024Q3

## 1. 目的

本报告只拆 `BTCUSDT 5m 2024-08-10 ~ 2024-09-09` 这组 `H1/L1` 单策略样本。

目的不是按单品种、单周期特调，而是借这 15 笔成交，把当前 `H1/L1` 还没有对齐 Al Brooks 的通用问题继续收窄。

## 2. 样本概况

- 总交易数：`15`
- 胜率：`13.33%`
- PF：`0.215`
- `高1`：`6` 笔
- `低1`：`9` 笔

本样本量不大，不能单独决定最终规则，但足够用于识别当前实现里的失败家族。

## 3. 当前代码视角下，这 15 笔到底是什么

### 3.1 背景分布

- 当前周期 `market_state=broad_range`：`12/15`
- 更大一级周期 `higher_market_state=broad_range`：`9/15`
- 更大一级周期 `higher_follow_through=False`：`15/15`
- 当前周期 `follow_through=False`：`13/15`

### 3.2 setup 结构分布

- `setup_valid=False`：`15/15`
- `setup_clear_trend_leg=False`：`15/15`
- `setup_first_pullback_shape=True`：仅 `3/15`

### 3.3 路由与管理分布

- `management_style=brooks_tr_blshs`：`9`
- `management_style=brooks_s1_htf_sr_reversal`：`4`
- `management_style=brooks_swing`：`2`

- `management_state=protective_scalp`：`9`
- `trailing_exit_type=protective_stop`：`7`
- `profit_exit_type=protective_scalp`：`2`
- `profit_exit_type=full_tp`：`3`

### 3.4 关键直观结论

这 15 笔里，大多数并不是“标准趋势中第一次回调后的有效 H1/L1”。

从当前结构字段看，它们更像：

- 宽区间里的弱 H1/L1 尝试
- 宽通道/弱趋势里的小腿
- 没有 clear trend leg 的 first-entry 幻象
- bad follow-through 环境里的 continuation 尝试

换成 Brooks 语境，这批单的大头不是“应该大胆按 H1/L1 趋势恢复去做”，而是：

- 要么更像 `TR BLSHS`
- 要么更像 `Fade weak H1/L1`
- 要么根本不该交易

## 4. 最重要的三个失败家族

## 4.1 家族一：setup 本身就不是标准 H1/L1

最硬的事实是：

- `setup_valid=False`：`15/15`
- `setup_clear_trend_leg=False`：`15/15`

这说明当前这组差单，根本问题不是“明明是好 H1/L1，却管理坏了”，而是：

> 它们大多一开始就不是 Brooks 意义上的优质 first-entry continuation。

当前代码已经在把它们往 `brooks_tr_blshs / brooks_scalp` 这类保守管理上推，这是对的。

但这组样本表明，仍然有一部分单：

- 在结构不成立的情况下还被放行成交
- 或者虽然被降级到保守管理，但仍不值得交易

## 4.2 家族二：TP 命中但净结果仍为亏损

这是本轮拆样本里最值得重视的新发现。

本组里有 `3` 笔：

- `exit_reason=TP`
- 但 `result=LOSS`

代表性样本：

- `2024-08-17 07:50`
  - `高1`
  - `first_target_distance_r = 0.1031`
  - 命中 `TP`
  - 结果仍是 `LOSS`

- `2024-09-01 12:40`
  - `低1`
  - `first_target_distance_r = 0.0543`
  - 命中 `TP`
  - 结果仍是 `LOSS`

- `2024-09-08 03:55`
  - `高1`
  - `first_target_distance_r = 0.1168`
  - 命中 `TP`
  - 结果仍是 `LOSS`

这不是单笔偶然，而是一个通用风险：

> 在 `TR/BLSHS` 语境里，如果第一目标只有 `0.05R ~ 0.12R`，即使打到目标，也可能被手续费、滑点和成交磨损吃成净亏损。

这类问题不能按 `BTC 5m` 特调处理，应该变成通用规则：

- 如果弱 `H1/L1` 被降级成 `TR/BLSHS scalp`
- 但结构目标太近，近到连成本都覆盖不了
- 那么它不该继续按“可交易的 continuation”处理

## 4.3 家族三：protective_stop 不是唯一问题，bad follow-through 才是底层背景

这 15 笔里：

- `follow_through=False`：`13/15`
- `higher_follow_through=False`：`15/15`

这和下面这些案例非常接近：

- “Bad follow-through after big bull bars”
- “Trending TR day”
- “Fade weak L1”
- “Failed High Probability Signal”

也就是说，这批单很多不是“先有趋势，然后回调，然后恢复趋势”；
而是“表面像 H1/L1，但 follow-through 很差，市场更像在区间或弱趋势里来回拉扯”。

这也是为什么它们最后大量退化成：

- `tr_scalp_protect`
- `reversal_protect`
- `channel_to_tr`
- `protective_stop`

## 5. 与知识库对照：Al Brooks 会怎么理解

## 5.1 H1/H2 原始语义

参考：

- [H1/H2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- ![H1/H2 页图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

原文重点：

- `H1 and H2 B Setups: PB in Bull Trend or TR`
- `In past 15 bars, better if no more than 1 close below EMA`
- `Higher probability of profit when buying above bull bar that closes near its high`

对照这 15 笔样本，当前最大偏差是：

- 虽然我们已经用了 `STOP trigger`
- 但这批成交本身多数没有 clear trend leg
- 也没有 enough follow-through
- 所以它们更像“TR 里的弱信号”，不是教材里那种优质 H1/H2

## 5.2 Disappointed Bulls / Buy More Lower

参考：

- [Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- ![Disappointed Bulls 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)

原文重点：

- first buy 先看 `highest close` 测试
- first buy 失败后，lower buy 可以帮助 first buy 在 BE 或小利出

对照本组样本：

- 当前这 15 笔里大多数连“值得测试 highest close 的 valid first buy”都不成立
- 所以它们不该用 `Disappointed Bulls` 的强 continuation 逻辑硬撑
- 最多只能在确有 previous valid entry magnet 时，保留这条管理语义

## 5.3 Fade Weak L1

参考：

- [Ali Flash Cards 第 73 页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0073.md)
- ![Ali 73](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0073.jpg)

原文重点：

- `Fade Weak L1`
- 弱 `L1` 在错误背景里可以被反做，或者只做极小 scalp
- 不要去 fade 第二个信号

这页和当前样本高度相关。

因为这组里大量 `低1` 其实就是：

- 宽区间 / 弱趋势里的弱 continuation
- follow-through 很差
- 信号本身不够强

Brooks/Ali 的处理不是“继续当正常趋势恢复单去拉远目标”，而是：

- 要么不做
- 要么只做极小 scalp
- 要么直接反做弱信号

## 5.4 Failed High Probability Signal

参考：

- [Ali Flash Cards 第 588 页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0588.md)
- ![Ali 588](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0588.jpg)

原文重点：

- 失败的高概率 buy signal bar，技术上会变成反方向信号
- 若连高概率 setup 的触发都不足，说明低概率事件正在发生

对照这 15 笔：

- `setup_valid=False` 全覆盖
- 很多成交后没有好的 follow-through
- 一旦触发，也迅速掉回 `protective_scalp / protective_stop`

这和 “Failed High Probability Signal” 的逻辑非常接近：

> 不是所有 H1/L1 都应该继续按原方向拿；有些一旦表现出弱触发、弱跟进，就应按失败信号处理。

## 5.5 Market Tests Back to Valid Previous Entry

参考：

- [Ali Flash Cards 第 16 页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0016.md)
- ![Ali 16 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0016.jpg)

原文重点：

- 市场会回测“有效的 previous entry”
- 有效 previous entry 来自 `good signal bars`

当前样本里的关键问题恰恰是：

- 很多单并没有 valid previous entry
- 但我们仍让它们按 continuation 去寻找近目标

这会导致：

- 目标并不是 Brooks 语义里的真实 magnet
- target 太近，甚至近到不足以覆盖成本

## 5.6 Bad Follow-Through / Trending TR

参考：

- [百科 17 第 111 页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-17/pages/page-0111.md)
- ![百科 17-111 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-17/images/page-0111.jpg)
- [百科 17 第 34 页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-17/pages/page-0034.md)
- ![百科 17-34 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-17/images/page-0034.jpg)
- [百科 8 第 812 页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/pages/page-0812.md)
- ![百科 8-812 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/images/page-0812.jpg)

原文重点：

- `Bad follow-through after big bull bars`
- `expect midday reversal down`
- `Trending TR day`

这组 BTC 5m 样本和这些页面非常像：

- 表面上有小 continuation 结构
- 实际 follow-through 很差
- 市场更像区间或 trending TR，而非优质趋势恢复

## 6. 当前这 15 笔给出的通用结论

这组样本虽然只有 15 笔，但已经足够给出 4 个通用结论。

### 6.1 不是所有 H1/L1 都应该继续交易

如果满足：

- `setup_valid=False`
- `setup_clear_trend_leg=False`
- `higher_follow_through=False`
- `market_state` 更像 `broad_range / weak trend`

那么很多 `H1/L1` 应该：

- 直接不交易
- 或降级到极小 scalp
- 或按弱信号反做逻辑处理

### 6.2 目标距离不能小到覆盖不了成本

如果弱 `H1/L1` 的 `first_target_distance_r` 只有 `0.05R ~ 0.12R`，这类单即使命中目标，也可能净亏损。

这不是 `BTC 5m` 特例，而是所有市场都适用的通用约束：

- 目标必须先过结构逻辑
- 还必须过“能否覆盖真实成本”这道门

### 6.3 `TR/BLSHS` 语境下，H1/L1 不该偷渡成 swing continuation

当前修正已经把一部分弱单从 `brooks_swing` 挪到了 `brooks_tr_blshs / brooks_scalp`，方向是对的。

但这组样本说明：

- 还可以继续更明确地区分：
  - `valid first entry continuation`
  - `weak H1/L1 scalp only`
  - `failed weak H1/L1 -> opposite/fade candidate`

### 6.4 当前主问题已经不在 STOP trigger

`STOP trigger` 本身已经是对的。

本组样本真正暴露的剩余主问题是：

- `setup_valid=False` 的弱 H1/L1 是否还应该被交易
- 若可交易，应该按什么目标与管理语义
- target 是否足够大到覆盖成本

## 7. 下一步最值的优化方向

基于这 15 笔，不建议按 `BTC 5m` 单独特调。

应该打的是下面 3 条通用规则：

### 7.1 给弱 H1/L1 增加更明确的 no-trade / fade / scalp-only 分流

当以下条件叠加时：

- `setup_valid=False`
- `setup_clear_trend_leg=False`
- `higher_follow_through=False`
- `market_state in {broad_range, weak_trend_*}`

不要再默认把它当 continuation 单继续交易。

### 7.2 给弱 H1/L1 增加最低净目标门槛

如果结构第一目标太近，近到：

- 连手续费
- 滑点
- 挂单/吃单磨损

都覆盖不了，那么：

- 要么不交易
- 要么改成极小 scalp 模式
- 要么只允许 fade，不允许顺势 continuation

### 7.3 只有存在 valid previous entry magnet 时，才允许 first-entry 延续逻辑

这和 `Ali 16 / Disappointed Bulls` 是一致的：

- 不是任何 first entry 都值得期待回测 `highest close`
- 只有之前确有 valid previous entry、good signal bar 和真实 magnet，才成立

## 8. 当前结论

这 15 笔样本给出的最重要结论不是“BTC 5m 不行”，而是：

> 当前系统里，弱 H1/L1 在 `broad_range / weak trend / bad follow-through` 语境下，仍然被交易得太积极，而且第一目标有时近到无法覆盖成本。

这两个问题如果继续存在，就会在所有市场、所有周期里反复出现。

因此，下一步最值的是：

1. 先修弱 `H1/L1` 的 `no-trade / scalp / fade` 分流  
2. 再给弱 `H1/L1` 加“最低净目标门槛”  
3. 然后再用同一套 `fixed/random` 验证，不换口径
