"""
K线（Bar）分析工具函数

包含：
- K线范围计算
- K线数据压缩
- 连续动量检测
- K线统计分析
"""

from typing import Any

from .parsing import safe_float


def bar_range(bar: dict[str, Any]) -> float:
    """
    计算K线范围（高-低）

    Args:
        bar: K线数据字典

    Returns:
        K线范围
    """
    return safe_float(bar.get("H")) - safe_float(bar.get("L"))


def compact_bar_record(bar: dict[str, Any]) -> dict[str, Any]:
    """
    压缩K线记录，只保留关键字段

    Args:
        bar: K线数据字典

    Returns:
        压缩后的K线数据
    """
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


def recent_continuation_momentum(recent_bars: list[dict[str, Any]]) -> bool:
    """
    检测最近K线是否有连续动量

    连续动量定义：
    - 最近3根K线
    - 每根K线实体 >= 50% 范围
    - 方向一致（全部看涨或全部看跌）

    Args:
        recent_bars: 最近的K线列表

    Returns:
        是否有连续动量
    """
    if not isinstance(recent_bars, list) or len(recent_bars) < 3:
        return False
    sample = [item for item in recent_bars[-3:] if isinstance(item, dict)]
    if len(sample) < 3:
        return False
    directions: list[int] = []
    for bar in sample:
        body = safe_float(bar.get("C")) - safe_float(bar.get("O"))
        rng = max(bar_range(bar), 0.0)
        if rng <= 0:
            return False
        if abs(body) < rng * 0.5:
            return False
        directions.append(1 if body > 0 else -1)
    return abs(sum(directions)) == 3


def recent_bar_stats(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """
    计算K线统计数据

    Args:
        bars: K线列表

    Returns:
        统计数据字典，包含：
        - count: K线数量
        - from/to: 时间范围
        - net_change: 净变化
        - bull_bars/bear_bars/doji_bars: 各类型K线数量
        - bars_above_ema: EMA上方K线数量
        - high/low: 最高/最低价
        - avg_range: 平均范围
    """
    valid = [bar for bar in bars if isinstance(bar, dict)]
    if not valid:
        return {}

    bull = 0
    bear = 0
    doji = 0
    above_ema = 0
    ranges: list[float] = []
    for bar in valid:
        body_text = str(bar.get("body") or "")
        if "bull" in body_text:
            bull += 1
        elif "bear" in body_text:
            bear += 1
        else:
            doji += 1
        vs_ema = bar.get("vs_ema20")
        if isinstance(vs_ema, str):
            try:
                if float(vs_ema.split()[0]) >= 0:
                    above_ema += 1
            except ValueError:
                pass
        ranges.append(bar_range(bar))

    first_bar = valid[0]
    last_bar = valid[-1]
    first_open = safe_float(first_bar.get("O"))
    last_close = safe_float(last_bar.get("C"))
    net_change = last_close - first_open
    avg_range = sum(ranges) / len(ranges) if ranges else 0.0

    return {
        "count": len(valid),
        "from": first_bar.get("time"),
        "to": last_bar.get("time"),
        "net_change": round(net_change, 2),
        "bull_bars": bull,
        "bear_bars": bear,
        "doji_bars": doji,
        "bars_above_ema": above_ema,
        "high": round(max(safe_float(bar.get("H")) for bar in valid), 2),
        "low": round(min(safe_float(bar.get("L")) for bar in valid), 2),
        "avg_range": round(avg_range, 2),
    }


def compact_stats_for_prompt(stats: dict[str, Any]) -> dict[str, Any]:
    """
    压缩统计数据用于 Prompt

    Args:
        stats: 统计数据字典

    Returns:
        压缩后的统计数据
    """
    if not isinstance(stats, dict):
        return {}
    payload = {
        "count": stats.get("count"),
        "from": stats.get("from"),
        "to": stats.get("to"),
        "net_change": stats.get("net_change"),
        "bull_bars": stats.get("bull_bars"),
        "bear_bars": stats.get("bear_bars"),
        "doji_bars": stats.get("doji_bars"),
        "bars_above_ema": stats.get("bars_above_ema"),
        "high": stats.get("high"),
        "low": stats.get("low"),
        "avg_range": stats.get("avg_range"),
    }
    return {key: value for key, value in payload.items() if value not in (None, "", [], {})}
