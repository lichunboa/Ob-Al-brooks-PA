"""Prompt 上下文构建与知识装载。"""

from __future__ import annotations

import concurrent.futures
import re
import time
from datetime import datetime, timezone
from typing import Any

from utils import (
    compact_bar_record,
    compact_json,
    compact_stats_for_prompt,
    recent_bar_stats,
    shrink_prompt_value,
    truncate_text,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    return utc_now().isoformat()


def prompt_cached_state(cached: dict[str, Any]) -> dict[str, Any]:
    fields = (
        "status",
        "stage",
        "consecutive_watching",
        "daily_bias",
        "daily_bias_expires",
        "market_state",
        "market_state_detail",
        "structure_summary",
        "running_narrative",
        "pre_signal",
        "pre_signal_meta",
        "key_levels",
        "thesis",
        "trade",
        "last_pass_reason",
    )
    payload = {field: cached.get(field) for field in fields if cached.get(field) not in (None, "", [], {})}
    return shrink_prompt_value(payload)


def frame_summary_text(frame: dict[str, Any]) -> str:
    summary = frame.get("summary")
    if isinstance(summary, dict):
        ordered = []
        for key in ("trend", "last_pullback", "range", "day_type"):
            value = summary.get(key)
            if value:
                ordered.append(f"{key}={value}")
        return " | ".join(ordered)
    return str(summary or "").strip()


class PromptBuilderMixin:
    """封装多品种 Prompt、知识引用与快通道构建。"""

    def _append_quick_scan_event(self, event_map: dict[str, list[str]], timeframe: str, event: str) -> None:
        """向快扫事件图里追加事件，自动去重。"""
        normalized_timeframe = str(timeframe or "5m").strip().lower() or "5m"
        normalized_event = str(event or "").strip()
        if not normalized_event:
            return
        bucket = event_map.setdefault(normalized_timeframe, [])
        if normalized_event not in bucket:
            bucket.append(normalized_event)

    def _signal_events_from_text(self, signal_text: str) -> list[str]:
        """从缓存信号文本里提取 H/L 结构事件。"""
        normalized = str(signal_text or "").upper()
        events: list[str] = []
        for token in re.findall(r"\b(H[1-4]|L[1-4])\b", normalized):
            prefix = "signal_trigger" if token in {"H1", "L1"} else "hl_signal"
            event = f"{prefix}:{token}"
            if event not in events:
                events.append(event)
        return events

    def build_quick_scan_event_map(
        self,
        symbol: str,
        cached: dict[str, Any],
        live: dict[str, Any],
        trigger: dict[str, Any] | None,
    ) -> dict[str, list[str]]:
        """用缓存字段和轻量行情构建快扫事件，避免全量 AB 深分析。"""
        event_map: dict[str, list[str]] = {}
        state = self.current_market_state(cached, {})
        if state:
            self._append_quick_scan_event(event_map, "5m", f"state:{state}")

        signal_text = " ".join(
            str(part).strip()
            for part in (
                cached.get("signal"),
                cached.get("pre_signal"),
                (cached.get("trade") or {}).get("signal"),
                (cached.get("planned_trade") or {}).get("signal"),
            )
            if str(part or "").strip()
        )
        for event in self._signal_events_from_text(signal_text):
            self._append_quick_scan_event(event_map, "5m", event)

        if cached.get("pre_signal"):
            self._append_quick_scan_event(event_map, "5m", "cached_pre_signal")
        if int(cached.get("consecutive_watching") or 0) >= 6:
            self._append_quick_scan_event(event_map, "5m", "stale:consecutive_watching")

        planned_trade = cached.get("planned_trade") if isinstance(cached.get("planned_trade"), dict) else {}
        if planned_trade.get("entry_price") or planned_trade.get("entry_zone"):
            self._append_quick_scan_event(event_map, "5m", "signal_trigger:planned_trade")

        if state == "TR":
            key_levels = cached.get("key_levels") if isinstance(cached.get("key_levels"), dict) else {}
            if key_levels.get("support") or key_levels.get("resistance"):
                self._append_quick_scan_event(event_map, "5m", "tr_edge:cached")

        heuristic_text = " ".join(
            str(part or "")
            for part in (
                cached.get("market_state_detail"),
                cached.get("structure_summary"),
                cached.get("thesis"),
                cached.get("running_narrative"),
                cached.get("pre_signal"),
                (cached.get("entry_idea") or {}).get("filter_summary"),
                (cached.get("entry_idea") or {}).get("upgrade_condition"),
                (cached.get("evaluation") or {}).get("risk"),
                (cached.get("evaluation") or {}).get("execution_decision"),
                (cached.get("trade") or {}).get("reason"),
            )
        ).lower()

        if any(token in heuristic_text for token in ("wedge", "楔", "mtr", "双顶", "双底", "反转", "reversal")):
            self._append_quick_scan_event(event_map, "5m", "wedge_or_mtr")
        if any(token in heuristic_text for token in ("momentum fading", "动能衰竭", "动能减弱", "衰竭")):
            self._append_quick_scan_event(event_map, "5m", "momentum_fading")
        if any(token in heuristic_text for token in ("climax", "高潮", "过热")):
            self._append_quick_scan_event(event_map, "5m", "climax_suspected")
        if any(token in heuristic_text for token in ("ema", "回踩", "pullback", "首回调", "first pullback")):
            self._append_quick_scan_event(event_map, "5m", "ema_touch")
        if any(token in heuristic_text for token in ("first pullback", "首回调")):
            self._append_quick_scan_event(event_map, "5m", "first_pb:cached")

        live_5m = live.get("5m") if isinstance(live.get("5m"), dict) else {}
        live_15m = live.get("15m") if isinstance(live.get("15m"), dict) else {}
        for timeframe, block in (("5m", live_5m), ("15m", live_15m)):
            summary_text = frame_summary_text(block).lower()
            if "always in" in summary_text and state in {"BO", "TC", "BC", "SC"}:
                self._append_quick_scan_event(event_map, timeframe, f"state:{state}")
            if any(token in summary_text for token in ("回调至 ema", "touch ema", "ema 上方", "ema 下方")):
                self._append_quick_scan_event(event_map, timeframe, "ema_touch")
            if "first pullback" in summary_text:
                self._append_quick_scan_event(event_map, timeframe, f"first_pb:{timeframe}")

        if trigger and str(trigger.get("symbol") or "").upper() == symbol:
            trigger_interval = str(trigger.get("interval") or "5m").lower()
            self._append_quick_scan_event(
                event_map,
                trigger_interval,
                f"trigger:{trigger.get('trigger_type')}",
            )

        return event_map

    def should_build_chart_context(
        self,
        symbol: str,
        phase_plan: dict[str, Any],
        symbol_cache: dict[str, Any],
        quick_scan_events: dict[str, Any],
        trigger: dict[str, Any] | None,
    ) -> bool:
        """只给临近交易或需要管理的品种生成图表上下文。"""
        cached = symbol_cache.get(symbol, {}) if isinstance(symbol_cache.get(symbol), dict) else {}
        status = str(cached.get("status") or "").lower()
        if status in {"pre_signal", "entry_ready", "entry_ready_blocked", "in_trade", "manage"}:
            return True
        if trigger and str(trigger.get("symbol") or "").upper() == symbol:
            return True
        if symbol in {str(item).upper() for item in (phase_plan.get("manage_symbols") or []) if item}:
            return True
        return False

    def _symbol_prompt_context(
        self,
        symbol: str,
        live: dict[str, Any],
        cached: dict[str, Any],
        ab_context: dict[str, Any],
        *,
        deep_analysis: bool,
        event_map: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        frames: dict[str, Any] = {}
        reading_targets = {
            "bar_count_total": 150,
            "browse_target_bars": 80,
            "close_read_target_bars": 20,
        }
        detail_limits = {
            "1m": 10,
            "5m": 8,
            "15m": 6,
            "30m": 4,
            "1h": 4,
        }
        event_timeframes = {
            str(timeframe).lower()
            for timeframe in (event_map or {}).keys()
            if str(timeframe).lower() in detail_limits
        }
        detail_timeframes = event_timeframes or ({"5m", "15m"} if deep_analysis else set())
        for timeframe in ("1m", "5m", "15m", "30m", "1h", "4h", "1d"):
            block = live.get(timeframe) if isinstance(live, dict) else {}
            if not isinstance(block, dict):
                continue
            bars = block.get("bars") or []
            browse_window = bars[-reading_targets["browse_target_bars"] :]
            stats_window = bars[-20:]
            frame_payload = {
                "summary": frame_summary_text(block),
                "bar_count_total": len(bars),
            }
            if timeframe in {"1m", "5m", "15m", "1h"}:
                frame_payload["ema20"] = block.get("ema20")
                frame_payload["atr14"] = block.get("atr14")
                frame_payload["price_vs_ema"] = block.get("price_vs_ema")
                frame_payload["browse_window_stats"] = compact_stats_for_prompt(recent_bar_stats(browse_window))
                frame_payload["close_read_window_stats"] = compact_stats_for_prompt(recent_bar_stats(stats_window))
            if bars and isinstance(bars[-1], dict):
                frame_payload["latest_bar"] = compact_bar_record(bars[-1])
            if deep_analysis and timeframe in detail_timeframes:
                close_window = bars[-detail_limits[timeframe] :]
                frame_payload["recent_bars"] = [compact_bar_record(bar) for bar in close_window if isinstance(bar, dict)]
            frames[timeframe] = frame_payload

        return {
            "symbol": symbol,
            "analysis_mode": "deep" if deep_analysis else "scan",
            "reading_targets": reading_targets,
            "cached_state": prompt_cached_state(cached),
            "live_timeframes": frames,
            "ab_context": self.prompt_ab_context(ab_context),
            "quick_scan": shrink_prompt_value(
                (ab_context.get("quick_scan") if isinstance(ab_context, dict) else {})
                or (event_map if isinstance(event_map, dict) else {})
            ),
        }

    def _recent_trade_context(self) -> dict[str, Any]:
        rows = self.latest_execution_log(limit=6)
        compact_rows: list[dict[str, Any]] = []
        for row in rows[:4]:
            if not isinstance(row, dict):
                continue
            compact_rows.append(
                {
                    "ts": row.get("ts") or row.get("executed_at") or row.get("time"),
                    "type": row.get("type"),
                    "symbol": row.get("symbol"),
                    "status": row.get("status"),
                    "message": truncate_text(row.get("message"), 180),
                }
            )
        return {"recent_execution_log": compact_rows}

    def execution_prompt_snapshot(self, execution: dict[str, Any]) -> dict[str, Any]:
        health = execution.get("health") if isinstance(execution.get("health"), dict) else {}
        can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
        bot_summary = execution.get("bot_summary") if isinstance(execution.get("bot_summary"), dict) else {}
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        orders = execution.get("orders") if isinstance(execution.get("orders"), list) else []
        config = bot_summary.get("config") if isinstance(bot_summary.get("config"), dict) else {}
        daily_pnl = bot_summary.get("daily_pnl") if isinstance(bot_summary.get("daily_pnl"), dict) else {}
        risk_status = bot_summary.get("risk_status") if isinstance(bot_summary.get("risk_status"), dict) else {}
        can_trade_ready = bool(can_trade.get("can_trade"))
        snapshot = {
            "health": {
                "status": health.get("status"),
                "exchange": health.get("exchange"),
                "mode": health.get("mode"),
                "trading_enabled": health.get("trading_enabled"),
            },
            "can_trade": {
                "can_trade": can_trade_ready,
                "reason": "OK" if can_trade_ready else can_trade.get("reason"),
            },
            "bot_summary": {
                "allocated_usdt": config.get("allocated_usdt"),
                "max_leverage": config.get("max_leverage"),
                "remaining_positions": bot_summary.get("remaining_positions"),
                "available_margin": bot_summary.get("available_margin"),
                "daily_pnl": daily_pnl,
                "risk_status": {
                    "correlation_exposure_pct": risk_status.get("correlation_exposure_pct"),
                },
            },
            "positions": [
                {
                    "symbol": item.get("symbol"),
                    "side": item.get("side"),
                    "quantity": item.get("quantity"),
                    "entry_price": item.get("entry_price"),
                    "mark_price": item.get("mark_price"),
                    "unrealized_pnl": item.get("unrealized_pnl"),
                    "bot_ids": item.get("bot_ids"),
                }
                for item in positions[:5]
                if isinstance(item, dict)
            ],
            "orders": [
                {
                    "symbol": item.get("symbol"),
                    "side": item.get("side"),
                    "order_type": item.get("order_type"),
                    "quantity": item.get("quantity"),
                    "price": item.get("price"),
                    "bot_id": item.get("bot_id"),
                }
                for item in orders[:5]
                if isinstance(item, dict)
            ],
        }
        return shrink_prompt_value(snapshot)

    def read_skill_text(self) -> str:
        full_skill_path = self.config.knowledge_root / "SKILL.md"
        if full_skill_path.exists():
            return full_skill_path.read_text(encoding="utf-8")
        return ""

    def read_reference_text(self, ref_name: str) -> str:
        for ref_dir in (
            self.config.knowledge_root / "canonical",
            self.config.knowledge_root / "references",
            self.config.knowledge_root / "references" / "quotes",
        ):
            path = ref_dir / ref_name
            if not path.exists() and "/" in ref_name:
                path = self.config.knowledge_root / "references" / ref_name
            if path.exists():
                return path.read_text(encoding="utf-8")
        return ""

    def parse_full_skill_sections(self) -> tuple[str, list[str], dict[str, str]]:
        full_skill_text = self.read_skill_text()
        matches = list(re.finditer(r"^(##+)\s+(.+)$", full_skill_text, flags=re.MULTILINE))
        if not matches:
            return full_skill_text.strip(), [], {}
        preamble = full_skill_text[: matches[0].start()].strip()
        order: list[str] = []
        blocks: dict[str, str] = {}
        for index, match in enumerate(matches):
            title = match.group(2).strip()
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(full_skill_text)
            blocks[title] = full_skill_text[start:end].strip()
            order.append(title)
        return preamble, order, blocks

    def select_skill_section_titles(
        self,
        runtime: dict[str, Any],
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
        ref_names: list[str],
    ) -> list[str]:
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        loop_seq = int(runtime.get("loop_seq") or 0)
        refs = set(ref_names)
        selected: list[str] = []

        def add(*titles: str) -> None:
            for title in titles:
                if title and title not in selected:
                    selected.append(title)

        add(
            "你是 Al Brooks",
            "操作铁律",
        )

        if phase_plan.get("full_refresh"):
            add(
                "Step 0: 首轮初始化",
                "Step 0b: 加载缓存",
                "Step 1: 获取全局数据 + Daily 偏置",
                "1a. 运行快照（每轮必做）",
                "1b. Daily 偏置（条件化）",
                "强制全刷新（Anti-Stale 机制）",
            )

        if positions:
            add(
                "Step 2: 持仓管理（有持仓时最优先）",
                "2a. 获取持仓品种 K 线（多周期）",
                "2a-1. 预计算持仓管理数据（ab_* 模块）",
                "2a-2. 图表与复盘快照",
                "2b. 加载知识 + 执行管理",
                "Step 5: 定时器（智能动态间隔）",
                "pre_signal 超时（按周期区分）",
            )
            return selected

        add(
            "Step 3: 扫描新机会（两阶段扫描）",
            "Phase A: Quick Scan（3 品种 × 3 周期，不读 S 文件）",
            "Step 5: 定时器（智能动态间隔）",
            "pre_signal 超时（按周期区分）",
            "强制全刷新（Anti-Stale 机制）",
        )

        if loop_seq % 6 == 0:
            add("4d. 周期汇报（每 6 轮一次）")

        if any(ref in refs for ref in {"S4-strategy-match.md", "S5-evaluation.md", "S6-common.md", "S6-bo.md", "S6-channel.md", "S6-tr.md", "S6-reversal.md"}):
            add(
                "Scalp 快速通道（不进 Phase B，< 30 秒决策）",
                "Phase B: 深分析（仅有事件的品种）",
                "3d. 快速放弃条件（详见 S5 评估 + S6-channel / S6-bo 入场）",
                "3d-2. PASS 分类 + 反恐惧硬检查",
                "3d-3. SL 打掉后重新入场",
                "3e. 自我验证（下单前必做，10 项全过）",
                "3f. 执行开仓与计划委托",
            )

        if any(ref in refs for ref in {"S0-daily-bias.md", "S1-reading.md", "S2-direction.md", "S3-market-state.md", "S3b-key-levels.md"}):
            add(
                "Step 1: 获取全局数据 + Daily 偏置",
                "1a. 运行快照（每轮必做）",
                "1b. Daily 偏置（条件化）",
            )

        return selected

    def build_skill_text(
        self,
        runtime: dict[str, Any],
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
        ref_names: list[str],
    ) -> tuple[str, dict[str, Any]]:
        preamble, order, blocks = self.parse_full_skill_sections()
        selected_titles = self.select_skill_section_titles(runtime, phase_plan, execution, ref_names)
        parts: list[str] = [preamble] if preamble else []
        loaded_titles: list[str] = []
        for title in order:
            if title in selected_titles and title in blocks:
                parts.append(blocks[title])
                loaded_titles.append(title)
        text = "\n\n".join(part for part in parts if part).strip()
        if not text:
            text = self.read_skill_text()
            return text, {"skill_mode": "full_file", "skill_sections": ["SKILL.md"]}
        return text, {"skill_mode": "full_sections", "skill_sections": loaded_titles}

    def load_knowledge_bundle(
        self,
        runtime: dict[str, Any],
        ref_names: list[str],
        phase_plan: dict[str, Any],
        execution: dict[str, Any],
    ) -> tuple[str, dict[str, str], dict[str, Any]]:
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        provider_name = str(self.config.decision_provider or "").strip().lower()
        budget_chars = 65000 if provider_name in {"openclaw", "openclaw_oauth", "llm_gateway", "llm"} else 100000
        if positions:
            budget_chars += 12000
        if phase_plan.get("full_refresh"):
            budget_chars += 8000

        skill_text, skill_meta = self.build_skill_text(runtime, phase_plan, execution, ref_names)
        skill_mode = str(skill_meta.get("skill_mode") or "full_sections")

        refs: dict[str, str] = {}
        ref_modes: dict[str, str] = {}
        for ref_name in ref_names:
            ref_text = self.read_reference_text(ref_name)
            if not ref_text:
                continue
            refs[ref_name] = ref_text
            ref_modes[ref_name] = "full"

        total_chars = len(skill_text) + sum(len(text) for text in refs.values())

        knowledge_meta = {
            "budget_chars": budget_chars,
            "knowledge_chars": total_chars,
            "over_budget": total_chars > budget_chars,
            "skill_mode": skill_mode,
            "skill_sections": skill_meta.get("skill_sections") or [],
            "reference_modes": ref_modes,
            "full_reference_count": len(ref_modes),
        }
        return skill_text, refs, knowledge_meta

    def prepare_prompt_context(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        trigger: dict[str, Any] | None,
        phase_plan: dict[str, Any],
    ) -> dict[str, Any]:
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        focus_symbols = [str(symbol).upper() for symbol in (phase_plan.get("focus_symbols") or []) if str(symbol).strip()]
        profile: dict[str, float] = {}

        def mark_stage(name: str, started_at: float) -> None:
            profile[name] = round((time.perf_counter() - started_at) * 1000, 2)

        stage_started = time.perf_counter()
        market_live: dict[str, Any] = {}
        if focus_symbols:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(focus_symbols))) as pool:
                future_map = {
                    symbol: pool.submit(self.fetch_symbol_market, symbol, include_context_frames=False)
                    for symbol in focus_symbols
                }
                for symbol, future in future_map.items():
                    try:
                        live = future.result()
                    except Exception as exc:
                        live = {"_error": str(exc)}
                    market_live[symbol] = live if isinstance(live, dict) else {}
        mark_stage("prepare_fetch_base_market_ms", stage_started)

        quick_scan_events: dict[str, Any] = {}
        stage_started = time.perf_counter()
        for symbol in focus_symbols:
            cached = symbol_cache.get(symbol, {})
            live = market_live.get(symbol, {})
            event_map = self.build_quick_scan_event_map(symbol, cached, live, trigger)
            if event_map:
                quick_scan_events[symbol] = event_map
        mark_stage("prepare_quick_scan_ms", stage_started)

        stage_started = time.perf_counter()
        deep_budget = 5 if phase_plan.get("full_refresh") else 3
        deep_budget += 1 if trigger and trigger.get("symbol") else 0
        deep_budget = min(len(focus_symbols), max(deep_budget, len(phase_plan.get("manage_symbols") or [])))
        ranked_deep_candidates = self.ranked_eventful_symbols(
            phase_plan,
            symbol_cache,
            quick_scan_events,
            limit=deep_budget,
            min_score=35,
        )

        deep_symbols: set[str] = set()
        deep_symbols.update(str(item).upper() for item in (phase_plan.get("manage_symbols") or []) if item)
        deep_symbols.update(ranked_deep_candidates)
        for symbol in focus_symbols:
            cached = symbol_cache.get(symbol, {})
            status = str(cached.get("status") or "").lower()
            if status in {"pre_signal", "entry_ready", "entry_ready_blocked", "in_trade", "manage"}:
                deep_symbols.add(symbol)
            if trigger and str(trigger.get("symbol") or "").upper() == symbol:
                deep_symbols.add(symbol)

        ab_context_by_symbol: dict[str, Any] = {symbol: {} for symbol in focus_symbols}
        deep_context_symbols = [symbol for symbol in focus_symbols if symbol in deep_symbols]
        if deep_context_symbols:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(deep_context_symbols) * 2)) as pool:
                live_futures = {
                    symbol: pool.submit(self.fetch_symbol_market, symbol, include_context_frames=True)
                    for symbol in deep_context_symbols
                }
                ab_futures = {
                    symbol: pool.submit(self.build_ab_context, symbol)
                    for symbol in deep_context_symbols
                }
                for symbol, future in live_futures.items():
                    try:
                        live = future.result()
                    except Exception as exc:
                        live = {"_error": str(exc)}
                    market_live[symbol] = live if isinstance(live, dict) else market_live.get(symbol, {})
                for symbol, future in ab_futures.items():
                    try:
                        ab_context = future.result()
                    except Exception as exc:
                        ab_context = {"_error": str(exc)}
                    ab_context_by_symbol[symbol] = ab_context if isinstance(ab_context, dict) else {}
        mark_stage("prepare_deep_context_ms", stage_started)

        analysis_board: dict[str, Any] = {}
        chart_symbols = [
            symbol
            for symbol in deep_context_symbols
            if self.should_build_chart_context(symbol, phase_plan, symbol_cache, quick_scan_events, trigger)
        ]
        chart_contexts: dict[str, Any] = {}
        stage_started = time.perf_counter()
        if chart_symbols:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(2, len(chart_symbols))) as pool:
                future_map = {
                    symbol: pool.submit(self.build_chart_context, symbol, market_live.get(symbol, {}))
                    for symbol in chart_symbols
                }
                for symbol, future in future_map.items():
                    try:
                        context = future.result()
                    except Exception as exc:
                        context = {"chart_note": f"图表上下文构建失败: {exc}"}
                    chart_contexts[symbol] = context if isinstance(context, dict) else {}
        mark_stage("prepare_chart_context_ms", stage_started)

        stage_started = time.perf_counter()
        for symbol in focus_symbols:
            live = market_live.get(symbol, {})
            event_map = quick_scan_events.get(symbol) if isinstance(quick_scan_events.get(symbol), dict) else {}
            board = self._symbol_prompt_context(
                symbol,
                live,
                symbol_cache.get(symbol, {}),
                ab_context_by_symbol.get(symbol, {}),
                deep_analysis=symbol in deep_symbols,
                event_map=event_map,
            )
            chart_context = chart_contexts.get(symbol) if isinstance(chart_contexts.get(symbol), dict) else {}
            if chart_context:
                board["chart_context"] = chart_context
            analysis_board[symbol] = board
        mark_stage("prepare_build_board_ms", stage_started)

        prepared = {
            "symbol_cache": symbol_cache,
            "market_live": market_live,
            "ab_context_by_symbol": ab_context_by_symbol,
            "quick_scan_events": quick_scan_events,
            "analysis_board": analysis_board,
            "profile": profile,
            "deep_symbols": list(deep_symbols),
            "chart_symbols": chart_symbols,
        }
        return prepared

    def prepare_rule_engine_context(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        trigger: dict[str, Any] | None,
        phase_plan: dict[str, Any],
    ) -> dict[str, Any]:
        """纯规则引擎路径的轻量上下文准备，避免无效深挖拖慢首轮 cycle。"""
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        focus_symbols = [str(symbol).upper() for symbol in (phase_plan.get("focus_symbols") or []) if str(symbol).strip()]
        profile: dict[str, float] = {}

        def mark_stage(name: str, started_at: float) -> None:
            profile[name] = round((time.perf_counter() - started_at) * 1000, 2)

        stage_started = time.perf_counter()
        market_live: dict[str, Any] = {}
        if focus_symbols:
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(focus_symbols))) as pool:
                future_map = {
                    symbol: pool.submit(self.fetch_symbol_market, symbol, include_context_frames=False)
                    for symbol in focus_symbols
                }
                for symbol, future in future_map.items():
                    try:
                        live = future.result()
                    except Exception as exc:
                        live = {"_error": str(exc)}
                    market_live[symbol] = live if isinstance(live, dict) else {}
        mark_stage("prepare_fetch_base_market_ms", stage_started)

        quick_scan_events: dict[str, Any] = {}
        stage_started = time.perf_counter()
        for symbol in focus_symbols:
            cached = symbol_cache.get(symbol, {})
            live = market_live.get(symbol, {})
            event_map = self.build_quick_scan_event_map(symbol, cached, live, trigger)
            if event_map:
                quick_scan_events[symbol] = event_map
        mark_stage("prepare_quick_scan_ms", stage_started)

        analysis_board: dict[str, Any] = {}
        ab_context_by_symbol: dict[str, Any] = {symbol: {} for symbol in focus_symbols}
        stage_started = time.perf_counter()
        for symbol in focus_symbols:
            live = market_live.get(symbol, {})
            event_map = quick_scan_events.get(symbol) if isinstance(quick_scan_events.get(symbol), dict) else {}
            analysis_board[symbol] = self._symbol_prompt_context(
                symbol,
                live,
                symbol_cache.get(symbol, {}),
                {},
                deep_analysis=False,
                event_map=event_map,
            )
        mark_stage("prepare_build_board_ms", stage_started)

        return {
            "symbol_cache": symbol_cache,
            "market_live": market_live,
            "ab_context_by_symbol": ab_context_by_symbol,
            "quick_scan_events": quick_scan_events,
            "analysis_board": analysis_board,
            "profile": profile,
            "deep_symbols": [],
            "chart_symbols": [],
        }

    def build_prompt_from_context(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        trigger: dict[str, Any] | None,
        phase_plan: dict[str, Any],
        prepared: dict[str, Any],
    ) -> tuple[str, str, list[str], dict[str, Any], dict[str, Any], dict[str, Any]]:
        symbol_cache = prepared["symbol_cache"]
        quick_scan_events = prepared["quick_scan_events"]
        analysis_board = prepared["analysis_board"]
        ab_context_by_symbol = prepared["ab_context_by_symbol"]

        ref_names = self.select_prompt_references(
            phase_plan,
            execution,
            symbol_cache,
            quick_scan_events,
            ab_context_by_symbol,
        )
        skill_text, refs, knowledge_meta = self.load_knowledge_bundle(runtime, ref_names, phase_plan, execution)

        system_parts = [
            "AB Patrol-Agent decision turn.",
            "",
            "Use the full Obsidian Al Brooks knowledge base through the canonical rulebook and the original patrol-l1 skill/S-files below as authority.",
            "Canonical rulebook files are the highest theory layer. SKILL.md is the routing/index layer. S-files are the executable playbooks. Q-files are short Al Brooks quote anchors used to correct hesitation, perfectionism, and entry/management bias.",
            "If they appear to conflict, prefer the canonical rulebook and explain the conflict explicitly in Chinese.",
            "Keep the original Al Brooks logic intact. Do not invent new trading rules.",
            "Al Brooks notes to honor explicitly: most reversals are some form of DT/DB test; MTR is often only a 40% winner and starts as a reversal probe until acceptance appears; bad wedges are not reversal setups; in channel reversals most traders should prefer stop orders while only excellent context justifies limit orders; scalp begins on the minor reversal, swing waits for clearer acceptance.",
            "Single cycle only. Do not sleep. Do not call tools.",
            "Return raw JSON only.",
            "All human-readable narrative fields in the JSON must be written in Simplified Chinese.",
            "analysis_board includes structured outputs from patrol_ab_context.py, patrol_scan.py, and chart_context generated from chart_gen.py + ab_ema / ab_sr / ab_mm / ab_patterns.",
            "Required JSON keys: phase, market_summary, focus_symbols, symbol_updates, actions, position_management, next_scan_seconds, next_scan_reason, state_patch, explanation.",
            "For each symbol_update, keep the original patrol memory useful: status, stage, thesis, daily_bias, ai_direction, market_state, market_state_detail, structure_summary, pre_signal, key_levels, entry_idea, planned_trade, evaluation, scenarios, trade, refs.",
            "Primary normalized action types: OPEN_ORDER, CLOSE_POSITION, MODIFY_STOP_LOSS, MODIFY_TAKE_PROFIT, PARTIAL_CLOSE, CANCEL_ALL_ORDERS, LOG_ONLY.",
            "You may also emit raw aliases when they better match S7 semantics: ADD_ON, SCALE_IN, PYRAMID_ADD, REENTER, TP1_REDUCE, TP2_REDUCE, TAKE_PROFIT_REDUCE, MOVE_STOP_TO_BREAKEVEN, BREAKEVEN_STOP, TRAIL_STOP, MOVE_TP, MOVE_TAKE_PROFIT, ADJUST_TP, CANCEL_PENDING_ENTRY.",
            "Agent decides style / P / R / playbook / next_scan_seconds suggestion. Runtime code only normalizes to original Step 5 buckets and execution-safe action schemas.",
            "For OPEN_ORDER and PARTIAL_CLOSE, make style explicit using Scalp / Swing / 逆势 / 反转试探 in entry_idea.style or trade.style.",
            "Use PARTIAL_CLOSE for TP1/TP2 reductions or forced de-risking, and CANCEL_ALL_ORDERS when stale pending entries should be removed before a new thesis.",
            "When S7 加仓条件成立，继续用 OPEN_ORDER，但在 action.intent 或 trade.intent 中明确写 ADD_ON / SCALE_IN；这是同方向新交易，不是修改旧单。加仓时必须显式给出 risk_percent，并保持总加仓风险不超过 1%。",
            "当 setup 已明确但价格尚未到位时，可以使用 OPEN_ORDER + LIMIT + price 预先挂委托；如果前提失效，必须配套 CANCEL_ALL_ORDERS 清理旧挂单。",
            "当 setup 还在等待价位触发时，请在 symbol_update.planned_trade 中明确写 entry_price 或 entry_zone，以及 stop_loss / take_profit / order_type / style，便于后续管理与复盘。",
            "Brooks 执行语义必须严格遵守：TR 边缘只在边缘 + 二次信号/清晰 signal bar 后升级为 LIMIT 可执行单；Broad Channel 逆势优先 LIMIT，顺势恢复/first pullback 完成 + 接受清晰时才允许 STOP_MARKET；第一次 wedge/MTR/DB/DT 只算反转试探，不要直接升级成 swing 可执行单。",
            "不要让 runtime 再发明额外过滤器；只依据 canonical rulebook + 原 skill / S 文件输出风格、前提、交易方程、执行动作和定时建议。",
            "升级期可能处于观察模式（dry_run=true）。即便当前不自动下单，也必须照常输出 planned_trade、candidate、executable 和管理动作，供回放与验收。",
            "If no real trade is executable this cycle, still emit one LOG_ONLY action per focus symbol with reason, refs, and bar_reading.",
            f"Knowledge loading: skill={knowledge_meta.get('skill_mode')} | refs full={knowledge_meta.get('full_reference_count')} | budget={knowledge_meta.get('budget_chars')} chars.",
            "",
            "# patrol-l1 Skill",
            skill_text,
            "",
            "# Selected References",
        ]
        for ref_name, ref_text in refs.items():
            system_parts.extend([f"## {ref_name}", ref_text, ""])
        system_text = "\n".join(system_parts).strip()

        user_payload = {
            "time_utc": utc_iso(),
            "trigger": trigger,
            "phase_plan": phase_plan,
            "runtime_state": {
                "current_phase": runtime.get("current_phase"),
                "last_cycle_id": runtime.get("last_cycle_id"),
                "last_full_refresh_at": runtime.get("last_full_refresh_at"),
                "trade_readiness": runtime.get("trade_readiness"),
                "best_candidate": runtime.get("best_candidate"),
                "focus_symbols": runtime.get("focus_symbols"),
                "pending_pre_signals": runtime.get("pending_pre_signals"),
                "open_positions": runtime.get("open_positions"),
            },
            "execution_snapshot": self.execution_prompt_snapshot(execution),
            "market_cache_meta": {
                "last_update": market_cache.get("last_update"),
                "last_full_refresh": market_cache.get("last_full_refresh"),
                "_meta": market_cache.get("_meta"),
            },
            "reading_targets": {
                "per_timeframe_bars_available": 150,
                "browse_structure_bars": 80,
                "close_read_bars": 20,
                "note": "遵守原 patrol-l1: 浏览80根 + 精读20根。不能只看几根K线就下判断。",
            },
            "knowledge_loading": knowledge_meta,
            "analysis_board": analysis_board,
            "quick_scan_events": quick_scan_events,
            "recent_trade_context": self._recent_trade_context(),
        }
        user_text = (
            "Use the runtime context below and return one raw JSON decision.\n\n"
            + compact_json(user_payload, limit=18000)
        )
        return system_text, user_text, ref_names, analysis_board, quick_scan_events, knowledge_meta

    def build_prompt(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        trigger: dict[str, Any] | None,
        phase_plan: dict[str, Any],
    ) -> tuple[str, str, list[str], dict[str, Any], dict[str, Any], dict[str, Any]]:
        prepared = self.prepare_prompt_context(runtime, market_cache, execution, trigger, phase_plan)
        return self.build_prompt_from_context(runtime, market_cache, execution, trigger, phase_plan, prepared)

    def scalp_fast_candidates(
        self,
        phase_plan: dict[str, Any],
        symbol_cache: dict[str, Any],
        quick_scan_events: dict[str, Any],
        ab_context_by_symbol: dict[str, Any],
    ) -> list[str]:
        candidates: list[tuple[int, str]] = []
        for symbol in phase_plan["focus_symbols"]:
            cached = symbol_cache.get(symbol, {}) if isinstance(symbol_cache.get(symbol), dict) else {}
            events = self.flatten_events(quick_scan_events.get(symbol))
            state = self.current_market_state(cached, ab_context_by_symbol.get(symbol, {}))
            signal_like = any(event.startswith(("signal_trigger:", "hl_signal:")) for event in events)
            scalp_like = any(
                event.startswith(("tr_edge:", "first_pb:", "state:BC", "state:SC"))
                or event in {"ema_touch", "wedge_or_mtr"}
                for event in events
            )
            if not signal_like and not scalp_like:
                continue
            score = self.event_score(symbol, phase_plan, symbol_cache, quick_scan_events)
            if signal_like:
                score += 40
            if str(state or "").upper() in {"TR", "TC", "BO"}:
                score += 10
            candidates.append((score, symbol))
        candidates.sort(key=lambda item: (-item[0], phase_plan["focus_symbols"].index(item[1])))
        return [symbol for _, symbol in candidates[:2]]

    def build_scalp_fast_prompt(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        trigger: dict[str, Any] | None,
        phase_plan: dict[str, Any],
        prepared: dict[str, Any],
        symbol: str,
    ) -> tuple[str, str, list[str], dict[str, Any], dict[str, Any], dict[str, Any]]:
        symbol_cache = prepared["symbol_cache"]
        quick_scan_events = prepared["quick_scan_events"]
        analysis_board = prepared["analysis_board"]
        ab_context_by_symbol = prepared["ab_context_by_symbol"]
        cached = symbol_cache.get(symbol, {}) if isinstance(symbol_cache.get(symbol), dict) else {}
        events = self.flatten_events(quick_scan_events.get(symbol))
        state = self.current_market_state(cached, ab_context_by_symbol.get(symbol, {}))
        ref_names = [
            ref
            for ref in self.symbol_reference_hints(
                status=str(cached.get("status") or ""),
                state=state,
                events=events,
                consecutive_watching=int(cached.get("consecutive_watching") or 0),
            )
            if ref not in {"S1-reading.md", "S7-management.md"}
        ]
        if "S3b-key-levels.md" not in ref_names:
            ref_names.insert(0, "S3b-key-levels.md")
        if "S5-evaluation.md" not in ref_names:
            ref_names.append("S5-evaluation.md")
        if "S6-common.md" not in ref_names:
            ref_names.append("S6-common.md")
        ref_names = ref_names[:5]

        fast_phase_plan = {
            **phase_plan,
            "phase": "SCALP_FAST",
            "summary": f"{symbol} 进入 Scalp 快速通道",
            "focus_symbols": [symbol],
        }
        skill_text, refs, knowledge_meta = self.load_knowledge_bundle(runtime, ref_names, fast_phase_plan, execution)
        system_parts = [
            "AB Patrol-Agent Scalp fast lane.",
            "",
            "Use the original patrol-l1 skill and selected S-files as authority.",
            "This is the original Scalp 快速通道: do not run full multi-symbol Phase B unless the setup is unclear.",
            "Apply the 3-item fast self-check only: direction aligned, SL on PA structure, P×R > (1-P).",
            "Remember the Al Brooks notes: scalp can begin on the minor reversal, but swing must wait for clearer acceptance; bad wedges are not reversal setups; most reversals are DT/DB style tests and only become swings after confirmation.",
            "If the fast lane passes, emit exactly one OPEN_ORDER action for this symbol.",
            "If it does not pass, emit exactly one LOG_ONLY action with reason starting [AUDIT] FAST_TRACK_SKIP or [PASS-WAIT].",
            "Return raw JSON only and write all human-readable fields in Simplified Chinese.",
            "",
            "# patrol-l1 Skill",
            skill_text,
            "",
            "# Selected References",
        ]
        for ref_name, ref_text in refs.items():
            system_parts.extend([f"## {ref_name}", ref_text, ""])
        system_text = "\n".join(system_parts).strip()
        user_payload = {
            "time_utc": utc_iso(),
            "trigger": trigger,
            "phase_plan": fast_phase_plan,
            "runtime_state": {
                "current_phase": runtime.get("current_phase"),
                "last_cycle_id": runtime.get("last_cycle_id"),
                "trade_readiness": runtime.get("trade_readiness"),
                "best_candidate": runtime.get("best_candidate"),
            },
            "execution_snapshot": self.execution_prompt_snapshot(execution),
            "market_cache_meta": {
                "last_update": market_cache.get("last_update"),
                "last_full_refresh": market_cache.get("last_full_refresh"),
            },
            "reading_targets": {
                "per_timeframe_bars_available": 150,
                "browse_structure_bars": 80,
                "close_read_bars": 20,
                "mode": "scalp_fast_lane",
            },
            "knowledge_loading": knowledge_meta,
            "analysis_board": {symbol: analysis_board.get(symbol)},
            "quick_scan_events": {symbol: quick_scan_events.get(symbol)},
            "recent_trade_context": self._recent_trade_context(),
        }
        user_text = (
            "Use the runtime context below and return one raw JSON decision for the single symbol fast lane.\n\n"
            + compact_json(user_payload, limit=12000)
        )
        return system_text, user_text, ref_names, {symbol: analysis_board.get(symbol)}, {symbol: quick_scan_events.get(symbol)}, knowledge_meta
