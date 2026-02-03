"""自动数据对齐模块 - 实时检测延迟并主动补齐

功能：
1. 每 60 秒检查数据库最新时间
2. 延迟 > 2 分钟 → 立即用 REST API 补齐缺口
3. 延迟 > 10 分钟 → 发送 Telegram 告警
4. 与 WebSocket 重连机制协同工作

设计原则：
- 代码级别检测，不消耗 AI token
- 轻量级，不影响主流程性能
- 主动补齐，不依赖 WebSocket 恢复
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)


class DataAligner:
    """数据自动对齐器

    独立于 WebSocket，定期检查数据库并主动补齐缺口
    """

    # 配置常量
    CHECK_INTERVAL = 60          # 检查间隔（秒）
    ALIGN_THRESHOLD = 120        # 触发对齐阈值（秒）- 2分钟
    ALERT_THRESHOLD = 600        # 触发告警阈值（秒）- 10分钟
    MAX_BACKFILL_MINUTES = 30    # 单次最大补齐分钟数

    def __init__(
        self,
        db_adapter,
        symbols: List[str],
        telegram_bot_token: Optional[str] = None,
        telegram_chat_id: Optional[str] = None,
        check_interval: int = None,
        align_threshold: int = None,
        alert_threshold: int = None,
    ):
        self._db = db_adapter
        self._symbols = symbols
        self._bot_token = telegram_bot_token or os.environ.get("BOT_TOKEN")
        self._chat_id = telegram_chat_id or os.environ.get("TELEGRAM_ADMIN_ID", "756069822")

        # 配置
        self._check_interval = check_interval or self.CHECK_INTERVAL
        self._align_threshold = align_threshold or self.ALIGN_THRESHOLD
        self._alert_threshold = alert_threshold or self.ALERT_THRESHOLD

        # 状态
        self._running = False
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._last_alert_time = 0  # 避免重复告警
        self._stats = {
            "checks": 0,
            "aligns": 0,
            "alerts": 0,
            "rows_filled": 0,
            "last_delay_seconds": 0,
        }

        # REST 补齐器（延迟导入避免循环依赖）
        self._rest_backfiller = None

    @property
    def stats(self) -> Dict:
        return self._stats.copy()

    def _get_db_latest_time(self) -> Optional[datetime]:
        """获取数据库中最新的数据时间"""
        try:
            sql = """
                SELECT MAX(bucket_ts)
                FROM market_data.candles_1m
                WHERE symbol = ANY(%s)
            """
            with self._db.connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, (self._symbols[:10],))  # 只检查前10个主要币种
                    result = cur.fetchone()
                    if result and result[0]:
                        return result[0].replace(tzinfo=timezone.utc)
            return None
        except Exception as e:
            logger.error("获取数据库最新时间失败: %s", e)
            return None

    def _calculate_delay(self) -> int:
        """计算数据延迟（秒）"""
        latest = self._get_db_latest_time()
        if not latest:
            return -1

        now = datetime.now(timezone.utc)
        delay = (now - latest).total_seconds()
        return int(delay)

    def _do_align(self, delay_seconds: int) -> int:
        """执行数据对齐（REST API 补齐）"""
        try:
            # 延迟导入
            if self._rest_backfiller is None:
                from collectors.backfill import RestBackfiller
                self._rest_backfiller = RestBackfiller(self._db, workers=4)

            # 计算需要补齐的时间范围
            minutes_to_fill = min(delay_seconds // 60 + 2, self.MAX_BACKFILL_MINUTES)

            logger.info("开始数据对齐: 延迟 %d 秒，补齐最近 %d 分钟", delay_seconds, minutes_to_fill)

            # 使用 REST API 补齐最近的数据
            from datetime import date
            from collectors.backfill import GapScanner, GapInfo

            scanner = GapScanner(self._db)
            today = date.today()

            # 扫描今天的缺口
            gaps = scanner.scan_klines(self._symbols[:20], today, today, "1m", 0.90)

            if gaps:
                filled = self._rest_backfiller.fill_gaps(gaps, "1m")
                logger.info("数据对齐完成: 补齐 %d 条", filled)
                return filled
            else:
                logger.info("数据对齐: 无缺口需要补齐")
                return 0

        except Exception as e:
            logger.error("数据对齐失败: %s", e)
            return 0

    def _send_alert(self, delay_seconds: int) -> bool:
        """发送 Telegram 告警"""
        if not self._bot_token or not self._chat_id:
            logger.warning("Telegram 配置缺失，无法发送告警")
            return False

        # 避免重复告警（10分钟内只发一次）
        now = time.time()
        if now - self._last_alert_time < 600:
            return False

        try:
            message = (
                f"⚠️ **数据延迟告警**\n\n"
                f"当前延迟: {delay_seconds // 60} 分 {delay_seconds % 60} 秒\n"
                f"阈值: {self._alert_threshold // 60} 分钟\n"
                f"时间: {datetime.now().strftime('%H:%M:%S')}\n\n"
                f"系统正在尝试自动补齐..."
            )

            url = f"https://api.telegram.org/bot{self._bot_token}/sendMessage"
            resp = requests.post(url, json={
                "chat_id": self._chat_id,
                "text": message,
                "parse_mode": "Markdown",
            }, timeout=10)

            if resp.status_code == 200:
                self._last_alert_time = now
                self._stats["alerts"] += 1
                logger.info("已发送延迟告警到 Telegram")
                return True
            else:
                logger.warning("发送告警失败: %s", resp.text)
                return False

        except Exception as e:
            logger.error("发送告警异常: %s", e)
            return False

    def _check_loop(self) -> None:
        """检查循环"""
        logger.info(
            "数据对齐器启动 | 检查间隔: %ds | 对齐阈值: %ds | 告警阈值: %ds",
            self._check_interval, self._align_threshold, self._alert_threshold
        )

        while not self._stop_event.wait(self._check_interval):
            self._stats["checks"] += 1

            delay = self._calculate_delay()
            if delay < 0:
                logger.debug("无法获取数据延迟")
                continue

            self._stats["last_delay_seconds"] = delay

            # 正常范围（< 2分钟）
            if delay < self._align_threshold:
                logger.debug("数据正常，延迟 %d 秒", delay)
                continue

            # 需要对齐（2-10分钟）
            logger.warning("数据延迟 %d 秒，触发自动对齐", delay)
            self._stats["aligns"] += 1
            filled = self._do_align(delay)
            self._stats["rows_filled"] += filled

            # 需要告警（> 10分钟）
            if delay >= self._alert_threshold:
                self._send_alert(delay)

        logger.info("数据对齐器已停止")

    def start(self) -> None:
        """启动对齐器"""
        if self._running:
            return

        self._running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._check_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """停止对齐器"""
        self._running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def check_now(self) -> Dict:
        """立即检查一次（供外部调用）"""
        delay = self._calculate_delay()
        result = {
            "delay_seconds": delay,
            "status": "unknown" if delay < 0 else (
                "normal" if delay < self._align_threshold else
                "delayed" if delay < self._alert_threshold else
                "critical"
            ),
        }

        if delay >= self._align_threshold:
            filled = self._do_align(delay)
            result["filled"] = filled

        return result


# 全局单例（供 ws_manager 使用）
_aligner: Optional[DataAligner] = None


def get_aligner() -> Optional[DataAligner]:
    """获取全局对齐器实例"""
    return _aligner


def init_aligner(db_adapter, symbols: List[str], **kwargs) -> DataAligner:
    """初始化全局对齐器"""
    global _aligner
    if _aligner is None:
        _aligner = DataAligner(db_adapter, symbols, **kwargs)
    return _aligner


def start_aligner() -> None:
    """启动全局对齐器"""
    if _aligner:
        _aligner.start()


def stop_aligner() -> None:
    """停止全局对齐器"""
    if _aligner:
        _aligner.stop()
