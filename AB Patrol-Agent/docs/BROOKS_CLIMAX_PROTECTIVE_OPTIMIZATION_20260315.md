# Brooks 高潮/陷阱反转族与保护性止损优化报告（2026-03-15）

## 1. 本轮目标

本轮只做两件事：

1. 单独打 `高潮/陷阱反转族`
   - `头肩顶/底MTR`
   - `末端旗形`
   - `第二腿陷阱`
   - `看衰突破`
   - `急速通道`
2. 继续压 `protective_stop_exit`
   - 把更多退化单挪到：
     - `protective_scalp_exit`
     - `breakeven_stop_exit`
     - `tp_after_scaleout_exit`

本轮仍然遵守：

- 只按 Al Brooks 理论和百科案例收规则
- 不按单一品种或单一时间周期特调
- 优化后必须做随机时间段验证

## 2. 归零法排查

这轮采用“归零法”做排查：先列出所有可能根因，再逐条用代码和回测证据排除。

### 2.1 候选根因清单

1. detector 太松，把大量不够成熟的 `climax/trap` 单放进来了
2. detector 太紧，把少量高质量信号也错杀掉了
3. `protective_stop_exit` 过多，不是 detector 问题，而是管理退化问题
4. `protective_scalp` 触发后，退出节奏还是太慢
5. `breakeven` 和 `runner` 没问题，真正问题在成熟前的 `scratch/scalp`
6. 大周期背景约束过重，导致小周期过早降级

### 2.2 排查结论

排查后最明确的结论是：

- `climax/trap` 家族的主问题仍然是 detector 质量不够稳定
- 后端成熟段管理不是主问题：
  - `runner_trailing_exit`
  - `tp_after_scaleout_exit`
  - `protective_scalp_exit`
  这些本身仍然是赚钱的
- 最大亏损桶仍然是 `protective_stop_exit`
- 但 `protective_stop_exit` 不是“ trailing 不会做”，而是**很多单在成熟前就退化了**

## 3. 本轮实际修改

### 3.1 前端 detector

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py`

本轮保留并验证有效的修改：

#### 第二腿陷阱

- 要求更深地回到区间内部
- 要求第二腿不能过度伸展
- 要求 breakout close 更弱，不能是假强突破
- 增加信号棒质量要求

#### 看衰突破

- 至少需要两次边缘测试
- 如果已经出现 1 根强 follow-through，则要求更明显的 `gap_filled + rejection`
- 不允许仅凭“没创新高/低”就轻率 fade
- 增加信号棒质量要求

#### 急速通道 / 末端旗形

- 要求更像 `late trend + 压缩 + 失败突破`
- 不再把普通趋势中的随机 late pullback 当成 climax reversal

#### 头肩顶/底 MTR

- 强化 `major channel break`
- 收紧右肩容差
- 加入 `shoulder balance` 检查
- 强化信号棒质量要求

### 3.2 后端保护性管理

文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`

本轮保留并验证有效的修改：

- `reversal_protect`
  - 更早转 `scratch/scalp`
- `breakout_protect`
  - `FAILED_FT` 后更快退出，不继续等保护性止损
- `tr_scalp_protect`
  - 更早平掉，不再让本来应是小 scalp 的单拖成保护性止损
- `second_entry_profit`
  - 当环境退化为 TR 或缺少 follow-through 时，优先降级为小 scalp/BE

## 4. Brooks 依据

本轮主要依据：

- `18 Final Flags最终旗形`
- `21D 40% winner; Ten Bars, Two Legs ...`
- `23B Small Final Flags; ii Final Flags ...`
- `27A Head and Shoulders is MTR； Most Head and Shoul...`

共同的 Brooks 结论是：

- `climax / final flag / failed breakout / H&S MTR` 都不是“形态名字到了就能做”
- 关键仍是：
  - 背景位置
  - 边缘测试
  - 是否真的失败突破
  - 是否真的 break major channel
  - 是否真的有强信号棒

## 5. 七窗口更广样本（当前保留版本）

结果文件：

- `/tmp/ab_complete_validation_report_v2.json`
- `/tmp/ab_complete_validation_report_v3.json`

`v2 -> v3`

- 总交易：`1555 -> 1407`
- 加权胜率：`31.32% -> 32.20%`
- 场景平均 PF：`0.935 -> 0.977`
- 场景平均日频：`7.17 -> 6.48`

家族层：

- 趋势恢复族：`1.2195 -> 1.1495`
- MTR反转族：`0.8331 -> 0.9146`
- 高潮/陷阱反转族：`0.2914 -> 0.2408`
- 突破追随族：`0.6801 -> 0.8378`

结论：

- 当前保留版本已经明显改善整体系统
- 但 `高潮/陷阱反转族` 仍然是最弱家族

## 6. 随机时间段验证

随机场景：

- `R1_BTC_5m_2024Q3`
- `R2_ETH_15m_2024Q2`
- `R3_BNB_15m_2023Q4`
- `R4_SOL_15m_2025Q3`

结果文件：

- 基线：`/tmp/ab_random_validation_report_before.json`
- 保留版本：`/tmp/ab_random_validation_report_after.json`
- 被放弃的更激进版本：`/tmp/ab_random_validation_report_after_v2.json`

### 6.1 基线 -> 保留版本

- 总交易：`831 -> 822`
- 加权胜率：`23.83% -> 23.84%`
- 场景平均 PF：`0.820 -> 0.945`
- 场景平均日频：`6.70 -> 6.63`

这说明：

- 频率基本保住
- 胜率基本持平
- PF 有明显改善

四个随机窗口逐一改善：

- `R1_BTC_5m_2024Q3`：`0.654 -> 0.775`
- `R2_ETH_15m_2024Q2`：`0.712 -> 0.778`
- `R3_BNB_15m_2023Q4`：`0.759 -> 0.901`
- `R4_SOL_15m_2025Q3`：`1.156 -> 1.325`

### 6.2 保留版本里各家族

- 趋势恢复族：`1.0139 -> 1.0868`
- MTR反转族：`0.7945 -> 1.0115`
- 高潮/陷阱反转族：`0.1453 -> 0.1090`
- 突破追随族：`0.7498 -> 0.6343`

结论：

- 这轮真正明显改善的是：
  - 趋势恢复族
  - MTR反转族
- `高潮/陷阱反转族` 仍然没有被打透

### 6.3 更激进版本为何被放弃

更激进版本结果：

- 文件：`/tmp/ab_random_validation_report_after_v2.json`
- 总交易：`813`
- 加权胜率：`23.74%`
- 场景平均 PF：`0.945`
- 场景平均日频：`6.56`

看起来整体 PF 没明显变差，但问题在于：

- 高潮/陷阱反转族：`0.1090 -> 0.0783`
- 第二腿陷阱：`0.126 -> 0.000`

也就是它把本来就弱的家族继续砍坏了，所以这版没有保留，已经回退到更优版本。

## 7. 对“这会不会顺带提升其他策略”的回答

会，但不是无限制地一起提升。

原因有两层：

1. 后端保护性管理是家族共享的  
   `protective_stop -> protective_scalp / BE / tp_after_scaleout` 的优化，不只会影响一个具体信号名。

2. 同品种同一时刻只能持有一笔暴露  
   低质量 `climax/trap` 单如果先占用了仓位，本来后面更好的趋势恢复或 MTR 单就进不来。  
   所以清理弱 detector，会间接释放其他家族的交易机会。

但也要实话说：

- 这轮对其他家族的帮助已经有了
- 可是 `高潮/陷阱反转族` 自己仍然没有被拉起来
- 所以不能把“整体 PF 变好”误解成“这个弱家族已经修好了”

## 8. 当前最真实的根因

到现在为止，系统没有转正的根因已经很清楚：

1. detector 端  
   `高潮/陷阱反转族` 仍然混入了不少不该做的弱单

2. 管理端  
   `protective_stop_exit` 仍然是最大亏损桶

3. 成熟管理端  
   真正成熟后的：
   - `protective_scalp_exit`
   - `breakeven_stop_exit`
   - `tp_after_scaleout_exit`
   - `runner_trailing_exit`
   其实都不差

所以真正的问题是：

> 交易在成熟之前就退化了，而不是成熟以后不会赚钱。

## 9. 本轮结论

本轮优化是有效的，但不是“全族彻底修好”。

有效的部分：

- 整体 PF 确实改善
- 随机时间段验证也站得住
- 频率没有崩
- 趋势恢复族和 MTR反转族明显受益

没解决的部分：

- `高潮/陷阱反转族` 仍然是系统最弱点
- `protective_stop_exit` 仍然太大
- 系统整体仍未转正

## 10. 下一步只该做什么

下一轮不要再泛调，只做两件事：

1. 继续单独打 `高潮/陷阱反转族`
   - 尤其是：
     - `看衰突破`
     - `第二腿陷阱`
     - `急速通道`

2. 继续压 `protective_stop_exit`
   - 目标不是硬撑到 TP
   - 而是让更多退化单更早转成：
     - `scratch`
     - `breakeven`
     - `small scalp`

一句话总结：

> 这轮“前端弱 detector 收紧 + 后端保护性管理优化”是有效的，随机验证也支持；但最弱的 `高潮/陷阱反转族` 还没被真正打透，后面必须继续单点突破，而不是再做泛化优化。
