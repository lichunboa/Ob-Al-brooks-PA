"""通知渲染聚合层。"""

from __future__ import annotations

from scan_timing import ScanTimingMixin
from telegram_notifier import TelegramNotifierMixin


class NotificationRendererMixin(ScanTimingMixin, TelegramNotifierMixin):
    """兼容旧导入路径，聚合扫描分桶与 Telegram 通知能力。"""

    pass
