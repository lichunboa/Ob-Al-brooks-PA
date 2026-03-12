"""解析工具函数"""
import re
from datetime import UTC, datetime
from typing import Any


def parse_dt(raw: str | None) -> datetime | None:
    """解析 ISO 格式的日期时间字符串"""
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
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def safe_float(value: Any, default: float = 0.0) -> float:
    """安全转换为浮点数"""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_refs(refs: Any) -> list[str]:
    """标准化引用列表"""
    if isinstance(refs, list):
        return [str(item).strip() for item in refs if str(item).strip()]
    if isinstance(refs, str):
        return [part.strip() for part in refs.split(",") if part.strip()]
    return []


def first_float(value: Any, default: float | None = None) -> float | None:
    """从字符串中提取第一个浮点数"""
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
    """从字符串中提取所有浮点数"""
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


def parse_structured_value(value: Any) -> Any:
    """解析结构化值（JSON 字符串或字典）"""
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text:
        return None
    if text.startswith("{") or text.startswith("["):
        try:
            import json
            return json.loads(text)
        except (ValueError, TypeError):
            return text
    return text
