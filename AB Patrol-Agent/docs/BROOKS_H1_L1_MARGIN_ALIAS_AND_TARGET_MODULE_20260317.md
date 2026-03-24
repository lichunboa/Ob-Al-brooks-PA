# H1/L1 保证金术语澄清与目标模块拆分复盘

更新时间：2026-03-17

## 一、本轮做了什么

本轮没有再去硬改 `H1/L1` 的交易语义，而是先把两类已经确认正确、但代码结构混乱的部分收干净：

1. 执行侧把 `max_cost_pct_per_order` 的真实语义澄清成“**单笔最大保证金占用占账户总额百分比**”，并做了兼容别名。
2. `H1/L1` 的目标层级和上下文判断，开始正式拆成共用模块，避免继续堆在几千行文件里。

对应代码：

- [trading_state.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/execution-service/src/trading_state.py)
- [__main__.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/execution-service/src/__main__.py)
- [h1_l1_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/h1_l1_template.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [h1_l1_targets.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/h1_l1_targets.py)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)

## 二、执行侧术语现在怎么解释

过去的名字：

- `max_cost_pct_per_order`

容易让人误以为这是：

- 单笔“手续费成本上限”

但代码真实含义一直是：

- 单笔**保证金占用**占账户总额百分比上限

本轮兼容策略：

- 旧字段 `max_cost_pct_per_order` 继续保留，避免破坏现有调用。
- 新增对外别名：
  - `max_margin_pct_per_order`
  - `max_margin_cost`
  - `max_margin_notional`
- 对外说明里明确写成“保证金占用上限”，不再继续误导成手续费成本。

这一步不会改变下单结果，只会把接口语义说清楚。

## 三、H1/L1 模块拆分到了哪里

### 3.1 detector 侧

`H1/L1` 的共用逻辑已经从 [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py) 抽到：

- [h1_l1_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/h1_l1_template.py)

当前已抽出的模块包括：

- signal bar 类型学
- setup 结构确认
- 初始止损类型
- `rescue / close-test / swing` 三层目标
- first-entry 管理意图
- `H1/L1` 信号对象构建

`StrategyDetector` 现在已经通过 `H1L1TemplateMixin` 复用这些逻辑。

### 3.2 回测侧

`valid previous entry / rescue target / close-test target` 已从 [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py) 抽到：

- [h1_l1_targets.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/h1_l1_targets.py)

当前包含：

- `target_distance_r()`
- `h1_l1_context_profile()`
- `resolve_h1_l1_effective_target()`

也就是说，`H1/L1` 的：

- `valid_previous_entry`
- `rescue_target`
- `close_test_target`
- `swing_target`
- `effective_target`

已经不再完全混在回测主文件里。

## 四、这轮对 Brooks 理论有没有偏离

这轮没有去改动已经确认有效的 Brooks 交易语义，只做了：

1. 术语澄清
2. 共用模块抽离

理论依据仍然是：

- [H1/H2 原文页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- ![H1/H2 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)
- [Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- ![Disappointed Bulls 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [1x Actual Risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md)
- ![1x Actual Risk 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)

所以这轮不是“拍脑袋改规则”，而是在把已经确认过的 Brooks 语义做成更干净的工具模块。

## 五、这轮验证到了哪一步

### 5.1 已完成验证

#### `BTCUSDT 15m 2022-01-24 ~ 2022-02-23`

文件：

- [/tmp/h1l1_setup_f1_v11.json](/tmp/h1l1_setup_f1_v11.json)

结果：

- 交易：`11`
- 胜率：`81.82%`
- PF：`18.718`
- 日均：`0.355`

结论：

- 这轮模块拆分没有把强背景 `15m` 的 `H1/L1` 优化坏。
- `15m` 当前依然是明显盈利的。

#### `BTCUSDT 5m 2024Q3`

文件：

- [/tmp/h1l1_setup_p3_v11.json](/tmp/h1l1_setup_p3_v11.json)

结果：

- 交易：`8`
- 胜率：`50.00%`
- PF：`0.636`
- 日均：`0.258`

结论：

- `5m` 没有塌回去，但还没有被拉到正 PF。
- 说明 `5m` 的弱背景 `H1/L1` 仍然需要继续修。

#### `ETHUSDT 5m 2024Q3`

文件：

- [/tmp/h1l1_setup_p5_v11.json](/tmp/h1l1_setup_p5_v11.json)

结果：

- 交易：`12`
- 胜率：`25.00%`
- PF：`0.216`
- 日均：`0.387`

结论：

- `ETH 5m` 仍然是当前最弱场景之一。
- 这再次说明：`5m` 的问题不是单纯噪音，而是 `弱背景 + 目标过近 + first-entry 预期过高` 这类问题会被放大。

### 5.2 本轮未完成验证

`BNBUSDT 5m 2024Q3` 这轮顺序回测没有在可接受时间内跑完，我没有继续空等。

但根据前一轮稳定审查，它曾是 `5m` 里已经明显为正的一组，所以当前 `5m` 的状态更准确地说是：

- 不是“5m 全部不行”
- 而是“5m 的分化比 15m 更大，弱背景问题暴露得更狠”

## 六、当前最准确的阶段判断

### 6.1 现在已经确定的

1. `15m` 没有被当前这轮拆分优化坏。
2. `H1/L1` 的 `STOP trigger / actual risk / first-entry rescue / rescue-close-test-swing target` 这条路是对的。
3. 模块拆分是值得做的，因为后面 `H2/L2`、突破回调和 gap 族都可以直接复用。

### 6.2 现在还没打透的

1. `5m` 弱背景下，哪些 `H1/L1` 真有 `valid previous entry` 预期；
2. 哪些单只该期待：
   - `rescue_target`
   - `close_test_target`
   - `BE / 小利退出`
3. 哪些根本不该继续按 continuation 去立项。

## 七、下一步建议

下一步不该回退模块化，而是继续只打 `H1/L1` 的这层结构语义：

1. `valid previous entry` 的放行边界
2. `rescue_target / close_test_target` 的适用条件
3. `5m` 弱背景里的 first-entry 预期分层

等这层稳定后，再把已经抽出来的通用模块扩到：

- `H2/L2`
- `突破回调`
- `20均线缺口 / 第一均线缺口 / MAG`
