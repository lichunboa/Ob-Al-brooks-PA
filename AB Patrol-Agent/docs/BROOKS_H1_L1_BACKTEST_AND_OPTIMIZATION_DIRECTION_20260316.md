# H1/L1 模板化回测复盘与优化方向

更新时间：2026-03-16

## 1. 本轮目的

本轮只验证一件事：

- 在不继续扩散到别的策略族的前提下，
- 把 `H1/L1` 统一模板推进到：
  - `STOP` 触发
  - signal bar 类型学
  - 止损类型模块
  - 目标位层级
  - first-entry 管理意图

然后用与既有基线完全一致的 fixed/random 回测口径，判断这套模板到底是正优化还是负优化。

## 2. 回测文件

### 2.1 基线

- fixed 基线：[/tmp/metricfix_baseline_fixed_20260315.json](/tmp/metricfix_baseline_fixed_20260315.json)
- random 基线：[/tmp/metricfix_baseline_random_20260315.json](/tmp/metricfix_baseline_random_20260315.json)

### 2.2 本轮结果

- fixed 当前：[/tmp/h1l1_template_fixed_clean_20260316.json](/tmp/h1l1_template_fixed_clean_20260316.json)
- random 当前：[/tmp/h1l1_template_random_20260316.json](/tmp/h1l1_template_random_20260316.json)

## 3. 总体结果

### 3.1 fixed 3 窗口

- 基线：交易 `648`，加权胜率 `31.64%`，场景平均 PF `0.9725`，平均日频 `6.9677`
- 当前：交易 `618`，加权胜率 `32.36%`，场景平均 PF `0.9893`，平均日频 `6.6452`

结论：

- fixed 口径是**小幅正优化**
- 胜率、PF 都有轻微提升
- 频率略降，但没有崩

### 3.2 random 4 窗口

- 基线：交易 `800`，加权胜率 `27.88%`，场景平均 PF `0.9759`，平均日频 `6.4516`
- 当前：交易 `791`，加权胜率 `27.81%`，场景平均 PF `0.9280`，平均日频 `6.3790`

结论：

- random 口径是**负优化**
- 胜率基本持平
- 频率只小降
- PF 明显回落

## 4. 家族层变化

### 4.1 fixed

- `趋势恢复族`：`1.1344 -> 1.1389`
- `MTR反转族`：`0.9937 -> 1.0437`
- `高潮/陷阱反转族`：`0.4313 -> 0.4928`
- `突破追随族`：`0.7332 -> 0.7552`

说明：

- fixed 下几乎所有家族都略有改善
- 这说明本轮 H1/L1 模板化，不是完全错误方向

### 4.2 random

- `趋势恢复族`：`1.0379 -> 0.9619`
- `MTR反转族`：`1.1373 -> 1.1138`
- `高潮/陷阱反转族`：`0.1239 -> 0.1239`
- `突破追随族`：`0.6208 -> 0.6208`

说明：

- 真正被打坏的是 `趋势恢复族`
- 其他家族几乎没动
- 也就是说，问题不在全系统，而在 `H1/L1` 模板自身

## 5. H1/L1 自身变化

### 5.1 fixed

- `高1`：`34` 笔 -> `10` 笔，胜率 `35.29% -> 50.00%`，PF `1.6934 -> 8.5214`
- `低1`：`20` 笔 -> `3` 笔，胜率 `40.00% -> 66.67%`，PF `2.8062 -> 4.4031`

### 5.2 random

- `高1`：`32` 笔 -> `27` 笔，胜率 `28.13% -> 29.63%`，PF `2.2758 -> 1.0938`
- `低1`：`31` 笔 -> `25` 笔，胜率 `22.58% -> 12.00%`，PF `0.4645 -> 0.4081`

### 5.3 直接结论

本轮模板化把 `H1/L1` 做成了：

- fixed 上留下更少但更“漂亮”的样本
- random 上把大量原本可以接受的 first-entry continuation 过滤掉了

所以问题不是：

- `STOP` 语义本身错了
- 或 `H1/L1` 模板不该统一

而是：

- 当前 detector 仍然**过度过滤**

## 6. 关键根因

### 6.1 最重要的问题：名义是 STOP，实际上仍在做 close-confirmation

当前 `H1/L1` 虽然已经有：

- `entry_type="STOP"`
- `entry_trigger = signal bar 外一跳`

但 detector 里仍然要求：

- `curr.close > prev.high` 才做 `BUY`
- `curr.close < prev.low` 才做 `SELL`
- 且 `curr` 还必须是顺势强收盘棒

这相当于：

- 名义上使用 stop 单
- 实际上仍然按“收盘确认突破”过滤一遍

这和 Brooks 原文不一致。

原文支持：

- H1/H2 页：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- 图页：![H1/H2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

关键原句：

- `the first time the high of a bar is at or above the high of the prior bar`
- `Buy above PB bar`
- `Choose one entry and rely on stop`

这里强调的是：

- `high above prior high`
- 而不是 `close above prior high`

所以这轮最核心的偏差已经锁定：

- 我们把 `STOP` 触发语义又偷偷收回成了 `close-confirmation`

### 6.2 signal bar 类型学还是偏硬

当前 `valid_signal_bar` 需要：

- directional bar
- close near extreme
- 不能 outside bar
- 且必须属于少数几个类型

这会让不少 Brooks 语义里“位置好但棒子一般”的 H1/L1 消失。

这里尤其会伤到：

- `低1`
- 随机窗口里一般质量的趋势恢复单

### 6.3 first entry 的目标逻辑还不够 Brooks

课程和百科都强调：

- 最低目标是 `1x Actual Risk`
- first entry 常常先 test `highest close`
- disappointed bulls 会在 lower buy 上让 first buy BE

对应页：

- `1x Actual Risk`：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md)
- 图页：![1x Actual Risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)
- `Disappointed Bulls`：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- 图页：![Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- `Small Pullback / highest close / 20-gap`：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-5/pages/page-0034.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-5/pages/page-0034.md)
- 图页：![Small Pullback / highest close](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-5/images/page-0034.jpg)

当前模板虽然已经加入：

- `first_target`
- `stretch_target`
- `target_buffer`
- `first_profit_at_1x_actual_risk`

但 detector 侧还没有真正把：

- `highest close test`
- `first buy -> second buy -> first buy BE`
- `20-gap` 的 first-entry continuation 语义

变成可执行分支。

## 7. 对太妃资料的判断

你提到的太妃说法和 Brooks 这里是对得上的：

- 当价格在 EMA20 一侧延伸很多根后，
- 第一次回踩 EMA20，
- 很大概率会恢复原趋势并 test 原高/原低

对应资料：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md)

但这件事的正确落点是：

- 它应成为 `20 gap / 第一均线缺口 / MAG` 模板族的背景和目标规则
- 不是拿来硬灌进所有 `H1/L1`

## 8. 目前最合理的优化方向

下一轮不该再整组乱动，而应只做 3 件事：

### 8.1 去掉 H1/L1 的 close-confirmation 偏差

只改这一条：

- `BUY` 不再要求 `curr.close > prev.high`
- `SELL` 不再要求 `curr.close < prev.low`

改成：

- 只要 `signal bar` 成立
- `entry_trigger` 存在
- 后续由 stop 单触发验证有效性

### 8.2 放松 signal bar 的硬过滤

不是取消类型学，而是收松：

- 不再把 `outside bar` 直接默认排除
- 不再把 `close_near_extreme` 做成太死的 veto
- 让“位置好但棒子一般”的 H1/L1 重新回来

### 8.3 暂时不继续碰目标位和管理层

因为本轮结果已经说明：

- 现在最大问题在前端过滤
- 不是目标位层级本身
- 也不是 first-entry 管理意图本身

## 9. 一句话结论

这轮回测说明：

- `H1/L1` 统一模板方向是对的
- `STOP` 语义方向也是对的
- 但 detector 还保留着“收盘确认突破”的旧思路，导致 first-entry continuation 被过度过滤

所以当前最值的下一刀不是继续加新模块，而是：

- 把 `H1/L1` 真正改成 Brooks 的 `signal bar + stop trigger`，
- 不再偷偷要求“必须强收盘突破后才算数”。
