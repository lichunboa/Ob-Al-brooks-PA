# 趋势恢复族拆分报告（2026-03-14）

## 1. 这轮到底改了什么

目标不是继续放更多信号，而是把 `高1/低1/高2/低2/突破回调` 的管理逻辑拉回 Al Brooks 原文。

本轮代码改动在：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/libs/backtest/sim_exchange.py)
- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/evaluation/premise.py)

本轮落地的 5 个调整：

1. 趋势恢复 setup 的 `signal_validity` 不再一深测就直接当成彻底无效，而是先转 `REDUCE / protective scalp`
2. `高1/低1/高2/低2/突破回调` 的默认分批计划从过于 swing 化的 `2R/3R` 拉回更接近 Brooks 的 `1R/2R`
3. `高1/低1` 进一步单独收紧成“第一次入场更保守”的子逻辑：更早兑现、更早保护
4. 顺势恢复单的目标不再只在“磁体簇 >= 2”时才收紧，单个 `prior high / prior low` 也会参与第一目标规划
5. 只要已经走出足够利润，就优先让 `Major HL / LH` 接管保护，而不是只靠固定倍数 trailing

---

## 2. 这次直接用到的 Brooks 原文与百科证据

### 2.1 通道里可以随时买，但更好的位置通常是 PB，不是硬追 BO

来源：

- `43D How to buy a Tight Bull Channel...`

关键信息：

- `OK to Buy Any Time`
- `But Better to Buy PB Than BO`
- `Must be able to manage during PB`

截图：

![紧密通道里更好的位置通常是 PB](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_tbc_buy_pb_manage-043d-05.png)

这直接说明：趋势恢复族不能统一按“突破成功后一路拿大波段”去管。

### 2.2 趋势恢复族至少要有 `1x Actual Risk` 的盈利计划

来源：

- `43D How to buy a Tight Bull Channel...`

关键信息：

- `minimum profit target is 1x Actual Risk`
- `many traders take 1st profit at 1x Initial Risk`

截图：

![趋势恢复族的最小利润目标是 1x actual risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_tbc_first_profit_1x-043d-09.png)

### 2.3 最佳数学期望不是“全拿最小利润”，而是先 scalp 一部分，再 swing 余仓

来源：

- `43D How to buy a Tight Bull Channel...`

关键信息：

- `scalp part at 1x or 2x`
- `and swing the rest`

截图：

![趋势恢复族可以先 scalp 一部分，再 swing 余仓](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_tbc_partial_1x2x-043d-10.png)

### 2.4 H1/H2 的止损要随着新的 Major HL 形成而上移

来源：

- `09A What is Pullbacks and bar counting...`

关键信息：

- `High 1 might be 1st of 2-3 legs down`
- 第二个 PB 的 H1/H2 出现后，要把 `stop loss` 上移到更重要的 `Major HL`

截图：

![H1/H2 出现新 Major HL 后要移动止损](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/basic_h1_move_stop_major_hl-09a-17.png)

补充证据索引见：

- [BROOKS_PDF_EVIDENCE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)

---

## 3. 回测窗口

这轮没有按单一周期特调，而是用 6 个已存在的代表性窗口做交叉验证：

| 标签 | 品种 | 周期 | 时间范围 |
| --- | --- | --- | --- |
| `T1_BTC_15m_2022` | BTCUSDT | 15m | 2022-01-24 ~ 2022-02-23 |
| `T2_ETH_5m_2022` | ETHUSDT | 5m | 2022-01-24 ~ 2022-02-23 |
| `T3_BTC_5m_2025` | BTCUSDT | 5m | 2025-05-06 ~ 2025-06-05 |
| `X1_ETH_15m_2023Q1` | ETHUSDT | 15m | 2023-01-13 ~ 2023-02-12 |
| `X2_BNB_15m_2022Q1` | BNBUSDT | 15m | 2022-02-27 ~ 2022-03-29 |
| `X3_SOL_15m_2025Q2` | SOLUSDT | 15m | 2025-05-06 ~ 2025-06-05 |

原始结果文件：

- [/tmp/trend_recovery_probe_full_20260314.json](/tmp/trend_recovery_probe_full_20260314.json)
- [/tmp/trend_recovery_probe_full_v2_20260314.json](/tmp/trend_recovery_probe_full_v2_20260314.json)

---

## 4. 前后对比

### 4.1 汇总

- 6 个窗口总交易数：`2311 -> 2315`
- 6 个窗口加权胜率：`24.53% -> 26.57%`
- 6 个窗口平均 PF：`0.511 -> 0.623`

结论：这轮不是靠减少交易数换指标，而是在基本不压缩频率的情况下，把趋势恢复族整体拉正了一截。

### 4.2 单窗口

| 窗口 | 交易数 | 胜率 | PF |
| --- | --- | --- | --- |
| `BTC 15m 2022` | `254 -> 250` | `28.74% -> 30.00%` | `0.670 -> 0.784` |
| `ETH 5m 2022` | `650 -> 644` | `26.46% -> 28.11%` | `0.535 -> 0.600` |
| `BTC 5m 2025` | `650 -> 655` | `17.23% -> 18.32%` | `0.327 -> 0.362` |
| `ETH 15m 2023Q1` | `230 -> 241` | `27.39% -> 28.63%` | `0.572 -> 0.694` |
| `BNB 15m 2022Q1` | `277 -> 274` | `25.27% -> 29.93%` | `0.435 -> 0.550` |
| `SOL 15m 2025Q2` | `250 -> 251` | `30.80% -> 35.06%` | `0.527 -> 0.746` |

### 4.3 策略级

| 策略 | 交易数 | 胜率 | PF |
| --- | --- | --- | --- |
| `高2` | `491` | `25.05%` | `0.595` |
| `低2` | `425` | `26.12%` | `0.597` |
| `高1` | `350` | `21.43%` | `0.582` |
| `低1` | `327` | `25.99%` | `0.561` |
| `突破回调` | `3` | `33.33%` | `0.686` |

这说明：

- `高2/低2` 仍然是趋势恢复族里最成熟的一段
- `高1/低1` 虽然依旧弱，但已经明显比之前更接近可管理状态
- `突破回调` 样本还太少，不能下结论

---

## 5. 出口结构怎么变了

趋势恢复族汇总：

- `trades = 1596`
- `win_rate = 24.75%`
- `profit_factor = 0.587`
- `top_exit_reasons = SL 919 / TP 580 / PREMISE 77 / ZOMBIE 10 / WEAK_SCALP 8`

最关键的变化不是表面上的 `SL` 数量，而是：

1. `PREMISE` 从过去的高占比大幅下降
2. `WEAK_SCALP / ZOMBIE` 没有恶化成新的主出口
3. 很多 `SL` 已经不再是“原始满损”，而是被移动过的保护性止损

管理动作汇总：

| 动作 | 交易数 | PF | 平均 R |
| --- | --- | --- | --- |
| `partial_close_involved` | `1177` | `0.583` | `-0.055` |
| `trailing_stop_exit` | `1205` | `0.556` | `-0.099` |
| `breakeven_stop_exit` | `757` | `2.495` | `0.004` |
| `take_profit_exit` | `712` | `13.523` | `0.074` |
| `premise_failure_exit` | `291` | `0.112` | `-0.133` |
| `plain_stop_loss_exit` | `104` | `0.000` | `-1.256` |

真正值得关注的是：

- `plain_stop_loss_exit` 已经只剩 `104`
- `breakeven_stop_exit` 的 PF 明显为正
- 现在最差的不是“所有止损”，而是 `premise_failure_exit` 和大量 `protective_scalp`

换句话说，根本问题已经从“趋势恢复族总是吃满损”转成：

- 我们已经知道该更早保护
- 但还不够会把“被降级的交易”优雅地转成小利润或接近保本

---

## 6. 现在和 Brooks 体系还差在哪里

这轮之后，差距已经比前面清楚很多了。

### 6.1 已经拉回来的部分

- 不再把趋势恢复族统一管成通用 `2R/3R` swing
- 不再把 `signal bar` 的普通深测一律当成彻底无效
- 不再只在“磁体簇 >= 2”时才承认 `prior high / prior low` 的第一目标意义
- 不再只靠固定倍数 trailing，而是开始让 `Major HL / LH` 接管保护

### 6.2 还没真正到位的部分

1. `protective_scalp` 仍然太像一个“兜底桶”，还不够像 Brooks 那种明确的：
   - 第一买保本
   - 第二买盈利
   - 进入 TR 后分阶段处理

2. `高1/低1` 仍然偏弱，说明系统虽然知道 “H1 可能只是第一腿”，但还没有完全把：
   - first buy
   - second buy
   - major HL / LH
   - tight channel -> TR
   这条演化链拆成更明确的动作序列

3. `partial_close_involved` 还没有真正转成稳定正收益，说明：
   - 我们已经开始按 Brooks 部分止盈
   - 但“哪一部分先走、余仓留多少、余仓何时退出”仍需再细化

---

## 7. 当前结论

这轮优化是正向的，而且方向没有偏离 Brooks。

更准确的判断是：

- 趋势恢复族之前的核心偏差，确实是在“管理太迟钝、太通用 swing 化”
- 按 Brooks 的 `PB 管理 / 1R / prior high-low / major HL-LH / swing 转 scalp` 收回来后，6 个窗口都同步改善
- 但趋势恢复族离稳定盈利还远，没有任何理由现在就宣布“已经成熟”

---

## 8. 下一轮最该拆什么

如果继续沿 Brooks 体系往下拆，优先级应该是：

1. 把 `protective_scalp` 再拆成更明确的：
   - `PB延长但趋势未坏`
   - `tight channel -> TR`
   - `first buy BE / second buy profit`
2. 继续拆 `高1/低1` 的 first-entry 管理
3. 把 `partial close` 的留仓比例和余仓退出理由继续贴近 `1x/2x + significant resistance`

这三步做完，才更接近 Brooks 在百科和课件里真正展示的趋势恢复交易链。

---

## 9. 第二阶段细化结果：`protective_scalp -> first/second/channel`

第一阶段解决的是“趋势恢复族管理太迟钝、太 swing 化”。第二阶段不是再放更多信号，而是把 `protective_scalp` 继续拆成更贴近 Brooks 的三种管理情景：

- `first_entry_be`
- `second_entry_profit`
- `channel_to_tr`

同时把：

- `partial close`
- `tight channel -> TR`
- `prior high / prior low`
- `Major HL / LH`

继续往教材与百科案例收。

### 9.1 第二阶段依据

新增用到的百科证据：

- `49C Day trading examples (Trade Management focus)`

关键截图：

![趋势减弱后更可能演化成 TR，而不是直接反转成新趋势](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_trend_to_tr_manage-49c-03.png)

![弱跟进更像 TR，不能再按单边趋势持有](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_bad_ft_tr_likely-49c-06.png)

![多空双方都有好理由时，更该按 TR 管理而不是死抱旧 thesis](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_both_sides_good_reasons_tr-49c-07.png)

这三页共同支持两点：

1. 趋势恢复单一旦动能减弱、远离磁体、开始侧向，就要优先按 `TR` 或保护性 `scalp` 处理。
2. `protective scalp` 不该是单一桶，而应区分：
   - 第一买更容易只做到保本
   - 第二买更有资格要求利润
   - 紧密通道退化成 `TR` 时，重点是保护已有利润，而不是继续等原来的 swing 目标

### 9.2 第二阶段前后对比

这里对比的是：

- 第一阶段结果：[/tmp/trend_recovery_probe_full_20260314.json](/tmp/trend_recovery_probe_full_20260314.json)
- 第二阶段结果：[/tmp/trend_recovery_probe_full_v2_20260314.json](/tmp/trend_recovery_probe_full_v2_20260314.json)

汇总：

- 6 个窗口总交易数：`2315 -> 2305`
- 6 个窗口加权胜率：`26.57% -> 26.55%`
- 6 个窗口平均 PF：`0.623 -> 0.624`

结论：

- 第二阶段不是“大幅跳变”，而是细化后继续保持正方向
- 频率几乎没变，说明没有靠压缩交易来换指标
- PF 继续小幅改善，说明这轮更像是把管理语义收得更贴近 Brooks，而不是做工程化拟合

单窗口：

| 窗口 | 交易数 | 胜率 | PF |
| --- | --- | --- | --- |
| `BTC 15m 2022` | `250 -> 247` | `30.00% -> 30.36%` | `0.784 -> 0.775` |
| `ETH 5m 2022` | `644 -> 646` | `28.11% -> 27.86%` | `0.600 -> 0.611` |
| `BTC 5m 2025` | `655 -> 654` | `18.32% -> 18.50%` | `0.362 -> 0.363` |
| `ETH 15m 2023Q1` | `241 -> 235` | `28.63% -> 28.51%` | `0.694 -> 0.707` |
| `BNB 15m 2022Q1` | `274 -> 273` | `29.93% -> 29.67%` | `0.550 -> 0.561` |
| `SOL 15m 2025Q2` | `251 -> 250` | `35.06% -> 35.20%` | `0.746 -> 0.727` |

### 9.3 第二阶段对趋势恢复族真正产生了什么影响

家族汇总：

- `趋势恢复族`：`1596 -> 1587`
- 胜率：`24.75% -> 24.76%`
- PF：`0.587 -> 0.595`
- 平均 R：`-0.121 -> -0.121`

这说明：

- 趋势恢复族仍然是高频主力
- 第二阶段没有继续靠放宽信号“灌交易”
- 改善主要来自退出结构更细化，而不是信号端放松

动作变化：

| 动作 | 交易数 | PF | 平均 R |
| --- | --- | --- | --- |
| `partial_close_involved` | `1177 -> 1181` | `0.583 -> 0.590` | `-0.055 -> -0.055` |
| `trailing_stop_exit` | `1205 -> 1203` | `0.556 -> 0.513` | `-0.099 -> -0.106` |
| `breakeven_stop_exit` | `757 -> 760` | `2.495 -> 2.264` | `0.004 -> -0.009` |
| `take_profit_exit` | `712 -> 721` | `13.523 -> 15.110` | `0.074 -> 0.083` |
| `premise_failure_exit` | `291 -> 274` | `0.112 -> 0.104` | `-0.133 -> -0.138` |
| `plain_stop_loss_exit` | `104 -> 104` | `0.000 -> 0.000` | `-1.256 -> -1.255` |
| `protective_scalp_involved` | `1405 -> 1395` | `0.233 -> 0.238` | `-0.175 -> -0.175` |

真正重要的信号是：

1. `take_profit_exit` 继续增加，而且质量更好
2. `premise_failure_exit` 数量继续下降
3. `protective_scalp` 质量仍然偏弱，但已经不是纯兜底黑洞
4. `trailing / breakeven` 这轮略有回落，说明下一步该拆的已经不是“是否保护”，而是“保护后的余仓节奏”

### 9.4 第二阶段后的判断

如果只问“这一步有没有偏离 Brooks”，答案是没有。

更准确的判断是：

- 第一阶段解决的是“方向错了”
- 第二阶段解决的是“保护性管理还不够分型”
- 但第二阶段还没有把趋势恢复族从 `PF 0.5x` 拉到可用水平

所以趋势恢复族现在的核心矛盾已经非常清楚：

1. `first buy / second buy / channel to TR` 已经开始分开管理，但还不够彻底
2. `protective scalp` 质量虽然略升，但仍然明显弱于 `TP / BE`
3. `trailing` 里还混着太多保护性止损，真正优质的余仓 trailing 还没有完全独立出来

换句话说，第二阶段已经把问题收敛出来了：

- **不是不知道要保护**
- **而是还不够会把“已经开始变弱但还没彻底坏掉”的趋势恢复单，转成更好的 BE / 小赢 / 分段退出**

---

## 10. 第三阶段细化结果：把保护性状态转成更主动的 `SCALP`

第二阶段之后，趋势恢复族的主要问题已经很清楚：

- 系统已经知道该保护
- 但很多单还是会以“移动过的止损”方式结束
- 也就是：保护有了，兑现还不够主动

因此第三阶段只做了一件事：

- 把 `protective_scalp` 再往 Brooks 的“主动转成 scalp 管理”方向推一步

具体做法是：

1. 给 `first_entry_be / second_entry_profit / channel_to_tr` 三种 detail 加上独立的：
   - `stale_bars`
   - `force_exit_bars`
   - `profit_exit_r`
   - `loss_exit_r`
   - `extra_partial_r`
2. 一旦保护性状态里已经没有推进，但仍有可接受利润，就不再继续等 `SL`
   - 直接按 `SCALP` 主动兑现
3. `MTR反转族` 在 `2R` 附近兑现后，如果缺乏延续，也更早把余仓转成保护利润

### 10.1 第三阶段前后对比

这里对比的是：

- 第二阶段全链结果：[/tmp/ab_selected_management_report_20260314_v3.json](/tmp/ab_selected_management_report_20260314_v3.json)
- 第三阶段全链结果：[/tmp/ab_selected_management_report_20260314_v4.json](/tmp/ab_selected_management_report_20260314_v4.json)

整体：

- 总交易数：`3285 -> 3285`
- 加权胜率：`25.91% -> 26.39%`
- 平均 PF：`0.588 -> 0.600`

重点不是交易数，而是退出结构：

- `SL`: `1812 -> 1787`
- `SCALP`: `2 -> 76`
- `趋势恢复族 PF`: `0.582 -> 0.595`
- `protective_scalp_involved PF`: `0.256 -> 0.265`

这说明：

1. 方向是对的
2. 系统开始把一部分“本来会被保护性止损打掉”的单，转成了主动 `scalp` 退出
3. 但这仍然不是突破性改善，只是继续朝 Brooks 的主动管理更靠近了一步

### 10.2 第三阶段的意义

第三阶段最重要的不是数值本身，而是管理语义终于更像 Brooks 了：

- **不是一路等到 stop hit**
- **而是在 trade 已经从 swing 退化成 scalp 时，主动把它当 scalp 管**

也就是说，当前趋势恢复族和 Brooks 的差距，已经继续从：

- “不会保护”

收敛成了：

- “会保护，也开始会兑现”
- “但还不够会把兑现和余仓管理结合得更漂亮”

下一步真正该拆的，就不再是“要不要保护”，而是：

1. `SCALP` 和 `TP1/TP2` 的分工边界
2. `SCALP` 后是否保留少量 runner
3. `Major HL / LH` 和主动 `SCALP` 之间谁优先

---

## 11. 第四阶段结果：把 `protective_stop / runner_trailing / SCALP / TP1/TP2` 真正拆开

第三阶段之后，最大的问题已经不是“不知道要保护”，而是：

- 我们不知道当前差的到底是 trailing 本身
- 还是“保护性止损”被混进 trailing 里，把统计看脏了

因此第四阶段做的重点不是继续改频率，而是：

1. 把 `SL` 细分成：
   - `protective_stop`
   - `runner_trailing`
2. 把利润退出细分成：
   - `protective_scalp`
   - `protective_scalp_runner`
   - `tp_after_scaleout`
   - `full_tp`

结果文件：

- [/tmp/ab_selected_management_report_20260314_v4.json](/tmp/ab_selected_management_report_20260314_v4.json)
- [/tmp/ab_selected_management_report_20260314_v5.json](/tmp/ab_selected_management_report_20260314_v5.json)

### 11.1 数值结果

这一步几乎没有改变总表现：

- 总交易数：`3285 -> 3285`
- 加权胜率：`26.39% -> 26.39%`
- 平均 PF：`0.600 -> 0.600`

这说明第四阶段不是“又优化出一截盈利”，而是终于把根因拆清了。

### 11.2 真正重要的新增分层

| 动作 | 交易数 | PF | 平均 R | 胜率 |
| --- | --- | --- | --- | --- |
| `protective_stop_exit` | `1302` | `0.032` | `-0.266` | `3.69%` |
| `runner_trailing_exit` | `130` | `133.454` | `0.972` | `91.54%` |
| `protective_scalp_exit` | `72` | `999.0` | `0.196` | `83.33%` |
| `tp_after_scaleout_exit` | `172` | `291.178` | `0.400` | `87.79%` |

这 4 组数据把趋势恢复族当前最深的症结完全暴露出来了：

1. 真正的余仓 trailing 是有效的，而且非常强
2. `TP1/TP2` 之后的止盈也是有效的
3. 主动 `protective_scalp` 兑现也是有效的
4. **最差的不是 trailing，也不是 TP，而是 `protective_stop`**

### 11.3 这对趋势恢复族意味着什么

趋势恢复族当前不是“不会赚钱”，而是：

- 只有一小部分交易能走到 Brooks 式的成熟阶段
  - `tp_after_scaleout`
  - `runner_trailing`
  - `protective_scalp_exit`
- 更大一部分交易，在 premise 开始退化后，仍然以 `protective_stop` 结束

因此，趋势恢复族当前和 Brooks 的真实差距已经可以重新定义：

- 不是 `H1/H2` 检测不到
- 不是 `TP1/TP2` 不会做
- 不是 runner trailing 不会做
- 而是 **太多普通 PB 还没来得及“成熟”，就先退化成了坏的保护态**

### 11.4 第四阶段后的判断

现在可以把趋势恢复族的问题收敛成一句话：

> 当前系统已经学会了 Brooks 的“成熟交易怎么赚钱”，但还没有学会 Brooks 的“普通 PB 在变弱时，怎样优雅地保命并保住一部分利润”。

这也是为什么最近几轮每次指标只涨一点点：

- 大桶亏损一直不是出在 `runner_trailing`
- 而是出在 `protective_stop`

下一步如果继续沿 Brooks 体系推进，就不该再泛调“要不要保护”，而是只做一件事：

- 继续把 `protective_stop` 往
  - `protective_scalp_exit`
  - `breakeven_stop_exit`
  - `tp_after_scaleout_exit`
  这三类里挪

## 12. 第五阶段结果：先把 Endless Pullback 从趋势恢复主链里剥出去

第四阶段把管理链的“成熟赚钱路径”和“坏保护止损路径”拆清了，但真正的系统性突破并没有立刻出现。第五阶段回到更前面，直接处理趋势恢复信号质量：

- 对前一腿更像 `tr_leg / tr_second_leg` 且重叠过高的情形，明确视为 `endless pullback`
- `高1/低1/高2/低2/突破回调/均线缺口` 在这类背景下，必须先等：
  - `BO + follow-through`
  - 或 `reclaimed prior close`
  - 或更清晰的 `acceptance`

也就是说，这一步不是继续调 exit，而是把本来就不该进场的“假趋势恢复”先剥出去。

### 12.1 直接依据

- `09C Endless PB; different timeframes; countertrend`
- `14E Tight Channel (strong trend); Small pullback trend`
- `49C Day trading examples (Trade Management focus)`

完整图例和解释见：

- [Brooks 突破性分析报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_BREAKTHROUGH_REPORT_20260314.md)

### 12.2 数值结果

精选 9 窗口：

- 总交易数：`3285 -> 2064`
- 加权胜率：`26.39% -> 29.70%`
- 平均 PF：`0.605 -> 0.680`
- `趋势恢复族 PF`：`0.595 -> 0.714`

扩展 8 窗口：

- 总交易数：`3094 -> 1805`
- 加权胜率：`24.98% -> 28.03%`
- 平均 PF：`0.521 -> 0.597`
- `趋势恢复族 PF`：`0.508 -> 0.608`

### 12.3 这一步真正证明了什么

第五阶段最大的意义，不只是把 PF 又抬了一截，而是证明了趋势恢复族最深层的问题确实有一部分在信号质量前端：

1. 之前并不只是“exit 不会做”
2. 很多普通 PB 在入场时就已经带着 `TR vibes`
3. 一旦把这些 Endless PB 剥掉，`protective_stop` 数量和整体损耗会同步收缩

### 12.4 新的阶段性判断

现在趋势恢复族的根因已经可以收敛成两层：

1. **信号前端**  
   仍然要继续分清：
   - `small pullback trend`
   - `endless pullback`
   - `channel -> TR`

2. **管理后端**  
   对已经开始退化的 PB，仍要继续把：
   - `protective_stop`
   往
   - `breakeven`
   - `protective_scalp`
   - `tp_after_scaleout`
   这三类挪

也就是说，趋势恢复族现在终于不是“只有一个黑盒 PF 很差”，而是：

- 前端：已经知道该砍哪类低质量恢复
- 后端：已经知道该继续压哪个亏损大桶
