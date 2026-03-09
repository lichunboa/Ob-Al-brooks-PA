"""
事件检测工具函数

用于检测和分类各种市场事件
"""

from __future__ import annotations

from typing import Any


def event_has_prefix(events: list[str], prefixes: tuple[str, ...]) -> bool:
    """检查事件列表中是否有指定前缀的事件"""
    if not events:
        return False
    return any(e.startswith(prefixes) for e in events)


def event_has_exact(events: list[str], names: set[str]) -> bool:
    """检查事件列表中是否有精确匹配的事件"""
    if not events:
        return False
    return any(e in names for e in events)


def signal_event_ranks(events: list[str]) -> list[tuple[str, int]]:
    """
    对信号事件进行排序

    返回：[(event, rank), ...]
    rank 越小优先级越高
    """
    rank_map = {
        "signal_trigger": 0,  # 最高优先级
        "h2_trigger": 1,
        "l2_trigger": 1,
        "h1_trigger": 2,
        "l1_trigger": 2,
        "ema_touch": 3,
        "first_pb": 3,
        "tr_edge": 4,
        "pb_depth": 5,
        "hl_signal": 6,
        "wedge_or_mtr": 7,
        "momentum_fading": 8,
        "anomaly": 9,
    }

    result = []
    for event in events:
        rank = rank_map.get(event, 99)
        result.append((event, rank))

    # 按 rank 排序
    result.sort(key=lambda x: x[1])
    return result


def has_second_entry_signal(events: list[str]) -> bool:
    """检查是否有二次入场信号（H2/L2）"""
    return event_has_exact(events, {"h2_trigger", "l2_trigger"})


def has_first_entry_signal(events: list[str]) -> bool:
    """检查是否有首次入场信号（H1/L1）"""
    return event_has_exact(events, {"h1_trigger", "l1_trigger"})


def classify_primary_s6_reference(state: str, events: list[str]) -> str:
    """
    根据市场状态和事件分类，确定应该参考哪个 S6 文件

    返回：
    - "S6-bo": BO/Spike 状态
    - "S6-channel": TC/BC 状态
    - "S6-tr": TR 状态
    - "S6-reversal": 反转信号
    - "S6-common": 通用规则
    """
    state_upper = state.upper()

    # 优先检查反转信号
    if event_has_exact(events, {"wedge_or_mtr", "climax_suspected"}):
        return "S6-reversal"

    # 根据状态路由
    if "BO" in state_upper or "SPIKE" in state_upper:
        return "S6-bo"

    if "TC" in state_upper or "BC" in state_upper or "CHANNEL" in state_upper:
        return "S6-channel"

    if "TR" in state_upper:
        return "S6-tr"

    # 默认通用规则
    return "S6-common"


def infer_signal_timeframe(*values: Any) -> str:
    """
    从各种输入中推断信号周期

    输入可能是：
    - 字符串："5m"
    - 字典：{"timeframe": "5m"}
    - 列表：["5m", "15m"]
    """
    for value in values:
        if not value:
            continue

        if isinstance(value, str):
            s = value.strip().lower()
            if s in {"5m", "15m", "30m", "1h", "4h", "1d"}:
                return s

        if isinstance(value, dict):
            tf = value.get("timeframe", "")
            if tf:
                s = str(tf).strip().lower()
                if s in {"5m", "15m", "30m", "1h", "4h", "1d"}:
                    return s

        if isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    s = item.strip().lower()
                    if s in {"5m", "15m", "30m", "1h", "4h", "1d"}:
                        return s

    return "5m"  # 默认 5m


def cap_status(current_status: Any, max_status: str) -> str:
    """
    限制状态不超过最大值

    状态优先级：watching < pre_signal < candidate < executable < planned_trade < in_trade

    例如：cap_status("executable", "candidate") → "candidate"
    """
    status_order = [
        "watching",
        "pre_signal",
        "candidate",
        "executable",
        "planned_trade",
        "in_trade",
    ]

    current = str(current_status).strip().lower()
    max_val = max_status.strip().lower()

    if current not in status_order:
        return current

    if max_val not in status_order:
        return current

    current_idx = status_order.index(current)
    max_idx = status_order.index(max_val)

    if current_idx > max_idx:
        return max_val

    return current


def has_trade_plan(base: dict[str, Any]) -> bool:
    """
    检查是否有完整的交易计划

    必须包含：
    - side (BUY/SELL)
    - stop_loss
    - take_profit
    """
    if not base:
        return False

    side = base.get("side", "")
    stop_loss = base.get("stop_loss")
    take_profit = base.get("take_profit")

    return bool(side) and stop_loss is not None and take_profit is not None


def is_state_change_event(events: list[str]) -> bool:
    """检查是否有状态变化事件"""
    state_change_keywords = {
        "state_change",
        "bo_start",
        "tr_start",
        "channel_start",
        "climax_suspected",
    }
    return event_has_exact(events, state_change_keywords)


def is_level_break_event(events: list[str]) -> bool:
    """检查是否有关键位突破事件"""
    level_break_keywords = {
        "level_break",
        "resistance_break",
        "support_break",
        "hl_signal",
        "lh_signal",
    }
    return event_has_exact(events, level_break_keywords)


def is_momentum_event(events: list[str]) -> bool:
    """检查是否有动量事件"""
    momentum_keywords = {
        "momentum",
        "momentum_fading",
        "acceleration",
        "deceleration",
    }
    return event_has_exact(events, momentum_keywords)


def is_anomaly_event(events: list[str]) -> bool:
    """检查是否有异常事件"""
    anomaly_keywords = {
        "anomaly",
        "large_bar",
        "gap",
        "spike",
    }
    return event_has_exact(events, anomaly_keywords)
