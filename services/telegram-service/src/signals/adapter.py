"""
Signal Service 适配器
将 signal-service 的功能桥接到 telegram-service

用法：
    from signals.adapter import (
        init_signal_service,
        start_sqlite_signal_loop,
        start_pg_signal_loop,
        get_pg_engine,
        get_pg_formatter,
    )
"""
import sys
import logging
import threading
import asyncio
from pathlib import Path
from typing import Callable, Optional
from collections import deque
import time

logger = logging.getLogger(__name__)

# 添加 signal-service 到路径
_TELEGRAM_SERVICE_ROOT = Path(__file__).parent.parent.parent
_REPO_ROOT = _TELEGRAM_SERVICE_ROOT.parent.parent
_SIGNAL_SERVICE_SRC = _REPO_ROOT / "services" / "signal-service" / "src"

if str(_SIGNAL_SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(_SIGNAL_SERVICE_SRC))


def _import_signal_service():
    """导入 signal-service 模块"""
    try:
        from engines import get_sqlite_engine, get_pg_engine as _get_pg_engine
        from engines.pg_engine import PGSignal
        from events import SignalPublisher, SignalEvent
        from formatters.base import BaseFormatter, strength_bar, fmt_price
        return {
            "get_sqlite_engine": get_sqlite_engine,
            "get_pg_engine": _get_pg_engine,
            "PGSignal": PGSignal,
            "SignalPublisher": SignalPublisher,
            "SignalEvent": SignalEvent,
            "BaseFormatter": BaseFormatter,
            "strength_bar": strength_bar,
            "fmt_price": fmt_price,
        }
    except ImportError as e:
        logger.error(f"无法导入 signal-service: {e}")
        return None


# 全局状态
_signal_service = None
_pusher_initialized = False
_send_func: Optional[Callable] = None


def init_signal_service():
    """初始化 signal-service 连接"""
    global _signal_service
    if _signal_service is None:
        _signal_service = _import_signal_service()
        if _signal_service:
            logger.info("✅ signal-service 已连接")
        else:
            logger.warning("⚠️ signal-service 不可用，使用本地 signals 模块")
    return _signal_service


def init_pusher(send_func: Callable):
    """
    初始化推送器（兼容旧接口）
    
    Args:
        send_func: 异步发送函数 async def send(user_id, text, reply_markup)
    """
    global _pusher_initialized, _send_func
    _send_func = send_func
    _pusher_initialized = True
    
    svc = init_signal_service()
    if svc:
        # 注册到 SignalPublisher
        def on_signal_event(event):
            """SignalEvent 回调"""
            if not _send_func:
                return
            
            # 格式化消息
            from .ui import get_signal_push_kb, _get_subscribers
            
            # 简单格式化
            icon = {"BUY": "🟢", "SELL": "🔴", "ALERT": "⚠️"}.get(event.direction, "📊")
            bar = svc["strength_bar"](event.strength)
            
            text = f"""{icon} {event.direction} | {event.symbol}

📌 {event.signal_type}
⏱ 周期: {event.timeframe}
💰 价格: {svc["fmt_price"](event.price)}
📊 强度: [{bar}] {event.strength}%

💬 {event.message_key}"""
            
            kb = get_signal_push_kb(event.symbol)
            subscribers = _get_subscribers()
            
            # 异步推送
            async def push():
                for uid in subscribers:
                    try:
                        await _send_func(uid, text, kb)
                    except Exception as e:
                        logger.warning(f"推送给 {uid} 失败: {e}")
            
            # 投递到事件循环
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.run_coroutine_threadsafe(push(), loop)
                else:
                    asyncio.run(push())
            except RuntimeError:
                asyncio.run(push())
        
        svc["SignalPublisher"].subscribe(on_signal_event)
        logger.info("✅ signal-service 推送器已初始化")
    else:
        # 回退到本地模块
        try:
            from . import pusher_v2
            pusher_v2.init_pusher(send_func)
            logger.info("✅ 本地推送器已初始化")
        except Exception as e:
            logger.warning(f"本地推送器初始化失败: {e}")


def start_signal_loop(interval: int = 60):
    """
    启动 SQLite 信号检测循环（兼容旧接口）
    """
    svc = init_signal_service()
    if svc:
        def run():
            engine = svc["get_sqlite_engine"]()
            engine.run_loop(interval=interval)
        
        thread = threading.Thread(target=run, daemon=True, name="SQLiteSignalEngine")
        thread.start()
        logger.info(f"✅ SQLite 信号引擎已启动（signal-service），间隔 {interval}s")
        return thread
    else:
        # 回退到本地模块
        try:
            from . import pusher_v2
            return pusher_v2.start_signal_loop(interval)
        except Exception as e:
            logger.warning(f"启动本地信号循环失败: {e}")
            return None


def start_pg_signal_loop(interval: int = 60):
    """
    启动 PG 信号检测循环
    """
    svc = init_signal_service()
    if svc:
        def run():
            engine = svc["get_pg_engine"]()
            engine.run_loop(interval=interval)
        
        thread = threading.Thread(target=run, daemon=True, name="PGSignalEngine")
        thread.start()
        logger.info(f"✅ PG 信号引擎已启动（signal-service），间隔 {interval}s")
        return thread
    else:
        # 回退到本地模块
        try:
            from .pg_engine import start_pg_signal_loop as _start_pg
            return _start_pg(interval)
        except Exception as e:
            logger.warning(f"启动本地 PG 信号循环失败: {e}")
            return None


def get_pg_engine():
    """获取 PG 引擎"""
    svc = init_signal_service()
    if svc:
        return svc["get_pg_engine"]()
    else:
        from .pg_engine import get_pg_engine as _get
        return _get()


def get_pg_formatter(lang: str = "zh"):
    """获取 PG 格式化器"""
    svc = init_signal_service()
    if svc:
        # 返回兼容的格式化器
        class PGFormatterCompat:
            def __init__(self, translator=None):
                self._t = translator or (lambda key, **kw: key)
                self._base = svc["BaseFormatter"]()
            
            def format(self, signal) -> str:
                return self._base.format_basic(
                    symbol=signal.symbol,
                    direction=signal.direction,
                    signal_type=signal.signal_type,
                    strength=signal.strength,
                    price=signal.price,
                    timeframe=signal.timeframe,
                    message=signal.message_key,
                )
        
        return PGFormatterCompat()
    else:
        from .pg_formatter import get_pg_formatter as _get
        return _get(lang)
