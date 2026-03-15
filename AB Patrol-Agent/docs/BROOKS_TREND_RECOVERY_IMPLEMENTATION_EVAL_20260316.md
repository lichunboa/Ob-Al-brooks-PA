# 趋势恢复族第一轮代码落地与回测复盘

更新时间：2026-03-16

## 1. 本轮做了什么

本轮只改了趋势恢复族 detector，不碰管理链，目标是把前一轮讨论确认的 4 个点落到代码：

1. `高1/低1/高2/低2` 统一改成 `STOP` 触发  
2. `STOP` 订单统一改成 signal bar 高低点外一跳触发  
3. `20均线缺口 / 第一均线缺口 / MAG` 重按新资料拆开  
4. 目标位从固定 `2R / 2.5R / 3R` 改成“结构目标优先，风险倍数回退”

实际落点：

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)

## 2. 这轮依据了哪些资料

### 2.1 LLM可读版

- `H1/H2/L1/L2`
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0004.md)
- `突破回调`
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0008.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0008.md)
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0010.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0010.md)
- `MA gap / MAG`
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-0665.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-0665.md)
  - [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-1159.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-1159.md)

### 2.2 太妃课程

- [/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/太妃价格行为/L17B - ✨20均线缺口-✨第一均线缺口.md)

这份资料本轮主要用了 3 条：

1. `20均线缺口` 更舒服的数量区间是 `20-30`
2. `第一均线缺口` 需要先有一次真实穿到 EMA 对侧，再回到原趋势侧
3. 目标位优先看原趋势极值，且可以略微提前离场

## 3. 回测结果

### 3.1 固定 3 窗口

基线文件：

- [/tmp/metricfix_baseline_fixed_20260315.json](/tmp/metricfix_baseline_fixed_20260315.json)

本轮结果：

- [/tmp/trend_recovery_detector_validation_20260316.json](/tmp/trend_recovery_detector_validation_20260316.json)

整体变化：

- 总交易：`648 -> 574`
- 日均频率：`6.97 -> 6.17`
- 加权胜率：`31.64% -> 29.27%`
- 平均 PF：`0.991 -> 0.768`

逐窗口：

- `F1_BTC_5m_2022`
  - 交易：`376 -> 352`
  - 日均：`12.13 -> 11.35`
  - 胜率：`30.59% -> 29.26%`
  - PF：`1.070 -> 0.868`
- `F2_BTC_15m_2022`
  - 交易：`140 -> 114`
  - 日均：`4.52 -> 3.68`
  - 胜率：`36.43% -> 32.46%`
  - PF：`0.936 -> 0.786`
- `F3_ETH_15m_2023Q1`
  - 交易：`132 -> 108`
  - 日均：`4.26 -> 3.48`
  - 胜率：`29.55% -> 25.93%`
  - PF：`0.912 -> 0.477`

### 3.2 随机 4 窗口

基线文件：

- [/tmp/metricfix_baseline_random_20260315.json](/tmp/metricfix_baseline_random_20260315.json)

本轮结果：

- [/tmp/trend_recovery_detector_validation_20260316.json](/tmp/trend_recovery_detector_validation_20260316.json)

整体变化：

- 总交易：`800 -> 733`
- 日均频率：`6.45 -> 5.91`
- 加权胜率：`27.88% -> 28.10%`
- 平均 PF：`0.992 -> 0.863`

逐窗口：

- `R1_BTC_5m_2024Q3`
  - PF：`0.879 -> 0.717`
- `R2_ETH_15m_2024Q2`
  - PF：`0.706 -> 0.589`
- `R3_BNB_15m_2023Q4`
  - PF：`0.991 -> 0.780`
- `R4_SOL_15m_2025Q3`
  - PF：`1.328 -> 1.327`

## 4. 家族层结论

### 4.1 固定窗口

- `趋势恢复族`：`1.134 -> 0.807`
- `MTR反转族`：`0.994 -> 0.821`
- `突破追随族`：`0.733 -> 0.865`
- `高潮/陷阱反转族`：`0.431 -> 0.454`

### 4.2 随机窗口

- `趋势恢复族`：`1.038 -> 1.023`
- `MTR反转族`：`1.137 -> 0.961`
- `突破追随族`：`0.621 -> 1.161`
- `高潮/陷阱反转族`：`0.124 -> 0.265`

## 5. 这轮最重要的判断

### 5.1 哪些启发是对的

这轮不是一无是处，至少确认了 3 件事：

1. `STOP` 触发语义本身是对的  
2. `突破追随族` 对“更严格的 trigger + 结构目标位”是有正反馈的  
3. `高潮/陷阱反转族` 在随机窗口也有小幅修复，不是完全没用

### 5.2 哪些实现是错的

这轮**不能保留为当前最优实现**，原因不是理念错，而是实现层有 3 处明显还不对：

#### A. 把 `price` 也一起改成了 `entry_trigger`

这会把 `STOP` 触发价提前混进：

- 路由前置判断
- 风险计算
- 回测挂单前的信号评估

而当前系统原本是：

- `price` = signal bar 形成时的参考价
- `entry_trigger` = 真正 stop 触发价

本轮把两者合并，导致趋势恢复族在固定窗口里明显变差。  
这说明：**STOP 语义应该主要落在 `entry_trigger`，而不是粗暴改掉内部基准价。**

#### B. 结构目标位层级还不够细

我这轮虽然把目标位从固定 `R` 改成了结构目标，但还是太粗：

- `高1/低1`
- `高2/低2`
- `突破回调`
- `20均线缺口`
- `第一均线缺口`

现在都还是“先找一个最近结构目标”。

但 Brooks 原文里，这几类 continuation 的目标层级并不一样：

- `H1/L1`：更偏 first test / scalp part
- `H2/L2`：更偏 prior high/low + measured move
- `Breakout Pullback`：更偏 breakout test 完成后的趋势极值 / measured move
- `20 gap / 1st gap`：更偏原趋势极值，而不是统一最近结构位

#### C. `20均线缺口 / 第一均线缺口 / MAG` 虽然分流了，但还没分到管理层

当前只是 detector 分流：

- `20均线缺口`
- `MAG 20/20 Setup`
- `第一均线缺口`

但回测执行和管理上，还没有形成完全不同的目标/保护语义。  
这会让 detector 分得更细，但后端仍然按同一套 continuation 方式处理，收益容易失真。

## 6. 所以这轮要不要留

结论：**不要整体留。**

更准确地说：

- 理念上应保留：
  - `STOP` 触发思路
  - signal bar 外一跳
  - 结构目标位
  - `20 gap / first gap / MAG` 分流
- 代码上不应直接保留：
  - 这轮把 `price` 也改成 `entry_trigger` 的实现
  - 这轮当前这版“统一最近结构目标”的目标逻辑

## 7. 下一轮更合理的做法

下一轮不要整族一起硬改，应该只做下面 3 件事：

1. 保留 `entry_trigger = signal_bar 高低点外一跳`，但把 `price` 恢复成 signal bar 参考价  
2. 单独给 `H1/L1`、`H2/L2`、`突破回调`、`20 gap/1st gap` 做不同目标层级  
3. 先只改趋势恢复族，不碰别的家族，再跑同一套 fixed/random 场景

## 8. 当前建议

这轮最值得保留的讨论成果，不在代码，而在认知：

- `STOP` 订单启发是对的
- `price` / `entry_trigger` 不能混
- 结构目标不能一把梭
- `20 gap / 第一均线缺口 / MAG` 必须真正拆成不同子流程

这才是下一轮继续优化时应该抓住的点。
