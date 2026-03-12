"""
S7 持仓管理总控模块

职责只保留编排：
- 先做前提校验
- 再看强度评估
- 再执行分批止盈
- 再按磁体更新止盈
- 最后决定是否上移止损

具体规则已拆到 `evaluation/` 与 `risk_controls/`。
"""

from __future__ import annotations

from typing import Any

from .checks import premise_check, strength_check
from .common import get_position_attr
from .exits import (
    calculate_partial_close,
    calculate_take_profit_adjustment,
    calculate_trailing_sl,
)


def _build_action(action_type: str, symbol: str, reason: str, **params: Any) -> dict[str, Any]:
    """构建统一的运行时动作结构。"""
    action = {
        "type": action_type,
        "symbol": symbol,
        "reason": reason,
    }
    action.update(params)
    return action


def _legacy_action_name(action_type: str) -> str:
    """兼容旧返回结构里的 action 字段。"""
    return {
        "CLOSE_POSITION": "CLOSE",
        "PARTIAL_CLOSE": "PARTIAL_CLOSE",
        "MODIFY_STOP_LOSS": "MODIFY_STOP_LOSS",
        "MODIFY_TAKE_PROFIT": "MODIFY_TAKE_PROFIT",
        "CANCEL_ALL_ORDERS": "CANCEL_ALL_ORDERS",
        "OPEN_ORDER": "OPEN_ORDER",
    }.get(action_type, action_type)


def _symbol_snapshot(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """从运行态缓存中取出当前品种的状态快照。"""
    symbol = str(get_position_attr(position, "symbol", "") or "")
    symbols = market_data.get("symbols") if isinstance(market_data.get("symbols"), dict) else {}
    snapshot = symbols.get(symbol) if isinstance(symbols.get(symbol), dict) else {}
    return snapshot if isinstance(snapshot, dict) else {}


def _pending_order_cancel_actions(position: dict[str, Any], market_data: dict[str, Any]) -> list[dict[str, Any]]:
    """当显式标记挂单已过期/失效时，统一发出撤单动作。"""
    symbol = str(get_position_attr(position, "symbol", "") or "")
    if not symbol:
        return []

    snapshot = _symbol_snapshot(position, market_data)
    plan_candidates = [
        snapshot.get("planned_trade"),
        get_position_attr(position, "planned_trade"),
        market_data.get("planned_trade"),
    ]
    plan = next((item for item in plan_candidates if isinstance(item, dict) and item), {})

    cancel_required = any(
        bool(plan.get(key))
        for key in ("cancel_required", "cancel_pending", "cancel_all_orders", "expired", "stale", "invalidated")
    )

    symbol_upper = symbol.upper()
    error_add_on = market_data.get("error_add_on_detected")
    if isinstance(error_add_on, list):
        cancel_required = cancel_required or any(symbol_upper in str(item).upper() for item in error_add_on)

    if not cancel_required:
        return []

    reason = str(plan.get("cancel_reason") or plan.get("why_wait") or "计划委托失效，撤销挂单")
    return [_build_action("CANCEL_ALL_ORDERS", symbol, reason)]


def _scale_in_open_action(
    position: dict[str, Any],
    market_data: dict[str, Any],
    *,
    premise_valid: bool,
    confidence: str,
) -> list[dict[str, Any]]:
    """当上游已经给出明确 add-on / re-entry 计划时，统一输出 OPEN_ORDER。"""
    if not premise_valid or confidence == "低":
        return []

    symbol = str(get_position_attr(position, "symbol", "") or "")
    if not symbol:
        return []

    snapshot = _symbol_snapshot(position, market_data)
    plan_candidates = [
        get_position_attr(position, "add_on_plan"),
        get_position_attr(position, "scale_in_plan"),
        get_position_attr(position, "reentry_plan"),
        snapshot.get("add_on_plan"),
        snapshot.get("scale_in_plan"),
        snapshot.get("reentry_plan"),
        snapshot.get("planned_trade"),
    ]
    plan = next((item for item in plan_candidates if isinstance(item, dict) and item), {})
    intent = str(plan.get("intent", "") or "").upper()
    if intent not in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD", "REENTER", "REENTRY"}:
        return []
    if plan.get("allow_executable") is False or plan.get("executable") is False:
        return []

    side = str(plan.get("side") or get_position_attr(position, "side", "") or "").upper()
    entry_price = plan.get("entry_price") or plan.get("price")
    stop_loss = plan.get("stop_loss") or plan.get("sl")
    take_profit = plan.get("take_profit") or plan.get("tp")
    risk_percent = float(plan.get("risk_percent") or 0.0)

    if side not in {"BUY", "SELL"} or not entry_price or not stop_loss or not take_profit:
        return []
    if risk_percent <= 0 or risk_percent > 1.0:
        return []

    return [
        _build_action(
            "OPEN_ORDER",
            symbol,
            str(plan.get("reason") or "S7 加仓/重入条件满足"),
            side=side,
            entry=entry_price,
            sl=stop_loss,
            tp=take_profit,
            order_type=str(plan.get("order_type") or "MARKET").upper(),
            style=str(plan.get("style") or get_position_attr(position, "style", "Swing")),
            intent=intent,
            risk_percent=risk_percent,
            strategy=str(plan.get("strategy") or ""),
        )
    ]


def _result(
    *,
    actions: list[dict[str, Any]],
    reason: str,
    premise: dict[str, Any],
    strength: dict[str, Any] | None,
) -> dict[str, Any]:
    """统一总控返回结构。"""
    primary = actions[0] if actions else {}
    primary_type = str(primary.get("type") or "HOLD")
    params = {key: value for key, value in primary.items() if key not in {"type", "reason"}}
    return {
        "action": _legacy_action_name(primary_type) if actions else "HOLD",
        "params": params,
        "reason": reason,
        "premise_check": premise,
        "strength_check": strength,
        "actions": actions,
    }


def manage_position(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    完整的持仓管理流程。

    Returns:
        {
            "action": "HOLD" | "CLOSE" | "PARTIAL_CLOSE" | "MODIFY_STOP_LOSS" | "MODIFY_TAKE_PROFIT",
            "params": dict,
            "reason": str,
            "premise_check": dict,
            "strength_check": dict,
            "actions": list[dict],
        }
    """
    symbol = str(get_position_attr(position, "symbol", "") or "")
    premise = premise_check(position, market_data)
    auxiliary_actions = _pending_order_cancel_actions(position, market_data)

    if premise["action"] == "CLOSE":
        actions = [_build_action("CLOSE_POSITION", symbol, premise["reason"])]
        actions.extend(auxiliary_actions)
        return _result(actions=actions, reason=premise["reason"], premise=premise, strength=None)

    if premise["action"] == "REDUCE":
        actions = [
            _build_action(
                "PARTIAL_CLOSE",
                symbol,
                premise["reason"],
                close_ratio=0.5,
            )
        ]
        actions.extend(auxiliary_actions)
        return _result(actions=actions, reason=premise["reason"], premise=premise, strength=None)

    strength = strength_check(position, market_data)
    actions: list[dict[str, Any]] = []

    tp_adjustment = calculate_take_profit_adjustment(
        position,
        market_data,
        confidence=strength["confidence"],
    )
    if tp_adjustment["should_modify"]:
        actions.append(
            _build_action(
                "MODIFY_TAKE_PROFIT",
                symbol,
                tp_adjustment["reason"],
                new_take_profit=tp_adjustment["new_tp"],
            )
        )

    partial = calculate_partial_close(position, market_data)
    if partial["should_close"]:
        actions.append(
            _build_action(
                "PARTIAL_CLOSE",
                symbol,
                partial["reason"],
                close_ratio=partial["close_ratio"],
            )
        )

    trailing = calculate_trailing_sl(position, market_data)
    if trailing["should_trail"]:
        actions.append(
            _build_action(
                "MODIFY_STOP_LOSS",
                symbol,
                trailing["reason"],
                new_stop_loss=trailing["new_sl"],
            )
        )

    actions.extend(auxiliary_actions)
    actions.extend(
        _scale_in_open_action(
            position,
            market_data,
            premise_valid=True,
            confidence=strength["confidence"],
        )
    )

    if actions:
        return _result(
            actions=actions,
            reason=actions[0]["reason"],
            premise=premise,
            strength=strength,
        )

    return _result(
        actions=[],
        reason=f"Premise 有效，信心={strength['confidence']}",
        premise=premise,
        strength=strength,
    )


__all__ = [
    "premise_check",
    "strength_check",
    "calculate_partial_close",
    "calculate_take_profit_adjustment",
    "calculate_trailing_sl",
    "manage_position",
]
