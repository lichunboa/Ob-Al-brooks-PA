"""
S7 持仓管理模块

实现 Al Brooks 持仓管理框架：
- Premise Check（6 项检查）
- Strength Check（7 项增强信号）
- Trailing SL
- 分批止盈（TP1/TP2）
- 加仓策略

数据来源：
- ab_sr: 支撑阻力、HL/LH
- ab_ema: EMA 相关
- ab_patterns: 形态识别
- ab_state: 市场状态
"""

from __future__ import annotations

from typing import Any

from utils import safe_float


def _get_position_attr(position: Any, key: str, default: Any = None) -> Any:
    """
    统一获取持仓属性（兼容字典和对象）
    """
    if isinstance(position, dict):
        return position.get(key, default)
    else:
        return getattr(position, key, default)


def _get_attr(obj: Any, key: str, default: Any = None) -> Any:
    """
    统一获取对象属性（兼容字典和对象）
    """
    if isinstance(obj, dict):
        return obj.get(key, default)
    else:
        return getattr(obj, key, default)


def premise_check(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    Premise Check - 6 项检查

    数据来源：
    - ai_direction: 从 symbol_state 读取
    - market_state: 从 ab_state 读取
    - signal_validity: 从 ab_sr 读取
    - follow_through: 从 recent_bars 计算
    - target_path: 从 ab_sr 读取
    - risk_metrics: 从 account_info 读取

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
    side = _get_position_attr(position, "side", "")
    entry_price = safe_float(_get_position_attr(position, "entry_price"), 0)
    entry_time = _get_position_attr(position, "entry_time", "")

    # 从 market_data 提取各个 skill 的数据
    ab_state = market_data.get("ab_state", {})
    ab_sr = market_data.get("ab_sr", {})
    recent_bars = market_data.get("recent_bars", [])
    current_price = safe_float(market_data.get("current_price"), 0)
    account_info = market_data.get("account_info", {})

    checks = {}

    # 1. AI 方向检查
    ai_direction = str(market_data.get("ai_direction", "")).strip()
    direction_match = (
        (side == "BUY" and "long" in ai_direction.lower()) or
        (side == "SELL" and "short" in ai_direction.lower())
    )
    checks["ai_direction"] = {
        "pass": direction_match,
        "reason": f"AI={ai_direction}, Side={side}, {'一致' if direction_match else '矛盾'}"
    }

    # 2. 市场状态检查
    entry_state = str(_get_position_attr(position, "entry_market_state", "")).strip().upper()
    current_state = str(ab_state.get("state", "")).strip().upper()

    # 状态兼容性检查
    state_valid = True
    if entry_state == "BO" and current_state == "TR":
        state_valid = False  # BO 变 TR 是失败
    elif entry_state == "TC" and current_state in {"TR", "BC"}:
        state_valid = False  # TC 变 TR/BC 是失败
    elif entry_state and current_state and entry_state != current_state:
        # 其他状态变化需要谨慎
        state_valid = True  # 暂时允许，但记录

    checks["market_state"] = {
        "pass": state_valid,
        "reason": f"入场={entry_state}, 当前={current_state}"
    }

    # 3. 信号 K 线检查
    signal_price = safe_float(_get_position_attr(position, "signal_price"), entry_price)
    signal_high = safe_float(_get_position_attr(position, "signal_high"), signal_price)
    signal_low = safe_float(_get_position_attr(position, "signal_low"), signal_price)

    # 检查信号 K 线是否被否定
    signal_valid = True
    if side == "BUY":
        # 做多：价格不应跌破信号 K 线低点
        if current_price < signal_low * 0.998:  # 允许 0.2% 误差
            signal_valid = False
    else:
        # 做空：价格不应突破信号 K 线高点
        if current_price > signal_high * 1.002:
            signal_valid = False

    checks["signal_validity"] = {
        "pass": signal_valid,
        "reason": f"信号价={signal_price:.2f}, 当前={current_price:.2f}, {'有效' if signal_valid else '已否定'}"
    }

    # 4. Follow-Through 检查
    bars_since_entry = len([b for b in recent_bars if _get_attr(b, "time", "") > entry_time])

    # 检查最近 3 根 K 线的质量
    ft_quality = "good"
    if len(recent_bars) >= 3:
        last_3 = recent_bars[-3:]
        bull_count = sum(1 for b in last_3 if "bull" in str(_get_attr(b, "body", "")).lower())
        bear_count = sum(1 for b in last_3 if "bear" in str(_get_attr(b, "body", "")).lower())

        if side == "BUY" and bear_count >= 2:
            ft_quality = "poor"
        elif side == "SELL" and bull_count >= 2:
            ft_quality = "poor"

    ft_valid = ft_quality != "poor" or bars_since_entry < 3
    checks["follow_through"] = {
        "pass": ft_valid,
        "reason": f"FT={ft_quality}, bars={bars_since_entry}"
    }

    # 5. 目标路径检查
    tp1 = safe_float(_get_position_attr(position, "tp1"), 0)

    # 从 ab_sr 获取最近的支撑/阻力
    if side == "BUY":
        nearest_resistance = safe_float(ab_sr.get("nearest_resistance"), 0)
        path_clear = not nearest_resistance or nearest_resistance > tp1 or nearest_resistance > current_price * 1.01
    else:
        nearest_support = safe_float(ab_sr.get("nearest_support"), 0)
        path_clear = not nearest_support or nearest_support < tp1 or nearest_support < current_price * 0.99

    checks["target_path"] = {
        "pass": path_clear,
        "reason": "路径通畅" if path_clear else "路径受阻"
    }

    # 6. 风险指标检查
    margin_ratio = safe_float(account_info.get("margin_ratio"), 1000)
    equity = safe_float(account_info.get("equity"), 0)
    used_margin = safe_float(account_info.get("used_margin"), 0)

    risk_ok = margin_ratio > 120 and (not equity or used_margin / equity < 0.8)
    checks["risk_metrics"] = {
        "pass": risk_ok,
        "reason": f"保证金率={margin_ratio:.1f}%"
    }

    # 综合判断
    all_pass = all(check["pass"] for check in checks.values())

    # 优先级判断
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

    if not checks["signal_validity"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "CLOSE",
            "reason": "信号 K 线被否定"
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

    数据来源：
    - gap_open: 从 ab_sr 读取
    - new_hl_lh: 从 ab_sr 读取
    - ema_bounce: 从 ab_ema 读取
    - micro_gap: 从 recent_bars 计算
    - shallow_pb: 从 recent_bars 计算
    - wedge_exhaustion: 从 ab_patterns 读取
    - multi_tf_align: 从多周期数据读取

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
    side = _get_position_attr(position, "side", "")
    entry_price = safe_float(_get_position_attr(position, "entry_price"), 0)
    entry_time = _get_position_attr(position, "entry_time", "")

    # 从 market_data 提取各个 skill 的数据
    ab_sr = market_data.get("ab_sr", {})
    ab_ema = market_data.get("ab_ema", {})
    ab_patterns = market_data.get("ab_patterns", {})
    recent_bars = market_data.get("recent_bars", [])
    current_price = safe_float(market_data.get("current_price"), 0)
    timeframes = market_data.get("timeframes", {})

    signals = {}

    # 1. Gap Open（缺口开盘）
    # 从 ab_sr 检查是否有 gap
    gaps = ab_sr.get("gaps", [])
    gap_open = any(
        safe_float(g.get("gap_size"), 0) > 0
        for g in gaps
        if isinstance(g, dict)
    )
    signals["gap_open"] = gap_open

    # 2. New HL/LH（新高低点）
    # 从 ab_sr 检查是否形成新的 Major HL/LH
    major_hl = safe_float(ab_sr.get("major_hl"), 0)
    major_lh = safe_float(ab_sr.get("major_lh"), 0)

    new_hl_lh = False
    if side == "BUY" and major_hl > entry_price:
        new_hl_lh = True
    elif side == "SELL" and major_lh < entry_price:
        new_hl_lh = True
    signals["new_hl_lh"] = new_hl_lh

    # 3. EMA Bounce（EMA 反弹）
    # 从 ab_ema 检查是否在 EMA 附近反弹
    ema20 = safe_float(ab_ema.get("ema20"), 0)
    ema_distance = abs(current_price - ema20) / ema20 if ema20 else 1.0

    ema_bounce = False
    if ema_distance < 0.005:  # 距离 EMA 小于 0.5%
        # 检查最近是否有反弹
        if len(recent_bars) >= 2:
            last_bar = recent_bars[-1]
            prev_bar = recent_bars[-2]
            if side == "BUY":
                ema_bounce = (
                    safe_float(prev_bar.get("L"), 0) <= ema20 and
                    safe_float(last_bar.get("C"), 0) > ema20
                )
            else:
                ema_bounce = (
                    safe_float(prev_bar.get("H"), 0) >= ema20 and
                    safe_float(last_bar.get("C"), 0) < ema20
                )
    signals["ema_bounce"] = ema_bounce

    # 4. Micro Gap（微缺口）
    # 检查最近 3 根 K 线是否有微缺口
    micro_gap = False
    if len(recent_bars) >= 3:
        for i in range(len(recent_bars) - 2):
            bar1 = recent_bars[i]
            bar2 = recent_bars[i + 1]
            if side == "BUY":
                gap_size = safe_float(bar2.get("L"), 0) - safe_float(bar1.get("H"), 0)
                if gap_size > 0:
                    micro_gap = True
                    break
            else:
                gap_size = safe_float(bar1.get("L"), 0) - safe_float(bar2.get("H"), 0)
                if gap_size > 0:
                    micro_gap = True
                    break
    signals["micro_gap"] = micro_gap

    # 5. Shallow Pullback（浅回调）
    # 检查回调幅度是否小于 50%
    shallow_pb = False
    if len(recent_bars) >= 5:
        # 找到入场后的最高/最低点
        bars_after_entry = [b for b in recent_bars if _get_attr(b, "time", "") > entry_time]
        if bars_after_entry:
            if side == "BUY":
                highest = max(safe_float(_get_attr(b, "H"), 0) for b in bars_after_entry)
                lowest = min(safe_float(_get_attr(b, "L"), 0) for b in bars_after_entry)
                if highest > entry_price:
                    pb_ratio = (highest - lowest) / (highest - entry_price)
                    shallow_pb = pb_ratio < 0.5
            else:
                highest = max(safe_float(_get_attr(b, "H"), 0) for b in bars_after_entry)
                lowest = min(safe_float(_get_attr(b, "L"), 0) for b in bars_after_entry)
                if lowest < entry_price:
                    pb_ratio = (highest - lowest) / (entry_price - lowest)
                    shallow_pb = pb_ratio < 0.5
    signals["shallow_pb"] = shallow_pb

    # 6. Wedge Exhaustion（楔形衰竭）
    # 从 ab_patterns 检查是否有楔形衰竭
    patterns = ab_patterns.get("patterns", [])
    wedge_exhaustion = any(
        "wedge" in str(p.get("type", "")).lower() and
        str(p.get("status", "")).lower() == "exhaustion"
        for p in patterns
        if isinstance(p, dict)
    )
    signals["wedge_exhaustion"] = wedge_exhaustion

    # 7. Multi-TF Align（多周期对齐）
    # 检查多个周期是否对齐
    multi_tf_align = False
    if timeframes:
        tf_5m = timeframes.get("5m", {})
        tf_15m = timeframes.get("15m", {})

        trend_5m = str(tf_5m.get("trend", "")).lower()
        trend_15m = str(tf_15m.get("trend", "")).lower()

        if side == "BUY":
            multi_tf_align = "bull" in trend_5m and "bull" in trend_15m
        else:
            multi_tf_align = "bear" in trend_5m and "bear" in trend_15m
    signals["multi_tf_align"] = multi_tf_align

    # 计算总分
    strength_score = sum(1 for v in signals.values() if v)

    # 判断信心等级
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

    规则：
    1. 浮盈 >= 1.5R 时移到保本
    2. 有新的 Major HL/LH 时移到该点
    3. Scalp 风格：更激进的移动

    Returns:
        {
            "should_trail": bool,
            "new_sl": float,
            "reason": str
        }
    """
    side = _get_position_attr(position, "side", "")
    current_sl = safe_float(_get_position_attr(position, "stop_loss"), 0)
    entry_price = safe_float(_get_position_attr(position, "entry_price"), 0)
    current_price = safe_float(market_data.get("current_price"), 0)
    style = _get_position_attr(position, "style", "Swing")

    if not current_sl or not entry_price:
        return {
            "should_trail": False,
            "new_sl": current_sl,
            "reason": "缺少止损或入场价"
        }

    # 计算浮盈（R 倍数）
    initial_risk = abs(entry_price - current_sl)
    if initial_risk <= 0:
        return {
            "should_trail": False,
            "new_sl": current_sl,
            "reason": "初始风险为 0"
        }

    if side == "BUY":
        profit_r = (current_price - entry_price) / initial_risk
    else:
        profit_r = (entry_price - current_price) / initial_risk

    # 规则 1: 浮盈 >= 1.5R 时移到保本
    if profit_r >= 1.5:
        # Scalp 风格：移到保本 + 0.5R
        if style == "Scalp":
            if side == "BUY":
                new_sl = entry_price + initial_risk * 0.5
            else:
                new_sl = entry_price - initial_risk * 0.5

            if (side == "BUY" and new_sl > current_sl) or (side == "SELL" and new_sl < current_sl):
                return {
                    "should_trail": True,
                    "new_sl": new_sl,
                    "reason": f"Scalp 浮盈 {profit_r:.2f}R，移到保本+0.5R"
                }
        else:
            # Swing 风格：移到保本
            if (side == "BUY" and entry_price > current_sl) or (side == "SELL" and entry_price < current_sl):
                return {
                    "should_trail": True,
                    "new_sl": entry_price,
                    "reason": f"浮盈 {profit_r:.2f}R，移到保本"
                }

    # 规则 2: 检查是否有新的 Major HL/LH
    ab_sr = market_data.get("ab_sr", {})
    major_hl = safe_float(ab_sr.get("major_hl"), 0)
    major_lh = safe_float(ab_sr.get("major_lh"), 0)

    if side == "BUY" and major_hl > current_sl and major_hl < current_price:
        return {
            "should_trail": True,
            "new_sl": major_hl,
            "reason": f"新 Major HL 形成: {major_hl:.2f}"
        }

    if side == "SELL" and major_lh < current_sl and major_lh > current_price:
        return {
            "should_trail": True,
            "new_sl": major_lh,
            "reason": f"新 Major LH 形成: {major_lh:.2f}"
        }

    # 规则 3: Scalp 风格的激进移动
    if style == "Scalp" and profit_r >= 1.0:
        # 移到最近的 Minor HL/LH
        minor_hl = safe_float(ab_sr.get("minor_hl"), 0)
        minor_lh = safe_float(ab_sr.get("minor_lh"), 0)

        if side == "BUY" and minor_hl > current_sl and minor_hl < current_price:
            return {
                "should_trail": True,
                "new_sl": minor_hl,
                "reason": f"Scalp 移到 Minor HL: {minor_hl:.2f}"
            }

        if side == "SELL" and minor_lh < current_sl and minor_lh > current_price:
            return {
                "should_trail": True,
                "new_sl": minor_lh,
                "reason": f"Scalp 移到 Minor LH: {minor_lh:.2f}"
            }

    return {
        "should_trail": False,
        "new_sl": current_sl,
        "reason": f"无需移动止损（浮盈 {profit_r:.2f}R）"
    }


def calculate_partial_close(position: dict[str, Any], market_data: dict[str, Any]) -> dict[str, Any]:
    """
    计算分批止盈

    规则：
    - Scalp: 1.5R 全平
    - Swing: 2R 减仓 50%，3R 再减 25%
    - 反转试探: 1R 全平

    Returns:
        {
            "should_close": bool,
            "close_ratio": float,  # 0.0-1.0
            "reason": str
        }
    """
    side = _get_position_attr(position, "side", "")
    entry_price = safe_float(_get_position_attr(position, "entry_price"), 0)
    current_sl = safe_float(_get_position_attr(position, "stop_loss"), 0)
    current_price = safe_float(market_data.get("current_price"), 0)
    style = _get_position_attr(position, "style", "Swing")

    if not current_sl or not entry_price:
        return {
            "should_close": False,
            "close_ratio": 0.0,
            "reason": "缺少止损或入场价"
        }

    # 计算浮盈（R 倍数）
    initial_risk = abs(entry_price - current_sl)
    if initial_risk <= 0:
        return {
            "should_close": False,
            "close_ratio": 0.0,
            "reason": "初始风险为 0"
        }

    if side == "BUY":
        profit_r = (current_price - entry_price) / initial_risk
    else:
        profit_r = (entry_price - current_price) / initial_risk

    # 反转试探：1R 全平
    if style == "反转试探" and profit_r >= 1.0:
        return {
            "should_close": True,
            "close_ratio": 1.0,
            "reason": f"反转试探到达 TP ({profit_r:.2f}R)"
        }

    # Scalp: 1.5R 全平
    if style == "Scalp" and profit_r >= 1.5:
        return {
            "should_close": True,
            "close_ratio": 1.0,
            "reason": f"Scalp 到达 TP1 ({profit_r:.2f}R)"
        }

    # Swing: 2R 减仓 50%
    if style == "Swing" and profit_r >= 2.0:
        already_reduced = _get_position_attr(position, "tp1_executed", False)
        if not already_reduced:
            return {
                "should_close": True,
                "close_ratio": 0.5,
                "reason": f"Swing 到达 TP1 ({profit_r:.2f}R)"
            }

    # Swing: 3R 再减 25%
    if style == "Swing" and profit_r >= 3.0:
        tp2_executed = _get_position_attr(position, "tp2_executed", False)
        if not tp2_executed:
            return {
                "should_close": True,
                "close_ratio": 0.25,
                "reason": f"Swing 到达 TP2 ({profit_r:.2f}R)"
            }

    # Swing: 4R 再减 15%（剩余 10% 让它跑）
    if style == "Swing" and profit_r >= 4.0:
        tp3_executed = _get_position_attr(position, "tp3_executed", False)
        if not tp3_executed:
            return {
                "should_close": True,
                "close_ratio": 0.15,
                "reason": f"Swing 到达 TP3 ({profit_r:.2f}R)"
            }

    return {
        "should_close": False,
        "close_ratio": 0.0,
        "reason": f"未到止盈目标（浮盈 {profit_r:.2f}R）"
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
            "params": {"symbol": _get_position_attr(position, "symbol")},
            "reason": premise["reason"],
            "premise_check": premise,
            "strength_check": None,
        }

    if premise["action"] == "REDUCE":
        return {
            "action": "PARTIAL_CLOSE",
            "params": {"symbol": _get_position_attr(position, "symbol"), "close_ratio": 0.5},
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
                "symbol": _get_position_attr(position, "symbol"),
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
                "symbol": _get_position_attr(position, "symbol"),
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
