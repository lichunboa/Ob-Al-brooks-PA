"""
回测公共市场周期识别。
"""

from __future__ import annotations

from typing import Optional

from .indicators import CandlePatterns, ema_slope
from .models import Candle, MarketState


class CycleIdentifier:
    """
    Al Brooks 四状态市场周期识别器。
    """

    @staticmethod
    def identify(candles: list[Candle], ema20: list[float]) -> MarketState:
        """识别当前市场周期。"""
        default = MarketState("neutral", "观望", 0.0)
        if len(candles) < 5 or len(ema20) < 5:
            return default

        slope = ema_slope(ema20, 5)
        recent = candles[-5:]
        strong_bulls = sum(1 for candle in recent if CandlePatterns.is_strong_bull(candle))
        strong_bears = sum(1 for candle in recent if CandlePatterns.is_strong_bear(candle))

        recent_twenty = candles[-20:] if len(candles) >= 20 else candles
        range_high = max(candle.high for candle in recent_twenty)
        range_low = min(candle.low for candle in recent_twenty)
        is_ttr = CycleIdentifier._detect_ttr(recent_twenty) if len(candles) >= 20 else False

        if strong_bulls >= 3:
            return MarketState("long", "急速多", 0.9, range_high, range_low, slope, channel_type="none", is_ttr=False)
        if strong_bears >= 3:
            return MarketState("short", "急速空", 0.9, range_high, range_low, slope, channel_type="none", is_ttr=False)

        if abs(slope) > 0.1:
            price_vs_ema = candles[-1].close - ema20[-1]
            if slope > 0 and price_vs_ema > 0:
                return MarketState("long", "趋势多", 0.7, range_high, range_low, slope, channel_type="broad", is_ttr=False)
            if slope < 0 and price_vs_ema < 0:
                return MarketState("short", "趋势空", 0.7, range_high, range_low, slope, channel_type="broad", is_ttr=False)

        if abs(slope) < 0.05:
            deviations = []
            for i, candle in enumerate(candles[-10:]):
                ema_index = len(ema20) - 10 + i
                if 0 <= ema_index < len(ema20) and ema20[ema_index] != 0:
                    deviations.append(abs(candle.close - ema20[ema_index]) / ema20[ema_index])
            if deviations and max(deviations) < 0.02:
                return MarketState(
                    "neutral",
                    "区间",
                    0.15,
                    range_high,
                    range_low,
                    slope,
                    channel_type="none",
                    is_ttr=is_ttr,
                )

        if len(candles) >= 2:
            reversal = CandlePatterns.is_reversal_bar(candles[-1], candles[-2])
            if reversal == "多头反转" and slope < -0.05:
                return MarketState("neutral", "反转多", 0.4, range_high, range_low, slope, channel_type="none", is_ttr=False)
            if reversal == "空头反转" and slope > 0.05:
                return MarketState("neutral", "反转空", 0.4, range_high, range_low, slope, channel_type="none", is_ttr=False)

        price_vs_ema = candles[-1].close - ema20[-1]
        if slope > 0.05 and price_vs_ema > 0:
            return MarketState("long", "趋势多", 0.3, range_high, range_low, slope, channel_type="broad", is_ttr=False)
        if slope < -0.05 and price_vs_ema < 0:
            return MarketState("short", "趋势空", 0.3, range_high, range_low, slope, channel_type="broad", is_ttr=False)

        return default

    @staticmethod
    def _determine_always_in(
        structure: str,
        slope: float,
        above_ema: bool,
        price: float,
        ema_val: float,
        recent: list[Candle],
    ) -> str:
        bull_score = 0
        bear_score = 0

        if structure == "bullish":
            bull_score += 3
        elif structure == "bearish":
            bear_score += 3

        if above_ema:
            bull_score += 1
        else:
            bear_score += 1

        if slope > 0.05:
            bull_score += 1
        elif slope < -0.05:
            bear_score += 1

        if len(recent) >= 3:
            closes_up = sum(1 for candle in recent[-3:] if candle.close > candle.open)
            if closes_up >= 2:
                bull_score += 1
            elif closes_up <= 1:
                bear_score += 1

        if bull_score >= 4 and bull_score > bear_score + 1:
            return "long"
        if bear_score >= 4 and bear_score > bull_score + 1:
            return "short"
        return "neutral"

    @staticmethod
    def _find_swings(candles: list[Candle]) -> list[dict]:
        """在 K 线序列中寻找 swing high/low。"""
        swings = []
        for i in range(1, len(candles) - 1):
            if candles[i].high > candles[i - 1].high and candles[i].high > candles[i + 1].high:
                swings.append({"type": "high", "price": candles[i].high, "idx": i})
            if candles[i].low < candles[i - 1].low and candles[i].low < candles[i + 1].low:
                swings.append({"type": "low", "price": candles[i].low, "idx": i})
        return swings

    @staticmethod
    def _classify_structure(swings: list[dict]) -> str:
        """根据 swing 序列判断结构方向。"""
        highs = [swing for swing in swings if swing["type"] == "high"]
        lows = [swing for swing in swings if swing["type"] == "low"]

        if len(highs) < 2 or len(lows) < 2:
            return "mixed"

        recent_highs = highs[-3:] if len(highs) >= 3 else highs[-2:]
        recent_lows = lows[-3:] if len(lows) >= 3 else lows[-2:]

        hh_count = sum(1 for i in range(1, len(recent_highs)) if recent_highs[i]["price"] > recent_highs[i - 1]["price"])
        hl_count = sum(1 for i in range(1, len(recent_lows)) if recent_lows[i]["price"] > recent_lows[i - 1]["price"])
        lh_count = sum(1 for i in range(1, len(recent_highs)) if recent_highs[i]["price"] < recent_highs[i - 1]["price"])
        ll_count = sum(1 for i in range(1, len(recent_lows)) if recent_lows[i]["price"] < recent_lows[i - 1]["price"])

        bull_score = hh_count + hl_count
        bear_score = lh_count + ll_count

        if bull_score >= 2 and bull_score > bear_score:
            return "bullish"
        if bear_score >= 2 and bear_score > bull_score:
            return "bearish"
        return "mixed"

    @staticmethod
    def _overlap_ratio(candles: list[Candle]) -> float:
        """计算 K 线重叠度。"""
        if len(candles) < 2:
            return 0.5
        overlaps = 0
        total = 0
        for i in range(1, len(candles)):
            prev = candles[i - 1]
            curr = candles[i]
            prev_range = prev.high - prev.low
            curr_range = curr.high - curr.low
            if prev_range == 0 and curr_range == 0:
                continue
            total += 1
            overlap_high = min(curr.high, prev.high)
            overlap_low = max(curr.low, prev.low)
            overlap_size = max(0, overlap_high - overlap_low)
            union = max(curr.high, prev.high) - min(curr.low, prev.low)
            if union > 0:
                overlaps += overlap_size / union
        return overlaps / total if total > 0 else 0.5

    @staticmethod
    def _measure_pullback_ratio(candles: list[Candle], swings: list[dict]) -> float:
        """计算最近回调深度 / 前一段腿的比率。"""
        if len(swings) < 3:
            return 0.3

        last_three = swings[-3:]
        if last_three[-3]["type"] == "low" and last_three[-2]["type"] == "high" and last_three[-1]["type"] == "low":
            leg = last_three[-2]["price"] - last_three[-3]["price"]
            pullback = last_three[-2]["price"] - last_three[-1]["price"]
            if leg > 0:
                return min(1.0, pullback / leg)

        if last_three[-3]["type"] == "high" and last_three[-2]["type"] == "low" and last_three[-1]["type"] == "high":
            leg = last_three[-3]["price"] - last_three[-2]["price"]
            pullback = last_three[-1]["price"] - last_three[-2]["price"]
            if leg > 0:
                return min(1.0, pullback / leg)

        highs = [swing for swing in swings if swing["type"] == "high"]
        lows = [swing for swing in swings if swing["type"] == "low"]
        if len(highs) >= 2 and len(lows) >= 1:
            leg = abs(highs[-1]["price"] - lows[-1]["price"])
            current_pullback = abs(candles[-1].close - highs[-1]["price"])
            if leg > 0:
                return min(1.0, current_pullback / leg)
        return 0.3

    @staticmethod
    def _check_gaps_open(candles: list[Candle], ema_val: float) -> bool:
        """检查缺口是否仍然打开。"""
        if len(candles) < 5:
            return True

        gap_found = False
        gap_still_open = False

        for i in range(1, len(candles) - 1):
            prev = candles[i - 1]
            curr = candles[i]

            if curr.low > prev.high:
                gap_found = True
                gap_low = prev.high
                filled = False
                for j in range(i + 1, len(candles)):
                    if candles[j].low <= gap_low:
                        filled = True
                        break
                if not filled:
                    gap_still_open = True

            if curr.high < prev.low:
                gap_found = True
                gap_high = prev.low
                filled = False
                for j in range(i + 1, len(candles)):
                    if candles[j].high >= gap_high:
                        filled = True
                        break
                if not filled:
                    gap_still_open = True

        if not gap_found:
            return False
        return gap_still_open

    @staticmethod
    def _detect_ttr(candles: list[Candle]) -> bool:
        """检测 Tight Trading Range。"""
        if len(candles) < 10:
            return False
        range_high = max(candle.high for candle in candles)
        range_low = min(candle.low for candle in candles)
        range_height = range_high - range_low
        avg_bar_range = sum(candle.high - candle.low for candle in candles) / len(candles)
        if avg_bar_range <= 0:
            return False
        return range_height < 2.0 * avg_bar_range

    @staticmethod
    def _check_follow_through(candles: list[Candle]) -> bool:
        """检测 breakout follow through。"""
        if len(candles) < 3:
            return False
        consec_bull = 0
        max_bull = 0
        consec_bear = 0
        max_bear = 0
        for candle in candles:
            if CandlePatterns.is_strong_bull(candle):
                consec_bull += 1
                max_bull = max(max_bull, consec_bull)
                consec_bear = 0
            elif CandlePatterns.is_strong_bear(candle):
                consec_bear += 1
                max_bear = max(max_bear, consec_bear)
                consec_bull = 0
            else:
                consec_bull = 0
                consec_bear = 0
        return max_bull >= 2 or max_bear >= 2


def classify_backtest_market_state(market_state: MarketState) -> Optional[str]:
    """将 MarketState 映射到回测使用的八状态。"""
    cycle = market_state.cycle
    channel_type = market_state.channel_type

    if "急速多" in cycle:
        return "strong_trend_bull"
    if "急速空" in cycle:
        return "strong_trend_bear"
    if "趋势多" in cycle:
        if channel_type == "tight":
            return "strong_trend_bull"
        return "weak_trend_bull"
    if "趋势空" in cycle:
        if channel_type == "tight":
            return "strong_trend_bear"
        return "weak_trend_bear"
    if "区间" in cycle:
        if market_state.is_ttr:
            return "tight_range"
        return "broad_range"
    return None


BACKTEST_STRATEGY_MATRIX = {
    "strong_trend_bull": {
        "recommended": ["高1", "突破回调", "20均线缺口"],
        "prohibited": ["双重顶", "楔形顶"],
        "score_modifier": 10,
    },
    "strong_trend_bear": {
        "recommended": ["低1", "突破回调", "20均线缺口"],
        "prohibited": ["双重底", "楔形底"],
        "score_modifier": 10,
    },
    "weak_trend_bull": {
        "recommended": ["楔形底", "突破回调", "20均线缺口"],
        "prohibited": [],
        "score_modifier": 0,
    },
    "weak_trend_bear": {
        "recommended": ["楔形顶", "突破回调", "20均线缺口"],
        "prohibited": [],
        "score_modifier": 0,
    },
    "tight_range": {
        "recommended": ["看衰突破"],
        "prohibited": ["高1", "低1", "20均线缺口"],
        "score_modifier": -5,
    },
    "broad_range": {
        "recommended": ["双重顶", "双重底", "楔形顶", "楔形底", "看衰突破", "末端旗形"],
        "prohibited": [],
        "score_modifier": 0,
    },
    "breakout_bull": {
        "recommended": ["突破回调", "高1", "20均线缺口"],
        "prohibited": [],
        "score_modifier": 15,
    },
    "breakout_bear": {
        "recommended": ["突破回调", "低1", "20均线缺口"],
        "prohibited": [],
        "score_modifier": 15,
    },
}
