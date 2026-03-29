#!/usr/bin/env python3
"""AB Patrol-Agent 纯代码规则引擎运行时。"""

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
from typing import Any, Mapping

AGENT_ROOT = Path(__file__).resolve().parent.parent
if str(AGENT_ROOT) not in sys.path:
    sys.path.insert(0, str(AGENT_ROOT))

from backtest_template_bridge import hydrate_patch_with_backtest_template
from brooks_filter import BrooksFilterMixin
from chart_manager import ChartManagerMixin
from config import Config
from http_runtime import HttpRuntimeMixin
from live_cycle_finalize_mixin import LiveCycleFinalizeMixin
from live_execution_mixin import LiveExecutionMixin
from live_followup_mixin import LiveFollowupStateMixin
from live_management_mixin import LiveManagementMixin
from live_market_cache_mixin import LiveMarketCacheMixin
from live_open_bridge_mixin import LiveOpenBridgeMixin
from live_patch_state import (
    patch_has_fresh_live_opportunity as _patch_has_fresh_live_opportunity,
    patch_is_expired_or_stale as _patch_is_expired_or_stale,
    release_fresh_live_opportunity_state as _release_fresh_live_opportunity_state,
)
from live_runtime_state_mixin import LiveRuntimeStateMixin
from live_safety_net_mixin import LiveSafetyNetMixin
from live_symbol_merge import (
    actionable_signal_identity_inconsistent as _actionable_signal_identity_inconsistent,
    hydrate_symbol_payload_from_analysis as _hydrate_symbol_payload_from_analysis,
    merge_symbol_patch_with_mag_bridge as _merge_symbol_patch_with_mag_bridge,
    merge_symbol_payload as _merge_symbol_payload,
    merge_symbol_timeframes_from_analysis as _merge_symbol_timeframes_from_analysis,
    normalize_actionable_signal_patch as _normalize_actionable_signal_patch,
    purge_actionable_signal_state as _purge_actionable_signal_state,
)
from live_timeout_fallback_mixin import LiveTimeoutFallbackMixin
from libs.backtest.strategy_filters import (
    expand_strategy_context,
    parse_live_strategy_scope,
    resolve_live_strategy_selection,
    selection_matches_context,
)
from notification_renderer import NotificationRendererMixin
from prompt_builder import RuleContextBuilderMixin
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
from rule_engine import get_executable_trades
from trading.execution_intent import build_open_order_action, build_runtime_symbol_patch
from utils import (
    all_floats,
    bar_range,
    build_execution_semantics,
    canonical_action_type,
    cap_status,
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
    write_text,
    write_json,
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


def _normalize_live_timeframe(value: Any) -> str:
    """统一实盘时间周期文本。"""
    return str(value or "").strip().lower()


def _canonical_live_strategy_timeframe_key(*values: Any, timeframe: Any = None) -> str:
    """把策略身份和开仓周期绑定，允许同品种不同周期并行。"""
    strategy_key = _canonical_live_strategy_key(*values)
    timeframe_key = _normalize_live_timeframe(timeframe)
    if strategy_key and timeframe_key:
        return f"{strategy_key}@{timeframe_key}"
    if timeframe_key:
        return f"TF@{timeframe_key}"
    return strategy_key


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
    followup_seed = enriched.get("followup_seed") if isinstance(enriched.get("followup_seed"), dict) else {}
    followup_seed = dict(followup_seed)
    pre_signal_meta = enriched.get("pre_signal_meta") if isinstance(enriched.get("pre_signal_meta"), dict) else {}
    pre_signal = enriched.get("pre_signal") if isinstance(enriched.get("pre_signal"), dict) else {}

    identified_timeframe = str(
        infer_signal_timeframe(
            pre_signal_meta.get("timeframe"),
            pre_signal,
            enriched.get("signal"),
            enriched.get("stage"),
            enriched.get("timeframes"),
            {},
            enriched.get("market_state_detail"),
            action_data.get("timeframe") or trade_data.get("timeframe") or "",
        )
        or ""
    ).strip().lower()

    def _reset_planned_trade_to_identified_timeframe() -> None:
        if not identified_timeframe:
            return
        existing_timeframe = str(
            planned_trade.get("signal_timeframe")
            or planned_trade.get("timeframe")
            or ""
        ).strip().lower()
        if existing_timeframe and existing_timeframe != identified_timeframe:
            for field in (
                "side",
                "entry_price",
                "entry_zone",
                "entry_zone_label",
                "stop_loss",
                "take_profit",
                "runner_handoff_stop",
                "first_target",
                "rescue_target",
                "close_test_target",
                "swing_target",
                "effective_target",
                "stretch_target",
                "entry_trigger",
                "signal_type",
                "signal_template",
                "entry_type",
                "order_type",
                "order_type_cn",
                "candidate_stage",
                "candidate_stage_cn",
                "execution_mode",
                "execution_mode_cn",
                "execution_semantics",
                "style",
                "why_wait",
                "signal_bar",
                "initial_stop_type",
                "stop_type",
                "target_buffer",
                "signal_bar_type",
                "signal_bar_quality",
            ):
                planned_trade.pop(field, None)
            planned_trade.pop("higher_timeframe", None)
        planned_trade["signal_timeframe"] = identified_timeframe
        planned_trade["timeframe"] = identified_timeframe
        planned_trade["management_timeframe"] = identified_timeframe
        planned_trade["reference_timeframe"] = identified_timeframe
        if followup_seed:
            followup_seed["timeframe"] = identified_timeframe
            followup_seed["management_timeframe"] = identified_timeframe
            followup_seed["reference_timeframe"] = identified_timeframe

    _reset_planned_trade_to_identified_timeframe()

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
        trade_data.get("signal_type")
        or action_data.get("signal_type")
        or planned_trade.get("signal_type")
        or enriched.get("signal_type")
        or enriched.get("signal")
        or ""
    ).strip()
    if strategy and not planned_trade.get("strategy"):
        planned_trade["strategy"] = strategy
    if signal_type and not planned_trade.get("signal_type"):
        planned_trade["signal_type"] = signal_type
    if playbook_id and not planned_trade.get("playbook_id"):
        planned_trade["playbook_id"] = playbook_id
    if action_data.get("management_template") and not planned_trade.get("management_template"):
        planned_trade["management_template"] = action_data.get("management_template")
    execution_timeframe = str(
        identified_timeframe
        or planned_trade.get("signal_timeframe")
        or planned_trade.get("timeframe")
        or followup_seed.get("timeframe")
        or trade_data.get("timeframe")
        or action_data.get("timeframe")
        or pre_signal_meta.get("timeframe")
        or ""
    ).strip().lower()
    if execution_timeframe:
        planned_trade["signal_timeframe"] = execution_timeframe
        planned_trade["timeframe"] = execution_timeframe
        planned_trade["management_timeframe"] = execution_timeframe
        planned_trade["reference_timeframe"] = execution_timeframe
        if pre_signal_meta:
            pre_signal_meta = dict(pre_signal_meta)
            pre_signal_meta["timeframe"] = execution_timeframe
            enriched["pre_signal_meta"] = pre_signal_meta
        if followup_seed:
            followup_seed["timeframe"] = execution_timeframe
            followup_seed["management_timeframe"] = execution_timeframe
            followup_seed["reference_timeframe"] = execution_timeframe
    for source in (followup_seed, trade_data, action_data):
        if not isinstance(source, dict):
            continue
        if not planned_trade.get("side"):
            seed_side = source.get("side") or source.get("direction")
            if seed_side not in (None, ""):
                planned_trade["side"] = seed_side
        if not planned_trade.get("strategy") and source.get("strategy") not in (None, ""):
            planned_trade["strategy"] = source.get("strategy")
        if not planned_trade.get("playbook_id") and source.get("playbook_id") not in (None, ""):
            planned_trade["playbook_id"] = source.get("playbook_id")
        if not planned_trade.get("playbook_hint") and source.get("playbook_hint") not in (None, ""):
            planned_trade["playbook_hint"] = source.get("playbook_hint")
        if not planned_trade.get("style") and source.get("style") not in (None, ""):
            planned_trade["style"] = source.get("style")
        for field in (
            "entry_price",
            "stop_loss",
            "take_profit",
            "entry_trigger",
            "entry_type",
            "order_type",
            "signal_template",
            "signal_bar_type",
            "signal_bar_quality",
            "first_target",
            "first_target_type",
            "risk_percent",
            "invalid_if",
        ):
            if planned_trade.get(field) in (None, "", [], {}) and source.get(field) not in (None, "", [], {}):
                planned_trade[field] = source.get(field)
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
    planned_candidate_stage = str(planned_trade.get("candidate_stage") or "").strip().upper()
    planned_execution_mode = str(planned_trade.get("execution_mode") or "").strip().upper()
    if planned_candidate_stage:
        enriched["candidate_stage"] = planned_candidate_stage
    if planned_execution_mode:
        enriched["execution_mode"] = planned_execution_mode
    if followup_seed:
        enriched["followup_seed"] = followup_seed

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
        current_primary_family = _infer_live_strategy_family(
            current_strategy,
            current_playbook,
            current_planned_strategy,
            current_planned_playbook,
            playbook_family,
        )
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
        family_identity_conflict = bool(
            current_primary_family
            and current_primary_family in {"H1", "L1", "H2", "L2"}
            and current_primary_family != family
        )
        if mag_identity_present or family_identity_conflict:
            normalized_strategy, normalized_playbook = _normalize_primary_strategy_from_family(family)
            strategy = normalized_strategy or current_strategy
            playbook_id = normalized_playbook or current_playbook or strategy
            playbook_family = family
            planned_trade["strategy"] = strategy
            planned_trade["playbook_id"] = playbook_id
            planned_trade["playbook_family"] = family
            if family_identity_conflict:
                planned_trade["management_template"] = "h1_l1_first_entry" if family in {"H1", "L1"} else planned_trade.get("management_template")
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
    if _actionable_signal_identity_inconsistent(enriched):
        enriched = _purge_actionable_signal_state(enriched)
    return _normalize_actionable_signal_patch(enriched)


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

class PatrolRuntime(
    LiveCycleFinalizeMixin,
    LiveTimeoutFallbackMixin,
    LiveMarketCacheMixin,
    LiveExecutionMixin,
    LiveRuntimeStateMixin,
    LiveSafetyNetMixin,
    LiveManagementMixin,
    LiveOpenBridgeMixin,
    LiveFollowupStateMixin,
    NotificationRendererMixin,
    RuleContextBuilderMixin,
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

    def _hydrate_live_patch_from_backtest_template(
        self,
        symbol: str,
        patch: dict[str, Any] | None,
    ) -> dict[str, Any]:
        """把回测同源模板的止盈止损与管理周期补回 live patch。"""
        if not isinstance(patch, dict):
            return patch or {}
        try:
            hydrated = hydrate_patch_with_backtest_template(
                symbol=symbol,
                patch=patch,
                agent_root=self.config.agent_root,
                base_url=self.execution_base_for_symbol(symbol),
                allowed_timeframes=self.live_allowed_timeframe_scope(),
            )
            normalized = hydrated if isinstance(hydrated, dict) else patch
            return _normalize_actionable_signal_patch(normalized)
        except Exception as exc:
            LOG.warning("[BACKTEST_TEMPLATE_BRIDGE] %s 补桥失败: %s", symbol, exc)
            return _normalize_actionable_signal_patch(patch)

    def _prepare_live_rule_patch(
        self,
        symbol: str,
        payload: dict[str, Any] | None,
        analysis: dict[str, Any] | None,
        quick_scan_payload: Any = None,
    ) -> dict[str, Any]:
        """把 live analysis、Brooks 过滤与模板补桥统一成单一开仓前主链。"""
        hydrated_payload = _hydrate_symbol_payload_from_analysis(
            payload if isinstance(payload, dict) else {},
            analysis if isinstance(analysis, dict) else {},
        )
        frames = hydrated_payload.get("timeframes") if isinstance(hydrated_payload.get("timeframes"), dict) else {}
        base_patch = _merge_symbol_patch_with_mag_bridge(
            self._clear_expired_live_symbol_state(build_runtime_symbol_patch(hydrated_payload)),
            frames,
        )
        merged_events: list[str] = []
        for item in list(base_patch.get("event_tags") or []) + self.flatten_events(quick_scan_payload):
            text = str(item or "").strip()
            if text and text not in merged_events:
                merged_events.append(text)
        if merged_events:
            base_patch["event_tags"] = merged_events[:12]
        base_patch = _enrich_live_symbol_patch(base_patch)
        if _patch_has_fresh_live_opportunity(base_patch):
            base_patch = _release_fresh_live_opportunity_state(base_patch)
        base_patch = self.apply_brooks_filter_to_patch(base_patch, merged_events)
        base_patch = _enrich_live_symbol_patch(base_patch)
        if _patch_has_fresh_live_opportunity(base_patch):
            base_patch = _release_fresh_live_opportunity_state(base_patch)
        if _patch_is_expired_or_stale(base_patch):
            base_patch = self._clear_expired_live_symbol_state(base_patch)
        base_patch = self._hydrate_live_patch_from_backtest_template(symbol, base_patch)
        base_patch = self.apply_brooks_filter_to_patch(
            base_patch,
            list(base_patch.get("event_tags") or merged_events),
        )
        return _enrich_live_symbol_patch(base_patch)

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
            frames = _merge_symbol_timeframes_from_analysis(analysis)
            primary_5m = frames.get("5m") if isinstance(frames.get("5m"), dict) else {}
            primary_15m = frames.get("15m") if isinstance(frames.get("15m"), dict) else {}
            primary_1h = frames.get("1h") if isinstance(frames.get("1h"), dict) else {}
            preferred_frame_keys = [
                timeframe
                for timeframe in self.live_allowed_timeframe_scope()
                if isinstance(frames.get(timeframe), dict)
            ]
            if not preferred_frame_keys:
                preferred_frame_keys = [timeframe for timeframe in ("15m", "1h") if isinstance(frames.get(timeframe), dict)]
            preferred_frames = [frames.get(timeframe) for timeframe in preferred_frame_keys if isinstance(frames.get(timeframe), dict)]
            patch = raw_updates.get(key) or raw_updates.get(symbol) or {}
            if not isinstance(patch, dict):
                patch = {}
            seed_state = validation_seed_state(cached) if isinstance(cached, dict) else {}
            patch_from_state = state_patch.get(key) if isinstance(state_patch.get(key), dict) else {}
            source_payload = _merge_symbol_payload(seed_state, patch_from_state)
            source_payload = _merge_symbol_payload(source_payload, patch)
            base = self._prepare_live_rule_patch(
                key,
                source_payload,
                analysis,
                quick_scan_events.get(key) or quick_scan_events.get(symbol),
            )
            base.setdefault("status", base.get("status") or "watching")
            base.setdefault("stage", phase_plan["phase"])
            base.setdefault("priority", base.get("priority") or 9)
            if not base.get("align_score") and ab_context.get("alignment_score") is not None:
                base["align_score"] = ab_context.get("alignment_score")
            if not base.get("signal"):
                base["signal"] = next(
                    (frame.get("signal") for frame in preferred_frames if isinstance(frame, dict) and frame.get("signal")),
                    ab_context.get("best_signal"),
                )
            if not base.get("ai_direction"):
                base["ai_direction"] = next(
                    (frame.get("ai") for frame in preferred_frames if isinstance(frame, dict) and frame.get("ai")),
                    ab_context.get("dominant_direction"),
                )
            if not base.get("market_state"):
                base["market_state"] = next(
                    (frame.get("state") for frame in preferred_frames if isinstance(frame, dict) and frame.get("state")),
                    "",
                )
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
            elif isinstance(base.get("timeframes"), dict) and frames:
                base["timeframes"] = _merge_symbol_payload(base.get("timeframes"), {
                    timeframe: {
                        "ai": frame.get("ai"),
                        "state": frame.get("state"),
                        "signal": frame.get("signal"),
                        "summary": frame.get("summary"),
                        "latest_bar": frame.get("latest_bar"),
                        "ema20": frame.get("ema20"),
                        "atr14": frame.get("atr14"),
                    }
                    for timeframe, frame in frames.items()
                    if isinstance(frame, dict)
                })
            frame_note_order = list(preferred_frame_keys)
            for fallback_tf in ("5m", "15m", "1h"):
                if fallback_tf not in frame_note_order and isinstance(frames.get(fallback_tf), dict):
                    frame_note_order.append(fallback_tf)
            frame_notes = [
                f"{label}: {frame_summary_text(frames.get(label))}"
                for label in frame_note_order
                if isinstance(frames.get(label), dict) and frame_summary_text(frames.get(label))
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
                for frame in preferred_frames or (primary_15m, primary_1h):
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
            planned_sl = (
                first_float(planned_trade.get("stop_loss"))
                or first_float(trigger_price.get("stop_loss"))
            )
            planned_tp = (
                first_float(planned_trade.get("take_profit"))
                or first_float(trigger_price.get("take_profit"))
            )
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
                rebuilt_planned_trade = dict(planned_trade)
                rebuilt_planned_trade.update(
                    {
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
                )
                for field in (
                    "timeframe",
                    "signal_timeframe",
                    "signal_template",
                    "entry_trigger",
                    "entry_type",
                    "stop_type",
                    "nominal_risk",
                    "actual_risk",
                    "management_template",
                    "runner_handoff_stop",
                    "runner_handoff_stop_type",
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
                    "allow_be_after_first_target",
                    "first_profit_at_1x_actual_risk",
                    "prefer_partial_over_full_swing",
                    "allow_small_runner",
                    "handoff_to_h2_l2_if_failed",
                    "prefer_lower_entry_be_rescue",
                    "exit_on_failed_follow_through",
                    "exit_on_return_to_range",
                    "exit_on_major_channel_break",
                    "signal_bar_type",
                    "signal_bar_quality",
                    "setup_valid",
                    "setup_clear_trend_leg",
                    "setup_first_pullback_shape",
                    "setup_pullback_depth_ratio",
                    "setup_pullback_overlap_ratio",
                    "template14",
                ):
                    value = planned_trade.get(field)
                    if value not in (None, "", [], {}):
                        rebuilt_planned_trade[field] = value
                base["planned_trade"] = rebuilt_planned_trade
            if "trade" not in base:
                base["trade"] = None
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
        )
        tp = (
            first_float(action.get("tp"))
            or first_float(action.get("take_profit"))
            or first_float(planned_trade.get("take_profit"))
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
        if not hydrated.get("timeframe"):
            timeframe = str(
                planned_trade.get("signal_timeframe")
                or planned_trade.get("timeframe")
                or ""
            ).strip().lower()
            if timeframe:
                hydrated["timeframe"] = timeframe
        for target_field, source_field in (
            ("signal_timeframe", "signal_timeframe"),
            ("management_timeframe", "management_timeframe"),
            ("reference_timeframe", "reference_timeframe"),
            ("higher_timeframe", "higher_timeframe"),
        ):
            if hydrated.get(target_field):
                continue
            field_value = str(
                planned_trade.get(source_field)
                or action.get(target_field)
                or ""
            ).strip().lower()
            if field_value:
                hydrated[target_field] = field_value
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
        for field in (
            "template14",
            "signal_template",
            "stop_type",
            "actual_risk",
            "nominal_risk",
            "management_template",
            "runner_handoff_stop",
            "runner_handoff_stop_type",
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
            "allow_be_after_first_target",
            "first_profit_at_1x_actual_risk",
            "prefer_partial_over_full_swing",
            "allow_small_runner",
            "handoff_to_h2_l2_if_failed",
            "prefer_lower_entry_be_rescue",
            "exit_on_failed_follow_through",
            "exit_on_return_to_range",
            "exit_on_major_channel_break",
            "signal_bar_type",
            "signal_bar_quality",
            "entry_trigger",
            "entry_type",
        ):
            value = (
                hydrated.get(field)
                or planned_trade.get(field)
                or trade_patch.get(field)
                or (patch.get("entry_idea") or {}).get(field)
            )
            if value not in (None, "", [], {}):
                hydrated[field] = value
        if action_type == "OPEN_ORDER" and hydrated.get("intent") in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"}:
            hydrated.setdefault("note", "S7 加仓")
        return hydrated

    def live_allowed_strategy_scope(self) -> tuple[str, ...]:
        """读取当前实盘允许的策略范围。"""
        raw = os.getenv("AB_PATROL_LIVE_ALLOWED_STRATEGIES", "H1,L1,H2,L2,MAG")
        return parse_live_strategy_scope(raw)

    def live_allowed_timeframe_scope(self) -> tuple[str, ...]:
        """读取当前实盘允许的开仓周期。"""
        raw = os.getenv("AB_PATROL_LIVE_ALLOWED_TIMEFRAMES", "15m")
        baseline = ("15m",)
        ordered: list[str] = []
        for chunk in str(raw or "").split(","):
            item = _normalize_live_timeframe(chunk)
            if item and item in baseline and item not in ordered:
                ordered.append(item)
        return tuple(ordered or list(baseline))

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
            strategy_allowed = True
        else:
            symbol = str(action.get("symbol") or "").upper()
            if not symbol:
                return False
            selection = self.live_strategy_selection()
            action_context = self._action_strategy_context(action)
            if expand_strategy_context(action_context):
                strategy_allowed = selection_matches_context(selection, action_context, action.get("reason"))
            else:
                strategy_allowed = selection_matches_context(selection, self._symbol_strategy_context(symbol, decision), action.get("reason"))
        if not strategy_allowed:
            return False

        allowed_timeframes = self.live_allowed_timeframe_scope()
        if not allowed_timeframes:
            return True
        timeframe = _normalize_live_timeframe(
            action.get("signal_timeframe")
            or action.get("management_timeframe")
            or action.get("timeframe")
        )
        return bool(timeframe) and timeframe in set(allowed_timeframes)

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

    def _precheck_open_order_action(self, action: dict[str, Any], *, refs: list[str] | None = None) -> dict[str, Any]:
        """在进入 execution-service 之前先用 trade gate 把假阳性降级成日志动作。"""
        if canonical_action_type(action.get("type")) != "OPEN_ORDER":
            return action
        candidate_stage = str(action.get("candidate_stage") or "").strip().upper()
        execution_mode = str(action.get("execution_mode") or "").strip().upper()
        order_type = str(action.get("order_type") or "").strip().upper()
        entry = safe_float(action.get("entry") or action.get("entry_price"))
        entry_zone = action.get("entry_zone")
        reason = str(action.get("reason") or action.get("strategy") or "trade gate rejected").strip()

        def _downgrade_semantic_block(message: str) -> dict[str, Any]:
            downgraded = dict(action)
            downgraded["type"] = "LOG_ONLY"
            downgraded["reason"] = f"{reason} | [SEMANTIC_PRECHECK] {message}"
            downgraded["refs"] = refs if refs is not None else action.get("refs") or []
            return downgraded

        if candidate_stage.startswith("CANDIDATE_"):
            return _downgrade_semantic_block(
                f"阶段={candidate_stage} 仍属候选态，禁止直接进入 execution-service"
            )
        if execution_mode in {"WATCH_ONLY", "COUNTERTREND_PROBE"}:
            return _downgrade_semantic_block(
                f"执行模式={execution_mode} 仍属观察/试探态，禁止直接下单"
            )

        if candidate_stage == "EXECUTABLE_LIMIT" or execution_mode == "LIMIT_PLAN":
            has_explicit_limit_trigger = entry > 0 or entry_zone not in (None, "", [], {})
            if order_type != "LIMIT":
                return _downgrade_semantic_block(
                    f"LIMIT_PLAN 必须使用 LIMIT，当前 order_type={order_type or '-'}"
                )
            if not has_explicit_limit_trigger:
                return _downgrade_semantic_block("LIMIT_PLAN 缺少显式 entry/zone 触发位")

        if candidate_stage == "EXECUTABLE_STOP" or execution_mode == "STOP_TRIGGER":
            if order_type not in {"STOP_MARKET", "TAKE_PROFIT_MARKET"}:
                return _downgrade_semantic_block(
                    f"STOP_TRIGGER 必须使用 STOP_MARKET/TAKE_PROFIT_MARKET，当前 order_type={order_type or '-'}"
                )

        trade_gate = self.validate_trade_gate(action)
        if trade_gate.get("ok"):
            return action
        gate_message = str(
            trade_gate.get("stdout")
            or trade_gate.get("stderr")
            or "trade gate rejected"
        ).strip()
        downgraded = dict(action)
        downgraded["type"] = "LOG_ONLY"
        downgraded["reason"] = f"{reason} | [TRADE_GATE_PRECHECK] {gate_message}"
        downgraded["refs"] = refs if refs is not None else action.get("refs") or []
        downgraded["trade_gate"] = trade_gate
        return downgraded

    def _trade_gate_min_rr(self, action: dict[str, Any]) -> tuple[float, str]:
        """按 Brooks 语义返回最低盈亏比，不再对所有 swing 统一强压 2R。"""
        style = str(action.get("style") or "").strip().upper()
        market_state = str(action.get("market_state") or "").strip().upper()
        playbook_id = str(action.get("playbook_id") or "").strip().upper()
        strategy_family = str(action.get("strategy_family") or action.get("latest_strategy_family") or "").strip().upper()
        brooks_label = str(action.get("brooks_label") or action.get("signal_type") or "").strip().upper()
        first_target_type = str(action.get("first_target_type") or "").strip().lower()
        first_profit_at_1x = bool(action.get("first_profit_at_1x_actual_risk"))
        semantic_text = " ".join(
            part
            for part in (
                action.get("candidate_stage"),
                action.get("execution_mode"),
                brooks_label,
                playbook_id,
                strategy_family,
                str(action.get("reason") or ""),
            )
            if part
        ).upper()

        if "40%" in semantic_text or "COUNTERTREND_PROBE" in semantic_text:
            return 2.0, "40% 反转或逆势试探，仍要求至少 2R 空间"

        continuation_tokens = (
            "H1_L1",
            "H2_L2",
            "BREAKOUT_PULLBACK",
            "EMA_GAP",
            "AFTER BO",
            "TREND SECOND ENTRY",
            "BROAD CHANNEL RECOVERY",
            "MAG",
        )
        is_continuation = any(token in semantic_text for token in continuation_tokens)
        is_continuation = is_continuation or strategy_family in {
            "BREAKOUT_PULLBACK",
            "TREND_SECOND_ENTRY",
            "BROAD_CHANNEL_RECOVERY",
            "EMA_GAP",
        }
        target_supports_one_r = first_profit_at_1x or first_target_type in {
            "measured_move_1x",
            "close_test_target",
            "prior_high",
            "prior_low",
            "prior_high_low",
            "highest_close",
            "lowest_close",
            "rescue_target",
        }

        if is_continuation and market_state in {"BO", "TC", "BC"}:
            return (0.6 if style == "SWING" else 0.45), "顺势 BO/TC/BC 背景允许先按更近的 Brooks 合理目标审核"

        if is_continuation and market_state == "TR":
            return (0.75 if style == "SWING" else 0.6), "震荡区里的顺势 continuation 仍要留余地，但不再一律硬压 1R"

        if is_continuation and target_supports_one_r:
            return (0.65 if style == "SWING" else 0.45), "顺势 continuation 的首个合理目标可按 0.45R-0.65R 先过门禁"

        if style == "SWING":
            if market_state == "TR":
                return 1.1, "震荡区里的 swing 仍需要更高空间，但不再机械卡到 1.5R"
            return 0.95, "普通 swing 基线按 0.95R 审核"

        return 0.8, "scalp / 非 swing 基线按 0.8R 审核"

    def validate_trade_gate(self, action: dict[str, Any]) -> dict[str, Any]:
        side = str(action.get("side") or "").upper()
        entry = safe_float(action.get("entry") or action.get("entry_price"))
        stop_loss = safe_float(action.get("sl") or action.get("stop_loss"))
        take_profit = safe_float(action.get("tp") or action.get("take_profit"))
        style = str(action.get("style") or "").strip().upper()
        intent = str(action.get("intent") or "").strip().upper()
        order_type = str(action.get("order_type") or "").strip().upper()
        entry_zone = action.get("entry_zone")
        candidate_stage = str(action.get("candidate_stage") or "").strip().upper()
        execution_mode = str(action.get("execution_mode") or "").strip().upper()
        brooks_label = str(action.get("brooks_label") or action.get("signal_type") or "").strip()

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

        followup_intent = intent in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD", "REENTER", "REENTRY"}
        if candidate_stage:
            record(
                "候选阶段",
                self._candidate_stage_is_executable(candidate_stage),
                f"{candidate_stage}（live 只允许 EXECUTABLE_* 真正下单）",
            )
        else:
            record("候选阶段", followup_intent, "缺少 candidate_stage，仅放行已确认的加仓/重入")

        blocked_modes = {"WATCH_ONLY", "COUNTERTREND_PROBE"}
        record(
            "执行模式",
            execution_mode not in blocked_modes,
            execution_mode or ("FOLLOWUP" if followup_intent else "-"),
        )

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

        if candidate_stage == "EXECUTABLE_LIMIT" or execution_mode == "LIMIT_PLAN":
            has_explicit_limit_trigger = entry > 0 or entry_zone not in (None, "", [], {})
            record(
                "限价语义",
                order_type == "LIMIT" and has_explicit_limit_trigger,
                f"order_type={order_type or '-'} trigger={'entry/zone已明确' if has_explicit_limit_trigger else '缺少显式限价触发'}",
            )
        elif candidate_stage == "EXECUTABLE_STOP" or execution_mode == "STOP_TRIGGER":
            record(
                "止损触发语义",
                order_type in {"STOP_MARKET", "TAKE_PROFIT_MARKET"},
                f"order_type={order_type or '-'}",
            )
        elif candidate_stage == "EXECUTABLE_MARKET" or execution_mode == "MARKET_IMMEDIATE":
            record("市价语义", order_type == "MARKET", f"order_type={order_type or '-'}")

        if entry > 0 and stop_loss > 0 and take_profit > 0:
            risk = abs(entry - stop_loss)
            reward = abs(take_profit - entry)
            rr = reward / risk if risk > 0 else 0.0
            min_rr, min_rr_rule = self._trade_gate_min_rr(action)
            rr_tolerance = 0.02 if min_rr >= 0.95 else 0.0
            record(
                "盈亏比",
                risk > 0 and reward > 0 and rr + rr_tolerance >= min_rr,
                f"R:R={rr:.2f} | 最低要求={min_rr:.2f} | 容差={rr_tolerance:.2f} | 规则={min_rr_rule}",
            )

        output_lines = checks[:]
        output_lines.append("✅ 实盘 trade gate 通过" if not errors else "🚫 下单被拒绝")
        return {
            "ok": not errors,
            "stdout": "\n".join(output_lines)[-1500:],
            "stderr": "" if not errors else "\n".join(errors)[-1500:],
        }

    def execute_action(self, action: dict[str, Any], execution: dict[str, Any]) -> dict[str, Any]:
        """兼容旧入口，真实实现已迁移到 live_execution_mixin。"""
        return LiveExecutionMixin.execute_action(self, action, execution)

    def update_market_cache(
        self,
        market_cache: dict[str, Any],
        decision: dict[str, Any],
        execution_results: list[dict[str, Any]],
        cycle_id: str,
    ) -> None:
        """兼容旧入口，真实实现已迁移到 live_market_cache_mixin。"""
        return LiveMarketCacheMixin.update_market_cache(
            self,
            market_cache,
            decision,
            execution_results,
            cycle_id,
        )






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
        return _canonical_live_strategy_timeframe_key(
            action.get("playbook_id"),
            action.get("strategy"),
            action.get("playbook_hint"),
            action.get("ema_gap_variant"),
            action.get("strategy_family"),
            action.get("latest_strategy_family"),
            timeframe=(
                action.get("signal_timeframe")
                or action.get("management_timeframe")
                or action.get("timeframe")
            ),
        )

    def _live_strategy_key_from_execution_item(self, item: dict[str, Any]) -> str:
        """从 execution 回读的持仓/挂单里提取策略冲突键。"""
        return _canonical_live_strategy_timeframe_key(
            item.get("playbook_id"),
            item.get("strategy"),
            item.get("playbook_hint"),
            item.get("ema_gap_variant"),
            item.get("strategy_family"),
            item.get("latest_strategy_family"),
            item.get("signal_type"),
            timeframe=(
                item.get("signal_timeframe")
                or item.get("management_timeframe")
                or item.get("timeframe")
                or item.get("reference_timeframe")
            ),
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
        """识别已经过期或沿用旧结论的缓存态。"""
        return _patch_is_expired_or_stale(patch)

    def _clear_expired_live_symbol_state(self, patch: dict[str, Any] | None) -> dict[str, Any]:
        """把已过期的 live 预信号状态降回 watching，避免旧计划反复复活。"""
        normalized = dict(patch) if isinstance(patch, dict) else {}
        if not normalized:
            return {}
        if _patch_has_fresh_live_opportunity(normalized):
            return _normalize_actionable_signal_patch(_release_fresh_live_opportunity_state(normalized))
        expired = str(normalized.get("last_pass_reason") or "").strip().upper() == "PRE_SIGNAL_EXPIRED"
        if not expired:
            expired = self._looks_like_stale_live_patch(normalized)
        if not expired:
            return _normalize_actionable_signal_patch(normalized)

        for key in ("pre_signal", "pre_signal_meta", "planned_trade", "trade", "followup_seed"):
            normalized.pop(key, None)
        for key in (
            "signal",
            "signal_type",
            "brooks_label",
            "brooks_filter",
            "market_state",
            "market_state_detail",
            "structure_summary",
            "thesis",
            "running_narrative",
            "timeframes",
            "key_levels",
            "current_price",
            "last_price",
            "ema20",
            "atr14",
            "strategy",
            "strategy_family",
            "latest_strategy_family",
            "playbook_family",
            "playbook_id",
            "strategy_hint",
            "management_template",
            "candidate_stage",
            "candidate_stage_cn",
            "execution_mode",
            "execution_mode_cn",
            "strategy_candidates",
            "alt_strategy_families",
            "ema_gap_variant",
            "ema_gap_signal_type",
            "ema_gap_brooks_label",
            "ema_gap_management_template",
            "ema_gap_playbook_family",
            "ema_gap_playbook_id",
        ):
            normalized.pop(key, None)
        if isinstance(normalized.get("event_tags"), list):
            normalized["event_tags"] = [
                tag
                for tag in normalized.get("event_tags") or []
                if not str(tag or "").startswith(("signal_trigger:", "hl_signal:", "cached_pre_signal"))
            ]
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
        return _normalize_actionable_signal_patch(normalized)

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

    @staticmethod
    def _live_side_conflicts(requested_side: str, existing_side: str) -> bool:
        """只把同方向暴露视为首仓冲突，避免反向信号被过宽拦截。"""
        requested = str(requested_side or "").strip().upper()
        existing = str(existing_side or "").strip().upper()
        if not requested or not existing:
            return True
        if requested == "BUY":
            return existing in {"BUY", "LONG"}
        if requested == "SELL":
            return existing in {"SELL", "SHORT"}
        return True

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

    @staticmethod
    def _open_order_has_complete_structure_protection(action: Mapping[str, Any] | None) -> bool:
        """实盘开仓必须携带同源结构止损止盈。"""
        if not isinstance(action, Mapping):
            return False
        if str(action.get("type") or "").upper() != "OPEN_ORDER":
            return True
        stop_loss = safe_float(action.get("sl") or action.get("stop_loss"))
        take_profit = safe_float(action.get("tp") or action.get("take_profit"))
        timeframe = _normalize_live_timeframe(
            action.get("signal_timeframe")
            or action.get("management_timeframe")
            or action.get("timeframe")
        )
        return stop_loss > 0 and take_profit > 0 and bool(timeframe)

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

    def _live_entry_conflict(
        self,
        symbol: str,
        strategy_key: str,
        execution: dict[str, Any],
        *,
        side: str = "",
        action: Mapping[str, Any] | None = None,
    ) -> tuple[bool, str]:
        """检测同品种同策略是否已有 live 暴露，不同策略允许并行首仓。"""
        normalized_symbol = self._normalize_live_symbol(symbol)
        if not normalized_symbol:
            return False, ""

        if not self._live_is_first_entry_action(action or {}):
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
            existing_side = str(
                item.get("side")
                or item.get("direction")
                or item.get("position_side")
                or "-"
            ).upper()
            if not self._live_side_conflicts(side, existing_side):
                continue
            quantity = (
                safe_float(item.get("quantity"))
                or safe_float(item.get("contracts"))
                or safe_float(item.get("size"))
                or 0.0
            )
            if quantity <= 0:
                continue
            strategy_hint = existing_strategy_key or strategy_key or "未知策略"
            return True, f"当前已有同品种同策略持仓（{strategy_hint} | {existing_side} {quantity:g}），先走持仓管理链"

        for item in self._tracked_bot_orders(execution):
            if self._normalize_live_symbol(item.get("symbol")) != normalized_symbol:
                continue
            order_class = str(item.get("order_class") or item.get("orderClass") or "").strip().upper()
            protection_kind = str(item.get("protection_kind") or item.get("protectionKind") or "").strip().upper()
            entry_intent = str(
                item.get("entry_intent")
                or item.get("intent")
                or item.get("order_intent")
                or ""
            ).strip().upper()
            reduce_only = bool(item.get("reduce_only") or item.get("reduceOnly"))
            if reduce_only:
                continue
            if order_class in {"PROTECTION", "MANAGEMENT"}:
                continue
            if protection_kind in {"STOP_LOSS", "TAKE_PROFIT"}:
                continue
            if not self._live_is_first_entry_action(item):
                continue
            if entry_intent in {
                "MANAGEMENT",
                "PROTECTION",
                "STOP_LOSS",
                "TAKE_PROFIT",
                "CLOSE",
                "REDUCE",
                "PARTIAL_CLOSE",
            }:
                continue
            existing_strategy_key = self._live_strategy_key_from_execution_item(item)
            if strategy_key:
                if existing_strategy_key and existing_strategy_key != strategy_key:
                    continue
                if not existing_strategy_key:
                    continue
            existing_side = str(item.get("side") or "-").upper()
            if not self._live_side_conflicts(side, existing_side):
                continue
            order_type = str(item.get("order_type") or item.get("type") or "-").upper()
            strategy_hint = existing_strategy_key or strategy_key or "未知策略"
            return True, f"当前已有同品种同策略活动挂单（{strategy_hint} | {existing_side} {order_type}），避免重复首仓"

        return False, ""

    @staticmethod
    def _live_is_first_entry_action(action: Mapping[str, Any] | None) -> bool:
        if not action:
            return True

        order_class = str(action.get("order_class") or action.get("orderClass") or "").strip().upper()
        protection_kind = str(action.get("protection_kind") or action.get("protectionKind") or "").strip().upper()
        entry_intent = str(
            action.get("entry_intent")
            or action.get("intent")
            or action.get("order_intent")
            or action.get("raw_type")
            or ""
        ).strip().upper()
        followup_profile = str(action.get("followup_profile") or action.get("followupProfile") or "").strip().upper()
        reentry_attempt = str(action.get("reentry_attempt") or action.get("reentryAttempt") or "").strip().upper()
        reduce_only = bool(action.get("reduce_only") or action.get("reduceOnly"))
        reentry_candidate = bool(action.get("reentry_candidate") or action.get("reentryCandidate"))

        if reduce_only:
            return False
        if order_class in {"PROTECTION", "MANAGEMENT"}:
            return False
        if protection_kind in {"STOP_LOSS", "TAKE_PROFIT"}:
            return False
        if entry_intent in {
            "MANAGEMENT",
            "PROTECTION",
            "STOP_LOSS",
            "TAKE_PROFIT",
            "CLOSE",
            "REDUCE",
            "PARTIAL_CLOSE",
            "ADD_ON",
            "SCALE_IN",
            "PYRAMID_ADD",
            "REENTRY",
        }:
            return False
        if followup_profile in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD", "REENTRY"}:
            return False
        if reentry_attempt not in {"", "0", "NONE"}:
            return False
        if reentry_candidate:
            return False
        return True

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

    def rule_engine_decision(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        phase_plan: dict[str, Any],
        analysis_board: dict[str, Any],
        quick_scan_events: dict[str, Any],
    ) -> dict[str, Any]:
        """规则引擎执行路径：直接生成开仓与管理动作。"""
        from rule_engine import get_executable_trades
        from trading.position_management import manage_position

        positions = self._tracked_bot_positions(execution)
        # 使用 market_cache 作为底座，再叠加 runtime 展示态里的有效字段，避免空值冲掉价格/ATR。
        runtime_symbol_cache = runtime.get("symbols") if isinstance(runtime.get("symbols"), dict) else {}
        market_symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        symbol_cache: dict[str, Any] = {}
        all_symbol_keys = {
            str(symbol).upper()
            for symbol in (
                list(market_symbol_cache.keys())
                + list(runtime_symbol_cache.keys())
            )
        }
        for symbol in all_symbol_keys:
            symbol_cache[symbol] = _merge_symbol_payload(
                market_symbol_cache.get(symbol),
                runtime_symbol_cache.get(symbol),
            )
        focus_symbols = phase_plan.get("focus_symbols") or []
        normalized_symbol_cache: dict[str, Any] = {}

        for symbol in focus_symbols:
            cached_raw = symbol_cache.get(symbol) if isinstance(symbol_cache.get(symbol), dict) else {}
            analysis = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            normalized_symbol_cache[symbol] = self._prepare_live_rule_patch(
                symbol,
                cached_raw,
                analysis,
                quick_scan_events.get(symbol),
            )
        for symbol, payload in symbol_cache.items():
            if symbol not in normalized_symbol_cache and isinstance(payload, dict):
                analysis = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
                normalized_symbol_cache[symbol] = self._prepare_live_rule_patch(
                    symbol,
                    payload,
                    analysis,
                    quick_scan_events.get(symbol),
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
                    symbol_patch = self._hydrate_live_patch_from_backtest_template(symbol, symbol_patch)
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

        # 2. 开仓决策
        executable_trades = []
        # 构建已持仓品种集合，避免对已持仓品种重复生成 OPEN_ORDER
        held_symbols: set[str] = set()
        for pos in positions:
            held_sym = self._normalize_live_symbol(pos.get("symbol"))
            if held_sym:
                held_symbols.add(held_sym)
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
            patch = self._hydrate_live_patch_from_backtest_template(symbol, patch)
            patch_is_expired = _patch_is_expired_or_stale(patch) or self._looks_like_stale_live_patch(cached)

            # 生成开仓 actions（当前规则引擎路径始终运行）
            matching_trades = [t for t in executable_trades if t["symbol"] == symbol]
            primary_trade = matching_trades[0] if matching_trades else None
            planned_trade_action = None
            if (not patch_is_expired) and (not primary_trade) and (symbol not in held_symbols):
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
                patch = self._hydrate_live_patch_from_backtest_template(symbol, patch)
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
                # 品种级别去重：已持仓品种不再生成 OPEN_ORDER
                if symbol in held_symbols:
                    for matching_trade in matching_trades:
                        actions.append({
                            "type": "LOG_ONLY",
                            "symbol": symbol,
                            "reason": f"规则引擎: {matching_trade['strategy']} | [HELD_POSITION] 当前已有持仓，跳过开仓",
                            "refs": [],
                        })
                    continue
                for matching_trade in matching_trades:
                    action_reason = f"规则引擎: {matching_trade['strategy']} | {matching_trade['reason']}"
                    strategy_key = self._canonical_live_strategy_key(
                        matching_trade.get("strategy"),
                        matching_trade.get("playbook_family"),
                        matching_trade.get("playbook_id"),
                        patch.get("ema_gap_variant"),
                    )
                    entry_blocked, entry_block_reason = self._live_entry_conflict(
                        symbol,
                        strategy_key,
                        execution,
                        side=str(matching_trade.get("side") or ""),
                        action=matching_trade,
                    )
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
                    open_action = build_open_order_action(
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
                    if not self._open_order_has_complete_structure_protection(open_action):
                        actions.append(
                            {
                                "type": "LOG_ONLY",
                                "symbol": symbol,
                                "reason": f"{action_reason} | [BACKTEST_TEMPLATE_MISSING_PROTECTION] 未从回测同源模板恢复出完整止损止盈，禁止实盘开仓",
                                "refs": [],
                            }
                        )
                        continue
                    open_action = self._precheck_open_order_action(open_action)
                    if canonical_action_type(open_action.get("type")) != "OPEN_ORDER":
                        actions.append(open_action)
                        continue
                    actions.append(open_action)
                    pending_open_keys.add(cycle_key)
            elif planned_trade_action:
                strategy_key = self._live_strategy_key_from_action(planned_trade_action)
                entry_blocked, entry_block_reason = self._live_entry_conflict(
                    symbol,
                    strategy_key,
                    execution,
                    side=str(planned_trade_action.get("side") or ""),
                    action=planned_trade_action,
                )
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
                    if not self._open_order_has_complete_structure_protection(planned_trade_action):
                        actions.append(
                            {
                                "type": "LOG_ONLY",
                                "symbol": symbol,
                                "reason": f"{planned_trade_action.get('reason') or 'planned_trade桥接'} | [BACKTEST_TEMPLATE_MISSING_PROTECTION] 未从回测同源模板恢复出完整止损止盈，禁止实盘开仓",
                                "refs": [],
                            }
                        )
                        continue
                    planned_trade_action = self._precheck_open_order_action(planned_trade_action)
                    if canonical_action_type(planned_trade_action.get("type")) != "OPEN_ORDER":
                        actions.append(planned_trade_action)
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

        open_order_count = sum(
            1
            for action in actions
            if canonical_action_type(action.get("type")) == "OPEN_ORDER"
        )
        gate_rejected_count = sum(
            1
            for action in actions
            if "[TRADE_GATE_PRECHECK]" in str(action.get("reason") or "")
        )

        if positions:
            market_summary = f"规则引擎执行路径：当前有 {len(positions)} 个持仓，生成 {len(position_management)} 个管理 actions。"
        elif gate_rejected_count > 0 and open_order_count == 0:
            market_summary = (
                f"规则引擎执行路径：识别到 {len(executable_trades)} 个开仓候选，"
                f"但有 {gate_rejected_count} 个被 trade gate 拒绝，本轮未下单。"
            )
        else:
            market_summary = f"规则引擎执行路径：识别到 {open_order_count or len(executable_trades)} 个可执行交易。"

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
            "explanation": "本轮直接使用规则引擎识别交易机会，并用代码化逻辑执行持仓管理。",
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
        """兼容旧入口，真实实现已迁移到 live_timeout_fallback_mixin。"""
        return LiveTimeoutFallbackMixin.timeout_fallback_decision(
            self,
            runtime,
            market_cache,
            execution,
            phase_plan,
            analysis_board,
            quick_scan_events,
            error,
        )

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
        prepared = self.prepare_rule_engine_context(runtime, market_cache, execution, trigger, phase_plan)
        mark_stage("prepare_rule_engine_context_ms", stage_started)
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

        payload: dict[str, Any] = {}
        decision: dict[str, Any]
        ref_names: list[str]
        knowledge_meta: dict[str, Any]

        decision = {}
        ref_names = []
        knowledge_meta = {}
        stage_started = time.perf_counter()
        LOG.info("[RULE_ENGINE] 纯代码决策主链")
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

        # 规则引擎主链后再做一次安全网补单，避免 LOG_ONLY 残留遗漏。
        env_file = Path(__file__).parent.parent / "config" / ".env"
        rule_engine_enabled = True
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.strip().startswith("AB_PATROL_RULE_ENGINE="):
                    rule_engine_enabled = bool(int(line.split("=", 1)[1].strip()))
                    break

        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        decision = self._apply_rule_engine_safety_net(decision, market_cache, execution, positions)

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
        state_patch["decision_engine"] = "RULE_ENGINE"
        state_patch["knowledge_loading"] = knowledge_meta
        state_patch["prompt_references"] = ref_names
        write_json(self.logs_dir / "last_decision.json", decision)

        return self.finalize_cycle_outputs(
            runtime=runtime,
            market_cache=market_cache,
            execution=execution,
            phase_plan=phase_plan,
            analysis_board=analysis_board,
            quick_scan_events=quick_scan_events,
            symbol_cache=symbol_cache,
            decision=decision,
            payload=payload,
            ref_names=ref_names,
            knowledge_meta=knowledge_meta,
            trigger=trigger,
            cycle_started=cycle_started,
            profile_stages=profile_stages,
        )

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
