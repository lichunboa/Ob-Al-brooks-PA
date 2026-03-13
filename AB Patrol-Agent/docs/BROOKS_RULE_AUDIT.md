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
| 管理模板里的 `risk_pct > 1.2/1.4/1.6/1.9/2.2/3.0` | 这些风险百分比上限属于资金管理经验值，不是 Brooks 的统一拒单规则 | 本轮已移除 |
| `score == 0` 直接拒单 | 这是工程分数门槛，不是教材里的入场条件 | 本轮已移除 |
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

## 七、本轮新增清理

这轮继续按 Brooks 体系，额外清掉了两类“虽然不是分数，但仍然过于工程化”的实现：

1. 软磁体不再默认当作硬 blocker
   - `round_number / session_open / tr_midline / ema20`
   - 现在只作为参考磁体
   - 真正默认可阻挡的，收回到 `measured_move / prior_level / major_swing / gap`
2. `H1/L1` 与 `H2/L2` 不再被近似写成“必须二次确认”
   - 只要满足：
   - 优势区 / 边缘
   - 强信号棒
   - 目标路径清晰
   - 或已存在反转证据
   - 就允许一次信号或二次信号直接执行

对应代码：

- [runner.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/libs/backtest/runner.py)
- [target_magnets.py](/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/trading/utils/target_magnets.py)

## 八、关于“时间周期不该决定策略逻辑”的当前结论

这轮又额外校准了一条边界：

- Brooks 体系确实不是“5m 一套、15m 一套、1h 再一套完全不同规则”
- 真正该变化的，是：
  - 当前周期的市场状态
  - 更高一级周期给出的背景
  - 同一信号在不同压缩层级里的空间与位置

因此主链现在采用的原则是：

1. detector 与路由尽量按结构泛化
   - 不再写死 `15m 为 TR，5m ...`
   - 改成 `更高一级周期为 TR，当前周期 ...`
2. 可以保留的周期映射，只限于“更高一级周期上下文”
   - 例如 `5m -> 15m`
   - `15m -> 1h`
   - `1h -> 4h`
3. 不再允许把单个具体周期写成独占 detector 的前提，除非它真的是日内开盘结构

也就是说：

- 周期可以影响背景
- 周期不该决定某个 Brooks setup 在逻辑上“只属于 5m”或“只属于 15m”

## 九、这轮新增验证结果

结合 `/tmp/brooks_frequency_audit_20260313.json` 与 `/tmp/brooks_zero_strategy_recheck_20260313.json`，当前可以确认：

1. `末端旗形`
   - 之前是 detector bug，不是策略天然稀有
   - 现在已经恢复成正常可生成、可成交
2. `HOY / LOY / iii`
   - 已经不再是“完全没有 detector”
   - 当前主要矛盾转成：
     - `prior_level` 结构磁体拦截
     - 弱趋势里 follow-through 不足
3. `高1 / 低1 / 高2 / 低2`
   - 之前确实被“偏好第二信号”误写成了“近乎强制第二信号”
   - 现在已改成：
     - 边缘/优势区
     - 强信号棒
     - 目标路径清晰
     - 或已有失败突破/受困一侧证据
     满足其一即可放行

## 十、剩余允许保留的“结构性阻挡”

当前还保留、并且仍然符合 Brooks 的阻挡，只剩这些：

1. `TR / 宽通道中部不做`
2. `弱趋势 / 宽通道里缺少 follow-through 不追突破`
3. `结构性磁体前方目标明显受阻`
4. `宽通道 first reversal` 仍需防止误判成大反转
5. `第二腿陷阱`、`失败突破`、`趋势线破坏` 仍然是核心反转证据

后续如果继续提高频率，只能通过两种方式：

1. 证明某条结构守门写得比教材更死，然后放宽
2. 补齐尚未完整实现的 Brooks detector

不再允许恢复任何工程化分数、R 距离或 ATR 阈值来“换频率”。

## 十一、`prior_level` 的当前边界

这轮把 `prior_level` 单独拆开重新审了一次，当前主链采用的边界是：

1. 单个 `prior_level`
   - 对真正的 breakout chase，如果已经有足够突破语境，就不再一律挡单
   - 对趋势中的 pullback continuation，通常先把它当第一测试目标
2. `prior_level` 结构簇
   - 如果前方是多个前高前低叠成一簇，仍然保留为硬阻挡
   - 这类更接近 Brooks 里“市场先去测试阻力，再决定能否真正穿过去”的情形

当前已经确认修掉的一类误杀是：

- `第一均线缺口` / `20均线缺口` / `突破回调`
  - 过去会因为 `broke_micro_extreme` 被过早视为“强 breakout”
  - 然后直接跳过前高、改看更远的 measured move
  - 结果前高又被回头当成 blocker

现在这类 pullback continuation 已经改成：

- 只有真的出现更强的突破延续语境，才优先看更远目标
- 否则先把最近 `prior_level` 当第一目标

这样保留了 Brooks 的本质：

- 前高前低是磁体和测试位
- 不是默认 veto
- 但结构簇仍然是有效阻挡

## 十二、这轮 targeted recheck 的结论

本轮又单独复核了 `iii突破 / HOY突破 / ioi突破`：

1. `iii突破`
   - 在当前复核窗口里，已经不再表现成 `prior_level` 挡单
   - 代表性结果是 `ETHUSDT 15m 2022-01-24 ~ 2022-02-23`：
     - `generated=2`
     - `passed=2`
     - `trades=1`
   - 说明当前主矛盾已经不再是 `prior_level`
2. `ioi突破`
   - 之前的问题确实是路由优先级错了
   - 它会在 `broad_range` / `tight_range` 里，因为 `prior_leg_context = tr_second_leg` 被太早打成 `TR3_SECOND_LEG_TRAP`
   - 现在已经改成先判断是不是 `breakout mode / bull flag / bear flag continuation`
   - 只有失败突破证据明确时，才继续切回 `TR2 / TR3`
3. `HOY突破`
   - 在这轮复核窗口里没有复现出“被 `prior_level` 挡住”的样本
   - 当前更像是 detector 稀有，而不是 target path 又出了旧问题

也就是说，这轮之后：

- `iii突破` 的 `prior_level` 问题，在当前复核窗口里已经可以视为关闭
- `ioi突破` 的主问题，已经从“误归类到 second-leg trap”改正
- `HOY突破` 当前没有复现出旧的 `prior_level` 阻挡问题

## 十三、这轮继续保留与放宽的边界

基于新增页图 `0290 / 0409 / 0494 / 0605`，这轮主链的边界进一步明确成：

### 继续保留

1. `TR / 宽通道中部不做`
2. `tight channel` 里的 first reversal 仍然偏保守
3. `second-leg trap` 仍然是宽通道/交易区间里重要守门
4. `prior_level` 结构簇仍然是有效硬阻挡

### 本轮放宽

1. `宽通道 / 弱趋势` 里的顺势恢复
   - 允许 `acceptance_ready / reclaimed_prior_close / stairs / exhaustion`
     作为 `follow-through` 之外的合法证据。
2. `H1/L1` 与 `H2/L2`
   - 不再把“信号成熟度”和“目标路径是否通畅”绑定成一个 veto。
3. `看衰突破`
   - 只要已经回区间，且有强 rejection / trapped side / acceptance，不再要求证据项堆满。
4. `楔形 / 头肩` 在宽通道里
   - 只要已有 `stairs / exhaustion / failed breakout / trendline break / trapped side` 之一，就不自动压回 `second-leg trap`。

## 十四、本轮多窗口复测后的结论

这轮之后：

1. `5m` 两个独立窗口都明显抬频
   - `BTCUSDT 2022`: `567 -> 705`
   - `BTCUSDT 2025`: `520 -> 652`
2. `15m / 1h` 基本不变
   - `BTCUSDT 15m 2022`: `96 -> 98`
   - `BTCUSDT 15m 2025-11`: `104 -> 104`
   - `BTCUSDT 1h 2022`: `8 -> 8`
   - 说明放宽集中发生在顺势恢复链，而不是胡乱放大所有 setup
3. 剩余主瓶颈已经转移
   - 从 `宽通道顺势恢复缺少 follow-through`
   - 转成 `prior_level`、`H2/L2` 失败突破证据、`second-leg trap`
4. `楔形 / 头肩` 没有被放穿
   - `BTCUSDT 15m 2022`：`头肩 168 -> 150`，`楔形 41 -> 41`
   - `BTCUSDT 1h 2022`：`头肩 96 -> 72`，`楔形 21 -> 18`
   - 说明 `second-leg trap` 仍然是有效守门，只是没有再把所有宽通道反转一律压死

因此，后续如果继续提频，只能继续按 Brooks 去审：

1. `prior_level` 的顺势恢复边界
2. `H2/L2` 在 `TR / weak trend` 里的失败突破证据要求
3. `second-leg trap` 与 `楔形 / 头肩 / 双顶双底` 的区分
