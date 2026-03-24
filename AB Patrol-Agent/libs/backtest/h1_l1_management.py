"""
H1/L1 first-entry 持仓预期模块。

把 rescue / close-test / swing 的预期层级从 sim_exchange 主文件里拆出来，
避免 H1/L1 管理继续堆在几千行的大文件中。
"""

from __future__ import annotations

from .models import Trade


def _target_r(level: float, entry_price: float, initial_risk: float) -> float:
    """把目标价换算成 R。"""
    if level <= 0 or initial_risk <= 0:
        return 0.0
    return abs(level - entry_price) / max(initial_risk, 1e-9)


def build_h1_l1_management_profile(
    trade: Trade,
    *,
    default_tp1_r: float,
    default_tp2_r: float,
) -> dict[str, float | bool | str]:
    """根据 H1/L1 预期层级决定 first-entry 的目标与分批。"""
    rescue_r = _target_r(float(trade.rescue_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    close_test_r = _target_r(float(trade.close_test_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    swing_r = _target_r(float(trade.swing_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    stretch_r = _target_r(float(trade.stretch_target or 0.0), float(trade.entry_price), float(trade.initial_risk))
    first_target_r = _target_r(float(trade.first_target or 0.0), float(trade.entry_price), float(trade.initial_risk))

    expectation = str(trade.h1_l1_expectation or "").strip().lower() or "scalp"
    tier = str(trade.h1_l1_context_tier or "").strip().lower() or "weak"
    allow_runner = bool(trade.allow_small_runner)

    tp1_r = float(default_tp1_r)
    tp2_r = float(default_tp2_r)
    tp1_fraction = 0.50
    tp2_fraction = 0.25
    protect_after_tp1 = 0.0 if trade.allow_be_after_first_target else 0.15
    runner_enabled = False

    if expectation == "rescue":
        tp1_r = max(0.12, rescue_r or first_target_r or 0.40)
        tp2_r = max(tp1_r + 0.05, close_test_r or tp1_r + 0.20)
        tp1_fraction = 0.70
        tp2_fraction = 0.0
    elif expectation == "close_test":
        tp1_r = max(0.20, first_target_r or close_test_r or rescue_r or 0.50)
        tp2_r = max(tp1_r + 0.05, close_test_r or stretch_r or swing_r or tp1_r + 0.25)
        tp1_fraction = 0.60
        runner_enabled = allow_runner and tier == "strong"
        tp2_fraction = 0.10 if runner_enabled else 0.0
    elif expectation == "swing":
        tp1_r = max(0.35, first_target_r or default_tp1_r)
        tp2_candidate = swing_r or stretch_r or close_test_r or default_tp2_r
        tp2_r = max(tp1_r + 0.05, tp2_candidate)
        tp1_fraction = 0.60 if trade.first_target_is_close_test else 0.50
        runner_enabled = allow_runner
        tp2_fraction = 0.25 if runner_enabled else 0.0
    elif expectation == "fade":
        tp1_r = max(0.10, first_target_r or rescue_r or 0.35)
        tp2_r = max(tp1_r + 0.05, close_test_r or tp1_r + 0.15)
        tp1_fraction = 0.75
        tp2_fraction = 0.0
    else:
        tp1_r = max(0.12, first_target_r or rescue_r or 0.40)
        tp2_r = max(tp1_r + 0.05, close_test_r or tp1_r + 0.15)
        tp1_fraction = 0.75
        tp2_fraction = 0.0

    if tier == "weak" and expectation in {"rescue", "close_test", "scalp"}:
        tp1_r = min(tp1_r, 0.80)
        tp2_r = min(tp2_r, max(tp1_r + 0.05, 1.60))
        runner_enabled = False
        tp2_fraction = 0.0
    elif tier == "medium" and expectation == "close_test":
        tp1_r = min(tp1_r, 1.00)
        tp2_r = min(tp2_r, max(tp1_r + 0.05, 2.00))
        if not runner_enabled:
            tp2_fraction = 0.0

    return {
        "tp1_r": float(tp1_r),
        "tp2_r": float(tp2_r),
        "tp1_fraction": float(tp1_fraction),
        "tp2_fraction": float(tp2_fraction),
        "protect_after_tp1": float(protect_after_tp1),
        "runner_enabled": bool(runner_enabled),
        "expectation": expectation,
        "context_tier": tier,
    }
