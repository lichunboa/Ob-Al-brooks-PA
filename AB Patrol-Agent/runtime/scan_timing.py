"""下一次扫描分桶逻辑。"""

from __future__ import annotations

from typing import Any

from utils import event_has_prefix, first_float, recent_continuation_momentum, safe_float


class ScanTimingMixin:
    """封装 Step 5 动态扫描分桶规则。"""

    def normalize_next_scan_plan(
        self,
        decision: dict[str, Any],
        execution: dict[str, Any],
        analysis_board: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        requested = max(30, int(safe_float(decision.get("next_scan_seconds"), 60)))
        state_patch = decision.get("state_patch") if isinstance(decision.get("state_patch"), dict) else {}
        model_timeout = bool(state_patch.get("model_timeout"))
        analysis_board = analysis_board or {}
        event_tags = [
            str(tag)
            for patch in symbol_updates.values()
            if isinstance(patch, dict)
            for tag in (patch.get("event_tags") or [])
        ]

        statuses = [str((patch or {}).get("status") or "").lower() for patch in symbol_updates.values() if isinstance(patch, dict)]
        candidate_stages = {
            str(
                (((patch or {}).get("planned_trade") or {}).get("candidate_stage")
                 or ((patch or {}).get("entry_idea") or {}).get("candidate_stage")
                 or "")
            ).strip().upper()
            for patch in symbol_updates.values()
            if isinstance(patch, dict)
        }
        execution_modes = {
            str(
                (((patch or {}).get("planned_trade") or {}).get("execution_mode")
                 or ((patch or {}).get("entry_idea") or {}).get("execution_mode")
                 or "")
            ).strip().upper()
            for patch in symbol_updates.values()
            if isinstance(patch, dict)
        }
        stage_families = {
            str((((patch or {}).get("brooks_filter") or {}).get("stage_family") or "")).strip().lower()
            for patch in symbol_updates.values()
            if isinstance(patch, dict) and isinstance(patch.get("brooks_filter"), dict)
        }
        brooks_categories = {
            str(((patch or {}).get("brooks_filter") or {}).get("category") or "")
            for patch in symbol_updates.values()
            if isinstance(patch, dict) and isinstance(patch.get("brooks_filter"), dict)
        }
        has_pre_signal = any(
            str((patch or {}).get("status") or "").lower() == "pre_signal"
            or str((patch or {}).get("pre_signal") or "").strip()
            for patch in symbol_updates.values()
            if isinstance(patch, dict)
        )
        stale_count = sum(
            1
            for patch in symbol_updates.values()
            if isinstance(patch, dict) and int(patch.get("consecutive_watching") or 0) >= 6
        )
        all_watching_three = bool(symbol_updates) and all(
            isinstance(patch, dict)
            and str(patch.get("status") or "").lower() == "watching"
            and int(patch.get("consecutive_watching") or 0) >= 3
            for patch in symbol_updates.values()
        )
        fresh_bc_sc = False
        tr_edge_active = any(tag.startswith("tr_edge:") for tag in event_tags)
        momentum_active = False
        executable_active = any(stage.startswith("EXECUTABLE_") for stage in candidate_stages)
        candidate_active = any(stage.startswith("CANDIDATE_") for stage in candidate_stages)
        countertrend_probe_active = "countertrend_probe" in stage_families
        broad_channel_stop_active = "broad_channel_trend_stop" in brooks_categories or "STOP_TRIGGER" in execution_modes
        breakout_followthrough_active = event_has_prefix(event_tags, ("state:BO", "state_change:", "first_pb:")) or broad_channel_stop_active
        position_symbols = {
            str(item.get("symbol") or "").upper()
            for item in positions
            if isinstance(item, dict) and item.get("symbol")
        }

        def numeric_prices(value: Any) -> list[float]:
            if isinstance(value, (int, float)):
                return [float(value)]
            if isinstance(value, list):
                prices: list[float] = []
                for item in value:
                    prices.extend(numeric_prices(item))
                return prices
            if isinstance(value, dict):
                prices: list[float] = []
                for item in value.values():
                    prices.extend(numeric_prices(item))
                return prices
            return []

        near_trigger = False
        position_volatility_high = False
        matched_conditions: list[str] = []

        def plan(
            seconds: int,
            reason_code: str,
            reason_text: str,
            bucket_rule: str,
            source_refs: list[str],
            *,
            priority: str,
            cadence_tier: str,
            conditions: list[str] | None = None,
        ) -> dict[str, Any]:
            target_seconds = 30 if int(seconds) <= 30 else 60
            target_label = "30 秒" if target_seconds == 30 else "1 分钟"
            normalized_reason = (
                str(reason_text)
                .replace("12 分钟", target_label)
                .replace("8 分钟", target_label)
                .replace("5 分钟", target_label)
                .replace("4 分钟", target_label)
                .replace("3 分钟", target_label)
                .replace("2 分钟", target_label)
            )
            normalized_bucket = (
                str(bucket_rule)
                .replace("12 分钟", target_label)
                .replace("8 分钟", target_label)
                .replace("5 分钟", target_label)
                .replace("4 分钟", target_label)
                .replace("3 分钟", target_label)
                .replace("2 分钟", target_label)
            )
            return {
                "requested_seconds": requested,
                "in_seconds": target_seconds,
                "reason_code": reason_code,
                "reason_text": normalized_reason,
                "bucket_rule": normalized_bucket,
                "bucket_source_refs": source_refs,
                "bucket_priority": priority,
                "cadence_tier": "30秒高频巡逻" if target_seconds == 30 else "分钟级实时巡逻",
                "matched_conditions": conditions or [],
            }

        for symbol, patch in symbol_updates.items():
            if not isinstance(patch, dict):
                continue
            board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            live_frames = board.get("live_timeframes") if isinstance(board.get("live_timeframes"), dict) else {}
            live_5m = live_frames.get("5m") if isinstance(live_frames.get("5m"), dict) else {}
            latest_bar = live_5m.get("latest_bar") if isinstance(live_5m, dict) else {}
            recent_bars = live_5m.get("recent_bars") if isinstance(live_5m, dict) else []
            atr14 = safe_float(live_5m.get("atr14"), 0.0) if isinstance(live_5m, dict) else 0.0
            close_price = safe_float((latest_bar or {}).get("C"), 0.0) if isinstance(latest_bar, dict) else 0.0
            pre_signal = patch.get("pre_signal") if isinstance(patch.get("pre_signal"), dict) else {}
            trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal, dict) else None
            if atr14 > 0 and close_price > 0 and any(abs(close_price - price) < 0.3 * atr14 for price in numeric_prices(trigger_price)):
                near_trigger = True
                matched_conditions.append(f"{symbol}:pre_signal_close")
            ab_context = board.get("ab_context") if isinstance(board.get("ab_context"), dict) else {}
            frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
            frame_5m = frames.get("5m") if isinstance(frames.get("5m"), dict) else {}
            frame_15m = frames.get("15m") if isinstance(frames.get("15m"), dict) else {}
            state_upper = str(patch.get("market_state") or frame_5m.get("state") or "").upper()
            if event_has_prefix(list(patch.get("event_tags") or []), ("state_change:",)) and any(
                str(tag).endswith(("->BC", "->SC")) for tag in (patch.get("event_tags") or [])
            ):
                fresh_bc_sc = True
                matched_conditions.append(f"{symbol}:fresh_bc_sc")
            else:
                for frame in (frame_5m, frame_15m):
                    ab_patterns = frame.get("ab_patterns") if isinstance(frame.get("ab_patterns"), dict) else {}
                    latest_h = first_float(ab_patterns.get("latest_h_bars_ago"), None)
                    latest_l = first_float(ab_patterns.get("latest_l_bars_ago"), None)
                    recent_marker = min(
                        latest_h if latest_h is not None else 999.0,
                        latest_l if latest_l is not None else 999.0,
                    )
                    if state_upper in {"BC", "SC"} and recent_marker <= 10:
                        fresh_bc_sc = True
                        matched_conditions.append(f"{symbol}:fresh_bc_sc")
                        break
            if recent_continuation_momentum(recent_bars):
                momentum_active = True
                matched_conditions.append(f"{symbol}:momentum_active")
            if str(symbol).upper() in position_symbols and isinstance(recent_bars, list) and len(recent_bars) >= 3:
                latest_ranges = [
                    abs(safe_float(item.get("H")) - safe_float(item.get("L")))
                    for item in recent_bars[-3:]
                    if isinstance(item, dict)
                ]
                avg_range = safe_float(((live_5m.get("browse_window_stats") or {}).get("avg_range")), 0.0)
                if avg_range > 0 and latest_ranges and max(latest_ranges) > avg_range * 2:
                    position_volatility_high = True
                    matched_conditions.append(f"{symbol}:position_high_volatility")

        if stale_count > 3:
            matched_conditions.append(f"stale_count>{3}")
        if all_watching_three:
            matched_conditions.append("all_watching_three")
        if "tr_middle_no_edge" in brooks_categories:
            matched_conditions.append("tr_middle_no_edge")

        if model_timeout:
            if near_trigger or position_volatility_high:
                return plan(
                    30,
                    "MODEL_TIMEOUT_NEAR_TRIGGER",
                    "模型建议未返回，但当前预信号非常接近或持仓波动偏高，压到 30 秒快扫。",
                    "P0：pre_signal 触发接近 / 有持仓 + 波动大 → 30 秒",
                    ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S6-tr.md", "S7-management.md"],
                    priority="P0",
                    cadence_tier="高频守候",
                    conditions=matched_conditions,
                )
            if fresh_bc_sc or tr_edge_active or executable_active or breakout_followthrough_active:
                active_conditions = [*matched_conditions]
                if tr_edge_active:
                    active_conditions.append("tr_edge_active")
                if executable_active:
                    active_conditions.append("executable_active")
                if breakout_followthrough_active:
                    active_conditions.append("breakout_followthrough_active")
                return plan(
                    30,
                    "MODEL_TIMEOUT_HIGH_EDGE_ACTIVE",
                    "模型建议未返回，但当前处于 fresh BC/SC、TR 边缘或已接近可执行条件，按 30 秒继续守候。",
                    "P1：fresh BC/SC / TR edge / breakout follow-through / executable 候选 → 30 秒",
                    ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S4-strategy-match.md", "S6-tr.md", "S6-channel.md", "S6-common.md"],
                    priority="P1",
                    cadence_tier="高频守候",
                    conditions=active_conditions,
                )
            if momentum_active:
                return plan(
                    180,
                    "MODEL_TIMEOUT_MOMENTUM_ACTIVE",
                    "模型建议未返回，但动量事件仍活跃，保留 3 分钟继续确认 follow-through。",
                    "P1：momentum 3+ bars 活跃 → 3 分钟",
                    ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S1-reading.md", "S6-common.md"],
                    priority="P1",
                    cadence_tier="高频守候",
                    conditions=matched_conditions,
                )
            if positions or has_pre_signal or candidate_active or countertrend_probe_active or "tbtl_incomplete" in brooks_categories:
                active_conditions = [*matched_conditions]
                if candidate_active:
                    active_conditions.append("candidate_active")
                if countertrend_probe_active:
                    active_conditions.append("countertrend_probe_active")
                if "tbtl_incomplete" in brooks_categories:
                    active_conditions.append("tbtl_incomplete")
                return plan(
                    240,
                    "MODEL_TIMEOUT_ACTIVE_CONTEXT",
                    "模型建议未返回，但仍有持仓、预信号、候选单或反转试探未完成，按 4 分钟保守复扫。",
                    "P2：有持仓 / 有 pre_signal / 候选单 / 反转试探未完成 → 4 分钟",
                    ["SKILL.md#Step 2", "SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S4-strategy-match.md", "S6-reversal.md", "S7-management.md"],
                    priority="P2",
                    cadence_tier="常规巡逻",
                    conditions=active_conditions,
                )
            if stale_count > 3:
                return plan(
                    300,
                    "MODEL_TIMEOUT_STALE_ROTATION",
                    "模型建议未返回，且多个品种长期观察未升级，按 5 分钟做防懒惰轮换。",
                    "P3：stale 品种 > 3 → 5 分钟",
                    ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "防懒惰机制", "Q3-fear.md"],
                    priority="P3",
                    cadence_tier="常规巡逻",
                    conditions=matched_conditions,
                )
            if all_watching_three:
                return plan(
                    720,
                    "MODEL_TIMEOUT_ALL_WATCHING",
                    "模型建议未返回，且所有品种已连续多轮仅观察，拉长到 12 分钟避免过扫。",
                    "P5：all watching >= 3 轮 → 12 分钟",
                    ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "防懒惰机制"],
                    priority="P5",
                    cadence_tier="放慢节奏",
                    conditions=matched_conditions,
                )
            return plan(
                480,
                "MODEL_TIMEOUT_DEFAULT",
                "模型建议未返回，也没有临近触发或持仓管理压力，回到 8 分钟默认巡逻。",
                "P4：无持仓 + 无 pre_signal + 正常市场 → 8 分钟",
                ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md"],
                priority="P4",
                cadence_tier="常规巡逻",
                conditions=matched_conditions,
            )

        if near_trigger or position_volatility_high:
            return plan(
                30,
                "EDGE_OR_TRIGGER_ACTIVE",
                "当前预信号已接近触发或持仓波动偏高，压到 30 秒快扫。",
                "P0：pre_signal 触发接近 / 有持仓 + 波动大 → 30 秒",
                ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S6-tr.md", "S7-management.md"],
                priority="P0",
                cadence_tier="高频守候",
                conditions=matched_conditions,
            )
        if fresh_bc_sc or tr_edge_active or executable_active or breakout_followthrough_active:
            active_conditions = [*matched_conditions]
            if tr_edge_active:
                active_conditions.append("tr_edge_active")
            if executable_active:
                active_conditions.append("executable_active")
            if breakout_followthrough_active:
                active_conditions.append("breakout_followthrough_active")
            return plan(
                30,
                "HIGH_EDGE_ACTIVE",
                "当前处于 fresh BC/SC、TR 边缘、breakout follow-through 或已接近可执行条件，按 30 秒继续守候。",
                "P1：fresh BC/SC / TR edge / breakout follow-through / executable 候选 → 30 秒",
                ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S4-strategy-match.md", "S6-tr.md", "S6-channel.md", "S6-common.md"],
                priority="P1",
                cadence_tier="高频守候",
                conditions=active_conditions,
            )
        if momentum_active:
            return plan(
                180,
                "MOMENTUM_ACTIVE",
                "当前仍有连续动量事件，按 3 分钟继续确认是否形成 follow-through。",
                "P1：momentum 3+ bars 活跃 → 3 分钟",
                ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S1-reading.md", "S6-common.md"],
                priority="P1",
                cadence_tier="高频守候",
                conditions=matched_conditions,
            )
        if positions or has_pre_signal or candidate_active or countertrend_probe_active or "tbtl_incomplete" in brooks_categories:
            active_conditions = [*matched_conditions]
            if candidate_active:
                active_conditions.append("candidate_active")
            if countertrend_probe_active:
                active_conditions.append("countertrend_probe_active")
            if "tbtl_incomplete" in brooks_categories:
                active_conditions.append("tbtl_incomplete")
            return plan(
                240,
                "ACTIVE_CONTEXT",
                "当前有持仓、预信号、候选单或反转试探未完成，按 4 分钟继续跟踪。",
                "P2：有持仓 / 有 pre_signal / 候选单 / 反转试探未完成 → 4 分钟",
                ["SKILL.md#Step 2", "SKILL.md#Step 4", "SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S4-strategy-match.md", "S6-reversal.md", "S7-management.md"],
                priority="P2",
                cadence_tier="常规巡逻",
                conditions=active_conditions,
            )
        if stale_count > 3:
            return plan(
                300,
                "STALE_ROTATION",
                "多个品种长期观察未升级，进入防懒惰轮换，按 5 分钟刷新。",
                "P3：stale 品种 > 3 → 5 分钟",
                ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "防懒惰机制"],
                priority="P3",
                cadence_tier="常规巡逻",
                conditions=matched_conditions,
            )
        if all_watching_three:
            return plan(
                720,
                "ALL_WATCHING_THREE",
                "所有品种连续多轮只在观察，没有边缘优势，拉长到 12 分钟。",
                "P5：all watching >= 3 轮 → 12 分钟",
                ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "防懒惰机制"],
                priority="P5",
                cadence_tier="放慢节奏",
                conditions=matched_conditions,
            )
        if "tr_middle_no_edge" in brooks_categories or (not positions and not has_pre_signal):
            return plan(
                480,
                "DEFAULT_SCAN",
                "当前无持仓、无预信号、无明显边缘事件，维持 8 分钟默认巡逻。",
                "P4：无持仓 + 无 pre_signal + 正常市场 → 8 分钟",
                ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md", "S6-tr.md"],
                priority="P4",
                cadence_tier="常规巡逻",
                conditions=matched_conditions,
            )

        buckets = [60]
        for bucket in buckets:
            if requested <= bucket:
                return plan(
                    bucket,
                    "MODEL_REQUEST_BUCKET",
                    f"模型建议 {requested} 秒，系统按 Step 5 收敛到 {bucket} 秒执行桶。",
                    "模型建议时间收敛到 2/3/4/5/8/12 分钟执行桶",
                    ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md"],
                    priority="MODEL",
                    cadence_tier="模型建议",
                    conditions=matched_conditions,
                )
        return plan(
            720,
            "MODEL_REQUEST_BUCKET_MAX",
            f"模型建议 {requested} 秒，系统按最大执行桶收敛到 12 分钟。",
            "模型建议时间收敛到最大执行桶 12 分钟",
            ["SKILL.md#Step 5", "C5-step5-dynamic-timing.md"],
            priority="MODEL",
            cadence_tier="模型建议",
            conditions=matched_conditions,
        )
