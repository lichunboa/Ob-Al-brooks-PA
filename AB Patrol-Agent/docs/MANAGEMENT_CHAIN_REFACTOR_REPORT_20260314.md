# 管理链整体重构报告（2026-03-14）

## 1. 本轮目标

本轮不是继续扩信号，而是把入场后的整条管理链一起收口，重点包括：

- premise failure
- weak scalp
- 止损 / 保本 / trailing
- partial close / take profit
- re-entry / add-on 的统计准备

目标是把此前“问题只是从 `PREMISE` 挪到别的退出标签”的状态，推进成一套更符合 Al Brooks 的统一管理语义。

---

## 2. 主要依据

本轮调整继续只以 Al Brooks 体系为准，没有引入新的工程化打分阈值。

### 2.1 课程 PDF / 既有截图

- [BROOKS_PDF_EVIDENCE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)
- ![管理关键页](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_management_key-0337-0337.png)
- ![2R 止盈与风险回收](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_take_profit_risk2-0065-0065.png)
- ![保本止损不能无限容忍](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_breakeven_twice-0071-0071.png)
- ![前提改变后把 swing 降级为 scalp](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_premise_scalp-2477.png)
- ![前提改变后的退出逻辑](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_premise_exit-2621.png)

### 2.2 百科与实战案例

本轮直接相关的知识文件：

- [31 Protective Stops For Scalps剥头皮的保护止损.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学-视频字幕版/31-40%20交易管理/31%20Protective%20Stops%20For%20Scalps剥头皮的保护止损.md)
- [31D Converting swing to scalp; Scalping in strong ...md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/31D%20Converting%20swing%20to%20scalp;%20Scalping%20in%20strong%20%2022699d8757ab81fcb2fadf57de3d635c.md)
- [33G Breakeven stops and BO tests...md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/33G%20Breakeven%20stops%20and%20BO%20tests;%20Stops%20for%20scalpe%2022699d8757ab81caa3ffc1803c36cf9e.md)
- [36A Management is after entering trade...md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/36A%20Management%20is%20after%20entering%20trade%20Other%20Peopl%2022699d8757ab81ee8b75c451be107334.md)
- [37A What market can do Summary of How to Trade...md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/37A%20What%20market%20can%20do%20Summary%20of%20How%20to%20Trade%2022699d8757ab8182adb5d9b0b1f1da98.md)
- [38B Plan to take profits.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/38B%20Plan%20to%20take%20profits%2022699d8757ab8165b211ed673f4da6f3.md)
- [43D How to buy a Tight Bull Channel Stops and taking profits...md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/43D%20How%20to%20buy%20a%20Tight%20Bull%20Channel%20Stops%20and%20taki%2022699d8757ab818daec2d03fdb1fba4e.md)
- [44D How to sell a Tight Bear Channel Stops and taking profits...md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/44D%20How%20to%20sell%20a%20Tight%20Bear%20Channel%20Stops%20and%20tak%2022699d8757ab81bdb8e7d54a4e98a6d2.md)
- [45C Reversals are common, but fail; Diagnose early...md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/45C%20Reversals%20are%20common,%20but%20fail;%20Diagnose%20early%2022699d8757ab81e58837ef08ce67ab80.md)
- [49C Day trading examples (Trade Management focus).md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/49C%20Day%20trading%20examples%20(Trade%20Management%20focus)%2022699d8757ab81ac82eecb42cae9917e.md)
- [51B Bad Management.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB%20Console-Obsidian/Categories%20分类/Al%20brooks/价格行为学/51B%20Bad%20Management%2022699d8757ab8189bce8da51c359d56d.md)

---

## 3. 本轮代码变更

### 3.1 回测管理链

- [models.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/models.py)
  - 新增 `management_state`、`management_reason`、`best_price_bar`
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
  - premise 改变后优先降级，不再一刀切
  - 弱跟进、僵尸单先进入保护性管理，再决定退出
  - scalp / swing / reversal 的 TP、BE、trailing 逻辑分开
- [partial_close.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/risk_controls/partial_close.py)
  - 改成更接近 S7 的 2R/3R 分批
- [trailing_stop.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/risk_controls/trailing_stop.py)
  - swing 不再过早强制 BE
  - scalp / 反转试探有独立保护节奏
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)
  - 去掉写死的 `5m/15m` 多周期对齐

### 3.2 审计工具

- [audit_strategy_quality.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/audit_strategy_quality.py)
- [audit_management_chain.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/audit_management_chain.py)
- [selected_management_report.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/selected_management_report.py)

用途：

- 用固定精选窗口做 before/after 对照
- 同时输出场景、策略、家族、退出原因、管理组件占比

---

## 4. 回测样本

正式报告文件：

- [/tmp/ab_selected_management_report_20260314.json](/tmp/ab_selected_management_report_20260314.json)

本轮使用 9 个精选场景：

1. `C1_BTC_5m_2022`
2. `C2_BTC_15m_2022`
3. `C3_ETH_5m_2022`
4. `C4_ETH_15m_2023`
5. `C5_BTC_1h_2022`
6. `R1_BTC_5m_2025`
7. `R2_ETH_15m_2023Q1`
8. `R3_BNB_15m_2022Q1`
9. `R4_SOL_15m_2025Q2`

这些窗口覆盖了：

- 不同年份
- 不同品种
- 不同周期
- 既有旧行情，也有近期行情

---

## 5. 核心结果（v2）

### 5.1 总体结果

- 总交易数：`3227`
- 说明：这轮已经不是“没信号”，而是“管理链如何把机会变成利润”

### 5.2 各场景结果

| 场景 | 交易数 | 胜率 | PF | 平均 R |
|---|---:|---:|---:|---:|
| C1 BTC 5m 2022 | 646 | 24.30% | 0.507 | -0.140 |
| C2 BTC 15m 2022 | 254 | 28.74% | 0.670 | -0.080 |
| C3 ETH 5m 2022 | 650 | 26.46% | 0.535 | -0.013 |
| C4 ETH 15m 2023 | 293 | 16.72% | 0.249 | -0.175 |
| C5 BTC 1h 2022 | 52 | 21.15% | 0.366 | -0.164 |
| R1 BTC 5m 2025 | 650 | 17.23% | 0.327 | -0.196 |
| R2 ETH 15m 2023Q1 | 230 | 27.39% | 0.572 | -0.059 |
| R3 BNB 15m 2022Q1 | 277 | 25.27% | 0.435 | 0.533 |
| R4 SOL 15m 2025Q2 | 250 | 30.80% | 0.527 | -0.091 |

### 5.3 和 premise probe 基线的直接对照

与上一版管理链报告可直接对齐的 9 组样本：

| 场景 | 交易数 | 胜率 | PF | 平均 R |
|---|---|---|---|
| C1 BTC 5m 2022 | `521 -> 646` | `25.34% -> 24.30%` | `0.428 -> 0.507` | `-0.193 -> -0.140` |
| C2 BTC 15m 2022 | `194 -> 254` | `29.90% -> 28.74%` | `0.684 -> 0.670` | `0.473 -> -0.080` |
| C3 ETH 5m 2022 | `498 -> 650` | `27.71% -> 26.46%` | `0.490 -> 0.535` | `-0.104 -> -0.013` |
| C4 ETH 15m 2023 | `233 -> 293` | `16.74% -> 16.72%` | `0.225 -> 0.249` | `-0.248 -> -0.175` |
| C5 BTC 1h 2022 | `42 -> 52` | `26.19% -> 21.15%` | `0.478 -> 0.366` | `-0.225 -> -0.164` |
| R1 BTC 5m 2025 | `534 -> 650` | `19.10% -> 17.23%` | `0.295 -> 0.327` | `-0.216 -> -0.196` |
| R2 ETH 15m 2023Q1 | `172 -> 230` | `24.42% -> 27.39%` | `0.473 -> 0.572` | `-0.130 -> -0.059` |
| R3 BNB 15m 2022Q1 | `193 -> 277` | `27.46% -> 25.27%` | `0.354 -> 0.435` | `-0.192 -> 0.533` |
| R4 SOL 15m 2025Q2 | `183 -> 250` | `32.79% -> 30.80%` | `0.436 -> 0.527` | `-0.166 -> -0.091` |

判断：

- 方向没有偏离 Brooks
- 9 组里有 7 组 `PF` 改善
- 胜率没有系统性改善，但平均 `R` 普遍收窄，说明“少吃满损”这件事开始生效
- 仍然不是稳定赚钱系统，但退出结构已经比上一版更清楚、更可控

---

## 6. 退出结构变化

### 6.1 退出原因前后变化

旧结果（上一版 9 组精选场景）：

- `TP = 1003`
- `SL = 789`
- `PREMISE = 440`
- `WEAK_SCALP = 208`
- `ZOMBIE = 108`
- `FAILED_FT = 12`

新结果（本轮 v2）：

- `TP = 1174`
- `SL = 1359`
- `PREMISE = 652`
- `WEAK_SCALP = 75`
- `ZOMBIE = 37`
- `FAILED_FT = 0`

解释：

- `WEAK_SCALP / ZOMBIE / FAILED_FT` 被大幅压下去了，说明“弱就立刻判死”的问题继续减少。
- `TP` 明显增加，说明更多仓位被保留到了目标兑现。
- 但 `SL` 和 `PREMISE` 都上升了，说明问题已经从“标签杂乱”变成更硬的两类：
  - premise 仍然真的会失效
  - trailing/保护性止损里还有太多负向止损被归到 `SL`

### 6.2 全 9 组样本的管理组件统计

| 管理组件 | 交易数 | 占比 | 胜率 | PF | 平均 R |
|---|---:|---:|---:|---:|---:|
| partial_close_involved | 1430 | 43.31% | 34.55% | 0.946 | 0.192 |
| trailing_stop_exit | 1205 | 36.49% | 16.43% | 0.328 | -0.103 |
| breakeven_stop_exit | 858 | 25.98% | 19.70% | 1.073 | -0.040 |
| take_profit_exit | 1174 | 35.55% | 49.15% | 16.721 | 0.294 |
| premise_failure_exit | 764 | 23.14% | 8.77% | 0.048 | -0.295 |
| plain_stop_loss_exit | 154 | 4.66% | 0.00% | 0.000 | -1.255 |
| protective_scalp_involved | 1867 | 56.54% | 23.83% | 0.528 | -0.090 |
| reentry_trade | 71 | 2.15% | 26.76% | 0.556 | -0.197 |
| scale_in_trade | 92 | 2.79% | 82.61% | 52.957 | 3.694 |

当前最关键的事实：

- `take_profit_exit` 继续强，说明目标兑现逻辑是对的。
- `partial_close_involved` 明显改善到接近 `PF 1`，说明 2R/3R 结构开始真正起作用。
- `plain_stop_loss_exit` 大幅下降，说明“重新吃满原始止损”的问题被明显压住了。
- `protective_scalp_involved` 终于真实出现，说明这一套逻辑已经不只是概念。
- 真正的新瓶颈变成：
  - `PREMISE`
  - 被归类为 `trailing_stop_exit` 的大量负向保护性止损

这意味着下一步不该再盯“能不能继续加交易”，而要盯：

- 什么时候不该继续给 premise 宽容
- 什么时候该更早锁利润
- 什么时候不该让普通止损重新吃满

### 6.3 当前 top exit reasons

- `SL = 1359`
- `TP = 1174`
- `PREMISE = 652`
- `WEAK_SCALP = 75`
- `ZOMBIE = 37`

---

## 7. 策略与家族观察

### 7.1 交易数最高的策略

| 策略 | 交易数 | 胜率 | PF | 平均 R |
|---|---:|---:|---:|---:|
| 高2 | 675 | 20.74% | 0.421 | -0.153 |
| 低2 | 603 | 23.05% | 0.423 | -0.149 |
| 高1 | 510 | 19.80% | 0.500 | -0.110 |
| 低1 | 466 | 20.82% | 0.417 | -0.159 |

结论：

- 当前真正拖累系统的是 `趋势恢复族`
- 问题已经不是信号不够，而是这类交易进入后，如何更 Brooks 地转成：
  - 快速确认继续持有
  - 不行就更合理地降级成 scalp
  - 或者更早保本/锁盈

### 7.2 家族结果

| 家族 | 交易数 | 胜率 | PF | 平均 R |
|---|---:|---:|---:|---:|
| 趋势恢复族 | 1752 | 22.03% | 0.429 | -0.148 |
| MTR反转族 | 539 | 31.54% | 0.466 | -0.024 |
| 高潮/陷阱反转族 | 178 | 29.21% | 0.406 | -0.171 |
| 突破追随族 | 78 | 24.36% | 0.598 | -0.325 |
| 均线缺口族 | 23 | 34.78% | 0.806 | -0.207 |

判断：

- `趋势恢复族` 仍是主战场，且仍是最主要拖累。
- `MTR反转族` 这轮改善最明显，已经接近可以做 demo 观察白名单。
- `高潮/陷阱反转族` 和 `突破追随族` 也在改善，但还没到稳定赚钱。

---

## 8. 方向判断

### 8.1 没有偏离的部分

- 不再把 swing 一见弱就直接砍成垃圾单
- `WEAK_SCALP / ZOMBIE / FAILED_FT` 继续明显下降
- `protective_scalp` 终于真实进入统计，不再是空逻辑
- `partial close` 明显改善
- `plain SL` 大幅下降
- 多周期强度判断仍保持“不是写死固定周期”的设计

这些都符合 Brooks 的核心管理思想：

- 背景变了，就改变交易目标，而不是机械全平
- 区间按区间管，趋势按趋势管
- 有利润后应优先保护利润，而不是回吐到满损

### 8.2 还没解决的部分

- `PREMISE` 仍然过高
- `SL` 总量仍然太高，只是其中很多已经不是满损，而是保护性止损
- `trailing_stop_exit` 的 PF 明显太差，说明“保护性止损”和“优质 trailing”还没有彻底分层

---

## 9. 结论

这轮管理链 v2 的结论可以明确写成一句话：

**方向是对的，没有偏离 Brooks，而且已经看到了更清晰的正反馈，但当前系统的瓶颈已经收敛成“趋势恢复族的 premise / trailing / SL 结构”。**

更具体地说：

- 频率和机会保留已经够了
- `MTR反转族`、`高潮/陷阱反转族`、`突破追随族` 都在改善
- `趋势恢复族` 仍然没有过关
- 问题已经集中到 `premise / trailing / 保护性止损分类 / 趋势恢复族` 的协同

---

## 10. 下一步

建议按家族和管理动作继续推进，不再按单个策略碎修：

1. `趋势恢复族`
   - 继续拆 `premise -> trailing -> BE`
2. `MTR反转族`
   - 继续保留 `2R partial / 余仓 trailing`，不再大改
3. `高潮/陷阱反转族`
   - 重看 `保护性止损 -> trailing` 的分类
4. `突破追随族`
   - 保留观察，等待更多 demo 样本

每轮都继续做两件事：

- 先回钩 Brooks 课程 PDF + 百科案例
- 再跑固定精选窗口做 before/after 对照
