#!/usr/bin/env python3
"""live patch 状态清理与新鲜机会识别。"""

from __future__ import annotations

from typing import Any

from utils import event_has_prefix


def patch_has_fresh_live_opportunity(patch: dict[str, Any] | None) -> bool:
    """识别当前轮已经重新出现的有效机会，避免被旧的过期标记误杀。"""
    normalized = dict(patch) if isinstance(patch, dict) else {}
    if not normalized:
        return False

    signal = str(normalized.get("signal") or normalized.get("signal_type") or "").strip()
    strategy = str(
        normalized.get("playbook_id")
        or normalized.get("strategy")
        or normalized.get("playbook_family")
        or ""
    ).strip()
    events = normalized.get("event_tags") if isinstance(normalized.get("event_tags"), list) else []
    has_trigger_event = event_has_prefix(events, "signal_trigger:") or event_has_prefix(events, "hl_signal:")

    brooks_filter = normalized.get("brooks_filter") if isinstance(normalized.get("brooks_filter"), dict) else {}
    planned_trade = normalized.get("planned_trade") if isinstance(normalized.get("planned_trade"), dict) else {}
    candidate_stage = str(
        normalized.get("candidate_stage")
        or planned_trade.get("candidate_stage")
        or ""
    ).strip().upper()
    execution_mode = str(
        normalized.get("execution_mode")
        or planned_trade.get("execution_mode")
        or ""
    ).strip().upper()
    max_status = str(brooks_filter.get("max_status") or "").strip().lower()
    has_brooks_ready = bool(
        brooks_filter.get("has_signal_trigger")
        or brooks_filter.get("acceptance_ready")
        or brooks_filter.get("allow_executable")
        or max_status in {"pre_signal", "entry_ready", "entry_ready_blocked"}
    )
    has_execution_context = bool(planned_trade) or bool(candidate_stage) or bool(execution_mode)

    return bool(signal and strategy and (has_trigger_event or has_brooks_ready or has_execution_context))


def release_fresh_live_opportunity_state(patch: dict[str, Any] | None) -> dict[str, Any]:
    """发现当前轮已有新鲜机会时，去掉旧的超时/过期壳状态。"""
    normalized = dict(patch) if isinstance(patch, dict) else {}
    if not normalized:
        return {}
    if not patch_has_fresh_live_opportunity(normalized):
        return normalized

    stale_marker = "本轮模型超时，保持上一轮观察结论。"
    if str(normalized.get("last_pass_reason") or "").strip().upper() == "PRE_SIGNAL_EXPIRED":
        normalized.pop("last_pass_reason", None)
    normalized["stale_model_timeout"] = False

    for field in (
        "thesis",
        "structure_summary",
        "market_state_detail",
        "running_narrative",
        "status_reason",
    ):
        text = str(normalized.get(field) or "").strip()
        if stale_marker in text:
            cleaned = text.replace(stale_marker, "").strip(" |")
            if cleaned:
                normalized[field] = cleaned
            else:
                normalized.pop(field, None)

    pre_signal = normalized.get("pre_signal") if isinstance(normalized.get("pre_signal"), dict) else {}
    if pre_signal:
        for field in ("reason", "note", "condition"):
            text = str(pre_signal.get(field) or "").strip()
            if stale_marker in text:
                cleaned = text.replace(stale_marker, "").strip(" |")
                if cleaned:
                    pre_signal[field] = cleaned
                else:
                    pre_signal.pop(field, None)
        normalized["pre_signal"] = pre_signal

    planned_trade = normalized.get("planned_trade") if isinstance(normalized.get("planned_trade"), dict) else {}
    if planned_trade:
        why_wait = str(planned_trade.get("why_wait") or "").strip()
        if stale_marker in why_wait:
            cleaned = why_wait.replace(stale_marker, "").strip(" |")
            if cleaned:
                planned_trade["why_wait"] = cleaned
            else:
                planned_trade.pop("why_wait", None)
        normalized["planned_trade"] = planned_trade

    return normalized


def patch_is_expired_or_stale(patch: dict[str, Any] | None) -> bool:
    """统一判断 patch 是否已经过期或只是模型超时沿用的旧结论。"""
    normalized = dict(patch) if isinstance(patch, dict) else {}
    if not normalized:
        return False
    if patch_has_fresh_live_opportunity(normalized):
        return False
    if str(normalized.get("last_pass_reason") or "").strip().upper() == "PRE_SIGNAL_EXPIRED":
        return True
    if bool(normalized.get("stale_model_timeout")):
        return True

    text_values: list[str] = []
    for field in (
        "thesis",
        "structure_summary",
        "market_state_detail",
        "running_narrative",
        "status_reason",
    ):
        text = str(normalized.get(field) or "").strip()
        if text:
            text_values.append(text)
    pre_signal = normalized.get("pre_signal") if isinstance(normalized.get("pre_signal"), dict) else {}
    planned_trade = normalized.get("planned_trade") if isinstance(normalized.get("planned_trade"), dict) else {}
    for value in (
        pre_signal.get("reason"),
        pre_signal.get("note"),
        planned_trade.get("why_wait"),
    ):
        text = str(value or "").strip()
        if text:
            text_values.append(text)
    return any("本轮模型超时，保持上一轮观察结论" in text for text in text_values)
