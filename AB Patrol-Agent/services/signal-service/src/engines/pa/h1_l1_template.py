"""
H1/L1 模板化辅助模块。

把高1/低1共用的结构确认、signal bar、止损、目标与 first-entry 管理语义
从 pa_engine 主文件里拆出来，便于后续给 H2/L2、突破回调和 gap 族复用。
"""

from __future__ import annotations

from typing import Optional

from .analysis import CandlePatterns, CycleIdentifier
from .models import Candle, PASignal
from .structure_stops import build_channel_recovery_stop, build_trend_pullback_stop


class H1L1TemplateMixin:
    """封装 H1/L1 通用模板逻辑。"""

    @staticmethod
    def _bar_close_position(candle: Candle) -> float:
        """收盘在 K 线区间中的位置，0=靠近 low，1=靠近 high。"""
        bar_range = max(float(candle.high) - float(candle.low), 1e-9)
        return (float(candle.close) - float(candle.low)) / bar_range

    @staticmethod
    def _bar_body_ratio(candle: Candle) -> float:
        """实体占整根 K 线的比例。"""
        bar_range = max(float(candle.high) - float(candle.low), 1e-9)
        return abs(float(candle.close) - float(candle.open)) / bar_range

    @staticmethod
    def _bar_tail_ratios(candle: Candle) -> tuple[float, float]:
        """返回上影线、下影线占整根 K 线的比例。"""
        bar_range = max(float(candle.high) - float(candle.low), 1e-9)
        upper_tail = float(candle.high) - max(float(candle.open), float(candle.close))
        lower_tail = min(float(candle.open), float(candle.close)) - float(candle.low)
        return max(upper_tail, 0.0) / bar_range, max(lower_tail, 0.0) / bar_range

    def _h1_l1_signal_bar_profile(
        self,
        signal_bar: Candle,
        prior_bar: Candle,
        ema_value: float,
        direction: str,
    ) -> dict[str, float | bool | str]:
        """把 H1/L1 的 signal bar 拆成类型学，而不是只靠一个总分。"""
        close_position = self._bar_close_position(signal_bar)
        body_ratio = self._bar_body_ratio(signal_bar)
        upper_tail_ratio, lower_tail_ratio = self._bar_tail_ratios(signal_bar)
        inside_bar = float(signal_bar.high) <= float(prior_bar.high) and float(signal_bar.low) >= float(prior_bar.low)
        outside_bar = float(signal_bar.high) >= float(prior_bar.high) and float(signal_bar.low) <= float(prior_bar.low)

        if direction == "BUY":
            directional_bar = CandlePatterns.is_bull(signal_bar)
            close_near_extreme_strong = close_position >= 0.54
            close_near_extreme_soft = close_position >= 0.43
            good_tail_ratio = lower_tail_ratio
            bad_tail_ratio = upper_tail_ratio
            trend_bar = directional_bar and body_ratio >= 0.30 and close_position >= 0.50 and bad_tail_ratio <= 0.44
            reversal_bar = directional_bar and close_position >= 0.44 and good_tail_ratio >= 0.10 and bad_tail_ratio <= 0.44
            inside_signal = inside_bar and directional_bar and close_position >= 0.46 and body_ratio >= 0.08 and bad_tail_ratio <= 0.44
            ema_recovery = (
                directional_bar
                and float(signal_bar.low) <= float(ema_value)
                and float(signal_bar.close) >= float(ema_value)
                and close_position >= 0.42
                and bad_tail_ratio <= 0.45
            )
            outside_follow = (
                outside_bar
                and directional_bar
                and close_position >= 0.48
                and body_ratio >= 0.20
                and bad_tail_ratio <= 0.34
            )
        else:
            directional_bar = CandlePatterns.is_bear(signal_bar)
            close_near_extreme_strong = close_position <= 0.46
            close_near_extreme_soft = close_position <= 0.57
            good_tail_ratio = upper_tail_ratio
            bad_tail_ratio = lower_tail_ratio
            trend_bar = directional_bar and body_ratio >= 0.30 and close_position <= 0.50 and bad_tail_ratio <= 0.44
            reversal_bar = directional_bar and close_position <= 0.56 and good_tail_ratio >= 0.10 and bad_tail_ratio <= 0.44
            inside_signal = inside_bar and directional_bar and close_position <= 0.54 and body_ratio >= 0.08 and bad_tail_ratio <= 0.44
            ema_recovery = (
                directional_bar
                and float(signal_bar.high) >= float(ema_value)
                and float(signal_bar.close) <= float(ema_value)
                and close_position <= 0.58
                and bad_tail_ratio <= 0.45
            )
            outside_follow = (
                outside_bar
                and directional_bar
                and close_position <= 0.52
                and body_ratio >= 0.20
                and bad_tail_ratio <= 0.34
            )

        signal_type = "weak"
        if trend_bar:
            signal_type = "trend_bar"
        elif reversal_bar:
            signal_type = "reversal_bar"
        elif inside_signal:
            signal_type = "inside_bar"
        elif ema_recovery:
            signal_type = "ema_recovery_bar"
        elif outside_follow:
            signal_type = "outside_follow_bar"

        valid_signal_bar = bool(
            directional_bar
            and (signal_type != "weak" or (body_ratio >= 0.18 and bad_tail_ratio <= 0.32 and close_near_extreme_soft))
            and bad_tail_ratio <= 0.48
            and (
                close_near_extreme_soft
                or good_tail_ratio >= 0.14
                or ema_recovery
                or outside_follow
                or inside_signal
                or body_ratio >= 0.28
            )
        )

        return {
            "signal_type_label": signal_type,
            "valid_signal_bar": valid_signal_bar,
            "directional_bar": directional_bar,
            "close_near_extreme": close_near_extreme_soft,
            "close_near_extreme_soft": close_near_extreme_soft,
            "close_near_extreme_strong": close_near_extreme_strong,
            "inside_bar": inside_bar,
            "outside_bar": outside_bar,
            "outside_follow": outside_follow,
            "trend_bar": trend_bar,
            "reversal_bar": reversal_bar,
            "inside_signal": inside_signal,
            "ema_recovery": ema_recovery,
            "body_ratio": body_ratio,
            "close_position": close_position,
            "good_tail_ratio": good_tail_ratio,
            "bad_tail_ratio": bad_tail_ratio,
            "upper_tail_ratio": upper_tail_ratio,
            "lower_tail_ratio": lower_tail_ratio,
        }

    def _h1_l1_major_swing_anchor(self, candles: list[Candle], direction: str) -> float | None:
        """提取 H1/L1 背景里的最近 major HL/LH 锚点。"""
        pre_pullback = candles[-20:-3] if len(candles) >= 23 else candles[:-3]
        if len(pre_pullback) < 3:
            return None
        swings = CycleIdentifier._find_swings(pre_pullback)
        if direction == "BUY":
            swing_lows = [s for s in swings if s["type"] == "low"]
            if not swing_lows:
                return None
            return float(swing_lows[-1]["price"])
        swing_highs = [s for s in swings if s["type"] == "high"]
        if not swing_highs:
            return None
        return float(swing_highs[-1]["price"])

    def _h1_l1_is_countertrend_bar(
        self,
        candle: Candle,
        prior_candle: Candle,
        ema_value: float,
        direction: str,
    ) -> bool:
        """判断某根 K 线是否仍处在 H1/L1 的回调段，而不是趋势恢复段。"""
        if direction == "BUY":
            return bool(
                CandlePatterns.is_bear(candle)
                or float(candle.close) <= float(prior_candle.close)
                or float(candle.low) <= float(prior_candle.low)
                or float(candle.close) <= float(ema_value)
            )
        return bool(
            CandlePatterns.is_bull(candle)
            or float(candle.close) >= float(prior_candle.close)
            or float(candle.high) >= float(prior_candle.high)
            or float(candle.close) >= float(ema_value)
        )

    def _h1_l1_setup_profile(
        self,
        candles: list[Candle],
        ema20: list[float],
        direction: str,
        cycle: str,
    ) -> dict[str, float | bool | int]:
        """
        用 Brooks 的 first pullback 语义确认 H1/L1 setup。

        核心不是“最后一个 swing 点是否被守住”，而是：
        1. 前面是否有清晰趋势腿
        2. 当前是不是第一次像样回调
        3. 回调是否已经退化成 endless pullback / TR
        """
        signal_index = len(candles) - 2
        if signal_index < 3:
            return {"valid_setup": False}

        history = candles[: signal_index + 1]
        pullback_core_end = signal_index - 1
        if pullback_core_end < 1:
            return {"valid_setup": False}

        max_pullback_bars = 6 if cycle == "区间" else 5
        pullback_core_start = pullback_core_end
        while pullback_core_start - 1 >= 0 and (pullback_core_end - pullback_core_start + 1) < max_pullback_bars:
            probe_index = pullback_core_start
            ema_value = float(ema20[probe_index]) if probe_index < len(ema20) else float(ema20[-1])
            if not self._h1_l1_is_countertrend_bar(
                history[probe_index],
                history[probe_index - 1],
                ema_value,
                direction,
            ):
                break
            pullback_core_start -= 1

        if pullback_core_start < pullback_core_end:
            pullback_core_start += 1

        pullback_bars = history[pullback_core_start : pullback_core_end + 1]
        signal_bar = history[signal_index]
        pullback_segment = pullback_bars + [signal_bar]
        prior_leg = history[max(0, pullback_core_start - 6) : pullback_core_start]

        if not prior_leg or not pullback_segment:
            return {"valid_setup": False}

        if direction == "BUY":
            trend_side_bars = sum(1 for bar in prior_leg if CandlePatterns.is_bull(bar))
            pullback_side_bars = sum(1 for bar in pullback_bars if CandlePatterns.is_bear(bar))
            anchor_price = min(float(bar.low) for bar in prior_leg)
            leg_end_price = max(float(bar.high) for bar in prior_leg)
            pullback_extreme = min(float(bar.low) for bar in pullback_segment)
            trend_progress = float(prior_leg[-1].close) - float(prior_leg[0].open)
            ema_side_holds = sum(
                1
                for idx, bar in enumerate(prior_leg, start=max(0, pullback_core_start - len(prior_leg)))
                if float(bar.close) >= float(ema20[min(idx, len(ema20) - 1)])
            )
        else:
            trend_side_bars = sum(1 for bar in prior_leg if CandlePatterns.is_bear(bar))
            pullback_side_bars = sum(1 for bar in pullback_bars if CandlePatterns.is_bull(bar))
            anchor_price = max(float(bar.high) for bar in prior_leg)
            leg_end_price = min(float(bar.low) for bar in prior_leg)
            pullback_extreme = max(float(bar.high) for bar in pullback_segment)
            trend_progress = float(prior_leg[0].open) - float(prior_leg[-1].close)
            ema_side_holds = sum(
                1
                for idx, bar in enumerate(prior_leg, start=max(0, pullback_core_start - len(prior_leg)))
                if float(bar.close) <= float(ema20[min(idx, len(ema20) - 1)])
            )

        leg_size = abs(leg_end_price - anchor_price)
        if leg_size <= 0:
            return {"valid_setup": False}

        if direction == "BUY":
            pullback_depth_ratio = (leg_end_price - pullback_extreme) / leg_size
        else:
            pullback_depth_ratio = (pullback_extreme - leg_end_price) / leg_size

        pullback_overlap_ratio = CycleIdentifier._overlap_ratio(pullback_segment)
        trend_overlap_ratio = CycleIdentifier._overlap_ratio(prior_leg)
        pullback_bar_count = len(pullback_segment)

        clear_trend_leg = bool(
            len(prior_leg) >= 2
            and trend_side_bars >= max(1, len(prior_leg) // 2)
            and trend_progress > 0
            and trend_overlap_ratio <= 0.80
            and ema_side_holds >= max(1, len(prior_leg) // 2)
        )
        first_pullback_shape = bool(
            1 <= pullback_bar_count <= max_pullback_bars
            and pullback_side_bars >= 1
            and pullback_depth_ratio <= 0.92
            and pullback_overlap_ratio <= 0.82
        )
        still_trend_side = bool(
            (pullback_extreme > anchor_price) if direction == "BUY" else (pullback_extreme < anchor_price)
        )
        valid_setup = clear_trend_leg and first_pullback_shape and still_trend_side

        return {
            "valid_setup": valid_setup,
            "clear_trend_leg": clear_trend_leg,
            "first_pullback_shape": first_pullback_shape,
            "still_trend_side": still_trend_side,
            "prior_leg_bars": len(prior_leg),
            "pullback_bars": pullback_bar_count,
            "trend_side_bars": trend_side_bars,
            "pullback_side_bars": pullback_side_bars,
            "pullback_depth_ratio": float(max(0.0, pullback_depth_ratio)),
            "pullback_overlap_ratio": float(max(0.0, pullback_overlap_ratio)),
            "trend_overlap_ratio": float(max(0.0, trend_overlap_ratio)),
            "anchor_price": float(anchor_price),
            "leg_end_price": float(leg_end_price),
            "pullback_extreme": float(pullback_extreme),
        }

    def _h1_l1_stop_plan(
        self,
        candles: list[Candle],
        signal_bar: Candle,
        direction: str,
        cycle: str,
        entry_trigger: float,
        signal_profile: dict[str, float | bool | str],
        atr: float = 0.0,
    ) -> dict[str, float | str]:
        """按 H1/L1 模板返回初始止损方案。"""
        increment = self._minimum_price_increment(candles, entry_trigger)
        buffer_size = self._structure_buffer(candles, entry_trigger)

        if direction == "BUY":
            signal_bar_stop = float(signal_bar.low) - increment
        else:
            signal_bar_stop = float(signal_bar.high) + increment

        if cycle == "区间":
            swing_stop = build_channel_recovery_stop(
                direction,
                candles,
                float(signal_bar.high),
                float(signal_bar.low),
                atr,
            )
        else:
            swing_stop = build_trend_pullback_stop(
                direction,
                candles,
                float(signal_bar.high),
                float(signal_bar.low),
                atr,
            )

        major_anchor = self._h1_l1_major_swing_anchor(candles, direction)
        major_stop = 0.0
        if major_anchor is not None:
            major_stop = major_anchor - buffer_size if direction == "BUY" else major_anchor + buffer_size

        selected_stop = swing_stop
        selected_type = "swing_stop"
        close_near_extreme_for_stop = bool(
            signal_profile.get("close_near_extreme_strong", signal_profile.get("close_near_extreme"))
        )
        if cycle in {"趋势多", "趋势空", "急速多", "急速空"} and (
            bool(signal_profile.get("trend_bar"))
            or bool(signal_profile.get("reversal_bar"))
            or bool(signal_profile.get("outside_follow"))
        ) and close_near_extreme_for_stop and float(signal_profile.get("bad_tail_ratio") or 1.0) <= 0.30:
            selected_stop = signal_bar_stop
            selected_type = "signal_bar_stop"
        elif cycle == "区间":
            selected_stop = swing_stop
            selected_type = "swing_stop"
        elif major_stop > 0 and (
            bool(signal_profile.get("inside_signal")) or bool(signal_profile.get("ema_recovery"))
        ):
            selected_stop = major_stop
            selected_type = "major_hl_lh_stop"

        actual_risk = entry_trigger - selected_stop if direction == "BUY" else selected_stop - entry_trigger
        nominal_risk = entry_trigger - signal_bar_stop if direction == "BUY" else signal_bar_stop - entry_trigger

        return {
            "stop_loss": float(selected_stop),
            "stop_type": selected_type,
            "nominal_risk": float(max(nominal_risk, 0.0)),
            "actual_risk": float(max(actual_risk, 0.0)),
            "signal_bar_stop": float(signal_bar_stop),
            "swing_stop": float(swing_stop),
            "major_hl_lh_stop": float(major_stop),
            "major_anchor": float(major_anchor or 0.0),
            "runner_stop_loss": float(major_stop or selected_stop),
            "runner_stop_type": "major_hl_lh_stop" if major_stop > 0 else selected_type,
        }

    def _h1_l1_target_plan(
        self,
        candles: list[Candle],
        direction: str,
        entry_trigger: float,
        actual_risk: float,
    ) -> dict[str, float | str]:
        """按 H1/L1 模板返回 rescue / close-test / swing 三层目标。"""
        increment = self._minimum_price_increment(candles, entry_trigger)
        context = candles[-20:-1] if len(candles) > 1 else candles
        if not context:
            fallback_target = entry_trigger + actual_risk if direction == "BUY" else entry_trigger - actual_risk
            return {
                "take_profit": float(fallback_target),
                "first_target": float(fallback_target),
                "first_target_type": "measured_move_1x",
                "rescue_target": float(fallback_target),
                "rescue_target_type": "measured_move_1x",
                "close_test_target": float(fallback_target),
                "close_test_target_type": "measured_move_1x",
                "swing_target": float(
                    entry_trigger + actual_risk * 2.0 if direction == "BUY" else entry_trigger - actual_risk * 2.0
                ),
                "swing_target_type": "measured_move_2x",
                "effective_target": float(fallback_target),
                "effective_target_type": "measured_move_1x",
                "stretch_target": float(
                    entry_trigger + actual_risk * 2.0 if direction == "BUY" else entry_trigger - actual_risk * 2.0
                ),
                "stretch_target_type": "measured_move_2x",
                "target_buffer": float(increment),
            }

        local_context = context[-6:] if len(context) >= 6 else context
        candidate_map: dict[str, float] = {}
        if direction == "BUY":
            candidate_map["prior_high"] = max(float(bar.high) for bar in context)
            candidate_map["highest_close"] = max(float(bar.close) for bar in context)
            candidate_map["pullback_origin"] = max(float(bar.high) for bar in local_context)
            candidate_map["measured_move_1x"] = entry_trigger + actual_risk
            candidate_map["measured_move_2x"] = entry_trigger + actual_risk * 2.0
            rescue_candidates = [("highest_close", candidate_map["highest_close"])]
            close_test_candidates = [("prior_high", candidate_map["prior_high"])]
            swing_candidates = [
                ("pullback_origin", candidate_map["pullback_origin"]),
                ("measured_move_1x", candidate_map["measured_move_1x"]),
                ("measured_move_2x", candidate_map["measured_move_2x"]),
            ]

            rescue_label, rescue_level = next(
                ((label, level) for label, level in rescue_candidates if level > entry_trigger + increment),
                ("", 0.0),
            )
            close_label, close_level = next(
                (
                    (label, level)
                    for label, level in close_test_candidates
                    if level > max(entry_trigger + increment, rescue_level + increment)
                ),
                ("", 0.0),
            )
            swing_label, swing_level = next(
                (
                    (label, level)
                    for label, level in swing_candidates
                    if level > max(entry_trigger + increment, close_level + increment)
                ),
                ("measured_move_2x", max(entry_trigger + actual_risk * 2.0, max(close_level, rescue_level) + actual_risk)),
            )
        else:
            candidate_map["prior_low"] = min(float(bar.low) for bar in context)
            candidate_map["lowest_close"] = min(float(bar.close) for bar in context)
            candidate_map["pullback_origin"] = min(float(bar.low) for bar in local_context)
            candidate_map["measured_move_1x"] = entry_trigger - actual_risk
            candidate_map["measured_move_2x"] = entry_trigger - actual_risk * 2.0
            rescue_candidates = [("lowest_close", candidate_map["lowest_close"])]
            close_test_candidates = [("prior_low", candidate_map["prior_low"])]
            swing_candidates = [
                ("pullback_origin", candidate_map["pullback_origin"]),
                ("measured_move_1x", candidate_map["measured_move_1x"]),
                ("measured_move_2x", candidate_map["measured_move_2x"]),
            ]

            rescue_label, rescue_level = next(
                ((label, level) for label, level in rescue_candidates if level < entry_trigger - increment),
                ("", 0.0),
            )
            close_label, close_level = next(
                (
                    (label, level)
                    for label, level in close_test_candidates
                    if level < min(
                        entry_trigger - increment,
                        rescue_level - increment if rescue_level > 0 else entry_trigger - increment,
                    )
                ),
                ("", 0.0),
            )
            swing_label, swing_level = next(
                (
                    (label, level)
                    for label, level in swing_candidates
                    if level < min(
                        entry_trigger - increment,
                        close_level - increment if close_level > 0 else entry_trigger - increment,
                    )
                ),
                (
                    "measured_move_2x",
                    min(
                        entry_trigger - actual_risk * 2.0,
                        min(close_level or entry_trigger, rescue_level or entry_trigger) - actual_risk,
                    ),
                ),
            )

        first_label = rescue_label or close_label or swing_label
        if first_label == rescue_label and rescue_level > 0:
            first_level = rescue_level
        elif first_label == close_label and close_level > 0:
            first_level = close_level
        else:
            first_level = swing_level

        stretch_label = close_label if close_label and close_level > 0 and close_level != first_level else swing_label
        stretch_level = close_level if stretch_label == close_label and close_level > 0 else swing_level

        if direction == "BUY":
            take_profit = max(first_level - increment, entry_trigger + increment)
        else:
            take_profit = min(first_level + increment, entry_trigger - increment)

        return {
            "take_profit": float(take_profit),
            "first_target": float(first_level),
            "first_target_type": first_label,
            "rescue_target": float(rescue_level),
            "rescue_target_type": rescue_label,
            "close_test_target": float(close_level),
            "close_test_target_type": close_label,
            "swing_target": float(swing_level),
            "swing_target_type": swing_label,
            "effective_target": float(first_level),
            "effective_target_type": first_label,
            "stretch_target": float(stretch_level),
            "stretch_target_type": stretch_label,
            "target_buffer": float(increment),
        }

    def _h1_l1_management_plan(
        self,
        cycle: str,
        signal_profile: dict[str, float | bool | str],
        stop_plan: dict[str, float | str],
        target_plan: dict[str, float | str],
    ) -> dict[str, float | bool | str]:
        """返回 H1/L1 first-entry 的管理意图。"""
        strong_background = cycle in {"趋势多", "趋势空", "急速多", "急速空"} and bool(signal_profile.get("trend_bar"))
        first_target_type = str(target_plan.get("first_target_type") or "")
        close_test_target = first_target_type in {"highest_close", "lowest_close"}
        rescue_target_active = float(target_plan.get("rescue_target") or 0.0) > 0
        swing_target_active = float(target_plan.get("swing_target") or 0.0) > 0
        return {
            "management_template": "h1_l1_first_entry",
            "first_entry_signal": True,
            "first_profit_at_1x_actual_risk": not close_test_target,
            "allow_be_after_first_target": True,
            "prefer_partial_over_full_swing": True,
            "allow_small_runner": strong_background and not close_test_target,
            "handoff_to_h2_l2_if_failed": True,
            "prefer_lower_entry_be_rescue": True,
            "first_target_is_close_test": close_test_target,
            "disappointed_bull_bear_mode": True,
            "rescue_target_active": rescue_target_active,
            "swing_target_active": swing_target_active,
            "runner_handoff_stop_type": str(stop_plan.get("runner_stop_type") or ""),
            "runner_handoff_stop": float(stop_plan.get("runner_stop_loss") or 0.0),
            "exit_on_failed_follow_through": True,
            "exit_on_return_to_range": cycle == "区间" or bool(signal_profile.get("inside_signal")),
            "exit_on_major_channel_break": True,
            "rescue_target_type": str(target_plan.get("rescue_target_type") or ""),
            "close_test_target_type": str(target_plan.get("close_test_target_type") or ""),
            "swing_target_type": str(target_plan.get("swing_target_type") or ""),
            "first_target_type": str(target_plan.get("first_target_type") or ""),
            "stretch_target_type": str(target_plan.get("stretch_target_type") or ""),
        }

    @staticmethod
    def _attach_h1_l1_setup_extra(
        signal: PASignal | None,
        setup_profile: dict[str, float | bool | str] | None,
    ) -> PASignal | None:
        """把 H1/L1 setup 结构字段统一补进信号 extra。"""
        if signal is None or not isinstance(setup_profile, dict):
            return signal
        signal.extra.update(
            {
                "setup_valid": bool(setup_profile.get("valid_setup")),
                "setup_clear_trend_leg": bool(setup_profile.get("clear_trend_leg")),
                "setup_first_pullback_shape": bool(setup_profile.get("first_pullback_shape")),
                "setup_still_trend_side": bool(setup_profile.get("still_trend_side")),
                "setup_prior_leg_bars": int(setup_profile.get("prior_leg_bars") or 0),
                "setup_pullback_bars": int(setup_profile.get("pullback_bars") or 0),
                "setup_pullback_depth_ratio": float(setup_profile.get("pullback_depth_ratio") or 0.0),
                "setup_pullback_overlap_ratio": float(setup_profile.get("pullback_overlap_ratio") or 0.0),
            }
        )
        return signal

    def _build_h1_l1_signal(
        self,
        *,
        curr: Candle,
        prev: Candle,
        candles: list[Candle],
        cycle: str,
        direction: str,
        strength: int,
        probability: float,
        message: str,
        signal_profile: dict[str, float | bool | str],
        sig_quality: float,
        atr: float = 0.0,
    ) -> Optional[PASignal]:
        """统一生成 H1/L1 信号，避免不同分支再各自拼字段。"""
        signal_type = "高1" if direction == "BUY" else "低1"
        entry_trigger = self._stop_entry_trigger(prev, direction, candles)
        stop_plan = self._h1_l1_stop_plan(candles, prev, direction, cycle, entry_trigger, signal_profile, atr)
        actual_risk = float(stop_plan.get("actual_risk") or 0.0)
        if actual_risk <= 0:
            return None

        target_plan = self._h1_l1_target_plan(candles, direction, entry_trigger, actual_risk)
        management_plan = self._h1_l1_management_plan(cycle, signal_profile, stop_plan, target_plan)

        return PASignal(
            symbol=curr.symbol,
            signal_type=signal_type,
            direction=direction,
            strength=min(95, strength),
            message=message,
            price=curr.close,
            stop_loss=float(stop_plan["stop_loss"]),
            take_profit=float(target_plan["take_profit"]),
            probability=probability,
            cycle=cycle,
            timeframe=curr.timeframe,
            signal_bar_high=prev.high,
            signal_bar_low=prev.low,
            entry_trigger=entry_trigger,
            entry_type="STOP",
            extra={
                "signal_bar_quality": sig_quality,
                "signal_rank": 1,
                "signal_template": "H1_L1",
                "signal_bar_type": signal_profile["signal_type_label"],
                "signal_bar_close_position": signal_profile["close_position"],
                "signal_bar_body_ratio": signal_profile["body_ratio"],
                "signal_bar_tail_ratio": signal_profile["bad_tail_ratio"],
                "signal_bar_good_tail_ratio": signal_profile["good_tail_ratio"],
                "signal_bar_inside": signal_profile["inside_bar"],
                "signal_bar_ema_recovery": signal_profile["ema_recovery"],
                "signal_bar_trend": signal_profile["trend_bar"],
                "signal_bar_reversal": signal_profile["reversal_bar"],
                "signal_bar_outside_follow": signal_profile["outside_follow"],
                "nominal_risk": stop_plan["nominal_risk"],
                "actual_risk": stop_plan["actual_risk"],
                "stop_type": stop_plan["stop_type"],
                "signal_bar_stop": stop_plan["signal_bar_stop"],
                "swing_stop": stop_plan["swing_stop"],
                "major_hl_lh_stop": stop_plan["major_hl_lh_stop"],
                "major_anchor": stop_plan["major_anchor"],
                "first_target": target_plan["first_target"],
                "first_target_type": target_plan["first_target_type"],
                "rescue_target": target_plan["rescue_target"],
                "rescue_target_type": target_plan["rescue_target_type"],
                "close_test_target": target_plan["close_test_target"],
                "close_test_target_type": target_plan["close_test_target_type"],
                "swing_target": target_plan["swing_target"],
                "swing_target_type": target_plan["swing_target_type"],
                "effective_target": target_plan["effective_target"],
                "effective_target_type": target_plan["effective_target_type"],
                "stretch_target": target_plan["stretch_target"],
                "stretch_target_type": target_plan["stretch_target_type"],
                "target_buffer": target_plan["target_buffer"],
                **management_plan,
            },
        )
