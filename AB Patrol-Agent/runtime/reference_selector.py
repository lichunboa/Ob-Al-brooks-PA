"""Prompt 引用选择与阶段路由。"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from utils import (
    classify_primary_s6_reference,
    event_has_exact,
    event_has_prefix,
    parse_dt,
)


def utc_now() -> datetime:
    """返回 UTC 当前时间。"""
    return datetime.now(timezone.utc)


class ReferenceSelectorMixin:
    """封装引用路由、阶段打分与 Prompt 选材。"""

    def event_score(self, symbol: str, phase_plan: dict[str, Any], symbol_cache: dict[str, Any], quick_scan_events: dict[str, Any]) -> int:
        cached = symbol_cache.get(symbol, {})
        events = self.flatten_events(quick_scan_events.get(symbol))
        status = str(cached.get("status") or "")
        score = 0
        if status in {"in_trade", "manage"}:
            score += 120
        elif status in {"entry_ready", "entry_ready_blocked"}:
            score += 95
        elif status == "pre_signal":
            score += 80
        if event_has_prefix(events, ("signal_trigger:", "hl_signal:", "trigger:")):
            score += 100
        if event_has_prefix(events, ("state_change:", "state:BO", "state:BC", "state:SC", "anomaly:", "level_break:")) or event_has_exact(
            events,
            {"level_break", "momentum", "climax_suspected"},
        ):
            score += 70
        if event_has_prefix(events, ("tr_edge:",)) or event_has_exact(events, {"cached_pre_signal"}):
            score += 55
        if event_has_exact(events, {"ema_touch", "wedge_or_mtr", "momentum_fading"}) or event_has_prefix(events, ("first_pb:", "pb_depth:")):
            score += 35
        if event_has_prefix(events, ("anomaly:",)) or int(cached.get("consecutive_watching") or 0) >= 6:
            score += 15
        if phase_plan.get("trigger_symbol") and str(phase_plan.get("trigger_symbol")).upper() == symbol:
            score += 30
        return score

    def ranked_eventful_symbols(
        self,
        phase_plan: dict[str, Any],
        symbol_cache: dict[str, Any],
        quick_scan_events: dict[str, Any],
        *,
        limit: int = 2,
        min_score: int = 1,
    ) -> list[str]:
        ranked = sorted(
            phase_plan["focus_symbols"],
            key=lambda symbol: (-self.event_score(symbol, phase_plan, symbol_cache, quick_scan_events), phase_plan["focus_symbols"].index(symbol)),
        )
        return [
            symbol
            for symbol in ranked
            if self.event_score(symbol, phase_plan, symbol_cache, quick_scan_events) >= min_score
        ][:limit]

    def route_s6_references(self, state: str, events: list[str]) -> list[str]:
        selected: list[str] = ["S6-common.md"]
        normalized = [str(event or "").strip() for event in events]
        state_upper = str(state or "").upper()

        def add(ref_name: str) -> None:
            if ref_name not in selected:
                selected.append(ref_name)

        bo_clues = (
            state_upper == "BO"
            or any(event.startswith("state:BO") for event in normalized)
            or any(event.startswith("state_change:") and event.endswith("->BO") for event in normalized)
        )
        channel_clues = (
            state_upper in {"TC", "BC"}
            or any(
                event in {"ema_touch", "cached_pre_signal"}
                or event.startswith(("first_pb:", "signal_trigger:", "hl_signal:L"))
                for event in normalized
            )
        )
        tr_clues = state_upper == "TR" or any(event.startswith("tr_edge:") for event in normalized)
        reversal_clues = any(
            event == "wedge_or_mtr"
            or event.startswith("hl_signal:H")
            or event.startswith(("state:SC", "state:BC"))
            or event == "climax_suspected"
            or event == "momentum_fading"
            for event in normalized
        )

        if bo_clues:
            add("S6-bo.md")
        if channel_clues:
            add("S6-channel.md")
        if tr_clues:
            add("S6-tr.md")
        if reversal_clues:
            add("S6-reversal.md")
        return selected

    def daily_bias_stale(self, symbol_cache: dict[str, Any]) -> bool:
        now = utc_now()
        for item in symbol_cache.values():
            if not isinstance(item, dict):
                continue
            expires_at = parse_dt(item.get("daily_bias_expires"))
            if expires_at is None or expires_at <= now:
                return True
        return False

    def symbol_reference_hints(
        self,
        *,
        status: str,
        state: str,
        events: list[str],
        consecutive_watching: int = 0,
    ) -> list[str]:
        selected: list[str] = []

        def add(*ref_names: str) -> None:
            for ref_name in ref_names:
                if ref_name and ref_name not in selected:
                    selected.append(ref_name)

        status_lower = str(status or "").lower()
        state_upper = str(state or "").upper()
        routed_s6 = self.route_s6_references(state_upper, events)

        if status_lower in {"pre_signal", "entry_ready", "entry_ready_blocked", "in_trade", "manage"}:
            add("S4-strategy-match.md", "S3b-key-levels.md", "S5-evaluation.md", "S6-common.md")
            for ref_name in routed_s6:
                if ref_name != "S6-common.md":
                    add(ref_name)
            if status_lower in {"in_trade", "manage"}:
                add("S7-management.md")
            return selected

        if event_has_prefix(events, ("signal_trigger:", "hl_signal:")):
            add("S4-strategy-match.md", "S3b-key-levels.md", "S5-evaluation.md", "S6-common.md")
            for ref_name in routed_s6:
                if ref_name != "S6-common.md":
                    add(ref_name)
            return selected

        if event_has_prefix(events, ("state:BC", "state:SC")):
            add("S3-market-state.md", "S6-reversal.md")
            return selected

        if event_has_prefix(events, ("state_change:",)):
            add("S3-market-state.md", "S4-strategy-match.md")
            return selected

        if event_has_prefix(events, ("state:BO", "state:TC")):
            add("S3-market-state.md", "S4-strategy-match.md")
            return selected

        if event_has_prefix(events, ("tr_edge:",)) or state_upper == "TR":
            add("S4-strategy-match.md")
            for ref_name in routed_s6:
                add(ref_name)
            return selected

        if event_has_prefix(events, ("first_pb:", "pb_depth:")) or event_has_exact(events, {"ema_touch", "cached_pre_signal"}):
            add("S4-strategy-match.md")
            for ref_name in routed_s6:
                add(ref_name)
            return selected

        if event_has_exact(events, {"wedge_or_mtr", "momentum_fading", "climax_suspected"}):
            add("S3-market-state.md")
            return selected

        if event_has_prefix(events, ("anomaly:", "level_break:")) or event_has_exact(events, {"level_break"}):
            add("S1-reading.md", "S2-direction.md", "S3-market-state.md")
            return selected

        if consecutive_watching >= 6 or event_has_prefix(events, ("stale:",)):
            add("S1-reading.md", "S2-direction.md", "S3-market-state.md", "S3b-key-levels.md")
            return selected

        if state_upper:
            add("S2-direction.md", "S3-market-state.md")

        return selected

    def select_canonical_references(
        self,
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
        symbol_cache: dict[str, Any],
        quick_scan_events: dict[str, Any],
    ) -> list[str]:
        selected: list[str] = []

        def add(*ref_names: str) -> None:
            for ref_name in ref_names:
                if ref_name and ref_name not in selected:
                    selected.append(ref_name)

        add("C0-foundations.md", "C5-step5-dynamic-timing.md")

        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        if positions:
            add("C4-management-and-exit-operations.md")

        if phase_plan.get("full_refresh") or self.daily_bias_stale(symbol_cache):
            add("C1-market-cycle-and-state.md")

        aggregate_events: list[str] = []
        for event_map in quick_scan_events.values():
            aggregate_events.extend(self.flatten_events(event_map))

        if any(
            event == "wedge_or_mtr"
            or event == "cached_pre_signal"
            or event.startswith(("signal_trigger:", "hl_signal:", "first_pb:", "state_change:", "tr_edge:", "level_break:"))
            for event in aggregate_events
        ):
            add("C2-triggers-and-reversal-taxonomy.md", "C3-style-equation-and-order-planning.md")

        phase = str(phase_plan.get("phase") or "").upper()
        if phase in {"SCALP_FAST", "ENTRY_READY", "ENTRY_READY_BLOCKED", "MANAGE"}:
            add("C3-style-equation-and-order-planning.md")
        if phase == "MANAGE":
            add("C4-management-and-exit-operations.md")

        if not selected:
            add("C0-foundations.md", "C1-market-cycle-and-state.md", "C5-step5-dynamic-timing.md")

        return selected

    def merge_reference_sets(self, canonical_refs: list[str], selected_refs: list[str]) -> list[str]:
        merged: list[str] = []
        for ref_name in [*canonical_refs, *selected_refs]:
            if ref_name and ref_name not in merged:
                merged.append(ref_name)
        return merged

    def select_quote_references(
        self,
        selected_refs: list[str],
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
    ) -> list[str]:
        refs = set(selected_refs)
        phase = str(phase_plan.get("phase") or "").upper()
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        selected: list[str] = []

        def add(*ref_names: str) -> None:
            for ref_name in ref_names:
                if ref_name and ref_name not in selected:
                    selected.append(ref_name)

        if refs & {"S0-daily-bias.md", "S1-reading.md", "S2-direction.md", "S3-market-state.md", "S3b-key-levels.md"}:
            add("quotes/Q1-context.md")

        if refs & {"S2-direction.md", "S4-strategy-match.md", "S6-bo.md", "S6-channel.md", "S6-tr.md", "S6-reversal.md"}:
            add("quotes/Q2-direction.md")

        if refs & {"S4-strategy-match.md", "S5-evaluation.md", "S6-bo.md", "S6-channel.md", "S6-tr.md", "S6-reversal.md"}:
            add("quotes/Q3-fear.md", "quotes/Q4-entry.md")

        if "S5-evaluation.md" in refs or phase in {"SCALP_FAST", "ENTRY_READY", "ENTRY_READY_BLOCKED"}:
            add("quotes/Q5-te.md")

        if positions or "S7-management.md" in refs or phase == "MANAGE":
            add("quotes/Q6-management.md")

        return selected

    def select_prompt_references(
        self,
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
        symbol_cache: dict[str, Any],
        quick_scan_events: dict[str, Any],
        ab_context_by_symbol: dict[str, Any],
    ) -> list[str]:
        selected: list[str] = []
        canonical_refs = self.select_canonical_references(
            phase_plan,
            execution,
            symbol_cache,
            quick_scan_events,
        )

        def add(*ref_names: str) -> None:
            for ref_name in ref_names:
                if ref_name and ref_name not in selected:
                    selected.append(ref_name)

        def add_symbol_refs(symbol: str) -> None:
            cached = symbol_cache.get(symbol, {})
            events = self.flatten_events(quick_scan_events.get(symbol))
            status = str(cached.get("status") or "")
            state = self.current_market_state(cached, ab_context_by_symbol.get(symbol, {}))
            for ref_name in self.symbol_reference_hints(
                status=status,
                state=state,
                events=events,
                consecutive_watching=int(cached.get("consecutive_watching") or 0),
            ):
                add(ref_name)

        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []

        if phase_plan["full_refresh"]:
            add("S0-daily-bias.md", "S1-reading.md")
            if positions:
                add("S5-evaluation.md", "S7-management.md")
            for symbol in self.ranked_eventful_symbols(
                phase_plan,
                symbol_cache,
                quick_scan_events,
                limit=len(phase_plan["focus_symbols"]),
                min_score=1,
            ):
                add_symbol_refs(symbol)
            if selected == ["S0-daily-bias.md", "S1-reading.md"]:
                add("S2-direction.md", "S3-market-state.md", "S3b-key-levels.md")
            if any(ref.startswith("S6-") for ref in selected) and "S5-evaluation.md" not in selected:
                add("S5-evaluation.md")
            quote_refs = self.select_quote_references(selected, phase_plan, execution)
            return self.merge_reference_sets(canonical_refs, [*selected, *quote_refs])

        if self.daily_bias_stale(symbol_cache):
            add("S0-daily-bias.md")

        if positions:
            add("S2-direction.md", "S3-market-state.md", "S3b-key-levels.md", "S5-evaluation.md", "S7-management.md")
            quote_refs = self.select_quote_references(selected, phase_plan, execution)
            return self.merge_reference_sets(canonical_refs, [*selected, *quote_refs])

        for symbol in self.ranked_eventful_symbols(
            phase_plan,
            symbol_cache,
            quick_scan_events,
            limit=len(phase_plan["focus_symbols"]),
            min_score=1,
        ):
            add_symbol_refs(symbol)
            cached = symbol_cache.get(symbol, {})
            events = self.flatten_events(quick_scan_events.get(symbol))
            if any(event.startswith("anomaly:") for event in events) or int(cached.get("consecutive_watching") or 0) >= 6:
                add("S1-reading.md", "S2-direction.md", "S3-market-state.md", "S3b-key-levels.md")

        if not selected:
            add("S2-direction.md", "S3-market-state.md")

        if any(ref.startswith("S6-") for ref in selected) and "S5-evaluation.md" not in selected:
            add("S5-evaluation.md")
        quote_refs = self.select_quote_references(selected, phase_plan, execution)
        return self.merge_reference_sets(canonical_refs, [*selected, *quote_refs])
