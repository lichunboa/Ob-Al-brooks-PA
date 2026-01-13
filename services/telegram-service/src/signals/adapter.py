"""
Signal Service 适配器
"""
import sys
import logging
import threading
import asyncio
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# 添加 signal-service 到路径
_SIGNAL_SERVICE_SRC = Path(__file__).resolve().parents[4] / "services" / "signal-service" / "src"
if str(_SIGNAL_SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(_SIGNAL_SERVICE_SRC))

# 导入 signal-service
from engines import get_sqlite_engine, get_pg_engine as _get_pg_engine
from engines.pg_engine import PGSignal
from events import SignalPublisher, SignalEvent
from formatters.base import BaseFormatter, strength_bar, fmt_price

_send_func: Optional[Callable] = None


def _translate_message(event: SignalEvent) -> str:
    """翻译信号消息"""
    try:
        from bot.app import I18N
        # 尝试翻译 message_key
        msg = I18N.gettext(event.message_key, **event.message_params)
        # 如果翻译后仍是 key（未找到翻译），使用 extra 中的原始消息
        if msg == event.message_key:
            return event.extra.get("message", event.message_key)
        return msg
    except Exception:
        # 回退到 extra 中的原始消息
        return event.extra.get("message", event.message_key)


def init_signal_service():
    """初始化"""
    logger.info("signal-service 已连接")


def get_pg_engine():
    """获取 PG 引擎"""
    return _get_pg_engine()


def init_pusher(send_func: Callable):
    """初始化推送器"""
    global _send_func
    _send_func = send_func

    def on_signal_event(event: SignalEvent):
        if not _send_func:
            return

        from .ui import get_signal_push_kb, _get_subscribers

        icon = {"BUY": "🟢", "SELL": "🔴", "ALERT": "⚠️"}.get(event.direction, "📊")
        bar = strength_bar(event.strength)
        msg = _translate_message(event)

        text = f"""{icon} {event.direction} | {event.symbol}

📌 {event.signal_type}
⏱ 周期: {event.timeframe}
💰 价格: {fmt_price(event.price)}
📊 强度: [{bar}] {event.strength}%

💬 {msg}"""

        subscribers = _get_subscribers()

        async def push():
            for uid in subscribers:
                try:
                    kb = get_signal_push_kb(event.symbol, uid=uid)
                    await _send_func(uid, text, kb)
                except Exception as e:
                    logger.warning(f"推送给 {uid} 失败: {e}")

        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(push(), loop)
            else:
                asyncio.run(push())
        except RuntimeError:
            asyncio.run(push())

    SignalPublisher.subscribe(on_signal_event)
    logger.info("信号推送器已初始化")


def start_signal_loop(interval: int = 60):
    """启动 SQLite 信号检测"""
    def run():
        get_sqlite_engine().run_loop(interval=interval)

    thread = threading.Thread(target=run, daemon=True, name="SQLiteSignalEngine")
    thread.start()
    logger.info(f"SQLite 信号引擎已启动，间隔 {interval}s")
    return thread


def start_pg_signal_loop(interval: int = 60):
    """启动 PG 信号检测"""
    def run():
        _get_pg_engine().run_loop(interval=interval)

    thread = threading.Thread(target=run, daemon=True, name="PGSignalEngine")
    thread.start()
    logger.info(f"PG 信号引擎已启动，间隔 {interval}s")
    return thread


def get_pg_formatter(lang: str = "zh"):
    """获取格式化器"""
    return BaseFormatter()
