"""
H1/L1 的目标层级与上下文模块。

把 `valid previous entry / rescue target / close-test target / swing target`
从回测主文件里拆出来，便于后续给 H2/L2、突破回调和 gap 族复用。
"""

from __future__ import annotations


def target_distance_r(level: float, entry_price: float, actual_risk: float) -> float:
    """把目标价换算成 R，便于跨市场比较。"""
    if actual_risk <= 0 or level <= 0 or entry_price <= 0:
        return 0.0
    return abs(level - entry_price) / actual_risk


def h1_l1_context_profile(event, extra: dict) -> dict[str, object]:
    """按 Brooks 语境给 H1/L1 分成 strong / medium / weak 三层。"""
    direction = str(getattr(event, "direction", "") or "")
    market_state = str(extra.get("market_state", "") or "")
    higher_market_state = str(extra.get("higher_market_state", "") or "")
    follow_through = bool(extra.get("follow_through", False))
    higher_follow_through = bool(extra.get("higher_follow_through", False))
    acceptance_ready = bool(extra.get("acceptance_ready", False))
    reclaimed_prior_close = bool(extra.get("reclaimed_prior_close", False))
    trendline_break_confirmed = bool(extra.get("trendline_break_confirmed", False))
    weak_disposition = str(extra.get("weak_h1_l1_disposition", "") or "")
    signal_bar_type = str(extra.get("signal_bar_type", "") or "")
    setup_valid = bool(extra.get("setup_valid", True))
    setup_clear_trend_leg = bool(extra.get("setup_clear_trend_leg", True))
    setup_first_pullback_shape = bool(extra.get("setup_first_pullback_shape", True))
    setup_still_trend_side = bool(extra.get("setup_still_trend_side", False))

    bull_states = {"weak_trend_bull", "strong_trend_bull"}
    bear_states = {"weak_trend_bear", "strong_trend_bear"}
    aligned_market = market_state in (bull_states if direction == "BUY" else bear_states)
    aligned_higher = higher_market_state in (bull_states if direction == "BUY" else bear_states)
    double_broad_range = market_state == "broad_range" and higher_market_state == "broad_range"
    weak_context = (
        weak_disposition in {"scalp_only", "no_trade_too_close", "no_trade_range_trendbar"}
        or not setup_valid
        or not setup_clear_trend_leg
        or not setup_first_pullback_shape
        or market_state in {"tight_range", "broad_range", "bc", "weak_trend_bull", "weak_trend_bear"}
        or higher_market_state in {"tight_range", "broad_range", "weak_trend_bull", "weak_trend_bear"}
    )
    strong_context = (
        not weak_context
        and (follow_through or higher_follow_through or acceptance_ready or reclaimed_prior_close)
        and setup_valid
        and setup_clear_trend_leg
        and setup_first_pullback_shape
    )
    valid_previous_entry = (
        setup_still_trend_side
        and (trendline_break_confirmed or acceptance_ready or reclaimed_prior_close)
        and (aligned_market or aligned_higher or follow_through or higher_follow_through)
        and not double_broad_range
    )
    medium_context = not strong_context and valid_previous_entry
    range_trendbar_context = (
        double_broad_range
        and signal_bar_type == "trend_bar"
        and not acceptance_ready
        and not reclaimed_prior_close
        and not follow_through
        and not higher_follow_through
    )
    if strong_context:
        tier = "strong"
    elif medium_context:
        tier = "medium"
    else:
        tier = "weak"
    if range_trendbar_context:
        tier = "weak"
        valid_previous_entry = False
    return {
        "tier": tier,
        "valid_previous_entry": valid_previous_entry,
        "double_broad_range": double_broad_range,
        "range_trendbar_context": range_trendbar_context,
        "aligned_market": aligned_market,
        "aligned_higher": aligned_higher,
    }


def resolve_h1_l1_effective_target(
    event,
    extra: dict,
    *,
    entry_price: float,
    router_recommended_target: float,
) -> tuple[float, str]:
    """为 H1/L1 选择当前真正有效的目标层级。"""
    signal_type = str(getattr(event, "signal_type", "") or "")
    if signal_type not in {"高1", "低1"} or not bool(extra.get("first_entry_signal", False)):
        return router_recommended_target, "router_recommended_target"

    direction = str(getattr(event, "direction", "") or "")
    rescue_target = float(extra.get("rescue_target", 0.0) or 0.0)
    close_test_target = float(extra.get("close_test_target", 0.0) or 0.0)
    swing_target = float(extra.get("swing_target", 0.0) or 0.0)
    context = h1_l1_context_profile(event, extra)
    valid_previous_entry = bool(context.get("valid_previous_entry", False))
    context_tier = str(context.get("tier", "weak") or "weak")

    def valid(level: float) -> bool:
        if level <= 0:
            return False
        if direction == "BUY":
            return level > entry_price
        return level < entry_price

    if context_tier == "strong":
        candidates = [
            ("router_recommended_target", router_recommended_target),
            ("swing_target", swing_target),
            ("close_test_target", close_test_target if valid_previous_entry else 0.0),
            ("rescue_target", rescue_target),
        ]
    elif context_tier == "medium":
        candidates = [
            ("close_test_target", close_test_target if valid_previous_entry else 0.0),
            ("router_recommended_target", router_recommended_target),
            ("swing_target", swing_target),
            ("rescue_target", rescue_target),
        ]
    else:
        candidates = [
            ("rescue_target", rescue_target),
            ("router_recommended_target", router_recommended_target),
            ("close_test_target", close_test_target if valid_previous_entry else 0.0),
            ("swing_target", swing_target),
        ]
    for target_type, target_level in candidates:
        if valid(float(target_level)):
            return float(target_level), target_type
    return router_recommended_target, "router_recommended_target"
