"""分批止盈规则。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float

from ..common import get_position_attr


def calculate_partial_close(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """根据风格和浮盈倍数决定是否分批止盈。"""
    side = get_position_attr(position, "side", "")
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0)
    current_sl = safe_float(get_position_attr(position, "stop_loss"), 0)
    initial_sl = safe_float(get_position_attr(position, "initial_stop_loss"), current_sl)
    current_price = safe_float(market_data.get("current_price"), 0)
    style = get_position_attr(position, "style", "Swing")

    if not current_sl or not entry_price:
        return {
            "should_close": False,
            "close_ratio": 0.0,
            "reason": "缺少止损或入场价",
        }

    initial_risk = abs(entry_price - initial_sl)
    if initial_risk <= 0:
        return {
            "should_close": False,
            "close_ratio": 0.0,
            "reason": "初始风险为 0",
        }

    if side == "BUY":
        profit_r = (current_price - entry_price) / initial_risk
    else:
        profit_r = (entry_price - current_price) / initial_risk

    if style == "反转试探" and profit_r >= 1.0:
        return {
            "should_close": True,
            "close_ratio": 1.0,
            "reason": f"反转试探到达 TP ({profit_r:.2f}R)",
        }

    if style == "Scalp" and profit_r >= 1.5:
        return {
            "should_close": True,
            "close_ratio": 1.0,
            "reason": f"Scalp 到达 TP1 ({profit_r:.2f}R)",
        }

    if style == "Swing" and profit_r >= 2.0:
        already_reduced = get_position_attr(position, "tp1_executed", False)
        if not already_reduced:
            return {
                "should_close": True,
                "close_ratio": 0.5,
                "reason": f"Swing 到达 TP1 ({profit_r:.2f}R)",
            }

    if style == "Swing" and profit_r >= 3.0:
        tp2_executed = get_position_attr(position, "tp2_executed", False)
        if not tp2_executed:
            return {
                "should_close": True,
                "close_ratio": 0.25,
                "reason": f"Swing 到达 TP2 ({profit_r:.2f}R)",
            }

    return {
        "should_close": False,
        "close_ratio": 0.0,
        "reason": f"未到止盈目标（浮盈 {profit_r:.2f}R）",
    }
