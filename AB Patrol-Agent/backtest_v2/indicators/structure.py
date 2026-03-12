"""
结构位识别（Swing High/Low）

Al Brooks: "Bull trend needs higher lows. Your stop goes below the most recent major higher low."
"""

from typing import List, Optional
from ..models import Candle, SwingPoint


def identify_swing_points(candles: List[Candle], lookback: int = 5) -> List[SwingPoint]:
    """
    识别 Swing High/Low

    Swing High: 左右各lookback根K线的最高点
    Swing Low: 左右各lookback根K线的最低点

    Args:
        candles: K线列表
        lookback: 左右查看的K线数量

    Returns:
        结构位列表
    """
    swing_points = []

    for i in range(lookback, len(candles) - lookback):
        # 检查是否是 Swing High
        is_swing_high = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and candles[j].high >= candles[i].high:
                is_swing_high = False
                break

        if is_swing_high:
            swing_points.append(SwingPoint(
                index=i,
                price=candles[i].high,
                is_high=True,
                is_major=False  # 稍后判断
            ))

        # 检查是否是 Swing Low
        is_swing_low = True
        for j in range(i - lookback, i + lookback + 1):
            if j != i and candles[j].low <= candles[i].low:
                is_swing_low = False
                break

        if is_swing_low:
            swing_points.append(SwingPoint(
                index=i,
                price=candles[i].low,
                is_high=False,
                is_major=False
            ))

    # 标记 major vs minor
    _mark_major_swings(swing_points, candles)

    return swing_points


def _mark_major_swings(swing_points: List[SwingPoint], candles: List[Candle]) -> None:
    """
    标记 major vs minor swing points

    Major: 显著的结构位，用于止损
    Minor: 小的结构位，不用于止损

    判断标准：
    - 幅度 > 平均K线的3倍
    - 持续时间 > 10根K线
    """
    if len(candles) < 20:
        return

    # 计算平均K线幅度
    avg_range = sum(c.range for c in candles[-50:]) / min(50, len(candles))

    for i, sp in enumerate(swing_points):
        # 找到前一个同类型的swing
        prev_swing = None
        for j in range(i - 1, -1, -1):
            if swing_points[j].is_high == sp.is_high:
                prev_swing = swing_points[j]
                break

        if prev_swing is None:
            sp.is_major = True
            continue

        # 计算幅度和时间
        price_diff = abs(sp.price - prev_swing.price)
        time_diff = sp.index - prev_swing.index

        # 判断是否major
        if price_diff > avg_range * 3 and time_diff > 10:
            sp.is_major = True
        else:
            sp.is_major = False


def is_higher_high(current: SwingPoint, previous: SwingPoint) -> bool:
    """是否形成 Higher High"""
    return current.is_high and previous.is_high and current.price > previous.price


def is_higher_low(current: SwingPoint, previous: SwingPoint) -> bool:
    """是否形成 Higher Low"""
    return not current.is_high and not previous.is_high and current.price > previous.price


def is_lower_high(current: SwingPoint, previous: SwingPoint) -> bool:
    """是否形成 Lower High"""
    return current.is_high and previous.is_high and current.price < previous.price


def is_lower_low(current: SwingPoint, previous: SwingPoint) -> bool:
    """是否形成 Lower Low"""
    return not current.is_high and not previous.is_high and current.price < previous.price


def find_major_swing_low(swing_points: List[SwingPoint], current_idx: int, direction: str = "LONG") -> Optional[SwingPoint]:
    """
    找到最近的 major swing low（用于多头止损）

    Al Brooks: "Bull trend needs higher lows. Stop goes below most recent major higher low."
    """
    if direction == "LONG":
        # 找最近的 major swing low
        for sp in reversed(swing_points):
            if sp.index < current_idx and not sp.is_high and sp.is_major:
                return sp

    return None


def find_major_swing_high(swing_points: List[SwingPoint], current_idx: int, direction: str = "SHORT") -> Optional[SwingPoint]:
    """
    找到最近的 major swing high（用于空头止损）
    """
    if direction == "SHORT":
        # 找最近的 major swing high
        for sp in reversed(swing_points):
            if sp.index < current_idx and sp.is_high and sp.is_major:
                return sp

    return None


def count_hh_hl(swing_points: List[SwingPoint], lookback: int = 10) -> int:
    """
    计算最近lookback个swing中有多少个HH+HL

    返回正数 = 多头趋势
    返回负数 = 空头趋势
    返回0 = 不确定
    """
    if len(swing_points) < 4:
        return 0

    recent_swings = swing_points[-lookback:]

    hh_hl_count = 0
    lh_ll_count = 0

    for i in range(1, len(recent_swings)):
        current = recent_swings[i]
        previous = recent_swings[i - 1]

        if is_higher_high(current, previous) or is_higher_low(current, previous):
            hh_hl_count += 1
        elif is_lower_high(current, previous) or is_lower_low(current, previous):
            lh_ll_count += 1

    return hh_hl_count - lh_ll_count
