"""
EMA 计算

Al Brooks: "EMA20 is the most important indicator. 99.5% of time price will touch it."
"""

from typing import List
from ..models import Candle


def calculate_ema(candles: List[Candle], period: int = 20) -> List[float]:
    """
    计算 EMA

    Args:
        candles: K线列表
        period: 周期（默认20）

    Returns:
        每根K线的EMA值
    """
    if len(candles) < period:
        return [candles[0].close] * len(candles)

    ema_values = []
    multiplier = 2 / (period + 1)

    # 第一个EMA = SMA
    sma = sum(c.close for c in candles[:period]) / period
    ema_values.append(sma)

    # 后续EMA
    for i in range(1, len(candles)):
        if i < period:
            ema_values.append(sma)
        else:
            ema = (candles[i].close - ema_values[-1]) * multiplier + ema_values[-1]
            ema_values.append(ema)

    return ema_values


def ema_distance(price: float, ema: float) -> float:
    """
    价格与EMA的距离（百分比）

    正数 = 价格在EMA上方
    负数 = 价格在EMA下方
    """
    return (price - ema) / ema


def count_bars_above_ema(candles: List[Candle], ema_values: List[float], start_idx: int) -> int:
    """
    从start_idx开始，连续多少根K线在EMA上方

    用于检测 20 Gap Bar
    """
    count = 0
    for i in range(start_idx, -1, -1):
        if candles[i].low > ema_values[i]:
            count += 1
        else:
            break
    return count


def count_bars_below_ema(candles: List[Candle], ema_values: List[float], start_idx: int) -> int:
    """
    从start_idx开始，连续多少根K线在EMA下方
    """
    count = 0
    for i in range(start_idx, -1, -1):
        if candles[i].high < ema_values[i]:
            count += 1
        else:
            break
    return count


def is_20_gap_bar(candles: List[Candle], ema_values: List[float], idx: int) -> bool:
    """
    是否是 20 Gap Bar（20+根未触及EMA）

    Al Brooks: "20+ bars on one side of EMA = extreme trend, AI direction certain"
    """
    bars_above = count_bars_above_ema(candles, ema_values, idx)
    bars_below = count_bars_below_ema(candles, ema_values, idx)

    return bars_above >= 20 or bars_below >= 20


def is_first_ema_gap_bar(candles: List[Candle], ema_values: List[float], idx: int) -> bool:
    """
    是否是 First EMA Gap Bar

    定义：PB碰触/穿越EMA后，第一根重新远离EMA的K线
    意义：PB结束 + 趋势恢复的早期信号
    """
    if idx < 3:
        return False

    current = candles[idx]
    current_ema = ema_values[idx]

    # 检查前面是否有触及EMA
    touched_ema = False
    for i in range(idx - 1, max(0, idx - 10), -1):
        if candles[i].low <= ema_values[i] <= candles[i].high:
            touched_ema = True
            break

    if not touched_ema:
        return False

    # 检查当前K线是否远离EMA
    if current.is_bull:
        # 多头：收盘在EMA上方 + 有gap
        return current.close > current_ema and current.low > current_ema
    else:
        # 空头：收盘在EMA下方 + 有gap
        return current.close < current_ema and current.high < current_ema


def ema_slope(ema_values: List[float], idx: int, lookback: int = 5) -> float:
    """
    EMA斜率（正=向上，负=向下）

    计算最近lookback根的平均斜率
    """
    if idx < lookback:
        return 0.0

    slopes = []
    for i in range(idx - lookback + 1, idx + 1):
        if i > 0:
            slope = (ema_values[i] - ema_values[i-1]) / ema_values[i-1]
            slopes.append(slope)

    return sum(slopes) / len(slopes) if slopes else 0.0
