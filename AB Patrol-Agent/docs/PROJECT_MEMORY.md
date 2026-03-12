# 项目记忆

> 更新于 2026-03-12
> 用途：沉淀已经验证过的回测经验、回撤经验和 Brooks 对齐结论，避免后续重复试错。

## 一、最高原则

1. `Context > 形态 > 信号K线`
2. 不能为增加交易频率而破坏 Brooks 的市场状态纪律。
3. 不能只看 `PF`，必须同时看：
   - 胜率
   - 日均交易数
   - 账户收益
   - 账户最大回撤
4. 回测链必须尽量复用真实引擎，不能另写一套“影子策略”。
5. 每次优化都要能追溯到：
   - `knowledge/patrol-l1/references/S*`
   - `AB Console-Obsidian/Categories 分类/Al brooks`

## 二、已经证实正确的方向

### 1. 交易区间纪律必须保留

以下三条不能被当成“要删除的限制”，它们是 Brooks 主干：

- 交易区间里必须在边缘反做
- 交易区间中部不做单
- TR 里默认是 `limit order market`

对应依据：

- `S6-tr.md`
- `47B / 47C / 47D`

结论：

- 想增加交易数，不能靠放松 `TR 中部` 纪律。
- 合法增量应该来自：
  - 更好的 `Failed BO Fade`
  - 更好的 `2nd Leg Trap`
  - 更好的 `Broad Channel 顺势恢复`
  - 更多市场 / 更多品种 / 更多周期

### 2. `低2` 的 second-leg trap 过滤是有效的

已经验证有效的坏样本簇：

- `低2 + STOP + prior_leg_context=tr_second_leg + blocking_magnet_distance_r<0.35 + target blocked`

结论：

- 这是典型 Brooks `TR second-leg trap`
- 这条过滤对 `BTC / SOL` 明显有益
- 这是当前应保留的结构约束

对应依据：

- `S6-tr.md`
- `47C`
- `18B`

### 2.5 `TR2 Failed BO Fade` 不能退化成 `TR1 BLSHS`

已经确认：

- `看衰突破` 如果被改价成 `LIMIT + tr_blshs_limit`，会偏离 Brooks `47C / 15F`
- 真正有效的 failed breakout，通常同时具备：
  - `failed_breakout_evidence = true`
  - `trapped_side != ""`
  - `signal_bar_tail_ratio >= 0.25`
  - `target_path_clear = true`

结论：

- `TR2` 必须保留为“突破失败后的反向确认单”
- 不能把 `看衰突破` 混进 `TR1` 的边缘限价单模板
- 这条规则是后续继续补 `TR2 / TR3` 的前提

对应依据：

- `S6-tr.md`
- `15F`
- `47C`
- `47D`

### 2.6 统一的“后处理止损修正”只能小幅纠偏，不能代替 playbook 止损模板

已经确认：

- 在真实引擎后面统一加一层 `structure stop` 对齐，只能小幅减少
  - `止损没有放到结构位外`
- 但不能显著提升交易频率
- 也不能解决 `高2/低2 / 双重顶底 / MTR / TR2` 之间的止损语义差异

`v25` 的结果说明：

- `BTC / BNB` 的结构止损拦截略有下降
- 但四币总交易数几乎不变
- 头号阻塞项仍然是 `止损没有放到结构位外`

结论：

- 统一 stop post-process 可以保留，作为最后一道防线
- 但真正有效的修复必须下沉到各 playbook 检测函数里
- 以后不要再回到“统一调 stop 值”这条路

对应依据：

- `S5-evaluation.md`
- `S6-channel.md`
- `S6-reversal.md`
- `S6-tr.md`

### 3. `Context first, signal second` 是对的

强 signal bar 只能辅助确认，不能脱离 context 单独放宽。

已经证伪的做法：

- 用 `signal_bar_quality` 去放宽 first reversal / 底部反转

结论：

- 这是错误方向
- signal bar 只能加分，不能替代市场状态、关键位、目标路径和失败突破证据

对应依据：

- `08A`
- `15F`
- `S6-common.md`

### 4. 账户口径必须优先于价格口径

已经确认：

- `PF > 1` 不等于账户收益为正
- 低频 + 盈亏分布差，会让账户增长非常慢，甚至为负

结论：

- 后续一切优化必须同时看 `account_return_pct / account_max_drawdown`
- 不能再只用 `profit_factor` 做决策

## 三、已经证伪的方向

### 1. 不能全局放宽 `15m 为 TR` 下的 `5m` 顺势单

已经证伪：

- 直接放开 `5m channel scalp / trend continuation`

结果：

- 交易数上升
- 但 `BTC / ETH` 质量明显下降

结论：

- `15m 为 TR` 时，只能放行 Brooks 明确允许的例外
- 而且必须带：
  - 边缘位置
  - 有利半区
  - follow-through
  - 目标路径

### 2. 不能全局外扩结构止损

已经证伪：

- 把 `H2/L2 / EMA gap` 的止损统一放宽

结果：

- `BTC` 变好
- `ETH / BNB` 变差

结论：

- 止损模板必须按 playbook 分开
- 不能用统一 stop 模板覆盖所有市场状态

对应 Brooks 依据：

- `33A-33G`
- `41B`
- `S5-evaluation.md`

### 3. 不能把频率问题当成“策略没开全”

已经确认：

- 当前低频不只是“策略数量少”
- 更大问题是：
  - 真实检测到的 setup 族仍然集中在 `高2 / 低2 / MTR / DT/DB`
  - `TR2 / TR3 / Daily TR Fade` 这类 playbook 检测质量还不够

结论：

- 提高频率的正确方向是补 Brooks playbook 检测
- 不是盲目降低门槛

## 三点五、回撤经验总表

### 1. 哪些回撤是“好回撤”

- `BTC / SOL` 在保留 TR 纪律后，虽然日均偏低，但账户回撤明显可控
- 这类回撤说明系统在做对的事：
  - 没有在 TR 中部追单
  - 没有在近端磁体前硬追 stop
  - 没有把 first reversal 当成熟反转

### 2. 哪些回撤是“假改进”

- 交易数上去，但 `ETH / BNB` 的账户收益更差
- `PF` 上去，但 `account_return_pct` 没改善
- `BTC` 变好、其它品种同时被打坏

这三类都不算净提升。

### 3. 当前最常见的回撤来源

- `TR second-leg trap` 被误判成趋势腿
- 第一目标磁体过近，数学空间太差
- 止损没有放到真正结构位外
- signal bar 漂亮，但 context 仍然差
- 15m 仍是 TR，5m 却在中部追顺势

### 4. 后续每轮先检查的字段

- `route_block_reasons`
- `entry_block_reasons`
- `prior_leg_context`
- `failed_breakout_evidence`
- `blocking_magnet_distance_r`
- `first_target_distance_r`
- `account_return_pct`
- `account_max_drawdown`

## 四、当前最重要的问题排序

### P1. 真实策略检测仍然偏窄

表现：

- 放行后的成交策略仍主要集中在 `高2 / 低2`
- `TR2 / Failed BO Fade`
- `TR3 / 2nd Leg Trap`
- `TR4 / Daily TR Fade`
- `Broad Channel` 逆势和顺势恢复
  的实际触发仍然偏少

结论：

- 频率低，不只是路由问题，更是检测问题

### P2. 止损生成和 Brooks playbook 还没完全解耦

表现：

- `止损没有放到结构位外`
- `5m 高2 止损过紧`

长期是主拦截项

结论：

- 以后要按以下模板拆：
  - `tight trend` 的 H1/H2
  - `broad channel` 的 H2/L2
  - `higher TF = TR` 的 `5m` leg scalp
  - `TR2 / TR3` 的失败突破 / 第二腿陷阱
- 不能只在引擎末端补一层统一 `structure stop`

### P3. 频率目标不可能只靠四个币种单周期达成

当前 `5m`、四币、两段 21 天窗口下：

- 单品种日均大多在 `0.17 ~ 0.43`

结论：

- 想接近“每天大量订单”，最终必须靠：
  - 更多品种
  - 多市场
  - 多周期
  - 更多合法 playbook

不能靠破坏纪律硬堆。

## 五、后续优化铁律

后续每一轮优化必须按这个顺序：

1. 先找当前坏样本簇
2. 回到 `patrol-l1 + PDF` 找理论依据
3. 只改和该 Brooks playbook 直接相关的局部逻辑
4. 跑同口径矩阵
5. 对比：
   - 胜率
   - 日均交易数
   - PF
   - 账户收益
   - 账户回撤
6. 只有“净提升”才能进入稳定基线

## 六、当前稳定基线口径

当前最稳的解释基线仍是：

- `all4_5m_global_brooks_v18_reason_audit.json`

它的作用不是“最终答案”，而是当前最干净的 Brooks 基线：

- `BTCUSDT 5m`: 胜率 `60.0%`，日均 `0.24`，`PF 4.84`，账户收益 `+0.71%`
- `SOLUSDT 5m`: 胜率 `29.4%`，日均 `0.40`，`PF 2.89`，账户收益 `+0.56%`
- `ETHUSDT 5m`: 胜率 `12.5%`，日均 `0.19`，`PF 1.77`，账户收益 `-0.15%`
- `BNBUSDT 5m`: 胜率 `28.6%`，日均 `0.33`，`PF 1.27`，账户收益 `-0.18%`

后续优化必须拿它做对照，不允许只和某一轮失败实验比。

## 七、V27-V29 新经验（2026-03-12）

### P4. 交易频率低，不只是路由过严，生成端统一日限流也会失真

表现：

- `v27` 以前，四币 `5m` 两段窗口里很多 run 的 `signals_generated` 固定在 `378`
- 这对应的是 `5m` 每天 `18` 个信号上限被打满，而不是市场真实自然只给这么多机会

结论：

- Brooks 的问题不该被“每天每品种固定上限”主导
- 生成端必须按 `cycle / signal_type / entry_type` 做细分限流
- `TR / limit order market / reversal fade` 允许更多评估机会
- `breakout chase` 仍要更保守

### P5. 15m 是 TR 时，5m 的 limit fade 必须按 TR scalp 管理

表现：

- `v28` 把一部分 `Broad Channel / higher TF TR` 的合法 setup 从 `STOP` 错链路里拉回了 `LIMIT`
- 但若仍按 `reversal swing` 管理，这些单会被拖坏，尤其在 `ETH / BNB`

结论：

- `higher TF = TR` 的 `5m limit fade / leg scalp`
  不能继续走：
  - `brooks_hs_reversal`
  - `brooks_dt_db_reversal`
  - `brooks_wedge_reversal`
- 必须统一按 `brooks_tr_blshs` 处理
- 这和 Brooks 原课一致：
  - `trade in a trading range like a trading range`
  - `scalp more, swing less`

### P6. V29 是当前比 V27 更接近 Brooks 的候选版本

同口径：

- 四币：`BTCUSDT / ETHUSDT / BNBUSDT / SOLUSDT`
- 周期：`5m`
- 分段：`S1 2026-02-18~2026-03-11` + `S2 2026-01-04~2026-01-25`
- 阈值：`60`
- 引擎阈值覆盖：`5m:80, 15m:70`
- 管理模板：`brooks_pdf`

`v29_limit_management` 结果：

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

相对 `v27` 的净变化：

- `BTC`
  - 交易频率小幅提升，`PF` 仍保持高位
- `SOL`
  - 交易频率明显提升，`PF` 从 `1.22 -> 1.40`
- `ETH`
  - 交易数基本持平，但 `PF` 从 `0.48 -> 0.78`，回撤明显下降
- `BNB`
  - 交易数没有提升，但 `PF` 从 `0.15 -> 0.63`，回撤明显下降

结论：

- `v29` 不是终点，离目标仍很远
- 但方向已经比 `v27` 更接近 Brooks：
  - 更多合法机会被放出来
  - `higher TF TR` 的 `5m limit fade` 不再被用错管理模板
  - `ETH / BNB` 的负收益仍在，但质量已经比早几轮稳定

### P7. 当前最大剩余问题

`v29` 里最顽固的拦截项仍是：

- `交易区间里必须在边缘反做`
- `交易区间中部不做单`
- `止损没有放到结构位外`
- `5m 高2 止损过紧`
- `前方磁体簇过密，第一次信号先不追`

结论：

- 下一阶段主战场不再是统一限流
- 而是：
  - `边缘 / 中部 / advantage zone` 的更细颗粒度判定
  - `H2/L2` 的 playbook 专属止损
  - `磁体路径` 和 `first target` 的更细分层

### P8. `broad_range` 不能再被当成纯 `TR`

这轮重新对照了：

- `S4-strategy-match.md`
- `S6-channel.md`
- `S6-tr.md`
- `13 Trading Ranges and Vacuums交易区和真空区.md`
- `16F Limit orders on Reversal Trade on Channel...md`

确认了一个关键偏离：

- 之前回测链里 `market_key == broad_range` 会直接路由成 `TR1/TR2/TR3`
- 这会把 `Broad Channel` 的顺势恢复、边缘逆势、`H2/L2 in channel`
  全部误压成纯 `TR scalp`

这轮已做的纠偏：

- `broad_range` 从 `_resolve_playbook_context()` 里拆出来
- `R1_BROAD_CHANNEL_REVERSAL`
- `T2_BROAD_CHANNEL_RECOVERY`
- `T3_BROAD_CHANNEL_EMA`
- `T6_TR_LEG_*`
  不再和 `tight_range` 共用同一条总路由

同时新增了两条经验，后面不要再反复试：

- `Broad Channel reversal` 的 `头肩 / MTR` 不能直接沿用 `brooks_hs_reversal`
  - 在 `Broad Channel` 里，第一类 reversal 更接近 `minor reversal / scalp more`
  - 已改为按 `brooks_wedge_reversal` 管理
- `Broad Channel reversal` 如果：
  - `target_path_clear = false`
  - `blocking_magnet_distance_r < 1`
  - 且没有 `failed_breakout_evidence`
  - 就不应升级成 `executable`

### P9. 这轮已证伪的方向

以下几条，这轮已经试过，不是当前主解：

- 降低 `TR midline / session_open` 的磁体权重
  - 对当前 `BTC/SOL 5m` 烟测几乎没有变化
- 把 `H2/L2 STOP` 的统一 executable 分数从 `68` 降到 `62`
  - 对当前 `BTC/SOL 5m` 烟测几乎没有变化

说明：

- 当前频率瓶颈不主要在“统一评分门槛”
- 也不主要在“中线/open 磁体”
- 更像是：
  - `Broad Channel` 的 reversal / recovery 路由仍不够细
  - `H2/L2` 的 `second-leg trap / trapped trader / first target`
    识别仍然不够准

### P10. 当前最新烟测口径

同口径：

- 周期：`5m`
- 分段：
  - `S1 2026-02-18~2026-03-11`
  - `S2 2026-01-04~2026-01-25`
- 阈值：`60`
- 引擎阈值覆盖：`5m:80, 15m:70`
- 管理模板：`brooks_pdf`

最新结果：

- `btc_5m_v37_h2_floor_smoke.json`
  - 交易 `9`
  - 胜率 `33.3%`
  - 日均 `0.21`
  - `PF 1.04`
  - 账户收益 `+0.05%`
  - 账户回撤 `0.47%`
- `sol_5m_v36_target_magnet_soften_smoke.json`
  - 交易 `4`
  - 胜率 `25.0%`
  - 日均 `0.10`
  - `PF 0.16`
  - 账户收益 `-0.17%`
  - 账户回撤 `0.17%`

当前最稳定的判断：

- `BTC 5m` 方向没有偏离 Brooks，但频率仍明显不够
- `SOL 5m` 当前最坏的不是路由总量，而是：
  - `头肩底MTR` 在 `R1_BROAD_CHANNEL_REVERSAL` 下仍容易是假 reversal
  - `H2/L2` 依旧大量被 `second-leg trap / 近端磁体` 卡住
- 下一轮应优先做：
  - `R1_BROAD_CHANNEL_REVERSAL` 的 trapped-trader / failed breakout 证据细化
  - `H2/L2` 的 `first target / blocking magnet / trapped side`
    分品类审计，而不是继续调统一阈值

### P11. 2026-03-12 新增经验：不要把“频率低”误判成“应该先放宽过滤”

这轮又验证了 3 条很关键的经验：

1. 直接移除 `Wyckoff / RSI / OBV / No Demand` 的硬拦截，不会自动回到 Brooks 正轨
   - 对照课件：
     - `01 Price Action价格形态.md`
     - `02 My Setup我的设置.md`
     - Brooks 确实强调“放弃指标，只看价格行为 + EMA”
   - 但在当前系统里，直接删掉这层门槛后，
     `all4_5m_global_brooks_v38_price_action_only.json`
     结果显著变差：
     - `BTCUSDT 5m`: 日均 `0.31`，`PF 0.50`
     - `ETHUSDT 5m`: 日均 `0.12`，`PF 0.00`
     - `BNBUSDT 5m`: 日均 `0.21`，`PF 0.58`
     - `SOLUSDT 5m`: 日均 `0.10`，`PF 0.16`
   - 结论：
     - 这不说明这些指标是对的
     - 说明当前 `playbook/state/context` 还不够成熟
     - 贸然删除外围门槛，只会把原本没被 Brooks 语义正确分类的坏单放进来

2. 仅凭“15m 在边缘”去放宽 `5m H2/L2`，会带来更多交易，但质量明显下降
   - 相关实验：
     - `btc_sol_5m_v41_higher_tf_edge_blshs.json`
     - `btc_sol_5m_v42_higher_tf_edge_limit_only.json`
   - 结果：
     - `BTCUSDT 5m`: 日均从 `0.21 -> 0.40`，但 `PF 1.04 -> 0.83`
     - `SOLUSDT 5m`: 日均从 `0.10 -> 0.17`，但 `PF 0.16 -> 0.65`
   - 结论：
     - “高周期边缘”只能是加分项，不能单独替代
       `failed breakout / trapped trader / target path / second-leg trap`
     - 否则只是把更多 `weak signal` 从 watch 推到 executable

3. `LIMIT` 单统一加宽止损，也不是当前主解
   - 相关实验：
     - `btc_sol_5m_v40_limit_wide_stop.json`
   - 结果和 `v39` 基本一致，说明：
     - 当前最大的卡点还不在 limit 止损模板
     - 主矛盾仍在更前面的 `state -> playbook -> executable`

因此，后续不要再优先尝试：

- 先删外围门槛 hoping 频率自然起来
- 先放宽高周期边缘语义 hoping H2/L2 自然转正
- 先统一放宽 limit stop hoping 通过更多结构检查

后续更应该做的是：

- 让 `TR / Broad Channel` 自己产出更像 Brooks 的 setup
  - `TR2 failed breakout`
  - `TR3 second-leg trap`
  - `R2 TR edge reversal`
- 减少“先生成趋势单，再被路由挡掉”的比例
- 把 `state-first` 真正做进信号生成，而不是只放在后置过滤

### P12. 2026-03-12 新增经验：先纠正架构偏差，再谈参数优化

这轮代码审查确认，之前“越优化越差”不只是参数问题，而是回测链和真实链逐步分叉了。

关键结论：

1. 活跃回测链里曾经叠了非 Brooks 前置层
   - `BackgroundAnalyzer`
   - `ScoringEngine`
   - `Wyckoff / RSI / OBV / No Demand`
   - `quality_score / min_q`
   - `daily / h4` 背景硬过滤
2. 这些层会让回测变成：
   - `真实 PA 信号 -> 额外指标层 -> 额外评分器 -> Brooks 路由`
   - 而不是我们真正要的
   - `真实 PA 信号 -> Brooks 路由 -> 结构检查`
3. 回测还额外叠了一层 `cfg.threshold`
   - 真实引擎已经做过各周期 `signal_threshold`
   - 过去它是回测后置第二层全局阈值，会虚假压低频率
4. Patrol 主交易链并不直接走 `pa_engine.py`
   - 当前真实主链是 `runtime/rule_engine.py + runtime/position_manager.py`
   - 所以前面很多“改回测”的动作，未必改善 Patrol 真链

本轮修正：

- 活跃回测链已删除上述非 Brooks 前置过滤
- 回测分数回到真实 PA 引擎自己的 `strength`
- `cfg.threshold` 改成覆盖真实引擎的全局 `signal_threshold`，不再当回测后置第二套执行门槛

新的工作原则：

- 先查架构偏差，再做参数微调
- 先保证回测链和真实链语义一致，再看胜率/频率/PF
- 频率不够时，优先怀疑
  - `state-first` 没做够
  - `TR / Broad Channel` setup 生成不对
  - `target path / stop structure / trapped trader` 过严
- 不要再用外围指标层去“补” Brooks 路由

### P13. 2026-03-12 新增经验：`state-first` 前移后，频率恢复了，但主矛盾转成生成层质量

本轮继续确认了两个事实：

1. 活跃回测 API 也必须切到新链
   - 旧 `services/api-service/src/routers/backtest.py`
   - 之前仍调用 `tools/backtest_tool.py`
   - 这会把旧 `BackgroundAnalyzer / ScoringEngine` 世界观继续带回来
   - 本轮已切到 `libs.backtest.runner.BacktestRunner`

2. 把 `state-first` 前移到 `pa_engine.py` 生成层以后，确实收回了一部分坏单
   - 新报告：
     - `all4_5m_global_brooks_v44_state_first.json`
   - 统一口径：
     - 4 币
     - 5m
     - 14 天
     - `threshold=60`
     - `management_profile=brooks_pdf`
   - 结果：
     - `BTCUSDT 5m`: 胜率 `24.8%`，日均 `7.21`，`PF 0.94`，账户收益 `-1.82%`，账户回撤 `3.02%`
     - `ETHUSDT 5m`: 胜率 `23.0%`，日均 `8.71`，`PF 0.44`，账户收益 `-6.48%`，账户回撤 `6.91%`
     - `BNBUSDT 5m`: 胜率 `22.2%`，日均 `9.00`，`PF 0.47`，账户收益 `-7.77%`，账户回撤 `8.01%`
     - `SOLUSDT 5m`: 胜率 `20.2%`，日均 `9.21`，`PF 0.48`，账户收益 `-7.49%`，账户回撤 `7.54%`

与纯化后的 `v43` 相比：

- `BTCUSDT 5m`: `PF 0.85 -> 0.94`，账户收益 `-3.98% -> -1.82%`，账户回撤 `4.74% -> 3.02%`
- `SOLUSDT 5m`: `PF 0.36 -> 0.48`，账户收益 `-10.75% -> -7.49%`，账户回撤 `10.78% -> 7.54%`

这说明：

- 之前“几乎没交易”的问题，确实主要来自外围门槛和旧架构偏差
- 现在频率已经恢复到每个品种日均 `7-9` 笔量级
- 但主矛盾不再是“有没有机会”，而是：
  - `state -> playbook` 生成层仍然会放出很多低质量 `H1/H2/L1/L2`
  - `stop structure / target path / trapped trader` 还不够早进入生成层

新的优化原则：

- 频率问题暂时不要再优先靠“放宽过滤”解决
- 主攻方向改为：
  - `TR2 failed breakout`
  - `TR3 second-leg trap`
  - `R2 TR edge reversal`
  - `T6 broad channel recovery`
- 目标是让这些 Brooks playbook 更早被生成，而不是让趋势单先生成、再被后置路由裁掉

### P14. 2026-03-12 新增经验：`急赴磁体` 不能当成独立可执行 setup

本轮在 `v44` 里发现：

- `急赴磁体` 是四个品种共同的最大亏损来源
  - `BTCUSDT`: `55` 笔，`PnL -2.92`
  - `ETHUSDT`: `73` 笔，`PnL -7.72`
  - `BNBUSDT`: `81` 笔，`PnL -6.39`
  - `SOLUSDT`: `73` 笔，`PnL -5.04`

这说明当前实现把“磁体效应”误当成了独立 entry setup。

按照 Brooks 原课与课程大纲：

- magnet / vacuum 更像
  - `target path`
  - `minimum objective`
  - `failed breakout` 之后的去向
- 它不是在当前实现精度下可单独执行的稳定策略

因此本轮做了纠偏：

- `pa_engine.py` 不再直接生成 `急赴磁体` 订单信号
- `急赴磁体` 降回上下文信息

新报告：

- `all4_5m_global_brooks_v45_no_magnet_setup.json`

结果：

- `BTCUSDT 5m`: 胜率 `31.2%`，日均 `3.43`，`PF 1.16`，账户收益 `+0.62%`，账户回撤 `0.82%`
- `ETHUSDT 5m`: 胜率 `21.6%`，日均 `3.64`，`PF 0.48`，账户收益 `-2.60%`，账户回撤 `3.06%`
- `BNBUSDT 5m`: 胜率 `22.4%`，日均 `3.50`，`PF 0.55`，账户收益 `-2.37%`，账户回撤 `2.63%`
- `SOLUSDT 5m`: 胜率 `15.8%`，日均 `4.07`，`PF 0.44`，账户收益 `-2.71%`，账户回撤 `3.42%`

和 `v44` 比：

- 交易频率明显下降，但不再是核心问题
- `BTC` 已经转成账户正收益
- 四币账户回撤都明显下降

这说明：

- 现在最该继续打的是 setup 质量，而不是机会数量
- `急赴磁体` 这条路线以后不要再恢复成独立交易策略

### P15. 2026-03-12 新增经验：默认活跃入口必须是 Brooks / PA 主链，legacy PG 只能隔离保留

本轮确认了一个架构污染源：

- `signal-service` 默认入口之前仍然是旧 `PG` 规则引擎
- 这条链会继续把仓库里的旧世界观暴露成“默认行为”

本轮已修正为：

- `services/signal-service/src/__main__.py` 默认启动 `PA / Brooks` 引擎
- `services/signal-service/src/engines/__init__.py` 默认导出 `get_default_engine() -> get_pa_engine()`
- legacy PG 仅保留为兼容选项：`--engine legacy-pg` 或 `--pg`

以后原则：

- 默认活跃路径只能是 Brooks / PA 主链
- 旧 PG / Wyckoff / momentum / volume 只能作为 legacy 兼容代码存在，不能再参与默认执行口径

### P16. 2026-03-12 新增经验：`stop structure` 不是当前主根因，生成层才是

本轮围绕止损做了连续三轮同口径实验：

- `v46`: `all4_5m_global_brooks_v46_pa_default_playbook_fix.json`
- `v47`: `all4_5m_global_brooks_v47_trend_stop_tolerance.json`
- `v48`: `all4_5m_global_brooks_v48_trend_stop_mid.json`

共识很清楚：

1. `pa_engine` 里原来的 playbook 标签和回测链不一致，尤其是：
   - `T6`
   - `MAG 20/20 Setup`
   - `T1/T2/T3`
2. 这类命名/止损对齐问题修掉后，架构更纯，但并没有直接把结果拉到目标附近
3. 继续只围绕 `stop tolerance` 微调，不会解决主问题

这三轮结果说明：

- `v46`：纯化和 playbook 对齐后，`BTC` 接近打平，`ETH/BNB/SOL` 仍明显为负
- `v47`：放宽趋势恢复类止损容差后，交易频率回升到 `3-4` 笔/天，但四币 `PF` 再次整体掉回 `1` 以下
- `v48`：把容差重新收紧到中间值后，结果与 `v47` 基本相同

因此可以定性：

- `stop structure` 只是显性放大器，不是当前主根因
- 当前主根因仍然是：
  - `state -> playbook` 生成层还不够 Brooks
  - `H1/H2/L1/L2 / reversal / TR` 仍有不少 setup 在错误状态下被升级成 executable

以后优化优先级：

1. 先改生成层
2. 再改路由与管理
3. 最后才是止损缓冲这类参数

### P17. 2026-03-12 新增经验：`TR means BLSHS` 不能只写在路由里，生成层也必须补回 `TR 边缘 H2/L2`

本轮继续对照 Brooks / 太妃课件后确认：

- `TR means BLSHS`
- `双底 = 高2`
- `双顶 = 低2`
- `H1/H2/L1/L2` 在交易区间里并不是天然无效，而是必须受边缘、磁体路径与 second-entry 成熟度约束

代码层发现的偏差是：

- 回测路由允许 `15m TR -> 5m 边缘 BLSHS`
- 但 `pa_engine.py` 在 `cycle == 区间` 时，之前只生成 `H1/L1 + 看衰突破 + 第二腿陷阱 + 反转`
- 没有生成 `H2/L2`

这会造成：

- 理论上允许的 Brooks second entry 在源头就漏掉
- 后续只能靠少量 `双顶/双底/楔形` 间接替代，交易机会与 playbook 语义都不完整

本轮已修正：

- `cycle == 区间` 时补回 `detect_h2_l2()`
- 这条改动应该保留，它属于 Brooks 体系内的“补漏”，不是放宽纪律

结论：

- 以后如果出现 “路由允许但生成层不产信号” 的情况，优先按 Brooks 原课检查是否漏掉了合法 playbook
- `TR` 的优化方向不是放松中部追单，而是补齐边缘 second entry

### P18. 2026-03-12 新增经验：`stop_structure_ok` 不能用固定百分比；真正的主矛盾是 `H2/L2` 与 `第二腿陷阱` 的上下文成熟度

本轮做了两轮连续验证：

- `v50`: `all4_5m_global_brooks_v50_dynamic_stop_buffer.json`
- `v51`: `all4_5m_global_brooks_v51_second_entry_evidence.json`

先验证出的工程问题：

- 回测里 `stop_structure_ok` 之前用的是固定 `0.1%` 结构外缓冲
- 对 `5m` 来说，这个固定比例明显偏机械，和 Brooks 的“结构位外一点点缓冲”不一致

于是改成了：

- 按 `ATR + signal bar range + price tick` 的动态缓冲判断结构外止损

`v50` 结果说明：

- 频率大幅回升到单品种 `3.6 ~ 5.0` 笔/天
- 但 `PF` 全面回落到 `1` 以下
- 这证明固定 `0.1%` 的确误杀了一部分单，但也说明并不是所有被放出来的单都值得做

随后继续按 Brooks 收紧 second entry 证据：

- `第二腿陷阱` 必须有 `failed breakout / trapped trader / trendline break`
- `区间/弱趋势里的 H2/L2` 不能只靠形态本身升级成 executable，必须补充失败突破或趋势线破坏证据

`v51` 结果说明：

- `BTCUSDT 5m`: 胜率 `31.4%`，日均 `2.50`，`PF 1.01`，账户收益 `+0.14%`
- `BNBUSDT 5m`: 胜率 `32.4%`，日均 `2.43`，`PF 1.09`，账户收益 `-0.69%`
- `ETHUSDT 5m`: 胜率 `18.9%`，日均 `2.64`，`PF 0.59`
- `SOLUSDT 5m`: 胜率 `11.4%`，日均 `3.14`，`PF 0.21`

从策略层看得更清楚：

- `高2` 在 `BTC/BNB` 上已经接近或超过可用边界
- `低2` 和 `第二腿陷阱` 仍然是当前最大的公共亏损源
- 所以主矛盾不在 stop buffer，而在：
  - `H2/L2` 何时从 candidate 升级到 executable
  - `第二腿陷阱` 何时真的具备 trapped trader / failed breakout 证据

以后优先级：

1. 继续按 Brooks 细化 `高2/低2` 的上下文成熟度
2. 继续细化 `第二腿陷阱` 的 trapped trader / failed breakout 证据
3. 不要再单独围绕固定 stop 百分比做实验
