# Brooks 规则审计

> 更新于 2026-03-13
> 目的：把 `libs/backtest/runner.py` 里的回测门控逐条分成“教材硬规则”和“实现启发式”，后续只允许保留前者。

## 一、审计范围

- 代码入口：
  - `libs/backtest/runner.py`
- 对照知识源：
  - `AB Console-Obsidian/Categories 分类/Al brooks/AL brooks原课程大纲.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/01-10 基础概念/09 Setups And Signal Bars规则和信号K线.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/11-20 形态与结构/13 Trading Ranges and Vacuums交易区和真空区.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/11-20 形态与结构/15 Trend Types趋势类型.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/价格行为学/15A What is a BO 80% rule Most breakouts fail; Rev 22699d8757ab815597bdf81b4cb585f8.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/21-30 高级策略/29 Protective Stops保护止损.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/21-30 高级策略/30 Actual Risk实际风险.md`
  - `AB Console-Obsidian/Categories 分类/Al brooks/价格行为学-视频字幕版/31-40 交易管理/31 Protective Stops For Scalps剥头皮的保护止损.md`

## 二、教材硬规则

这些规则能在 Brooks 资料里找到明确理论依据，可以保留。

| `runner.py` 规则 | Brooks 依据 | 当前处理 |
| --- | --- | --- |
| `TR` 中部不做单，只优先做边缘反做 | 交易区间 80% 突破失败，中部噪音大，边缘更适合反做 | 保留 |
| 强趋势里不随意逆势做顺势单 | 趋势中优先顺势，逆势只允许明确反转证据 | 保留 |
| 弱趋势 / 宽通道里，缺少 `follow-through` 不追突破 | Brooks 对突破持续性的要求高，弱结构里更不应追弱突破 | 保留 |
| 更高周期为 `TR` 时，小周期不随意追突破 | 高周期背景决定小周期交易空间，`TR` 中突破大多失败 | 保留 |
| 止损必须放在结构位外，而不是只贴着信号棒 | `Protective Stops` / `Actual Risk` 的核心要求 | 保留 |
| `failed breakout`、`trapped trader`、`trendline break` 是反转 / 陷阱单的重要证据 | 失败突破、二次腿陷阱、MTR 都依赖这些结构证据 | 保留 |
| 目标路径受阻时，不应把突破追随单硬做成 stop entry | Brooks 强调“是否值得做”，第一目标太近或前方磁体过密时应放弃 | 保留，但只保留结构判断，不保留任意数值阈值 |

## 三、实现启发式

这些规则属于工程层附加判断，不是教材里的硬表达。本轮开始从主链移除。

| `runner.py` 启发式 | 问题 | 当前处理 |
| --- | --- | --- |
| `WATCH / CANDIDATE / EXECUTABLE` 阶段机 | 这是工程状态机，不是 Brooks 原生术语链 | 已移除其阻断作用 |
| `score < 60/62/65/68/70/72/74/76/78/80/82` | 分数阈值没有教材出处，只是二次打分门槛 | 已从路由和入场阻断中移除 |
| `management_score_floor()` 二次成熟度门槛 | live 链已经做过阈值，回测再叠一层会压低频率 | 已移除 |
| `actual_to_perfect_risk_ratio < 0.78` | `0.78` 不是教材规则，属于经验阈值 | 已移除 |
| `blocking_magnet_distance_r < 0.8 / 1.0 / 1.25` | 数值距离阈值没有教材原文 | 已改成只看“路径是否受阻” |
| `first_target_distance_r < 0.35` | 这类固定 R 距离是工程化量化，不是 Brooks 原句 | 已移除 |
| `signal_bar_tail_ratio < 0.25` | `0.25` 是实现阈值，不是教材硬值 | 已降成“必须存在明显拒绝尾巴”这一结构要求 |
| live `signal_threshold=80/72/68` | 周期分数门槛不是 Brooks 原生入场条件 | 已从主引擎过滤链移除 |
| ATR 倍数止损 / ATR 容差 | ATR 不是 Brooks 本质止损依据，只能算工程近似 | 主链止损已改回结构位外，残余 detector 容差继续清理中 |

## 四、本轮保留的判断边界

本轮之后，`runner.py` 仍然允许保留的，只剩这三类：

1. 市场结构判断
   - 趋势 / 宽通道 / 紧区间 / 交易区间
2. 证据判断
   - `follow-through`
   - `failed breakout`
   - `trapped side`
   - `trendline break`
   - `target_path_clear`
3. 止损结构判断
   - 止损是否真的放在结构外

不再允许保留的，是“没有教材来源的任意分数或距离数字”。

## 五、当前已完成的主链清理

这轮已经从主仓库中清掉了两类会干扰 Brooks 主链理解的历史模块：

1. `services/signal-service/src/rules/*`
   - RSI / MACD / SuperTrend / Ichimoku / 布林 / VWAP / Fibonacci
   - 旧规则目录、`sqlite_engine` 与订阅层已移除
2. `services/signal-service/src/engines/market_state_engine.py`
   - 已裁成只保留市场状态分类
   - 旧推荐矩阵、agent 推荐、格式化推荐块已移除

当前仍需继续清理的，只剩少量 detector 里残留的 ATR 形态容差，以及回测脚本层保留的阈值兼容参数。

## 六、结论

后续如果再调交易频率，只允许动两类东西：

1. 补真正缺失的 Brooks detector / playbook
2. 修结构判断错误

不再允许靠“加减分数阈值”去堆交易频率。
