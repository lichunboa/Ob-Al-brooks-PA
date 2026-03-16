# H1/L1 真正 STOP Trigger 修复复盘

更新时间：2026-03-16

## 1. 本轮只改了一件事

把 `H1/L1` 从“名义上有 `entry_trigger`，但 detector 里仍然要求收盘确认突破”，改成更接近 Brooks 原文的：

- 先有 `signal bar`
- 在 `signal bar` 外一跳挂 `STOP`
- 当前 K 线只要真实触发了该 `STOP`，就允许入场
- 不再要求：
  - `curr.close > prev.high`
  - `curr.close < prev.low`

对应代码：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

## 2. 对照资料

### 2.1 H1/H2 原文

- 文本：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- 图：![H1/H2 原文图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

关键点：

- `the first time the high of a bar is at or above the high of the prior bar`
- `Buy above PB bar`
- `Choose one entry and rely on stop`

这说明：

- 重点是 `high/low` 是否触发
- 不是必须等 `close` 强收在外面

### 2.2 1x Actual Risk

- 文本：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md)
- 图：![1x Actual Risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)

关键点：

- `minimum profit target is 1x Actual Risk`

### 2.3 Disappointed Bulls / highest close

- 文本：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- 图：![Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)

### 2.4 Small Pullback / 20-gap / highest close

- 文本：[/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-5/pages/page-0034.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-5/pages/page-0034.md)
- 图：![Small Pullback / highest close](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-5/images/page-0034.jpg)

关键点：

- first buy / lower buy / highest close / 20-gap 这些语义，是 `H1/L1` 后续继续优化的关键

## 3. 回测文件

### 3.1 基线

- fixed 基线：[/tmp/metricfix_baseline_fixed_20260315.json](/tmp/metricfix_baseline_fixed_20260315.json)
- random 基线：[/tmp/metricfix_baseline_random_20260315.json](/tmp/metricfix_baseline_random_20260315.json)

### 3.2 本轮结果

- fixed：[/tmp/h1l1_stoptrigger_fixed_20260316.json](/tmp/h1l1_stoptrigger_fixed_20260316.json)
- random：[/tmp/h1l1_stoptrigger_random_20260316.json](/tmp/h1l1_stoptrigger_random_20260316.json)

## 4. 总体结果

### 4.1 fixed 3 窗口

- 基线：交易 `648`，加权胜率 `31.64%`，场景平均 PF `0.9725`，平均日频 `6.9677`
- 本轮：交易 `626`，加权胜率 `32.59%`，场景平均 PF `1.0068`，平均日频 `6.7312`

### 4.2 random 4 窗口

- 基线：交易 `800`，加权胜率 `27.88%`，场景平均 PF `0.9759`，平均日频 `6.4516`
- 本轮：交易 `763`，加权胜率 `28.70%`，场景平均 PF `0.9954`，平均日频 `6.1532`

## 5. 结论

这轮是明确的**正优化**：

- fixed / random 两组都改善
- 胜率同时提升
- PF 同时提升
- 频率略降，但没有崩

也就是说：

- 你一直强调的 `STOP` 触发语义，确实是对的
- 之前问题不是你理解错了，而是实现没有真正做到 Brooks stop trigger

## 6. H1/L1 本身的变化

### fixed

- `高1`：`34 -> 15`，胜率 `35.29% -> 46.67%`，PF `1.6934 -> 6.5779`
- `低1`：`20 -> 7`，胜率 `40.00% -> 57.14%`，PF `2.8062 -> 1.9127`

### random

- `高1`：`32 -> 8`，胜率 `28.13% -> 37.50%`，PF `2.2758 -> 1.5634`
- `低1`：`31 -> 7`，胜率 `22.58% -> 14.29%`，PF `0.4645 -> 1.2334`

### 解释

这说明当前 `H1/L1` 已经更像：

- 样本更少
- 但留下来的样本质量更高

所以：

- 这轮不是“放开 stop 触发后变烂”
- 相反，是 detector 不再用 close-confirmation 错杀一些可做单后，留下的交易质量更接近 Brooks

## 7. 对趋势恢复族和管理链的影响

### fixed

- `趋势恢复族 PF`：`1.1344 -> 1.1626`
- `protective_stop_exit`：`313 -> 294`
- `breakeven_stop_exit`：`314 -> 298`，PF `1.3745 -> 1.5238`
- `protective_scalp_exit`：`86 -> 89`，PF `6.2825 -> 6.5501`

### random

- `趋势恢复族 PF`：`1.0379 -> 1.0946`
- `protective_stop_exit`：`413 -> 387`
- `breakeven_stop_exit`：`416 -> 394`，PF `1.4176 -> 1.4234`
- `protective_scalp_exit`：`91 -> 93`，PF `6.8189 -> 6.8567`

### 解释

这说明 stop trigger 修正并不只是前端 detector 自己好看，而是确实减少了后端被迫用 `protective_stop_exit` 擦屁股的情况。

## 8. 当前仍然存在的问题

虽然方向对了，但还没收工。

### 8.1 频率仍然掉了一截

说明 detector 还有过滤过度的问题，尤其是：

- `signal_profile["valid_signal_bar"]`
- `outside_bar` 一刀切
- `close_near_extreme` 要求仍然偏硬

### 8.2 H1 和 L1 的结果仍不均衡

当前：

- `高1` 结果明显更稳
- `低1` 在 random 下仍然不够稳

这说明：

- 不是理论模板要拆成两套
- 而是同一模板里，bear-side 的 signal bar 过滤和背景识别还不够对称

### 8.3 目标位与 first-entry 管理还没彻底对齐

虽然这一轮没动目标位和管理层就已经变好，但后续仍要继续按原文补齐：

- `highest close test`
- `1x Actual Risk`
- `first buy -> lower buy -> first buy BE`
- `20-gap` 的 first-entry continuation 语义

## 9. 下一步最值的优化方向

现在不该再碰别的策略族，继续只打 `H1/L1`：

1. 放松 `signal bar` 的硬 veto  
   不取消类型学，但不要让：
   - `outside_bar`
   - `close_near_extreme`
   - `valid_signal_bar`
   过度收紧频率

2. 把 `highest close` 作为 H1/L1 的显式第一目标层级  
   这一步有 Brooks 原文和百科案例双重支持

3. 把 `first-entry` 的管理写得更接近 `Disappointed Bulls`  
   即：
   - first buy 不一定一口气拿很远
   - lower buy 帮助 first buy BE
   - `first entry` 更偏 partial/scalp，`second entry` 更适合留 runner

## 10. 一句话结论

这轮已经证明：

- 你一直强调的 `STOP` 入场理解是对的
- 真正把它落实进 detector 之后，fixed / random 两组一起改善

所以后面 `H1/L1` 的优化，不该再怀疑 `stop trigger` 本身，而应该继续围绕：

- signal bar 过滤过度
- highest close 目标
- first-entry 管理

这三块继续收。
