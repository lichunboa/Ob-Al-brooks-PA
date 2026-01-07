# Capability: Native Plugin Implementer (al-brooks-console)

## Purpose
Implement the native Obsidian plugin (`al-brooks-console`) in small, verifiable steps that preserve Dataview baseline parity during migration.

This capability is used when:
- scaffolding the plugin project
- implementing indexing + field mapping + incremental updates
- rendering the MVP dashboard (stats + trade list)
- adding regression checks and export/diagnostics where required by the spec

## Guardrails
- Do not remove or rewrite the Dataview baseline unless explicitly approved.
- Do not invent new UX features beyond spec.
- Changes must be measurable: each step should have an acceptance check.

## Implementation Strategy (stepwise)
### 1) Scaffold plugin (minimal)
- Create plugin skeleton with:
  - `ConsolePlugin` entry
  - `DashboardView` (ItemView) mounting React
  - settings only if required by spec

### 2) Data layer: Scan + parse
- Implement `TradeScanner`:
  - query files by tag `#PA/Trade` (and any spec-approved alternatives)
  - parse frontmatter and/or inline fields as required
- Implement `FieldMapper`:
  - parse pnl as number from `净利润/net_profit` first
  - keep a `source` map for debugging (raw frontmatter values)

### 3) Index + stats
- Implement `TradeIndex`:
  - deterministic ordering
  - key aggregations matching Dataview-derived `buildTradeIndex`
- Implement `Stats`:
  - win-rate based on pnl>0 when pnl exists
  - outcome-based as fallback/secondary

### 4) Incremental updates
- Hook Obsidian events:
  - `vault.on('modify'|'rename'|'delete')`
  - `metadataCache.on('changed')`
- Debounce + coalesce updates.
- Update affected trade(s) and recompute derived aggregates.

### 5) MVP UI
- Render:
  - headline stats cards
  - trade list
- Provide an explicit “Rebuild index” action (only if spec allows).

## Acceptance Checklist (per PR / per task)
- Trade count matches Dataview baseline for same selector.
- PnL totals and win-rate match the spec rule (pnl-first).
- Rename/delete updates are reflected without restart.
- No runaway refresh loops; CPU remains stable on frequent edits.

## Debug/Diagnostics
- Include optional debug logging hooks (dev-only) for:
  - event bursts
  - index rebuild duration
  - parse failures / missing required fields

## When blocked (what to ask)
- If trade identification rules are unclear: confirm the exact tag(s), folder scope, and canonical trade id policy.
- If win-rate diverges: confirm whether pnl is authoritative and whether outcome strings need normalization.
