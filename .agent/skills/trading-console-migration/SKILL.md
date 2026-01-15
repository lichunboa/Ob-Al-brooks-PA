---
name: trading-console-migration
description: This skill should be used when migrating the “🦁 交易员控制台 v5.0 (DataviewJS)” into the native Obsidian plugin console, keeping UX layout aligned to v5.0 while incrementally porting modules (one by one) with strict acceptance criteria, no feature deletion, and build verification.
---

# Trading Console Migration

## Overview

Execute the repeatable workflow for migrating legacy DataviewJS console modules (scripts/pa-view-\*.js) into the native Obsidian plugin dashboard (React/TypeScript) without deleting existing functionality.

Maintain v5.0 module order, preserve existing plugin capabilities, fill missing pieces with placeholders first, then port module logic incrementally with build verification.

## Scope & Non-Negotiables

- Preserve functionality: Do not remove existing plugin features.
- Preserve UX contract: Implement exactly the UX described in legacy module logic; do not invent new pages/modals/filters.
- Migrate one module at a time: Always analyze the legacy script before implementing.
- Prefer mature ecosystem plugins when possible (e.g., Tasks, SRS): Integrate via weak coupling/capability detection.
- Keep changes minimal: Make the smallest change set needed per module; verify build each iteration.

## Repository Orientation (Expected Paths)

- Legacy console scripts: `scripts/pa-view-*.js`
- Plugin source (Obsidian native plugin): `.obsidian/plugins/al-brooks-console/src/`
- Dashboard entry: `.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx`
- Build command: `cd .obsidian/plugins/al-brooks-console && npm run build`

## Workflow (Module-by-Module)

### Step 0 — Confirm Target Module

- Identify the next missing/placeholder module in the Dashboard.
- Select a single module to migrate next (e.g., Schema, Inspector, Gallery, Cycle, Trend, Strategy, Manager).

### Step 1 — Read Legacy Script (Source of Truth)

- Open the corresponding legacy file in `scripts/` (e.g., `scripts/pa-view-schema.js`).
- Extract a strict list of:
  - UI sections (headers/cards/submodules)
  - Data sources (window.paData fields, indices, tag rules)
  - Decision logic (priority rules, fallback rules)
  - Commands/entry points (QuickAdd/Tasks/SRS/dataview refresh)

Output (required): a short “Acceptance Criteria” checklist for the module.

### Step 2 — Inventory Plugin State

- Locate the current plugin implementation (usually in `Dashboard.tsx` plus `src/core/*` and `src/platforms/obsidian/*`).
- Identify what already exists:
  - UI already rendered
  - Data already indexed
  - Integrations already wired (capabilities)
  - Existing placeholders

Output (required): a “Gap List” of missing behaviors vs legacy.

### Step 3 — Choose Implementation Strategy (Prefer Integration)

- If a legacy feature is primarily “render a query block” (e.g., Tasks):
  - Render the block and let the external plugin handle parsing/rendering.
  - Detect capability/command presence and degrade gracefully.
- If a legacy feature is computation-heavy and already in core snapshot code:
  - Extend snapshot types minimally and reuse in Dashboard.

### Step 4 — Implement Incrementally

- Implement the smallest vertical slice that satisfies one acceptance bullet.
- Avoid unrelated refactors.
- Keep UI within the existing Dashboard sections (no new pages).

### Step 5 — Verify Build Every Iteration

- Run `npm run build` from the plugin directory.
- Fix only errors introduced by the change.

### Step 6 — Record What Changed

- Update the running migration notes (if present in the repo) OR summarize:
  - What was added/changed
  - Which files
  - Which acceptance criteria are now met

## Output Formats (Reusable Templates)

Load the reference templates in `references/api_reference.md` when needed:

- Acceptance Criteria template
- Gap List template
- “One-module migration plan” checklist

## Common Patterns & Gotchas

- Capability-based integration:
  - Use the plugin’s integration registry and `can()/action()` pattern.
  - Always render core UI even when integration is missing; only show a hint message.
- TypeScript “unknown” leaks:
  - Convert unknown data to `String(...)` at boundaries (rendering and openFile calls).
- Keep legacy semantics:
  - Match labels/priority rules/fallback rules exactly unless explicitly changed.

## Quick Start (Typical Session)

- Find placeholder text or missing cards in Dashboard.
- Pick one module.
- Read `scripts/pa-view-<module>.js` and write acceptance bullets.
- Implement one bullet at a time.
- Run build.

## Resources

- `references/api_reference.md`: Migration templates & checklists
- `scripts/example.py`: Helper to generate a per-module migration checklist

## Structuring This Skill

[TODO: Choose the structure that best fits this skill's purpose. Common patterns:

**1. Workflow-Based** (best for sequential processes)

- Works well when there are clear step-by-step procedures
- Example: DOCX skill with "Workflow Decision Tree" → "Reading" → "Creating" → "Editing"
- Structure: ## Overview → ## Workflow Decision Tree → ## Step 1 → ## Step 2...

**2. Task-Based** (best for tool collections)

- Works well when the skill offers different operations/capabilities
- Example: PDF skill with "Quick Start" → "Merge PDFs" → "Split PDFs" → "Extract Text"
- Structure: ## Overview → ## Quick Start → ## Task Category 1 → ## Task Category 2...

**3. Reference/Guidelines** (best for standards or specifications)

- Works well for brand guidelines, coding standards, or requirements
- Example: Brand styling with "Brand Guidelines" → "Colors" → "Typography" → "Features"
- Structure: ## Overview → ## Guidelines → ## Specifications → ## Usage...

**4. Capabilities-Based** (best for integrated systems)

- Works well when the skill provides multiple interrelated features
- Example: Product Management with "Core Capabilities" → numbered capability list
- Structure: ## Overview → ## Core Capabilities → ### 1. Feature → ### 2. Feature...

Patterns can be mixed and matched as needed. Most skills combine patterns (e.g., start with task-based, add workflow for complex operations).

Delete this entire "Structuring This Skill" section when done - it's just guidance.]

## [TODO: Replace with the first main section based on chosen structure]

[TODO: Add content here. See examples in existing skills:

- Code samples for technical skills
- Decision trees for complex workflows
- Concrete examples with realistic user requests
- References to scripts/templates/references as needed]

## Resources

This skill includes example resource directories that demonstrate how to organize different types of bundled resources:

### scripts/

Executable code (Python/Bash/etc.) that can be run directly to perform specific operations.

**Examples from other skills:**

- PDF skill: `fill_fillable_fields.py`, `extract_form_field_info.py` - utilities for PDF manipulation
- DOCX skill: `document.py`, `utilities.py` - Python modules for document processing

**Appropriate for:** Python scripts, shell scripts, or any executable code that performs automation, data processing, or specific operations.

**Note:** Scripts may be executed without loading into context, but can still be read by Claude for patching or environment adjustments.

### references/

Documentation and reference material intended to be loaded into context to inform Claude's process and thinking.

**Examples from other skills:**

- Product management: `communication.md`, `context_building.md` - detailed workflow guides
- BigQuery: API reference documentation and query examples
- Finance: Schema documentation, company policies

**Appropriate for:** In-depth documentation, API references, database schemas, comprehensive guides, or any detailed information that Claude should reference while working.

### assets/

Files not intended to be loaded into context, but rather used within the output Claude produces.

**Examples from other skills:**

- Brand styling: PowerPoint template files (.pptx), logo files
- Frontend builder: HTML/React boilerplate project directories
- Typography: Font files (.ttf, .woff2)

**Appropriate for:** Templates, boilerplate code, document templates, images, icons, fonts, or any files meant to be copied or used in the final output.

---

**Any unneeded directories can be deleted.** Not every skill requires all three types of resources.
