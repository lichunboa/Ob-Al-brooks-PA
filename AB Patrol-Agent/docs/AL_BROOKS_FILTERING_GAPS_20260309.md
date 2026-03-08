# Al Brooks 视角下的漏单分类

更新日期: 2026-03-09

## 目的

这份文档把 Patrol 最近 48 小时里“有结构但没成交”的情况，重新映射到 Al Brooks 的原始知识框架，避免后续继续按单笔截图修规则。

## 理论来源

本次分类参考的本地知识源:

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/1.《价格行为学》（基础篇1-36章）.pdf`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian/Categories 分类/Al brooks/《价格行为PPT中文笔记》/2.《价格行为学》（进阶篇37-52章）.pdf`

相关主题主要来自:

- `14B 趋势`: 强突破、80% 规则、大多数反转失败
- `21C 反转`: 40% 的赢家、TBTL、反转通常先以双顶/双底出现
- `22A 主趋势反转`: MTR 是关键反转结构
- `18A-18F / 47A-47D`: 交易区间、TR 是限价单市场、要优先在边缘处理
- `Video 49F`: swing 示例、部分止盈

## 当前五类高频“合理机会被挡掉”

### 1. 强突破环境下的逆势反转

含义:

- 结构里已经出现双底、双顶、楔形或 MTR
- 但更大背景仍是 `BO / AIS / AIB`
- 这类反转在 Al Brooks 语境下，很多时候只够做反向 scalp，不够直接当 swing 反转

系统提示:

- 这类机会不应被简单记成“反转没接受”
- 应进一步区分:
  - `只适合 scalp`
  - `还不足以 swing`

### 2. 交易区间中部没有优势

含义:

- 市场已经回到 `TR`
- 但位置不在 `tr_edge:top/bottom`
- Al Brooks 强调 TR 更像限价单市场，应该在边缘处理，而不是在中部随便接

系统提示:

- 这类轮次不是“没信号”
- 而是“位置不对，不该在中部入场”

### 3. 40% 反转, 仅够 scalp

含义:

- 双底、双顶、楔形、MTR 已经出现
- 但反转还处在 “first reversal often small” 的阶段
- 结合 `21C` 的 40% 概念，这类 setup 常常只支持小目标或试探，不支持直接当大波段反转

系统提示:

- `pre_signal` 若进入这类结构，应优先生成:
  - `countertrend scalp watch`
  - 而不是立刻变成 `swing executable`

### 4. TBTL / 两波反转还没完成

含义:

- Al Brooks 经常用 `TBTL` / `two legs` 看待 reversal completion
- 有些 setup 已经出现第一次测试，但还没完成足够的第二波或接受

系统提示:

- 这类轮次不应被笼统归成“反转未接受”
- 应明确标成:
  - `TBTL 未完成`
  - `第二腿/二次入场未到`

### 5. 限价单环境未到边缘

含义:

- 在 TR / 弱通道里，市场更接近 `LOM`
- 但限价单模式并不代表任何位置都能做
- 关键仍是边缘、失败测试、二次失败、弱势回抽

系统提示:

- 若系统识别到 `TR + LOM/BLSH`，但没有边缘证据
- 应输出:
  - `限价单环境存在，但位置未到边缘`

## 这份分类对 Patrol 的意义

后续 `pre_signal -> candidate -> executable` 调整，应该优先用这些标签来解释无单，而不是继续只靠:

- `P×R 不通过`
- `gate 格式问题`
- `浅 PB 失效`

后者只是工程表面，前者才是 Al Brooks 语义层。

## 已经回写到状态机的三条执行规则

### A. 反转试探什么时候升级

根据课程大纲 `21C / 22A` 与 PDF 中“大多数 MTR 只有约 40% 概率走出 2R 以上波段、第一次反转通常较小”的表述，当前状态机约束为：

- 仅有 `wedge / MTR / DB / DT` 线索时，只能停在 `反转试探 / pre_signal`
- 至少出现 `H2 / L2 / HL MTR / LH MTR` 这类二次信号，才允许向 `candidate` 升级
- 若处在强突破背景中，还必须再看到接受/跟进，才考虑从 `反转试探` 升成真正可执行单

### B. TR 边缘限价单什么时候可执行

根据 `47A-47D` 与 PDF 中 `TR: Buy Low Sell High Scalp (BLSHS)`、`交易区间上/下三分之一`、`背景不清晰时等待第二次信号`：

- 只在 `tr_edge:top/bottom` 的边缘环境里允许进入 `TR 边缘限价单`
- 只有边缘但没有二次信号时，维持 `pre_signal`
- 边缘 + 二次信号/清晰 signal bar 同时出现时，才能升级成 `candidate/executable`
- 委托方式优先 `LIMIT`

### C. Broad Channel 里 stop 和 limit 的切换

根据 PDF 中对 `Broad Channel` 的表述：`scalp more, swing less, use limit orders`，以及顺势恢复仍可继续参与的例子：

- `Broad Channel + 反转/边缘 fade`：优先 `LIMIT`
- `Broad Channel + 顺势恢复/first pullback/接受继续`：优先 `STOP_MARKET`
- 不再把所有 `BC` 统一粗暴压成同一种委托方式

## 下一步

1. 已经把这些类别接入状态机，用于限制 `pre_signal -> candidate -> executable`：
   - `交易区间中部无优势`
   - `强突破环境下逆势不做`
   - `40%反转仅够 scalp`
   - `TBTL 反转未完成`
   - `TR 边缘限价单环境`
2. 继续把这些类别回写到 `canonical` 和 `S4/S5/S6`
3. 回放旧 Claude 成交样本，确认这些类别不会把原本应成交的单再次压成 `LOG_ONLY`
4. 已把分类继续推进到 `planned_trade` 的执行语义层：
   - `candidate_stage`: 继续观察 / 预信号 / 候选单 / 规则通过可执行单
   - `execution_mode`: 限价计划委托 / 止损触发委托 / 市价立即执行 / 等待接受
   - `TR` 边缘优先 `LIMIT`
   - `BO/TC` 顺势优先 `STOP_MARKET`
   - `Broad Channel` 允许 `Stop/Limit` 混合，不再因为 `BC` 状态被粗暴短路成固定 `LIMIT` 或固定 `MARKET`
