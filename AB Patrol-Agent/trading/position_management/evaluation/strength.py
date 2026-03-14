"""强度评估：判断持仓是否值得继续持有。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float

from ..common import get_attr, get_position_attr

# P2: 按家族加权 — Brooks 对不同家族的关键信号权重不同
# 趋势恢复族: gap_open 最重要（"Gap stay open = counterparty trapped"）
# MTR 反转族: new_hl_lh 最重要（确认反转方向的新结构点）
# 突破追随族: multi_tf_align + micro_gap 最重要
# TR scalp: ema_bounce 最重要（TR 中 EMA 是天然磁体）
_FAMILY_WEIGHTS: dict[str, dict[str, float]] = {
    "trend_recovery": {
        "gap_open": 2.5, "shallow_pb": 2.0, "micro_gap": 1.5,
        "ema_bounce": 1.5, "new_hl_lh": 1.0, "wedge_exhaustion": 0.5, "multi_tf_align": 1.0,
    },
    "mtr_reversal": {
        "new_hl_lh": 2.5, "multi_tf_align": 2.0, "ema_bounce": 1.5,
        "gap_open": 1.0, "shallow_pb": 1.0, "micro_gap": 1.0, "wedge_exhaustion": 1.0,
    },
    "climax_reversal": {
        "new_hl_lh": 2.5, "multi_tf_align": 2.0, "ema_bounce": 1.5,
        "gap_open": 1.0, "shallow_pb": 0.5, "micro_gap": 1.0, "wedge_exhaustion": 1.5,
    },
    "breakout_follow": {
        "multi_tf_align": 2.0, "micro_gap": 2.0, "gap_open": 1.5,
        "shallow_pb": 1.5, "new_hl_lh": 1.0, "ema_bounce": 1.0, "wedge_exhaustion": 0.5,
    },
    "tr_scalp": {
        "ema_bounce": 2.0, "new_hl_lh": 1.5, "multi_tf_align": 1.5,
        "gap_open": 1.0, "shallow_pb": 1.0, "micro_gap": 1.0, "wedge_exhaustion": 1.0,
    },
}
_DEFAULT_WEIGHT = 1.0


def _resolve_family(management_style: str) -> str:
    """从 management_style 推断 Brooks 管理家族。"""
    s = str(management_style or "").strip().lower()
    if s in ("brooks_swing", "brooks_t4_wedge_pullback"):
        return "trend_recovery"
    if s in ("brooks_mtr_reversal", "brooks_r3_channel_line_fade",
             "brooks_s1_htf_sr_reversal", "brooks_s2_micro_channel"):
        return "mtr_reversal"
    if s == "brooks_climax_reversal":
        return "climax_reversal"
    if s == "brooks_breakout":
        return "breakout_follow"
    if s in ("brooks_scalp", "brooks_tr_blshs", "brooks_tr4_daily_tr_fade"):
        return "tr_scalp"
    return ""


def strength_check(
    position: dict[str, Any],
    market_data: dict[str, Any],
    management_style: str = "",
) -> dict[str, Any]:
    """
    Strength Check - 7 项增强信号（P2: 按家族加权）

    数据来源：
    - gap_open: 从 ab_sr 读取
    - new_hl_lh: 从 ab_sr 读取
    - ema_bounce: 从 ab_ema 读取
    - micro_gap: 从 recent_bars 计算
    - shallow_pb: 从 recent_bars 计算
    - wedge_exhaustion: 从 ab_patterns 读取
    - multi_tf_align: 从多周期数据读取
    """
    side = get_position_attr(position, "side", "")
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0)
    entry_time = get_position_attr(position, "entry_time", "")

    ab_sr = market_data.get("ab_sr", {})
    ab_ema = market_data.get("ab_ema", {})
    ab_patterns = market_data.get("ab_patterns", {})
    recent_bars = market_data.get("recent_bars", [])
    current_price = safe_float(market_data.get("current_price"), 0)
    timeframes = market_data.get("timeframes", {})

    signals = {}

    gaps = ab_sr.get("gaps", [])
    gap_open = any(
        safe_float(gap.get("gap_size"), 0) > 0
        for gap in gaps
        if isinstance(gap, dict)
    )
    signals["gap_open"] = gap_open

    major_hl = safe_float(ab_sr.get("major_hl"), 0)
    major_lh = safe_float(ab_sr.get("major_lh"), 0)
    new_hl_lh = False
    if side == "BUY" and major_hl > entry_price:
        new_hl_lh = True
    elif side == "SELL" and major_lh < entry_price:
        new_hl_lh = True
    signals["new_hl_lh"] = new_hl_lh

    ema20 = safe_float(ab_ema.get("ema20"), 0)
    ema_distance = abs(current_price - ema20) / ema20 if ema20 else 1.0

    ema_bounce = False
    if ema_distance < 0.005 and len(recent_bars) >= 2:
        last_bar = recent_bars[-1]
        prev_bar = recent_bars[-2]
        if side == "BUY":
            ema_bounce = (
                safe_float(get_attr(prev_bar, "L"), 0) <= ema20
                and safe_float(get_attr(last_bar, "C"), 0) > ema20
            )
        else:
            ema_bounce = (
                safe_float(get_attr(prev_bar, "H"), 0) >= ema20
                and safe_float(get_attr(last_bar, "C"), 0) < ema20
            )
    signals["ema_bounce"] = ema_bounce

    micro_gap = False
    if len(recent_bars) >= 3:
        for index in range(len(recent_bars) - 2):
            bar_1 = recent_bars[index]
            bar_2 = recent_bars[index + 1]
            if side == "BUY":
                gap_size = safe_float(get_attr(bar_2, "L"), 0) - safe_float(get_attr(bar_1, "H"), 0)
                if gap_size > 0:
                    micro_gap = True
                    break
            else:
                gap_size = safe_float(get_attr(bar_1, "L"), 0) - safe_float(get_attr(bar_2, "H"), 0)
                if gap_size > 0:
                    micro_gap = True
                    break
    signals["micro_gap"] = micro_gap

    shallow_pb = False
    if len(recent_bars) >= 5:
        bars_after_entry = [bar for bar in recent_bars if get_attr(bar, "time", "") > entry_time]
        if bars_after_entry:
            highest = max(safe_float(get_attr(bar, "H"), 0) for bar in bars_after_entry)
            lowest = min(safe_float(get_attr(bar, "L"), 0) for bar in bars_after_entry)
            if side == "BUY" and highest > entry_price:
                pb_ratio = (highest - lowest) / (highest - entry_price)
                shallow_pb = pb_ratio < 0.5
            elif side == "SELL" and lowest < entry_price:
                pb_ratio = (highest - lowest) / (entry_price - lowest)
                shallow_pb = pb_ratio < 0.5
    signals["shallow_pb"] = shallow_pb

    patterns = ab_patterns.get("patterns", [])
    wedge_exhaustion = any(
        "wedge" in str(pattern.get("type", "")).lower()
        and str(pattern.get("status", "")).lower() == "exhaustion"
        for pattern in patterns
        if isinstance(pattern, dict)
    )
    signals["wedge_exhaustion"] = wedge_exhaustion

    multi_tf_align = False
    if timeframes:
        current_tf = str(get_position_attr(position, "timeframe", "") or "")
        higher_tf = str(get_position_attr(position, "higher_timeframe", "") or "")
        ordered_tfs = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]
        if not higher_tf and current_tf in ordered_tfs:
            current_index = ordered_tfs.index(current_tf)
            if current_index + 1 < len(ordered_tfs):
                higher_tf = ordered_tfs[current_index + 1]
        current_trend = str((timeframes.get(current_tf, {}) or {}).get("trend", "")).lower()
        higher_trend = str((timeframes.get(higher_tf, {}) or {}).get("trend", "")).lower()
        if side == "BUY":
            multi_tf_align = "bull" in current_trend and "bull" in higher_trend
        else:
            multi_tf_align = "bear" in current_trend and "bear" in higher_trend
    signals["multi_tf_align"] = multi_tf_align

    # P2: 按家族加权计算 strength_score
    if not management_style:
        management_style = str(get_position_attr(position, "management_style", "") or "")
    family = _resolve_family(management_style)
    weights = _FAMILY_WEIGHTS.get(family, {})

    weighted_score = 0.0
    max_possible = 0.0
    for key, active in signals.items():
        w = weights.get(key, _DEFAULT_WEIGHT)
        max_possible += w
        if active:
            weighted_score += w

    # 归一化到 0-7 范围以保持向后兼容（调用方用 score <= 1 判断弱化）
    if max_possible > 0:
        strength_score = round(weighted_score / max_possible * 7)
    else:
        strength_score = sum(1 for value in signals.values() if value)

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
        "weighted_score": round(weighted_score, 2),
        "signals": signals,
        "confidence": confidence,
        "recommendation": recommendation,
        "family": family,
    }
