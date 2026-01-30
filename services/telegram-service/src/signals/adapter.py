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
_main_loop: Optional[asyncio.AbstractEventLoop] = None


def _translate_message(event: SignalEvent, lang: str | None = None) -> str:
    """翻译信号消息（按用户语言）"""
    try:
        from cards.i18n import I18N
        # 尝试翻译 message_key
        msg = I18N.gettext(event.message_key, lang=lang, **event.message_params)
        # 如果翻译后仍是 key（未找到翻译），使用 extra 中的原始消息
        if msg == event.message_key:
            return event.extra.get("message", event.message_key)
        return msg
    except Exception:
        # 回退到 extra 中的原始消息
        return event.extra.get("message", event.message_key)


def _translate_signal_type(signal_type: str, lang: str | None = None) -> str:
    """翻译信号类型标签（按用户语言）"""
    try:
        from cards.i18n import I18N
        key = f"signal.pg.type.{signal_type}"
        text = I18N.gettext(key, lang=lang)
        return text if text != key else signal_type
    except Exception:
        return signal_type


def init_signal_service():
    """初始化"""
    logger.info("signal-service 已连接")


def get_pg_engine():
    """获取 PG 引擎"""
    return _get_pg_engine()


def init_pusher(send_func: Callable, loop: Optional[asyncio.AbstractEventLoop] = None):
    """初始化推送器"""
    global _send_func, _main_loop
    _send_func = send_func
    _main_loop = loop

    def on_signal_event(event: SignalEvent):
        if not _send_func:
            return

        from .ui import get_signal_push_kb, _get_subscribers

        icon = {"BUY": "🟢", "SELL": "🔴", "ALERT": "⚠️"}.get(event.direction, "📊")
        bar = strength_bar(event.strength)
        subscribers = _get_subscribers()
        from cards.i18n import resolve_lang_by_user_id

        async def push():
            for uid in subscribers:
                try:
                    lang = resolve_lang_by_user_id(uid)
                    msg = _translate_message(event, lang=lang)
                    signal_label = _translate_signal_type(event.signal_type, lang=lang)
                    text = f"""{icon} {event.direction} | {event.symbol}

📌 {signal_label}
⏱ 周期: {event.timeframe}
💰 价格: {fmt_price(event.price)}
📊 强度: [{bar}] {event.strength}%

💬 {msg}"""
                    kb = get_signal_push_kb(event.symbol, uid=uid)
                    await _send_func(uid, text, kb)
                except Exception as e:
                    logger.warning(f"推送给 {uid} 失败: {e}")

        # 只在主事件循环内发送，避免跨线程/跨事件循环污染 HTTP 客户端
        if _main_loop and _main_loop.is_running():
            asyncio.run_coroutine_threadsafe(push(), _main_loop)
            return
        try:
            running = asyncio.get_running_loop()
            asyncio.run_coroutine_threadsafe(push(), running)
        except RuntimeError:
            logger.warning("⚠️ 主事件循环不可用，跳过信号推送")

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
