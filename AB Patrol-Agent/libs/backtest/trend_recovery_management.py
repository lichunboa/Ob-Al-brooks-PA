"""
趋势恢复族共用管理模块。

把 H1/L1、H2/L2、突破回调的 first target / partial / runner 规则
从 sim_exchange 主文件里拆出来，便于后续给 gap 族和突破回调复用。
"""

from __future__ import annotations

from .h1_l1_management import build_h1_l1_management_profile
from .models import Trade


def _target_r(level: float, entry_price: float, initial_risk: float) -> float:
    """把目标价换算成 R。"""
    if level <= 0 or initial_risk <= 0:
        return 0.0
    return abs(level - entry_price) / max(initial_risk, 1e-9)


def build_h2_l2_management_profile(
    trade: Trade,
    *,
    default_tp1_r: float,
    default_tp2_r: float,
) -> dict[str, float | bool | str]:
    """根据 H2/L2 second-entry 语义决定目标与分批。"""
    close_test_r = _target_r(float(trade.close_test_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    swing_r = _target_r(float(trade.swing_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    stretch_r = _target_r(float(trade.stretch_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    first_r = _target_r(float(trade.first_target or 0.0), float(trade.entry_price), float(trade.initial_risk))

    tp1_r = max(0.35, first_r or close_test_r or default_tp1_r)
    tp2_candidate = swing_r or stretch_r or max(tp1_r + 0.20, default_tp2_r)
    tp2_r = max(tp1_r + 0.05, tp2_candidate)
    runner_enabled = bool(trade.allow_small_runner)

    if str(trade.first_target_type or "") in {"prior_high", "prior_low"}:
        tp1_r = min(tp1_r, 1.0)

    return {
        "tp1_r": float(tp1_r),
        "tp2_r": float(tp2_r),
        "tp1_fraction": 0.45 if runner_enabled else 0.55,
        "tp2_fraction": 0.25 if runner_enabled else 0.0,
        "protect_after_tp1": 0.15,
        "runner_enabled": runner_enabled,
        "expectation": "second_entry",
    }


def build_breakout_pullback_management_profile(
    trade: Trade,
    *,
    default_tp1_r: float,
    default_tp2_r: float,
) -> dict[str, float | bool | str]:
    """根据突破回调 continuation 语义决定目标与分批。"""
    first_r = _target_r(float(trade.first_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    close_test_r = _target_r(float(trade.close_test_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    swing_r = _target_r(float(trade.swing_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    stretch_r = _target_r(float(trade.stretch_target or 0.0), float(trade.entry_price), float(trade.initial_risk))

    tp1_r = max(0.30, first_r or default_tp1_r)
    tp2_candidate = close_test_r or swing_r or stretch_r or max(tp1_r + 0.25, default_tp2_r)
    tp2_r = max(tp1_r + 0.05, tp2_candidate)
    runner_enabled = bool(trade.allow_small_runner) and bool(trade.follow_through or trade.higher_follow_through)

    return {
        "tp1_r": float(tp1_r),
        "tp2_r": float(tp2_r),
        "tp1_fraction": 0.45 if runner_enabled else 0.60,
        "tp2_fraction": 0.20 if runner_enabled else 0.0,
        "protect_after_tp1": 0.10,
        "runner_enabled": runner_enabled,
        "expectation": "breakout_pullback",
    }


def build_trend_recovery_management_profile(
    trade: Trade,
    *,
    default_tp1_r: float,
    default_tp2_r: float,
) -> dict[str, float | bool | str] | None:
    """按管理模板分发趋势恢复族的共用持仓规则。"""
    template = str(trade.management_template or "").strip().lower()
    if template == "h1_l1_first_entry" or bool(trade.first_entry_signal):
        return build_h1_l1_management_profile(
            trade,
            default_tp1_r=default_tp1_r,
            default_tp2_r=default_tp2_r,
        )
    if template == "h2_l2_second_entry" or trade.strategy in {"高2", "低2"}:
        return build_h2_l2_management_profile(
            trade,
            default_tp1_r=default_tp1_r,
            default_tp2_r=default_tp2_r,
        )
    if template == "breakout_pullback_continuation" or trade.strategy == "突破回调":
        return build_breakout_pullback_management_profile(
            trade,
            default_tp1_r=default_tp1_r,
            default_tp2_r=default_tp2_r,
        )
    return None
