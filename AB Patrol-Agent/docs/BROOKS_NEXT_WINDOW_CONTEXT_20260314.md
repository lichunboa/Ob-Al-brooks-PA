# Brooks 下一窗口上下文包（2026-03-14）

## 1. 这份文档的用途

这不是阶段总结散文，而是给下一窗口直接接手用的硬上下文。

目标：

1. 不再反复校准同一批原则。
2. 不再重复讨论哪些方向已经验证过、哪些已经被排除。
3. 下一窗口一开始就能直接进入有效优化。

---

## 2. 必须持续遵守的硬约束

### 2.1 理论约束

后续所有优化都必须满足：

1. **完全符合 Al Brooks 理念**
2. **不允许按单一品种特调**
3. **不允许按单一时间周期特调**
4. **同一逻辑必须在不同市场、不同周期上都成立**
5. **必须同时看频率、胜率、盈利因子**
6. **不能靠单纯降频换 PF**
7. **不能忽略成本**

这里的“成本”至少包括：

- 手续费
- 合理滑点
- 杠杆下的风险放大

说明：

- 杠杆不会改变策略本身的 PF，但会放大资金曲线风险和执行容错要求，因此不能拿来掩盖策略问题。
- 滑点还没有完整建模，后续必须补。

### 2.2 研究资料约束

后续判断必须优先引用以下资料：

- [《价格行为PPT中文笔记》目录](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》)
- [图表百科全书-文件夹版](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/图表百科全书-文件夹版)
- [阿布10种最佳价格行为交易模式.pdf](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/阿布10种最佳价格行为交易模式.pdf)
- [AL brooks原课程大纲.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md)

并且：

- 不光看课程 PDF
- 必须结合百科案例
- 尽量给出截图证据

---

## 3. 当前代码与报告状态

### 3.1 当前主分支状态

- 仓库：`AB Patrol-Agent`
- 分支：`feature/forex-ctrader`
- 当前最新关键提交：
  - `775691e7` `refactor: 拆分 protective stop 与 runner trailing`
  - `634aa24b` `refactor: 按 Brooks 提纯趋势恢复信号质量`

### 3.2 当前必须优先看的报告

- [全链路审查报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_FULL_CHAIN_AUDIT_20260314.md)
- [突破性分析报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_BREAKTHROUGH_REPORT_20260314.md)
- [趋势恢复族专项报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/TREND_RECOVERY_GAP_REPORT_20260314.md)
- [PDF 与百科证据索引](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)

### 3.3 当前关键代码位置

- [趋势恢复信号质量与路由](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [live 生成层状态优先筛选](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [回测管理链](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- [精选样本回测工具](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/diagnostics/selected_management_report.py)

### 3.4 当前关键回测结果文件

- [精选窗口 v5](/tmp/ab_selected_management_report_20260314_v5.json)
- [精选窗口 v6](/tmp/ab_selected_management_report_20260314_v6.json)
- [精选窗口 v6 零手续费](/tmp/ab_selected_management_report_20260314_v6_nofee.json)
- [扩展窗口基线](/tmp/ab_selected_management_report_20260314_extended.json)
- [扩展窗口 v6](/tmp/ab_selected_management_report_20260314_extended_v6.json)
- [扩展窗口旧零手续费参考](/tmp/ab_selected_management_report_20260314_extended_nofee.json)

---

## 4. 已经验证成立的结论

这些结论不需要下一窗口再从头怀疑，除非出现直接相反的新证据。

### 4.1 系统已经不是“缺信号”

当前不是“识别不到 Brooks setup”：

- 各策略家族都有稳定信号
- 主力策略都有足够交易样本
- 频率不是主要缺口

结论：

- 主问题已经不是“有没有信号”
- 而是“哪些信号不该进来”“哪些交易进来后没处理好”

### 4.2 真正赚钱的后段动作已经不是主要问题

当前这些动作已经明确表现良好：

- `runner_trailing_exit`
- `tp_after_scaleout_exit`
- `protective_scalp_exit`
- `breakeven_stop_exit`

也就是说：

- 系统不是完全不会 trailing
- 系统不是完全不会 TP1/TP2
- 系统不是完全不会保护性 scalp

### 4.3 当前最大的亏损桶是 `protective_stop_exit`

这个已经反复验证：

- 真正的大坑不是 `runner trailing`
- 不是 `TP1/TP2`
- 不是 `protective scalp`
- 而是 **`protective_stop_exit`**

这意味着：

- 很多交易在成熟前就退化了
- 并且退化后没有优雅地转成：
  - `BE`
  - `protective scalp`
  - `tp_after_scaleout`

### 4.4 这次“剥掉 Endless PB”是真的有效

#### 精选 9 窗口

- 总交易数：`3285 -> 2064`
- 胜率：`26.39% -> 29.70%`
- PF：`0.605 -> 0.680`
- `趋势恢复族 PF`: `0.595 -> 0.714`

#### 扩展 8 窗口

- 总交易数：`3094 -> 1805`
- 胜率：`24.98% -> 28.03%`
- PF：`0.521 -> 0.597`
- `趋势恢复族 PF`: `0.508 -> 0.608`

结论：

- 这不是只对单一窗口有效的局部修补
- 它在扩展年份与不同品种里也成立

### 4.5 手续费已经被证明是重大压制项

精选 9 窗口，`v6` 有手续费 vs 零手续费：

- 有手续费：`PF 0.680`
- 零手续费：`PF 1.076`

按周期：

- `5m`: `0.649 -> 1.130`
- `15m`: `0.719 -> 1.037`
- `1h`: `0.631 -> 0.781`

按家族：

- `趋势恢复族`: `0.714 -> 1.144`
- `MTR反转族`: `0.684 -> 1.073`
- `突破追随族`: `0.763 -> 1.423`

结论：

1. 当前主链逻辑第一次明确表现出“零手续费下可赚钱”
2. 真实成本会把优势压回 `1` 以下
3. 后续必须把边际优势做得更厚，而不是只做“看起来方向对”

---

## 5. 当前最重要的根因判断

到目前为止，根因已经基本收敛。

### 5.1 第一层根因：前端信号质量以前不够纯

之前 `高1/低1/高2/低2/突破回调/均线缺口` 里混进了太多：

- `endless pullback`
- `weak follow-through`
- `channel -> TR`

这些按 Brooks 原意并不该直接当 executable trend recovery。

### 5.2 第二层根因：大量交易在成熟前退化成坏的保护性止损

即使后段已有：

- `runner_trailing`
- `tp_after_scaleout`
- `protective_scalp`

但更多单还没走到那一步，就掉进了 `protective_stop_exit`。

### 5.3 第三层根因：边际优势仍不够厚

现在不是“完全不会做 Brooks”，而是：

- 在零手续费下，很多链已经能过 `1`
- 但一加真实成本就不够厚

这说明当前系统更像：

- 已经找到了正方向
- 但优势还太薄

### 5.4 第四层根因：仍有跨样本不稳定的策略族

尤其是：

- `高1/低1`
- `ii突破`
- 一部分 `breakout follow-through` 链

它们在精选样本和扩展样本中的稳定性差异还比较大。

---

## 6. 当前最清楚的“哪些地方还差”

### 6.1 趋势恢复族

虽然已经明显改善，但仍然是整体最大拖累源之一。

现状：

- `高2/低2` 已经明显好于之前
- `高1/低1` 仍偏弱
- 说明 `first entry / second entry` 还没有完全拆开

### 6.2 MTR 反转族

已经接近可用，但还不够厚。

问题不再主要是“识别不到”，而是：

- `SL`
- `PREMISE`
- `WEAK_SCALP`

这些退出仍然偏多。

### 6.3 突破追随族

精选样本里改善很大，但扩展样本还不稳。

特别要盯：

- `ii突破`
- `ioi突破`
- `HOY/LOY/收线追进`

这类 breakout follow-through 逻辑是否真的足够稳定。

### 6.4 均线缺口族

当前样本数仍少，不适合过早下结论。

---

## 7. 下一窗口禁止做的事

这些是明确禁止项：

1. **禁止按某个品种单独调参数**
2. **禁止按某个周期单独调参数**
3. **禁止用纯降频来换 PF**
4. **禁止忽略手续费与滑点**
5. **禁止脱离 Brooks 原文和百科案例乱加工程规则**
6. **禁止再把“趋势恢复”和“endless PB”重新混起来**
7. **禁止只看精选样本，不看扩展样本**

---

## 8. 下一窗口优先做什么

下一阶段不要再大范围扩策略，而是只做这三件事：

### 8.1 第一优先级：继续压 `protective_stop_exit`

目标不是“更快砍”，而是让更多退化交易转成：

- `breakeven_stop_exit`
- `protective_scalp_exit`
- `tp_after_scaleout_exit`

这是最直接的 PF 杠杆点。

### 8.2 第二优先级：彻底拆开 `first entry / second entry`

当前最可疑的仍然是：

- `高1/低1`
- `高2/低2`

需要进一步按 Brooks 区分：

- `first buy / first sell`
- `second buy / second sell`
- `tight channel pullback`
- `channel -> TR`

### 8.3 第三优先级：做 breakout follow-through 的跨样本稳定性

优先盯：

- `ii突破`
- `ioi突破`
- `HOY/LOY/收线追进`

因为它们在精选样本与扩展样本间差异仍然偏大。

---

## 9. 下一窗口开始前应该先看什么

建议顺序：

1. [突破性分析报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_BREAKTHROUGH_REPORT_20260314.md)
2. [全链路审查报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_FULL_CHAIN_AUDIT_20260314.md)
3. [趋势恢复族专项报告](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/TREND_RECOVERY_GAP_REPORT_20260314.md)
4. [PDF 与百科证据索引](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_PDF_EVIDENCE.md)
5. [精选 v6 结果](/tmp/ab_selected_management_report_20260314_v6.json)
6. [精选 v6 零手续费结果](/tmp/ab_selected_management_report_20260314_v6_nofee.json)
7. [扩展 v6 结果](/tmp/ab_selected_management_report_20260314_extended_v6.json)

---

## 10. 一句话交接

> 当前系统第一次明确证明了：在按 Brooks 提纯趋势恢复信号后，主链逻辑在零手续费下已经可以过 `1`；真正剩下的核心任务，不是继续找更多信号，而是继续压 `protective_stop_exit`，并把 `first entry / second entry / breakout-follow` 做到跨样本更稳定。  
