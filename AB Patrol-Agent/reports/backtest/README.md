# 回测结果摘要

> 更新于 2026-03-12

当前目录保存 Patrol 回测矩阵输出、15 分钟调参与四币候选报告。

> 说明：
> 从 2026-03-11 这轮开始，**单周期实验统一以 `--mode split` 为准**。
> 早期部分单周期报告使用了 `both`，会把同一周期重复统计一次，只能作为历史参考，不再作为当前权威结论。
> 从 2026-03-12 这轮开始，回测结果额外输出**账户口径**：`initial_capital / ending_equity / account_return_pct / account_max_drawdown`。

## 当前结论

- 当前最稳的方向仍然是 `5m + Brooks 全局路由 + 分层持仓管理`，但距离目标 `85% 胜率 / 日均 50 笔 / PF 1.5` 仍然很远。
- 新增账户口径后，不能再只看 `价格 PF`。`ETH / BNB` 在 `PF > 1` 附近仍可能出现**账户收益为负**，说明交易频率、盈亏分布和出场质量仍不足。
- 这轮最有价值的新发现不是“某个参数更大/更小”，而是一个结构坏样本簇：
  - `低2 + STOP + prior_leg_context=tr_second_leg + blocking_magnet_distance_r<0.35 + target_path_clear=false`
  - 在 `all4_5m_low2_v15_account.json` 的样本里是 `4 笔全亏，0 笔盈利`
  - 这对应 Brooks 在 `47B / 47C / 18E` 里的组合问题：`TR 里的 second-leg trap + 近端磁体 + 缺少 failed breakout`
- `v17` 的新结论同样重要：不能把“signal bar 看起来不错”直接当成放宽 first reversal 的理由。
  - 这轮把 `failed breakout + signal bar` 证据接进了结构上下文，但一旦用它去**放宽** `楔形底 / 头肩底MTR / H2-L2`，整体结果反而变差。
  - 这更符合 Brooks 原课的重点：`context first, signal second`。强 signal 只能在好 context 里加分，不能单独替代上下文。
- `v18` 的新结论是：当前交易频率低，首先不是“策略没开全”，而是 `TR mid-range` 路由本来就在主动挡单。
  - 四币 `5m` 的主阻塞项高度一致：
    - `交易区间里必须在边缘反做`
    - `交易区间中部不做单`
    - `15m 为 TR，5m 只做边缘 BLSHS 或明确反转`
  - 这说明当前低频主要来自 Brooks 的上下文过滤，不是简单漏掉了某个 setup。
  - 真正像工程实现偏差的拦截，主要在入场层：
    - `止损没有放到结构位外`
    - `5m 高2 止损过紧`
    - `5m 底部反转前方阻力过近`
- `v23/v24` 的新结论是：`TR2 Failed BO Fade` 不能退化成 `TR1 BLSHS`。
  - `v23` 把 `看衰突破` 扩成 Brooks `1-3 根失败突破` 后，`BTC 5m` 显著变好，但 `BNB/ETH` 被坏样本拖累。
  - 交易级审计显示，坏样本普遍缺少：
    - `failed_breakout_evidence`
    - `trapped_side`
    - 足够的 rejection tail
  - 更严重的是，部分 `看衰突破` 被错误走成 `LIMIT + tr_blshs_limit`，这已经不是 `47C / 15F / S6-tr` 的 `TR2`。
  - `v24` 把这层偏离收回来后，`BTC` 改进被保住，`SOL` 部分恢复，`BNB` 也比 `v23` 好一些，但相对 `v18` 仍不是全局净提升，所以暂不升级基线。
- `v25` 的新结论是：统一的 `structure stop` 后处理只能小幅纠偏，不能代替 playbook 专属止损模板。
  - 这轮把结构止损对齐直接接进真实 PA 引擎，回测链自动复用。
  - 结果是：`BTC/BNB` 的 `止损没有放到结构位外` 拦截略有下降，但总交易数几乎不变。
  - 说明 `S5` 的核心问题不是“再加一层统一 stop”，而是：
    - `H2/L2`
    - `TR2/TR3`
    - `R1/R2/R3`
    - `T6`
    的止损模板仍未真正分开。
  - 因此这轮只保留代码作为安全纠偏，不把 `v25` 升级为新基线。

## 回测注意事项

- `trendline break` 不是充分条件。当前 `低2` 样本里，很多亏损单同样具备 `trendline_break_confirmed=true`，但仍然死在近端磁体前。
- 第一目标磁体太近时，不要把远端测量目标当成“自然会到”。Brooks 的原意是先看最近共识位，再决定是 `scalp / swing / 等二次进场`。
- `TR 里的腿` 不能直接当 `trend leg`。`prior_leg_context=tr_second_leg` 时，优先级应下降，尤其是 `STOP` 追单。
- `failed breakout` 证据不足时，不要默认反转已经成立。现在很多 `低2` / `头肩底MTR` 的坏样本，本质仍是“第一次拐头”，不是成熟反转。
- 账户口径比价格口径更接近真实增长。即使 `PF` 改善，如果 `日均交易数` 太低或 `account_return_pct` 不改善，说明策略还不够可用。

## 数据质量基线

- `data_quality_20260311.json`
  - 首轮数据质量审计
  - 结论：本地 `backtest_cache` 结构完整，但四个加密缓存尾段新鲜度不一致
  - 结论：本地缓存与 Binance 公共期货 API 在重叠完整窗口内一致，差异只出现在最后一根未收盘 K 线
  - 结论：外汇/指数/贵金属原始行情没有结构性异常，先前 `EURUSD` 近似平线是展示层精度问题
- `data_quality_20260311_refreshed.json`
  - 刷新四个加密 `90 天 1m` 缓存后的审计报告
  - 结论：`BTC / ETH / BNB / SOL` 缓存尾段已统一到最新截面，仅与公共 API 存在 `1~3` 分钟正常延迟
  - 当前从这份报告开始，后续回测结果都应以“刷新后的缓存”为基线解释

## 回测链与真实链的关系

当前回测链不是另写一套“影子策略”，而是**直接复用真实 PA 引擎**：

- `BacktestRunner` 直接调用真实引擎的 `check_signals()`
- 只替换 4 个运行时部件：
  - `_fetch_candles` → `MarketReplay.get_candles`
  - 冷却存储 → 内存版冷却
  - `SignalPublisher` → 回测信号收集器
  - 执行出口 → `SimExchange`

这意味着：

- `pa_engine.py` 里的信号检测、形态识别、参数变动，回测会直接继承
- 回测与真实链真正不同的部分，主要是：
  - 数据源
  - 冷却时钟
  - 下单执行与持仓统计
  - 当前这套 Brooks 路由/管理实验仍只在回测链里加严，不会直接污染真实执行链

## 当前权威报告

- `multi_symbol_baseline.json`
  - 基线矩阵
  - 品种：`BTCUSDT / ETHUSDT`
  - 周期：`5m / 15m`
  - 评分阈值：`60 / 70`
- `btc_eth_15m_tuned_v2.json`
  - `BTCUSDT / ETHUSDT`
  - 周期：`15m`
  - 评分阈值：`55 / 60 / 65`
  - 引擎阈值覆盖：`15m:70`
- `bnb_sol_15m_tuned.json`
  - `BNBUSDT / SOLUSDT`
  - 周期：`15m`
  - 评分阈值：`55 / 60 / 65`
  - 引擎阈值覆盖：`15m:70`
- `all4_15m_candidate.json`
  - `BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
  - 周期：`15m`
  - 评分阈值：`60`
  - 引擎阈值覆盖：`15m:70`
- `btc_sol_15m_brooks_pullback_core.json`
  - `BTCUSDT / SOLUSDT`
  - 周期：`15m`
  - 评分阈值：`55 / 60`
  - 引擎阈值覆盖：`15m:70`
  - 策略配置档：`brooks_pullback_core`
  - 管理模板：`brooks_pdf`
- `btc_sol_15m_brooks_mtr_focus.json`
  - `BTCUSDT / SOLUSDT`
  - 周期：`15m`
  - 评分阈值：`55 / 60`
  - 引擎阈值覆盖：`15m:70`
  - 策略配置档：`brooks_mtr_focus`
  - 管理模板：`brooks_pdf`
- `btc_15m_mtr_pullback_core.json`
  - `BTCUSDT`
  - 周期：`15m`
  - 评分阈值：`55 / 60`
  - 引擎阈值覆盖：`15m:70`
  - 策略白名单：`头肩MTR / 突破回调`
  - 管理模板：`brooks_pdf`
- `btc_15m_mtr_pullback_core_v2.json`
  - `BTCUSDT`
  - 周期：`15m`
  - 评分阈值：`55 / 60`
  - 引擎阈值覆盖：`15m:70`
  - 策略白名单：`头肩MTR / 突破回调`
  - 管理模板：`brooks_pdf`
- `all4_5m_15m_global_brooks_v5.json`
  - `BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
  - 周期：`5m / 15m`
  - 统一 Brooks 路由 + 关键位 / 目标路径 / 结构止损 / 挂单确认
- `all4_5m_15m_global_brooks_v8.json`
  - `BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
  - 周期：`5m / 15m`
  - 在 `v5` 基础上增加 `5m premise / failed follow-through` 快管理
  - `15m` 保持原 swing 管理，不套用快节奏退出
  - 口径：`split`，已修正单周期重复统计
- `all4_5m_15m_global_brooks_v9_refreshed.json`
  - 刷新四个加密缓存后的干净基线
  - `BTC / 5m`、`BTC / 15m`、`SOL / 5m` 已达到 `PF > 1.5`
  - `ETH / 5m`、`BNB / 5m`、`ETH / 15m`、`BNB / 15m` 仍需继续优化
- `all4_5m_global_brooks_v10_h2tight.json`
  - `5m H2/L2` 全局收紧实验
  - 结论：**失败实验，只作为分析参考**
  - 虽然压缩了部分坏单，但同时明显伤害 `BTC / 5m`
  - 说明问题不在“所有 H2/L2 都太松”，而在“某些上下文里的 H2/L2 该更严”
- `high2_low2_context_v9.json`
  - `5m` 的 `高2 / 低2` 交易级上下文审计
  - 用于直接比较 `market_state / higher_market_state / background / exit_reason / risk_ratio`
  - 当前结论：`高2` 的主要坏样本集中在 `⚡ 震荡背景` 与 `risk_ratio < 0.55`
- `all4_5m_global_brooks_v11_high2filter.json`
  - 在 `v9` 基础上只对 `5m 高2 STOP` 增加窄规则
  - 规则：`震荡背景不追高2`，`risk_ratio < 0.55` 不追高2
  - 结果：`BNB 5m PF 0.84 -> 1.24`，`ETH 5m PF 0.48 -> 0.59`，`SOL 5m PF 1.56 -> 1.69`
  - 结果：`BTC 5m PF 2.66 -> 2.36`，有回撤但未被打坏
- `eth_5m_context_v11.json`
  - `ETHUSDT / 5m` 的交易级上下文审计
  - 结论：主要坏样本集中在 `双重底 / 楔形顶 / 头肩顶MTR`
  - 特征：大量出现在 `STOP` 进场、`target_path_clear = false`
- `all4_5m_global_brooks_v12_reversal_entry.json`
  - 在 `v11` 基础上增加两条反转入场窄规则
  - 规则 1：`5m 双重底 / 楔形底` 当前方阻力过近时，不直接用 `STOP` 追
  - 规则 2：`双层弱多 + target blocked` 的 `5m 楔形顶`，先等 `LH MTR / broad channel`
  - 结果：`BTC 5m PF 2.36 -> 2.64`，`SOL 5m PF 1.69 -> 1.81`
  - 结果：`BNB 5m PF 1.24 -> 1.24` 基本持平，`ETH 5m PF 0.59 -> 0.52`，说明 `ETH` 主问题已切换到别的反转 setup
- `eth_5m_context_v12.json`
  - `v12` 之后的 `ETHUSDT / 5m` 再审计
  - 结论：`双重底` 亏损单与 `楔形顶 / 头肩顶MTR` 已基本被切掉
  - 结论：剩余主拖累转移到 `双重顶` 与单笔 `头肩底MTR`
- `eth_bnb_5m_global_brooks_v13_focus.json`
  - `ETHUSDT / BNBUSDT / 5m` 的二次验证矩阵
  - 在 `v12` 基础上继续增加两条更窄的反转约束：
  - 规则 3：`5m 双重顶 STOP + target blocked` 不直接执行
  - 规则 4：`5m 头肩底MTR STOP + risk_ratio < 0.5 + target blocked` 不直接执行
  - 结果：`ETH 5m PF 0.52 -> 1.07`，最大回撤 `1.74% -> 1.06%`
  - 结果：`BNB 5m PF 1.24 -> 1.28`
- `btc_sol_5m_global_brooks_v13_focus.json`
  - `BTCUSDT / SOLUSDT / 5m` 的副作用验证矩阵
  - 结论：`v13` 没有打坏原本较强的两组
  - 结果：`BTC 5m PF 2.64 -> 3.42`
  - 结果：`SOL 5m PF 1.81 -> 2.06`
- `all4_5m_low2_wb_hsb_v13.json`
  - `低2 / 楔形底 / 头肩底MTR` 的四币交易级上下文审计
  - 结论：`低2` 不能一刀切，`BTC` 仍有高质量盈利样本，`SOL/ETH/BNB` 的坏样本更多
  - 结论：`楔形底` 的坏样本集中在 `weak_trend_bear + broad_range` 里的 first reversal
  - 结论：`头肩底MTR` 的坏样本集中在“当前与更高周期都还在 weak_trend_bear，且 target blocked”
- `all4_5m_global_brooks_v14_structural.json`
  - 在 `v13` 基础上继续把两条规则抽象成更结构化的约束，而不再只写死 `5m` 特判
  - 规则 5：`楔形底 STOP` 在 `weak_trend_bear + broad/tight range` 下先等 failed breakout 或二次确认
  - 规则 6：`头肩底MTR STOP` 若当前与更高周期都仍是 `weak_trend_bear` 且目标路径受阻，则先不执行
  - 结果：
    - `BTCUSDT 5m`: 胜率 `54.5%`，日均 `0.26`，`PF 3.80`，最大回撤 `0.86%`
    - `SOLUSDT 5m`: 胜率 `26.3%`，日均 `0.45`，`PF 2.06`，最大回撤 `1.04%`
    - `ETHUSDT 5m`: 胜率 `12.5%`，日均 `0.19`，`PF 1.34`，最大回撤 `0.74%`
    - `BNBUSDT 5m`: 胜率 `28.6%`，日均 `0.33`，`PF 1.28`，最大回撤 `1.18%`
  - 对比 `v13`：`ETH 5m PF 1.07 -> 1.34`，回撤 `1.06% -> 0.74%`；`BTC 5m PF 3.42 -> 3.80`
- `all4_5m_low2_v14.json`
  - `低2` 的四币专项审计，已经把 `follow_through / higher_follow_through / candidate_stage` 等上下文字段落盘
  - 当前结论：`低2` 仍不能一刀切
  - `BTC` 的主盈利仍来自 `STOP` 版 `低2`
  - `ETH / BNB / SOL` 的亏损样本普遍是 `weak_trend_bear + weak_trend_bear + target blocked + STOP`
  - 但这个组合里仍存在 `BTC` 的盈利样本，因此下一轮需要继续找更细的结构分界，而不是直接禁用 `低2`
- `all4_5m_global_brooks_v15_account.json`
  - 在 `v14` 基础上接入账户口径：`$10,000` 初始资金、单笔风险按 `risk_percent` 复利结算
  - 结果：
    - `BTCUSDT 5m`: 胜率 `54.5%`，日均 `0.26`，`PF 3.80`，账户收益 `+0.56%`，账户回撤 `0.27%`
    - `SOLUSDT 5m`: 胜率 `26.3%`，日均 `0.45`，`PF 2.06`，账户收益 `+0.50%`，账户回撤 `0.32%`
    - `ETHUSDT 5m`: 胜率 `12.5%`，日均 `0.19`，`PF 1.34`，账户收益 `-0.18%`
    - `BNBUSDT 5m`: 胜率 `28.6%`，日均 `0.33`，`PF 1.28`，账户收益 `-0.17%`
  - 结论：只看 `PF` 已经不够，`ETH/BNB` 仍然拖累账户增长
- `all4_5m_low2_v15_account.json`
  - `低2` 交易级审计，新增字段：
    - `trendline_break_confirmed`
    - `failed_breakout_evidence`
    - `first_target_distance_r`
    - `blocking_magnet_distance_r`
    - `prior_leg_context`
  - 结论：
    - `低2 STOP` 中，`prior_leg_context=tr_second_leg` 且 `blocking_magnet_distance_r<0.35` 的簇是 `4 笔全亏`
    - `failed_breakout_evidence` 当前仍然很少，说明很多候选单本质上还只是“第一次试探”
- `all4_5m_global_brooks_v16_l2trap.json`
  - 在 `v15` 基础上加入一条新的 Brooks 窄规则：
  - 规则：`低2 + STOP + prior_leg_context=tr_second_leg + blocking_magnet_distance_r<0.35 + target blocked` 不追
  - 对比 `v15`：
    - `BTCUSDT 5m`: 交易 `11 -> 10`，胜率 `54.5% -> 60.0%`，`PF 3.80 -> 4.84`，账户收益 `+0.56% -> +0.71%`
    - `SOLUSDT 5m`: 交易 `19 -> 17`，胜率 `26.3% -> 29.4%`，`PF 2.06 -> 2.89`，账户回撤 `0.32% -> 0.21%`
    - `ETHUSDT 5m`: `PF 1.34 -> 1.77`，账户亏损 `-0.18% -> -0.15%`
    - `BNBUSDT 5m`: 基本持平
  - 结论：这条规则对 `BTC / SOL` 有显著正效应，对 `ETH` 有轻微改善，对 `BNB` 影响不大，属于可保留的结构约束
- `all4_5m_global_brooks_v17_signalbar.json`
  - 新增 `signal_bar_quality / signal_bar_tail_ratio / signal_bar_close_position / reclaimed_prior_close / broke_micro_extreme`
  - 目的：把 Brooks 的 `signal bar` 质量和 `tails are failed breakouts` 真正写进交易级审计
  - 这轮实验尝试把这些字段直接用于放宽 `楔形底 / 头肩底MTR / H2-L2` 的 first reversal 入场
  - 对比 `v16`：
    - `BTCUSDT 5m`: 交易 `10 -> 11`，`PF 4.84 -> 3.56`，账户收益 `+0.71% -> +0.60%`
    - `SOLUSDT 5m`: 交易 `17 -> 18`，`PF 2.89 -> 2.49`
    - `ETHUSDT 5m`: `PF 1.77 -> 1.01`，账户收益 `-0.15% -> -0.26%`
    - `BNBUSDT 5m`: `PF 1.27 -> 1.15`
  - 结论：**这是失败实验，只保留审计字段，不保留放宽逻辑**。Brooks 的 signal bar 只能辅助确认，不能脱离 context 单独放宽底部反转。
- `all4_5m_global_brooks_v18_reason_audit.json`
  - 新增 `route_block_reasons / entry_block_reasons`
  - 目的：确认当前低频到底来自“缺策略”还是“Brooks 路由本来就在挡”
  - 结论：
    - 低频的主因确实是 `TR` 路由，而不是策略白名单
    - 四币都没有启用策略过滤，`strategy_whitelist/blacklist` 为空
    - 但回测里真正大量放行的 setup 仍集中在 `高2 / 低2 / MTR / DT/DB` 这些更常见结构上
- `all4_5m_global_brooks_v19_limit_stopfix.json`
  - 失败实验：尝试把 `tr_blshs_limit` 的止损自动外扩到结构位外
  - 结果：
    - `BTCUSDT 5m`: 交易 `10 -> 13`，PF 维持 `4.84`
    - `ETHUSDT 5m`: 交易 `8 -> 9`，PF `1.77 -> 1.49`
    - `BNBUSDT 5m`: 交易 `14 -> 16`，PF `1.27 -> 0.49`
    - `SOLUSDT 5m`: 交易 `17 -> 15`，PF 维持 `2.89`
  - 结论：单纯把 stop 放宽虽然能提升机会，但会明显打坏 `ETH/BNB`，所以**不保留这条逻辑**。
- `all4_5m_global_brooks_v21_playbook_route.json`
  - 新增 `playbook_id / playbook_family / order_bias` 审计字段，把候选单显式映射到 `TR / Channel / Trend / Reversal` 的 Brooks playbook
  - 同时把 `15m=TR` 时原来那条过于绝对的“只做边缘 BLSHS”改写成更细的：
    - `15m 为 TR，中部腿不做顺势追单`
    - `15m 为 TR，5m 顺势恢复已离开有利半区`
    - `15m 为 TR，5m H1/L1 只在边缘第一腿做`
  - 结果：
    - `BTCUSDT 5m`: 交易 `10`，胜率 `60.0%`，日均 `0.24`，`PF 4.84`，账户收益 `+0.71%`
    - `SOLUSDT 5m`: 交易 `17`，胜率 `29.4%`，日均 `0.40`，`PF 2.89`，账户收益 `+0.56%`
    - `ETHUSDT 5m`: 交易 `8`，胜率 `12.5%`，日均 `0.19`，`PF 1.77`，账户收益 `-0.15%`
    - `BNBUSDT 5m`: 交易 `15`，胜率 `26.7%`，日均 `0.36`，`PF 1.14`，账户收益 `-0.24%`
  - 结论：这轮最大的价值是**把 Brooks 路由逻辑理顺并可审计**，但净收益上没有超越 `v18`，所以它是“框架修正”，不是“性能提升版”。
- `all4_5m_global_brooks_v22_structural_stop.json`
  - 在 `v21` 基础上，把真实引擎里的 `H2/L2 / 20均线缺口 / 第一均线缺口` 止损改成更接近 Brooks 的结构止损
  - 目标：减少 `止损没有放到结构位外 / 高2止损过紧` 这类假性流失
  - 结果：
    - `BTCUSDT 5m`: 交易 `9`，胜率 `66.7%`，日均 `0.21`，`PF 7.70`，账户收益 `+0.72%`
    - `SOLUSDT 5m`: 交易 `17`，胜率 `29.4%`，日均 `0.40`，`PF 2.64`，账户收益 `+0.52%`
    - `BNBUSDT 5m`: 交易 `18`，胜率 `22.2%`，日均 `0.43`，`PF 0.86`，账户收益 `-0.44%`
    - `ETHUSDT 5m`: 交易 `7`，胜率 `0.0%`，日均 `0.17`，`PF 0.00`，账户收益 `-0.27%`
  - 结论：**结构止损不能一刀切外扩**。它明显改善了 `BTC`，但会伤害 `ETH/BNB`，所以当前不作为新的全局基线。
- `all4_5m_global_brooks_v23_failedbo.json`
  - 把 `看衰突破` 扩成 Brooks `1-3 根失败突破`
  - 结果：
    - `BTCUSDT 5m`: 胜率 `70.0%`，日均 `0.24`，`PF 10.03`，账户收益 `+0.93%`
    - `SOLUSDT 5m`: 胜率 `31.2%`，日均 `0.38`，`PF 2.52`，账户收益 `+0.50%`
    - `BNBUSDT 5m`: 胜率 `20.0%`，日均 `0.48`，`PF 0.86`，账户收益 `-0.48%`
    - `ETHUSDT 5m`: 胜率 `12.5%`，日均 `0.19`，`PF 0.27`，账户收益 `-0.15%`
  - 结论：`BTC` 明显改善，但 `BNB/ETH` 被错误放宽的失败突破样本打坏，不能升级为新基线。
- `failed_bo_context_v23.json`
  - `看衰突破` 的交易级审计
  - 结论：
    - 唯一明确盈利样本同时具备 `failed_breakout_evidence=true`、`trapped_side!=空`、`signal_bar_tail_ratio>=0.25`
    - `BNB` 的坏样本被错误走成 `LIMIT + tr_blshs_limit`
    - `SOL` 的坏样本没有真正 `failed breakout` 证据，而且 `target_path_clear=false`
- `all4_5m_global_brooks_v24_failedbo_strict.json`
  - 在 `v23` 基础上把 `看衰突破` 从 `TR1 BLSHS` 路由剥离，并要求：
    - 真实 `failed_breakout_evidence`
    - `trapped_side`
    - 足够 rejection tail
    - 合法目标空间
  - 结果：
    - `BTCUSDT 5m`: 胜率 `70.0%`，日均 `0.24`，`PF 10.03`，账户收益 `+0.93%`
    - `SOLUSDT 5m`: 胜率 `33.3%`，日均 `0.36`，`PF 2.72`，账户收益 `+0.53%`
    - `BNBUSDT 5m`: 胜率 `22.2%`，日均 `0.43`，`PF 0.86`，账户收益 `-0.44%`
    - `ETHUSDT 5m`: 胜率 `12.5%`，日均 `0.19`，`PF 0.27`，账户收益 `-0.15%`
  - 结论：`v24` 比 `v23` 更贴近 Brooks 原课，但相对 `v18` 仍不是全局净提升，因此继续作为分析参考，不升级稳定基线。
- `all4_5m_global_brooks_v25_structure_stop_realigned.json`
  - 把结构止损对齐直接接进真实 PA 引擎，新增模块：
    - `services/signal-service/src/engines/pa/structure_stops.py`
  - 回测链自动复用这层逻辑，不再只在 backtest 端修 stop
  - 结果：
    - `BTCUSDT 5m`: 胜率 `70.0%`，日均 `0.24`，`PF 10.06`，账户收益 `+0.94%`
    - `SOLUSDT 5m`: 胜率 `33.3%`，日均 `0.36`，`PF 2.72`，账户收益 `+0.53%`
    - `BNBUSDT 5m`: 胜率 `22.2%`，日均 `0.43`，`PF 0.86`，账户收益 `-0.42%`
    - `ETHUSDT 5m`: 胜率 `12.5%`，日均 `0.19`，`PF 0.27`，账户收益 `-0.15%`
  - 结论：
    - 这层修正没有打坏现有结果
    - `止损没有放到结构位外` 的阻塞略有下降，但总交易数几乎不变
    - 说明下一步必须把 stop 模板下沉到 `H2/L2 / TR2/TR3 / R1-R3 / T6`，不能继续靠统一 stop 后处理
- `btc_sol_15m_brooks_mtr_focus_v2.json`
  - `BTCUSDT / SOLUSDT`
  - 周期：`15m`
  - 评分阈值：`55 / 60`
  - 引擎阈值覆盖：`15m:70`
  - 策略配置档：`brooks_mtr_focus`
  - 管理模板：`brooks_pdf`
  - 口径：`split`
- `btc_sol_15m_hs_only_v1.json`
  - `BTCUSDT / SOLUSDT`
  - 周期：`15m`
  - 评分阈值：`55`
  - 引擎阈值覆盖：`15m:70`
  - 策略白名单：`头肩MTR`
  - 管理模板：`brooks_pdf`
  - 口径：`split`
- `all4_5m_15m_global_brooks_v1.json`
  - `BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
  - 周期：`5m / 15m`
  - 评分阈值：`60`
  - 引擎阈值覆盖：`5m:80, 15m:70`
  - 管理模板：`brooks_pdf`
  - 口径：`split`
  - 特点：启用 Brooks 全局路由约束，不做品种级白名单筛选
- `all4_5m_15m_global_brooks_v2.json`
  - `BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
  - 周期：`5m / 15m`
  - 评分阈值：`60`
  - 引擎阈值覆盖：`5m:80, 15m:70`
  - 管理模板：`brooks_pdf`
  - 口径：`split`
  - 分段：`2026-02-18~2026-03-11`、`2026-01-04~2026-01-25`
  - 特点：新增 `5m TR = BLSHS/limit/scalp`、止损后同向重入、`头肩/双顶底/楔形` 分离管理
- `all4_5m_15m_global_brooks_v3.json`
  - `BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
  - 周期：`5m / 15m`
  - 评分阈值：`60`
  - 引擎阈值覆盖：`5m:80, 15m:70`
  - 管理模板：`brooks_pdf`
  - 口径：`split`
  - 分段：`2026-02-18~2026-03-11`、`2026-01-04~2026-01-25`
  - 特点：新增 `5m` 服从 `15m` 结构状态，交易记录写入 `higher_market_state`
- `all4_5m_15m_global_brooks_v4.json`
  - `BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
  - 周期：`5m / 15m`
  - 评分阈值：`60`
  - 引擎阈值覆盖：`5m:80, 15m:70`
  - 管理模板：`brooks_pdf`
  - 口径：`split`
  - 分段：`2026-02-18~2026-03-11`、`2026-01-04~2026-01-25`
  - 特点：继续收紧 `15m 弱趋势 -> 5m 小反转 / H1/H2/L1/L2` 的放行条件

## Brooks 全局路由实验（当前最重要）

报告：`all4_5m_15m_global_brooks_v1.json`

这轮不再挑某个品种、某个策略，而是把 Brooks 的通用规则直接灌进整个回测框架：

- 市场状态识别补上 `pullback 深度 / channel 紧度 / follow-through`
- `强趋势 / 弱趋势 / 紧区间 / 宽区间` 统一接入策略矩阵
- 在 runner 中增加“路由一致性检查”
  - `TR` 中禁止突破追单和趋势延续单
  - 强趋势中的第一枪逆势反转，必须有更强证据
  - 弱趋势里的 breakout 缺少 FT 不追
- 报告新增 `signals_blocked_route`

### 1. 全局结论

- **全局路由是必要的**：所有品种都出现了大量 `route` 拦截，说明旧系统确实把很多不该进场的单拿去回测了
- **5m 不是完全不能做**：在全局路由下，`BTC / BNB` 的 `5m` 仍能跑出接近可用的结果
- **15m 仍是更稳的主周期**：`ETH / SOL` 的 `15m` 已经跑到 `PF > 1`
- **“任何市场都能做”不等于“任何 setup 都能做”**：全局适配的关键是市场状态路由，而不是把所有策略都保留

### 2. 各品种 / 周期结果

- `ETHUSDT / 15m`
  - 交易 `44`
  - 胜率 `38.64%`
  - 日均 `0.49`
  - `PF 1.08`
  - 路由拦截 `138`
- `SOLUSDT / 15m`
  - 交易 `32`
  - 胜率 `31.25%`
  - 日均 `0.36`
  - `PF 1.04`
  - 路由拦截 `144`
- `BNBUSDT / 5m`
  - 交易 `97`
  - 胜率 `32.99%`
  - 日均 `1.08`
  - `PF 0.91`
  - 路由拦截 `288`
- `BTCUSDT / 5m`
  - 交易 `94`
  - 胜率 `35.11%`
  - 日均 `1.04`
  - `PF 0.86`
  - 路由拦截 `321`
- `ETHUSDT / 5m`
  - 交易 `80`
  - 胜率 `26.25%`
  - 日均 `0.89`
  - `PF 0.66`
  - 路由拦截 `301`
- `BTCUSDT / 15m`
  - 交易 `56`
  - 胜率 `26.79%`
  - 日均 `0.62`
  - `PF 0.58`
  - 路由拦截 `134`
- `SOLUSDT / 5m`
  - 交易 `89`
  - 胜率 `23.6%`
  - 日均 `0.99`
  - `PF 0.58`
  - 路由拦截 `267`
- `BNBUSDT / 15m`
  - 交易 `40`
  - 胜率 `27.5%`
  - 日均 `0.44`
  - `PF 0.46`
  - 路由拦截 `155`

### 3. 从全局实验得到的问题分类

- **问题一：TR 与 Broad Channel 里的追突破仍太多**
  - 即使加了全局路由，`5m` 仍然有高交易数但 `PF < 1`
  - 说明还要继续压制 `TR` 里的趋势延续和 breakout chase
- **问题二：反转类 setup 需要继续细分**
  - `头肩MTR` 明显强于很多其它反转
  - `双重顶底 / 楔形` 在不同币种上的稳定性差异很大
- **问题三：管理模板已经改善了结果，但还不够**
  - `2R / 3R / trail` 已经让 `ETH/SOL 15m` 转正
  - 但还缺少 `止损后重入`、更细的结构 trailing、趋势晚期减仓

### 4. 当前最合理的全局方向

- 继续强化 **市场状态路由**，而不是先做品种白名单
- `5m` 只保留更少的 setup，主要作为加速确认或更严格的二次入场
- `15m` 继续作为主入场周期
- 下一轮优先做：
  - `止损后重入`
  - `TR / Broad Channel` 里的 `LIMIT vs STOP` 更明确区分
  - `双重顶底 / 楔形 / 头肩MTR` 三类反转的独立管理模板

## Brooks 全局路由实验 V2（当前最新）

报告：`all4_5m_15m_global_brooks_v2.json`

这一轮不再只改分数阈值，而是把原课里三条最关键的执行规则真正映射到了回测链：

- `5m TR` 按 `BLSHS` 处理：边缘 + 二次信号 + `LIMIT / scalp`
- 被止损后允许一次**同方向重入**，不把第一次止损直接判成方向错误
- `头肩MTR / 双重顶底 / 楔形` 拆成三套管理模板，不再共用一个 reversal 桶

对应的知识来源：

- `S6-tr.md`：TR 里 `limit`、`BLSHS`、tight TR 少做
- `S7-management.md`：止损后重入、`2R/3R/trail`
- 课程 PDF / 百科里的共识：`5m` 里强项不是乱追 breakout，而是清楚区分 `TR vs trend`

### 两段有效窗口汇总

- `BTCUSDT / 5m`
  - 交易 `34`
  - 胜率 `32.35%`
  - 日均 `0.81`
  - `PF 1.45`
  - 当前最稳的 `5m` 样本
- `SOLUSDT / 5m`
  - 交易 `39`
  - 胜率 `25.64%`
  - 日均 `0.93`
  - `PF 0.98`
  - 已接近打平，但还不够稳定
- `ETHUSDT / 15m`
  - 交易 `23`
  - 胜率 `34.78%`
  - 日均 `0.55`
  - `PF 0.89`
- `BNBUSDT / 15m`
  - 交易 `22`
  - 胜率 `31.82%`
  - 日均 `0.52`
  - `PF 0.83`
- `BNBUSDT / 5m`
  - 交易 `44`
  - 胜率 `20.45%`
  - 日均 `1.05`
  - `PF 0.46`
- `ETHUSDT / 5m`
  - 交易 `39`
  - 胜率 `17.95%`
  - 日均 `0.93`
  - `PF 0.19`

### 当前结论

- `BTC 5m` 的改善不是单段行情巧合，在两个窗口里都能维持正的 `PF`
- `SOL 5m` 已经从“明显失效”拉回到接近盈亏平衡，但还差最后一段结构过滤
- `ETH / BNB` 仍然说明一个事实：
  - 不是所有品种都适合同一组 `5m` 结构
  - 也不是所有 reversal 都该自动放行
- 下一轮不该再调统一阈值，而应继续按 Brooks 的结构细分：
  - 压掉 `ETH/BNB 5m` 里表现差的 `双重底 / 追突破 / 弱 follow-through`
  - 继续提高 `头肩MTR` 权重
  - 对 `SOL/BTC 5m` 引入更严格的 `TR 边缘 + 二次信号` 确认

## Brooks 全局路由实验 V3 / V4（最新）

### V3：5m 服从 15m 结构

报告：`all4_5m_15m_global_brooks_v3.json`

这轮新增的是最重要的多周期约束：

- `5m` 不再只看自己的 `market_state`
- 每个 `5m` 信号都会附带一个 `15m higher_market_state`
- 当 `15m` 是 `TR` 时：
  - `5m` 禁止追突破
  - `5m` 趋势延续单只允许边缘 `BLSHS`
- 当 `15m` 是强趋势时：
  - `5m` 的逆势单必须是更清晰的反转

V3 汇总结果：

- `BTCUSDT / 5m`
  - 交易 `27`
  - 胜率 `40.74%`
  - `PF 1.66`
  - 相比 V2：`PF 1.45 -> 1.66`
- `ETHUSDT / 5m`
  - 交易 `39`
  - 胜率 `20.51%`
  - `PF 0.24`
  - 相比 V2：`PF 0.19 -> 0.24`
- `BNBUSDT / 5m`
  - 交易 `39`
  - 胜率 `17.95%`
  - `PF 0.32`
- `SOLUSDT / 5m`
  - 交易 `35`
  - 胜率 `20.0%`
  - `PF 0.93`

结论：

- 这一步方向是对的，尤其 `BTC 5m` 明显受益
- 但 `ETH/BNB` 仍然说明：只知道 `15m` 的大状态还不够，还要继续限制 `弱趋势里的 5m 入场类型`

### V4：15m 弱趋势下，继续收紧 5m 入场

报告：`all4_5m_15m_global_brooks_v4.json`

这轮不是改阈值，而是继续按 Brooks 原课细化“弱趋势中能做什么”：

- `15m 弱多`：
  - `5m` 的 `双重顶 / 楔形顶` 这类小反转，需要更强证据
  - `5m` 的 `L1/L2` 逆势继续单直接禁掉
  - `5m` 的 `H1/H2` 必须要更好的 `follow-through`
- `15m 弱空` 同理反向处理

V4 汇总结果：

- `BTCUSDT / 5m`
  - 交易 `23`
  - 胜率 `39.1%`
  - `PF 1.57`
  - 仍保持正值
- `ETHUSDT / 5m`
  - 交易 `31`
  - 胜率 `22.6%`
  - `PF 0.51`
  - 相比 V3：明显改善
- `BNBUSDT / 5m`
  - 交易 `33`
  - 胜率 `21.2%`
  - `PF 0.29`
  - 交易数下降，但质量改善有限
- `SOLUSDT / 5m`
  - 交易 `25`
  - 胜率 `20.0%`
  - `PF 0.58`
  - 说明这条规则对 `SOL` 过严，开始误杀

当前最新判断：

- `BTC 5m` 已经证明：`TR 路由 + 15m 结构约束` 是有效方向
- `ETH 5m` 也开始被拉回来了，说明“弱趋势里的 5m 小反转 / H1-H2 过滤”是有效问题定位
- `BNB / SOL 5m` 仍然说明：下一轮不能再全市场一刀切，需要继续回到更细的步骤：
  - `关键位`
  - `follow-through`
  - `二次信号`
  - `目标路径`
  - `止损结构`

## 本轮 Brooks 微调（当前权威）

这轮不是继续放宽统一阈值，而是按 Brooks 原课把回测链改成更接近真实执行的方式：

- `2R / 3R / 余仓 trail`
- 不再对 swing / reversal 过早移到保本
- `MTR` 设置更高的最低分要求
- `breakout` 继续限制宽风险追单

### 1. `BTC-only`：`头肩MTR + 突破回调`

报告：`btc_15m_mtr_pullback_core_v2.json`

结果：

- `BTCUSDT / threshold=55`
  - 交易 `45`
  - 胜率 `40.0%`
  - 日均 `0.50`
  - `PF 1.12`
  - 最大回撤 `3.25%`
- `BTCUSDT / threshold=60`
  - 与 `55` 相同
  - 原因：`头肩MTR` 的风格最低分门槛已经把弱信号自动挡掉

主导策略：

- `头肩顶MTR`
  - `14` 笔
  - 胜率 `50.0%`
  - `PF 5.04`
- `头肩底MTR`
  - `31` 笔
  - 胜率 `35.48%`
  - `PF 0.83`

结论：

- 新管理模板对 `BTC` 是有效的，尤其 `头肩顶MTR` 已明显优于旧口径
- 当前瓶颈已经集中到 `头肩底MTR` 的筛选，不再是仓位管理主导问题

### 2. `BTC/SOL`：`brooks_mtr_focus`

报告：`btc_sol_15m_brooks_mtr_focus_v2.json`

结果：

- `BTCUSDT / threshold=55 or 60`
  - 交易 `44`
  - 胜率 `38.64%`
  - 日均 `0.49`
  - `PF 1.29`
  - 最大回撤 `3.12%`
- `SOLUSDT / threshold=55 or 60`
  - 交易 `11`
  - 胜率 `18.18%`
  - 日均 `0.12`
  - `PF 0.56`
  - 最大回撤 `3.37%`

结论：

- `BTC` 在 `MTR focus` 下继续改善，已经接近当前最优自动候选
- `SOL` 在“双重顶底 + 突破回调 + 头肩MTR”的混合池里仍然不行

### 3. `BTC/SOL`：`头肩MTR only`

报告：`btc_sol_15m_hs_only_v1.json`

结果：

- `BTCUSDT`
  - 交易 `45`
  - 胜率 `40.0%`
  - 日均 `0.50`
  - `PF 1.12`
- `SOLUSDT`
  - 交易 `17`
  - 胜率 `35.29%`
  - 日均 `0.19`
  - `PF 1.39`

结论：

- `SOL` 只有在进一步缩到 `头肩MTR` 后才开始接近可用
- `SOL` 的问题不在阈值，而在“不能把双重顶底/突破回调一起放进自动池”
- 当前更合理的方向是：
  - `BTC`：`头肩MTR + 突破回调`
  - `SOL`：只保留 `头肩MTR`

### 4. 当前阶段结论

- 还远没有达到 `85% 胜率 / 日均 50 笔 / PF 1.5`
- 但本轮已经把优化方向收敛到了：
  - `BTC`：重点修 `头肩底MTR`
  - `SOL`：继续只做 `头肩MTR`
  - 管理：下一轮补 `止损后重入` 和更贴近结构的 trailing

## Brooks 执行语义 V5 / V8（当前权威）

这轮把 Brooks 的执行链往真实语义又推进了两步：

- `v5`：关键位、目标路径、结构止损、`actual risk vs perfect stop`、`candidate -> pending -> fill`
- `v8`：只在 `5m` 上追加 `premise / failed follow-through` 快管理，不把这套快节奏误用到 `15m swing`

### V5 -> V8 的核心变化

- `BTCUSDT 5m`
  - `18 -> 20` 笔
  - 胜率 `50.0% -> 40.0%`
  - `PF 1.76 -> 2.00`
  - 回撤 `2.77% -> 0.65%`
- `BNBUSDT 5m`
  - `21 -> 22` 笔
  - 胜率 `23.81% -> 36.36%`
  - `PF 0.67 -> 1.48`
  - 回撤 `2.56% -> 1.06%`
- `SOLUSDT 5m`
  - `20 -> 15` 笔
  - 胜率 `25.0% -> 33.33%`
  - `PF 0.71 -> 1.16`
  - 回撤 `4.38% -> 0.56%`
- `ETHUSDT 5m`
  - `18 -> 5` 笔
  - `PF 0.23 -> 0.00`
  - 说明 `ETH 5m` 目前不是管理细节问题，而是入场质量本身不够

### 当前结论

- `5m` 上，Brooks 的快管理是有效的，但它不是“所有 setup 都放大”，而是“坏单更早退出、回撤显著下降”
- `15m` 上，沿用 `v5` 的 swing 管理更合理，不能套用 `5m` 的 premise 节奏
- 当前最接近可用的全局组合是：
  - `BTCUSDT 5m`：`PF 2.00`
  - `BNBUSDT 5m`：`PF 1.48`
  - `SOLUSDT 5m`：`PF 1.16`
  - `BTCUSDT 15m`：`PF 1.16`

### 下一轮最该补的不是阈值，而是这三层

1. `二次信号成熟度`
   - 重点是 `H1/H2/L1/L2` 什么时候只是观察，什么时候才算可执行
2. `目标路径里的磁体优先级`
   - `MM / 前高前低 / 整数关口 / gap` 谁先挡路、谁可以穿过
3. `S7` 的加仓与总风险
   - 首仓 `0.3%`、加仓 `0.3% + 0.4%`、总风险不超过 `1%`

## 旧口径实验（历史参考）

## 最新白名单/黑名单实验

这轮实验按 Al Brooks 原课把“追大突破”和“回调/MTR”拆开了。

共同条件：

- 品种：`BTCUSDT / SOLUSDT`
- 周期：`15m`
- 分段：`2025-12-11~2026-01-10 / 2026-01-10~2026-02-09 / 2026-02-09~2026-03-11`
- 引擎阈值覆盖：`15m:70`
- 管理模板：`brooks_pdf`

### 1. `brooks_pullback_core`

白名单：

- `头肩MTR`
- `双重顶底`
- `突破回调`
- `ioi突破`
- `高低2`

黑名单：

- `收线追进`
- `均线缺口`
- `ii突破`

结果：

- `BTCUSDT / threshold=55`
  - 交易 `74`
  - 胜率 `13.51%`
  - 日均 `0.82`
  - `PF 0.76`
- `SOLUSDT / threshold=55`
  - 交易 `54`
  - 胜率 `14.81%`
  - 日均 `0.60`
  - `PF 0.63`

结论：

- 这组过滤把大量追单信号挡住了，但没有留下足够高质量的剩余样本
- `头肩底MTR` 仍是两币里最强的单策略，但单独拉不动整组收益

### 2. `brooks_mtr_focus`

白名单：

- `头肩MTR`
- `双重顶底`
- `突破回调`

黑名单：

- `收线追进`
- `均线缺口`
- `ii突破 / ioi突破`
- `高1 / 高2 / 低1 / 低2`
- `楔形顶底`

结果：

- `BTCUSDT / threshold=60`
  - 交易 `14`
  - 胜率 `21.43%`
  - 日均 `0.16`
  - `PF 1.28`
- `BTCUSDT / threshold=55`
  - 交易 `74`
  - 胜率 `16.22%`
  - 日均 `0.82`
  - `PF 0.83`
- `SOLUSDT / threshold=55`
  - 交易 `50`
  - 胜率 `16.00%`
  - 日均 `0.56`
  - `PF 0.74`

结论：

- `MTR focus` 比 `pullback_core` 更稳，至少把 `BTC / 60` 拉到 `PF 1.28`
- 但交易数和胜率仍远低于目标，说明问题不只在“追单太多”，还在具体信号定义和出场管理
- 当前最值得继续保留观察的是 `BTCUSDT` 上的 `头肩顶MTR / 头肩底MTR`

### 3. 当前阶段结论

- `ETHUSDT / BNBUSDT` 已暂时移出自动候选池
- `BTCUSDT / SOLUSDT` 继续保留，但暂不适合直接扩大自动实盘
- 下一轮不该继续放宽统一阈值，而要回到：
  - `头肩MTR` 的结构识别
  - `突破回调` 的 follow-through 定义
  - `brooks_pdf` 管理模板里的 TP / trail / 重新入场逻辑

### 4. `BTC-only` 核心策略实验

这组实验进一步收窄，只保留：

- `头肩MTR`
- `突破回调`

结果：

- `BTCUSDT / threshold=60`
  - 交易 `24`
  - 胜率 `16.67%`
  - 日均 `0.13`
  - `PF 1.26`
  - 策略过滤拦截 `1436`
- `BTCUSDT / threshold=55`
  - 交易 `74`
  - 胜率 `21.62%`
  - 日均 `0.41`
  - `PF 1.21`
  - 策略过滤拦截 `1436`

主导策略：

- `threshold=60`
  - `头肩顶MTR`：`12` 笔，胜率 `16.67%`，`PF 2.75`
- `threshold=55`
  - `头肩底MTR`：`44` 笔，胜率 `22.73%`，`PF 1.25`

结论：

- 这组结果说明“继续缩窄到核心策略”是对的，整体 `PF` 比宽白名单更稳
- 但交易数、胜率仍远低于目标，问题已经集中到 `头肩MTR` 结构识别和持仓管理，而不是简单的阈值设置
- 下一轮应该继续做：
  - `头肩顶MTR / 头肩底MTR` 分开回测
  - `2R` 减仓、余仓 trail、止损后重入
  - `突破回调` 的 follow-through 和二次入场过滤

## 基线结论

### 1. `5m` 目前不能直接拿来做主入场

基线里 `BTC / ETH 5m` 的共同特征：

- 日均交易不到 `1`
- 胜率接近 `0`
- `PF = 0`

说明：

- 当前 `5m` 还不能稳定区分 TR 噪音和真正的 continuation
- 现阶段更适合把 `5m` 当作加速确认，不适合当主入场周期

### 2. `15m` 是当前唯一接近可用的方向

基线里 `15m` 至少能跑出正的盈利因子，说明结构上是对的，但离目标还很远。

## 15m 调参结论

本轮统一使用：

- 引擎阈值覆盖：`15m:70`
- 分段：两段 3 天行情

### 1. BTCUSDT

`btc_eth_15m_tuned_v2.json`：

- `threshold=55`
  - 交易 `13`
  - 胜率 `38.46%`
  - 日均 `2.17`
  - `PF 1.35`
- `threshold=60`
  - 交易 `12`
  - 胜率 `33.33%`
  - 日均 `2.00`
  - `PF 1.01`
- `threshold=65`
  - 与 `60` 基本一致

结论：

- `BTC` 还能做下一轮优化
- 但当前仍没有达到“高胜率 + 高频次”

### 2. ETHUSDT

`btc_eth_15m_tuned_v2.json`：

- `threshold=55`
  - 交易 `6`
  - 胜率 `16.67%`
  - `PF 0.23`
- `threshold=60 / 65`
  - 胜率 `0%`
  - `PF 0`

结论：

- 当前这套 `15m` 参数不适合 `ETH`
- `ETH` 暂时不应纳入自动交易候选

### 3. SOLUSDT

`bnb_sol_15m_tuned.json`：

- `threshold=55 / 60 / 65`
  - 交易 `8`
  - 胜率 `50.0%`
  - 日均 `1.33`
  - `PF 1.31`

结论：

- `SOL` 是四币里仅次于 `BTC` 的可继续优化对象
- 但当前还没到 `PF 1.5`

### 4. BNBUSDT

`bnb_sol_15m_tuned.json`：

- `threshold=55`
  - 交易 `8`
  - 胜率 `25.0%`
  - `PF 0.48`
- `threshold=60 / 65`
  - 交易 `7`
  - 胜率 `28.57%`
  - `PF 0.52`

结论：

- `BNB` 当前明显不适合这套参数
- 暂时不应进入自动交易池

## 四币候选排序

`all4_15m_candidate.json` 使用统一条件：

- 周期：`15m`
- 评分阈值：`60`
- 引擎阈值覆盖：`15m:70`

当前排序：

1. `SOLUSDT`
   - 胜率 `50.0%`
   - 日均 `1.33`
   - `PF 1.31`
2. `BTCUSDT`
   - 胜率 `33.33%`
   - 日均 `2.00`
   - `PF 1.01`
3. `BNBUSDT`
   - 胜率 `28.57%`
   - 日均 `1.17`
   - `PF 0.52`
4. `ETHUSDT`
   - 胜率 `0%`
   - 日均 `0.83`
   - `PF 0`

## 当前策略维度观察

本轮矩阵已经带出 `top_strategies` 与每段 `by_strategy`。

当前看到的现象：

- `SOL`
  - `头肩底MTR`
  - `双重底`
  - `ioi突破`
  有正贡献
- `BNB`
  - `双重底` 有单笔正贡献
  - 但 `头肩顶MTR / 双重顶 / 楔形顶` 明显拖累
- `ETH`
  - 当前主导策略里 `ioi突破` 仍是负贡献
- `BTC`
  - `双重顶 / 头肩底MTR` 有正贡献，但整体还不够稳定

这说明下一轮不该再只看“统一阈值”，而应开始做：

- 按策略类型筛选
- 按品种屏蔽失效策略

## 当前没有达到的目标

目标：

- 胜率 `>= 85%`
- 日均交易 `>= 50`
- 盈利因子 `>= 1.5`

当前没有任何一组达到这三个目标。

所以现阶段的真实结论是：

- 已经完成基线建立
- 已经确认 `15m` 明显优于 `5m`
- 已经确认参数不能全币种一刀切
- 已经确认下一步应该做“按策略类型 + 按品种”的筛选，而不是继续盲目放宽阈值

## 下一轮建议

1. 只保留 `BTCUSDT / SOLUSDT` 继续做下一轮实验
2. 对 `ETHUSDT / BNBUSDT` 先做策略屏蔽，不继续用统一参数硬跑
3. 把 `15m` 的有效策略先拆成白名单：
   - `头肩底MTR`
   - `双重底`
   - `ioi突破`
   - 以及 `BTC` 上当前正贡献的策略
4. 把明显拖累的策略做黑名单实验：
   - `头肩顶MTR`
   - `双重顶`
   - `楔形顶`
5. 增加“按策略类型聚合”的自动报告，而不是只看总收益

## V27-V29：playbook stop / limit 路由 / 管理模板联调

这一轮不是继续调统一阈值，而是把 Brooks 的三层逻辑补齐：

1. `H1/H2/L1/L2 / TR2 / TR3 / reversal / T6` 的 stop 模板继续按 playbook 下沉
2. `Broad Channel / higher TF = TR` 的合法 setup 从 `STOP` 错链路里拉回 `LIMIT`
3. `higher TF = TR` 的 `5m limit fade` 改成 `TR scalp` 管理，而不是继续按 reversal swing 管

理论支撑主要来自：

- `S4-strategy-match.md`
- `S6-tr.md`
- `S6-reversal.md`
- `47C 2nd Leg Trap`
- `47D Entering with limit orders`
- `14D Trend from the Open; Trending Trading Range`

### V27：playbook stop + 中间值限流

- 报告：`all4_5m_global_brooks_v27_playbook_stops_midcap.json`
- 结论：
  - `signals_generated` 从早先的硬封顶 `210` 抬到 `378`
  - 但仍能看出明显的统一日限流痕迹
  - `BTC`、`SOL` 可用，`ETH`、`BNB` 仍明显偏差

结果：

- `BTCUSDT`
  - 胜率 `47.4%`
  - 日均 `0.50`
  - `PF 2.82`
  - 账户收益 `+1.39%`
  - 账户回撤 `0.59%`
- `SOLUSDT`
  - 胜率 `19.0%`
  - 日均 `0.60`
  - `PF 1.22`
  - 账户收益 `+0.00%`
  - 账户回撤 `0.52%`
- `ETHUSDT`
  - 胜率 `10.0%`
  - 日均 `0.62`
  - `PF 0.48`
  - 账户收益 `-1.96%`
  - 账户回撤 `1.24%`
- `BNBUSDT`
  - 胜率 `11.1%`
  - 日均 `0.48`
  - `PF 0.15`
  - 账户收益 `-1.63%`
  - 账户回撤 `1.33%`

### V28：limit 路由修正 + 动态限流

- 报告：`all4_5m_global_brooks_v28_limit_route.json`
- 主要改动：
  - `TR / Broad Channel / higher TF TR` 里本该 `LIMIT` 的单，不再全都走 `STOP`
  - 日限流改成按 `cycle / signal_type / entry_type` 动态调整

结果：

- `BTCUSDT`
  - 胜率 `40.9%`
  - 日均 `0.52`
  - `PF 2.39`
- `SOLUSDT`
  - 胜率 `21.9%`
  - 日均 `0.76`
  - `PF 1.23`
- `ETHUSDT`
  - 胜率 `16.7%`
  - 日均 `0.57`
  - `PF 0.74`
- `BNBUSDT`
  - 胜率 `11.1%`
  - 日均 `0.64`
  - `PF 0.31`

结论：

- 机会数量确实被放出来了，`signals_generated` 普遍从 `378` 提到 `518~537`
- 但 `LIMIT` 路由修正后，管理模板仍然没完全跟上 Brooks

### V29：higher TF = TR 的 5m limit fade 改成 TR scalp 管理

- 报告：`all4_5m_global_brooks_v29_limit_management.json`
- 主要改动：
  - `higher TF = TR` 的 `5m limit fade / leg scalp`
  - 不再用 `reversal swing` 模板
  - 统一按 `brooks_tr_blshs` 管理

结果：

- `BTCUSDT`
  - 胜率 `34.8%`
  - 日均 `0.55`
  - `PF 2.59`
  - 账户收益 `+0.37%`
  - 账户回撤 `0.86%`
- `SOLUSDT`
  - 胜率 `24.2%`
  - 日均 `0.79`
  - `PF 1.40`
  - 账户收益 `+0.28%`
  - 账户回撤 `0.54%`
- `ETHUSDT`
  - 胜率 `16.7%`
  - 日均 `0.57`
  - `PF 0.78`
  - 账户收益 `-0.55%`
  - 账户回撤 `0.89%`
- `BNBUSDT`
  - 胜率 `22.2%`
  - 日均 `0.43`
  - `PF 0.63`
  - 账户收益 `-0.51%`
  - 账户回撤 `0.83%`

相对 `v27` 的结论：

- `BTC`
  - 频率略增，`PF` 仍然高于 `2`
- `SOL`
  - 频率明显提高，`PF` 从 `1.22 -> 1.40`
- `ETH`
  - `PF` 从 `0.48 -> 0.78`
  - 回撤从 `1.24% -> 0.89%`
- `BNB`
  - `PF` 从 `0.15 -> 0.63`
  - 回撤从 `1.33% -> 0.83%`

当前判断：

- `v29` 是比 `v27` 更接近 Brooks 的工作候选版本
- 但还不是稳定终版，因为：
  - `ETH / BNB` 仍未转正
  - 单品种日均仍明显偏低
  - 最大阻塞项仍是：
    - `交易区间里必须在边缘反做`
    - `交易区间中部不做单`
    - `止损没有放到结构位外`
    - `5m 高2 止损过紧`
    - `前方磁体簇过密，第一次信号先不追`

### 下一步最值得继续打的不是统一阈值

下一轮应继续按 Brooks 主线往下拆：

1. `TR edge / origin half / advantage zone` 的更细划分
2. `H2/L2` 的专属 stop 模板，而不是继续用统一 stop 逻辑
3. `磁体路径 / first target / trapped trader` 的更细 playbook 识别
