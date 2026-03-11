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
