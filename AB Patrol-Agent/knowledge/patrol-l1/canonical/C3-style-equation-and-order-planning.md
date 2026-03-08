# C3 Style, Equation, and Order Planning

> 来源锚点：
> - `13A/13C`
> - `19D`
> - `31A/31B/31C/31D`
> - `39B/39C`
> - `47D`
> - `S5-evaluation.md`

## 风格分类必须由 setup 决定

- `Scalp`
  - 高概率
  - 通常在 TR、边缘、first countertrend、limit order market
  - 允许较小 R，但不能低于 `S5`
- 根据 `13C`，scalp 往往随着 minor reversal 开始；它可以先于 clear reversal 出现。
- `Swing`
  - 默认优先级高于 scalp
  - 强趋势顺势 setup 默认先按 swing 思考
- 根据 `13C`，swing 要等更清晰的 reversal / acceptance 才结束或反转，不能把所有 reversal probe 都包装成 swing。
- `反转试探 / reversal probe`
  - 允许低概率，但必须高回报
  - 不能伪装成顺势 swing
- `逆势 swing`
  - 只在强 reversal context 下考虑，不是普通 countertrend scalp

## Trader's Equation

以 `S5-evaluation` 为准：

- 最终验证：`P × R > (1-P)`
- 不允许代码自创固定阈值替代它

## planned_trade / pending order

系统必须显式区分：

- `WATCH`
  - 只是观察，不给交易参数
- `planned_trade`
  - 方向、风格、entry/entry_zone、stop、target、invalid_if 已明确
- `candidate`
  - 已接近执行，但仍等待 trigger / acceptance / better price
- `executable`
  - 已满足规则，可直接执行

## 委托计划

当 Al Brooks 逻辑允许“提前计划而不是追价”时，agent 可以输出：

- `LIMIT`
- `STOP_MARKET`
- `MARKET`

并同时给出：

- `invalid_if`
- `cancel_if`
- `degrade_to_watch_if`

代码要支持这些语义，但不应自作主张把它们过滤掉。

## order type 选择

- 根据 `16F`，channel reversal 默认更适合 `STOP` 触发；只有 context 非常好时，经验丰富的交易者才考虑 `LIMIT + scale in`。
- 因此 agent 必须显式说明：
  - 为什么这是 `LIMIT`
  - 为什么不是 `STOP_MARKET`
  - 或者为什么要先 `WATCH / planned_trade` 而不是立刻追价
- `TR` 边缘、反转试探、limit order market 场景可以计划 `LIMIT`
- `breakout / acceptance / follow-through` 场景更适合 `STOP_MARKET`

## reversal 目标与管理

- 根据 `21D`，反转的最小目标通常是 `TBTL`（Ten Bars Two Legs）到对侧。
- 对 reversal probe 或弱 reversal：
  - 可以先按 scalp 管
  - 到 `2R` 后考虑减仓
  - 余仓再看是否能扩展到 `TBTL`
- 如果只是 test，没有 acceptance，就不要把它写成高把握 swing。
