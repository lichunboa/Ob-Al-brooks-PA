# H1/L1 收官前压力测试与 fixed/random 复核

日期：2026-03-17

## 1. 本轮目的

本轮不是继续盲目加规则，而是先回答两个问题：

1. 当前未提交的 `rescue / close-test / swing` 目标层级模块，是否会把强背景 `15m` 过早降级。
2. `H1/L1` 在更多 `5m` 多品种、多时间范围压力样本里，是否还能维持合理的频率、胜率、盈利因子。

本轮只看 `H1/L1` 单策略，避免被其他策略噪音稀释。

## 2. 口径

- 策略白名单：`高1 / 低1`
- 管理模板：`brooks_pdf`
- 手续费：`0.0004` 单边
- 数据目录：`data/history/hf_parquet`

对照版本：

- `v9`：上一个已提交且稳定的 `H1/L1` 基线
- `v10_current`：第一次引入 `rescue / close-test / swing` 模块后的当前工作树
- `v12_current`：把目标层级从“强/弱二分”改成“强/中/弱三分”后的当前工作树

## 2.1 市场结构与 H1/L1 背景分层表

这张表不是新增理论，而是把 Brooks 的市场结构分类，翻译成 `H1/L1` 目标层级和管理选择。

| Brooks 市场结构 | H1/L1 背景分层 | 常见语义 | 目标优先级 | 管理倾向 |
| --- | --- | --- | --- | --- |
| 突破模式 | 强背景 | 成功突破后的 first pullback，或强 follow-through 的 continuation | `router/swing` | `partial + BE + 小 runner` |
| 窄幅通道 | 强背景 或 中等背景 | 顺势的小回调；如果 follow-through 仍强，接近趋势持续；如果开始退化，更像 close-test | 强时 `router/swing`，退化时 `close-test` | 强时留 runner，退化时先测近结构位 |
| 宽幅通道 | 中等背景 | 有方向倾向，但更容易来回测试前一次入场点、highest/lowest close | `close-test` | 先兑现一部分，优先 BE，不宜直接当大 swing |
| 震荡区间 | 弱背景 | 弱 H1/L1、假 continuation、容易演化成 scalp 或 fade | `rescue` | `scalp / no-trade / fade candidate` |

补充：

- 这张表里的“强/中/弱背景”不是替代 Brooks 的 4 类市场结构，而是建立在它们之上的 `H1/L1 setup` 质量分层。
- 真正落代码时，还要同时参考：
  - `setup_valid`
  - `setup_clear_trend_leg`
  - `setup_first_pullback_shape`
  - `follow_through / higher_follow_through`
  - `valid previous entry / highest-close-lowest-close`
  - 成本是否可覆盖

## 3. fixed/random 复核

### 3.1 fixed 3 窗口

| 版本 | 交易数 | 加权胜率 | 平均 PF | 日均 |
| --- | ---: | ---: | ---: | ---: |
| v9 | 21 | 61.90% | 4.860 | 0.226 |
| v10_current | 23 | 47.83% | 4.505 | 0.247 |
| v12_current | 23 | 60.87% | 6.825 | 0.247 |

场景表现：

- `F1_BTC_15m_2022`
  - v9: `11` 笔，胜率 `81.82%`，PF `12.334`
  - v10_current: `10` 笔，胜率 `50.00%`，PF `8.639`
  - v12_current: `11` 笔，胜率 `81.82%`，PF `18.718`
- `F2_BTC_5m_2024Q3`
  - v9: `7` 笔，胜率 `42.86%`，PF `0.851`
  - v10_current: `10` 笔，胜率 `50.00%`，PF `1.873`
  - v12_current: `9` 笔，胜率 `44.44%`，PF `0.361`
- `F3_ETH_15m_2024Q2`
  - v9: `3` 笔，胜率 `33.33%`，PF `1.395`
  - v10_current: `3` 笔，胜率 `33.33%`，PF `3.002`
  - v12_current: `3` 笔，胜率 `33.33%`，PF `1.395`

### 3.2 random 4 窗口

| 版本 | 交易数 | 加权胜率 | 平均 PF | 日均 |
| --- | ---: | ---: | ---: | ---: |
| v9 | 23 | 60.87% | 6.649 | 0.185 |
| v10_current | 24 | 54.17% | 5.091 | 0.194 |
| v12_current | 22 | 59.09% | 191.319 |

说明：

- `v12_current` 的“平均 PF”被 `R3_BNB_15m_2023Q4` 的极端高 PF 拉高，不能单独拿来判断。
- 更可信的是看各场景表现和聚合 gross PF。

场景表现：

- `R1_BTC_5m_2024Q3`
  - v9: `7` 笔，胜率 `42.86%`，PF `0.851`
  - v10_current: `10` 笔，胜率 `50.00%`，PF `1.873`
  - v12_current: `9` 笔，胜率 `44.44%`，PF `0.361`
- `R2_ETH_15m_2024Q2`
  - v9: `3` 笔，PF `1.395`
  - v10_current: `3` 笔，PF `3.002`
  - v12_current: `3` 笔，PF `1.395`
- `R3_BNB_15m_2023Q4`
  - v9: `7` 笔，PF `9.352`
  - v10_current: `6` 笔，PF `10.354`
  - v12_current: `5` 笔，PF `752.386`
- `R4_SOL_15m_2025Q3`
  - v9: `6` 笔，PF `14.997`
  - v10_current: `5` 笔，PF `5.133`
  - v12_current: `5` 笔，PF `11.134`

### 3.3 聚合 gross PF

为了避免“平均 PF 被单个极端窗口拉歪”，对 fixed/random 又算了一次聚合 gross PF：

| 版本 | fixed gross PF | random gross PF |
| --- | ---: | ---: |
| v9 | 3.543 | 3.381 |
| v10_current | 4.551 | 3.358 |
| v12_current | 4.032 | 2.706 |

结论：

- `v10_current` 明显更适合弱 `5m`
- `v12_current` 明显更适合强背景 `15m`
- 但 `v12_current` 把最差 `5m` 样本又打回去了

这说明当前 `rescue / close-test / swing` 还不能只用“一刀切”的全局优先级。

## 4. 5m 压力样本

### 4.1 v10_current 的 7 组 5m 压力样本

| 场景 | 交易数 | 胜率 | PF | 日均 |
| --- | ---: | ---: | ---: | ---: |
| P1_BTC_5m_2022Q1 | 14 | 42.86% | 3.035 | 0.452 |
| P2_BTC_5m_2024Q1 | 12 | 33.33% | 0.732 | 0.387 |
| P3_BTC_5m_2024Q3 | 10 | 50.00% | 1.873 | 0.323 |
| P4_ETH_5m_2022Q1 | 11 | 45.45% | 2.417 | 0.355 |
| P5_ETH_5m_2024Q3 | 16 | 18.75% | 0.141 | 0.516 |
| P6_BNB_5m_2024Q3 | 21 | 38.10% | 2.199 | 0.677 |
| P7_SOL_5m_2025Q3 | 19 | 31.58% | 0.519 | 0.613 |

汇总：

- 总交易：`103`
- 加权胜率：`35.92%`
- 平均 PF：`1.559`
- 平均日均：`0.475`

### 4.2 v12_current 的补充 5m 样本

| 场景 | 交易数 | 胜率 | PF | 日均 |
| --- | ---: | ---: | ---: | ---: |
| P5_ETH_5m_2024Q3 | 16 | 18.75% | 0.179 | 0.516 |
| P6_BNB_5m_2024Q3 | 18 | 50.00% | 1.927 | 0.581 |
| P7_SOL_5m_2025Q3 | 16 | 37.50% | 0.494 | 0.516 |

补充结论：

- `ETH 5m 2024Q3` 仍然是当前最差背景之一，说明弱 `L1` 在 `5m broad range / weak trend` 里还没打透。
- `BNB 5m 2024Q3` 已经说明 `5m` 不是天然做不出来。
- `SOL 5m 2025Q3` 仍然偏弱，说明 `5m` 的残余问题不是某个单币种特调能解决的。

## 5. 当前判断

### 5.1 可以确认的

- `STOP trigger` 方向已经对齐 Brooks，不该回退。
- `weak setup -> no-trade / scalp / fade` 分流方向是对的。
- `first-entry rescue` 这条 Brooks 语义也是对的，不该删。
- `5m` 不是不能做；`BNB 5m`、`BTC 5m 2022Q1`、`ETH 5m 2022Q1` 都已经证明这套规则在部分 `5m` 场景里能成立。

### 5.2 还没打透的

- `5m` 弱背景里的 `L1/H1`，尤其：
  - `ETH 5m 2024Q3`
  - `SOL 5m 2025Q3`
- `rescue / close-test / swing` 当前还不能只靠一个全局优先级解决。
- 同一个 `H1/L1`，在：
  - 强趋势 first pullback
  - 中等背景 first entry
  - broad range/weak trend 试单  
  这三类上下文里，目标层级应该不同。

## 6. 下一步建议

不要再继续加泛过滤，而是只打一个更深的共用模块：

- `valid previous entry / highest close-lowest close / rescue target` 的上下文分层

也就是把 `H1/L1` 再拆成这三档：

1. 强背景：
   - 优先 `router/swing`
2. 中等背景：
   - 优先 `close-test`
3. 弱背景：
   - 优先 `rescue`

并且这三档不能只靠单个布尔值判断，需要把：

- `valid previous entry`
- `highest/lowest close`
- `follow-through`
- `setup_valid`
- `market_state / higher_market_state`
- `成本门槛`

一起纳入。

## 7. 当前结论

`H1/L1` 已经不是“路不通”，而是进入了最后的上下文分层阶段。

当前这版代码：

- 对强背景 `15m` 和部分 `5m` 已经明显成立
- 但对弱背景 `5m` 还不够稳
- 因此还不能直接宣称 `H1/L1` 已经完全收官

不过，距离把 `H1/L1` 打成第一个成熟母模板，已经非常近了。
