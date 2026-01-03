# Tasks Document

> 目标：完成 P0 数据底座稳定化，为“功能完全移植到插件”提供可验证的基础。
>
> 说明：全量功能迁移的主任务列表在 `.spec-workflow/specs/al-brooks-console/tasks.md`（任务 9-20）。本 spec 只做前置的稳定化与回归链路。

- [ ] 1. TradeIndex：默认目录 denylist（排除 Templates/.obsidian/Exports）
  - Files:
    - `.obsidian/plugins/al-brooks-console/src/platforms/obsidian/obsidian-trade-index.ts`
  - Implement:
    - 新增/抽取 `shouldIndexFile(path: string): boolean`（或等价实现），默认排除：`Templates/`、`.obsidian/`、`Exports/`。
    - 与现有 folder allowlist 组合：allowlist 先收敛、denylist 再排除（denylist 优先）。
  - _Leverage: 现有 `folderAllowlistNormalized` 与初始扫描过滤逻辑（grep 已定位在 obsidian-trade-index.ts 中）。_
  - _Requirements: Requirement 1_
  - _Prompt: Implement the task for spec al-brooks-console-stabilization, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Obsidian indexing engineer | Task: Add a default denylist filter to TradeIndex so Templates/.obsidian/Exports notes cannot be indexed as trades; integrate with the existing folder allowlist without changing UI. | Restrictions: No new settings UI; no extra scans; do not change trade identification rules other than excluding paths. | Success: Template trade note is never included; normal trades unaffected; performance unchanged._
  - Implementation workflow:
    - Before coding: search existing implementation logs for similar filters.
    - Mark this task `[-]` when starting; after finishing, log implementation with `log-implementation`; then mark `[x]`.

- [ ] 2. TradeIndex：dateIso 归一化（frontmatter → filename → ctime/mtime）
  - Files:
    - `.obsidian/plugins/al-brooks-console/src/platforms/obsidian/obsidian-trade-index.ts`
    - (Optional) `.obsidian/plugins/al-brooks-console/src/core/contracts.ts`（仅当需要强化类型/注释）
  - Implement:
    - 替换当前 `file.basename.substring(0, 10)` 兜底为 `normalizeDateIso()`（或等价函数）。
    - 支持文件名：`YYYY-MM-DD*` / `YYYYMMDD*` / `YYMMDD*`。
    - 若无法解析则 fallback 到 ctime（优先）或 mtime，输出本地 `YYYY-MM-DD`。
    - 保证任何导出/返回的 `dateIso` 满足 `^\\d{4}-\\d{2}-\\d{2}$` 且为有效日期。
  - _Leverage: 已存在 `toLocalDateIso()`（today-context/useDashboardData），可复用或复制为共用函数；但不得在 UI 层兜底，必须在 TradeIndex 层保证不变量。_
  - _Requirements: Requirement 2_
  - _Prompt: Implement the task for spec al-brooks-console-stabilization, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Data correctness engineer | Task: Guarantee TradeRecord.dateIso is always valid YYYY-MM-DD by normalizing from frontmatter date, then filename patterns (YYYY-MM-DD, YYYYMMDD, YYMMDD), else fallback to ctime/mtime. | Restrictions: Do not change analytics/today logic; fix at source (TradeIndex). No heavy date libraries. | Success: YYMMDD-named trades sort correctly; no invalid dateIso strings in snapshot/trade list._

- [ ] 3. 导出：注册“导出索引快照”命令并区分来源
  - Files:
    - `.obsidian/plugins/al-brooks-console/src/main.ts`
    - `.obsidian/plugins/al-brooks-console/src/core/export-snapshot.ts`（仅当需要补充字段或文档）
  - Implement:
    - 在 `onload()` 中新增 `addCommand`：`export-index-snapshot` → 调用现有 `exportIndexSnapshot()`。
    - 导出路径固定为 `Exports/al-brooks-console/`。
    - 确保导出 JSON 包含：`schemaVersion`、`exportedAt`、`pluginVersion`、`trades`、`stats`。
    - 文档化“离线脚本快照 vs 插件快照”的区分方法（至少通过 `pluginVersion` 值区分）。
  - _Leverage: main.ts 已存在 exportIndexSnapshot() 方法与导出目录创建逻辑。_
  - _Requirements: Requirement 3_
  - _Prompt: Implement the task for spec al-brooks-console-stabilization, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: Obsidian plugin engineer | Task: Wire up an export-index-snapshot command to the existing exportIndexSnapshot() method, ensuring stable output location and minimal fields for regression. | Restrictions: No new UI beyond command palette; must not modify notes; keep file name stable/predictable. | Success: Command appears and creates a snapshot JSON under Exports/al-brooks-console with correct metadata and content._

- [ ] 4. 回归：最小手工对照清单（P0 专用）
  - Files:
    - `.spec-workflow/specs/al-brooks-console-stabilization/requirements.md`（可附加一段“Manual Regression Checklist”）
    - 或新建：`.spec-workflow/specs/al-brooks-console-stabilization/regression-checklist.md`
  - Implement:
    - 给出 5-10 条可重复步骤：验证模板不被收录、YYMMDD 日期有效、导出命令可用、关键指标可对照。
  - _Leverage: 现有 `plugin_debug_log.md` 与 legacy Dataview 控制台作为对照基线。_
  - _Requirements: Requirement 4_
  - _Prompt: Implement the task for spec al-brooks-console-stabilization, first run spec-workflow-guide to get the workflow guide then implement the task: | Role: QA engineer | Task: Write a minimal manual regression checklist focused on P0 stabilization items (template exclusion, dateIso validity, export command, stats parity). | Restrictions: Keep it short and actionable; no automation. | Success: A user can follow the checklist and validate the stabilization in <10 minutes._

## 执行顺序建议

- 先做 1（反污染）→ 再做 2（日期归一）→ 再做 3（导出命令）→ 最后做 4（回归清单）。

## 与“完全移植”的关系

- 当本 spec 完成并通过回归后，即可继续执行 `.spec-workflow/specs/al-brooks-console/tasks.md` 的迁移任务 9-20，逐模块做到功能对齐，并用导出快照持续做回归对照。
