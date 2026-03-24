# 20-gap 完整执行流程与当前卡点图

更新日期：2026-03-18

## 1. 文档目的

这份文档只做两件事：

1. 把当前 `20均线缺口` 在系统里的完整执行流程摊平；
2. 把当前最关键的卡点、已证伪方向、和下一步突破口固定下来。

适用场景：

- 电脑重启后快速恢复上下文
- 和人工一起复盘讨论
- 后续扩到 `第一均线缺口 / MAG / 其他策略族` 时复用

---

## 2. 当前可信基线

当前可信工作基线是 `v38`。

三组核心样本：

- `F1 BTC 15m 2022`
  - 交易 `11`
  - 日频 `0.3548`
  - 胜率 `45.45%`
  - PF `1.0673`
- `R1 BTC 5m 2024Q3`
  - 交易 `9`
  - 日频 `0.2903`
  - 胜率 `55.56%`
  - PF `1.1848`
- `P1 BTC 5m 2022Q1`
  - 交易 `12`
  - 日频 `0.3871`
  - 胜率 `66.67%`
  - PF `1.0920`

组级结果：

- `fixed v38`
  - 交易 `20`
  - 日频 `0.2151`
  - 胜率 `50.00%`
  - PF `0.7507`
- `random v38`
  - 交易 `9`
  - 日频 `0.0726`
  - 胜率 `55.56%`
  - PF `0.2962`
- `stress5m v38`
  - 交易 `71`
  - 日频 `0.3272`
  - 胜率 `57.75%`
  - PF `1.6348`

说明：

- `v38` 之前，工作区里混入过单实验残留，导致看起来像“单条规则生效”，实际不是干净基线。
- 这轮已经把那个问题拆干净了。

---

## 3. 交易员视角下，20-gap 到底是什么

按 Al Brooks / 太妃的语义，`20-gap` 更像：

- 趋势长期在均线同侧
- 舒适区大致 `20-30` 根
- 第一次回到 EMA 附近
- 出现同侧恢复信号
- 强一点的，先看测试原趋势极值
- 弱一点的，降成 `close-test / scalp`

也就是说，它天然就不是单一模板，而是至少有两层：

- `trend recovery continuation`
- `test / scalp`

当前系统已经把这两层做出来了，但弱簇还没分干净。

---

## 4. 系统里的完整执行流程

### 4.1 多周期角色层

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/timeframe_roles.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`

职责：

- 统一 `结构周期 / 主背景周期 / 锚定周期`
- 避免实时链和回测链出现两套不同背景

当前状态：

- 这层已经不是 `20-gap` 的主阻塞

### 4.2 detector 层

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/ema_gap_template.py`

职责：

- 定义 `20-gap / 第一均线缺口 / MAG`
- 输出：
  - `ema_gap_setup_mode`
  - `ema_gap_expected_objective`
  - `valid_previous_entry`
  - `ema_gap_*` 结构字段

当前状态：

- 大方向已经对齐知识库
- 但弱 `20-gap` 仍会大量落成 `test`

### 4.3 pre-route 分流层

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`

核心函数：

- `_prepare_ema_gap_pre_route_disposition`
- `_ema_gap_disposition_profile`

职责：

- 在真正下单前先分流成：
  - `no_trade`
  - `scalp_only`
  - `fade_candidate`
  - `continuation`

当前状态：

- 这层已经把很多明显坏单挡掉了
- 但 `broad_range + close-test + scalp_only` 这簇仍然不够干净

### 4.4 入场路由层

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`

核心函数：

- `_apply_entry_route_adjustments`
- `_convert_to_limit_order`

职责：

- 决定是 `STOP` 追价，还是 `LIMIT` 试单

当前状态：

- 这是当前最像突破口的一层
- 已经确认：
  - 全局统一改 `LIMIT` 会打坏 `5m`
  - 但“只对非 `5m` 的弱 `broad_range + ema_gap_test + close-test` 改 `LIMIT`”是有希望的

### 4.5 目标与管理层

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/ema_gap_management.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`

职责：

- 处理：
  - `close-test`
  - `rescue`
  - `swing`
  - `scalp`
  - `BE`

当前状态：

- 不是空白
- 真正赚钱的单，很多已经能通过 `SCALP` 出来
- 说明“后半段没做”不是主因

### 4.6 交易执行与成交链

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`

职责：

- `PendingOrder -> Trade`
- 保留：
  - `original_entry_price`
  - `entry_type`
  - `setup_disposition`
  - `ema_gap_*` 结构字段

当前状态：

- 这层关键透传已经补齐

### 4.7 报表与审计层

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/report.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/ema_gap_trade_audit.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/ema_gap_probe.py`

职责：

- 输出：
  - `daily_frequency`
  - `win_rate`
  - `profit_factor`
  - `MFE / MAE`
  - `max_positive_r / max_negative_r`
  - `setup_disposition`
  - `management_template`

当前状态：

- 这层已经够用了
- 可以支持后续继续做归零分析

---

## 5. 当前卡点图

### 5.1 已排除的假根因

这些不是当前主因：

- 多周期背景映射又错了
- 目标位必须死等前高前低
- 后半段管理根本没做
- 只要再加一条弱棒阈值就能稳定盈利
- `5m` 理论上不适合 Brooks

### 5.2 当前主阻塞

当前真正卡住的是：

`broad_range + ema_gap_test + close-test + scalp_only`

更具体地说：

- 这簇单子大多是 `trend_bar`
- 但是其中一批：
  - 几乎不给正向 excursion
  - 或只给很少正向 R，就直接回头打 `SL`

也就是说，当前不是“目标位太远”的单一问题，而是：

- `entry quality`
- `STOP / LIMIT` 语义
- 弱 `close-test` 的真实入场方式

### 5.3 当前最像突破口的地方

当前最像突破口的是：

- 只对 **非 `5m`**
- `20-gap`
- `market_state = broad_range`
- `management_template = ema_gap_test`
- `first_target_is_close_test = True`

把入场从 `STOP` 改成 `LIMIT`

原因：

- 这更贴近 Brooks / 太妃对区间回踩 test 的语义
- 不会去破坏 5m 上已经勉强跑通的 `STOP` 链

当前验证结果：

- `F1 BTC 15m 2022`
  - 从 `11` 笔，胜率 `45.45%`，PF `1.0673`
  - 变成 `9` 笔，胜率 `55.56%`，PF `1.3259`
- `R1 BTC 5m 2024Q3`
  - 保持 `9` 笔，胜率 `55.56%`，PF `1.1848`

也就是说：

- `15m` 明显改善
- `5m` 没被误伤

这条目前最有希望保留成正式规则。

---

## 6. 当前不该再重复的路

这些方向已经证伪，不该再重复：

1. 继续盲放宽 detector continuation
2. 统一收近所有弱 scalp 目标
3. 统一把所有 broad range test 改成 `LIMIT`
4. 再加一条“看起来合理”的弱棒阈值，希望直接救全局
5. 不确认基线是否干净，就继续解释回测结果

---

## 7. 当前推荐的下一步

如果继续优化，推荐顺序：

1. 先把“非 `5m` 的 broad_range + ema_gap_test + close-test 改 `LIMIT`”这条规则完整跑完组级验证
2. 如果组级成立，就保留为新基线
3. 然后再回头只打 `5m` 的弱 `broad_range + scalp_only`
4. 继续拆：
   - 哪些单几乎没有 `MFE`
   - 哪些单给过 `0.2R~0.5R` 但没吃到
5. 再决定下一刀是：
   - `5m` 里继续打 `entry quality`
   - 还是 `5m` 的弱 close-test 也要细分 `STOP / LIMIT`

---

## 8. 一句话总结

当前 `20-gap` 不是理论错了，也不是系统根本没做出来，而是已经收缩到一个很具体的工程/交易语义问题：

`非 5m` 的弱 `broad_range close-test` 更像 `LIMIT` 试单，`5m` 的弱簇还要继续拆 `entry quality`。

这就是当前最值得继续打的方向。
