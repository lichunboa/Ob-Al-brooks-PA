# H1/L1 的 Rescue / Close-Test / Swing 目标模块进展

更新时间：2026-03-17

## 一、这轮想解决什么

这一轮继续只打 `H1/L1`。

目标不是再加一层泛过滤，而是把下面这 3 条 Brooks 语义真正拆成代码：

1. 为什么 `first entry` 可以被 `lower buy / higher sell` 救出来。
2. 为什么有些单只该期待回到 `valid previous entry / highest close / lowest close`。
3. 为什么有些弱单根本不该按 `continuation swing` 去期待。

对应主资料：

- [Disappointed Bulls 第160页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- ![Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [基础篇第1173页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-1173.md)
- ![基础篇1173](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/images/page-1173.jpg)
- [Ali 第16页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0016.md)
- ![Ali 16](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0016.jpg)
- [进阶篇第539页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0539.md)
- ![进阶篇539](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0539.jpg)

## 二、这轮已经落地的代码

### 1. detector 侧目标层级

文件：

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

已增加的目标字段：

- `rescue_target / rescue_target_type`
- `close_test_target / close_test_target_type`
- `swing_target / swing_target_type`
- `effective_target / effective_target_type`

当前定义：

- `rescue_target`
  - 优先对应 `highest_close / lowest_close`
  - 用于 first-entry 被 lower buy / higher sell 救回后的 `BE / 小利退出`
- `close_test_target`
  - 优先对应 `prior_high / prior_low`
  - 用于更完整的 close-test / prior extreme 测试
- `swing_target`
  - 对应更远的 continuation 目标
  - 当前优先来自 `pullback_origin / measured_move`

### 2. 路由层目标不再只看 router 的统一 target

文件：

- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)

已增加：

- `_resolve_h1_l1_effective_target()`
- `_target_distance_r()`

当前逻辑：

- 对普通策略仍然沿用 router 的 `recommended_target`
- 对 `H1/L1 first-entry`，会优先选择更符合 Brooks 的：
  - `rescue_target`
  - `close_test_target`
  - `swing_target`

然后再把它写回：

- `recommended_target`
- `effective_target`
- `first_target_distance_r`
- `rescue_target_distance_r`
- `close_test_target_distance_r`
- `swing_target_distance_r`

### 3. 执行层 first-entry 管理接了新目标层级

文件：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

当前变化：

- `H1/L1` 的 first-entry 不再只看旧的 `first_target/stretch_target`
- 现在会识别：
  - `rescue_target`
  - `close_test_target`
  - `swing_target`
- 在 `protective_scalp` 里，`lower buy / higher sell rescue` 已经开始参考 `rescue_target`

### 4. 透传和报表

文件：

- [models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
- [report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py)

新增透传字段：

- `rescue_target*`
- `close_test_target*`
- `swing_target*`
- `effective_target*`

## 三、目前已经确认的样本结果

### 1. 已确认正向样本

这轮在最关键坏样本上已经看到明确正向：

- `BTCUSDT 5m 2024Q3`
  - 上一稳定版：`7` 笔，胜率 `42.86%`，PF `0.851`
  - 这轮模块化版本：`10` 笔，胜率 `50.00%`，PF `1.873`

文件：

- [/tmp/h1l1_setup_random_20260317_v10.json](/tmp/h1l1_setup_random_20260317_v10.json)

这说明：

- `5m` 上最弱、最容易被成本和坏背景吃掉的 `H1/L1`
- 不是“理论不通”
- 而是以前没有把 `rescue / close-test / weak continuation` 这层做成正式模块

### 2. 另一个已确认正向样本

- `BNBUSDT 15m 2023Q4`
  - 当前结果：`6` 笔，胜率 `66.67%`，PF `10.354`

文件：

- [/tmp/h1l1_setup_r3_20260317_v10.json](/tmp/h1l1_setup_r3_20260317_v10.json)

它说明：

- 新目标层级不是只对 `BTC 5m` 有意义
- 在 `15m` 的顺势恢复里同样成立

## 四、当前还没有完全确认的部分

### 1. 强背景 15m 是否被过早降级

我在中途结果里看到一个风险：

- `BTC 15m 2022` 这种强背景场景
- 有可能被过早拉到 `rescue_target`
- 导致大胜利单被缩短

所以我又补了一刀：

- 只有在 `TR/弱趋势/弱 setup` 这类上下文里，才优先 `rescue_target`
- 不能仅仅因为当前一两根 `follow-through` 弱，就把强背景 first-entry 一律降级

但这一刀**还没有拿到完整 fixed/random 验证结果**。

### 2. 当前结论

所以这轮最准确的状态是：

- 模块方向：**已经证明是对的**
- 关键坏样本：**已经明显改善**
- 完整稳定性：**还没完成最终确认**

## 五、我对这轮的判断

1. 这不是品种特调。  
   `BTC 5m` 只是把问题暴露得最明显，修的是共享结构模块。

2. 这不是再加一层工程过滤。  
   修的是 Brooks 里原本就存在的：
   - `valid previous entry`
   - `highest/lowest close test`
   - `Disappointed Bulls / Bears`
   - `first entry -> lower buy / higher sell rescue`

3. 这轮还不能直接当“稳定基线提交”。  
   因为完整 `fixed/random` 还没跑完。

## 六、下一步最值

下一步不该再泛调别的策略族，而是：

1. 把当前代码用同一口径补完完整 `fixed/random`；
2. 确认 `BTC 15m 2022` 这类强背景没有被过早降级；
3. 如果确认稳定，再把这套共享模块扩到：
   - `H2/L2`
   - `突破回调`
   - `20均线缺口 / 第一均线缺口 / MAG`
