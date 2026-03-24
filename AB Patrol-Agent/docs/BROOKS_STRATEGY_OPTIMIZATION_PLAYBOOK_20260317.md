# Brooks 策略通用优化说明书

日期：2026-03-17

## 文档目的

这份文档不是某一个策略的复盘，而是把 `H1/L1` 从混乱、失真、局部有效，打磨到可以稳定复用的全过程，沉淀成一套后面所有策略族都能直接套用的优化说明书。

后续用于：

- `H2/L2`
- `突破回调`
- `20均线缺口 / 第一均线缺口 / MAG`
- 其他反转族、高潮/陷阱反转族、突破追随族

统一目标：

1. 所有优化都必须找到 Al Brooks 原文或案例支持。
2. 先做共用模块，再做单策略模板。
3. 禁止按某个品种、某一段行情、某个单独时间周期写死特调。
4. 先让策略在 `fixed / random / stress` 下稳定，再考虑扩到更多族。

## 一、先统一多周期角色，再谈策略

`H1/L1` 过程中最重要的一个教训是：

不要一上来就在 detector 上加过滤，而要先统一多周期角色。

统一后的角色定义：

| 执行周期 | 结构周期 | 主背景周期 | 锚定周期 |
| --- | --- | --- | --- |
| `1m` | `5m` | `15m` | `1h` |
| `5m` | `15m` | `1h` | `1d` |
| `15m` | `1h` | `4h` | `1d` |
| `1h` | `4h` | `1d` | `1d` |

原则：

- `结构周期`：看当前 setup 有没有保持结构完整。
- `主背景周期`：看更大的趋势 / 区间 / broad range / tight channel。
- `锚定周期`：看机构更常盯的磁体、支撑阻力、最高收盘/最低收盘、前高前低。

如果实时链和回测链的多周期映射不一致，再好的策略模板也会被做坏。

## 二、先统一策略骨架，再做细节优化

每一个策略模板，都必须先拆成同一套骨架。

推荐骨架：

1. 背景
2. 关键位置
3. setup 前提
4. signal bar 类型
5. entry trigger
6. 触发前失效
7. 初始止损类型
8. actual risk
9. 成本门槛
10. 第一目标
11. rescue / close-test / swing 分层
12. first-entry / second-entry 管理
13. 提前离场
14. re-entry / add-on

注意：

- `H1/L1`、`H2/L2` 这类多空镜像策略，应该是一套模板，不是多空两套理论。
- 但实现上不能继续堆成一个几千行大函数。
- 正确做法是：统一模板，方向只作为参数镜像，细节模块拆出去复用。

## 三、入场先统一成 Brooks stop trigger

这是 `H1/L1` 优化过程中最关键的一步，也是最容易被写错的一步。

正确语义：

- 做多：`signal bar` 高点上方一跳挂 `BUY STOP`
- 做空：`signal bar` 低点下方一跳挂 `SELL STOP`
- 只有价格真正触发，才算入场

错误写法：

- 名义上有 `entry_trigger`
- 实际 detector 还要求 `curr.close > prev.high` / `curr.close < prev.low`

这种写法会把真正的 Brooks `STOP` 又偷偷收回成 `close confirmation`。

所以统一原则：

- `entry_trigger` 是入场验证
- `price` 只是参考价
- `actual risk` 必须围绕真实触发价算

## 四、signal bar 不用总分，要用类型学

`H1/L1` 的另一个关键教训是：

不要只用一个 `signal_bar_quality` 总分去决定过不过。

应该先按 Brooks 语义拆成类型，再在类型内微调：

- `trend_bar`
- `reversal_bar`
- `inside_bar`
- `ema_recovery_bar`
- `outside_follow_bar`

再看这些辅助属性：

- `close_position`
- `body_ratio`
- `upper_tail_ratio / lower_tail_ratio`
- `inside_bar / outside_bar`

原则：

- `outside_bar` 不能一刀切否掉
- `close_near_extreme` 应该是偏好，不是全局硬 veto
- `valid_signal_bar` 应该是“类型学 + 上下文”组合判断

## 五、止损和目标必须分层

不能继续用“一个止损 + 一个 2R/3R 目标”打天下。

### 止损层

至少要区分：

- `signal_bar_stop`
- `swing_stop`
- `major_hl_lh_stop`

### 目标层

至少要区分：

- `rescue_target`
- `close_test_target`
- `swing_target`
- `stretch_target`

`H1/L1` 的关键经验：

- 弱 `first-entry` 不应该默认期待 `continuation swing`
- 很多单只该期待：
  - 回到前一次入场点
  - 测试 `highest close / lowest close`
  - 小结构磁体

## 六、first-entry 和 second-entry 不要混管

这点是 `H1/L1` 打出来以后最清楚的。

### first-entry

更常见的合理预期是：

- `partial`
- `BE`
- `small runner`
- `rescue`

### second-entry

更适合期待：

- `close-test`
- `swing`
- `runner`

所以每个策略族都必须在 detector 阶段就写清楚：

- `first_entry_signal`
- `second_entry_signal`
- `management_template`

然后让执行层真的读取，而不是只是写进 `extra` 里摆设。

## 七、弱 setup 必须分流，不要全塞进 swing

`H1/L1` 打透后得到的共用模块里，最有价值的一组就是弱 setup 分流：

- `no_trade`
- `scalp_only`
- `fade_candidate`
- `swing`

原则：

- `setup_valid=False` 的单，不能继续走标准 `brooks_swing`
- `TR / weak trend / broad range` 里的 continuation 幻象，要优先降级
- 先降到 `scalp`，再考虑 `fade`
- 不能把所有弱 setup 都硬路由到 `swing`

## 八、成本门槛必须前置

`H1/L1` 在 `5m` 上暴露出来的一个关键问题是：

有些单理论上到 `TP`，实际上是亏损的，因为：

- 目标太近
- 手续费 + 滑点 + buffer 吃掉了全部空间

所以通用规则必须包括：

- 最低净目标门槛
- 不足以覆盖成本的 continuation 单，直接：
  - `no_trade`
  - `scalp_only`
  - 或转 `fade_candidate`

不能先立项成 swing，再靠后面管理去补救。

## 九、压力验证口径必须固定

后面所有策略族统一用这三组口径：

- `fixed`
- `random`
- `stress5m`

必要时再加：

- `stress15m`
- `stress1h`

这样做的目的不是让每组数据都完美，而是看：

1. 有没有只在个别窗口好看
2. 有没有把 `15m` 打好、把 `5m` 打坏
3. 有没有引入隐藏的周期特调

## 十、禁止做的事

后面任何策略优化，都禁止再犯下面这些错：

1. 用单一回测窗口倒推一堆新规则。
2. 一个回合同时改 `entry / stop / target / management / routing`。
3. 为了让某个窗口变好，偷偷写品种或时间周期特调。
4. 把 Brooks 语义直接翻译成一个工程分数系统。
5. 把弱 setup 继续按 `swing` 管，再指望后面保护性退出救回来。
6. 把 detector、route、management、execution 混在一个主文件里硬堆。

## 十一、后续策略族的标准优化顺序

后面每个策略都按这个顺序打：

1. 先对照知识库，写“当前执行细节 vs Brooks 原文”审计文档。
2. 先统一多周期角色，不先动 detector 细节。
3. 再统一 `STOP / signal bar / stop_loss / actual risk / target tiers`。
4. 再接 `management_template` 到执行层。
5. 再做 `fixed / random / stress` 验证。
6. 最后再把稳定下来的共用模块抽出来。

## 十二、目前已经可复用的共用模块

已经可以复用到其他策略族的模块：

- 多周期角色映射
- `STOP trigger`
- `signal bar` 类型学骨架
- `actual risk`
- 结构止损类型
- 成本门槛
- 弱 setup 的 `no_trade / scalp / fade` 分流骨架
- `first-entry / second-entry` 管理模板骨架
- `rescue / close-test / swing` 目标层级

还需要继续打磨后再广泛扩散的模块：

- `5m` 弱背景边界
- `fade_candidate` 的更完整执行语义
- 某些 gap 族和高潮/陷阱反转族的背景切换细节

## 结论

`H1/L1` 这一轮最重要的成果，不只是把一个策略打成正 PF，而是把后续所有策略族都能复用的一套 Brooks 优化方法打出来了。

以后再扩 `H2/L2`、`突破回调`、`20均线缺口 / 第一均线缺口 / MAG`，都不应该再从零摸索，而是直接从这份说明书开始：

- 先统一多周期角色
- 再统一模板骨架
- 再统一入场、止损、目标、管理
- 最后才做回测和微调

