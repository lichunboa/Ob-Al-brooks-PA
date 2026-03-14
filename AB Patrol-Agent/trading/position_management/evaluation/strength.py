"""强度评估：用 Brooks 的结构证据判断持仓是否仍值得继续持有。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float

from ..common import get_attr, get_position_attr


def _resolve_family(management_style: str) -> str:
    """从 management_style 推断 Brooks 管理家族。"""
    style = str(management_style or "").strip().lower()
    if style in ("brooks_swing", "brooks_t4_wedge_pullback"):
        return "trend_recovery"
    if style in (
        "brooks_mtr_reversal",
        "brooks_r3_channel_line_fade",
        "brooks_s1_htf_sr_reversal",
        "brooks_s2_micro_channel",
    ):
        return "mtr_reversal"
    if style == "brooks_climax_reversal":
        return "climax_reversal"
    if style == "brooks_breakout":
        return "breakout_follow"
    if style in ("brooks_scalp", "brooks_tr_blshs", "brooks_tr4_daily_tr_fade"):
        return "tr_scalp"
    return ""


def _bar_body(bar: Any) -> float:
    """返回单根 K 线实体大小。"""
    close_price = safe_float(get_attr(bar, "C"), 0.0)
    open_price = safe_float(get_attr(bar, "O"), 0.0)
    return abs(close_price - open_price)


def _bar_mid(bar: Any) -> float:
    """返回单根 K 线中点。"""
    high_price = safe_float(get_attr(bar, "H"), 0.0)
    low_price = safe_float(get_attr(bar, "L"), 0.0)
    if high_price or low_price:
        return (high_price + low_price) / 2
    return safe_float(get_attr(bar, "C"), 0.0)


def _recent_ft_context(side: str, recent_bars: list[Any]) -> tuple[bool, bool, bool]:
    """
    评估最近 3 根 K 线的 follow-through、acceptance 与差跟进。

    Brooks 里更重视：
    1. 是否有方向上的连续收盘
    2. 是否收在 bar 的有利一侧
    3. 是否至少有一根像样实体
    """
    if len(recent_bars) < 3:
        return False, False, False

    last_3 = recent_bars[-3:]
    avg_body = sum(_bar_body(bar) for bar in recent_bars) / max(1, len(recent_bars))
    directional_closes = 0
    good_closes = 0
    solid_bodies = 0
    opposite_closes = 0

    for bar in last_3:
        close_price = safe_float(get_attr(bar, "C"), 0.0)
        open_price = safe_float(get_attr(bar, "O"), 0.0)
        mid_price = _bar_mid(bar)
        body = _bar_body(bar)

        if side == "BUY":
            if close_price > open_price:
                directional_closes += 1
            elif close_price < open_price:
                opposite_closes += 1
            if close_price >= mid_price:
                good_closes += 1
        else:
            if close_price < open_price:
                directional_closes += 1
            elif close_price > open_price:
                opposite_closes += 1
            if close_price <= mid_price:
                good_closes += 1

        if body >= avg_body * 0.8:
            solid_bodies += 1

    good_follow_through = directional_closes >= 2 and good_closes >= 2 and solid_bodies >= 1
    accepted = directional_closes >= 1 and good_closes >= 2
    poor_follow_through = opposite_closes >= 2 or (directional_closes == 0 and good_closes <= 1)
    return good_follow_through, accepted, poor_follow_through


def _collect_signals(
    position: dict[str, Any],
    market_data: dict[str, Any],
) -> dict[str, bool]:
    """收集用于 Brooks 强度判断的结构证据。"""
    side = str(get_position_attr(position, "side", "") or "").upper()
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0.0)
    entry_time = str(get_position_attr(position, "entry_time", "") or "")

    ab_sr = market_data.get("ab_sr", {}) if isinstance(market_data.get("ab_sr"), dict) else {}
    ab_ema = market_data.get("ab_ema", {}) if isinstance(market_data.get("ab_ema"), dict) else {}
    ab_patterns = market_data.get("ab_patterns", {}) if isinstance(market_data.get("ab_patterns"), dict) else {}
    recent_bars = list(market_data.get("recent_bars", []) or [])
    current_price = safe_float(market_data.get("current_price"), 0.0)
    timeframes = market_data.get("timeframes", {}) if isinstance(market_data.get("timeframes"), dict) else {}

    signals: dict[str, bool] = {}

    gaps = ab_sr.get("gaps", [])
    signals["gap_open"] = any(
        safe_float(gap.get("gap_size"), 0.0) > 0
        for gap in gaps
        if isinstance(gap, dict)
    )

    major_hl = safe_float(ab_sr.get("major_hl"), 0.0)
    major_lh = safe_float(ab_sr.get("major_lh"), 0.0)
    if side == "BUY":
        signals["new_hl_lh"] = major_hl > entry_price > 0
    else:
        signals["new_hl_lh"] = 0 < major_lh < entry_price

    ema20 = safe_float(ab_ema.get("ema20"), 0.0)
    if side == "BUY":
        signals["ema_acceptance"] = ema20 > 0 and current_price >= ema20
    else:
        signals["ema_acceptance"] = ema20 > 0 and current_price <= ema20

    prior_close = safe_float(ab_sr.get("prior_close"), 0.0)
    if side == "BUY":
        signals["reclaimed_prior_close"] = prior_close > 0 and current_price >= prior_close
    else:
        signals["reclaimed_prior_close"] = prior_close > 0 and current_price <= prior_close

    signals["micro_gap"] = False
    if len(recent_bars) >= 3:
        for index in range(len(recent_bars) - 1):
            bar_1 = recent_bars[index]
            bar_2 = recent_bars[index + 1]
            if side == "BUY":
                if safe_float(get_attr(bar_2, "L"), 0.0) > safe_float(get_attr(bar_1, "H"), 0.0):
                    signals["micro_gap"] = True
                    break
            else:
                if safe_float(get_attr(bar_2, "H"), 0.0) < safe_float(get_attr(bar_1, "L"), 0.0):
                    signals["micro_gap"] = True
                    break

    signals["shallow_pb"] = False
    if len(recent_bars) >= 4:
        bars_after_entry = [bar for bar in recent_bars if str(get_attr(bar, "time", "") or "") > entry_time]
        if bars_after_entry:
            highest = max(safe_float(get_attr(bar, "H"), 0.0) for bar in bars_after_entry)
            lowest = min(safe_float(get_attr(bar, "L"), 0.0) for bar in bars_after_entry)
            if side == "BUY" and highest > entry_price:
                retrace = highest - lowest
                advance = max(highest - entry_price, 1e-9)
                signals["shallow_pb"] = retrace / advance <= 0.5
            elif side == "SELL" and lowest < entry_price:
                retrace = highest - lowest
                advance = max(entry_price - lowest, 1e-9)
                signals["shallow_pb"] = retrace / advance <= 0.5

    patterns = ab_patterns.get("patterns", [])
    signals["wedge_exhaustion"] = any(
        "wedge" in str(pattern.get("type", "")).lower()
        and str(pattern.get("status", "")).lower() == "exhaustion"
        for pattern in patterns
        if isinstance(pattern, dict)
    )

    current_tf = str(get_position_attr(position, "timeframe", "") or "")
    higher_tf = str(get_position_attr(position, "higher_timeframe", "") or "")
    ordered_tfs = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]
    if not higher_tf and current_tf in ordered_tfs:
        current_index = ordered_tfs.index(current_tf)
        if current_index + 1 < len(ordered_tfs):
            higher_tf = ordered_tfs[current_index + 1]

    current_trend = str((timeframes.get(current_tf, {}) or {}).get("trend", "")).lower()
    higher_trend = str((timeframes.get(higher_tf, {}) or {}).get("trend", "")).lower()
    if side == "BUY":
        signals["multi_tf_align"] = "bull" in current_trend and ("bull" in higher_trend or not higher_trend)
    else:
        signals["multi_tf_align"] = "bear" in current_trend and ("bear" in higher_trend or not higher_trend)

    signals["in_profit"] = (
        (side == "BUY" and current_price > entry_price)
        or (side == "SELL" and current_price < entry_price)
    )

    good_ft, accepted, poor_ft = _recent_ft_context(side, recent_bars)
    signals["good_follow_through"] = good_ft
    signals["accepted"] = accepted
    signals["poor_follow_through"] = poor_ft
    signals["channel_to_tr"] = poor_ft and not signals["new_hl_lh"] and not signals["micro_gap"]
    return signals


def _family_strength(family: str, signals: dict[str, bool]) -> tuple[str, list[str], list[str]]:
    """根据家族把结构证据映射成强/中/弱。"""
    positive: list[str] = []
    warnings: list[str] = []

    if signals.get("poor_follow_through"):
        warnings.append("poor_follow_through")
    if signals.get("channel_to_tr"):
        warnings.append("channel_to_tr")

    if family == "trend_recovery":
        if signals.get("new_hl_lh"):
            positive.append("new_hl_lh")
        if signals.get("good_follow_through"):
            positive.append("good_follow_through")
        if signals.get("ema_acceptance"):
            positive.append("ema_acceptance")
        if signals.get("shallow_pb"):
            positive.append("shallow_pb")
        if signals.get("micro_gap"):
            positive.append("micro_gap")

        if signals.get("new_hl_lh") and (
            signals.get("good_follow_through")
            or signals.get("ema_acceptance")
            or signals.get("micro_gap")
        ):
            return "高", positive, warnings
        if signals.get("in_profit") and (
            signals.get("accepted")
            or signals.get("ema_acceptance")
            or signals.get("shallow_pb")
        ):
            return "中", positive, warnings
        if signals.get("channel_to_tr") or (
            signals.get("poor_follow_through") and not signals.get("in_profit")
        ):
            return "低", positive, warnings
        return "中" if positive else "低", positive, warnings

    if family == "mtr_reversal":
        if signals.get("new_hl_lh"):
            positive.append("new_hl_lh")
        if signals.get("reclaimed_prior_close"):
            positive.append("reclaimed_prior_close")
        if signals.get("good_follow_through"):
            positive.append("good_follow_through")
        if signals.get("multi_tf_align"):
            positive.append("multi_tf_align")

        if signals.get("new_hl_lh") and (
            signals.get("good_follow_through") or signals.get("reclaimed_prior_close")
        ):
            return "高", positive, warnings
        if signals.get("new_hl_lh") or (
            signals.get("accepted") and signals.get("reclaimed_prior_close")
        ):
            return "中", positive, warnings
        if signals.get("poor_follow_through") and not signals.get("new_hl_lh"):
            return "低", positive, warnings
        return "中" if positive else "低", positive, warnings

    if family == "climax_reversal":
        if signals.get("wedge_exhaustion"):
            positive.append("wedge_exhaustion")
        if signals.get("new_hl_lh"):
            positive.append("new_hl_lh")
        if signals.get("good_follow_through"):
            positive.append("good_follow_through")
        if signals.get("reclaimed_prior_close"):
            positive.append("reclaimed_prior_close")

        if signals.get("wedge_exhaustion") and signals.get("new_hl_lh") and (
            signals.get("good_follow_through") or signals.get("reclaimed_prior_close")
        ):
            return "高", positive, warnings
        if signals.get("wedge_exhaustion") and (
            signals.get("accepted") or signals.get("reclaimed_prior_close")
        ):
            return "中", positive, warnings
        return "低" if not positive else "中", positive, warnings

    if family == "breakout_follow":
        if signals.get("good_follow_through"):
            positive.append("good_follow_through")
        if signals.get("gap_open"):
            positive.append("gap_open")
        if signals.get("micro_gap"):
            positive.append("micro_gap")
        if signals.get("multi_tf_align"):
            positive.append("multi_tf_align")

        if signals.get("good_follow_through") and (
            signals.get("gap_open") or signals.get("micro_gap") or signals.get("multi_tf_align")
        ):
            return "高", positive, warnings
        if signals.get("good_follow_through") or (
            signals.get("accepted") and signals.get("in_profit")
        ):
            return "中", positive, warnings
        if signals.get("poor_follow_through") and not signals.get("gap_open"):
            return "低", positive, warnings
        return "中" if positive else "低", positive, warnings

    if family == "tr_scalp":
        if signals.get("ema_acceptance"):
            positive.append("ema_acceptance")
        if signals.get("reclaimed_prior_close"):
            positive.append("reclaimed_prior_close")
        if signals.get("new_hl_lh"):
            positive.append("new_hl_lh")

        if signals.get("ema_acceptance") and (
            signals.get("reclaimed_prior_close") or signals.get("new_hl_lh")
        ):
            return "高", positive, warnings
        if signals.get("ema_acceptance") or signals.get("in_profit"):
            return "中", positive, warnings
        return "低", positive, warnings

    if signals.get("good_follow_through"):
        positive.append("good_follow_through")
    if signals.get("new_hl_lh"):
        positive.append("new_hl_lh")
    if signals.get("ema_acceptance"):
        positive.append("ema_acceptance")
    if signals.get("accepted"):
        return "中", positive, warnings
    return ("高" if len(positive) >= 2 else "低"), positive, warnings


def _score_from_strength(
    confidence: str,
    positives: list[str],
    warnings: list[str],
    signals: dict[str, bool],
) -> int:
    """把结构强弱映射为兼容旧调用方的 0-7 分。"""
    base = {"高": 5, "中": 3, "低": 1}.get(confidence, 1)
    bonus = 1 if len(positives) >= 4 else 0
    bonus += 1 if signals.get("in_profit") and signals.get("new_hl_lh") else 0
    penalty = 1 if warnings else 0
    penalty += 1 if signals.get("channel_to_tr") else 0
    return max(0, min(7, base + bonus - penalty))


def strength_check(
    position: dict[str, Any],
    market_data: dict[str, Any],
    management_style: str = "",
) -> dict[str, Any]:
    """
    Strength Check - 用 Brooks 结构证据判断强弱，而不是工程化加权总分。

    兼容旧调用方：
    - 仍返回 strength_score / confidence / recommendation
    - 但 score 来源改成结构式判断链
    """
    if not management_style:
        management_style = str(get_position_attr(position, "management_style", "") or "")

    family = _resolve_family(management_style)
    signals = _collect_signals(position, market_data)
    confidence, positives, warnings = _family_strength(family, signals)
    strength_score = _score_from_strength(confidence, positives, warnings, signals)

    if confidence == "高":
        recommendation = "结构仍在扩展，优先让结构位接管保护"
    elif confidence == "中":
        recommendation = "结构尚可，按 1R/2R 与 Major HL/LH 正常管理"
    else:
        recommendation = "结构转弱，优先保护、缩减或兑现小利润"

    return {
        "strength_score": strength_score,
        "weighted_score": float(len(positives)),
        "signals": signals,
        "confidence": confidence,
        "recommendation": recommendation,
        "family": family,
        "supporting_evidence": positives,
        "warning_signals": warnings,
    }
