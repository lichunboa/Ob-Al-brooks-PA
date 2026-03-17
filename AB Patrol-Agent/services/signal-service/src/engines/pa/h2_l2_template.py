"""
H2/L2 模板化辅助模块。

把高2/低2的 signal bar、止损、目标和 second-entry 管理语义
从 pa_engine 主文件里拆出来，复用 H1/L1 已经稳定的通用工具。
"""

from __future__ import annotations

from typing import Optional

from .models import Candle, PASignal
from .structure_stops import build_channel_recovery_stop, build_trend_pullback_stop


class H2L2TemplateMixin:
    """封装 H2/L2 通用模板逻辑。"""

    def _h2_l2_stop_plan(
        self,
        candles: list[Candle],
        signal_bar: Candle,
        direction: str,
        cycle: str,
        entry_trigger: float,
        signal_profile: dict[str, float | bool | str],
        atr: float = 0.0,
    ) -> dict[str, float | str]:
        """按 H2/L2 模板返回初始止损方案。"""
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
        if bool(signal_profile.get("trend_bar")) and bool(signal_profile.get("close_near_extreme_strong")):
            selected_stop = signal_bar_stop
            selected_type = "signal_bar_stop"
        elif major_stop > 0 and bool(signal_profile.get("inside_signal")):
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

    def _h2_l2_target_plan(
        self,
        candles: list[Candle],
        direction: str,
        entry_trigger: float,
        actual_risk: float,
    ) -> dict[str, float | str]:
        """按 H2/L2 模板返回 close-test / swing 两层目标。"""
        increment = self._minimum_price_increment(candles, entry_trigger)
        context = candles[-25:-1] if len(candles) > 1 else candles
        if not context:
            fallback_target = entry_trigger + actual_risk if direction == "BUY" else entry_trigger - actual_risk
            return {
                "take_profit": float(fallback_target),
                "first_target": float(fallback_target),
                "first_target_type": "measured_move_1x",
                "rescue_target": float(fallback_target),
                "rescue_target_type": "highest_close" if direction == "BUY" else "lowest_close",
                "close_test_target": float(fallback_target),
                "close_test_target_type": "prior_high" if direction == "BUY" else "prior_low",
                "swing_target": float(
                    entry_trigger + actual_risk * 2.0 if direction == "BUY" else entry_trigger - actual_risk * 2.0
                ),
                "swing_target_type": "measured_move_2x",
                "effective_target": float(fallback_target),
                "effective_target_type": "measured_move_1x",
                "stretch_target": float(
                    entry_trigger + actual_risk * 3.0 if direction == "BUY" else entry_trigger - actual_risk * 3.0
                ),
                "stretch_target_type": "measured_move_3x",
                "target_buffer": float(increment),
            }

        local_context = context[-8:] if len(context) >= 8 else context
        if direction == "BUY":
            prior_extreme = max(float(bar.high) for bar in context)
            close_extreme = max(float(bar.close) for bar in context)
            pullback_origin = max(float(bar.high) for bar in local_context)
            rescue_level = close_extreme if close_extreme > entry_trigger + increment else 0.0
            close_level = prior_extreme if prior_extreme > max(entry_trigger + increment, rescue_level + increment) else 0.0
            swing_level = max(
                pullback_origin if pullback_origin > entry_trigger + increment else 0.0,
                entry_trigger + actual_risk * 2.0,
            )
            stretch_level = max(entry_trigger + actual_risk * 3.0, swing_level + actual_risk * 0.5)
            first_level = close_level or rescue_level or swing_level
            first_type = "prior_high" if close_level else ("highest_close" if rescue_level else "measured_move_2x")
            take_profit = max(first_level - increment, entry_trigger + increment)
            rescue_type = "highest_close" if rescue_level else ""
            close_type = "prior_high" if close_level else ""
            swing_type = "pullback_origin" if pullback_origin > entry_trigger + increment else "measured_move_2x"
        else:
            prior_extreme = min(float(bar.low) for bar in context)
            close_extreme = min(float(bar.close) for bar in context)
            pullback_origin = min(float(bar.low) for bar in local_context)
            rescue_level = close_extreme if close_extreme < entry_trigger - increment else 0.0
            close_level = prior_extreme if prior_extreme < min(entry_trigger - increment, rescue_level - increment if rescue_level > 0 else entry_trigger - increment) else 0.0
            swing_level = min(
                pullback_origin if pullback_origin < entry_trigger - increment else entry_trigger,
                entry_trigger - actual_risk * 2.0,
            )
            stretch_level = min(entry_trigger - actual_risk * 3.0, swing_level - actual_risk * 0.5)
            first_level = close_level or rescue_level or swing_level
            first_type = "prior_low" if close_level else ("lowest_close" if rescue_level else "measured_move_2x")
            take_profit = min(first_level + increment, entry_trigger - increment)
            rescue_type = "lowest_close" if rescue_level else ""
            close_type = "prior_low" if close_level else ""
            swing_type = "pullback_origin" if pullback_origin < entry_trigger - increment else "measured_move_2x"

        return {
            "take_profit": float(take_profit),
            "first_target": float(first_level),
            "first_target_type": first_type,
            "rescue_target": float(rescue_level),
            "rescue_target_type": rescue_type,
            "close_test_target": float(close_level),
            "close_test_target_type": close_type,
            "swing_target": float(swing_level),
            "swing_target_type": swing_type,
            "effective_target": float(first_level),
            "effective_target_type": first_type,
            "stretch_target": float(stretch_level),
            "stretch_target_type": "measured_move_3x",
            "target_buffer": float(increment),
        }

    def _h2_l2_management_plan(
        self,
        cycle: str,
        signal_profile: dict[str, float | bool | str],
        target_plan: dict[str, float | str],
    ) -> dict[str, float | bool | str]:
        """返回 H2/L2 second-entry 的管理意图。"""
        strong_background = cycle in {"趋势多", "趋势空", "急速多", "急速空"} and bool(signal_profile.get("trend_bar"))
        first_target_type = str(target_plan.get("first_target_type") or "")
        close_test_target = first_target_type in {"prior_high", "prior_low"}
        return {
            "management_template": "h2_l2_second_entry",
            "first_entry_signal": False,
            "second_entry_signal": True,
            "first_profit_at_1x_actual_risk": True,
            "allow_be_after_first_target": True,
            "prefer_partial_over_full_swing": True,
            "allow_small_runner": strong_background,
            "handoff_to_h2_l2_if_failed": False,
            "prefer_lower_entry_be_rescue": False,
            "first_target_is_close_test": close_test_target,
            "disappointed_bull_bear_mode": False,
            "rescue_target_active": float(target_plan.get("rescue_target") or 0.0) > 0,
            "swing_target_active": float(target_plan.get("swing_target") or 0.0) > 0,
            "exit_on_failed_follow_through": True,
            "exit_on_return_to_range": cycle == "区间",
            "exit_on_major_channel_break": True,
            "rescue_target_type": str(target_plan.get("rescue_target_type") or ""),
            "close_test_target_type": str(target_plan.get("close_test_target_type") or ""),
            "swing_target_type": str(target_plan.get("swing_target_type") or ""),
            "first_target_type": first_target_type,
            "stretch_target_type": str(target_plan.get("stretch_target_type") or ""),
        }

    def _build_h2_l2_signal(
        self,
        *,
        curr: Candle,
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
        """统一生成 H2/L2 信号。"""
        signal_type = "高2" if direction == "BUY" else "低2"
        entry_trigger = self._stop_entry_trigger(curr, direction, candles)
        stop_plan = self._h2_l2_stop_plan(candles, curr, direction, cycle, entry_trigger, signal_profile, atr)
        actual_risk = float(stop_plan.get("actual_risk") or 0.0)
        if actual_risk <= 0:
            return None

        target_plan = self._h2_l2_target_plan(candles, direction, entry_trigger, actual_risk)
        management_plan = self._h2_l2_management_plan(cycle, signal_profile, target_plan)

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
            signal_bar_high=curr.high,
            signal_bar_low=curr.low,
            entry_trigger=entry_trigger,
            entry_type="STOP",
            extra={
                "signal_bar_quality": sig_quality,
                "signal_rank": 2,
                "signal_template": "H2_L2",
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
                "valid_previous_entry": True,
                **management_plan,
            },
        )
