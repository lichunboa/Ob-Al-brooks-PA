# Brooks 归零法全系统体检报告（2026-03-15）

> 目的：不再靠局部 patch 猜原因，而是按“归零法”对整条交易系统做一次模块级体检。  
> 方法：先把所有可能导致 `日均频率 / 胜率 / PF` 上不去的原因列全，再逐层对照当前代码和 Al Brooks 课程 PDF / 图表百科实战，判断哪些已经对齐，哪些仍明显偏离。

---

## 1. 当前主链到底是什么

现在系统已经不是“每个策略一条独立私有链”，而是：

1. **背景识别**
2. **候选策略 detector**
3. **Playbook 路由 / 入场过滤**
4. **下单与风格分类**
5. **premise / strength**
6. **protective / scratch / scalp**
7. **BE / trailing / partial / TP**
8. **re-entry / add-on**
9. **成本模型**

主线代码落点：

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

---

## 2. 资料优先级

后续审计和优化，统一按这个顺序：

1. **Al Brooks 课程 PDF 原文**
2. **图表百科全书实战案例**
3. **课程大纲**
4. `skill / S` 文件只保留流程参考，不再当权威规则源

统一证据入口：

- [BROOKS_PDF_EVIDENCE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)

本轮直接反复用到的页图语义：

- “所有市场和所有周期服从同一套价格行为”
- “进入通道后就按通道交易”
- “first buy / second buy”
- “大多数反转只是 minor reversal”
- “management 比寻找完美 setup 更重要”
- “minimum profit target is 1x actual risk”
- “可以在 1x/2x actual risk 先 scalp part，再 swing 余仓”

---

## 3. 归零法：先把所有可能原因列全

如果系统优化很多轮仍不能稳定正收益，理论上可能来自下面 10 类问题：

1. 背景识别错了
2. detector 太松
3. detector 太紧
4. playbook 路由与订单类型不一致
5. 入场评估与 obvious stop 不符合 Brooks
6. premise 被执行层条件污染
7. strength 被工程打分代理层替代
8. 保护性管理没把弱单优雅转成 `scratch / BE / 小 scalp`
9. `partial / trailing / TP / re-entry / add-on` 没有按照 Brooks 的成熟交易节奏执行
10. 成本模型和真实市场不匹配

下面按模块逐条审。

---

## 4. 模块级体检

### 4.1 背景识别

代码：

- [analysis.py:8](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L8)
- [analysis.py:97](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L97)

现状判断：

- **优点**
  - 已经用“当前周期 -> 更高一级背景”，而不是直接写死某个周期只允许某个策略。
  - 方向上符合 Brooks 的“大周期是背景，不是禁止器”。

- **偏差**
  - [analysis.py:20](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L20) 的 `TradingSession` 是时段强度工程系数，不是 Brooks 主理论。
  - [analysis.py:161](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L161) 到 [analysis.py:172](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py#L172) 主要依赖 `EMA slope` 做大周期 veto，仍偏“单轴趋势化”，没有完整表达 Brooks 的状态、位置、对侧风险。

- **结论**
  - 背景层方向正确，但仍然是“简化背景”，不是完整 Brooks 背景。

### 4.2 候选策略预选（detector）

代码：

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)

重点策略：

- `头肩顶/底MTR`
- `末端旗形`
- `第二腿陷阱`
- `看衰突破`

现状判断：

- **优点**
  - 这些 detector 已经明显比早期更接近 Brooks：开始要求 `major channel break`、边缘测试、失败突破重新回区间、signal bar 质量。

- **偏差**
  - 仍然存在不少固定工程阈值：
    - `edge_tests >= 2`
    - `leg2_bars <= 5`
    - `signal_bar_quality >= 某阈值`
    - `breakout_excess <= range_size * 某比例`
  - 这些不一定错，但不是 Brooks 原文级规则，只能算工程近似。

- **结论**
  - detector 不再是当前最大根因，但仍然是高风险层，尤其是 `高潮/陷阱反转族`。

### 4.3 入场触发与路由

代码：

- [playbook_router.py:148](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/playbook_router.py#L148)
- [risk.py:83](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/risk.py#L83)
- [runner.py:83](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L83)

现状判断：

- **优点**
  - 已经是按 Brooks 家族做统一路由，不再是策略各自为政。
  - `risk.py` 已经不再用“每天几单、连续几单”粗暴硬挡交易。

- **偏差**
  - [risk.py:83](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/risk.py#L83) 这层仍保留按周期组织的限流模板。
  - [runner.py:83](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L83) 的 `TF_FILTER_MAP` 仍是固定映射，这在研究时方便，但它仍然不是 Brooks 理论本体。

- **结论**
  - 路由层整体是正确的，但还残留一些按周期组织的工程痕迹。

### 4.4 premise / strength

代码：

- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)

现状判断：

- **优点**
  - 这轮已经完成一次关键修正：
    - `premise` 拆成了 `structure_checks` 和 `execution_checks`
    - `strength` 从加权总分器改成了结构证据链
  - 方向已经明显更像 Brooks。

- **偏差**
  - `premise` 里仍保留 `ai_direction / risk_metrics` 执行层检查，只是现在已经不再混成理论 premise。
  - `strength` 虽然不再总分驱动，但仍保留了某些程序化映射分数来兼容旧调用方。

- **结论**
  - 这两块已不再是当前最深层主因，但仍未完全“纯化”。

### 4.5 protective / scratch / scalp

代码：

- [sim_exchange.py:221](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L221)
- [sim_exchange.py:303](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L303)
- [sim_exchange.py:1601](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1601)
- [sim_exchange.py:1835](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1835)

现状判断：

- **优点**
  - `protective_stop` 和 `runner_trailing` 已经被拆开。
  - `protective_scalp` 现在已经不是单纯标签，而是会触发真实的 `SCALP / partial / tightened stop`。
  - 已经按家族拆 profile：
    - `trend_recovery`
    - `mtr_reversal`
    - `climax_reversal`
    - `breakout_follow`
    - `tr_scalp`

- **偏差**
  - 当前最大的亏损桶仍然在这一层。
  - [sim_exchange.py:327](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L327) 到 [sim_exchange.py:406](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L406) 的 `stale_bars / force_exit_bars / profit_exit_r / loss_exit_r` 仍然是工程执行近似。
  - 也就是说，这一层已经部分正确，但还没完全 Brooks 化。

- **结论**
  - **当前系统最大的真实主因就在这里。**

### 4.6 BE / trailing

代码：

- [sim_exchange.py:408](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L408)
- [sim_exchange.py:1765](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1765)

现状判断：

- **优点**
  - `runner_trailing_exit` 和 `protective_stop_exit` 已经分离。
  - `profit_exit_type` 也已经区分：
    - `full_tp`
    - `tp_after_scaleout`
    - `protective_scalp`

- **偏差**
  - 真正的 BE、保护性止损、结构 trailing 仍然没有彻底行为级拆清。
  - 统计上虽然分了类，但行为上仍有不少交易在成熟前退化成保护性止损。

- **结论**
  - trailing 本身不是不会做，问题是成熟前的退化处理仍然不够好。

### 4.7 partial / TP

代码：

- [manager.py:54](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/manager.py#L54)
- [sim_exchange.py:1765](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L1765)

现状判断：

- **优点**
  - `tp_after_scaleout_exit`、`partial_close_involved` 这些统计一直都不差。
  - 这与 Brooks 的 `1x/2x actual risk 先兑现一部分，再 swing 余仓` 是一致方向。

- **偏差**
  - 主要问题不是 TP 错，而是太多单根本没活到可以优雅 TP 的阶段。

- **结论**
  - `partial / TP` 不是当前第一主因。

### 4.8 re-entry / add-on

代码：

- [sim_exchange.py:676](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L676)
- [sim_exchange.py:699](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L699)

现状判断：

- **优点**
  - 已经只允许向盈利仓位加仓，方向上符合 Brooks 的 winner scaling。

- **偏差**
  - `0.75R / 1.25R` 这类阈值仍是工程近似。
  - 当前样本里它还不是系统级主收益来源。

- **结论**
  - 这层暂时不是系统主要卡点。

### 4.9 成本模型

代码：

- [runner.py:61](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py#L61)
- [sim_exchange.py:57](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L57)
- [sim_exchange.py:73](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py#L73)

现状判断：

- **优点**
  - 已经不再是统一零成本假设。
  - 已经按市场做了一次粗拆：
    - `crypto_futures`
    - `forex_cfd`
    - `metals_cfd`
    - `index_cfd`

- **偏差**
  - `runner.py` 入口配置仍是统一 `fee_rate=0.0004`
  - 真实滑点/点差仍然很粗
  - 还没做到按交易所、按品种精细化

- **结论**
  - 成本层不再是“完全错”，但仍会放大系统误差，尤其是高频策略。

---

## 5. 现在真正的根因排名

### P0：最可能直接导致系统长期不能稳定正收益

1. **保护性管理层仍然过于工程化**
   - 太多交易在成熟前退化成 `protective_stop_exit`
   - 说明系统不会“让坏单优雅变小”，而是还在让不少单以保护性止损收场

2. **`zombie / stale / timeout` 仍然是强工程时间衰减层**
   - Brooks 更强调结构变化，不强调“几根 bar 后必须怎样”
   - 这层很可能持续扭曲胜率和 PF

3. **高潮/陷阱反转族 detector 仍未稳定**
   - `末端旗形`
   - `第二腿陷阱`
   - `看衰突破`
   - `头肩顶/底MTR`

### P1：重要，但不是当前最主要矛盾

4. 背景识别仍偏“EMA slope veto”
5. route / risk 里仍残留按周期组织的工程模板
6. 成本模型仍偏粗

### P2：目前不是主战场

7. `partial / TP`
8. `re-entry / add-on`

---

## 6. 为什么现在还没有正收益

一句话总结：

**系统已经不是“不会识别 Brooks setup”，而是“不会稳定把一个有希望的 Brooks 单，管理成 scratch / BE / 小 scalp / 小利润 / 结构 trailing，而不是保护性止损”。**

换成更具体的话：

1. 前端信号已经比以前干净得多。
2. 真正成熟的 `runner trailing / tp_after_scaleout` 并不差。
3. 但中段，也就是“交易成熟前的退化管理”，仍然过于工程化。
4. 因此系统会出现一个很典型的现象：
   - 频率有
   - 部分策略也能出不错样本
   - 但系统级 PF 还是起不来

这并不神秘，根因就在 `protective_stop_exit` 和时间衰减逻辑里。

---

## 7. 现在该怎么推进

按归零法，后续不再散着调，而是按这个顺序：

1. **先清 `sim_exchange.py` 里的 `zombie / stale / timeout`**
   - 目标：让它们更多由结构变化触发，而不是固定 bar 数触发

2. **再继续压 `protective_stop_exit`**
   - 目标：把更多交易转到：
     - `protective_scalp_exit`
     - `breakeven_stop_exit`
     - `tp_after_scaleout_exit`

3. **再对 `高潮/陷阱反转族` 做样本回归**
   - 不是靠拍脑袋阈值，而是按 Brooks 原文 + 百科案例逐个证伪

4. **最后再细化成本模型**
   - 把“系统本身没边”和“边不够厚被成本吃掉”彻底分开

---

## 8. 当前最重要的判断

### 可以确定的

- 系统不是“策略没接进去”
- 也不是“信号完全不符合 Brooks”
- 真正卡住系统的，是**中后段管理链**

### 不能过度下结论的

- 不能说 detector 已经完全搞定
- 不能说只要再修一点点就一定整体转正
- 不能说单靠成本模型修正就能解决问题

### 现在最值得继续打的点

- `protective_stop_exit`
- `zombie / stale / timeout`
- `高潮/陷阱反转族`

这三块才是当前真正的主战场。
