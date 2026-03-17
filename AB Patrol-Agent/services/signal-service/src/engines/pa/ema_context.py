"""
跨周期 EMA 参考线工具。

主要用于把更大一级背景周期的 EMA20 投影到当前执行周期，
以支持 Brooks 在小周期图上参考大周期 EMA 的场景。
"""

from __future__ import annotations

from .models import Candle
from .analysis import calculate_ema


def project_higher_timeframe_ema(
    signal_candles: list[Candle],
    higher_candles: list[Candle],
    *,
    period: int = 20,
) -> list[float]:
    """
    把更高一级周期的 EMA 投影到执行周期。

    规则：
    - 每根执行周期 K 线，使用“当前已完成的最近一根更高周期 K”对应的 EMA
    - 如果更高周期数据不足，则返回空列表，由调用方回退到本周期 EMA
    """
    if len(signal_candles) < 2 or len(higher_candles) < max(2, period):
        return []

    higher_closes = [float(candle.close) for candle in higher_candles]
    higher_ema = calculate_ema(higher_closes, min(period, len(higher_closes)))
    if not higher_ema:
        return []

    projected: list[float] = []
    higher_index = 0
    for candle in signal_candles:
        while (
            higher_index + 1 < len(higher_candles)
            and higher_candles[higher_index + 1].timestamp <= candle.timestamp
        ):
            higher_index += 1
        projected.append(float(higher_ema[min(higher_index, len(higher_ema) - 1)]))
    return projected
