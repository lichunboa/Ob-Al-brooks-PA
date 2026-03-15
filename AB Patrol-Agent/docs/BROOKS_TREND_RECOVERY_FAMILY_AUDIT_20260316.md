# 趋势恢复族逐步骤对照报告

更新时间：2026-03-16

## 1. 目标与范围

本报告只做一件事：把当前系统里的“趋势恢复族”实现，按 **背景 -> 形态 -> 信号棒 -> 入场 -> 止损 -> 目标 -> 管理 -> 离场** 的顺序，和 Al Brooks 原文资料逐条对照。

本轮**不修改策略代码**，先把信息对齐，避免后续修改时我们双方理解不一致。

本报告覆盖的策略族：

- 高1
- 低1
- 高2
- 低2
- 突破回调
- 20均线缺口
- 第一均线缺口

说明：

- 当前代码里，`趋势恢复族` 与 `均线缺口族` 在回测分类上是分开的。
- 但从 Brooks 交易流程看，它们都属于“顺势 pullback / test / continuation”这一大语义，所以本轮放在一起审。

## 2. 先回答一个现实问题

### 2.1 Claude 不符合 Brooks 的修改都修复了吗？

结论：**明显不符合 Brooks 的主问题，大部分已经拆开并回退/重做了，但不能说已经全部收官。**

已经明确回退或重做的内容：

- 按策略写死的固定强度门槛
- `头肩MTR` 的大评分器
- “区间中的压缩突破一刀切禁止”

当前仍然处于“待继续审”的位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`

原因不是它们一定错，而是这两处还承担着：

- 背景识别
- 路由前置过滤
- H1/H2/突破回调/均线缺口的真实 detector

所以这次报告，默认以**当前工作树的实际实现**为准来对照，而不是假设“已经完全修好”。

## 3. 当前系统里，这一族的真实执行链

当前不是“每个策略自己一条独立链”，而是：

1. `analysis.py` 先识别市场背景  
2. `pa_engine.py` / `strategy_advanced.py` 生成候选信号  
3. `pa_engine.py` 的 `_state_first_generation_allowed()` 先做一轮 Brooks 路由前置  
4. `strategy_filters.py` 决定回测里的家族分类和管理模板  
5. `sim_exchange.py` 按家族做 protective / BE / trailing / partial / TP / re-entry / add-on

这一族当前对应到的代码位置：

- `高1/低1`: `pa_engine.py` 约第 270-600 行
- `高2/低2`: `pa_engine.py` 约第 620-840 行
- `20均线缺口`: `pa_engine.py` 约第 1271-1344 行
- `突破回调`: `pa_engine.py` 约第 1970-2048 行
- `第一均线缺口`: `strategy_advanced.py` 约第 12-105 行
- 家族分类：`strategy_filters.py`
- 家族管理：`sim_exchange.py`

## 4. Brooks 原文锚点

这轮优先使用新的 `LLM可读版`，再回看对应页图。

### 4.1 High 1 / High 2 / Low 1 / Low 2

核心原文：

- `阿布10种最佳价格行为交易模式/page-0005`
- `阿布10种最佳价格行为交易模式/page-0004`

关键句：

- `H1, H2, and H3 are pullbacks in bull trend or TR`
- `the first time the high of a bar is at or above the high of the prior bar, the pullback is a High 1 bull flag`
- `If it triggers, but there is then one more leg down, that creates a High 2 bull flag`
- `Every small double bottom is a High 2 bull flag`
- `Low 1 and Low 2 in Bear Trend or TR`
- `A double top is a Low 2 bear flag`

对应页图：

![H1/H2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)

![L1/L2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0004.jpg)

百科案例：

- `百科幻灯片-6/page-0398`  
  `TR Open: ioi High 2 Bull Flag at EMA`

![百科 High2 at EMA](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-6/images/page-0398.jpg)

### 4.2 突破回调

核心原文：

- `阿布10种最佳价格行为交易模式/page-0008`
- `阿布10种最佳价格行为交易模式/page-0010`

关键句：

- `When there is a breakout, the trend often continues for a measured move`
- `They especially like a pullback that tests the breakout point, but then reverses back up`
- `When a market breaks above a prior high, it often pulls back to test that breakout point. Bulls will buy a reversal up.`

对应页图：

![突破回调原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0008.jpg)

![突破点测试原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0010.jpg)

百科案例：

- `百科幻灯片-3/page-0508`  
  `Breakout test (PB almost reach breakout point) / High 2`

![百科 Breakout Test](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0508.jpg)

### 4.3 均线缺口 / 第一均线缺口 / MAG

核心原文：

- `基础篇/page-0665`
- `进阶篇/page-1159`

关键句：

- `MAG in Bull: Often Leads to Final Bull Leg`
- `Gap bars usually lead to final leg of trend before correction attempt`
- `Sell below MA Gap Bar`
- `or 2nd signal`
- `Ok to rely on stop above most recent major LH`

对应页图：

![MAG 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/images/page-0665.jpg)

![MA Gap Bar 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-1159.jpg)

百科案例：

- `百科幻灯片-13/page-0093`

![百科 1st EMA gap bar](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-13/images/page-0093.jpg)

## 5. 当前实现 vs Brooks 原文

### 5.1 高1 / 低1

#### 当前代码怎么做

- 背景：
  - 允许在 `趋势多/趋势空`
  - 也允许在 `急速多/急速空`
  - 还允许在 `区间` 里根据 EMA20 斜率做“区间 H1/L1”
  波波:市场周期是怎么计算识别的.
- 形态：
  - 回调棒不能是强趋势棒
  - 结构上要求 `Higher Low` 或 `Lower High`
- 信号棒：
  - 当前棒必须收在前一根回调棒高点/低点之外
  - `signal_bar_quality >= 0.55`
  波波:al brooks的信号k线有好多种定义,我们现在这么写,能包含多少种信号k线呢.
- 入场：
  - 当前实现是**按当前收盘价直接建信号**
  - 没有统一写成 `STOP above bull bar / below bear bar`
  波波:订单类型分好多种,这里我感觉选用stop order比较合适,其实al brooks说大多数情况都应该用stop order,不过要搞懂所有的订单类型,给他按照al brooks分配的策略里.
- 止损：
  - 用 `build_trend_pullback_stop()`，是结构止损
  波波:止损类型也分好多种,我们现在这个是结构止损,不过al brooks里还有很多其他止损类型,我们现在这么写能覆盖到吗.市场中有许多种情况,感觉现在没有展开.
- 目标：
  - 固定 `2R`
  波波:现在目标位选2R是不是有点过于机械了,al brooks里更强调结构目标,比如prior high/low, breakout point, measured move等,或者我们是不是应该专门研究一下目标位怎么设定,有一套目标位的选择方式,其实包括前边的背景、形态、信号、入场等,甚至后边的仓位管理、持仓管理.
- 管理：
  - 回测分类里归 `趋势恢复族`
  - 默认走 `brooks_swing`

#### Brooks 原文怎么做

- H1/L1 是 **trend or TR** 里的第一次 pullback
- 关键定义是：
  - `the first time the high of a bar is at or above the high of the prior bar`
  - 或对应的 `Low 1`
- 典型执行语义是：
  - `Buy above bull bar`
  - `Sell below bear bar`
- 原文强调的是：
  - 这是 pullback bull flag / bear flag
  - 可以 scalp，也可以 swing 部分或全部

#### 当前偏差

- **最大偏差**：当前 H1/L1 更像“收盘确认单”，不是 Brooks 更常见的 `STOP` 触发单
- 固定 `2R` 太机械，原文更像：
  - 小单先 scalp
  - 趋势仍强时保留 swing
- `signal_bar_quality` 这种分数阈值是工程代理，不是原文术语
波波:这点我同意,根据后边的市场走势,做不同的持仓管理.
### 5.2 高2 / 低2

#### 当前代码怎么做

- 背景：
  - 只在 `趋势多/趋势空`
- 形态：
  - 用最近 25 根找两个 swing low / swing high
  - 两次测试必须接近
  - 中间必须有一次恢复尝试
- 信号棒：
  - 当前棒要突破前棒高点/低点
  - `signal_bar_quality >= 0.50`
  波波:这里的信号k计算方式,我还是有点不太明白.
- 入场：
  - 当前实现仍是**当前收盘价信号**
  - 没统一显式写成 `STOP`
  波波:这里的订单类型,我觉得也应该改成stop order,因为al brooks里也是stop order为主,我们现在这么写,感觉不太对.
- 止损：
  - 结构 stop，区分重叠度高低
  波波:止损al brooks好像有专门说这部分的止损,好像是说要放在前边的swing low/high外面.我们需要确认一下.
- 目标：
  - 固定 `3R`
  波波:固定的`3R`很难达到,我们好像没有仔细研究止盈位的设定.每种策略都有比较合理的目标位,al brooks也专门讲过目标位怎么选.比如第二腿等于第一腿,measured move等,我们的目标位可以比这些位置稍微早一点离场,这样避免目标位的订单量不足,导致无法离场.

#### Brooks 原文怎么做

- H2/L2 是第二次回调尝试后的 continuation
- `Every small double bottom is a High 2 bull flag`
- `A double top is a Low 2 bear flag`
- 在 TR 中，第二个信号通常更好
波波:同意,宽通道第二信号,然后stop order入场,然后根据后边的走势,做不同的持仓管理.应该是这样吧.
#### 当前偏差

- **当前 H2/L2 与原文最接近，但入场类型仍没彻底对齐**
- 固定 `3R` 过于统一；Brooks 更强调：
  - 第二腿
  - breakout point test
  - measured move
  - 以及背景强弱决定是 scalp 还是 swing
波波:同意同意,我们现在的目标位设置,实在是过于粗糙了.
### 5.3 突破回调

#### 当前代码怎么做

- 背景：
  - 只在 `趋势多/趋势空`
- 形态：
  - 最近 20 根区间先发生 breakout
  - 当前回调到 breakout point 附近
  - 回调深度不能超过 breakout 幅度 50%
- 信号棒：
  - `signal_bar_quality >= 0.45`
- 入场：
  - 已经写成 `STOP`
  - 有 `entry_trigger`
  - 标记 `confirmation_needed=True`
- 止损：
  - `build_channel_recovery_stop()`
- 目标：
  - 固定 `2R`

波波:突破回调的问题其实和上边都差不多,没有针对突破回调,分析每个环节细节的al brooks是怎么说的.突破回调是区间的突破,2R其实合理,关键是止损位要放在哪里,才能确认2R的位置,或者还有其他的目标位,比如说measured move,或者有一个初始风险与实际风险的概念,来计算目标位.

- 这是当前实现里**最接近原文**的一支
- 原文核心就是：
  - `tests the breakout point`
  - `reverses back up`

#### 当前偏差

- 仍然把目标写成固定 `2R`
- 对于 `first pullback does not reach breakout point` 这种“可能成为 measuring gap”的语义，目前没有单独建模
波波:需不需要单独建模.
### 5.4 20均线缺口 / MAG 20/20

#### 当前代码怎么做

- 背景：
  - 只在 `趋势多/趋势空`
- 形态：
  - 先数价格连续远离 EMA 的根数
  - `7+` 视为普通 `20均线缺口`
  - `15+` 视为 `MAG 20/20`
  波波:好像需要20-30根k线在均线外面,这是太妃的策略,我们拿来用的,不知道al brooks怎么说的,但是我感觉太妃这么做可能也是要提高胜率.
- 信号：
  - 回测到 EMA，且收回 EMA 同侧
  波波:我们用的应该都是EMA20吧,al brooks里好像也主要是20EMA,我们需要确认一下.
- 入场：
  - 当前实现主要按当前价直接建信号
  - 没有统一写成 `sell below MA gap bar / buy above MA gap bar`
  波波:有信号后,也应该用stop order入场,所有入场都要比信号k线多一个波动点或者少一个波动点,来确认信号k线的有效性,同时也避免被假突破震出局.
- 止损：
  - swing stop
  波波:这里的止损好像比较紧,就在前高/低点.
- 目标：
  - 普通 `2R`
  - MAG `1.5R`
波波:20均线缺口的目标位好像就在前高附近,也就是回调前的高/低点.我们可以不要等到目标位到了才离场,可以提前一点离场,也是避免目标位到订单不足.
#### Brooks 原文怎么做

- MA gap bar 不是单纯“碰 EMA 就继续”
- 原文非常强调：
  - 这经常是 **趋势最后一腿**
  - 经常在 correction 前出现
  - 执行上经常是：
    - `Sell below MA Gap Bar`
    - 或 `2nd signal`
    - 止损放在最近主要 LH/HL 外
波波:是和我刚才理解的一样吗.
#### 当前偏差

- **当前系统把 20EMA 缺口做得太“自动 continuation”了**
- Brooks 原文里它经常兼具：
  - continuation
  - exhaustion / final leg
  - small scalp
- 也就是说，它不应该只有“触 EMA -> 顺势继续”这一种解释

### 5.5 第一均线缺口

#### 当前代码怎么做

- 背景：
  - `趋势多/趋势空`
- 形态：
  - 连续 `5` 根完全脱离 EMA
  - 当前第一次回到 EMA
- 入场：
  - 已经写成 `STOP`
- 目标：
  - 固定 `2.5R`

#### Brooks 原文怎么做

- 百科和课件更像在说：
  - `1st close below EMA`
  - `1st EMA gap bar`
  - 小回调趋势中第一次像样回测
- 重点仍然是：
  - 背景足够强
  - 这是不是 trend resumption，而不是 correction 起点

#### 当前偏差

- `5 根` 这个数字是工程代理，不是原文固定数字
- 固定 `2.5R` 仍然偏机械
波波:第一均线缺口好像和20均线缺口一样,也要有20-30根k线在均线外面,我们需要确认一下.目标位也是一样的,也要根据前高/低点.stop order入场,所有入场都要比信号k线多一个波动点或者少一个波动点,来确认信号k线的有效性,同时也避免被假突破震出局.
## 6. 这一族当前最关键的系统性偏差

### 6.1 信号棒和入场棒被混在了一起

Brooks 原文里，很多 setup 的核心是：

- 先有 `signal bar`
- 再用 `STOP` 去触发
波波:同意,我们现在的实现里，很多都是直接按当前收盘价建信号了，这样就把“signal bar 的定义”和“入场 trigger”这两件事混在了一起。
当前系统里：

- `高1/低1/高2/低2` 主要还是按当前收盘价直接给信号
波波:这样太容易被市场反复教训了.
- `突破回调`、`第一均线缺口` 更接近 `STOP`
- `双顶/双底/楔形` 在别的族里已经改成 `STOP`

所以这一族内部的**订单语义并不统一**。

### 6.2 固定 R 倍数目标过重

当前实现里大量是：

- `2R`
- `3R`
- `2.5R`

但 Brooks 原文更像：

- 第一部分先 scalp
- 强趋势时 swing 剩余仓位
- measured move / breakout point / prior high-low / EMA gap / major HL-LH 这些结构目标更重要
波波:目标位我们需要好好研究一下了,不能再这么机械了.不同的 setup,不同的背景,目标位也应该不一样.我们需要总结一下,每种 setup 在什么背景下,适合什么样的目标位.
### 6.3 MA gap 的 continuation / exhaustion 没拆干净

当前 `20均线缺口`、`MAG 20/20`、`第一均线缺口` 都在一个“顺势恢复”框架里。

但原文和百科都显示：

- 有些是 continuation
- 有些更像 final leg
- 有些应该按 second signal 做

这会直接影响：

- 入场方式
- 止损位置
- scalp 还是 swing
- 是否更早保护
波波:同意你的看法.
### 6.4 背景层现在仍然偏工程化

`_state_first_generation_allowed()` 里这类条件：

- `pullback_ratio > 0.72`
- `signal_bar_quality >= 0.56`
- `strong_first_entry`
- `endless_pullback_ready`

它们的方向不一定错，但目前很多还是“Brooks 语义的工程代理”，而不是原文里的直接动作定义。

这会导致一个问题：

- 代码能工作
- 但我们很难确认“到底是 Brooks 规则本身，还是工程阈值在替代判断”
波波:这也是我一致担心的,代码不会像al brooks或者人那样对市场做判断,所以我们只能把所有情况尽可能考虑到,模拟人的判断,但是这个过程很难.
## 7. 这次不改代码，先确认的讨论点

我建议先确认下面这些点，再进入修改。

### 7.1 H1/L1/H2/L2 是否统一改成 STOP 触发

我当前判断：**应该。**

原因：

- 这和原文更一致
- 也能和 `双顶/双底/楔形/突破回调/第一均线缺口` 的执行语义统一

### 7.2 趋势恢复族是否要拆成两个子族

建议拆成：

- `pullback continuation`
  - 高1 / 低1 / 高2 / 低2 / 突破回调
- `ema gap continuation / final leg`
  - 20均线缺口 / 第一均线缺口 / MAG

原因：

- Brooks 对 MA gap 的处理，本来就不完全等于普通 H1/H2

### 7.3 固定 2R/3R 是否应改成“结构目标 + 分批”

我当前判断：**应该。**

原因：

- 原文里更重结构目标
- 也更符合后面管理链 `scalp part / swing part`

## 8. 我认为下一步最合适的改法

先不要全改，只改一小步：

1. 先把 `高1/低1/高2/低2` 的入场统一成 `STOP`
2. 再把 `20均线缺口 / 第一均线缺口 / MAG` 从普通趋势恢复里拆成单独子流程
3. 目标先不直接硬改，只先把“结构目标字段”补出来

这样做的好处是：

- 能先修正最明显的执行语义偏差
- 不会一下子把整条后端管理链重新打散

## 9. 本轮结论

这次趋势恢复族对照下来，最关键的不是 detector 少了哪条规则，而是：

- **当前系统在 H1/H2 这类 setup 上，仍然偏“收盘确认单”**
- **Brooks 原文更偏“signal bar + STOP 触发”**
- **MA gap 现在被我们过度 continuation 化了**
- **固定 2R/3R 目标和原文的结构目标/分批语义还没对齐**

也就是说，下一步如果要改，最优先的不该是继续加 detector，而是把这一族的：

- 入场类型
- 结构目标
- MA gap 子流程

先和原文对齐。

## 10. 对波波批注的逐条回应

### 10.1 关于资料优先级

确认：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版`
  现在视为**课程 PDF + 百科 PDF + Ali 实战材料的可检索权威版**。
- 后续判断时，优先引用这里的原文页和页图，不再把旧 `skill/S` 文件当权威规则源。

### 10.2 市场周期是怎么计算识别的

当前系统在 `analysis.py` 里，主要靠这些量推断市场周期：

- swing 结构
- EMA 位置与斜率
- overlap
- follow-through
- pullback_ratio
- always-in

这套做法的方向是对的，但问题是：

- 现在还是“工程代理组合”
- 还不是 Brooks 课件那种“先读背景，再决定应该找哪类 setup”的显式流程

也就是说，**现在的周期识别能工作，但还没有完全拆成 Brooks 语言层的可解释步骤**。这块后续要单独成文：

1. 趋势
2. 宽通道
3. 紧密通道
4. 交易区间
5. breakout mode
6. 强趋势中的 endless pullback / small pullback

### 10.3 信号 K 线定义现在是不是太粗

是。

当前很多 detector 最终都压成了一个 `signal_bar_quality` 分数阈值，这只能近似表达：

- 实体大小
- 收盘位置
- 上下影线
- 相对前一根的位置

但 Brooks 对信号棒的判断，远不止一个分数。至少要拆成：

1. 是 bull signal bar 还是 bear signal bar
2. 是 strong 还是 weak
3. close near high/low 还是尾巴太多
4. signal bar 本身是 inside/outside/doji/trend bar 哪一类
5. 这个 signal bar 出现在什么背景下
6. entry bar 是否确认了它

所以这里的结论很明确：**后续必须把“signal bar 类型学”单独拆出来，不能再只靠一个 quality 分数。**

### 10.4 趋势恢复族是否应以 STOP order 为主

我同意，而且现在判断更明确了：

- `高1/低1/高2/低2`：应默认 `STOP`
- `突破回调`：本来就更适合 `STOP`
- `20均线缺口/第一均线缺口`：也应以 `STOP` 为主

例外情况只保留给：

- 极强 breakout close
- 紧密 TR 里的 `BLSHS / limit order market`

对趋势恢复族来说，主语义应该是：

- 先识别 `signal bar`
- 再用 `entry_trigger = signal_bar 高/低点 +/- 一个最小波动点`

这样才能把：

- signal bar
- entry bar
- 真假突破

这三件事分开。

### 10.5 止损类型现在是不是没展开

是，而且这是当前系统明显欠缺的一层。

Brooks 里至少要区分：

1. `signal bar stop`
2. `swing stop`
3. `wide stop beyond prior swing`
4. `major HL/LH protective stop`
5. `breakeven stop`
6. `logical stop outside failed breakout / trap point`
7. `scalp stop` 与 `swing stop` 的切换

当前趋势恢复族里虽然已经有 `build_trend_pullback_stop()`、`build_channel_recovery_stop()` 这类结构 stop，但仍然没有把“这是哪一种 Brooks stop”显式写出来。

后续应把止损单独建成一份清单，并要求每个 setup 明确回答：

- 初始止损放哪
- 为什么放这里
- 什么时候改成保本
- 什么时候改成 Major HL/LH trailing

### 10.6 目标位为什么不能再固定 R

这一点我完全同意。

后续目标位要改成“结构优先级”而不是“固定倍数”：

1. prior high / low
2. breakout point
3. measured move
4. Leg 1 = Leg 2
5. 区间对边
6. EMA gap 的前高/前低
7. 最后一腿 / final leg 的小 scalp 目标

而 `1R / 2R / 3R` 应该退到：

- 风险衡量
- 分批阈值
- 保护性管理触发点

不应该再当最终目标本身。

### 10.7 突破回调是否需要单独建模

需要。

理由不是它和 H1/H2 完全无关，而是它在 Brooks 里有自己独立的判断链：

1. breakout 是否足够强
2. 回调是否真的在 test breakout point
3. 第一回调有没有碰到 breakout point
4. 如果没碰到，是不是 measuring gap
5. 用 stop above signal bar 还是 buy close of strong breakout bar

所以它应该是：

- 属于大类 `pullback continuation`
- 但在代码里有单独的 detector 与单独的目标位/止损逻辑

### 10.8 20 均线缺口 / 第一均线缺口是不是要 20-30 根离均线

这里要分开说。

- Brooks 原文里，确实有很多 `20-gap bar`、`40 bars above MA`、`after 20 or more bars` 这类表达。
- 但这些更像**高质量 MAG / prolonged separation** 的典型背景，不是“所有 EMA gap setup 的硬性统一阈值”。

所以后续更合理的写法不是：

- 所有均线缺口都硬性 `20-30 bars`

而是：

1. `第一均线缺口`
2. `普通 20EMA gap test`
3. `真正的 prolonged/MAG/final leg`

分成三类。

### 10.9 EMA20 是否应作为统一基准

这个我同意。

当前系统主线本来就是 `EMA20`，而 Brooks 的课程和案例里也主要围绕 `20EMA`。  
所以后续不要再混入别的均线定义，统一 `EMA20` 即可。

### 10.10 “signal bar / entry bar / stop / target / management” 是否要逐策略完整列出

是，而且这件事不只是趋势恢复族要做。

我现在认为后续所有策略族都应该强制使用同一模板：

1. 背景
2. 关键位置
3. 形态
4. signal bar
5. entry bar
6. order type
7. 初始止损
8. 目标位
9. partial / scalp / BE / trailing
10. 提前离场条件
11. re-entry / add-on 条件
12. 成本注意项

## 11. 趋势恢复族下一版改造蓝图

如果进入代码修改，我建议顺序固定成下面这样：

### 第一步：统一入场语义

- `高1/低1/高2/低2`
  - 全改成 `STOP`
  - 补 `signal_bar_high / signal_bar_low / entry_trigger`
- `突破回调`
  - 保持 `STOP`
  - 继续细化 `buy close of big breakout bar` 的例外
- `20均线缺口/第一均线缺口`
  - 改成显式 `STOP`

### 第二步：把目标位从“固定 R”改成“结构目标层级”

每个趋势恢复 setup 先算：

1. 最近 prior high/low
2. breakout point
3. measured move
4. Leg 1 = Leg 2

然后再决定：

- 先 scalp 一部分
- 还是直接看 swing

### 第三步：把 MA gap 单独拆成 3 个子流程

1. 第一均线缺口
2. 普通 EMA gap continuation
3. MAG / final leg / exhaustion

### 第四步：补“signal bar 类型学”

至少拆成：

- strong / weak bull signal bar
- strong / weak bear signal bar
- doji / inside / outside / trend bar
- close near high/low
- tail too big / body too small

## 12. 对“其他策略族也适用”的回应

我同意，而且现在已经可以把这件事定成规则：

- 这次趋势恢复族不是单独特例
- 而是以后所有策略族都按同样模板做

也就是说，后面每个族都要补两份东西：

1. `代码实现细节清单`
2. `Brooks 知识点映射表`

这样做完以后，才有可能真正回答：

- 我们系统里每一步用到的知识点是否正确
- 哪些地方只是工程代理
- 哪些地方已经和原文一致


波波:我们这次这么细致的对每个环境做了一次审查,其实其他策略族也是适用的.开始吧.
