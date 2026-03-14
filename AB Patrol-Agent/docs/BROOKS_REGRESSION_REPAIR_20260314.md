# Brooks 回归检查与回修报告（2026-03-14）

## 1. 目的

本报告用于回答 4 个问题：

1. 两个新窗口最近到底改了什么。
2. 这些改动里，哪些符合 Al Brooks，哪些更像工程化硬阈值。
3. 当前代码在多组窗口上回测后，频率、胜率、盈利因子到底发生了什么变化。
4. 这轮回修后，哪些指标被拉回来了，哪些根因仍然没解决。

---

## 2. 本轮审查对象

### 2.1 新窗口引入的主要改动

- `79bcb64c`
  - 信号生成层 Brooks 对齐（双重顶收紧 + H&S TBTL 两段 + 末端旗形磁力位 + 概率下调）
- `25e7df67`
  - 管理链优化（premise FT 多维度 + strength 家族加权 + H1 上下文分级）
- 当前工作树未提交修改
  - [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
  - [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)

### 2.2 本轮实际回修的文件

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)

---

## 3. 对齐判断

### 3.1 明显偏离 Brooks 的部分

本轮确认最可疑、也最像退化来源的是 `79bcb64c` 里这几类硬阈值：

- 双重顶/底容差写死成固定 `0.2%`
- 双顶/底间距写死成固定 `>= 5 bar`
- 头肩形态把 `neckline` 接近度写死成 `head_range * 0.15`
- 末端旗形把“接近磁力位”写死成 `1.5 ATR`

这些写法的共同问题是：

- 它们不是按结构波动、结构测试、两腿回撤去判断；
- 而是把不同品种、不同周期、不同波动状态压成同一个数字门槛；
- 这不符合 Brooks 的“同一逻辑跨周期成立，但容差取决于图表结构本身”。

### 3.2 基本符合 Brooks 方向，但还要继续验证的部分

`25e7df67` 和当前工作树里的 `premise/sim_exchange` 修改，方向上更接近 Brooks：

- premise 改坏后先 `REDUCE`，不是一刀切直接 `CLOSE`
- 允许趋势恢复单经历更深测试
- 保护性管理更像让结构止损决定退出，而不是过早时间止损

但这部分目前还不能说“已经完全对齐”：

- 一些保护性 detail 的观察时长和亏损容忍仍然偏经验化；
- 从结果看，它们不是这轮主要退化源；
- 但也还没把 `protective_stop_exit` 这个大亏损桶压下去。

---

## 4. Brooks 依据

本轮回修主要依据的是“形态是结构，不是固定数字”这一条。

可直接参照的页图：

- 头肩/楔形/双顶双底常常只是更大区间的一部分  
  ![头肩与更大区间](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_hs_top-0066.png)

- MTR 默认就该计划部分止盈，且成功率本来只有 40% 左右  
  ![MTR 2R 部分止盈](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_take_profit_risk2-0065-0065.png)

- Endless Pullback 里不能把每个 H1/H2 都当成可执行恢复  
  ![Endless PB 要等 BO+FT](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/assets/09C Endless PB; different timeframes; countertrend/image 1.png)

这些依据支持了本轮的 4 个具体回修方向：

- 双顶双底改回结构容差，不再固定 `0.2%`
- 去掉双顶双底固定 `5 bar` 间距
- 头肩允许 `right shoulder reversal` 或 `neckline test` 二选一
- 末端旗形用结构容差判断是否接近磁力位，不再固定 `1.5 ATR`

---

## 5. 回修内容

### 5.1 双重顶/底

当前回修：

- 用 `_swing_tolerance(...)` 替代固定 `0.2%`
- 保留 `40%` 结构回撤要求
- 去掉固定 `>=5 bar`
- 改成“第一次测试后必须有真实回撤腿”

### 5.2 头肩 MTR

当前回修：

- 保留 `TBTL` 的两腿思路
- 不再要求“必须已经逼近 neckline 固定比例”
- 改成：
  - `neckline test` 可以入场
  - `right shoulder reversal` 也可以入场

### 5.3 末端旗形

当前回修：

- 保留“趋势末期 + 旗形压缩 + 失败突破”
- 保留“接近磁力位”这一层
- 但接近磁力位改由：
  - `_swing_tolerance(...)`
  - `_structure_buffer(...)`
 共同定义

### 5.4 第二腿陷阱

当前回修：

- 把 `probability` 从 `0.50` 调回 `0.62`
- 不改其结构逻辑，只恢复它在当前系统中的合理权重

---

## 6. 多窗口回测结果

### 6.1 精选 9 窗口：`v6 -> 当前工作树 -> 本轮回修`

整体：

- `交易数`: `2064 -> 1774 -> 1814`
- `加权胜率`: `29.70% -> 30.16% -> 30.87%`
- `场景平均 PF`: `0.671 -> 0.623 -> 0.683`

结论：

- 新窗口改动确实让交易频率明显下降。
- 当前工作树不是“全盘更差”，但 `PF` 被压下去了。
- 本轮回修后，`PF` 已经拉回到略高于 `v6` 的水平，但频率还没有完全回到 `v6`。

#### 按家族

- `趋势恢复族`: `0.714 -> 0.734 -> 0.734`
- `MTR反转族`: `0.684 -> 0.681 -> 0.727`
- `高潮/陷阱反转族`: `0.562 -> 0.396 -> 0.448`
- `突破追随族`: `0.763 -> 0.640 -> 0.685`

结论：

- 新窗口最明显打坏的是：
  - `高潮/陷阱反转族`
  - `突破追随族`
- 本轮回修已经把这两族从退化状态拉回来一截，但还没完全恢复到 `v6`。

#### 按重点策略

- `双重顶`: `0.572 -> 0.549 -> 0.676`
- `双重底`: `0.750 -> 0.743 -> 0.947`
- `头肩顶MTR`: `0.490 -> 0.506 -> 0.479`
- `头肩底MTR`: `0.679 -> 0.646 -> 0.651`
- `末端旗形`: `0.604 -> 0.404 -> 0.433`
- `第二腿陷阱`: `0.621 -> 0.251 -> 0.297`
- `ii突破`: `1.120 -> 0.871 -> 0.954`
- `看衰突破`: `0.515 -> 0.515 -> 0.608`

结论：

- 拉回最明显的是：
  - `双重顶/双重底`
  - `看衰突破`
  - `ii突破`
- 仍然明显偏弱的是：
  - `末端旗形`
  - `第二腿陷阱`
  - `头肩顶MTR`

### 6.2 额外 5 窗口：`当前工作树 -> 本轮回修`

整体：

- `交易数`: `916 -> 945`

按场景：

- `BTC 15m 2024Q1`: `PF 0.554 -> 0.586`
- `ETH 5m 2024Q2`: `PF 0.544 -> 0.540`
- `BNB 15m 2023Q4`: `PF 0.432 -> 0.469`
- `SOL 5m 2025Q1`: `PF 1.237 -> 1.306`
- `BTC 1h 2023Q3`: `PF 0.568 -> 0.563`

结论：

- 额外窗口总体是正向的。
- 回修没有把之前的优化整没。
- `SOL 5m 2025Q1` 这种本来就好的窗口，回修后没有被破坏。

---

## 7. 当前全局根因

从前往后、从里往外看，当前系统的问题已经更清楚了。

### 7.1 信号层

不是“没有信号”，而是：

- 少数反转 detector 被固定阈值写死后，压掉了本来应该保留的结构机会；
- 这会直接伤到：
  - `MTR`
  - `高潮/陷阱反转`
  - `breakout follow`

### 7.2 路由层

路由已经不是当前最大错误源，但仍有两类不稳定：

- `第二腿陷阱`
- 一部分 `breakout follow`

它们跨样本表现差，说明现在还没有完全代码化 Brooks 的“什么时候只是 second leg，什么时候已经是失败突破/反向腿”。

### 7.3 管理链

管理链里真正强的桶已经很清楚：

- `runner_trailing_exit`
- `tp_after_scaleout_exit`
- `take_profit_exit`
- `breakeven_stop_exit`

真正拖累系统的仍然是：

- `protective_stop_exit`
- `premise_failure_exit`
- `plain_stop_loss_exit`

这说明现在的问题，不是“不会赚钱”，而是：

- 太多交易在成熟前就退化掉了；
- 退化后没能优雅转成 `BE / scalp / 部分止盈后 runner`。

### 7.4 成本层

当前系统仍然必须同时看：

- 手续费
- 合理滑点
- 杠杆放大后的容错

当前逻辑即使方向在变好，也还没有厚到足够覆盖真实成本。

---

## 8. 本轮结论

### 8.1 已确认

- 新窗口改动里，最明显偏离 Brooks 的是 signal detector 里的固定硬阈值。
- 本轮回修已经把：
  - `双重顶/底`
  - `看衰突破`
  - `ii突破`
  - 部分 `MTR`
  拉回来了。
- 本轮回修没有把之前的趋势恢复优化整没。

### 8.2 仍未解决

- `末端旗形`
- `第二腿陷阱`
- `头肩顶MTR`
- `protective_stop_exit`

这些仍然是下一轮最该继续拆的地方。

### 8.3 下一步建议

下一轮不该再泛调，而应该继续 3 件事：

1. 继续拆 `第二腿陷阱` 和 `末端旗形` 的结构边界
2. 把 `头肩顶/底MTR` 从“图形识别”继续推进到“right shoulder / neckline / failed breakout` 的分层
3. 正式围绕 `protective_stop_exit` 做管理链收敛，而不是再大面积扩信号

