"""前提校验：把 Brooks 交易前提与执行层风控拆开。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float
from trading.utils.target_magnets import build_target_magnets, resolve_target_path

from ..common import get_attr, get_position_attr


def _style_groups(management_style: str) -> tuple[bool, bool]:
    """返回是否属于反转家族、趋势恢复家族。"""
    style = str(management_style or "").strip().lower()
    reversal_styles = {
        "brooks_mtr_reversal",
        "brooks_climax_reversal",
        "brooks_tr_blshs",
        "brooks_tr4_daily_tr_fade",
        "brooks_s1_htf_sr_reversal",
        "brooks_s2_micro_channel",
    }
    trend_recovery_styles = {
        "brooks_swing",
        "brooks_t4_wedge_pullback",
    }
    return style in reversal_styles, style in trend_recovery_styles


def _build_market_state_check(
    entry_state: str,
    current_state: str,
    is_reversal_style: bool,
) -> dict[str, Any]:
    """Brooks 背景检查：只判断 setup 背景是否退化。"""
    state_valid = True
    if entry_state == "BO" and current_state == "TR":
        state_valid = False
    elif entry_state == "TC" and current_state in {"TR", "BC"}:
        state_valid = False
    elif not is_reversal_style and entry_state == "TR" and current_state == "BC":
        state_valid = False
    return {
        "pass": state_valid,
        "reason": f"入场={entry_state}, 当前={current_state}",
    }


def _build_signal_validity_check(
    side: str,
    current_price: float,
    entry_price: float,
    signal_price: float,
    signal_high: float,
    signal_low: float,
    entry_stop: float,
    is_reversal_style: bool,
    is_trend_recovery_style: bool,
) -> dict[str, Any]:
    """Brooks 信号棒/结构位是否被深度否定。"""
    initial_risk = abs(entry_price - entry_stop)
    if is_reversal_style:
        buffer_ratio = 0.75
    elif is_trend_recovery_style:
        buffer_ratio = 0.60
    else:
        buffer_ratio = 0.50

    signal_buffer = max(initial_risk * buffer_ratio, signal_price * 0.001)
    signal_valid = True
    if side == "BUY" and current_price < signal_low - signal_buffer:
        signal_valid = False
    elif side == "SELL" and current_price > signal_high + signal_buffer:
        signal_valid = False

    return {
        "pass": signal_valid,
        "reason": (
            f"信号价={signal_price:.2f}, 当前={current_price:.2f}, "
            f"缓冲={signal_buffer:.4f}, {'有效' if signal_valid else '已深度否定'}"
        ),
        "buffer": signal_buffer,
    }


def _build_follow_through_check(
    side: str,
    current_price: float,
    entry_price: float,
    recent_bars: list[Any],
    bars_since_entry: int,
) -> dict[str, Any]:
    """Brooks 的 follow-through 检查。"""
    ft_quality = "good"
    if len(recent_bars) >= 3:
        last_3 = recent_bars[-3:]
        all_bodies = [
            abs(safe_float(get_attr(bar, "C"), 0.0) - safe_float(get_attr(bar, "O"), 0.0))
            for bar in recent_bars
        ]
        avg_body = sum(all_bodies) / len(all_bodies) if all_bodies else 1e-9
        directional = 0
        quality = 0

        for bar in last_3:
            close_price = safe_float(get_attr(bar, "C"), 0.0)
            open_price = safe_float(get_attr(bar, "O"), 0.0)
            high_price = safe_float(get_attr(bar, "H"), 0.0)
            low_price = safe_float(get_attr(bar, "L"), 0.0)
            mid_price = (high_price + low_price) / 2 if (high_price or low_price) else close_price
            body = abs(close_price - open_price)

            if side == "BUY":
                if close_price > open_price:
                    directional += 1
                if close_price >= mid_price:
                    quality += 1
            else:
                if close_price < open_price:
                    directional += 1
                if close_price <= mid_price:
                    quality += 1

            if body >= avg_body * 0.8:
                quality += 1

        if directional >= 2 and quality >= 4:
            ft_quality = "good"
        elif directional >= 1 and quality >= 2:
            ft_quality = "fair"
        else:
            ft_quality = "poor"

    in_profit = (
        (side == "BUY" and current_price > entry_price)
        or (side == "SELL" and current_price < entry_price)
    )
    ft_valid = ft_quality != "poor" or bars_since_entry < 5 or in_profit
    return {
        "pass": ft_valid,
        "reason": f"FT={ft_quality}, bars={bars_since_entry}",
        "quality": ft_quality,
    }


def _build_target_path_check(
    side: str,
    entry_stop: float,
    tp1: float,
    current_price: float,
    entry_price: float,
    market_state: str,
    route_style: str,
    market_data: dict[str, Any],
) -> dict[str, Any]:
    """Brooks 目标路径检查。"""
    ab_sr = market_data.get("ab_sr", {}) if isinstance(market_data.get("ab_sr"), dict) else {}
    ab_mm = market_data.get("ab_mm", {}) if isinstance(market_data.get("ab_mm"), dict) else {}
    key_levels = market_data.get("key_levels", {}) if isinstance(market_data.get("key_levels"), dict) else {}
    ab_ema = market_data.get("ab_ema", {}) if isinstance(market_data.get("ab_ema"), dict) else {}
    if not ab_mm and not key_levels:
        return {"pass": True, "reason": "数据不足，默认通畅"}

    price = current_price or entry_price
    magnets = build_target_magnets(
        side,
        price,
        ab_sr=ab_sr,
        ab_mm=ab_mm,
        key_levels=key_levels,
        ema20=safe_float(ab_ema.get("ema20"), 0.0),
    )
    target_plan = resolve_target_path(
        side,
        price,
        tp1,
        stop_loss=entry_stop,
        market_state=market_state,
        route_style=route_style,
        magnets=magnets,
    )
    path_clear = bool(target_plan.get("path_clear", True))
    primary = target_plan.get("primary_magnet") if isinstance(target_plan.get("primary_magnet"), dict) else {}
    blocker = target_plan.get("blocking_magnet") if isinstance(target_plan.get("blocking_magnet"), dict) else {}

    if blocker:
        blocker_kind = str(blocker.get("kind") or "-")
        blocker_price = safe_float(blocker.get("price"), 0.0)
        reason = f"路径受阻，最近磁体 {blocker_kind}: {blocker_price:.2f}"
    elif primary:
        reason = f"首要目标 {primary.get('kind', '-')}: {safe_float(primary.get('price'), 0.0):.2f}"
    else:
        reason = "无明显阻挡磁体"
    return {
        "pass": path_clear,
        "reason": "路径通畅" if path_clear else reason,
    }


def _build_execution_checks(
    side: str,
    market_data: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    """执行层风控：不属于 Brooks 理论，但 live 链仍需要。"""
    checks: dict[str, dict[str, Any]] = {}

    ai_direction = str(market_data.get("ai_direction", "")).strip().upper()
    if side == "BUY":
        direction_match = not (
            "AIS" in ai_direction or ("SHORT" in ai_direction and "ALWAYS" in ai_direction)
        )
    else:
        direction_match = not (
            "AIL" in ai_direction or ("LONG" in ai_direction and "ALWAYS" in ai_direction)
        )
    checks["ai_direction"] = {
        "pass": direction_match,
        "reason": f"AI={ai_direction}, Side={side}, {'一致' if direction_match else '矛盾'}",
    }

    account_info = market_data.get("account_info", {}) if isinstance(market_data.get("account_info"), dict) else {}
    margin_ratio = safe_float(account_info.get("margin_ratio"), 1000.0)
    equity = safe_float(account_info.get("equity"), 0.0)
    used_margin = safe_float(account_info.get("used_margin"), 0.0)
    risk_ok = margin_ratio > 120 and (not equity or used_margin / equity < 0.8)
    checks["risk_metrics"] = {
        "pass": risk_ok,
        "reason": f"保证金率={margin_ratio:.1f}%",
    }
    return checks


def premise_check(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    Premise Check - 拆成两层：

    1. Brooks 结构前提：背景、信号是否仍成立、是否有 follow-through、路径是否被堵；
    2. 执行层约束：AI/账户风控，只作为执行辅助，不再混同于 Brooks premise。
    """
    side = str(get_position_attr(position, "side", "") or "").upper()
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0.0)
    entry_time = str(get_position_attr(position, "entry_time", "") or "")
    management_style = str(get_position_attr(position, "management_style", "") or "")
    is_reversal_style, is_trend_recovery_style = _style_groups(management_style)

    ab_state = market_data.get("ab_state", {}) if isinstance(market_data.get("ab_state"), dict) else {}
    recent_bars = list(market_data.get("recent_bars", []) or [])
    current_price = safe_float(market_data.get("current_price"), 0.0)

    entry_state = str(get_position_attr(position, "entry_market_state", "")).strip().upper()
    current_state = str(ab_state.get("state", "")).strip().upper()
    signal_price = safe_float(get_position_attr(position, "signal_price"), entry_price)
    signal_high = safe_float(get_position_attr(position, "signal_high"), signal_price)
    signal_low = safe_float(get_position_attr(position, "signal_low"), signal_price)
    entry_stop = safe_float(
        get_position_attr(position, "initial_stop_loss", get_position_attr(position, "stop_loss", 0.0)),
        0.0,
    )
    tp1 = safe_float(get_position_attr(position, "tp1"), 0.0)
    bars_since_entry = len([bar for bar in recent_bars if str(get_attr(bar, "time", "") or "") > entry_time])
    in_profit = (
        (side == "BUY" and current_price > entry_price)
        or (side == "SELL" and current_price < entry_price)
    )
    initial_risk = abs(entry_price - entry_stop)
    profit_r = 0.0
    if initial_risk > 0:
        if side == "BUY":
            profit_r = (current_price - entry_price) / initial_risk
        else:
            profit_r = (entry_price - current_price) / initial_risk

    structure_checks = {
        "market_state": _build_market_state_check(entry_state, current_state, is_reversal_style),
        "signal_validity": _build_signal_validity_check(
            side,
            current_price,
            entry_price,
            signal_price,
            signal_high,
            signal_low,
            entry_stop,
            is_reversal_style,
            is_trend_recovery_style,
        ),
        "follow_through": _build_follow_through_check(
            side,
            current_price,
            entry_price,
            recent_bars,
            bars_since_entry,
        ),
        "target_path": _build_target_path_check(
            side,
            entry_stop,
            tp1,
            current_price,
            entry_price,
            current_state,
            management_style,
            market_data,
        ),
    }
    execution_checks = _build_execution_checks(side, market_data)

    checks = {**structure_checks, **execution_checks}
    failed_structure = [key for key, value in structure_checks.items() if not value["pass"]]
    failed_execution = [key for key, value in execution_checks.items() if not value["pass"]]

    # Brooks premise 先看结构，再看执行层：
    # - 结构退化优先 REDUCE；只有“深度失效且仍在亏损”才直接退出。
    # - AI/账户约束不再被当成理论 premise，只作为保护性收缩。
    severe_structure_break = (
        "signal_validity" in failed_structure
        and not in_profit
        and profit_r <= -0.35
        and (
            "follow_through" in failed_structure
            or "target_path" in failed_structure
            or "market_state" in failed_structure
        )
    )

    if severe_structure_break:
        action = "CLOSE"
        reason = "结构前提被深度否定，直接退出"
    elif failed_structure:
        action = "REDUCE"
        if "signal_validity" in failed_structure:
            if is_reversal_style:
                reason = "反转信号被深测，先降级为保护性管理"
            elif is_trend_recovery_style:
                reason = "趋势恢复被深测，先降级为保护性 scalp"
            else:
                reason = "信号结构走弱，先降级为保护性管理"
        elif "market_state" in failed_structure:
            reason = "背景退化，先减仓并切换到保护性管理"
        elif "follow_through" in failed_structure:
            reason = "跟进转弱，先减仓再观察"
        else:
            reason = "目标路径受阻，先保护利润"
    elif failed_execution:
        action = "REDUCE"
        if "risk_metrics" in failed_execution:
            reason = "执行层风险异常，先降低暴露"
        else:
            reason = "执行层方向冲突，先降级为保护性管理"
    else:
        action = "HOLD"
        reason = "Premise 有效"

    return {
        "valid": not failed_structure and not failed_execution,
        "brooks_valid": not failed_structure,
        "execution_valid": not failed_execution,
        "checks": checks,
        "structure_checks": structure_checks,
        "execution_checks": execution_checks,
        "action": action,
        "reason": reason,
    }
