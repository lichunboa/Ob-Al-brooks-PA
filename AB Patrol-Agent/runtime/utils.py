"""
工具函数模块

提供通用的工具函数：
- 时间处理
- 文件操作
- 数据转换
- 格式化
"""

from __future__ import annotations

import ast
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


# ============================================================
# 时间处理
# ============================================================

def utc_now() -> datetime:
    """获取当前 UTC 时间"""
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    """获取当前 UTC 时间的 ISO 格式字符串"""
    return utc_now().isoformat()


def parse_dt(raw: str | None) -> datetime | None:
    """解析时间字符串为 datetime 对象"""
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


# ============================================================
# 文件操作
# ============================================================

def ensure_dir(path: Path) -> None:
    """确保目录存在"""
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: Any) -> Any:
    """加载 JSON 文件"""
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_text(path: Path, text: str) -> None:
    """写入文本文件（原子操作）"""
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + f".{uuid.uuid4().hex}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_json(path: Path, payload: Any) -> None:
    """写入 JSON 文件"""
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    """追加 JSONL 行"""
    ensure_dir(path.parent)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


# ============================================================
# 数据转换
# ============================================================

def safe_float(value: Any, default: float = 0.0) -> float:
    """安全转换为 float"""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_refs(refs: Any) -> list[str]:
    """规范化引用列表"""
    if isinstance(refs, list):
        return [str(item).strip() for item in refs if str(item).strip()]
    if isinstance(refs, str):
        return [part.strip() for part in refs.split(",") if part.strip()]
    return []


def first_float(value: Any, default: float | None = None) -> float | None:
    """提取第一个浮点数"""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return default
    try:
        return float(match.group(0))
    except ValueError:
        return default


def all_floats(value: Any) -> list[float]:
    """提取所有浮点数"""
    if value is None:
        return []
    if isinstance(value, (int, float)):
        return [float(value)]
    text = str(value)
    items: list[float] = []
    for match in re.findall(r"-?\d+(?:\.\d+)?", text):
        try:
            items.append(float(match))
        except ValueError:
            continue
    return items


def truncate_text(value: Any, limit: int = 220) -> Any:
    """截断文本"""
    if not isinstance(value, str):
        return value
    text = value.strip()
    if limit <= 0 or len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def parse_structured_value(value: Any) -> Any:
    """解析结构化值（JSON 或 Python literal）"""
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text or text[0] not in "{[":
        return value
    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(text)
        except Exception:
            continue
        if isinstance(parsed, (dict, list)):
            return parsed
    return value


def compact_json(data: Any, limit: int = 12000) -> str:
    """压缩 JSON（超过限制时缩减）"""
    pretty = json.dumps(data, ensure_ascii=False, indent=2)
    if limit and len(pretty) > limit:
        shrunk = shrink_prompt_value(data)
        return json.dumps(shrunk, ensure_ascii=False, separators=(",", ":"))
    return pretty


def shrink_prompt_value(value: Any, depth: int = 0) -> Any:
    """递归缩减值的大小"""
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


# ============================================================
# 格式化
# ============================================================

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
    """规范化交易方向"""
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


# ============================================================
# 动作类型规范化
# ============================================================

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
    """规范化动作类型"""
    raw = str(value or "").strip().upper()
    if not raw:
        return raw
    return ACTION_TYPE_ALIASES.get(raw, raw)


def normalize_action_payload(action: Any) -> Any:
    """规范化动作载荷"""
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
        if canonical == "PARTIAL_CLOSE" and raw_type in {"TP1_REDUCE", "TP2_REDUCE", "TAKE_PROFIT_REDUCE", "REDUCE_POSITION"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "MODIFY_STOP_LOSS" and raw_type in {"MOVE_STOP", "MOVE_STOP_TO_BREAKEVEN", "BREAKEVEN_STOP", "TRAIL_STOP"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "MODIFY_TAKE_PROFIT" and raw_type in {"MOVE_TP", "MOVE_TAKE_PROFIT", "ADJUST_TP", "TP_UPDATE"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "CANCEL_ALL_ORDERS":
            normalized.setdefault("intent", raw_type)
    return normalized


# ============================================================
# K线工具
# ============================================================

def bar_range(bar: dict[str, Any]) -> float:
    """计算 K线范围"""
    return safe_float(bar.get("H")) - safe_float(bar.get("L"))


def compact_bar_record(bar: dict[str, Any]) -> dict[str, Any]:
    """压缩 K线记录"""
    payload = {
        "time": bar.get("time"),
        "O": bar.get("O"),
        "H": bar.get("H"),
        "L": bar.get("L"),
        "C": bar.get("C"),
        "body": bar.get("body"),
        "bar_type": bar.get("bar_type"),
        "ema20": bar.get("ema20"),
        "vs_ema20": bar.get("vs_ema20"),
    }
    return {key: value for key, value in payload.items() if value not in (None, "")}
