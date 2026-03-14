"""
PA 高级策略检测 mixin。
"""

from __future__ import annotations

from typing import Optional

from .analysis import CandlePatterns
from .models import Candle, PASignal
from .structure_stops import build_channel_recovery_stop, build_reversal_structure_stop


def _structure_buffer(candles: list[Candle], reference_price: float) -> float:
    """按压缩结构自身的波动给出最小缓冲。"""
    if not candles:
        return max(abs(reference_price) * 0.0001, 1e-9)
    recent = candles[-3:] if len(candles) >= 3 else candles
    recent_range = max(float(candle.high) - float(candle.low) for candle in recent)
    return max(recent_range * 0.08, abs(reference_price) * 0.0001, 1e-9)


class AdvancedStrategyDetectorMixin:
    """封装相对独立的高级策略识别逻辑。"""

    def detect_first_ema_gap(
        self,
        candles: list[Candle],
        ema20: list[float],
        cycle: str,
        atr: float = 0.0,
    ) -> Optional[PASignal]:
        """
        第一均线缺口 (First EMA Gap)
        条件：
        - 趋势中首次远离 EMA20 形成明显缺口
        - 至少 5 根 K 线完全脱离 EMA
        - 价格回归 EMA20 时入场
        """
        if not cycle.startswith("趋势") or len(candles) < 20 or len(ema20) < 20:
            return None

        curr = candles[-1]

        gap_bars = 0
        for i in range(-2, -15, -1):
            if abs(i) > len(candles) or abs(i) > len(ema20):
                break

            candle = candles[i]
            ema_value = ema20[i]

            if cycle == "趋势多":
                if candle.low > ema_value * 1.005:
                    gap_bars += 1
                else:
                    break
            else:
                if candle.high < ema_value * 0.995:
                    gap_bars += 1
                else:
                    break

        if gap_bars < 5:
            return None

        if cycle == "趋势多":
            if curr.low <= ema20[-1] * 1.003 and curr.close > ema20[-1]:
                pullback_low = min(candle.low for candle in candles[-5:])
                stop = build_channel_recovery_stop("BUY", candles, curr.high, pullback_low, atr)
                target = curr.close + (curr.close - stop) * 2.5

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="第一均线缺口",
                    direction="BUY",
                    strength=83,
                    message=f"首次{gap_bars}根缺口后触及EMA20，高概率反弹",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.65,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                    signal_bar_high=curr.high,
                    signal_bar_low=curr.low,
                    entry_trigger=curr.high,
                    entry_type="STOP",
                    extra={"gap_bars": gap_bars},
                )

        elif cycle == "趋势空":
            if curr.high >= ema20[-1] * 0.997 and curr.close < ema20[-1]:
                pullback_high = max(candle.high for candle in candles[-5:])
                stop = build_channel_recovery_stop("SELL", candles, pullback_high, curr.low, atr)
                target = curr.close - (stop - curr.close) * 2.5

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="第一均线缺口",
                    direction="SELL",
                    strength=83,
                    message=f"首次{gap_bars}根缺口后触及EMA20，高概率回落",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.65,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                    signal_bar_high=curr.high,
                    signal_bar_low=curr.low,
                    entry_trigger=curr.low,
                    entry_type="STOP",
                    extra={"gap_bars": gap_bars},
                )

        return None

    def detect_ii_breakout(
        self,
        candles: list[Candle],
        ema20: list[float],
        cycle: str,
        atr: float = 0.0,
    ) -> Optional[PASignal]:
        """
        ii/ioi 压缩突破检测 (Al Brooks 08C)
        - ii = 连续2根内包线（小周期三角形收敛）
        - ioi = 内包→外包→内包（压缩→试探→再压缩）
        """
        if len(candles) < 6 or len(ema20) < 6:
            return None

        bars = candles[-5:]

        def is_inside(child: Candle, parent: Candle) -> bool:
            return child.high <= parent.high and child.low >= parent.low

        def is_outside(child: Candle, parent: Candle) -> bool:
            return child.high > parent.high and child.low < parent.low

        pattern = None
        pattern_bars = []

        if (
            len(bars) >= 4
            and is_inside(bars[-3], bars[-4])
            and is_inside(bars[-2], bars[-3])
            and is_inside(bars[-1], bars[-2])
        ):
            pattern = "iii"
            pattern_bars = bars[-4:]
        elif (
            len(bars) >= 4
            and is_inside(bars[-3], bars[-4])
            and is_outside(bars[-2], bars[-3])
            and is_inside(bars[-1], bars[-2])
        ):
            pattern = "ioi"
            pattern_bars = bars[-4:]
        elif is_inside(bars[-2], bars[-3]) and is_inside(bars[-1], bars[-2]):
            pattern = "ii"
            pattern_bars = bars[-3:]

        if not pattern:
            return None

        curr = candles[-1]
        is_bull_close = curr.close > (curr.open + curr.close) / 2 if curr.open != curr.close else curr.close > candles[-2].close

        pattern_high = max(bar.high for bar in pattern_bars)
        pattern_low = min(bar.low for bar in pattern_bars)
        pattern_range = pattern_high - pattern_low

        is_late_trend = cycle.startswith("趋势") and len(candles) >= 30
        near_ema = abs(curr.close - ema20[-1]) / ema20[-1] < 0.005 if ema20[-1] > 0 else False
        stop_buffer = _structure_buffer(pattern_bars, float(curr.close))

        if is_bull_close:
            stop = pattern_low - stop_buffer
            risk = curr.close - stop
            target = curr.close + risk * 2.0
            entry_trigger = pattern_high
            base_strength = 78 if is_late_trend else 82
            if near_ema:
                base_strength += 3

            return PASignal(
                symbol=curr.symbol,
                signal_type=f"{pattern}突破",
                direction="BUY",
                strength=base_strength,
                message=f"{pattern}压缩突破做多，范围{pattern_range:.1f}{'（近EMA）' if near_ema else ''}",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.6,
                cycle=cycle if cycle else "压缩突破",
                timeframe=curr.timeframe,
                signal_bar_high=curr.high,
                signal_bar_low=curr.low,
                entry_trigger=entry_trigger,
                entry_type="STOP",
                extra={"pattern": pattern, "pattern_range": pattern_range, "near_ema": near_ema},
            )

        stop = pattern_high + stop_buffer
        risk = stop - curr.close
        target = curr.close - risk * 2.0
        entry_trigger = pattern_low
        base_strength = 78 if is_late_trend else 82
        if near_ema:
            base_strength += 3

        return PASignal(
            symbol=curr.symbol,
            signal_type=f"{pattern}突破",
            direction="SELL",
            strength=base_strength,
            message=f"{pattern}压缩突破做空，范围{pattern_range:.1f}{'（近EMA）' if near_ema else ''}",
            price=curr.close,
            stop_loss=stop,
            take_profit=target,
            probability=0.6,
            cycle=cycle if cycle else "压缩突破",
            timeframe=curr.timeframe,
            signal_bar_high=curr.high,
            signal_bar_low=curr.low,
            entry_trigger=entry_trigger,
            entry_type="STOP",
            extra={"pattern": pattern, "pattern_range": pattern_range, "near_ema": near_ema},
        )

    def detect_gap_type(
        self,
        candles: list[Candle],
        ema20: list[float],
        atr: float = 0.0,
    ) -> Optional[dict]:
        """
        缺口类型检测（11A-11D，仅作为上下文信息，不直接生成交易信号）。
        """
        if len(candles) < 15:
            return None

        result = {
            "micro_gaps_open": 0,
            "micro_gaps_closed": 0,
            "exhaustion_detected": False,
            "stairs_pattern": False,
            "gap_direction": "neutral",
        }

        for i in range(-10, -2):
            if abs(i) >= len(candles) - 1:
                continue
            prev_bar = candles[i - 1]
            curr_bar = candles[i]
            next_bar = candles[i + 1]

            if prev_bar.high < next_bar.low and curr_bar.close > curr_bar.open:
                closed = any(candle.low <= prev_bar.high for candle in candles[i + 2 :])
                if closed:
                    result["micro_gaps_closed"] += 1
                else:
                    result["micro_gaps_open"] += 1
            elif prev_bar.low > next_bar.high and curr_bar.close < curr_bar.open:
                closed = any(candle.high >= prev_bar.low for candle in candles[i + 2 :])
                if closed:
                    result["micro_gaps_closed"] += 1
                else:
                    result["micro_gaps_open"] += 1

        if result["micro_gaps_open"] > result["micro_gaps_closed"]:
            bull_count = sum(1 for candle in candles[-10:] if candle.close > candle.open)
            result["gap_direction"] = "bull" if bull_count > 5 else "bear"

        bodies = [abs(candle.close - candle.open) for candle in candles[-15:]]
        if bodies:
            max_body_idx = bodies.index(max(bodies))
            if max_body_idx >= 12:
                max_bar = candles[-15 + max_body_idx]
                if ema20:
                    ema_distance = abs(max_bar.close - ema20[-1]) / ema20[-1] if ema20[-1] > 0 else 0
                    if ema_distance > 0.015 and max(bodies) > sum(bodies) / len(bodies) * 2.0:
                        result["exhaustion_detected"] = True

        if result["micro_gaps_closed"] >= 3 and result["micro_gaps_open"] <= 1:
            result["stairs_pattern"] = True

        return result if (result["micro_gaps_open"] > 0 or result["exhaustion_detected"] or result["stairs_pattern"]) else None

    def _has_two_legs(self, candles: list, direction: str) -> bool:
        """
        Brooks TBTL: 检测 head 之后是否有两段式结构（Two Legs）。
        direction="down" → 找两段下跌 leg（头肩顶）
        direction="up"   → 找两段上涨 leg（头肩底）

        一个 leg = 连续向同一方向移动的 bars，中间被一个反向 pause/pullback 分隔。
        """
        if len(candles) < 6:
            return False

        legs = 0
        in_leg = False
        pullback_seen = False

        for i in range(1, len(candles)):
            curr_bar = candles[i]
            prev_bar = candles[i - 1]

            if direction == "down":
                moving = curr_bar.close < prev_bar.close
                pausing = curr_bar.close > prev_bar.close
            else:
                moving = curr_bar.close > prev_bar.close
                pausing = curr_bar.close < prev_bar.close

            if moving:
                if not in_leg:
                    if pullback_seen or legs == 0:
                        in_leg = True
                        pullback_seen = False
            elif pausing:
                if in_leg:
                    legs += 1
                    in_leg = False
                pullback_seen = True

        # 如果最后还在 leg 中，算一个
        if in_leg:
            legs += 1

        return legs >= 2

    def detect_head_and_shoulders(
        self,
        candles: list[Candle],
        ema20: list[float],
        atr: float = 0.0,
    ) -> Optional[PASignal]:
        """
        头肩形态检测 — Brooks 27A 对齐版

        Brooks 核心规则：
        - H&S = MTR 变体，80% 会失败
        - TBTL: head 之后必须有 Two Legs 结构（不是简单 bar 计数）
        - Neckline 可以作为确认，但 right shoulder 反转本身也可以是 Brooks 入场点
        - MTR 三步曲：破线 → 回望1/3 → 破发
        - 概率 40%（Brooks: 60% 的 MTR 会失败）
        """
        if len(candles) < 30 or len(ema20) < 30:
            return None

        lookback = candles[-30:]
        ema_tail = ema20[-30:]
        highs = [candle.high for candle in lookback]
        lows = [candle.low for candle in lookback]
        curr = candles[-1]
        prev = candles[-2]

        # === 头肩顶 ===
        head_idx = highs.index(max(highs))

        if head_idx >= 5 and head_idx <= len(lookback) - 5:
            left_highs = highs[:head_idx]
            if left_highs:
                left_shoulder_idx = left_highs.index(max(left_highs))
                left_shoulder = left_highs[left_shoulder_idx]
                right_highs = highs[head_idx + 1 :]
                if right_highs and len(right_highs) >= 3:
                    right_shoulder = max(right_highs[-5:]) if len(right_highs) >= 5 else max(right_highs)
                    head_high = highs[head_idx]

                    if head_high > left_shoulder and head_high > right_shoulder:
                        head_range = head_high - min(lows[head_idx - 2 : head_idx + 3])
                        if right_shoulder > head_high - head_range * 0.55:
                            bars_after_head = lookback[head_idx:]

                            # Brooks TBTL: 必须有两段式下跌结构
                            if not self._has_two_legs(bars_after_head, "down"):
                                pass  # fall through to 头肩底
                            else:
                                # Neckline 确认：左肩低点和右肩低点连线
                                left_neckline = min(lows[left_shoulder_idx:head_idx])
                                right_neckline = min(lows[head_idx:])
                                neckline = max(left_neckline, right_neckline)
                                neckline_tolerance = max(
                                    self._structure_buffer(lookback, float(neckline)),
                                    abs(head_high) * 0.001,
                                )
                                shoulder_tolerance = max(
                                    self._structure_buffer(lookback, float(right_shoulder)),
                                    abs(head_high) * 0.001,
                                )
                                neckline_test = curr.close <= neckline + neckline_tolerance
                                right_shoulder_reversal = (
                                    abs(curr.high - right_shoulder) <= shoulder_tolerance
                                    and CandlePatterns.is_bear(curr)
                                )
                                post_head_bars = lookback[head_idx + 1 :]
                                post_head_ema = ema_tail[head_idx + 1 :]
                                bear_ema_closes = sum(
                                    1
                                    for bar, ema in zip(post_head_bars, post_head_ema)
                                    if float(bar.close) < float(ema)
                                )
                                major_channel_break = (
                                    bear_ema_closes >= 3
                                    or float(curr.close) <= neckline - neckline_tolerance * 0.10
                                )
                                shoulder_balance = abs(right_shoulder - left_shoulder) <= head_range * 0.35
                                if not (neckline_test or right_shoulder_reversal):
                                    pass  # 价格离 neckline 太远，还没到突破位
                                elif not major_channel_break or not shoulder_balance:
                                    pass  # 大多数头肩只是 minor reversal，等真正 break major channel
                                else:
                                    reversal = CandlePatterns.is_reversal_bar(curr, prev)
                                    sig_quality = CandlePatterns.signal_bar_quality(curr, lookback[-6:-1], "SELL")
                                    if reversal == "空头反转" and sig_quality >= 0.50:
                                        stop = build_reversal_structure_stop(
                                            "SELL",
                                            candles,
                                            curr.high,
                                            curr.low,
                                            atr,
                                            reference_levels=[head_high, left_shoulder, right_shoulder],
                                        )
                                        risk = stop - curr.close
                                        if risk <= 0:
                                            return None
                                        target = curr.close - risk * 2.5

                                        return PASignal(
                                            symbol=curr.symbol,
                                            signal_type="头肩顶MTR",
                                            direction="SELL",
                                            strength=80,
                                            message=f"头肩顶MTR，两段下跌确认，neckline={neckline:.1f}",
                                            price=curr.close,
                                            stop_loss=stop,
                                            take_profit=target,
                                            probability=0.40,
                                            cycle="反转空",
                                            timeframe=curr.timeframe,
                                            signal_bar_high=curr.high,
                                            signal_bar_low=curr.low,
                                            entry_trigger=curr.low,
                                            entry_type="STOP",
                                            extra={
                                                "head": head_high,
                                                "left_shoulder": left_shoulder,
                                                "right_shoulder": right_shoulder,
                                                "neckline": neckline,
                                                "bear_ema_closes": bear_ema_closes,
                                                "major_channel_break": major_channel_break,
                                                "shoulder_balance": shoulder_balance,
                                            },
                                        )

        # === 头肩底 ===
        head_low_idx = lows.index(min(lows))
        if head_low_idx < 5 or head_low_idx > len(lookback) - 5:
            return None

        left_lows = lows[:head_low_idx]
        if not left_lows:
            return None
        left_shoulder_idx = left_lows.index(min(left_lows))
        left_shoulder_low = left_lows[left_shoulder_idx]

        right_lows = lows[head_low_idx + 1 :]
        if not right_lows or len(right_lows) < 3:
            return None
        right_shoulder_low = min(right_lows[-5:]) if len(right_lows) >= 5 else min(right_lows)

        head_low = lows[head_low_idx]
        if head_low < left_shoulder_low and head_low < right_shoulder_low:
            head_range = max(highs[head_low_idx - 2 : head_low_idx + 3]) - head_low
            if right_shoulder_low < head_low + head_range * 0.55:
                bars_after_head = lookback[head_low_idx:]

                # Brooks TBTL: 必须有两段式上涨结构
                if not self._has_two_legs(bars_after_head, "up"):
                    return None

                # Neckline 确认
                left_neckline = max(highs[left_shoulder_idx:head_low_idx])
                right_neckline = max(highs[head_low_idx:])
                neckline = min(left_neckline, right_neckline)
                neckline_tolerance = max(
                    self._structure_buffer(lookback, float(neckline)),
                    abs(head_low) * 0.001,
                )
                shoulder_tolerance = max(
                    self._structure_buffer(lookback, float(right_shoulder_low)),
                    abs(head_low) * 0.001,
                )
                neckline_test = curr.close >= neckline - neckline_tolerance
                right_shoulder_reversal = (
                    abs(curr.low - right_shoulder_low) <= shoulder_tolerance
                    and CandlePatterns.is_bull(curr)
                )
                post_head_bars = lookback[head_low_idx + 1 :]
                post_head_ema = ema_tail[head_low_idx + 1 :]
                bull_ema_closes = sum(
                    1
                    for bar, ema in zip(post_head_bars, post_head_ema)
                    if float(bar.close) > float(ema)
                )
                major_channel_break = (
                    bull_ema_closes >= 3
                    or float(curr.close) >= neckline + neckline_tolerance * 0.10
                )
                shoulder_balance = abs(right_shoulder_low - left_shoulder_low) <= head_range * 0.35
                if not (neckline_test or right_shoulder_reversal):
                    return None
                if not major_channel_break or not shoulder_balance:
                    return None

                reversal = CandlePatterns.is_reversal_bar(curr, prev)
                sig_quality = CandlePatterns.signal_bar_quality(curr, lookback[-6:-1], "BUY")
                if reversal == "多头反转" and sig_quality >= 0.50:
                    stop = build_reversal_structure_stop(
                        "BUY",
                        candles,
                        curr.high,
                        curr.low,
                        atr,
                        reference_levels=[head_low, left_shoulder_low, right_shoulder_low],
                    )
                    risk = curr.close - stop
                    if risk <= 0:
                        return None
                    target = curr.close + risk * 2.5

                    return PASignal(
                        symbol=curr.symbol,
                        signal_type="头肩底MTR",
                        direction="BUY",
                        strength=80,
                        message=f"头肩底MTR，两段上涨确认，neckline={neckline:.1f}",
                        price=curr.close,
                        stop_loss=stop,
                        take_profit=target,
                        probability=0.40,
                        cycle="反转多",
                        timeframe=curr.timeframe,
                        signal_bar_high=curr.high,
                        signal_bar_low=curr.low,
                        entry_trigger=curr.high,
                        entry_type="STOP",
                        extra={
                            "head": head_low,
                            "left_shoulder": left_shoulder_low,
                            "right_shoulder": right_shoulder_low,
                            "neckline": neckline,
                            "bull_ema_closes": bull_ema_closes,
                            "major_channel_break": major_channel_break,
                            "shoulder_balance": shoulder_balance,
                        },
                    )

        return None
