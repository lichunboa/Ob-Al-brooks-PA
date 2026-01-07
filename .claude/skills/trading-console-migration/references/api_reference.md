# Trading Console Migration — Reference Templates

Use these templates to keep each module migration consistent and reviewable.

## Template: Acceptance Criteria (Per Module)

Fill this immediately after reading `scripts/pa-view-<module>.js`.

- **Module:** <name>
- **Legacy file:** `scripts/pa-view-<module>.js`
- **Plugin target:** `.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx` (and any `src/core/*` helpers)

**UI structure**

- [ ] Section headers match legacy order
- [ ] Submodules/cards exist (use placeholder if missing)

**Data & logic**

- [ ] Data sources mapped (what in legacy becomes what in plugin)
- [ ] Priority rules match legacy (Focus → Hybrid → Random, etc.)
- [ ] Fallback rules match legacy

**Commands / integrations**

- [ ] External plugin integration uses capability detection
- [ ] Degrades gracefully when missing

**Verification**

- [ ] `npm run build` passes

## Template: Gap List (Legacy vs Plugin)

- **Already exists in plugin:**
  - <bullet>
- **Missing / incorrect:**
  - <bullet>
- **Out of scope (explicitly):**
  - <bullet>

## Template: Implementation Log (Per Iteration)

- **What changed:** <short>
- **Files changed:**
  - <path>
- **Acceptance items completed:**
  - <bullet>
- **Notes / follow-ups:**
  - <bullet>

## Template: Module Selection Heuristic

Prefer modules that satisfy:

- Has a clear legacy file (`scripts/pa-view-*.js`)
- Can be implemented with weak coupling to mature plugins (Tasks/SRS)
- Minimal new domain models
- High user value / visible UX alignment
