"""
EMA 缺口族持仓预期模块。

把 20 均线缺口 / 第一均线缺口 / MAG 的
close-test / rescue / scalp / swing 预期层级从主流程拆出来，
避免 gap 族继续混在通用 trend recovery 管理里。
"""

from __future__ import annotations

from .models import Trade


def _target_r(level: float, entry_price: float, initial_risk: float) -> float:
    """把目标价换算成 R。"""
    if level <= 0 or initial_risk <= 0:
        return 0.0
    return abs(level - entry_price) / max(initial_risk, 1e-9)


def build_ema_gap_management_profile(
    trade: Trade,
    *,
    default_tp1_r: float,
    default_tp2_r: float,
) -> dict[str, float | bool | str]:
    """根据 EMA 缺口族预期层级决定目标与分批。"""
    first_r = _target_r(float(trade.first_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    rescue_r = _target_r(float(trade.rescue_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    close_test_r = _target_r(float(trade.close_test_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    swing_r = _target_r(float(trade.swing_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    stretch_r = _target_r(float(trade.stretch_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    effective_r = _target_r(float(trade.effective_target or 0.0), float(trade.entry_price), float(trade.initial_risk))

    expectation = str(getattr(trade, "ema_gap_expectation", "") or "").strip().lower() or "scalp"
    context_tier = str(getattr(trade, "ema_gap_context_tier", "") or "").strip().lower() or "weak"
    template = str(trade.management_template or "").strip().lower()
    allow_runner = bool(trade.allow_small_runner) and context_tier == "strong"
    overextended = bool(getattr(trade, "ema_gap_overextended", False))

    tp1_r = float(default_tp1_r)
    tp2_r = float(default_tp2_r)
    tp1_fraction = 0.50
    tp2_fraction = 0.0
    protect_after_tp1 = 0.0 if trade.allow_be_after_first_target else 0.15
    protect2_r = max(protect_after_tp1, 0.25)
    trail_r = max(protect2_r, 0.35)
    runner_enabled = False

    if expectation == "rescue":
        tp1_r = max(0.12, min(rescue_r or first_r or effective_r or 0.45, 0.95 if context_tier != "weak" else 0.75))
        tp2_r = max(tp1_r + 0.05, min(close_test_r or effective_r or tp1_r + 0.15, 1.25 if context_tier == "weak" else 1.60))
        tp1_fraction = 0.70
        tp2_fraction = 0.0
        protect_after_tp1 = 0.0
        protect2_r = max(tp1_r, 0.10)
        trail_r = protect2_r
    elif expectation == "close_test":
        tp1_r = max(0.18, min(first_r or close_test_r or effective_r or 0.55, 1.20 if context_tier != "weak" else 0.90))
        tp2_r = max(tp1_r + 0.05, min(close_test_r or swing_r or effective_r or tp1_r + 0.20, 1.80 if context_tier != "weak" else 1.20))
        tp1_fraction = 0.65 if context_tier == "weak" else 0.60
        runner_enabled = allow_runner and not overextended and context_tier == "strong"
        tp2_fraction = 0.10 if runner_enabled else 0.0
        protect_after_tp1 = 0.0
        protect2_r = max(tp1_r, min(tp2_r, tp1_r + 0.25))
        trail_r = max(tp1_r, protect2_r - 0.10)
    elif expectation == "swing":
        tp1_r = max(0.30, first_r or close_test_r or effective_r or default_tp1_r)
        tp2_r = max(tp1_r + 0.05, swing_r or stretch_r or close_test_r or effective_r or default_tp2_r)
        tp1_fraction = 0.50
        runner_enabled = allow_runner and not overextended
        tp2_fraction = 0.20 if runner_enabled else 0.0
        protect_after_tp1 = 0.10
        protect2_r = max(tp1_r + 0.15, min(tp2_r, tp1_r + 0.75))
        trail_r = max(tp1_r + 0.05, protect2_r - 0.15)
    elif expectation == "fade":
        tp1_r = max(0.15, min(effective_r or first_r or 0.45, 0.80))
        tp2_r = max(tp1_r + 0.05, min(close_test_r or tp1_r + 0.12, 1.10))
        tp1_fraction = 0.75
        tp2_fraction = 0.0
        protect_after_tp1 = 0.0
        protect2_r = max(tp1_r, 0.10)
        trail_r = protect2_r
    else:
        tp1_r = max(0.15, min(effective_r or first_r or rescue_r or 0.45, 0.85))
        tp2_r = max(tp1_r + 0.05, min(close_test_r or effective_r or tp1_r + 0.15, 1.20))
        tp1_fraction = 0.75 if context_tier == "weak" else 0.70
        tp2_fraction = 0.0
        protect_after_tp1 = 0.0
        protect2_r = max(tp1_r, 0.10)
        trail_r = protect2_r

    if template == "ema_gap_mag_final_leg":
        tp1_r = min(tp1_r, 1.0 if overextended else tp1_r)
        tp2_r = min(tp2_r, 1.6 if overextended else tp2_r)
        runner_enabled = False
        tp2_fraction = 0.0
        protect2_r = max(tp1_r, min(tp2_r, 0.80 if overextended else 1.10))
        trail_r = protect2_r

    return {
        "tp1_r": float(tp1_r),
        "tp2_r": float(tp2_r),
        "tp1_fraction": float(tp1_fraction),
        "tp2_fraction": float(tp2_fraction),
        "protect_after_tp1": float(protect_after_tp1),
        "protect2_r": float(protect2_r),
        "trail_r": float(trail_r),
        "runner_enabled": bool(runner_enabled),
        "expectation": expectation,
        "context_tier": context_tier,
    }
