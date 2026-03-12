"""
市场分析模块

为回测引擎提供 AI 方向、市场状态、结构分析等数据。
"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float


def calculate_ema(bars: list, period: int = 20) -> float:
    """计算 EMA"""
    if len(bars) < period:
        # 不足时用 SMA
        closes = [safe_float(getattr(b, "close", 0), 0) for b in bars]
        return sum(closes) / len(closes) if closes else 0.0

    closes = [safe_float(getattr(b, "close", 0), 0) for b in bars[-period:]]
    multiplier = 2 / (period + 1)
    ema = closes[0]

    for close in closes[1:]:
        ema = (close - ema) * multiplier + ema

    return ema


def detect_ai_direction(bars: list) -> str:
    """
    检测 AI 方向

    规则：
    - 价格在 EMA20 上方 + 最近 5 根 K 线多数收阳 → AIL
    - 价格在 EMA20 下方 + 最近 5 根 K 线多数收阴 → AIS
    - 其他 → NEUTRAL
    """
    if len(bars) < 20:
        return "NEUTRAL"

    ema20 = calculate_ema(bars, 20)
    last_bar = bars[-1]
    current_price = safe_float(getattr(last_bar, "close", 0), 0)

    # 检查最近 5 根 K 线
    recent_5 = bars[-5:]
    bull_count = sum(1 for b in recent_5 if getattr(b, "close", 0) > getattr(b, "open", 0))
    bear_count = sum(1 for b in recent_5 if getattr(b, "close", 0) < getattr(b, "open", 0))

    if current_price > ema20 and bull_count >= 3:
        return "AIL (Always-In Long)"
    elif current_price < ema20 and bear_count >= 3:
        return "AIS (Always-In Short)"
    else:
        return "NEUTRAL"


def detect_market_state(bars: list) -> str:
    """
    检测市场状态

    规则：
    - 连续 3+ 根同向 K 线 + 突破 EMA → BO (Breakout)
    - 价格在 EMA 附近震荡 → TR (Trading Range)
    - 价格沿 EMA 运行 → TC (Tight Channel)
    - 其他 → BC (Broad Channel)
    """
    if len(bars) < 20:
        return "UNKNOWN"

    ema20 = calculate_ema(bars, 20)
    recent_10 = bars[-10:]

    # 检查是否突破
    last_bar = recent_10[-1]
    current_price = safe_float(getattr(last_bar, "close", 0), 0)
    distance_from_ema = abs(current_price - ema20) / ema20 * 100

    # 检查连续同向 K 线
    bull_streak = 0
    bear_streak = 0
    for b in reversed(recent_10):
        if getattr(b, "close", 0) > getattr(b, "open", 0):
            bull_streak += 1
            bear_streak = 0
        elif getattr(b, "close", 0) < getattr(b, "open", 0):
            bear_streak += 1
            bull_streak = 0
        else:
            break

    # 判断状态
    if (bull_streak >= 3 or bear_streak >= 3) and distance_from_ema > 0.5:
        return "BO (Breakout)"
    elif distance_from_ema < 0.2:
        return "TR (Trading Range)"
    elif distance_from_ema < 0.5:
        return "TC (Tight Channel)"
    else:
        return "BC (Broad Channel)"


def find_structure_points(bars: list) -> dict[str, Any]:
    """
    查找结构点（Major HL/LH）

    规则：
    - Major HL: 最近 20 根 K 线的最低点
    - Major LH: 最近 20 根 K 线的最高点
    """
    if len(bars) < 20:
        return {"major_hl": 0.0, "major_lh": 0.0}

    recent_20 = bars[-20:]
    lows = [safe_float(getattr(b, "low", 0), 0) for b in recent_20]
    highs = [safe_float(getattr(b, "high", 0), 0) for b in recent_20]

    return {
        "major_hl": min(lows) if lows else 0.0,
        "major_lh": max(highs) if highs else 0.0,
    }


def analyze_market(bars: list, position: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    综合市场分析

    Returns:
        {
            "ai_direction": str,
            "ab_state": {
                "state": str,
                "market_state": str,
                "ema20": float,
            },
            "ab_ema": {
                "ema20": float,
            },
            "ab_sr": {
                "major_hl": float,
                "major_lh": float,
            },
            "current_price": float,
            "recent_bars": list,
        }
    """
    if not bars:
        return {
            "ai_direction": "NEUTRAL",
            "ab_state": {"state": "UNKNOWN", "market_state": "UNKNOWN", "ema20": 0.0},
            "ab_ema": {"ema20": 0.0},
            "ab_sr": {"major_hl": 0.0, "major_lh": 0.0},
            "current_price": 0.0,
            "recent_bars": [],
        }

    ai_direction = detect_ai_direction(bars)
    market_state = detect_market_state(bars)
    ema20 = calculate_ema(bars, 20)
    structure = find_structure_points(bars)

    last_bar = bars[-1]
    current_price = safe_float(getattr(last_bar, "close", 0), 0)

    # 将 BacktestBar 对象转为 dict
    recent_bars_window = bars[-20:] if len(bars) >= 20 else bars
    recent_bars_dicts = []
    for bar in recent_bars_window:
        recent_bars_dicts.append({
            "time": getattr(bar, "time", ""),
            "O": safe_float(getattr(bar, "open", 0), 0),
            "H": safe_float(getattr(bar, "high", 0), 0),
            "L": safe_float(getattr(bar, "low", 0), 0),
            "C": safe_float(getattr(bar, "close", 0), 0),
            "V": safe_float(getattr(bar, "volume", 0), 0),
        })

    return {
        "ai_direction": ai_direction,
        "ab_state": {
            "state": market_state,
            "market_state": market_state,
            "ema20": ema20,
        },
        "ab_ema": {
            "ema20": ema20,
        },
        "ab_sr": {
            "major_hl": structure["major_hl"],
            "major_lh": structure["major_lh"],
        },
        "current_price": current_price,
        "recent_bars": recent_bars_dicts,
    }
