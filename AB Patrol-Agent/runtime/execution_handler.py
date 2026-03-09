"""
执行处理模块

提供执行动作处理相关功能：
- 动作验证
- 动作转换
- 执行结果处理
"""

from __future__ import annotations

from typing import Any

from utils import (
    safe_float,
    first_float,
    normalize_action_payload,
    canonical_action_type,
    utc_iso,
)


# ============================================================
# 动作验证
# ============================================================

def validate_action(action: dict[str, Any]) -> tuple[bool, str]:
    """
    验证动作是否有效
    
    Returns:
        (is_valid, error_message)
    """
    if not isinstance(action, dict):
        return (False, "动作必须是字典")
    
    action_type = str(action.get("type") or "").strip().upper()
    if not action_type:
        return (False, "缺少动作类型")
    
    # 验证必需字段
    if action_type == "OPEN_ORDER":
        if not action.get("side"):
            return (False, "OPEN_ORDER 缺少 side")
        if not action.get("quantity") and not action.get("qty"):
            return (False, "OPEN_ORDER 缺少 quantity")
    
    elif action_type == "CLOSE_POSITION":
        # CLOSE_POSITION 不需要额外字段
        pass
    
    elif action_type == "PARTIAL_CLOSE":
        if not action.get("quantity") and not action.get("qty"):
            return (False, "PARTIAL_CLOSE 缺少 quantity")
    
    elif action_type == "MODIFY_STOP_LOSS":
        if not action.get("stop_loss") and not action.get("new_stop_loss"):
            return (False, "MODIFY_STOP_LOSS 缺少 stop_loss")
    
    elif action_type == "MODIFY_TAKE_PROFIT":
        if not action.get("take_profit") and not action.get("new_take_profit"):
            return (False, "MODIFY_TAKE_PROFIT 缺少 take_profit")
    
    elif action_type == "CANCEL_ALL_ORDERS":
        # CANCEL_ALL_ORDERS 不需要额外字段
        pass
    
    else:
        return (False, f"未知的动作类型: {action_type}")
    
    return (True, "")


def validate_action_list(actions: list[dict[str, Any]]) -> tuple[bool, list[str]]:
    """
    验证动作列表
    
    Returns:
        (all_valid, error_messages)
    """
    if not isinstance(actions, list):
        return (False, ["动作列表必须是数组"])
    
    errors = []
    for i, action in enumerate(actions):
        is_valid, error = validate_action(action)
        if not is_valid:
            errors.append(f"动作 {i}: {error}")
    
    return (len(errors) == 0, errors)


# ============================================================
# 动作转换
# ============================================================

def normalize_action(action: dict[str, Any]) -> dict[str, Any]:
    """
    规范化动作
    
    - 规范化动作类型
    - 统一字段名称
    - 添加默认值
    """
    normalized = normalize_action_payload(action)
    
    # 统一 quantity 字段
    if "qty" in normalized and "quantity" not in normalized:
        normalized["quantity"] = normalized["qty"]
    
    # 统一 side 字段
    side = str(normalized.get("side") or "").strip().upper()
    if side in {"LONG", "做多"}:
        normalized["side"] = "BUY"
    elif side in {"SHORT", "做空"}:
        normalized["side"] = "SELL"
    
    # 统一价格字段
    if "entry_price" in normalized and "price" not in normalized:
        normalized["price"] = normalized["entry_price"]
    
    if "new_stop_loss" in normalized and "stop_loss" not in normalized:
        normalized["stop_loss"] = normalized["new_stop_loss"]
    
    if "new_take_profit" in normalized and "take_profit" not in normalized:
        normalized["take_profit"] = normalized["new_take_profit"]
    
    # 添加时间戳
    if "timestamp" not in normalized:
        normalized["timestamp"] = utc_iso()
    
    return normalized


def convert_action_to_execution_request(
    action: dict[str, Any],
    symbol: str,
    exchange: str = "binance",
) -> dict[str, Any]:
    """
    将动作转换为执行请求
    
    Returns:
        {
            "exchange": str,
            "symbol": str,
            "action_type": str,
            "side": str | None,
            "quantity": float | None,
            "price": float | None,
            "stop_loss": float | None,
            "take_profit": float | None,
            "order_type": str | None,
            "intent": str | None,
            "reason": str | None,
            "timestamp": str,
        }
    """
    normalized = normalize_action(action)
    action_type = canonical_action_type(normalized.get("type"))
    
    request = {
        "exchange": exchange,
        "symbol": symbol,
        "action_type": action_type,
        "side": normalized.get("side"),
        "quantity": first_float(normalized.get("quantity")),
        "price": first_float(normalized.get("price")),
        "stop_loss": first_float(normalized.get("stop_loss")),
        "take_profit": first_float(normalized.get("take_profit")),
        "order_type": normalized.get("order_type"),
        "intent": normalized.get("intent"),
        "reason": normalized.get("reason"),
        "timestamp": normalized.get("timestamp"),
        "raw_action": action,
    }
    
    # 移除 None 值
    return {k: v for k, v in request.items() if v is not None}


# ============================================================
# 执行结果处理
# ============================================================

def parse_execution_result(result: dict[str, Any]) -> dict[str, Any]:
    """
    解析执行结果
    
    Returns:
        {
            "success": bool,
            "order_id": str | None,
            "filled_quantity": float | None,
            "filled_price": float | None,
            "error": str | None,
            "timestamp": str,
        }
    """
    return {
        "success": bool(result.get("success")),
        "order_id": result.get("order_id"),
        "filled_quantity": first_float(result.get("filled_quantity")),
        "filled_price": first_float(result.get("filled_price")),
        "error": result.get("error"),
        "timestamp": result.get("timestamp") or utc_iso(),
    }


def is_execution_success(result: dict[str, Any]) -> bool:
    """
    判断执行是否成功
    """
    return bool(result.get("success"))


def get_execution_error(result: dict[str, Any]) -> str | None:
    """
    获取执行错误信息
    """
    if not result.get("success"):
        return result.get("error") or "未知错误"
    return None


# ============================================================
# 动作批处理
# ============================================================

def batch_actions_by_type(actions: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """
    按类型批处理动作
    
    Returns:
        {
            "OPEN_ORDER": [...],
            "CLOSE_POSITION": [...],
            "MODIFY_STOP_LOSS": [...],
            ...
        }
    """
    batched: dict[str, list[dict[str, Any]]] = {}
    
    for action in actions:
        action_type = canonical_action_type(action.get("type"))
        if action_type not in batched:
            batched[action_type] = []
        batched[action_type].append(action)
    
    return batched


def prioritize_actions(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    按优先级排序动作
    
    优先级（从高到低）：
    1. CLOSE_POSITION（平仓）
    2. MODIFY_STOP_LOSS（修改止损）
    3. PARTIAL_CLOSE（部分平仓）
    4. MODIFY_TAKE_PROFIT（修改止盈）
    5. CANCEL_ALL_ORDERS（取消订单）
    6. OPEN_ORDER（开仓）
    """
    priority_map = {
        "CLOSE_POSITION": 1,
        "MODIFY_STOP_LOSS": 2,
        "PARTIAL_CLOSE": 3,
        "MODIFY_TAKE_PROFIT": 4,
        "CANCEL_ALL_ORDERS": 5,
        "OPEN_ORDER": 6,
    }
    
    def get_priority(action: dict[str, Any]) -> int:
        action_type = canonical_action_type(action.get("type"))
        return priority_map.get(action_type, 99)
    
    return sorted(actions, key=get_priority)


# ============================================================
# 动作冲突检测
# ============================================================

def detect_action_conflicts(actions: list[dict[str, Any]]) -> list[str]:
    """
    检测动作冲突
    
    Returns:
        冲突描述列表
    """
    conflicts = []
    
    action_types = [canonical_action_type(a.get("type")) for a in actions]
    
    # 检测：同时开仓和平仓
    if "OPEN_ORDER" in action_types and "CLOSE_POSITION" in action_types:
        conflicts.append("同时包含开仓和平仓动作")
    
    # 检测：多个开仓动作
    open_orders = [a for a in actions if canonical_action_type(a.get("type")) == "OPEN_ORDER"]
    if len(open_orders) > 1:
        conflicts.append(f"包含 {len(open_orders)} 个开仓动作")
    
    # 检测：多个平仓动作
    close_positions = [a for a in actions if canonical_action_type(a.get("type")) == "CLOSE_POSITION"]
    if len(close_positions) > 1:
        conflicts.append(f"包含 {len(close_positions)} 个平仓动作")
    
    return conflicts


def resolve_action_conflicts(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    解决动作冲突
    
    策略：
    - 如果同时有开仓和平仓，只保留平仓
    - 如果有多个开仓，只保留第一个
    - 如果有多个平仓，只保留第一个
    """
    action_types = [canonical_action_type(a.get("type")) for a in actions]
    
    # 如果同时有开仓和平仓，移除开仓
    if "OPEN_ORDER" in action_types and "CLOSE_POSITION" in action_types:
        actions = [a for a in actions if canonical_action_type(a.get("type")) != "OPEN_ORDER"]
    
    # 只保留第一个开仓
    open_orders = [a for a in actions if canonical_action_type(a.get("type")) == "OPEN_ORDER"]
    if len(open_orders) > 1:
        first_open = open_orders[0]
        actions = [a for a in actions if canonical_action_type(a.get("type")) != "OPEN_ORDER"]
        actions.append(first_open)
    
    # 只保留第一个平仓
    close_positions = [a for a in actions if canonical_action_type(a.get("type")) == "CLOSE_POSITION"]
    if len(close_positions) > 1:
        first_close = close_positions[0]
        actions = [a for a in actions if canonical_action_type(a.get("type")) != "CLOSE_POSITION"]
        actions.append(first_close)
    
    return actions
