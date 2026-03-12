"""通知渲染聚合层。"""

from __future__ import annotations

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_RUNTIME_DIR = _ROOT / "runtime"
for candidate in (str(_ROOT), str(_RUNTIME_DIR)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)

try:
    from runtime.scan_timing import ScanTimingMixin
    from runtime.telegram_notifier import TelegramNotifierMixin
except ModuleNotFoundError:  # pragma: no cover - 兼容直接进入 runtime 目录执行
    from scan_timing import ScanTimingMixin
    from telegram_notifier import TelegramNotifierMixin


class NotificationRendererMixin(ScanTimingMixin, TelegramNotifierMixin):
    """兼容旧导入路径，聚合扫描分桶与 Telegram 通知能力。"""

    pass
