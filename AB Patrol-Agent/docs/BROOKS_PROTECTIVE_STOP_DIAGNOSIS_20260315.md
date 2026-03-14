# Brooks 保护性止损与弱 Detector 诊断报告

更新时间：2026-03-15

## 1. 本轮目标

本轮只盯两件事：

1. `末端旗形 / 第二腿陷阱 / 头肩顶MTR` 的结构边界，确认是否偏离 Al Brooks；
2. `protective_stop_exit` 为什么仍然很大，确认它到底死在哪些策略、哪些保护性管理子状态。

本轮原则：

- 不按单一品种或单一周期特调；
- 不靠单纯降频换盈利因子；
- 只能做符合 Al Brooks 原文与百科案例的结构修正。

---

## 2. 直接参考的 Brooks 依据

### 2.1 末端旗形

- [23A What is Final Flags](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/23A What is Final Flags 22699d8757ab8121908bf1560e5c7483.md)
- [18 Final Flags 最终旗形](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/11-20 形态与结构/18 Final Flags最终旗形.md)

核心语义：

- Final flag 本质上是 late trend 的小型 TTR / wedge；
- 更常见于强趋势后期、接近 measured move 或重要磁体；
- 不是普通趋势里的任意小回调。

关键图例：

![Final Flag 例图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/assets/23A What is Final Flags/image 1.png)

### 2.2 第二腿陷阱

- [47C 2nd Leg Trap; Fade BO](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/47C 2nd Leg Trap; Fade BO( bet will fail); How to  22699d8757ab81b0aec3ea94854f9a62.md)
- [交易区间 - 第二腿陷阱](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md)

核心语义：

- 第二腿陷阱发生在 TR 边缘，往往是“看起来最强的一腿”；
- 关键不是随便第二腿，而是边缘测试、缺少 follow-through、被一根反向 bar 否定；
- 更像 fade failed breakout，而不是去追第二腿。

关键图例：

![Second Leg Trap 例图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/assets/47C 2nd Leg Trap; Fade BO( bet will fail); How to /image 3.png)

### 2.3 头肩顶 MTR

- [27A Head and Shoulders is MTR](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/27A Head and Shoulders is MTR； Most Head and Shoul 22699d8757ab81a2b0efcaf7796656c7.md)
- [22 Head and Shoulders 头肩形](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/21-30 高级策略/22 Head and Shoulders头肩形.md)

核心语义：

- H&S 是 MTR 的一个变体；
- 大多数 H&S reversal 只是 minor reversal；
- 真正值得做的是带有 `TBTL + break major channel` 的 H&S，而不是随便一个“像头肩”的摆动。

关键图例：

![Head and Shoulders 例图](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/advanced_hs_top-0066.png)

---

## 3. 本轮代码改动

### 3.1 Detector 收口

文件：

- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [strategy_advanced.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py)

本轮调整：

1. `第二腿陷阱`
   - 增加 `edge_tests >= 2`
   - 限制第二腿突破过度伸展
   - 要求反向确认后真正回到区间边缘内

2. `末端旗形`
   - 增加 late trend + TTR 压缩要求
   - 增加旗形重叠结构要求
   - 要求失败突破重新回到旗形内部，而不是只看一根反转棒

3. `头肩顶/底`
   - 增加 `major_channel_break` 过滤
   - 不再把大量只是 minor reversal 的 H&S 当成 MTR
   - 结合 `EMA` 下破/上破作为简化版 major channel break 代理

### 3.2 保护性管理收口

文件：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

本轮调整：

1. `protective_stop` 分类修正
   - `protective_runner_kept` 不再被误记到 `protective_stop`
   - 有保留 runner 的止损统一记到 `runner_trailing`

2. `protective_detail_plan` 收紧
   - `tr_scalp_protect`
   - `reversal_protect`
   - `breakout_protect`
   - `second_entry_profit`

3. `protective_scalp` 增加主动 `SCALP`
   - 不再让已经退化成小 scalp / scratch 的单持续拖到保护性止损
   - 特别针对：
     - TR scalp 退化
     - 失败的 reversal protect
     - 失败的 breakout protect
     - second entry 没跟进后的保护退出

---

## 4. 回测结果

### 4.1 回归修复基线

文件：

- [当前退化版精选结果](/tmp/ab_selected_management_report_current_selected.json)
- [回修后精选结果](/tmp/ab_selected_management_report_fixed_selected.json)

回修后精选 9 窗口：

- 总交易数：`1814`
- 加权胜率：`30.87%`
- 场景平均 PF：`0.683`

说明：

- 这一步把明显偏离 Brooks 的 detector 工程阈值拉回来了；
- 但系统整体仍未转正。

### 4.2 三窗口探针（本轮 detector + 保护性管理组合）

文件：

- [三窗口探针结果](/tmp/ab_selected_management_report_probe_v3.json)

窗口：

- `BTCUSDT 5m 2022-01-24 ~ 2022-02-23`
- `BTCUSDT 15m 2022-01-24 ~ 2022-02-23`
- `ETHUSDT 15m 2023-01-13 ~ 2023-02-12`

结果：

- 基线总交易数：`605`
- 新探针总交易数：`607`
- 基线加权胜率：`33.55%`
- 新探针加权胜率：`33.44%`
- 基线平均 PF：`0.742`
- 新探针平均 PF：`0.749`

结论：

- 方向是小幅正的；
- 没有把频率砍掉；
- 但还远远不是“质变”。

### 4.3 两窗口快探针（保护性管理继续收紧后）

文件：

- [两窗口快探针结果](/tmp/ab_selected_management_report_probe_v4.json)

窗口：

- `BTCUSDT 5m 2022-01-24 ~ 2022-02-23`
- `BTCUSDT 15m 2022-01-24 ~ 2022-02-23`

结果：

- 基线总交易数：`485`
- 新探针总交易数：`488`
- 基线加权胜率：`33.61%`
- 新探针加权胜率：`33.20%`
- 基线平均 PF：`0.776`
- 新探针平均 PF：`0.795`

结论：

- PF 继续小幅改善；
- 频率基本持平；
- 胜率略降，但没有明显失控；
- 说明“把更多退化单转成 SCALP，而不是死在 protective stop”这条方向是对的。

---

## 5. protective_stop 的真实来源

### 5.1 BTC 15m 2022 单场景

保护性止损总数：`40`

按策略：

- `头肩底MTR`: `8`
- `低2`: `7`
- `头肩顶MTR`: `6`
- `双重底`: `5`
- `双重顶`: `4`

按 detail：

- `reversal_protect`: `15`
- `tr_scalp_protect`: `14`
- `second_entry_profit`: `4`
- `generic_protect`: `4`

结论：

- 在这个中频窗口里，`protective_stop` 最大头不是趋势恢复，而是 `MTR反转族` 退化成 minor reversal / TR scalp 后没有及时变成 scratch/scalp。

### 5.2 BTC 5m 2022 单场景

保护性止损总数：`127`

按策略：

- `高2`: `24`
- `低2`: `14`
- `双重顶`: `14`
- `双重底`: `12`
- `头肩底MTR`: `12`
- `高1`: `9`
- `楔形底`: `9`
- `ii突破`: `8`

按 detail：

- `tr_scalp_protect`: `68`
- `second_entry_profit`: `20`
- `reversal_protect`: `14`
- `breakout_protect`: `13`

结论：

- 高频窗口里，`protective_stop` 的最大头是 `tr_scalp_protect`；
- 其次是趋势恢复族里的 `second_entry_profit`；
- 然后才是 `reversal_protect` 和 `breakout_protect`。

---

## 6. 当前判断

### 6.1 只盯这两件事，能不能把所有亏损都转盈利？

不能现在就这么下结论。

原因：

1. `末端旗形 / 第二腿陷阱 / 头肩顶MTR` 只是最弱的 detector 之一，不是全部交易量；
2. `protective_stop_exit` 虽然是最大亏损桶之一，但它背后又分成至少四类不同的失败路径：
   - `tr_scalp_protect`
   - `second_entry_profit`
   - `reversal_protect`
   - `breakout_protect`
3. 当前系统里真正接近成熟的部分，已经不是 detector，而是：
   - `runner_trailing`
   - `tp_after_scaleout`
   - `protective_scalp_exit`

也就是说：

- 现在不是“不会赚钱”；
- 而是“太多交易在成熟之前就退化成了保护性止损”。

### 6.2 现在是不是整体所有策略都还处于亏损状态？

整体仍未转正。

当前更准确的说法是：

- 系统整体家族级别大多仍低于 `PF 1`
- 但不是所有单策略都亏
- 例如此前精选样本里，`楔形顶` 已经明显高于 `1`
- 只是从系统层面看，整体仍然没有稳定盈利优势

---

## 7. 下一步最值的工作

1. 继续压 `protective_stop_exit`
   - 优先顺序：
     - `tr_scalp_protect`
     - `second_entry_profit`
     - `reversal_protect`
     - `breakout_protect`

2. 不再大面积扩 detector
   - 先把最弱的三个 detector 收干净：
     - `末端旗形`
     - `第二腿陷阱`
     - `头肩顶MTR`

3. 后续整体分析要从前往后、从里往外
   - detector 是否还混入非 Brooks setup
   - premise 是否过宽或过紧
   - protective 管理是否把 scratch / scalp / runner 分清
   - trailing 是否只在成熟 runner 上使用
   - 成本层是否已经把薄优势全部吃掉

---

## 8. 一句话结论

这轮不是把系统直接拉到盈利，而是把问题再压缩了一层：

- `末端旗形 / 第二腿陷阱 / 头肩顶MTR` 的边界更接近 Brooks 了；
- `protective_stop_exit` 的真正来源已经拆清；
- 当前最该打的，不再是泛化 detector，而是 `tr_scalp_protect + second_entry_profit + reversal_protect + breakout_protect` 四条保护性失败路径。
