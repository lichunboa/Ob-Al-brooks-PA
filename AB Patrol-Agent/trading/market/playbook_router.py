"""Brooks playbook 路由与高级上下文判断。"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

WEDGE_PULLBACK_PLAYBOOK = "T4_WEDGE_PULLBACK"
CHANNEL_LINE_FADE_PLAYBOOK = "R3_CHANNEL_LINE_BO_FADE"
DAILY_TR_FADE_PLAYBOOK = "TR4_DAILY_TR_FADE"
HTF_SR_REVERSAL_PLAYBOOK = "S1_HTF_SR_REVERSAL"
MICRO_CHANNEL_REVERSAL_PLAYBOOK = "S2_MICRO_CHANNEL_REVERSAL"
PLAYBOOK_HINT_ROUTES = {
    WEDGE_PULLBACK_PLAYBOOK: ("trend", "STOP"),
    CHANNEL_LINE_FADE_PLAYBOOK: ("reversal", "STOP"),
    DAILY_TR_FADE_PLAYBOOK: ("tr", "STOP"),
    HTF_SR_REVERSAL_PLAYBOOK: ("special", "STOP"),
    MICRO_CHANNEL_REVERSAL_PLAYBOOK: ("special", "STOP"),
    "TR2_FAILED_BO_FADE": ("tr", "STOP"),
    "TR3_SECOND_LEG_TRAP": ("tr", "STOP"),
}

CHANNEL_FIRST_PULLBACK_SIGNALS = {"高1", "低1"}
CHANNEL_RECOVERY_SIGNALS = {"高2", "低2", "突破回调"}
EMA_RECOVERY_SIGNALS = {"20均线缺口", "MAG 20/20 Setup", "第一均线缺口"}
BREAKOUT_CHASE_SIGNALS = {"收线追进", "ii突破", "ioi突破", "iii突破", "HOY突破", "LOY突破"}
BROOKS_REVERSAL_SIGNALS = {
    "双重顶",
    "双重底",
    "楔形顶",
    "楔形底",
    "头肩顶MTR",
    "头肩底MTR",
    "急速通道",
    "末端旗形",
    "看衰突破",
    "第二腿陷阱",
}
LONG_REVERSAL_SIGNALS = {"高1", "高2", "双重底", "楔形底", "头肩底MTR"}
SHORT_REVERSAL_SIGNALS = {"低1", "低2", "双重顶", "楔形顶", "头肩顶MTR"}
TREND_MARKETS = {"strong_trend_bull", "strong_trend_bear", "weak_trend_bull", "weak_trend_bear"}
RANGE_MARKETS = {"tight_range", "broad_range"}
_TIMEFRAME_MINUTES = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440}


def _safe_float(value: Any) -> float:
    """把上下文值安全转成浮点数。"""
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _get_candle_attr(candle: Any, name: str, default: float = 0.0) -> float:
    """兼容对象/字典两种 K 线表示。"""
    if isinstance(candle, dict):
        return _safe_float(candle.get(name, default))
    return _safe_float(getattr(candle, name, default))


def _get_candle_time(candle: Any) -> datetime | None:
    """读取 K 线时间戳。"""
    if isinstance(candle, dict):
        value = candle.get("timestamp") or candle.get("time")
    else:
        value = getattr(candle, "timestamp", None) or getattr(candle, "time", None)
    return value if isinstance(value, datetime) else None


def _body_ratio(candle: Any) -> float:
    """计算实体占整根 K 线的比例。"""
    high = _get_candle_attr(candle, "high") or _get_candle_attr(candle, "H")
    low = _get_candle_attr(candle, "low") or _get_candle_attr(candle, "L")
    open_price = _get_candle_attr(candle, "open") or _get_candle_attr(candle, "O")
    close_price = _get_candle_attr(candle, "close") or _get_candle_attr(candle, "C")
    bar_range = high - low
    if bar_range <= 0:
        return 0.0
    return abs(close_price - open_price) / bar_range


def _close_position(candle: Any) -> float:
    """计算收盘在整根 K 线中的位置。"""
    high = _get_candle_attr(candle, "high") or _get_candle_attr(candle, "H")
    low = _get_candle_attr(candle, "low") or _get_candle_attr(candle, "L")
    close_price = _get_candle_attr(candle, "close") or _get_candle_attr(candle, "C")
    bar_range = high - low
    if bar_range <= 0:
        return 0.5
    return max(0.0, min(1.0, (close_price - low) / bar_range))


def _overlap_ratio(candles: list[Any]) -> float:
    """用最近几根 K 线粗略判断是否偏震荡。"""
    if len(candles) < 2:
        return 0.5
    overlaps = 0.0
    total = 0
    for index in range(1, len(candles)):
        prev_high = _get_candle_attr(candles[index - 1], "high") or _get_candle_attr(candles[index - 1], "H")
        prev_low = _get_candle_attr(candles[index - 1], "low") or _get_candle_attr(candles[index - 1], "L")
        curr_high = _get_candle_attr(candles[index], "high") or _get_candle_attr(candles[index], "H")
        curr_low = _get_candle_attr(candles[index], "low") or _get_candle_attr(candles[index], "L")
        union = max(prev_high, curr_high) - min(prev_low, curr_low)
        if union <= 0:
            continue
        total += 1
        overlap_hi = min(prev_high, curr_high)
        overlap_lo = max(prev_low, curr_low)
        overlaps += max(0.0, overlap_hi - overlap_lo) / union
    return overlaps / total if total else 0.5


def _to_beijing_day(ts: datetime | None) -> datetime | None:
    """把时间统一到北京时间日界。"""
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=datetime.UTC)
    beijing = timezone(timedelta(hours=8))
    return ts.astimezone(beijing).replace(hour=0, minute=0, second=0, microsecond=0)


def _session_bar_index(ts: datetime | None, timeframe: str) -> int:
    """计算信号位于当日第几根同周期 K 线。"""
    minutes = _TIMEFRAME_MINUTES.get(str(timeframe or ""), 0)
    if minutes <= 0 or ts is None:
        return -1
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=datetime.UTC)
    beijing = timezone(timedelta(hours=8))
    local_ts = ts.astimezone(beijing)
    day_start = local_ts.replace(hour=0, minute=0, second=0, microsecond=0)
    delta_minutes = int((local_ts - day_start).total_seconds() // 60)
    return max(0, delta_minutes // minutes)


def _infer_signal_direction(signal_type: str) -> str:
    """在缺少方向字段时，从信号名推一个默认方向。"""
    label = str(signal_type or "")
    if label in {"高1", "高2", "双重底", "楔形底", "头肩底MTR", "HOY突破"}:
        return "BUY"
    if label in {"低1", "低2", "双重顶", "楔形顶", "头肩顶MTR", "LOY突破"}:
        return "SELL"
    return ""


def build_daily_playbook_context(
    daily_candles: list[Any],
    current_price: float,
    signal_time: datetime | None,
    timeframe: str,
) -> dict[str, Any]:
    """从日线背景提取 TR4 / S2 这类特殊 playbook 的触发上下文。"""
    if len(daily_candles) < 3:
        return {}

    signal_day = _to_beijing_day(signal_time)
    closed_daily = []
    for candle in daily_candles:
        candle_day = _to_beijing_day(_get_candle_time(candle))
        if signal_day is None or candle_day is None or candle_day < signal_day:
            closed_daily.append(candle)

    if len(closed_daily) < 3 and len(daily_candles) >= 2:
        closed_daily = daily_candles[:-1]
    if len(closed_daily) < 3:
        return {}

    recent = closed_daily[-5:] if len(closed_daily) >= 5 else closed_daily
    last_closed = closed_daily[-1]
    prior_closed = closed_daily[-2]
    ranges = [
        (_get_candle_attr(candle, "high") or _get_candle_attr(candle, "H"))
        - (_get_candle_attr(candle, "low") or _get_candle_attr(candle, "L"))
        for candle in recent
    ]
    avg_range = sum(value for value in ranges if value > 0) / max(1, sum(1 for value in ranges if value > 0))
    total_range = max(_get_candle_attr(candle, "high") or _get_candle_attr(candle, "H") for candle in recent) - min(
        _get_candle_attr(candle, "low") or _get_candle_attr(candle, "L") for candle in recent
    )
    net_move = abs(
        (_get_candle_attr(recent[-1], "close") or _get_candle_attr(recent[-1], "C"))
        - (_get_candle_attr(recent[0], "open") or _get_candle_attr(recent[0], "O"))
    )
    daily_range_like = (
        avg_range > 0
        and total_range > 0
        and _overlap_ratio(recent) >= 0.38
        and net_move <= total_range * 0.55
        and total_range <= avg_range * 6.5
    )

    last_range = (_get_candle_attr(last_closed, "high") or _get_candle_attr(last_closed, "H")) - (
        _get_candle_attr(last_closed, "low") or _get_candle_attr(last_closed, "L")
    )
    last_body_ratio = _body_ratio(last_closed)
    last_close_pos = _close_position(last_closed)
    daily_tr_fade_bias = ""
    if daily_range_like and avg_range > 0 and last_range >= avg_range * 1.10 and last_body_ratio >= 0.55:
        if last_close_pos >= 0.75:
            daily_tr_fade_bias = "SELL"
        elif last_close_pos <= 0.25:
            daily_tr_fade_bias = "BUY"

    recent_for_micro = closed_daily[-4:] if len(closed_daily) >= 4 else closed_daily
    bull_micro = all(
        (_get_candle_attr(recent_for_micro[index], "low") or _get_candle_attr(recent_for_micro[index], "L"))
        >= (_get_candle_attr(recent_for_micro[index - 1], "low") or _get_candle_attr(recent_for_micro[index - 1], "L"))
        for index in range(1, len(recent_for_micro))
    )
    bear_micro = all(
        (_get_candle_attr(recent_for_micro[index], "high") or _get_candle_attr(recent_for_micro[index], "H"))
        <= (_get_candle_attr(recent_for_micro[index - 1], "high") or _get_candle_attr(recent_for_micro[index - 1], "H"))
        for index in range(1, len(recent_for_micro))
    )

    prior_high = _get_candle_attr(prior_closed, "high") or _get_candle_attr(prior_closed, "H")
    prior_low = _get_candle_attr(prior_closed, "low") or _get_candle_attr(prior_closed, "L")
    daily_micro_channel_bias = ""
    if bull_micro and current_price < prior_low:
        daily_micro_channel_bias = "BUY"
    elif bear_micro and current_price > prior_high:
        daily_micro_channel_bias = "SELL"

    return {
        "daily_range_like": daily_range_like,
        "daily_tr_fade_bias": daily_tr_fade_bias,
        "daily_micro_channel_bias": daily_micro_channel_bias,
        "daily_micro_channel_side": "bull" if bull_micro else ("bear" if bear_micro else ""),
        "daily_prev_high": prior_high,
        "daily_prev_low": prior_low,
        "session_bar_index": _session_bar_index(signal_time, timeframe),
    }


def infer_htf_sr_bias(
    current_price: float,
    support_levels: list[float] | None = None,
    resistance_levels: list[float] | None = None,
    *,
    threshold_ratio: float = 0.004,
) -> str:
    """根据更高周期关键位，判断当前更偏向哪一侧反转。"""
    price = _safe_float(current_price)
    if price <= 0:
        return ""

    supports = sorted({_safe_float(level) for level in (support_levels or []) if 0 < _safe_float(level) <= price})
    resistances = sorted({_safe_float(level) for level in (resistance_levels or []) if _safe_float(level) >= price})
    nearest_support = supports[-1] if supports else 0.0
    nearest_resistance = resistances[0] if resistances else 0.0

    support_distance = (price - nearest_support) / price if nearest_support > 0 else 99.0
    resistance_distance = (nearest_resistance - price) / price if nearest_resistance > 0 else 99.0

    if nearest_support > 0 and support_distance <= threshold_ratio and support_distance <= resistance_distance:
        return "BUY"
    if nearest_resistance > 0 and resistance_distance <= threshold_ratio and resistance_distance < support_distance:
        return "SELL"
    return ""


def _is_wedge_pullback(signal_type: str, market_key: str, direction: str) -> bool:
    """顺势楔形回调只在趋势环境下成立。"""
    if signal_type == "楔形底" and direction == "BUY" and market_key in {"strong_trend_bull", "weak_trend_bull"}:
        return True
    if signal_type == "楔形顶" and direction == "SELL" and market_key in {"strong_trend_bear", "weak_trend_bear"}:
        return True
    return False


def _is_channel_line_bo_fade(signal_type: str, market_key: str) -> bool:
    """通道线末端突破失败，优先归到 R3。"""
    return signal_type in {"急速通道", "末端旗形"} and market_key in TREND_MARKETS


def _is_daily_tr_fade(signal_type: str, direction: str, timeframe: str, extra: dict[str, Any]) -> bool:
    """Daily TR fade 目前只接受早盘的 H1/H2/L1/L2 类确认。"""
    if str(timeframe or "") != "5m":
        return False
    if int(extra.get("session_bar_index", -1) or -1) > 12:
        return False
    if str(extra.get("daily_tr_fade_bias", "") or "").upper() != direction:
        return False
    if direction == "BUY":
        return signal_type in {"高1", "高2", "双重底", "楔形底", "头肩底MTR"}
    return signal_type in {"低1", "低2", "双重顶", "楔形顶", "头肩顶MTR"}


def _is_htf_sr_reversal(signal_type: str, direction: str, extra: dict[str, Any]) -> bool:
    """高级别关键位上的 5m/15m 反转。"""
    if str(extra.get("htf_sr_bias", "") or "").upper() != direction:
        return False
    if direction == "BUY":
        return signal_type in LONG_REVERSAL_SIGNALS | {"双重底", "楔形底", "头肩底MTR"}
    return signal_type in SHORT_REVERSAL_SIGNALS | {"双重顶", "楔形顶", "头肩顶MTR"}


def _is_micro_channel_reversal(signal_type: str, direction: str, extra: dict[str, Any]) -> bool:
    """微通道第一次破坏后的反转试探。"""
    if str(extra.get("daily_micro_channel_bias", "") or "").upper() != direction:
        return False
    if direction == "BUY":
        return signal_type in LONG_REVERSAL_SIGNALS | {"双重底", "楔形底", "头肩底MTR"}
    return signal_type in SHORT_REVERSAL_SIGNALS | {"双重顶", "楔形顶", "头肩顶MTR"}


def resolve_playbook_context(
    signal_type: str,
    market_key: str,
    *,
    higher_key: str = "",
    direction: str = "",
    entry_type: str = "STOP",
    extra: dict[str, Any] | None = None,
) -> tuple[str, str, str]:
    """统一 live / backtest 的 Brooks playbook 路由。"""
    label = str(signal_type or "")
    route_market = str(market_key or "")
    route_higher = str(higher_key or "")
    order_type = str(entry_type or "STOP").upper()
    route_extra = dict(extra or {})
    route_direction = str(direction or _infer_signal_direction(label) or "").upper()
    route_timeframe = str(route_extra.get("signal_timeframe") or route_extra.get("timeframe") or "5m")
    playbook_hint = str(route_extra.get("playbook_hint") or "").strip()

    if playbook_hint in PLAYBOOK_HINT_ROUTES:
        playbook_family, order_bias = PLAYBOOK_HINT_ROUTES[playbook_hint]
        return playbook_hint, playbook_family, order_bias

    if _is_daily_tr_fade(label, route_direction, route_timeframe, route_extra):
        return DAILY_TR_FADE_PLAYBOOK, "tr", "STOP"

    if _is_micro_channel_reversal(label, route_direction, route_extra):
        return MICRO_CHANNEL_REVERSAL_PLAYBOOK, "special", "STOP"

    if _is_htf_sr_reversal(label, route_direction, route_extra):
        return HTF_SR_REVERSAL_PLAYBOOK, "special", "STOP"

    if route_market == "tight_range":
        if label == "第二腿陷阱" or str(route_extra.get("playbook_hint") or "") == "TR3_SECOND_LEG_TRAP":
            return "TR3_SECOND_LEG_TRAP", "tr", "STOP"
        if label == "看衰突破" or bool(route_extra.get("failed_breakout_evidence", False)):
            return "TR2_FAILED_BO_FADE", "tr", "STOP"
        if str(route_extra.get("prior_leg_context") or "") == "tr_second_leg":
            return "TR3_SECOND_LEG_TRAP", "tr", "STOP"
        return "TR1_BLSHS", "tr", "LIMIT"

    if route_market == "broad_range":
        if label == "第二腿陷阱" or str(route_extra.get("playbook_hint") or "") == "TR3_SECOND_LEG_TRAP":
            return "TR3_SECOND_LEG_TRAP", "tr", "STOP"
        if label == "看衰突破" or bool(route_extra.get("failed_breakout_evidence", False)):
            return "TR2_FAILED_BO_FADE", "tr", "STOP"
        if str(route_extra.get("prior_leg_context") or "") == "tr_second_leg":
            return "TR3_SECOND_LEG_TRAP", "tr", "STOP"
        if label in BROOKS_REVERSAL_SIGNALS:
            if route_higher in RANGE_MARKETS:
                return "R2_TR_EDGE_REVERSAL", "reversal", "LIMIT"
            return "R1_BROAD_CHANNEL_REVERSAL", "reversal", "LIMIT"
        if label in CHANNEL_FIRST_PULLBACK_SIGNALS | CHANNEL_RECOVERY_SIGNALS:
            if route_higher in RANGE_MARKETS:
                return "T6_TR_LEG_CHANNEL_RECOVERY", "channel", "LIMIT" if order_type == "LIMIT" else "STOP"
            return "T2_BROAD_CHANNEL_RECOVERY", "channel", "STOP"
        if label in EMA_RECOVERY_SIGNALS:
            if route_higher in RANGE_MARKETS:
                return "T6_TR_LEG_EMA_RECOVERY", "channel", "LIMIT" if order_type == "LIMIT" else "STOP"
            return "T3_BROAD_CHANNEL_EMA", "channel", "STOP"
        if label in BREAKOUT_CHASE_SIGNALS:
            return "T5_BREAKOUT_CHASE", "breakout", "STOP"
        return "UNCLASSIFIED", "other", order_type

    if _is_channel_line_bo_fade(label, route_market):
        return CHANNEL_LINE_FADE_PLAYBOOK, "reversal", "STOP"

    if _is_wedge_pullback(label, route_market, route_direction):
        return WEDGE_PULLBACK_PLAYBOOK, "trend", "STOP"

    if label in BROOKS_REVERSAL_SIGNALS:
        if route_higher in RANGE_MARKETS:
            return "R2_TR_EDGE_REVERSAL", "reversal", "LIMIT"
        if route_market in {"weak_trend_bull", "weak_trend_bear"}:
            return "R1_BROAD_CHANNEL_REVERSAL", "reversal", "LIMIT"
        return "R0_FIRST_REVERSAL_PROBE", "reversal", "STOP"

    if label in CHANNEL_FIRST_PULLBACK_SIGNALS:
        if route_higher in RANGE_MARKETS:
            return "T6_TR_LEG_FIRST_PULLBACK", "channel", "LIMIT" if order_type == "LIMIT" else "STOP"
        return "T1_FIRST_PULLBACK", "trend", "STOP"

    if label in CHANNEL_RECOVERY_SIGNALS:
        if route_higher in RANGE_MARKETS:
            return "T6_TR_LEG_CHANNEL_RECOVERY", "channel", "LIMIT" if order_type == "LIMIT" else "STOP"
        if route_market in {"weak_trend_bull", "weak_trend_bear"}:
            return "T2_BROAD_CHANNEL_RECOVERY", "channel", "STOP"
        return "T2_TREND_H2", "trend", "STOP"

    if label in EMA_RECOVERY_SIGNALS:
        if route_higher in RANGE_MARKETS:
            return "T6_TR_LEG_EMA_RECOVERY", "channel", "LIMIT" if order_type == "LIMIT" else "STOP"
        if route_market in {"weak_trend_bull", "weak_trend_bear"}:
            return "T3_BROAD_CHANNEL_EMA", "channel", "STOP"
        return "T3_TREND_EMA", "trend", "STOP"

    if label in BREAKOUT_CHASE_SIGNALS:
        return "T5_BREAKOUT_CHASE", "breakout", "STOP"

    return "UNCLASSIFIED", "other", order_type


__all__ = [
    "BREAKOUT_CHASE_SIGNALS",
    "BROOKS_REVERSAL_SIGNALS",
    "CHANNEL_FIRST_PULLBACK_SIGNALS",
    "CHANNEL_LINE_FADE_PLAYBOOK",
    "CHANNEL_RECOVERY_SIGNALS",
    "DAILY_TR_FADE_PLAYBOOK",
    "EMA_RECOVERY_SIGNALS",
    "HTF_SR_REVERSAL_PLAYBOOK",
    "MICRO_CHANNEL_REVERSAL_PLAYBOOK",
    "WEDGE_PULLBACK_PLAYBOOK",
    "build_daily_playbook_context",
    "infer_htf_sr_bias",
    "resolve_playbook_context",
]
