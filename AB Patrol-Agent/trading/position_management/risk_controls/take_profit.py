"""止盈目标调整规则。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float
from trading.utils.target_magnets import build_target_magnets, resolve_target_path

from ..common import get_position_attr


def calculate_take_profit_adjustment(
    position: dict[str, Any],
    market_data: dict[str, Any],
    *,
    confidence: str = "",
) -> dict[str, Any]:
    """根据 Brooks 磁体和当前持仓强度决定是否上调止盈。"""
    side = str(get_position_attr(position, "side", "") or "").upper()
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0.0)
    current_tp = safe_float(get_position_attr(position, "take_profit"), 0.0)
    current_sl = safe_float(get_position_attr(position, "stop_loss"), 0.0)
    initial_sl = safe_float(get_position_attr(position, "initial_stop_loss"), current_sl)
    style = str(get_position_attr(position, "style", "Swing") or "Swing")

    if side not in {"BUY", "SELL"} or entry_price <= 0:
        return {
            "should_modify": False,
            "new_tp": current_tp,
            "reason": "缺少有效持仓方向或入场价",
        }

    if style == "Scalp" and confidence == "低":
        return {
            "should_modify": False,
            "new_tp": current_tp,
            "reason": "Scalp 且信心偏低，不主动放宽止盈",
        }

    ab_sr = market_data.get("ab_sr", {}) if isinstance(market_data.get("ab_sr"), dict) else {}
    ab_mm = market_data.get("ab_mm", {}) if isinstance(market_data.get("ab_mm"), dict) else {}
    key_levels = market_data.get("key_levels", {}) if isinstance(market_data.get("key_levels"), dict) else {}
    ab_ema = market_data.get("ab_ema", {}) if isinstance(market_data.get("ab_ema"), dict) else {}
    ab_state = market_data.get("ab_state", {}) if isinstance(market_data.get("ab_state"), dict) else {}

    route_style = str(get_position_attr(position, "management_style", "") or style)
    market_state = str(ab_state.get("state") or ab_state.get("market_state") or "")
    magnets = build_target_magnets(
        side,
        entry_price,
        ab_sr=ab_sr,
        ab_mm=ab_mm,
        key_levels=key_levels,
        ema20=safe_float(ab_ema.get("ema20"), 0.0),
    )
    target_plan = resolve_target_path(
        side,
        entry_price,
        current_tp,
        stop_loss=initial_sl,
        market_state=market_state,
        route_style=route_style,
        magnets=magnets,
    )

    recommended = safe_float(target_plan.get("recommended_target"), 0.0)
    if recommended <= 0:
        return {
            "should_modify": False,
            "new_tp": current_tp,
            "reason": "缺少更合理的目标磁体",
        }

    risk = abs(entry_price - initial_sl)
    min_step = max(risk * 0.25, abs(entry_price) * 0.001, 1e-8)
    extend_target = False
    if current_tp <= 0:
        extend_target = True
    elif side == "BUY" and recommended > current_tp + min_step:
        extend_target = True
    elif side == "SELL" and recommended < current_tp - min_step:
        extend_target = True

    if not extend_target:
        return {
            "should_modify": False,
            "new_tp": current_tp,
            "reason": "当前止盈已经覆盖主要目标磁体",
        }

    primary = target_plan.get("primary_magnet") if isinstance(target_plan.get("primary_magnet"), dict) else {}
    primary_kind = str(primary.get("kind") or "target")
    return {
        "should_modify": True,
        "new_tp": recommended,
        "reason": f"目标磁体更新为 {primary_kind}: {recommended:.5f}",
        "target_plan": target_plan,
    }


__all__ = ["calculate_take_profit_adjustment"]
