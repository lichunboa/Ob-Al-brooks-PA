#!/usr/bin/env python3
"""AB Patrol-Agent runtime for PA交易 Crypto.

This runtime restores the old Claude patrol loop around the original
`patrol-l1` skill and S-files。实盘链以规则引擎为主，LLM 仅作为可选增强，
不会成为运行主链的硬依赖。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sys
import uuid
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

AGENT_ROOT = Path(__file__).resolve().parent.parent
if str(AGENT_ROOT) not in sys.path:
    sys.path.insert(0, str(AGENT_ROOT))

from brooks_filter import BrooksFilterMixin
from chart_manager import ChartManagerMixin
from config import Config
from http_runtime import HttpRuntimeMixin
from libs.backtest.strategy_filters import (
    classify_management_style,
    expand_strategy_context,
    normalize_management_style,
    parse_live_strategy_scope,
    resolve_live_strategy_selection,
    selection_matches_context,
)
from notification_renderer import NotificationRendererMixin
from prompt_builder import PromptBuilderMixin
from runtime_state_cleanup import prune_runtime_state
from state_manager import StateManagerMixin
from reference_selector import ReferenceSelectorMixin
from signal_analyzer import (
    frame_summary_text,
    infer_signal_timeframe,
    prompt_cached_state,
    validation_seed_state,
)
from env_loader import load_agent_env
from execution_targets import (
    build_execution_targets,
    build_symbol_exchange_map,
    normalize_exchange,
    primary_target_exchange,
)
from path_layout import data_run_dir
from providers import DecisionProviderConfig, build_decision_provider
from rule_engine import get_executable_trades
from trading.execution_intent import build_open_order_action, build_runtime_symbol_patch
from utils import (
    all_floats,
    append_jsonl,
    bar_range,
    build_execution_semantics,
    canonical_action_type,
    cap_status,
    candidate_stage_cn,
    classify_primary_s6_reference,
    combine_brooks_text,
    compact_bar_record,
    compact_json,
    compact_stats_for_prompt,
    derive_trade_execution_semantics,
    ensure_dir,
    event_has_exact,
    event_has_prefix,
    execution_mode_cn,
    first_float,
    format_ai_direction_text,
    format_gate_message,
    format_pre_signal_text,
    format_trigger_prices_text,
    has_first_entry_signal,
    has_second_entry_signal,
    has_trade_plan,
    infer_order_type_from_refs,
    infer_trade_style_from_refs,
    load_json,
    normalize_action_payload,
    normalize_refs,
    normalize_trade_side,
    order_type_cn,
    parse_dt,
    parse_structured_value,
    recent_bar_stats,
    recent_continuation_momentum,
    safe_float,
    shrink_prompt_value,
    structured_trade_semantics,
    truncate_text,
    utc_iso,
    utc_now,
    write_json,
    write_text,
)


def _infer_live_strategy_family(*values: Any) -> str:
    """从 live 运行态文本里推断策略族，避免 Web 只能看到旧口径。"""
    parts: list[str] = []
    for value in values:
        if isinstance(value, str):
            text = value.strip()
            if text:
                parts.append(text)
        elif isinstance(value, dict):
            text = json.dumps(value, ensure_ascii=False)
            if text:
                parts.append(text)
        elif isinstance(value, list):
            text = json.dumps(value, ensure_ascii=False)
            if text:
                parts.append(text)
    blob = " ".join(parts).upper()
    if not blob:
        return ""
    if "EMA_GAP_MAG" in blob or "MAG 20/20" in blob or re.search(r"(?<![A-Z0-9])MAG(?![A-Z0-9])", blob):
        return "MAG"
    if "FIRST_EMA_GAP" in blob or "第一均线缺口" in blob:
        return "第一均线缺口"
    if "EMA_GAP" in blob or "20均线缺口" in blob or "20EMA GAP" in blob:
        return "20均线缺口"
    for token in ("H1", "H2", "L1", "L2"):
        if re.search(rf"(?<![A-Z0-9]){token}(?![A-Z0-9])", blob) or f"{token}@" in blob or f":{token}@" in blob:
            return token
    return ""


def _contains_mag_text(value: Any) -> bool:
    """识别运行态里遗留的 MAG 文本标记。"""
    text = str(value or "").strip().upper()
    if not text:
        return False
    return "MAG" in text or "T3_MAG_2020_SETUP" in text or "MAG 20/20" in text


def _canonical_live_strategy_key(*values: Any) -> str:
    """把 live 侧的策略文本归一成可比较的冲突键。"""
    parts: list[str] = []
    for value in values:
        if isinstance(value, str):
            text = value.strip()
            if text:
                parts.append(text)
        elif isinstance(value, dict):
            text = json.dumps(value, ensure_ascii=False)
            if text:
                parts.append(text)
        elif isinstance(value, list):
            text = json.dumps(value, ensure_ascii=False)
            if text:
                parts.append(text)
    blob = " ".join(parts).upper()
    if not blob:
        return ""
    if "T3_MAG_2020_SETUP" in blob or "MAG 20/20" in blob:
        return "T3_MAG_2020_SETUP"
    if "T3_FIRST_EMA_GAP_REENTRY" in blob or "FIRST_EMA_GAP" in blob or "第一均线缺口" in blob:
        return "T3_FIRST_EMA_GAP_REENTRY"
    if "T3_EMA_GAP_CONTINUATION" in blob or "20EMA GAP CONTINUATION" in blob or "20均线缺口" in blob:
        return "T3_EMA_GAP_CONTINUATION"
    if "T2_BROAD_CHANNEL_RECOVERY" in blob or "BROAD CHANNEL RECOVERY" in blob or "宽通道恢复" in blob:
        return "T2_BROAD_CHANNEL_RECOVERY"
    if "T2_TREND_H2" in blob or "TREND SECOND ENTRY" in blob or "趋势二次入场" in blob:
        return "T2_TREND_H2"
    if "T1_H1_AFTER_BO" in blob or "H1/L1 AFTER BO" in blob or "首次入场" in blob:
        return "T1_H1_AFTER_BO"
    family = _infer_live_strategy_family(*values)
    if family:
        return family.upper()
    for text in parts:
        normalized = str(text).strip().upper()
        if normalized and normalized not in {"AUTO", "WAIT", "WATCH", "WATCH_ONLY"}:
            return normalized
    return ""


def _enrich_live_symbol_patch(
    patch: dict[str, Any],
    *,
    trade: dict[str, Any] | None = None,
    action: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """把规则引擎识别结果补回 symbol patch，确保 runtime_state 能带出最新策略族。"""
    enriched = dict(patch or {})
    trade_data = trade if isinstance(trade, dict) else {}
    action_data = action if isinstance(action, dict) else {}
    planned_trade = enriched.get("planned_trade") if isinstance(enriched.get("planned_trade"), dict) else {}
    planned_trade = dict(planned_trade)

    def _contains_mag_identity(value: Any) -> bool:
        text = str(value or "").strip().upper()
        return bool(text) and ("MAG" in text or "T3_MAG_2020_SETUP" in text)

    primary_contexts = [
        str(enriched.get("brooks_label") or "").strip(),
        str(enriched.get("signal_type") or "").strip(),
        str(planned_trade.get("brooks_label") or "").strip(),
    ]
    has_non_mag_primary = any(text and not _contains_mag_identity(text) for text in primary_contexts)
    if str(enriched.get("ema_gap_variant") or "").strip().upper() == "MAG" and has_non_mag_primary:
        for field in (
            "strategy",
            "strategy_hint",
            "strategy_family",
            "latest_strategy_family",
            "playbook_family",
            "playbook_id",
            "management_template",
        ):
            if _contains_mag_identity(enriched.get(field)):
                enriched.pop(field, None)
        for field in (
            "strategy",
            "playbook_family",
            "playbook_id",
            "management_template",
            "signal_type",
        ):
            if _contains_mag_identity(planned_trade.get(field)):
                planned_trade.pop(field, None)

    strategy = str(
        trade_data.get("strategy")
        or action_data.get("strategy")
        or planned_trade.get("strategy")
        or enriched.get("strategy")
        or ""
    ).strip()
    playbook_id = str(
        trade_data.get("playbook_id")
        or action_data.get("playbook_id")
        or planned_trade.get("playbook_id")
        or enriched.get("playbook_id")
        or strategy
    ).strip()
    playbook_family = str(
        trade_data.get("playbook_family")
        or action_data.get("playbook_family")
        or planned_trade.get("playbook_family")
        or enriched.get("playbook_family")
        or ""
    ).strip()
    brooks_label = str(
        planned_trade.get("brooks_label")
        or action_data.get("brooks_label")
        or enriched.get("brooks_label")
        or ""
    ).strip()
    signal_type = str(
        enriched.get("signal_type")
        or trade_data.get("signal_type")
        or action_data.get("signal_type")
        or planned_trade.get("signal_type")
        or enriched.get("signal")
        or ""
    ).strip()
    timeframes = trade_data.get("timeframes") if isinstance(trade_data.get("timeframes"), list) else []
    if timeframes and not planned_trade.get("timeframes"):
        planned_trade["timeframes"] = timeframes
    if timeframes and not planned_trade.get("timeframe"):
        planned_trade["timeframe"] = str(timeframes[0])
    if strategy and not planned_trade.get("strategy"):
        planned_trade["strategy"] = strategy
    if signal_type and not planned_trade.get("signal_type"):
        planned_trade["signal_type"] = signal_type
    if playbook_id and not planned_trade.get("playbook_id"):
        planned_trade["playbook_id"] = playbook_id
    if action_data.get("management_template") and not planned_trade.get("management_template"):
        planned_trade["management_template"] = action_data.get("management_template")
    trade_candidate_stage = str(trade_data.get("candidate_stage") or action_data.get("candidate_stage") or "").strip().upper()
    trade_execution_mode = str(trade_data.get("execution_mode") or action_data.get("execution_mode") or "").strip().upper()
    if trade_candidate_stage or trade_execution_mode:
        execution_semantics = (
            planned_trade.get("execution_semantics")
            if isinstance(planned_trade.get("execution_semantics"), dict)
            else {}
        )
        execution_semantics = dict(execution_semantics)
        if trade_candidate_stage:
            execution_semantics["candidate_stage"] = trade_candidate_stage
        if trade_execution_mode:
            execution_semantics["execution_mode"] = trade_execution_mode
        planned_trade["execution_semantics"] = execution_semantics
        if trade_candidate_stage:
            planned_trade["candidate_stage"] = trade_candidate_stage
            enriched["candidate_stage"] = trade_candidate_stage
        if trade_execution_mode:
            planned_trade["execution_mode"] = trade_execution_mode
            enriched["execution_mode"] = trade_execution_mode

    family = _infer_live_strategy_family(
        strategy,
        signal_type,
        playbook_family,
        playbook_id,
        brooks_label,
        planned_trade.get("strategy"),
        planned_trade.get("signal_type"),
        planned_trade.get("playbook_family"),
        planned_trade.get("playbook_id"),
        enriched.get("signal"),
        enriched.get("pre_signal"),
    )

    def _normalize_primary_strategy_from_family(family_value: str) -> tuple[str, str]:
        normalized_family = str(family_value or "").strip().upper()
        if normalized_family in {"H1", "L1"}:
            return ("T1: H1/L1 after BO", "T1: H1/L1 after BO")
        if normalized_family in {"H2", "L2"}:
            return ("T2: H2/L2 broad channel recovery", "T2: H2/L2 broad channel recovery")
        return ("", "")

    if family in {"H1", "L1", "H2", "L2"}:
        current_strategy = str(strategy or "").strip()
        current_playbook = str(playbook_id or "").strip()
        current_planned_strategy = str(planned_trade.get("strategy") or "").strip()
        current_planned_playbook = str(planned_trade.get("playbook_id") or "").strip()
        mag_identity_present = any(
            _contains_mag_identity(value)
            for value in (
                current_strategy,
                current_playbook,
                current_planned_strategy,
                current_planned_playbook,
                enriched.get("strategy"),
                enriched.get("playbook_id"),
            )
        )
        if mag_identity_present:
            normalized_strategy, normalized_playbook = _normalize_primary_strategy_from_family(family)
            strategy = normalized_strategy or current_strategy
            playbook_id = normalized_playbook or current_playbook or strategy
            playbook_family = family
            planned_trade["strategy"] = strategy
            planned_trade["playbook_id"] = playbook_id
            planned_trade["playbook_family"] = family
            enriched["strategy"] = strategy
            enriched["playbook_id"] = playbook_id
            enriched["playbook_family"] = family

    if family:
        enriched["latest_strategy_family"] = family
        enriched["strategy_family"] = family
        if not playbook_family:
            playbook_family = family
        if not planned_trade.get("playbook_family"):
            planned_trade["playbook_family"] = family

    if strategy:
        enriched["strategy"] = strategy
    if signal_type:
        enriched["signal_type"] = signal_type
    if playbook_id:
        enriched["playbook_id"] = playbook_id
    if playbook_family:
        enriched["playbook_family"] = playbook_family
    if brooks_label:
        enriched["brooks_label"] = brooks_label
    if planned_trade:
        enriched["planned_trade"] = planned_trade
    return enriched


def _patch_is_expired_or_stale(patch: dict[str, Any] | None) -> bool:
    """统一判断 patch 是否已经过期或只是模型超时沿用的旧结论。"""
    normalized = dict(patch) if isinstance(patch, dict) else {}
    if not normalized:
        return False
    if _patch_has_fresh_live_opportunity(normalized):
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


def _patch_has_fresh_live_opportunity(patch: dict[str, Any] | None) -> bool:
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


def _release_fresh_live_opportunity_state(patch: dict[str, Any] | None) -> dict[str, Any]:
    """发现当前轮已有新鲜机会时，去掉旧的超时/过期壳状态。"""
    normalized = dict(patch) if isinstance(patch, dict) else {}
    if not normalized:
        return {}
    if not _patch_has_fresh_live_opportunity(normalized):
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


def _extract_mag_bridge_from_frames(frames: dict[str, Any]) -> dict[str, Any]:
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
        summary_parts.append(
            f"{item['timeframe']}:{item['mag_type']}:{item['market_state'] or '-'}"
        )
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


def _merge_symbol_patch_with_mag_bridge(
    patch: dict[str, Any],
    frames: dict[str, Any],
) -> dict[str, Any]:
    """把 MAG 检测语义桥接回 runtime_state，同时保留主策略与 EMA gap 并行候选。"""
    if _patch_is_expired_or_stale(patch):
        return dict(patch or {})
    mag_bridge = _extract_mag_bridge_from_frames(frames)
    if not mag_bridge:
        return patch

    merged = dict(patch or {})

    # 已有主策略上下文时，MAG 只能作为辅助候选存在，不能反客为主地覆盖顶层身份。
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

    return merged

# 2026-03-09: 导入优化模块（7 个核心优化）
try:
    from pa_runtime_optimizations import (
        validate_trader_equation,
        simplify_status,
        validate_signal_bar,
        calculate_context_score,
        should_trigger_deep_analysis,
        extract_trigger_timeframes,
        detect_scalp_trigger,
        scalp_fast_lane,
        FearDetector,
        validate_h1_entry,
    )
    OPTIMIZATIONS_ENABLED = True
    LOG_OPTIMIZATION = lambda msg: LOG.info(f"[OPTIMIZATION] {msg}")
except ImportError as e:
    OPTIMIZATIONS_ENABLED = False
    LOG_OPTIMIZATION = lambda msg: LOG.warning(f"[OPTIMIZATION-DISABLED] {msg}")
    LOG.warning(f"优化模块导入失败，使用原始逻辑: {e}")

LOG = logging.getLogger("ab_patrol_runtime")
PRE_SIGNAL_DEFAULT_TTL_SECONDS = {
    "5m": 25 * 60,
    "15m": 45 * 60,
    "30m": 90 * 60,
    "1h": 180 * 60,
}
PRE_SIGNAL_EXTENSION_SECONDS = {
    "5m": 15 * 60,
    "15m": 30 * 60,
    "30m": 60 * 60,
    "1h": 60 * 60,
}
MODEL_TRANSIENT_FIELDS = (
    "priority",
    "priority_score",
    "priority_note",
    "align_score",
    "ai_direction",
    "market_state",
    "market_state_detail",
    "structure_summary",
    "running_narrative",
    "pre_signal",
    "pre_signal_meta",
    "signal",
    "key_levels",
    "entry_idea",
    "evaluation",
    "thesis",
    "scenarios",
    "trade",
    "timeframes",
    "refs",
    "ema20",
    "atr14",
    "ema20_5m",
    "atr14_5m",
    "ema20_15m",
    "atr14_15m",
    "last_price",
    "last_signal",
    "last_quick_scan_state",
    "bc_sc_guard",
    "summary",
    "decision",
    "reason",
    "next_trigger",
    "source_cycle_id",
    "updated_at",
    "updated_by",
)

class PatrolRuntime(
    NotificationRendererMixin,
    PromptBuilderMixin,
    StateManagerMixin,
    HttpRuntimeMixin,
    ChartManagerMixin,
    BrooksFilterMixin,
    ReferenceSelectorMixin,
):
    def __init__(self, config: Config):
        self.config = config
        self.state_dir = config.data_root / "state"
        self.logs_dir = config.data_root / "logs" / "decision"
        self.cycles_dir = config.data_root / "cycles"
        self.journal_dir = config.data_root / "journal"
        self.run_dir = data_run_dir(config.agent_root)
        self.runtime_state_path = self.state_dir / "runtime_state.json"
        self.next_scan_path = self.state_dir / "next_scan.json"
        self.market_state_path = config.data_root / "market_state_l1.json"
        self.pid_path = self.run_dir / "service.pid"
        self.log_path = self.run_dir / "service.log"
        self.trigger_ack_path = self.state_dir / "patrol-l1-trigger.ack.json"
        self.last_trigger_mtime = 0
        self.last_trigger_digest = ""
        self.chart_refresh_state: dict[str, float] = {}
        self.chart_generation_disabled_reason: str | None = None
        self.market_fetch_cache: dict[str, dict[str, Any]] = {}
        self.ab_context_cache: dict[str, dict[str, Any]] = {}
        self.chart_context_cache: dict[str, dict[str, Any]] = {}
        self.decision_provider = build_decision_provider(
            DecisionProviderConfig(
                provider=config.decision_provider,
                llm_agent=config.llm_agent,
                api_base=config.decision_api_base,
                api_key=config.decision_api_key,
                model=config.decision_model,
                timeout_seconds=config.decision_timeout_seconds,
                agent_root=str(config.agent_root),
                knowledge_root=str(config.knowledge_root),
                session_state_path=str(config.data_root / "state" / "decision_session.json"),
            )
        )

        ensure_dir(self.state_dir)
        ensure_dir(self.logs_dir)
        ensure_dir(self.cycles_dir)
        ensure_dir(self.journal_dir)
        ensure_dir(self.run_dir)

    def execution_port(self) -> int:
        parsed = urllib.parse.urlparse(self.config.execution_base)
        return parsed.port or 8092

    def execution_targets(self) -> dict[str, dict[str, Any]]:
        """返回当前启用的交易所执行/监控目标。"""
        return build_execution_targets(
            self.config.agent_root,
            self.configured_exchange(),
            self.config.execution_base,
        )

    def execution_symbol_routes(self) -> dict[str, str]:
        """返回品种到交易所的映射。"""
        return build_symbol_exchange_map(self.execution_targets())

    def exchange_for_symbol(self, symbol: str | None) -> str:
        """根据品种返回应路由到的交易所。"""
        normalized_symbol = str(symbol or "").strip().upper()
        routes = self.execution_symbol_routes()
        if normalized_symbol and normalized_symbol in routes:
            return routes[normalized_symbol]
        return self.configured_exchange()

    def execution_target_for_symbol(self, symbol: str | None) -> dict[str, Any]:
        """返回品种所属的 execution target。"""
        exchange = self.exchange_for_symbol(symbol)
        targets = self.execution_targets()
        return dict(targets.get(exchange) or targets.get(self.configured_exchange()) or {})

    def execution_base_for_symbol(self, symbol: str | None) -> str:
        """返回品种所属的 execution-service base URL。"""
        target = self.execution_target_for_symbol(symbol)
        return str(target.get("base_url") or self.config.execution_base).rstrip("/")

    def execution_port_for_symbol(self, symbol: str | None) -> int:
        """返回品种所属的 execution-service 端口。"""
        parsed = urllib.parse.urlparse(self.execution_base_for_symbol(symbol))
        return parsed.port or 8092

    def all_monitored_exchanges(self) -> list[str]:
        """返回当前巡逻需要监控的交易所列表。"""
        return list(self.execution_targets().keys())

    def configured_exchange(self) -> str:
        exchange = (
            os.getenv("AB_PATROL_EXECUTION_EXCHANGE")
            or os.getenv("AB_PATROL_EXCHANGE")
            or "binance"
        ).strip().lower()
        targets = build_execution_targets(
            self.config.agent_root,
            normalize_exchange(exchange),
            self.config.execution_base,
        )
        return primary_target_exchange(targets, exchange)

    def configured_market_profile(self) -> str:
        exchanges = self.all_monitored_exchanges()
        if len(exchanges) > 1:
            return "multi_exchange"
        exchange = self.configured_exchange()
        if exchange == "ctrader":
            return "multi_asset"
        if exchange == "okx":
            return "crypto_swap"
        return "crypto"

    def default_watch_symbols(self) -> list[str]:
        symbols: list[str] = []
        for target in self.execution_targets().values():
            for symbol in target.get("symbols") or []:
                normalized = str(symbol).strip().upper()
                if normalized and normalized not in symbols:
                    symbols.append(normalized)
        return symbols

    def configured_runtime_title(self) -> str:
        exchange = self.configured_exchange()
        if exchange == "ctrader":
            return "PA交易 Multi-Asset"
        if exchange == "okx":
            return "PA交易 OKX"
        return "PA交易 Crypto"

    def runtime_symbol_universe(self, runtime: dict[str, Any], symbol_state: dict[str, Any] | None = None) -> set[str]:
        """汇总当前实盘链允许保留的品种宇宙。"""
        values: list[Any] = [
            *self.default_watch_symbols(),
            *((runtime.get("focus_symbols") or []) if isinstance(runtime, dict) else []),
            *((runtime.get("active_symbols") or []) if isinstance(runtime, dict) else []),
        ]
        if isinstance(symbol_state, dict):
            values.extend(symbol_state.keys())
        return {
            str(symbol).strip().upper()
            for symbol in values
            if str(symbol).strip()
        }

    def align_market_cache(self, runtime: dict[str, Any], market_cache: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(market_cache, dict):
            market_cache = {}
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        meta = market_cache.get("_meta") if isinstance(market_cache.get("_meta"), dict) else {}
        configured_exchange = self.configured_exchange()
        configured_profile = self.configured_market_profile()
        configured_symbols = self.default_watch_symbols()
        configured_symbol_set = {str(symbol).upper() for symbol in configured_symbols}
        cached_symbol_set = {str(symbol).upper() for symbol in symbol_cache.keys()}

        runtime_exchange = str(runtime.get("exchange") or "").strip().lower()
        runtime_profile = str(runtime.get("market_profile") or "").strip().lower()
        cache_exchange = str(meta.get("exchange") or "").strip().lower()
        cache_profile = str(meta.get("market_profile") or "").strip().lower()

        reset_reason = ""
        if runtime_exchange and runtime_exchange != configured_exchange:
            reset_reason = f"runtime_exchange:{runtime_exchange}->{configured_exchange}"
        elif runtime_profile and runtime_profile != configured_profile:
            reset_reason = f"runtime_profile:{runtime_profile}->{configured_profile}"
        elif cache_exchange and cache_exchange != configured_exchange:
            reset_reason = f"cache_exchange:{cache_exchange}->{configured_exchange}"
        elif cache_profile and cache_profile != configured_profile:
            reset_reason = f"cache_profile:{cache_profile}->{configured_profile}"
        elif cached_symbol_set and configured_symbol_set and not (cached_symbol_set & configured_symbol_set):
            reset_reason = "symbol_universe_mismatch"

        if reset_reason:
            LOG.info(
                "[MARKET_CACHE] 检测到运行配置切换，重置缓存: %s | symbols=%s",
                reset_reason,
                sorted(cached_symbol_set),
            )
            market_cache["symbols"] = {}
            market_cache["last_full_refresh"] = None
            meta["last_reset_at"] = utc_iso()
            meta["last_reset_reason"] = reset_reason

        meta["exchange"] = configured_exchange
        meta["market_profile"] = configured_profile
        meta["configured_symbols"] = configured_symbols
        market_cache["_meta"] = meta

        if configured_symbol_set:
            stale_symbols = [
                str(symbol).upper()
                for symbol in list(symbol_cache.keys())
                if str(symbol).upper() not in configured_symbol_set
            ]
            if stale_symbols:
                LOG.info(
                    "[MARKET_CACHE] 清理已移出配置的残留品种: %s",
                    stale_symbols,
                )
                for symbol in stale_symbols:
                    symbol_cache.pop(symbol, None)
                market_cache["symbols"] = symbol_cache

        if reset_reason:
            write_json(self.market_state_path, market_cache)
        return market_cache














    def select_phase_plan(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        trigger: dict[str, Any] | None,
    ) -> dict[str, Any]:
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        configured_symbols = [str(symbol).upper() for symbol in self.default_watch_symbols()]
        configured_symbol_set = set(configured_symbols)
        cached_symbols = [
            str(symbol).upper()
            for symbol in symbol_cache.keys()
            if str(symbol).upper() in configured_symbol_set
        ]
        active_symbols = list(dict.fromkeys(cached_symbols + configured_symbols))
        positions = self._tracked_bot_positions(execution)
        trigger_symbol = str(trigger.get("symbol") or "").upper() if trigger else ""
        has_positions = bool(positions)

        loop_seq = int(runtime.get("loop_seq") or 0) + 1
        quiet_loops = int(runtime.get("quiet_loops") or 0)
        last_full_refresh = parse_dt(runtime.get("last_full_refresh_at") or market_cache.get("last_full_refresh"))
        needs_full_refresh = not runtime or not symbol_cache
        full_refresh_reason = "cold_start" if needs_full_refresh else ""
        if last_full_refresh and utc_now() - last_full_refresh > timedelta(hours=1):
            needs_full_refresh = True
            full_refresh_reason = "stale_over_1h"
        if loop_seq % 6 == 0:
            needs_full_refresh = True
            full_refresh_reason = "anti_stale_cycle"
        if quiet_loops >= 3:
            needs_full_refresh = True
            full_refresh_reason = "quiet_loop_threshold"
        if runtime.get("needs_post_trade_refresh"):
            needs_full_refresh = True
            full_refresh_reason = "post_trade_refresh"
        if any(int((symbol_cache.get(symbol) or {}).get("consecutive_watching") or 0) >= 6 for symbol in active_symbols):
            needs_full_refresh = True
            full_refresh_reason = "stale_symbol_threshold"
        if trigger and trigger.get("trigger_type") in {"manual_refresh", "full_refresh"}:
            needs_full_refresh = True
            full_refresh_reason = str(trigger.get("trigger_type"))

        def status_rank(symbol: str) -> tuple[int, int, int]:
            item = symbol_cache.get(symbol, {})
            status = str(item.get("status") or "watching")
            rank_map = {
                "entry_ready": 0,
                "entry_ready_blocked": 0,
                "pre_signal": 1,
                "watching": 2,
            }
            priority = int(item.get("priority") or 9)
            align = int(item.get("align_score") or 0)
            return (0 if symbol == trigger_symbol else 1, rank_map.get(status, 3), priority - align)

        focus_symbols = sorted(active_symbols, key=status_rank)
        if has_positions:
            phase = "MANAGE"
            refs = [
                "S2-direction.md",
                "S3b-key-levels.md",
                "S5-evaluation.md",
                "S6-common.md",
                "S7-management.md",
            ]
            summary = "存在持仓，优先执行 premise check / 止损管理 / 退出管理。"
        elif needs_full_refresh:
            phase = "BOOTSTRAP"
            refs = [
                "S0-daily-bias.md",
                "S1-reading.md",
                "S2-direction.md",
                "S3-market-state.md",
                "S3b-key-levels.md",
                "S4-strategy-match.md",
                "S5-evaluation.md",
                "S6-common.md",
                "S6-bo.md",
                "S6-channel.md",
                "S6-tr.md",
                "S7-management.md",
            ]
            summary = "冷启动或缓存过期，执行全刷新并重建 daily bias / structure / scenarios。"
        elif any(str(symbol_cache.get(symbol, {}).get("status") or "") in {"entry_ready", "entry_ready_blocked", "pre_signal"} for symbol in focus_symbols):
            phase = "ENTRY_READY"
            refs = [
                "S2-direction.md",
                "S3-market-state.md",
                "S3b-key-levels.md",
                "S4-strategy-match.md",
                "S5-evaluation.md",
                "S6-common.md",
                "S6-bo.md",
                "S6-channel.md",
                "S6-tr.md",
                "S7-management.md",
            ]
            summary = "存在 pre-signal / entry-ready 候选，进入评估与执行窗口。"
        else:
            phase = "SCAN"
            refs = [
                "S2-direction.md",
                "S3-market-state.md",
                "S3b-key-levels.md",
                "S4-strategy-match.md",
                "S5-evaluation.md",
                "S6-common.md",
                "S6-bo.md",
                "S6-channel.md",
                "S6-tr.md",
            ]
            summary = "无持仓且暂无明确执行窗口，维持扫描与监控。"

        return {
            "phase": phase,
            "summary": summary,
            "full_refresh": needs_full_refresh,
            "full_refresh_reason": full_refresh_reason or None,
            "focus_symbols": focus_symbols,
            "manage_symbols": [str(item.get("symbol")) for item in positions],
            "prompt_references": refs,
            "trigger_symbol": trigger_symbol or None,
        }















    def invoke_decision_provider(
        self,
        system_text: str,
        user_text: str,
        *,
        request_name: str = "last_request.md",
        response_name: str = "last_response.json",
    ) -> tuple[dict[str, Any], str]:
        result = self.decision_provider.invoke(
            system_text,
            user_text,
            self.logs_dir,
            request_name=request_name,
            response_name=response_name,
        )
        return result.payload, result.response_text, {"session_id": result.session_id, "model": result.model}

    def repair_decision_json(self, response_text: str, error: json.JSONDecodeError) -> dict[str, Any]:
        write_text(self.logs_dir / "last_invalid_response.txt", response_text)
        repair_system = "\n".join(
            [
                "You repair malformed JSON emitted by AB Patrol-Agent.",
                "Return raw JSON only.",
                "Do not add commentary, markdown, code fences, or explanations.",
                "Preserve the original meaning and fields.",
                "Only fix JSON syntax, escaping, commas, brackets, and quotes needed to make it parse.",
                "All human-readable narrative fields must remain in Simplified Chinese.",
            ]
        )
        repair_user = "\n\n".join(
            [
                "The previous model output was almost valid JSON but failed to parse.",
                f"JSON error: {error}",
                "Fix the JSON below and return the corrected raw JSON only.",
                "",
                response_text,
            ]
        )
        _, repaired_text, _ = self.invoke_decision_provider(
            repair_system,
            repair_user,
            request_name="last_repair_request.md",
            response_name="last_repair_response.json",
        )
        write_text(self.logs_dir / "last_repaired_response.txt", repaired_text)
        return self.extract_decision(repaired_text)

    def extract_decision(self, response_text: str) -> dict[str, Any]:
        text = response_text.strip()
        if not text:
            raise RuntimeError("empty model response")
        if text.startswith("```"):
            text = text.strip("`")
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                raise
            return json.loads(text[start : end + 1])

    def validate_decision(
        self,
        decision: dict[str, Any],
        phase_plan: dict[str, Any],
        ref_names: list[str],
        market_cache: dict[str, Any],
        analysis_board: dict[str, Any],
        quick_scan_events: dict[str, Any],
    ) -> dict[str, Any]:
        if not isinstance(decision, dict):
            raise RuntimeError("decision must be object")
        decision.setdefault("phase", phase_plan["phase"])
        decision.setdefault("market_summary", "No summary.")
        decision.setdefault("focus_symbols", phase_plan["focus_symbols"])
        decision.setdefault("symbol_updates", {})
        decision.setdefault("actions", [])
        decision.setdefault("position_management", [])
        decision.setdefault("next_scan_seconds", 120)
        decision.setdefault("next_scan_reason", "PRE_SIGNAL_NEAR")
        decision.setdefault("state_patch", {})
        decision.setdefault("explanation", "")

        decision["actions"] = [normalize_action_payload(item) for item in (decision.get("actions") or [])]
        decision["position_management"] = [normalize_action_payload(item) for item in (decision.get("position_management") or [])]

        raw_updates = decision.get("symbol_updates") or {}
        if isinstance(raw_updates, list):
            normalized_updates: dict[str, Any] = {}
            for item in raw_updates:
                if not isinstance(item, dict):
                    continue
                symbol = str(item.get("symbol") or "").upper()
                if not symbol:
                    continue
                normalized = {k: v for k, v in item.items() if k != "symbol"}
                if normalized.get("summary") and not normalized.get("thesis"):
                    normalized["thesis"] = normalized.get("summary")
                if normalized.get("next_trigger") and not normalized.get("pre_signal"):
                    normalized["pre_signal"] = normalized.get("next_trigger")
                if normalized.get("decision") and not normalized.get("running_narrative"):
                    normalized["running_narrative"] = normalized.get("decision")
                normalized_updates[symbol] = normalized
            raw_updates = normalized_updates
        if not isinstance(raw_updates, dict):
            raw_updates = {}
        decision["symbol_updates"] = raw_updates

        state_patch = decision.get("state_patch") if isinstance(decision.get("state_patch"), dict) else {}
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        merged_updates: dict[str, Any] = {}
        for symbol in decision.get("focus_symbols") or phase_plan["focus_symbols"]:
            key = str(symbol).upper()
            cached = symbol_cache.get(key, {})
            analysis = analysis_board.get(key) if isinstance(analysis_board.get(key), dict) else {}
            ab_context = analysis.get("ab_context") if isinstance(analysis.get("ab_context"), dict) else {}
            frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
            primary_5m = frames.get("5m") if isinstance(frames.get("5m"), dict) else {}
            primary_15m = frames.get("15m") if isinstance(frames.get("15m"), dict) else {}
            primary_1h = frames.get("1h") if isinstance(frames.get("1h"), dict) else {}
            patch = raw_updates.get(key) or raw_updates.get(symbol) or {}
            if not isinstance(patch, dict):
                patch = {}
            base = validation_seed_state(cached) if isinstance(cached, dict) else {}
            patch_from_state = state_patch.get(key) if isinstance(state_patch.get(key), dict) else {}
            if patch_from_state:
                base.update({k: v for k, v in patch_from_state.items() if v is not None})
            base.update({k: v for k, v in patch.items() if v is not None})
            base = _merge_symbol_patch_with_mag_bridge(base, frames)
            base.setdefault("status", base.get("status") or "watching")
            base.setdefault("stage", phase_plan["phase"])
            base.setdefault("priority", base.get("priority") or 9)
            if not base.get("align_score") and ab_context.get("alignment_score") is not None:
                base["align_score"] = ab_context.get("alignment_score")
            if not base.get("signal"):
                base["signal"] = primary_5m.get("signal") or primary_15m.get("signal") or ab_context.get("best_signal")
            if not base.get("ai_direction"):
                base["ai_direction"] = primary_5m.get("ai") or primary_15m.get("ai") or ab_context.get("dominant_direction")
            if not base.get("market_state"):
                base["market_state"] = primary_5m.get("state") or primary_15m.get("state")
            event_tags = self.flatten_events(quick_scan_events.get(key) or quick_scan_events.get(symbol))
            if event_tags:
                base["event_tags"] = event_tags[:12]
            if not base.get("timeframes") and frames:
                base["timeframes"] = {
                    timeframe: {
                        "ai": frame.get("ai"),
                        "state": frame.get("state"),
                        "signal": frame.get("signal"),
                        "summary": frame.get("summary"),
                    }
                    for timeframe, frame in frames.items()
                    if isinstance(frame, dict)
                }
            frame_notes = [
                f"{label}: {frame_summary_text(frame)}"
                for label, frame in (("5m", primary_5m), ("15m", primary_15m), ("1h", primary_1h))
                if isinstance(frame, dict) and frame_summary_text(frame)
            ]
            if not base.get("market_state_detail") and frame_notes:
                base["market_state_detail"] = " | ".join(frame_notes)[:280]
            if not base.get("structure_summary") and frame_notes:
                base["structure_summary"] = " | ".join(frame_notes)[:320]
            if not base.get("thesis"):
                base["thesis"] = base.get("market_state_detail") or base.get("structure_summary")
            if not base.get("running_narrative"):
                base["running_narrative"] = base.get("thesis")
            if not base.get("key_levels"):
                supports: list[Any] = []
                resistances: list[Any] = []
                for frame in (primary_5m, primary_15m, primary_1h):
                    sr = frame.get("ab_sr") if isinstance(frame.get("ab_sr"), dict) else {}
                    if sr.get("nearest_support") not in supports and sr.get("nearest_support") is not None:
                        supports.append(sr.get("nearest_support"))
                    if sr.get("nearest_resistance") not in resistances and sr.get("nearest_resistance") is not None:
                        resistances.append(sr.get("nearest_resistance"))
                if supports or resistances:
                    base["key_levels"] = {
                        "support": supports[:4],
                        "resistance": resistances[:4],
                    }
            inferred_refs = [
                ref
                for ref in self.symbol_reference_hints(
                    status=str(base.get("status") or ""),
                    state=str(base.get("market_state") or ""),
                    events=event_tags,
                    consecutive_watching=int(base.get("consecutive_watching") or 0),
                )
                if ref in ref_names
            ]
            normalized_refs = [ref for ref in normalize_refs(base.get("refs")) if ref in ref_names]
            if normalized_refs:
                extra_refs = [ref for ref in inferred_refs if ref not in normalized_refs]
                base["refs"] = normalized_refs + extra_refs
            elif inferred_refs:
                base["refs"] = inferred_refs
            elif ref_names:
                base["refs"] = ref_names[: min(3, len(ref_names))]
            if not base.get("entry_idea"):
                base["entry_idea"] = {
                    "side": "WAIT",
                    "entry_zone": truncate_text(base.get("pre_signal") or "", 220),
                    "sl_reference": "",
                    "tp_reference": "",
                    "style": "WAIT",
                }
            if not base.get("evaluation"):
                base["evaluation"] = {
                    "p_estimate": None,
                    "r_estimate": None,
                    "equation_value": None,
                    "threshold_rhs": None,
                    "passes_price_action": str(base.get("status") or "").lower() in {"entry_ready", "entry_ready_blocked"},
                    "passes_execution_gate": None,
                }
            if not base.get("scenarios"):
                base["scenarios"] = []
            planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
            pre_signal = base.get("pre_signal") if isinstance(base.get("pre_signal"), dict) else {}
            trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
            planned_entry_zone = planned_trade.get("entry_zone")
            planned_entry_zone_label = str(planned_trade.get("entry_zone_label") or "").strip()
            if not planned_entry_zone:
                for zone_key in ("entry_zone", "retest_zone", "breakout_zone", "breakdown_zone"):
                    zone_value = trigger_price.get(zone_key)
                    if zone_value:
                        planned_entry_zone = zone_value
                        planned_entry_zone_label = zone_key
                        break
            planned_entry = (
                first_float(planned_trade.get("entry_price"))
                or first_float(trigger_price.get("entry"))
                or first_float(trigger_price.get("breakdown"))
                or first_float(trigger_price.get("breakout"))
            )
            planned_sl = first_float(planned_trade.get("stop_loss")) or first_float(trigger_price.get("stop_loss"))
            planned_tp = first_float(planned_trade.get("take_profit")) or first_float(trigger_price.get("take_profit"))
            planned_side = normalize_trade_side(
                planned_trade.get("side")
                or (base.get("entry_idea") or {}).get("side")
                or {"long": "BUY", "short": "SELL"}.get(str(pre_signal.get("direction") or "").lower(), "")
            )
            inferred_style = infer_trade_style_from_refs(
                market_state=str(base.get("market_state") or ""),
                refs=normalize_refs(base.get("refs")),
                explicit_style=str((base.get("entry_idea") or {}).get("style") or planned_trade.get("style") or ""),
            )
            inferred_order_type = infer_order_type_from_refs(
                market_state=str(base.get("market_state") or ""),
                refs=normalize_refs(base.get("refs")),
                explicit_order_type=str(planned_trade.get("order_type") or ""),
                has_price=planned_entry is not None or planned_entry_zone is not None,
            )
            if planned_entry is not None or planned_entry_zone is not None or planned_sl is not None or planned_tp is not None:
                base["planned_trade"] = {
                    "side": planned_side,
                    "entry_price": planned_entry,
                    "entry_zone": planned_entry_zone,
                    "entry_zone_label": planned_entry_zone_label,
                    "stop_loss": planned_sl,
                    "take_profit": planned_tp,
                    "style": inferred_style,
                    "order_type": inferred_order_type,
                    "risk_percent": planned_trade.get("risk_percent"),
                    "invalid_if": planned_trade.get("invalid_if") or pre_signal.get("invalid_if"),
                }
            if "trade" not in base:
                base["trade"] = None
            if _patch_has_fresh_live_opportunity(base):
                base = _release_fresh_live_opportunity_state(base)
            base = self.apply_brooks_filter_to_patch(base, event_tags)
            if _patch_has_fresh_live_opportunity(base):
                base = _release_fresh_live_opportunity_state(base)
            # 过期/超时的旧结论不能在 validate 阶段再次被 Brooks 过滤器播种回 pre_signal/planned_trade。
            if _patch_is_expired_or_stale(base):
                base = self._clear_expired_live_symbol_state(base)
            merged_updates[key] = base
        for symbol, patch in (decision.get("symbol_updates") or {}).items():
            key = str(symbol).upper()
            if key not in merged_updates and isinstance(patch, dict):
                merged_updates[key] = patch
        decision["symbol_updates"] = merged_updates
        decision["symbols"] = merged_updates

        for action in decision.get("actions") or []:
            if not isinstance(action, dict):
                continue
            # 当前无论是否命中 Brooks 过滤器，最终都以规则引擎候选为主
            action["type"] = canonical_action_type(action.get("type"))
            action["refs"] = [ref for ref in normalize_refs(action.get("refs")) if ref in ref_names]
            if not action["refs"] and ref_names:
                action["refs"] = ref_names[:2]
        for action in decision.get("position_management") or []:
            if not isinstance(action, dict):
                continue
            action["type"] = canonical_action_type(action.get("type"))
            action["refs"] = [ref for ref in normalize_refs(action.get("refs")) if ref in ref_names]
            if not action["refs"] and ref_names:
                action["refs"] = ref_names[:2]
        return decision

    def action_risk_percent(self, action: dict[str, Any], execution: dict[str, Any]) -> float:
        if action.get("risk_percent") is not None:
            return max(0.1, safe_float(action.get("risk_percent"), 1.0))
        allocated = safe_float(((execution.get("bot_summary") or {}).get("config") or {}).get("allocated_usdt"), 0.0)
        risk_usdt = safe_float(action.get("risk_usdt"), 0.0)
        if allocated > 0 and risk_usdt > 0:
            return max(0.1, risk_usdt / allocated * 100)
        intent = str(action.get("intent") or action.get("raw_type") or "").upper()
        if intent in {"ADD_ON", "SCALE_IN"}:
            # S7-management 首个加仓风险 0.3%。
            return 0.3
        if intent == "PYRAMID_ADD":
            # S7-management 第三笔/最后一笔加仓风险 0.3%。
            return 0.3
        # 首仓默认按 0.4% 起步，后续两次加仓各 0.3%。
        return 0.4

    @staticmethod
    def _position_field(position: Any, key: str, default: Any = None) -> Any:
        if isinstance(position, dict):
            return position.get(key, default)
        return getattr(position, key, default)

    def validate_scale_in(self, action: dict[str, Any], execution: dict[str, Any]) -> tuple[bool, str]:
        """只允许向盈利仓位加仓，对齐 Brooks 的 winner scaling。"""
        intent = str(action.get("intent") or "").upper()
        if intent not in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"}:
            return True, ""

        symbol = str(action.get("symbol") or "").upper()
        positions = self._tracked_bot_positions(execution)
        live_position = next(
            (
                item
                for item in positions
                if isinstance(item, dict) and str(item.get("symbol") or "").upper() == symbol
            ),
            {},
        )
        if not live_position:
            return False, "S7 加仓需要先有同品种持仓"

        action_side = str(action.get("side") or "").upper()
        live_side = str(
            live_position.get("side")
            or live_position.get("direction")
            or live_position.get("position_side")
            or ""
        ).upper()
        if not live_side:
            qty = safe_float(live_position.get("quantity")) or safe_float(live_position.get("contracts"))
            if qty > 0:
                live_side = "BUY"
            elif qty < 0:
                live_side = "SELL"
        if live_side and live_side != action_side:
            return False, "S7 加仓方向必须与现有持仓一致"

        entry_price = (
            safe_float(live_position.get("entry_price"))
            or safe_float(live_position.get("entryPrice"))
            or safe_float(action.get("entry"))
        )
        current_price = (
            safe_float(live_position.get("current_price"))
            or safe_float(live_position.get("mark_price"))
            or safe_float(live_position.get("last_price"))
            or safe_float(action.get("entry"))
        )
        stop_loss = safe_float(live_position.get("stop_loss")) or safe_float(action.get("sl"))
        initial_risk = abs(entry_price - stop_loss)
        if entry_price <= 0 or current_price <= 0 or initial_risk <= 0:
            return False, "S7 加仓缺少有效的 entry/current/stop 信息"

        if action_side == "BUY":
            open_r = (current_price - entry_price) / initial_risk
            protected = stop_loss >= entry_price
        else:
            open_r = (entry_price - current_price) / initial_risk
            protected = stop_loss <= entry_price

        minimum_r = 0.9 if intent == "PYRAMID_ADD" else 0.25
        if open_r < minimum_r:
            return False, f"S7 加仓只允许加盈利仓位，当前仅走出 {open_r:.2f}R"
        if intent == "PYRAMID_ADD" and not protected:
            return False, "S7 第三笔加仓前，旧仓止损必须至少抬到保本"
        return True, f"S7 加仓通过，当前浮盈 {open_r:.2f}R"

    def format_ai_direction(self, value: Any) -> str:
        if isinstance(value, dict):
            direction = str(value.get("value") or "").strip()
            detail = str(value.get("detail") or "").strip()
            if direction and detail:
                return f"{direction} | {detail}"
            return direction or detail
        return str(value or "").strip()

    def normalize_ai_direction_token(self, value: Any) -> str:
        text = str(value or "").strip().upper()
        if not text:
            return ""
        if text in {"AIL", "BUY", "LONG", "BULL", "UP"}:
            return "AIL"
        if text in {"AIS", "SELL", "SHORT", "BEAR", "DOWN"}:
            return "AIS"
        return text

    def ai_direction_is_gate_ready(self, value: str) -> bool:
        text = str(value or "").strip()
        if not text:
            return False
        hits = re.findall(r"(?:5m|15m|1h|4h)\s*:\s*AI[SL]", text, flags=re.IGNORECASE)
        return len(hits) >= 3

    def build_action_ai_direction(self, patch: dict[str, Any], action: dict[str, Any]) -> str:
        existing = str(action.get("ai_direction") or "").strip()
        if self.ai_direction_is_gate_ready(existing):
            return existing
        timeframes = patch.get("timeframes") if isinstance(patch.get("timeframes"), dict) else {}
        parts: list[str] = []
        for timeframe in ("5m", "15m", "1h", "4h"):
            item = timeframes.get(timeframe) if isinstance(timeframes.get(timeframe), dict) else {}
            ai = self.normalize_ai_direction_token(item.get("ai"))
            if ai:
                parts.append(f"{timeframe}:{ai}")
        if parts:
            joined = " ".join(parts)
            if self.ai_direction_is_gate_ready(joined):
                return joined
        patch_value = self.format_ai_direction(patch.get("ai_direction"))
        normalized_patch = self.normalize_ai_direction_token(patch_value)
        if normalized_patch in {"AIL", "AIS"}:
            patch_value = f"5m:{normalized_patch} 15m:{normalized_patch} 1h:{normalized_patch} 4h:{normalized_patch}"
        if self.ai_direction_is_gate_ready(patch_value):
            return patch_value
        side = normalize_trade_side(action.get("side"))
        if side == "BUY":
            return "5m:AIL 15m:AIL 1h:AIL 4h:AIL"
        if side == "SELL":
            return "5m:AIS 15m:AIS 1h:AIS 4h:AIS"
        return existing or patch_value

    def build_action_bar_reading(self, patch: dict[str, Any], action: dict[str, Any]) -> str:
        parts: list[str] = []
        existing = str(action.get("bar_reading") or "").strip()
        signal = str(patch.get("signal") or "").strip()
        market_state = str(patch.get("market_state") or "").strip()
        structure = str(patch.get("structure_summary") or patch.get("thesis") or "").strip()
        event_tags = patch.get("event_tags") if isinstance(patch.get("event_tags"), list) else []
        timeframes = patch.get("timeframes") if isinstance(patch.get("timeframes"), dict) else {}
        if existing:
            parts.append(existing)
        timeframe_bits: list[str] = []
        for timeframe in ("5m", "15m", "1h"):
            item = timeframes.get(timeframe) if isinstance(timeframes.get(timeframe), dict) else {}
            ai = str(item.get("ai") or "").strip()
            state = str(item.get("state") or "").strip()
            tf_signal = str(item.get("signal") or "").strip()
            chunk = f"{timeframe}:{ai}/{state}"
            if tf_signal:
                chunk += f"/{tf_signal}"
            timeframe_bits.append(chunk)
        if timeframe_bits:
            parts.append("timeframes=" + " | ".join(timeframe_bits))
        if signal:
            parts.append(f"signal={signal}")
        if market_state:
            parts.append(f"market_state={market_state}")
        if event_tags:
            parts.append("events=" + ", ".join(str(tag) for tag in event_tags[:6]))
        if structure:
            parts.append(structure)
        parts.append("PA summary generated from current multi-timeframe structure, signal, and event tags.")
        return " ; ".join(part for part in parts if part)

    def equation_is_gate_ready(self, value: str) -> bool:
        text = str(value or "").strip()
        match = re.search(r"P=(\d+(?:\.\d+)?)%\s+R=(\d+(?:\.\d+)?)\s+PxR=(\d+(?:\.\d+)?)", text)
        if not match:
            return False
        try:
            r = float(match.group(2))
            pxr = float(match.group(3))
        except ValueError:
            return False
        return 0 < r <= 10 and 0 < pxr <= 10

    def build_trade_equation(self, patch: dict[str, Any], action: dict[str, Any]) -> str:
        existing = str(action.get("equation") or "").strip()
        if self.equation_is_gate_ready(existing):
            return existing
        evaluation = patch.get("evaluation") if isinstance(patch.get("evaluation"), dict) else {}
        p_values = [value for value in all_floats(evaluation.get("p_estimate")) if 0 < value <= 100]
        p_values.extend(value for value in all_floats(evaluation.get("p_estimate_if_triggered")) if 0 < value <= 100)
        r_values = []
        r_text = str(evaluation.get("r_estimate") or "")
        if not r_text:
            r_text = str(evaluation.get("r_estimate_if_triggered") or "")
        for match in re.findall(r"(\d+(?:\.\d+)?)\s*:\s*1", r_text):
            try:
                r_values.append(float(match))
            except ValueError:
                continue
        if not r_values:
            r_values = [value for value in all_floats(r_text) if 0 < value <= 10]
        if not r_values:
            equation_text = str(evaluation.get("equation") or "")
            equation_values = [value for value in all_floats(equation_text) if 0 < value <= 10]
            if equation_values:
                if len(equation_values) >= 2:
                    r_values.append(float(equation_values[1]))
                elif len(equation_values) == 1:
                    r_values.append(float(equation_values[0]))
        p = max(p_values) if p_values else None
        if p is not None and p > 1:
            p = p / 100.0
        r = max(r_values) if r_values else None
        if p is None:
            confidence = first_float(action.get("confidence"))
            if confidence is not None:
                p = confidence / 100.0 if confidence > 1 else confidence
        if r is None:
            entry = first_float(action.get("entry") or action.get("entry_price"))
            stop_loss = first_float(action.get("sl") or action.get("stop_loss"))
            take_profit = first_float(action.get("tp") or action.get("take_profit"))
            if entry is not None and stop_loss is not None and take_profit is not None:
                risk = abs(entry - stop_loss)
                reward = abs(take_profit - entry)
                if risk > 0 and reward > 0:
                    r = reward / risk
        if p is None:
            p = 0.55
        if r is None:
            r = 1.8
        pxr = p * r
        return f"P={int(round(p * 100))}% R={r:.2f} PxR={pxr:.2f}"

    def default_gate_refs(self, market_state: str) -> list[str]:
        primary_s6 = classify_primary_s6_reference(str(market_state or ""), [])
        refs = [
            "S2-direction.md",
            "S4-strategy-match.md",
            "S5-evaluation.md",
            "S6-common.md",
        ]
        if primary_s6 and primary_s6 not in refs:
            refs.append(primary_s6)
        return refs

    def ensure_gate_ready_equation(self, action: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(action)
        existing = str(normalized.get("equation") or "").strip()
        if self.equation_is_gate_ready(existing):
            return normalized
        patch: dict[str, Any] = {}
        if isinstance(normalized.get("evaluation"), dict):
            patch["evaluation"] = normalized.get("evaluation")
        if normalized.get("thesis"):
            patch["thesis"] = normalized.get("thesis")
        if isinstance(normalized.get("entry_idea"), dict):
            patch["entry_idea"] = normalized.get("entry_idea")
        rebuilt = self.build_trade_equation(patch, normalized)
        normalized["equation"] = rebuilt
        return normalized

    def hydrate_open_order_action(self, action: dict[str, Any], decision: dict[str, Any]) -> dict[str, Any]:
        action_type = canonical_action_type(action.get("type"))
        if action_type not in {"OPEN_ORDER", "PARTIAL_CLOSE"}:
            return action
        symbol = str(action.get("symbol") or "").upper()
        symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        patch = symbol_updates.get(symbol) if isinstance(symbol_updates.get(symbol), dict) else {}
        planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
        trade_patch = patch.get("trade") if isinstance(patch.get("trade"), dict) else {}
        trigger_price = (
            ((patch.get("pre_signal") or {}).get("trigger_price"))
            if isinstance(patch.get("pre_signal"), dict)
            else {}
        )
        trigger_price = trigger_price if isinstance(trigger_price, dict) else {}

        entry = (
            first_float(action.get("entry"))
            or first_float(action.get("entry_price"))
            or first_float(planned_trade.get("entry_price"))
            or first_float(trade_patch.get("entry_price"))
            or first_float(trigger_price.get("entry"))
        )
        sl = (
            first_float(action.get("sl"))
            or first_float(action.get("stop_loss"))
            or first_float(planned_trade.get("stop_loss"))
            or first_float(trade_patch.get("stop_loss"))
            or first_float(trigger_price.get("stop_loss"))
        )
        tp = (
            first_float(action.get("tp"))
            or first_float(action.get("take_profit"))
            or first_float(planned_trade.get("take_profit"))
            or first_float(trade_patch.get("take_profit"))
            or first_float(trigger_price.get("take_profit"))
        )

        hydrated = normalize_action_payload(action)
        hydrated["type"] = action_type
        if entry is not None:
            hydrated["entry"] = entry
            hydrated.setdefault("entry_price", entry)
            hydrated.setdefault("price", entry)
        if sl is not None:
            hydrated["sl"] = sl
            hydrated.setdefault("stop_loss", sl)
        if tp is not None:
            hydrated["tp"] = tp
            hydrated.setdefault("take_profit", tp)
        if not hydrated.get("order_type"):
            hydrated["order_type"] = (
                action.get("order_type")
                or planned_trade.get("order_type")
                or (patch.get("entry_idea") or {}).get("order_type")
                or "MARKET"
            )
        if not hydrated.get("side"):
            hydrated["side"] = normalize_trade_side(
                action.get("side")
                or planned_trade.get("side")
                or trade_patch.get("side")
                or str((patch.get("entry_idea") or {}).get("side") or "").upper()
            )
        hydrated["ai_direction"] = self.build_action_ai_direction(patch, hydrated)
        hydrated["market_state"] = hydrated.get("market_state") or patch.get("market_state")
        hydrated["signal_bar"] = hydrated.get("signal_bar") or patch.get("signal") or patch.get("structure_summary") or patch.get("thesis")
        if isinstance(patch.get("evaluation"), dict):
            hydrated["evaluation"] = patch.get("evaluation")
        if isinstance(patch.get("entry_idea"), dict):
            hydrated["entry_idea"] = patch.get("entry_idea")
        hydrated["equation"] = self.build_trade_equation(patch, hydrated)
        hydrated["bar_reading"] = self.build_action_bar_reading(patch, hydrated)
        market_state = hydrated.get("market_state") or patch.get("market_state") or ""
        hydrated["refs"] = (
            normalize_refs(hydrated.get("refs"))
            or normalize_refs(patch.get("refs"))
            or self.default_gate_refs(str(market_state))
        )
        hydrated["strategy"] = hydrated.get("strategy") or (patch.get("entry_idea") or {}).get("style") or "PA_PATROL"
        if planned_trade.get("brooks_label"):
            hydrated["brooks_label"] = planned_trade.get("brooks_label")
        if planned_trade.get("upgrade_condition"):
            hydrated["upgrade_condition"] = planned_trade.get("upgrade_condition")
        if planned_trade.get("brooks_rule"):
            hydrated["brooks_rule"] = planned_trade.get("brooks_rule")
        execution_semantics = planned_trade.get("execution_semantics") if isinstance(planned_trade.get("execution_semantics"), dict) else {}
        if execution_semantics:
            hydrated["candidate_stage"] = execution_semantics.get("candidate_stage")
            hydrated["execution_mode"] = execution_semantics.get("execution_mode")
            hydrated["order_type_cn"] = execution_semantics.get("order_type_cn")
        hydrated["style"] = infer_trade_style_from_refs(
            market_state=str(market_state),
            refs=normalize_refs(hydrated.get("refs")),
            explicit_style=(
                action.get("style")
                or planned_trade.get("style")
                or trade_patch.get("style")
                or (patch.get("entry_idea") or {}).get("style")
                or ""
            ),
            intent=str(hydrated.get("intent") or ""),
        )
        hydrated["order_type"] = infer_order_type_from_refs(
            market_state=str(market_state),
            refs=normalize_refs(hydrated.get("refs")),
            explicit_order_type=str(hydrated.get("order_type") or ""),
            intent=str(hydrated.get("intent") or ""),
            has_price=entry is not None,
        )
        hydrated["risk_percent"] = hydrated.get("risk_percent") or planned_trade.get("risk_percent") or trade_patch.get("risk_percent")
        if action_type == "OPEN_ORDER" and hydrated.get("intent") in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"}:
            hydrated.setdefault("note", "S7 加仓")
        return hydrated

    def live_allowed_strategy_scope(self) -> tuple[str, ...]:
        """读取当前实盘允许的策略范围。"""
        raw = os.getenv("AB_PATROL_LIVE_ALLOWED_STRATEGIES", "H1,L1,H2,L2,MAG")
        return parse_live_strategy_scope(raw)

    def live_strategy_selection(self):
        """把实盘白名单解析成与回测共用的选择对象。"""
        return resolve_live_strategy_selection(",".join(self.live_allowed_strategy_scope()))

    def _action_strategy_context(self, action: dict[str, Any]) -> list[Any]:
        """优先读取动作自身携带的策略身份。"""
        return [
            action.get("strategy"),
            action.get("playbook_id"),
            action.get("playbook_hint"),
        ]

    def _symbol_strategy_context(self, symbol: str, decision: dict[str, Any]) -> list[Any]:
        """收集某个 symbol 在运行态缓存里的策略身份。"""
        symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        patch = symbol_updates.get(symbol) if isinstance(symbol_updates.get(symbol), dict) else {}
        planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
        followup_seed = patch.get("followup_seed") if isinstance(patch.get("followup_seed"), dict) else {}
        timeframes = patch.get("timeframes") if isinstance(patch.get("timeframes"), dict) else {}
        event_tags = patch.get("event_tags") if isinstance(patch.get("event_tags"), list) else []
        text_chunks: list[Any] = [
            patch.get("signal"),
            patch.get("pre_signal"),
            patch.get("stage"),
            planned_trade.get("strategy"),
            planned_trade.get("playbook_id"),
            planned_trade.get("playbook_hint"),
            planned_trade.get("brooks_label"),
            followup_seed.get("strategy"),
            followup_seed.get("playbook_id"),
            followup_seed.get("playbook_hint"),
        ]
        text_chunks.extend(event_tags)
        for snapshot in timeframes.values():
            if not isinstance(snapshot, dict):
                continue
            text_chunks.append(snapshot.get("signal"))
            text_chunks.append(snapshot.get("summary"))
        return text_chunks

    def open_order_in_live_scope(self, action: dict[str, Any], decision: dict[str, Any]) -> bool:
        """判断开仓动作是否落在当前 live 策略白名单内。"""
        allowed_scope = self.live_allowed_strategy_scope()
        if not allowed_scope or "ALL" in {item.upper() for item in allowed_scope}:
            return True
        symbol = str(action.get("symbol") or "").upper()
        if not symbol:
            return False
        selection = self.live_strategy_selection()
        action_context = self._action_strategy_context(action)
        if expand_strategy_context(action_context):
            return selection_matches_context(selection, action_context, action.get("reason"))
        return selection_matches_context(selection, self._symbol_strategy_context(symbol, decision), action.get("reason"))

    def _filter_live_scope_bucket(
        self,
        decision: dict[str, Any],
        bucket: list[Any],
        *,
        bucket_name: str,
    ) -> list[Any]:
        """把指定动作桶中不在实盘白名单内的开仓动作降级成 LOG_ONLY。"""
        allowed_scope = self.live_allowed_strategy_scope()
        if not allowed_scope or "ALL" in {item.upper() for item in allowed_scope}:
            return bucket

        filtered_actions: list[dict[str, Any]] = []
        for action in bucket or []:
            if not isinstance(action, dict):
                filtered_actions.append(action)
                continue
            if canonical_action_type(action.get("type")) != "OPEN_ORDER":
                filtered_actions.append(action)
                continue
            if self.open_order_in_live_scope(action, decision):
                filtered_actions.append(action)
                continue

            downgraded = dict(action)
            original_reason = str(action.get("reason") or action.get("strategy") or "不在白名单")
            downgraded["type"] = "LOG_ONLY"
            downgraded["reason"] = (
                f"{original_reason} | [LIVE_STRATEGY_FILTER:{bucket_name}] 当前实盘仅放行 {', '.join(sorted(allowed_scope))}"
            )
            filtered_actions.append(downgraded)
            LOG.info(
                "[LIVE_STRATEGY_FILTER] %s/%s 降级为 LOG_ONLY: strategy=%s",
                bucket_name,
                str(action.get("symbol") or "-").upper(),
                action.get("strategy"),
            )
        return filtered_actions

    def enforce_live_strategy_scope(self, decision: dict[str, Any]) -> dict[str, Any]:
        """把不在当前实盘白名单内的开仓动作统一降级成 LOG_ONLY。"""
        allowed_scope = self.live_allowed_strategy_scope()
        state_patch = decision.setdefault("state_patch", {})
        state_patch["live_allowed_strategies"] = sorted(allowed_scope)
        if not allowed_scope or "ALL" in {item.upper() for item in allowed_scope}:
            return decision

        decision["actions"] = self._filter_live_scope_bucket(
            decision,
            decision.get("actions") or [],
            bucket_name="actions",
        )
        decision["position_management"] = self._filter_live_scope_bucket(
            decision,
            decision.get("position_management") or [],
            bucket_name="position_management",
        )
        return decision

    def validate_trade_gate(self, action: dict[str, Any]) -> dict[str, Any]:
        side = str(action.get("side") or "").upper()
        entry = safe_float(action.get("entry") or action.get("entry_price"))
        stop_loss = safe_float(action.get("sl") or action.get("stop_loss"))
        take_profit = safe_float(action.get("tp") or action.get("take_profit"))

        checks: list[str] = []
        errors: list[str] = []

        def record(label: str, ok: bool, message: str) -> None:
            checks.append(f"{'✅' if ok else '❌'} {label}: {message}")
            if not ok:
                errors.append(message)

        if side not in {"BUY", "SELL"}:
            record("方向", False, f"无效方向: {side or '-'}")
        else:
            record("方向", True, side)

        if entry <= 0:
            record("入场", False, f"入场价无效: {entry}")
        else:
            record("入场", True, f"{entry:.5f}")

        if stop_loss <= 0:
            record("止损", False, f"止损价无效: {stop_loss}")
        else:
            record("止损", True, f"{stop_loss:.5f}")

        if take_profit <= 0:
            record("止盈", False, f"止盈价无效: {take_profit}")
        else:
            record("止盈", True, f"{take_profit:.5f}")

        if side == "BUY" and entry > 0 and stop_loss > 0 and take_profit > 0:
            record("结构", stop_loss < entry < take_profit, f"BUY: sl={stop_loss:.5f} < entry={entry:.5f} < tp={take_profit:.5f}")
        elif side == "SELL" and entry > 0 and stop_loss > 0 and take_profit > 0:
            record("结构", take_profit < entry < stop_loss, f"SELL: tp={take_profit:.5f} < entry={entry:.5f} < sl={stop_loss:.5f}")

        if entry > 0 and stop_loss > 0 and take_profit > 0:
            risk = abs(entry - stop_loss)
            reward = abs(take_profit - entry)
            rr = reward / risk if risk > 0 else 0.0
            record("盈亏比", risk > 0 and reward > 0, f"R:R={rr:.2f}")

        output_lines = checks[:]
        output_lines.append("✅ 已按回测链口径跳过旧实盘 trade gate，只保留几何合法性校验" if not errors else "🚫 下单被拒绝")
        return {
            "ok": not errors,
            "stdout": "\n".join(output_lines)[-1500:],
            "stderr": "" if not errors else "\n".join(errors)[-1500:],
        }

    def execute_action(self, action: dict[str, Any], execution: dict[str, Any]) -> dict[str, Any]:
        action_type = str(action.get("type") or "").upper()
        symbol = str(action.get("symbol") or "")
        target_exchange = self.exchange_for_symbol(symbol) if symbol else self.configured_exchange()
        target_base_url = self.execution_base_for_symbol(symbol) if symbol else self.config.execution_base
        services = execution.get("services") if isinstance(execution.get("services"), dict) else {}
        service_bundle = services.get(target_exchange) if isinstance(services.get(target_exchange), dict) else {}
        target_can_trade = service_bundle.get("can_trade") if isinstance(service_bundle.get("can_trade"), dict) else (
            execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
        )
        result: dict[str, Any] = {
            "type": action_type,
            "symbol": symbol,
            "exchange": target_exchange,
            "execution_base": target_base_url,
            "dry_run": self.config.dry_run,
            "started_at": utc_iso(),
        }
        action_snapshot = {
            key: action.get(key)
            for key in (
                "symbol",
                "side",
                "entry",
                "entry_price",
                "sl",
                "stop_loss",
                "tp",
                "take_profit",
                "strategy",
                "style",
                "intent",
                "risk_percent",
                "reentry_attempt",
                "followup_profile",
                "playbook_hint",
                "playbook_id",
                "market_state",
            )
            if action.get(key) not in (None, "")
        }
        if action_snapshot:
            result["action_snapshot"] = action_snapshot

        if action_type == "LOG_ONLY":
            result["success"] = True
            result["status"] = "LOG_ONLY"
            result["message"] = action.get("reason") or action.get("strategy") or "log only"
            return result

        if action_type == "OPEN_ORDER":
            intent = str(action.get("intent") or "").upper()
            if intent not in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"}:
                preflight_execution, preflight_meta = self._live_entry_preflight_snapshot(
                    symbol,
                    execution,
                    base_url=target_base_url,
                )
                result["live_preflight"] = preflight_meta
                strategy_key = self._live_strategy_key_from_action(action)
                result["live_strategy_key"] = strategy_key or None
                entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, preflight_execution)
                if entry_blocked:
                    result["success"] = False
                    result["status"] = "LIVE_ENTRY_CONFLICT"
                    result["message"] = entry_block_reason
                    return result

            result["trade_gate"] = self.validate_trade_gate(action)
            if not result["trade_gate"].get("ok"):
                gate_message = result["trade_gate"].get("stdout") or result["trade_gate"].get("stderr") or "trade gate rejected"
                result["success"] = False
                result["status"] = "VALIDATION_REJECTED"
                result["message"] = gate_message
                return result

            if not target_can_trade.get("can_trade", False):
                block_reason = str(target_can_trade.get("reason") or "").lower()
                if not target_can_trade or any(
                    token in block_reason
                    for token in ("timed out", "timeout", "service_unavailable", "read operation timed out")
                ):
                    refreshed_can_trade = self.http_get_json(
                        f"/trading/can-trade/{self.config.execution_bot_id}",
                        base_url=target_base_url,
                        timeout=4,
                    )
                    result["can_trade_refresh"] = refreshed_can_trade
                    if isinstance(refreshed_can_trade, dict) and refreshed_can_trade.get("can_trade", False):
                        target_can_trade = refreshed_can_trade
                    elif (
                        self._is_transport_block_reason(refreshed_can_trade)
                        and self._preflight_has_live_probe(result.get("live_preflight"))
                    ):
                        target_can_trade = {"can_trade": True, "reason": "transport_fallback_after_live_preflight"}
                        result["can_trade_transport_bypass"] = True

            if not target_can_trade.get("can_trade", False):
                exchange_block = (
                    target_can_trade.get("exchange_block")
                    if isinstance(target_can_trade.get("exchange_block"), dict)
                    else {}
                )
                block_code = str(exchange_block.get("code") or target_can_trade.get("reason") or "").strip()
                block_reason = str(exchange_block.get("reason") or target_can_trade.get("reason") or "").strip()
                result["success"] = False
                if block_code == "BINANCE_REGION_RESTRICTED":
                    result["status"] = "EXCHANGE_BLOCKED"
                    result["message"] = f"交易所阻断: {block_reason or block_code}"
                    result["exchange_block"] = exchange_block
                else:
                    result["status"] = "BLOCKED"
                    result["message"] = f"can_trade blocked: {target_can_trade.get('reason', '-')}"
                return result

            scale_ok, scale_message = self.validate_scale_in(action, execution)
            result["scale_in_gate"] = {"ok": scale_ok, "message": scale_message}
            if not scale_ok:
                result["success"] = False
                result["status"] = "S7_SCALE_IN_BLOCKED"
                result["message"] = scale_message
                return result

            risk_percent = self.action_risk_percent(action, execution)
            size = self.http_get_json(
                f"/trading/calculate-size/{self.config.execution_bot_id}",
                {
                    "symbol": symbol,
                    "entry_price": safe_float(action.get("entry")),
                    "stop_loss": safe_float(action.get("sl")),
                    "risk_percent": risk_percent,
                    "intent": str(action.get("intent") or ""),
                },
                base_url=target_base_url,
            )
            result["size_calc"] = size
            quantity = safe_float((size or {}).get("quantity"))
            if quantity <= 0:
                result["success"] = False
                result["status"] = "SIZE_FAILED"
                result["message"] = json.dumps(size, ensure_ascii=False)
                return result

            order_payload = {
                "symbol": symbol,
                "side": action.get("side"),
                "quantity": quantity,
                "order_type": action.get("order_type") or "MARKET",
                "price": action.get("price"),
                "stop_loss": action.get("sl"),
                "take_profit": action.get("tp"),
                "intent": action.get("intent"),
                "strategy": action.get("strategy"),
                "signal_source": action.get("signal_source") or self.config.operator_agent,
                "bot_id": self.config.execution_bot_id,
            }
            result["order_payload"] = order_payload
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_VALIDATED"
                result["message"] = "dry-run 模式：已完成仓位计算并生成订单载荷，未实际发送"
                return result

            order_resp = self.http_post_json("/order", order_payload, base_url=target_base_url)
            result["response"] = order_resp
            if isinstance(order_resp, dict) and order_resp.get("_error"):
                reconcile = self._reconcile_post_order_transport_error(
                    symbol,
                    action,
                    base_url=target_base_url,
                )
                result["post_order_reconcile"] = reconcile
                if reconcile.get("success"):
                    result["success"] = True
                    result["status"] = str(reconcile.get("status") or "PLACED_RECONCILED")
                    result["message"] = str(reconcile.get("message") or "")
                    return result
                result["success"] = False
                result["status"] = "UNKNOWN"
                result["message"] = str(order_resp.get("_error") or reconcile.get("message") or "")
                return result
            result["success"] = bool(order_resp.get("success"))
            result["status"] = order_resp.get("status", "UNKNOWN")
            result["message"] = order_resp.get("message")
            return result

        if action_type in {"PARTIAL_CLOSE", "REDUCE_POSITION"}:
            positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
            normalized_symbol = self._normalize_live_symbol(symbol)
            live_position = next(
                (
                    item
                    for item in positions
                    if isinstance(item, dict)
                    and self._normalize_live_symbol(item.get("symbol")) == normalized_symbol
                ),
                {},
            )
            live_qty = abs(
                safe_float(live_position.get("quantity"))
                or safe_float(live_position.get("contracts"))
                or safe_float(live_position.get("size"))
            )
            quantity = safe_float(action.get("quantity") or action.get("close_quantity"), 0.0)
            close_ratio = safe_float(action.get("close_ratio") or action.get("reduce_ratio") or action.get("ratio"), 0.0)
            if quantity <= 0 and close_ratio > 0 and live_qty > 0:
                quantity = round(live_qty * close_ratio, 8)
            result["position_quantity"] = live_qty
            result["close_quantity"] = quantity
            if quantity <= 0:
                result["success"] = False
                result["status"] = "SIZE_FAILED"
                result["message"] = "partial close 缺少可执行数量"
                return result
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_PARTIAL_CLOSE"
                return result
            close_resp = self.http_post_json(
                f"/order/{symbol}/close",
                {},
                {"quantity": quantity, "bot_id": self.config.execution_bot_id},
                base_url=target_base_url,
            )
            result["response"] = close_resp
            result["success"] = bool(close_resp.get("success", True))
            result["status"] = close_resp.get("status", "UNKNOWN")
            result["message"] = close_resp.get("message")
            return result

        if action_type == "CLOSE_POSITION":
            quantity = safe_float(action.get("quantity") or action.get("close_quantity"), 0.0)
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_CLOSE"
                if quantity > 0:
                    result["close_quantity"] = quantity
                return result
            close_resp = self.http_post_json(
                f"/order/{symbol}/close",
                {},
                {"bot_id": self.config.execution_bot_id, "quantity": quantity if quantity > 0 else None},
                base_url=target_base_url,
            )
            result["response"] = close_resp
            result["success"] = bool(close_resp.get("success", True))
            result["status"] = close_resp.get("status", "UNKNOWN")
            result["message"] = close_resp.get("message")
            return result

        if action_type == "MODIFY_STOP_LOSS":
            new_sl = action.get("new_stop_loss") or action.get("sl")
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_MODIFY_SL"
                result["new_stop_loss"] = new_sl
                return result
            modify_resp = self.http_post_json(
                f"/order/{symbol}/modify-sl",
                {},
                {"new_stop_loss": safe_float(new_sl), "bot_id": self.config.execution_bot_id},
                base_url=target_base_url,
            )
            result["response"] = modify_resp
            result["success"] = "error" not in str(modify_resp).lower()
            result["status"] = "MODIFIED" if result["success"] else "FAILED"
            return result

        if action_type == "MODIFY_TAKE_PROFIT":
            new_tp = action.get("new_take_profit") or action.get("tp") or action.get("take_profit")
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_MODIFY_TP"
                result["new_take_profit"] = new_tp
                return result
            modify_resp = self.http_post_json(
                f"/order/{symbol}/modify-tp",
                {},
                {"new_take_profit": safe_float(new_tp), "bot_id": self.config.execution_bot_id},
                base_url=target_base_url,
            )
            result["response"] = modify_resp
            result["success"] = bool(modify_resp.get("success"))
            result["status"] = modify_resp.get("status", "FAILED")
            result["message"] = modify_resp.get("message")
            return result

        if action_type in {"CANCEL_ALL_ORDERS", "CANCEL_PENDING_ENTRY"}:
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_CANCEL_ORDERS"
                return result
            cancel_resp = self.http_delete_json("/orders", {"symbol": symbol or None}, base_url=target_base_url)
            result["response"] = cancel_resp
            result["success"] = bool(cancel_resp.get("success", True))
            result["status"] = "CANCELLED" if result["success"] else "FAILED"
            result["message"] = cancel_resp.get("message")
            return result

        result["success"] = False
        result["status"] = "UNSUPPORTED"
        result["message"] = f"unsupported action type: {action_type}"
        return result

    def update_market_cache(
        self,
        market_cache: dict[str, Any],
        decision: dict[str, Any],
        execution_results: list[dict[str, Any]],
        cycle_id: str,
    ) -> None:
        symbol_cache = market_cache.setdefault("symbols", {})
        if not isinstance(symbol_cache, dict):
            symbol_cache = {}
            market_cache["symbols"] = symbol_cache
        now_iso = utc_iso()
        loop_count = int(market_cache.get("loop_count") or 0) + 1
        market_cache["last_update"] = now_iso
        market_cache["loop_count"] = loop_count
        meta = market_cache.setdefault("_meta", {})
        if not isinstance(meta, dict):
            meta = {}
            market_cache["_meta"] = meta
        meta["loop_count"] = loop_count
        meta["last_update"] = now_iso
        meta["exchange"] = self.configured_exchange()
        meta["market_profile"] = self.configured_market_profile()
        meta["configured_symbols"] = self.default_watch_symbols()

        signal_count = 0
        for patch in (decision.get("symbol_updates") or {}).values():
            if not isinstance(patch, dict):
                continue
            status = str(patch.get("status") or "")
            if status in {"pre_signal", "entry_ready", "entry_ready_blocked"} or str(patch.get("pre_signal") or "").strip():
                signal_count += 1
        meta["total_signals"] = int(meta.get("total_signals") or 0) + signal_count
        meta["total_trades"] = int(meta.get("total_trades") or 0) + sum(
            1
            for item in execution_results
            if str(item.get("type") or "") == "OPEN_ORDER" and str(item.get("status") or "") != "LOG_ONLY"
        )
        pass_wait = 0
        pass_rule = 0
        for action in (decision.get("actions") or []):
            reason = str(action.get("reason") or "")
            if "[PASS-WAIT]" in reason:
                pass_wait += 1
            if "[PASS-RULE]" in reason:
                pass_rule += 1
        meta["total_passes"] = int(meta.get("total_passes") or 0) + pass_wait + pass_rule
        meta["pass_wait"] = int(meta.get("pass_wait") or 0) + pass_wait
        meta["pass_rule"] = int(meta.get("pass_rule") or 0) + pass_rule

        if decision.get("phase") == "BOOTSTRAP":
            market_cache["last_full_refresh"] = now_iso
            meta["last_full_refresh"] = now_iso

        for symbol, patch in (decision.get("symbol_updates") or {}).items():
            current = symbol_cache.setdefault(symbol, {})
            if not isinstance(current, dict):
                current = {}
                symbol_cache[symbol] = current
            for field in MODEL_TRANSIENT_FIELDS:
                current.pop(field, None)
            cleaned_patch = dict(patch)
            if _patch_has_fresh_live_opportunity(current):
                current = _release_fresh_live_opportunity_state(current)
                symbol_cache[symbol] = current
            if _patch_has_fresh_live_opportunity(cleaned_patch):
                cleaned_patch = _release_fresh_live_opportunity_state(cleaned_patch)

            expired_pre_signal = False
            if not _patch_has_fresh_live_opportunity(cleaned_patch) and not _patch_has_fresh_live_opportunity(current):
                expired_pre_signal = str(cleaned_patch.get("last_pass_reason") or current.get("last_pass_reason") or "").strip().upper() == "PRE_SIGNAL_EXPIRED"
                if not expired_pre_signal:
                    expired_pre_signal = self._looks_like_stale_live_patch(cleaned_patch) or self._looks_like_stale_live_patch(current)
            if expired_pre_signal:
                cleaned_patch["pre_signal"] = None
                cleaned_patch["pre_signal_meta"] = None
                cleaned_patch["planned_trade"] = None
                cleaned_patch["trade"] = None
                cleaned_patch["followup_seed"] = None
                cleaned_patch["status"] = "watching"
                cleaned_patch["stage"] = "WATCH"
            status = str(cleaned_patch.get("status") or current.get("status") or "")
            has_pre_signal = (not expired_pre_signal) and (
                bool(str(cleaned_patch.get("pre_signal") or "").strip()) or status in {
                "pre_signal",
                "entry_ready",
                "entry_ready_blocked",
                }
            )
            if has_pre_signal:
                cleaned_patch["pre_signal_meta"] = self.build_pre_signal_meta(current, cleaned_patch)
            else:
                cleaned_patch["pre_signal"] = None
                cleaned_patch["pre_signal_meta"] = None
            for key, value in cleaned_patch.items():
                if value is None:
                    current.pop(key, None)
                else:
                    current[key] = value
            current["updated_at"] = utc_iso()
            current["source_cycle_id"] = cycle_id

        write_json(self.market_state_path, market_cache)






    def normalize_next_scan_seconds(
        self,
        decision: dict[str, Any],
        execution: dict[str, Any],
        analysis_board: dict[str, Any] | None = None,
    ) -> int:
        return int(self.normalize_next_scan_plan(decision, execution, analysis_board).get("in_seconds") or 480)

    def prefetch_pre_signal_charts(self, symbols: list[str]) -> None:
        for symbol in symbols:
            try:
                self.build_chart_context(symbol, {})
            except Exception as exc:
                LOG.warning("prefetch charts failed for %s: %s", symbol, exc)

    def write_runtime_state(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        decision: dict[str, Any],
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
        execution_results: list[dict[str, Any]],
        analysis_board: dict[str, Any],
        session_id: str | None,
        cycle_id: str,
    ) -> dict[str, Any]:
        next_scan_plan = self.normalize_next_scan_plan(decision, execution, analysis_board)
        next_scan_seconds = int(next_scan_plan.get("in_seconds") or 480)
        decision["next_scan_seconds"] = next_scan_seconds
        if next_scan_plan.get("reason_code"):
            decision["next_scan_reason"] = next_scan_plan.get("reason_code")
        next_scan_at = utc_now() + timedelta(seconds=next_scan_seconds)
        can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
        symbol_updates = decision.get("symbol_updates") or {}
        pre_signals = [
            symbol
            for symbol, patch in symbol_updates.items()
            if str(patch.get("status") or "").startswith("pre_signal") or str(patch.get("status") or "") == "entry_ready"
        ]
        best_candidate = None
        for action in decision.get("actions") or []:
            if action.get("type") in {"OPEN_ORDER", "LOG_ONLY"}:
                best_candidate = action.get("symbol")
                if best_candidate:
                    break
        if not best_candidate:
            best_candidate = (decision.get("focus_symbols") or [None])[0]

        updated = dict(runtime)
        updated.update(
            {
                "version": "2.0",
                "bot_id": self.config.execution_bot_id,
                "exchange": self.configured_exchange(),
                "market_profile": self.configured_market_profile(),
                "loop_seq": int(runtime.get("loop_seq") or 0) + 1,
                "status": "RUNNING",
                "current_phase": decision.get("phase") or phase_plan["phase"],
                "last_run_at": utc_iso(),
                "last_success_at": utc_iso(),
                "next_scan": {
                    "next_scan_at": next_scan_at.isoformat(),
                    "in_seconds": next_scan_seconds,
                    "requested_seconds": next_scan_plan.get("requested_seconds"),
                    "model_suggested_seconds": decision.get("next_scan_seconds"),
                    "model_suggested_reason": decision.get("next_scan_reason"),
                    "reason_code": next_scan_plan.get("reason_code") or decision.get("next_scan_reason") or "PRE_SIGNAL_NEAR",
                    "reason_text": next_scan_plan.get("reason_text") or decision.get("next_scan_reason") or "follow decision",
                    "bucket_rule": next_scan_plan.get("bucket_rule"),
                    "bucket_source_refs": next_scan_plan.get("bucket_source_refs") or [],
                    "derived_from_cycle": cycle_id,
                    "interruptible": True,
                },
                "active_symbols": phase_plan["focus_symbols"],
                "focus_symbols": decision.get("focus_symbols") or phase_plan["focus_symbols"],
                "open_positions": execution.get("positions") if isinstance(execution.get("positions"), list) else [],
                "pending_pre_signals": pre_signals,
                "risk_mode": "NORMAL",
                "host_mode": "CLI_SESSION" if self.config.decision_provider == "codex_cli" else "LLM_SESSION",
                "degraded": False,
                "last_trigger": None,
                "last_cycle_id": cycle_id,
                "quiet_loops": int((decision.get("state_patch") or {}).get("quiet_loops") or runtime.get("quiet_loops") or 0),
                "full_refresh": phase_plan["full_refresh"],
                "needs_post_trade_refresh": bool((decision.get("state_patch") or {}).get("needs_post_trade_refresh", False)),
                "model_timeout": False,
                "last_full_refresh_at": utc_iso() if phase_plan["full_refresh"] else runtime.get("last_full_refresh_at"),
                "last_scan_decision": decision.get("market_summary"),
                "trade_readiness": "can_trade_true" if can_trade.get("can_trade") else f"blocked:{can_trade.get('reason', '-')}",
                "best_candidate": best_candidate,
                "best_candidate_status": (
                    ((decision.get("symbol_updates") or {}).get(best_candidate or "", {}) or {}).get("status")
                    if best_candidate
                    else "-"
                ),
                "llm_runtime_agent": self.config.llm_agent if str(self.config.decision_provider).lower() in {"openclaw", "openclaw_oauth", "llm_gateway", "llm"} else None,
                "llm_runtime_session_id": session_id or runtime.get("llm_runtime_session_id") or runtime.get("openclaw_runtime_session_id"),
                "llm_operator_agent": runtime.get("llm_operator_agent") or runtime.get("openclaw_operator_agent") or runtime.get("openclaw_agent") or self.config.operator_agent,
                "llm_session_id": runtime.get("llm_session_id") or runtime.get("openclaw_session_id"),
                "llm_provider": self.config.decision_provider,
                "decision_requested_provider": self.config.requested_decision_provider,
                "decision_fallback_provider": self.config.decision_fallback_provider,
                "decision_model": self.config.decision_model or runtime.get("decision_model") or "openai-codex/gpt-5.4",
                "decision_session_id": session_id or runtime.get("decision_session_id"),
                "llm_agent": runtime.get("llm_agent") or runtime.get("openclaw_agent") or self.config.operator_agent,
                "query_service_base": self.config.query_service_base,
                "dry_run": self.config.dry_run,
            }
        )
        updated.update(decision.get("state_patch") or {})
        updated["exchange"] = self.configured_exchange()
        updated["market_profile"] = self.configured_market_profile()
        updated["dry_run"] = self.config.dry_run
        updated["active_symbols"] = updated.get("active_symbols") or self.default_watch_symbols()
        updated["focus_symbols"] = updated.get("focus_symbols") or phase_plan["focus_symbols"]
        service_snapshots = execution.get("services") if isinstance(execution.get("services"), dict) else {}
        execution_summary = {
            "last_update": utc_iso(),
            "positions_count": len(execution.get("positions") if isinstance(execution.get("positions"), list) else []),
            "orders_count": len(execution.get("orders") if isinstance(execution.get("orders"), list) else []),
            "can_trade": execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {},
            "live_context": execution.get("live_context") if isinstance(execution.get("live_context"), dict) else {},
            "services": service_snapshots,
            "recent_results": execution_results[-12:],
        }
        updated["execution"] = execution_summary
        if str(runtime.get("exchange") or "").strip().lower() != self.configured_exchange():
            updated.pop("symbols", None)
        base_symbol_state = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        decision_symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        decision_symbols = decision.get("symbols") if isinstance(decision.get("symbols"), dict) else {}
        merged_symbol_state: dict[str, Any] = {}
        all_runtime_symbols = {
            str(symbol).upper()
            for symbol in (
                list(base_symbol_state.keys())
                + list(decision_symbols.keys())
                + list(decision_symbol_updates.keys())
            )
        }
        for symbol in all_runtime_symbols:
            merged_patch = dict(base_symbol_state.get(symbol) or {}) if isinstance(base_symbol_state.get(symbol), dict) else {}
            if isinstance(decision_symbols.get(symbol), dict):
                merged_patch.update(decision_symbols.get(symbol) or {})
            if isinstance(decision_symbol_updates.get(symbol), dict):
                merged_patch.update(decision_symbol_updates.get(symbol) or {})
            normalized_family = str(
                merged_patch.get("latest_strategy_family")
                or merged_patch.get("strategy_family")
                or merged_patch.get("playbook_family")
                or ""
            ).strip().upper()
            if normalized_family in {"H1", "H2", "L1", "L2"}:
                current_strategy = str(merged_patch.get("strategy") or "").strip()
                current_playbook = str(merged_patch.get("playbook_id") or "").strip()
                if _contains_mag_text(current_strategy) or _contains_mag_text(current_playbook):
                    merged_patch.pop("strategy", None)
                    merged_patch.pop("playbook_id", None)
            if merged_patch:
                merged_symbol_state[symbol] = merged_patch
        if merged_symbol_state:
            updated["symbols"] = json.loads(json.dumps(merged_symbol_state, ensure_ascii=False))
        existing_symbol_state = updated.get("symbols") if isinstance(updated.get("symbols"), dict) else {}
        allowed_symbols = self.runtime_symbol_universe(updated, existing_symbol_state)
        existing_symbols = {str(symbol).upper() for symbol in existing_symbol_state.keys()}
        if existing_symbols and allowed_symbols and not (existing_symbols & allowed_symbols):
            updated.pop("symbols", None)
        updated = prune_runtime_state(updated, allowed_symbols)
        updated.pop("runtime_state", None)
        updated["next_scan"].setdefault("bucket_source_refs", [])
        updated["next_scan"].setdefault("bucket_rule", "-")
        decision.setdefault("state_patch", {})["scan_bucket"] = next_scan_plan
        if session_id:
            updated["llm_runtime_session_id"] = session_id
            updated["decision_session_id"] = session_id
        updated["llm_runtime_agent"] = self.config.llm_agent if str(self.config.decision_provider).lower() in {"openclaw", "openclaw_oauth", "llm_gateway", "llm"} else None
        updated["llm_operator_agent"] = updated.get("llm_operator_agent") or self.config.operator_agent
        updated["llm_agent"] = updated.get("llm_agent") or self.config.operator_agent
        write_json(self.runtime_state_path, updated)
        write_json(self.next_scan_path, updated["next_scan"])
        return updated

    def _tracked_bot_positions(self, execution: dict[str, Any]) -> list[dict[str, Any]]:
        """只保留当前 bot 负责的持仓。"""
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        matched: list[dict[str, Any]] = []
        for item in positions:
            if not isinstance(item, dict):
                continue
            bot_ids = item.get("bot_ids")
            bot_id = str(item.get("bot_id") or "").strip()
            if isinstance(bot_ids, list):
                normalized = {str(value).strip() for value in bot_ids if str(value).strip()}
                if normalized and self.config.execution_bot_id not in normalized:
                    continue
            elif bot_id and bot_id != self.config.execution_bot_id:
                continue
            matched.append(item)
        return matched

    @staticmethod
    def _normalize_live_symbol(value: Any) -> str:
        """统一实盘侧品种标识，兼容 BTCUSDT / BTCUSDT:USDT / BTC/USDT:USDT。"""
        text = str(value or "").strip().upper()
        if ":" in text:
            text = text.split(":", 1)[0].strip()
        text = text.replace("/", "")
        return text

    @staticmethod
    def _is_transport_block_reason(value: Any) -> bool:
        """识别 execution-service 的传输层错误，避免把接口抖动误判成业务禁止。"""
        if isinstance(value, dict):
            text = str(value.get("_error") or value.get("reason") or value)
        else:
            text = str(value or "")
        lowered = text.lower()
        return any(
            token in lowered
            for token in (
                "connection refused",
                "timed out",
                "timeout",
                "operation timed out",
                "read operation timed out",
                "service unavailable",
                "connection reset",
            )
        )

    @staticmethod
    def _preflight_has_live_probe(meta: dict[str, Any] | None) -> bool:
        """只要预检里任一 live 探针成功，就说明 execution 服务当下可达。"""
        if not isinstance(meta, dict):
            return False
        return any(
            str(meta.get(field) or "").lower() == "live"
            for field in ("positions_source", "orders_source")
        )

    def _live_strategy_key_from_action(self, action: dict[str, Any]) -> str:
        """从开仓动作里提取策略冲突键。"""
        return _canonical_live_strategy_key(
            action.get("playbook_id"),
            action.get("strategy"),
            action.get("playbook_hint"),
            action.get("ema_gap_variant"),
            action.get("strategy_family"),
            action.get("latest_strategy_family"),
        )

    def _live_strategy_key_from_execution_item(self, item: dict[str, Any]) -> str:
        """从 execution 回读的持仓/挂单里提取策略冲突键。"""
        return _canonical_live_strategy_key(
            item.get("playbook_id"),
            item.get("strategy"),
            item.get("playbook_hint"),
            item.get("ema_gap_variant"),
            item.get("strategy_family"),
            item.get("latest_strategy_family"),
            item.get("signal_type"),
        )

    def _canonical_live_strategy_key(self, *values: Any) -> str:
        """兼容类内旧调用，统一走文件级策略键标准化函数。"""
        return _canonical_live_strategy_key(*values)

    @staticmethod
    def _candidate_stage_is_executable(candidate_stage: Any) -> bool:
        """live 只允许 executable 阶段真正进入开仓动作。"""
        return str(candidate_stage or "").strip().upper().startswith("EXECUTABLE_")

    @staticmethod
    def _looks_like_stale_live_patch(patch: dict[str, Any] | None) -> bool:
        """识别模型超时后沿用旧结论的缓存态。"""
        if not isinstance(patch, dict):
            return False
        if _patch_has_fresh_live_opportunity(patch):
            return False
        if str(patch.get("last_pass_reason") or "").strip().upper() == "PRE_SIGNAL_EXPIRED":
            return True
        if bool(patch.get("stale_model_timeout")):
            return True

        text_values: list[str] = []
        for field in (
            "thesis",
            "structure_summary",
            "market_state_detail",
            "running_narrative",
            "status_reason",
        ):
            text = str(patch.get(field) or "").strip()
            if text:
                text_values.append(text)

        pre_signal = patch.get("pre_signal") if isinstance(patch.get("pre_signal"), dict) else {}
        planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
        for value in (
            pre_signal.get("reason"),
            pre_signal.get("note"),
            planned_trade.get("why_wait"),
        ):
            text = str(value or "").strip()
            if text:
                text_values.append(text)

        return any("本轮模型超时，保持上一轮观察结论" in text for text in text_values)

    def _clear_expired_live_symbol_state(self, patch: dict[str, Any] | None) -> dict[str, Any]:
        """把已过期的 live 预信号状态降回 watching，避免旧计划反复复活。"""
        normalized = dict(patch) if isinstance(patch, dict) else {}
        if not normalized:
            return {}
        if _patch_has_fresh_live_opportunity(normalized):
            return _release_fresh_live_opportunity_state(normalized)
        expired = str(normalized.get("last_pass_reason") or "").strip().upper() == "PRE_SIGNAL_EXPIRED"
        if not expired:
            expired = self._looks_like_stale_live_patch(normalized)
        if not expired:
            return normalized

        for key in ("pre_signal", "pre_signal_meta", "planned_trade", "trade", "followup_seed"):
            normalized.pop(key, None)
        entry_idea = normalized.get("entry_idea") if isinstance(normalized.get("entry_idea"), dict) else {}
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
        ):
            entry_idea.pop(field, None)
        if entry_idea:
            normalized["entry_idea"] = entry_idea
        else:
            normalized.pop("entry_idea", None)
        evaluation = normalized.get("evaluation") if isinstance(normalized.get("evaluation"), dict) else {}
        for field in (
            "candidate_stage",
            "execution_mode",
            "execution_decision",
            "risk",
            "signal_rank",
            "brooks_rule",
            "source_refs",
        ):
            evaluation.pop(field, None)
        if evaluation:
            normalized["evaluation"] = evaluation
        else:
            normalized.pop("evaluation", None)
        if str(normalized.get("status") or "").strip() in {"pre_signal", "entry_ready", "entry_ready_blocked"}:
            normalized["status"] = "watching"
        normalized["stage"] = "WATCH"
        normalized["stale_model_timeout"] = False
        return normalized

    def _sanitize_runtime_symbols_state(self, runtime: dict[str, Any]) -> dict[str, Any]:
        """启动每轮前先清掉 runtime_state 里已经过期的候选态。"""
        if not isinstance(runtime, dict):
            return {}
        symbols = runtime.get("symbols") if isinstance(runtime.get("symbols"), dict) else {}
        if not symbols:
            return runtime
        changed = False
        sanitized_symbols: dict[str, Any] = {}
        for symbol, raw in symbols.items():
            if not isinstance(raw, dict):
                sanitized_symbols[symbol] = raw
                continue
            sanitized = self._clear_expired_live_symbol_state(raw)
            if sanitized != raw:
                changed = True
            sanitized_symbols[symbol] = sanitized
        if not changed:
            return runtime
        updated = dict(runtime)
        updated["symbols"] = sanitized_symbols
        write_json(self.runtime_state_path, updated)
        return updated

    def _sanitize_decision_symbol_outputs(self, decision: dict[str, Any]) -> dict[str, Any]:
        """在最终落盘前再次清理过期候选态，避免 stale 结论在展示层复活。"""
        if not isinstance(decision, dict):
            return decision

        raw_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        raw_symbols = decision.get("symbols") if isinstance(decision.get("symbols"), dict) else {}
        sanitized_updates: dict[str, Any] = {}

        for symbol, raw_patch in raw_updates.items():
            key = str(symbol).upper()
            if not isinstance(raw_patch, dict):
                sanitized_updates[key] = raw_patch
                continue
            sanitized_updates[key] = self._clear_expired_live_symbol_state(raw_patch)

        if sanitized_updates:
            decision["symbol_updates"] = sanitized_updates

        if raw_symbols or sanitized_updates:
            normalized_symbols: dict[str, Any] = {}
            ordered_keys: list[str] = []
            for symbol in list(raw_symbols.keys()) + list(sanitized_updates.keys()):
                key = str(symbol).upper()
                if key and key not in ordered_keys:
                    ordered_keys.append(key)
            for key in ordered_keys:
                raw_card = raw_symbols.get(key) if isinstance(raw_symbols.get(key), dict) else {}
                patch = sanitized_updates.get(key) if isinstance(sanitized_updates.get(key), dict) else {}
                merged = dict(raw_card)
                if patch:
                    merged["status"] = patch.get("status", merged.get("status", "watching"))
                    merged["stage"] = patch.get("stage", merged.get("stage", "WATCH"))
                    merged["thesis"] = patch.get("thesis", merged.get("thesis", ""))
                    merged["pre_signal"] = patch.get("pre_signal")
                    merged["planned_trade"] = patch.get("planned_trade")
                    # 主策略身份以当前 patch 为准，不能把旧 runtime_state 里的 MAG 残留重新拼回去。
                    for field in (
                        "latest_strategy_family",
                        "strategy_family",
                        "playbook_id",
                        "playbook_family",
                        "strategy_hint",
                        "management_template",
                        "brooks_label",
                        "signal_type",
                        "ema_gap_variant",
                    ):
                        merged[field] = patch.get(field)
                normalized_symbols[key] = merged
            decision["symbols"] = normalized_symbols

        return decision

    def _cycle_open_key(self, symbol: str, strategy_key: str) -> tuple[str, str]:
        """同一轮去重键：同品种同策略视为同一开仓动作。"""
        normalized_symbol = self._normalize_live_symbol(symbol) or str(symbol or "").upper()
        normalized_strategy_key = self._canonical_live_strategy_key(strategy_key) or str(strategy_key or "").strip().upper()
        return normalized_symbol, normalized_strategy_key

    def _collect_pending_open_keys(self, actions: list[dict[str, Any]]) -> set[tuple[str, str]]:
        """从当前 decision.actions 收集已经排队的 OPEN_ORDER 键。"""
        pending_keys: set[tuple[str, str]] = set()
        for action in actions:
            if not isinstance(action, dict):
                continue
            if str(action.get("type") or "").upper() != "OPEN_ORDER":
                continue
            symbol = str(action.get("symbol") or "").upper()
            if not symbol:
                continue
            strategy_key = self._live_strategy_key_from_action(action)
            pending_keys.add(self._cycle_open_key(symbol, strategy_key))
        return pending_keys

    def _tracked_bot_orders(self, execution: dict[str, Any]) -> list[dict[str, Any]]:
        """只保留当前 bot 负责、且仍处于活动状态的挂单。"""
        orders = execution.get("orders") if isinstance(execution.get("orders"), list) else []
        matched: list[dict[str, Any]] = []
        for item in orders:
            if not isinstance(item, dict):
                continue
            bot_ids = item.get("bot_ids")
            bot_id = str(item.get("bot_id") or "").strip()
            if isinstance(bot_ids, list):
                normalized = {str(value).strip() for value in bot_ids if str(value).strip()}
                if normalized and self.config.execution_bot_id not in normalized:
                    continue
            elif bot_id and bot_id != self.config.execution_bot_id:
                continue
            if bool(item.get("reduce_only")):
                continue
            status = str(item.get("status") or "").strip().lower()
            if status in {"closed", "filled", "cancelled", "canceled", "rejected", "failed"}:
                continue
            matched.append(item)
        return matched

    def _live_entry_preflight_snapshot(
        self,
        symbol: str,
        execution: dict[str, Any],
        *,
        base_url: str,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        """对目标交易所做实时持仓与挂单预检，避免聚合快照滞后导致重复首仓。"""
        snapshot = {
            "positions": execution.get("positions") if isinstance(execution.get("positions"), list) else [],
            "orders": execution.get("orders") if isinstance(execution.get("orders"), list) else [],
        }
        meta: dict[str, Any] = {
            "symbol": symbol,
            "positions_source": "cached",
            "orders_source": "cached",
        }

        live_positions = self.http_get_json("/positions", base_url=base_url, timeout=4)
        if isinstance(live_positions, list):
            snapshot["positions"] = live_positions
            meta["positions_source"] = "live"
            meta["positions_count"] = len(live_positions)
        else:
            meta["positions_count"] = len(snapshot["positions"])
            meta["positions_error"] = str((live_positions or {}).get("_error") or live_positions or "-")
            meta["positions_transport_error"] = self._is_transport_block_reason(live_positions)

        if meta.get("positions_transport_error"):
            meta["orders_count"] = len(snapshot["orders"])
            meta["orders_error"] = "skip live orders after positions transport error"
            return snapshot, meta

        live_orders = self.http_get_json(
            "/orders/open",
            {"symbol": symbol},
            base_url=base_url,
            timeout=4,
        )
        if isinstance(live_orders, list):
            snapshot["orders"] = live_orders
            meta["orders_source"] = "live"
            meta["orders_count"] = len(live_orders)
        else:
            meta["orders_count"] = len(snapshot["orders"])
            meta["orders_error"] = str((live_orders or {}).get("_error") or live_orders or "-")

        return snapshot, meta

    def _live_entry_conflict(self, symbol: str, strategy_key: str, execution: dict[str, Any]) -> tuple[bool, str]:
        """检测同品种同策略是否已有 live 暴露，不同策略允许并行首仓。"""
        normalized_symbol = self._normalize_live_symbol(symbol)
        if not normalized_symbol:
            return False, ""

        for item in self._tracked_bot_positions(execution):
            if self._normalize_live_symbol(item.get("symbol")) != normalized_symbol:
                continue
            existing_strategy_key = self._live_strategy_key_from_execution_item(item)
            if strategy_key:
                if existing_strategy_key and existing_strategy_key != strategy_key:
                    continue
                if not existing_strategy_key:
                    continue
            side = str(
                item.get("side")
                or item.get("direction")
                or item.get("position_side")
                or "-"
            ).upper()
            quantity = (
                safe_float(item.get("quantity"))
                or safe_float(item.get("contracts"))
                or safe_float(item.get("size"))
                or 0.0
            )
            strategy_hint = existing_strategy_key or strategy_key or "未知策略"
            return True, f"当前已有同品种同策略持仓（{strategy_hint} | {side} {quantity:g}），先走持仓管理链"

        for item in self._tracked_bot_orders(execution):
            if self._normalize_live_symbol(item.get("symbol")) != normalized_symbol:
                continue
            existing_strategy_key = self._live_strategy_key_from_execution_item(item)
            if strategy_key:
                if existing_strategy_key and existing_strategy_key != strategy_key:
                    continue
                if not existing_strategy_key:
                    continue
            side = str(item.get("side") or "-").upper()
            order_type = str(item.get("order_type") or item.get("type") or "-").upper()
            strategy_hint = existing_strategy_key or strategy_key or "未知策略"
            return True, f"当前已有同品种同策略活动挂单（{strategy_hint} | {side} {order_type}），避免重复首仓"

        return False, ""

    @staticmethod
    def _planned_trade_flag(value: Any, default: bool = False) -> bool:
        """把 planned_trade / execution_semantics 里的真假值统一解析成布尔。"""
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

    def _build_executable_planned_trade_action(
        self,
        *,
        symbol: str,
        cached: dict[str, Any] | None,
        refs: list[str] | None = None,
        reason_prefix: str = "",
        source_chain: str,
    ) -> dict[str, Any] | None:
        """把 runtime 中已达可执行条件的 planned_trade 直接桥接成 OPEN_ORDER。"""
        cached_raw = cached if isinstance(cached, dict) else {}
        patch = build_runtime_symbol_patch(cached_raw)
        if str(cached_raw.get("last_pass_reason") or "").strip().upper() == "PRE_SIGNAL_EXPIRED":
            return None
        if self._looks_like_stale_live_patch(cached_raw) or self._looks_like_stale_live_patch(patch):
            return None

        planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
        if not planned_trade:
            return None

        execution_semantics = (
            planned_trade.get("execution_semantics")
            if isinstance(planned_trade.get("execution_semantics"), dict)
            else {}
        )
        candidate_stage = str(
            execution_semantics.get("candidate_stage")
            or planned_trade.get("candidate_stage")
            or ""
        ).strip().upper()
        allow_executable = self._planned_trade_flag(
            execution_semantics.get("allow_executable", planned_trade.get("allow_executable")),
            candidate_stage.startswith("EXECUTABLE"),
        )
        executable_signal_ready = self._planned_trade_flag(
            execution_semantics.get("executable_signal_ready"),
            allow_executable,
        )
        requires_second_entry = self._planned_trade_flag(
            execution_semantics.get("requires_second_entry"),
            False,
        )
        if not allow_executable or not executable_signal_ready:
            return None
        if requires_second_entry and not executable_signal_ready:
            return None
        if not self._candidate_stage_is_executable(candidate_stage):
            return None

        pre_signal = patch.get("pre_signal") if isinstance(patch.get("pre_signal"), dict) else {}
        trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
        signal_entries = self._extract_signal_entries(
            patch.get("signal_type"),
            patch.get("signal"),
            patch.get("stage"),
            patch.get("thesis"),
            patch.get("timeframes"),
        )
        entry_price = (
            first_float(planned_trade.get("entry_price"))
            or first_float(trigger_price.get("entry"))
            or first_float(trigger_price.get("breakout"))
            or first_float(trigger_price.get("breakdown"))
        )
        entry_zone = planned_trade.get("entry_zone") or trigger_price.get("entry_zone")
        order_type = str(
            planned_trade.get("order_type")
            or execution_semantics.get("order_type")
            or ""
        ).strip().upper()
        execution_mode = str(
            execution_semantics.get("execution_mode")
            or planned_trade.get("execution_mode")
            or ""
        ).strip().upper()
        limit_plan_requires_explicit_trigger = (
            candidate_stage == "EXECUTABLE_LIMIT"
            or execution_mode == "LIMIT_PLAN"
            or order_type == "LIMIT"
        )
        signal_entry_only = False
        if entry_price is not None and entry_price > 0:
            tolerance = max(1e-8, abs(entry_price) * 1e-6)
            signal_entry_only = any(abs(float(price) - entry_price) <= tolerance for _, price in signal_entries)
        if limit_plan_requires_explicit_trigger and not entry_zone and signal_entry_only:
            return None
        side = normalize_trade_side(
            planned_trade.get("side")
            or {"long": "BUY", "short": "SELL"}.get(str(pre_signal.get("direction") or "").lower(), "")
            or pre_signal.get("side")
        )
        if not side:
            return None
        if (entry_price is None or entry_price <= 0) and not entry_zone:
            return None

        signal_type = str(
            patch.get("signal_type")
            or patch.get("signal")
            or planned_trade.get("signal_type")
            or planned_trade.get("brooks_label")
            or planned_trade.get("strategy")
            or ""
        ).strip()
        brooks_label = str(
            planned_trade.get("brooks_label")
            or execution_semantics.get("brooks_label")
            or signal_type
            or "Brooks 可执行候选"
        ).strip()
        candidate_stage_cn = str(
            execution_semantics.get("candidate_stage_cn")
            or planned_trade.get("candidate_stage_cn")
            or candidate_stage
        ).strip()
        stage_summary = str(
            execution_semantics.get("stage_rule_summary")
            or planned_trade.get("why_wait")
            or ""
        ).strip()
        reason_parts = [part for part in (reason_prefix, f"planned_trade桥接: {brooks_label}") if part]
        if candidate_stage_cn:
            reason_parts.append(candidate_stage_cn)
        if stage_summary:
            reason_parts.append(stage_summary)
        reason = " | ".join(reason_parts)

        base_action = {
            "strategy": str(planned_trade.get("strategy") or signal_type or planned_trade.get("playbook_id") or "PA_PATROL"),
            "signal_type": signal_type,
            "playbook_id": str(planned_trade.get("playbook_id") or ""),
            "playbook_hint": str(planned_trade.get("playbook_hint") or ""),
            "playbook_family": str(planned_trade.get("playbook_family") or ""),
            "route_style": str(planned_trade.get("route_style") or ""),
            "management_template": str(planned_trade.get("management_template") or ""),
            "management_style": str(planned_trade.get("management_style") or ""),
            "confidence": 0.55,
            "candidate_stage": candidate_stage,
            "execution_mode": str(
                execution_semantics.get("execution_mode")
                or planned_trade.get("execution_mode")
                or ""
            ),
        }
        return build_open_order_action(
            symbol=symbol,
            reason=reason,
            patch=patch,
            refs=refs or [],
            signal_source=self.config.execution_bot_id,
            source_chain=source_chain,
            base_action=base_action,
        )

    def _reconcile_post_order_transport_error(
        self,
        symbol: str,
        action: dict[str, Any],
        *,
        base_url: str,
    ) -> dict[str, Any]:
        """当 /order 超时或返回异常时，回读交易所确认是否其实已经落单。"""
        time.sleep(0.8)
        snapshot, meta = self._live_entry_preflight_snapshot(symbol, {}, base_url=base_url)
        normalized_symbol = self._normalize_live_symbol(symbol)
        action_side = str(action.get("side") or "").upper()
        accepted_sides = {"BUY", "LONG"} if action_side == "BUY" else {"SELL", "SHORT"}
        action_order_type = str(action.get("order_type") or "").upper()

        for item in snapshot.get("positions") or []:
            if not isinstance(item, dict):
                continue
            if self._normalize_live_symbol(item.get("symbol")) != normalized_symbol:
                continue
            item_side = str(item.get("side") or item.get("direction") or item.get("position_side") or "").upper()
            if item_side in accepted_sides:
                return {
                    "success": True,
                    "status": "PLACED_RECONCILED",
                    "message": "下单请求超时，但回读发现交易所已生成持仓",
                    "live_snapshot": meta,
                }

        for item in snapshot.get("orders") or []:
            if not isinstance(item, dict):
                continue
            if self._normalize_live_symbol(item.get("symbol")) != normalized_symbol:
                continue
            item_side = str(item.get("side") or "").upper()
            item_type = str(item.get("order_type") or item.get("type") or "").upper()
            if item_side in accepted_sides and (not action_order_type or item_type == action_order_type):
                return {
                    "success": True,
                    "status": "OPEN_RECONCILED",
                    "message": "下单请求超时，但回读发现交易所已生成挂单",
                    "live_snapshot": meta,
                }

        return {
            "success": False,
            "status": "UNKNOWN",
            "message": "下单请求异常，回读未发现新持仓或挂单",
            "live_snapshot": meta,
        }

    @staticmethod
    def _same_market_state_family(current: str, previous: str) -> bool:
        """强/弱趋势与宽/紧区间允许视作同一前提族。"""
        current_key = str(current or "").strip()
        previous_key = str(previous or "").strip()
        if not current_key or not previous_key or current_key == previous_key:
            return True
        bull_family = {"strong_trend_bull", "weak_trend_bull"}
        bear_family = {"strong_trend_bear", "weak_trend_bear"}
        range_family = {"tight_range", "broad_range"}
        return (
            (current_key in bull_family and previous_key in bull_family)
            or (current_key in bear_family and previous_key in bear_family)
            or (current_key in range_family and previous_key in range_family)
        )

    @staticmethod
    def _reentry_window_seconds(timeframe: str) -> int:
        """把回测的 bars 窗口折成 live 的时间窗口。"""
        if timeframe == "15m":
            return 45 * 60
        if timeframe == "30m":
            return 90 * 60
        if timeframe == "1h":
            return 120 * 60
        return 25 * 60

    def _infer_followup_timeframe(self, symbol_state: dict[str, Any], fallback: str = "5m") -> str:
        """从当前信号缓存推断 follow-up 所属周期。"""
        if not isinstance(symbol_state, dict):
            return fallback
        planned_trade = symbol_state.get("planned_trade") if isinstance(symbol_state.get("planned_trade"), dict) else {}
        pre_signal = symbol_state.get("pre_signal") if isinstance(symbol_state.get("pre_signal"), dict) else {}
        meta = symbol_state.get("pre_signal_meta") if isinstance(symbol_state.get("pre_signal_meta"), dict) else {}
        timeframe = infer_signal_timeframe(
            meta.get("timeframe"),
            pre_signal,
            symbol_state.get("signal"),
            symbol_state.get("stage"),
            planned_trade,
            symbol_state.get("market_state_detail"),
            fallback,
        )
        return str(timeframe or fallback).lower()

    def _build_followup_seed(
        self,
        *,
        symbol: str,
        side: Any,
        symbol_state: dict[str, Any] | None,
        existing_seed: dict[str, Any] | None = None,
        entry_price: float = 0.0,
        stop_loss: float = 0.0,
        take_profit: float = 0.0,
        strategy: str = "",
        style: str = "",
        playbook_hint: str = "",
        playbook_id: str = "",
        reentry_attempt: int = 0,
    ) -> dict[str, Any]:
        """统一构建 live follow-up 种子。"""
        symbol_key = str(symbol or "").upper()
        current_state = symbol_state if isinstance(symbol_state, dict) else {}
        existing = existing_seed if isinstance(existing_seed, dict) else {}
        planned_trade = (
            current_state.get("planned_trade")
            if isinstance(current_state.get("planned_trade"), dict)
            else {}
        )
        entry_idea = current_state.get("entry_idea") if isinstance(current_state.get("entry_idea"), dict) else {}
        direction = normalize_trade_side(side or existing.get("direction"))
        if not symbol_key or direction not in {"BUY", "SELL"}:
            return {}

        resolved_entry = safe_float(entry_price or existing.get("entry_price"), 0.0)
        if resolved_entry <= 0:
            return {}

        seed = {
            "symbol": symbol_key,
            "direction": direction,
            "entry_price": resolved_entry,
            "stop_loss": safe_float(
                stop_loss
                or existing.get("stop_loss")
                or planned_trade.get("stop_loss"),
                0.0,
            ),
            "take_profit": safe_float(
                take_profit
                or existing.get("take_profit")
                or planned_trade.get("take_profit"),
                0.0,
            ),
            "timeframe": str(
                existing.get("timeframe")
                or self._infer_followup_timeframe(current_state)
                or "5m"
            ).lower(),
            "market_state": str(
                current_state.get("market_state")
                or current_state.get("state")
                or existing.get("market_state")
                or ""
            ).strip(),
            "strategy": str(
                strategy
                or existing.get("strategy")
                or planned_trade.get("strategy")
                or playbook_id
                or playbook_hint
                or ""
            ).strip(),
            "style": str(
                style
                or existing.get("style")
                or planned_trade.get("style")
                or entry_idea.get("style")
                or ""
            ).strip(),
            "playbook_hint": str(
                playbook_hint
                or existing.get("playbook_hint")
                or planned_trade.get("playbook_hint")
                or planned_trade.get("playbook_id")
                or ""
            ).strip(),
            "playbook_id": str(
                playbook_id
                or existing.get("playbook_id")
                or planned_trade.get("playbook_id")
                or playbook_hint
                or ""
            ).strip(),
            "reentry_attempt": int(
                reentry_attempt
                or existing.get("reentry_attempt")
                or planned_trade.get("reentry_attempt")
                or 0
            ),
            "updated_at": utc_iso(),
        }
        return seed

    def _build_followup_seed_from_position(
        self,
        position: dict[str, Any],
        symbol_state: dict[str, Any] | None,
        existing_seed: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """用 live 持仓和当前缓存恢复 follow-up 种子。"""
        symbol = str(position.get("symbol") or "").upper()
        return self._build_followup_seed(
            symbol=symbol,
            side=position.get("side"),
            symbol_state=symbol_state,
            existing_seed=existing_seed,
            entry_price=safe_float(position.get("entry_price"), 0.0),
            stop_loss=safe_float(position.get("stop_loss"), 0.0),
            take_profit=safe_float(position.get("take_profit"), 0.0),
            strategy=str(position.get("strategy") or ""),
            style=str(position.get("style") or ""),
            playbook_hint=str(position.get("playbook_hint") or ""),
            playbook_id=str(position.get("playbook_id") or ""),
            reentry_attempt=int(position.get("reentry_attempt") or 0),
        )

    def _build_followup_seed_from_action_snapshot(
        self,
        snapshot: dict[str, Any],
        symbol_state: dict[str, Any] | None,
        existing_seed: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """用成功下单动作更新 follow-up 种子。"""
        symbol = str(snapshot.get("symbol") or "").upper()
        return self._build_followup_seed(
            symbol=symbol,
            side=snapshot.get("side"),
            symbol_state=symbol_state,
            existing_seed=existing_seed,
            entry_price=safe_float(snapshot.get("entry") or snapshot.get("entry_price"), 0.0),
            stop_loss=safe_float(snapshot.get("sl") or snapshot.get("stop_loss"), 0.0),
            take_profit=safe_float(snapshot.get("tp") or snapshot.get("take_profit"), 0.0),
            strategy=str(snapshot.get("strategy") or ""),
            style=str(snapshot.get("style") or ""),
            playbook_hint=str(snapshot.get("playbook_hint") or ""),
            playbook_id=str(snapshot.get("playbook_id") or ""),
            reentry_attempt=int(snapshot.get("reentry_attempt") or 0),
        )

    @staticmethod
    def _is_watch_active(watch: dict[str, Any]) -> bool:
        """检查 re-entry 观察窗口是否仍然有效。"""
        expires_at = parse_dt(watch.get("expires_at"))
        if expires_at is None:
            return False
        return expires_at > utc_now()

    @staticmethod
    def _tracked_exit_event_id(change: dict[str, Any]) -> str:
        """为已消费的平仓事件生成稳定指纹。"""
        return "|".join(
            [
                str(change.get("trade_id") or ""),
                str(change.get("symbol") or "").upper(),
                str(change.get("trigger_reason") or ""),
                str(change.get("exit_price") or ""),
            ]
        )

    def _seed_allows_reentry(self, seed: dict[str, Any]) -> bool:
        """只允许 Brooks 主链 setup 进入一次性重入观察。"""
        if not isinstance(seed, dict):
            return False
        if int(seed.get("reentry_attempt") or 0) >= 1:
            return False
        playbook_key = str(seed.get("playbook_id") or seed.get("playbook_hint") or seed.get("strategy") or "").upper()
        prefixes = (
            "T1",
            "T2",
            "T3",
            "T4",
            "T5",
            "T6",
            "R1",
            "R2",
            "R3",
            "TR1",
            "TR2",
            "TR3",
            "TR4",
            "S1",
            "S2",
        )
        if any(playbook_key.startswith(prefix) for prefix in prefixes):
            return True
        return bool(str(seed.get("market_state") or "").strip() and str(seed.get("timeframe") or "").strip())

    def _build_reentry_watch(self, seed: dict[str, Any], event_id: str) -> dict[str, Any]:
        """把止损事件转换为 live 重入观察窗口。"""
        if not self._seed_allows_reentry(seed):
            return {}
        timeframe = str(seed.get("timeframe") or "5m").lower()
        next_attempt = int(seed.get("reentry_attempt") or 0) + 1
        return {
            "direction": str(seed.get("direction") or ""),
            "timeframe": timeframe,
            "market_state": str(seed.get("market_state") or ""),
            "playbook_hint": str(seed.get("playbook_hint") or ""),
            "playbook_id": str(seed.get("playbook_id") or seed.get("playbook_hint") or ""),
            "strategy": str(seed.get("strategy") or ""),
            "style": str(seed.get("style") or ""),
            "next_attempt": next_attempt,
            "created_at": utc_iso(),
            "expires_at": (utc_now() + timedelta(seconds=self._reentry_window_seconds(timeframe))).isoformat(),
            "source_event_id": event_id,
        }

    def _symbol_matches_reentry_watch(self, cached: dict[str, Any], watch: dict[str, Any]) -> bool:
        """确认当前缓存是否满足同方向、同前提族的重入条件。"""
        if not isinstance(cached, dict) or not self._is_watch_active(watch):
            return False
        planned_trade = cached.get("planned_trade") if isinstance(cached.get("planned_trade"), dict) else {}
        pre_signal = cached.get("pre_signal") if isinstance(cached.get("pre_signal"), dict) else {}
        entry_idea = cached.get("entry_idea") if isinstance(cached.get("entry_idea"), dict) else {}
        trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
        side = normalize_trade_side(
            planned_trade.get("side")
            or entry_idea.get("side")
            or pre_signal.get("side")
            or pre_signal.get("direction")
        )
        if side != str(watch.get("direction") or ""):
            return False
        timeframe = self._infer_followup_timeframe(cached, str(watch.get("timeframe") or "5m"))
        if timeframe != str(watch.get("timeframe") or "").lower():
            return False
        market_state = str(cached.get("market_state") or cached.get("state") or "").strip()
        if not self._same_market_state_family(market_state, str(watch.get("market_state") or "")):
            return False
        status = str(cached.get("status") or "").lower()
        qualified_status = {"pre_signal", "entry_ready", "entry_ready_blocked", "executable"}
        if not pre_signal and status not in qualified_status:
            return False
        entry_price = safe_float(
            planned_trade.get("entry_price")
            or trigger_price.get("entry")
            or trigger_price.get("breakout")
            or trigger_price.get("breakdown"),
            0.0,
        )
        stop_loss = safe_float(planned_trade.get("stop_loss") or trigger_price.get("stop_loss"), 0.0)
        return entry_price > 0 and stop_loss > 0

    def _apply_reentry_overlay(
        self,
        symbol_cache: dict[str, Any],
        reentry_watch: dict[str, Any],
        active_symbols: set[str],
    ) -> None:
        """把 live re-entry 计划写入缓存，供 LLM 和规则引擎复用。"""
        if not isinstance(symbol_cache, dict):
            return
        for symbol, watch in reentry_watch.items():
            symbol_key = str(symbol or "").upper()
            if symbol_key in active_symbols:
                continue
            cached = symbol_cache.get(symbol_key)
            if not isinstance(cached, dict):
                continue
            if not self._symbol_matches_reentry_watch(cached, watch):
                continue
            planned_trade = dict(cached.get("planned_trade") or {})
            planned_trade["intent"] = "REENTRY"
            planned_trade["risk_percent"] = planned_trade.get("risk_percent") or 0.4
            planned_trade["reentry_attempt"] = int(watch.get("next_attempt") or 1)
            planned_trade["followup_profile"] = "reentry_after_stop"
            planned_trade["reentry_candidate"] = True
            if watch.get("playbook_hint") and not planned_trade.get("playbook_hint"):
                planned_trade["playbook_hint"] = watch.get("playbook_hint")
            if watch.get("playbook_id") and not planned_trade.get("playbook_id"):
                planned_trade["playbook_id"] = watch.get("playbook_id")
            cached["planned_trade"] = planned_trade
            cached["reentry_watch"] = {
                "active": True,
                "next_attempt": int(watch.get("next_attempt") or 1),
                "expires_at": watch.get("expires_at"),
                "reason": "S7 重入：止损后同方向、同前提族观察窗口仍有效",
            }

    def _apply_followup_seed_overlay(
        self,
        symbol_cache: dict[str, Any],
        position_seeds: dict[str, Any],
        tracked_symbols: set[str],
    ) -> None:
        """把 live follow-up 种子写回缓存，供持仓管理与白名单过滤复用。"""
        if not isinstance(symbol_cache, dict):
            return
        for symbol, seed in position_seeds.items():
            symbol_key = str(symbol or "").upper()
            if tracked_symbols and symbol_key not in tracked_symbols:
                continue
            cached = symbol_cache.get(symbol_key)
            if not isinstance(cached, dict):
                continue
            cached["followup_seed"] = dict(seed) if isinstance(seed, dict) else {}

    def sync_live_followup_state(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        *,
        execution_results: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """同步 live add-on / re-entry 运行态，并把重入计划注入当前缓存。"""
        runtime_symbols = runtime.get("symbols") if isinstance(runtime.get("symbols"), dict) else {}
        market_symbols = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        position_seeds = dict(runtime.get("position_seeds") if isinstance(runtime.get("position_seeds"), dict) else {})
        reentry_watch = {
            str(symbol).upper(): dict(watch)
            for symbol, watch in (runtime.get("reentry_watch") or {}).items()
            if isinstance(watch, dict)
        }
        processed_exit_events = [
            str(item)
            for item in (runtime.get("processed_exit_events") or [])
            if str(item).strip()
        ]
        processed_exit_set = set(processed_exit_events)

        live_positions = self._tracked_bot_positions(execution)
        active_symbols = {
            str(item.get("symbol") or "").upper()
            for item in live_positions
            if str(item.get("symbol") or "").strip()
        }
        for symbol in list(reentry_watch.keys()):
            if symbol in active_symbols or not self._is_watch_active(reentry_watch[symbol]):
                reentry_watch.pop(symbol, None)

        for position in live_positions:
            symbol = str(position.get("symbol") or "").upper()
            symbol_state = runtime_symbols.get(symbol) if isinstance(runtime_symbols.get(symbol), dict) else {}
            if not symbol_state:
                symbol_state = market_symbols.get(symbol) if isinstance(market_symbols.get(symbol), dict) else {}
            seed = self._build_followup_seed_from_position(position, symbol_state, position_seeds.get(symbol))
            if seed:
                position_seeds[symbol] = seed

        tracked_orders = (
            execution.get("tracked_orders")
            if isinstance(execution.get("tracked_orders"), dict)
            else {}
        )
        status_changes = (
            tracked_orders.get("status_changes")
            if isinstance(tracked_orders.get("status_changes"), list)
            else []
        )
        for change in status_changes:
            if not isinstance(change, dict):
                continue
            if str(change.get("bot_id") or "") != self.config.execution_bot_id:
                continue
            if str(change.get("trigger_reason") or "") != "stop_loss_hit":
                continue
            symbol = str(change.get("symbol") or "").upper()
            if not symbol or symbol in active_symbols:
                continue
            event_id = self._tracked_exit_event_id(change)
            if not event_id or event_id in processed_exit_set:
                continue
            processed_exit_set.add(event_id)
            processed_exit_events.append(event_id)
            seed = position_seeds.get(symbol)
            watch = self._build_reentry_watch(seed or {}, event_id)
            if watch:
                reentry_watch[symbol] = watch
                LOG.info("[FOLLOWUP] %s 注册 live re-entry 观察窗口，attempt=%s", symbol, watch.get("next_attempt"))

        successful_open_symbols: set[str] = set()
        for item in execution_results or []:
            if not isinstance(item, dict):
                continue
            if str(item.get("type") or "").upper() != "OPEN_ORDER" or not item.get("success"):
                continue
            snapshot = item.get("action_snapshot") if isinstance(item.get("action_snapshot"), dict) else {}
            symbol = str(item.get("symbol") or snapshot.get("symbol") or "").upper()
            if not symbol:
                continue
            symbol_state = runtime_symbols.get(symbol) if isinstance(runtime_symbols.get(symbol), dict) else {}
            if not symbol_state:
                symbol_state = market_symbols.get(symbol) if isinstance(market_symbols.get(symbol), dict) else {}
            seed = self._build_followup_seed_from_action_snapshot(snapshot, symbol_state, position_seeds.get(symbol))
            if seed:
                position_seeds[symbol] = seed
                successful_open_symbols.add(symbol)
            reentry_watch.pop(symbol, None)

        keep_symbols = active_symbols | set(reentry_watch.keys()) | successful_open_symbols
        position_seeds = {
            symbol: seed
            for symbol, seed in position_seeds.items()
            if symbol in keep_symbols
        }
        processed_exit_events = processed_exit_events[-200:]

        self._apply_followup_seed_overlay(runtime_symbols, position_seeds, keep_symbols)
        self._apply_followup_seed_overlay(market_symbols, position_seeds, keep_symbols)
        self._apply_reentry_overlay(runtime_symbols, reentry_watch, active_symbols)
        self._apply_reentry_overlay(market_symbols, reentry_watch, active_symbols)

        return {
            "position_seeds": position_seeds,
            "reentry_watch": reentry_watch,
            "processed_exit_events": processed_exit_events,
        }

    def primary_chart_for_decision(
        self,
        decision: dict[str, Any],
        analysis_board: dict[str, Any],
    ) -> tuple[str | None, str | None]:
        for symbol in [str(item).upper() for item in (decision.get("focus_symbols") or [])]:
            board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            chart_context = board.get("chart_context") if isinstance(board.get("chart_context"), dict) else {}
            primary = chart_context.get("primary_chart_path")
            if primary:
                return symbol, str(primary)
        return None, None

    @staticmethod
    def _next_higher_timeframe(timeframe: str, fallback: str = "15m") -> str:
        """根据当前周期推导更高一级周期。"""
        ordered = ("1m", "5m", "15m", "30m", "1h", "4h", "1d")
        key = str(timeframe or "").strip().lower()
        if key in ordered:
            index = ordered.index(key)
            if index + 1 < len(ordered):
                return ordered[index + 1]
        return fallback

    @staticmethod
    def _signal_label_for_management(raw_signal: Any) -> str:
        """把 live token 归一到管理模板可识别的策略标签。"""
        text = str(raw_signal or "").strip().upper()
        if not text:
            return ""
        mapping = {
            "H1": "高1",
            "L1": "低1",
            "H2": "高2",
            "L2": "低2",
            "高1": "高1",
            "低1": "低1",
            "高2": "高2",
            "低2": "低2",
        }
        for prefix, label in mapping.items():
            if text.startswith(prefix):
                return label
        return ""

    @staticmethod
    def _trend_hint_from_values(*values: Any) -> str:
        """把 live/AB 上下文里的方向提示统一成 bull/bear。"""
        for value in values:
            text = str(value or "").strip().lower()
            if not text:
                continue
            if any(token in text for token in ("bull", "buy", "long")):
                return "bull"
            if any(token in text for token in ("bear", "sell", "short")):
                return "bear"
        return ""

    def _resolve_live_management_style(
        self,
        position: dict[str, Any],
        symbol_patch: dict[str, Any],
        *,
        market_state: str,
        higher_market_state: str,
        timeframe: str,
    ) -> str:
        """从 live 持仓与信号快照推断管理模板。"""
        planned_trade = (
            symbol_patch.get("planned_trade")
            if isinstance(symbol_patch.get("planned_trade"), dict)
            else {}
        )
        entry_idea = (
            symbol_patch.get("entry_idea")
            if isinstance(symbol_patch.get("entry_idea"), dict)
            else {}
        )
        followup_seed = (
            symbol_patch.get("followup_seed")
            if isinstance(symbol_patch.get("followup_seed"), dict)
            else {}
        )

        existing_style = str(
            position.get("management_style")
            or planned_trade.get("management_style")
            or entry_idea.get("management_style")
            or followup_seed.get("management_style")
            or ""
        ).strip()
        if existing_style:
            return normalize_management_style(existing_style)

        signal_label = self._signal_label_for_management(
            symbol_patch.get("signal_type") or symbol_patch.get("signal")
        )
        if not signal_label:
            return ""

        order_type = str(planned_trade.get("order_type") or "MARKET").strip().upper() or "MARKET"
        route_style = str(planned_trade.get("route_style") or "").strip()
        playbook_id = str(
            position.get("playbook_id")
            or planned_trade.get("playbook_id")
            or followup_seed.get("playbook_id")
            or ""
        ).strip()

        resolved = classify_management_style(
            signal_label,
            "brooks_pdf",
            market_state=str(market_state or "").strip().lower(),
            higher_market_state=str(higher_market_state or "").strip().lower(),
            timeframe=str(timeframe or "").strip().lower(),
            entry_type=order_type,
            route_style=route_style,
            playbook_id=playbook_id,
            mtr_need_maturity_confirmation=bool(
                position.get("mtr_need_maturity_confirmation")
                or planned_trade.get("mtr_need_maturity_confirmation")
                or followup_seed.get("mtr_need_maturity_confirmation")
            ),
            mtr_bo_ft_ready=bool(
                position.get("mtr_bo_ft_ready")
                or planned_trade.get("mtr_bo_ft_ready")
                or followup_seed.get("mtr_bo_ft_ready")
            ),
            mtr_final_test_seen=bool(
                position.get("mtr_final_test_seen")
                or planned_trade.get("mtr_final_test_seen")
                or followup_seed.get("mtr_final_test_seen")
            ),
            mtr_current_resume_ready=bool(
                position.get("mtr_current_resume_ready")
                or planned_trade.get("mtr_current_resume_ready")
                or followup_seed.get("mtr_current_resume_ready")
            ),
            mtr_tight_channel=bool(
                position.get("mtr_tight_channel")
                or planned_trade.get("mtr_tight_channel")
                or followup_seed.get("mtr_tight_channel")
            ),
            mtr_first_reversal_risk=bool(
                position.get("mtr_first_reversal_risk")
                or planned_trade.get("mtr_first_reversal_risk")
                or followup_seed.get("mtr_first_reversal_risk")
            ),
        )
        return normalize_management_style(resolved)

    def _hydrate_live_position_for_management(
        self,
        position: dict[str, Any],
        symbol_patch: dict[str, Any],
        analysis_board: dict[str, Any],
    ) -> dict[str, Any]:
        """把 execution 持仓补齐成管理模块可消费的结构。"""
        symbol = self._normalize_live_symbol(position.get("symbol"))
        board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
        live_timeframes = (
            board.get("live_timeframes")
            if isinstance(board.get("live_timeframes"), dict)
            else {}
        )
        followup_seed = (
            symbol_patch.get("followup_seed")
            if isinstance(symbol_patch.get("followup_seed"), dict)
            else {}
        )
        planned_trade = (
            symbol_patch.get("planned_trade")
            if isinstance(symbol_patch.get("planned_trade"), dict)
            else {}
        )
        entry_idea = (
            symbol_patch.get("entry_idea")
            if isinstance(symbol_patch.get("entry_idea"), dict)
            else {}
        )
        pre_signal = (
            symbol_patch.get("pre_signal")
            if isinstance(symbol_patch.get("pre_signal"), dict)
            else {}
        )
        trigger_price = (
            pre_signal.get("trigger_price")
            if isinstance(pre_signal.get("trigger_price"), dict)
            else {}
        )

        timeframe = str(
            position.get("timeframe")
            or followup_seed.get("timeframe")
            or self._infer_followup_timeframe(symbol_patch)
            or "5m"
        ).strip().lower()
        higher_timeframe = self._next_higher_timeframe(timeframe)
        live_frame = live_timeframes.get(timeframe) if isinstance(live_timeframes.get(timeframe), dict) else {}
        if not live_frame and timeframe != "5m":
            live_frame = live_timeframes.get("5m") if isinstance(live_timeframes.get("5m"), dict) else {}
        latest_bar = live_frame.get("latest_bar") if isinstance(live_frame.get("latest_bar"), dict) else {}

        entry_price = safe_float(
            position.get("entry_price")
            or followup_seed.get("entry_price")
            or planned_trade.get("entry_price"),
            0.0,
        )
        stop_loss = safe_float(
            position.get("stop_loss")
            or position.get("initial_stop_loss")
            or followup_seed.get("stop_loss")
            or planned_trade.get("stop_loss"),
            0.0,
        )
        take_profit = safe_float(
            position.get("take_profit")
            or position.get("tp1")
            or followup_seed.get("take_profit")
            or planned_trade.get("take_profit"),
            0.0,
        )
        signal_price = safe_float(
            position.get("signal_price")
            or trigger_price.get("entry")
            or planned_trade.get("entry_price")
            or followup_seed.get("entry_price")
            or entry_price,
            0.0,
        )
        signal_high = safe_float(
            position.get("signal_high")
            or latest_bar.get("H")
            or signal_price,
            signal_price,
        )
        signal_low = safe_float(
            position.get("signal_low")
            or latest_bar.get("L")
            or signal_price,
            signal_price,
        )
        market_state = str(
            position.get("entry_market_state")
            or followup_seed.get("market_state")
            or symbol_patch.get("market_state")
            or ""
        ).strip().upper()
        higher_market_state = ""
        timeframes = symbol_patch.get("timeframes") if isinstance(symbol_patch.get("timeframes"), dict) else {}
        if isinstance(timeframes.get(higher_timeframe), dict):
            higher_market_state = str(timeframes.get(higher_timeframe, {}).get("state") or "").strip().upper()

        hydrated = dict(position)
        hydrated.update(
            {
                "symbol": symbol,
                "side": normalize_trade_side(position.get("side")),
                "entry_price": entry_price,
                "stop_loss": stop_loss,
                "initial_stop_loss": stop_loss,
                "take_profit": take_profit,
                "tp1": take_profit,
                "entry_market_state": market_state,
                "signal_price": signal_price,
                "signal_high": signal_high,
                "signal_low": signal_low,
                "timeframe": timeframe,
                "higher_timeframe": higher_timeframe,
                "strategy": str(
                    position.get("strategy")
                    or followup_seed.get("strategy")
                    or planned_trade.get("strategy")
                    or symbol_patch.get("signal")
                    or ""
                ).strip(),
                "style": str(
                    position.get("style")
                    or followup_seed.get("style")
                    or planned_trade.get("style")
                    or entry_idea.get("style")
                    or "Swing"
                ).strip(),
                "playbook_id": str(
                    position.get("playbook_id")
                    or followup_seed.get("playbook_id")
                    or planned_trade.get("playbook_id")
                    or ""
                ).strip(),
                "playbook_hint": str(
                    position.get("playbook_hint")
                    or followup_seed.get("playbook_hint")
                    or planned_trade.get("playbook_hint")
                    or planned_trade.get("playbook_id")
                    or ""
                ).strip(),
                "risk_percent": safe_float(
                    position.get("risk_percent")
                    or planned_trade.get("risk_percent"),
                    0.0,
                ),
                "entry_time": str(
                    position.get("entry_time")
                    or position.get("open_time")
                    or position.get("opened_at")
                    or position.get("created_at")
                    or ""
                ),
            }
        )
        hydrated["management_style"] = self._resolve_live_management_style(
            hydrated,
            symbol_patch,
            market_state=market_state,
            higher_market_state=higher_market_state,
            timeframe=timeframe,
        )
        return hydrated

    def _management_market_data_for_symbol(
        self,
        symbol: str,
        position: dict[str, Any],
        symbol_patch: dict[str, Any],
        analysis_board: dict[str, Any],
        execution: dict[str, Any],
    ) -> dict[str, Any]:
        """拼装管理模块需要的单品种 market_data。"""
        board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
        live_timeframes = (
            board.get("live_timeframes")
            if isinstance(board.get("live_timeframes"), dict)
            else {}
        )
        ab_context = board.get("ab_context") if isinstance(board.get("ab_context"), dict) else {}
        ab_timeframes = (
            ab_context.get("timeframes")
            if isinstance(ab_context.get("timeframes"), dict)
            else {}
        )
        planned_trade = (
            symbol_patch.get("planned_trade")
            if isinstance(symbol_patch.get("planned_trade"), dict)
            else {}
        )
        followup_seed = (
            symbol_patch.get("followup_seed")
            if isinstance(symbol_patch.get("followup_seed"), dict)
            else {}
        )
        timeframe = str(
            position.get("timeframe")
            or followup_seed.get("timeframe")
            or self._infer_followup_timeframe(symbol_patch)
            or "5m"
        ).strip().lower()
        live_frame = live_timeframes.get(timeframe) if isinstance(live_timeframes.get(timeframe), dict) else {}
        if not live_frame and timeframe != "5m":
            live_frame = live_timeframes.get("5m") if isinstance(live_timeframes.get("5m"), dict) else {}
        ab_frame = ab_timeframes.get(timeframe) if isinstance(ab_timeframes.get(timeframe), dict) else {}
        if not ab_frame and timeframe != "5m":
            ab_frame = ab_timeframes.get("5m") if isinstance(ab_timeframes.get("5m"), dict) else {}
        latest_bar = live_frame.get("latest_bar") if isinstance(live_frame.get("latest_bar"), dict) else {}

        current_price = (
            safe_float(latest_bar.get("C"), 0.0)
            or safe_float(latest_bar.get("close"), 0.0)
            or safe_float(position.get("current_price"), 0.0)
            or safe_float(position.get("mark_price"), 0.0)
            or safe_float(position.get("last_price"), 0.0)
            or safe_float(planned_trade.get("entry_price"), 0.0)
        )
        key_levels = (
            symbol_patch.get("key_levels")
            if isinstance(symbol_patch.get("key_levels"), dict)
            else {}
        )
        ab_ema = ab_frame.get("ab_ema") if isinstance(ab_frame.get("ab_ema"), dict) else {}
        if not ab_ema:
            ema20 = safe_float(live_frame.get("ema20"), 0.0)
            if ema20 > 0:
                ab_ema = {"ema20": ema20}
        ab_sr = ab_frame.get("ab_sr") if isinstance(ab_frame.get("ab_sr"), dict) else {}
        if not ab_sr:
            ab_sr = {
                "nearest_support": safe_float(key_levels.get("nearest_support"), 0.0),
                "nearest_resistance": safe_float(key_levels.get("nearest_resistance"), 0.0),
            }
        ab_mm = ab_frame.get("ab_mm") if isinstance(ab_frame.get("ab_mm"), dict) else {}
        ab_patterns = ab_frame.get("ab_patterns") if isinstance(ab_frame.get("ab_patterns"), dict) else {}
        recent_bars = live_frame.get("recent_bars") if isinstance(live_frame.get("recent_bars"), list) else []

        merged_timeframes: dict[str, Any] = {}
        source_timeframes = symbol_patch.get("timeframes") if isinstance(symbol_patch.get("timeframes"), dict) else {}
        timeframe_keys = set(source_timeframes.keys()) | set(live_timeframes.keys()) | set(ab_timeframes.keys())
        for tf in sorted(timeframe_keys):
            source_tf = source_timeframes.get(tf) if isinstance(source_timeframes.get(tf), dict) else {}
            live_tf = live_timeframes.get(tf) if isinstance(live_timeframes.get(tf), dict) else {}
            ab_tf = ab_timeframes.get(tf) if isinstance(ab_timeframes.get(tf), dict) else {}
            latest = live_tf.get("latest_bar") if isinstance(live_tf.get("latest_bar"), dict) else {}
            merged_timeframes[tf] = {
                "ai": source_tf.get("ai") or ab_tf.get("ai"),
                "state": source_tf.get("state") or ab_tf.get("state"),
                "signal": source_tf.get("signal") or ab_tf.get("signal"),
                "summary": source_tf.get("summary") or live_tf.get("summary"),
                "last_close": (
                    safe_float(latest.get("C"), 0.0)
                    or safe_float(latest.get("close"), 0.0)
                    or safe_float(source_tf.get("last_close"), 0.0)
                ),
                "current_price": (
                    safe_float(latest.get("C"), 0.0)
                    or safe_float(latest.get("close"), 0.0)
                    or safe_float(source_tf.get("current_price"), 0.0)
                ),
                "trend": self._trend_hint_from_values(
                    source_tf.get("trend"),
                    source_tf.get("ai"),
                    ab_tf.get("ai"),
                ),
            }

        live_context = execution.get("live_context") if isinstance(execution.get("live_context"), dict) else {}
        exchange_key = self.exchange_for_symbol(symbol)
        exchange_context = live_context.get(exchange_key) if isinstance(live_context.get(exchange_key), dict) else {}
        balance = exchange_context.get("balance") if isinstance(exchange_context.get("balance"), dict) else {}
        account_info = {
            "margin_ratio": safe_float(balance.get("margin_ratio"), 1000.0),
            "equity": (
                safe_float(balance.get("equity"), 0.0)
                or safe_float(balance.get("total"), 0.0)
                or safe_float(balance.get("balance"), 0.0)
            ),
            "used_margin": safe_float(balance.get("used_margin"), 0.0),
        }

        return {
            "symbols": {symbol: symbol_patch},
            "current_price": current_price,
            "recent_bars": recent_bars,
            "ab_state": {"state": str(symbol_patch.get("market_state") or "").strip().upper()},
            "ab_ema": ab_ema,
            "ab_sr": ab_sr,
            "ab_mm": ab_mm,
            "ab_patterns": ab_patterns,
            "key_levels": key_levels,
            "timeframes": merged_timeframes,
            "planned_trade": planned_trade,
            "followup_seed": followup_seed,
            "account_info": account_info,
            "refs": symbol_patch.get("refs") if isinstance(symbol_patch.get("refs"), list) else [],
        }

    def rule_engine_decision(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        phase_plan: dict[str, Any],
        analysis_board: dict[str, Any],
        quick_scan_events: dict[str, Any],
    ) -> dict[str, Any]:
        """规则引擎执行路径：在本轮未触发 LLM 时直接生成开仓与管理动作。"""
        from rule_engine import get_executable_trades
        from trading.position_management import manage_position

        positions = self._tracked_bot_positions(execution)
        # 优先从 runtime.symbols 读取（包含完整的 pre_signal 数据），fallback 到 market_cache
        symbol_cache = runtime.get("symbols") if isinstance(runtime.get("symbols"), dict) else {}
        if not symbol_cache:
            symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        focus_symbols = phase_plan.get("focus_symbols") or []
        normalized_symbol_cache: dict[str, Any] = {}
        for symbol in focus_symbols:
            cached_raw = symbol_cache.get(symbol) if isinstance(symbol_cache.get(symbol), dict) else {}
            analysis = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            ab_context = analysis.get("ab_context") if isinstance(analysis.get("ab_context"), dict) else {}
            frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
            normalized_symbol_cache[symbol] = _merge_symbol_patch_with_mag_bridge(
                self._clear_expired_live_symbol_state(build_runtime_symbol_patch(cached_raw)),
                frames,
            )
        for symbol, payload in symbol_cache.items():
            if symbol not in normalized_symbol_cache and isinstance(payload, dict):
                analysis = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
                ab_context = analysis.get("ab_context") if isinstance(analysis.get("ab_context"), dict) else {}
                frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
                normalized_symbol_cache[symbol] = _merge_symbol_patch_with_mag_bridge(
                    self._clear_expired_live_symbol_state(build_runtime_symbol_patch(payload)),
                    frames,
                )
        symbol_cache = normalized_symbol_cache

        # 1. 持仓管理（如果有持仓）
        position_management = []
        if positions:
            try:
                for pos in positions:
                    symbol = self._normalize_live_symbol(pos.get("symbol"))
                    raw_state = symbol_cache.get(symbol) if isinstance(symbol_cache.get(symbol), dict) else {}
                    if not raw_state:
                        market_symbols = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
                        raw_state = market_symbols.get(symbol) if isinstance(market_symbols.get(symbol), dict) else {}
                    symbol_patch = build_runtime_symbol_patch(raw_state)
                    management_position = self._hydrate_live_position_for_management(
                        pos,
                        symbol_patch,
                        analysis_board,
                    )
                    management_market_data = self._management_market_data_for_symbol(
                        symbol,
                        management_position,
                        symbol_patch,
                        analysis_board,
                        execution,
                    )
                    result = manage_position(management_position, management_market_data)
                    if result and result.get("actions"):
                        position_management.extend(result["actions"])
                    else:
                        LOG.info(
                            "[RULE_ENGINE_DECISION] %s 管理无动作: reason=%s | premise=%s | confidence=%s",
                            self._normalize_live_symbol(pos.get("symbol")),
                            (result or {}).get("reason"),
                            ((result or {}).get("premise_check") or {}).get("action"),
                            ((result or {}).get("strength_check") or {}).get("confidence"),
                        )
                if position_management:
                    LOG.info("[RULE_ENGINE_DECISION] 生成 %d 个持仓管理 actions", len(position_management))
            except Exception as exc:
                LOG.warning("[RULE_ENGINE_DECISION] 持仓管理失败: %s", exc)

        # 2. 开仓决策（如果无持仓）
        executable_trades = []
        # 当前规则引擎路径在有无持仓两种情况下都会运行
        try:
            LOG.info("[RULE_ENGINE_DECISION] symbol_cache keys: %s", list(symbol_cache.keys()))
            for sym in focus_symbols:
                cached_raw = symbol_cache.get(sym, {})
                cached = cached_raw if isinstance(cached_raw, dict) else {}
                pre_signal_raw = cached.get("pre_signal", {})
                pre_signal = pre_signal_raw if isinstance(pre_signal_raw, dict) else {}
                LOG.info(
                    "[RULE_ENGINE_DECISION] %s: status=%s, pre_signal_active=%s",
                    sym,
                    cached.get("status"),
                    pre_signal.get("active"),
                )

            executable_trades = get_executable_trades(symbol_cache)
            if executable_trades:
                LOG.info("[RULE_ENGINE_DECISION] 发现 %d 个可执行交易", len(executable_trades))
                for trade in executable_trades:
                    LOG.info(f"[RULE_ENGINE_DECISION] {trade['symbol']}: {trade['strategy']} | confidence={trade['confidence']:.2f} | {trade['reason']}")
            else:
                LOG.info("[RULE_ENGINE_DECISION] 未发现可执行交易")
        except Exception as exc:
            LOG.warning("[RULE_ENGINE_DECISION] 规则引擎失败: %s", exc, exc_info=True)

        # 3. 构建 decision
        actions = []
        symbols_dict = {}
        symbol_updates = {}
        pending_open_keys: set[tuple[str, str]] = set()

        for symbol in focus_symbols:
            cached = symbol_cache.get(symbol, {}) if isinstance(symbol_cache.get(symbol), dict) else {}
            patch = self._clear_expired_live_symbol_state(build_runtime_symbol_patch(cached))
            patch_is_expired = _patch_is_expired_or_stale(patch) or self._looks_like_stale_live_patch(cached)

            # 生成开仓 actions（当前规则引擎路径始终运行）
            matching_trades = [t for t in executable_trades if t["symbol"] == symbol]
            primary_trade = matching_trades[0] if matching_trades else None
            planned_trade_action = None
            if (not patch_is_expired) and (not primary_trade):
                planned_trade_action = self._build_executable_planned_trade_action(
                    symbol=symbol,
                    cached=cached,
                    reason_prefix="规则链补桥",
                    refs=[],
                    source_chain="planned_trade_bridge.rule_engine",
                )
            if not patch_is_expired:
                patch = _enrich_live_symbol_patch(
                    patch,
                    trade=primary_trade,
                    action=planned_trade_action,
                )
            symbol_updates[symbol] = patch

            # 构建 symbols 字典
            symbols_dict[symbol] = {
                "status": patch.get("status", "watching"),
                "stage": patch.get("stage", ""),
                "market_state": patch.get("market_state", ""),
                "thesis": patch.get("thesis", ""),
                "pre_signal": patch.get("pre_signal"),
                "planned_trade": patch.get("planned_trade"),
                "latest_strategy_family": patch.get("latest_strategy_family"),
            }
            if matching_trades:
                for matching_trade in matching_trades:
                    action_reason = f"规则引擎: {matching_trade['strategy']} | {matching_trade['reason']}"
                    strategy_key = self._canonical_live_strategy_key(
                        matching_trade.get("strategy"),
                        matching_trade.get("playbook_family"),
                        matching_trade.get("playbook_id"),
                        patch.get("ema_gap_variant"),
                    )
                    entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, execution)
                    if entry_blocked:
                        actions.append(
                            {
                                "type": "LOG_ONLY",
                                "symbol": symbol,
                                "reason": f"{action_reason} | [LIVE_ENTRY_CONFLICT] {entry_block_reason}",
                                "refs": [],
                            }
                        )
                        continue

                    cycle_key = self._cycle_open_key(symbol, strategy_key)
                    if cycle_key in pending_open_keys:
                        actions.append(
                            {
                                "type": "LOG_ONLY",
                                "symbol": symbol,
                                "reason": f"{action_reason} | [DUPLICATE_IN_CYCLE] 同一轮同品种同策略已生成 OPEN_ORDER",
                                "refs": [],
                            }
                        )
                        continue

                    LOG.info(
                        "[RULE_ENGINE_DECISION] %s 生成 OPEN_ORDER: %s",
                        symbol,
                        matching_trade.get("strategy"),
                    )
                    actions.append(
                        build_open_order_action(
                            symbol=symbol,
                            reason=action_reason,
                            trade=matching_trade,
                            patch=patch,
                            signal_source=self.config.execution_bot_id,
                            source_chain="rule_engine",
                            base_action={
                                "confidence": matching_trade.get("confidence"),
                            },
                        )
                    )
                    pending_open_keys.add(cycle_key)
            elif planned_trade_action:
                strategy_key = self._live_strategy_key_from_action(planned_trade_action)
                entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, execution)
                if entry_blocked:
                    actions.append(
                        {
                            "type": "LOG_ONLY",
                            "symbol": symbol,
                            "reason": f"{planned_trade_action.get('reason') or 'planned_trade桥接'} | [LIVE_ENTRY_CONFLICT] {entry_block_reason}",
                            "refs": [],
                        }
                    )
                else:
                    cycle_key = self._cycle_open_key(symbol, strategy_key)
                    if cycle_key in pending_open_keys:
                        actions.append(
                            {
                                "type": "LOG_ONLY",
                                "symbol": symbol,
                                "reason": f"{planned_trade_action.get('reason') or 'planned_trade桥接'} | [DUPLICATE_IN_CYCLE] 同一轮同品种同策略已生成 OPEN_ORDER",
                                "refs": [],
                            }
                        )
                        continue
                    LOG.info("[PLANNED_TRADE_BRIDGE] %s 生成 OPEN_ORDER", symbol)
                    actions.append(planned_trade_action)
                    pending_open_keys.add(cycle_key)
            else:
                action_type = "LOG_ONLY"
                action_reason = "规则引擎: 未识别到可执行交易"

                actions.append({
                    "type": action_type,
                    "symbol": symbol,
                    "reason": action_reason,
                    "refs": [],
                })

        if positions:
            market_summary = f"规则引擎执行路径：当前有 {len(positions)} 个持仓，生成 {len(position_management)} 个管理 actions。"
        else:
            market_summary = f"规则引擎执行路径：识别到 {len(executable_trades)} 个可执行交易。"

        return {
            "phase": phase_plan["phase"],
            "market_summary": market_summary,
            "focus_symbols": focus_symbols,
            "symbols": symbols_dict,
            "symbol_updates": symbol_updates,
            "actions": actions,
            "position_management": position_management,
            "next_scan_seconds": 120 if not positions else 60,
            "next_scan_reason": "规则引擎执行路径：无持仓 2 分钟扫描，有持仓 1 分钟扫描",
            "state_patch": {},
            "explanation": "本轮未触发 LLM，直接使用规则引擎识别交易机会，并用代码化逻辑执行持仓管理。",
        }

    def timeout_fallback_decision(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        phase_plan: dict[str, Any],
        analysis_board: dict[str, Any],
        quick_scan_events: dict[str, Any],
        error: Exception,
    ) -> dict[str, Any]:
        # live 当前只保留规则引擎顺势链路：H1/L1 + H2/L2 + MAG / EMA gap。
        env_file = Path(__file__).parent.parent / "config" / ".env"
        rule_engine_enabled = True  # 默认启用
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.strip().startswith("AB_PATROL_RULE_ENGINE="):
                    rule_engine_enabled = bool(int(line.split("=", 1)[1].strip()))

        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        focus_symbols = [str(item).upper() for item in (phase_plan.get("focus_symbols") or [])]
        refs = list(phase_plan.get("prompt_references") or [])[:4]
        positions = self._tracked_bot_positions(execution)
        cached_pre_signal = any(
            str((symbol_cache.get(symbol, {}) or {}).get("status") or "")
            in {"pre_signal", "entry_ready", "entry_ready_blocked"}
            for symbol in focus_symbols
        )
        next_scan_seconds = 240 if positions or cached_pre_signal else 480
        symbol_updates: dict[str, Any] = {}
        actions: list[dict[str, Any]] = []
        pending_open_keys: set[tuple[str, str]] = set()

        LOG.info("[TIMEOUT_FALLBACK] symbol_cache keys=%d, focus_symbols=%s", len(symbol_cache), focus_symbols)

        # 使用规则引擎分析所有品种（无论是否有持仓）
        if rule_engine_enabled:
            try:
                executable_trades = get_executable_trades(symbol_cache)
                if executable_trades:
                    LOG.info("[RULE_ENGINE] 发现 %d 个可执行交易", len(executable_trades))
                    for trade in executable_trades:
                        LOG.info("[RULE_ENGINE] %s: %s | confidence=%.2f | %s",
                                trade["symbol"], trade["strategy"], trade["confidence"], trade["reason"])
            except Exception as exc:
                LOG.warning("[RULE_ENGINE] 规则引擎失败: %s", exc)
                executable_trades = []
        else:
            executable_trades = []

        def _trim_text(value: Any, limit: int = 180) -> str:
            text = str(value or "").strip()
            if len(text) <= limit:
                return text
            return text[: max(0, limit - 1)].rstrip() + "…"

        for symbol in focus_symbols:
            cached = symbol_cache.get(symbol, {}) if isinstance(symbol_cache.get(symbol), dict) else {}
            board = analysis_board.get(symbol, {}) if isinstance(analysis_board.get(symbol), dict) else {}
            events = self.flatten_events(quick_scan_events.get(symbol))
            event_text = ", ".join(events[:4]) if events else "无新增事件"
            thesis = _trim_text(
                str(
                    cached.get("thesis")
                    or cached.get("structure_summary")
                    or cached.get("market_state_detail")
                    or f"{symbol} 本轮模型超时，保持上一轮观察结论。"
                ),
                220,
            )
            patch = self._clear_expired_live_symbol_state(build_runtime_symbol_patch(
                cached,
                market_state_detail=cached.get("market_state_detail") or board.get("cached_state", {}).get("market_state_detail"),
                structure_summary=cached.get("structure_summary") or thesis,
                key_levels=cached.get("key_levels") or board.get("cached_state", {}).get("key_levels") or {},
                thesis=thesis,
            ))
            symbol_updates[symbol] = patch

            # 优先使用规则引擎
            action_type = "LOG_ONLY"
            action_reason = f"模型超时，保留上一轮判断；事件参考: {event_text}"

            # 1. 规则引擎优先
            if rule_engine_enabled and executable_trades:
                matching_trades = [t for t in executable_trades if t["symbol"] == symbol]
                if matching_trades:
                    for matching_trade in matching_trades:
                        action_reason = f"规则引擎: {matching_trade['strategy']} | {matching_trade['reason']}"
                        strategy_key = self._canonical_live_strategy_key(
                            matching_trade.get("strategy"),
                            matching_trade.get("playbook_family"),
                            matching_trade.get("playbook_id"),
                            patch.get("ema_gap_variant"),
                        )
                        entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, execution)
                        if entry_blocked:
                            actions.append(
                                {
                                    "type": "LOG_ONLY",
                                    "symbol": symbol,
                                    "reason": f"{action_reason} | [LIVE_ENTRY_CONFLICT] {entry_block_reason}",
                                    "refs": refs,
                                }
                            )
                            continue

                        cycle_key = self._cycle_open_key(symbol, strategy_key)
                        if cycle_key in pending_open_keys:
                            actions.append(
                                {
                                    "type": "LOG_ONLY",
                                    "symbol": symbol,
                                    "reason": f"{action_reason} | [DUPLICATE_IN_CYCLE] 同一轮同品种同策略已生成 OPEN_ORDER",
                                    "refs": refs,
                                }
                            )
                            continue

                        LOG.info("[RULE_ENGINE] %s 执行: %s", symbol, matching_trade["strategy"])
                        actions.append(
                            build_open_order_action(
                                symbol=symbol,
                                reason=action_reason,
                                trade=matching_trade,
                                patch=patch,
                                refs=refs,
                                signal_source=self.config.execution_bot_id,
                                source_chain="timeout_fallback.rule_engine",
                                base_action={
                                    "confidence": matching_trade.get("confidence"),
                                },
                            )
                        )
                        pending_open_keys.add(cycle_key)
                    continue

            planned_trade_action = self._build_executable_planned_trade_action(
                symbol=symbol,
                cached=cached,
                refs=refs,
                reason_prefix="超时兜底补桥",
                source_chain="planned_trade_bridge.timeout_fallback",
            )
            if planned_trade_action:
                strategy_key = self._live_strategy_key_from_action(planned_trade_action)
                entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, execution)
                if entry_blocked:
                    actions.append(
                        {
                            "type": "LOG_ONLY",
                            "symbol": symbol,
                            "reason": f"{planned_trade_action.get('reason') or 'planned_trade桥接'} | [LIVE_ENTRY_CONFLICT] {entry_block_reason}",
                            "refs": refs,
                        }
                    )
                else:
                    cycle_key = self._cycle_open_key(symbol, strategy_key)
                    if cycle_key in pending_open_keys:
                        actions.append(
                            {
                                "type": "LOG_ONLY",
                                "symbol": symbol,
                                "reason": f"{planned_trade_action.get('reason') or 'planned_trade桥接'} | [DUPLICATE_IN_CYCLE] 同一轮同品种同策略已生成 OPEN_ORDER",
                                "refs": refs,
                            }
                        )
                        continue
                    LOG.info("[PLANNED_TRADE_BRIDGE] %s 超时兜底生成 OPEN_ORDER", symbol)
                    actions.append(planned_trade_action)
                    pending_open_keys.add(cycle_key)
                continue

            actions.append({
                "type": action_type,
                "symbol": symbol,
                "reason": action_reason,
                "refs": refs,
            })

        error_text = str(error or "").strip().lower()
        if "timeout" in error_text:
            error_label = "本轮决策模型超时"
        else:
            error_label = "本轮决策提供器不可用"

        if positions:
            market_summary = f"{error_label}。为避免持仓无人看管，系统保留上一轮管理结论，不做新开仓，缩短到 60 秒后重试。"
        else:
            market_summary = f"{error_label}。系统保留上一轮观察结论，不做新开仓，快速重试下一轮。"

        return {
            "phase": phase_plan["phase"],
            "market_summary": market_summary,
            "focus_symbols": focus_symbols,
            "symbols": symbol_updates,
            "symbol_updates": symbol_updates,
            "actions": actions,
            "position_management": [],
            "next_scan_seconds": next_scan_seconds,
            "next_scan_reason": "MODEL_TIMEOUT_RETRY",
            "state_patch": {
                "model_timeout": True,
                "last_model_timeout_at": utc_iso(),
                "needs_post_trade_refresh": False,
                "quiet_loops": int(runtime.get("quiet_loops") or 0),
            },
            "explanation": _trim_text(f"Decision provider fallback: {error}", 240),
        }

    def run_cycle(self, trigger: dict[str, Any] | None = None) -> dict[str, Any]:
        cycle_started = time.perf_counter()
        profile_stages: dict[str, float] = {}

        def mark_stage(name: str, started_at: float) -> None:
            profile_stages[name] = round((time.perf_counter() - started_at) * 1000, 2)

        stage_started = time.perf_counter()
        runtime = self._sanitize_runtime_symbols_state(self.load_runtime_state())
        market_cache = self.align_market_cache(runtime, self.normalize_market_cache(self.load_market_cache()))
        mark_stage("load_runtime_market_cache_ms", stage_started)

        stage_started = time.perf_counter()
        execution = self.execution_snapshot()
        mark_stage("execution_snapshot_ms", stage_started)

        stage_started = time.perf_counter()
        runtime.update(self.sync_live_followup_state(runtime, market_cache, execution))
        phase_plan = self.select_phase_plan(runtime, market_cache, execution, trigger)
        mark_stage("sync_followup_phase_plan_ms", stage_started)

        stage_started = time.perf_counter()
        prepared = self.prepare_prompt_context(runtime, market_cache, execution, trigger, phase_plan)
        mark_stage("prepare_prompt_context_ms", stage_started)
        prepared_profile = prepared.get("profile") if isinstance(prepared.get("profile"), dict) else {}
        for name, value in prepared_profile.items():
            try:
                profile_stages[str(name)] = round(float(value), 2)
            except Exception:
                continue
        symbol_cache = prepared["symbol_cache"]
        ab_context_by_symbol = prepared["ab_context_by_symbol"]
        quick_scan_events = prepared["quick_scan_events"]
        analysis_board = prepared["analysis_board"]

        used_fast_lane = False
        payload: dict[str, Any] = {}
        response_text = ""
        provider_meta: dict[str, Any] = {}
        decision: dict[str, Any]
        ref_names: list[str]
        knowledge_meta: dict[str, Any]

        fast_lane_candidates = []
        from llm_trigger_integration import should_use_fast_lane

        if should_use_fast_lane() and not execution.get("positions") and phase_plan["phase"] in {"SCAN", "ENTRY_READY"}:
            fast_lane_candidates = self.scalp_fast_candidates(
                phase_plan,
                symbol_cache,
                quick_scan_events,
                ab_context_by_symbol,
            )

        decision = {}
        ref_names = []
        knowledge_meta = {}
        stage_started = time.perf_counter()
        # LLM 不能成为实盘链硬依赖；未显式开启时直接退回规则引擎。
        llm_runtime_enabled = not (
            str(self.config.decision_provider).lower() in {"openclaw", "openclaw_oauth", "llm_gateway", "llm"}
            and os.getenv(
                "AB_PATROL_ENABLE_LLM_RUNTIME",
                os.getenv("AB_PATROL_ENABLE_OPENCLAW_RUNTIME", "0"),
            )
            != "1"
        )

        if fast_lane_candidates and llm_runtime_enabled:
            scalp_symbol = fast_lane_candidates[0]
            try:
                fast_system, fast_user, fast_refs, fast_board, fast_events, fast_knowledge = self.build_scalp_fast_prompt(
                    runtime,
                    market_cache,
                    execution,
                    trigger,
                    phase_plan,
                    prepared,
                    scalp_symbol,
                )
                payload, response_text, provider_meta = self.invoke_decision_provider(
                    fast_system,
                    fast_user,
                    request_name="last_fast_request.md",
                    response_name="last_fast_response.json",
                )
                try:
                    fast_decision = self.extract_decision(response_text)
                except json.JSONDecodeError as exc:
                    LOG.warning("fast lane decision json malformed, attempting repair: %s", exc)
                    fast_decision = self.repair_decision_json(response_text, exc)
                fast_decision = self.validate_decision(
                    fast_decision,
                    {"phase": "SCALP_FAST", **phase_plan, "focus_symbols": [scalp_symbol]},
                    fast_refs,
                    market_cache,
                    fast_board,
                    fast_events,
                )
                fast_actions = fast_decision.get("actions") or []
                fast_executable = any(
                    isinstance(action, dict)
                    and str(action.get("type") or "") in {
                        "OPEN_ORDER",
                        "CLOSE_POSITION",
                        "MODIFY_STOP_LOSS",
                        "MODIFY_TAKE_PROFIT",
                        "PARTIAL_CLOSE",
                        "CANCEL_ALL_ORDERS",
                    }
                    for action in fast_actions
                )
                fast_statuses = [
                    str((patch or {}).get("status") or "").lower()
                    for patch in (fast_decision.get("symbol_updates") or {}).values()
                    if isinstance(patch, dict)
                ]
                if fast_executable or any(status in {"entry_ready", "entry_ready_blocked", "in_trade", "manage"} for status in fast_statuses):
                    decision = fast_decision
                    ref_names = fast_refs
                    knowledge_meta = fast_knowledge
                    analysis_board = fast_board
                    quick_scan_events = fast_events
                    used_fast_lane = True
            except RuntimeError as exc:
                LOG.warning("fast lane unavailable, falling back to full decision: %s", exc)

        if not decision:
            # 智能 LLM 触发管理
            from llm_trigger_integration import should_use_llm

            use_llm, trigger_reason = should_use_llm(
                phase_plan=phase_plan,
                execution=execution,
                market_cache=market_cache,
                runtime=runtime,
            )

            if use_llm and not llm_runtime_enabled:
                LOG.info("[RULE_ENGINE] LLM 运行态未启用，跳过 LLM 决策，直接走规则引擎")
                use_llm = False
                trigger_reason = f"{trigger_reason} | llm_runtime_disabled"

            if use_llm:
                # 使用 LLM
                LOG.info(f"[LLM_TRIGGER] {trigger_reason}")
                system_text, user_text, ref_names, analysis_board, quick_scan_events, knowledge_meta = self.build_prompt_from_context(
                    runtime,
                    market_cache,
                    execution,
                    trigger,
                    phase_plan,
                    prepared,
                )
                try:
                    payload, response_text, provider_meta = self.invoke_decision_provider(
                        system_text,
                        user_text,
                    )
                    try:
                        decision = self.extract_decision(response_text)
                    except json.JSONDecodeError as exc:
                        LOG.warning("decision json malformed, attempting repair: %s", exc)
                        decision = self.repair_decision_json(response_text, exc)
                except RuntimeError as exc:
                    LOG.warning("decision provider unavailable, using fallback decision: %s", exc)
                    decision = self.timeout_fallback_decision(
                        runtime,
                        market_cache,
                        execution,
                        phase_plan,
                        analysis_board,
                        quick_scan_events,
                        exc,
                    )
            else:
                # 使用规则引擎
                LOG.info(f"[RULE_ENGINE] {trigger_reason}")
                decision = self.rule_engine_decision(
                    runtime,
                    market_cache,
                    execution,
                    phase_plan,
                    analysis_board,
                    quick_scan_events,
                )
        mark_stage("decision_pipeline_ms", stage_started)
        decision = self.validate_decision(decision, phase_plan, ref_names, market_cache, analysis_board, quick_scan_events)

        # 规则引擎作为安全网：即使 LLM 输出 LOG_ONLY，规则引擎也能识别并执行交易
        env_file = Path(__file__).parent.parent / "config" / ".env"
        rule_engine_enabled = True
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.strip().startswith("AB_PATROL_RULE_ENGINE="):
                    rule_engine_enabled = bool(int(line.split("=", 1)[1].strip()))
                    break

        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        if rule_engine_enabled:
            from rule_engine import get_executable_trades
            symbol_cache_for_rules: dict[str, dict[str, Any]] = {}
            base_symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
            decision_symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
            decision_symbols = decision.get("symbols") if isinstance(decision.get("symbols"), dict) else {}
            all_symbols = {
                str(symbol).upper()
                for symbol in (
                    list(base_symbol_cache.keys())
                    + list(decision_symbol_updates.keys())
                    + list(decision_symbols.keys())
                )
            }
            for symbol in all_symbols:
                merged_patch = dict(base_symbol_cache.get(symbol) or {}) if isinstance(base_symbol_cache.get(symbol), dict) else {}
                if isinstance(decision_symbols.get(symbol), dict):
                    merged_patch.update(decision_symbols.get(symbol) or {})
                if isinstance(decision_symbol_updates.get(symbol), dict):
                    merged_patch.update(decision_symbol_updates.get(symbol) or {})
                symbol_cache_for_rules[symbol] = merged_patch
            try:
                executable_trades = get_executable_trades(symbol_cache_for_rules)
                if executable_trades:
                    LOG.info(
                        "[RULE_ENGINE_SAFETY_NET] 发现 %d 个可执行交易 (当前持仓=%d)",
                        len(executable_trades),
                        len(positions),
                    )
                    # 检查是否有 LOG_ONLY 的 actions 可以升级为 OPEN_ORDER
                    actions = decision.get("actions") or []
                    pending_open_keys = self._collect_pending_open_keys(actions)
                    symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
                    symbols_patch = decision.get("symbols") if isinstance(decision.get("symbols"), dict) else {}
                    for index, action in enumerate(actions):
                        if not isinstance(action, dict):
                            continue
                        symbol = str(action.get("symbol") or "").upper()
                        if action.get("type") == "LOG_ONLY":
                            patch = symbol_updates.get(symbol)
                            if not isinstance(patch, dict):
                                patch = symbols_patch.get(symbol) if isinstance(symbols_patch.get(symbol), dict) else {}
                            cached_for_bridge = symbol_cache_for_rules.get(symbol) if isinstance(symbol_cache_for_rules.get(symbol), dict) else patch
                            matching_trade = next((t for t in executable_trades if t["symbol"] == symbol), None)
                            planned_trade_action = None
                            if not matching_trade:
                                planned_trade_action = self._build_executable_planned_trade_action(
                                    symbol=symbol,
                                    cached=cached_for_bridge,
                                    refs=action.get("refs"),
                                    reason_prefix="planned_trade安全网升级",
                                    source_chain="planned_trade_bridge.safety_net",
                                )
                            if matching_trade:
                                strategy_key = self._canonical_live_strategy_key(
                                    matching_trade.get("strategy"),
                                    patch.get("strategy_family"),
                                    patch.get("playbook_id"),
                                    patch.get("ema_gap_variant"),
                                )
                                entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, execution)
                                if entry_blocked:
                                    LOG.info(
                                        "[RULE_ENGINE_SAFETY_NET] %s 保持 LOG_ONLY: %s",
                                        symbol,
                                        entry_block_reason,
                                    )
                                    continue
                                cycle_key = self._cycle_open_key(symbol, strategy_key)
                                if cycle_key in pending_open_keys:
                                    LOG.info(
                                        "[RULE_ENGINE_SAFETY_NET] %s 保持 LOG_ONLY: 同一轮同品种同策略已生成 OPEN_ORDER",
                                        symbol,
                                    )
                                    continue
                                actions[index] = build_open_order_action(
                                    symbol=symbol,
                                    reason=f"规则引擎升级: {matching_trade['strategy']} | {matching_trade['reason']}",
                                    trade=matching_trade,
                                    patch=patch,
                                    refs=action.get("refs"),
                                    signal_source=self.config.execution_bot_id,
                                    source_chain="rule_engine_safety_net",
                                    base_action=action,
                                )
                                pending_open_keys.add(cycle_key)
                                LOG.info(f"[RULE_ENGINE_SAFETY_NET] {symbol} 从 LOG_ONLY 升级为 OPEN_ORDER: {matching_trade['strategy']}")
                            elif planned_trade_action:
                                strategy_key = self._live_strategy_key_from_action(planned_trade_action)
                                entry_blocked, entry_block_reason = self._live_entry_conflict(symbol, strategy_key, execution)
                                if entry_blocked:
                                    LOG.info(
                                        "[PLANNED_TRADE_BRIDGE] %s 保持 LOG_ONLY: %s",
                                        symbol,
                                        entry_block_reason,
                                    )
                                    continue
                                cycle_key = self._cycle_open_key(symbol, strategy_key)
                                if cycle_key in pending_open_keys:
                                    LOG.info(
                                        "[PLANNED_TRADE_BRIDGE] %s 保持 LOG_ONLY: 同一轮同品种同策略已生成 OPEN_ORDER",
                                        symbol,
                                    )
                                    continue
                                actions[index] = planned_trade_action
                                pending_open_keys.add(cycle_key)
                                LOG.info("[PLANNED_TRADE_BRIDGE] %s 从 LOG_ONLY 升级为 OPEN_ORDER", symbol)
            except Exception as exc:
                LOG.warning("[RULE_ENGINE_SAFETY_NET] 规则引擎失败: %s", exc)

        decision = self._sanitize_decision_symbol_outputs(decision)

        state_patch = decision.setdefault("state_patch", {})
        overall_eventful = False
        for symbol in phase_plan["focus_symbols"]:
            symbol_events = self.flatten_events(quick_scan_events.get(symbol))
            overall_eventful = overall_eventful or bool(symbol_events)
            patch = decision.setdefault("symbol_updates", {}).setdefault(symbol, {})
            cached = symbol_cache.get(symbol, {}) if isinstance(symbol_cache.get(symbol), dict) else {}
            if symbol_events:
                patch.setdefault("consecutive_watching", 0)
            else:
                patch.setdefault("consecutive_watching", int(cached.get("consecutive_watching") or 0) + 1)
        quiet_loops = 0 if overall_eventful else int(runtime.get("quiet_loops") or 0) + 1
        state_patch["quiet_loops"] = quiet_loops
        if phase_plan.get("full_refresh_reason"):
            state_patch["last_full_refresh_reason"] = phase_plan.get("full_refresh_reason")
        if provider_meta.get("model"):
            state_patch["decision_model"] = provider_meta.get("model")
        state_patch["fast_lane_attempted"] = bool(fast_lane_candidates)
        state_patch["fast_lane_executed"] = used_fast_lane
        if fast_lane_candidates:
            state_patch["fast_lane_candidates"] = fast_lane_candidates
        state_patch["knowledge_loading"] = knowledge_meta
        state_patch["prompt_references"] = ref_names
        write_json(self.logs_dir / "last_decision.json", decision)

        session_id = provider_meta.get("session_id") or runtime.get("openclaw_runtime_session_id") or ""

        cycle_id = f"cycle_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        stage_started = time.perf_counter()
        hydrated_actions: list[dict[str, Any]] = []
        for action in (decision.get("actions") or []):
            if isinstance(action, dict):
                hydrated_actions.append(self.hydrate_open_order_action(action, decision))
            else:
                hydrated_actions.append(action)
        decision["actions"] = hydrated_actions

        hydrated_management: list[dict[str, Any]] = []
        for action in (decision.get("position_management") or []):
            if isinstance(action, dict):
                hydrated_management.append(self.hydrate_open_order_action(action, decision))
            else:
                hydrated_management.append(action)
        decision["position_management"] = hydrated_management
        decision = self.enforce_live_strategy_scope(decision)
        mark_stage("hydrate_scope_actions_ms", stage_started)

        stage_started = time.perf_counter()
        execution_results: list[dict[str, Any]] = []
        for action in (decision.get("actions") or []):
            execution_results.append(self.execute_action(action, execution))
        for action in (decision.get("position_management") or []):
            if isinstance(action, dict) and action.get("type"):
                execution_results.append(self.execute_action(action, execution))
        mark_stage("execute_actions_ms", stage_started)

        stage_started = time.perf_counter()
        if any(
            item.get("type") in {"OPEN_ORDER", "CLOSE_POSITION", "MODIFY_STOP_LOSS", "MODIFY_TAKE_PROFIT", "PARTIAL_CLOSE", "CANCEL_ALL_ORDERS"}
            and item.get("success")
            for item in execution_results
        ):
            decision.setdefault("state_patch", {})["needs_post_trade_refresh"] = True
        else:
            decision.setdefault("state_patch", {})["needs_post_trade_refresh"] = False
        decision.setdefault("state_patch", {}).update(
            self.sync_live_followup_state(
                runtime,
                market_cache,
                execution,
                execution_results=execution_results,
            )
        )

        previous_symbols = json.loads(json.dumps(market_cache.get("symbols") or {}, ensure_ascii=False))
        self.update_market_cache(market_cache, decision, execution_results, cycle_id)
        current_symbols = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        pre_signal_notices = self.detect_new_pre_signals(
            previous_symbols if isinstance(previous_symbols, dict) else {},
            current_symbols,
            analysis_board,
            quick_scan_events,
        )
        if pre_signal_notices:
            self.prefetch_pre_signal_charts([str(item.get("symbol") or "") for item in pre_signal_notices if item.get("symbol")])
        mark_stage("post_execution_state_sync_ms", stage_started)

        stage_started = time.perf_counter()
        updated_runtime = self.write_runtime_state(
            runtime,
            market_cache,
            decision,
            phase_plan,
            execution,
            execution_results,
            analysis_board,
            str(session_id),
            cycle_id,
        )
        mark_stage("write_runtime_state_ms", stage_started)

        next_scan = updated_runtime["next_scan"]
        cycle_profile = {
            "total_ms": 0.0,
            "stages_ms": profile_stages,
        }
        cycle_payload = {
            "cycle_id": cycle_id,
            "phase": decision.get("phase") or phase_plan["phase"],
            "time_utc": utc_iso(),
            "trigger": trigger,
            "quick_scan_events": quick_scan_events,
            "phase_plan": phase_plan,
            "knowledge_loading": knowledge_meta,
            "analysis_board": analysis_board,
            "positions": execution.get("positions") if isinstance(execution.get("positions"), list) else [],
            "position_summaries": execution.get("orders") if isinstance(execution.get("orders"), list) else [],
            "decision": decision,
            "execution_results": execution_results,
            "next_scan": next_scan,
            "profile": cycle_profile,
            "render_status": {
                "cycle_card": {"ok": None, "skipped": True},
                "pre_signal": [],
                "housekeeping": {"ok": None, "skipped": True},
            },
            "push_status": {
                "cycle_card": {"ok": False, "skipped": True, "reason": "not_significant"},
                "pre_signal": [],
                "housekeeping": {"ok": False, "skipped": True, "reason": "not_due"},
            },
        }
        cycle_path = self.cycles_dir / f"{cycle_id}.json"
        write_json(cycle_path, cycle_payload)
        write_json(self.logs_dir / f"{cycle_id}_response.json", payload)
        write_json(self.logs_dir / f"{cycle_id}_decision.json", decision)
        last_request_path = self.logs_dir / "last_request.md"
        if last_request_path.exists():
            write_text(
                self.logs_dir / f"{cycle_id}_request.md",
                last_request_path.read_text(encoding="utf-8"),
            )

        push_result = {"ok": False, "skipped": True, "reason": "not_significant"}
        cycle_card_render = {"ok": True, "skipped": False}
        trade_update_push = {"ok": False, "skipped": True, "reason": "no_trade_events"}
        trade_update_render = {"ok": True, "skipped": True, "reason": "no_trade_events"}
        housekeeping_push = {"ok": False, "skipped": True, "reason": "not_due_30m"}
        housekeeping_render = {"ok": True, "skipped": True, "reason": "not_due_30m"}
        stage_started = time.perf_counter()
        if self.should_push_cycle_card(
            runtime,
            updated_runtime,
            decision,
            execution,
            execution_results,
            pre_signal_notices,
            trigger,
        ):
            try:
                push_text = self.render_push_card(
                    cycle_id,
                    updated_runtime,
                    decision,
                    execution,
                    execution_results,
                    int(next_scan.get("in_seconds") or 120),
                    next_scan,
                    trigger,
                    quick_scan_events,
                    analysis_board,
                )
            except Exception as exc:
                cycle_card_render = {"ok": False, "skipped": False, "error": " ".join(str(exc).split())[:240]}
                LOG.exception("cycle card render failed: %s", exc)
                push_result = {"ok": False, "skipped": True, "reason": "render_failed"}
            else:
                try:
                    push_result = self.push_telegram_update(push_text)
                except Exception as exc:
                    push_result = {"ok": False, "skipped": True, "reason": "push_failed", "error": " ".join(str(exc).split())[:240]}
                    LOG.exception("cycle card push failed: %s", exc)
                else:
                    cycle_symbol, cycle_chart = self.primary_chart_for_decision(decision, analysis_board)
                    if cycle_chart:
                        phase_mapping = {
                            "BOOTSTRAP": "初始化扫描",
                            "SCAN": "全市场扫描",
                            "WATCH": "观察阶段",
                            "PRE_SIGNAL": "预信号",
                            "ENTRY_READY": "临近触发",
                            "IN_TRADE": "持仓中",
                            "MANAGE": "管理持仓",
                            "EXIT": "退出阶段",
                            "COOLDOWN": "冷却期",
                        }
                        phase_text = phase_mapping.get(str(decision.get('phase') or ''), str(decision.get('phase') or '-'))
                        push_result = {
                            **push_result,
                            "photo": self.push_telegram_photo(
                                cycle_chart,
                                f"📈 {self.configured_runtime_title()}｜{cycle_symbol or '-'} 图表\n• 轮次: {cycle_id}\n• 阶段: {phase_text}",
                            ),
                        }
        else:
            cycle_card_render = {"ok": True, "skipped": True, "reason": "not_significant"}
        trade_update_items = self.collect_trade_update_items(execution_results)
        if trade_update_items:
            try:
                trade_update_text = self.render_trade_update_push(
                    cycle_id,
                    decision,
                    execution_results,
                    execution,
                )
            except Exception as exc:
                trade_update_render = {"ok": False, "skipped": False, "error": " ".join(str(exc).split())[:240]}
                trade_update_push = {"ok": False, "skipped": True, "reason": "render_failed"}
                LOG.exception("trade update render failed: %s", exc)
            else:
                trade_update_render = {"ok": True, "skipped": False, "count": len(trade_update_items)}
                try:
                    trade_update_push = self.push_telegram_update(trade_update_text)
                except Exception as exc:
                    trade_update_push = {"ok": False, "skipped": True, "reason": "push_failed", "error": " ".join(str(exc).split())[:240]}
                    LOG.exception("trade update push failed: %s", exc)
        pre_signal_pushes: list[dict[str, Any]] = []
        pre_signal_renders: list[dict[str, Any]] = []
        for notice in pre_signal_notices:
            symbol = str(notice.get("symbol") or "-")
            try:
                message = self.render_pre_signal_push(notice, execution, decision)
            except Exception as exc:
                pre_signal_renders.append(
                    {"symbol": symbol, "ok": False, "skipped": False, "error": " ".join(str(exc).split())[:240]}
                )
                pre_signal_pushes.append({"symbol": symbol, "ok": False, "skipped": True, "reason": "render_failed"})
                LOG.exception("pre-signal render failed for %s: %s", symbol, exc)
                continue
            pre_signal_renders.append({"symbol": symbol, "ok": True, "skipped": False})
            try:
                result = self.push_telegram_update(message)
            except Exception as exc:
                result = {"symbol": symbol, "ok": False, "skipped": True, "reason": "push_failed", "error": " ".join(str(exc).split())[:240]}
                LOG.exception("pre-signal push failed for %s: %s", symbol, exc)
            else:
                if isinstance(result, dict):
                    chart_context = notice.get("chart_context") if isinstance(notice.get("chart_context"), dict) else {}
                    result = {
                        "symbol": symbol,
                        **result,
                        "photo": self.push_telegram_photo(
                            str(chart_context.get("primary_chart_path") or ""),
                            f"🖼 {self.configured_runtime_title()}｜{symbol} 预信号图表\n• 状态: {notice.get('status') or '-'}\n• 图表: {chart_context.get('primary_chart_file') or '-'}",
                        ),
                    }
            pre_signal_pushes.append(result)

        heartbeat_interval_seconds = 30 * 60
        now_ts = int(time.time())
        last_heartbeat_at = int(
            updated_runtime.get("last_telegram_heartbeat_at")
            or runtime.get("last_telegram_heartbeat_at")
            or 0
        )
        heartbeat_due = last_heartbeat_at <= 0 or (now_ts - last_heartbeat_at) >= heartbeat_interval_seconds
        if heartbeat_due:
            try:
                housekeeping_text = self.render_housekeeping_card(
                    updated_runtime,
                    market_cache,
                    execution,
                    decision,
                    int(next_scan.get("in_seconds") or 120),
                    analysis_board,
                )
            except Exception as exc:
                housekeeping_render = {"ok": False, "skipped": False, "error": " ".join(str(exc).split())[:240]}
                housekeeping_push = {"ok": False, "skipped": True, "reason": "render_failed"}
                LOG.exception("housekeeping render failed: %s", exc)
            else:
                housekeeping_render = {"ok": True, "skipped": False, "interval_seconds": heartbeat_interval_seconds}
                try:
                    housekeeping_push = self.push_telegram_update(housekeeping_text)
                except Exception as exc:
                    housekeeping_push = {"ok": False, "skipped": True, "reason": "push_failed", "error": " ".join(str(exc).split())[:240]}
                    LOG.exception("housekeeping push failed: %s", exc)
                else:
                    updated_runtime["last_telegram_heartbeat_at"] = now_ts
                    write_json(self.runtime_state_path, updated_runtime)
        mark_stage("notifications_ms", stage_started)
        cycle_profile["total_ms"] = round((time.perf_counter() - cycle_started) * 1000, 2)
        updated_runtime["last_cycle_profile"] = cycle_profile
        write_json(self.runtime_state_path, updated_runtime)
        cycle_payload["render_status"] = {
            "cycle_card": cycle_card_render,
            "trade_updates": trade_update_render,
            "pre_signal": pre_signal_renders,
            "housekeeping": housekeeping_render,
        }
        cycle_payload["push_status"] = {
            "cycle_card": push_result,
            "trade_updates": trade_update_push,
            "pre_signal": pre_signal_pushes,
            "housekeeping": housekeeping_push,
        }
        write_json(cycle_path, cycle_payload)

        append_jsonl(
            self.journal_dir / "decision_log.jsonl",
            {
                "logged_at": utc_iso(),
                "cycle_id": cycle_id,
                "phase": decision.get("phase"),
                "trigger": trigger,
                "prompt_profile": phase_plan["phase"],
                "focus_symbols": decision.get("focus_symbols"),
                "decision_summary": decision.get("market_summary"),
                "actions": decision.get("actions"),
                "state_patch": decision.get("state_patch"),
                "next_scan_seconds": decision.get("next_scan_seconds"),
                "next_scan_reason": decision.get("next_scan_reason"),
                "profile": cycle_profile,
                "references": ref_names,
                "explanation": decision.get("explanation"),
                "render_status": cycle_payload["render_status"],
                "push_status": cycle_payload["push_status"],
            },
        )
        for item in execution_results:
            append_jsonl(
                self.journal_dir / "execution_log.jsonl",
                {
                    "logged_at": utc_iso(),
                    "cycle_id": cycle_id,
                    **item,
                },
            )
        LOG.info("cycle complete: %s phase=%s push=%s", cycle_id, decision.get("phase"), push_result)
        if trigger:
            self.ack_trigger(trigger, cycle_id)

        return {
            "cycle_id": cycle_id,
            "decision": decision,
            "execution_results": execution_results,
            "next_scan": next_scan,
            "push_result": push_result,
            "pre_signal_pushes": pre_signal_pushes,
            "housekeeping_push": housekeeping_push,
            "cycle_path": str(cycle_path),
        }

    def run_once(self, trigger: dict[str, Any] | None = None) -> int:
        self.sync_runtime_mode_marker(status="RUNNING")
        try:
            result = self.run_cycle(trigger=trigger)
        except Exception as exc:
            LOG.exception("runtime cycle failed: %s", exc)
            return 1
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    def sync_runtime_mode_marker(self, *, status: str | None = None) -> None:
        runtime = self.load_runtime_state()
        updated = dict(runtime)
        updated["dry_run"] = self.config.dry_run
        if status:
            updated["status"] = status
        write_json(self.runtime_state_path, updated)

    def wait_for_next(self, base_seconds: int) -> dict[str, Any] | None:
        deadline = time.time() + max(5, base_seconds)
        while time.time() < deadline:
            trigger = self.poll_trigger()
            if trigger:
                return trigger
            time.sleep(2)
        return None

    def loop(self) -> int:
        write_text(self.pid_path, str(os.getpid()))
        self.sync_runtime_mode_marker(status="RUNNING")
        trigger: dict[str, Any] | None = None
        while True:
            try:
                outcome = self.run_cycle(trigger=trigger)
                trigger = self.wait_for_next(int((outcome.get("next_scan") or {}).get("in_seconds") or 120))
            except KeyboardInterrupt:
                break
            except Exception as exc:
                LOG.exception("loop cycle failed: %s", exc)
                self.record_runtime_failure(exc, context="loop")
                time.sleep(30)
                trigger = None
        self.pid_path.unlink(missing_ok=True)
        return 0

    def status(self) -> int:
        runtime = self.load_runtime_state()
        latest_cycle_path, latest_cycle = self.latest_cycle()
        pid_raw = self.pid_path.read_text(encoding="utf-8").strip() if self.pid_path.exists() else ""
        pid = int(pid_raw) if pid_raw.isdigit() else None
        pid_live = False
        if pid is not None:
            try:
                os.kill(pid, 0)
                pid_live = True
            except OSError:
                pid_live = False
        payload = {
            "pid_file": str(self.pid_path),
            "pid_exists": self.pid_path.exists(),
            "pid": pid,
            "pid_live": pid_live,
            "runtime_state": runtime,
            "latest_cycle": str(latest_cycle_path) if latest_cycle_path else None,
            "latest_decision": (latest_cycle.get("decision") or {}) if latest_cycle else {},
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0


def setup_logging(log_file: Path) -> None:
    ensure_dir(log_file.parent)
    handlers: list[logging.Handler] = []
    # 交互式运行保留终端输出和文件；start.sh 已经把 stdout 重定向到 service.log，
    # 此时再叠加 FileHandler 会把同一条日志写两次。
    handlers.append(logging.StreamHandler(sys.stdout))
    if sys.stdout.isatty():
        handlers.append(logging.FileHandler(log_file, encoding="utf-8"))
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
        handlers=handlers,
        force=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="AB Patrol-Agent runtime")
    parser.add_argument("command", choices=["once", "loop", "status"], help="command")
    parser.add_argument("--execute", action="store_true", help="allow real order execution")
    parser.add_argument("--no-telegram", action="store_true", help="disable telegram push")
    args = parser.parse_args()

    config = Config.build(dry_run=not args.execute, post_to_telegram=not args.no_telegram)
    runtime = PatrolRuntime(config)
    setup_logging(runtime.log_path)

    if args.command == "once":
        return runtime.run_once()
    if args.command == "loop":
        return runtime.loop()
    if args.command == "status":
        return runtime.status()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
