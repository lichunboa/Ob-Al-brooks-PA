# 高1/低1模板化审计报告

更新时间：2026-03-16

## 1. 本轮目标

这份文档只做一件事：把 `高1/低1` 这组最基础的趋势恢复策略，按统一模板彻底拆开，明确：

1. 当前代码到底怎么做  
2. Al Brooks 原文和百科案例到底怎么做  
3. 哪些模块已经对齐  
4. 哪些模块还没有拆开，不能直接改代码  

这次**先不改策略代码**，先把 `高1/低1` 的完整模板定出来。后面如果你认可，我们就只按这份模板去落第一轮代码，不再“整族一起猜着改”。

## 2. 统一模板

后续所有策略都强制使用同一模板，只是每个策略调用不同子模块：

1. 背景识别
2. 关键位置
3. 形态定义
4. signal bar 判定
5. entry trigger 判定
6. 订单类型
7. 初始止损
8. 目标位层级
9. 持仓管理
10. 提前离场
11. re-entry / add-on
12. 成本与成交约束

`高1/低1` 是这个模板里最基础的一层。如果这层不清楚，后面的 `高2/低2`、`突破回调`、`20均线缺口` 都会一起偏。

## 3. 当前代码里的真实链路

### 3.1 detector

当前 `高1/低1` 主要在：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

当前实现实际分了 5 个子场景：

1. `趋势多 -> 高1`
2. `趋势空 -> 低1`
3. `急速多 -> 高1`
4. `急速空 -> 低1`
5. `区间 -> 顺 EMA 方向的 高1/低1`

### 3.2 家族归类

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/strategy_filters.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/strategy_filters.py)

当前把：

- `高1`
- `低1`

都归到 `趋势恢复族`。

### 3.3 管理层

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

当前 `高1/低1` 在回测管理层被当作 `first_entry_signal` 特殊处理，主要做了：

1. 在 `spike / bo / strong_bo` 中保留更宽松的 swing 管理  
2. 在 `tight_channel` 中稍微收紧  
3. 在 `bc / tr / weak trend` 中更保守  
4. 提前 `BE` 的阈值对 `高1/低1` 做了单独处理  

这一层说明：系统已经意识到 `高1/低1` 和 `高2/低2` 不是一回事。  
但 detector 端、目标端、signal bar 端还没有同步拆开。

## 4. Brooks 原文与案例

### 4.1 课程原文定义

核心定义页：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md)

关键原句：

- `the first time the high of a bar is at or above the high of the prior bar, the pullback is a High 1 bull flag`
- `Low 1 and Low 2 in Bear Trend or TR`
- `A double top is a Low 2 bear flag`

原文页图：

![H1/H2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

![L1/L2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0004.jpg)

### 4.2 百科案例

#### High 1：小回调多头趋势

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/pages/page-0223.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/pages/page-0223.md)

关键词：

- `High 1: Small PB Bull Trend`
- `Buy above bull bar closing near its high`

页图：

![High 1 小回调多头趋势](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/images/page-0223.jpg)

#### 区间/突破模式里的 High 1

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/pages/page-0451.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/pages/page-0451.md)

关键词：

- `TR Open: Bull BO`
- `Buy above bull bar closing near its high`
- `If exit below, buy above next bull bar for High 1 PB`

页图：

![区间/突破模式里的 High 1](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/images/page-0451.jpg)

#### Low 1：失败突破后的低一卖点

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/pages/page-0752.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/pages/page-0752.md)

关键词：

- `Failed BO above Yesterday's H`
- `Sell below bear bar closing near its low`

页图：

![Low 1 失败突破卖点](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-8/images/page-0752.jpg)

### 4.3 太妃补充

这轮最值得引用的是：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md)

太妃对 `20 gap` 的一句话，非常适合拿来校准 `高1/低1` 的角色：

- `入场触发 | 同侧 HL1/LH1（趋势恢复第一信号）`

也就是说，在太妃体系里，`20均线缺口` 不是独立于 `高1/低1` 的一套触发学，而是“特定背景下的 HL1/LH1”。

## 5. 按模板逐项审高1/低1

### 5.1 背景识别

#### Brooks 原意

`高1/低1` 可以出现于：

1. 趋势中  
2. 区间里的趋势腿中  
3. spike/tight channel 里的第一次 pullback  

它不是只能在“中性趋势”中发生。

#### 当前实现

当前代码允许：

1. `趋势多/趋势空`
2. `急速多/急速空`
3. `区间 + EMA 方向偏向`

#### 当前判断

这一步方向基本对。  
真正还没拆开的，不是“让不让生成 `高1/低1`”，而是：

- `趋势多里的高1`
- `急速多里的高1`
- `区间里的高1`

虽然都叫 `高1`，但后续 `目标位 / 保护性管理 / 提前离场` 其实应该不同。

### 5.2 关键位置

#### Brooks 原意

`高1/低1` 的关键位置通常包括：

1. EMA 附近  
2. prior high / prior low  
3. breakout point  
4. channel line / trend line  
5. 昨日高低 / 交易区边缘  

#### 当前实现

当前 detector 端主要只显式用了：

1. `EMA20`
2. `swing high / swing low`
3. 局部 `prev.high / prev.low`

#### 当前判断

位置模块还没有完全抽离。  
现在更多是 detector 里临时算，而不是统一的“位置层”。

### 5.3 形态定义

#### Brooks 原意

`高1/低1` 的定义不是“某个固定分数达到多少”，而是：

1. 一段 pullback
2. 第一次恢复尝试
3. 当前 bar 突破前一根 high/low

#### 当前实现

当前代码已经接近这层原意：

- 多头：`curr.close > prev.high`
- 空头：`curr.close < prev.low`

同时加了：

- 回调棒不能太强
- 结构上要 `Higher Low / Lower High`

#### 当前判断

形态定义总体方向是对的。  
最大偏差不在“是不是 H1/L1”，而在 signal bar 和 entry 的语义还没有彻底分开。

### 5.4 signal bar 判定

#### Brooks 原意

从原文和百科页看，signal bar 至少要拆成这些要素：

1. bull / bear signal bar
2. close 靠近 high / low
3. 是否强趋势棒
4. 是否是失败突破后的确认 bar
5. 是否是 micro channel 后第一根反向 bar

#### 当前实现

当前主要靠：

- `CandlePatterns.signal_bar_quality(...)`

也就是一个聚合分数。

#### 当前判断

这是 `高1/低1` 当前最大的前端缺口之一。  
分数可以保留做辅助，但不能代替 signal bar 类型学。

### 5.5 entry trigger 判定

#### Brooks 原意

这点现在已经很明确：

- `Buy above bull bar`
- `Sell below bear bar`

也就是：

- 真正的 trigger 是 signal bar 高低点外一跳

#### 当前实现

当前主代码仍是：

- `price = curr.close`
- 没有把 `entry_trigger` 单独作为主执行语义落干净

#### 当前判断

这一步必须改，而且改法现在已经明确：

1. `price` 保留 signal bar 参考价  
2. `entry_trigger` 单独表示 stop 触发价  
3. 后端执行与回测成交使用 `entry_trigger`

### 5.6 订单类型

#### Brooks 原意

`高1/低1` 默认更像：

- `STOP order`

而不是：

- `close 确认后市价追`

#### 当前实现

当前 detector 端没有把这层彻底表达清楚。

#### 当前判断

这一步必须和 `entry trigger` 一起改。  
`高1/低1` 如果不统一成 `STOP` 语义，后面的风控、滑点、有效性验证都会偏。

### 5.7 初始止损

#### Brooks 原意

`高1/低1` 的止损不是只有一种：

1. signal bar 外  
2. pullback leg 外  
3. swing low/high 外  
4. major HL/LH 外

不同背景下会选不同止损口径。

#### 当前实现

当前基本都走：

- `build_trend_pullback_stop(...)`

急速与区间里也只是局部换了锚点，没有形成明确类型。

#### 当前判断

止损模块还没有拆开。  
这里不是“止损没写”，而是“写了结构止损，但止损类型没模板化”。

### 5.8 目标位层级

#### Brooks 原意

`高1/低1` 目标位通常不是统一固定 R：

1. scalp 到 prior high / low
2. 先出一部分
3. 如果趋势强，再保 runner
4. 背景强时才谈更远的 measured move

#### 当前实现

当前 detector 端默认：

- `2R`

管理层再按 family 做 partial / BE / trailing。

#### 当前判断

这是 `高1/低1` 当前最需要和 `高2/低2` 分开的地方。  
`高1/低1` 不该跟 `高2/低2` 共享目标层级。

### 5.9 持仓管理

#### Brooks 原意

`高1/低1` 更像：

1. 先确认这是不是 first entry continuation
2. 如果背景强，允许 swing
3. 如果只是一般趋势恢复，更快保护、更快 scalp

#### 当前实现

管理层已经做了第一步：

- `first_entry_signal = {"高1","低1"}`
- `spike / bo / tc / bc / tr` 分级管理

#### 当前判断

这一块反而是当前系统里**相对更像 Brooks 的部分**。  
所以后续先改 detector 和目标位，比先改管理层更值。

### 5.10 提前离场 / BE / runner

#### Brooks 原意

`高1/低1` 常见的后续动作：

1. 正常推进后移到 BE
2. 如果失去 follow-through，做小 scalp
3. 如果变成 channel->TR，余仓保护退出
4. 如果变成更强趋势恢复，可保 runner

#### 当前实现

这些动作已经大致存在于：

- `BE`
- `protective scalp`
- `channel_to_tr`
- `runner trailing`

#### 当前判断

这里不是“完全没有做”，而是前端信号和目标位还没配套，导致后端经常被迫在错误基础上补救。

## 6. 当前最重要的 6 个偏差

1. `高1/低1` 还不是彻底的 `STOP` 触发语义  
2. signal bar 还被一个质量分数打包代替  
3. 关键位置还没抽成统一模块  
4. 初始止损类型还没模板化  
5. 目标位没有和 `高2/低2`、`突破回调` 分开  
6. `20 gap` 这类 continuation 场景还没明确复用 `高1/低1` 触发模板

## 7. 下一步建议

如果你认同这份模板，下一轮不要整族硬改，而是只做 `高1/低1` 的第一轮代码落地，顺序固定为：

1. 抽 signal bar 类型模块  
2. 抽 `entry_trigger` / `entry_type=STOP` 模块  
3. 抽 `初始止损类型` 模块  
4. 抽 `高1/低1` 专属目标层级  
5. 保持现有 first-entry 管理层不动，先看 detector 端收益变化

## 8. 一句话结论

`高1/低1` 现在最主要的问题，不是“系统没识别到它”，而是：

**系统已经知道它是什么，但还没有把它拆成 Brooks 原文那种“signal bar -> STOP 触发 -> 止损类型 -> 结构目标 -> first entry 管理”的完整模板。**
