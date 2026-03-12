"""
事件分析工具函数

包含：
- 事件前缀匹配
- 事件精确匹配
- 信号事件排名
- 入场信号检测
"""

import re

# 信号事件模式：signal_trigger:H2 或 hl_signal:L1
SIGNAL_EVENT_PATTERN = re.compile(r"^(?:signal_trigger|hl_signal):([HL])(\d+)")


def event_has_prefix(events: list[str], prefixes: tuple[str, ...]) -> bool:
    """
    检查事件列表中是否有指定前缀的事件

    Args:
        events: 事件列表
        prefixes: 前缀元组

    Returns:
        是否存在匹配的事件
    """
    return any(str(event).startswith(prefixes) for event in events)


def event_has_exact(events: list[str], names: set[str]) -> bool:
    """
    检查事件列表中是否有精确匹配的事件

    Args:
        events: 事件列表
        names: 事件名称集合

    Returns:
        是否存在匹配的事件
    """
    return any(str(event) in names for event in events)


def signal_event_ranks(events: list[str]) -> list[tuple[str, int]]:
    """
    提取信号事件的排名

    从事件列表中提取 signal_trigger:H2 或 hl_signal:L1 格式的事件，
    返回方向（H/L）和排名（数字）

    Args:
        events: 事件列表

    Returns:
        (方向, 排名) 元组列表
        例如：[('H', 2), ('L', 1)]
    """
    ranks: list[tuple[str, int]] = []
    for event in events:
        match = SIGNAL_EVENT_PATTERN.match(str(event or "").strip())
        if not match:
            continue
        ranks.append((match.group(1), int(match.group(2))))
    return ranks


def has_second_entry_signal(events: list[str]) -> bool:
    """
    检查是否有二次入场信号（排名 >= 2）

    Args:
        events: 事件列表

    Returns:
        是否有二次入场信号
    """
    return any(rank >= 2 for _, rank in signal_event_ranks(events))


def has_first_entry_signal(events: list[str]) -> bool:
    """
    检查是否有首次入场信号（排名 == 1）

    Args:
        events: 事件列表

    Returns:
        是否有首次入场信号
    """
    return any(rank == 1 for _, rank in signal_event_ranks(events))
