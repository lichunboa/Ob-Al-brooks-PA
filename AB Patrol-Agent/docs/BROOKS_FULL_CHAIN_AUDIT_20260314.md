# Brooks 全链路审查报告（2026-03-14）

> 目的：从 `信号生成 -> 路由/过滤 -> 入场 -> premise/strength -> partial close -> BE -> trailing -> TP -> re-entry/add-on` 全链路，对照 Al Brooks 课程与百科实战，判断当前系统哪些已经贴近原体系，哪些仍然偏离。

## 1. 审查范围

本报告只审查当前真实连通的两条主链：

- live 主链
- 权威回测主链

当前权威代码落点：

- [analysis.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/signal-service/src/engines/pa/analysis.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)
- [risk.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/services/signal-service/src/engines/pa/risk.py)
- [playbook_router.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/market/playbook_router.py)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/libs/backtest/runner.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/libs/backtest/sim_exchange.py)
- [manager.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/manager.py)
- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/evaluation/premise.py)
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/evaluation/strength.py)
- [partial_close.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/risk_controls/partial_close.py)
- [trailing_stop.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/risk_controls/trailing_stop.py)
- [take_profit.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/risk_controls/take_profit.py)
- [followup.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/trading/position_management/followup.py)

## 2. 依据来源

课程与知识文件：

- [BROOKS_PDF_EVIDENCE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)
- [CURRENT_TRADING_FLOW.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/CURRENT_TRADING_FLOW.md)
- [KNOWLEDGE_CODE_CROSSWALK.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/KNOWLEDGE_CODE_CROSSWALK.md)
- [BROOKS_RULE_AUDIT.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/BROOKS_RULE_AUDIT.md)
- [BROOKS_ROUTE_ANALYSIS.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/BROOKS_ROUTE_ANALYSIS.md)
- [TREND_RECOVERY_GAP_REPORT_20260314.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/TREND_RECOVERY_GAP_REPORT_20260314.md)

这次直接引用的关键截图包括：

- ![所有市场和时间周期都有相同价格行为](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/basic_timeframe_same-0100.png)
- ![H2 标准页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/basic_h2-0012.png)
- ![管理比交易选择更重要](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/basic_management_key-0337-0337.png)
- ![MTR 家族的 2R 部分止盈](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_take_profit_risk2-0065-0065.png)
- ![保本止损不要被打两次](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_breakeven_twice-0071-0071.png)
- ![紧密通道里更好的位置通常是 PB](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_tbc_buy_pb_manage-043d-05.png)
- ![趋势恢复族的最小利润目标是 1x actual risk](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_tbc_first_profit_1x-043d-09.png)
- ![趋势恢复族可以先 scalp 一部分，再 swing 余仓](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_tbc_partial_1x2x-043d-10.png)
- ![H1/H2 出现新 Major HL 后要移动止损](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/basic_h1_move_stop_major_hl-09a-17.png)
- ![动能走弱时趋势恢复单可能先演化成 TR](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_trend_to_tr_manage-49c-03.png)
- ![弱跟进时更可能是 TR](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_bad_ft_tr_likely-49c-06.png)
- ![双方都有好理由时更可能是 TR](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Patrol-Agent/docs/assets/brooks_refs/advanced_both_sides_good_reasons_tr-49c-07.png)

## 3. 先说结论

当前系统已经明显不是“非 Brooks 杂糅链”了。主链已经收敛成：

1. 用 Brooks 的市场周期和上下文读盘
2. 用 Brooks 的策略家族做路由
3. 用结构位、目标路径和前提变化决定入场与管理
4. 用 `premise / partial / BE / trailing / TP / re-entry` 管理持仓

但它还没有达到 Brooks 实战里那种“高质量 setup + 明确管理计划 -> 稳定正收益”的状态。

当前最主要的差距已经不在“有没有这些策略名”，而在：

- 趋势恢复族的 first buy / second buy / channel -> TR 管理还不够细
- premise 变化后，很多单仍然没有优雅地转成 BE / 小赢 / 小亏
- trailing 里还混着太多保护性止损，真正的余仓结构 trailing 还不够干净

## 4. 从信号到离场的全链路审查

### 4.1 市场周期与方向识别

当前最接近 Brooks 原意的部分是：

- 市场状态不再靠固定分数阈值驱动
- `TR / Tight Channel / Broad Channel / Breakout Mode / Climax / MTR attempt`
  已经是主判断语义
- 时间周期不再被当成策略白名单

这和 Brooks 的核心观点一致：

- 所有市场、所有时间周期都服从同一套价格行为
- 高一级周期是背景，不是“禁止当前周期交易”的借口
- `TR -> BO -> Channel -> TR` 的切换，必须由结构与跟进决定

当前仍有差距的地方：

- live 运行时仍然不是一套完全显式的 S0/S1 状态机
- 一些状态切换仍是“字段 + 条件组合”，不是单一中心化状态机

### 4.2 信号家族与路由

当前已经贴近 Brooks 的点：

- `MTR反转族`
- `高潮/陷阱反转族`
- `趋势恢复族`
- `突破追随族`
- `均线缺口族`

已经不再被拆成互相冲突的多套管理模板。

这点很关键，因为 Brooks 的核心不是“策略名字越多越好”，而是：

- 同一知识家族要用同一套理论解释
- 不同外观不能映射成彼此矛盾的管理链

当前仍有差距的地方：

- 虽然家族抽象已经对了，但趋势恢复族内部的 `first buy / second buy / breakout pullback`
  还不够细
- `protective_scalp` 还承担了太多不同情景

### 4.3 入场规划

当前已经收回到 Brooks 的部分：

- 不再依赖工程化分数门槛
- 不再依赖固定 `R:R` 阈值或 ATR 倍数缓冲
- `prior_level` 被重构成“第一目标或结构簇”，而不是一律 veto
- `H1/L1/H2/L2` 不再被机械压成“必须等第二次确认”

当前仍需继续审的地方：

- `H1/L1` 的 first-entry 语义虽然已经更保守，但还没有完全区分出
  “第一次试多/试空”和“第二次更成熟入场”的后续管理链

### 4.4 Premise / Strength / Protective 管理

当前已经贴近 Brooks 的部分：

- premise 变化后优先降级，不再直接一刀切全部平仓
- 弱跟进、动能衰退、进入 `TR` 时，允许转保护性 `scalp`
- 可以在利润初步建立后尽早抬到保本或小利润保护

当前主要差距：

- `protective_scalp` 仍然过于桶化
- 还没有完全拆成：
  - `first buy BE`
  - `second buy profit`
  - `tight channel -> TR`

### 4.5 Partial / BE / Trailing / TP

当前已经贴近 Brooks 的部分：

- `MTR` 家族默认纳入 `2R` 部分止盈
- 趋势恢复族默认第一目标回到 `1R`
- `Major HL / LH` 已经参与止损保护
- `take profit` 不再只是固定远端 `measured move`

当前主要差距：

- `partial close` 质量还没有稳定转正
- `trailing` 统计里还混着太多保护性止损
- `breakeven` 虽然已经有效，但离 Brooks 实战里“不要被打两次”的纪律化处理还有距离

### 4.6 Re-entry / Add-on

当前已经实现：

- live 和回测都支持 re-entry
- live 会消费 `stop_loss_hit` 并注册重入观察窗口
- follow-up 语义已经统一进主管理器

当前仍有差距：

- `re-entry / add-on` 虽然开始有正反馈，但样本还小
- 它们还没证明自己在当前链路里能稳定带来超额利润

## 5. 当前和 Brooks 最一致的地方

1. 已经彻底离开“工程分数驱动”
2. 已经按策略家族而不是散乱标签建模
3. 已经用结构位、目标位和状态变化做主判断
4. 已经把管理链作为主战场，而不再迷信信号名本身

## 6. 当前和 Brooks 差得最远的地方

1. 趋势恢复族的管理链还不够像 Brooks 的分阶段处理
2. 保护性管理和真正余仓 trailing 还没有彻底分层
3. premise 变化后仍有太多仓位没有被优雅地处理掉

## 7. 这份报告的量化结果

正式量化结果文件：

- [/tmp/ab_selected_management_report_20260314_v3.json](/tmp/ab_selected_management_report_20260314_v3.json)
- [/tmp/ab_selected_management_report_20260314_v4.json](/tmp/ab_selected_management_report_20260314_v4.json)

对照基线：

- [/tmp/ab_selected_management_report_20260314_v2.json](/tmp/ab_selected_management_report_20260314_v2.json)
- 最新一步使用 `v3 -> v4` 做对照。

### 7.1 整体

9 个精选窗口整体（最新 `v4`）：

- 总交易数：`3285`
- 加权胜率：`26.39%`
- 平均 PF：`0.600`

相对上一版 `v3` 的变化：

- 总交易数：`3285 -> 3285`
- 加权胜率：`25.91% -> 26.39%`
- 平均 PF：`0.588 -> 0.600`

结论：

- 这轮不是靠继续压缩交易数换指标
- 胜率和 PF 都明显改善
- 但整体仍然没有跨过 `PF=1`
- 所以当前系统离“可实盘盈利”还有明显距离

### 7.2 按周期

| 周期 | 交易数 | 加权胜率 | 平均 PF |
| --- | --- | --- | --- |
| `5m` | `1942` | `24.61%` | `0.527` |
| `15m` | `1293` | `29.16%` | `0.644` |
| `1h` | `50` | `30.00%` | `0.635` |

结论：

- `5m` 不是没机会，而是机会非常多、质量仍然偏差
- `15m` 已经明显优于 `5m`
- `1h` 样本还小，但这轮已经比之前更接近可用

### 7.3 按品种

| 品种 | 交易数 | 加权胜率 | 平均 PF |
| --- | --- | --- | --- |
| `BTCUSDT` | `1597` | `24.11%` | `0.591` |
| `ETHUSDT` | `1165` | `26.87%` | `0.577` |
| `BNBUSDT` | `273` | `30.04%` | `0.569` |
| `SOLUSDT` | `250` | `35.60%` | `0.733` |

结论：

- 这已经不是“某个单一品种坏掉”的问题
- `SOL` 当前最强，但仍没有稳定越过 `1`
- 问题仍然是系统级管理链问题，不是品种特例

### 7.4 按家族

| 家族 | 交易数 | 胜率 | PF | 平均 R |
| --- | --- | --- | --- | --- |
| `趋势恢复族` | `2239` | `24.65%` | `0.595` | `-0.118` |
| `MTR反转族` | `708` | `31.78%` | `0.664` | `-0.005` |
| `高潮/陷阱反转族` | `207` | `27.54%` | `0.492` | `-0.165` |
| `突破追随族` | `100` | `24.00%` | `0.668` | `-0.254` |
| `均线缺口族` | `31` | `29.03%` | `0.530` | `-0.380` |

这组数据直接说明：

1. **最大拖累仍然是趋势恢复族**
2. `MTR反转族` 和 `突破追随族` 相对更接近成熟
3. 即便是最接近成熟的家族，也还没有稳定越过 `1`

### 7.5 按策略

交易数最高、同时最影响整体表现的是：

| 策略 | 交易数 | 胜率 | PF |
| --- | --- | --- | --- |
| `高2` | `662` | `25.08%` | `0.594` |
| `低2` | `591` | `26.06%` | `0.613` |
| `高1` | `510` | `22.55%` | `0.626` |
| `低1` | `476` | `22.90%` | `0.522` |

相对更接近正向的策略有：

| 策略 | 交易数 | 胜率 | PF |
| --- | --- | --- | --- |
| `楔形顶` | `84` | `38.10%` | `1.043` |
| `楔形底` | `80` | `48.75%` | `1.061` |
| `ii突破` | `59` | `25.42%` | `0.899` |
| `双重底` | `124` | `33.06%` | `0.739` |
| `头肩底MTR` | `149` | `27.52%` | `0.664` |

而明显偏弱的包括：

| 策略 | 交易数 | 胜率 | PF |
| --- | --- | --- | --- |
| `头肩顶MTR` | `111` | `19.82%` | `0.301` |
| `看衰突破` | `68` | `35.29%` | `0.393` |
| `ioi突破` | `34` | `17.65%` | `0.272` |

结论：

- 现在已经不是“某些策略没有信号”
- 而是各策略质量开始分层，强弱已经能看清

### 7.6 管理动作与退出结构

本轮最关键的数据，不是“交易次数”，而是退出结构变了。

管理动作前后对比（`v3 -> v4`）：

| 动作 | 交易数 | PF | 平均 R |
| --- | --- | --- | --- |
| `partial_close_involved` | `1656 -> 1659` | `0.586 -> 0.598` | `-0.057 -> -0.055` |
| `trailing_stop_exit` | `1661 -> 1637` | `0.472 -> 0.465` | `-0.115 -> -0.117` |
| `breakeven_stop_exit` | `1077 -> 1052` | `1.897 -> 1.882` | `-0.026 -> -0.028` |
| `take_profit_exit` | `1067 -> 1017` | `12.963 -> 12.014` | `0.075 -> 0.071` |
| `premise_failure_exit` | `401 -> 402` | `0.104 -> 0.106` | `-0.131 -> -0.131` |
| `plain_stop_loss_exit` | `151 -> 150` | `0.000 -> 0.000` | `-1.255 -> -1.255` |
| `protective_scalp_involved` | `1982 -> 1983` | `0.256 -> 0.265` | `-0.170 -> -0.168` |
| `reentry_trade` | `80 -> 76` | `1.026 -> 1.147` | `-0.151 -> -0.125` |
| `scale_in_trade` | `145 -> 145` | `33.462 -> 33.226` | `0.765 -> 0.761` |

退出原因前后对比（`v3 -> v4`）：

- `PREMISE`: `265 -> 266`
- `SL`: `1812 -> 1787`
- `TP`: `1067 -> 1017`
- `WEAK_SCALP`: `98 -> 97`
- `SCALP`: `2 -> 76`
- `ZOMBIE`: `38 -> 39`

这组数字说明的不是“系统坏了”，而是：

1. premise 早退不再是第一主问题
2. 一部分原本会继续被保护性止损打掉的仓位，已经开始转成主动 `SCALP`
3. `plain stop loss` 没有恶化，变化主要发生在管理动作更主动的那一层
4. `re-entry` 的正反馈继续存在

换句话说：

- 这轮之后，系统的主问题已经从“过早认错”进一步收敛成“保护性退出后，怎样更主动地兑现、而不是继续被动等 stop”

### 7.7 逐窗口结果

| 窗口 | 交易数 | 胜率 | PF |
| --- | --- | --- | --- |
| `BTC 5m 2022` | `643 -> 644` | `25.82% -> 26.55%` | `0.572 -> 0.590` |
| `BTC 15m 2022` | `247 -> 248` | `30.36% -> 30.24%` | `0.775 -> 0.773` |
| `ETH 5m 2022` | `646 -> 643` | `27.86% -> 28.93%` | `0.611 -> 0.618` |
| `ETH 15m 2023` | `287 -> 287` | `20.56% -> 20.56%` | `0.399 -> 0.399` |
| `BTC 1h 2022` | `50 -> 50` | `28.00% -> 30.00%` | `0.576 -> 0.635` |
| `BTC 5m 2025` | `654 -> 655` | `18.50% -> 18.78%` | `0.363 -> 0.368` |
| `ETH 15m 2023Q1` | `235 -> 235` | `28.51% -> 28.51%` | `0.707 -> 0.715` |
| `BNB 15m 2022Q1` | `273 -> 273` | `29.67% -> 30.04%` | `0.561 -> 0.569` |
| `SOL 15m 2025Q2` | `250 -> 250` | `35.20% -> 35.60%` | `0.727 -> 0.733` |

这说明本轮不是“只在某个窗口偶然变好”，而是 9 个精选窗口全部朝正方向移动。

## 8. 根因判断

如果只看当前系统与 Brooks 的差距，根因已经比较清楚：

1. 信号端已经不是主瓶颈
2. 真正的主瓶颈是管理链还没有完全代码化 Brooks 的分阶段思维
3. 尤其是趋势恢复族里：
   - `first buy`
   - `second buy`
   - `tight channel -> TR`
   - `major HL / LH`
   - `scalp part, swing part`
   这几步虽然都有了，但还没有完全组成一条成熟的动作链

更具体地说，当前系统和 Brooks 之间的根本差距主要有 4 个：

1. `first buy / second buy / channel -> TR` 已经开始拆开，但还没有彻底拆到动作级
2. `protective_scalp` 仍然承担了太多“不同原因导致的保护性处理”
3. `trailing` 统计里混着保护性移损和真正余仓 trailing，导致管理质量还不够纯
4. 趋势恢复族虽然已经比以前更像 Brooks，但它作为最大交易来源，PF 仍明显低于其它家族，足以把整体系统拖在 `1` 以下

## 9. 下一步建议

下一阶段如果继续沿 Brooks 体系推进，优先级应是：

1. 继续拆趋势恢复族的保护性管理
2. 把 trailing 明确拆成“保护性止损”和“真正余仓 trailing”
3. 再审 `partial close` 的比例、余仓保留条件和退出条件
4. 最后才去判断哪些策略族适合优先进 demo 主链采样
