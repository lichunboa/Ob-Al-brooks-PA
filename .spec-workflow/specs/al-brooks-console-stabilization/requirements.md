# Requirements Document

## Introduction

本 spec 聚焦修复 `al-brooks-console` 原生插件在迁移期最影响“智能联动”的 P0 数据底座问题：

1) **Templates 污染**：交易模板文件因带 `PA/Trade` 被误识别为真实交易，导致统计/列表/今日筛选被脏数据破坏。
2) **日期解析不稳**：当交易文件名为 `YYMMDD_...` 等格式时，插件生成的 `dateIso` 可能不是有效 ISO 日期（`YYYY-MM-DD`），进而导致排序、聚合、Today/Analytics 逻辑错误。
3) **导出索引快照命令缺失接线**：插件侧已具备快照构建能力，但缺少可触发的命令，导致回归对照链路混乱（容易误把离线脚本导出的 snapshot 当成插件导出）。

本 spec 只做数据底座与回归链路的稳定化，不引入任何新的页面/复杂 UI。

## Alignment with Product Vision

- 对齐 [Product Overview](.spec-workflow/steering/product.md)：迁移期“对照优先”“单一信源”，并确保插件可稳定替代 DataviewJS 控制台的核心数据输出。
- 对齐 [Technology Stack](.spec-workflow/steering/tech.md)：保持轻量、移动端友好；避免引入重型依赖。
- 对齐 [Project Structure](.spec-workflow/steering/structure.md)：索引/解析/统计收敛到 SSOT/平台适配层，避免口径分叉。

## Requirements

### Requirement 1 — 默认排除 Templates 等非数据目录

**User Story:** 作为该 vault 的用户，我希望插件不会把 `Templates/` 下的模板笔记当成真实交易，从而保证交易统计与列表不被污染。

#### Acceptance Criteria

1. WHEN TradeIndex 扫描 vault THEN 系统 SHALL 默认排除路径前缀为 `Templates/` 的 Markdown 文件。
2. WHEN TradeIndex 扫描 vault THEN 系统 SHALL 排除路径前缀为 `.obsidian/` 的 Markdown 文件（防止插件目录/内部文件干扰）。
3. WHEN TradeIndex 扫描 vault THEN 系统 SHOULD 排除路径前缀为 `Exports/` 的 Markdown 文件（避免导出产物干扰索引）。
4. IF 文件位于被排除目录 THEN 系统 SHALL 不把该文件计入 trades、也不出现在任何 trade 列表中。

### Requirement 2 — dateIso 必须总是有效 ISO 日期

**User Story:** 作为用户，我希望每条交易记录都具备可排序/可聚合的 `dateIso(YYYY-MM-DD)`，从而保证 Today/Analytics/排序稳定。

#### Acceptance Criteria

1. WHEN 交易笔记 frontmatter 存在 `date` 且可解析 THEN 系统 SHALL 将其规范化为 `YYYY-MM-DD` 写入 `dateIso`。
2. IF frontmatter `date` 缺失或不可解析 THEN 系统 SHALL 尝试从文件名解析日期，至少支持：
   - `YYYY-MM-DD*`（例如 `2025-12-19_0036.md`）
   - `YYYYMMDD*`（例如 `20251219_0036.md`）
   - `YYMMDD*`（例如 `251219_0036.md`）
3. IF 文件名日期也无法解析 THEN 系统 SHALL 使用文件的 `ctime`（若可用）或 `mtime` 生成 `dateIso`（以本地日期为准）。
4. WHEN TradeRecord 返回给 UI/导出 THEN `dateIso` SHALL 始终满足正则 `^\\d{4}-\\d{2}-\\d{2}$`。

### Requirement 3 — 可触发的“导出索引快照”命令

**User Story:** 作为用户，我希望可以从命令面板触发“导出索引快照”，用于回归对照与调试，而无需依赖离线脚本。

#### Acceptance Criteria

1. WHEN 用户从命令面板执行“导出索引快照” THEN 系统 SHALL 生成一个 JSON 文件写入 `Exports/al-brooks-console/` 目录。
2. WHEN 导出成功 THEN 系统 SHALL 在 Obsidian 中给出明确反馈（Notice 或日志），包含导出文件路径或文件名。
3. WHEN 导出快照生成 THEN 输出 SHALL 包含以下最小字段：
   - `schemaVersion`
   - `exportedAt`（ISO 时间戳）
   - `pluginVersion`
   - `trades`（归一化 TradeRecord 列表）
   - `stats`（按 account_type + All 的聚合结果）
4. WHEN 用户用离线脚本生成 legacy snapshot THEN 该快照 SHALL 与插件导出在字段上可区分（例如 `pluginVersion` 值或额外标记字段），避免误判“是否来自插件”。

### Requirement 4 — 回归对照的最小流程（手工）

**User Story:** 作为用户，我希望有一套最小可重复的手工回归步骤，用来确认修复没有引入新的口径漂移。

#### Acceptance Criteria

1. WHEN 运行插件导出索引快照 THEN 用户 SHALL 能基于同一批样本交易，对比：交易数、净利润、胜率（按 account_type + All）。
2. WHEN `Templates/单笔交易模版 (Trade Note).md` 存在 `PA/Trade` 标签 THEN 插件导出的 trades SHALL 不包含该模板文件。
3. WHEN 存在 `YYMMDD_...` 命名的交易笔记 THEN 插件导出的该 trade 的 `dateIso` SHALL 为合法 ISO 日期并可正确排序。

## Non-Functional Requirements

### Code Architecture and Modularity
- Single Responsibility：日期解析与路径过滤应封装为可复用的纯函数（或最小副作用模块），避免散落在多处。
- 单一信源：TradeIndex 的“是否收录”和“dateIso 生成规则”必须唯一实现，UI 不得自行兜底。

### Performance
- 过滤与日期解析不得引入额外全库扫描；应在现有扫描/增量更新路径上做常数级开销。

### Security
- 本 spec 不引入任何写入用户笔记的行为；仅涉及索引与导出 JSON。

### Reliability
- 单个文件 frontmatter 异常不得导致整个索引构建失败；应跳过并记录可诊断信息。

### Usability
- “导出索引快照”必须可从命令面板直接触发；输出位置固定且可预测。
