"""格式化工具函数"""

import json
from typing import Any

from .parsing import first_float, parse_structured_value


def truncate_text(value: Any, limit: int = 220) -> Any:
    """截断文本到指定长度"""
    if not isinstance(value, str):
        return value
    text = value.strip()
    if limit <= 0 or len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def compact_json(data: Any, limit: int = 12000) -> str:
    """压缩 JSON，超过限制时使用紧凑格式"""
    pretty = json.dumps(data, ensure_ascii=False, indent=2)
    if limit and len(pretty) > limit:
        shrunk = shrink_prompt_value(data)
        return json.dumps(shrunk, ensure_ascii=False, separators=(",", ":"))
    return pretty


def shrink_prompt_value(value: Any, depth: int = 0) -> Any:
    """按层级收缩 Prompt 负载，避免文本过长。"""
    if isinstance(value, str):
        if depth <= 1:
            return truncate_text(value, 280)
        if depth == 2:
            return truncate_text(value, 180)
        return truncate_text(value, 120)
    if isinstance(value, list):
        if depth == 0:
            limit = 8
        elif depth == 1:
            limit = 6
        else:
            limit = 4
        return [shrink_prompt_value(item, depth + 1) for item in value[:limit]]
    if isinstance(value, dict):
        items = list(value.items())
        if depth == 0:
            limit = len(items)
        elif depth == 1:
            limit = 10
        elif depth == 2:
            limit = 8
        else:
            limit = 6
        return {key: shrink_prompt_value(item, depth + 1) for key, item in items[:limit]}
    return value


def format_ai_direction_text(value: Any) -> str:
    """格式化 AI 方向文本"""
    parsed = parse_structured_value(value)
    if isinstance(parsed, dict):
        direction = str(parsed.get("value") or parsed.get("direction") or "-").strip() or "-"
        confidence = str(parsed.get("confidence") or "").strip()
        detail = str(parsed.get("detail") or parsed.get("summary") or "").strip()
        head = direction if not confidence else f"{direction}（{confidence}）"
        return head if not detail else f"{head}｜{truncate_text(detail, 90)}"
    return truncate_text(value, 90) if value not in (None, "") else "-"


def normalize_trade_side(value: Any) -> str:
    """标准化交易方向"""
    text = str(value or "").strip().upper()
    if not text:
        return ""
    if any(token in text for token in {"BUY", "LONG", "做多".upper()}):
        return "BUY"
    if any(token in text for token in {"SELL", "SHORT", "做空".upper()}):
        return "SELL"
    if any(token in text for token in {"WAIT", "WATCH", "观察".upper()}):
        return "WAIT"
    return text


def format_trigger_prices_text(value: Any) -> str:
    """格式化触发价格文本"""
    parsed = parse_structured_value(value)
    if not isinstance(parsed, dict):
        return "-"
    parts: list[str] = []

    def _zone_text(label: str, raw: Any) -> str:
        if isinstance(raw, list) and len(raw) >= 2:
            left = first_float(raw[0])
            right = first_float(raw[1])
            if left is not None and right is not None:
                lo, hi = sorted((left, right))
                return f"{label} {lo}-{hi}"
        point = first_float(raw)
        if point is not None:
            return f"{label} {point}"
        return ""

    entry = first_float(parsed.get("entry"))
    stop_loss = first_float(parsed.get("stop_loss"))
    take_profit = first_float(parsed.get("take_profit"))
    if entry is not None:
        parts.append(f"入 {entry}")
    if stop_loss is not None:
        parts.append(f"止 {stop_loss}")
    if take_profit is not None:
        parts.append(f"目标 {take_profit}")
    for key, label in (
        ("entry_zone", "入场区"),
        ("retest_zone", "回测区"),
        ("breakout_zone", "突破区"),
        ("breakdown_zone", "跌破区"),
        ("breakout", "突破点"),
        ("breakdown", "跌破点"),
        ("reversal_below", "失守点"),
    ):
        zone = _zone_text(label, parsed.get(key))
        if zone and zone not in parts:
            parts.append(zone)
    return " / ".join(parts) if parts else "-"


def format_pre_signal_text(value: Any) -> str:
    """格式化预信号文本"""
    parsed = parse_structured_value(value)
    if isinstance(parsed, dict):
        direction = {"short": "做空观察", "long": "做多观察"}.get(
            str(parsed.get("direction") or "").lower(),
            str(parsed.get("direction") or "").strip(),
        )
        condition = str(parsed.get("condition") or "").strip()
        price_text = format_trigger_prices_text(parsed.get("trigger_price"))
        invalid_if = str(parsed.get("invalid_if") or "").strip()
        parts = [item for item in [direction, condition] if item]
        if price_text != "-":
            parts.append(price_text)
        if invalid_if:
            parts.append(f"失效: {invalid_if}")
        return "｜".join(parts) if parts else "-"
    return truncate_text(value, 180) if value not in (None, "") else "-"


def format_gate_message(value: Any) -> str:
    """格式化门槛消息"""
    text = str(value or "").strip()
    if not text:
        return "-"
    for raw in text.splitlines():
        line = raw.strip().lstrip("•").strip()
        if not line:
            continue
        if "P×R" in line or "门槛" in line or "拒绝" in line or "blocked" in line.lower():
            return truncate_text(line, 120)
    return truncate_text(text, 120)


# 动作类型别名映射
ACTION_TYPE_ALIASES = {
    "ADD_ON": "OPEN_ORDER",
    "SCALE_IN": "OPEN_ORDER",
    "PYRAMID_ADD": "OPEN_ORDER",
    "REENTER": "OPEN_ORDER",
    "REENTRY": "OPEN_ORDER",
    "TP1_REDUCE": "PARTIAL_CLOSE",
    "TP2_REDUCE": "PARTIAL_CLOSE",
    "TAKE_PROFIT_REDUCE": "PARTIAL_CLOSE",
    "REDUCE_POSITION": "PARTIAL_CLOSE",
    "MOVE_STOP": "MODIFY_STOP_LOSS",
    "MOVE_STOP_TO_BREAKEVEN": "MODIFY_STOP_LOSS",
    "BREAKEVEN_STOP": "MODIFY_STOP_LOSS",
    "TRAIL_STOP": "MODIFY_STOP_LOSS",
    "MOVE_TP": "MODIFY_TAKE_PROFIT",
    "MOVE_TAKE_PROFIT": "MODIFY_TAKE_PROFIT",
    "ADJUST_TP": "MODIFY_TAKE_PROFIT",
    "TP_UPDATE": "MODIFY_TAKE_PROFIT",
    "CANCEL_PENDING_ENTRY": "CANCEL_ALL_ORDERS",
    "CANCEL_PENDING_ORDERS": "CANCEL_ALL_ORDERS",
    "CANCEL_STALE_ORDERS": "CANCEL_ALL_ORDERS",
    "EXIT_ALL": "CLOSE_POSITION",
    "FLATTEN": "CLOSE_POSITION",
}


def canonical_action_type(value: Any) -> str:
    """标准化动作类型"""
    raw = str(value or "").strip().upper()
    if not raw:
        return raw
    return ACTION_TYPE_ALIASES.get(raw, raw)


def normalize_action_payload(action: Any) -> Any:
    """标准化动作载荷"""
    if not isinstance(action, dict):
        return action
    normalized = dict(action)
    raw_type = str(normalized.get("type") or "").strip().upper()
    canonical = canonical_action_type(raw_type)
    if canonical and canonical != raw_type:
        normalized["type"] = canonical
        normalized.setdefault("raw_type", raw_type)
        if canonical == "OPEN_ORDER" and raw_type in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD", "REENTER", "REENTRY"}:
            normalized.setdefault("intent", raw_type)
        partial_close_aliases = {"TP1_REDUCE", "TP2_REDUCE", "TAKE_PROFIT_REDUCE", "REDUCE_POSITION"}
        stop_loss_aliases = {"MOVE_STOP", "MOVE_STOP_TO_BREAKEVEN", "BREAKEVEN_STOP", "TRAIL_STOP"}
        if canonical == "PARTIAL_CLOSE" and raw_type in partial_close_aliases:
            normalized.setdefault("intent", raw_type)
        if canonical == "MODIFY_STOP_LOSS" and raw_type in stop_loss_aliases:
            normalized.setdefault("intent", raw_type)
        if canonical == "MODIFY_TAKE_PROFIT" and raw_type in {"MOVE_TP", "MOVE_TAKE_PROFIT", "ADJUST_TP", "TP_UPDATE"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "CANCEL_ALL_ORDERS":
            normalized.setdefault("intent", raw_type)
    return normalized
