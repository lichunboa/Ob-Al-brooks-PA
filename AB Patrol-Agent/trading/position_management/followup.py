"""S7 的 add-on / re-entry 共享计划生成。"""

from __future__ import annotations

from typing import Any

from trading.utils.parsing import safe_float

from .common import get_position_attr

FOLLOWUP_CONTINUATION_SIGNALS = {
    "高1",
    "低1",
    "高2",
    "低2",
    "20均线缺口",
    "MAG 20/20 Setup",
    "第一均线缺口",
    "突破回调",
    "ii突破",
    "ioi突破",
    "iii突破",
    "HOY突破",
    "LOY突破",
    "楔形底",
    "楔形顶",
}
FOLLOWUP_CONTINUATION_FAMILIES = {"trend", "channel", "breakout"}


def _normalize_direction(direction: Any) -> str:
    """统一方向字段。"""
    return str(direction or "").strip().upper()


def _estimate_used_risk(position: Any) -> float:
    """按 S7 的 0.3 / 0.3 / 0.4 梯度估算已占用风险。"""
    explicit = safe_float(get_position_attr(position, "risk_percent"), 0.0)
    if explicit > 0:
        return min(explicit, 1.0)
    scale_legs = max(1, int(get_position_attr(position, "scale_legs", 1) or 1))
    if scale_legs >= 3:
        return 1.0
    if scale_legs == 2:
        return 0.6
    return 0.3


def _timeframe_price(snapshot: dict[str, Any], market_data: dict[str, Any]) -> float:
    """从多周期缓存里提取最近价格。"""
    for source in (snapshot, market_data):
        timeframes = source.get("timeframes") if isinstance(source.get("timeframes"), dict) else {}
        for timeframe in ("5m", "15m", "1h"):
            tf_data = timeframes.get(timeframe)
            if isinstance(tf_data, dict):
                for key in ("last_close", "close", "current_price"):
                    price = safe_float(tf_data.get(key), 0.0)
                    if price > 0:
                        return price
    return 0.0


def _resolve_current_price(position: Any, market_data: dict[str, Any], snapshot: dict[str, Any]) -> float:
    """按优先级解析当前价格。"""
    for source in (snapshot, market_data):
        if isinstance(source, dict):
            price = safe_float(source.get("current_price"), 0.0)
            if price > 0:
                return price
    for key in ("current_price", "mark_price", "last_price"):
        price = safe_float(get_position_attr(position, key), 0.0)
        if price > 0:
            return price
    return _timeframe_price(snapshot, market_data)


def _resolve_snapshot(position: Any, market_data: dict[str, Any]) -> dict[str, Any]:
    """从运行态缓存中读取当前品种快照。"""
    if not isinstance(market_data, dict):
        return {}
    symbols = market_data.get("symbols") if isinstance(market_data.get("symbols"), dict) else {}
    symbol = str(get_position_attr(position, "symbol", "") or "")
    snapshot = symbols.get(symbol)
    return snapshot if isinstance(snapshot, dict) else {}


def _resolve_structure_stop(
    side: str,
    current_price: float,
    snapshot: dict[str, Any],
    market_data: dict[str, Any],
    fallback: float,
) -> float:
    """优先使用新的 Major HL/LH 作为 follow-up 止损。"""
    ab_sr = snapshot.get("ab_sr") if isinstance(snapshot.get("ab_sr"), dict) else {}
    if not ab_sr and isinstance(market_data.get("ab_sr"), dict):
        ab_sr = market_data.get("ab_sr") or {}

    key_levels = snapshot.get("key_levels") if isinstance(snapshot.get("key_levels"), dict) else {}
    if not key_levels and isinstance(market_data.get("key_levels"), dict):
        key_levels = market_data.get("key_levels") or {}

    if side == "BUY":
        candidates = [
            safe_float(ab_sr.get("major_hl"), 0.0),
            safe_float(ab_sr.get("nearest_support"), 0.0),
            safe_float(key_levels.get("nearest_support"), 0.0),
        ]
        valid = [value for value in candidates if 0 < value < current_price]
        if valid:
            return max(valid)
    else:
        candidates = [
            safe_float(ab_sr.get("major_lh"), 0.0),
            safe_float(ab_sr.get("nearest_resistance"), 0.0),
            safe_float(key_levels.get("nearest_resistance"), 0.0),
        ]
        valid = [value for value in candidates if value > current_price]
        if valid:
            return min(valid)
    return fallback


def _protective_target(side: str, entry_price: float, stop_loss: float, fallback: float) -> float:
    """给 follow-up 新单生成一个最小 2.2R 的保护目标。"""
    risk = abs(entry_price - stop_loss)
    if risk <= 0:
        return fallback
    projected = entry_price + risk * 2.2 if side == "BUY" else entry_price - risk * 2.2
    if fallback > 0:
        if side == "BUY":
            return max(projected, fallback)
        return min(projected, fallback)
    return projected


def _protected_after_scale_in(trade: Any) -> bool:
    """判断旧仓位是否已经至少保护到保本。"""
    direction = _normalize_direction(getattr(trade, "direction", ""))
    entry_price = safe_float(getattr(trade, "entry_price", 0.0), 0.0)
    stop_loss = safe_float(getattr(trade, "stop_loss", 0.0), 0.0)
    if direction == "BUY":
        return stop_loss >= entry_price
    if direction == "SELL":
        return stop_loss <= entry_price
    return False


def _trade_open_r(trade: Any, mark_price: float) -> float:
    """按初始风险计算旧仓位已走出的有利 R。"""
    initial_risk = safe_float(getattr(trade, "initial_risk", 0.0), 0.0)
    if initial_risk <= 0:
        entry_price = safe_float(getattr(trade, "entry_price", 0.0), 0.0)
        stop_loss = safe_float(getattr(trade, "stop_loss", 0.0), 0.0)
        initial_risk = abs(entry_price - stop_loss)
    if initial_risk <= 0:
        return 0.0
    direction = _normalize_direction(getattr(trade, "direction", ""))
    entry_price = safe_float(getattr(trade, "entry_price", 0.0), 0.0)
    if direction == "BUY":
        return (mark_price - entry_price) / initial_risk
    return (entry_price - mark_price) / initial_risk


def _followup_reasons(signals: dict[str, Any]) -> list[str]:
    """把增强证据压成可读原因。"""
    mapping = {
        "multi_tf_align": "多周期同向",
        "new_hl_lh": "新 Major HL/LH",
        "ema_bounce": "EMA 反弹确认",
        "shallow_pb": "浅回调",
        "micro_gap": "micro gap 保持",
        "gap_open": "gap 仍未关闭",
    }
    return [label for key, label in mapping.items() if bool(signals.get(key))]


def _append_signal_note(signal: Any, note: str) -> None:
    """兼容 PASignal / SignalEvent 两种消息字段。"""
    if hasattr(signal, "message"):
        signal.message = f"{getattr(signal, 'message', '')} | {note}".strip(" |")
        return
    message_params = getattr(signal, "message_params", None)
    if isinstance(message_params, dict):
        notes = message_params.get("notes")
        if isinstance(notes, list):
            notes.append(note)
        elif isinstance(notes, str) and notes.strip():
            message_params["notes"] = [notes, note]
        else:
            message_params["notes"] = [note]
        signal.message_params = message_params


def build_followup_open_plan(
    position: Any,
    market_data: dict[str, Any],
    *,
    premise_valid: bool,
    confidence: str,
    strength_signals: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """为 live 持仓管理自动生成 winner scaling 计划。"""
    if not premise_valid or str(confidence or "") not in {"高", "中"}:
        return {}

    symbol = str(get_position_attr(position, "symbol", "") or "")
    side = _normalize_direction(get_position_attr(position, "side", ""))
    if not symbol or side not in {"BUY", "SELL"}:
        return {}

    snapshot = _resolve_snapshot(position, market_data)
    current_price = _resolve_current_price(position, market_data, snapshot)
    entry_price = safe_float(get_position_attr(position, "entry_price"), 0.0)
    stop_loss = safe_float(
        get_position_attr(position, "current_sl")
        or get_position_attr(position, "stop_loss")
        or get_position_attr(position, "initial_stop_loss"),
        0.0,
    )
    take_profit = safe_float(
        get_position_attr(position, "take_profit") or get_position_attr(position, "tp1"),
        0.0,
    )
    if current_price <= 0 or entry_price <= 0 or stop_loss <= 0:
        return {}

    initial_risk = safe_float(get_position_attr(position, "initial_risk"), 0.0)
    if initial_risk <= 0:
        initial_risk = abs(entry_price - stop_loss)
    if initial_risk <= 0:
        return {}

    if side == "BUY":
        open_r = (current_price - entry_price) / initial_risk
    else:
        open_r = (entry_price - current_price) / initial_risk
    if open_r < 0.25:
        return {}

    signals = dict(strength_signals or {})
    if not bool(signals.get("multi_tf_align")):
        return {}

    scale_legs = max(1, int(get_position_attr(position, "scale_legs", 1) or 1))
    used_risk = _estimate_used_risk(position)
    remaining_risk = max(0.0, 1.0 - used_risk)
    if remaining_risk <= 0:
        return {}

    reason_tokens = _followup_reasons(signals)
    if not any(bool(signals.get(key)) for key in ("ema_bounce", "new_hl_lh", "shallow_pb")):
        return {}

    intent = ""
    requested_risk = 0.0
    if scale_legs == 1 and open_r >= 0.25:
        intent = "ADD_ON"
        requested_risk = 0.3
    elif scale_legs == 2 and open_r >= 0.9 and bool(signals.get("new_hl_lh")):
        intent = "PYRAMID_ADD"
        requested_risk = 0.4
    else:
        return {}

    risk_percent = min(requested_risk, remaining_risk)
    if risk_percent <= 0:
        return {}

    structural_stop = _resolve_structure_stop(side, current_price, snapshot, market_data, stop_loss)
    if side == "BUY" and not (0 < structural_stop < current_price):
        return {}
    if side == "SELL" and not (structural_stop > current_price):
        return {}

    target = _protective_target(side, current_price, structural_stop, take_profit)
    if side == "BUY" and target <= current_price:
        return {}
    if side == "SELL" and target >= current_price:
        return {}

    reasons = " + ".join(reason_tokens) if reason_tokens else "趋势延伸"
    return {
        "intent": intent,
        "symbol": symbol,
        "side": side,
        "entry_price": current_price,
        "stop_loss": structural_stop,
        "take_profit": target,
        "risk_percent": risk_percent,
        "order_type": "MARKET",
        "style": str(get_position_attr(position, "style", "Swing") or "Swing"),
        "strategy": str(get_position_attr(position, "playbook_id", "") or ""),
        "allow_executable": True,
        "executable": True,
        "followup_profile": "winner_scaling",
        "reason": f"S7 加仓：{reasons}，按 {intent} 扩展盈利仓位",
    }


def annotate_followup_signal(
    signal: Any,
    *,
    existing_trade: Any | None = None,
    reentry_context: dict[str, Any] | None = None,
) -> bool:
    """为回测事件补上 add-on / re-entry 的统一 follow-up 意图。"""
    extra = dict(getattr(signal, "extra", {}) or {})
    if str(extra.get("intent") or getattr(signal, "intent", "") or "").strip():
        return False

    if isinstance(reentry_context, dict) and reentry_context:
        extra["reentry_candidate"] = True
        extra["reentry_attempt"] = int(reentry_context.get("next_attempt", 1) or 1)
        extra["followup_profile"] = "reentry_after_stop"
        extra["intent"] = "REENTRY"
        extra["risk_percent"] = 0.3
        signal.extra = extra
        signal.intent = "REENTRY"
        signal.risk_percent = 0.3
        _append_signal_note(signal, "S7 重入：方向与前提族未变")
        return True

    if existing_trade is None:
        return False

    if _normalize_direction(getattr(existing_trade, "direction", "")) != _normalize_direction(
        getattr(signal, "direction", "")
    ):
        return False

    playbook_family = str(extra.get("playbook_family") or getattr(existing_trade, "playbook_family", "") or "")
    if playbook_family and playbook_family not in FOLLOWUP_CONTINUATION_FAMILIES:
        return False

    scale_legs = max(1, int(getattr(existing_trade, "scale_legs", 1) or 1))
    if scale_legs >= 3:
        return False

    mark_price = safe_float(getattr(signal, "price", 0.0), 0.0)
    if mark_price <= 0:
        mark_price = safe_float(getattr(existing_trade, "best_price", 0.0), 0.0)
    if mark_price <= 0:
        return False

    open_r = _trade_open_r(existing_trade, mark_price)
    structure_ok = bool(extra.get("stop_structure_ok", True))
    confirmation = any(
        bool(extra.get(key))
        for key in ("follow_through", "higher_follow_through", "acceptance_ready", "executable_signal_ready")
    )
    signal_type = str(getattr(signal, "signal_type", "") or "")
    trigger_ok = signal_type in FOLLOWUP_CONTINUATION_SIGNALS or confirmation
    if not structure_ok or not trigger_ok:
        return False

    intent = ""
    risk_percent = 0.0
    if scale_legs == 1 and open_r >= 0.25:
        intent = "ADD_ON"
        risk_percent = 0.3
    elif scale_legs == 2 and open_r >= 0.9 and _protected_after_scale_in(existing_trade):
        intent = "PYRAMID_ADD"
        risk_percent = 0.4
    else:
        return False

    extra["followup_profile"] = "winner_scaling"
    extra["intent"] = intent
    extra["risk_percent"] = risk_percent
    signal.extra = extra
    signal.intent = intent
    signal.risk_percent = risk_percent
    _append_signal_note(signal, "S7 加仓：盈利仓位 follow-up 确认")
    return True


__all__ = [
    "annotate_followup_signal",
    "build_followup_open_plan",
]
