"""实盘链共享执行意图构建器。"""

from __future__ import annotations

import re
from typing import Any

from .market.playbook_router import resolve_playbook_context
from .utils import (
    build_execution_semantics,
    derive_trade_execution_semantics,
    first_float,
    normalize_action_payload,
    normalize_refs,
    normalize_trade_side,
    safe_float,
)

_TARGET_FIELDS = (
    "first_target",
    "first_target_type",
    "rescue_target",
    "rescue_target_type",
    "close_test_target",
    "close_test_target_type",
    "swing_target",
    "swing_target_type",
    "effective_target",
    "effective_target_type",
    "stretch_target",
    "stretch_target_type",
    "target_buffer",
    "runner_handoff_stop",
    "runner_handoff_stop_type",
)

_SETUP_BOOL_FIELDS = (
    "setup_valid",
    "setup_clear_trend_leg",
    "setup_first_pullback_shape",
)

_SETUP_FLOAT_FIELDS = (
    "setup_pullback_depth_ratio",
    "setup_pullback_overlap_ratio",
)

_HL_SIGNAL_PRICE_RE = re.compile(
    r"(?<![A-Z0-9])(H1|H2|L1|L2|高1|高2|低1|低2)\s*@\s*(-?\d+(?:\.\d+)?)",
    re.IGNORECASE,
)


def _resolve_management_style(*args: Any, **kwargs: Any) -> str:
    """延迟导入回测侧管理模板分类，避免 trading <-> backtest 循环导入。"""
    from libs.backtest.strategy_filters import classify_management_style, normalize_management_style

    return normalize_management_style(classify_management_style(*args, **kwargs))


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _first_text(*values: Any) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _first_value(*values: Any, default: Any = None) -> Any:
    for value in values:
        if value not in (None, ""):
            return value
    return default


def _first_price(*values: Any) -> float | None:
    for value in values:
        price = first_float(value)
        if price is not None and price > 0:
            return price
    return None


def _bool_value(value: Any, default: bool) -> bool:
    if value in (None, ""):
        return default
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    if text in {"true", "1", "yes", "y"}:
        return True
    if text in {"false", "0", "no", "n"}:
        return False
    return bool(value)


def _extract_signal_prices(*values: Any) -> list[float]:
    prices: list[float] = []
    for value in values:
        if isinstance(value, dict):
            prices.extend(_extract_signal_prices(*value.values()))
            continue
        if isinstance(value, list):
            prices.extend(_extract_signal_prices(*value))
            continue
        text = str(value or "")
        if not text:
            continue
        for _, raw_price in _HL_SIGNAL_PRICE_RE.findall(text):
            try:
                price = float(raw_price)
            except (TypeError, ValueError):
                continue
            if price > 0:
                prices.append(price)
    return prices


def _sanitize_limit_plan_signal_entry(patch: dict[str, Any]) -> dict[str, Any]:
    """限价计划必须用显式触发价/区域，不能直接复用 H1@ / L1@ 的形态价位。"""
    planned_trade = _as_dict(patch.get("planned_trade"))
    pre_signal = _as_dict(patch.get("pre_signal"))
    trigger_price = _as_dict(pre_signal.get("trigger_price"))
    candidate_stage = _first_text(planned_trade.get("candidate_stage"))
    execution_mode = _first_text(planned_trade.get("execution_mode"))
    order_type = _first_text(planned_trade.get("order_type"))
    brooks_label = _first_text(planned_trade.get("brooks_label"), patch.get("brooks_label"))
    limit_like = (
        candidate_stage.upper() == "EXECUTABLE_LIMIT"
        or execution_mode.upper() == "LIMIT_PLAN"
        or order_type.upper() == "LIMIT"
        or brooks_label == "TR 边缘限价单环境"
    )
    if not limit_like:
        return patch

    entry_zone = _first_value(
        planned_trade.get("entry_zone"),
        trigger_price.get("entry_zone"),
        trigger_price.get("retest_zone"),
        trigger_price.get("breakout_zone"),
        trigger_price.get("breakdown_zone"),
    )
    if entry_zone not in (None, "", [], {}):
        return patch

    signal_prices = _extract_signal_prices(
        patch.get("signal_type"),
        patch.get("signal"),
        patch.get("stage"),
        patch.get("thesis"),
        patch.get("timeframes"),
    )
    if not signal_prices:
        return patch

    def _matches_signal_price(value: Any) -> bool:
        price = _first_price(value)
        if price is None or price <= 0:
            return False
        tolerance = max(1e-8, abs(price) * 1e-6)
        return any(abs(signal_price - price) <= tolerance for signal_price in signal_prices)

    changed = False
    if _matches_signal_price(planned_trade.get("entry_price")):
        planned_trade.pop("entry_price", None)
        changed = True
    if _matches_signal_price(planned_trade.get("entry")):
        planned_trade.pop("entry", None)
        changed = True
    if _matches_signal_price(trigger_price.get("entry")):
        trigger_price.pop("entry", None)
        changed = True

    if not changed:
        return patch

    if trigger_price:
        pre_signal["trigger_price"] = trigger_price
    elif "trigger_price" in pre_signal:
        pre_signal.pop("trigger_price", None)
    patch["planned_trade"] = planned_trade
    patch["pre_signal"] = pre_signal
    return patch


def _infer_reference_timeframe(planned_trade: dict[str, Any], timeframes: dict[str, Any]) -> str:
    """优先使用计划对象声明的周期，其次回退到常见周期。"""
    timeframe = str(planned_trade.get("timeframe") or "").strip().lower()
    if timeframe:
        return timeframe
    for candidate in ("15m", "5m", "1h", "30m", "4h", "1d"):
        if isinstance(timeframes.get(candidate), dict):
            return candidate
    return "15m"


def _extract_market_price(patch: dict[str, Any], planned_trade: dict[str, Any]) -> float | None:
    """从 live patch 中提取当前可用的市场价格。"""
    timeframes = _as_dict(patch.get("timeframes"))
    followup_seed = _as_dict(patch.get("followup_seed"))
    timeframe = _infer_reference_timeframe(planned_trade, timeframes)
    frame = _as_dict(timeframes.get(timeframe))
    return _first_price(
        patch.get("current_price"),
        patch.get("last_price"),
        followup_seed.get("entry_price"),
        frame.get("price"),
        _as_dict(timeframes.get("15m")).get("price"),
        _as_dict(timeframes.get("5m")).get("price"),
        _as_dict(timeframes.get("1h")).get("price"),
    )


def _extract_market_atr(patch: dict[str, Any], planned_trade: dict[str, Any], current_price: float) -> float:
    """优先读取同周期 ATR，缺失时回退到价格百分比。"""
    timeframes = _as_dict(patch.get("timeframes"))
    timeframe = _infer_reference_timeframe(planned_trade, timeframes)
    frame = _as_dict(timeframes.get(timeframe))
    atr = _first_price(
        frame.get("atr14"),
        patch.get("atr14"),
        patch.get(f"atr14_{timeframe}"),
        _as_dict(timeframes.get("15m")).get("atr14"),
        _as_dict(timeframes.get("5m")).get("atr14"),
        _as_dict(timeframes.get("1h")).get("atr14"),
    )
    if atr is not None and atr > 0:
        return atr
    return max(current_price * 0.002, 1e-6)


def _promote_limit_plan_semantics(planned_trade: dict[str, Any]) -> None:
    """当限价计划已经具备精确入场条件时，把阶段升级到可执行限价。"""
    execution_semantics = _as_dict(planned_trade.get("execution_semantics"))
    if not execution_semantics:
        return
    allow_executable = _bool_value(
        execution_semantics.get("allow_executable", planned_trade.get("allow_executable")),
        False,
    )
    executable_signal_ready = _bool_value(execution_semantics.get("executable_signal_ready"), False)
    requires_second_entry = _bool_value(execution_semantics.get("requires_second_entry"), False)
    if not allow_executable or not executable_signal_ready or requires_second_entry:
        execution_semantics["has_entry_price"] = True
        execution_semantics["has_entry_zone"] = True
        planned_trade["execution_semantics"] = execution_semantics
        return

    execution_semantics["candidate_stage"] = "EXECUTABLE_LIMIT"
    execution_semantics["candidate_stage_cn"] = "可执行限价"
    execution_semantics["execution_mode"] = "LIMIT_PLAN"
    execution_semantics["execution_mode_cn"] = "限价计划委托"
    execution_semantics["order_type"] = "LIMIT"
    execution_semantics["order_type_cn"] = "限价委托"
    execution_semantics["has_entry_price"] = True
    execution_semantics["has_entry_zone"] = True
    planned_trade["candidate_stage"] = "EXECUTABLE_LIMIT"
    planned_trade["candidate_stage_cn"] = "可执行限价"
    planned_trade["execution_mode"] = "LIMIT_PLAN"
    planned_trade["execution_mode_cn"] = "限价计划委托"
    planned_trade["order_type"] = "LIMIT"
    planned_trade["order_type_cn"] = "限价委托"
    planned_trade["allow_executable"] = True
    planned_trade["needs_exact_trigger"] = True
    planned_trade["execution_semantics"] = execution_semantics


def _synthesize_limit_plan_exact_entry(patch: dict[str, Any]) -> dict[str, Any]:
    """为 LIMIT_PLAN 候选补齐安全的 live 精确入场价/入场区。"""
    planned_trade = _as_dict(patch.get("planned_trade"))
    pre_signal = _as_dict(patch.get("pre_signal"))
    trigger_price = _as_dict(pre_signal.get("trigger_price"))
    if not planned_trade:
        return patch

    candidate_stage = _first_text(planned_trade.get("candidate_stage"))
    execution_mode = _first_text(planned_trade.get("execution_mode"))
    order_type = _first_text(planned_trade.get("order_type"))
    brooks_label = _first_text(planned_trade.get("brooks_label"), patch.get("brooks_label"))
    limit_like = (
        candidate_stage.upper() == "EXECUTABLE_LIMIT"
        or execution_mode.upper() == "LIMIT_PLAN"
        or order_type.upper() == "LIMIT"
        or brooks_label == "TR 边缘限价单环境"
    )
    if not limit_like:
        return patch

    existing_entry = _first_price(
        planned_trade.get("entry_price"),
        planned_trade.get("entry"),
        trigger_price.get("entry"),
    )
    existing_zone = _first_value(
        planned_trade.get("entry_zone"),
        trigger_price.get("entry_zone"),
        trigger_price.get("retest_zone"),
        trigger_price.get("breakout_zone"),
        trigger_price.get("breakdown_zone"),
    )
    if existing_entry is not None and existing_entry > 0 and existing_zone not in (None, "", [], {}):
        _promote_limit_plan_semantics(planned_trade)
        patch["planned_trade"] = planned_trade
        if pre_signal:
            pre_signal["trigger_price"] = trigger_price
            patch["pre_signal"] = pre_signal
        return patch

    side = normalize_trade_side(
        planned_trade.get("side")
        or pre_signal.get("side")
        or pre_signal.get("direction")
    )
    current_price = _extract_market_price(patch, planned_trade)
    if side not in {"BUY", "SELL"} or current_price is None or current_price <= 0:
        return patch

    atr_value = _extract_market_atr(patch, planned_trade, current_price)
    buffer = max(current_price * 0.0003, min(atr_value * 0.12, current_price * 0.015))
    zone_half = max(current_price * 0.00015, buffer * 0.35)

    if side == "BUY":
        entry_price = max(1e-8, current_price - buffer)
        zone_low = max(1e-8, entry_price - zone_half)
        zone_high = current_price
    else:
        entry_price = current_price + buffer
        zone_low = current_price
        zone_high = entry_price + zone_half

    entry_zone = [min(zone_low, zone_high), max(zone_low, zone_high)]
    planned_trade["entry_price"] = entry_price
    planned_trade["entry_zone"] = entry_zone
    planned_trade["entry_zone_label"] = "auto_live_limit_exact"
    trigger_price["entry"] = entry_price
    trigger_price["entry_zone"] = entry_zone
    pre_signal["trigger_price"] = trigger_price
    patch["pre_signal"] = pre_signal
    _promote_limit_plan_semantics(planned_trade)
    patch["planned_trade"] = planned_trade
    return patch


def _contains_mag_text(value: Any) -> bool:
    text = str(value or "").strip().upper()
    if not text:
        return False
    return "MAG" in text or "T3_MAG_2020_SETUP" in text or "MAG 20/20" in text


def _sanitize_auxiliary_mag_identity(patch: dict[str, Any]) -> dict[str, Any]:
    """当主信号已明确不是 MAG 时，清掉旧缓存里遗留的 MAG 顶层身份。"""
    planned_trade = _as_dict(patch.get("planned_trade"))
    authoritative_primary = [
        _first_text(patch.get("brooks_label")),
        _first_text(patch.get("signal_type")),
        _first_text(planned_trade.get("brooks_label")),
    ]
    non_empty_primary = [text for text in authoritative_primary if text]
    if not non_empty_primary:
        return patch
    if all(_contains_mag_text(text) for text in non_empty_primary):
        return patch
    if not _contains_mag_text(patch.get("ema_gap_variant")):
        return patch

    for key in (
        "strategy",
        "strategy_hint",
        "strategy_family",
        "latest_strategy_family",
        "playbook_family",
        "playbook_id",
        "management_template",
    ):
        if _contains_mag_text(patch.get(key)):
            patch.pop(key, None)

    if planned_trade:
        for key in (
            "strategy",
            "playbook_family",
            "playbook_id",
            "management_template",
            "signal_type",
        ):
            if _contains_mag_text(planned_trade.get(key)):
                planned_trade.pop(key, None)
        patch["planned_trade"] = planned_trade

    return patch


def _normalize_entry_type(value: Any, order_type: str) -> str:
    text = str(value or "").strip().upper()
    if text in {"STOP", "LIMIT", "MARKET"}:
        return text
    if order_type == "LIMIT":
        return "LIMIT"
    if order_type == "MARKET":
        return "MARKET"
    return "STOP"


def _normalize_order_type(value: Any, entry_type: str) -> str:
    text = str(value or "").strip().upper()
    if text in {"MARKET", "LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"}:
        return text
    if entry_type == "LIMIT":
        return "LIMIT"
    if entry_type == "MARKET":
        return "MARKET"
    return "STOP_MARKET"


def _infer_stage_family(entry_type: str, order_type: str) -> str:
    if order_type == "LIMIT" or entry_type == "LIMIT":
        return "limit_edge"
    if order_type in {"STOP_MARKET", "TAKE_PROFIT_MARKET"} or entry_type == "STOP":
        return "stop_continuation"
    return ""


def _build_fallback_execution_semantics(
    *,
    patch: dict[str, Any],
    planned_trade: dict[str, Any],
    signal_type: str,
    style: str,
    order_type: str,
    entry_price: float | None,
    refs: list[str],
    reason: str,
) -> dict[str, Any]:
    filter_meta = {
        "label": str(planned_trade.get("brooks_label") or signal_type or ""),
        "upgrade_condition": str(planned_trade.get("upgrade_condition") or reason or ""),
        "brooks_rule": str(planned_trade.get("brooks_rule") or ""),
        "allow_executable": True,
        "stage_family": _infer_stage_family(
            str(planned_trade.get("entry_type") or ""),
            order_type,
        ),
        "preferred_order_type": order_type,
        "summary": str(planned_trade.get("upgrade_condition") or reason or ""),
        "source_refs": refs,
    }
    semantic_base = {
        "status": patch.get("status"),
        "planned_trade": {
            "entry_price": entry_price,
            "entry_zone": planned_trade.get("entry_zone"),
            "order_type": order_type,
            "style": style,
            "brooks_label": filter_meta["label"],
        },
    }
    semantics = derive_trade_execution_semantics(semantic_base, filter_meta)
    return build_execution_semantics(semantic_base["planned_trade"], filter_meta, semantics)


def build_runtime_symbol_patch(snapshot: dict[str, Any] | None, **overrides: Any) -> dict[str, Any]:
    """把运行态 symbol 快照裁成可复用的标准 patch。"""
    cached = _as_dict(snapshot)
    patch: dict[str, Any] = {
        "status": str(cached.get("status") or "watching"),
        "stage": str(cached.get("stage") or ""),
        "market_state": str(cached.get("market_state") or ""),
        "market_state_detail": str(cached.get("market_state_detail") or ""),
        "structure_summary": str(cached.get("structure_summary") or ""),
        "thesis": str(cached.get("thesis") or ""),
        "daily_bias": cached.get("daily_bias"),
        "ai_direction": cached.get("ai_direction"),
        "signal": cached.get("signal"),
        "signal_type": cached.get("signal_type"),
        "refs": normalize_refs(cached.get("refs")),
        "pre_signal": _as_dict(cached.get("pre_signal")),
        "pre_signal_meta": _as_dict(cached.get("pre_signal_meta")),
        "planned_trade": _as_dict(cached.get("planned_trade")),
        "trade": _as_dict(cached.get("trade")),
        "entry_idea": _as_dict(cached.get("entry_idea")),
        "evaluation": _as_dict(cached.get("evaluation")),
        "key_levels": _as_dict(cached.get("key_levels")),
        "timeframes": _as_dict(cached.get("timeframes")),
        "followup_seed": _as_dict(cached.get("followup_seed")),
        "current_price": cached.get("current_price"),
        "last_price": cached.get("last_price"),
        "ema20": cached.get("ema20"),
        "atr14": cached.get("atr14"),
        "event_tags": _as_list(cached.get("event_tags")),
        "strategy": cached.get("strategy"),
        "strategy_family": cached.get("strategy_family"),
        "latest_strategy_family": cached.get("latest_strategy_family"),
        "playbook_family": cached.get("playbook_family"),
        "playbook_id": cached.get("playbook_id"),
        "strategy_hint": cached.get("strategy_hint"),
        "brooks_label": cached.get("brooks_label"),
        "management_template": cached.get("management_template"),
        "ema_gap_variant": cached.get("ema_gap_variant"),
        "last_pass_reason": cached.get("last_pass_reason"),
        "stale_model_timeout": cached.get("stale_model_timeout"),
        "updated_at": cached.get("updated_at"),
        "source_cycle_id": cached.get("source_cycle_id"),
    }
    for key, value in overrides.items():
        if value not in (None, "", [], {}):
            patch[key] = value
    patch = _sanitize_limit_plan_signal_entry(patch)
    patch = _synthesize_limit_plan_exact_entry(patch)
    patch = _sanitize_auxiliary_mag_identity(patch)
    return patch


def build_open_order_action(
    *,
    symbol: str,
    reason: str,
    patch: dict[str, Any] | None = None,
    base_action: dict[str, Any] | None = None,
    trade: dict[str, Any] | None = None,
    refs: Any = None,
    signal_source: str = "",
    source_chain: str = "",
) -> dict[str, Any]:
    """统一构建 live `OPEN_ORDER` 动作。"""
    symbol_upper = str(symbol or "").upper()
    patch_data = build_runtime_symbol_patch(patch or {})
    base = normalize_action_payload(base_action or {})
    trade_data = _as_dict(trade)
    planned_trade = _as_dict(patch_data.get("planned_trade"))
    trade_patch = _as_dict(patch_data.get("trade"))
    entry_idea = _as_dict(patch_data.get("entry_idea"))
    pre_signal = _as_dict(patch_data.get("pre_signal"))
    trigger_price = _as_dict(pre_signal.get("trigger_price"))
    refs_list = (
        normalize_refs(base.get("refs"))
        or normalize_refs(refs)
        or normalize_refs(patch_data.get("refs"))
        or normalize_refs(planned_trade.get("refs"))
    )

    side = normalize_trade_side(
        _first_text(
            base.get("side"),
            trade_data.get("side"),
            planned_trade.get("side"),
            trade_patch.get("side"),
            entry_idea.get("side"),
            pre_signal.get("side"),
            pre_signal.get("direction"),
        )
    )
    entry = _first_price(
        base.get("entry"),
        base.get("entry_price"),
        base.get("price"),
        trade_data.get("entry_price"),
        trade_data.get("entry"),
        planned_trade.get("entry_price"),
        planned_trade.get("entry"),
        trade_patch.get("entry_price"),
        trade_patch.get("entry"),
        trigger_price.get("entry"),
    )
    stop_loss = _first_price(
        base.get("sl"),
        base.get("stop_loss"),
        trade_data.get("stop_loss"),
        planned_trade.get("stop_loss"),
        trade_patch.get("stop_loss"),
        trigger_price.get("stop_loss"),
    )
    take_profit = _first_price(
        base.get("tp"),
        base.get("take_profit"),
        trade_data.get("take_profit"),
        planned_trade.get("take_profit"),
        trade_patch.get("take_profit"),
        trigger_price.get("take_profit"),
    )
    signal_type = _first_text(
        base.get("signal_type"),
        trade_data.get("signal_type"),
        planned_trade.get("signal_type"),
        planned_trade.get("brooks_label"),
        patch_data.get("signal_type"),
        patch_data.get("signal"),
    )
    strategy = _first_text(
        base.get("strategy"),
        trade_data.get("strategy"),
        planned_trade.get("strategy"),
        trade_patch.get("strategy"),
        signal_type,
        entry_idea.get("style"),
        "PA_PATROL",
    )
    style = _first_text(
        base.get("style"),
        trade_data.get("style"),
        planned_trade.get("style"),
        trade_patch.get("style"),
        entry_idea.get("style"),
        "Swing",
    )
    market_state = _first_text(
        base.get("market_state"),
        planned_trade.get("market_state"),
        trade_patch.get("market_state"),
        entry_idea.get("market_state"),
        patch_data.get("market_state"),
    )
    higher_market_state = _first_text(
        base.get("higher_market_state"),
        planned_trade.get("higher_market_state"),
        entry_idea.get("higher_market_state"),
    )
    timeframe = _first_text(
        base.get("timeframe"),
        planned_trade.get("timeframe"),
        planned_trade.get("signal_timeframe"),
        entry_idea.get("timeframe"),
    )
    entry_type = _normalize_entry_type(
        _first_text(base.get("entry_type"), planned_trade.get("entry_type")),
        str(base.get("order_type") or planned_trade.get("order_type") or ""),
    )
    order_type = _normalize_order_type(
        _first_text(base.get("order_type"), planned_trade.get("order_type"), trade_data.get("order_type")),
        entry_type,
    )
    playbook_id = _first_text(
        base.get("playbook_id"),
        trade_data.get("playbook_id"),
        planned_trade.get("playbook_id"),
        trade_patch.get("playbook_id"),
        entry_idea.get("playbook_id"),
    )
    playbook_hint = _first_text(
        base.get("playbook_hint"),
        trade_data.get("playbook_hint"),
        planned_trade.get("playbook_hint"),
        trade_patch.get("playbook_hint"),
        playbook_id,
    )
    route_style = _first_text(
        base.get("route_style"),
        planned_trade.get("route_style"),
        entry_idea.get("route_style"),
    )
    playbook_family = _first_text(
        base.get("playbook_family"),
        planned_trade.get("playbook_family"),
        entry_idea.get("playbook_family"),
    )
    order_bias = _first_text(
        base.get("order_bias"),
        planned_trade.get("order_bias"),
        entry_idea.get("order_bias"),
    )
    if signal_type:
        resolved_playbook_id, resolved_family, resolved_bias = resolve_playbook_context(
            signal_type,
            market_state,
            higher_key=higher_market_state,
            direction=side,
            entry_type=entry_type,
            extra={
                **entry_idea,
                **planned_trade,
                "timeframe": timeframe,
                "playbook_hint": playbook_hint,
            },
        )
        if not playbook_id:
            playbook_id = resolved_playbook_id
        if not playbook_hint:
            playbook_hint = resolved_playbook_id
        if not playbook_family:
            playbook_family = resolved_family
        if not order_bias:
            order_bias = resolved_bias

    management_style = _first_text(
        base.get("management_style"),
        base.get("management_style_override"),
        planned_trade.get("management_style"),
        planned_trade.get("management_style_override"),
        trade_patch.get("management_style"),
        entry_idea.get("management_style"),
        entry_idea.get("management_style_override"),
    )
    if not management_style and signal_type:
        setup_bool_values = {
            key: _bool_value(
                _first_value(base.get(key), planned_trade.get(key), entry_idea.get(key)),
                True,
            )
            for key in _SETUP_BOOL_FIELDS
        }
        setup_float_values = {
            key: safe_float(_first_value(base.get(key), planned_trade.get(key), entry_idea.get(key)), 0.0)
            for key in _SETUP_FLOAT_FIELDS
        }
        management_style = _resolve_management_style(
            signal_type,
            str(_first_text(planned_trade.get("management_profile"), "brooks_pdf")),
            market_state=market_state,
            higher_market_state=higher_market_state,
            timeframe=timeframe,
            entry_type=entry_type,
            route_style=route_style,
            playbook_id=playbook_id,
            setup_valid=setup_bool_values["setup_valid"],
            setup_clear_trend_leg=setup_bool_values["setup_clear_trend_leg"],
            setup_first_pullback_shape=setup_bool_values["setup_first_pullback_shape"],
            setup_pullback_depth_ratio=setup_float_values["setup_pullback_depth_ratio"],
            setup_pullback_overlap_ratio=setup_float_values["setup_pullback_overlap_ratio"],
        )

    action = {
        "type": "OPEN_ORDER",
        "symbol": symbol_upper,
        "reason": reason,
        "side": side,
        "strategy": strategy,
        "signal_type": signal_type,
        "style": style,
        "order_type": order_type,
        "entry_type": entry_type,
        "market_state": market_state,
        "higher_market_state": higher_market_state,
        "timeframe": timeframe,
        "refs": refs_list,
    }

    if entry is not None:
        action["entry"] = entry
        action["entry_price"] = entry
        action["price"] = entry
    if stop_loss is not None:
        action["sl"] = stop_loss
        action["stop_loss"] = stop_loss
    if take_profit is not None:
        action["tp"] = take_profit
        action["take_profit"] = take_profit

    confidence = _first_value(base.get("confidence"), trade_data.get("confidence"))
    if confidence not in (None, ""):
        action["confidence"] = confidence

    for field in (
        "intent",
        "risk_percent",
        "reentry_attempt",
        "followup_profile",
        "reentry_candidate",
        "note",
        "signal_source",
    ):
        value = _first_value(base.get(field), trade_data.get(field), planned_trade.get(field))
        if value not in (None, ""):
            action[field] = value

    if signal_source and not action.get("signal_source"):
        action["signal_source"] = signal_source
    if source_chain:
        action["source_chain"] = source_chain
    if playbook_id:
        action["playbook_id"] = playbook_id
    if playbook_hint:
        action["playbook_hint"] = playbook_hint
    if playbook_family:
        action["playbook_family"] = playbook_family
    if order_bias:
        action["order_bias"] = order_bias
    if route_style:
        action["route_style"] = route_style

    for field in _TARGET_FIELDS:
        value = _first_value(base.get(field), planned_trade.get(field), entry_idea.get(field))
        if value not in (None, ""):
            action[field] = value

    stop_type = _first_text(base.get("stop_type"), planned_trade.get("stop_type"), entry_idea.get("stop_type"))
    if stop_type:
        action["stop_type"] = stop_type

    management_template = _first_text(
        base.get("management_template"),
        planned_trade.get("management_template"),
        entry_idea.get("management_template"),
    )
    if management_template:
        action["management_template"] = management_template
    if management_style:
        action["management_style"] = management_style

    execution_semantics = _as_dict(trade_data.get("execution_semantics"))
    if not execution_semantics:
        execution_semantics = _as_dict(planned_trade.get("execution_semantics"))
    if not execution_semantics and (
        _first_text(trade_data.get("candidate_stage"), trade_data.get("execution_mode"))
    ):
        execution_semantics = {
            "candidate_stage": _first_text(trade_data.get("candidate_stage")),
            "execution_mode": _first_text(trade_data.get("execution_mode")),
        }
    if not execution_semantics:
        execution_semantics = _build_fallback_execution_semantics(
            patch=patch_data,
            planned_trade=planned_trade,
            signal_type=signal_type,
            style=style,
            order_type=order_type,
            entry_price=entry,
            refs=refs_list,
            reason=reason,
        )
    if execution_semantics:
        candidate_stage_value = _first_text(
            base.get("candidate_stage"),
            trade_data.get("candidate_stage"),
            planned_trade.get("candidate_stage"),
            execution_semantics.get("candidate_stage"),
        )
        execution_mode_value = _first_text(
            base.get("execution_mode"),
            trade_data.get("execution_mode"),
            planned_trade.get("execution_mode"),
            execution_semantics.get("execution_mode"),
        )
        if candidate_stage_value:
            action["candidate_stage"] = candidate_stage_value
        if execution_mode_value:
            action["execution_mode"] = execution_mode_value
        if execution_semantics.get("order_type_cn"):
            action["order_type_cn"] = execution_semantics.get("order_type_cn")
    for field in ("brooks_label", "upgrade_condition", "brooks_rule"):
        value = _first_text(base.get(field), planned_trade.get(field), execution_semantics.get(field))
        if value:
            action[field] = value

    if action.get("intent") in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"} and not action.get("note"):
        action["note"] = "S7 加仓"
    return action


__all__ = [
    "build_open_order_action",
    "build_runtime_symbol_patch",
]
