# Design Document

## Overview

本设计文档对应 spec：`al-brooks-console-stabilization`。

目标是修复/固化 `al-brooks-console` 插件的数据底座 P0：

- **目录过滤（反污染）**：默认排除 `Templates/` 等非数据目录，避免“模板被当交易”。
- **日期归一化**：保证 `TradeRecord.dateIso` 始终为有效 `YYYY-MM-DD`。
- **导出命令接线**：补齐“导出索引快照”命令，形成可用的回归对照链路。

> 关于“保证实现功能完全移植到插件中”
>
> - 全量迁移（Trading Hub/Today/Analytics/Gallery/Inspector/Manager/Course/Memory 等）已在既有 spec `.spec-workflow/specs/al-brooks-console/` 中拆成任务 9-20。
> - 本 spec 是**强前置关卡**：只有当索引不被模板污染、日期稳定、快照可导出并可回归对照时，后续模块迁移才能做到“可验证的完全移植”。

## Steering Document Alignment

### Technical Standards (tech.md)

- 保持轻量：不引入重型依赖；使用纯 TS 工具函数实现过滤与日期解析。
- 事件驱动不变：在现有 TradeIndex 扫描/增量更新路径上做常数级开销修复，不增加额外全库扫描。

### Project Structure (structure.md)

- 复用现有插件结构：
  - 平台层：`.obsidian/plugins/al-brooks-console/src/platforms/obsidian/obsidian-trade-index.ts`
  - 导出与快照：`.obsidian/plugins/al-brooks-console/src/main.ts` + `src/core/export-snapshot.ts`
- “是否收录”“dateIso 生成”属于 TradeIndex 的核心职责：UI 只消费 `TradeRecord`，不在 UI 层做兜底。

## Code Reuse Analysis

### Existing Components to Leverage

- **ObsidianTradeIndex**（`.obsidian/plugins/al-brooks-console/src/platforms/obsidian/obsidian-trade-index.ts`）
  - 已存在 folder allowlist 机制，可在其之上增加默认 denylist（Templates/.obsidian/Exports）。
  - 当前 dateIso 兜底为 `file.basename.substring(0, 10)`，需要替换为“可保证 ISO”的实现。
- **导出实现**（`.obsidian/plugins/al-brooks-console/src/main.ts`）
  - 已存在 `exportIndexSnapshot()` 方法，但缺少 `addCommand` 接线。
- **快照 schema**（`.obsidian/plugins/al-brooks-console/src/core/export-snapshot.ts`）
  - 已存在 `ConsoleExportSnapshot` 与 `buildConsoleExportSnapshot()`。

### Integration Points

- **导出目录**：沿用 `Exports/al-brooks-console/`，避免新增路径。
- **回归对照**：利用导出的 JSON 与旧 Dataview 基线数据（或离线脚本导出的 legacy snapshot）进行数值对照。

## Architecture

### 模块划分（最小增量）

不引入新页面/新 UI。只在现有代码中新增/抽取少量纯函数：

1. `shouldIndexFile(path: string): boolean`

- 责任：决定文件是否进入索引（反污染）。
- 默认 denylist 前缀：
  - `Templates/`
  - `.obsidian/`
  - `Exports/`（SHOULD）
- 与已有 allowlist 的关系：
  - 若 allowlist 非空：先按 allowlist 收敛，再按 denylist 排除（denylist 优先级更高）。

2. `normalizeDateIso(args): string`

- 责任：从 frontmatter 或文件名或 ctime/mtime 生成合法 `YYYY-MM-DD`。
- 优先级：
  1. frontmatter `date`（string/Date/number 兼容）
  2. 文件名解析：支持 `YYYY-MM-DD*`、`YYYYMMDD*`、`YYMMDD*`
  3. fallback：ctime（若可用）否则 mtime，以本地日期输出
- 必须保证输出满足 `^\d{4}-\d{2}-\d{2}$`；否则回退到 fallback。

3. `isValidDateIso(iso: string): boolean`

- 责任：验证输出格式与真实日期（例如 2025-02-30 应视为无效）。
- 实现：轻量的字符串检查 + `Date` 校验（注意时区影响，建议用 UTC 构造或手工校验年月日范围）。

### 数据流调整点

- 初始扫描：
  - 在获取 `app.vault.getMarkdownFiles()` 后，先经过 `shouldIndexFile()` 过滤。
  - 解析 trade 时，用 `normalizeDateIso()` 填充 `dateIso`。
- 增量更新：
  - 对 modify/rename：同样应用过滤与日期归一化。

### 导出命令接线

- 在 `onload()` 中新增命令：
  - id: `export-index-snapshot`
  - name: `导出索引快照 (Index Snapshot)`（命名可按现有风格）
  - callback：调用 `exportIndexSnapshot()`
- 区分来源：
  - 插件导出：`pluginVersion` 写真实插件版本（manifest version）
  - 离线脚本导出：保持现有 `dry-run-from-legacy`（或另加字段如 `exportSource`）；本 spec 不要求修改离线脚本，但要求在文档中明确区分规则。

## Components and Interfaces

### TradeIndex 层（ObsidianTradeIndex）

- **Purpose:** 负责扫描/识别 trade、生成稳定 TradeRecord。
- **Interfaces:** 维持现有对外 API，不改 UI 订阅方式。
- **Dependencies:** Obsidian vault/metadataCache。
- **Reuses:** 复用既有 folder allowlist；新增 denylist 与日期解析函数。

### 导出层（main.ts + export-snapshot.ts）

- **Purpose:** 提供可触发命令导出 JSON。
- **Interfaces:** 维持现有 `buildConsoleExportSnapshot()` schema，补齐 command 接线。
- **Dependencies:** app.vault（写文件）、Notice。

## Data Models

沿用现有 `ConsoleExportSnapshot` 与 `TradeRecord`，只强化以下不变量：

- `TradeRecord.dateIso` 永远为 `YYYY-MM-DD`
- `trades` 不包含 `Templates/` 下文件

## Error Handling

### Error Scenarios

1. **frontmatter.date 无法解析**

   - Handling：忽略该字段，进入“文件名解析 →mtime/ctime fallback”。
   - User Impact：不影响索引；可能在调试日志看到 warning（可选）。

2. **文件名为非日期开头（或日期不合法）**

   - Handling：直接 fallback 到 ctime/mtime。
   - User Impact：交易仍可被索引与展示；排序按 fallback 日期。

3. **导出目录创建失败/写入失败**
   - Handling：捕获异常并 Notice 提示失败原因。
   - User Impact：无数据损坏；用户可重试。

## Testing Strategy

### Unit Testing（可选，轻量）

- `normalizeDateIso()`：覆盖 `YYYY-MM-DD` / `YYYYMMDD` / `YYMMDD` / 非法日期 / fallback。
- `shouldIndexFile()`：覆盖 `Templates/`、`.obsidian/`、`Exports/`、普通目录。

### Integration Testing（手工）

- 打开仪表盘，确认：
  - `Templates/单笔交易模版 (Trade Note).md` 不会出现在交易列表/统计。
  - 存在 `YYMMDD_...` 命名交易时，排序/Today 筛选稳定。
  - 命令面板可触发“导出索引快照”，文件落到 `Exports/al-brooks-console/`。

### End-to-End（手工回归）

- 导出插件 snapshot，与 Dataview 基线（或 legacy snapshot）对比关键指标（按 account_type + All）。
