"""
S7 持仓管理总控模块

职责只保留编排：
- 先做前提校验
- 再看强度评估
- 再执行分批止盈
- 最后决定是否上移止损

具体规则已拆到 `evaluation/` 与 `risk_controls/`。
"""

from __future__ import annotations

from typing import Any

from .checks import premise_check, strength_check
from .common import get_position_attr
from .exits import calculate_partial_close, calculate_trailing_sl


def manage_position(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    完整的持仓管理流程。

    Returns:
        {
            "action": "HOLD" | "CLOSE" | "PARTIAL_CLOSE" | "MODIFY_STOP_LOSS",
            "params": dict,
            "reason": str,
            "premise_check": dict,
            "strength_check": dict,
        }
    """
    premise = premise_check(position, market_data)

    if premise["action"] == "CLOSE":
        return {
            "action": "CLOSE",
            "params": {"symbol": get_position_attr(position, "symbol")},
            "reason": premise["reason"],
            "premise_check": premise,
            "strength_check": None,
        }

    if premise["action"] == "REDUCE":
        return {
            "action": "PARTIAL_CLOSE",
            "params": {
                "symbol": get_position_attr(position, "symbol"),
                "close_ratio": 0.5,
            },
            "reason": premise["reason"],
            "premise_check": premise,
            "strength_check": None,
        }

    strength = strength_check(position, market_data)

    partial = calculate_partial_close(position, market_data)
    if partial["should_close"]:
        return {
            "action": "PARTIAL_CLOSE",
            "params": {
                "symbol": get_position_attr(position, "symbol"),
                "close_ratio": partial["close_ratio"],
            },
            "reason": partial["reason"],
            "premise_check": premise,
            "strength_check": strength,
        }

    trailing = calculate_trailing_sl(position, market_data)
    if trailing["should_trail"]:
        return {
            "action": "MODIFY_STOP_LOSS",
            "params": {
                "symbol": get_position_attr(position, "symbol"),
                "new_sl": trailing["new_sl"],
            },
            "reason": trailing["reason"],
            "premise_check": premise,
            "strength_check": strength,
        }

    return {
        "action": "HOLD",
        "params": {},
        "reason": f"Premise 有效，信心={strength['confidence']}",
        "premise_check": premise,
        "strength_check": strength,
    }


__all__ = [
    "premise_check",
    "strength_check",
    "calculate_partial_close",
    "calculate_trailing_sl",
    "manage_position",
]
