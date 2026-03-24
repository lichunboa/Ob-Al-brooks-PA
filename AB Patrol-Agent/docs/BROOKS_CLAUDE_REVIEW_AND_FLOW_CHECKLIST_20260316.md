# Claude 改动审查与 Brooks 全流程细节清单（2026-03-16）

## 一、Claude 本轮改动的处置结论

本轮只对 Claude 留下的 4 个主文件做审查与处置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/risk.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`

### 1. 保留

- `双顶/双底/楔形` 改成 `STOP` 入场。
  - 这更贴近 Brooks 的“信号棒突破触发”语义。
  - 当前保留位置：
    - `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`
- `analysis.py` 里的“趋势必须有结构支持”方向保留。
  - 即趋势不再只靠 `slope > 0` 之类的宽松条件。
  - 这是结构化背景识别，方向正确。

### 2. 回退

- `risk.py` 里的固定强度门槛全部回退。
  - 原因：`55/60/65` 这类写死阈值更像工程评分门槛，不像 Brooks 原文。
  - 回退后，真实过滤重新交给结构路由和上下文判断，不叠加额外分数门槛。

- `strategy_advanced.py` 里“区间中的压缩突破一刀切禁止”回退。
  - 原因：Brooks 在交易区间里并不是完全不看 breakout mode，不能直接 `cycle == "区间"` 就全部拒绝。

### 3. 重做

- `头肩顶/底MTR` 的大评分系统重做为轻量结构判定版。
  - 保留：
    - `TBTL`
    - `major channel break`
    - `neckline / right shoulder`
    - `STOP` 入场
  - 删除：
    - 大量人工分值累加
    - 过度细碎的 momentum/嵌套形态评分
  - 原因：之前那套更像“Brooks 术语包装下的工程打分器”，在随机窗口上明显拖累结果。

## 二、从一张图到一笔交易，完整流程应该拆成什么

下面这套清单，后续要作为所有策略的统一核对模板。不是只看某个 detector，也不是只看某个 exit。

### 1. 背景识别

先看：

- 当前是趋势、宽通道、紧密通道、交易区间，还是高潮后的退化阶段
- Always In 方向是什么
- 当前腿是顺势腿、回调腿，还是失败突破后的反向腿

要找的关键点：

- swing 结构
- EMA 位置与斜率
- overlap
- follow-through
- 是否已经进入 channel -> TR

对应知识点：

- 趋势与交易区间区分
- Tight Channel / Broad Channel
- Endless Pullback
- Breakout Mode

当前代码位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/analysis.py`

### 2. 候选策略预选

不是“看到形态名就做”，而是：

- 背景允许哪些 playbook 出场
- 当前更像趋势恢复、MTR 反转、高潮/陷阱反转，还是突破追随

要找的关键点：

- 是否 near edge
- 是否在 magnet 前
- 是否属于 endless PB
- 是否只是 minor reversal
- 是否真的发生 failed breakout

当前代码位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/market/playbook_router.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py`

### 3. 形态与信号 K 线

每个策略都要拆成：

- 形态结构是否成立
- 信号棒是否成立
- 信号棒质量够不够
- 信号棒是 reversal bar、trend bar、inside/outside 还是 weak close

要记录的细节：

- 形态容差怎么定
- 回调深度怎么定
- 第二次入场怎么确认
- failed breakout 的“回到区间内”到底怎么算

当前代码位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa_engine.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/strategy_advanced.py`

### 4. 入场类型

要区分：

- `STOP` 触发入场
- `LIMIT` 预埋入场
- close-based 的确认入场

当前必须统一记录：

- 为什么是 `STOP`
- 为什么不是 `LIMIT`
- 入场触发价和当前价是什么关系
- 入场是否会被滑点破坏

### 5. 止损

止损不只是“放远一点”。

要拆清：

- 结构止损位在哪里
- 是 signal bar 外、形态极值外，还是更大 swing 外
- 是否是 first entry / second entry 不同止损语义
- 实际风险是多少

当前代码位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/services/signal-service/src/engines/pa/structure_stops.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`

### 6. 仓位与杠杆

要分清：

- 单笔风险百分比
- 名义仓位
- 杠杆只是资金利用率，不改变策略本身 PF
- 手续费、滑点、爆仓容忍度会被杠杆放大

当前仍需继续细化：

- 按市场拆成本模型
  - Binance crypto futures
  - cTrader forex
  - cTrader indices / metals

### 7. premise / strength

Brooks 语义里这一步不是额外人工评分，而是：

- 结构前提是否仍在
- 当前是继续顺势、退化成 channel、还是退化成 TR
- follow-through / acceptance 还在不在

不能混进去的：

- AI 风控
- 账户限制
- 任意打分阈值

当前代码位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/premise.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/evaluation/strength.py`

### 8. 保护性处理

这一步是当前系统最关键的薄弱点。

要拆成：

- scratch
- breakeven
- protective scalp
- protective stop

当前主问题：

- 太多交易在成熟前退化进 `protective_stop_exit`
- 说明“坏单如何优雅降级”还没完全 Brooks 化

### 9. BE / trailing / partial / TP

要分别记录：

- 什么时候上 BE
- 什么时候只保护，不追踪
- 什么时候开始真正 runner trailing
- 什么时候先出一部分，再留 runner
- 目标是 prior high/low、measured move，还是 magnet cluster

当前代码位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/sim_exchange.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/position_management/risk_controls/`

### 10. re-entry / add-on

要单独记录：

- 是 first attempt 失败后的 second attempt
- 还是已经盈利后的 pyramiding
- Brooks 语义下，加仓不是“摊平亏损”，而是“在结构确认后扩大优势”

### 11. 成本

必须明确建模：

- 单边手续费
- 双边手续费
- 滑点
- 品种差异
- 市场差异

当前结论：

- 成本会放大系统问题
- 但不是当前第一根因
- 第一根因仍是“太多单在成熟前退化成保护性止损”

## 三、当前最该逐项排查的策略族

按优先级：

1. 趋势恢复族
   - 高1 / 低1 / 高2 / 低2 / 突破回调
2. MTR 反转族
   - 双顶双底 / 头肩 MTR / 楔形
3. 高潮/陷阱反转族
   - 末端旗形 / 第二腿陷阱 / 看衰突破 / 急速通道
4. 突破追随族
   - ii / ioi / iii / HOY / LOY / 收线追进

## 四、后续优化方式

后续不再只改“某个 detector”或“某个 exit”。

每个策略都要按同一模板完整过一遍：

1. 背景是什么
2. 为什么选这个策略，不选别的
3. 形态怎么判
4. 信号棒怎么判
5. 入场类型为什么是 STOP / LIMIT
6. 止损放哪
7. 仓位怎么算
8. 手续费 / 滑点 / 杠杆怎么计入
9. premise / strength 怎么变
10. 什么情况下 scratch / BE / scalp / stop
11. partial / trailing / TP 怎么算
12. 什么情况下 re-entry / add-on

只有这样逐项拆完，才可能把现在“接近 PF 1 但还没稳定盈利”的系统，继续往上推。
