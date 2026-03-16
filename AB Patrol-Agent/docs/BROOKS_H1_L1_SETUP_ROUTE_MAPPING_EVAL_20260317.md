# H1/L1 弱 Setup 路由修复复盘

## 这轮改了什么

这轮只改一件事：

- 把 `setup_valid=False` 或明显偏弱的 `H1/L1`，从默认的 `brooks_swing / brooks_s1_htf_sr_reversal` 管理模板里挪出去。

代码位置：

- [strategy_filters.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/strategy_filters.py)
- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)

## 对齐依据

### 课程与百科

- `H1/H2`：`Buy above signal bar`，不是先默认按普通 swing 死拿。
- `Disappointed Bulls: Buy More Lower`
- `Disappointed Bulls: Exit around Breakeven`
- `1x Actual Risk`

### Ali Flash Cards

- 第 16 页：`Market Tests Back to Valid Previous Entry`
- 第 73 页：`Fade Weak L1`
  - 弱 `L1` 在坏背景里更像 scalp/limit 机会，而不是标准 trend swing
- 第 588 页：`Failed High Probability Signal`
  - 高概率 setup 连触发都弱，或触发后很差时，不该继续按高质量 swing 处理

## 当前路由语义

### 强 H1/L1

- 仍可进入 `brooks_swing`
- 或在明确结构下进入对应 reversal/specialized style

### 弱 H1/L1

满足以下任一：

- `setup_valid=False`
- `setup_clear_trend_leg=False`
- `setup_first_pullback_shape=False`
- `setup_pullback_depth_ratio >= 0.75`
- `setup_pullback_overlap_ratio >= 0.60`

则：

- 如果已是 TR/弱趋势上下文，改走 `brooks_tr_blshs`
- 否则改走 `brooks_scalp`

## 回测结果

### 对照基线

- fixed 基线：`/tmp/h1l1_setup_fixed_20260317_v4.json`
- random 基线：`/tmp/h1l1_setup_random_20260317_v4.json`

### 当前结果

- fixed 当前：`/tmp/h1l1_setup_fixed_20260317_v5.json`
- random 当前：`/tmp/h1l1_setup_random_20260317_v5.json`

### fixed 3 窗口

- 总交易：`29 -> 33`
- 加权胜率：`31.03% -> 36.36%`
- 平均 PF：`1.284 -> 4.416`
- 平均日频：`0.312 -> 0.355`

分场景：

- `BTCUSDT 15m 2022-01-24 ~ 2022-02-23`
  - `10 -> 11` 笔
  - 胜率 `60.0% -> 81.82%`
  - PF `3.180 -> 12.334`

- `BTCUSDT 5m 2024-08-10 ~ 2024-09-09`
  - `15 -> 15` 笔
  - 胜率 `13.33% -> 13.33%`
  - PF `0.533 -> 0.215`

- `ETHUSDT 15m 2024-05-15 ~ 2024-06-14`
  - `4 -> 7` 笔
  - 胜率 `25.0% -> 14.29%`
  - PF `0.140 -> 0.699`

### random 4 窗口

- 总交易：`31 -> 37`
- 加权胜率：`29.03% -> 37.84%`
- 平均 PF：`1.072 -> 5.617`
- 平均日频：`0.250 -> 0.298`

分场景：

- `BTCUSDT 5m 2024Q3`
  - PF `0.533 -> 0.215`

- `ETHUSDT 15m 2024Q2`
  - PF `0.140 -> 0.699`

- `BNBUSDT 15m 2023Q4`
  - PF `2.757 -> 6.558`

- `SOLUSDT 15m 2025Q3`
  - PF `0.859 -> 14.997`

## 结论

这轮修复说明两件事：

1. 我们前面定位的根因是对的。  
   弱 `H1/L1` 不该继续默认按 `brooks_swing / brooks_s1_htf_sr_reversal` 管。

2. 修完后，`H1/L1` 的跨场景稳定性明显提高了。  
   但 `BTC 5m 2024Q3` 仍然很差，说明还有一个残余问题没有解决：
   - 这类 5m 弱背景里的 first-entry，本身可能就不是该积极做的 `H1/L1`
   - 或者 detector 前端仍然把一些本应降级/忽略的信号放进来了

## 下一步

下一步不该再碰 `STOP trigger`，也不该回退这轮路由修正，而是只打这两个点：

1. `BTC 5m 2024Q3` 的逐笔信号明细  
   看这些差单到底是：
   - setup 放得太松
   - signal bar 太弱
   - 还是 first-entry 后续管理仍然太慢

2. `H1/L1` 的 `signal bar` 类型学继续对齐  
   特别是：
   - `outside_bar`
   - `close_near_extreme`
   - `weak follow-through`
