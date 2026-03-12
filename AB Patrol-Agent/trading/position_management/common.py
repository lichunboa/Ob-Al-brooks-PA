"""持仓生命周期模块的共享工具。"""

from __future__ import annotations

from typing import Any


def get_position_attr(position: Any, key: str, default: Any = None) -> Any:
    """统一获取持仓属性，兼容字典和对象。"""
    if isinstance(position, dict):
        return position.get(key, default)
    return getattr(position, key, default)


def get_attr(obj: Any, key: str, default: Any = None) -> Any:
    """统一获取对象属性，兼容字典和对象。"""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)
