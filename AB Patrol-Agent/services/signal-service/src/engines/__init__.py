"""信号检测引擎导出。

默认活跃路径只暴露 Brooks / PA 引擎。
"""

from __future__ import annotations

from .base import BaseEngine, Signal


def get_pa_engine(symbols: list[str] | None = None):
    """获取默认的 Brooks / PA 引擎。"""
    from .pa_engine import get_pa_engine as _get_pa_engine

    return _get_pa_engine(symbols=symbols)


def get_default_engine(symbols: list[str] | None = None):
    """默认返回 Brooks / PA 主引擎。"""
    return get_pa_engine(symbols=symbols)


def __getattr__(name: str):
    if name == "PASignalEngine":
        from .pa_engine import PASignalEngine

        return PASignalEngine
    raise AttributeError(name)

__all__ = [
    "BaseEngine",
    "Signal",
    "PASignalEngine",
    "get_pa_engine",
    "get_default_engine",
]
