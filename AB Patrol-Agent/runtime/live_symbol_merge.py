#!/usr/bin/env python3
"""live symbol patch 合并与行情注水。"""

from __future__ import annotations

import re
from typing import Any

from live_patch_state import patch_is_expired_or_stale
from utils import safe_float


_SIGNAL_PRICE_RE = re.compile(
    r"(?<![A-Z0-9])(H1|H2|L1|L2|高1|高2|低1|低2)\s*@\s*(-?\d+(?:\.\d+)?)",
    re.IGNORECASE,
)

_ACTIVE_SIGNAL_STATUSES = {"pre_signal", "entry_ready", "entry_ready_blocked"}
_ACTIONABLE_CANDIDATE_STAGES = {
    "CANDIDATE_LIMIT",
    "CANDIDATE_STOP",
    "CANDIDATE_MARKET",
    "EXECUTABLE_LIMIT",
    "EXECUTABLE_STOP",
    "EXECUTABLE_MARKET",
}
_ACTIONABLE_EXECUTION_MODES = {"LIMIT_PLAN", "STOP_TRIGGER", "MARKET_IMMEDIATE"}
_PROJECTED_SIGNAL_FIELDS = (
    "signal",
    "signal_type",
    "candidate_stage",
    "candidate_stage_cn",
    "execution_mode",
    "execution_mode_cn",
)


def _normalize_signal_token(value: str) -> str:
    text = str(value or "").strip().upper()
    mapping = {
        "高1": "H1",
        "高2": "H2",
        "低1": "L1",
        "低2": "L2",
    }
    return mapping.get(text, text)


def _extract_signal_identity(*values: Any) -> tuple[str, float] | tuple[str, None]:
    for value in values:
        if isinstance(value, dict):
            nested = _extract_signal_identity(*value.values())
            if nested[0]:
                return nested
            continue
        if isinstance(value, list):
            nested = _extract_signal_identity(*value)
            if nested[0]:
                return nested
            continue
        text = str(value or "")
        if not text:
            continue
        match = _SIGNAL_PRICE_RE.search(text)
        if not match:
            continue
        token = _normalize_signal_token(str(match.group(1)))
        try:
            price = float(match.group(2))
        except (TypeError, ValueError):
            price = None
        return token, price if price and price > 0 else None
    return "", None


def _has_actionable_signal_state(payload: Any) -> bool:
    patch = payload if isinstance(payload, dict) else {}
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    return bool(
        planned_trade_is_actionable_source(planned_trade)
        or patch.get("pre_signal")
        or patch.get("trade")
        or patch.get("followup_seed")
        or str(patch.get("candidate_stage") or "").strip()
        or str(patch.get("execution_mode") or "").strip()
        or str(patch.get("signal") or patch.get("signal_type") or "").strip()
    )


def planned_trade_is_actionable_source(payload: Any) -> bool:
    """只有真正可执行/候选阶段的 planned_trade 才能作为执行源。"""
    planned_trade = payload if isinstance(payload, dict) else {}
    if not planned_trade:
        return False
    execution_semantics = (
        planned_trade.get("execution_semantics")
        if isinstance(planned_trade.get("execution_semantics"), dict)
        else {}
    )
    candidate_stage = str(
        planned_trade.get("candidate_stage")
        or execution_semantics.get("candidate_stage")
        or ""
    ).strip().upper()
    execution_mode = str(
        planned_trade.get("execution_mode")
        or execution_semantics.get("execution_mode")
        or ""
    ).strip().upper()
    allow_executable = planned_trade.get("allow_executable")
    if allow_executable is None:
        allow_executable = execution_semantics.get("allow_executable")
    if allow_executable is False:
        return False
    return candidate_stage in _ACTIONABLE_CANDIDATE_STAGES or execution_mode in _ACTIONABLE_EXECUTION_MODES


def _backfill_actionable_planned_trade(payload: Any) -> dict[str, Any]:
    """优先用同源 pre_signal.trigger_price 回填 planned_trade 的关键价格。"""
    patch = dict(payload) if isinstance(payload, dict) else {}
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    pre_signal = patch.get("pre_signal") if isinstance(patch.get("pre_signal"), dict) else {}
    if not planned_trade_is_actionable_source(planned_trade) or not pre_signal:
        return patch

    trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
    aligned = dict(planned_trade)

    entry = safe_float(
        aligned.get("entry_price")
        or aligned.get("entry_trigger")
        or trigger_price.get("entry"),
        0.0,
    )
    stop_loss = safe_float(aligned.get("stop_loss") or trigger_price.get("stop_loss"), 0.0)
    take_profit = safe_float(aligned.get("take_profit") or trigger_price.get("take_profit"), 0.0)

    if entry > 0:
        aligned.setdefault("entry_price", entry)
        aligned.setdefault("entry_trigger", entry)
    if stop_loss > 0:
        aligned["stop_loss"] = stop_loss
    if take_profit > 0:
        aligned["take_profit"] = take_profit
    if not aligned.get("signal_bar") and has_meaningful_symbol_value(pre_signal.get("signal")):
        aligned["signal_bar"] = pre_signal.get("signal")
    if not aligned.get("signal_type") and has_meaningful_symbol_value(pre_signal.get("type")):
        aligned["signal_type"] = pre_signal.get("type")
    if not aligned.get("invalid_if") and has_meaningful_symbol_value(pre_signal.get("invalid_if")):
        aligned["invalid_if"] = pre_signal.get("invalid_if")

    if aligned != planned_trade:
        patch["planned_trade"] = aligned
    return patch


def _planned_trade_has_complete_prices(payload: Any) -> bool:
    """可执行 planned_trade 必须至少具备 entry / stop / target 三元价格。"""
    planned_trade = payload if isinstance(payload, dict) else {}
    if not planned_trade_is_actionable_source(planned_trade):
        return True
    entry = safe_float(planned_trade.get("entry_price") or planned_trade.get("entry_trigger"), 0.0)
    stop_loss = safe_float(planned_trade.get("stop_loss"), 0.0)
    take_profit = safe_float(planned_trade.get("take_profit"), 0.0)
    return entry > 0 and stop_loss > 0 and take_profit > 0


def actionable_signal_identity_inconsistent(payload: Any) -> bool:
    """识别同一 symbol patch 内部已经串线的开仓身份。"""
    patch = payload if isinstance(payload, dict) else {}
    if not patch:
        return False
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    if not _has_actionable_signal_state(patch):
        return False

    top_token, top_price = _extract_signal_identity(
        patch.get("signal_type"),
        patch.get("signal"),
    )
    planned_token, planned_price = _extract_signal_identity(
        planned_trade.get("signal_type"),
        planned_trade.get("signal_bar"),
        planned_trade.get("entry_trigger"),
    )
    if top_token and planned_token:
        if top_token != planned_token:
            return True
        if top_price is not None and planned_price is not None:
            tolerance = max(1e-8, max(abs(top_price), abs(planned_price)) * 1e-6)
            if abs(top_price - planned_price) > tolerance:
                return True

    top_stage = str(patch.get("candidate_stage") or "").strip().upper()
    planned_stage = str(planned_trade.get("candidate_stage") or "").strip().upper()
    if top_stage and planned_stage and top_stage != planned_stage:
        return True

    top_mode = str(patch.get("execution_mode") or "").strip().upper()
    planned_mode = str(planned_trade.get("execution_mode") or "").strip().upper()
    if top_mode and planned_mode and top_mode != planned_mode:
        return True

    side = str(
        planned_trade.get("side")
        or (patch.get("pre_signal") or {}).get("side")
        or ""
    ).strip().upper()
    if side == "BUY" and top_token in {"L1", "L2"}:
        return True
    if side == "SELL" and top_token in {"H1", "H2"}:
        return True

    return False


def purge_actionable_signal_state(payload: Any) -> dict[str, Any]:
    """清掉已经串线或失效的开仓态，但保留行情与时间周期快照。"""
    patch = dict(payload) if isinstance(payload, dict) else {}
    if not patch:
        return {}

    for key in (
        "pre_signal",
        "pre_signal_meta",
        "planned_trade",
        "trade",
        "followup_seed",
        "signal",
        "signal_type",
        "brooks_label",
        "candidate_stage",
        "candidate_stage_cn",
        "execution_mode",
        "execution_mode_cn",
        "strategy",
        "strategy_family",
        "latest_strategy_family",
        "playbook_family",
        "playbook_id",
        "strategy_hint",
        "management_template",
        "last_pass_reason",
        "stale_model_timeout",
    ):
        patch.pop(key, None)

    if isinstance(patch.get("event_tags"), list):
        patch["event_tags"] = [
            tag
            for tag in patch.get("event_tags") or []
            if not str(tag or "").startswith(("signal_trigger:", "hl_signal:", "cached_pre_signal"))
        ]

    entry_idea = patch.get("entry_idea") if isinstance(patch.get("entry_idea"), dict) else {}
    for field in (
        "candidate_stage",
        "candidate_stage_cn",
        "execution_mode",
        "execution_mode_cn",
        "style",
        "filter_summary",
        "upgrade_condition",
        "brooks_rule",
        "source_refs",
        "direction",
        "brooks_label",
    ):
        entry_idea.pop(field, None)
    if entry_idea:
        patch["entry_idea"] = entry_idea
    else:
        patch.pop("entry_idea", None)

    evaluation = patch.get("evaluation") if isinstance(patch.get("evaluation"), dict) else {}
    for field in (
        "candidate_stage",
        "execution_mode",
        "execution_decision",
        "risk",
        "signal_rank",
        "brooks_rule",
        "source_refs",
        "regime",
    ):
        evaluation.pop(field, None)
    if evaluation:
        patch["evaluation"] = evaluation
    else:
        patch.pop("evaluation", None)

    if str(patch.get("status") or "").strip().lower() in _ACTIVE_SIGNAL_STATUSES:
        patch["status"] = "watching"
        patch["stage"] = "WATCH"
    return patch


def _copy_if_missing(target: dict[str, Any], source: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    updated = dict(target)
    for field in fields:
        if has_meaningful_symbol_value(updated.get(field)):
            continue
        value = source.get(field)
        if has_meaningful_symbol_value(value):
            updated[field] = value
    return updated


def _promote_top_level_projection_into_source(payload: Any) -> dict[str, Any]:
    """兼容旧 patch：若顶层仍有可执行字段，优先回填到嵌套源。"""
    patch = dict(payload) if isinstance(payload, dict) else {}
    if not patch:
        return {}
    trade = patch.get("trade") if isinstance(patch.get("trade"), dict) else {}
    if trade:
        return patch

    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    pre_signal = patch.get("pre_signal") if isinstance(patch.get("pre_signal"), dict) else {}
    top_candidate_stage = str(patch.get("candidate_stage") or "").strip().upper()
    top_execution_mode = str(patch.get("execution_mode") or "").strip().upper()
    if planned_trade:
        aligned = _copy_if_missing(
            planned_trade,
            patch,
            (
                "strategy",
                "playbook_id",
                "playbook_family",
                "brooks_label",
                "management_template",
                "signal_type",
            ),
        )
        if not aligned.get("signal_bar") and has_meaningful_symbol_value(patch.get("signal")):
            aligned["signal_bar"] = patch.get("signal")
        if top_candidate_stage and not aligned.get("candidate_stage"):
            aligned["candidate_stage"] = top_candidate_stage
        if top_execution_mode and not aligned.get("execution_mode"):
            aligned["execution_mode"] = top_execution_mode
        if aligned != planned_trade:
            patch["planned_trade"] = aligned
        return patch

    if pre_signal:
        aligned_pre_signal = dict(pre_signal)
        if not aligned_pre_signal.get("type") and has_meaningful_symbol_value(patch.get("signal_type")):
            aligned_pre_signal["type"] = patch.get("signal_type")
        if not aligned_pre_signal.get("signal") and has_meaningful_symbol_value(patch.get("signal")):
            aligned_pre_signal["signal"] = patch.get("signal")
        if aligned_pre_signal != pre_signal:
            patch["pre_signal"] = aligned_pre_signal
        return patch

    if top_candidate_stage in _ACTIONABLE_CANDIDATE_STAGES or top_execution_mode in _ACTIONABLE_EXECUTION_MODES:
        promoted: dict[str, Any] = {}
        for field in (
            "strategy",
            "playbook_id",
            "playbook_family",
            "brooks_label",
            "management_template",
            "signal_type",
        ):
            value = patch.get(field)
            if has_meaningful_symbol_value(value):
                promoted[field] = value
        if has_meaningful_symbol_value(patch.get("signal")):
            promoted["signal_bar"] = patch.get("signal")
        if top_candidate_stage:
            promoted["candidate_stage"] = top_candidate_stage
        if top_execution_mode:
            promoted["execution_mode"] = top_execution_mode
        if promoted:
            patch["planned_trade"] = promoted
    return patch


def _demote_watch_only_planned_trade(payload: Any) -> dict[str, Any]:
    """继续观察的模板信号不再冒充 planned_trade 执行源。"""
    patch = dict(payload) if isinstance(payload, dict) else {}
    if not patch:
        return {}
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    if not planned_trade or planned_trade_is_actionable_source(planned_trade):
        return patch
    if patch.get("trade") or patch.get("pre_signal"):
        return patch

    for field in ("brooks_label", "upgrade_condition", "brooks_rule"):
        if not patch.get(field) and has_meaningful_symbol_value(planned_trade.get(field)):
            patch[field] = planned_trade.get(field)

    patch.pop("planned_trade", None)
    patch.pop("followup_seed", None)
    for field in (
        "signal",
        "signal_type",
        "candidate_stage",
        "candidate_stage_cn",
        "execution_mode",
        "execution_mode_cn",
        "strategy",
        "strategy_family",
        "latest_strategy_family",
        "playbook_family",
        "playbook_id",
        "strategy_hint",
        "management_template",
    ):
        patch.pop(field, None)
    if isinstance(patch.get("event_tags"), list):
        patch["event_tags"] = [
            tag
            for tag in patch.get("event_tags") or []
            if not str(tag or "").startswith(("signal_trigger:", "hl_signal:", "cached_pre_signal"))
        ]
    entry_idea = patch.get("entry_idea") if isinstance(patch.get("entry_idea"), dict) else {}
    for field in ("candidate_stage", "candidate_stage_cn", "execution_mode", "execution_mode_cn"):
        entry_idea.pop(field, None)
    if entry_idea:
        patch["entry_idea"] = entry_idea
    else:
        patch.pop("entry_idea", None)
    patch["status"] = "watching"
    patch["stage"] = "WATCH"
    return patch


def _demote_incomplete_actionable_planned_trade(payload: Any) -> dict[str, Any]:
    """缺同源保护位的 planned_trade 不允许继续冒充可执行单。"""
    patch = dict(payload) if isinstance(payload, dict) else {}
    if not patch:
        return {}
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    if not planned_trade_is_actionable_source(planned_trade):
        return patch
    if _planned_trade_has_complete_prices(planned_trade):
        return patch

    patch.pop("planned_trade", None)
    patch.pop("followup_seed", None)
    for field in _PROJECTED_SIGNAL_FIELDS:
        patch.pop(field, None)

    entry_idea = patch.get("entry_idea") if isinstance(patch.get("entry_idea"), dict) else {}
    if entry_idea:
        entry_idea["filter_summary"] = "缺少同源止损止盈，继续观察，不升级可执行单。"
        for field in ("candidate_stage", "candidate_stage_cn", "execution_mode", "execution_mode_cn"):
            entry_idea.pop(field, None)
        patch["entry_idea"] = entry_idea
    patch["status"] = "watching"
    patch["stage"] = "WATCH"
    patch["last_pass_reason"] = "缺少同源止损止盈，继续观察，不升级可执行单。"
    return patch


def _project_top_level_signal_fields(payload: Any) -> dict[str, Any]:
    """顶层 signal 字段只允许作为嵌套源的展示投影。"""
    patch = dict(payload) if isinstance(payload, dict) else {}
    if not patch:
        return {}

    trade = patch.get("trade") if isinstance(patch.get("trade"), dict) else {}
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    pre_signal = patch.get("pre_signal") if isinstance(patch.get("pre_signal"), dict) else {}
    actionable_planned_trade = planned_trade if planned_trade_is_actionable_source(planned_trade) else {}
    execution_semantics = (
        actionable_planned_trade.get("execution_semantics")
        if isinstance(actionable_planned_trade.get("execution_semantics"), dict)
        else {}
    )

    signal = ""
    for candidate in (
        trade.get("signal"),
        trade.get("signal_type"),
        actionable_planned_trade.get("signal_bar"),
        actionable_planned_trade.get("signal_type"),
        pre_signal.get("signal"),
        pre_signal.get("type"),
    ):
        text = str(candidate or "").strip()
        if text:
            signal = text
            break

    signal_type = ""
    for candidate in (
        trade.get("signal_type"),
        actionable_planned_trade.get("signal_type"),
        pre_signal.get("type"),
        signal,
    ):
        text = str(candidate or "").strip()
        if text:
            signal_type = text
            break

    candidate_stage = ""
    for candidate in (
        trade.get("candidate_stage"),
        execution_semantics.get("candidate_stage"),
        actionable_planned_trade.get("candidate_stage"),
    ):
        text = str(candidate or "").strip().upper()
        if text:
            candidate_stage = text
            break

    candidate_stage_cn = ""
    for candidate in (
        trade.get("candidate_stage_cn"),
        execution_semantics.get("candidate_stage_cn"),
        actionable_planned_trade.get("candidate_stage_cn"),
    ):
        text = str(candidate or "").strip()
        if text:
            candidate_stage_cn = text
            break

    execution_mode = ""
    for candidate in (
        trade.get("execution_mode"),
        execution_semantics.get("execution_mode"),
        actionable_planned_trade.get("execution_mode"),
    ):
        text = str(candidate or "").strip().upper()
        if text:
            execution_mode = text
            break

    execution_mode_cn = ""
    for candidate in (
        trade.get("execution_mode_cn"),
        execution_semantics.get("execution_mode_cn"),
        actionable_planned_trade.get("execution_mode_cn"),
    ):
        text = str(candidate or "").strip()
        if text:
            execution_mode_cn = text
            break

    projected_fields = {
        "signal": signal,
        "signal_type": signal_type,
        "candidate_stage": candidate_stage,
        "candidate_stage_cn": candidate_stage_cn,
        "execution_mode": execution_mode,
        "execution_mode_cn": execution_mode_cn,
    }
    for field in _PROJECTED_SIGNAL_FIELDS:
        value = projected_fields.get(field)
        if value:
            patch[field] = value
        else:
            patch.pop(field, None)
    return patch


def normalize_actionable_signal_patch(payload: Any) -> dict[str, Any]:
    """统一收口：顶层字段只保留为嵌套执行源的投影。"""
    patch = dict(payload) if isinstance(payload, dict) else {}
    if not patch:
        return {}
    if actionable_signal_identity_inconsistent(patch):
        patch = purge_actionable_signal_state(patch)
    patch = _promote_top_level_projection_into_source(patch)
    patch = _backfill_actionable_planned_trade(patch)
    patch = _demote_incomplete_actionable_planned_trade(patch)
    patch = _demote_watch_only_planned_trade(patch)
    patch = _project_top_level_signal_fields(patch)
    return patch


def extract_mag_bridge_from_frames(frames: dict[str, Any]) -> dict[str, Any]:
    """从 analysis_board.timeframes.ab_ema 中提取 MAG 语义，桥接到 live patch。"""
    if not isinstance(frames, dict) or not frames:
        return {}

    mag_rows: list[dict[str, Any]] = []
    for timeframe in ("15m", "1h", "5m", "30m", "4h", "1d"):
        frame = frames.get(timeframe) if isinstance(frames.get(timeframe), dict) else {}
        if not frame:
            continue
        ab_ema = frame.get("ab_ema") if isinstance(frame.get("ab_ema"), dict) else {}
        mag_type = str(ab_ema.get("mag_type") or "").strip().lower()
        if mag_type not in {"bull_mag", "bear_mag"}:
            continue
        direction = "LONG" if mag_type == "bull_mag" else "SHORT"
        mag_rows.append(
            {
                "timeframe": timeframe,
                "direction": direction,
                "signal": str(frame.get("signal") or "").strip(),
                "market_state": str(frame.get("state") or "").strip(),
                "mag_type": mag_type,
                "ema_sr_valid": ab_ema.get("ema_sr_valid"),
                "first_pb_type": str(ab_ema.get("first_pb_type") or "").strip(),
                "first_pb_bars_ago": safe_float(ab_ema.get("first_pb_bars_ago"), 0.0),
            }
        )

    if not mag_rows:
        return {}

    primary = mag_rows[0]
    summary_parts: list[str] = []
    for item in mag_rows[:3]:
        summary_parts.append(f"{item['timeframe']}:{item['mag_type']}:{item['market_state'] or '-'}")
    summary_text = " / ".join(summary_parts)
    timeframe_labels = [str(item["timeframe"]) for item in mag_rows]

    return {
        "signal_type": "MAG 20/20 Setup",
        "signal": primary["signal"],
        "ai_direction": primary["direction"],
        "strategy": "T3: MAG 20/20 setup",
        "strategy_hint": "T3: MAG 20/20 setup",
        "strategy_family": "MAG",
        "latest_strategy_family": "MAG",
        "playbook_family": "MAG",
        "playbook_id": "T3_MAG_2020_SETUP",
        "brooks_label": "MAG 20/20 Setup",
        "management_template": "EMA_GAP_MAG_FINAL_LEG",
        "ema_gap_variant": "MAG",
        "ema_gap_signal_type": "MAG 20/20 Setup",
        "ema_gap_brooks_label": "MAG 20/20 Setup",
        "ema_gap_management_template": "EMA_GAP_MAG_FINAL_LEG",
        "ema_gap_playbook_family": "MAG",
        "ema_gap_playbook_id": "T3_MAG_2020_SETUP",
        "strategy_candidates": ["MAG"],
        "alt_strategy_families": ["MAG"],
        "market_state_detail": summary_text,
        "thesis": f"MAG 20/20 Setup | {summary_text}",
        "planned_trade": {
            "side": primary["direction"],
            "signal_type": "MAG 20/20 Setup",
            "brooks_label": "MAG 20/20 Setup",
            "strategy": "T3: MAG 20/20 setup",
            "playbook_family": "MAG",
            "playbook_id": "T3_MAG_2020_SETUP",
            "management_template": "EMA_GAP_MAG_FINAL_LEG",
            "timeframe": primary["timeframe"],
            "timeframes": timeframe_labels,
        },
        "entry_idea": {
            "direction": primary["direction"],
            "side": primary["direction"],
            "style": "Swing",
            "brooks_label": "MAG 20/20 Setup",
        },
    }


def has_meaningful_symbol_value(value: Any) -> bool:
    """判断 symbol patch 字段是否值得覆盖已有值。"""
    if value is None:
        return False
    if isinstance(value, str):
        return str(value).strip() != ""
    if isinstance(value, dict):
        return bool(value)
    if isinstance(value, list):
        return bool(value)
    return True


def merge_symbol_payload(base: Any, overlay: Any) -> dict[str, Any]:
    """合并 market/runtime symbol patch，避免空值把价格和 ATR 冲掉。"""
    merged = dict(base) if isinstance(base, dict) else {}
    if not isinstance(overlay, dict):
        return merged

    for key, value in overlay.items():
        if not has_meaningful_symbol_value(value):
            continue
        existing = merged.get(key)
        if isinstance(existing, dict) and isinstance(value, dict):
            merged[key] = merge_symbol_payload(existing, value)
        else:
            merged[key] = value
    return merged


def merge_symbol_timeframes_from_analysis(analysis: Any) -> dict[str, Any]:
    """把 analysis_board 里的 live/ab 周期信息合并成可直接喂给 symbol patch 的结构。"""
    board = analysis if isinstance(analysis, dict) else {}
    live_timeframes = board.get("live_timeframes") if isinstance(board.get("live_timeframes"), dict) else {}
    ab_context = board.get("ab_context") if isinstance(board.get("ab_context"), dict) else {}
    ab_timeframes = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
    merged: dict[str, Any] = {}
    timeframe_keys = set(live_timeframes.keys()) | set(ab_timeframes.keys())
    for tf in sorted(timeframe_keys):
        live_tf = live_timeframes.get(tf) if isinstance(live_timeframes.get(tf), dict) else {}
        ab_tf = ab_timeframes.get(tf) if isinstance(ab_timeframes.get(tf), dict) else {}
        combined = merge_symbol_payload(ab_tf, live_tf)
        latest_bar = combined.get("latest_bar") if isinstance(combined.get("latest_bar"), dict) else {}
        close_price = (
            safe_float(latest_bar.get("C"), 0.0)
            or safe_float(latest_bar.get("close"), 0.0)
            or safe_float(combined.get("price"), 0.0)
            or safe_float(combined.get("current_price"), 0.0)
            or safe_float(combined.get("last_close"), 0.0)
        )
        if close_price > 0:
            combined.setdefault("price", close_price)
            combined.setdefault("current_price", close_price)
            combined.setdefault("last_close", close_price)
        if isinstance(live_tf.get("summary"), str) and str(live_tf.get("summary")).strip():
            combined.setdefault("summary", str(live_tf.get("summary")).strip())
        merged[tf] = combined
    return merged


def preferred_symbol_timeframe(payload: Any, frames: dict[str, Any]) -> str:
    """优先按策略声明周期选择 reference timeframe。"""
    patch = payload if isinstance(payload, dict) else {}
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    pre_signal = patch.get("pre_signal") if isinstance(patch.get("pre_signal"), dict) else {}
    for candidate in (
        planned_trade.get("timeframe"),
        pre_signal.get("timeframe"),
        patch.get("timeframe"),
        "15m",
        "5m",
        "1h",
    ):
        timeframe = str(candidate or "").strip().lower()
        if timeframe and isinstance(frames.get(timeframe), dict):
            return timeframe
    for fallback in frames.keys():
        return str(fallback)
    return ""


def _signal_side_from_text(signal_text: str, frame_payload: Any) -> tuple[str, str]:
    """根据 H/L 信号文本与实时 AI 方向推断开仓方向。"""
    token, _ = _extract_signal_identity(signal_text)
    if token in {"H1", "H2"}:
        return "BUY", "long"
    if token in {"L1", "L2"}:
        return "SELL", "short"
    frame = frame_payload if isinstance(frame_payload, dict) else {}
    ai_direction = str(frame.get("ai") or "").strip().upper()
    if ai_direction == "AIL":
        return "BUY", "long"
    if ai_direction == "AIS":
        return "SELL", "short"
    return "", ""


def _analysis_quick_scan_tags(analysis: Any, preferred_tf: str) -> list[str]:
    """把 analysis_board.quick_scan 转成 symbol patch 可直接消费的 event_tags。"""
    board = analysis if isinstance(analysis, dict) else {}
    quick_scan = board.get("quick_scan") if isinstance(board.get("quick_scan"), dict) else {}
    ordered_tfs: list[str] = []
    for timeframe in (preferred_tf, "15m", "5m", "1h", "30m", "4h", "1d"):
        tf = str(timeframe or "").strip().lower()
        if tf and tf not in ordered_tfs:
            ordered_tfs.append(tf)
    for timeframe in quick_scan.keys():
        tf = str(timeframe or "").strip().lower()
        if tf and tf not in ordered_tfs:
            ordered_tfs.append(tf)

    tags: list[str] = []
    for timeframe in ordered_tfs:
        events = quick_scan.get(timeframe)
        if not isinstance(events, list):
            continue
        for event in events:
            text = str(event or "").strip()
            if text and text not in tags:
                tags.append(text)
    return tags


def _frame_latest_time(frame_payload: Any) -> str:
    """优先返回实时周期最近一根 K 线时间，供 live 预信号刷新时使用。"""
    frame = frame_payload if isinstance(frame_payload, dict) else {}
    latest_bar = frame.get("latest_bar") if isinstance(frame.get("latest_bar"), dict) else {}
    for key in ("time", "timestamp", "datetime"):
        text = str(latest_bar.get(key) or "").strip()
        if text:
            return text
    return ""


def hydrate_symbol_payload_from_analysis(payload: Any, analysis: Any) -> dict[str, Any]:
    """把 analysis_board 的 live 行情注入 symbol payload，避免 live 展示态缺价格/ATR。"""
    base = dict(payload) if isinstance(payload, dict) else {}
    if actionable_signal_identity_inconsistent(base):
        base = purge_actionable_signal_state(base)
    merged_frames = merge_symbol_timeframes_from_analysis(analysis)
    if merged_frames:
        base["timeframes"] = merge_symbol_payload(base.get("timeframes"), merged_frames)

    preferred_tf = preferred_symbol_timeframe(base, merged_frames)
    status_lower = str(base.get("status") or "").strip().lower()
    analysis_tags = _analysis_quick_scan_tags(analysis, preferred_tf)
    if analysis_tags:
        if status_lower in {"", "watching", "cooldown"}:
            base["event_tags"] = analysis_tags[:12]
        else:
            merged_tags: list[str] = []
            for item in list(base.get("event_tags") or []) + analysis_tags:
                text = str(item or "").strip()
                if text and text not in merged_tags:
                    merged_tags.append(text)
            if merged_tags:
                base["event_tags"] = merged_tags[:12]

    def _frame_price(frame_payload: Any) -> float:
        frame = frame_payload if isinstance(frame_payload, dict) else {}
        latest_bar = frame.get("latest_bar") if isinstance(frame.get("latest_bar"), dict) else {}
        return (
            safe_float(frame.get("price"), 0.0)
            or safe_float(frame.get("current_price"), 0.0)
            or safe_float(frame.get("last_close"), 0.0)
            or safe_float(latest_bar.get("C"), 0.0)
            or safe_float(latest_bar.get("close"), 0.0)
        )

    preferred_frame = merged_frames.get(preferred_tf) if isinstance(merged_frames.get(preferred_tf), dict) else {}
    current_price = (
        safe_float(base.get("current_price"), 0.0)
        or safe_float(base.get("last_price"), 0.0)
        or _frame_price(preferred_frame)
        or _frame_price(merged_frames.get("15m"))
        or _frame_price(merged_frames.get("5m"))
        or _frame_price(merged_frames.get("1h"))
    )
    if current_price > 0:
        base["current_price"] = current_price
        base["last_price"] = current_price

    atr14 = (
        safe_float(base.get("atr14"), 0.0)
        or safe_float(preferred_frame.get("atr14"), 0.0)
        or safe_float((merged_frames.get("15m") or {}).get("atr14"), 0.0)
        or safe_float((merged_frames.get("5m") or {}).get("atr14"), 0.0)
        or safe_float((merged_frames.get("1h") or {}).get("atr14"), 0.0)
    )
    if atr14 > 0:
        base["atr14"] = atr14

    ema20 = (
        safe_float(base.get("ema20"), 0.0)
        or safe_float(preferred_frame.get("ema20"), 0.0)
        or safe_float((merged_frames.get("15m") or {}).get("ema20"), 0.0)
        or safe_float((merged_frames.get("5m") or {}).get("ema20"), 0.0)
        or safe_float((merged_frames.get("1h") or {}).get("ema20"), 0.0)
    )
    if ema20 > 0:
        base["ema20"] = ema20

    summary = (
        str(base.get("market_state_detail") or "").strip()
        or str(base.get("structure_summary") or "").strip()
        or str(preferred_frame.get("summary") or "").strip()
        or str((merged_frames.get("15m") or {}).get("summary") or "").strip()
        or str((merged_frames.get("5m") or {}).get("summary") or "").strip()
        or str((merged_frames.get("1h") or {}).get("summary") or "").strip()
    )
    if summary:
        if status_lower in {"", "watching", "cooldown"}:
            base["market_state_detail"] = summary
            base["structure_summary"] = summary
        else:
            base.setdefault("market_state_detail", summary)
            base.setdefault("structure_summary", summary)

    planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
    has_action_source = bool(
        base.get("trade")
        or base.get("pre_signal")
        or planned_trade_is_actionable_source(planned_trade)
    )

    signal = ""
    signal_timeframe = ""
    for timeframe in [preferred_tf, "15m", "5m", "1h", "30m", "4h", "1d"]:
        frame = merged_frames.get(timeframe) if isinstance(merged_frames.get(timeframe), dict) else {}
        text = str(frame.get("signal") or "").strip()
        if not text:
            continue
        signal = text
        signal_timeframe = str(timeframe)
        break

    if signal and (not str(base.get("signal") or "").strip() or (not has_action_source and status_lower in {"watching", "cooldown"})):
        base["signal"] = signal
    if signal and (not str(base.get("signal_type") or "").strip() or (not has_action_source and status_lower in {"watching", "cooldown"})):
        base["signal_type"] = signal
    if signal_timeframe:
        if not str(base.get("signal_timeframe") or "").strip() or (not has_action_source and status_lower in {"watching", "cooldown"}):
            base["signal_timeframe"] = signal_timeframe
        if not str(base.get("timeframe") or "").strip() or (not has_action_source and status_lower in {"watching", "cooldown"}):
            base["timeframe"] = signal_timeframe
        pre_signal_meta = base.get("pre_signal_meta") if isinstance(base.get("pre_signal_meta"), dict) else {}
        if pre_signal_meta is not None and (
            not str(pre_signal_meta.get("timeframe") or "").strip()
            or (not has_action_source and status_lower in {"watching", "cooldown"})
        ):
            pre_signal_meta = dict(pre_signal_meta)
            pre_signal_meta["timeframe"] = signal_timeframe
            base["pre_signal_meta"] = pre_signal_meta

    if signal and not has_action_source:
        signal_frame = merged_frames.get(signal_timeframe) if isinstance(merged_frames.get(signal_timeframe), dict) else {}
        side, direction = _signal_side_from_text(signal, signal_frame)
        _, signal_price = _extract_signal_identity(signal)
        signal_time = _frame_latest_time(signal_frame)
        pre_signal = base.get("pre_signal") if isinstance(base.get("pre_signal"), dict) else {}
        if side:
            trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
            trigger_payload = dict(trigger_price)
            entry_price = safe_float(signal_price, 0.0) if signal_price is not None and signal_price > 0 else 0.0
            if entry_price > 0:
                trigger_payload["entry"] = entry_price
            pre_signal = {
                **pre_signal,
                "active": True,
                "signal": str(pre_signal.get("signal") or signal).strip(),
                "type": str(pre_signal.get("type") or signal).strip(),
                "side": str(pre_signal.get("side") or side).strip(),
                "direction": str(pre_signal.get("direction") or direction).strip(),
                "timeframe": signal_timeframe or str(pre_signal.get("timeframe") or "").strip(),
                "condition": str(
                    pre_signal.get("condition")
                    or signal_frame.get("summary")
                    or "实时扫描识别到当前 signal bar，等待 Brooks 过滤确认。"
                ).strip(),
            }
            if trigger_payload:
                pre_signal["trigger_price"] = trigger_payload
            base["pre_signal"] = pre_signal
            pre_signal_meta = base.get("pre_signal_meta") if isinstance(base.get("pre_signal_meta"), dict) else {}
            pre_signal_meta = dict(pre_signal_meta)
            if signal_timeframe:
                pre_signal_meta["timeframe"] = signal_timeframe
            if signal_time:
                pre_signal_meta["created_at"] = str(pre_signal_meta.get("created_at") or signal_time).strip()
                pre_signal_meta["updated_at"] = signal_time
                base["updated_at"] = signal_time
            base["pre_signal_meta"] = pre_signal_meta
            entry_idea = base.get("entry_idea") if isinstance(base.get("entry_idea"), dict) else {}
            if not str(entry_idea.get("side") or "").strip():
                entry_idea = dict(entry_idea)
                entry_idea["side"] = side
                base["entry_idea"] = entry_idea
            if status_lower in {"", "watching", "cooldown"}:
                base["status"] = "pre_signal"
            if not str(base.get("stage") or "").strip():
                base["stage"] = "PRE_SIGNAL"
            base.pop("last_pass_reason", None)
            base["stale_model_timeout"] = False

    live_state = ""
    for timeframe in [preferred_tf, "15m", "5m", "1h", "30m", "4h", "1d"]:
        frame = merged_frames.get(timeframe) if isinstance(merged_frames.get(timeframe), dict) else {}
        text = str(frame.get("state") or "").strip()
        if text:
            live_state = text
            break
    if live_state and (not str(base.get("market_state") or "").strip() or (not has_action_source and status_lower in {"watching", "cooldown", "pre_signal"})):
        base["market_state"] = live_state

    live_ai = ""
    for timeframe in [preferred_tf, "15m", "5m", "1h", "30m", "4h", "1d"]:
        frame = merged_frames.get(timeframe) if isinstance(merged_frames.get(timeframe), dict) else {}
        text = str(frame.get("ai") or "").strip()
        if text:
            live_ai = text
            break
    if live_ai and (not str(base.get("ai_direction") or "").strip() or (not has_action_source and status_lower in {"watching", "cooldown", "pre_signal"})):
        base["ai_direction"] = live_ai

    return normalize_actionable_signal_patch(base)


def merge_symbol_patch_with_mag_bridge(
    patch: dict[str, Any],
    frames: dict[str, Any],
) -> dict[str, Any]:
    """把 MAG 检测语义桥接回 runtime_state，同时保留主策略与 EMA gap 并行候选。"""
    if patch_is_expired_or_stale(patch):
        return dict(patch or {})
    mag_bridge = extract_mag_bridge_from_frames(frames)
    if not mag_bridge:
        return patch

    merged = dict(patch or {})

    planned_trade = merged.get("planned_trade") if isinstance(merged.get("planned_trade"), dict) else {}
    primary_context_exists = any(
        str(merged.get(field) or "").strip()
        for field in (
            "signal_type",
            "signal",
            "strategy",
            "strategy_hint",
            "strategy_family",
            "latest_strategy_family",
            "playbook_family",
            "playbook_id",
            "brooks_label",
            "management_template",
        )
    ) or any(
        str(planned_trade.get(field) or "").strip()
        for field in (
            "signal_type",
            "strategy",
            "playbook_family",
            "playbook_id",
            "brooks_label",
            "management_template",
        )
    )

    if not primary_context_exists:
        for field in (
            "signal_type",
            "signal",
            "ai_direction",
            "strategy",
            "strategy_hint",
            "strategy_family",
            "latest_strategy_family",
            "playbook_family",
            "playbook_id",
            "brooks_label",
            "management_template",
            "market_state_detail",
            "thesis",
        ):
            if not merged.get(field) and mag_bridge.get(field):
                merged[field] = mag_bridge[field]
    else:
        for field in ("market_state_detail", "thesis"):
            if not merged.get(field) and mag_bridge.get(field):
                merged[field] = mag_bridge[field]

    if mag_bridge.get("ema_gap_variant") and not merged.get("ema_gap_variant"):
        merged["ema_gap_variant"] = mag_bridge["ema_gap_variant"]

    for field in (
        "ema_gap_signal_type",
        "ema_gap_brooks_label",
        "ema_gap_management_template",
        "ema_gap_playbook_family",
        "ema_gap_playbook_id",
    ):
        if mag_bridge.get(field):
            merged[field] = mag_bridge[field]

    strategy_candidates = []
    for value in (
        merged.get("strategy_candidates"),
        merged.get("alt_strategy_families"),
        mag_bridge.get("strategy_candidates"),
        mag_bridge.get("alt_strategy_families"),
    ):
        if isinstance(value, list):
            for item in value:
                label = str(item or "").strip().upper()
                if label and label not in strategy_candidates:
                    strategy_candidates.append(label)
    if strategy_candidates:
        merged["strategy_candidates"] = strategy_candidates
        merged["alt_strategy_families"] = strategy_candidates

    next_planned_trade = dict(planned_trade)
    mag_planned_trade = mag_bridge.get("planned_trade") or {}
    if not next_planned_trade:
        next_planned_trade = dict(mag_planned_trade)
    else:
        for key in ("timeframe", "timeframes"):
            value = mag_planned_trade.get(key)
            if value not in (None, "", [], {}) and not next_planned_trade.get(key):
                next_planned_trade[key] = value
    if next_planned_trade:
        merged["planned_trade"] = next_planned_trade

    entry_idea = merged.get("entry_idea") if isinstance(merged.get("entry_idea"), dict) else {}
    next_entry_idea = dict(entry_idea)
    mag_entry_idea = mag_bridge.get("entry_idea") or {}
    if not next_entry_idea:
        next_entry_idea = dict(mag_entry_idea)
    if next_entry_idea:
        merged["entry_idea"] = next_entry_idea

    return normalize_actionable_signal_patch(merged)
