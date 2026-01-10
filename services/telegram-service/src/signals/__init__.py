"""
信号检测系统
"""
from .rules import ALL_RULES, RULES_BY_TABLE, RULES_BY_CATEGORY, SignalRule, ConditionType, RULE_COUNT, TABLE_COUNT
from .engine_v2 import SignalEngine, Signal, get_engine
from .pusher_v2 import SignalPusher, init_pusher, start_signal_loop
from .formatter import SignalFormatter, get_formatter
from .pg_engine import PGSignalEngine, PGSignal, get_pg_engine, start_pg_signal_loop
from .pg_formatter import PGSignalFormatter, get_pg_formatter
from .history import SignalHistory, get_history
from . import ui

__all__ = [
    # SQLite 规则引擎
    "ALL_RULES", "RULES_BY_TABLE", "RULES_BY_CATEGORY",
    "SignalRule", "ConditionType", "RULE_COUNT", "TABLE_COUNT",
    "SignalEngine", "Signal", "get_engine",
    "SignalPusher", "init_pusher", "start_signal_loop",
    "SignalFormatter", "get_formatter",
    # PG 实时引擎
    "PGSignalEngine", "PGSignal", "get_pg_engine", "start_pg_signal_loop",
    "PGSignalFormatter", "get_pg_formatter",
    # 历史记录
    "SignalHistory", "get_history",
    # UI
    "ui",
]
