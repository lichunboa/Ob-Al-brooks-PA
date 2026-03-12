"""
Al Brooks PA 核心模块。

这里只导出当前仍然存在的交易域子包，避免根级兼容入口继续引用
已经删除的旧目录，导致 `import trading` 时链式导入失败。
"""

__version__ = "1.0.0"

from . import market, notifications, position_management, utils

__all__ = [
    "market",
    "position_management",
    "notifications",
    "utils",
]
