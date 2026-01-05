# Implementation Log: Maintenance 2026-01-05 (Export Alignment)

**Summary:** 对齐导出相关 UX：将“导出索引快照”命令名称明确标注为 JSON；并将“旧版兼容快照”输出路径移动到 `Exports/al-brooks-console/pa-db-export.json`，避免污染 vault 根目录。

**Date:** 2026-01-05

## Verification

- Build gate: `npm run build` ✅

## Files Modified

- `.obsidian/plugins/al-brooks-console/src/main.ts`

## Behavior Changes

- Command name
  - `export-index-snapshot`: 显示名从 `导出索引快照 (Index Snapshot)` 调整为 `导出索引快照 (JSON)`。
- Legacy snapshot path
  - `export-legacy-snapshot` 的输出从 `pa-db-export.json`（vault 根目录）调整为 `Exports/al-brooks-console/pa-db-export.json`。

## Artifacts

### Commands

- `export-index-snapshot`
  - Purpose: 导出索引快照到 `Exports/al-brooks-console/snapshot_*.json`
  - Change: 命令显示名对齐为 JSON

- `export-legacy-snapshot`
  - Purpose: 导出旧版兼容格式（文件名 `pa-db-export.json`）
  - Change: 输出路径迁移到 `Exports/al-brooks-console/` 目录
