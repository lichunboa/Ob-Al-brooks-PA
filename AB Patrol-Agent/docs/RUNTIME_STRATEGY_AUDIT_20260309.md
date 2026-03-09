# Runtime 策略实现审计（S4 / S5 / S6 对照）

更新日期: 2026-03-09

## 目的

这份文档回答 3 个问题：

1. `runtime` 里哪些逻辑仍会影响交易判断
2. 它们对应 `S4 / S5 / S6` 的哪一层规则
3. 哪些应该继续留在代码里，哪些后续应继续回交给知识层

核心原则：

- `agent + SKILL/S/C/Q` 负责交易判断
- `runtime` 只允许做执行语义翻译、状态持久化、交易所接口和安全边界
- 若代码在没有明确知识来源时改变交易判断，应视为高风险偏移

---

## 一、当前关键函数

| 函数 | 当前位置 | 当前职责 | 审计结论 |
|---|---|---|---|
| `classify_brooks_filter()` | `runtime/pa_runtime.py` | 把当前结构分成 Brooks 类别，并给出升级条件、风险和首选订单类型 | 仍是策略层逻辑，但已经明确绑定 `S4/S5/S6`，后续继续缩减启发式 |
| `derive_trade_execution_semantics()` | `runtime/pa_runtime.py` | 把 Brooks 分类翻译成 `WATCH / PRE_SIGNAL / CANDIDATE / EXECUTABLE` 与执行模式 | 应保留，属于执行语义翻译层，不应再自己发明策略 |
| `apply_brooks_filter_to_patch()` | `runtime/pa_runtime.py` | 把分类结果写回 `planned_trade / evaluation / entry_idea` | 应保留，属于结构化落盘层 |
| `normalize_next_scan_seconds()` | `runtime/pa_runtime.py` | 把 Step 5 提议收敛成可执行扫描间隔 | 暂时保留，但仍是策略近似层，后续继续贴近 `SKILL Step 5` |
| `select_prompt_references()` | `runtime/pa_runtime.py` | 选择本轮要读哪些 `S` 文件 | 应继续保留，但应只做路由，不做额外策略判断 |

---

## 二、Brooks 分类到执行语义的映射

现在 `classify_brooks_filter()` 不只返回类别，还返回：

- `stage_family`
- `preferred_style`
- `preferred_order_type`
- `upgrade_condition`
- `brooks_rule`
- `source_refs`

这意味着执行语义不再通过 `category` 名字在另一个函数里重复硬编码判断，而是直接来自同一份 Brooks 分类结果。

| `stage_family` | 含义 | 典型类别 | 对应知识源 | 是否保留在代码 |
|---|---|---|---|---|
| `watch_only` | 只有背景，没有执行优势 | `tr_middle_no_edge`, `watch_only` | `S4`, `S6-common`, `S6-tr` | 保留 |
| `wait_acceptance` | 先观察，等第二次信号/接受 | `tbtl_incomplete`, `tr_edge_limit_wait_second_signal` | `S4`, `S6-tr`, `S6-reversal` | 保留 |
| `countertrend_probe` | 只算反转试探，不直接 swing | `strong_breakout_countertrend`, `forty_percent_reversal_scalp_only` | `S4`, `S5`, `S6-reversal` | 保留 |
| `limit_edge` | 限价单候选/可执行链 | `tr_edge_limit_only`, `broad_channel_countertrend_limit` | `S4`, `S5`, `S6-tr`, `S6-channel` | 保留 |
| `stop_continuation` | 顺势 stop 触发链 | `broad_channel_trend_stop` | `S4`, `S5`, `S6-channel` | 保留 |
| `normal_candidate` | 正常顺势 candidate/executable | `trend_continuation_candidate` | `S4`, `S5`, `S6-common` | 保留 |

> 结论：`derive_trade_execution_semantics()` 现在主要是语义翻译层，而不是第二套策略系统。

### 2.1 现在优先使用的结构化线索

本轮之后，`classify_brooks_filter()` 会先看这些结构化字段，再退回到自由文本兜底：

- `market_state`
- `event_tags`
- `planned_trade.candidate_stage / execution_mode / order_type`
- `entry_idea.style / candidate_stage / execution_mode`
- `evaluation.regime / execution_decision`

自由文本仍然保留，但定位已经降级为：

- 兼容旧 cycle / 旧模型输出里的非结构化描述
- 补充 `双底 / 双顶 / 楔形 / MTR / acceptance` 等叙事线索

这意味着 runtime 当前更像：

- 先解释 `S4/S5/S6` 已经写出的结构化语义
- 再用少量文本做兜底

而不是让代码重新发明一套新的 playbook。

---

## 三、当前仍在代码里的高风险判断

这些逻辑虽然已对齐知识文件，但仍主要通过代码启发式产出，后续仍应继续向知识层收口。

### 1. `classify_brooks_filter()` 的剩余启发式判断

当前主要依赖：

- `market_state`
- `event_tags`
- `planned_trade / entry_idea / evaluation` 的结构化字段
- `combined` 文本里对 `双底 / 楔形 / mtr / broad channel / 交易区间 / acceptance` 等词的匹配（兜底）

这使它比之前稳，但剩余风险是：

- 某些 `symbol_update` 文本写法一变，分类可能偏移
- 同一结构可能因表达差异得到不同分类

**后续方向**

- 继续让 `S4/S5/S6` 明确“哪些字段必须出现”
- 尽量用结构化信号代替自由文本关键词
- 把 `planned_trade.source_refs / entry_idea.source_refs / evaluation.source_refs` 作为第一批可审计来源

### 2. `normalize_next_scan_seconds()` 仍然是策略近似层

当前已对齐的主要条件：

- `entry_ready / pre_signal`
- `fresh BC/SC`
- `TR edge`
- `momentum`
- `all watching`
- `positions`

但它仍然是代码分桶，而不是完整原样复刻 `SKILL Step 5`。

**后续方向**

- 继续把 `Step 5` 的优先级和 bucket 来源写回 `SKILL`
- 代码只负责执行 bucket，不扩展新逻辑

### 2.1 当前已经显式落盘的 Step 5 元数据

运行时现在会把 Step 5 的结果写成结构化字段，而不是只留下一个秒数：

- `requested_seconds`
- `model_suggested_seconds`
- `model_suggested_reason`
- `in_seconds`
- `reason_code`
- `reason_text`
- `bucket_rule`
- `bucket_source_refs`

这意味着后续复盘时可以直接回答：

- 模型原本建议多久
- 系统为什么压到这个 bucket
- 这个 bucket 对应 `SKILL/S` 的哪条规则

### 3. `source_refs` 目前还是代码声明，不是自动从 prompt 路由反查

现在 `classify_brooks_filter()` 返回的 `source_refs` 是人为绑定：

- `TR` → `S4 + S6-tr + S5`
- `BC` 顺势/逆势 → `S4 + S6-channel + S5`
- `反转试探` → `S4 + S6-reversal + S5`

这有价值，但还不是真正的“runtime 自动知道自己本轮实际读了哪些 refs”。

**后续方向**

- 让 `source_refs` 尽可能和本轮 prompt 路由联动
- 区分：
  - `rule_source_refs`
  - `loaded_prompt_refs`

### 3.1 当前已落盘的来源字段

本轮之后，这些结构化块都会写出自己的规则来源：

- `planned_trade.source_refs`
- `entry_idea.source_refs`
- `evaluation.source_refs`
- `execution_semantics.stage_rule_source_refs`

这让复盘时可以直接回答：

- 这次升级/不升级主要引用了哪几个 `S4/S5/S6`
- 是 `runtime` 自己在兜底，还是模型/知识层已经给了明确语义

---

## 四、哪些已经不该再由代码决定

这些后续若继续出现代码硬规则，应优先视为偏差：

- 固定的 `P×R` 绝对门槛
- Broad Channel 一刀切成固定 `LIMIT` 或固定 `STOP`
- 第一次反转直接升成 swing executable
- TR 中部仍放行 candidate
- 与 `S5` 不一致的 scalp / swing 分类

---

## 五、当前结论

本轮之后的状态是：

- `runtime` 里仍有策略实现，但已开始被收束为：
  - `Brooks 分类`
  - `执行语义翻译`
  - `状态持久化`
- `derive_trade_execution_semantics()` 已不再靠类别名重复写第二套规则
- 主要剩余风险在：
  - `classify_brooks_filter()` 仍使用不少启发式文本判断
  - `normalize_next_scan_seconds()` 仍是 Step 5 的近似层

下一步应继续做：

1. 审 `classify_brooks_filter()` 中哪些条件能下放回 `S4/S5/S6`
2. 审 `normalize_next_scan_seconds()` 与 `SKILL Step 5` 的差异
3. 让 `source_refs` 和本轮实际加载的 refs 绑定得更紧
