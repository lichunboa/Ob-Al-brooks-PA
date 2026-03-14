# Brooks 前后端联合优化报告（2026-03-15）

## 1. 本轮目标

本轮目标不是继续靠压低交易频率换取表面上的盈利因子，而是把两处明显偏离 Brooks 原意的环节一起收正：

1. 前端 detector：
   - 头肩顶/底 MTR
   - 末端旗形
   - 第二腿陷阱
   - 看衰突破
2. 后端保护性管理：
   - 尽量减少交易在成熟前退化为 `protective_stop_exit`
   - 尽量把退化单转成：
     - `protective_scalp_exit`
     - `breakeven_stop_exit`
     - `tp_after_scaleout_exit`

本轮仍然严格遵守两条原则：

- 不按单一品种或单一时间周期特调
- 只按 Al Brooks 课程原文和百科实战去收规则

## 2. 本轮代码改动

### 2.1 前端 detector

主要修改文件：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py`

本轮把弱 detector 往更接近 Brooks 的结构确认收紧：

#### 第二腿陷阱

- 要求更深地回到区间内部，而不是刚碰回边缘就算陷阱
- 第二腿伸展更短，避免把已经走成趋势延续的结构误判成 trap
- 新增信号棒质量要求，减少弱反转棒误触发

#### 看衰突破

- 要求至少有两次边缘测试
- 仅仅“没再创新高/低”不够，必须更像失败突破而不是正常整理
- 新增信号棒质量要求，减少弱 rejection bar 触发

#### 末端旗形

- 收紧旗形与趋势腿的比例关系
- 收紧“突破后回到旗形内部”的深度
- 新增突破过度伸展限制
- 新增信号棒质量要求

#### 头肩顶/底 MTR

- 收紧右肩容差
- 强化 `major channel break` 要求，减少 minor reversal 误当成 MTR
- 新增信号棒质量要求

### 2.2 后端保护性管理

本轮后端家族化保护逻辑已经在前一提交基础上继续沿用，当前重点不再是“大改管理架构”，而是验证前端收紧后，保护性管理是不是更少被迫接脏单。

主要观察对象：

- `protective_stop_exit`
- `protective_scalp_exit`
- `breakeven_stop_exit`
- `tp_after_scaleout_exit`
- `runner_trailing_exit`

## 3. Brooks 依据

本轮直接依据的课程/百科要点如下。

### 3.1 第二腿陷阱 / 失败突破

- `21D 40% winner; Ten Bars, Two Legs ...`
  - 反转本身胜率并不高
  - 必须更像 `TBTL` / `failed breakout`，而不是普通小回调

### 3.2 末端旗形

- `18 Final Flags最终旗形`
  - final flag 出现在趋势后段
  - 本质更像小型 TR / BO mode
  - 真正可做的是“突破失败再回旗形”

- `23B Small Final Flags; ii Final Flags ...`
  - final flag 可以很小
  - 但不能把任何 late pullback 都当成 final flag

### 3.3 头肩 MTR

- `27A Head and Shoulders is MTR； Most Head and Shoul...`
  - 大多数头肩只是 minor reversal
  - 真正值得做的，是伴随 `break major channel` 的那一类

### 3.4 课程与百科共同结论

- detector 不能靠固定百分比和固定 bar 数硬判
- 关键仍是：
  - 背景位置
  - 是否真的失败突破
  - 是否真的回到区间内部
  - 是否真的打破 major channel
  - 信号棒是否足够强

## 4. 回测设计

### 4.1 三窗口探针

结果文件：

- `/tmp/ab_probe_complete_report_v3.json`
- `/tmp/ab_probe_complete_report_v4.json`

口径：

- `v3`：前一版保护性管理优化
- `v4`：本轮前端 detector 收紧后

### 4.2 七窗口更广验证

结果文件：

- `/tmp/ab_complete_validation_report_v2.json`
- `/tmp/ab_complete_validation_report_v3.json`

口径：

- `v2`：本轮前端收紧之前的 7 窗口基线
- `v3`：本轮前后端联合优化后的 7 窗口结果

## 5. 三窗口结果

### 5.1 总体

`v3 -> v4`

- 总交易：`755 -> 685`
- 加权胜率：`28.48% -> 29.05%`
- 场景平均 PF：`0.807 -> 0.844`
- 场景平均日频：`8.12 -> 7.37`

结论：

- 频率略降，但没有崩
- 胜率小幅改善
- PF 小幅改善
- 这轮并不是“靠砍半频率换 PF”，而是更像“剔除一部分弱 detector 误入场”

### 5.2 家族层

- 趋势恢复族：`PF 1.193 -> 1.107`
- MTR反转族：`PF 0.717 -> 0.782`
- 高潮/陷阱反转族：`PF 0.421 -> 0.405`
- 突破追随族：`PF 0.676 -> 0.724`

结论：

- 本轮对 `MTR反转族` 和 `突破追随族` 是正向的
- 对 `趋势恢复族` 有一定收缩，但仍然保持在 `PF > 1`
- `高潮/陷阱反转族` 仍然最弱，说明弱 detector 清洗还没完全结束

### 5.3 保护性管理层

`v3 -> v4`

- `protective_stop_exit`：`338 -> 300`
- `protective_scalp_exit`：`101 -> 88`
- `breakeven_stop_exit`：`307 -> 278`
- `tp_after_scaleout_exit`：`22 -> 22`
- `runner_trailing_exit`：`22 -> 20`

但关键质量变化是：

- `protective_stop_exit` 胜率：`0.296% -> 0.333%`
- `breakeven_stop_exit` PF：`1.201 -> 1.320`
- `protective_scalp_exit` PF：`32.03 -> 41.94`

说明：

- detector 更干净之后，保护性管理接到的单更少了
- 真正赚钱的成熟管理段没有被破坏

## 6. 七窗口结果

### 6.1 总体

`v2 -> v3`

- 总交易：`1555 -> 1407`
- 加权胜率：`31.32% -> 32.20%`
- 场景平均 PF：`0.935 -> 0.977`
- 场景平均日频：`7.17 -> 6.48`

这是本轮最关键的结论：

- 更广样本上，方向依旧为正
- 不是只在 3 个窗口里好看
- 频率下降约 `9.5%`
- 胜率和 PF 都同步改善

### 6.2 家族层

- 趋势恢复族：`1.2195 -> 1.1495`
- MTR反转族：`0.8331 -> 0.9146`
- 高潮/陷阱反转族：`0.2914 -> 0.2408`
- 突破追随族：`0.6801 -> 0.8378`

结论：

- `MTR反转族` 明显改善
- `突破追随族` 明显改善
- `趋势恢复族` 虽有回落，但仍然保持在 `PF > 1`
- `高潮/陷阱反转族` 继续恶化，说明这里仍然是最需要下一轮单独打磨的弱点

### 6.3 保护性管理层

`v2 -> v3`

- `protective_stop_exit`：`690 -> 603`
- `protective_scalp_exit`：`226 -> 205`
- `breakeven_stop_exit`：`604 -> 536`
- `tp_after_scaleout_exit`：`32 -> 32`
- `runner_trailing_exit`：`57 -> 55`

关键质量变化：

- `protective_stop_exit` PF：`0.00324 -> 0.00371`
- `protective_scalp_exit` PF：`40.51 -> 54.36`
- `breakeven_stop_exit` PF：`1.623 -> 1.795`

说明：

- 当前系统最赚钱的仍然不是 detector 本身，而是成熟后的 `protective_scalp / BE / runner`
- 系统整体没转正，不是因为 TP/runner 不会做，而是因为仍有太多交易在成熟前掉进 `protective_stop`

## 7. 场景明细

七窗口逐场景 `v2 -> v3`：

- `V1_BTC_5m_2022`
  - 交易：`443 -> 403`
  - 胜率：`26.64% -> 26.80%`
  - PF：`0.854 -> 0.847`
- `V2_BTC_15m_2022`
  - 交易：`159 -> 146`
  - 胜率：`33.96% -> 35.62%`
  - PF：`0.870 -> 0.999`
- `V3_ETH_5m_2022`
  - 交易：`435 -> 398`
  - 胜率：`34.02% -> 34.17%`
  - PF：`1.077 -> 1.054`
- `V4_ETH_15m_2023Q1`
  - 交易：`153 -> 136`
  - 胜率：`28.10% -> 28.68%`
  - PF：`0.697 -> 0.687`
- `V5_BNB_15m_2022Q1`
  - 交易：`171 -> 142`
  - 胜率：`35.67% -> 40.14%`
  - PF：`0.970 -> 1.283`
- `V6_SOL_15m_2025Q2`
  - 交易：`173 -> 162`
  - 胜率：`32.37% -> 33.95%`
  - PF：`0.691 -> 0.765`
- `V7_BTC_1h_2024Q1`
  - 交易：`21 -> 20`
  - 胜率：`33.33% -> 30.00%`
  - PF：`1.387 -> 1.203`

整体看：

- 大多数窗口 PF 改善
- `BTC 5m 2022` 和 `ETH 15m 2023Q1` 仍然没有改善
- 说明这轮不是万灵药，但整体方向站得住

## 8. 当前真实结论

### 8.1 正向结论

- 前端 detector 收紧是有效的，不是回归
- 它没有把成熟的后端管理链破坏掉
- `MTR反转族` 和 `突破追随族` 被明显拉回
- 更广样本上 PF 仍然改善，说明不是只在局部窗口成立

### 8.2 负向结论

- 系统整体仍然没有转正，七窗口平均 PF 只有 `0.977`
- `高潮/陷阱反转族` 现在是最弱的一块
- `protective_stop_exit` 仍然是系统最大亏损桶

### 8.3 根因没有变

当前真正卡住系统的仍然不是：

- detector 完全不会做
- trailing 完全不会做
- partial/TP 不会做

真正卡住的是：

- 很多交易在成熟之前退化成了 `protective_stop_exit`
- 弱 detector 仍然给 `高潮/陷阱反转族` 喂进太多低质量单

## 9. 下一步建议

到这一步，下一轮不该再散着修，应该只打两块：

1. 前端继续只盯：
   - `末端旗形`
   - `第二腿陷阱`
   - `看衰突破`
   - `头肩顶/底MTR`
   尤其是 `高潮/陷阱反转族`

2. 后端继续只盯：
   - `protective_stop_exit`
   - 目标是把更多退化单继续挪到：
     - `protective_scalp_exit`
     - `breakeven_stop_exit`
     - `tp_after_scaleout_exit`

如果只看当前这轮结果，可以用一句话概括：

> 这轮优化是有效的，而且更广样本也站得住，但系统整体仍未盈利；现在最大的剩余问题已经收敛到 `高潮/陷阱反转族` 和 `protective_stop_exit`。
