# H1/L1 当前执行细节对照报告（2026-03-16）

## 1. 目的

这份报告只回答一件事：

- 当前代码里的 `高1/低1` 到底是怎么执行的
- 它和 Al Brooks 原文、百科页图、实战经验对得上哪些
- 还差在哪些关键细节

本报告不先根据几次回测结果武断下结论，而是先把“执行细节”逐条展开，再对照资料。

## 2. 本次对照使用的资料

本次对照优先使用你指定的新主入口：

- [LLM可读版](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版)
- [AL brooks原课程大纲.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md)
- [太妃 20均线缺口 / 第一均线缺口](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md)

本次实际核对过的页图：

- [H1/H2 页图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)
- [Disappointed Bulls 页图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [1x Actual Risk 页图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)

## 3. 当前代码涉及的核心位置

当前 `H1/L1` 主链主要落在这些文件：

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

关键函数：

- `StrategyDetector._stop_entry_trigger`
- `StrategyDetector._stop_entry_reached`
- `StrategyDetector._h1_l1_signal_bar_profile`
- `StrategyDetector._h1_l1_stop_plan`
- `StrategyDetector._h1_l1_target_plan`
- `StrategyDetector._h1_l1_management_plan`
- `StrategyDetector._build_h1_l1_signal`
- `SimExchange._build_pending_order`
- `SimExchange._build_trade`
- `SimExchange._apply_brooks_management`

## 4. 当前执行细节，逐项展开

### 4.1 背景识别

当前 `H1/L1` 不是在所有环境里都直接检测，而是先按 `cycle` 走分支：

- `趋势多`
- `趋势空`
- `急速多`
- `急速空`
- `区间`

这意味着当前系统认为：

- `H1/L1` 是趋势恢复族
- 但它既可以出现在趋势里，也可以出现在急速腿之后，也可以出现在区间里顺 EMA 方向的一次回调

和 Brooks 的关系：

- 这一点大方向是对的
- Brooks 的 `H1/L1` 本来就不是只属于“单一强趋势”
- 它也会出现在小回调趋势、紧密通道、区间内顺方向的小恢复里

当前仍未完全对齐的点：

- 当前 `cycle` 是离散标签，仍然比 Brooks 的连续背景语义更粗
- 也就是“背景识别”现在能区分大类，但还没有细化成：
  - 强趋势里第一次回调
  - 小回调趋势里的第一次停顿
  - 紧密通道里的第一次明显回调
  - 区间内顺方向的一次小恢复

### 4.2 setup 前提

当前 `H1/L1` 的基础前提不是“任意一根触发棒”。

它要求：

- `prev` 是回调棒
- `curr` 是当前触发棒
- `prev2` 作为 signal bar 类型学的参考
- 在 `趋势多/趋势空` 分支中，还要求形成 `Higher Low / Lower High` 结构

结构确认方式：

- 代码用 `CycleIdentifier._find_swings()` 找最近 `major swing low/high`
- 多头要求回调低点高于前一个 `swing low`
- 空头要求反弹高点低于前一个 `swing high`

和 Brooks 的关系：

- 这是对的
- `H1/L1` 不是“任何一个 pullback bar”都能做
- 它应该依赖前面的趋势腿和回调结构

当前仍未完全对齐的点：

- 现在 `Higher Low / Lower High` 是离散 swing 算法确认
- Brooks 原文更强调“图形上是否像第一次回调，而不是算法上是否刚好形成 swing”
- 所以当前实现仍可能过严

### 4.3 signal bar 判定

当前已经不是单一 `signal_bar_quality` 总分，而是类型学。

现有类型：

- `trend_bar`
- `reversal_bar`
- `inside_bar`
- `ema_recovery_bar`
- `outside_follow_bar`

同时还读取这些原子特征：

- `close_position`
- `body_ratio`
- `upper_tail_ratio`
- `lower_tail_ratio`
- `inside_bar`
- `outside_bar`

当前 `valid_signal_bar` 的核心逻辑是：

- 必须方向一致
- 必须属于允许的 signal type
- 还要满足：
  - `close_near_extreme_soft`
  - 或 `good_tail_ratio >= 0.25`
  - 或 `ema_recovery`
  - 或 `outside_follow`

和 Brooks 的关系：

- 这比之前单一分数更接近 Brooks
- Brooks 的 signal bar 本来就是“类型学 + 位置 + 收盘 + 尾巴”的组合判断

当前仍未完全对齐的点：

- `outside_bar` 现在虽然不再一刀切否掉，但仍然偏严
- `close_near_extreme` 仍然在担任过重的过滤角色
- `valid_signal_bar` 还是在做“硬门”，而不是 Brooks 更常见的“偏好 + 上下文修正”

### 4.4 入场触发

当前这一层已经真正改成 `STOP` 语义：

- `BUY`：`signal bar high + 1 个最小波动单位`
- `SELL`：`signal bar low - 1 个最小波动单位`

对应函数：

- `_stop_entry_trigger`
- `_stop_entry_reached`

当前 detector 不再要求：

- `curr.close > prev.high`
- `curr.close < prev.low`

而是要求：

- 当前 K 线的高/低必须真实触发 stop 单价位

和 Brooks 的关系：

- 这一层已经明显对齐
- 对应原文就是：
  - `Buy above PB bar`
  - `Choose one entry and rely on stop`

这是当前链路里最明确、也最应保留的修正之一。

### 4.5 价格字段与成交字段

当前 detector 生成 `PASignal` 时：

- `price = curr.close`
- `entry_trigger = signal bar 外一跳`
- `entry_type = "STOP"`

进入回测执行层后：

- `PendingOrder.trigger_price = entry_trigger`
- 真正成交时 `Trade.entry_price = fill_price`
- `Trade.entry_trigger` 仍被保留

和 Brooks 的关系：

- 方向是对的：参考价和触发价已经分离
- 但这里仍然有一个实现层风险：
  - detector 里的 `price`
  - 回测里的 `fill_price`
  - `original_entry_price`
  三者语义容易混淆

当前仍未完全对齐的点：

- 当前系统虽然已经区分了 `price` 和 `entry_trigger`
- 但代码里仍存在“参考价字段残留”的历史包袱
- 后面如果不继续收干净，风险、目标位和成本计算仍可能被带偏

### 4.6 初始止损

当前 `H1/L1` 的止损不再只有一个固定位置，而是 3 种类型：

- `signal_bar_stop`
- `swing_stop`
- `major_hl_lh_stop`

当前选择规则：

- 趋势/急速背景里，如果 signal bar 很强、收盘足够靠近极端、坏尾巴足够小，则优先 `signal_bar_stop`
- 区间里优先 `swing_stop`
- 如果是 `inside_signal / ema_recovery`，且有明确 `major_anchor`，则允许 `major_hl_lh_stop`

和 Brooks 的关系：

- 方向是对的
- Brooks 本来就区分：
  - 信号棒止损
  - 摆动止损
  - 更大结构止损

当前仍未完全对齐的点：

- 当前止损类型选择仍然偏“规则树”
- 还没有细化到：
  - small pullback 时的紧止损
  - disappointed bull/bear first-entry 时的 first-buy 风险
  - lower buy / higher sell 后 first-entry BE 迁移

### 4.7 风险计算

当前 `actual_risk` 已按真实 stop 触发价计算：

- `actual_risk = entry_trigger - selected_stop`
- 或空头镜像

同时保留：

- `nominal_risk`

这比之前只用名义入场价/close 计算要更接近 Brooks。

和 Brooks 的关系：

- 对应 `1x Actual Risk` 页
- 这是对的

当前仍未完全对齐的点：

- 现在 `actual_risk` 已经进 detector
- 但整条执行链对 `actual_risk` 的运用还不够彻底
- 特别是后段管理里，仍有通用模板对 `H1/L1` 的覆盖

### 4.8 第一目标与延伸目标

当前 `H1/L1` 的第一目标层级已经从单纯固定 R，改成结构层级：

多头优先级：

- `highest_close`
- `prior_high`
- `pullback_origin`
- `measured_move_1x`
- `measured_move_2x`

空头镜像：

- `lowest_close`
- `prior_low`
- `pullback_origin`
- `measured_move_1x`
- `measured_move_2x`

同时：

- `take_profit` 会比第一目标略提前一个 `increment`

和 Brooks 的关系：

- 这比固定 `2R/3R` 更接近 Brooks
- 特别是 `highest close / prior high` 已经开始贴近 `Disappointed Bulls/Bears`

当前仍未完全对齐的点：

- 目标层级已经拆了，但还没完全模板化成：
  - first entry 的 close test
  - second entry 的 swing target
  - strong trend 里的 hold-for-rhythm
- 现在 `highest_close` 进入了层级，但 detector 和执行层对它的优先级仍不够稳定

### 4.9 first-entry 管理

当前 `H1/L1` 已经把 first-entry 管理意图写进 `extra`，并且回测执行层会读取：

- `first_entry_signal = True`
- `first_profit_at_1x_actual_risk`
- `allow_be_after_first_target`
- `prefer_partial_over_full_swing`
- `allow_small_runner`
- `prefer_lower_entry_be_rescue`
- `disappointed_bull_bear_mode = True`
- `runner_handoff_stop`

执行层读取后，会做这些事情：

- 如果是 `H1/L1 first_entry`
- `tp1_r` 优先吃 detector 给的 `first_target`
- `tp1` 打到后，优先 partial
- 若允许 `BE`，则移到 BE
- 若允许小 runner，则把余仓 handoff 给更大的结构止损

和 Brooks 的关系：

- 这个方向是对的
- 对应 `Disappointed Bulls: Buy More Lower`
- 也对齐了 `first buy 先求自救 / second buy 帮 first buy BE` 的语义

当前仍未完全对齐的点：

- 当前 still 属于“first-entry 管理意图已贯通，但不够细”
- 还没有完全拆成：
  - first buy 失败后 lower buy 的具体接力逻辑
  - first buy 不同背景下的 partial 比例
  - 什么时候绝不留 runner

### 4.10 提前离场与保护

当前 `H1/L1` 已经写入这些意图：

- `exit_on_failed_follow_through`
- `exit_on_return_to_range`
- `exit_on_major_channel_break`

并且执行层里：

- `tp1` 之后会抬 BE
- 保护性止损会继续工作
- `runner` 有独立 handoff stop

和 Brooks 的关系：

- 大方向是对的
- 但当前最大的真实问题仍然是：
  - 太多单在成熟前退化成 `protective_stop_exit`

所以这部分仍然没有彻底对齐 Brooks 的“scratch / BE / 小 scalp / 结构 trailing”节奏。

## 5. 当前实现里，已经明显对齐 Brooks 的部分

### 5.1 STOP 触发

这是当前最确定的正向改动。

当前已经符合：

- 先有 signal bar
- 在 signal bar 外一跳挂 STOP
- 只有真实触发才进场

这点是对的，不该再回退。

### 5.2 止损类型不再单一化

当前已经开始区分：

- `signal_bar_stop`
- `swing_stop`
- `major_hl_lh_stop`

这比以前统一一个结构止损要更对。

### 5.3 目标位开始从固定 R 改向结构目标

当前 `highest_close / prior_high / prior_low` 已经进入第一目标层级。

这比以前固定 `2R/3R` 更符合 Brooks。

### 5.4 first-entry 管理开始贴近 `Disappointed Bulls/Bears`

当前 first-entry 已经不是“默认 full swing 持有”。

这点是对的。

## 6. 当前实现里，还没有真正对齐 Brooks 的部分

### 6.1 signal bar 过滤仍然偏硬

最主要的偏差仍在：

- `outside_bar`
- `close_near_extreme`
- `valid_signal_bar`

它们现在虽已比以前好，但仍然太像“工程门槛”，不像 Brooks 的上下文判断。

### 6.2 H1/L1 仍然被 detector 过度收缩

最近回测最明显的现象就是：

- `高1` 数量明显被压缩
- `低1` 数量更明显地被压缩

这说明当前不是“没做 STOP”，而是 signal bar 的门槛仍然在过筛。

### 6.3 first-entry 管理仍然只完成了一半

现在已经有：

- first target
- BE
- partial
- runner handoff

但还没有细化为：

- first buy 失败后的 lower buy 接力
- second signal 接盘时如何帮助 first buy BE
- 不同背景下 first-entry 是 scalp 还是 partial-swing

### 6.4 gap 类 setup 仍混在趋势恢复大类里

当前 `20均线缺口 / 第一均线缺口 / MAG` 相关语义虽然在讨论里已经明确，但代码层还没有单独模板化完成。

这会继续污染 `H1/L1` 的纯度。

## 7. 当前最合理的判断

不能用“几次回测变差”就否定这条路。

更准确的判断是：

- `H1/L1` 这条路本身没有错
- `STOP` 语义这一步明确是对的
- first-entry 的目标与管理方向也基本对
- 但 signal bar 过滤仍然没有完全 Brooks 化
- gap 子流程也还没拆出来

所以现在不是“这条路不通”，而是：

- 主干方向对
- 但模板还没完全收干净

## 8. 下一步建议

如果继续按资料推进，最合理的顺序应该是：

### 8.1 先收 signal bar，而不是再动管理层

只继续打 3 个点：

- `outside_bar`
- `close_near_extreme`
- `valid_signal_bar`

### 8.2 不再把 gap setup 混在 H1/L1 主模板里

下一步应该单独出：

- `20均线缺口 / 第一均线缺口 / MAG` 模板

### 8.3 保留 STOP 触发，不再回退

这一点已经足够明确，不该再反复摇摆。

## 9. 一句话结论

当前 `H1/L1` 的执行链已经把：

- `signal bar`
- `STOP trigger`
- `初始止损`
- `结构目标`
- `first-entry 管理`

这五层基本接起来了。

但它还不是最终版。  
现在真正没对齐 Brooks 的主问题，不是 `STOP`，而是 `signal bar` 过滤仍偏硬，以及 `gap` 语义还没从 `H1/L1` 主模板里彻底拆出去。
