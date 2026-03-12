"""信号检测引擎导出。

默认活跃路径只暴露 Brooks / PA 引擎。
旧 PG 规则引擎仍保留作 legacy 兼容，但不再作为默认入口。
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


def get_pg_engine():
    """获取 legacy PG 规则引擎。"""
    from .pg_engine import get_pg_engine as _get_pg_engine

    return _get_pg_engine()


def get_sqlite_engine():
    from .sqlite_engine import get_sqlite_engine as _get_sqlite_engine

    return _get_sqlite_engine()


def __getattr__(name: str):
    if name == "PASignalEngine":
        from .pa_engine import PASignalEngine

        return PASignalEngine
    if name == "PGSignalEngine":
        from .pg_engine import PGSignalEngine

        return PGSignalEngine
    if name == "PGSignal":
        from .pg_engine import PGSignal

        return PGSignal
    if name == "SQLiteSignalEngine":
        from .sqlite_engine import SQLiteSignalEngine

        return SQLiteSignalEngine
    raise AttributeError(name)

__all__ = [
    "BaseEngine",
    "Signal",
    "PASignalEngine",
    "get_pa_engine",
    "get_default_engine",
    "PGSignalEngine",
    "PGSignal",
    "get_pg_engine",
    "SQLiteSignalEngine",
    "get_sqlite_engine",
]
