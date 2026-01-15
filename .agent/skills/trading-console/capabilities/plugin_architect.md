# Capability: Native Plugin Architect (al-brooks-console)

## Purpose
Define a clear, testable architecture for migrating the DataviewJS-based Trader Command console into a native Obsidian plugin (`al-brooks-console`) while preserving parity with the Dataview baseline during migration.

This capability is used when:
- translating repo reality into plugin modules and data contracts
- turning the spec (`.spec-workflow/specs/al-brooks-console/*`) into interfaces, boundaries, and acceptance checks
- making migration-safe decisions (no big rewrites, no hidden scope)

## Non-goals
- implementing UI polish or new UX beyond what’s in the spec
- reformatting/refactoring the existing Dataview scripts unless explicitly requested
- removing Dataview baseline during MVP

## Inputs
- Spec docs:
  - `.spec-workflow/specs/al-brooks-console/requirements.md`
  - `.spec-workflow/specs/al-brooks-console/design.md`
  - `.spec-workflow/specs/al-brooks-console/tasks.md`
- Current Dataview console entry and engine:
  - `🦁 交易员控制台 (Trader Command)5.0.md`
  - `scripts/pa-config.js`
  - `scripts/pa-core.js`
  - `scripts/pa-view-*.js`

## Outputs
- A concrete module map for the native plugin (file/module responsibilities)
- A stable data contract for `Trade`, `Stats`, and derived indexes
- A field-mapping strategy (bilingual keys; pnl-first winrate policy)
- An event-driven incremental indexing plan using Obsidian native APIs
- A parity/acceptance checklist against the Dataview baseline

## Architecture Checklist (project-specific)
### Data boundaries
- Define a canonical `Trade` model with:
  - unique id strategy (path + heading? frontmatter id?)
  - timestamps (created/modified) when available
  - core fields used by the console today (ticker, tf, dir, setup, market_cycle, outcome, pnl/net_profit)
- Define `FieldMapper` policy:
  - prefer numeric pnl from `净利润/net_profit` (and any existing aliases)
  - fall back to `outcome` parsing only when pnl is absent
  - always preserve raw source values for diagnostics

### Indexing boundaries
- Define a `TradeIndex` that supports:
  - full scan rebuild
  - incremental updates for modify/rename/delete
  - deterministic ordering (asc/desc) and stable sort keys
- Define `Stats` that match spec’s win-rate rule:
  - win-rate is based on pnl > 0 when pnl exists
  - outcome-based win-rate is secondary (explicitly labeled)

### Event model (native Obsidian)
- Use vault events to cover:
  - modify (content/frontmatter changed)
  - rename (path changes)
  - delete
- Use metadata cache events to cover:
  - frontmatter changes becoming available after parse
- Ensure debounced updates and backpressure:
  - coalesce bursts; avoid rebuilding everything on every keystroke

### Parity (migration safety)
- Keep Dataview baseline as the reference until parity is verified.
- Add a parity checklist for:
  - trade count
  - pnl totals / averages
  - win-rate (pnl-first)
  - key groupings (ticker/tf/setup/market_cycle/strategy/dir)

## Review Questions (ask user when ambiguous)
- Canonical trade identity: do we already have a stable ID field, or should we use file path as identity?
- What is the authoritative tag for trades beyond `#PA/Trade` (any aliases)?
- Any mandatory folders to include/exclude in scanning?

## “Good defaults” for this vault
- Treat `#PA/Trade` as the primary selector.
- Prefer incremental indexing; full rebuild only on startup or explicit refresh.
- Preserve the old Dataview console for A/B and regression checks.
