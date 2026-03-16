# H1/L1 弱 Setup 反做、救援与弱 Signal Bar 收口复盘

更新时间：2026-03-17

## 一、这轮到底改了什么

这轮只继续打 `H1/L1`，没有扩到别的策略族，目标是把已经确认有效的 `STOP trigger`、`弱 setup 分流`、`first-entry 管理` 再向 Brooks 原文推进三步：

1. 把 `fade_candidate` 从“先不做”升级成真正的反做执行语义。
2. 继续收弱 `signal bar` 的放行边界，但不退回到“收盘确认突破”。
3. 把 `lower buy / higher sell rescue` 从 detector 意图接到执行层，真正影响成交后的管理。

本轮对应代码文件：

- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- [models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
- [report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)

## 二、Brooks 原文与实战依据

这轮直接用到的主资料如下。

### 1. 弱 H1/L1 可以反做，不一定继续当顺势恢复

- [Ali Flash Cards 第 73 页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0073.md)
- ![Ali Flash Cards 第73页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/images/page-0073.jpg)

这一页的核心语义是：弱 `L1/H1` 出现在错误背景里时，不应继续按高概率顺势恢复对待，很多时候更像 `fade weak signal`，而且更像 `limit + scalp`，不是正常 swing continuation。

### 2. first entry 被 lower buy / higher sell 救出来后，常见是 BE 或小利退出

- [百科幻灯片-3 第160页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- ![Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [基础篇第1173页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-1173.md)

对应语义：

- first buy / first sell 经常不是最终赚大钱的那一笔；
- 如果后面出现 lower buy / higher sell 或市场回到入场附近，第一笔常见处理是 `breakeven` 或小利润退出；
- 第二次入场才更常承担真正的 swing 任务。

### 3. 目标位必须考虑真实风险和真实可得利润

- [进阶篇第479页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md)
- ![1x Actual Risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/images/page-0479.jpg)

对应语义：

- 目标位不能只写在纸面上；
- 必须围绕 `Actual Risk` 和真正能拿到的净空间来算；
- 目标太近，连成本都覆盖不了，就不该继续按可交易 continuation 处理。

### 4. 紧密通道 / 宽通道 / 弱背景里，离场更接近 BE 或小 scalp

- [进阶篇第539页文本](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0539.md)

这一页和相关百科页共同支持这条判断：

- `tight channel / broad channel / weak trend` 里的恢复单，很多不是正常 swing；
- follow-through 差时，正确处理常常是 `BE / 小 scalp / 直接不做`，而不是继续等完整 swing。

## 三、这轮的实现变化

### 1. 弱 H1/L1 正式分成三种处置

在 [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py) 新增了前置分流：

- `fade_candidate`
- `no_trade_too_close`
- `scalp_only`

判断依据用的是共用结构字段，而不是品种特调：

- `setup_valid`
- `setup_clear_trend_leg`
- `setup_first_pullback_shape`
- `setup_pullback_depth_ratio`
- `setup_pullback_overlap_ratio`
- `market_state`
- `higher_market_state`
- `trendline_break_confirmed`
- `first_target_distance_r`
- 成本覆盖门槛

### 2. fade_candidate 不再只是标签，而是真正反做

弱 `H1/L1` 里，错误半区且目标太近的单，现在不再只是 block，而是会被改写成：

- `LIMIT fade`
- `management_style_override = brooks_scalp`
- `playbook_id = TR2_FAILED_BO_FADE`
- `playbook_family = tr_fade`
- `order_bias = fade`

并重新生成：

- 反向方向
- 反做 entry
- 反做 stop
- 反做第一目标

### 3. lower buy / higher sell rescue 已进入执行层

在 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py) 里，first-entry 的救援不再只是意图字段，而是能真正影响持仓：

- 先估算已经历过的反向 excursion
- 如果已经被更低买点 / 更高卖点“救回到接近入场”
- 且当前仍是弱背景 / 差 follow-through / first-entry 弱结构
- 就先移到 `BE`
- 条件更好时直接 `SCALP` 出场

这一步对应 Brooks 的：

- `Disappointed Bulls / Disappointed Bears`
- `lower buy / higher sell 帮 first entry 保本或小利退出`

### 4. 弱 Signal Bar 再放松一轮，但不破坏 STOP trigger

这轮没有回退 `STOP trigger`。仍然是：

- signal bar 外一跳触发
- 市场真实触发才入场

只继续放松了弱 `signal bar` 的边界：

- `outside_bar`
- `close_near_extreme`
- `valid_signal_bar`

也就是从“过度工程化硬 veto”往 Brooks 的“类型学 + 上下文偏好”收。

## 四、为什么 5m 更容易出问题，但这不是 15m 特调

用户关心的问题是：Brooks 主要做的是 `5m` 纳指，为什么我们系统反而 `5m` 更容易暴露问题。

当前判断是：

1. 这不是因为系统对 `15m` 特调。  
2. 也不是 Brooks 规则只适合某个时间周期。  
3. 真相是：`5m` 把错误暴露得更快、更狠。

更具体地说：

- `5m` 上 `broad range / weak trend / endless pullback` 更多；
- 单腿空间更短，假突破和差 follow-through 更多；
- 成本、滑点、最小目标距离更容易把纸面利润吃掉；
- 这正好把“弱 setup 该不该继续按 continuation 做”这个问题放大出来。

所以：

- `15m` 不是被特别优化了；
- `5m` 只是更严格的验收场；
- 只要规则真的是 Brooks 通用规则，它应该在 `5m/15m` 都能成立，只是 `5m` 更容易把弱规则打回原形。

## 五、回测结果

这轮仍然只看 `H1/L1` 单策略，不混别的策略族。

### fixed 3 窗口（v8 -> v9）

- 交易数：`20 -> 21`
- 加权胜率：`60.00% -> 61.90%`
- 平均 PF：`4.744 -> 4.860`
- 平均日频：`0.215 -> 0.226`

明细：

- `BTCUSDT 15m 2022-01-24 ~ 2022-02-23`
  - `11` 笔
  - 胜率 `81.82%`
  - PF `12.334`
- `BTCUSDT 5m 2024-08-10 ~ 2024-09-09`
  - `7` 笔
  - 胜率 `42.86%`
  - PF `0.851`
- `ETHUSDT 15m 2024-05-15 ~ 2024-06-14`
  - `3` 笔
  - 胜率 `33.33%`
  - PF `1.395`

### random 4 窗口（v8 -> v9）

- 交易数：`22 -> 23`
- 加权胜率：`59.09% -> 60.87%`
- 平均 PF：`6.562 -> 6.649`
- 平均日频：`0.177 -> 0.185`

明细：

- `BTCUSDT 5m 2024-08-10 ~ 2024-09-09`
  - `7` 笔
  - 胜率 `42.86%`
  - PF `0.851`
- `ETHUSDT 15m 2024-05-15 ~ 2024-06-14`
  - `3` 笔
  - 胜率 `33.33%`
  - PF `1.395`
- `BNBUSDT 15m 2023-10-01 ~ 2023-10-31`
  - `7` 笔
  - 胜率 `71.43%`
  - PF `9.352`
- `SOLUSDT 15m 2025-08-01 ~ 2025-08-31`
  - `6` 笔
  - 胜率 `83.33%`
  - PF `14.997`

对应结果文件：

- [fixed 结果 v9](/tmp/h1l1_setup_fixed_20260317_v9.json)
- [random 结果 v9](/tmp/h1l1_setup_random_20260317_v9.json)
- [v8 对照](/tmp/h1l1_setup_compare_v8_20260317.json)

## 六、这轮可以得出的结论

### 1. H1/L1 这条路已经不是“方向待定”

这轮之后可以确认：

- `STOP trigger` 是对的；
- 弱 setup 分流是对的；
- rescue 管理是对的；
- 这些都不是 `BTC 5m` 特调，而是可复用的通用模块。

### 2. 整体还没有“收官”，但已经明显更稳

现在的 `H1/L1`：

- fixed / random 都维持正 PF；
- 胜率都超过 `60%`；
- 最差样本 `BTC 5m 2024Q3` 仍然没过 `1`，但已经从早期的极差状态明显修复。

### 3. 当前最大剩余问题仍然是 5m 弱背景

`BTC 5m 2024Q3` 现在仍只有 `PF 0.851`，说明还没完全对齐 Brooks 的部分是：

- 弱 `signal bar` 的最后边界
- `fade_candidate` 的成交和目标可能还可更优
- `first-entry -> lower buy / higher sell rescue` 还可以继续贴近 Ali/Brooks 的 BE 退出语义

## 七、这些模块能不能给别的策略族复用

能，而且这正是现在最有价值的地方。

目前已经可复用的共用模块：

- `STOP trigger`
- `signal bar` 类型学骨架
- `actual risk`
- 结构止损类型
- 成本覆盖门槛
- `weak setup -> no-trade / scalp / fade` 分流
- `first-entry` 的 rescue 管理骨架

不建议现在立刻全量扩散的：

- `fade_candidate` 的细目标和细 entry 位置
- 弱 `signal bar` 的最后边界
- rescue 的细触发条件

也就是说，方向已经从“单一策略硬编码”转成：

- 先把 Brooks 知识点做成工具
- 再由不同策略模板去组装

## 八、下一步建议

下一步仍然建议先继续只打 `H1/L1`，再复制到别的策略族。顺序建议：

1. 继续拆 `BTCUSDT 5m 2024Q3` 里那 `7` 笔单  
2. 继续收弱 `signal bar` 的边界  
3. 再把 `fade_candidate` 的目标和 entry 位置往 Ali/Brooks 案例继续贴  

等 `BTC 5m` 也站稳后，再把：

- `weak setup disposition`
- `first-entry rescue`
- 成本门槛

扩到 `H2/L2`、突破回调、`20均线缺口 / 第一均线缺口 / MAG`。
