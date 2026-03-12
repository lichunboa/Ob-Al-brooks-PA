"""
止损计算器

Al Brooks: "Stop determines position size. Stop must be beyond the structure."
"""

from typing import Optional
from ..models import Signal, Candle, SwingPoint, MarketState, Direction
from .structure import find_major_swing_low, find_major_swing_high


class StopCalculator:
    """止损计算器"""

    def calculate_stop(
        self,
        signal: Signal,
        candles: list[Candle],
        swing_points: list[SwingPoint],
        market_state: MarketState
    ) -> Optional[float]:
        """
        计算止损位置（必须在结构位外侧）

        Brooks 原则：
        - Bull: 止损在最近 major higher low 下方
        - Bear: 止损在最近 major lower high 上方
        - TR: 止损在 TR 边界外侧

        Returns:
            止损价格，如果止损太紧则返回None
        """
        current_idx = len(candles) - 1

        if signal.direction == Direction.LONG:
            stop = self._calculate_long_stop(
                signal, candles, swing_points, current_idx, market_state
            )
        else:
            stop = self._calculate_short_stop(
                signal, candles, swing_points, current_idx, market_state
            )

        if stop is None:
            return None

        # 验证止损距离
        stop_distance = abs(signal.entry_price - stop) / signal.entry_price

        if stop_distance < 0.002:  # < 0.2%
            # 止损太紧，不做
            return None

        if stop_distance > 0.03:  # > 3%
            # 止损太宽，需要降低仓位（但仍然可以做）
            pass

        return stop

    def _calculate_long_stop(
        self,
        signal: Signal,
        candles: list[Candle],
        swing_points: list[SwingPoint],
        current_idx: int,
        market_state: MarketState
    ) -> Optional[float]:
        """
        计算多头止损

        Al Brooks: "Bull trend needs higher lows. Stop below most recent major higher low."
        """
        if market_state == MarketState.TRADING_RANGE:
            # TR中：止损在TR底部下方
            recent_20 = candles[-20:]
            tr_bottom = min(c.low for c in recent_20)
            return tr_bottom * 0.999  # 0.1% buffer

        # 趋势中：找major swing low
        major_low = find_major_swing_low(swing_points, current_idx, "LONG")

        if major_low is None:
            # 没有major swing，用最近10根的最低点
            recent_10 = candles[-10:]
            return min(c.low for c in recent_10) * 0.999

        # 止损在major swing low下方
        return major_low.price * 0.999  # 0.1% buffer

    def _calculate_short_stop(
        self,
        signal: Signal,
        candles: list[Candle],
        swing_points: list[SwingPoint],
        current_idx: int,
        market_state: MarketState
    ) -> Optional[float]:
        """
        计算空头止损
        """
        if market_state == MarketState.TRADING_RANGE:
            # TR中：止损在TR顶部上方
            recent_20 = candles[-20:]
            tr_top = max(c.high for c in recent_20)
            return tr_top * 1.001  # 0.1% buffer

        # 趋势中：找major swing high
        major_high = find_major_swing_high(swing_points, current_idx, "SHORT")

        if major_high is None:
            # 没有major swing，用最近10根的最高点
            recent_10 = candles[-10:]
            return max(c.high for c in recent_10) * 1.001

        # 止损在major swing high上方
        return major_high.price * 1.001  # 0.1% buffer
