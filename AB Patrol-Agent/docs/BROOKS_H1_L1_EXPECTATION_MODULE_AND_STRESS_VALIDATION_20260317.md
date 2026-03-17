# H1/L1 预期层级模块化与压力验证复盘

更新时间：2026-03-17

## 一、这轮做了什么

这轮不是继续围着某个 `5m` 个案加过滤，而是把 `H1/L1` 里已经稳定下来的 Brooks 语义，正式拆成可复用模块：

1. 把 `rescue / close-test / swing / scalp / fade` 预期层级从大文件里拆出；
2. 把 `H1/L1 expectation` 从 detector 透传到 pending order、trade、report；
3. 把 `H1/L1 first-entry` 的管理目标与分批，从 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py) 里抽到独立模块；
4. 给 `H1/L1` 增加 `stress15m`、`stress1h` 压力验证，确认这批共用模块不会只在 `5m/15m` 某几个窗口里看起来有效。

## 二、对应代码位置

### 2.1 新增/重构模块

- [h1_l1_targets.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/h1_l1_targets.py)
- [h1_l1_management.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/h1_l1_management.py)

### 2.2 透传链路

- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
- [report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

### 2.3 压力验证脚本

- [h1l1_setup_probe.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/h1l1_setup_probe.py)

## 三、这轮模块化后，结果有没有变差

先说结论：**没有。**

本轮新的 `v12` 结果，和统一多周期背景后的当前稳定基线一致：

### 3.1 fixed 3 窗口

- 结果文件：[/tmp/h1l1_setup_fixed_v12_20260317.json](/tmp/h1l1_setup_fixed_v12_20260317.json)
- `total_trades=23`
- `weighted_win_rate=65.22%`
- `average_profit_factor=7.1900`
- `average_daily_trades=0.2473`

### 3.2 random 4 窗口

- 结果文件：[/tmp/h1l1_setup_random_v12_20260317.json](/tmp/h1l1_setup_random_v12_20260317.json)
- `total_trades=24`
- `weighted_win_rate=66.67%`
- `average_profit_factor=192.4748`
- `average_daily_trades=0.1935`

### 3.3 stress5m

- 结果文件：[/tmp/h1l1_setup_stress5m_v12_20260317.json](/tmp/h1l1_setup_stress5m_v12_20260317.json)
- `total_trades=90`
- `weighted_win_rate=38.89%`
- `average_profit_factor=1.5126`
- `average_daily_trades=0.4147`

### 3.4 stress15m

- 结果文件：[/tmp/h1l1_setup_stress15m_v12_20260317.json](/tmp/h1l1_setup_stress15m_v12_20260317.json)
- `total_trades=47`
- `weighted_win_rate=72.34%`
- `average_profit_factor=133.3409`
- `average_daily_trades=0.2527`

### 3.5 stress1h sample

- 结果文件：[/tmp/h1l1_setup_stress1h_sample_v12_20260317.json](/tmp/h1l1_setup_stress1h_sample_v12_20260317.json)
- `total_trades=12`
- `weighted_win_rate=91.67%`
- `average_profit_factor=Infinity`
- `average_daily_trades=0.1290`

## 四、怎么理解这些结果

### 4.1 这轮更像“正确性/可维护性重构”，不是新 alpha

因为这轮的目标不是再去挤一个小窗口的结果，而是：

- 把已经确认有效的 Brooks 语义做成公用模块；
- 保证拆分后 fixed/random/stress 不退化；
- 为 `H2/L2`、突破回调、gap 族复用这套模块打基础。

从结果看，这个目标已经达到：

- 没把 `fixed/random/stress5m` 打坏；
- `15m`、`1h` 的压力验证没有出现“拆分后大周期反而退化”的问题；
- 说明这批模块，至少不是某个窗口或某个周期的 if/else 特调。

### 4.2 不能只看 average PF

这几组里，`random`、`stress15m`、`stress1h` 的平均 PF 会被少量极强样本拉高。

所以更稳妥的解读是：

- `fixed/random/stress5m` 至少证明模块化没有破坏当前可用边；
- `stress15m/stress1h` 只说明这批公用模块没有明显把更大周期带坏；
- `1h` 样本仍然偏少，只能算 sanity check，不能宣称“1h 已经稳定”。

## 五、这轮是否引入了品种/行情/周期特调

没有发现。

这轮新增逻辑主要是：

- `expectation` 的分类；
- `first-entry` 目标与分批模板；
- 压力验证分组。

当前没有看到：

- `BTC/ETH/BNB/SOL` 核心交易分支；
- 某个年份、某段日期的硬编码；
- `5m` 一套理论、`15m` 一套理论。

对应审计见：

- [H1/L1 普适性与 Brooks 对齐审计](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_H1_L1_GENERALITY_AND_COMPLIANCE_AUDIT_20260317.md)
- [H1/L1 多时间周期统一性审计](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_H1_L1_MULTI_TIMEFRAME_UNIFORMITY_AUDIT_20260317.md)

## 六、这轮和 Brooks 原文的关系

这轮模块化对应的核心 Brooks 语义是：

1. `first entry` 不是默认都期待 continuation swing；
2. 弱 `first entry` 很多时候只该期待：
   - `rescue`
   - `close-test`
   - `BE / 小利退出`
3. 背景弱时，`fade / scalp / no-trade` 是合理分流，不是硬凑 continuation；
4. `actual risk` 与 `1x Actual Risk` 的目标层级必须明确写进代码，而不是只留在文档里。

这批依据主要来自：

- [H1/H2 文本页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/阿布10种最佳价格行为交易模式/pages/page-0005.md)
- [Disappointed Bulls](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/百科幻灯片-3/pages/page-0160.md)
- [1x Actual Risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/2.《价格行为学》（进阶篇37-52章）/pages/page-0479.md)
- [Ali 73](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0073.md)
- [Ali 588](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/LLM可读版/Ali Flash Cards - 完美裁切A3宽(4K屏推荐)/pages/page-0588.md)

## 七、这轮之后，什么可以放心复用

当前我认为已经可以安全复用到别的策略族的模块有：

- `STOP trigger`
- `actual risk`
- 多周期 `结构周期 / 主背景周期 / 锚定周期`
- `fade / scalp / no-trade` 的弱 setup 分流骨架
- `rescue / close-test / swing` 的目标层级骨架
- `first-entry` 的 partial / BE / runner 管理骨架

## 八、下一步建议

这轮之后，不该再围着 `H1/L1` 的大文件继续堆逻辑。更值的是：

1. 把这批已稳定的公用模块扩到：
   - `H2/L2`
   - `突破回调`
2. 扩完后用同样的：
   - `fixed`
   - `random`
   - `stress5m`
   - `stress15m`
   - `stress1h`
   做压力验证；
3. 保持“模块层共享，策略层逐族推进”的节奏，不再回到按窗口微调。
