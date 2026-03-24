"""
突破回调模板化辅助模块。

把突破回调的结构目标、管理语义从主引擎拆出来，
并接到趋势恢复族共用模块上。
"""

from __future__ import annotations

from typing import Optional

from .models import Candle, PASignal
from .structure_stops import build_channel_recovery_stop, build_trend_pullback_stop


class BreakoutPullbackTemplateMixin:
    """封装突破回调的目标与管理模板。"""

    def _breakout_pullback_stop_plan(
        self,
        candles: list[Candle],
        signal_bar: Candle,
        direction: str,
        cycle: str,
        entry_trigger: float,
        atr: float = 0.0,
    ) -> dict[str, float | str]:
        """返回突破回调的结构止损。"""
        increment = self._minimum_price_increment(candles, entry_trigger)
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

        actual_risk = entry_trigger - swing_stop if direction == "BUY" else swing_stop - entry_trigger
        nominal_risk = entry_trigger - signal_bar_stop if direction == "BUY" else signal_bar_stop - entry_trigger
        return {
            "stop_loss": float(swing_stop),
            "stop_type": "swing_stop",
            "nominal_risk": float(max(nominal_risk, 0.0)),
            "actual_risk": float(max(actual_risk, 0.0)),
            "signal_bar_stop": float(signal_bar_stop),
            "swing_stop": float(swing_stop),
        }

    def _breakout_pullback_target_plan(
        self,
        candles: list[Candle],
        direction: str,
        entry_trigger: float,
        actual_risk: float,
        breakout_level: float,
        breakout_extreme: float,
    ) -> dict[str, float | str]:
        """返回突破回调的 breakout-point / close-test / swing 目标。"""
        increment = self._minimum_price_increment(candles, entry_trigger)
        breakout_height = abs(float(breakout_extreme) - float(breakout_level))
        if breakout_height <= 0:
            breakout_height = actual_risk

        if direction == "BUY":
            breakout_point = max(float(breakout_level), entry_trigger + increment)
            close_test = max(float(breakout_extreme), breakout_point + increment)
            swing_target = max(entry_trigger + actual_risk * 2.0, breakout_point + breakout_height)
            stretch_target = max(entry_trigger + actual_risk * 3.0, swing_target + actual_risk * 0.5)
            take_profit = max(breakout_point - increment, entry_trigger + increment)
        else:
            breakout_point = min(float(breakout_level), entry_trigger - increment)
            close_test = min(float(breakout_extreme), breakout_point - increment)
            swing_target = min(entry_trigger - actual_risk * 2.0, breakout_point - breakout_height)
            stretch_target = min(entry_trigger - actual_risk * 3.0, swing_target - actual_risk * 0.5)
            take_profit = min(breakout_point + increment, entry_trigger - increment)

        return {
            "take_profit": float(take_profit),
            "first_target": float(breakout_point),
            "first_target_type": "breakout_point",
            "rescue_target": float(breakout_point),
            "rescue_target_type": "breakout_point",
            "close_test_target": float(close_test),
            "close_test_target_type": "breakout_extreme",
            "swing_target": float(swing_target),
            "swing_target_type": "measured_move_2x",
            "effective_target": float(breakout_point),
            "effective_target_type": "breakout_point",
            "stretch_target": float(stretch_target),
            "stretch_target_type": "measured_move_3x",
            "target_buffer": float(increment),
        }

    def _breakout_pullback_management_plan(
        self,
        cycle: str,
        signal_profile: dict[str, float | bool | str],
        target_plan: dict[str, float | str],
    ) -> dict[str, float | bool | str]:
        """返回突破回调的管理意图。"""
        strong_background = cycle in {"趋势多", "趋势空", "急速多", "急速空"} and bool(signal_profile.get("trend_bar"))
        return {
            "management_template": "breakout_pullback_continuation",
            "first_entry_signal": False,
            "first_profit_at_1x_actual_risk": True,
            "allow_be_after_first_target": True,
            "prefer_partial_over_full_swing": True,
            "allow_small_runner": strong_background,
            "handoff_to_h2_l2_if_failed": False,
            "prefer_lower_entry_be_rescue": False,
            "first_target_is_close_test": False,
            "disappointed_bull_bear_mode": False,
            "rescue_target_active": True,
            "swing_target_active": True,
            "exit_on_failed_follow_through": True,
            "exit_on_return_to_range": cycle == "区间",
            "exit_on_major_channel_break": True,
            "rescue_target_type": str(target_plan.get("rescue_target_type") or ""),
            "close_test_target_type": str(target_plan.get("close_test_target_type") or ""),
            "swing_target_type": str(target_plan.get("swing_target_type") or ""),
            "first_target_type": str(target_plan.get("first_target_type") or ""),
            "stretch_target_type": str(target_plan.get("stretch_target_type") or ""),
        }

    def _build_breakout_pullback_signal(
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
        breakout_level: float,
        breakout_extreme: float,
        atr: float = 0.0,
    ) -> Optional[PASignal]:
        """统一生成突破回调信号。"""
        entry_trigger = self._stop_entry_trigger(curr, direction, candles)
        stop_plan = self._breakout_pullback_stop_plan(candles, curr, direction, cycle, entry_trigger, atr)
        actual_risk = float(stop_plan.get("actual_risk") or 0.0)
        if actual_risk <= 0:
            return None

        target_plan = self._breakout_pullback_target_plan(
            candles,
            direction,
            entry_trigger,
            actual_risk,
            breakout_level=float(breakout_level),
            breakout_extreme=float(breakout_extreme),
        )
        management_plan = self._breakout_pullback_management_plan(cycle, signal_profile, target_plan)

        return PASignal(
            symbol=curr.symbol,
            signal_type="突破回调",
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
            confirmation_needed=True,
            extra={
                "signal_template": "BREAKOUT_PULLBACK",
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
