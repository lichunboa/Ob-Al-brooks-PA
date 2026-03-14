"""前提校验：判断持仓逻辑是否仍然成立。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float
from trading.utils.target_magnets import build_target_magnets, resolve_target_path

from ..common import get_attr, get_position_attr


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
    """
    side = get_position_attr(position, "side", "")
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0)
    entry_time = get_position_attr(position, "entry_time", "")
    management_style = str(get_position_attr(position, "management_style", "") or "").strip().lower()

    ab_state = market_data.get("ab_state", {})
    ab_sr = market_data.get("ab_sr", {})
    recent_bars = market_data.get("recent_bars", [])
    current_price = safe_float(market_data.get("current_price"), 0)
    account_info = market_data.get("account_info", {})

    checks = {}

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

    entry_state = str(get_position_attr(position, "entry_market_state", "")).strip().upper()
    current_state = str(ab_state.get("state", "")).strip().upper()

    state_valid = True
    if entry_state == "BO" and current_state == "TR":
        state_valid = False
    elif entry_state == "TC" and current_state in {"TR", "BC"}:
        state_valid = False
    elif entry_state and current_state and entry_state != current_state:
        state_valid = True

    checks["market_state"] = {
        "pass": state_valid,
        "reason": f"入场={entry_state}, 当前={current_state}",
    }

    signal_price = safe_float(get_position_attr(position, "signal_price"), entry_price)
    signal_high = safe_float(get_position_attr(position, "signal_high"), signal_price)
    signal_low = safe_float(get_position_attr(position, "signal_low"), signal_price)
    entry_stop = safe_float(get_position_attr(position, "stop_loss"), 0)
    initial_risk = abs(entry_price - entry_stop)
    bars_since_entry = len([b for b in recent_bars if get_attr(b, "time", "") > entry_time])

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
    is_reversal_style = management_style in reversal_styles
    is_trend_recovery_style = management_style in trend_recovery_styles
    # 趋势恢复 setup 经常会经历更深的测试，尤其 H1 可能只是更大 PB 的第一腿。
    # 因此不能把“跌破信号棒极值一点点”直接当成彻底无效。
    if is_reversal_style:
        buffer_ratio = 0.50
    elif is_trend_recovery_style:
        buffer_ratio = 0.40
    else:
        buffer_ratio = 0.25
    signal_buffer = max(initial_risk * buffer_ratio, signal_price * 0.001)

    signal_valid = True
    if side == "BUY":
        if current_price < signal_low - signal_buffer:
            signal_valid = False
    else:
        if current_price > signal_high + signal_buffer:
            signal_valid = False

    checks["signal_validity"] = {
        "pass": signal_valid,
        "reason": (
            f"信号价={signal_price:.2f}, 当前={current_price:.2f}, "
            f"缓冲={signal_buffer:.4f}, {'有效' if signal_valid else '已深度否定'}"
        ),
    }

    ft_quality = "good"
    if len(recent_bars) >= 3:
        last_3 = recent_bars[-3:]
        bull_count = sum(1 for b in last_3 if safe_float(get_attr(b, "C"), 0) > safe_float(get_attr(b, "O"), 0))
        bear_count = sum(1 for b in last_3 if safe_float(get_attr(b, "C"), 0) < safe_float(get_attr(b, "O"), 0))

        if side == "BUY" and bear_count >= 3:
            ft_quality = "poor"
        elif side == "SELL" and bull_count >= 3:
            ft_quality = "poor"

    ft_valid = ft_quality != "poor" or bars_since_entry < 3
    checks["follow_through"] = {
        "pass": ft_valid,
        "reason": f"FT={ft_quality}, bars={bars_since_entry}",
    }

    tp1 = safe_float(get_position_attr(position, "tp1"), 0)
    ab_mm = market_data.get("ab_mm", {}) if isinstance(market_data.get("ab_mm"), dict) else {}
    key_levels = market_data.get("key_levels", {}) if isinstance(market_data.get("key_levels"), dict) else {}
    ab_ema = market_data.get("ab_ema", {}) if isinstance(market_data.get("ab_ema"), dict) else {}
    if not ab_mm and not key_levels:
        path_clear = True
        target_reason = "数据不足，默认通畅"
    else:
        magnets = build_target_magnets(
            side,
            current_price or entry_price,
            ab_sr=ab_sr,
            ab_mm=ab_mm,
            key_levels=key_levels,
            ema20=safe_float(ab_ema.get("ema20"), 0.0),
        )
        target_plan = resolve_target_path(
            side,
            current_price or entry_price,
            tp1,
            stop_loss=entry_stop,
            market_state=str(ab_state.get("state", "") or ""),
            route_style=str(get_position_attr(position, "management_style", "") or ""),
            magnets=magnets,
        )
        path_clear = bool(target_plan.get("path_clear", True))
        primary = target_plan.get("primary_magnet") if isinstance(target_plan.get("primary_magnet"), dict) else {}
        blocker = target_plan.get("blocking_magnet") if isinstance(target_plan.get("blocking_magnet"), dict) else {}
        if blocker:
            blocker_kind = blocker.get("kind", "-")
            blocker_price = safe_float(blocker.get("price"), 0.0)
            target_reason = f"路径受阻，最近磁体 {blocker_kind}: {blocker_price:.2f}"
        elif primary:
            target_reason = f"首要目标 {primary.get('kind', '-')}: {safe_float(primary.get('price'), 0.0):.2f}"
        else:
            target_reason = "无明显阻挡磁体"

    checks["target_path"] = {
        "pass": path_clear,
        "reason": "路径通畅" if path_clear else target_reason,
    }

    margin_ratio = safe_float(account_info.get("margin_ratio"), 1000)
    equity = safe_float(account_info.get("equity"), 0)
    used_margin = safe_float(account_info.get("used_margin"), 0)

    risk_ok = margin_ratio > 120 and (not equity or used_margin / equity < 0.8)
    checks["risk_metrics"] = {
        "pass": risk_ok,
        "reason": f"保证金率={margin_ratio:.1f}%",
    }

    all_pass = all(check["pass"] for check in checks.values())

    if not checks["ai_direction"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "CLOSE",
            "reason": "AI 方向反转",
        }

    if not checks["risk_metrics"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "REDUCE",
            "reason": "风险指标异常",
        }

    if not checks["market_state"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "REDUCE",
            "reason": "市场状态改变，波段降级为保护性管理",
        }

    if not checks["signal_validity"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "REDUCE" if (is_reversal_style or is_trend_recovery_style) else "CLOSE",
            "reason": (
                "信号 K 线被深度测试，先转保护性管理"
                if is_reversal_style
                else "趋势恢复单被深测，先降级为保护性 scalp"
                if is_trend_recovery_style
                else "信号 K 线被否定"
            ),
        }

    if not checks["target_path"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "REDUCE",
            "reason": "目标路径受阻，先减仓保护利润",
        }

    if not checks["follow_through"]["pass"]:
        return {
            "valid": False,
            "checks": checks,
            "action": "REDUCE",
            "reason": "Follow-Through 转弱，先减仓再观察",
        }

    if not all_pass:
        failed = [key for key, value in checks.items() if not value["pass"]]
        return {
            "valid": False,
            "checks": checks,
            "action": "CLOSE",
            "reason": f"Premise 失效: {', '.join(failed)}",
        }

    return {
        "valid": True,
        "checks": checks,
        "action": "HOLD",
        "reason": "Premise 有效",
    }
