"""
实时信号检测引擎 - 基于 PostgreSQL LISTEN/NOTIFY

替代 60 秒轮询，实现毫秒级实时信号检测。

工作原理：
1. data-service 写入数据后发送 NOTIFY
2. 本引擎通过 LISTEN 接收通知
3. 收到通知后立即检测信号

通道：
- candle_updates: K线数据更新
- metrics_updates: 期货指标更新
"""

import json
import logging
import select
import threading
import time
from datetime import datetime
from typing import Callable, Optional

from config import get_database_url

logger = logging.getLogger(__name__)

# NOTIFY 通道名称（与 data-service 保持一致）
CANDLE_NOTIFY_CHANNEL = "candle_updates"
METRICS_NOTIFY_CHANNEL = "metrics_updates"


class RealtimeSignalEngine:
    """实时信号检测引擎

    使用 PostgreSQL LISTEN/NOTIFY 实现毫秒级实时检测。
    """

    def __init__(
        self,
        db_url: str,
        on_candle_update: Optional[Callable[[dict], None]] = None,
        on_metrics_update: Optional[Callable[[dict], None]] = None,
    ):
        """
        Args:
            db_url: PostgreSQL 连接 URL
            on_candle_update: K线更新回调，参数为 payload dict
            on_metrics_update: 指标更新回调，参数为 payload dict
        """
        self.db_url = db_url
        self._on_candle_update = on_candle_update
        self._on_metrics_update = on_metrics_update
        self._conn = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._reconnect_delay = 5
        self._max_reconnect_attempts = 10
        self.stats = {
            "candle_notifications": 0,
            "metrics_notifications": 0,
            "reconnects": 0,
            "errors": 0,
            "last_notification": None,
        }

    def _connect(self) -> bool:
        """建立连接并订阅通道"""
        for attempt in range(self._max_reconnect_attempts):
            try:
                import psycopg

                # 使用 autocommit 模式，LISTEN 需要
                self._conn = psycopg.connect(
                    self.db_url,
                    autocommit=True,
                    connect_timeout=10
                )

                # 订阅通道
                with self._conn.cursor() as cur:
                    cur.execute(f"LISTEN {CANDLE_NOTIFY_CHANNEL}")
                    cur.execute(f"LISTEN {METRICS_NOTIFY_CHANNEL}")

                logger.info(
                    "已连接 PostgreSQL 并订阅通道: %s, %s",
                    CANDLE_NOTIFY_CHANNEL, METRICS_NOTIFY_CHANNEL
                )
                return True

            except ImportError:
                logger.error("psycopg 未安装")
                return False
            except Exception as e:
                self.stats["reconnects"] += 1
                logger.error(
                    "连接失败 (尝试 %d/%d): %s",
                    attempt + 1, self._max_reconnect_attempts, e
                )
                if attempt < self._max_reconnect_attempts - 1:
                    time.sleep(self._reconnect_delay)

        return False

    def _listen_loop(self) -> None:
        """监听循环"""
        logger.info("实时信号引擎启动")

        while self._running:
            # 确保连接
            if self._conn is None or self._conn.closed:
                if not self._connect():
                    logger.error("无法建立连接，等待后重试...")
                    time.sleep(self._reconnect_delay)
                    continue

            try:
                # 使用 select 等待通知，超时 1 秒
                gen = self._conn.notifies(timeout=1.0)
                for notify in gen:
                    if not self._running:
                        break
                    self._handle_notify(notify)

            except Exception as e:
                self.stats["errors"] += 1
                logger.error("监听异常: %s", e)
                # 关闭连接，下次循环重连
                try:
                    if self._conn:
                        self._conn.close()
                except Exception:
                    pass
                self._conn = None
                time.sleep(1)

        logger.info("实时信号引擎停止")

    def _handle_notify(self, notify) -> None:
        """处理通知"""
        try:
            channel = notify.channel
            payload_str = notify.payload

            # 解析 payload
            try:
                payload = json.loads(payload_str) if payload_str else {}
            except json.JSONDecodeError:
                payload = {"raw": payload_str}

            self.stats["last_notification"] = datetime.now().isoformat()

            if channel == CANDLE_NOTIFY_CHANNEL:
                self.stats["candle_notifications"] += 1
                logger.debug(
                    "收到 K线更新通知: symbols=%s, count=%s",
                    payload.get("symbols", [])[:3],
                    payload.get("count", 0)
                )
                if self._on_candle_update:
                    self._on_candle_update(payload)

            elif channel == METRICS_NOTIFY_CHANNEL:
                self.stats["metrics_notifications"] += 1
                logger.debug(
                    "收到指标更新通知: symbols=%s, count=%s",
                    payload.get("symbols", [])[:3],
                    payload.get("count", 0)
                )
                if self._on_metrics_update:
                    self._on_metrics_update(payload)

        except Exception as e:
            self.stats["errors"] += 1
            logger.error("处理通知异常: %s", e)

    def start(self) -> None:
        """启动引擎（非阻塞）"""
        if self._running:
            logger.warning("引擎已在运行")
            return

        self._running = True
        self._thread = threading.Thread(
            target=self._listen_loop,
            daemon=True,
            name="RealtimeSignalEngine"
        )
        self._thread.start()

    def stop(self) -> None:
        """停止引擎"""
        self._running = False
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None
        if self._thread:
            self._thread.join(timeout=5)

    def get_stats(self) -> dict:
        """获取统计信息"""
        return {
            **self.stats,
            "running": self._running,
            "connected": self._conn is not None and not self._conn.closed,
        }


def create_realtime_signal_checker(pg_engine):
    """创建实时信号检查器

    将 RealtimeSignalEngine 与 PGSignalEngine 集成。

    V3.8.2: 添加 300s 限流，防止 LISTEN/NOTIFY 频繁触发信号检查。
    NOTIFY 每分钟可能触发多次（1m K线 + 5m 指标），但信号检查
    应与 PG 轮询间隔保持一致，避免绕过限流。

    Args:
        pg_engine: PGSignalEngine 实例

    Returns:
        RealtimeSignalEngine 实例
    """
    # V3.8.2: 限流 — 最多每 300s 触发一次信号检查
    _last_check_time = [0.0]  # mutable container for closure
    _MIN_CHECK_INTERVAL = 300  # 与 PG 轮询间隔一致

    def _throttled_check(trigger_type, symbols):
        """限流后的信号检查"""
        now = time.time()
        elapsed = now - _last_check_time[0]
        if elapsed < _MIN_CHECK_INTERVAL:
            logger.debug(
                "限流跳过 %s 检测 (%ds < %ds): %s",
                trigger_type, int(elapsed),
                _MIN_CHECK_INTERVAL, symbols[:3]
            )
            return
        _last_check_time[0] = now
        logger.info(
            "%s触发信号检测: %s", trigger_type, symbols[:5]
        )
        try:
            signals = pg_engine.check_signals()
            if signals:
                logger.info(
                    "%s检测到 %d 个信号", trigger_type, len(signals)
                )
        except Exception as e:
            logger.error("%s信号检测失败: %s", trigger_type, e)

    def on_candle_update(payload: dict):
        """K线更新时检测信号"""
        symbols = payload.get("symbols", [])
        if not symbols:
            return
        _throttled_check("实时K线", symbols)

    def on_metrics_update(payload: dict):
        """指标更新时检测信号"""
        symbols = payload.get("symbols", [])
        if not symbols:
            return
        _throttled_check("指标更新", symbols)

    engine = RealtimeSignalEngine(
        db_url=get_database_url(),
        on_candle_update=on_candle_update,
        on_metrics_update=on_metrics_update,
    )

    return engine
