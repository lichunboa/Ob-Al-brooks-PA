"""
数据解析工具函数

用于解析和规范化各种输入数据
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def parse_dt(raw: str | None) -> datetime | None:
    """
    解析日期时间字符串

    支持格式：
    - ISO 8601: "2026-03-10T12:34:56Z"
    - ISO 8601 with microseconds: "2026-03-10T12:34:56.123456Z"
    """
    if not raw:
        return None
    try:
        # 移除 Z 后缀
        s = raw.replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except:
        return None


def safe_float(value: Any, default: float = 0.0) -> float:
    """安全转换为 float"""
    if value is None:
        return default
    try:
        return float(value)
    except:
        return default


def first_float(value: Any, default: float | None = None) -> float | None:
    """
    从各种输入中提取第一个 float

    输入可能是：
    - 单个数字
    - 列表 [1.0, 2.0]
    - 字典 {"price": 1.0}
    - 字符串 "1.0"
    """
    if value is None:
        return default

    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, list):
        for item in value:
            if isinstance(item, (int, float)):
                return float(item)
        return default

    if isinstance(value, dict):
        for v in value.values():
            if isinstance(v, (int, float)):
                return float(v)
        return default

    try:
        return float(value)
    except:
        return default


def all_floats(value: Any) -> list[float]:
    """
    从各种输入中提取所有 float

    输入可能是：
    - 单个数字 → [1.0]
    - 列表 [1.0, 2.0] → [1.0, 2.0]
    - 字典 {"a": 1.0, "b": 2.0} → [1.0, 2.0]
    - 字符串 "1.0, 2.0" → [1.0, 2.0]
    """
    if value is None:
        return []

    if isinstance(value, (int, float)):
        return [float(value)]

    if isinstance(value, list):
        result = []
        for item in value:
            if isinstance(item, (int, float)):
                result.append(float(item))
        return result

    if isinstance(value, dict):
        result = []
        for v in value.values():
            if isinstance(v, (int, float)):
                result.append(float(v))
        return result

    if isinstance(value, str):
        result = []
        for part in value.split(","):
            try:
                result.append(float(part.strip()))
            except:
                pass
        return result

    return []


def parse_structured_value(value: Any) -> Any:
    """
    解析结构化值

    LLM 可能返回：
    - 纯数字："1.5"
    - 带单位："1.5R"
    - 列表："[1.5, 2.0]"
    - 字典：'{"tp1": 1.5, "tp2": 2.0}'
    """
    if value is None:
        return None

    if isinstance(value, (int, float, bool)):
        return value

    if isinstance(value, (list, dict)):
        return value

    if not isinstance(value, str):
        return value

    s = value.strip()

    # 尝试解析为数字
    try:
        return float(s)
    except:
        pass

    # 尝试移除单位后解析
    if s.endswith("R"):
        try:
            return float(s[:-1])
        except:
            pass

    if s.endswith("%"):
        try:
            return float(s[:-1]) / 100
        except:
            pass

    # 尝试解析为 JSON
    if s.startswith("[") or s.startswith("{"):
        try:
            import json
            return json.loads(s)
        except:
            pass

    return s


def normalize_refs(refs: Any) -> list[str]:
    """
    规范化引用列表

    输入可能是：
    - 字符串："S6-channel, S5-evaluation"
    - 列表：["S6-channel", "S5-evaluation"]
    - 字典：{"S6-channel": True, "S5-evaluation": True}
    """
    if not refs:
        return []

    if isinstance(refs, str):
        return [r.strip() for r in refs.split(",") if r.strip()]

    if isinstance(refs, list):
        result = []
        for item in refs:
            if isinstance(item, str):
                result.append(item.strip())
        return result

    if isinstance(refs, dict):
        return [k for k, v in refs.items() if v]

    return []


def truncate_text(value: Any, limit: int = 220) -> Any:
    """
    截断文本

    如果是字符串且超过限制，截断并添加 "..."
    如果是其他类型，保持不变
    """
    if not isinstance(value, str):
        return value

    if len(value) <= limit:
        return value

    return value[:limit] + "..."


def canonical_action_type(value: Any) -> str:
    """
    规范化 action 类型

    统一各种变体到标准名称
    """
    if not value:
        return ""

    s = str(value).strip().upper()

    # 开仓
    if s in {"OPEN", "OPEN_LONG", "OPEN_SHORT", "BUY", "SELL", "ENTRY"}:
        return "OPEN"

    # 平仓
    if s in {"CLOSE", "CLOSE_LONG", "CLOSE_SHORT", "EXIT"}:
        return "CLOSE"

    # 部分平仓
    if s in {"PARTIAL_CLOSE", "REDUCE", "SCALE_OUT"}:
        return "PARTIAL_CLOSE"

    # 修改止损
    if s in {"MODIFY_SL", "MODIFY_STOP_LOSS", "TRAIL_SL", "MOVE_SL"}:
        return "MODIFY_STOP_LOSS"

    # 修改止盈
    if s in {"MODIFY_TP", "MODIFY_TAKE_PROFIT", "MOVE_TP"}:
        return "MODIFY_TAKE_PROFIT"

    # 持有
    if s in {"HOLD", "WAIT", "WATCH"}:
        return "HOLD"

    return s


def normalize_action_payload(action: Any) -> Any:
    """
    规范化 action payload

    确保所有必要字段存在
    """
    if not isinstance(action, dict):
        return {}

    result = {
        "type": canonical_action_type(action.get("type")),
        "symbol": str(action.get("symbol", "")).strip().upper(),
        "reason": str(action.get("reason", "")).strip(),
    }

    # 根据类型添加特定字段
    action_type = result["type"]

    if action_type == "OPEN":
        result["side"] = str(action.get("side", "")).strip().upper()
        result["quantity"] = safe_float(action.get("quantity"), 0)
        result["stop_loss"] = first_float(action.get("stop_loss"))
        result["take_profit"] = first_float(action.get("take_profit"))
        result["order_type"] = str(action.get("order_type", "MARKET")).strip().upper()

    elif action_type == "CLOSE":
        result["quantity"] = safe_float(action.get("quantity"), 0)

    elif action_type == "PARTIAL_CLOSE":
        result["close_ratio"] = safe_float(action.get("close_ratio"), 0.5)

    elif action_type == "MODIFY_STOP_LOSS":
        result["new_sl"] = first_float(action.get("new_sl"))

    elif action_type == "MODIFY_TAKE_PROFIT":
        result["new_tp"] = first_float(action.get("new_tp"))

    return result
