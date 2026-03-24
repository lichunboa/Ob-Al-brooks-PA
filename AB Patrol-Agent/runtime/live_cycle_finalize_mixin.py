#!/usr/bin/env python3
"""live cycle 收尾与落盘。"""

from __future__ import annotations

import json
import logging
import time
from datetime import datetime
from typing import Any

from utils import append_jsonl, utc_iso, write_json, write_text


LOG = logging.getLogger(__name__)


class LiveCycleFinalizeMixin:
    """抽离 cycle 收尾、通知和落盘。"""

    @staticmethod
    def _normalize_conflict_message(message: str) -> str:
        """收敛动态数量/方向差异，避免冲突日志去重失效。"""
        text = " ".join(str(message or "").strip().split())
        if "[LIVE_ENTRY_CONFLICT]" in text:
            if "同品种同策略" in text:
                return "[LIVE_ENTRY_CONFLICT] 当前已有同品种同策略持仓或挂单"
            return "[LIVE_ENTRY_CONFLICT]"
        return text

    @classmethod
    def _journal_dedupe_signature(cls, item: dict[str, Any]) -> tuple[str, str, str, str] | None:
        status = str(item.get("status") or "").upper()
        symbol = str(item.get("symbol") or "")
        action_type = str(item.get("type") or "").upper()
        message = str(item.get("message") or "").strip()
        if status in {"LOG_ONLY", "LIVE_ENTRY_CONFLICT"} and (
            "[LIVE_ENTRY_CONFLICT]" in message or status == "LIVE_ENTRY_CONFLICT"
        ):
            return ("LIVE_ENTRY_CONFLICT", symbol, action_type, cls._normalize_conflict_message(message))
        if status == "SKIPPED" and message == "TAKE_PROFIT_WOULD_TRIGGER_IMMEDIATELY":
            return ("TAKE_PROFIT_WOULD_TRIGGER_IMMEDIATELY", symbol, action_type, message)
        if status == "BLOCKED" and "can_trade blocked:" in message:
            return ("CAN_TRADE_BLOCKED", symbol, action_type, "can_trade blocked")
        return None

    def _recent_duplicate_execution(self, item: dict[str, Any], *, lookback_lines: int = 300, dedupe_window_seconds: int = 600) -> bool:
        signature = self._journal_dedupe_signature(item)
        if signature is None:
            return False
        if signature[0] == "LIVE_ENTRY_CONFLICT":
            dedupe_window_seconds = max(dedupe_window_seconds, 21600)
        if signature[0] == "TAKE_PROFIT_WOULD_TRIGGER_IMMEDIATELY":
            dedupe_window_seconds = max(dedupe_window_seconds, 7200)
        journal_path = self.journal_dir / "execution_log.jsonl"
        if not journal_path.exists():
            return False
        try:
            lines = journal_path.read_text(encoding="utf-8").splitlines()[-lookback_lines:]
        except Exception:
            return False
        now_ts = datetime.fromisoformat(utc_iso().replace("Z", "+00:00")).timestamp()
        for line in reversed(lines):
            try:
                payload = json.loads(line)
            except Exception:
                continue
            if self._journal_dedupe_signature(payload) != signature:
                continue
            logged_at = str(payload.get("logged_at") or payload.get("loggedAt") or "").replace("Z", "+00:00")
            try:
                logged_ts = datetime.fromisoformat(logged_at).timestamp()
            except Exception:
                return True
            if now_ts - logged_ts <= dedupe_window_seconds:
                return True
            return False
        return False

    def finalize_cycle_outputs(
        self,
        *,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        phase_plan: dict[str, Any],
        analysis_board: dict[str, Any],
        quick_scan_events: dict[str, Any],
        symbol_cache: dict[str, Any],
        decision: dict[str, Any],
        payload: dict[str, Any],
        ref_names: list[str],
        knowledge_meta: dict[str, Any],
        trigger: dict[str, Any] | None,
        cycle_started: float,
        profile_stages: dict[str, float],
    ) -> dict[str, Any]:
        cycle_id = f"cycle_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        def mark_stage(name: str, started_at: float) -> None:
            profile_stages[name] = round((time.perf_counter() - started_at) * 1000, 2)

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
        session_id = payload.get("session_id") or runtime.get("openclaw_runtime_session_id") or runtime.get("llm_runtime_session_id") or ""
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
                        phase_text = phase_mapping.get(str(decision.get("phase") or ""), str(decision.get("phase") or "-"))
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
                pre_signal_renders.append({"symbol": symbol, "ok": False, "skipped": False, "error": " ".join(str(exc).split())[:240]})
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
            if self._recent_duplicate_execution(item):
                continue
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
