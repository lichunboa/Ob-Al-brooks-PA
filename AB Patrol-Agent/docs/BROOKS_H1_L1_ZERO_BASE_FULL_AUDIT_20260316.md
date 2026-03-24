# H1/L1 归零法全链路体检报告（2026-03-16）

## 1. 目的

这份报告只做一件事：

- 把 `高1/低1` 从 K 线输入到回测执行的每一步全部摊开
- 不先靠几组回测输赢去裁决
- 先回答“当前系统到底怎么做”
- 再回答“Al Brooks 原文和实战资料里怎么做”
- 最后标出哪些已经对齐，哪些还没对齐

本报告对应你要求的“归零法”：

- 不假定旧逻辑正确
- 不假定以前的讨论已经落代码
- 逐步骤查

## 2. 资料优先级

本轮按这个顺序对照：

1. [LLM可读版](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版)
2. [AL brooks原课程大纲.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md)
3. Brooks 页图
4. 太妃资料，作为补充参考，不覆盖 Brooks 原文

本轮已直接核对的页图：

- [H1/H2 页图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)
- [Disappointed Bulls 页图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [1x Actual Risk 页图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)

## 3. 当前代码主链位置

当前 `H1/L1` 主要涉及：

- [data_loader.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/data_loader.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

## 4. 逐步骤体检

下表是当前 `H1/L1` 的全链路步骤。

状态说明：

- `已对齐`：当前实现和 Brooks 主语义基本一致
- `部分对齐`：方向对，但还混有工程化偏差
- `未对齐`：当前实现还不是 Brooks 主语义

### 4.1 K线输入与聚合

当前代码：

- `1m -> 5m/15m/1h` 聚合在 [data_loader.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/data_loader.py)
- 使用：
  - `open = first`
  - `high = max`
  - `low = min`
  - `close = last`
  - `volume = sum`

Brooks 对照：估计差不多

- 这和常规价格行为分析一致
- 不存在明显偏离

状态：

- `已对齐`

### 4.2 背景识别

当前代码：

- `H1/L1` 先按 `cycle` 分支
- 允许出现在：
  - `趋势多/趋势空`
  - `急速多/急速空`
  - `区间`

Brooks 对照：

- H1/L1 的确既可能出现在趋势中，也可能出现在 TR 中
- 课程大纲里对应：
  - `08-12` 信号棒、回调、市场周期

当前问题：

- `cycle` 还是离散标签
- 还没细化到：
  - 强趋势第一次回调
  - 小回调趋势第一次暂停
  - 紧密通道里的第一次明显回调

状态：

- `部分对齐`

### 4.3 关键位置

当前代码：

- 使用：
  - EMA20
  - prior high/low
  - highest close/lowest close
  - pullback origin
  - major swing anchor

Brooks 对照：

- 这些都是 Brooks 会反复用到的关键位置
- `highest close` 和 `Disappointed Bulls` 明确相关

当前问题：

- `highest close`
- `prior high/low`
- `breakout point`
- `gap / MA`

这些位置虽然都出现了，但还没有统一成“按策略模板优先级选目标/止损”的系统表。

状态：

- `部分对齐`

### 4.4 Setup 前提

当前代码：

- `prev` 视作回调棒
- `curr` 视作触发棒
- `prev2` 参与 signal bar 类型判断
- 趋势分支里还要求：
  - `Higher Low`
  - `Lower High`

Brooks 对照：

- `H1/L1` 不是任意 pullback，都要有趋势腿和第一次回调语义

当前问题：

- 结构确认仍偏“算法 swing”
- Brooks 更像“图形语义 + 上下文”
- 这块可能是当前 `H1/L1` 数量被压得太狠的根因之一

状态：

- `部分对齐`

### 4.5 Signal Bar 类型

当前代码：

- `trend_bar`
- `reversal_bar`
- `inside_bar`
- `ema_recovery_bar`
- `outside_follow_bar`

并读取：

- `close_position`
- `body_ratio`
- `good_tail_ratio`
- `bad_tail_ratio`
- `inside_bar`
- `outside_bar`

Brooks 对照：

- Brooks 的 signal bar 本来就不只是“强/弱”二元，而是：
  - 趋势棒
  - 反转棒
  - inside/outside
  - 收盘位置
  - 尾巴方向

当前问题：

- `outside_bar`
- `close_near_extreme`
- `valid_signal_bar`

仍然偏硬，还是工程化 gate，而不是 Brooks 式的上下文偏好。

状态：

- `部分对齐`

### 4.6 入场类型

当前代码：

- `H1/L1` 已经改成：
  - `entry_type = STOP`
  - `entry_trigger = signal bar 外一跳`
- 当前 detector 用：
  - `_stop_entry_trigger`
  - `_stop_entry_reached`

Brooks 对照：

- 对应：
  - `Buy above PB bar`
  - `Sell below signal bar`
  - `Choose one entry and rely on stop`

当前问题：

- 这一层已经基本对齐
- 不该再回退成 `close-confirmation`

状态：

- `已对齐`

### 4.7 触发前失效

当前代码：

- 当前系统有 pending order 语义
- 但 `H1/L1` 还没有单独模板化“触发前若先破坏 setup 怎么取消”

Brooks 对照：

- stop 单只是入场验证
- 如果在触发前 setup 已经坏了，本来就应取消

当前问题：

- `H1/L1` 的 trigger invalidation 还没单独模板化

状态：

- `未对齐`

### 4.8 初始止损

当前代码：

- 已拆成 3 种：
  - `signal_bar_stop`
  - `swing_stop`
  - `major_hl_lh_stop`

Brooks 对照：

- 对应：
  - signal bar stop
  - swing stop
  - 更大结构 stop

当前问题：

- 现在止损类型已经拆了
- 但“哪种背景该用哪种 stop”还没完全模板化
- 特别是 first-entry / small pullback / disappointed bulls 语义还没完全进来

状态：

- `部分对齐`

### 4.9 实际风险

当前代码：

- `actual_risk` 已按：
  - `entry_trigger - selected_stop`
  计算

Brooks 对照：

- 对应 `1x Actual Risk`

当前问题：

- 这层本身对了
- 但后面的目标位和管理还没完全按 `actual_risk` 主导

状态：

- `已对齐`

### 4.10 仓位 / 杠杆 / 成本

当前代码：

- 回测成本模型在 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- 按品种分成本 profile：
  - `crypto_futures`
  - `forex_cfd`
  - `metals_cfd`
  - `index_cfd`

当前成本逻辑：

- crypto futures：
  - maker/taker fee
  - maker/taker slippage
- forex / metals / index 也有独立费率和滑点

Brooks 对照：

- 课程大纲 `03B-03E` 明确强调：
  - 风险
  - 成本
  - 点值
  - 利润率

当前问题：

- 杠杆不改变策略优势，这一点系统认知是对的
- 但仓位层还没有和 `H1/L1` 模板逐策略结合

状态：

- `部分对齐`

### 4.11 第一目标

当前代码：

- 第一目标优先级：
  - `highest_close / lowest_close`
  - `prior_high / prior_low`
  - `pullback_origin`
  - `measured_move_1x`
  - `measured_move_2x`

Brooks 对照：

- `Disappointed Bulls/Bears`
- `1x Actual Risk`
- `highest close` 测试

当前问题：

- 目标位已经开始按结构选
- 但还没完全做到：
  - first-entry 的 close test
  - second-entry 的 swing target
  - 强趋势里的 hold 部分

状态：

- `部分对齐`

### 4.12 Partial / scalp / swing

当前代码：

- `H1/L1` 已经写入：
  - `prefer_partial_over_full_swing`
  - `allow_be_after_first_target`
  - `allow_small_runner`

执行层也会读这些字段。

Brooks 对照：

- `first buy` 常常先求自救、先拿 close test
- second signal 再更适合 hold runner

当前问题：

- 当前已经有 first-entry 语义
- 但还没完全拆成：
  - first buy scalp
  - lower buy rescue first buy
  - second buy 才 hold more

状态：

- `部分对齐`

### 4.13 BE / protective / trailing

当前代码：

- `tp1` 之后可移保本
- 可 handoff runner stop
- 仍有较多 `protective_stop_exit`

Brooks 对照：

- Brooks 很强调：
  - 不要让 first-entry 轻易重新吐回去
  - 要用 BE / 小 scalp / 结构保护

当前问题：

- 系统已经有这些模块
- 但执行节奏还没完全 Brooks 化

状态：

- `部分对齐`

### 4.14 提前离场

当前代码：

- 已有意图：
  - `exit_on_failed_follow_through`
  - `exit_on_return_to_range`
  - `exit_on_major_channel_break`

Brooks 对照：

- 方向是对的

当前问题：

- 这些意图还没全部在 `H1/L1` 专属模板里逐条验证

状态：

- `部分对齐`

### 4.15 re-entry / add-on

当前代码：

- 已有：
  - `handoff_to_h2_l2_if_failed`
  - `reentry_attempt`
  - `scale_legs`

Brooks 对照：

- `H1` 失败后转 `H2`
- first buy 失败，lower buy 救 first buy

当前问题：

- 现在还只是字段和通用机制在
- 没完全变成 `H1/L1` 专属模板化流程

状态：

- `未对齐`

## 5. 当前最大根因，不是一个点

如果按归零法看，当前 `H1/L1` 还没盈利，不是因为一个神奇 bug，而是 4 层叠加：

1. `setup` 结构确认还偏严  
2. `signal bar` 过滤仍偏工程化  
3. `first-entry` 管理只完成了一半  
4. `H1/L1` 和 `20 gap / 第一均线缺口 / MAG` 还没彻底拆开

## 6. 当前最该做的顺序

如果只死磕 `H1/L1`，最合理的顺序是：

1. 先把 `setup` 结构确认改对  
2. 再把 `signal bar` 放行边界改对  
3. 再把 first-entry 的 partial / BE / rescue 细化  
4. 最后再把 `20 gap / 第一均线缺口 / MAG` 单独拆出去

## 7. 当前一句话结论

`H1/L1` 这条路不是错的。  
当前已经真正对齐 Brooks 的，是：

- `STOP trigger`
- `actual risk`
- 部分 first-entry 管理意图

当前还没真正对齐 Brooks 的，是：

- `setup` 结构确认
- `signal bar` 放行边界
- `first-entry -> lower buy/higher sell rescue`
- `gap` 相关子流程分拆
