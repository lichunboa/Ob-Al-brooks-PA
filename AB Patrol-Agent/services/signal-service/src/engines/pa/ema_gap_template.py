"""
均线缺口族模板化辅助模块。

统一承载：
- 20均线缺口
- MAG 20/20 Setup
- 第一均线缺口

把 detector、目标层级、管理意图从主引擎旧逻辑里拆出来，
并复用 H1/L1 已稳定的 STOP / signal bar / actual risk / target-tier 工具。
"""

from __future__ import annotations

from typing import Optional

from .analysis import CandlePatterns
from .models import Candle, PASignal
from .structure_stops import build_channel_recovery_stop, build_trend_pullback_stop


class EMAGapTemplateMixin:
    """封装均线缺口族统一模板。"""

    @staticmethod
    def _select_best_ema_gap_signal(candidates: list[PASignal]) -> Optional[PASignal]:
        """当多空两边都出现候选时，选结构更完整的那一边。"""
        if not candidates:
            return None
        return max(
            candidates,
            key=lambda sig: (
                int((sig.extra or {}).get("ema_gap_bars", 0) or 0),
                float(sig.probability or 0.0),
                int(sig.strength or 0),
            ),
        )

    def _ema_gap_side_buffer(self, candles: list[Candle], reference_price: float) -> float:
        """给“未触及均线”一个最小跳动缓冲，而不是额外结构门槛。"""
        return max(
            self._minimum_price_increment(candles, reference_price),
            abs(reference_price) * 0.00001,
        )

    def _count_ema_gap_bars(
        self,
        candles: list[Candle],
        ema20: list[float],
        direction: str,
        *,
        end_index: int,
        max_bars: int = 60,
        ) -> int:
        """统计信号前连续多少根 K 完整停留在 EMA 同侧。"""
        if end_index <= 0:
            return 0
        bars_away = 0
        for idx in range(end_index, max(end_index - max_bars, -1), -1):
            if idx < 0 or idx >= len(candles) or idx >= len(ema20):
                break
            candle = candles[idx]
            ema_value = float(ema20[idx])
            side_buffer = self._ema_gap_side_buffer(candles[: idx + 1], float(candle.close))
            if direction == "BUY":
                if float(candle.low) > ema_value + side_buffer:
                    bars_away += 1
                    continue
                break
            if float(candle.high) < ema_value - side_buffer:
                bars_away += 1
                continue
            break
        return bars_away

    def _count_ema_gap_context_bars(
        self,
        context_candles: list[Candle],
        context_ema20: list[float],
        direction: str,
        *,
        max_bars: int = 120,
    ) -> int:
        """按背景周期统计 gap bars，而不是把执行周期 bars 当成背景周期 bars。"""
        if not context_candles or not context_ema20:
            return 0
        end_index = min(len(context_candles), len(context_ema20)) - 2
        if end_index < 0:
            return 0
        return self._count_ema_gap_bars(
            context_candles,
            context_ema20,
            direction,
            end_index=end_index,
            max_bars=max_bars,
        )

    def _ema_gap_signal_profile(
        self,
        signal_bar: Candle,
        prior_bar: Candle,
        ema_value: float,
        direction: str,
    ) -> dict[str, float | bool | str]:
        """复用 H1/L1 的 signal bar 类型学。"""
        profile = self._h1_l1_signal_bar_profile(signal_bar, prior_bar, ema_value, direction)
        profile["signal_family"] = "ema_gap"
        return profile

    @staticmethod
    def _ema_gap_touch_and_reclaim(curr: Candle, ema_value: float, direction: str) -> bool:
        """是否出现“触线/短暂穿透后收回趋势侧”。"""
        if direction == "BUY":
            return float(curr.low) <= float(ema_value) and float(curr.close) >= float(ema_value)
        return float(curr.high) >= float(ema_value) and float(curr.close) <= float(ema_value)

    def _ema_gap_recent_touch_context(
        self,
        candles: list[Candle],
        ema20: list[float],
        direction: str,
        *,
        lookback: int = 6,
    ) -> dict[str, int | bool]:
        """
        统计最近几根里是否已经发生 EMA 触碰/回收。

        Brooks / 太妃语境里，20-gap 和第一均线缺口的信号棒不必与“触线/穿线”是同一根。
        更常见的是：
        - 前一两根已经触到或短暂穿透 EMA
        - 当前 signal bar 只是 HL1/LH1 的 stop trigger
        """
        if not candles or not ema20:
            return {
                "touch_count": 0,
                "reclaim_count": 0,
                "last_touch_index": -1,
                "last_reclaim_index": -1,
                "recent_touch_ready": False,
                "recent_reclaim_ready": False,
            }

        signal_index = len(candles) - 1
        start_index = max(0, signal_index - lookback)
        touch_indices: list[int] = []
        reclaim_indices: list[int] = []

        for idx in range(start_index, signal_index + 1):
            if idx >= len(ema20):
                break
            candle = candles[idx]
            ema_value = float(ema20[idx])
            side_buffer = self._ema_gap_side_buffer(candles[: idx + 1], float(candle.close))
            if direction == "BUY":
                touched = float(candle.low) <= ema_value + side_buffer
                reclaimed = float(candle.close) >= ema_value
            else:
                touched = float(candle.high) >= ema_value - side_buffer
                reclaimed = float(candle.close) <= ema_value
            if touched:
                touch_indices.append(idx)
            if touched and reclaimed:
                reclaim_indices.append(idx)

        last_touch_index = touch_indices[-1] if touch_indices else -1
        last_reclaim_index = reclaim_indices[-1] if reclaim_indices else -1
        return {
            "touch_count": len(touch_indices),
            "reclaim_count": len(reclaim_indices),
            "last_touch_index": last_touch_index,
            "last_reclaim_index": last_reclaim_index,
            # Brooks / 太妃里，触线/穿线和真正的 HL1/LH1 signal bar 可以分离若干根，
            # 不能再按“只容忍 2 根内”去卡死。
            "recent_touch_ready": last_touch_index >= signal_index - 4,
            "recent_reclaim_ready": last_reclaim_index >= signal_index - 4,
        }

    @staticmethod
    def _ema_gap_crossed_other_side(curr: Candle, ema_value: float, direction: str) -> bool:
        """是否真正穿透到了均线另一侧。"""
        if direction == "BUY":
            return float(curr.close) < float(ema_value) or float(curr.low) < float(ema_value)
        return float(curr.close) > float(ema_value) or float(curr.high) > float(ema_value)

    def _ema_gap_recent_opposite_side_bars(
        self,
        candles: list[Candle],
        ema20: list[float],
        direction: str,
        *,
        lookback: int = 4,
    ) -> int:
        """统计最近是否已有穿透到均线对侧的 K 线。"""
        recent = 0
        start = max(0, len(candles) - lookback)
        for idx in range(start, len(candles)):
            if idx >= len(ema20):
                break
            if self._ema_gap_crossed_other_side(candles[idx], float(ema20[idx]), direction):
                recent += 1
        return recent

    def _ema_gap_full_opposite_gap_bar(
        self,
        candle: Candle,
        ema_value: float,
        direction: str,
        *,
        side_buffer: float,
    ) -> bool:
        """判断当前 K 线是否整根站到 EMA 另一侧，形成 MAG 语义里的 gap bar。"""
        if direction == "BUY":
            return float(candle.high) < float(ema_value) - side_buffer
        return float(candle.low) > float(ema_value) + side_buffer

    def _ema_gap_recent_opposite_gap_cluster(
        self,
        candles: list[Candle],
        ema20: list[float],
        direction: str,
        *,
        search_bars: int = 8,
        max_cluster_bars: int = 6,
        max_bars_after_cluster: int = 3,
    ) -> dict[str, int]:
        """寻找 signal 前最近一段 opposite gap cluster，不要求必须紧贴 signal bar。"""
        if len(candles) < 2 or len(ema20) < 2:
            return {"count": 0, "start_index": -1, "end_index": -1, "bars_after_cluster": -1}

        signal_index = len(candles) - 1
        scan_start = max(0, signal_index - search_bars)
        gap_flags: list[bool] = []
        for idx in range(scan_start, signal_index):
            if idx >= len(ema20):
                gap_flags.append(False)
                continue
            candle = candles[idx]
            side_buffer = self._ema_gap_side_buffer(candles[: idx + 1], float(candle.close))
            gap_flags.append(
                self._ema_gap_full_opposite_gap_bar(
                    candle,
                    float(ema20[idx]),
                    direction,
                    side_buffer=side_buffer,
                )
            )

        best = {"count": 0, "start_index": -1, "end_index": -1, "bars_after_cluster": -1}
        index = len(gap_flags) - 1
        while index >= 0:
            if not gap_flags[index]:
                index -= 1
                continue
            cluster_end = scan_start + index
            cluster_start = cluster_end
            count = 1
            index -= 1
            while index >= 0 and gap_flags[index] and count < max_cluster_bars:
                cluster_start = scan_start + index
                count += 1
                index -= 1

            bars_after_cluster = signal_index - cluster_end - 1
            if bars_after_cluster <= max_bars_after_cluster:
                best = {
                    "count": count,
                    "start_index": cluster_start,
                    "end_index": cluster_end,
                    "bars_after_cluster": bars_after_cluster,
                }
                break

        return best

    def _ema_gap_strong_opposite_follow_through(
        self,
        candles: list[Candle],
        ema20: list[float],
        direction: str,
        *,
        lookback: int = 3,
    ) -> bool:
        """第一均线缺口需要避免穿透 EMA 后出现强劲同色跟进。"""
        if len(candles) < 3 or len(ema20) < 3:
            return False

        opposite_direction = "SELL" if direction == "BUY" else "BUY"
        strong_bars = 0
        start = max(1, len(candles) - 1 - lookback)
        end = len(candles) - 1
        for idx in range(start, end):
            if idx >= len(ema20):
                break
            candle = candles[idx]
            if not self._ema_gap_crossed_other_side(candle, float(ema20[idx]), direction):
                continue
            profile = self._h1_l1_signal_bar_profile(candle, candles[idx - 1], float(ema20[idx]), opposite_direction)
            if bool(profile.get("trend_bar")) and bool(profile.get("close_near_extreme_strong")):
                strong_bars += 1
        return strong_bars >= 2

    def _ema_gap_mag_signal_ready(
        self,
        curr: Candle,
        prior_bar: Candle,
        ema_value: float,
        direction: str,
        signal_profile: dict[str, float | bool | str],
        *,
        gap_cluster_count: int,
        current_is_opposite_gap_bar: bool,
    ) -> bool:
        """
        MAG 的 signal bar 既可以是：
        1. 当前这根就是 first EMA gap bar；
        2. 先出现一根/几根 opposite gap bar，随后出现趋势恢复 signal。
        """
        if gap_cluster_count <= 0:
            return False
        current_gap_signal = bool(
            current_is_opposite_gap_bar
            and float(signal_profile.get("body_ratio") or 0.0) >= 0.18
            and (
                bool(signal_profile.get("trend_bar"))
                or bool(signal_profile.get("reversal_bar"))
                or bool(signal_profile.get("close_near_extreme_strong"))
            )
        )
        if current_gap_signal:
            return True

        reversal_after_gap = bool(
            (
                bool(signal_profile.get("trend_bar"))
                and bool(signal_profile.get("close_near_extreme"))
            )
            or (
                bool(signal_profile.get("reversal_bar"))
                and bool(signal_profile.get("close_near_extreme"))
                and float(signal_profile.get("body_ratio") or 0.0) >= 0.18
            )
            or (
                bool(signal_profile.get("ema_recovery"))
                and bool(signal_profile.get("close_near_extreme"))
                and float(signal_profile.get("body_ratio") or 0.0) >= 0.24
            )
            or (
                bool(signal_profile.get("outside_follow"))
                and bool(signal_profile.get("close_near_extreme"))
                and float(signal_profile.get("body_ratio") or 0.0) >= 0.24
            )
        )
        if not reversal_after_gap:
            return False

        return reversal_after_gap

    def _ema_gap_variant_profile(
        self,
        candles: list[Candle],
        ema20: list[float],
        cycle: str,
        direction: str,
        *,
        first_reentry: bool,
        gap_context_candles: Optional[list[Candle]] = None,
        gap_context_ema20: Optional[list[float]] = None,
        gap_context_timeframe: str = "",
    ) -> dict[str, object]:
        """
        按 Brooks + 太妃课程区分 gap 族子类型。

        - 20均线缺口：20-30 根同侧后的首次 EMA 回测
        - MAG：>30 根或明显过度延伸后的 final leg / trend resumption
        - 第一均线缺口：首次穿透对侧后回到原趋势侧
        """
        signal_index = len(candles) - 1
        continuation_end_index = signal_index - 1
        signal_bar = candles[-1]
        prior_bar = candles[-2]
        ema_value = float(ema20[-1])
        signal_profile = self._ema_gap_signal_profile(signal_bar, prior_bar, ema_value, direction)
        recent_touch = self._ema_gap_recent_touch_context(candles, ema20, direction)
        gap_cluster = self._ema_gap_recent_opposite_gap_cluster(candles, ema20, direction)
        current_side_buffer = self._ema_gap_side_buffer(candles, float(signal_bar.close))
        current_is_opposite_gap_bar = self._ema_gap_full_opposite_gap_bar(
            signal_bar,
            ema_value,
            direction,
            side_buffer=current_side_buffer,
        )
        mag_gap_cluster_count = gap_cluster["count"] + (1 if current_is_opposite_gap_bar else 0)
        mag_bars_after_cluster = int(gap_cluster.get("bars_after_cluster", -1) or -1)
        if current_is_opposite_gap_bar:
            mag_count_end_index = continuation_end_index
        else:
            mag_count_end_index = gap_cluster["start_index"] - 1 if gap_cluster["count"] > 0 else continuation_end_index
        reentry_recent_start = max(0, signal_index - 4)
        opposite_indices = [
            idx
            for idx in range(reentry_recent_start, signal_index)
            if idx < len(ema20) and self._ema_gap_crossed_other_side(candles[idx], float(ema20[idx]), direction)
        ]
        reentry_count_end_index = opposite_indices[0] - 1 if opposite_indices else continuation_end_index

        use_context_count = bool(gap_context_candles and gap_context_ema20 and gap_context_timeframe)
        if use_context_count:
            continuation_bars_away = self._count_ema_gap_context_bars(gap_context_candles or [], gap_context_ema20 or [], direction)
            mag_setup_bars_away = continuation_bars_away
            reentry_bars_away = continuation_bars_away
        else:
            continuation_bars_away = self._count_ema_gap_bars(candles, ema20, direction, end_index=continuation_end_index)
            mag_setup_bars_away = self._count_ema_gap_bars(candles, ema20, direction, end_index=mag_count_end_index)
            reentry_bars_away = self._count_ema_gap_bars(candles, ema20, direction, end_index=reentry_count_end_index)

        reclaimed_prior_close = (
            float(signal_bar.close) >= float(prior_bar.close)
            if direction == "BUY"
            else float(signal_bar.close) <= float(prior_bar.close)
        )
        strong_opposite_follow_through = self._ema_gap_strong_opposite_follow_through(candles, ema20, direction)
        last_cross_index = opposite_indices[-1] if opposite_indices else -1
        has_reclaim_after_cross = bool(
            recent_touch["recent_reclaim_ready"]
            and recent_touch["last_reclaim_index"] > last_cross_index
        )

        if first_reentry:
            if (
                not has_reclaim_after_cross
                or reentry_bars_away < 20
                or reentry_bars_away > 45
                or strong_opposite_follow_through
            ):
                return {
                    "valid": False,
                    "bars_away": reentry_bars_away,
                    "signal_profile": signal_profile,
                    "reason": "first_reentry_invalid",
                }
            return {
                "valid": True,
                "bars_away": reentry_bars_away,
                "overextended": reentry_bars_away > 30,
                "label": "第一均线缺口",
                "message_prefix": "第一均线缺口",
                "strength": 76,
                "probability": 0.57,
                "management_template": "first_ema_gap_reentry",
                "management_style_override": "brooks_swing",
                "signal_profile": signal_profile,
                "reclaimed_prior_close": reclaimed_prior_close,
                "last_touch_index": recent_touch["last_touch_index"],
                "last_reclaim_index": recent_touch["last_reclaim_index"],
                "last_cross_index": last_cross_index,
                "bars_away_reference_timeframe": gap_context_timeframe or candles[-1].timeframe,
            }

        mag_candidate = self._ema_gap_mag_signal_ready(
            signal_bar,
            prior_bar,
            ema_value,
            direction,
            signal_profile,
            gap_cluster_count=mag_gap_cluster_count,
            current_is_opposite_gap_bar=current_is_opposite_gap_bar,
        )
        # Brooks 的 MAG 不是“再套一层 20-gap 阈值”，
        # 而是强趋势里第一次或前几次整根站到 EMA 对侧后的恢复/最后一腿。
        # page 150 明确给了“6 bars completely above EMA in bear trend”的示例，
        # 所以 MAG 不能继续硬卡 >=20 bars away。
        mag_context_ready = cycle != "区间"
        mag_trend_extension_ready = mag_setup_bars_away >= 6
        mag_cluster_ready = mag_gap_cluster_count > 0 and (
            current_is_opposite_gap_bar or 0 <= mag_bars_after_cluster <= 3
        )
        if mag_context_ready and mag_candidate and mag_cluster_ready and mag_trend_extension_ready:
            return {
                "valid": True,
                "bars_away": mag_setup_bars_away,
                "overextended": mag_setup_bars_away > 40,
                "label": "MAG 20/20 Setup",
                "message_prefix": "MAG 20/20 Setup",
                "strength": 84,
                "probability": 0.64,
                "management_template": "ema_gap_mag_final_leg",
                "management_style_override": "brooks_tr_blshs",
                "signal_profile": signal_profile,
                "reclaimed_prior_close": reclaimed_prior_close,
                "current_is_gap_signal_bar": bool(current_is_opposite_gap_bar and float(signal_profile.get("body_ratio") or 0.0) >= 0.18),
                "mag_signal_mode": "gap_bar" if current_is_opposite_gap_bar else "reversal_after_gap",
                "gap_cluster_count": mag_gap_cluster_count,
                "gap_cluster_bars_after_signal": mag_bars_after_cluster,
                "bars_away_reference_timeframe": gap_context_timeframe or candles[-1].timeframe,
            }

        if continuation_bars_away < 20 or not bool(recent_touch["recent_touch_ready"]):
            return {
                "valid": False,
                "bars_away": continuation_bars_away,
                "signal_profile": signal_profile,
                "reason": "continuation_invalid",
            }

        return {
            "valid": True,
            "bars_away": continuation_bars_away,
            "overextended": continuation_bars_away > 40,
            "label": "20均线缺口",
            "message_prefix": "20均线缺口",
            "strength": 81,
            "probability": 0.62,
            "management_template": "ema_gap_continuation",
            "management_style_override": "brooks_swing",
            "signal_profile": signal_profile,
            "reclaimed_prior_close": reclaimed_prior_close,
            "last_touch_index": recent_touch["last_touch_index"],
            "last_reclaim_index": recent_touch["last_reclaim_index"],
            "bars_away_reference_timeframe": gap_context_timeframe or candles[-1].timeframe,
        }

    def _ema_gap_stop_plan(
        self,
        candles: list[Candle],
        signal_bar: Candle,
        direction: str,
        cycle: str,
        entry_trigger: float,
        signal_profile: dict[str, float | bool | str],
        atr: float = 0.0,
    ) -> dict[str, float | str]:
        """返回 gap 族初始止损。"""
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

        selected_stop = swing_stop
        selected_type = "swing_stop"
        if bool(signal_profile.get("trend_bar")) and bool(signal_profile.get("close_near_extreme_strong")):
            selected_stop = signal_bar_stop
            selected_type = "signal_bar_stop"

        actual_risk = entry_trigger - selected_stop if direction == "BUY" else selected_stop - entry_trigger
        nominal_risk = entry_trigger - signal_bar_stop if direction == "BUY" else signal_bar_stop - entry_trigger
        return {
            "stop_loss": float(selected_stop),
            "stop_type": selected_type,
            "nominal_risk": float(max(nominal_risk, 0.0)),
            "actual_risk": float(max(actual_risk, 0.0)),
            "signal_bar_stop": float(signal_bar_stop),
            "swing_stop": float(swing_stop),
        }

    def _ema_gap_target_plan(
        self,
        candles: list[Candle],
        direction: str,
        entry_trigger: float,
        actual_risk: float,
        *,
        variant: str,
        overextended: bool,
    ) -> dict[str, float | str | bool]:
        """按 gap 子类型返回 rescue / close-test / swing 目标层级。"""
        increment = self._minimum_price_increment(candles, entry_trigger)
        context = candles[-40:-1] if len(candles) > 1 else candles
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
                "swing_target": float(entry_trigger + actual_risk * 2.0 if direction == "BUY" else entry_trigger - actual_risk * 2.0),
                "swing_target_type": "measured_move_2x",
                "effective_target": float(fallback_target),
                "effective_target_type": "measured_move_1x",
                "stretch_target": float(entry_trigger + actual_risk * 2.5 if direction == "BUY" else entry_trigger - actual_risk * 2.5),
                "stretch_target_type": "measured_move_2_5x",
                "target_buffer": float(increment),
                "valid_previous_entry": False,
            }

        recent = context[-12:] if len(context) >= 12 else context
        if direction == "BUY":
            close_extreme = max(float(bar.close) for bar in context)
            prior_extreme = max(float(bar.high) for bar in context)
            recent_origin = max(float(bar.high) for bar in recent)
            rescue_target = close_extreme if close_extreme > entry_trigger + increment else 0.0
            close_test_target = prior_extreme if prior_extreme > max(entry_trigger + increment, rescue_target + increment) else 0.0
        else:
            close_extreme = min(float(bar.close) for bar in context)
            prior_extreme = min(float(bar.low) for bar in context)
            recent_origin = min(float(bar.low) for bar in recent)
            rescue_target = close_extreme if close_extreme < entry_trigger - increment else 0.0
            close_test_target = prior_extreme if prior_extreme < min(entry_trigger - increment, rescue_target - increment if rescue_target > 0 else entry_trigger - increment) else 0.0

        valid_previous_entry = rescue_target > 0
        swing_base = actual_risk * (1.6 if variant == "ema_gap_mag_final_leg" else 2.0)
        if direction == "BUY":
            swing_target = max(recent_origin if recent_origin > entry_trigger + increment else 0.0, entry_trigger + swing_base)
            stretch_target = max(swing_target + actual_risk * 0.5, entry_trigger + actual_risk * 2.5)
        else:
            swing_target = min(recent_origin if recent_origin < entry_trigger - increment else entry_trigger, entry_trigger - swing_base)
            stretch_target = min(swing_target - actual_risk * 0.5, entry_trigger - actual_risk * 2.5)

        if variant == "ema_gap_continuation":
            first_target = close_test_target or rescue_target or swing_target
            first_target_type = "prior_high" if direction == "BUY" else "prior_low"
            if rescue_target and not close_test_target:
                first_target_type = "highest_close" if direction == "BUY" else "lowest_close"
        elif variant == "ema_gap_mag_final_leg":
            first_target = rescue_target or close_test_target or swing_target
            first_target_type = "highest_close" if direction == "BUY" else "lowest_close"
            if overextended and close_test_target > 0:
                swing_target = close_test_target
                stretch_target = swing_target
        else:
            first_target = close_test_target or rescue_target or swing_target
            first_target_type = "prior_high" if direction == "BUY" else "prior_low"
            if rescue_target and not close_test_target:
                first_target_type = "highest_close" if direction == "BUY" else "lowest_close"
            if close_test_target > 0:
                swing_target = (
                    close_test_target
                    if overextended
                    else max(close_test_target, swing_target)
                    if direction == "BUY"
                    else min(close_test_target, swing_target)
                )

        if direction == "BUY":
            take_profit = max(first_target - increment, entry_trigger + increment)
        else:
            take_profit = min(first_target + increment, entry_trigger - increment)

        return {
            "take_profit": float(take_profit),
            "first_target": float(first_target),
            "first_target_type": first_target_type,
            "rescue_target": float(rescue_target),
            "rescue_target_type": "highest_close" if rescue_target > 0 and direction == "BUY" else ("lowest_close" if rescue_target > 0 else ""),
            "close_test_target": float(close_test_target),
            "close_test_target_type": "prior_high" if close_test_target > 0 and direction == "BUY" else ("prior_low" if close_test_target > 0 else ""),
            "swing_target": float(swing_target),
            "swing_target_type": "pullback_origin" if recent_origin else "measured_move_2x",
            "effective_target": float(first_target),
            "effective_target_type": first_target_type,
            "stretch_target": float(stretch_target),
            "stretch_target_type": "measured_move_2_5x",
            "target_buffer": float(increment),
            "valid_previous_entry": bool(valid_previous_entry),
        }

    def _ema_gap_management_plan(
        self,
        *,
        cycle: str,
        variant: str,
        signal_profile: dict[str, float | bool | str],
        target_plan: dict[str, float | str | bool],
        overextended: bool,
    ) -> dict[str, float | bool | str]:
        """返回 gap 族的管理意图。"""
        strong_background = cycle in {"趋势多", "趋势空", "急速多", "急速空"} and bool(signal_profile.get("trend_bar"))
        first_target_type = str(target_plan.get("first_target_type") or "")
        allow_runner = strong_background and not overextended and variant == "ema_gap_continuation"
        management_style_override = "brooks_swing"
        if variant in {"ema_gap_mag_final_leg", "first_ema_gap_reentry"}:
            management_style_override = "brooks_tr_blshs"

        return {
            "management_template": variant,
            "management_style_override": management_style_override,
            "first_entry_signal": variant in {"ema_gap_continuation", "first_ema_gap_reentry"},
            "first_profit_at_1x_actual_risk": first_target_type not in {"highest_close", "lowest_close"},
            "allow_be_after_first_target": True,
            "prefer_partial_over_full_swing": True,
            "allow_small_runner": allow_runner,
            "handoff_to_h2_l2_if_failed": False,
            "prefer_lower_entry_be_rescue": variant == "first_ema_gap_reentry",
            "first_target_is_close_test": first_target_type in {"highest_close", "lowest_close", "prior_high", "prior_low"},
            "disappointed_bull_bear_mode": variant != "ema_gap_continuation",
            "rescue_target_active": float(target_plan.get("rescue_target") or 0.0) > 0,
            "swing_target_active": float(target_plan.get("swing_target") or 0.0) > 0,
            "exit_on_failed_follow_through": True,
            "exit_on_return_to_range": cycle == "区间" or overextended,
            "exit_on_major_channel_break": True,
            "rescue_target_type": str(target_plan.get("rescue_target_type") or ""),
            "close_test_target_type": str(target_plan.get("close_test_target_type") or ""),
            "swing_target_type": str(target_plan.get("swing_target_type") or ""),
            "first_target_type": first_target_type,
            "stretch_target_type": str(target_plan.get("stretch_target_type") or ""),
        }

    def _build_ema_gap_signal(
        self,
        *,
        curr: Candle,
        candles: list[Candle],
        ema20: list[float],
        cycle: str,
        direction: str,
        first_reentry: bool,
        atr: float = 0.0,
        gap_context_candles: Optional[list[Candle]] = None,
        gap_context_ema20: Optional[list[float]] = None,
        gap_context_timeframe: str = "",
    ) -> Optional[PASignal]:
        """统一生成 gap 族信号。"""
        if (not cycle.startswith("趋势") and not cycle.startswith("急速") and cycle != "区间") or len(candles) < 25 or len(ema20) < 25:
            return None

        variant_profile = self._ema_gap_variant_profile(
            candles,
            ema20,
            cycle,
            direction,
            first_reentry=first_reentry,
            gap_context_candles=gap_context_candles,
            gap_context_ema20=gap_context_ema20,
            gap_context_timeframe=gap_context_timeframe,
        )
        if not bool(variant_profile.get("valid")):
            return None

        signal_profile = dict(variant_profile["signal_profile"])
        allow_mag_gap_signal_bar = bool(
            str(variant_profile.get("management_template") or "") == "ema_gap_mag_final_leg"
            and bool(variant_profile.get("current_is_gap_signal_bar"))
        )
        if not bool(signal_profile.get("valid_signal_bar")) and not allow_mag_gap_signal_bar:
            return None

        entry_trigger = self._stop_entry_trigger(curr, direction, candles)
        stop_plan = self._ema_gap_stop_plan(candles, curr, direction, cycle, entry_trigger, signal_profile, atr)
        actual_risk = float(stop_plan.get("actual_risk") or 0.0)
        if actual_risk <= 0:
            return None

        target_plan = self._ema_gap_target_plan(
            candles,
            direction,
            entry_trigger,
            actual_risk,
            variant=str(variant_profile["management_template"]),
            overextended=bool(variant_profile.get("overextended", False)),
        )
        management_plan = self._ema_gap_management_plan(
            cycle=cycle,
            variant=str(variant_profile["management_template"]),
            signal_profile=signal_profile,
            target_plan=target_plan,
            overextended=bool(variant_profile.get("overextended", False)),
        )

        bars_away = int(variant_profile.get("bars_away", 0) or 0)
        label = str(variant_profile["label"])
        message = f"{variant_profile['message_prefix']}：{bars_away}根同侧后回测 EMA，先看 close-test 再评估 swing"

        return PASignal(
            symbol=curr.symbol,
            signal_type=label,
            direction=direction,
            strength=min(95, int(variant_profile["strength"])),
            message=message,
            price=curr.close,
            stop_loss=float(stop_plan["stop_loss"]),
            take_profit=float(target_plan["take_profit"]),
            probability=float(variant_profile["probability"]),
            cycle=cycle,
            timeframe=curr.timeframe,
            signal_bar_high=curr.high,
            signal_bar_low=curr.low,
            entry_trigger=entry_trigger,
            entry_type="STOP",
            extra={
                "signal_template": "EMA_GAP",
                "signal_bar_quality": float(signal_profile["body_ratio"]),
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
                "reclaimed_prior_close": bool(variant_profile.get("reclaimed_prior_close", False)),
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
                "valid_previous_entry": target_plan["valid_previous_entry"],
                "ema_gap_bars": bars_away,
                "ema_gap_variant": label,
                "ema_gap_overextended": bool(variant_profile.get("overextended", False)),
                "ema_gap_first_reentry": bool(first_reentry),
                "ema_gap_last_touch_index": int(variant_profile.get("last_touch_index", -1) or -1),
                "ema_gap_last_reclaim_index": int(variant_profile.get("last_reclaim_index", -1) or -1),
                "ema_gap_last_cross_index": int(variant_profile.get("last_cross_index", -1) or -1),
                "ema_gap_bars_reference_timeframe": str(variant_profile.get("bars_away_reference_timeframe") or curr.timeframe),
                "ema_gap_mag_signal_mode": str(variant_profile.get("mag_signal_mode") or ""),
                "ema_gap_current_gap_signal_bar": bool(variant_profile.get("current_is_gap_signal_bar", False)),
                **management_plan,
            },
        )
