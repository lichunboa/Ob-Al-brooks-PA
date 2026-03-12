#!/usr/bin/env python3
"""加载 AB Patrol-Agent 本地环境变量。"""

from __future__ import annotations

import os
from pathlib import Path


def load_agent_env(agent_root: Path) -> None:
    """按项目本地 `.env` 覆盖式加载环境变量。"""
    if os.environ.get("AB_PATROL_ENV_LOADED") == "1":
        return
    respect_existing = os.environ.get("AB_PATROL_RESPECT_EXISTING_ENV", "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
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
            if respect_existing and os.environ.get(key, "").strip() != "":
                continue
            os.environ[key] = value
    os.environ["AB_PATROL_ENV_LOADED"] = "1"
