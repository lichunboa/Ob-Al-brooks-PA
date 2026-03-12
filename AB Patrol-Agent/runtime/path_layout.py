"""AB Patrol-Agent 目录布局定义。"""

from __future__ import annotations

from pathlib import Path


def data_root(agent_root: Path) -> Path:
    """返回根级数据目录。"""
    return agent_root / "data"


def data_run_dir(agent_root: Path) -> Path:
    """返回运行时 PID、日志和 launchd 包装目录。"""
    return data_root(agent_root) / "run"


def data_reports_dir(agent_root: Path) -> Path:
    """返回统一报告目录。"""
    return data_root(agent_root) / "reports"


def backtest_reports_dir(agent_root: Path) -> Path:
    """返回回测报告目录。"""
    return data_reports_dir(agent_root) / "backtest"
