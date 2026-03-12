"""兼容旧版运行时通知渲染导入路径。"""

import sys
from importlib import import_module
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

_MODULE = import_module("trading.notifications.notification_renderer")
NotificationRendererMixin = _MODULE.NotificationRendererMixin

__all__ = ["NotificationRendererMixin"]
