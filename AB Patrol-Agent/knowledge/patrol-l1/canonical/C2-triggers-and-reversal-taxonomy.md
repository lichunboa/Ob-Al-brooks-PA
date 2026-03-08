# C2 Triggers and Reversal Taxonomy

> 来源锚点：
> - `08A-08D`
> - `09A-09C`
> - `21A-21D`
> - `22A/22D`
> - `24A-24E`
> - `25A/25B`
> - `39A/39B`
> - `45D/45E`

## 触发类型

系统必须区分：

- `H1 / H2 / H3 / H4`
- `L1 / L2 / L3 / L4`
- `DB / DT`
- `wedge`
- `MTR`
- `trap / failed breakout / second-leg trap`
- `first entry / second entry`
- `first pullback`

## 解释原则

- `H1/H2/L1/L2` 只是**触发**，不是 context
- `DB/DT` 需要结合位置、市场状态、压力、follow-through
- 根据 `25A/25B`，`DT/DB` 到处都有，既可以是旗形也可以是反转；关键不在“形状完不完美”，而在它是不是一次真实的 test，以及 test 之后有没有接受或失败。
- `wedge` 要区分：
  - 好楔形
  - 强趋势中的坏楔形
  - 只是 channel 里的三推，不代表 reversal
- 根据 `24C`，坏楔形不是反转 setup。要优先检查：
  - 是否有 stair pattern
  - 是否有 anti-trend bar
  - trendline 是否收敛
  - 是否不在 TTR 中
  - 三段 leg 的 bar count 是否大致平衡
- `MTR` 是最重要的 reversal 形态之一，但它通常：
  - 概率不高
  - 更适合先当 `countertrend scalp` 或 `reversal probe`
  - 只有被接受后才升级为 swing reversal
- 根据 `21D/22D`，`MTR` 往往只有约 40% 胜率，且多数 reversal 会体现为 `DT/DB + test`。系统必须先把它当成“逆势试探/观察中的 reversal”，不能自动升级成高质量 swing。
- 根据 `22D`，MTR 的 anti-trend pressure 可以通过“持续时间”或“价格位移”表达。`10+` 个小 bar 或几个强 anti-trend bar，都可以构成 reversal pressure。
- 根据 `25B`，失败的 `DT/DB` 很容易转成 measure move；neckline 被有效突破时，旧 thesis 必须允许降级或反转，而不是继续沿用。

## thesis 切换原则

当同时出现以下证据时，允许旧 thesis 失效并切换：

- `wedge_or_mtr`
- `tr_edge:top/bottom`
- `DB/DT` 或 `H4/L4`
- 旧方向出现失败 follow-through
- 新方向出现接受迹象

不能因为旧 `pre_signal` 还在，就一直压住新 thesis。

## reversal 升级原则

- `reversal probe / scalp watch`
  - `wedge_or_mtr + tr_edge + H4/L4/DB/DT`
  - 但还没有 clear acceptance、neckline breakout 或 follow-through
- `candidate`
  - 已经出现 test，并且 price action 开始接受新方向
  - 至少要能解释：为什么这不是单纯的 TR 抖动
- `executable`
  - 除了触发，还要能回答：
    - 这是 `scalp` 还是 `swing`
    - 如果失败，`invalid_if` 是什么
    - 如果只是 reversal probe，为什么仍值得做
