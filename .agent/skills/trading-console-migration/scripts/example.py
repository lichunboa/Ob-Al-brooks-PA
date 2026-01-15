#!/usr/bin/env python3
"""trading-console-migration checklist generator.

Print a per-module markdown checklist aligned to the migration workflow.

Usage:
  python3 scripts/example.py schema
  python3 scripts/example.py inspector
"""

from __future__ import annotations

import sys


def main(argv: list[str]) -> int:
    if len(argv) < 2 or argv[1].strip() in {"-h", "--help"}:
        print(
            "Usage: python3 scripts/example.py <module>\n"
            "Example: python3 scripts/example.py schema"
        )
        return 2

    module = argv[1].strip()
    legacy = f"scripts/pa-view-{module}.js"
    print(f"# Module Migration Checklist — {module}\n")
    print(f"- Legacy: `{legacy}`")
    print(
        "- Target: `.obsidian/plugins/al-brooks-console/src/views/Dashboard.tsx`\n"
    )

    print("## Acceptance Criteria")
    print("- [ ] UI structure matches legacy")
    print("- [ ] Data & decision rules match legacy")
    print("- [ ] Fallback behavior matches legacy")
    print("- [ ] Integrations use capability detection")
    print("- [ ] No existing plugin functionality removed")
    print("- [ ] `npm run build` passes\n")

    print("## Implementation Steps")
    print(f"- [ ] Read `{legacy}` and extract behaviors")
    print("- [ ] Inventory current plugin implementation")
    print("- [ ] Implement smallest vertical slice")
    print("- [ ] Verify build")
    print("- [ ] Log changes & update gap list")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
