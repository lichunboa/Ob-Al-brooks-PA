# Brooks PDF 截图证据

> 更新于 2026-03-13
> 目的：把当前主链里最关键的 Brooks 路由依据，直接落到 PDF 页图，减少只靠 OCR 文字带来的偏差。

## 1. `H2/L2` 是趋势中的标准第二次入场

来源：

- `《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- 页码：`12`

结论：

- 在多头趋势中，Brooks 明确写的是 `look for High 2 (H2) pullback`
- 入场方式是 `Buy on stop above high of signal bar`
- 这说明 `H2` 本身就是趋势恢复的标准执行信号，不该被额外工程门槛反复压制

![H2 标准页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_h2-0012.png)

## 2. 失败突破可以直接转成 `H2` 看涨旗形

来源：

- `《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- 页码：`471`

结论：

- 图上直接写了 `Failed bear BO below TTR`
- 同一页同时写了 `High 2 Bull Flag`
- 这支持我们把“失败突破”与 `H2` 恢复看成同一条 Brooks 逻辑链，而不是必须把证据堆满到僵硬

![失败突破与 H2 旗形](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_failed_bo-0471.png)

## 3. 第二个信号是偏好，不是所有情形下的机械强制

来源：

- `《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- 页码：`493`
- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`855`

结论：

- Brooks 说的是：当市场环境和信号较弱、不自信时，等 `2nd signal or strong reversal`
- `47C` 进一步强调：在 `TR` 边缘、前一腿很强时，等待 `2nd entry` 往往比第一次 reversal 更稳妥
- 这意味着“第二个信号”是弱环境下的更优选择
- 但如果本来就是强信号、强反转、优势区环境，就不该被实现层写成统一的硬性否决

![第二个信号页 1](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_second_signal-0493.png)

![第二个信号页 2](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_second_signal-0855.png)

## 4. 通道里仍然可以做 `H2` / `L2`，关键是上下文

来源：

- `阿布10种最佳价格行为交易模式.pdf`
- 页码：`4`
- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`56`

结论：

- 图里明确写了 `High 2 bull flags and Low 2 bear flags`
- 同时强调：趋势、通道、区间会让 `H2/L2` 上下文变得复杂
- 所以正确做法是保留结构判断，而不是用工程阈值把 `H2/L2` 近似写成“区间里一律不做”

![十大模式中的 H2/L2](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/top10_tr-04.png)

![进阶篇 H2 看涨旗形](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_h2_bullflag-0056.png)

## 5. 头肩 / 楔形 / 更低高位常常只是更大区间的一部分

来源：

- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`66`
- `阿布10种最佳价格行为交易模式.pdf`
- 页码：`10`

结论：

- Brooks 在图上直接写了：
  - `After Wedge Top, bulls try for trend resumption`
  - `Often get strong rally to LH MTR`
  - `Nested HST`
- 这说明：
  - 头肩、楔形、双顶双底并不天然就是立即大反转
  - 它们经常会先发展成更低高位 / 更高低位，或者更大的交易区间
- 因此我们保留了 `second-leg trap`、`failed breakout`、`trendline break` 这类守门，而不是彻底删空

![楔形后 LH MTR / 嵌套头肩](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_hs_top-0066.png)

![十大模式中的楔形/磁体](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/top10_wedge-10.png)

## 6. 对当前代码的直接影响

这轮截图核对后，当前实现边界可以归纳成这样：

- 可以继续放松的：
  - `H1/L1` 在优势区、强信号棒、目标路径清晰时，不应再被机械挡住
  - `H2/L2` 在趋势恢复或区间边缘时，不应被近似强制要求“失败突破 + 趋势线破坏”双证据
  - `看衰突破` 不应把失败突破证据写成必须全项满足
- 应继续保留的：
  - `宽通道 / 交易区间中部不做`
  - `头肩 / 楔形 / 双顶双底` 在宽通道里要防止把 first reversal 误当成大反转
  - 结构性磁体与 `second-leg trap` 仍然要作为守门

## 7. `prior_level` 不是一律的 blocker，更常常先是第一目标

来源：

- `《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- 页码：`346`、`1523`、`1572`、`1732`

结论：

- Brooks 对前高前低、阻力支撑的处理，不是“看到 prior high / prior low 就一律不做”
- `43B` 里他直接把两种处理拆开了：
  - `BO: Buy prior high (close)`
  - `Channel: Take profit at prior high, Buy PB`
- 更准确的顺序是：
  - 弱 breakout / pullback continuation，先把前高前低当第一测试目标
  - 真正强 breakout，单个次级阻力常常会失败
  - 但如果前方不是单个前高，而是多个 prior level 叠成的结构簇，它仍然应该保留成阻挡

![单个次级阻力常常会失败](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_minor_resistance_fail-0346.png)

![没有强突破和跟进时，前高仍是阻力](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_no_strong_bo_prior_high-1523.png)

![市场经常需要先走到阻力位才会遇到卖压](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_get_to_resistance-1572.png)

![阻力常常是测试位和止盈位，不等于每次都要事前否决](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_take_profit_resistance-1732.png)

## 8. 当前最值得继续审的点

从这轮截图和多窗口回测一起看，下一轮最该收的仍然是：

- `高1 / 低1` 在宽通道中的 `follow-through / acceptance`
- `高2 / 低2` 在深回调趋势恢复场景里的放行边界
- `看衰突破` 与 `第二腿陷阱` 的 detector 证据拆分

这些点已经有截图依据，不需要再回到“靠经验加减分数”的做法。

## 9. 一旦进入通道，就按通道交易，不要把所有回调都当成突破

来源：

- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`290`

结论：

- Brooks 在页图里直接写了 `If now channel, trade like channel`
- 这意味着一旦市场已经进入通道阶段，顺势恢复单不能再被当成“必须强 follow-through 的 breakout”
- 更合理的做法是：
  - 保留 `follow-through` 作为优势证据
  - 但允许 `acceptance / 好信号棒 / 已回到有利半区` 的顺势恢复继续存在

![进入通道就按通道交易](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_trade_like_channel-0290.png)

## 10. 宽通道和紧密通道要区别对待

来源：

- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`409`、`494`

结论：

- Brooks 明确写了：
  - `When channel is broad, can make money buying or selling`
  - `When bull channel is tight like this one, very difficult to make money shorting`
  - `When bear channel is tight like this one, very difficult to make money buying`
- 这正好支持当前主链的边界：
  - 紧密通道里仍然要严控逆势 first reversal
  - 但宽通道里，`高1/低1/高2/低2` 与反转结构都不该被写成一律“必须等非常强 follow-through”

![紧密多头通道与宽通道的区别](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_bull_channel_tight-0409.png)

![紧密空头通道与宽通道的区别](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_bear_channel_tight-0494.png)

## 11. `second-leg trap` 要保留，但不能把所有宽通道反转都压成它

来源：

- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`605`

结论：

- Brooks 在宽幅多头通道案例里直接标了 `Bear channel 2nd Leg Trap in TR`
- 这说明 `second-leg trap` 确实是宽通道/交易区间里必须保留的守门
- 但同页也显示：
  - 宽通道内部会频繁切换成 `tight channel / TR / small PB trend`
  - 所以不能只要看到 `tr_second_leg` 就把 `楔形 / 头肩 / 双顶双底 / 第二次入场` 一律否决
- 更符合 Brooks 的写法是：
  - 保留 `second-leg trap`
  - 但当已经出现 `stairs / exhaustion / 优势区强信号棒 / acceptance` 时，允许通道恢复和部分反转继续进入下一层检查

![宽通道里的 second-leg trap 只是其中一种结果](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_second_leg_trap-0605.png)

## 12. 管理比寻找完美 setup 更重要

来源：

- `《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- 页码：`337`

结论：

- Brooks 在页图里直接写了 `Managing trades well, is more important than spotting perfect setups`
- 同页还明确给出了：
  - 第一次做多保本离场
  - 第二次做多才盈利
  - 强 BO / TR BO 都可以通过管理实现不同结果
- 这支持我们把下一阶段重点放在 `premise / partial close / move stop / re-entry` 的整条管理链，而不是继续把所有问题都归咎到信号端

![管理比交易选择更重要](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_management_key-0337-0337.png)

## 13. MTR 家族默认就该计划部分止盈

来源：

- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`65`

结论：

- Brooks 在页图里直接写了：
  - `Since probability for most MTRs is only 40%`
  - `Always ok to take partial or full profits at 2x Actual Risk`
- 这说明：
  - `双重顶底 / 楔形 / 头肩 MTR` 这类反转家族，本来就不应该假设“全都拿大波段”
  - 在 `2x actual risk` 附近做部分止盈，是 Brooks 允许且常见的默认计划

![MTR 家族的 2R 部分止盈](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_take_profit_risk2-0065-0065.png)

## 14. 保本止损不是无限次给市场重测

来源：

- `《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`
- 页码：`71`

结论：

- Brooks 在页图里直接写了 `Breakeven Stop: Do Not Let It Get Hit Twice`
- 同页给的是 `Sell HH MTR` 场景，说明：
  - 反转家族即便采用 breakeven 保护，也不是无限次容忍回测
  - 一旦第一次测试已经走出新低/新高，第二次回测入场价时，保护性离场就是合理动作
- 这对我们下一阶段重审 `premise failure` 与 `trailing / breakeven` 的边界非常关键

![保本止损不要被打两次](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_breakeven_twice-0071-0071.png)

## 15. 价格行为对所有市场、所有时间周期都成立

来源：

- `《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- 页码：`100`

结论：

- Brooks 在页图里直接写了 `All Markets and Timeframes: All Have Same Price Action`
- 同页还直接给出 Daily / 5min / 1min 三张图对照
- 这支持我们把时间周期当作：
  - 背景层级
  - 质量验证
  - 持仓时长换算
- 但不应把时间周期写成“这个 setup 只属于某个固定周期”的策略本体

![所有市场和时间周期都有相同价格行为](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_timeframe_same-0100.png)

## 16. `ii / ioi / iii` 本质上都是 breakout-mode 的 inside 组合

来源：

- `《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- 页码：`458`、`459`、`470`

结论：

- Brooks 在相邻页里分别单独列出：
  - `ii: consecutive inside bars`
  - `ioi: inside bar after an outside bar`
  - `iii: 3 consecutive inside bars`
- 这说明它们是同一 breakout-mode 语义下的不同外观，不应继续拆成多套互相冲突的管理模板
- 更符合 Brooks 的做法是：
  - 统一归到 `突破追随族`
  - 让差异主要体现在触发外观和背景质量，而不是把管理逻辑拆开

![ii inside 组合](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_inside_breakout-0458.png)

![ioi inside 组合](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_inside_breakout-0459.png)

![iii inside 组合](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_inside_breakout_iii-0470.png)
