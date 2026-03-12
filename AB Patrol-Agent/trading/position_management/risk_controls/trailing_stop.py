"""移动止损规则。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float

from ..common import get_position_attr


def calculate_trailing_sl(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """根据浮盈和结构位置决定是否上移止损。"""
    side = get_position_attr(position, "side", "")
    current_sl = safe_float(get_position_attr(position, "stop_loss"), 0)
    initial_sl = safe_float(get_position_attr(position, "initial_stop_loss"), current_sl)
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0)
    current_price = safe_float(market_data.get("current_price"), 0)
    style = get_position_attr(position, "style", "Swing")

    if not current_sl or not entry_price:
        return {
            "should_trail": False,
            "new_sl": current_sl,
            "reason": "缺少止损或入场价",
        }

    initial_risk = abs(entry_price - initial_sl)
    if initial_risk <= 0:
        return {
            "should_trail": False,
            "new_sl": current_sl,
            "reason": "初始风险为 0",
        }

    if side == "BUY":
        profit_r = (current_price - entry_price) / initial_risk
    else:
        profit_r = (entry_price - current_price) / initial_risk

    if profit_r >= 1.5:
        if style == "Scalp":
            if side == "BUY":
                new_sl = entry_price + initial_risk * 0.5
            else:
                new_sl = entry_price - initial_risk * 0.5

            if (side == "BUY" and new_sl > current_sl) or (side == "SELL" and new_sl < current_sl):
                return {
                    "should_trail": True,
                    "new_sl": new_sl,
                    "reason": f"Scalp 浮盈 {profit_r:.2f}R，移到保本+0.5R",
                }
        else:
            if (side == "BUY" and entry_price > current_sl) or (side == "SELL" and entry_price < current_sl):
                return {
                    "should_trail": True,
                    "new_sl": entry_price,
                    "reason": f"浮盈 {profit_r:.2f}R，移到保本",
                }

    ab_sr = market_data.get("ab_sr", {})
    major_hl = safe_float(ab_sr.get("major_hl"), 0)
    major_lh = safe_float(ab_sr.get("major_lh"), 0)

    if side == "BUY" and major_hl > current_sl and major_hl < current_price:
        return {
            "should_trail": True,
            "new_sl": major_hl,
            "reason": f"新 Major HL 形成: {major_hl:.2f}",
        }

    if side == "SELL" and major_lh < current_sl and major_lh > current_price:
        return {
            "should_trail": True,
            "new_sl": major_lh,
            "reason": f"新 Major LH 形成: {major_lh:.2f}",
        }

    if style == "Scalp" and profit_r >= 1.0:
        minor_hl = safe_float(ab_sr.get("minor_hl"), 0)
        minor_lh = safe_float(ab_sr.get("minor_lh"), 0)

        if side == "BUY" and minor_hl > current_sl and minor_hl < current_price:
            return {
                "should_trail": True,
                "new_sl": minor_hl,
                "reason": f"Scalp 移到 Minor HL: {minor_hl:.2f}",
            }

        if side == "SELL" and minor_lh < current_sl and minor_lh > current_price:
            return {
                "should_trail": True,
                "new_sl": minor_lh,
                "reason": f"Scalp 移到 Minor LH: {minor_lh:.2f}",
            }

    return {
        "should_trail": False,
        "new_sl": current_sl,
        "reason": f"无需移动止损（浮盈 {profit_r:.2f}R）",
    }
