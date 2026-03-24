# 趋势恢复族第二轮最小修正复盘

更新时间：2026-03-16

## 1. 这轮改了什么

这轮不是整族硬改，而是只围绕上一轮复盘里确认的 4 个点做最小修正：

1. 保留 `STOP` 触发语义，但把 `price` 恢复成 signal bar 参考价
2. 保留 `entry_trigger = signal bar 高低点外一跳`
3. 把 `20均线缺口 / 第一均线缺口 / MAG` 按 Brooks 与太妃课程继续拆细
4. 把趋势恢复族的目标位改成“结构目标优先，风险倍数回退”

实际落点：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)

## 2. 这轮参考的资料

### 2.1 LLM可读版

- `H1/H2/L1/L2`
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md)
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- `突破回调`
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0008.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0008.md)
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0010.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0010.md)
- `MAG / MA gap`
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-0665.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-0665.md)
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-1159.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-1159.md)

### 2.2 太妃价格行为

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L13A - 急速交易 - ✨收线.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L13A - 急速交易 - ✨收线.md)

这轮主要吸收的是：

1. `20均线缺口` 更像“20-30 根同侧后首次回测”
2. `第一均线缺口` 必须先真实穿到 EMA 对侧，再回到原趋势侧
3. 目标位优先原趋势极值，可略微前移
4. `STOP` 订单必须在 signal bar 外一跳触发

## 3. 回测文件

基线：

- [/tmp/metricfix_baseline_fixed_20260315.json](/tmp/metricfix_baseline_fixed_20260315.json)
- [/tmp/metricfix_baseline_random_20260315.json](/tmp/metricfix_baseline_random_20260315.json)

本轮结果：

- [/tmp/trend_recovery_fixed_v2_20260316.json](/tmp/trend_recovery_fixed_v2_20260316.json)
- [/tmp/trend_recovery_random_v2_20260316.json](/tmp/trend_recovery_random_v2_20260316.json)

对照汇总：

- [/tmp/trend_recovery_detector_compare_v2_20260316.json](/tmp/trend_recovery_detector_compare_v2_20260316.json)

## 4. 总体结果

### 4.1 固定 3 窗口

- 总交易：`648 -> 575`
- 日均频率：`6.97 -> 6.18`
- 加权胜率：`31.64% -> 29.04%`
- 平均 PF：`0.973 -> 0.718`

### 4.2 随机 4 窗口

- 总交易：`800 -> 738`
- 日均频率：`6.45 -> 5.95`
- 加权胜率：`27.88% -> 27.78%`
- 平均 PF：`0.976 -> 0.822`

结论先说：**这轮仍然是负优化，不能直接保留。**

## 5. 逐窗口结果

### 5.1 固定 3 窗口

- `F1_BTC_5m_2022`
  - 交易：`376 -> 352`
  - 日均：`12.13 -> 11.35`
  - 胜率：`30.59% -> 28.98%`
  - PF：`1.070 -> 0.915`

- `F2_BTC_15m_2022`
  - 交易：`140 -> 115`
  - 日均：`4.52 -> 3.71`
  - 胜率：`36.43% -> 32.17%`
  - PF：`0.936 -> 0.763`

- `F3_ETH_15m_2023Q1`
  - 交易：`132 -> 108`
  - 日均：`4.26 -> 3.48`
  - 胜率：`29.55% -> 25.93%`
  - PF：`0.912 -> 0.476`

### 5.2 随机 4 窗口

- `R1_BTC_5m_2024Q3`
  - 交易：`375 -> 367`
  - 日均：`12.10 -> 11.84`
  - 胜率：`26.40% -> 25.89%`
  - PF：`0.879 -> 0.675`

- `R2_ETH_15m_2024Q2`
  - 交易：`130 -> 117`
  - 日均：`4.19 -> 3.77`
  - 胜率：`25.38% -> 26.50%`
  - PF：`0.706 -> 0.564`

- `R3_BNB_15m_2023Q4`
  - 交易：`139 -> 115`
  - 日均：`4.48 -> 3.71`
  - 胜率：`25.18% -> 26.09%`
  - PF：`0.991 -> 0.782`

- `R4_SOL_15m_2025Q3`
  - 交易：`156 -> 139`
  - 日均：`5.03 -> 4.48`
  - 胜率：`35.90% -> 35.25%`
  - PF：`1.328 -> 1.268`

## 6. 家族层变化

### 6.1 固定窗口

- `趋势恢复族`：`1.134 -> 0.887`
- `MTR反转族`：`0.994 -> 0.803`
- `突破追随族`：`0.733 -> 0.866`
- `高潮/陷阱反转族`：`0.431 -> 0.455`

### 6.2 随机窗口

- `趋势恢复族`：`1.038 -> 0.891`
- `MTR反转族`：`1.137 -> 0.964`
- `突破追随族`：`0.621 -> 1.152`
- `高潮/陷阱反转族`：`0.124 -> 0.267`

结论：

- 这轮对 `突破追随族` 和 `高潮/陷阱反转族` 有局部正反馈
- 但它明显伤到了这轮本来要优化的 `趋势恢复族`
- 并且连 `MTR反转族` 也一起带坏了

## 7. 趋势恢复族内部变化

### 7.1 固定窗口

- `高1`
  - 交易：`34 -> 38`
  - 胜率：`35.29% -> 31.58%`
  - PF：`1.693 -> 1.213`
- `低1`
  - 交易：`20 -> 32`
  - 胜率：`40.00% -> 40.63%`
  - PF：`2.806 -> 1.863`
- `高2`
  - 交易：`83 -> 40`
  - 胜率：`30.12% -> 27.50%`
  - PF：`1.164 -> 1.253`
- `低2`
  - 交易：`76 -> 34`
  - 胜率：`34.21% -> 11.76%`
  - PF：`0.849 -> 0.192`

### 7.2 随机窗口

- `高1`
  - 交易：`32 -> 55`
  - 胜率：`28.13% -> 23.64%`
  - PF：`2.276 -> 0.794`
- `低1`
  - 交易：`31 -> 57`
  - 胜率：`22.58% -> 19.30%`
  - PF：`0.464 -> 0.557`
- `高2`
  - 交易：`121 -> 51`
  - 胜率：`25.62% -> 25.49%`
  - PF：`0.989 -> 0.917`
- `低2`
  - 交易：`104 -> 45`
  - 胜率：`24.04% -> 35.56%`
  - PF：`1.030 -> 1.328`

### 7.3 均线缺口类

- `20均线缺口`
  - 固定窗口：`2 -> 0`
  - 随机窗口：`1 -> 0`
- `第一均线缺口`
  - 固定窗口：`0 -> 0`
  - 随机窗口：`0 -> 0`
- `MAG 20/20 Setup`
  - 固定窗口：`0 -> 0`
  - 随机窗口：`0 -> 0`

这里有一个很重要的信号：**gap 子流程在当前实现下被压得太死了，几乎没有有效成交。**

## 8. 管理层副作用

固定窗口：

- `protective_stop_exit`：`313 -> 255`
- `breakeven_stop_exit`：`314 -> 273`
- `plain_stop_loss_exit`：`37 -> 54`
- `protective_scalp_involved`：`421 -> 340`
- `trailing_stop_exit`：`379 -> 326`

随机窗口：

- `protective_stop_exit`：`413 -> 341`
- `breakeven_stop_exit`：`416 -> 364`
- `plain_stop_loss_exit`：`36 -> 53`
- `protective_scalp_involved`：`535 -> 455`
- `trailing_stop_exit`：`492 -> 412`

表面上看，`protective_stop_exit` 变少了，但问题不是“质量变好”，而是：

1. 交易数整体也减少了
2. `plain_stop_loss_exit` 反而增多
3. 说明这轮改动把不少单从“可管理的 continuation”打成了更差的止损型交易

## 9. 为什么这轮会失败

### 9.1 `STOP` 方向没错，错在它混进了前端定价和路由

这轮最初的目标是：

- `price` 回到 signal bar 参考价
- `entry_trigger` 负责真正的 stop 触发

但当前实现里仍然留下了太多“用 stop 触发价反向影响前端逻辑”的痕迹：

- 目标位计算基于新的 signal price 体系被整体重写
- detector 的结构极值统计窗口也一起变了
- 结果是这轮不只是改了订单触发，而是改了前端整个风险和收益基准

### 9.2 结构目标位仍然拆得不够细

虽然已经不是固定 `2R/3R`，但还是把以下几类 continuation 处理得过于相似：

- `高1/低1`
- `高2/低2`
- `突破回调`
- `20均线缺口`
- `第一均线缺口`

但从 Brooks 原文和太妃笔记看，它们至少应该分成：

1. `first entry continuation`
2. `second entry continuation`
3. `breakout pullback continuation`
4. `MA gap continuation`

这轮没有把这四层彻底拆开。

### 9.3 gap 子流程被压死了

这轮虽然 detector 按课程做得更“像话”，但现实结果是：

- fixed/random 里几乎没有 gap 成交

这说明当前条件组合仍然过严，或者 gap 还应该把“原趋势极值优先”和“只做第一次回测”拆得更显式，而不是直接一刀切地压信号。

## 10. 这轮哪些认知应该保留

应该保留的不是代码，而是下面这些结论：

1. `STOP` 订单必须保留  
   signal bar 外一跳触发，这一点没问题。

2. `price` 和 `entry_trigger` 不能再混  
   这个方向是对的，但当前代码实现还不够干净。

3. `20均线缺口 / 第一均线缺口 / MAG` 确实必须拆成不同子流程  
   只是这轮拆法还不够稳。

4. 结构目标位方向是对的  
   但要进一步拆成更细的 continuation 子模板。

## 11. 当前建议

这轮**不要提交**，也**不要作为当前最优版本保留**。

下一轮如果继续，不应该再整族一起改，而应该只做下面 3 件事：

1. 把 `高1/低1`、`高2/低2`、`突破回调`、`均线缺口类` 的目标位模板彻底拆开  
2. gap 子流程单独开一轮，只盯“为什么成交几乎被压没了”  
3. 继续保留 `entry_trigger` 的 Brooks 语义，但停止对 detector 前端窗口做大范围连带修改

## 12. 一句话结论

这轮证明了：

- 我们对 `STOP` 订单和 gap continuation 的方向理解是对的
- 但当前实现方式仍然会把趋势恢复族整体做坏

所以这次最值钱的不是代码，而是更明确地排除了一个“看起来合理、实际会让 fixed/random 一起变差”的实现路径。
