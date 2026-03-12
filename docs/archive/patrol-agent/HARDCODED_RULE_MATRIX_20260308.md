# AB Patrol-Agent 硬编码规则矩阵审计

更新日期：2026-03-08

## 目标

这份审计只回答一个问题：

`当前有哪些“会影响交易判断”的规则，不是由 agent 直接从 SKILL/S 文件自由推理，而是被代码硬编码了？`

然后把这些规则分成三类：

- `应保留在代码`：基础设施、安全、执行约束
- `必须严格服从 SKILL/S`：任何偏移都可能直接改变交易行为
- `当前高风险`：已经发现偏移、缩水或未完成 parity

## 结论先行

当前系统不是“纯 agent 决定一切”，而是四层混合：

1. `完整知识库 / canonical 理论层`
   - 负责定义最高理论约束
2. `agent 决策层`
   - 负责方向、市场状态、候选动作、场景、入场理由、持仓管理理由
3. `流程编排层`
   - 负责本轮读哪些知识、哪些品种进入深分析、多久复扫一次
4. `交易闸门 / 执行层`
   - 负责把候选动作变成真实下单请求，并做最后的可执行校验

其中第 3、4 层里现在仍有不少硬编码规则。

最重要的判断：

- `不应该所有事情都交给 agent`
- 但`会改变交易边际和交易频率的规则`，必须尽量回归 `SKILL.md + S0-S7`
- `SKILL/S` 本身也必须继续回写到 canonical，而不是成为另一个独立真理
- 当前最需要继续清理的，是“流程编排层”的硬编码，不是基础执行层

---

## 一、应保留在代码的规则

这些规则属于“系统必须有的护栏”，不应该交给 agent 临时决定。

### 1. 执行动作白名单

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:2373`

当前核心动作支持：

- `OPEN_ORDER`
- `CLOSE_POSITION`
- `MODIFY_STOP_LOSS`
- `MODIFY_TAKE_PROFIT`
- `PARTIAL_CLOSE`
- `CANCEL_ALL_ORDERS`
- `LOG_ONLY`

并已支持与 `S7-management` 对齐的动作别名归一化：

- `ADD_ON / SCALE_IN / PYRAMID_ADD -> OPEN_ORDER`
- `TP1_REDUCE / TP2_REDUCE -> PARTIAL_CLOSE`
- `MOVE_STOP_TO_BREAKEVEN / TRAIL_STOP -> MODIFY_STOP_LOSS`
- `MOVE_TP / MOVE_TAKE_PROFIT / ADJUST_TP -> MODIFY_TAKE_PROFIT`
- `CANCEL_PENDING_ENTRY -> CANCEL_ALL_ORDERS`

判断：

- 这类动作白名单应保留在代码
- agent 不能直接发任意动作类型

风险：

- `分批止盈 / 加仓 / 撤挂单 / 移动止损 / 调整止盈` 已有执行映射
- `执行链` 已补上 `/order/{symbol}/modify-tp`，但仍需真实持仓 live 验证

### 2. 下单基础安全校验

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py:68`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py:117`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py:233`

包括：

- `entry / sl / tp` 方向合理性
- `BUY` 单 SL 必须低于 entry
- `SELL` 单 SL 必须高于 entry
- `can_trade` 必须为真
- 仓位计算失败则拒绝

判断：

- 这些规则应保留在代码
- 它们不是策略优化，而是执行安全底线

### 3. 长会话、watchdog、状态持久化

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/providers.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/scripts/watchdog.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/data/pa_trader/state/decision_session.json`

判断：

- 这类线程恢复、session 复用、日志监控必须保留在代码
- 不应交给 agent 自己决定何时自救

### 4. Query / TG / Web 展示机制

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Web`

判断：

- 属于展示层和可观测性，不应交给 agent 现场发明

---

## 二、必须严格服从 SKILL/S 的规则

这些规则如果被代码写偏，就会直接改变“是否下单”“多久下单”“看哪些机会”。

### 1. Trader's Equation

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/S5-evaluation.md`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py:68`

原规则：

- `P × R > (1-P)`

当前状态：

- 已修正
- 之前错误写成固定 `P×R >= 1.2`

结论：

- 这类规则必须完全服从 `S5`
- 不能再发明新的固定阈值

### 2. Scalp / Swing / Reversal 的最低准入

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/SKILL.md:31`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/knowledge/patrol-l1/references/S5-evaluation.md:273`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py:117`

原规则：

- `Scalp: P≥50%, R≥1`
- `Swing 顺势: P≥50%, R≥1.5`
- `Swing 逆势/MTR: P≥40%, R≥2`
- `反转试探: ≈40%, R≥2`

当前状态：

- 已改成优先依据 `refs + 明确 style + strategy` 识别
- `S6-tr -> SCALP`
- `S6-reversal -> REVERSAL_PROBE / SWING_REVERSAL`
- `S6-bo / S6-channel -> SWING_TREND`
- `TR -> SCALP`
- `BC` 不再被代码自动降级成 `SCALP`

判断：

- 已明显比原先更接近 `S5`
- 但 `S6-channel` 下的 `BC/TC` 与更细的顺势/逆势语义仍需继续核

### 3. Step 5 动态扫描间隔

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/.claude/skills/patrol-l1/SKILL.md:799`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:2707`

原 skill 重点：

- `P0 pre_signal 接近触发 -> 2 分钟`
- `P1 fresh BC/SC -> 3 分钟`
- `P2 有 pre_signal -> 4 分钟`
- `P4 正常市场 -> 8 分钟`
- 还有 `TR edge / momentum / stale` 等条件

当前代码：

- 用固定 bucket：`120 / 180 / 240 / 300 / 480 / 720`
- 判断条件已对齐到：
  - `pre_signal 触发接近`
  - `有持仓 + 高波动`
  - `fresh BC/SC (<10 bars)`
  - `TR edge`
  - `momentum 3+ bars`
  - `有持仓`
  - `pre_signal`
  - `stale > 3`
  - `all watching >= 3`
- `entry_ready` 不再被代码强行压到 `120s`

判断：

- 主框架已基本回到原 Step 5
- 仍需继续核 `momentum` 和 `TR edge` 的底层事件生成是否与原巡逻样本一致

### 4. pre_signal 过期 / 延期

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:352`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:1064`

当前硬编码：

- `5m` 默认 `25 分钟`
- `15m` 默认 `45 分钟`
- `5m` 延期 `15 分钟`
- `15m` 延期 `30 分钟`

判断：

- 这是直接影响“预信号是否保留”的规则
- 必须继续对照旧 Claude 行为验证

### 5. S 文件路由

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:800`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:877`

当前做法：

- 根据 `status/state/events/consecutive_watching` 代码路由到
  - `S3/S3b`
  - `S5`
  - `S6-*`
  - `S7`

判断：

- 这种“按条件路由知识”的机制本身合理
- 但路由条件属于强策略逻辑，必须持续对照原 `SKILL.md`

---

## 三、当前高风险硬编码项

这些不是“必须有的护栏”，而是现在最可能导致与 Claude 版偏离的地方。

### 1. event_score 权重

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:694`

当前权重：

- `entry_ready = +100`
- `pre_signal = +90`
- `signal_trigger / hl_signal = +80`
- `state_change / BC / SC / BO = +60`
- `ema_touch / wedge_or_mtr / first_pb / tr_edge / pb_depth = +40`
- `anomaly / stale = +20`
- `trigger_symbol = +50`

风险：

- 这会直接决定哪些品种先被深分析
- 原 skill 更像规则驱动，不是显式分数系统

建议：

- 后续优先把这套分数逻辑收缩成更接近原 `Phase A -> Scalp -> Phase B` 的显式规则

补充：

- 当前 `Phase B` 已不再只看 top1，而是允许所有事件品种进入
- 风险已从“漏看机会”降到“排序仍可能不理想”

### 3. patrol_scan.py 的 80+20 读盘是否真的落地

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_scan.py`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_ab_context.py`

当前状态：

- 已修正为：
  - `browse 80 bars` 用于 `compute_ai`
  - `signal 20 bars` 用于 `detect_signals / momentum_fading`
- 不再是表面写 `80+20`，底层却只喂最近 10-20 根

风险：

- `market_state()` 仍是算法化近似，不等于原 Claude 会话里的自然语言读盘

### 2. ranked_eventful_symbols 的 top-N 裁剪

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:762`
- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:1655`

当前做法：

- 按分数排序后裁剪
- `min_score=40`
- 常见调用 `limit=len(focus_symbols)` 或 `limit=2`

风险：

- 原 skill 是“每个有事件的品种进入 Phase B”
- 这里的分数门槛和裁剪策略可能漏掉本该分析的机会

### 3. route_s6_references 映射

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:776`

当前规则：

- `wedge_or_mtr / hl_signal:H / state:SC / state:BC -> S6-reversal`
- `tr_edge 或 TR -> S6-tr`
- `ema_touch / first_pb / H/L signal 或 TC/BC -> S6-channel`
- `BO / state_change / BO -> S6-bo`

风险：

- 这会直接改变本轮加载哪类策略知识
- 需要继续对照原 skill 的 S6 路由矩阵

### 4. current_market_state 的时间框架优先级

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:684`

当前规则：

- 优先顺序：`5m -> 15m -> 1h -> 30m -> 4h`

风险：

- 如果 5m 和 15m 状态与 1h/30m 冲突，这个优先级会改变策略路由与叙述

### 5. current focus top3

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:1222`

当前规则：

- 只保留 `focus_symbols[:3]`

风险：

- 原 skill 可扩展到多品种与多市场
- 现在固定 top3 会压缩机会面

### 6. build_trade_equation 的“补写”

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/runtime/pa_runtime.py:2230`

当前做法：

- 如果模型没给出完整 equation，代码会从 `evaluation` 文本里重新拼

风险：

- 会掩盖模型本轮其实没完整完成 `S5`
- 这更像“补救机制”，不是原流程

建议：

- 后续应记录“模型未给 equation”作为审计标记，而不是静默补全

### 7. validate_refs 白名单

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py:95`

风险：

- 以后你新增 `S` 文件、改文件名、补 quotes 文件，可能被 gate 直接拒绝

建议：

- 白名单应改成基于知识目录自动发现，而不是手写列表

### 8. validate_bar_reading 的最小长度和术语数

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_trade.py:109`

当前规则：

- 至少 `50` 字
- 至少 `3` 个 PA 术语

判断：

- 这是个“防水分析”规则，方向上合理
- 但阈值是经验性的，不是直接来自原 skill

### 9. patrol_scan.py 的信号与状态阈值

位置：

- `/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Patrol-Agent/tools/patrol_scan.py`

当前硬编码包括：

- AI 综合权重：`momentum 0.45 / ema 0.35 / structure 0.20`
- AI 方向阈值：`>|0.25|`，强度 `>|0.6|`
- state overlap 阈值：
  - `BO: max_run>=5 and overlap<0.4`
  - `TC: overlap<0.55`
  - `BC: overlap<0.72`
- `precision_ok`：
  - `avg_body/price > 0.0002`
  - 或 `avg_range/price > 0.0005`
- `momentum_fading`：
  - 最近 `5` 根连续衰减
  - 最后一根 < 第一根 `50%`
- `range_atr_multiple >= 1.5` -> `anomaly:large_bar`

判断：

- 这一层是“底层市场理解器”
- 其中不少阈值会影响 agent 看到的 `event_tags`
- 需要继续逐条与 Al Brooks 知识和旧日志核对

---

## 四、现在还有哪些地方不该再继续硬编码

下面这些内容，越往后越应该交给 agent 基于完整 `SKILL/S` 做判断：

### 应主要交给 agent 的部分

- 多周期方向综合解释
- 市场状态细节与场景判断
- `Scalp / Swing / 反转试探` 风格归类
- `P / R / P×R` 的主判断
- 具体该走哪个 S6 playbook
- 候选单优先级
- 持仓 premise / strength / protective management
- 下次扫描建议值

### 应保留在代码的部分

- 会话与 watchdog
- 状态持久化
- HTTP / Binance / execution-service 调用
- 最低执行安全校验
- 动作 schema
- Query / TG / Web 输出

### 混合区（最容易出问题）

这些现在最需要继续审：

- `Step 5` 动态扫描
- `S4` 策略路由
- `S5` 风格分类与 gate
- `S7-management` 的具体动作翻译

---

## 五、当前最重要的判断

截至这轮审计，最重要的事实有 3 个：

1. 当前不是“全由 agent 自由交易”
2. 当前也不是“全由代码写死交易”
3. 当前是“agent 决策 + 代码编排 + 代码执行闸门”的混合体

问题不在于“代码存在”，而在于：

`哪些规则应该只是把 SKILL/S 落地，哪些规则却在偷偷改写 SKILL/S。`

已经确认的偏移案例：

- `Trader's Equation` 之前被错误写成固定 `1.2` 门槛

仍需重点继续审的偏移区：

- `validate_stop_loss()` 的风格分类过于粗糙
- `event_score` / `top-N` / `S6 路由`
- `Step 5` 分桶逻辑
- `patrol_scan.py` 的状态与信号阈值

---

## 六、下一步建议顺序

按优先级，继续做：

1. 审 `validate_stop_loss()` 是否严格符合 `S5` 的 `Scalp / Swing / 反转试探`
2. 审 `Step 5` 动态扫描规则，逐条对齐原 `SKILL.md`
3. 审 `patrol_scan.py` 的 `compute_ai / market_state / detect_signals`
4. 审 `S6` 路由与 `event_score` 是否过度工程化
5. 盯第一笔自然 `OPEN_ORDER`，验证 `S7-management` 真闭环
