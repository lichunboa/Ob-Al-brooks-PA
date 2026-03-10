"""
大周期背景分析器

根据日线 + 4h EMA20 斜率确定市场宏观环境:
  🟢 多头背景 / 🔴 空头背景 / ⚡ 震荡背景 / ⚪ 中性
"""

from .models import BackgroundContext


def _calculate_ema(prices: list[float], period: int = 20) -> list[float]:
    """计算 EMA"""
    if len(prices) < period:
        return []
    multiplier = 2 / (period + 1)
    ema = [sum(prices[:period]) / period]
    for price in prices[period:]:
        ema.append((price - ema[-1]) * multiplier + ema[-1])
    return ema


def _ema_slope(ema_values: list[float], lookback: int = 5) -> float:
    """EMA 斜率（百分比）"""
    if len(ema_values) < lookback:
        return 0.0
    recent = ema_values[-lookback:]
    if recent[0] == 0:
        return 0.0
    return (recent[-1] - recent[0]) / recent[0] * 100


class BackgroundAnalyzer:
    """根据日线 + 4h 级别确定大周期背景"""

    @staticmethod
    def analyze(daily_candles: list, h4_candles: list) -> BackgroundContext:
        """
        从日线和 4h K 线确定背景

        Args:
            daily_candles: 日线 K 线列表（需要 .close 属性）
            h4_candles: 4h K 线列表
        """
        # 计算日线 EMA20 斜率
        daily_prices = [c.close for c in daily_candles]
        daily_ema = _calculate_ema(daily_prices, 20)
        daily_slope = _ema_slope(daily_ema, 5) if len(daily_ema) >= 5 else 0.0

        # 计算 4h EMA20 斜率
        h4_prices = [c.close for c in h4_candles]
        h4_ema = _calculate_ema(h4_prices, 20)
        h4_slope = _ema_slope(h4_ema, 5) if len(h4_ema) >= 5 else 0.0

        # 判断趋势
        daily_trend = BackgroundAnalyzer._classify_trend(daily_slope, daily_candles, daily_ema)
        h4_trend = BackgroundAnalyzer._classify_trend(h4_slope, h4_candles, h4_ema)

        # 综合背景
        if daily_trend == "多头" and h4_trend == "多头":
            background = "🟢 多头背景"
        elif daily_trend == "空头" and h4_trend == "空头":
            background = "🔴 空头背景"
        elif daily_trend != h4_trend and daily_trend != "中性" and h4_trend != "中性":
            background = "⚡ 震荡背景"
        else:
            background = "⚪ 中性"

        return BackgroundContext(
            daily_trend=daily_trend,
            h4_trend=h4_trend,
            background=background,
            daily_slope=daily_slope,
            h4_slope=h4_slope,
        )

    @staticmethod
    def _classify_trend(slope: float, candles: list, ema: list[float]) -> str:
        if not ema or not candles:
            return "中性"
        price = candles[-1].close
        ema_val = ema[-1]
        price_above = price > ema_val

        if slope > 0.08 and price_above:
            return "多头"
        elif slope < -0.08 and not price_above:
            return "空头"
        elif abs(slope) < 0.08:
            return "震荡"
        return "中性"
