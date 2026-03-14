# Brooks 零基代码审计报告（2026-03-15）

> 目的：不再做局部猜测式优化，而是按“归零法”把整条交易系统从前到后、从里到外重新体检一遍。
> 方法：先把所有可能导致 `频率 / 胜率 / PF` 上不去的原因全部列出来，再逐层对照当前代码和 Al Brooks 资料，判断哪些已经对齐，哪些仍然偏离，哪些只是工程近似。

---

## 1. 审计边界

这次只审当前真实连通的主链：

1. 背景识别
2. 候选策略 detector
3. Playbook 路由 / 订单类型 / 执行前过滤
4. 入场评估（P / R / 风格一致性）
5. `premise / strength`
6. `protective / scratch / scalp`
7. `BE / trailing / partial / TP`
8. `re-entry / add-on`
9. 成本模型

当前代码主落点：

- [analysis.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)
- [risk.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/risk.py)
- [playbook_router.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/playbook_router.py)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)
- [manager.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/manager.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- [selected_management_report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/selected_management_report.py)

---

## 2. 审计依据

### 2.1 Patrol 知识文件

- [S4-strategy-match.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/S4-strategy-match.md)
- [S5-evaluation.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/S5-evaluation.md)
- [S6-channel.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/S6-channel.md)
- [S7-management.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/S7-management.md)
- [Q6-management.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/quotes/Q6-management.md)

### 2.2 课程与截图证据

优先复用已经整理好的页图：

- [BROOKS_PDF_EVIDENCE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)
- ![所有市场和时间周期都有相同价格行为](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_timeframe_same-0100.png)
- ![H2 标准页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_h2-0012.png)
- ![进入通道就按通道交易](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_trade_like_channel-0290.png)
- ![管理比寻找完美 setup 更重要](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_management_key-0337-0337.png)
- ![保本止损不要被打两次](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_breakeven_twice-0071-0071.png)

### 2.3 百科与课程结论

本次审计重点使用的 Brooks 原意：

1. 所有市场与所有周期服从同一套价格行为，不允许“为某个周期单独造规则”。
2. 先定背景，再选 playbook，再评估 TE，再下单，再按原定风格管理。
3. `H1/H2/L1/L2` 是趋势恢复的标准语义，不应被工程分数系统替代。
4. 大多数反转只是 `minor reversal`，必须区分 `major channel break` 与普通失败腿。
5. 管理比入场更重要，但管理不能混淆 `scalp` 与 `swing`。
6. 止损永远是真实止损；但 premise 变化时，允许降级成保护性管理，而不是一刀切。

---

## 3. 归零法：先列出所有可能的系统性问题

如果系统优化很多轮仍不能稳定正收益，理论上可能来自下面 10 类问题：

1. 背景识别错了，把趋势看成区间，或把区间看成趋势。
2. detector 太松，放了大量不是 Brooks setup 的假信号。
3. detector 太紧，真正的 Brooks setup 被漏掉。
4. Playbook 路由与订单类型不一致。
5. 入场评估与止损逻辑不符合 Brooks 的 `P×R` 和 `obvious stop`。
6. `premise` 判断混入了非 Brooks 条件。
7. `strength` 用工程打分替代了 Brooks 结构判断。
8. 保护性管理没有把弱单优雅转成 `scratch / BE / 小 scalp`。
9. `partial / trailing / TP / re-entry / add-on` 与 Brooks 实战处理不一致。
10. 成本模型和市场不匹配，导致统计判断失真。

下面逐条代码级审。

---

## 4. 模块级代码审计

### 4.1 背景识别层

代码：

- [analysis.py:97](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L97)
- [analysis.py:116](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L116)
- [analysis.py:147](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L147)

结论：

- **对齐的部分**
  - `TrendValidator` 已经把“更高一级周期”当背景，而不是把具体 `15m/1h` 写进策略逻辑，这一点符合 Brooks 的“大周期是背景，不是禁止”。
  - 聚合逻辑是 `当前周期 -> 更高一级背景`，方向上正确。

- **偏差点**
  - [analysis.py:20](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L20) 到 [analysis.py:45](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L45) 的 `TradingSession` 强度系数，本质上是时段权重工程规则，不是 Brooks 主理论。
  - [analysis.py:161](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L161) 到 [analysis.py:172](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L172) 用 `EMA slope ±0.1` 判断高一级背景冲突，仍然偏工程化，过于“单轴方向化”。Brooks 更强调状态、位置、边缘和跟进，而不只是 EMA 斜率。

- **审计判断**
  - 背景层**方向是对的**，但还不是完整 Brooks 背景识别。
  - 当前它更像“趋势方向 veto”，而不是“状态 + 位置 + 对侧风险”的完整背景。

### 4.2 候选 detector 层

代码：

- [pa_engine.py:883](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py#L883) `第二腿陷阱`
- [pa_engine.py:1022](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py#L1022) `看衰突破`
- [pa_engine.py:1585](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py#L1585) `急速通道`
- [strategy_advanced.py:408](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py#L408) `头肩顶MTR`
- [strategy_advanced.py:511](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py#L511) `头肩底MTR`

结论：

- **对齐的部分**
  - `第二腿陷阱` 已经要求边缘测试、第二腿不过度延伸、回到区间内、信号棒质量，这比早期的固定硬编码更接近 Brooks。
  - `看衰突破` 已经要求失败突破真正回区间、边缘测试、跟进不足，不再是简单“创新高后转阴”。
  - `头肩顶/底MTR` 已经要求 `major channel break`，避免把大量 minor reversal 当 MTR，这是正确方向。

- **偏差点**
  - detector 里仍存在大量固定阈值，比如：
    - `edge_tests >= 2`
    - `leg2_bars <= 5`
    - `breakout_excess <= range_size * 0.12`
    - `sig_quality >= 0.50`
    - `shoulder_balance <= head_range * 0.35`
  - 这些是合理的工程近似，但**不是 Brooks 原文级规则**。它们的合法性只能通过多窗口样本反证，不能把它们当教义。

- **审计判断**
  - detector 层已经**部分对齐 Brooks**，但仍是“Brooks 结构 + 工程阈值外壳”。
  - 这一层不是当前最大根因，但仍是“需要继续样本回归验证”的高风险层。

### 4.3 Playbook 路由 / 风控门控层

代码：

- [playbook_router.py:1](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/playbook_router.py#L1)
- [risk.py:34](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/risk.py#L34)
- [runner.py:65](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L65)

结论：

- **对齐的部分**
  - `playbook_router` 已经按家族和市场状态路由，而不是按单策略私有链路，这符合 Brooks 的“同类 setup 同一套理论解释”。
  - `risk.py` 已经把每日数量和连续方向次数降成软统计，不再用这类业务阈值硬挡 setup，这符合 Brooks。

- **偏差点**
  - [risk.py:83](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/risk.py#L83) 到 [risk.py:134](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/risk.py#L134) 仍然保留了按周期分类的动态限流模板。虽然已不阻止交易，但它仍可能把研发思路往“按周期定规则”带偏。
  - [runner.py:70](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L70) 的 `TF_FILTER_MAP` 仍是固定映射。它目前主要是背景/过滤辅助，但从 Brooks 角度，它仍属于工程路由，不是知识本体。

- **审计判断**
  - 路由层整体已经正确，但**还残留一些按周期组织的工程痕迹**。

### 4.4 入场评估层（TE / 风格 / obvious stop）

代码：

- [S5-evaluation.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/S5-evaluation.md)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)

结论：

- **对齐的部分**
  - 过去那种纯分数阈值和硬 `R:R` 拦截已经基本被拿掉。
  - `prior_level` 已经从“一律 blocker”调整成“第一目标 / 结构簇判断”，方向正确。

- **偏差点**
  - 代码中仍没有一个与 `S5` 完整一一对应的显式“入场前 5 步自检”对象。
  - 目前更多是把 `TE`、路径、风格、止损、磁体拆散在多个字段和路由函数里执行，而不是一个中心化的 Brooks 入场评估器。

- **审计判断**
  - 这一层**结构分散**，是后续容易漏掉逻辑一致性的点。

### 4.5 Premise 层

代码：

- [premise.py:10](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py#L10)
- [premise.py:231](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py#L231)

结论：

- **对齐的部分**
  - premise 失效后优先 `REDUCE`，而不是直接 `CLOSE`，这已经接近 Brooks 的“先降级成保护性管理”。
  - `target_path`、`follow_through`、`signal_validity` 已经纳入 premise，不再只是简单价格阈值。

- **偏差点**
  - `premise_check` 仍混入了不属于 Brooks 主线的条件：
    - `ai_direction`
    - `risk_metrics`
  - [premise.py:91](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py#L91) 的 `signal_buffer`、[premise.py:115](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py#L115) 的 `FT score` 仍然是工程阈值。

- **审计判断**
  - `premise` 当前是**半 Brooks、半执行风控混合层**。
  - 这是系统的一个重要根因，因为它会把“理论 premise”与“账户/AI 执行约束”混在一起。

### 4.6 Strength 层

代码：

- [strength.py:11](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py#L11)
- [strength.py:58](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py#L58)

结论：

- **对齐的部分**
  - 它试图把不同家族的关键结构点区别对待，而不是一套统一打分，这个方向比早期“统一分数”更合理。

- **偏差点**
  - `strength_check` 本质仍是工程打分器：
    - `gap_open`
    - `new_hl_lh`
    - `ema_bounce`
    - `micro_gap`
    - `shallow_pb`
    - `wedge_exhaustion`
    - `multi_tf_align`
  - 然后用加权总分映射成 `0-7` 和 `高/中/低`。
  - 这不是 Brooks 原文的管理逻辑，而是**为了程序控制方便做的抽象层**。

- **审计判断**
  - 当前全链里，`strength.py` 是**最像工程代理模型、最不像 Brooks 原流程**的模块之一。
  - 它很可能就是“胜率卡住但看起来一切都在管理”的一个深层根因。

### 4.7 保护性管理层

代码：

- [sim_exchange.py:245](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L245)
- [sim_exchange.py:303](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L303)
- [sim_exchange.py:1601](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1601)
- [sim_exchange.py:1835](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1835)

结论：

- **对齐的部分**
  - 当前已经把 `protective_stop` 和 `runner_trailing` 分开了。
  - `protective_scalp` 不再只是标签，而是确实会触发 `SCALP / partial / tightened stop`。
  - `trend_recovery / mtr_reversal / climax_reversal / breakout_follow / tr_scalp` 已经按家族拆 profile，这个方向是正确的。

- **偏差点**
  - `protective_detail_plan` 和 `_manage_protective_scalp()` 里仍然有很多“时间 × R 倍数”的工程计划，例如：
    - `stale_bars`
    - `force_exit_bars`
    - `profit_exit_r`
    - `loss_exit_r`
  - 这些不是 Brooks 原文级规则，而是管理执行层的工程近似。

- **审计判断**
  - 这一层的**问题不再是完全错误**，而是“已经接近对，但仍未彻底 Brooks 化”。
  - 当前系统最大的亏损桶来自这里，所以它仍是主战场。

### 4.8 Zombie / Timeout / Scalp 风格层

代码：

- [sim_exchange.py:522](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L522)
- [sim_exchange.py:598](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L598)
- [sim_exchange.py:617](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L617)

结论：

- **对齐的部分**
  - 已经不再是简单“时间到了就砍”，而是结合 `best_r / bars_without_progress / partial_close_count`。

- **偏差点**
  - `zombie_bar`、`late_zombie`、`max_bars` 本质仍然是时间衰减模型。
  - Brooks 更像“市场已经变成 TR / premise 不再成立 / 反向 BO 出现”，而不是“超过固定 bar 数就是僵尸单”。

- **审计判断**
  - `zombie/timeout` 仍然是明显的工程层残留。
  - 它们可能在统计上有帮助，但理论上不够纯。

### 4.9 Re-entry / Add-on 层

代码：

- [sim_exchange.py:676](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L676)
- [sim_exchange.py:699](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L699)

结论：

- **对齐的部分**
  - 只允许向盈利仓位加仓，这符合 Brooks 的 `winner scaling`。
  - `re-entry` 已经接回主链，不再是孤立逻辑。

- **偏差点**
  - `open_r >= 1.25 / 0.75` 这类阈值仍然是程序化近似。
  - 当前样本显示 `re-entry/add-on` 仍然不够多，也还没有证明自己是系统级正贡献。

- **审计判断**
  - 这层暂时不是主因，但还远没到“成熟可以放心依赖”的状态。

### 4.10 成本模型层

代码：

- [runner.py:57](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L57)
- [selected_management_report.py:323](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/selected_management_report.py#L323)

结论：

- **对齐的部分**
  - 至少已经明确把手续费纳入回测，不再是完全无成本假设。

- **偏差点**
  - 当前 `fee_rate = 0.0004` 是统一单边费率。
  - 不区分：
    - Binance crypto futures
    - cTrader forex
    - cTrader indices
    - cTrader metals
  - 滑点仍未完整建模。

- **审计判断**
  - 成本模型目前**明显不够真实**。
  - 它不是策略逻辑的根因，但会让“是否已经盈利”的统计判断产生偏差。

---

## 5. 对“把 protective_stop_exit 挪到 protective_scalp_exit / breakeven_stop_exit / tp_after_scaleout_exit 合不合理”的结论

结论：

- **合理，但有前提。**
- 只有在行为层真实发生变化时，这种迁移才合理。
- 如果只是改标签，那就是造假。

当前代码里发生的是：

1. 先在 [sim_exchange.py:1601](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1601) 到 [sim_exchange.py:1822](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1601) 之间，把弱单更早转成 `SCALP / partial / tightened stop`
2. 再在 [sim_exchange.py:409](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L409) 到 [sim_exchange.py:428](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L428) 把退出类别重新区分
3. 最后在 [selected_management_report.py:230](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/selected_management_report.py#L230) 到 [selected_management_report.py:276](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/selected_management_report.py#L230) 统计这些类别

所以当前属于“**行为变化 + 标签对齐**”，不是单纯洗数据。

---

## 6. 当前系统最深层的三个根因

### 根因一：中段管理链仍然混着工程代理层

最典型的是：

- `strength.py` 的 7 项加权评分
- `premise.py` 里的 `AI / 风险指标 / FT score`
- `sim_exchange.py` 里的 `stale_bars / zombie_bar / force_exit_bars`

它们都不是纯 Brooks 流程，而是“为了让系统能自动化而加的代理层”。

### 根因二：前端 detector 已经收紧，但中段仍不足以把弱单优雅降级

现在很多 setup 不是识别错了，而是：

- detect 到了
- 也下单了
- 但在成熟前没被优雅转成 `scratch / BE / 小 scalp`
- 最后掉进 `protective_stop`

### 根因三：成本统计仍然不够贴市场

当前统一费率虽然足够做内部方向判断，但不足以做真实市场级比较：

- crypto
- forex
- index
- metals

应该拆成独立成本档，不然会混淆“逻辑问题”和“成本口径问题”。

---

## 7. 这次零基体检后的优先级

### P0：必须先拆的

1. `strength.py` 去打分化  
   目标：从“工程加权分数”改成“结构判断序列”。

2. `premise.py` 去混层化  
   目标：把 `Brooks premise` 与 `AI/账户执行约束` 拆开。

3. `sim_exchange.py` 的 `zombie / stale / timeout` 继续去时间阈值化  
   目标：更多依据结构变化，而不是 bar 计数。

### P1：紧接着做的

4. detector 层做样本回归  
   重点：`末端旗形 / 第二腿陷阱 / 头肩MTR / 看衰突破`

5. 成本模型拆市场  
   至少分成：
   - crypto futures
   - forex
   - indices / metals

### P2：最后再打

6. `re-entry / add-on` 样本积累后再做优化  
   现在还不是主因。

---

## 8. 本次审计的总判断

当前系统已经不是“乱七八糟的非 Brooks 杂糅链”了。  
真正的问题也已经不再是“缺少哪一个策略名”。

现在最真实的状态是：

1. **前端 detector 已经大体进入 Brooks 语义区间**
2. **后端保护性管理已经开始接近 Brooks**
3. **但中段仍有一层工程代理模型没有拆干净**

所以系统迟迟不能稳定正收益，并不诡异。  
它的根本原因不是一个神秘 bug，而是：

> `Brooks 原流程` 与 `工程自动化代理层` 仍然没有彻底分开。

下一步如果继续，不应该再散着修。

应该按这条顺序继续：

1. 先清 `strength`
2. 再清 `premise`
3. 再清 `zombie/timeout`
4. 最后再回头验证 detector 和成本

只有这样，后面的 `频率 / 胜率 / PF` 才可能出现真正的系统性提升，而不是一轮一轮只涨一点点。
