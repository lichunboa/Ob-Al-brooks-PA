# Brooks 结构评估重构报告（2026-03-15）

> 本轮目标：先不继续大改 detector，也不继续扩策略，而是把 `strength.py` 和 `premise.py` 从“工程代理层”拉回到更接近 Brooks 原流程的结构判断。

---

## 1. 为什么先改这两块

在零基审计里，当前最不像 Brooks 的两个模块是：

- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)
- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)

原问题：

1. `strength.py` 用 `gap_open / micro_gap / shallow_pb / multi_tf_align` 做加权总分，再映射成 `0-7`。
2. `premise.py` 把 Brooks 前提和执行层条件混在一起：
   - `ai_direction`
   - `risk_metrics`
   - `signal_buffer`
   - `FT score`

这两块会带来一个系统性问题：

- 看起来“有评估、有管理”，但很多动作并不是按 Brooks 的结构语义触发，而是按程序方便的打分和阈值触发。

---

## 2. 本轮改动

### 2.1 `strength.py`：从加权评分器改成结构判断链

现在的 `strength_check()` 不再先做家族权重总分，而是先判断：

1. 是否出现了真正的结构推进
   - `new_hl_lh`
   - `reclaimed_prior_close`
2. 最近 3 根 K 线是否有像样的 `follow-through / acceptance`
3. 价格是否已经重新被 `EMA / prior close` 接受
4. 当前 setup 是否已经退化成 `channel -> TR`

然后再按家族做 Brooks 式判断：

- `trend_recovery`
- `mtr_reversal`
- `climax_reversal`
- `breakout_follow`
- `tr_scalp`

最后才把结构结论映射回兼容旧调用方的：

- `strength_score`
- `confidence`
- `recommendation`

换句话说，现在 `score` 是结构结论的兼容外壳，不再是决策本体。

### 2.2 `premise.py`：拆成“Brooks 前提”和“执行层约束”

现在的 `premise_check()` 被拆成两层：

1. `structure_checks`
   - `market_state`
   - `signal_validity`
   - `follow_through`
   - `target_path`
2. `execution_checks`
   - `ai_direction`
   - `risk_metrics`

同时动作逻辑改成：

- 结构深度失效且仍在亏损：`CLOSE`
- 一般结构退化：`REDUCE`
- 只是执行层冲突：`REDUCE`
- 都正常：`HOLD`

这样就避免了把 `AI` 或账户风险直接写成“Brooks premise”。

---

## 3. Brooks 依据

这轮没有以 `skill / S` 为权威，而是继续按 PDF / 百科。

直接相关的已整理证据：

- [BROOKS_PDF_EVIDENCE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)

本轮实际对应的重点含义：

1. `高1 / 高2 / 低1 / 低2` 的关键，不是统一打分，而是看：
   - 是否有真正结构推进
   - 是否有 follow-through
   - 是否被 EMA / prior close 接受

2. `premise` 是交易结构是否还成立，不该混入执行层条件。

3. 背景退化时，优先降级成保护性管理，而不是机械平仓。

可直接看的现成截图：

- ![H2 标准页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_h2-0012.png)
- ![进入通道就按通道交易](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_trade_like_channel-0290.png)
- ![趋势恢复族可以先 scalp 一部分，再 swing 余仓](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_tbc_partial_1x2x-043d-10.png)
- ![H1/H2 出现新 Major HL 后要移动止损](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_h1_move_stop_major_hl-09a-17.png)

---

## 4. 验证结果

### 4.1 基础验证

- `uv run --no-project python -m py_compile ...` 通过
- [system_test.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/system_test.py) `5/5` 通过

### 4.2 三窗口定向回测

#### A1 `BTCUSDT 15m 2022-01-24 ~ 2022-02-23`

- 交易数：`140`
- 胜率：`32.14%`
- PF：`0.9356`
- 信号：`561`
- 通过：`439`
- 路由拦截：`49`
- 管理拦截：`63`

#### A2 `BTCUSDT 5m 2024-08-10 ~ 2024-09-09`

- 交易数：`375`
- 胜率：`20.80%`
- PF：`0.8793`
- 信号：`1035`
- 通过：`769`
- 路由拦截：`129`
- 管理拦截：`115`

#### A3 `ETHUSDT 15m 2024-05-15 ~ 2024-06-14`

- 交易数：`130`
- 胜率：`23.08%`
- PF：`0.7055`
- 信号：`575`
- 通过：`427`
- 路由拦截：`48`
- 管理拦截：`90`

### 4.3 本轮结论

1. 这次改动**没有把系统带崩**，频率仍然在。
2. `BTC 15m 2022` 和 `BTC 5m 2024` 的结果已经回到可接受区间附近。
3. `ETH 15m 2024` 仍然偏弱，说明：
   - `strength/premise` 不是唯一根因
   - 当前更大的亏损来源仍然在保护性管理层

---

## 5. 现在能下的判断

### 5.1 已经可以确认的

- `strength.py` 的工程加权评分，确实应该被拆掉。
- `premise.py` 把执行层条件混进理论前提，也确实是不对的。
- 这两块改正后，系统没有出现明显回归。

### 5.2 还不能过度下结论的

- 仅靠这两块，不能把系统整体拉到稳定正收益。
- 也不能证明 detector 已经完全够好。

### 5.3 更大的剩余根因

当前更大的主因仍然是：

- `protective_stop_exit`
- `zombie / timeout / stale` 这类时间衰减工程逻辑
- 不同家族在“成熟前退化”时，还没有被稳定地转成 `scratch / BE / 小 scalp`

---

## 6. 下一步建议

按零基审计的优先级，接下来最值得做的是：

1. 继续清 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py) 里的：
   - `zombie`
   - `stale`
   - `timeout`
2. 继续压：
   - `protective_stop_exit`
3. 再做一轮更广场景回测，确认这次 `strength/premise` 改动是不是在更多年份和品种上都站得住。
