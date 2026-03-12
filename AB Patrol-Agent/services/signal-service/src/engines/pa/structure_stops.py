"""按 Brooks 结构语义修正止损。"""

from __future__ import annotations

from trading.market.playbook_router import (
    CHANNEL_LINE_FADE_PLAYBOOK,
    DAILY_TR_FADE_PLAYBOOK,
    HTF_SR_REVERSAL_PLAYBOOK,
    MICRO_CHANNEL_REVERSAL_PLAYBOOK,
    WEDGE_PULLBACK_PLAYBOOK,
)

from .models import Candle, PASignal

TREND_PULLBACK_SIGNALS = {
    "高1",
    "低1",
    "高2",
    "低2",
    "20均线缺口",
    "MAG 20/20 Setup",
    "第一均线缺口",
    "突破回调",
}

CHANNEL_FIRST_PULLBACK_SIGNALS = {
    "高1",
    "低1",
}

CHANNEL_RECOVERY_SIGNALS = {
    "高2",
    "低2",
    "突破回调",
}

EMA_RECOVERY_SIGNALS = {
    "20均线缺口",
    "MAG 20/20 Setup",
    "第一均线缺口",
}

REVERSAL_SIGNALS = {
    "双重顶",
    "双重底",
    "楔形顶",
    "楔形底",
    "头肩顶MTR",
    "头肩底MTR",
    "末端旗形",
    "急速通道",
}

TR_FADE_SIGNALS = {
    "看衰突破",
    "急赴磁体",
    "第二腿陷阱",
}


def _buffer_size(reference_price: float, atr: float, atr_mult: float, price_mult: float, candles: list[Candle]) -> float:
    """根据 ATR、价格与最近 K 线波动生成缓冲。"""
    recent_range = 0.0
    if candles:
        recent_range = max(float(candle.high) - float(candle.low) for candle in candles[-3:])
    buffer_size = max(float(atr or 0.0) * atr_mult, abs(reference_price) * price_mult, recent_range * 0.08)
    if buffer_size <= 0:
        buffer_size = max(abs(reference_price) * 0.0002, 1e-9)
    return buffer_size


def build_trend_pullback_stop(
    direction: str,
    candles: list[Candle],
    signal_bar_high: float,
    signal_bar_low: float,
    atr: float = 0.0,
) -> float:
    """H1/H2/L1/L2 与趋势回调单的结构止损。"""
    recent = candles[-6:] if len(candles) >= 6 else candles
    reference_price = recent[-1].close if recent else 0.0
    buffer_size = _buffer_size(reference_price, atr, 0.18, 0.00028, recent)
    if direction == "BUY":
        anchor = min([signal_bar_low, *[bar.low for bar in recent if bar.low > 0]])
        return anchor - buffer_size
    anchor = max([signal_bar_high, *[bar.high for bar in recent if bar.high > 0]])
    return anchor + buffer_size


def build_channel_recovery_stop(
    direction: str,
    candles: list[Candle],
    signal_bar_high: float,
    signal_bar_low: float,
    atr: float = 0.0,
) -> float:
    """T6 Broad Channel / TR leg 恢复单的结构止损。"""
    recent = candles[-8:] if len(candles) >= 8 else candles
    reference_price = recent[-1].close if recent else 0.0
    buffer_size = _buffer_size(reference_price, atr, 0.22, 0.00032, recent)
    if direction == "BUY":
        anchor = min([signal_bar_low, *[bar.low for bar in recent if bar.low > 0]])
        return anchor - buffer_size
    anchor = max([signal_bar_high, *[bar.high for bar in recent if bar.high > 0]])
    return anchor + buffer_size


def build_reversal_structure_stop(
    direction: str,
    candles: list[Candle],
    signal_bar_high: float,
    signal_bar_low: float,
    atr: float = 0.0,
    reference_levels: list[float] | None = None,
) -> float:
    """R1/R2/R3 反转结构单的止损。"""
    recent = candles[-9:] if len(candles) >= 9 else candles
    levels = [float(level) for level in (reference_levels or []) if float(level) > 0]
    reference_price = recent[-1].close if recent else (levels[0] if levels else 0.0)
    buffer_size = _buffer_size(reference_price, atr, 0.25, 0.00038, recent)
    if direction == "BUY":
        anchor = min([signal_bar_low, *[bar.low for bar in recent if bar.low > 0], *levels])
        return anchor - buffer_size
    anchor = max([signal_bar_high, *[bar.high for bar in recent if bar.high > 0], *levels])
    return anchor + buffer_size


def build_tr_failed_breakout_stop(
    direction: str,
    candles: list[Candle],
    breakout_extreme: float,
    signal_bar_high: float,
    signal_bar_low: float,
    atr: float = 0.0,
) -> float:
    """TR2 Failed BO Fade 的止损。"""
    recent = candles[-5:] if len(candles) >= 5 else candles
    reference_price = recent[-1].close if recent else breakout_extreme
    buffer_size = _buffer_size(reference_price, atr, 0.18, 0.00030, recent)
    if direction == "BUY":
        anchor = min([signal_bar_low, breakout_extreme, *[bar.low for bar in recent if bar.low > 0]])
        return anchor - buffer_size
    anchor = max([signal_bar_high, breakout_extreme, *[bar.high for bar in recent if bar.high > 0]])
    return anchor + buffer_size


def build_tr_second_leg_trap_stop(
    direction: str,
    candles: list[Candle],
    second_leg_extreme: float,
    signal_bar_high: float,
    signal_bar_low: float,
    atr: float = 0.0,
) -> float:
    """TR3 Second Leg Trap 的止损。"""
    recent = candles[-6:] if len(candles) >= 6 else candles
    reference_price = recent[-1].close if recent else second_leg_extreme
    buffer_size = _buffer_size(reference_price, atr, 0.20, 0.00032, recent)
    if direction == "BUY":
        anchor = min([signal_bar_low, second_leg_extreme, *[bar.low for bar in recent if bar.low > 0]])
        return anchor - buffer_size
    anchor = max([signal_bar_high, second_leg_extreme, *[bar.high for bar in recent if bar.high > 0]])
    return anchor + buffer_size


def _signal_profile(signal_type: str) -> tuple[int, float, float, str]:
    """返回不同 playbook 的结构止损窗口与缓冲。"""
    if signal_type in TREND_PULLBACK_SIGNALS:
        return 5, 0.10, 0.00025, "trend_pullback"
    if signal_type in REVERSAL_SIGNALS:
        return 7, 0.14, 0.00035, "reversal"
    if signal_type in TR_FADE_SIGNALS:
        return 6, 0.12, 0.00030, "tr_fade"
    return 5, 0.10, 0.00025, "default"


def align_signal_stop_to_structure(signal: PASignal, candles: list[Candle], atr: float = 0.0) -> PASignal:
    """
    把信号止损放到更接近 Brooks 的结构位外。

    原则：
    - 趋势回调单：止损放到回调腿低点/高点外
    - 反转单：止损放到结构极值外
    - TR fade：止损放到失败突破极值外
    """
    if not candles:
        return signal

    signal_type = str(signal.signal_type or "")
    lookback, atr_mult, price_mult, family = _signal_profile(signal_type)
    recent = candles[-lookback:] if len(candles) >= lookback else candles
    last_bar = recent[-1]
    entry_price = float(signal.price or last_bar.close)
    buffer_size = max(float(atr or 0.0) * atr_mult, abs(entry_price) * price_mult)
    if buffer_size <= 0:
        buffer_size = max(abs(last_bar.high - last_bar.low) * 0.05, abs(entry_price) * 0.0002)

    signal_bar_high = float(signal.signal_bar_high or last_bar.high)
    signal_bar_low = float(signal.signal_bar_low or last_bar.low)
    current_stop = float(signal.stop_loss or 0.0)
    extra = dict(signal.extra or {})

    playbook_hint = str(extra.get("playbook_hint") or "")
    playbook_id = str(extra.get("playbook_id") or "")
    playbook_key = playbook_hint or playbook_id
    if playbook_hint == "TR2_FAILED_BO_FADE":
        signal.stop_loss = build_tr_failed_breakout_stop(
            str(signal.direction or ""),
            recent,
            float(extra.get("breakout_extreme") or 0.0)
            or (signal_bar_high if str(signal.direction or "") == "SELL" else signal_bar_low),
            signal_bar_high,
            signal_bar_low,
            atr,
        )
        extra["structure_stop_adjusted"] = True
        extra["structure_stop_family"] = "tr_failed_breakout"
        signal.extra = extra
        return signal
    if playbook_hint == "TR3_SECOND_LEG_TRAP":
        signal.stop_loss = build_tr_second_leg_trap_stop(
            str(signal.direction or ""),
            recent,
            float(extra.get("second_leg_extreme") or 0.0)
            or (signal_bar_high if str(signal.direction or "") == "SELL" else signal_bar_low),
            signal_bar_high,
            signal_bar_low,
            atr,
        )
        extra["structure_stop_adjusted"] = True
        extra["structure_stop_family"] = "tr_second_leg_trap"
        signal.extra = extra
        return signal

    if playbook_key in {
        "R0_FIRST_REVERSAL_PROBE",
        "R1_BROAD_CHANNEL_REVERSAL",
        "R2_TR_EDGE_REVERSAL",
        CHANNEL_LINE_FADE_PLAYBOOK,
        DAILY_TR_FADE_PLAYBOOK,
        HTF_SR_REVERSAL_PLAYBOOK,
        MICRO_CHANNEL_REVERSAL_PLAYBOOK,
        WEDGE_PULLBACK_PLAYBOOK,
    }:
        signal.stop_loss = build_reversal_structure_stop(
            str(signal.direction or ""),
            candles,
            signal_bar_high,
            signal_bar_low,
            atr,
        )
        extra["structure_stop_adjusted"] = True
        extra["structure_stop_family"] = "reversal"
        signal.extra = extra
        return signal

    if playbook_key in {
        "T6_TR_LEG_FIRST_PULLBACK",
        "T6_TR_LEG_CHANNEL_RECOVERY",
        "T6_TR_LEG_EMA_RECOVERY",
        "T2_BROAD_CHANNEL_RECOVERY",
        "T3_BROAD_CHANNEL_EMA",
    }:
        signal.stop_loss = build_channel_recovery_stop(
            str(signal.direction or ""),
            candles,
            signal_bar_high,
            signal_bar_low,
            atr,
        )
        extra["structure_stop_adjusted"] = True
        extra["structure_stop_family"] = "channel_recovery"
        signal.extra = extra
        return signal

    if playbook_key in {"T1_FIRST_PULLBACK", "T2_TREND_H2", "T3_TREND_EMA", "T5_BREAKOUT_CHASE"}:
        signal.stop_loss = build_trend_pullback_stop(
            str(signal.direction or ""),
            candles,
            signal_bar_high,
            signal_bar_low,
            atr,
        )
        extra["structure_stop_adjusted"] = True
        extra["structure_stop_family"] = "trend_pullback"
        signal.extra = extra
        return signal

    if str(signal.direction or "") == "BUY":
        structure_low = min([signal_bar_low, *[bar.low for bar in recent]])
        aligned_stop = structure_low - buffer_size
        if current_stop <= 0 or current_stop > aligned_stop:
            signal.stop_loss = aligned_stop
            extra["structure_stop_adjusted"] = True
            extra["structure_stop_anchor"] = structure_low
            extra["structure_stop_buffer"] = buffer_size
            extra["structure_stop_family"] = family
    elif str(signal.direction or "") == "SELL":
        structure_high = max([signal_bar_high, *[bar.high for bar in recent]])
        aligned_stop = structure_high + buffer_size
        if current_stop <= 0 or current_stop < aligned_stop:
            signal.stop_loss = aligned_stop
            extra["structure_stop_adjusted"] = True
            extra["structure_stop_anchor"] = structure_high
            extra["structure_stop_buffer"] = buffer_size
            extra["structure_stop_family"] = family

    signal.extra = extra
    return signal
