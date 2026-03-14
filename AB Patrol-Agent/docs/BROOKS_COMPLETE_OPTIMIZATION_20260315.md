## Brooks 全链优化报告（2026-03-15）

### 1. 本轮目标

本轮不是继续零散修补，而是做一轮完整优化，目标有三项：

1. 把 `protective_stop` 四条失败路径继续拆到底。
2. 把 `PREMISE / FAILED_FT / WEAK_SCALP` 统一收进 Brooks 主链，不再各自走不同兜底逻辑。
3. 用同一轮代码同时跑核心 3 窗口与更广 7 窗口，验证没有把频率和之前已有提升打掉。

### 2. 本轮实际代码改动

本轮核心改动都在 [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)。

#### 2.1 按家族统一 protective profile

新增 `_family_protective_profile()`，把保护性管理统一到 Brooks 家族，而不是只让趋势恢复族单独有 profile：

- `trend_recovery`
- `mtr_reversal`
- `climax_reversal`
- `breakout_follow`
- `tr_scalp`

每个家族都明确了：

- `detail`
- `target_r`
- `partial_fraction`
- `protect_r`
- `loss_cap_r`

这样 `PREMISE / FAILED_FT / WEAK_SCALP` 进入保护性管理时，不再只是“进入 protective_scalp”，而是按 setup 家族走不同保护节奏。

#### 2.2 把四条保护性失败路径拆成真正不同的动作

本轮继续细化的 detail：

- `tr_scalp_protect`
- `second_entry_profit`
- `reversal_protect`
- `breakout_protect`

对应改动不是简单放宽止损，而是更早把“已经变弱但还没完全失败”的交易转成 Brooks 式的小 scalp / scratch：

- `tr_scalp_protect`：TR scalp 退化后优先小利/小亏离场
- `second_entry_profit`：二次入场若落回 TR 或缺少 follow-through，更早保护
- `reversal_protect`：MTR / climax 反转若没有真正确认，优先降级
- `breakout_protect`：突破后缺少 FT 或路径受阻，更早转保护

#### 2.3 把 protective 管理入口统一

以前这几个入口各自传不同参数，造成保护性管理风格不一致：

- `premise.get("action") == "REDUCE"`
- breakout 的 `FAILED_FT`
- 趋势恢复族的 `WEAK_SCALP`
- TR scalp 的 `WEAK_SCALP`

现在统一改成通过 `_family_protective_profile()` 进入保护性管理。

#### 2.4 成本模型保留并输出

上一轮已经补了市场成本模型与交易级成本字段，本轮继续沿用：

- `crypto_futures`
- `forex_cfd`
- `metals_cfd`
- `index_cfd`

并继续在回测输出中保留：

- `entry_cost_pct`
- `exit_cost_pct`
- `total_cost_pct`

### 3. Brooks 依据

本轮没有引入新的工程打分逻辑，仍然只沿 Brooks 体系做：

- 保护性管理不是“等止损打”，而是 premise 变弱后转成 scratch / scalp / protected swing
- breakout 失败后大概率回到 TR，不该继续死拿
- minor reversal 很常见，真正的 major reversal 需要更多结构确认
- second entry 的质量必须结合背景、follow-through、目标路径和是否退化成 TR

直接对应的证据与截图索引继续参考：

- [BROOKS_PDF_EVIDENCE.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)
- [BROOKS_FULL_CHAIN_AUDIT_20260314.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_FULL_CHAIN_AUDIT_20260314.md)
- [BROOKS_SYSTEM_ROOT_CAUSE_20260315.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_SYSTEM_ROOT_CAUSE_20260315.md)

本轮仍然主要落在这些 Brooks 语义上：

- `Managing trades well is more important than spotting perfect setups`
- breakout 失败后回 TR
- first entry / second entry 要按背景分命运
- premise 变了就改变持仓逻辑，而不是机械死扛

### 4. 核心 3 窗口回测对比

对比文件：

- 优化前：[/tmp/ab_probe_complete_report_v2.json](/tmp/ab_probe_complete_report_v2.json)
- 优化后：[/tmp/ab_probe_complete_report_v3.json](/tmp/ab_probe_complete_report_v3.json)

#### 4.1 总体变化

- 总交易数：`610 -> 755`
- 加权胜率：`33.11% -> 28.48%`
- 平均 PF：`0.717 -> 0.807`
- 平均日频：`6.56 -> 8.12`

#### 4.2 组件变化

- `protective_stop_exit`：`199 -> 338`，PF `0.0000 -> 0.0018`
- `protective_scalp_exit`：`53 -> 101`，PF `18.70 -> 32.03`
- `premise_failure_exit`：`81 -> 54`，PF `0.030 -> 0.036`
- `plain_stop_loss_exit`：`51 -> 40`
- `tp_after_scaleout_exit`：`19 -> 22`，PF `61.08 -> 999`

#### 4.3 家族变化

- `趋势恢复族`：`175 -> 207`，PF `0.818 -> 1.193`
- `MTR反转族`：`364 -> 461`，PF `0.736 -> 0.717`
- `高潮/陷阱反转族`：`31 -> 43`，PF `0.264 -> 0.421`
- `突破追随族`：`38 -> 42`，PF `0.725 -> 0.676`

#### 4.4 结论

3 窗口结果说明本轮优化真正修到了两件事：

1. `趋势恢复族` 已经从“接近可控”推到了 `PF > 1`
2. `premise_failure_exit` 和 `plain_stop_loss_exit` 继续下降

但也暴露出一个新问题：

- 胜率没有同步上升
- `MTR反转族` 和 `突破追随族` 被额外放大了一些低质量交易

所以 3 窗口不能直接宣布“系统已经转正”，必须看更广样本。

### 5. 7 窗口完整验证

验证文件：

- 场景：[/tmp/ab_complete_validation_scenarios_v1.json](/tmp/ab_complete_validation_scenarios_v1.json)
- 结果：[/tmp/ab_complete_validation_report_v2.json](/tmp/ab_complete_validation_report_v2.json)

#### 5.1 总体结果

- 总交易数：`1555`
- 加权胜率：`31.32%`
- 平均 PF：`0.935`
- 平均日频：`7.17`
- 总成本：`133.5414%`
- 平均每笔成本：`0.0859%`

#### 5.2 家族结果

- `趋势恢复族`：`449` 笔，胜率 `36.08%`，PF `1.2195`
- `MTR反转族`：`930` 笔，胜率 `30.43%`，PF `0.8331`
- `高潮/陷阱反转族`：`96` 笔，胜率 `26.04%`，PF `0.2914`
- `突破追随族`：`75` 笔，胜率 `17.33%`，PF `0.6801`
- `均线缺口族`：`5` 笔，胜率 `80.00%`，PF `9.5129`

#### 5.3 代表性策略

- `高2`：`194` 笔，PF `1.3441`
- `低2`：`154` 笔，PF `1.0714`
- `双重底`：`163` 笔，PF `1.0730`
- `楔形底`：`83` 笔，PF `1.4372`
- `低1`：`38` 笔，PF `2.0277`

仍明显偏弱的：

- `头肩顶MTR`：PF `0.5714`
- `双重顶`：PF `0.7685`
- `看衰突破`：PF `0.3065`
- `ii突破`：PF `0.8737`

#### 5.4 组件结果

- `protective_stop_exit`：`690` 笔，PF `0.0032`
- `premise_failure_exit`：`104` 笔，PF `0.0505`
- `plain_stop_loss_exit`：`82` 笔，PF `0.0000`
- `protective_scalp_exit`：`226` 笔，PF `40.5079`
- `runner_trailing_exit`：`57` 笔，PF `999`
- `tp_after_scaleout_exit`：`32` 笔，PF `999`
- `breakeven_stop_exit`：`604` 笔，PF `1.6227`

### 6. 当前最重要的结论

#### 6.1 日均频率、胜率、PF 还在控制中吗

还在控制中，但不是“已经稳定达标”。

当前可以确认：

- 频率没有崩，7 窗口平均日频仍有 `7.17`
- PF 明显继续抬升，已经逼近 `1`
- 胜率仍然偏低，没有跟着 PF 一起跃升

也就是说，当前系统处于：

- **频率可控**
- **PF 正在接近可行**
- **胜率仍是主瓶颈**

#### 6.2 系统整体是不是还亏

从这次 7 窗口完整验证看，**系统整体仍然未完全转正**，因为平均 PF 还是 `0.935`。

但系统已经不再是“全家都亏得很差”，而是进入了新的结构：

- `趋势恢复族` 已经整体转正
- 一部分具体策略也已经转正
- 真正拖累系统的变成了 `MTR反转族`、`高潮/陷阱反转族`、`突破追随族`

#### 6.3 现在为什么还是赚不到足够的钱

根本原因已经不是“没有信号”，而是这三层：

1. `保护性管理` 虽然更像 Brooks 了，但仍有太多交易先掉进 `protective_stop_exit`
2. `MTR反转族` 与 `高潮/陷阱反转族` 里，还混着不少 Brooks 会做 scratch / small scalp 的弱交易
3. 真实成本不轻，当前每笔平均 `0.0859%`，会把本来很薄的优势继续压扁

### 7. 从前往后、从里往外的现状判断

#### 7.1 背景识别

现在主问题已经不在“有没有区分背景”，而在“弱背景下是否仍让某些 detector 过早出手”。

#### 7.2 候选策略预选

`趋势恢复族` 已经显著改善，说明这一层大方向是对的。  
弱点主要还在：

- `头肩顶/底MTR`
- `末端旗形`
- `第二腿陷阱`
- `看衰突破`

#### 7.3 入场触发

问题已经不是“完全没入场机会”，而是某些反转/陷阱 setup 还会把“应该先等确认”的单提前放出来。

#### 7.4 premise / strength

本轮已经把 protective 入口统一了，所以 premise/strength 现在更一致。  
但 `premise_failure_exit` 仍然有 `104` 笔，说明 premise 变弱时，仍有不少单没有平滑转成 scratch / BE。

#### 7.5 protective / scratch / scalp

这层现在是主战场。

好消息：

- `protective_scalp_exit` 非常强
- `runner_trailing_exit` 非常强
- `tp_after_scaleout_exit` 非常强

坏消息：

- `protective_stop_exit` 仍然是最大亏损桶

#### 7.6 BE / trailing / partial / TP

一旦交易真的成熟，系统已经比较会赚钱。  
说明问题不是“后段完全不会管理”，而是太多交易在成熟之前就死了。

#### 7.7 re-entry / add-on

本轮没有继续扩这部分，原因是当前真正的系统瓶颈还不在加仓，而在主仓位能不能优雅活到成熟阶段。

#### 7.8 成本

现在成本已经单独输出，可以明确讲：

- crypto futures 成本口径相对合理
- forex / metals / index 还只是近似模型
- 杠杆不会改善 PF，只会放大波动与风险

### 8. 当前阶段判断

这轮可以明确说是**有效优化**，不是假改善。

理由有三点：

1. 3 窗口里 `趋势恢复族 PF > 1`
2. 7 窗口里整体 PF 已经推到 `0.935`
3. 频率没有崩，说明这不是靠大砍交易数换来的

但也必须同时承认：

- 还没有达到系统级盈利
- 目标的 `55%` 胜率与 `PF 1.2` 现在还远
- 当前主瓶颈已经收敛到 `MTR反转族 / 高潮陷阱反转族 / protective_stop`

### 9. 下一步建议

下一轮不该再全面撒网，而应该只做两件事：

1. 继续沿 Brooks 原文收 `MTR反转族` 和 `高潮/陷阱反转族` 的 detector 边界  
   重点：
   - `头肩顶/底MTR`
   - `末端旗形`
   - `第二腿陷阱`
   - `看衰突破`

2. 继续压 `protective_stop_exit`  
   目标不是把所有亏损变没，而是把更多退化交易从：
   - `protective_stop_exit`
   挪到：
   - `protective_scalp_exit`
   - `breakeven_stop_exit`
   - `tp_after_scaleout_exit`

只有这两块继续抬起来，系统级 PF 才有机会从 `0.935` 真正跨过 `1`。
