"""
K 线分析工具函数

用于分析 K 线数据，提取特征
"""

from __future__ import annotations

from typing import Any


def bar_range(bar: dict[str, Any]) -> float:
    """计算 K 线的振幅（高-低）"""
    high = bar.get("H", bar.get("high", 0))
    low = bar.get("L", bar.get("low", 0))
    return float(high) - float(low)


def compact_bar_record(bar: dict[str, Any]) -> dict[str, Any]:
    """
    压缩 K 线记录

    只保留必要字段，减少内存占用
    """
    return {
        "T": bar.get("T", bar.get("time", "")),
        "O": float(bar.get("O", bar.get("open", 0))),
        "H": float(bar.get("H", bar.get("high", 0))),
        "L": float(bar.get("L", bar.get("low", 0))),
        "C": float(bar.get("C", bar.get("close", 0))),
        "V": float(bar.get("V", bar.get("volume", 0))),
    }


def recent_continuation_momentum(recent_bars: list[dict[str, Any]]) -> bool:
    """
    检查最近是否有持续动量

    定义：最近 3 根 K 线同向且振幅递增
    """
    if len(recent_bars) < 3:
        return False

    last_3 = recent_bars[-3:]

    # 检查方向一致性
    closes = [float(b.get("C", b.get("close", 0))) for b in last_3]
    opens = [float(b.get("O", b.get("open", 0))) for b in last_3]

    # 都是阳线或都是阴线
    all_bull = all(c > o for c, o in zip(closes, opens))
    all_bear = all(c < o for c, o in zip(closes, opens))

    if not (all_bull or all_bear):
        return False

    # 检查振幅递增
    ranges = [bar_range(b) for b in last_3]
    return ranges[1] > ranges[0] and ranges[2] > ranges[1]


def recent_bar_stats(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """
    计算最近 K 线的统计数据

    返回：
    - avg_range: 平均振幅
    - max_range: 最大振幅
    - min_range: 最小振幅
    - bull_count: 阳线数量
    - bear_count: 阴线数量
    - avg_volume: 平均成交量
    """
    if not bars:
        return {
            "avg_range": 0.0,
            "max_range": 0.0,
            "min_range": 0.0,
            "bull_count": 0,
            "bear_count": 0,
            "avg_volume": 0.0,
        }

    ranges = [bar_range(b) for b in bars]
    volumes = [float(b.get("V", b.get("volume", 0))) for b in bars]

    bull_count = 0
    bear_count = 0

    for b in bars:
        close = float(b.get("C", b.get("close", 0)))
        open_price = float(b.get("O", b.get("open", 0)))
        if close > open_price:
            bull_count += 1
        elif close < open_price:
            bear_count += 1

    return {
        "avg_range": sum(ranges) / len(ranges),
        "max_range": max(ranges),
        "min_range": min(ranges),
        "bull_count": bull_count,
        "bear_count": bear_count,
        "avg_volume": sum(volumes) / len(volumes) if volumes else 0.0,
    }


def compact_stats_for_prompt(stats: dict[str, Any]) -> dict[str, Any]:
    """
    压缩统计数据用于 prompt

    只保留关键字段，格式化为易读形式
    """
    return {
        "avg_range": f"{stats.get('avg_range', 0):.2f}",
        "bull_bear": f"{stats.get('bull_count', 0)}/{stats.get('bear_count', 0)}",
        "max_range": f"{stats.get('max_range', 0):.2f}",
    }


def is_large_bar(bar: dict[str, Any], avg_range: float, threshold: float = 2.0) -> bool:
    """
    判断是否是大 K 线

    定义：振幅 > 平均振幅 × threshold
    """
    if avg_range <= 0:
        return False

    return bar_range(bar) > avg_range * threshold


def is_doji(bar: dict[str, Any], avg_range: float, threshold: float = 0.3) -> bool:
    """
    判断是否是十字星

    定义：实体 < 平均振幅 × threshold
    """
    if avg_range <= 0:
        return False

    close = float(bar.get("C", bar.get("close", 0)))
    open_price = float(bar.get("O", bar.get("open", 0)))
    body = abs(close - open_price)

    return body < avg_range * threshold


def bar_body_ratio(bar: dict[str, Any]) -> float:
    """
    计算 K 线实体占比

    返回：实体 / 振幅（0-1）
    """
    range_val = bar_range(bar)
    if range_val <= 0:
        return 0.0

    close = float(bar.get("C", bar.get("close", 0)))
    open_price = float(bar.get("O", bar.get("open", 0)))
    body = abs(close - open_price)

    return body / range_val


def has_long_upper_shadow(bar: dict[str, Any], threshold: float = 0.6) -> bool:
    """
    判断是否有长上影线

    定义：上影线 > 振幅 × threshold
    """
    range_val = bar_range(bar)
    if range_val <= 0:
        return False

    high = float(bar.get("H", bar.get("high", 0)))
    close = float(bar.get("C", bar.get("close", 0)))
    open_price = float(bar.get("O", bar.get("open", 0)))

    upper_shadow = high - max(close, open_price)

    return upper_shadow > range_val * threshold


def has_long_lower_shadow(bar: dict[str, Any], threshold: float = 0.6) -> bool:
    """
    判断是否有长下影线

    定义：下影线 > 振幅 × threshold
    """
    range_val = bar_range(bar)
    if range_val <= 0:
        return False

    low = float(bar.get("L", bar.get("low", 0)))
    close = float(bar.get("C", bar.get("close", 0)))
    open_price = float(bar.get("O", bar.get("open", 0)))

    lower_shadow = min(close, open_price) - low

    return lower_shadow > range_val * threshold
