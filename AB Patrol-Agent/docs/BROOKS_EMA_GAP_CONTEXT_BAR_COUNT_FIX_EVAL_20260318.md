# Brooks Gap 族背景周期计数修正复盘

## 1. 本轮修正是什么

本轮不是继续给 `20均线缺口 / 第一均线缺口 / MAG` 追加新的过滤条件，而是修正了更底层的一处语义错误：

- 之前在小周期执行图上，虽然已经参考了更大周期的 EMA
- 但 `bars_away` 仍然按执行周期 K 线在数
- 这会把 Brooks 语境里的 gap 结构做歪

本轮统一改成：

- **背景周期计数**
- **执行周期触发**

也就是：

- `5m` 图上如果参考 `1h` 的 EMA
- gap 的“已经远离 EMA 多久”应该按 `1h bars away` 理解
- 真正的 signal bar / stop trigger 仍然在 `5m` 上执行

这更符合 Brooks 在多周期案例里的表达方式。

## 2. 依据

本轮主要对照：

- `LLM可读版/百科幻灯片-10/page-0072`
- `LLM可读版/百科幻灯片-8/page-0295`
- 太妃 `L17B - 20均线缺口 / 第一均线缺口`

共同结论：

- 小周期图上允许参考更大周期 EMA
- 但 gap 的“远离/回踩”语义，不应继续按执行周期裸计数
- 否则会把 gap 家族错误压扁

## 3. 改动文件

- [ema_gap_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/ema_gap_template.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)
- [ema_context.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/ema_context.py)
- [ema_gap_case_probe.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/ema_gap_case_probe.py)
- [ema_gap_probe.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/ema_gap_probe.py)
- [BROOKS_LIVE_CHAIN_REDESIGN_20260318.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_LIVE_CHAIN_REDESIGN_20260318.md)

## 4. 个案漏斗变化

场景：

- `R1_BTCUSDT_5m_2024Q3`

修正前：

- `valid::20均线缺口 = 63`
- `passed_signal_bar = 10`
- `signal_created = 10`

修正后：

- `valid::20均线缺口 = 190`
- `passed_signal_bar = 76`
- `signal_created = 76`

这说明：

- 主问题不是“gap 条件太多”
- 而是 bars 计数层语义错了
- 修正后，频率是被正确放出来的

进一步看 signal bar 分布：

- `20均线缺口::trend_bar::valid = 62`
- `20均线缺口::reversal_bar::valid = 14`
- `20均线缺口::weak::invalid = 114`
- `MAG 20/20 Setup::trend_bar::valid = 12`
- `MAG 20/20 Setup::reversal_bar::valid = 4`

所以这次不是把 weak bar 乱放出来，而是把本来就该成立的 `trend_bar / reversal_bar` 放回来了。

## 5. fixed / random / stress5m 结果

### 5.1 fixed

文件：

- [/tmp/ema_gap_fixed_v11_20260317.json](/tmp/ema_gap_fixed_v11_20260317.json)
- [/tmp/ema_gap_fixed_v12_20260318.json](/tmp/ema_gap_fixed_v12_20260318.json)

`v11 -> v12`

- 总交易：`5 -> 30`
- 胜率：`40.00% -> 53.33%`
- 平均 PF：`0.213 -> 1.585`
- 日均：`0.081 -> 0.323`

按策略族汇总的 gross PF：

- `gap 家族整体 = 1.104`
- `20均线缺口 = 0.815`
- `MAG 20/20 Setup = 2.248`

### 5.2 random

文件：

- [/tmp/ema_gap_random_v11_20260317.json](/tmp/ema_gap_random_v11_20260317.json)
- [/tmp/ema_gap_random_v12_20260318.json](/tmp/ema_gap_random_v12_20260318.json)

`v11 -> v12`

- 总交易：`7 -> 21`
- 胜率：`42.86% -> 57.14%`
- 平均 PF：`1.529 -> Infinity`
- 日均：`0.113 -> 0.169`

说明：

- 这个 `Infinity` 不是说系统无敌了
- 而是 `BNB 15m` 的单笔 `MAG` 全赢样本把场景平均值拉爆了
- 更稳的看法应该看家族 gross PF

按策略族汇总的 gross PF：

- `gap 家族整体 = 1.444`
- `20均线缺口 = 0.934`
- `MAG 20/20 Setup = 2.028`

### 5.3 stress5m

文件：

- [/tmp/ema_gap_stress5m_v9_20260317.json](/tmp/ema_gap_stress5m_v9_20260317.json)
- [/tmp/ema_gap_stress5m_v12_20260318.json](/tmp/ema_gap_stress5m_v12_20260318.json)

`v9 -> v12`

- 总交易：`8 -> 102`
- 胜率：`25.00% -> 56.86%`
- 平均 PF：`0.302 -> 1.286`
- 日均：`0.086 -> 0.470`

按策略族汇总的 gross PF：

- `gap 家族整体 = 0.976`
- `20均线缺口 = 0.669`
- `MAG 20/20 Setup = 1.548`

这里要保守解释：

- `stress5m` 场景平均 PF 已经明显转正
- 但从 family gross PF 看，`5m` 上当前真正过线的是 `MAG`
- `20-gap` 自己还没完全打透

## 6. 结论

本轮可以确认的结论：

1. 这次改动不是某个品种、某段行情、某个周期的特调。
2. 真正修正的是 `gap 家族` 共用的底层计数语义错误。
3. 修正后：
   - `fixed` 明显改善
   - `random` 明显改善
   - `stress5m` 从明显负值推进到正值
4. 现在 `MAG` 已经被稳定放出来了。
5. `20-gap` 本身还没完全过线，但已经不再是“几乎没有频率”的状态。

## 7. 当前最准确的判断

这轮已经足以说明：

- `gap 家族` 的主问题不是“条件太多”
- 而是“多周期 EMA 参考 + 执行周期计数”这套建模方式本身错了

但同时也要明确：

- 当前真正稳定转正的是 `MAG`
- `20-gap` 自己还差最后一层
- 所以下一步不该再回去动 bars 计数，而应该继续打：
  - `20-gap` 和 `MAG` 的边界
  - `20-gap` 的 target / expectation 语义
  - `第一均线缺口` 的正式放量

## 8. 实盘链上的意义

这次修正也进一步证明，实盘链不该继续沿着“一个大引擎里堆所有策略条件”的方式增长。

更合理的方向是：

- 统一主链
- 策略模板注册
- 多周期角色统一
- 标准化信号字段统一

详见：

- [BROOKS_LIVE_CHAIN_REDESIGN_20260318.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_LIVE_CHAIN_REDESIGN_20260318.md)
