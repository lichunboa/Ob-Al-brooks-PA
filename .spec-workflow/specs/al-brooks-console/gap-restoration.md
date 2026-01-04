# Gap Restoration & UI Polish Tasks

> Source: `📋 原生插件迁移-功能差距审计（对照 v5.0）.md`
> Goal: Close the gap between legacy Dataview console and native plugin, and fix "sketchy" UI.

## 1. Strategy Repository (Playbook) Restoration
- [ ] **Strategy List View**:
  - Create a new "Strategy Repository" section in `Dashboard.tsx`.
  - Use `StrategyIndex.list()` to render all strategies.
  - Support filtering by Market Cycle, Setup Type, and Status (Active/Learning).
  - UI: Grid of robust Strategy Cards (not just text links).
  - _Requirement: Parity with v5.0 Playbook browse capability._

## 2. Analytics Deep Dive
- [ ] **Context & Error Attribution**:
  - In `src/core/analytics.ts`, add aggregation by `market_cycle` (Context) and `mistake_tags` (Errors).
  - In `Dashboard.tsx`, add new "Environment Analysis" and "Error Distribution" cards/tables.
  - _Requirement: Parity with v5.0 Analytics Hub._

## 3. UI "Premium" Polish
- [ ] **Design System Implementation**:
  - Replace inline `style={{...}}` with proper CSS classes (modify `styles.css`).
  - Implement a "Salesforce / Modern Dashboard" aesthetic (Cards, Shadows, Grid Layout).
  - Fix "Sketchy" look: Consistent padding, typography, hover states, and clear hierarchy.
- [ ] **Localization**:
  - Translate remaining English terms in Gallery/Analytics to Chinese.

## 4. Export Compatibility
- [ ] **Legacy Export Command**:
  - Add a command "Export Legacy Snapshot (pa-db-export.json)" that matches the exact old JSON structure if possible, for external tool compatibility.

## 5. Verification
- [ ] **Visual Comparison**:
  - Compare rendered plugin view side-by-side with user-provided screenshots (manual user step).
