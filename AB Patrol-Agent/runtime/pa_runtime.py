#!/usr/bin/env python3
"""AB Patrol-Agent runtime for PA交易 Crypto.

This runtime restores the old Claude patrol loop around the original
`patrol-l1` skill and S-files. OpenClaw remains the operator / Telegram
host, while the decision engine can run on an independent provider.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
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

from brooks_filter import BrooksFilterMixin
from chart_manager import ChartManagerMixin
from config import Config
from http_runtime import HttpRuntimeMixin
from notification_renderer import NotificationRendererMixin
from prompt_builder import PromptBuilderMixin
from state_manager import StateManagerMixin
from reference_selector import ReferenceSelectorMixin
from signal_analyzer import (
    frame_summary_text,
    infer_signal_timeframe,
    prompt_cached_state,
    validation_seed_state,
)
from env_loader import load_agent_env
from path_layout import data_run_dir
from providers import DecisionProviderConfig, build_decision_provider
from aggressive_mode import should_execute_aggressive, identify_strategy, get_aggressive_mode_status
from rule_engine import get_executable_trades, analyze_all_symbols
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
        self.trigger_ack_path = Path.home() / ".openclaw" / "patrol-l1-trigger.ack.json"
        self.last_trigger_mtime = 0
        self.last_trigger_digest = ""
        self.chart_refresh_state: dict[str, float] = {}
        self.decision_provider = build_decision_provider(
            DecisionProviderConfig(
                provider=config.decision_provider,
                openclaw_agent=config.openclaw_agent,
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

    def configured_exchange(self) -> str:
        exchange = (
            os.getenv("AB_PATROL_EXECUTION_EXCHANGE")
            or os.getenv("AB_PATROL_EXCHANGE")
            or "binance"
        ).strip().lower()
        return exchange if exchange in {"binance", "okx", "ctrader"} else "binance"

    def configured_market_profile(self) -> str:
        exchange = self.configured_exchange()
        if exchange == "ctrader":
            return "multi_asset"
        if exchange == "okx":
            return "crypto_swap"
        return "crypto"

    def default_watch_symbols(self) -> list[str]:
        symbols_config = load_json(self.config.agent_root / "config" / "symbols.json", {})
        exchange = self.configured_exchange()
        if exchange == "ctrader":
            return ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "US 30", "US TECH 100"]
        if exchange == "okx":
            return list(((symbols_config.get("okx") or {}).get("crypto_swap") or []))[:6] or [
                "BTC-USDT-SWAP",
                "ETH-USDT-SWAP",
                "BNB-USDT-SWAP",
            ]
        return list(((symbols_config.get("binance") or {}).get("crypto") or []))[:6] or [
            "BTCUSDT",
            "SOLUSDT",
        ]

    def configured_runtime_title(self) -> str:
        exchange = self.configured_exchange()
        if exchange == "ctrader":
            return "PA交易 Multi-Asset"
        if exchange == "okx":
            return "PA交易 OKX"
        return "PA交易 Crypto"

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
        active_symbols = list(symbol_cache.keys()) or self.default_watch_symbols()
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

        focus_symbols = sorted(active_symbols, key=status_rank)[:3]
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
            base = self.apply_brooks_filter_to_patch(base, event_tags)
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
        if intent == "PYRAMID_ADD":
            # S7-management 第三笔/最后一笔加仓风险 0.4%。
            return 0.4
        if intent in {"ADD_ON", "SCALE_IN"}:
            # S7-management 首个加仓风险 0.3%。
            return 0.3
        # 首仓默认同样按 0.3% 起步，由后续确认再做加仓。
        return 0.3

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

    def load_trade_gate_module(self) -> Any:
        module = getattr(self, "_trade_gate_module", None)
        if module is not None:
            return module
        module_path = self.config.tools_root / "patrol_trade.py"
        spec = importlib.util.spec_from_file_location("ab_patrol_trade_gate", module_path)
        if spec is None or spec.loader is None:
            raise RuntimeError(f"无法加载交易校验模块: {module_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self._trade_gate_module = module
        return module

    def validate_trade_gate(self, action: dict[str, Any]) -> dict[str, Any]:
        action = self.ensure_gate_ready_equation(action)
        refs = ",".join(normalize_refs(action.get("refs")))
        gate = self.load_trade_gate_module()

        checks: list[str] = []
        errors: list[str] = []
        warnings: list[str] = []

        def record(label: str, ok: bool, message: str, *, warning: bool = False) -> None:
            prefix = "⚠️" if warning else ("✅" if ok else "❌")
            checks.append(f"{prefix} {label}: {message}")
            if warning:
                warnings.append(message)
            elif not ok:
                errors.append(message)

        ok, message = gate.validate_equation(str(action.get("equation") or ""))
        record("Equation", ok, str(message))

        ok, message = gate.validate_refs(refs)
        record("Refs", ok, str(message))

        ok, message = gate.validate_bar_reading(str(action.get("bar_reading") or ""))
        record("Reading", ok, str(message))

        ok, message = gate.validate_stop_loss(
            str(action.get("side") or ""),
            safe_float(action.get("entry")),
            safe_float(action.get("sl")),
            safe_float(action.get("tp")),
            str(action.get("strategy") or ""),
            str(action.get("style") or ""),
            str(action.get("equation") or ""),
            str(action.get("market_state") or ""),
            refs,
        )
        record("SL/TP", ok, str(message))

        ai_parts = str(action.get("ai_direction") or "").replace(",", " ").split()
        target_dir = "AIL" if str(action.get("side") or "").upper() == "BUY" else "AIS"
        aligned = sum(1 for part in ai_parts if target_dir in part.upper())
        if aligned < 3:
            record("Alignment", False, f"{action.get('side')} 需要至少 3 个 TF 为 {target_dir}，当前只有 {aligned} 个")
        else:
            record("Alignment", True, f"{aligned}/4 TF = {target_dir}")

        market_state = str(action.get("market_state") or "").upper()
        strategy = str(action.get("strategy") or "").upper()
        if market_state == "TR" and "BO" in strategy:
            record("State", True, "TR 状态下不应做 BO 策略", warning=True)
        else:
            record("State", True, f"{market_state or '-'} + {action.get('strategy') or '-'} 一致")

        output_lines = checks[:]
        if warnings:
            output_lines.append("⚠️ 警告: " + " | ".join(warnings))
        if errors:
            output_lines.append("🚫 下单被拒绝")
        else:
            output_lines.append("✅ 全部校验通过")

        return {
            "ok": not errors,
            "stdout": "\n".join(output_lines)[-1500:],
            "stderr": "" if not errors else "\n".join(errors)[-1500:],
        }

    def execute_action(self, action: dict[str, Any], execution: dict[str, Any]) -> dict[str, Any]:
        action_type = str(action.get("type") or "").upper()
        symbol = str(action.get("symbol") or "")
        result: dict[str, Any] = {
            "type": action_type,
            "symbol": symbol,
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
            result["trade_gate"] = self.validate_trade_gate(action)
            if not result["trade_gate"].get("ok"):
                gate_message = result["trade_gate"].get("stdout") or result["trade_gate"].get("stderr") or "trade gate rejected"
                result["success"] = False
                result["status"] = "VALIDATION_REJECTED"
                result["message"] = gate_message
                return result

            can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
            if not can_trade.get("can_trade", False):
                result["success"] = False
                result["status"] = "BLOCKED"
                result["message"] = f"can_trade blocked: {can_trade.get('reason', '-')}"
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

            order_resp = self.http_post_json("/order", order_payload)
            result["response"] = order_resp
            result["success"] = bool(order_resp.get("success"))
            result["status"] = order_resp.get("status", "UNKNOWN")
            result["message"] = order_resp.get("message")
            return result

        if action_type in {"PARTIAL_CLOSE", "REDUCE_POSITION"}:
            positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
            live_position = next(
                (
                    item
                    for item in positions
                    if isinstance(item, dict) and str(item.get("symbol") or "").upper() == symbol.upper()
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
            cancel_resp = self.http_delete_json("/orders", {"symbol": symbol or None})
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
            status = str(cleaned_patch.get("status") or current.get("status") or "")
            has_pre_signal = bool(str(cleaned_patch.get("pre_signal") or "").strip()) or status in {
                "pre_signal",
                "entry_ready",
                "entry_ready_blocked",
            }
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
        decision: dict[str, Any],
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
        analysis_board: dict[str, Any],
        session_id: str | None,
        cycle_id: str,
    ) -> dict[str, Any]:
        next_scan_plan = self.normalize_next_scan_plan(decision, execution, analysis_board)
        next_scan_seconds = int(next_scan_plan.get("in_seconds") or 480)
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
                "host_mode": "CLI_SESSION" if self.config.decision_provider == "codex_cli" else "OPENCLAW",
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
                "openclaw_runtime_agent": self.config.openclaw_agent if self.config.decision_provider == "openclaw" else None,
                "openclaw_runtime_session_id": session_id or runtime.get("openclaw_runtime_session_id"),
                "openclaw_operator_agent": runtime.get("openclaw_operator_agent") or runtime.get("openclaw_agent") or self.config.operator_agent,
                "openclaw_session_id": runtime.get("openclaw_session_id"),
                "llm_provider": self.config.decision_provider,
                "decision_requested_provider": self.config.requested_decision_provider,
                "decision_fallback_provider": self.config.decision_fallback_provider,
                "decision_model": self.config.decision_model or runtime.get("decision_model") or "openai-codex/gpt-5.4",
                "decision_session_id": session_id or runtime.get("decision_session_id"),
                "openclaw_agent": runtime.get("openclaw_agent") or self.config.operator_agent,
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
        if str(runtime.get("exchange") or "").strip().lower() != self.configured_exchange():
            updated.pop("symbols", None)
        symbol_state = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        if symbol_state:
            updated["symbols"] = symbol_state
        existing_symbol_state = updated.get("symbols") if isinstance(updated.get("symbols"), dict) else {}
        allowed_symbols = {
            str(symbol).upper()
            for symbol in [
                *self.default_watch_symbols(),
                *(updated.get("focus_symbols") or []),
                *(updated.get("active_symbols") or []),
            ]
            if str(symbol).strip()
        }
        existing_symbols = {str(symbol).upper() for symbol in existing_symbol_state.keys()}
        if existing_symbols and allowed_symbols and not (existing_symbols & allowed_symbols):
            updated.pop("symbols", None)
        updated.pop("runtime_state", None)
        updated["next_scan"].setdefault("bucket_source_refs", [])
        updated["next_scan"].setdefault("bucket_rule", "-")
        decision.setdefault("state_patch", {})["scan_bucket"] = next_scan_plan
        if session_id:
            updated["openclaw_runtime_session_id"] = session_id
            updated["decision_session_id"] = session_id
        updated["openclaw_runtime_agent"] = self.config.openclaw_agent if self.config.decision_provider == "openclaw" else None
        updated["openclaw_operator_agent"] = updated.get("openclaw_operator_agent") or self.config.operator_agent
        updated["openclaw_agent"] = updated.get("openclaw_agent") or self.config.operator_agent
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
            planned_trade["risk_percent"] = planned_trade.get("risk_percent") or 0.3
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

        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        # 优先从 runtime.symbols 读取（包含完整的 pre_signal 数据），fallback 到 market_cache
        symbol_cache = runtime.get("symbols") if isinstance(runtime.get("symbols"), dict) else {}
        if not symbol_cache:
            symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        focus_symbols = phase_plan.get("focus_symbols") or []

        # 1. 持仓管理（如果有持仓）
        position_management = []
        if positions:
            try:
                for pos in positions:
                    result = manage_position(pos, market_cache)
                    if result and result.get("actions"):
                        position_management.extend(result["actions"])
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

        for symbol in focus_symbols:
            cached = symbol_cache.get(symbol, {}) if isinstance(symbol_cache.get(symbol), dict) else {}

            # 构建 symbols 字典
            symbols_dict[symbol] = {
                "status": cached.get("status", "watching"),
                "stage": cached.get("stage", ""),
                "market_state": cached.get("market_state", ""),
                "thesis": cached.get("thesis", ""),
                "pre_signal": cached.get("pre_signal"),
                "planned_trade": cached.get("planned_trade"),
            }

            # 生成开仓 actions（当前规则引擎路径始终运行）
            matching_trade = next((t for t in executable_trades if t["symbol"] == symbol), None)
            if matching_trade:
                action_type = "OPEN_ORDER"
                action_reason = f"规则引擎: {matching_trade['strategy']} | {matching_trade['reason']}"
                LOG.info(f"[RULE_ENGINE_DECISION] {symbol} 生成 OPEN_ORDER")

                # 构建完整的 action（包含所有必要参数）
                actions.append({
                    "type": action_type,
                    "symbol": symbol,
                    "side": matching_trade["side"],
                    "entry": matching_trade["entry_price"],
                    "sl": matching_trade["stop_loss"],
                    "tp": matching_trade["take_profit"],
                    "strategy": matching_trade["strategy"],
                    "style": matching_trade["style"],
                    "reason": action_reason,
                    "refs": [],
                    "market_state": cached.get("market_state", ""),
                    "signal_bar": "",
                    "equation": "",
                    "bar_reading": "",
                    "ai_direction": matching_trade["side"],
                    "risk_usdt": 10,
                    "confidence": matching_trade.get("confidence"),
                    "signal_source": self.config.execution_bot_id,
                    "intent": matching_trade.get("intent"),
                    "risk_percent": matching_trade.get("risk_percent"),
                    "reentry_attempt": matching_trade.get("reentry_attempt"),
                    "followup_profile": matching_trade.get("followup_profile"),
                    "playbook_hint": matching_trade.get("playbook_hint"),
                    "playbook_id": matching_trade.get("playbook_id"),
                    "reentry_candidate": matching_trade.get("reentry_candidate"),
                })
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
            "symbol_updates": {},
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
        # 激进模式开关（强制从 .env 重新读取）
        env_file = Path(__file__).parent.parent / "config" / ".env"
        aggressive_mode = False
        rule_engine_enabled = True  # 默认启用
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.strip().startswith("AB_PATROL_AGGRESSIVE_MODE="):
                    aggressive_mode = bool(int(line.split("=", 1)[1].strip()))
                elif line.strip().startswith("AB_PATROL_RULE_ENGINE="):
                    rule_engine_enabled = bool(int(line.split("=", 1)[1].strip()))

        # 如果 .env 没有，再从环境变量读取
        if not aggressive_mode:
            aggressive_mode = bool(int(os.getenv("AB_PATROL_AGGRESSIVE_MODE", "0")))

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

        if aggressive_mode:
            LOG.info("[AGGRESSIVE] 激进模式已启用 | positions=%d", len(positions))

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
            symbol_updates[symbol] = {
                "status": str(cached.get("status") or "watching"),
                "daily_bias": cached.get("daily_bias"),
                "ai_direction": cached.get("ai_direction"),
                "market_state": cached.get("market_state"),
                "market_state_detail": cached.get("market_state_detail") or board.get("cached_state", {}).get("market_state_detail"),
                "structure_summary": cached.get("structure_summary") or thesis,
                "key_levels": cached.get("key_levels") or board.get("cached_state", {}).get("key_levels") or {},
                "thesis": thesis,
                "pre_signal": cached.get("pre_signal"),
            }

            # 优先使用规则引擎
            action_type = "LOG_ONLY"
            action_reason = f"模型超时，保留上一轮判断；事件参考: {event_text}"
            action_params = {}  # 存储额外的交易参数

            # 1. 规则引擎优先
            if rule_engine_enabled and executable_trades:
                matching_trade = next((t for t in executable_trades if t["symbol"] == symbol), None)
                if matching_trade:
                    action_type = "OPEN_ORDER"
                    action_reason = f"规则引擎: {matching_trade['strategy']} | {matching_trade['reason']}"
                    # 添加完整的交易参数
                    action_params = {
                        "entry": matching_trade["entry_price"],
                        "sl": matching_trade["stop_loss"],
                        "tp": matching_trade["take_profit"],
                        "side": matching_trade["side"],
                        "strategy": matching_trade["strategy"],
                        "style": matching_trade["style"],
                        "confidence": matching_trade["confidence"],
                        "intent": matching_trade.get("intent"),
                        "risk_percent": matching_trade.get("risk_percent"),
                        "reentry_attempt": matching_trade.get("reentry_attempt"),
                        "followup_profile": matching_trade.get("followup_profile"),
                        "playbook_hint": matching_trade.get("playbook_hint"),
                        "playbook_id": matching_trade.get("playbook_id"),
                        "reentry_candidate": matching_trade.get("reentry_candidate"),
                    }
                    LOG.info(f"[RULE_ENGINE] {symbol} 执行: {matching_trade['strategy']}")

            # 2. 激进模式作为备选
            elif aggressive_mode and not positions:
                can_execute, exec_reason = should_execute_aggressive(cached)
                if can_execute and cached.get("status") == "executable":
                    action_type = "OPEN_ORDER"
                    action_reason = f"激进模式执行: {exec_reason}"
                    strategy = identify_strategy(cached)
                    LOG.info(f"[AGGRESSIVE] {symbol} 激进模式触发: {strategy} | {exec_reason}")

            action = {
                "type": action_type,
                "symbol": symbol,
                "reason": action_reason,
                "refs": refs,
            }
            # 合并交易参数
            action.update(action_params)
            actions.append(action)

        if positions:
            market_summary = "本轮决策模型超时。为避免持仓无人看管，系统保留上一轮管理结论，不做新开仓，缩短到 60 秒后重试。"
        else:
            market_summary = "本轮决策模型超时。系统保留上一轮观察结论，不做新开仓，快速重试下一轮。"

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
            "explanation": _trim_text(f"Decision provider timeout fallback: {error}", 240),
        }

    def run_cycle(self, trigger: dict[str, Any] | None = None) -> dict[str, Any]:
        runtime = self.load_runtime_state()
        market_cache = self.align_market_cache(runtime, self.normalize_market_cache(self.load_market_cache()))
        execution = self.execution_snapshot()
        runtime.update(self.sync_live_followup_state(runtime, market_cache, execution))
        phase_plan = self.select_phase_plan(runtime, market_cache, execution, trigger)
        prepared = self.prepare_prompt_context(runtime, market_cache, execution, trigger, phase_plan)
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
        if not execution.get("positions") and phase_plan["phase"] in {"SCAN", "ENTRY_READY"}:
            fast_lane_candidates = self.scalp_fast_candidates(
                phase_plan,
                symbol_cache,
                quick_scan_events,
                ab_context_by_symbol,
            )

        decision = {}
        ref_names = []
        knowledge_meta = {}
        if fast_lane_candidates:
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
                    if "timeout" not in str(exc).lower():
                        raise
                    LOG.warning("decision provider timed out, using fallback decision: %s", exc)
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
        if rule_engine_enabled and not positions:
            from rule_engine import get_executable_trades
            symbol_cache_for_rules = decision.get("symbols") or {}
            try:
                executable_trades = get_executable_trades(symbol_cache_for_rules)
                if executable_trades:
                    LOG.info("[RULE_ENGINE_SAFETY_NET] 发现 %d 个可执行交易", len(executable_trades))
                    # 检查是否有 LOG_ONLY 的 actions 可以升级为 OPEN_ORDER
                    for action in (decision.get("actions") or []):
                        if not isinstance(action, dict):
                            continue
                        symbol = str(action.get("symbol") or "").upper()
                        if action.get("type") == "LOG_ONLY":
                            matching_trade = next((t for t in executable_trades if t["symbol"] == symbol), None)
                            if matching_trade:
                                action["type"] = "OPEN_ORDER"
                                action["reason"] = f"规则引擎升级: {matching_trade['strategy']} | {matching_trade['reason']}"
                                LOG.info(f"[RULE_ENGINE_SAFETY_NET] {symbol} 从 LOG_ONLY 升级为 OPEN_ORDER: {matching_trade['strategy']}")
            except Exception as exc:
                LOG.warning("[RULE_ENGINE_SAFETY_NET] 规则引擎失败: %s", exc)

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

        execution_results: list[dict[str, Any]] = []
        for action in hydrated_actions:
            execution_results.append(self.execute_action(action, execution))
        for action in hydrated_management:
            if isinstance(action, dict) and action.get("type"):
                execution_results.append(self.execute_action(action, execution))

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
        updated_runtime = self.write_runtime_state(
            runtime,
            decision,
            phase_plan,
            execution,
            analysis_board,
            str(session_id),
            cycle_id,
        )

        next_scan = updated_runtime["next_scan"]
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
        pre_signal_pushes: list[dict[str, Any]] = []
        pre_signal_renders: list[dict[str, Any]] = []
        for notice in pre_signal_notices:
            symbol = str(notice.get("symbol") or "-")
            try:
                message = self.render_pre_signal_push(notice)
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
        housekeeping_push = None
        housekeeping_render = {"ok": True, "skipped": True, "reason": "not_due"}
        if int(updated_runtime.get("loop_seq") or 0) % 6 == 0:
            try:
                housekeeping_text = self.render_housekeeping_card(
                    updated_runtime,
                    market_cache,
                    execution,
                    decision,
                    int(next_scan.get("in_seconds") or 120),
                )
            except Exception as exc:
                housekeeping_render = {"ok": False, "skipped": False, "error": " ".join(str(exc).split())[:240]}
                housekeeping_push = {"ok": False, "skipped": True, "reason": "render_failed"}
                LOG.exception("housekeeping render failed: %s", exc)
            else:
                housekeeping_render = {"ok": True, "skipped": False}
                try:
                    housekeeping_push = self.push_telegram_update(housekeeping_text)
                except Exception as exc:
                    housekeeping_push = {"ok": False, "skipped": True, "reason": "push_failed", "error": " ".join(str(exc).split())[:240]}
                    LOG.exception("housekeeping push failed: %s", exc)
        cycle_payload["render_status"] = {
            "cycle_card": cycle_card_render,
            "pre_signal": pre_signal_renders,
            "housekeeping": housekeeping_render,
        }
        cycle_payload["push_status"] = {
            "cycle_card": push_result,
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
        try:
            result = self.run_cycle(trigger=trigger)
        except Exception as exc:
            LOG.exception("runtime cycle failed: %s", exc)
            return 1
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

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
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding="utf-8"),
    ]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(levelname)s - %(name)s - %(message)s",
        handlers=handlers,
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
