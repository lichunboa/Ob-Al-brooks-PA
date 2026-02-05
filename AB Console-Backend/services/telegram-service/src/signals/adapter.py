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

# 添加 signal-service 到路径（支持 Docker 环境）
import os
if os.environ.get('SIGNAL_SERVICE_SRC'):
    _SIGNAL_SERVICE_SRC = Path(os.environ.get('SIGNAL_SERVICE_SRC'))
elif Path(__file__).resolve().parents[4].exists():
    _SIGNAL_SERVICE_SRC = Path(__file__).resolve().parents[4] / "services" / "signal-service" / "src"
else:
    # Docker 默认路径
    _SIGNAL_SERVICE_SRC = Path("/app/services/signal-service/src")
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

        async def push_all():
            """推送给订阅用户 + Clawdbot（在同一个协程中顺序执行）"""
            await push()
            if event.strength >= _CLAWDBOT_THRESHOLD:
                await _notify_clawdbot(event)

        # 只在主事件循环内发送，避免跨线程/跨事件循环污染 HTTP 客户端
        target_loop = _main_loop if (_main_loop and _main_loop.is_running()) else None
        if not target_loop:
            try:
                target_loop = asyncio.get_running_loop()
            except RuntimeError:
                target_loop = None

        if target_loop:
            asyncio.run_coroutine_threadsafe(push_all(), target_loop)
        else:
            logger.warning("主事件循环不可用，跳过信号推送")

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


# ========== Clawdbot 集成 ==========
import json
import os
import fcntl
import aiohttp
from datetime import datetime, timezone

_CLAWDBOT_WEBHOOK_URL = (
    os.environ.get("CLAWDBOT_WEBHOOK_URL")
    or os.environ.get("CLAWDBOT_WEBHOOK")
    or "http://host.docker.internal:18789/hooks/al-brooks-signal"
)
_CLAWDBOT_WEBHOOK_TOKEN = os.environ.get(
    "CLAWDBOT_WEBHOOK_TOKEN", "hooks-5fed4a9a7de03c21c542049f68669b0983b8119a471ae74a7909f2fb17ace267"
)
# strength 是 int(0-100)，阈值也用同一刻度
# >= 75 推送到 Discord #al-brooks-信号，>= 80 创建模拟交易
_CLAWDBOT_THRESHOLD = int(os.environ.get("CLAWDBOT_THRESHOLD", "75"))

# 后端 API 回调地址（Clawdbot 分析完后将详细报告发回这里）
_BACKEND_REPORT_URL = os.environ.get(
    "BACKEND_REPORT_URL", "http://127.0.0.1:8090/api/clawdbot-report"
)
_BACKEND_NOTE_URL = os.environ.get(
    "BACKEND_NOTE_URL", "http://127.0.0.1:8090/api/create-trade-note"
)

# 推送统计（模块级计数器）
_push_stats = {"webhook_ok": 0, "webhook_fail": 0, "file_ok": 0, "file_fail": 0}

# 信号文件目录（避免使用全局可写的 /tmp）
_CLAWDBOT_SIGNAL_DIR = Path(os.environ.get(
    "CLAWDBOT_SIGNAL_DIR",
    os.path.expanduser("~/.clawdbot/signals")
))
_CLAWDBOT_SIGNAL_DIR.mkdir(parents=True, exist_ok=True)
_CLAWDBOT_SIGNAL_FILE = _CLAWDBOT_SIGNAL_DIR / "signals.jsonl"
_CLAWDBOT_FAILED_QUEUE = _CLAWDBOT_SIGNAL_DIR / "failed_queue.jsonl"

# 文件轮转阈值
_SIGNAL_FILE_MAX_BYTES = 5 * 1024 * 1024  # 5MB

# 复用 aiohttp session（模块级，进程生命周期内复用）
_http_session: Optional[aiohttp.ClientSession] = None

# ========== Webhook 队列（避免并发锁竞争） ==========
_webhook_queue: Optional[asyncio.Queue] = None
_webhook_worker_task: Optional[asyncio.Task] = None


async def _webhook_worker():
    """后台 worker：串行消费队列，逐个发送 webhook"""
    global _webhook_queue
    logger.info("Webhook worker 已启动")
    while True:
        try:
            signal_data, payload, headers = await _webhook_queue.get()
            try:
                session = await _get_http_session()
                http_ok, status = await _post_with_retry(
                    session, _CLAWDBOT_WEBHOOK_URL, payload, headers, max_retries=2
                )
                if http_ok:
                    logger.info(
                        f"Clawdbot webhook 成功: {signal_data.get('symbol')} {signal_data.get('direction')} "
                        f"strength={signal_data.get('strength')} (HTTP {status})"
                    )
                    _push_stats["webhook_ok"] += 1
                else:
                    logger.warning(f"Clawdbot webhook 失败: {signal_data.get('symbol')}")
                    _push_stats["webhook_fail"] += 1
                    # 文件通道已写入，这里只记录 webhook 失败
            except Exception as e:
                logger.warning(f"Clawdbot webhook 未知错误: {e}")
                _push_stats["webhook_fail"] += 1
            finally:
                _webhook_queue.task_done()
                # 请求间隔 1 秒，避免 Gateway 锁竞争
                await asyncio.sleep(1.0)
        except asyncio.CancelledError:
            logger.info("Webhook worker 已停止")
            break
        except Exception as e:
            logger.error(f"Webhook worker 异常: {e}")
            await asyncio.sleep(1.0)


def _ensure_webhook_worker(loop: asyncio.AbstractEventLoop):
    """确保 webhook worker 已启动"""
    global _webhook_queue, _webhook_worker_task
    if _webhook_queue is None:
        _webhook_queue = asyncio.Queue()
    if _webhook_worker_task is None or _webhook_worker_task.done():
        _webhook_worker_task = loop.create_task(_webhook_worker())
        logger.info("Webhook worker task 已创建")


async def _get_http_session() -> aiohttp.ClientSession:
    """获取或创建复用的 HTTP session"""
    global _http_session
    if _http_session is None or _http_session.closed:
        _http_session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        )
    return _http_session


async def _post_with_retry(
    session: aiohttp.ClientSession,
    url: str,
    json_data: dict,
    headers: dict,
    max_retries: int = 2,
) -> tuple[bool, int | None]:
    """带重试的 HTTP POST（指数退避）"""
    for attempt in range(max_retries + 1):
        try:
            async with session.post(url, json=json_data, headers=headers) as resp:
                if resp.status in (200, 202):
                    return True, resp.status
                body = await resp.text()
                logger.warning(
                    f"POST {url} attempt {attempt+1}/{max_retries+1}: "
                    f"HTTP {resp.status} - {body[:200]}"
                )
        except Exception as e:
            logger.warning(
                f"POST {url} attempt {attempt+1}/{max_retries+1} failed: "
                f"{type(e).__name__}: {e}"
            )
        if attempt < max_retries:
            await asyncio.sleep(2 ** attempt)
    return False, None


def get_push_stats() -> dict:
    """返回推送统计（供健康检查/调试用）"""
    return dict(_push_stats)


def _rotate_signal_file_if_needed():
    """信号文件超过阈值时轮转"""
    try:
        if _CLAWDBOT_SIGNAL_FILE.exists() and _CLAWDBOT_SIGNAL_FILE.stat().st_size > _SIGNAL_FILE_MAX_BYTES:
            rotated = _CLAWDBOT_SIGNAL_DIR / f"signals.{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.jsonl"
            _CLAWDBOT_SIGNAL_FILE.rename(rotated)
            logger.info(f"信号文件已轮转: {rotated.name}")
            # 保留最近 5 个归档文件
            archives = sorted(_CLAWDBOT_SIGNAL_DIR.glob("signals.2*.jsonl"))
            for old in archives[:-5]:
                old.unlink(missing_ok=True)
    except Exception as e:
        logger.warning(f"信号文件轮转失败: {e}")


def _write_signal_to_file(signal_data: dict) -> bool:
    """带文件锁的原子写入"""
    try:
        _rotate_signal_file_if_needed()
        with open(_CLAWDBOT_SIGNAL_FILE, "a") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(json.dumps(signal_data, default=str) + "\n")
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        return True
    except Exception as e:
        logger.error(f"写入信号文件失败: {e}")
        return False


def _enqueue_failed_signal(signal_data: dict, reason: str):
    """将发送失败的信号写入磁盘队列，防止丢失"""
    try:
        entry = {
            "signal": signal_data,
            "failed_at": datetime.now(timezone.utc).isoformat(),
            "reason": reason,
        }
        with open(_CLAWDBOT_FAILED_QUEUE, "a") as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                f.write(json.dumps(entry, default=str) + "\n")
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        logger.warning(f"信号已进入失败队列: {signal_data.get('symbol')} - {reason}")
    except Exception as e:
        logger.error(f"写入失败队列也失败，信号可能丢失: {e} | signal={signal_data}")


async def _notify_clawdbot(event: SignalEvent):
    """通知 Clawdbot 进行 Al Brooks 深度分析（队列化发送，避免并发锁竞争）"""
    if event.strength < _CLAWDBOT_THRESHOLD:
        return

    signal_data = {
        "symbol": event.symbol,
        "direction": event.direction,
        "strength": event.strength,
        "timeframe": event.timeframe,
        "price": event.price,
        "signal_type": event.signal_type,
        "timestamp": event.timestamp.isoformat() if isinstance(event.timestamp, datetime) else str(event.timestamp),
        "received_at": datetime.now(timezone.utc).isoformat(),
    }

    # 通道1: 写入信号文件（带文件锁）— 立即执行
    file_ok = _write_signal_to_file(signal_data)
    _push_stats["file_ok" if file_ok else "file_fail"] += 1
    if file_ok:
        logger.info(f"信号已写入文件: {event.symbol} {event.direction} strength={event.strength}")

    # 通道2: HTTP webhook — 放入队列串行发送，避免 Gateway 锁竞争
    try:
        # 获取第一个订阅者作为目标用户
        from .ui import _get_subscribers
        subscribers = _get_subscribers()
        user_id = list(subscribers)[0] if subscribers else "756069822"  # 默认用户

        payload = {
            **signal_data,
            "source": "signal-service",
            "user_id": str(user_id),
            # 回调配置：告知 Clawdbot 分析完后把详细报告发到哪里
            "backend_api": {
                "report_url": _BACKEND_REPORT_URL,
                "note_url": _BACKEND_NOTE_URL,
            },
        }
        headers = {"Authorization": f"Bearer {_CLAWDBOT_WEBHOOK_TOKEN}"}

        # 确保 worker 已启动，然后将请求放入队列
        loop = asyncio.get_running_loop()
        _ensure_webhook_worker(loop)
        await _webhook_queue.put((signal_data, payload, headers))
        logger.debug(f"信号已入队: {event.symbol} {event.direction} (队列长度: {_webhook_queue.qsize()})")

    except Exception as e:
        logger.warning(f"信号入队失败: {e}")
        _push_stats["webhook_fail"] += 1
        # 文件通道已成功，不需要写入失败队列
        if not file_ok:
            _enqueue_failed_signal(signal_data, f"enqueue failed: {e}")


# ========== Clawdbot 分析转发接口 ==========
async def forward_clawdbot_analysis(user_id: str, message: str, parse_mode: str = "HTML"):
    """将 Clawdbot 的详细分析转发给用户（通过 @catbo26bot）"""
    if not _send_func:
        logger.error("转发失败: _send_func 未初始化")
        return False
    
    try:
        from telegram import InlineKeyboardMarkup
        # 直接使用 _send_func 发送给用户
        await _send_func(int(user_id), message, reply_markup=InlineKeyboardMarkup([]))
        logger.info(f"Clawdbot 分析已转发给用户 {user_id}")
        return True
    except Exception as e:
        logger.error(f"转发 Clawdbot 分析失败: {e}")
        return False
