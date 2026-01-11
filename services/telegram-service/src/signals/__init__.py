"""
信号检测系统

此模块作为 signal-service 的适配层：
- 优先使用独立的 signal-service（解耦架构）
- 回退到本地模块（兼容性）
"""
import logging

logger = logging.getLogger(__name__)

# 尝试使用 signal-service 适配器
try:
    from .adapter import (
        init_pusher,
        start_signal_loop,
        start_pg_signal_loop,
        get_pg_engine,
        get_pg_formatter,
        init_signal_service,
    )
    _USE_SIGNAL_SERVICE = True
    logger.debug("使用 signal-service 适配器")
except ImportError:
    _USE_SIGNAL_SERVICE = False
    logger.debug("回退到本地 signals 模块")
    from .pusher_v2 import init_pusher, start_signal_loop
    from .pg_engine import get_pg_engine, start_pg_signal_loop
    from .pg_formatter import get_pg_formatter

# 本地模块（始终可用）
from .rules import ALL_RULES, RULES_BY_TABLE, RULES_BY_CATEGORY, SignalRule, ConditionType, RULE_COUNT, TABLE_COUNT
from .engine_v2 import SignalEngine, Signal, get_engine
from .formatter import SignalFormatter, get_formatter
from .history import SignalHistory, get_history
from . import ui

# PG 相关（从适配器或本地导入）
if not _USE_SIGNAL_SERVICE:
    from .pg_engine import PGSignalEngine, PGSignal
    from .pg_formatter import PGSignalFormatter
else:
    # 从 signal-service 导入
    try:
        import sys
        from pathlib import Path
        _svc_path = Path(__file__).parent.parent.parent.parent.parent / "signal-service" / "src"
        if str(_svc_path) not in sys.path:
            sys.path.insert(0, str(_svc_path))
        from engines.pg_engine import PGSignalEngine, PGSignal
        from formatters.base import BaseFormatter as PGSignalFormatter
    except ImportError:
        from .pg_engine import PGSignalEngine, PGSignal
        from .pg_formatter import PGSignalFormatter

__all__ = [
    # SQLite 规则引擎
    "ALL_RULES", "RULES_BY_TABLE", "RULES_BY_CATEGORY",
    "SignalRule", "ConditionType", "RULE_COUNT", "TABLE_COUNT",
    "SignalEngine", "Signal", "get_engine",
    "init_pusher", "start_signal_loop",
    "SignalFormatter", "get_formatter",
    # PG 实时引擎
    "PGSignalEngine", "PGSignal", "get_pg_engine", "start_pg_signal_loop",
    "PGSignalFormatter", "get_pg_formatter",
    # 历史记录
    "SignalHistory", "get_history",
    # UI
    "ui",
]
