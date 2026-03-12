"""诊断工具子目录共享引导。"""

from __future__ import annotations

import importlib.util
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parents[1]
BOOTSTRAP_PATH = TOOLS_DIR / "_bootstrap.py"
SPEC = importlib.util.spec_from_file_location("tools_root_bootstrap", BOOTSTRAP_PATH)
if SPEC is None or SPEC.loader is None:
    raise ImportError(f"无法加载共享引导: {BOOTSTRAP_PATH}")
TOOLS_BOOTSTRAP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOLS_BOOTSTRAP)

agent_root = TOOLS_BOOTSTRAP.agent_root
ensure_agent_root_on_path = TOOLS_BOOTSTRAP.ensure_agent_root_on_path
ensure_runtime_on_path = TOOLS_BOOTSTRAP.ensure_runtime_on_path

__all__ = [
    "agent_root",
    "ensure_agent_root_on_path",
    "ensure_runtime_on_path",
]
