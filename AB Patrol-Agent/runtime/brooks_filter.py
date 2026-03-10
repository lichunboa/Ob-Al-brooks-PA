"""Brooks 分类与候选单过滤。"""

from __future__ import annotations

from typing import Any

from utils import (
    build_execution_semantics,
    canonical_action_type,
    cap_status,
    combine_brooks_text,
    derive_trade_execution_semantics,
    event_has_exact,
    event_has_prefix,
    first_float,
    has_first_entry_signal,
    has_second_entry_signal,
    has_trade_plan,
    infer_order_type_from_refs,
    infer_trade_style_from_refs,
    normalize_refs,
    order_type_cn,
    structured_trade_semantics,
)


class BrooksFilterMixin:
    """提供 Brooks 语义过滤和动作修正。"""

    def flatten_events(self, event_map: dict[str, Any] | None) -> list[str]:
        if not isinstance(event_map, dict):
            return []
        flattened: list[str] = []
        for _, events in event_map.items():
            if isinstance(events, list):
                flattened.extend(str(item) for item in events if str(item).strip())
        return flattened

    def current_market_state(self, cached: dict[str, Any], ab_context: dict[str, Any]) -> str:
        frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
        for timeframe in ("5m", "15m", "1h", "30m", "4h"):
            frame = frames.get(timeframe)
            if isinstance(frame, dict) and frame.get("state"):
                return str(frame.get("state"))
        return str(cached.get("market_state") or "")

    def classify_brooks_filter(self, base: dict[str, Any], events: list[str]) -> dict[str, Any]:
        state_upper = str(base.get("market_state") or "").strip().upper()
        refs = normalize_refs(base.get("refs"))
        structured = structured_trade_semantics(base)
        explicit_style = str(
            (base.get("entry_idea") or {}).get("style")
            or (base.get("planned_trade") or {}).get("style")
            or (base.get("trade") or {}).get("style")
            or ""
        ).strip()
        inferred_style = infer_trade_style_from_refs(
            market_state=state_upper,
            refs=refs,
            explicit_style=explicit_style or structured.get("style", ""),
            intent=structured.get("execution_mode", ""),
        )
        combined = combine_brooks_text(
            structured.get("regime"),
            structured.get("execution_decision"),
            structured.get("candidate_stage"),
            structured.get("execution_mode"),
            structured.get("upgrade_condition"),
            base.get("market_state_detail"),
            base.get("structure_summary"),
            base.get("thesis"),
            base.get("running_narrative"),
            base.get("pre_signal"),
            base.get("planned_trade"),
            base.get("trade"),
            base.get("evaluation"),
            events,
        )
        has_signal_trigger = event_has_prefix(events, ("signal_trigger:", "hl_signal:", "trigger:"))
        has_second_signal = has_second_entry_signal(events)
        has_first_signal = has_first_entry_signal(events)
        has_tr_edge = event_has_prefix(events, ("tr_edge:",))
        strong_breakout = state_upper in {"BO", "TC", "BC"} or any(
            token in combined for token in ("ais", "aib", "always in", "强突破", "紧通道", "宽通道")
        )
        limit_order_environment = state_upper == "TR" or any(
            token in combined for token in ("交易区间", "limit order", "限价单", "blsh", "buy low sell high", "上三分之一", "下三分之一")
        )
        failed_breakout_context = any(
            token in combined for token in ("失败突破", "failed breakout", "双底下方失败突破", "双顶上方失败突破")
        )
        reversal_clues = event_has_exact(events, {"wedge_or_mtr", "momentum_fading", "climax_suspected"}) or event_has_prefix(
            events,
            ("hl_signal:H",),
        ) or any(token in combined for token in ("双底", "双顶", "楔形", "mtr", "wedge", "reversal", "反转", "试探"))
        broad_channel_like = state_upper == "BC" or any(
            token in combined for token in ("宽幅多头通道", "宽幅空头通道", "broad channel", "宽通道")
        )
        acceptance_clues = (
            event_has_prefix(events, ("state:BO", "state:BC", "state:TC", "state_change:"))
            or failed_breakout_context
            or structured.get("candidate_stage") in {"EXECUTABLE_LIMIT", "EXECUTABLE_STOP", "EXECUTABLE_MARKET"}
            or structured.get("execution_mode") in {"STOP_TRIGGER", "MARKET_IMMEDIATE"}
            or "可继续执行链" in structured.get("execution_decision", "")
            or any(
                token in combined
                for token in ("接受", "站上", "站回", "跟进", "follow-through", "acceptance", "higher low", "lower high")
            )
        )
        continuation_clues = (
            event_has_prefix(events, ("first_pb:",))
            or event_has_exact(events, {"ema_touch", "cached_pre_signal"})
            or structured.get("execution_mode") == "STOP_TRIGGER"
            or structured.get("candidate_stage") in {"CANDIDATE_STOP", "EXECUTABLE_STOP"}
        )
        tbtl_incomplete = any(token in combined for token in ("tbtl", "two legs", "十条腿", "两波"))
        if not tbtl_incomplete and reversal_clues and not has_signal_trigger:
            tbtl_incomplete = any(token in combined for token in ("双底", "双顶", "楔形", "mtr", "wedge"))
        has_plan = has_trade_plan(base)
        scalp_style = any(token in inferred_style for token in ("Scalp", "逆势", "反转试探"))
        preferred_order_type = infer_order_type_from_refs(
            market_state=state_upper,
            refs=refs,
            explicit_order_type=str((base.get("planned_trade") or {}).get("order_type") or structured.get("order_type") or ""),
            intent=structured.get("execution_mode", ""),
            has_price=has_plan,
        )
        if structured.get("candidate_stage") in {"CANDIDATE_LIMIT", "EXECUTABLE_LIMIT"} and preferred_order_type == "MARKET":
            preferred_order_type = "LIMIT"
        if structured.get("candidate_stage") in {"CANDIDATE_STOP", "EXECUTABLE_STOP"} and preferred_order_type == "MARKET":
            preferred_order_type = "STOP_MARKET"

        if limit_order_environment and not has_tr_edge and not has_signal_trigger:
            return {
                "category": "tr_middle_no_edge",
                "label": "交易区间中部无优势",
                "summary": "交易区间中部没有边缘优势，只保留观察，不升级候选单。",
                "max_status": "watching",
                "allow_executable": False,
                "stage_family": "watch_only",
                "preferred_style": inferred_style or "Scalp",
                "preferred_order_type": "LIMIT",
                "upgrade_condition": "先回到交易区间上/下三分之一边缘，再等信号。",
                "brooks_rule": "TR 以低买高卖 BLSHS 为主，中部位置通常没有优势。",
                "source_refs": ["S4-strategy-match.md", "S6-tr.md", "S5-evaluation.md"],
            }

        if strong_breakout and reversal_clues and not has_second_signal:
            return {
                "category": "strong_breakout_countertrend",
                "label": "强突破环境下逆势不做",
                "summary": "强突破背景里的第一次反转通常先按反转试探处理，不直接当 swing 可执行单。",
                "max_status": "pre_signal" if not has_plan else "entry_ready_blocked",
                "allow_executable": False,
                "stage_family": "countertrend_probe",
                "preferred_style": "反转试探",
                "preferred_order_type": "STOP_MARKET" if has_signal_trigger else preferred_order_type,
                "upgrade_condition": "至少等 H2/L2 或 HL/LH MTR，再看到明确接受，才考虑升级。",
                "brooks_rule": "强突破里多数反转先失败；第一次反转常只是小反转或 scalp。",
                "source_refs": ["S4-strategy-match.md", "S6-reversal.md", "S5-evaluation.md"],
            }

        if tbtl_incomplete:
            return {
                "category": "tbtl_incomplete",
                "label": "TBTL 反转未完成",
                "summary": "两波/TBTL 反转还没完成，先留在预信号观察，不直接升级执行。",
                "max_status": "pre_signal",
                "allow_executable": False,
                "stage_family": "wait_acceptance",
                "preferred_style": "反转试探",
                "preferred_order_type": preferred_order_type,
                "upgrade_condition": "等第二腿或二次入场信号完成后，再看是否升级。",
                "brooks_rule": "TBTL / two legs 未完成前，反转通常还不成熟。",
                "source_refs": ["S4-strategy-match.md", "S6-reversal.md"],
            }

        if reversal_clues and not has_second_signal:
            return {
                "category": "forty_percent_reversal_scalp_only",
                "label": "40%反转仅够 scalp",
                "summary": "当前反转更像 40% 级别的第一次反转，只适合试探或 scalp 观察，暂不作为 swing 可执行单。",
                "max_status": "pre_signal" if not has_plan else "entry_ready_blocked",
                "allow_executable": False,
                "stage_family": "countertrend_probe",
                "preferred_style": inferred_style if scalp_style else "反转试探",
                "preferred_order_type": "LIMIT" if limit_order_environment else "STOP_MARKET",
                "upgrade_condition": "等 H2/L2、HL/LH MTR 或失败突破后的接受，再升级。",
                "brooks_rule": "大多数 MTR 只有约 40% 概率走出 2R 以上波段；第一次反转通常先小。",
                "source_refs": ["S4-strategy-match.md", "S5-evaluation.md", "S6-reversal.md"],
            }

        if broad_channel_like and reversal_clues:
            return {
                "category": "broad_channel_countertrend_limit",
                "label": "宽通道逆势先限价",
                "summary": "宽通道更接近交易区间，逆势反转优先在边缘做 limit scalp，不直接追价做 swing。",
                "max_status": "entry_ready" if (has_plan and has_tr_edge and has_second_signal) else "pre_signal",
                "allow_executable": bool(has_plan and has_tr_edge and has_second_signal),
                "stage_family": "limit_edge",
                "preferred_style": "反转试探" if not has_second_signal else inferred_style or "Scalp",
                "preferred_order_type": "LIMIT",
                "upgrade_condition": "先等到边缘，再等二次信号；没有二次信号就只保留试探/观察。",
                "brooks_rule": "Broad Channel 本质更像 TR：scalp more、swing less、use limit orders。",
                "source_refs": ["S4-strategy-match.md", "S6-channel.md", "S5-evaluation.md"],
            }

        if broad_channel_like and continuation_clues:
            return {
                "category": "broad_channel_trend_stop",
                "label": "宽通道顺势用 stop",
                "summary": "宽通道里的顺势恢复可以继续做，但更像通道恢复而不是纯趋势追价，优先等 stop trigger。",
                "max_status": "entry_ready"
                if (has_plan and continuation_clues and acceptance_clues and (has_signal_trigger or has_first_signal or has_second_signal))
                else "pre_signal",
                "allow_executable": bool(
                    has_plan and continuation_clues and acceptance_clues and (has_signal_trigger or has_first_signal or has_second_signal)
                ),
                "stage_family": "stop_continuation",
                "preferred_style": inferred_style or "Swing",
                "preferred_order_type": "STOP_MARKET",
                "upgrade_condition": "先有顺势恢复/first pullback 完成，再看到接受或触发信号；没有恢复信号时不追 stop。",
                "brooks_rule": "Broad Channel 更像 TR：逆势多用 limit，顺势只有在恢复信号和接受都清晰时才用 stop。",
                "source_refs": ["S4-strategy-match.md", "S6-channel.md", "S5-evaluation.md"],
            }

        if limit_order_environment and has_tr_edge:
            if not has_second_signal and not has_signal_trigger:
                return {
                    "category": "tr_edge_limit_wait_second_signal",
                    "label": "TR 边缘先等二次信号",
                    "summary": "交易区间边缘虽然有位置优势，但只有第一次信号或背景不够清晰时，应先等二次信号，再把限价单升级为可执行单。",
                    "max_status": "pre_signal",
                    "allow_executable": False,
                    "stage_family": "wait_acceptance",
                    "preferred_style": inferred_style or "Scalp",
                    "preferred_order_type": "LIMIT",
                    "upgrade_condition": "等 H2/L2、二次失败或明确 signal bar，再从预信号升级成候选单。"
                    if has_first_signal
                    else "先等边缘出现明确 signal bar，再看是否形成二次入场。",
                    "brooks_rule": "TR 低买高卖主要靠边缘和二次入场；背景不清晰时要等第二次信号。",
                    "source_refs": ["S4-strategy-match.md", "S6-tr.md", "S5-evaluation.md"],
                }
            return {
                "category": "tr_edge_limit_only",
                "label": "TR 边缘限价单环境",
                "summary": "当前属于 TR 上/下三分之一边缘，候选单可以存在，但应优先按计划委托/限价处理。",
                "max_status": "entry_ready" if ((has_second_signal or has_signal_trigger) and has_plan) else "pre_signal",
                "allow_executable": bool((has_second_signal or has_signal_trigger) and has_plan),
                "stage_family": "limit_edge",
                "preferred_style": inferred_style or "Scalp",
                "preferred_order_type": "LIMIT",
                "upgrade_condition": "边缘 + 二次信号/清晰 signal bar 同时出现时，才升级成可执行限价单。",
                "brooks_rule": "TR 做法是 Buy Low Sell High，优先在上/下三分之一边缘用限价单处理。",
                "source_refs": ["S4-strategy-match.md", "S6-tr.md", "S5-evaluation.md"],
            }

        if has_signal_trigger or event_has_prefix(events, ("first_pb:", "pb_depth:")):
            return {
                "category": "trend_continuation_candidate",
                "label": "顺势候选",
                "summary": "当前属于顺势候选，允许继续走 candidate -> executable 的标准链路。",
                "max_status": "entry_ready" if has_plan else str(base.get("status") or "pre_signal"),
                "allow_executable": True,
                "stage_family": "normal_candidate",
                "preferred_style": inferred_style,
                "preferred_order_type": preferred_order_type,
                "upgrade_condition": "保持继续接受、触发价有效、结构未失效时，继续向可执行单推进。",
                "brooks_rule": "趋势恢复/first pullback 更适合 stop 触发，而不是在中间乱猜反转。",
                "source_refs": ["S4-strategy-match.md", "S6-common.md", "S5-evaluation.md"],
            }

        return {
            "category": "watch_only",
            "label": "继续观察",
            "summary": "当前结构还不足以升级为候选单，继续观察并等待新证据。",
            "max_status": "watching" if not has_plan else str(base.get("status") or "watching"),
            "allow_executable": False,
            "stage_family": "watch_only",
            "preferred_style": inferred_style or "Scalp",
            "preferred_order_type": preferred_order_type,
            "upgrade_condition": "等待新的边缘、二次信号或接受证据出现。",
            "brooks_rule": "没有位置优势或没有信号完成时，最好的交易通常是等待。",
            "source_refs": ["S4-strategy-match.md", "S6-common.md"],
        }

    def apply_brooks_filter_to_patch(self, base: dict[str, Any], events: list[str]) -> dict[str, Any]:
        filter_meta = self.classify_brooks_filter(base, events)
        base["brooks_filter"] = filter_meta
        current_status = str(base.get("status") or "watching")
        base["status"] = cap_status(current_status, str(filter_meta.get("max_status") or current_status))

        entry_idea = base.get("entry_idea") if isinstance(base.get("entry_idea"), dict) else {}
        if filter_meta.get("preferred_style"):
            entry_idea["style"] = filter_meta["preferred_style"]
        if filter_meta.get("summary"):
            entry_idea.setdefault("filter_summary", filter_meta["summary"])
        base["entry_idea"] = entry_idea

        planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
        if planned_trade:
            if filter_meta.get("preferred_style"):
                planned_trade["style"] = filter_meta["preferred_style"]
            if filter_meta.get("preferred_order_type"):
                planned_trade["order_type"] = filter_meta["preferred_order_type"]
            planned_trade.setdefault("why_wait", filter_meta.get("summary"))
        semantics = derive_trade_execution_semantics(
            {**base, "planned_trade": planned_trade},
            filter_meta,
        )
        if planned_trade or semantics["candidate_stage"] != "WATCH":
            planned_trade["candidate_stage"] = semantics["candidate_stage"]
            planned_trade["candidate_stage_cn"] = semantics["candidate_stage_cn"]
            planned_trade["execution_mode"] = semantics["execution_mode"]
            planned_trade["execution_mode_cn"] = semantics["execution_mode_cn"]
            planned_trade["allow_executable"] = semantics["allow_executable"]
            planned_trade["needs_exact_trigger"] = semantics["needs_exact_trigger"]
            planned_trade["brooks_label"] = filter_meta.get("label")
            planned_trade["upgrade_condition"] = filter_meta.get("upgrade_condition")
            planned_trade["brooks_rule"] = filter_meta.get("brooks_rule")
            planned_trade["source_refs"] = normalize_refs(filter_meta.get("source_refs"))
            planned_trade["order_type_cn"] = order_type_cn(str(planned_trade.get("order_type") or ""))
            planned_trade["execution_semantics"] = build_execution_semantics(planned_trade, filter_meta, semantics)
            base["planned_trade"] = planned_trade

        evaluation = base.get("evaluation") if isinstance(base.get("evaluation"), dict) else {}
        evaluation["regime"] = filter_meta.get("label")
        evaluation["execution_decision"] = "可继续执行链" if filter_meta.get("allow_executable") else "继续观察/等待"
        evaluation["risk"] = filter_meta.get("summary")
        evaluation["candidate_stage"] = semantics["candidate_stage_cn"]
        evaluation["execution_mode"] = semantics["execution_mode_cn"]
        evaluation["brooks_rule"] = filter_meta.get("brooks_rule")
        evaluation["source_refs"] = normalize_refs(filter_meta.get("source_refs"))
        base["evaluation"] = evaluation

        entry_idea["candidate_stage"] = semantics["candidate_stage"]
        entry_idea["candidate_stage_cn"] = semantics["candidate_stage_cn"]
        entry_idea["execution_mode"] = semantics["execution_mode"]
        entry_idea["execution_mode_cn"] = semantics["execution_mode_cn"]
        entry_idea["upgrade_condition"] = filter_meta.get("upgrade_condition")
        entry_idea["brooks_rule"] = filter_meta.get("brooks_rule")
        entry_idea["source_refs"] = normalize_refs(filter_meta.get("source_refs"))
        base["entry_idea"] = entry_idea

        scenarios = base.get("scenarios") if isinstance(base.get("scenarios"), list) else []
        summary = str(filter_meta.get("summary") or "").strip()
        if summary and summary not in scenarios:
            scenarios.insert(0, summary)
        base["scenarios"] = scenarios[:4]
        return base

    def apply_brooks_filter_to_action(self, action: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(action, dict):
            return action
        if canonical_action_type(action.get("type")) != "OPEN_ORDER":
            return action

        filter_meta = patch.get("brooks_filter") if isinstance(patch.get("brooks_filter"), dict) else {}
        category = str(filter_meta.get("category") or "").strip()
        summary = str(filter_meta.get("summary") or "").strip() or "Brooks 分类要求继续观察"
        if filter_meta and not filter_meta.get("allow_executable"):
            return {
                "type": "LOG_ONLY",
                "symbol": action.get("symbol"),
                "reason": f"[PASS-WAIT] {summary}",
                "refs": normalize_refs(action.get("refs")) or normalize_refs(patch.get("refs")),
                "style": filter_meta.get("preferred_style") or action.get("style") or "",
                "brooks_label": filter_meta.get("label"),
                "upgrade_condition": filter_meta.get("upgrade_condition"),
                "brooks_rule": filter_meta.get("brooks_rule"),
            }

        normalized = dict(action)
        preferred_order_type = str(filter_meta.get("preferred_order_type") or normalized.get("order_type") or "").strip().upper()
        if category in {"tr_edge_limit_only", "broad_channel_countertrend_limit"}:
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            entry_price = (
                first_float(normalized.get("entry"))
                or first_float(normalized.get("entry_price"))
                or first_float(planned_trade.get("entry_price"))
            )
            if entry_price is None:
                return {
                    "type": "LOG_ONLY",
                    "symbol": action.get("symbol"),
                    "reason": "[PASS-WAIT] TR 边缘属于限价单环境，但当前缺少计划委托价格，继续观察。",
                    "refs": normalize_refs(action.get("refs")) or normalize_refs(patch.get("refs")),
                    "style": filter_meta.get("preferred_style") or action.get("style") or "",
                }
            normalized["entry"] = entry_price
            normalized.setdefault("entry_price", entry_price)
            normalized["order_type"] = "LIMIT"
        elif category == "broad_channel_trend_stop":
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            entry_price = (
                first_float(normalized.get("entry"))
                or first_float(normalized.get("entry_price"))
                or first_float(planned_trade.get("entry_price"))
            )
            if entry_price is None:
                return {
                    "type": "LOG_ONLY",
                    "symbol": action.get("symbol"),
                    "reason": "[PASS-WAIT] 宽通道顺势恢复仍缺少明确 stop trigger 价格，继续观察。",
                    "refs": normalize_refs(action.get("refs")) or normalize_refs(patch.get("refs")),
                    "style": filter_meta.get("preferred_style") or action.get("style") or "",
                }
            normalized["entry"] = entry_price
            normalized.setdefault("entry_price", entry_price)
            normalized["order_type"] = "STOP_MARKET"
        elif preferred_order_type in {"LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"}:
            normalized["order_type"] = preferred_order_type
        if filter_meta.get("preferred_style"):
            normalized["style"] = filter_meta["preferred_style"]
        if filter_meta.get("label"):
            normalized["brooks_label"] = filter_meta["label"]
        if filter_meta.get("upgrade_condition"):
            normalized["upgrade_condition"] = filter_meta["upgrade_condition"]
        if filter_meta.get("brooks_rule"):
            normalized["brooks_rule"] = filter_meta["brooks_rule"]
        planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
        execution_semantics = planned_trade.get("execution_semantics") if isinstance(planned_trade.get("execution_semantics"), dict) else {}
        if execution_semantics:
            normalized["candidate_stage"] = execution_semantics.get("candidate_stage")
            normalized["execution_mode"] = execution_semantics.get("execution_mode")
            normalized["order_type_cn"] = execution_semantics.get("order_type_cn")
        return normalized
