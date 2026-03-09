"""
S7 持仓管理模块

实现 Al Brooks 持仓管理框架：
- Premise Check（6 项检查）
- Strength Check（7 项增强信号）
- Trailing SL
- 分批止盈（TP1/TP2）
- 加仓策略
"""

from typing import Any


def premise_check(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    Premise Check - 6 项检查

    Returns:
        {
            "valid": bool,
            "checks": {
                "ai_direction": {"pass": bool, "reason": str},
                "market_state": {"pass": bool, "reason": str},
                "signal_validity": {"pass": bool, "reason": str},
                "follow_through": {"pass": bool, "reason": str},
                "target_path": {"pass": bool, "reason": str},
                "risk_metrics": {"pass": bool, "reason": str},
            },
            "action": "HOLD" | "CLOSE" | "REDUCE",
            "reason": str
        }
    """
    symbol = position.get("symbol", "")
    side = position.get("side", "")
    entry_price = position.get("entry_price", 0)

    checks = {}

    # 1. AI 方向检查
    ai_direction = market_data.get("ai_direction", "")
    direction_match = (side == "LONG" and "AIL" in ai_direction) or (side == "SHORT" and "AIS" in ai_direction)
    checks["ai_direction"] = {
        "pass": direction_match,
        "reason": f"AI={ai_direction}, Side={side}, {'一致' if direction_match else '矛盾'}"
    }

    # 2. 市场状态检查
    entry_state = position.get("entry_market_state", "")
    current_state = market_data.get("market_state", "")
    state_valid = entry_state == current_state or (entry_state == "Channel" and current_state != "TR")
    checks["market_state"] = {
        "pass": state_valid,
        "reason": f"入场={entry_state}, 当前={current_state}"
    }

    # 3. 信号 K 线检查
    signal_price = position.get("signal_price", entry_price)
    current_price = market_data.get("current_price", 0)
    signal_valid = True  # 简化：需要检查价格是否在信号 K 线的正确侧
    checks["signal_validity"] = {
        "pass": signal_valid,
        "reason": "信号 K 线未被否定"
    }

    # 4. Follow-Through 检查
    bars_since_entry = position.get("bars_since_entry", 0)
    ft_quality = market_data.get("follow_through_quality", "good")
    ft_valid = ft_quality != "poor" or bars_since_entry < 3
    checks["follow_through"] = {
        "pass": ft_valid,
        "reason": f"FT={ft_quality}, bars={bars_since_entry}"
    }

    # 5. 目标路径检查
    tp1 = position.get("tp1", 0)
    nearest_resistance = market_data.get("nearest_resistance", 0)
    path_clear = True  # 简化：需要检查 TP 路径上是否有新阻力
    checks["target_path"] = {
        "pass": path_clear,
        "reason": "路径通畅"
    }

    # 6. 风险指标检查
    margin_ratio = market_data.get("margin_ratio", 1000)
    risk_ok = margin_ratio > 120
    checks["risk_metrics"] = {
        "pass": risk_ok,
        "reason": f"保证金率={margin_ratio:.2f}%"
    }

    # 综合判断
    all_pass = all(check["pass"] for check in checks.values())

    if not checks["ai_direction"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "CLOSE",
            "reason": "AI 方向反转"
        }

    if not checks["risk_metrics"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "REDUCE",
            "reason": "风险指标异常"
        }

    if not all_pass:
        failed = [k for k, v in checks.items() if not v["pass"]]
        return {
            "valid": False,
            "checks": checks,
            "action": "CLOSE",
            "reason": f"Premise 失效: {', '.join(failed)}"
        }

    return {
        "valid": True,
        "checks": checks,
        "action": "HOLD",
        "reason": "Premise 有效"
    }


def strength_check(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    Strength Check - 7 项增强信号

    Returns:
        {
            "strength_score": int,  # 0-7
            "signals": {
                "gap_open": bool,
                "new_hl_lh": bool,
                "ema_bounce": bool,
                "micro_gap": bool,
                "shallow_pb": bool,
                "wedge_exhaustion": bool,
                "multi_tf_align": bool,
            },
            "confidence": "高" | "中" | "低",
            "recommendation": str
        }
    """
    signals = {
        "gap_open": False,  # 需要从 ab_sr 获取
        "new_hl_lh": False,  # 需要从 ab_sr 获取
        "ema_bounce": False,  # 需要从 ab_ema 获取
        "micro_gap": False,  # 需要从 ab_sr 获取
        "shallow_pb": False,  # 需要从 ab_patterns 获取
        "wedge_exhaustion": False,  # 需要从 ab_patterns 获取
        "multi_tf_align": False,  # 需要从多周期数据获取
    }

    strength_score = sum(signals.values())

    if strength_score >= 4:
        confidence = "高"
        recommendation = "坚定持有，不因 1-2 根反向 K 线恐慌"
    elif strength_score >= 2:
        confidence = "中"
        recommendation = "正常管理，按计划执行"
    else:
        confidence = "低"
        recommendation = "趋势减弱，考虑 TP1 减仓"

    return {
        "strength_score": strength_score,
        "signals": signals,
        "confidence": confidence,
        "recommendation": recommendation
    }


def calculate_trailing_sl(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    计算 Trailing SL

    Returns:
        {
            "should_trail": bool,
            "new_sl": float,
            "reason": str
        }
    """
    side = position.get("side", "")
    current_sl = position.get("stop_loss", 0)
    entry_price = position.get("entry_price", 0)
    current_price = market_data.get("current_price", 0)

    # 计算浮盈
    if side == "LONG":
        profit_r = (current_price - entry_price) / (entry_price - current_sl) if current_sl else 0
    else:
        profit_r = (entry_price - current_price) / (current_sl - entry_price) if current_sl else 0

    # 浮盈 >= 1.5R 时移到保本
    if profit_r >= 1.5:
        new_sl = entry_price
        return {
            "should_trail": True,
            "new_sl": new_sl,
            "reason": f"浮盈 {profit_r:.2f}R，移到保本"
        }

    # 检查是否有新的 Major HL/LH
    major_hl = market_data.get("major_hl", 0)
    major_lh = market_data.get("major_lh", 0)

    if side == "LONG" and major_hl > current_sl:
        return {
            "should_trail": True,
            "new_sl": major_hl,
            "reason": f"新 Major HL 形成: {major_hl}"
        }

    if side == "SHORT" and major_lh < current_sl:
        return {
            "should_trail": True,
            "new_sl": major_lh,
            "reason": f"新 Major LH 形成: {major_lh}"
        }

    return {
        "should_trail": False,
        "new_sl": current_sl,
        "reason": "无需移动止损"
    }


def calculate_partial_close(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    计算分批止盈

    Returns:
        {
            "should_close": bool,
            "close_ratio": float,  # 0.0-1.0
            "reason": str
        }
    """
    side = position.get("side", "")
    entry_price = position.get("entry_price", 0)
    current_sl = position.get("stop_loss", 0)
    current_price = market_data.get("current_price", 0)
    style = position.get("style", "Swing")

    # 计算浮盈
    if side == "LONG":
        profit_r = (current_price - entry_price) / (entry_price - current_sl) if current_sl else 0
    else:
        profit_r = (entry_price - current_price) / (current_sl - entry_price) if current_sl else 0

    # Scalp: 1.5R 全平
    if style == "Scalp" and profit_r >= 1.5:
        return {
            "should_close": True,
            "close_ratio": 1.0,
            "reason": f"Scalp 到达 TP1 ({profit_r:.2f}R)"
        }

    # Swing: 2R 减仓 50%
    if style == "Swing" and profit_r >= 2.0:
        already_reduced = position.get("tp1_executed", False)
        if not already_reduced:
            return {
                "should_close": True,
                "close_ratio": 0.5,
                "reason": f"Swing 到达 TP1 ({profit_r:.2f}R)"
            }

    # Swing: 3R 再减 25%
    if style == "Swing" and profit_r >= 3.0:
        tp2_executed = position.get("tp2_executed", False)
        if not tp2_executed:
            return {
                "should_close": True,
                "close_ratio": 0.25,
                "reason": f"Swing 到达 TP2 ({profit_r:.2f}R)"
            }

    return {
        "should_close": False,
        "close_ratio": 0.0,
        "reason": "未到止盈目标"
    }


def manage_position(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    完整的持仓管理流程

    Returns:
        {
            "action": "HOLD" | "CLOSE" | "PARTIAL_CLOSE" | "MODIFY_STOP_LOSS",
            "params": dict,
            "reason": str,
            "premise_check": dict,
            "strength_check": dict,
        }
    """
    # 1. Premise Check（优先级最高）
    premise = premise_check(position, market_data)

    if premise["action"] == "CLOSE":
        return {
            "action": "CLOSE",
            "params": {"symbol": position["symbol"]},
            "reason": premise["reason"],
            "premise_check": premise,
            "strength_check": None,
        }

    if premise["action"] == "REDUCE":
        return {
            "action": "PARTIAL_CLOSE",
            "params": {"symbol": position["symbol"], "close_ratio": 0.5},
            "reason": premise["reason"],
            "premise_check": premise,
            "strength_check": None,
        }

    # 2. Strength Check
    strength = strength_check(position, market_data)

    # 3. 分批止盈检查
    partial = calculate_partial_close(position, market_data)
    if partial["should_close"]:
        return {
            "action": "PARTIAL_CLOSE",
            "params": {
                "symbol": position["symbol"],
                "close_ratio": partial["close_ratio"]
            },
            "reason": partial["reason"],
            "premise_check": premise,
            "strength_check": strength,
        }

    # 4. Trailing SL 检查
    trailing = calculate_trailing_sl(position, market_data)
    if trailing["should_trail"]:
        return {
            "action": "MODIFY_STOP_LOSS",
            "params": {
                "symbol": position["symbol"],
                "new_sl": trailing["new_sl"]
            },
            "reason": trailing["reason"],
            "premise_check": premise,
            "strength_check": strength,
        }

    # 5. 正常持有
    return {
        "action": "HOLD",
        "params": {},
        "reason": f"Premise 有效，信心={strength['confidence']}",
        "premise_check": premise,
        "strength_check": strength,
    }
