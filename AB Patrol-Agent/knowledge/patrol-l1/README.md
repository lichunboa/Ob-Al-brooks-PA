# patrol-l1 Knowledge Loading

## 当前权威文件

- 完整 skill: `AB Patrol-Agent/knowledge/patrol-l1/SKILL.md`
- 完整 S 文件目录: `AB Patrol-Agent/knowledge/patrol-l1/references/`

这两处是当前 Al Brooks patrol 的完整权威知识副本，对应原始来源：

- 原始 skill: `.claude/skills/patrol-l1/SKILL.md`
- 原始 S 文件目录: `.claude/skills/patrol-l1/references/`

## 运行时实际读取关系

`AB Patrol-Agent/runtime/pa_runtime.py` 在每轮决策里按以下规则读取知识：

1. **只读原始权威文件**
   - `SKILL.md` 只从完整原文读取
   - `references/*.md` 只从完整原文读取
   - 不再使用 `runtime-brief` 或其它摘要版知识文件

2. **按状态选择原文，不压缩知识**
   - `SKILL.md` 会按章节切块后按状态加载，避免每轮整份全文硬塞
   - 会根据 `phase / quick_scan_events / 持仓状态 / pre_signal / entry_ready` 选择需要的完整 S 文件
   - 这是“选择原文”，不是“摘要原文”

3. **优化点在流程，不在删知识**
   - 通过状态路由、事件路由、推送节流和 prompt 结构优化来降低超时
   - 不通过删减 `SKILL.md` 或 `S` 文件知识量来换稳定性

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

## 如何核对当前这一轮到底读了什么

- 最新 prompt: `AB Patrol-Agent/data/pa_trader/logs/decision/last_request.md`
- 最新模型响应: `AB Patrol-Agent/data/pa_trader/logs/decision/last_response.json`
- 最新结构化决策: `AB Patrol-Agent/data/pa_trader/logs/decision/last_decision.json`

## 当前没有做的事

- 没有删除完整 `SKILL.md` 和完整 `references/`
- 没有把 patrol 改成只靠一个简化 prompt 自由发挥
- 没有跳过 S 文件路由

## 当前做了的取舍

- 运行时不会无条件把 `完整 SKILL.md + 全部 S 文件全文` 整包塞进每一轮
- 现在改成：
  - **按状态和事件选择完整原文**
  - **不使用摘要版知识文件**
- phase 选择、S 文件路由、事件触发、读盘约束仍由原 patrol-l1 逻辑决定
