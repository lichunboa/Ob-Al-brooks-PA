"""
回测公共技术指标与 K 线形态工具。
"""

from __future__ import annotations

from typing import Optional

from .models import Candle


def calculate_ema(prices: list[float], period: int = 20) -> list[float]:
    """计算 EMA。"""
    if len(prices) < period:
        return []
    multiplier = 2 / (period + 1)
    ema = [sum(prices[:period]) / period]
    for price in prices[period:]:
        ema.append((price - ema[-1]) * multiplier + ema[-1])
    return ema


def ema_slope(ema_values: list[float], lookback: int = 5) -> float:
    """计算 EMA 斜率（百分比）。"""
    if len(ema_values) < lookback:
        return 0.0
    recent = ema_values[-lookback:]
    if recent[0] == 0:
        return 0.0
    return (recent[-1] - recent[0]) / recent[0] * 100


def calculate_atr(candles: list[Candle], period: int = 14) -> float:
    """计算 ATR。"""
    if len(candles) < period + 1:
        return 0.0
    tr_list = []
    for i in range(1, len(candles)):
        candle = candles[i]
        prev = candles[i - 1]
        tr = max(candle.high - candle.low, abs(candle.high - prev.close), abs(candle.low - prev.close))
        tr_list.append(tr)
    if not tr_list:
        return 0.0
    return sum(tr_list[-period:]) / len(tr_list[-period:])


class CandlePatterns:
    """K 线形态辅助。"""

    @staticmethod
    def body_size(candle: Candle) -> float:
        return abs(candle.close - candle.open)

    @staticmethod
    def range_size(candle: Candle) -> float:
        return candle.high - candle.low

    @staticmethod
    def body_ratio(candle: Candle) -> float:
        size = CandlePatterns.range_size(candle)
        return CandlePatterns.body_size(candle) / size if size > 0 else 0

    @staticmethod
    def is_bull(candle: Candle) -> bool:
        return candle.close > candle.open

    @staticmethod
    def is_bear(candle: Candle) -> bool:
        return candle.close < candle.open

    @staticmethod
    def is_strong_bull(candle: Candle, threshold: float = 0.7) -> bool:
        if not CandlePatterns.is_bull(candle):
            return False
        body_ratio = CandlePatterns.body_ratio(candle)
        upper_shadow = candle.high - candle.close
        body = CandlePatterns.body_size(candle)
        return body_ratio > threshold and (upper_shadow < body * 0.1 if body > 0 else True)

    @staticmethod
    def is_strong_bear(candle: Candle, threshold: float = 0.7) -> bool:
        if not CandlePatterns.is_bear(candle):
            return False
        body_ratio = CandlePatterns.body_ratio(candle)
        lower_shadow = candle.close - candle.low
        body = CandlePatterns.body_size(candle)
        return body_ratio > threshold and (lower_shadow < body * 0.1 if body > 0 else True)

    @staticmethod
    def is_reversal_bar(curr: Candle, prev: Candle) -> Optional[str]:
        if CandlePatterns.is_bear(prev) and CandlePatterns.is_bull(curr):
            if curr.close > prev.high:
                return "多头反转"
        if CandlePatterns.is_bull(prev) and CandlePatterns.is_bear(curr):
            if curr.close < prev.low:
                return "空头反转"
        return None

    @staticmethod
    def signal_bar_quality(signal_bar: Candle, prev_bars: list[Candle], direction: str) -> float:
        """
        Al Brooks 信号棒质量评分 (0-1)。
        """
        bar_range = signal_bar.high - signal_bar.low
        if bar_range <= 0:
            return 0.0
        body = abs(signal_bar.close - signal_bar.open)
        score = 0.0
        body_ratio = body / bar_range
        score += min(0.3, body_ratio * 0.4)
        close_pos = (signal_bar.close - signal_bar.low) / bar_range
        if direction == "BUY":
            score += close_pos * 0.3
        else:
            score += (1.0 - close_pos) * 0.3
        if prev_bars:
            avg_range = sum(candle.high - candle.low for candle in prev_bars) / len(prev_bars)
            if avg_range > 0:
                score += min(0.2, (bar_range / avg_range) * 0.1)
            else:
                score += 0.1
        else:
            score += 0.1
        if direction == "BUY":
            bad_wick = signal_bar.high - max(signal_bar.open, signal_bar.close)
        else:
            bad_wick = min(signal_bar.open, signal_bar.close) - signal_bar.low
        wick_ratio = bad_wick / bar_range
        score += max(0.0, 0.2 - wick_ratio * 0.4)
        return score
