# Brooks 卡点全景分析（2026-03-14）

> 目的：回答一个更具体的问题  
> 为什么现在系统已经明显更像 Al Brooks 了，但交易频率、胜率、盈利因子仍然一起卡住，迟迟上不去？

---

## 1. 先说结论

当前系统已经不是“完全做错方向”，而是进入了一个很典型的 **中途卡点阶段**：

1. **信号层已经明显比之前干净**
2. **零手续费下，多个家族已经出现正期望**
3. **真实成本一叠加，边际优势立刻变薄**
4. **很多交易虽然进入了“保护性管理”，但没有被真正优雅地处理掉**
5. **跨样本最不稳定的，仍然是 `高1/低1` 与部分突破追随链**

所以现在真正的问题不是：

- “要不要继续放更多信号”
- “是不是完全不符合 Brooks”

而是：

- **坏单退化后，系统还不会像 Brooks 那样把它们更多地处理成保本、小赢、小亏**
- **好的单虽然能赚钱，但利润厚度还不足以覆盖 crypto 成本**
- **部分 setup 在精选窗口成立，在扩展窗口就塌掉，说明还没有做到跨样本稳定**

---

## 2. 这次重新核对过的 Brooks 原始依据

这轮没有只看已有文字总结，而是重新渲染 PDF 页面做了视觉核对。

### 2.1 `H2` 本来就是标准趋势恢复 setup

来源：

- [基础篇 PDF](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf)
- 截图页：`12`
- 稳定截图参考：[basic_h2-0012.png](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_h2-0012.png)

核对结果：

- Brooks 明确写的是 `In bull trend, look for High 2 (H2) pullback`
- 同页直接写了 `Buy on stop above high of signal bar`

这意味着：

- `高2/低2` 不应被额外工程门槛机械压成“非得再等更多确认”
- 真正该收紧的是 **上下文质量**，不是把 `H2/L2` 本身当成可疑 setup

### 2.2 管理比“找完美 setup”更重要

来源：

- [基础篇 PDF](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf)
- 截图页：`337`
- 稳定截图参考：[basic_management_key-0337-0337.png](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/basic_management_key-0337-0337.png)

核对结果：

- Brooks 明确写了 `Managing trades well, is more important than spotting perfect setups`
- 同页还直接给出：
  - 第一次做多保本退出
  - 第二次做多才盈利

这和当前系统最需要继续拆的地方完全一致：

- `first entry`
- `second entry`
- `protective management`
- `re-entry`

### 2.3 十大模式里再次确认 `High 2 bull flags / Low 2 bear flags`

来源：

- [阿布10种最佳价格行为交易模式.pdf](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/阿布10种最佳价格行为交易模式.pdf)
- 截图页：`4`
- 稳定截图参考：[top10_tr-04.png](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/assets/brooks_refs/top10_tr-04.png)

核对结果：

- `H2/L2` 仍然是 Brooks 主体系里的正统 setup
- 但它们不是脱离上下文存在的，通道、区间、趋势力度会改变它们的胜算和管理方式

### 2.4 百科全书的作用

来源：

- [图表百科全书-文件夹版](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/图表百科全书-文件夹版)

本轮确认：

- 该目录确实是按百科分卷整理的 PDF 集
- 但 OCR 检索能力较弱，当前更适合做“案例回看”和“图形语义核验”，不适合当成即时文本搜索库

这意味着下一步最好补一个百科索引，否则后面每次定位图例仍然偏慢。

---

## 3. 量化事实：卡点到底卡在哪里

### 3.1 频率不是主问题

精选 `v6`：

- `5m`：生成 `4099`，通过 `3020`，成交 `1290`
- `15m`：生成 `3840`，通过 `2861`，成交 `749`

结论：

- 当前系统不是“没机会”
- 也不是“路由太严导致完全没有交易”
- 真正的问题是 **进来的单，质量和后续管理还不够厚**

### 3.2 `15m` 明显比 `5m` 更接近可用

精选 `v6`：

- `5m` 平均 PF：`0.614`
- `15m` 平均 PF：`0.714`

扩展 `v6`：

- `5m` 平均 PF：`0.523`
- `15m` 平均 PF：`0.659`

结论：

- `15m` 是当前最接近实战正向的主战场
- `5m` 不是不能做，而是 **在成本 + 退化管理下更容易被压扁**

### 3.3 零手续费已经证明逻辑本身不是全错

精选 `v6` 同一规则对比：

- 有手续费：整体 PF `0.680`
- 零手续费：整体 PF `1.076`

按家族：

- `趋势恢复族`：`0.714 -> 1.144`
- `MTR反转族`：`0.684 -> 1.073`
- `突破追随族`：`0.763 -> 1.423`

结论：

- 逻辑本身已经第一次出现“净优势”
- 但优势厚度还不够覆盖真实成本
- 所以下一步不是盲目增频，而是 **把坏单处理得更短，把好单保留得更完整**

---

## 4. 当前最关键的新发现：`protective_scalp` 在很多交易里只是“挂名存在”

这是这轮最重要的新增诊断。

### 4.1 统计上非常不正常

精选 `v6`：

- `protective_scalp_involved`: `1341` 笔，PF `0.342`
- `protective_scalp_exit`: `29` 笔

扩展 `v6`：

- `protective_scalp_involved`: `1239` 笔，PF `0.289`
- `protective_scalp_exit`: `17` 笔

这说明：

- 大量交易确实被降级进了 `protective_scalp`
- 但真正以 `protective_scalp` 逻辑优雅离场的只占极少数
- 也就是说，很多单进入保护状态后，并没有被“更像 Brooks 地处理掉”

### 4.2 代码里能看到原因

关键位置：

- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)

直接相关逻辑：

- `_activate_protective_scalp(...)`
- `_manage_protective_scalp(...)`

当前实现里，`_manage_protective_scalp()` 一开始就做了这件事：

- 如果 `management_reason_detail` 为空，直接 `return False`

而很多进入 `protective_scalp` 的调用路径，并没有提供 `detail`：

- `FAILED_FT`
- 很多 `MTR` 家族的 `PREMISE`
- 显式 `TR scalp` 家族的弱化管理

结果就是：

1. 交易被打上了 `protective_scalp` 状态
2. 但没有进入更细的保护性出场节奏
3. 最后仍然更多靠：
   - `protective_stop`
   - `PREMISE`
   - 超时/普通止损
   来结束

这和量化统计完全对上。

### 4.3 这就是为什么 `protective_stop_exit` 还这么重

精选 `v6`：

- `protective_stop_exit`: `770` 笔，PF `0.053`
- `premise_failure_exit`: `372` 笔，PF `0.097`

而表现好的桶其实已经很清楚：

- `breakeven_stop_exit`: PF `2.660`
- `tp_after_scaleout_exit`: PF `205.125`
- `runner_trailing_exit`: PF 极高

所以当前系统不是不会赚钱，而是：

- **会赚钱的管理分支已经存在**
- **但退化交易还没有被足够早、足够细地送进那些更健康的分支**

---

## 5. 胜率、PF、频率为什么会一起卡住

### 5.1 频率想往上加，但 5m 本身还没有厚到值得加

精选 `5m` 平均 PF 只有 `0.614`，扩展 `5m` 只有 `0.523`。

这意味着：

- 现在继续加频率，大概率只是更快放大成本和坏单
- 不是“先把交易数做大，再等管理改善”
- 而是必须先把 **单位交易的净边际** 做厚

### 5.2 胜率卡住，是因为退化单没被处理成更多 scratch / small win

Brooks 的原意不是每次都抓到完美单，而是：

- first entry 不对，保本走
- second entry 更成熟，再去赚
- 进入 TR，按 TR 管理

当前系统虽然名义上已经开始做这件事，但实现上还不够彻底：

- 退化单仍大量落入 `SL`
- 或者更晚的 `PREMISE`
- 没有足够多地转成 `BE / SCALP / tp_after_scaleout`

### 5.3 PF 卡住，是因为当前利润厚度还不足以覆盖 crypto 成本

精选 `v6` 零手续费时：

- `高2`：PF `1.158`
- `低2`：PF `1.148`
- `高1`：PF `1.109`
- `低1`：PF `1.111`
- `ii突破`：PF `1.969`

但加手续费后，这些大多又掉回 `1` 以下。

这说明：

- 主问题不是完全没有 edge
- 而是 edge 太薄
- 只要管理链和成本一叠加，就被压扁

---

## 6. 哪些东西目前相对靠谱，哪些还不能碰

### 6.1 当前更接近“可继续打磨”的

- `高2`
- `低2`
- `双重底`
- `楔形顶 / 楔形底`
- `15m` 主战场

原因：

- 它们在精选样本里已经明显优于系统平均
- 零手续费下更容易跨过 `PF=1`
- 更符合 Brooks 对 second entry / MTR / wedge 的原始体系

### 6.2 当前最不该靠“加频”去解决的

- `高1`
- `低1`
- `ii突破`
- `ioi突破`

原因：

- 它们在精选窗口有改善
- 但在扩展窗口里稳定性明显不够

尤其是：

- `ii突破`：精选 `PF 1.120`，扩展掉到 `0.175`
- `高1`：精选 `0.698`，扩展掉到 `0.395`
- `低1`：精选 `0.657`，扩展掉到 `0.474`

这说明这些 setup 目前还不能承担“提高频率”的任务。

---

## 7. 代码层还暴露出的第二个问题：管理规则仍然偏通用，不够家族化

关键文件：

- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)

### 7.1 `premise_check` 仍然是通用框架

当前优点：

- 已经允许趋势恢复和反转风格从 `CLOSE` 改成 `REDUCE`

当前不足：

- `follow_through` 仍然是很粗的近似
- `signal_validity` 的触发仍然偏通用
- 没有真正按：
  - `first entry`
  - `second entry`
  - `trend -> TR`
  - `TR edge reversal`
  做显式分层

### 7.2 `strength_check` 也仍然偏通用

当前用的是统一打分项：

- `gap_open`
- `new_hl_lh`
- `ema_bounce`
- `micro_gap`
- `shallow_pb`
- `wedge_exhaustion`
- `multi_tf_align`

问题在于：

- 这些信号对不同家族的重要性并不相同
- `趋势恢复族`、`MTR`、`突破追随族` 不能一直共用同一强度框架

这也是为什么系统虽然已经开始像 Brooks，但仍然容易出现：

- 该早保护的没早保护
- 该继续拿 runner 的又过早转弱

---

## 8. 当前最合理的优化顺序

### 8.1 第一优先级：先修 `protective_scalp`，不是再加 setup

理由：

- 这条链已经被统计证明是主堵点
- 而且是实现层能直接解释的堵点

建议方向：

1. 给 `management_reason_detail` 为空的 `protective_scalp` 增加默认 fallback 计划
2. 按家族拆最少三类默认保护计划：
   - `trend_recovery`
   - `mtr_reversal`
   - `breakout_follow`
3. 目标不是把更多单做成大赚，而是把更多退化单做成：
   - `BE`
   - `small win`
   - `small loss`

### 8.2 第二优先级：把趋势恢复族正式拆成 `first entry / second entry / channel -> TR`

理由：

- Brooks 页图已经明确支持这个拆法
- 当前代码里已经有雏形，但仍然不够显式

建议方向：

1. `高1/低1` 默认更像“先活下来”
2. `高2/低2` 默认更像“第二次成熟入场”
3. 一旦进入 `channel -> TR`，管理立刻切换，不再按趋势延续思路硬拿

### 8.3 第三优先级：把突破追随族重新按跨样本稳定性重排

理由：

- `ii突破` 在精选里漂亮，但扩展里崩得最明显

建议方向：

1. 不把 `ii突破` 当成加频主力
2. 优先保留稳定的 breakout context
3. 继续提高 `5m` 上 breakout 的 follow-through 与 target path 要求

### 8.4 第四优先级：为百科全书建立检索索引

理由：

- 后面不只是课程回顾，更多是图例核验
- 百科是最接近实战图表语义的来源之一

建议方向：

1. 先给百科 18 个分卷建立目录索引
2. 再补常见主题关键词：
   - `H1/H2`
   - `endless pullback`
   - `tight channel`
   - `trading range`
   - `MTR`
   - `follow-through`
   - `management`

---

## 9. 最终判断

如果只用一句话概括当前卡点：

**系统已经找到了对的 Brooks 方向，但坏单的退化管理仍然不够 Brooks，导致真实成本把原本已经存在的薄优势重新压回了 `PF<1`。**

所以接下来最该做的，不是：

- 盲目追更多交易
- 继续只抠 setup 名字

而是：

- **先把退化单处理得更像 Brooks**
- **再把 second entry / channel -> TR 的管理状态机真正拆开**
- **最后再决定哪些 setup 配得上增加频率**

---

## 10. 这份分析直接对应的关键文件

- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [sim_exchange.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py)
- [pa_engine.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py)
- [premise.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py)
- [strength.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py)

以及当前上下文与前置报告：

- [BROOKS_NEXT_WINDOW_CONTEXT_20260314.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_NEXT_WINDOW_CONTEXT_20260314.md)
- [BROOKS_FULL_CHAIN_AUDIT_20260314.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_FULL_CHAIN_AUDIT_20260314.md)
- [BROOKS_BREAKTHROUGH_REPORT_20260314.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/BROOKS_BREAKTHROUGH_REPORT_20260314.md)
- [TREND_RECOVERY_GAP_REPORT_20260314.md](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/docs/TREND_RECOVERY_GAP_REPORT_20260314.md)
