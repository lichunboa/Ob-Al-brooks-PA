"""PA 引擎共享分析工具。"""

from __future__ import annotations

from .models import Candle, MarketState


class TradingSession:
    """
    日内交易时段分析器。

    时段划分 (UTC):
    - 亚洲时段: 00:00-08:00 UTC (北京 08:00-16:00)
    - 欧洲时段: 08:00-14:00 UTC (北京 16:00-22:00)
    - 美洲时段: 14:00-21:00 UTC (北京 22:00-05:00)
    - 收盘时段: 21:00-00:00 UTC (北京 05:00-08:00)
    """

    @staticmethod
    def get_session(utc_hour: int = None) -> tuple[str, float]:
        """获取当前交易时段和强度调整系数。"""
        from datetime import datetime, timezone

        if utc_hour is None:
            utc_hour = datetime.now(timezone.utc).hour

        if 0 <= utc_hour < 8:
            return "亚洲", 0.9
        if 8 <= utc_hour < 14:
            return "欧洲", 1.0
        if 14 <= utc_hour < 21:
            return "美洲", 1.1
        return "收盘", 0.85

    @staticmethod
    def adjust_signal_strength(base_strength: int, session: str = None) -> int:
        """根据时段调整信号强度。"""
        if session is None:
            session, factor = TradingSession.get_session()
        else:
            session_factors = {"亚洲": 0.9, "欧洲": 1.0, "美洲": 1.1, "收盘": 0.85}
            factor = session_factors.get(session, 1.0)

        adjusted = int(base_strength * factor)
        return max(50, min(100, adjusted))

    @staticmethod
    def is_high_volatility_session() -> bool:
        """是否处于高波动时段（美洲开盘）。"""
        session, _ = TradingSession.get_session()
        return session == "美洲"


class MeasuredMoveCalculator:
    """等距测量计算器。"""

    @staticmethod
    def find_leg1(candles: list[Candle], direction: str) -> tuple[float, float]:
        """寻找第一腿的起点和终点。"""
        if len(candles) < 10:
            return (0.0, 0.0)

        lookback = candles[-20:]

        if direction == "BUY":
            lows = [(i, c.low) for i, c in enumerate(lookback)]
            highs = [(i, c.high) for i, c in enumerate(lookback)]

            min_idx, min_low = min(lows, key=lambda x: x[1])
            highs_after = [(i, h) for i, h in highs if i > min_idx]
            if not highs_after:
                return (0.0, 0.0)
            _, max_high = max(highs_after, key=lambda x: x[1])
            return (min_low, max_high)

        highs = [(i, c.high) for i, c in enumerate(lookback)]
        lows = [(i, c.low) for i, c in enumerate(lookback)]

        max_idx, max_high = max(highs, key=lambda x: x[1])
        lows_after = [(i, low_value) for i, low_value in lows if i > max_idx]
        if not lows_after:
            return (0.0, 0.0)
        _, min_low = min(lows_after, key=lambda x: x[1])
        return (max_high, min_low)

    @staticmethod
    def calculate_target(current_price: float, leg1_start: float, leg1_end: float, direction: str) -> float:
        """根据第 1 腿计算等距测量目标。"""
        leg1_size = abs(leg1_end - leg1_start)
        if leg1_size == 0:
            return 0.0
        if direction == "BUY":
            return current_price + leg1_size
        return current_price - leg1_size


class TrendValidator:
    """多周期趋势验证。"""

    @staticmethod
    def validate_trend(candles_5m: list[Candle], direction: str) -> tuple[bool, str]:
        """使用 15 分钟趋势验证 5 分钟信号。"""
        if len(candles_5m) < 30:
            return True, "数据不足，跳过验证"

        candles_15m = []
        for i in range(0, len(candles_5m) - 2, 3):
            chunk = candles_5m[i : i + 3]
            if len(chunk) < 3:
                continue

            agg = Candle(
                symbol=chunk[0].symbol,
                timestamp=chunk[0].timestamp,
                open=chunk[0].open,
                high=max(c.high for c in chunk),
                low=min(c.low for c in chunk),
                close=chunk[-1].close,
                volume=sum(c.volume for c in chunk),
                timeframe="15m",
            )
            candles_15m.append(agg)

        if len(candles_15m) < 5:
            return True, "聚合数据不足"

        closes_15m = [c.close for c in candles_15m]
        ema_15m = calculate_ema(closes_15m, min(20, len(closes_15m)))
        if not ema_15m:
            return True, "EMA计算失败"

        slope = ema_slope(ema_15m, 3)
        current_price = candles_15m[-1].close
        current_ema = ema_15m[-1]

        if direction == "BUY":
            if slope < -0.1 and current_price < current_ema:
                return False, "15m趋势向下，与BUY信号冲突"
            return True, "15m趋势支持BUY"

        if slope > 0.1 and current_price > current_ema:
            return False, "15m趋势向上，与SELL信号冲突"
        return True, "15m趋势支持SELL"


class CandlePatterns:
    """K 线形态识别工具类。"""

    @staticmethod
    def body_size(candle: Candle) -> float:
        return abs(candle.close - candle.open)

    @staticmethod
    def range_size(candle: Candle) -> float:
        return candle.high - candle.low

    @staticmethod
    def body_ratio(candle: Candle) -> float:
        bar_range = CandlePatterns.range_size(candle)
        if bar_range == 0:
            return 0
        return CandlePatterns.body_size(candle) / bar_range

    @staticmethod
    def is_bull(candle: Candle) -> bool:
        return candle.close > candle.open

    @staticmethod
    def is_bear(candle: Candle) -> bool:
        return candle.close < candle.open

    @staticmethod
    def is_doji(candle: Candle, threshold: float = 0.1) -> bool:
        return CandlePatterns.body_ratio(candle) < threshold

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
    def is_signal_bar(candle: Candle, threshold: float = 0.3) -> bool:
        return CandlePatterns.body_ratio(candle) < threshold

    @staticmethod
    def is_reversal_bar(curr: Candle, prev: Candle) -> str | None:
        if CandlePatterns.is_bear(prev) and CandlePatterns.is_bull(curr) and curr.close > prev.high:
            return "多头反转"
        if CandlePatterns.is_bull(prev) and CandlePatterns.is_bear(curr) and curr.close < prev.low:
            return "空头反转"
        return None

    @staticmethod
    def is_inside_bar(curr: Candle, prev: Candle) -> bool:
        return curr.high <= prev.high and curr.low >= prev.low

    @staticmethod
    def is_outside_bar(curr: Candle, prev: Candle) -> bool:
        return curr.high > prev.high and curr.low < prev.low

    @staticmethod
    def signal_bar_quality(signal_bar: Candle, prev_bars: list[Candle], direction: str) -> float:
        """Al Brooks 信号棒质量评分。"""
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
            avg_range = sum(c.high - c.low for c in prev_bars) / len(prev_bars)
            if avg_range > 0:
                rel_size = bar_range / avg_range
                score += min(0.2, rel_size * 0.1)
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


def calculate_ema(prices: list[float], period: int = 20) -> list[float]:
    """计算 EMA。"""
    if len(prices) < period:
        return []

    multiplier = 2 / (period + 1)
    ema_values = [sum(prices[:period]) / period]

    for price in prices[period:]:
        ema_values.append((price - ema_values[-1]) * multiplier + ema_values[-1])

    return ema_values


def ema_slope(ema_values: list[float], lookback: int = 5) -> float:
    """EMA 斜率（正=上升，负=下降）。"""
    if len(ema_values) < lookback:
        return 0.0
    recent = ema_values[-lookback:]
    return (recent[-1] - recent[0]) / recent[0] * 100


def calculate_atr(candles: list[Candle], period: int = 14) -> float:
    """计算 ATR。"""
    if len(candles) < period + 1:
        return 0.0

    tr_list = []
    for i in range(1, len(candles)):
        current = candles[i]
        previous = candles[i - 1]
        hl = current.high - current.low
        hc = abs(current.high - previous.close)
        lc = abs(current.low - previous.close)
        tr_list.append(max(hl, hc, lc))

    if not tr_list:
        return 0.0

    recent_tr = tr_list[-period:]
    return sum(recent_tr) / len(recent_tr)


class CycleIdentifier:
    """Al Brooks 四状态市场周期识别器。"""

    @staticmethod
    def context_range(candles: list[Candle]) -> dict[str, float | int]:
        """提取更贴近 Brooks 的可见区间边界，而不是固定最近 20 根。"""
        if not candles:
            return {
                "range_high": 0.0,
                "range_low": 0.0,
                "window_size": 0,
                "overlap_ratio": 0.0,
                "swing_count": 0,
            }
        window = CycleIdentifier._select_context_window(candles)
        return {
            "range_high": max(c.high for c in window),
            "range_low": min(c.low for c in window),
            "window_size": len(window),
            "overlap_ratio": CycleIdentifier._overlap_ratio(window),
            "swing_count": len(CycleIdentifier._find_swings(window)),
        }

    @staticmethod
    def identify(candles: list[Candle], ema20: list[float]) -> MarketState:
        """Al Brooks 四状态识别主函数。"""
        default = MarketState("neutral", "观望", 0.0)
        if len(candles) < 20 or len(ema20) < 5:
            return default

        slope = ema_slope(ema20, 5)
        price = candles[-1].close
        ema_val = ema20[-1]
        above_ema = price > ema_val

        context_meta = CycleIdentifier.context_range(candles)
        context_size = int(context_meta["window_size"] or 20)
        context_window = candles[-context_size:] if context_size > 0 else candles[-20:]
        swings_local = CycleIdentifier._find_swings(context_window[-40:] if len(context_window) >= 40 else context_window)
        structure_local = CycleIdentifier._classify_structure(swings_local)
        swings_global = CycleIdentifier._find_swings(candles)
        structure_global = CycleIdentifier._classify_structure(swings_global)
        overlap_10 = CycleIdentifier._overlap_ratio(candles[-10:])
        overlap_20 = CycleIdentifier._overlap_ratio(candles[-20:])
        overlap_context = float(context_meta["overlap_ratio"] or overlap_20)

        recent5 = candles[-5:]
        bulls = sum(1 for c in recent5 if CandlePatterns.is_strong_bull(c))
        bears = sum(1 for c in recent5 if CandlePatterns.is_strong_bear(c))

        bars_from = 0
        for candle in reversed(candles[-20:]):
            if (above_ema and candle.low > ema_val) or (not above_ema and candle.high < ema_val):
                bars_from += 1
            else:
                break

        rng_high = float(context_meta["range_high"] or 0.0)
        rng_low = float(context_meta["range_low"] or 0.0)

        pb_ratio = CycleIdentifier._measure_pullback_ratio(context_window, swings_local)
        gaps_open = CycleIdentifier._check_gaps_open(
            context_window[-20:] if len(context_window) >= 20 else context_window,
            ema_val,
        )
        follow_through = CycleIdentifier._check_follow_through(candles[-6:])

        always_in = CycleIdentifier._determine_always_in(
            structure_global,
            slope,
            above_ema,
            price,
            ema_val,
            candles[-10:],
        )

        if overlap_10 < 0.35 and (bulls >= 3 or bears >= 3):
            direction = "long" if bulls >= 3 else "short"
            cycle = "急速多" if direction == "long" else "急速空"
            return MarketState(
                always_in=direction,
                cycle=cycle,
                trend_strength=0.9,
                range_high=rng_high,
                range_low=rng_low,
                ema_slope=slope,
                bar_count_from_ema=bars_from,
                channel_type="none",
                is_ttr=False,
                follow_through=follow_through,
                pullback_ratio=0.0,
            )

        is_trend = (
            (structure_local == "bullish" and slope > 0.02 and above_ema)
            or (structure_local == "bearish" and slope < -0.02 and not above_ema)
            or (structure_local == "bullish" and slope > 0)
            or (structure_local == "bearish" and slope < 0)
        )

        if is_trend:
            direction = "long" if structure_local == "bullish" else "short"
            base_strength = min(1.0, abs(slope) / 0.3 + 0.3)
            is_tight = pb_ratio < 0.5 and gaps_open and overlap_10 < 0.55

            if is_tight:
                cycle = "趋势多" if direction == "long" else "趋势空"
                return MarketState(
                    always_in=direction,
                    cycle=cycle,
                    trend_strength=base_strength,
                    range_high=rng_high,
                    range_low=rng_low,
                    ema_slope=slope,
                    bar_count_from_ema=bars_from,
                    channel_type="tight",
                    is_ttr=False,
                    follow_through=follow_through,
                    pullback_ratio=pb_ratio,
                )

            cycle = "趋势多" if direction == "long" else "趋势空"
            return MarketState(
                always_in=direction,
                cycle=cycle,
                trend_strength=base_strength * 0.6,
                range_high=rng_high,
                range_low=rng_low,
                ema_slope=slope,
                bar_count_from_ema=bars_from,
                channel_type="broad",
                is_ttr=False,
                follow_through=follow_through,
                pullback_ratio=pb_ratio,
            )

        is_ttr = CycleIdentifier._detect_ttr(context_window[-20:] if len(context_window) >= 20 else context_window)
        is_range = (
            (overlap_context > 0.50 and abs(slope) < 0.10)
            or (structure_local == "mixed" and max(overlap_10, overlap_context) > 0.45)
            or (abs(slope) < 0.03 and max(overlap_10, overlap_context) > 0.40)
        )

        if is_range:
            return MarketState(
                always_in=always_in,
                cycle="区间",
                trend_strength=0.15,
                range_high=rng_high,
                range_low=rng_low,
                ema_slope=slope,
                bar_count_from_ema=bars_from,
                channel_type="none",
                is_ttr=is_ttr,
                follow_through=False,
                pullback_ratio=pb_ratio,
            )

        if slope > 0.03 and above_ema:
            return MarketState(
                always_in="long",
                cycle="趋势多",
                trend_strength=0.3,
                range_high=rng_high,
                range_low=rng_low,
                ema_slope=slope,
                bar_count_from_ema=bars_from,
                channel_type="broad",
                is_ttr=False,
                follow_through=follow_through,
                pullback_ratio=pb_ratio,
            )

        if slope < -0.03 and not above_ema:
            return MarketState(
                always_in="short",
                cycle="趋势空",
                trend_strength=0.3,
                range_high=rng_high,
                range_low=rng_low,
                ema_slope=slope,
                bar_count_from_ema=bars_from,
                channel_type="broad",
                is_ttr=False,
                follow_through=follow_through,
                pullback_ratio=pb_ratio,
            )

        return MarketState(
            always_in="neutral",
            cycle="观望",
            trend_strength=0.1,
            range_high=rng_high,
            range_low=rng_low,
            ema_slope=slope,
            bar_count_from_ema=bars_from,
            channel_type="none",
            is_ttr=is_ttr,
            follow_through=False,
            pullback_ratio=pb_ratio,
        )

    @staticmethod
    def _determine_always_in(
        structure: str,
        slope: float,
        above_ema: bool,
        price: float,
        ema_val: float,
        recent: list[Candle],
    ) -> str:
        """Always In 方向判定。"""
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
    def _select_context_window(candles: list[Candle]) -> list[Candle]:
        """优先保留最近仍然有效的 TR / Broad Channel 结构记忆。"""
        if len(candles) <= 20:
            return candles

        selected = candles[-20:]
        for size in (30, 40, 60):
            if len(candles) < size:
                continue
            window = candles[-size:]
            swings = CycleIdentifier._find_swings(window)
            alternating = CycleIdentifier._alternating_swing_count(swings[-8:] if len(swings) >= 8 else swings)
            overlap = CycleIdentifier._overlap_ratio(window)
            avg_bar_range = sum(max(c.high - c.low, 0.0) for c in window) / len(window)
            if avg_bar_range <= 0:
                continue
            range_height = max(c.high for c in window) - min(c.low for c in window)
            compression = range_height / avg_bar_range
            looks_range_like = overlap >= 0.34 or (alternating >= 5 and overlap >= 0.24)
            looks_broad_channel_like = alternating >= 6 and compression <= max(10.0, size * 0.42)
            if looks_range_like or looks_broad_channel_like:
                selected = window
        return selected

    @staticmethod
    def _alternating_swing_count(swings: list[dict]) -> int:
        """统计最近 swing 是否高低交替，辅助识别区间与宽通道。"""
        if not swings:
            return 0
        count = 1
        last_type = str(swings[0].get("type") or "")
        for swing in swings[1:]:
            current_type = str(swing.get("type") or "")
            if current_type and current_type != last_type:
                count += 1
                last_type = current_type
        return count

    @staticmethod
    def _measure_pullback_ratio(candles: list[Candle], swings: list[dict]) -> float:
        """测量最近一次回调深度 / 前一段腿的比率。"""
        if len(swings) < 3:
            return 0.3

        last_3 = swings[-3:]

        if last_3[-3]["type"] == "low" and last_3[-2]["type"] == "high" and last_3[-1]["type"] == "low":
            leg = last_3[-2]["price"] - last_3[-3]["price"]
            pullback = last_3[-2]["price"] - last_3[-1]["price"]
            if leg > 0:
                return min(1.0, pullback / leg)

        if last_3[-3]["type"] == "high" and last_3[-2]["type"] == "low" and last_3[-1]["type"] == "high":
            leg = last_3[-3]["price"] - last_3[-2]["price"]
            pullback = last_3[-1]["price"] - last_3[-2]["price"]
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
        del ema_val
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

        rng_high = max(c.high for c in candles)
        rng_low = min(c.low for c in candles)
        range_height = rng_high - rng_low
        avg_bar_range = sum(c.high - c.low for c in candles) / len(candles)

        if avg_bar_range <= 0:
            return False

        return range_height < 2.0 * avg_bar_range

    @staticmethod
    def _check_follow_through(candles: list[Candle]) -> bool:
        """检测 Follow Through。"""
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

    @staticmethod
    def _find_swings(candles: list[Candle]) -> list[dict]:
        """在 K 线序列中查找 Swing High/Low。"""
        swings = []
        for i in range(1, len(candles) - 1):
            if candles[i].high > candles[i - 1].high and candles[i].high > candles[i + 1].high:
                swings.append({"type": "high", "price": candles[i].high, "idx": i})
            if candles[i].low < candles[i - 1].low and candles[i].low < candles[i + 1].low:
                swings.append({"type": "low", "price": candles[i].low, "idx": i})
        return swings

    @staticmethod
    def _classify_structure(swings: list[dict]) -> str:
        """从 Swing 序列判断结构。"""
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
            prev_range = candles[i - 1].high - candles[i - 1].low
            curr_range = candles[i].high - candles[i].low
            if prev_range == 0 and curr_range == 0:
                continue
            total += 1
            overlap_hi = min(candles[i].high, candles[i - 1].high)
            overlap_lo = max(candles[i].low, candles[i - 1].low)
            overlap_size = max(0, overlap_hi - overlap_lo)
            union = max(candles[i].high, candles[i - 1].high) - min(candles[i].low, candles[i - 1].low)
            if union > 0:
                overlaps += overlap_size / union
        return overlaps / total if total > 0 else 0.5
