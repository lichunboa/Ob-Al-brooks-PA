"""
信号检测引擎
"""

from __future__ import annotations

from .base import BaseEngine, Signal
from .pg_engine import PGSignal, PGSignalEngine, get_pg_engine


def get_sqlite_engine():
    from .sqlite_engine import get_sqlite_engine as _get_sqlite_engine

    return _get_sqlite_engine()


def __getattr__(name: str):
    if name == "SQLiteSignalEngine":
        from .sqlite_engine import SQLiteSignalEngine

        return SQLiteSignalEngine
    raise AttributeError(name)

__all__ = [
    "BaseEngine",
    "Signal",
    "PGSignalEngine",
    "PGSignal",
    "get_pg_engine",
    "SQLiteSignalEngine",
    "get_sqlite_engine",
]
