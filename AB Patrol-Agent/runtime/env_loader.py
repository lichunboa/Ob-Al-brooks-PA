#!/usr/bin/env python3
"""Load AB Patrol-Agent local env files."""

from __future__ import annotations

import os
from pathlib import Path


def load_agent_env(agent_root: Path) -> None:
    """Load agent-local .env files once without overriding existing env vars."""
    if os.environ.get("AB_PATROL_ENV_LOADED") == "1":
        return
    candidates = [
        agent_root / "config" / ".env",
        agent_root / ".env",
    ]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)
    os.environ["AB_PATROL_ENV_LOADED"] = "1"
