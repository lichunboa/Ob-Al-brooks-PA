# H2/L2 与突破回调共用模块扩展复盘

日期：2026-03-17

## 目标

这轮工作的目标不是继续单独优化 `H1/L1`，而是把已经在 `H1/L1` 上稳定下来的共用模块，扩展到趋势恢复族的另外两组策略：

- `高2 / 低2`
- `突破回调`

扩展的前提是：

1. 仍然只使用一套 Al Brooks 语义，不做按品种、按时间周期、按日期窗口的特调。
2. 共用的模块必须先拆出来，再给其他策略族复用，避免把几千行主文件继续堆大。
3. 扩展后必须用与 `H1/L1` 同口径的 `fixed / random / stress5m` 回测做验证。

## 这轮做了什么

### 1. 从主文件里拆出 H2/L2 模板

新增：

- [h2_l2_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/h2_l2_template.py)

拆出的能力包括：

- `H2/L2` 的 `STOP` 入场语义
- `signal bar` 类型沿用 `H1/L1` 已稳定的通用类型学
- `second-entry` 的初始止损方案
- `close-test / swing / stretch` 目标层级
- `H2/L2` 专属的管理意图字段

### 2. 从主文件里拆出突破回调模板

新增：

- [breakout_pullback_template.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/breakout_pullback_template.py)

拆出的能力包括：

- `breakout point`
- `breakout extreme`
- `breakout pullback` 的结构止损
- `breakout_point / close-test / swing` 三层目标
- `breakout_pullback_continuation` 管理模板

### 3. 把趋势恢复族的持仓管理抽成共用模块

新增：

- [trend_recovery_management.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/trend_recovery_management.py)

这一步的意义是：

- `H1/L1`
- `H2/L2`
- `突破回调`

不再在 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py) 里各写一套 `tp1 / tp2 / partial / runner`。  
现在统一由趋势恢复族共用 dispatcher 分发。

### 4. 新增专用验证脚本

新增：

- [trend_recovery_probe.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/trend_recovery_probe.py)

脚本用途：

- 只回测 `高2 / 低2 / 突破回调`
- 复用 `fixed / random / stress5m`
- 每跑完一个场景立刻落盘，避免长任务跑完前完全没数据

## 与 Al Brooks 的对应关系

这轮扩展不是凭空造新逻辑，而是沿用已经在 `H1/L1` 上验证过的 Brooks 模块，再对照 `H2/L2` 和 `breakout pullback` 的原文/案例。

### H2/L2

直接参考：

- [page-0005.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- ![H1/H2 原文图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/images/page-0005.jpg)
- [page-1218.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-1218.md)
- [page-1008.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-1008.md)
- [page-2346.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-2346.md)

这几处支持的核心点：

- `H2/L2` 本质上是 `second entry`
- `second entry` 可以比 `first entry` 期待更完整的 continuation
- 但第一目标仍然应当先看最近结构测试位，再决定 runner

### 突破回调

直接参考：

- [page-0624.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0624.md)
- [page-0742.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0742.md)
- [page-1603.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-1603.md)
- [page-2684.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-2684.md)

这几处支持的核心点：

- 突破回调首先要看 `breakout point` 的测试
- 其次再看 `breakout extreme / measured move`
- 不是所有突破回调都该一上来按 full swing 管

### highest close / rescue / close-test

直接参考：

- [page-0160.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- ![Disappointed Bulls 图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/images/page-0160.jpg)
- [page-0316.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0316.md)
- [page-1688.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/1.《价格行为学》（基础篇1-36章）/pages/page-1688.md)

这几处支持的核心点：

- `first entry` 失败后，很多时候先期待测试 `highest close / lowest close`
- `second entry` 更容易把 `first entry` 救到保本或小盈利
- 所以 `H1/L1`、`H2/L2`、`breakout pullback` 需要共享 `close-test / rescue / swing` 分层目标

## 回测验证

### fixed

文件：

- [/tmp/trend_recovery_fixed_v1_20260317.json](/tmp/trend_recovery_fixed_v1_20260317.json)

汇总：

- 总交易：`239`
- 加权胜率：`39.33%`
- 平均 PF：`1.9955`
- 平均日频：`2.57`

场景：

- `F1_BTC_15m_2022`：`35` 笔，胜率 `51.43%`，PF `0.7337`
- `F2_BTC_5m_2024Q3`：`169` 笔，胜率 `33.14%`，PF `0.7207`
- `F3_ETH_15m_2024Q2`：`35` 笔，胜率 `57.14%`，PF `4.5321`

### random

文件：

- [/tmp/trend_recovery_random_v1_20260317.json](/tmp/trend_recovery_random_v1_20260317.json)

汇总：

- 总交易：`295`
- 加权胜率：`40.68%`
- 平均 PF：`2.2850`
- 平均日频：`2.38`

场景：

- `R1_BTC_5m_2024Q3`：`169` 笔，胜率 `33.14%`，PF `0.7207`
- `R2_ETH_15m_2024Q2`：`35` 笔，胜率 `57.14%`，PF `4.5321`
- `R3_BNB_15m_2023Q4`：`41` 笔，胜率 `41.46%`，PF `1.0695`
- `R4_SOL_15m_2025Q3`：`50` 笔，胜率 `54.00%`，PF `2.8175`

### stress5m

文件：

- [/tmp/trend_recovery_stress5m_v1_20260317.json](/tmp/trend_recovery_stress5m_v1_20260317.json)

汇总：

- 总交易：`1284`
- 加权胜率：`39.95%`
- 平均 PF：`1.0818`
- 平均日频：`5.92`

场景：

- `P1_BTC_5m_2022Q1`：`142` 笔，胜率 `46.48%`，PF `1.0158`
- `P2_BTC_5m_2024Q1`：`209` 笔，胜率 `27.27%`，PF `0.5959`
- `P3_BTC_5m_2024Q3`：`169` 笔，胜率 `33.14%`，PF `0.7207`
- `P4_ETH_5m_2022Q1`：`164` 笔，胜率 `56.71%`，PF `2.3034`
- `P5_ETH_5m_2024Q3`：`181` 笔，胜率 `36.46%`，PF `0.8292`
- `P6_BNB_5m_2024Q3`：`220` 笔，胜率 `33.64%`，PF `0.7636`
- `P7_SOL_5m_2025Q3`：`199` 笔，胜率 `50.75%`，PF `1.3437`

## 怎么理解这轮结果

### 可以确认的正面结论

1. `H1/L1` 上稳定下来的共用模块，确实能扩到 `H2/L2` 和 `突破回调`。
2. 这不是对某个品种、某个日期窗口、某个时间周期的硬编码特调。
3. `fixed / random / stress5m` 三组验证中，总体都还是正 PF。
4. 这说明：
   - `STOP trigger`
   - `actual risk`
   - `close-test / rescue / swing`
   - 趋势恢复族的共用管理 dispatcher
   
   这些模块已经具备跨策略复用价值。

### 仍然没有打透的地方

`5m` 仍然有弱场景没有打透，尤其：

- `BTC 5m 2024Q1`
- `BTC 5m 2024Q3`
- `ETH 5m 2024Q3`
- `BNB 5m 2024Q3`

这说明：

- 共用模块可以扩过去
- 但 `5m` 弱背景下的边界规则仍不稳定
- 下一轮不该回退这轮模块扩展，而应该继续打：
  - `5m` 弱背景的 `second-entry / breakout pullback`
  - `no-trade / scalp / rescue / close-test / swing` 的适用边界

## 是否还有不合理的大模块

有改善，但还没彻底拆完。

已经明显拆出来的有：

- `H1/L1` 模板
- `H2/L2` 模板
- `突破回调` 模板
- 趋势恢复族共用管理模块
- 趋势恢复族专用 probe

仍然偏大的主文件有：

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

但这轮至少证明了方向是对的：  
**先把共用模块拆出来，再继续按策略族扩展，比继续在主文件里堆条件要好。**

## 结论

这轮可以下的判断是：

- `H2/L2`、`突破回调` 已经成功接上 `H1/L1` 的稳定共用模块
- 总体验证为正
- `5m` 仍有弱场景没打透，但这不否定扩展方向
- 现在可以继续在趋势恢复族里往下打 `5m` 弱背景边界
- 然后再考虑继续扩到 `20均线缺口 / 第一均线缺口 / MAG`

