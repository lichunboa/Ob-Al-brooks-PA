# patrol-l1 Knowledge Loading

## 文件分工（优化后的固定边界）

- `SKILL.md`
  - 只负责目录、流程编排、阶段切换、Step 0-5、路由策略
  - 不应该继续堆积大量交易理论原文
  - 不应该继续堆积命令、端口、API 与旧 Claude 运行说明
  - 任何具体交易规则，优先放到 `S` 或 `C`

- `references/S*.md`
  - 负责可执行交易规则与 playbook
  - `S0-S3b` 是读盘与状态层
  - `S4-S6` 是候选/入场层
  - `S7` 是持仓管理层
  - `S4` 不再承载日志格式、Quick Scan 路由实现、管理细则
  - `S4` 也不再承载 Daily 叠加、Scalp/Swing 最终评估，这些统一回到 `S2/S5`
  - 每个关键 `S` 文件顶部都会显式标注“文件职责与边界”，用于后续维护时快速判断内容该放哪

- `canonical/C*.md`
  - 负责完整 Al Brooks 理论的规范层
  - 来源是 `AB Console-Obsidian` 知识库
  - 用于约束 `SKILL/S`，不允许代码偷偷发明新交易理论

- `references/quotes/Q*.md`
  - 负责短句锚点、纪律修正、反犹豫、反完美主义、管理提醒
  - 不是独立交易系统
  - 只在需要时随 `S` 一起路由加载，用来纠正 agent 的行为偏差

## 当前权威文件

- 规范层 canonical：`AB Patrol-Agent/knowledge/patrol-l1/canonical/`
- 完整 skill: `AB Patrol-Agent/knowledge/patrol-l1/SKILL.md`
- 完整 S 文件目录: `AB Patrol-Agent/knowledge/patrol-l1/references/`
- 运行维护说明：`AB Patrol-Agent/docs/SKILL_RUNTIME_REFERENCE_20260309.md`
- `S0-S7 -> C/Q/运行说明` 迁移映射：`AB Patrol-Agent/docs/S0_S7_RUNTIME_MAP_20260309.md`
- runtime 策略实现审计：`AB Patrol-Agent/docs/RUNTIME_STRATEGY_AUDIT_20260309.md`
- 知识入口索引：`AB Patrol-Agent/knowledge/patrol-l1/KNOWLEDGE_INDEX_20260309.md`

这两处是当前 Al Brooks patrol 的完整权威知识副本，对应原始来源：

- 原始 skill: `.claude/skills/patrol-l1/SKILL.md`
- 原始 S 文件目录: `.claude/skills/patrol-l1/references/`

## 运行时实际读取关系

`AB Patrol-Agent/runtime/pa_runtime.py` 在每轮决策里按以下规则读取知识：

1. **分层读取权威文件**
   - `canonical/*.md`：完整 Obsidian Al Brooks 知识库的规范层
   - `SKILL.md`：流程编排与阶段切换
   - `references/S*.md`：S0-S7 可执行子集
   - `references/quotes/Q*.md`：短句锚点与纪律修正
   - 不再使用 `runtime-brief` 或其它摘要版知识文件

2. **按状态选择原文，不压缩知识**
- `SKILL.md` 会按章节切块后按状态加载，避免每轮整份全文硬塞
- 会根据 `phase / quick_scan_events / 持仓状态 / pre_signal / entry_ready` 选择需要的 canonical + S 文件
- 这是“选择原文”，不是“摘要原文”
- 命令/API/端口说明已从 `SKILL` 移出，不再进入决策 prompt
- `SKILL` 只作为流程编排层；运行维护说明不再进入 prompt

3. **优化点在流程，不在删知识**
   - 通过状态路由、事件路由、推送节流和 prompt 结构优化来降低超时
   - 不通过删减 `canonical / SKILL / S` 文件知识量来换稳定性

## 规范层与可执行层的关系

- **最高理论 authority**：
  - `AB Console-Obsidian/Categories 分类/Al brooks`
- **规范层（C）**：
  - `canonical/*.md`
- **可执行层（S）**：
  - `SKILL.md`
  - `references/S0-S7`
- **纪律锚点层（Q）**：
  - `references/quotes/Q1-Q6`

运行时应优先服从 canonical 里的理论原则；`SKILL/S/Q` 是面向 agent 的可执行语言，不应与 canonical 冲突。

## `SKILL.md` 章节路由

运行时会按当前状态选取 `SKILL.md` 原文章节，例如：

- 全刷新：
  - `Step 0 / 0b / 1`
  - `强制全刷新`
- 无持仓扫描：
  - `Step 3`
  - `Step 4`
  - `Step 5`
  - `防懒惰机制`
- 有持仓：
  - `Step 2`
  - `Step 4`
  - `Step 5`
- 临近入场：
  - `Phase B`
  - `3d / 3e / 3f`

最新一轮实际加载到哪些 `SKILL.md` 章节，可直接看：

- `AB Patrol-Agent/data/pa_trader/logs/decision/last_request.md`
- `AB Patrol-Agent/data/pa_trader/logs/decision/last_decision.json`

## 什么时候会选哪些 S 文件

- `BOOTSTRAP`: `S0 S1 S2 S3 S3b S4 S5 S6-common + 对应 S6-* + S7`
- `SCAN`: `S2 S3 S3b S4 S5 + 对应 S6-*`
- `ENTRY_READY`: `S2 S3 S3b S4 S5 S6-common + 对应 S6-* + S7`
- `MANAGE`: `S2 S3b S5 S6-common S7`

## 什么时候会选哪些 Q 文件

- `Q1-context`
  - 读盘、方向、市场状态、关键位相关轮次
- `Q2-direction`
  - 顺势/逆势方向选择、playbook 路由轮次
- `Q3-fear`
  - 候选单犹豫、反完美主义、该做而不敢做的场景
- `Q4-entry`
  - 入场、signal bar、是否升级成 candidate / executable
- `Q5-te`
  - Trader's Equation、Scalp vs Swing、P/R 审核
- `Q6-management`
  - 持仓管理、止损移动、部分止盈、重新入场

## 如何核对当前这一轮到底读了什么

- 最新 prompt: `AB Patrol-Agent/data/pa_trader/logs/decision/last_request.md`
- 最新模型响应: `AB Patrol-Agent/data/pa_trader/logs/decision/last_response.json`
- 最新结构化决策: `AB Patrol-Agent/data/pa_trader/logs/decision/last_decision.json`

## 当前没有做的事

- 没有把 canonical 知识简化成另一套经验阈值
- 没有删除完整 `SKILL.md` 和完整 `references/`
- 没有把 patrol 改成只靠一个简化 prompt 自由发挥
- 没有跳过 S 文件路由

## 当前做了的取舍

- 运行时不会无条件把 `完整 SKILL.md + 全部 S 文件全文` 整包塞进每一轮
- 现在改成：
  - **按状态和事件选择完整原文**
  - **不使用摘要版知识文件**
- phase 选择、S 文件路由、事件触发、读盘约束仍由原 patrol-l1 逻辑决定
