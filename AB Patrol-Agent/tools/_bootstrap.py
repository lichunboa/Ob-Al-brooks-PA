"""工具脚本共享引导。"""

from __future__ import annotations

import sys
from pathlib import Path


def agent_root() -> Path:
    """返回 AB Patrol-Agent 根目录。"""
    return Path(__file__).resolve().parents[1]


def ensure_agent_root_on_path() -> Path:
    """确保项目根目录在导入路径中。"""
    root = agent_root()
    root_text = str(root)
    if root_text not in sys.path:
        sys.path.insert(0, root_text)
    return root


def ensure_runtime_on_path() -> Path:
    """兼容仍需直接导入 runtime 模块名的脚本。"""
    root = ensure_agent_root_on_path()
    runtime_dir = root / "runtime"
    runtime_text = str(runtime_dir)
    if runtime_text not in sys.path:
        sys.path.insert(0, runtime_text)
    return runtime_dir
