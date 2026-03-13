# Brooks 结构路由审计

> 更新于 2026-03-13
> 目的：分析当前回测里剩余的 Brooks 结构路由拦截，判断主因到底是高周期约束，还是当前周期自身结构不足。

## 一、结论先行

当前剩余的高频拦截，**不是单纯的“大周期压死小周期”**。

主因分成两层：

1. **当前周期自身被判成宽通道 / 弱趋势 / 交易区间**
   - 这时代码要求必须满足 Brooks 的区间交易前提：
   - 靠近边缘或优势区
   - 有 follow-through
   - 或者已经出现 failed breakout / trendline break / trapped side
   - 如果不满足，就拦掉
2. **高周期只是在 5m 场景里进一步加重这种判断**
   - 例如 `15m 为 TR，5m 中部不追弱突破`
   - 这类规则是存在的，但从回测统计看，它不是 15m/1h 低频的主因

换句话说：

- `15m` 和 `1h` 低频的主要原因，是**它们自己被判成了 TR / 宽通道 / 弱趋势后，要求的反转证据太强**
- `5m` 才更明显地受到 `15m` 背景影响

## 二、代码里的核心拦截点

代码位置都在 [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)。

### 1. 宽通道中部不做逆势 fade

- 代码：
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L1880)
- 触发条件：
  - 当前周期被判成 `broad_range`
  - 当前位于 `range_zone == middle`
  - 又没有 failed breakout / trendline break / second-leg 背景
- 本质：
  - 这是**当前周期自己的区间几何位置判断**
  - 不是高周期压制

### 2. 宽通道逆势单仍需靠近边缘或优势区

- 代码：
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L1884)
- 触发条件：
  - 当前周期是 `broad_range`
  - 逆势单不在 tradeable edge
  - 又没有 follow-through / failed breakout / trendline break
- 本质：
  - 仍然是**当前周期的区间边缘判断**
  - 不是高周期优先级门控

### 3. 宽通道顺势恢复缺少 follow-through

- 代码：
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L1908)
- 触发条件：
  - 当前周期是 `broad_range`
  - 想做顺势恢复，但 follow-through 不够
- 本质：
  - 这是**当前周期信号成熟度判断**
  - 它和高周期无关，最多只接受 `higher_follow_through` 作为补充

### 4. 弱趋势中的逆势反转证据不足

- 代码：
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L1923)
- 触发条件：
  - 当前周期是 `weak_trend_bull / weak_trend_bear`
  - 做逆势 stop 反转
  - 缺少 failed breakout / trendline break / trapped side
- 本质：
  - 这也是**当前周期的弱趋势反转证据判断**
  - 不是高周期优先级规则

### 5. H1/L1 仍缺少 follow-through / acceptance

- 代码：
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L2034)
- 本质：
  - 这是**信号成熟度**问题，不是高周期问题
  - 核心思想是：第一信号太早，不清楚时先等确认

### 6. 区间/弱趋势里的 H2/L2 仍缺少失败突破或趋势线破坏证据

- 代码：
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L2098)
- 本质：
  - 这是**当前周期二次信号**的上下文判定
  - 只有在环境已经像交易区间/弱趋势时，才要求更多失败突破或趋势线破坏证据

### 7. 真正属于高周期压制的部分

- 代码：
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L1932)
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L1948)
  - [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L1966)
- 这些规则只在 `5m` 时生效，形式是：
  - `15m 为 TR，5m 中部不追弱突破`
  - `15m 为 TR，5m 反转 stop 单确认不足`
  - `15m 强多/强空趋势中，5m 反转证据不足`
- 结论：
  - **高周期影响是存在的**
  - 但它主要影响的是 `5m`
  - 不是 `15m` / `1h` 低频的首要来源

## 三、回测统计说明问题在哪

下面是这轮旧窗口复测后，最能说明问题的几组数据。

### 1. `BTCUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`55`
- 日均：`1.833`
- 主要路由拦截：
  - `弱趋势中的逆势反转证据不足`: `90`
  - `宽通道逆势单仍需靠近边缘或优势区`: `53`
  - `宽通道中部不做逆势 fade`: `4`

### 2. `ETHUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`61`
- 日均：`2.033`
- 主要路由拦截：
  - `弱趋势中的逆势反转证据不足`: `97`
  - `宽通道逆势单仍需靠近边缘或优势区`: `34`
  - `宽通道中部不做逆势 fade`: `6`

### 3. `BNBUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`60`
- 日均：`2.0`
- 主要路由拦截：
  - `弱趋势中的逆势反转证据不足`: `81`
  - `宽通道逆势单仍需靠近边缘或优势区`: `42`

### 4. `BTCUSDT 5m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`202`
- 日均：`6.733`
- 主要路由拦截：
  - `宽通道逆势单仍需靠近边缘或优势区`: `238`
  - `宽通道顺势恢复缺少 follow-through`: `113`
  - `弱趋势中的逆势反转证据不足`: `49`
- 主要入场成熟度拦截：
  - `H1/L1 仍缺少 follow-through / acceptance`: `73`
  - `H2/L2 前方近端磁体和 trapped side 太近，先等二次确认`: `68`
  - `区间/弱趋势里的 H2/L2 仍缺少失败突破或趋势线破坏证据`: `66`

### 统计结论

- `15m` 上最主要的拦截，不是 `higher_key` 规则
- 而是**当前周期被识别成弱趋势/宽通道后，对反转证据要求太强**
- `5m` 则是**两层一起发生**：
  - 当前周期自己像 TR / 宽通道
  - 更高周期也经常被识别成 TR / 弱趋势

## 四、Brooks 在资料里是怎么说的

下面只保留和当前路由直接相关的部分。

### A. 高周期确实会改变小周期的阅读方式

在 [08 Always In - Who Owns the Market谁总是拥有市场.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/01-10%20基础概念/08%20Always%20In%20-%20Who%20Owns%20the%20Market谁总是拥有市场.md) 里，Brooks 的核心意思是：

- 一个大周期强趋势，放到更小周期上，常常会呈现为很多回调
- 小周期里，这些回调可以被当成交易区间来处理

这说明：

- **高周期影响小周期是对的**
- 但影响的方式不是“高周期一来，小周期就禁止交易”
- 而是“高周期改变了小周期该用趋势手法还是区间手法”

### B. 交易区间的核心不是“全部不做”，而是“边缘反做，中部观望”

在 [13 Trading Ranges and Vacuums交易区和真空区.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/11-20%20形态与结构/13%20Trading%20Ranges%20and%20Vacuums交易区和真空区.md) 里，核心含义很清楚：

- 交易区间是方向不确定
- 80% 的区间突破会失败
- 低买高卖，边缘反做
- 中部是消耗区，不是优势区
- 磁体和边缘会加速，但加速常常是陷阱前奏

这正对应了我们代码里的：

- `宽通道中部不做逆势 fade`
- `宽通道逆势单仍需靠近边缘或优势区`
- `目标路径在磁体簇受阻`

所以这三类判断本身**符合 Brooks 方向**。

### C. 弱趋势或通道里做逆势，必须有“压力 + 强信号”

在 [09 Setups And Signal Bars规则和信号K线.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/01-10%20基础概念/09%20Setups%20And%20Signal%20Bars规则和信号K线.md) 的相关段落里，Brooks 的要求不是“看到漂亮反转棒就做”，而是：

- 弱趋势里逆势交易要有足够买卖压力
- 要有强信号棒
- 如果环境不清楚，经常要等第二个信号

这对应代码里的：

- `弱趋势中的逆势反转证据不足`
- `H1/L1 仍缺少 follow-through / acceptance`
- `区间/弱趋势里的 H2/L2 仍缺少失败突破或趋势线破坏证据`

所以这类判断的出发点也**符合 Brooks**。

### D. follow-through 是核心，不只是加分项

在 [15B Need follow-through; Trends always try to reve 22699d8757ab81b39d83ebe0c1ecd251.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/15B%20Need%20follow-through;%20Trends%20always%20try%20to%20reve%2022699d8757ab81b39d83ebe0c1ecd251.md) 和 PPT 基础篇里，Brooks 的意思很明确：

- 强信号后需要 follow-through
- 弱突破 + 差的 follow-through，更像失败突破或交易区间内的一腿

这正是代码里：

- `宽通道顺势恢复缺少 follow-through`

## 五、本轮按 Brooks 做的修正

这轮只改了 4 类“方向没错、但写得过死”的规则。

### 1. `H1/L1` 不再被近似写成“没有二次确认就不能做”

依据：

- [09 Setups And Signal Bars规则和信号K线.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/01-10%20基础概念/09%20Setups%20And%20Signal%20Bars规则和信号K线.md)
- [10 Pullbacks and Bar Counting回调与K线计数.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/01-10%20基础概念/10%20Pullbacks%20and%20Bar%20Counting回调与K线计数.md)
- [1.《价格行为学》（基础篇1-36章）.pdf](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf)

Brooks 的原意是：

- 第一信号通常不如第二信号稳
- 但在趋势恢复、优势区、强信号棒环境里，第一信号仍然可以执行

所以当前实现改成了：

- `H1/L1` 仍然偏好 `follow-through / acceptance`
- 但只要已经在优势区、前一腿仍是趋势腿、信号棒够强、目标路径清晰，就不再被机械地挡回去

### 2. `H2/L2` 不再几乎强制要求 `failed breakout / trendline break`

依据：

- [10 Pullbacks and Bar Counting回调与K线计数.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/01-10%20基础概念/10%20Pullbacks%20and%20Bar%20Counting回调与K线计数.md)
- [1.《价格行为学》（基础篇1-36章）.pdf](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf)

Brooks 对 `H2/L2` 的重点是：

- 第二次测试更可靠
- 交易员在第一次错过后，第二次更愿意入场
- 它可以是趋势恢复，也可以在区间/宽通道里充当边缘反做的执行信号

所以现在改成：

- `failed breakout / trendline break` 仍然是加分证据
- 但只要 `H2/L2` 本身已经在优势区、前腿结构正确、信号棒够强，就允许通过

### 3. `看衰突破` 不再要求“失败突破证据全满”

依据：

- [15A What is a BO 80% rule Most breakouts fail; Rev 22699d8757ab815597bdf81b4cb585f8.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/15A%20What%20is%20a%20BO%2080%25%20rule%20Most%20breakouts%20fail;%20Rev%2022699d8757ab815597bdf81b4cb585f8.md)
- [15B Need follow-through; Trends always try to reve 22699d8757ab81b39d83ebe0c1ecd251.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/15B%20Need%20follow-through;%20Trends%20always%20try%20to%20reve%2022699d8757ab81b39d83ebe0c1ecd251.md)
- [2.《价格行为学》（进阶篇37-52章）.pdf](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf)

Brooks 的失败突破逻辑是：

- 区间里的大多数突破都会失败
- 关键是突破后没有好的 `follow-through`
- 价格重新回到区间内，出现拒绝 / 受困一侧，就可以考虑反做

因此实现从原来的：

- 必须同时满足 `failed_breakout_evidence + trapped_side + reclaimed_prior_close + broke_micro_extreme`

改成了：

- 只要已经完成“失败突破回区间”这个主前提
- 再加上拒绝尾巴、受困一侧或趋势线破坏中的任意一类确认
- 就允许进入执行链

### 4. 宽通道反转不再把“优势区”写得接近“必须贴边”

依据：

- [11 Channels通道.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/11-20%20形态与结构/11%20Channels通道.md)
- [22 Head and Shoulders头肩形.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/21-30%20高级策略/22%20Head%20and%20Shoulders头肩形.md)
- [2.《价格行为学》（进阶篇37-52章）.pdf](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf)

Brooks 的原意是：

- 宽通道本质更像交易区间
- 反做要优先在上三分之一 / 下三分之一
- 头肩、双顶双底、楔形大多数仍只是更大区间的一部分

所以这轮没有删除“中部不做”的原则，但放松了两点：

- `advantage zone` 也视为可交易边缘，不再近似要求必须贴极值
- 宽通道前方磁体只有在“结构性磁体且距离很近”时才继续硬阻挡

## 六、本轮多窗口复测

数据统一来自 [data/history/hf_parquet](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/data/history/hf_parquet)。

### 1. `BTCUSDT 5m`，`2022-01-24 ~ 2022-02-23`

- `293` 笔
- `9.767` 笔/天
- 胜率 `21.16%`
- PF `0.33`

仍然压频率的主因：

- `宽通道顺势恢复缺少 follow-through`
- `深回调后的趋势延续质量不足`
- `H1/L1 仍缺少 follow-through / acceptance`
- `H2/L2 前方近端磁体和 trapped side 太近，先等二次确认`

结论：

- `5m` 已经不是“识别不到”
- 主要是顺势恢复链 `高1/低1/高2/低2` 仍然被宽通道 / 深回调环境大量拦掉

### 2. `BTCUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- `59` 笔
- `1.967` 笔/天
- 胜率 `32.20%`
- PF `0.66`

当前主因：

- `弱趋势中的逆势反转证据不足`
- `宽通道逆势单仍需靠近边缘或优势区`
- `看衰突破还没完成回到区间内的失败突破`

结论：

- 15m 的频率已经接近 Brooks 常见的“每天 1-2 笔”
- 当前继续压频率的主因已经收敛到“失败突破反做”和“宽通道逆势反转”两条

### 3. `ETHUSDT / BNBUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- `ETHUSDT 15m`: `61` 笔，`2.033` 笔/天，PF `0.63`
- `BNBUSDT 15m`: `58` 笔，`1.933` 笔/天，PF `0.91`

共同主因：

- `弱趋势中的逆势反转证据不足`
- `宽通道逆势单仍需靠近边缘或优势区`
- `看衰突破还没完成回到区间内的失败突破`
- `prior_level` 结构磁体阻挡

### 4. `BTCUSDT 15m`，`2023-07-10 ~ 2023-08-09`

- `70` 笔
- `2.333` 笔/天
- 胜率 `24.29%`
- PF `0.48`

这说明：

- 频率在另一个年份窗口也被抬起来了
- 但质量还不稳定，主要问题集中在宽通道逆势链，而不是趋势恢复链

### 5. `BTCUSDT 1h`，`2022-01-24 ~ 2022-02-23`

- `3` 笔
- `0.100` 笔/天
- 胜率 `66.67%`
- PF `1.37`

当前主因：

- `宽通道反转更像 second-leg trap，先等失败突破或趋势线破坏`

结论：

- `1h` 仍然偏严
- 当前不是检测器缺失，而是 `second-leg trap` 这条守门仍然太保守

## 七、这轮之后剩下的主要问题

### 1. `5m` 的频率问题已经集中到顺势恢复链

最值得继续审的是：

- `高1 / 低1`
- `高2 / 低2`

现在它们最常被挡住的，不再是工程阈值，而是：

- `宽通道顺势恢复缺少 follow-through`
- `深回调后的趋势延续质量不足`
- `H1/L1 仍缺少 follow-through / acceptance`

### 2. `15m` 的主矛盾已经转到失败突破反做链

目前真正拦得最多的是：

- `看衰突破`
- `第二腿陷阱`
- `头肩 / 双顶双底 / 楔形` 在宽通道里的 second-leg 背景

### 3. 高周期对小周期仍有影响，但已经不是“压死一切”的主因

当前 `5m` 仍会受到 `15m` 交易区间背景限制，但从复测看：

- `15m` / `1h` 自己的低频，并不是更高周期造成的
- 它们主要还是被自己当前周期的宽通道 / 弱趋势反转逻辑挡住
- `弱趋势里缺少 follow-through 不追突破`
- `H1/L1 仍缺少 follow-through / acceptance`

的理论来源。

### E. 第二信号 / 失败突破 / 趋势线破坏，是区间反转的重要确认

在 [09 Setups And Signal Bars规则和信号K线.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/01-10%20基础概念/09%20Setups%20And%20Signal%20Bars规则和信号K线.md) 和 [Video 15H Breakouts突破.pdf](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories%20分类/Al%20brooks/《价格行为PPT中文笔记》/Video%2015H%20Breakouts突破.pdf) 里，Brooks 的实战做法非常接近：

- 如果在 TR 里看不清，就等第二个信号
- 大突破如果没有远离 TR，反而更可能是 second-leg trap
- 弱突破如果后续不好，更像回到 TR，而不是进入新趋势
- 强势一方恢复后，往往还需要新的趋势线破坏，才说明真正反转

这对应代码里的：

- `第一次信号尚未完成接受，继续等 H2/L2 或二次确认`
- `第二腿陷阱仍缺少 failed breakout / trapped trader 证据`
- `宽通道反转更像 second-leg trap，先等失败突破或趋势线破坏`
- `区间/弱趋势里的 H2/L2 仍缺少失败突破或趋势线破坏证据`

## 五、当前真正要怀疑的，不是“方向错了”，而是“写得太死了”

结合代码和 Brooks 资料，当前更合理的判断是：

### 应保留的方向

- 交易区间中部少做或不做
- 区间边缘反做优先
- 弱趋势里逆势单要有压力和强信号
- 弱突破需要 follow-through
- 环境不清楚时等待第二信号
- failed breakout / trendline break / trapped side 是重要确认

### 最可能写得过死的地方

1. **把“常见确认”写成了“几乎必要条件”**
   - 例如弱趋势反转里，对 failed breakout / trendline break / trapped side 的依赖偏重
2. **`tradeable_edge` 的定义可能过窄**
   - Brooks 讲的是“上三分之一 / 下三分之一 / 靠近边缘”
   - 如果代码边缘带过窄，会把很多本来合理的区间边缘 setup 拦掉
3. **`H1/L1 -> 必须 follow-through` 与 `H2/L2 -> 必须更多证据` 的组合过严**
   - Brooks 确实偏爱第二信号
   - 但不是每次都要叠加多个确认后才允许
4. **磁体阻挡判断可能偏保守**
   - Brooks 强调磁体会吸引价格
   - 但并不等于所有近磁体都不能做，关键是做的是 scalp 还是 swing，做的是边缘反做还是中部追单

## 六、下一步建议

如果继续按 Brooks 体系往下收，优先顺序应该是：

1. 先审 `tradeable_edge` / `range_zone` 的边缘定义是否过窄
2. 再审弱趋势反转里 `failed_breakout / trendline_break / trapped side` 的组合是否要求过满
3. 最后再审 `H1/L1` 和 `H2/L2` 的确认门槛是否把“偏好第二信号”写成了“强制第二信号”

不建议直接删掉这些规则本身，因为它们大方向是符合 Brooks 的。
真正该改的，是**这些 Brooks 规则在代码里被量化得过于保守的部分**。

## 六、本轮按 Brooks 放松后的结果

这轮已经按 Brooks 原意，收松了 4 类过严限制：

1. `tradeable_edge / range_zone`
   - 不再近似要求“必须贴边”
   - 允许“优势区 + 强信号棒”通过
2. 弱趋势逆势反转
   - 不再几乎要求 `failed_breakout / trendline_break / trapped_side` 三选一
   - 允许“强信号棒 + 优势区 / second-leg 背景”通过
3. `H1/L1` 与 `H2/L2`
   - 不再把“偏好第二信号”写成“近乎强制第二信号”
4. 磁体阻挡
   - `round_number / session_open / tr_midline / ema20` 不再默认等同结构性 blocker
   - 回测里已经改成优先识别 `measured_move / prior_level / major_swing / gap`

对应代码在：

- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [target_magnets.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/utils/target_magnets.py)

### 多时间段结果

#### 1. `BTCUSDT 5m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`240`
- 日均：`8.0`
- 胜率：`19.17%`
- PF：`0.28`
- 主要剩余路由拦截：
  - `宽通道顺势恢复缺少 follow-through`: `145`
  - `宽通道逆势单仍需靠近边缘或优势区`: `101`
  - `宽通道中部顺势恢复仍缺少接受`: `37`
- 主要剩余入场拦截：
  - `H2/L2 前方近端磁体和 trapped side 太近，先等二次确认`: `68`
  - `H1/L1 仍缺少 follow-through / acceptance`: `66`
  - `区间/弱趋势里的 H2/L2 仍缺少失败突破或趋势线破坏证据`: `64`

#### 2. `BTCUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`50`
- 日均：`1.667`
- 胜率：`28.0%`
- PF：`0.50`
- 主要剩余路由拦截：
  - `弱趋势中的逆势反转证据不足`: `23`
  - `宽通道逆势单仍需靠近边缘或优势区`: `15`
  - `宽通道中部不做逆势 fade`: `4`
- 主要剩余入场拦截：
  - `看衰突破仍缺少真正的 failed breakout / trapped side 证据`: `36`
  - `宽通道反转前方磁体过近，先等 failed breakout 或更清晰路径`: `20`
  - `头肩底 MTR 所在的上下级结构仍在弱空，先等 failed breakout 证据`: `12`

#### 3. `BTCUSDT 1h`，`2022-01-24 ~ 2022-02-23`

- 交易数：`3`
- 日均：`0.1`
- 胜率：`66.67%`
- PF：`1.37`
- 主要剩余拦截仍是宽通道反转路径与 second-leg 证据不足

#### 4. `ETHUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`54`
- 日均：`1.8`
- 胜率：`31.48%`
- PF：`0.63`
- 主要剩余路由拦截：
  - `弱趋势中的逆势反转证据不足`: `30`
  - `宽通道逆势单仍需靠近边缘或优势区`: `9`
- 主要剩余入场拦截：
  - `宽通道反转前方磁体过近，先等 failed breakout 或更清晰路径`: `32`
  - `看衰突破仍缺少真正的 failed breakout / trapped side 证据`: `31`
  - `目标路径在结构磁体受阻 (prior_level)`: `29`

#### 5. `BNBUSDT 15m`，`2022-01-24 ~ 2022-02-23`

- 交易数：`50`
- 日均：`1.667`
- 胜率：`40.0%`
- PF：`0.91`
- 主要剩余路由拦截：
  - `弱趋势中的逆势反转证据不足`: `27`
  - `宽通道逆势单仍需靠近边缘或优势区`: `12`
- 主要剩余入场拦截：
  - `宽通道反转前方磁体过近，先等 failed breakout 或更清晰路径`: `24`
  - `看衰突破仍缺少真正的 failed breakout / trapped side 证据`: `23`
  - `宽通道反转更像 second-leg trap，先等失败突破或趋势线破坏`: `16`

#### 6. `BTCUSDT 15m`，`2023-07-10 ~ 2023-08-09`

- 交易数：`64`
- 日均：`2.133`
- 胜率：`26.56%`
- PF：`0.53`
- 主要剩余路由拦截：
  - `宽通道逆势单仍需靠近边缘或优势区`: `74`
  - `宽通道中部不做逆势 fade`: `20`
- 主要剩余入场拦截：
  - `看衰突破仍缺少真正的 failed breakout / trapped side 证据`: `16`
  - `头肩底 MTR 所在的上下级结构仍在弱空，先等 failed breakout 证据`: `14`

### 结果解读

- `5m` 的频率已经抬起来了，问题不再是“检测不到”，而是 `T2/T3/T6` 这类顺势恢复链质量差。
- `15m` 的频率已经稳定在 `1.6 ~ 2.1` 笔/天附近，不再是“长期每天不到一笔”。
- `1h` 仍然明显过严，主要不是大周期压制，而是当前 `1h` 自己的反转路径和磁体路径要求还太保守。

## 七、按策略看，哪些机会还在被挡

下面是当前跨窗口累计后，拦截最多的策略。

### 路由拦截最重

1. `高1`
   - 主因：`宽通道顺势恢复缺少 follow-through`
2. `低1`
   - 主因：`宽通道顺势恢复缺少 follow-through`
3. `看衰突破`
   - 主因：`弱趋势中的逆势反转证据不足`
4. `头肩底MTR / 双重顶 / 头肩顶MTR / 双重底 / 第二腿陷阱`
   - 主因基本都集中在：
   - `宽通道逆势单仍需靠近边缘或优势区`
   - `宽通道中部不做逆势 fade`
   - `弱趋势中的逆势反转证据不足`

### 入场拦截最重

1. `看衰突破`
   - 主因：`failed breakout / trapped side` 证据仍不足
2. `高2 / 低2`
   - 主因：`H2/L2` 的失败突破证据和近端结构磁体
3. `头肩底MTR / 头肩顶MTR / 楔形底 / 双重底`
   - 主因：宽通道反转前方磁体过近，以及 second-leg trap 背景
4. `高1 / 低1`
   - 主因：首个顺势恢复信号仍缺少 follow-through

### 现在最清楚的结论

如果继续按 Brooks 体系优化，下一步不该再去动“分数”或其他工程阈值，而该只看这 3 组：

1. `T2/T3/T6` 顺势恢复链
   - 重点审 `高1 / 低1 / 高2 / 低2 / 20均线缺口 / 第一均线缺口`
   - 看当前的 `follow-through / acceptance` 是否仍然写得比教材更窄
2. `R1/R2/TR1/TR2/TR3` 反转链
   - 重点审 `双重顶底 / 楔形 / 头肩 / 第二腿陷阱`
   - 看“优势区 + 强信号棒 + 二腿背景”是否仍被挡得过多
3. `看衰突破`
   - 这条链现在最像“仍然过严”的专属 detector
   - 它的大部分拦截来自证据组合要求过满，而不是频率真的该这么低

## 八、跨时间范围复验

这轮不是只看单个窗口，而是复验了三个不同年份窗口：

- `W1_2022`: `2022-01-24 ~ 2022-02-23`
- `W2_2023`: `2023-07-10 ~ 2023-08-09`
- `W3_2025`: `2025-11-01 ~ 2025-11-30`

对应审计文件：

- `/tmp/brooks_frequency_audit_20260313.json`
- `/tmp/btc_brooks_after_compare_20260313.json`

### 1. 周期不是根因，结构路由才是根因

这三段结果共同说明：

- `5m`、`15m` 的机会数已经恢复，不再是“几乎没信号”
- `1h` 仍偏少，但也已经不再是“完全没有机会”
- 真正压住频率的，不是单纯的时间周期本身
- 主要仍是：
  - `宽通道顺势恢复缺少 follow-through`
  - `弱趋势中的逆势反转证据不足`
  - `宽通道逆势单仍需靠近边缘或优势区`
  - `目标路径在结构磁体受阻`

也就是说，Brooks 的问题不在于“5m 可以，15m/1h 不行”，而在于：

1. 当前周期自身被判成了 `TR / 宽通道 / 弱趋势`
2. 我们对这些结构的放行边界仍然写得偏保守
3. 更高一级周期只是背景约束，不是主因

### 2. 当前频率已经回到可审范围

代表性结果：

- `BTCUSDT 2022 5m`
  - `334` 笔
  - `11.133` 笔/天
- `BTCUSDT 2022 15m`
  - `91` 笔
  - `3.033` 笔/天
- `BTCUSDT 2022 1h`
  - `8` 笔
  - `0.267` 笔/天
- `BTCUSDT 2023 15m`
  - `105` 笔
  - `3.5` 笔/天
- `BTCUSDT 2025 15m`
  - `101` 笔
  - `3.367` 笔/天
- `W3_2025 15m` 多品种聚合
  - `BTC=101`
  - `ETH=85`
  - `BNB=103`
  - `SOL` 当轮未纳入 `15m` 精细审计，但 `5m/1h` 已验证正常出单

结论：

- `5m` 与 `15m` 现在的问题已经从“机会识别不足”转成“哪些机会该放、哪些该继续挡”
- `1h` 仍需要继续审 `second-leg trap / 宽通道反转 / prior_level 磁体`

## 九、零机会与低机会策略复验

这轮专门复验了之前最像“没有机会”的策略：

- `HOY突破`
- `LOY突破`
- `iii突破`
- `末端旗形`

对应审计文件：

- `/tmp/brooks_zero_strategy_recheck_20260313.json`

### 1. 已从“完全零机会”修复出来的

- `末端旗形`
  - `W1_2022 15m`: `generated=92 / passed=63 / trades=17`
  - `W3_2025 5m`: `generated=273 / passed=214 / trades=104`
  - `W3_2025 1h`: `generated=66 / passed=51 / trades=10`

说明：

- 之前它不是“本来稀有”，而是 detector 本身有 bug
- 当前已经恢复成正常能生成、能通过、能成交的策略

### 2. 已开始生成，但主要卡在入场层的

- `HOY突破`
  - `W1_2022 15m`: `generated=6 / passed=0 / entry_blocked=6`
  - `W3_2025 5m`: `generated=3 / passed=0 / route_blocked=1 / entry_blocked=2`
- `LOY突破`
  - `W3_2025 5m`: `generated=2 / passed=0 / entry_blocked=2`

说明：

- `HOY/LOY` 已经不是 detector 缺失问题
- 当前主因转成：
  - `目标路径在结构磁体受阻 (prior_level)`
  - 少量会被 `弱趋势里缺少 follow-through 不追突破` 挡住

这更像是：

- 当前实现把 `昨日高低点` 当成了“直接突破追随”
- 但 Brooks 里它更常见的价值，是把昨日高低点当关键 S/R 与失败突破锚点

因此下一轮如果继续审，重点不该再去改“有没有生成”，而是：

1. `HOY/LOY` 是否应该拆成“直接突破追随”和“昨日高低点失败突破反转”两条
2. `prior_level` 对这类 breakout setup 的阻挡是否写得过严

### 3. 仍然稀少，但已确认不是“永远出不来”的

- `iii突破`
  - `W1_2022 15m`: `generated=2 / passed=0 / entry_blocked=2`
  - `W3_2025 5m`: `generated=0`

结论：

- `iii突破` 之前确实有 detector 顺序 bug，已经修掉
- 现在它变成“稀少但存在”的状态，而不是“逻辑上永远被 ii 吃掉”
- 下一步需要确认的是：
  - 这是否就是 Brooks 里 `iii` 本来应有的稀有度
  - 还是我们把 `inside breakout` 的上下文条件写得仍然偏窄

## 十、当前最值得继续审的 3 条链

如果下一轮继续按 Brooks 原体系推进，最值的仍然是：

1. `高1 / 低1 / 高2 / 低2`
   - 重点看 `follow-through / acceptance / second-leg` 的边界
   - 不再引入任何工程分数门槛
2. `看衰突破 / 第二腿陷阱`
   - 重点看 detector 的证据拆分是否仍然过满
   - 特别是 `failed breakout`、`reclaimed prior close`、`trapped side`
3. `HOY / LOY / iii`
   - 现在不再是“完全不生成”
   - 但仍需要确认：
     - 是策略本来稀有
     - 还是 `prior_level / breakout follow-through` 放行边界还太死

## 十一、系统层总聚合后的真实缺口

这轮新增的策略机会审计文件：

- `/tmp/strategy_opportunity_2022_15m.json`
- `/tmp/strategy_opportunity_2023_15m.json`
- `/tmp/strategy_opportunity_2025_5m.json`
- `/tmp/strategy_opportunity_2025_1h.json`

把这四组窗口合并后，可以把“局部周期看起来是 0”与“系统层真的没机会”区分开。

### 1. 不该误判成缺失的

以下这些策略在系统层其实已经大量生成、放行并成交，不是缺策略：

- `高1`
  - `generated=805`
  - `passed=53`
  - `trades=31`
- `低1`
  - `generated=872`
  - `passed=54`
  - `trades=25`
- `高2`
  - `generated=1307`
  - `passed=279`
  - `trades=142`
- `低2`
  - `generated=1539`
  - `passed=283`
  - `trades=155`

说明：

- 它们在 `15m` 或 `1h` 某些窗口里会显示为 `0`
- 但那是“某个窗口/某个周期里没出现”，不是系统层没有 detector

### 2. 系统层仍然没有成交的

以下这些才是当前真正需要继续审的：

1. `HOY突破`
   - `generated=9`
   - `passed=0`
   - `trades=0`
   - 主因：
     - `目标路径在结构磁体受阻 (prior_level)`: `8`
     - `弱趋势里缺少 follow-through 不追突破`: `1`
2. `LOY突破`
   - `generated=2`
   - `passed=0`
   - `trades=0`
   - 主因：
     - `目标路径在结构磁体受阻 (prior_level)`: `2`
3. `iii突破`
   - `generated=2`
   - `passed=0`
   - `trades=0`
   - 主因：
     - `目标路径在结构磁体受阻 (prior_level)`: `2`
4. `ioi突破`
   - `generated=4`
   - `passed=0`
   - `trades=0`
   - 主因：
     - `宽通道逆势单仍需靠近边缘或优势区`: `2`
     - `宽通道顺势恢复缺少 follow-through`: `1`
5. `收线追进`
   - `generated=26`
   - `passed=0`
   - `trades=0`
   - 主因：
     - `目标路径在结构磁体受阻 (prior_level)`: `20`
     - `更高一级周期为 TR，当前周期已逼近对侧边缘`: `6`
6. `突破回调`
   - `generated=14`
   - `passed=0`
   - `trades=0`
   - 主因：
     - `目标路径在结构磁体受阻 (prior_level)`: `10`
     - `深回调后的趋势延续质量不足`: `3`
7. `第一均线缺口`
   - `generated=81`
   - `passed=7`
   - `trades=0`
   - 主因：
     - `目标路径在结构磁体受阻 (prior_level)`: `62`
     - `深回调后的趋势延续质量不足`: `10`

### 3. 当前最明确的系统级结论

这轮做完以后，系统层还没有成交的，基本已经收敛成两类问题：

1. `prior_level` 结构磁体对 breakout 家族过重
   - 主要影响：
     - `HOY/LOY`
     - `iii`
     - `收线追进`
     - `突破回调`
     - `第一均线缺口`
2. `follow-through / 宽通道恢复` 对 inside / continuation 家族仍偏严
   - 主要影响：
     - `ioi`
     - 部分 `高1/低1/高2/低2`

所以后续最值的不是再去抬总频率，而是：

- 单独重审 `prior_level` 对 breakout setup 的阻挡边界
- 单独重审 `ioi / iii / 收线追进 / 突破回调` 的上下文放行
