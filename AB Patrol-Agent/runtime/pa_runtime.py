#!/usr/bin/env python3
"""AB Patrol-Agent runtime for PA交易 Crypto.

This runtime restores the old Claude patrol loop around the original
`patrol-l1` skill and S-files. OpenClaw remains the operator / Telegram
host, while the decision engine can run on an independent provider.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import logging
import os
import re
import subprocess
import sys
import uuid
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from env_loader import load_agent_env
from providers import DecisionProviderConfig, build_decision_provider

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


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    return utc_now().isoformat()


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def write_text(path: Path, text: str) -> None:
    ensure_dir(path.parent)
    tmp = path.with_suffix(path.suffix + f".{uuid.uuid4().hex}.tmp")
    tmp.write_text(text, encoding="utf-8")
    tmp.replace(path)


def write_json(path: Path, payload: Any) -> None:
    write_text(path, json.dumps(payload, ensure_ascii=False, indent=2))


def append_jsonl(path: Path, payload: dict[str, Any]) -> None:
    ensure_dir(path.parent)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    value = raw.strip()
    if not value:
        return None
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def compact_json(data: Any, limit: int = 12000) -> str:
    pretty = json.dumps(data, ensure_ascii=False, indent=2)
    if limit and len(pretty) > limit:
        shrunk = shrink_prompt_value(data)
        return json.dumps(shrunk, ensure_ascii=False, separators=(",", ":"))
    return pretty


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_refs(refs: Any) -> list[str]:
    if isinstance(refs, list):
        return [str(item).strip() for item in refs if str(item).strip()]
    if isinstance(refs, str):
        return [part.strip() for part in refs.split(",") if part.strip()]
    return []


def first_float(value: Any, default: float | None = None) -> float | None:
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return default
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return default
    try:
        return float(match.group(0))
    except ValueError:
        return default


def all_floats(value: Any) -> list[float]:
    if value is None:
        return []
    if isinstance(value, (int, float)):
        return [float(value)]
    text = str(value)
    items: list[float] = []
    for match in re.findall(r"-?\d+(?:\.\d+)?", text):
        try:
            items.append(float(match))
        except ValueError:
            continue
    return items


def truncate_text(value: Any, limit: int = 220) -> Any:
    if not isinstance(value, str):
        return value
    text = value.strip()
    if limit <= 0 or len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def parse_structured_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        return value
    text = value.strip()
    if not text or text[0] not in "{[":
        return value
    for parser in (json.loads, ast.literal_eval):
        try:
            parsed = parser(text)
        except Exception:
            continue
        if isinstance(parsed, (dict, list)):
            return parsed
    return value


def format_ai_direction_text(value: Any) -> str:
    parsed = parse_structured_value(value)
    if isinstance(parsed, dict):
        direction = str(parsed.get("value") or parsed.get("direction") or "-").strip() or "-"
        confidence = str(parsed.get("confidence") or "").strip()
        detail = str(parsed.get("detail") or parsed.get("summary") or "").strip()
        head = direction if not confidence else f"{direction}（{confidence}）"
        return head if not detail else f"{head}｜{truncate_text(detail, 90)}"
    return truncate_text(value, 90) if value not in (None, "") else "-"


def normalize_trade_side(value: Any) -> str:
    text = str(value or "").strip().upper()
    if not text:
        return ""
    if any(token in text for token in {"BUY", "LONG", "做多".upper()}):
        return "BUY"
    if any(token in text for token in {"SELL", "SHORT", "做空".upper()}):
        return "SELL"
    if any(token in text for token in {"WAIT", "WATCH", "观察".upper()}):
        return "WAIT"
    return text


def format_trigger_prices_text(value: Any) -> str:
    parsed = parse_structured_value(value)
    if not isinstance(parsed, dict):
        return "-"
    parts: list[str] = []

    def _zone_text(label: str, raw: Any) -> str:
        if isinstance(raw, list) and len(raw) >= 2:
            left = first_float(raw[0])
            right = first_float(raw[1])
            if left is not None and right is not None:
                lo, hi = sorted((left, right))
                return f"{label} {lo}-{hi}"
        point = first_float(raw)
        if point is not None:
            return f"{label} {point}"
        return ""

    entry = first_float(parsed.get("entry"))
    stop_loss = first_float(parsed.get("stop_loss"))
    take_profit = first_float(parsed.get("take_profit"))
    if entry is not None:
        parts.append(f"入 {entry}")
    if stop_loss is not None:
        parts.append(f"止 {stop_loss}")
    if take_profit is not None:
        parts.append(f"目标 {take_profit}")
    for key, label in (
        ("entry_zone", "入场区"),
        ("retest_zone", "回测区"),
        ("breakout_zone", "突破区"),
        ("breakdown_zone", "跌破区"),
        ("breakout", "突破点"),
        ("breakdown", "跌破点"),
        ("reversal_below", "失守点"),
    ):
        zone = _zone_text(label, parsed.get(key))
        if zone and zone not in parts:
            parts.append(zone)
    return " / ".join(parts) if parts else "-"


def format_pre_signal_text(value: Any) -> str:
    parsed = parse_structured_value(value)
    if isinstance(parsed, dict):
        direction = {"short": "做空观察", "long": "做多观察"}.get(
            str(parsed.get("direction") or "").lower(),
            str(parsed.get("direction") or "").strip(),
        )
        condition = str(parsed.get("condition") or "").strip()
        price_text = format_trigger_prices_text(parsed.get("trigger_price"))
        invalid_if = str(parsed.get("invalid_if") or "").strip()
        parts = [item for item in [direction, condition] if item]
        if price_text != "-":
            parts.append(price_text)
        if invalid_if:
            parts.append(f"失效: {invalid_if}")
        return "｜".join(parts) if parts else "-"
    return truncate_text(value, 180) if value not in (None, "") else "-"


def format_gate_message(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "-"
    for raw in text.splitlines():
        line = raw.strip().lstrip("•").strip()
        if not line:
            continue
        if "P×R" in line or "门槛" in line or "拒绝" in line or "blocked" in line.lower():
            return truncate_text(line, 120)
    return truncate_text(text, 120)


ACTION_TYPE_ALIASES = {
    "ADD_ON": "OPEN_ORDER",
    "SCALE_IN": "OPEN_ORDER",
    "PYRAMID_ADD": "OPEN_ORDER",
    "REENTER": "OPEN_ORDER",
    "REENTRY": "OPEN_ORDER",
    "TP1_REDUCE": "PARTIAL_CLOSE",
    "TP2_REDUCE": "PARTIAL_CLOSE",
    "TAKE_PROFIT_REDUCE": "PARTIAL_CLOSE",
    "REDUCE_POSITION": "PARTIAL_CLOSE",
    "MOVE_STOP": "MODIFY_STOP_LOSS",
    "MOVE_STOP_TO_BREAKEVEN": "MODIFY_STOP_LOSS",
    "BREAKEVEN_STOP": "MODIFY_STOP_LOSS",
    "TRAIL_STOP": "MODIFY_STOP_LOSS",
    "MOVE_TP": "MODIFY_TAKE_PROFIT",
    "MOVE_TAKE_PROFIT": "MODIFY_TAKE_PROFIT",
    "ADJUST_TP": "MODIFY_TAKE_PROFIT",
    "TP_UPDATE": "MODIFY_TAKE_PROFIT",
    "CANCEL_PENDING_ENTRY": "CANCEL_ALL_ORDERS",
    "CANCEL_PENDING_ORDERS": "CANCEL_ALL_ORDERS",
    "CANCEL_STALE_ORDERS": "CANCEL_ALL_ORDERS",
    "EXIT_ALL": "CLOSE_POSITION",
    "FLATTEN": "CLOSE_POSITION",
}


def canonical_action_type(value: Any) -> str:
    raw = str(value or "").strip().upper()
    if not raw:
        return raw
    return ACTION_TYPE_ALIASES.get(raw, raw)


def normalize_action_payload(action: Any) -> Any:
    if not isinstance(action, dict):
        return action
    normalized = dict(action)
    raw_type = str(normalized.get("type") or "").strip().upper()
    canonical = canonical_action_type(raw_type)
    if canonical and canonical != raw_type:
        normalized["type"] = canonical
        normalized.setdefault("raw_type", raw_type)
        if canonical == "OPEN_ORDER" and raw_type in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD", "REENTER", "REENTRY"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "PARTIAL_CLOSE" and raw_type in {"TP1_REDUCE", "TP2_REDUCE", "TAKE_PROFIT_REDUCE", "REDUCE_POSITION"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "MODIFY_STOP_LOSS" and raw_type in {"MOVE_STOP", "MOVE_STOP_TO_BREAKEVEN", "BREAKEVEN_STOP", "TRAIL_STOP"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "MODIFY_TAKE_PROFIT" and raw_type in {"MOVE_TP", "MOVE_TAKE_PROFIT", "ADJUST_TP", "TP_UPDATE"}:
            normalized.setdefault("intent", raw_type)
        if canonical == "CANCEL_ALL_ORDERS":
            normalized.setdefault("intent", raw_type)
    return normalized


def shrink_prompt_value(value: Any, depth: int = 0) -> Any:
    if isinstance(value, str):
        if depth <= 1:
            return truncate_text(value, 280)
        if depth == 2:
            return truncate_text(value, 180)
        return truncate_text(value, 120)
    if isinstance(value, list):
        if depth == 0:
            limit = 8
        elif depth == 1:
            limit = 6
        else:
            limit = 4
        return [shrink_prompt_value(item, depth + 1) for item in value[:limit]]
    if isinstance(value, dict):
        items = list(value.items())
        if depth == 0:
            limit = len(items)
        elif depth == 1:
            limit = 10
        elif depth == 2:
            limit = 8
        else:
            limit = 6
        return {key: shrink_prompt_value(item, depth + 1) for key, item in items[:limit]}
    return value


def bar_range(bar: dict[str, Any]) -> float:
    return safe_float(bar.get("H")) - safe_float(bar.get("L"))


def compact_bar_record(bar: dict[str, Any]) -> dict[str, Any]:
    payload = {
        "time": bar.get("time"),
        "O": bar.get("O"),
        "H": bar.get("H"),
        "L": bar.get("L"),
        "C": bar.get("C"),
        "body": bar.get("body"),
        "bar_type": bar.get("bar_type"),
        "ema20": bar.get("ema20"),
        "vs_ema20": bar.get("vs_ema20"),
    }
    return {key: value for key, value in payload.items() if value not in (None, "")}


def event_has_prefix(events: list[str], prefixes: tuple[str, ...]) -> bool:
    return any(str(event).startswith(prefixes) for event in events)


def event_has_exact(events: list[str], names: set[str]) -> bool:
    return any(str(event) in names for event in events)


SIGNAL_EVENT_PATTERN = re.compile(r"^(?:signal_trigger|hl_signal):([HL])(\d+)")


def signal_event_ranks(events: list[str]) -> list[tuple[str, int]]:
    ranks: list[tuple[str, int]] = []
    for event in events:
        match = SIGNAL_EVENT_PATTERN.match(str(event or "").strip())
        if not match:
            continue
        ranks.append((match.group(1), int(match.group(2))))
    return ranks


def has_second_entry_signal(events: list[str]) -> bool:
    return any(rank >= 2 for _, rank in signal_event_ranks(events))


def has_first_entry_signal(events: list[str]) -> bool:
    return any(rank == 1 for _, rank in signal_event_ranks(events))


def classify_primary_s6_reference(state: str, events: list[str]) -> str:
    state_upper = str(state or "").upper()
    normalized = [str(event or "").strip() for event in events]
    if any(event.startswith("signal_trigger:") for event in normalized) and state_upper == "BO":
        return "S6-bo.md"
    if any(event.startswith("tr_edge:") for event in normalized) or state_upper == "TR":
        return "S6-tr.md"
    if any(
        event == "wedge_or_mtr"
        or event.startswith("hl_signal:H")
        or event.startswith(("state:SC", "state:BC"))
        or event == "climax_suspected"
        or event == "momentum_fading"
        for event in normalized
    ):
        return "S6-reversal.md"
    if any(event.startswith("state_change:") and event.endswith("->BO") for event in normalized):
        return "S6-bo.md"
    if any(event.startswith("state:BO") for event in normalized) or state_upper == "BO":
        return "S6-bo.md"
    if any(
        event in {"ema_touch", "cached_pre_signal"}
        or event.startswith(("first_pb:", "signal_trigger:", "hl_signal:L"))
        for event in normalized
    ) or state_upper in {"TC", "BC"}:
        return "S6-channel.md"
    return "S6-common.md"


def infer_trade_style_from_refs(
    *,
    market_state: str,
    refs: list[str],
    explicit_style: str = "",
    intent: str = "",
) -> str:
    explicit = str(explicit_style or "").strip()
    if explicit:
        return explicit

    refs_upper = {str(item).upper() for item in refs}
    state_upper = str(market_state or "").upper()
    intent_upper = str(intent or "").upper()

    if "PROBE" in intent_upper or "试探" in intent_upper:
        return "反转试探"
    if "S6-REVERSAL.MD" in refs_upper:
        return "反转试探"
    if "S6-CHANNEL.MD" in refs_upper and state_upper in {"TR", "BC"}:
        return "Scalp"
    if "S6-TR.MD" in refs_upper or state_upper == "TR":
        return "Scalp"
    if state_upper == "BC":
        return "Scalp"
    if "S6-BO.MD" in refs_upper or "S6-CHANNEL.MD" in refs_upper or state_upper in {"TC", "BO"}:
        return "Swing"
    return "Swing"


def infer_order_type_from_refs(
    *,
    market_state: str,
    refs: list[str],
    explicit_order_type: str = "",
    intent: str = "",
    has_price: bool = False,
) -> str:
    explicit = str(explicit_order_type or "").strip().upper()
    if explicit:
        if explicit in {"STOP", "STOP_ORDER", "STOP_LIMIT", "STOP_MARKET"}:
            return "STOP_MARKET"
        if explicit in {"TP", "TAKE_PROFIT", "TAKE_PROFIT_ORDER", "TAKE_PROFIT_MARKET"}:
            return "TAKE_PROFIT_MARKET"
        return explicit

    refs_upper = {str(item).upper() for item in refs}
    state_upper = str(market_state or "").upper()
    intent_upper = str(intent or "").upper()
    reversal_like = "S6-REVERSAL.MD" in refs_upper
    channel_ref = "S6-CHANNEL.MD" in refs_upper
    channel_reversal_like = channel_ref and state_upper in {"TR", "BC", "TC"}
    broad_channel_like = channel_ref and state_upper == "BC"
    continuation_like = any(token in intent_upper for token in ("CONTINUATION", "PULLBACK", "TREND", "RESUMPTION", "STOP"))
    countertrend_like = any(token in intent_upper for token in ("PROBE", "FADE", "COUNTERTREND", "试探", "LIMIT"))

    if "CANCEL" in intent_upper:
        return "MARKET"
    if reversal_like or channel_reversal_like:
        if "LIMIT" in intent_upper and has_price:
            return "LIMIT"
        if state_upper in {"TR", "BC"} and ("PROBE" in intent_upper or "试探" in intent_upper) and has_price:
            return "LIMIT"
        return "STOP_MARKET" if has_price else "MARKET"
    if broad_channel_like:
        if countertrend_like or "TR_FADE" in intent_upper or "FAILED_BO_FADE" in intent_upper:
            return "LIMIT" if has_price else "MARKET"
        if continuation_like:
            return "STOP_MARKET" if has_price else "MARKET"
        return "STOP_MARKET" if has_price else "MARKET"
    if "S6-TR.MD" in refs_upper or state_upper == "TR":
        return "LIMIT" if has_price else "MARKET"
    if "ADD_ON" in intent_upper or "SCALE_IN" in intent_upper:
        return "LIMIT" if has_price else "MARKET"
    if "S6-BO.MD" in refs_upper or state_upper in {"BO", "TC"}:
        return "STOP_MARKET" if has_price else "MARKET"
    if channel_ref:
        return "STOP_MARKET" if has_price else "MARKET"
    return "MARKET"


STATUS_PRIORITY = {
    "watching": 0,
    "cooldown": 0,
    "pre_signal": 1,
    "entry_ready_blocked": 2,
    "entry_ready": 3,
    "in_trade": 4,
    "manage": 5,
}


def cap_status(current_status: Any, max_status: str) -> str:
    current = str(current_status or "watching").strip().lower() or "watching"
    capped = str(max_status or current).strip().lower() or current
    if STATUS_PRIORITY.get(current, 0) > STATUS_PRIORITY.get(capped, 0):
        return capped
    return current


def combine_brooks_text(*values: Any) -> str:
    parts: list[str] = []
    for value in values:
        if value in (None, "", [], {}):
            continue
        if isinstance(value, dict):
            try:
                parts.append(json.dumps(value, ensure_ascii=False))
            except TypeError:
                parts.append(str(value))
            continue
        if isinstance(value, list):
            parts.extend(str(item) for item in value if item not in (None, ""))
            continue
        parts.append(str(value))
    return " ".join(part for part in parts if part).lower()


def has_trade_plan(base: dict[str, Any]) -> bool:
    planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
    pre_signal = base.get("pre_signal") if isinstance(base.get("pre_signal"), dict) else {}
    trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
    return any(
        value not in (None, "", [], {})
        for value in (
            planned_trade.get("entry_price"),
            planned_trade.get("entry_zone"),
            planned_trade.get("stop_loss"),
            planned_trade.get("take_profit"),
            trigger_price.get("entry"),
            trigger_price.get("entry_zone"),
            trigger_price.get("retest_zone"),
            trigger_price.get("breakout"),
            trigger_price.get("breakdown"),
            trigger_price.get("stop_loss"),
            trigger_price.get("take_profit"),
        )
    )


def candidate_stage_cn(value: str) -> str:
    mapping = {
        "WATCH": "继续观察",
        "PRE_SIGNAL": "预信号",
        "COUNTERTREND_PROBE": "反转试探",
        "CANDIDATE_LIMIT": "候选单（限价）",
        "CANDIDATE_STOP": "候选单（止损触发）",
        "CANDIDATE_MARKET": "候选单（市价）",
        "EXECUTABLE_LIMIT": "规则通过可执行单（限价）",
        "EXECUTABLE_STOP": "规则通过可执行单（止损触发）",
        "EXECUTABLE_MARKET": "规则通过可执行单（市价）",
    }
    return mapping.get(str(value or "").strip().upper(), str(value or "").strip() or "-")


def execution_mode_cn(value: str) -> str:
    mapping = {
        "WATCH_ONLY": "仅观察，不生成委托",
        "WAIT_ACCEPTANCE": "等待接受/二次确认",
        "COUNTERTREND_PROBE": "仅反转试探，不直接做 swing",
        "LIMIT_PLAN": "限价计划委托",
        "STOP_TRIGGER": "止损触发委托",
        "MARKET_IMMEDIATE": "市价立即执行",
    }
    return mapping.get(str(value or "").strip().upper(), str(value or "").strip() or "-")


def order_type_cn(value: str) -> str:
    mapping = {
        "LIMIT": "限价委托",
        "STOP_MARKET": "止损触发委托",
        "TAKE_PROFIT_MARKET": "止盈触发委托",
        "MARKET": "市价执行",
    }
    return mapping.get(str(value or "").strip().upper(), str(value or "").strip() or "-")


def derive_trade_execution_semantics(base: dict[str, Any], filter_meta: dict[str, Any]) -> dict[str, Any]:
    planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
    status = str(base.get("status") or "watching").strip().lower()
    category = str(filter_meta.get("category") or "").strip()
    order_type = str(planned_trade.get("order_type") or filter_meta.get("preferred_order_type") or "").strip().upper()
    exact_entry = first_float(planned_trade.get("entry_price"))
    has_zone = planned_trade.get("entry_zone") not in (None, "", [], {})
    has_plan = has_trade_plan(base)
    allow_executable = bool(filter_meta.get("allow_executable"))

    if category in {"tr_middle_no_edge", "watch_only"} or status in {"watching", "cooldown"}:
        stage = "WATCH"
        mode = "WATCH_ONLY"
    elif category in {"tbtl_incomplete", "tr_edge_limit_wait_second_signal"}:
        stage = "PRE_SIGNAL"
        mode = "WAIT_ACCEPTANCE"
    elif category in {"strong_breakout_countertrend", "forty_percent_reversal_scalp_only"}:
        stage = "COUNTERTREND_PROBE"
        mode = "COUNTERTREND_PROBE"
    elif category in {"tr_edge_limit_only", "broad_channel_countertrend_limit"}:
        if allow_executable and exact_entry is not None:
            stage = "EXECUTABLE_LIMIT"
        elif allow_executable and has_zone:
            stage = "CANDIDATE_LIMIT"
        elif has_plan or has_zone or status in {"entry_ready", "entry_ready_blocked"}:
            stage = "CANDIDATE_LIMIT"
        else:
            stage = "PRE_SIGNAL"
        mode = "LIMIT_PLAN"
    elif category == "broad_channel_trend_stop":
        if allow_executable and exact_entry is not None:
            stage = "EXECUTABLE_STOP"
        elif has_plan or has_zone or status in {"entry_ready", "entry_ready_blocked"}:
            stage = "CANDIDATE_STOP"
        else:
            stage = "PRE_SIGNAL"
        mode = "STOP_TRIGGER"
    elif allow_executable:
        if order_type == "STOP_MARKET":
            stage = "EXECUTABLE_STOP" if exact_entry is not None else "CANDIDATE_STOP"
            mode = "STOP_TRIGGER"
        elif order_type == "LIMIT":
            stage = "EXECUTABLE_LIMIT" if exact_entry is not None else "CANDIDATE_LIMIT"
            mode = "LIMIT_PLAN"
        else:
            stage = "EXECUTABLE_MARKET" if status in {"entry_ready", "entry_ready_blocked"} else "CANDIDATE_MARKET"
            mode = "MARKET_IMMEDIATE"
    elif has_plan or has_zone or status in {"pre_signal", "entry_ready", "entry_ready_blocked"}:
        if order_type == "LIMIT":
            stage = "CANDIDATE_LIMIT"
            mode = "LIMIT_PLAN"
        elif order_type == "STOP_MARKET":
            stage = "CANDIDATE_STOP"
            mode = "STOP_TRIGGER"
        else:
            stage = "PRE_SIGNAL"
            mode = "WAIT_ACCEPTANCE"
    else:
        stage = "WATCH"
        mode = "WATCH_ONLY"

    return {
        "candidate_stage": stage,
        "candidate_stage_cn": candidate_stage_cn(stage),
        "execution_mode": mode,
        "execution_mode_cn": execution_mode_cn(mode),
        "allow_executable": allow_executable,
        "needs_exact_trigger": order_type in {"LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"} and exact_entry is None,
        "has_entry_price": exact_entry is not None,
        "has_entry_zone": has_zone,
    }


def build_execution_semantics(
    planned_trade: dict[str, Any],
    filter_meta: dict[str, Any],
    semantics: dict[str, Any],
) -> dict[str, Any]:
    return {
        "candidate_stage": semantics.get("candidate_stage"),
        "candidate_stage_cn": semantics.get("candidate_stage_cn"),
        "execution_mode": semantics.get("execution_mode"),
        "execution_mode_cn": semantics.get("execution_mode_cn"),
        "order_type": planned_trade.get("order_type"),
        "order_type_cn": order_type_cn(str(planned_trade.get("order_type") or "")),
        "style": planned_trade.get("style"),
        "allow_executable": semantics.get("allow_executable"),
        "needs_exact_trigger": semantics.get("needs_exact_trigger"),
        "has_entry_price": semantics.get("has_entry_price"),
        "has_entry_zone": semantics.get("has_entry_zone"),
        "brooks_label": filter_meta.get("label"),
        "upgrade_condition": filter_meta.get("upgrade_condition"),
        "brooks_rule": filter_meta.get("brooks_rule"),
    }


def recent_continuation_momentum(recent_bars: list[dict[str, Any]]) -> bool:
    if not isinstance(recent_bars, list) or len(recent_bars) < 3:
        return False
    sample = [item for item in recent_bars[-3:] if isinstance(item, dict)]
    if len(sample) < 3:
        return False
    directions: list[int] = []
    for bar in sample:
        body = safe_float(bar.get("C")) - safe_float(bar.get("O"))
        rng = max(bar_range(bar), 0.0)
        if rng <= 0:
            return False
        if abs(body) < rng * 0.5:
            return False
        directions.append(1 if body > 0 else -1)
    return abs(sum(directions)) == 3


def recent_bar_stats(bars: list[dict[str, Any]]) -> dict[str, Any]:
    valid = [bar for bar in bars if isinstance(bar, dict)]
    if not valid:
        return {}

    bull = 0
    bear = 0
    doji = 0
    above_ema = 0
    ranges: list[float] = []
    for bar in valid:
        body_text = str(bar.get("body") or "")
        if "bull" in body_text:
            bull += 1
        elif "bear" in body_text:
            bear += 1
        else:
            doji += 1
        vs_ema = bar.get("vs_ema20")
        if isinstance(vs_ema, str):
            try:
                if float(vs_ema.split()[0]) >= 0:
                    above_ema += 1
            except ValueError:
                pass
        ranges.append(bar_range(bar))

    first_bar = valid[0]
    last_bar = valid[-1]
    first_open = safe_float(first_bar.get("O"))
    last_close = safe_float(last_bar.get("C"))
    net_change = last_close - first_open
    avg_range = sum(ranges) / len(ranges) if ranges else 0.0
    largest_range = max(ranges) if ranges else 0.0

    return {
        "count": len(valid),
        "from": first_bar.get("time"),
        "to": last_bar.get("time"),
        "net_change": round(net_change, 2),
        "bull_bars": bull,
        "bear_bars": bear,
        "doji_bars": doji,
        "bars_above_ema": above_ema,
        "high": round(max(safe_float(bar.get("H")) for bar in valid), 2),
        "low": round(min(safe_float(bar.get("L")) for bar in valid), 2),
        "avg_range": round(avg_range, 2),
    }


def compact_stats_for_prompt(stats: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(stats, dict):
        return {}
    payload = {
        "count": stats.get("count"),
        "from": stats.get("from"),
        "to": stats.get("to"),
        "net_change": stats.get("net_change"),
        "bull_bars": stats.get("bull_bars"),
        "bear_bars": stats.get("bear_bars"),
        "doji_bars": stats.get("doji_bars"),
        "bars_above_ema": stats.get("bars_above_ema"),
        "high": stats.get("high"),
        "low": stats.get("low"),
        "avg_range": stats.get("avg_range"),
    }
    return {key: value for key, value in payload.items() if value not in (None, "", [], {})}


TIMEFRAME_PATTERN = re.compile(r"\b(5m|15m|30m|1h)\b", re.IGNORECASE)
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
PROMPT_CACHED_FIELDS = (
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
VALIDATION_CACHE_FIELDS = (
    "status",
    "stage",
    "consecutive_watching",
    "daily_bias",
    "daily_bias_expires",
    "trade",
    "last_pass_reason",
)
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


def infer_signal_timeframe(*values: Any) -> str:
    for value in values:
        if isinstance(value, dict):
            for nested in value.values():
                match = TIMEFRAME_PATTERN.search(str(nested))
                if match:
                    return match.group(1).lower()
            continue
        match = TIMEFRAME_PATTERN.search(str(value or ""))
        if match:
            return match.group(1).lower()
    return "5m"


def prompt_cached_state(cached: dict[str, Any]) -> dict[str, Any]:
    payload = {field: cached.get(field) for field in PROMPT_CACHED_FIELDS if cached.get(field) not in (None, "", [], {})}
    return shrink_prompt_value(payload)


def validation_seed_state(cached: dict[str, Any]) -> dict[str, Any]:
    return {field: cached.get(field) for field in VALIDATION_CACHE_FIELDS if cached.get(field) not in (None, "", [], {})}


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


@dataclass
class Config:
    vault_root: Path
    agent_root: Path
    data_root: Path
    tools_root: Path
    charts_root: Path
    knowledge_root: Path
    openclaw_agent: str = "ab-patrol-loop"
    operator_agent: str = "ab-patrol-runtime"
    requested_decision_provider: str = "codex_cli"
    decision_provider: str = "codex_cli"
    decision_fallback_provider: str = "openclaw"
    decision_api_base: str = ""
    decision_api_key: str = ""
    decision_model: str = ""
    decision_timeout_seconds: int = 180
    tool_python_override: str = ""
    execution_bot_id: str = "claude-pa"
    execution_base: str = "http://127.0.0.1:8092"
    query_service_base: str = "http://127.0.0.1:8086"
    telegram_forward_url: str = ""
    telegram_chat_id: str = "-1003512657369"
    telegram_thread_id: int = 3
    dry_run: bool = True
    post_to_telegram: bool = True
    trigger_file: Path | None = None

    @classmethod
    def build(cls, dry_run: bool, post_to_telegram: bool) -> "Config":
        agent_root = Path(__file__).resolve().parents[1]
        load_agent_env(agent_root)
        vault_root = agent_root.parent
        requested_provider = os.getenv("AB_PATROL_DECISION_PROVIDER", "codex_cli").strip().lower() or "codex_cli"
        fallback_provider = os.getenv("AB_PATROL_DECISION_FALLBACK", "openclaw").strip().lower() or "openclaw"
        strict_provider = os.getenv("AB_PATROL_DECISION_STRICT", "0").strip() in {"1", "true", "TRUE", "yes", "on"}
        decision_api_base = os.getenv("AB_PATROL_LLM_API_BASE", "").strip()
        decision_model = os.getenv("AB_PATROL_LLM_MODEL", "").strip()
        decision_provider = requested_provider
        direct_missing = requested_provider in {"openai_compat", "openai-compatible", "openai"} and not (
            decision_api_base and decision_model
        )
        if direct_missing:
            if strict_provider:
                raise RuntimeError("AB Patrol-Agent direct provider requested, but API base/model are not configured")
            decision_provider = fallback_provider
        data_root = agent_root / "data" / "pa_trader"
        return cls(
            vault_root=vault_root,
            agent_root=agent_root,
            data_root=data_root,
            tools_root=agent_root / "tools",
            charts_root=agent_root / "data" / "charts",
            knowledge_root=agent_root / "knowledge" / "patrol-l1",
            openclaw_agent=os.getenv("AB_PATROL_OPENCLAW_AGENT", "ab-patrol-loop").strip() or "ab-patrol-loop",
            operator_agent=os.getenv("AB_PATROL_OPERATOR_AGENT", "ab-patrol-runtime").strip() or "ab-patrol-runtime",
            requested_decision_provider=requested_provider,
            decision_provider=decision_provider,
            decision_fallback_provider=fallback_provider,
            decision_api_base=decision_api_base,
            decision_api_key=os.getenv("AB_PATROL_LLM_API_KEY", "").strip(),
            decision_model=decision_model,
            decision_timeout_seconds=max(30, int(os.getenv("AB_PATROL_LLM_TIMEOUT", "180"))),
            tool_python_override=os.getenv("AB_PATROL_TOOL_PYTHON", "").strip(),
            execution_base=os.getenv("AB_PATROL_EXECUTION_BASE", "http://127.0.0.1:8092").strip() or "http://127.0.0.1:8092",
            execution_bot_id=os.getenv("AB_PATROL_EXECUTION_BOT_ID", "claude-pa").strip() or "claude-pa",
            query_service_base=os.getenv("AB_PATROL_QUERY_BASE", "http://127.0.0.1:8086").strip() or "http://127.0.0.1:8086",
            dry_run=dry_run,
            post_to_telegram=post_to_telegram,
            telegram_forward_url=(
                os.getenv("AB_PATROL_TELEGRAM_FORWARD_URL", "").strip()
                or "http://127.0.0.1:8090/api/patrol-forward"
            ),
            telegram_chat_id=os.getenv("AB_PATROL_TELEGRAM_CHAT_ID", "-1003512657369").strip() or "-1003512657369",
            telegram_thread_id=int(os.getenv("AB_PATROL_TELEGRAM_THREAD_ID", "3")),
            trigger_file=Path.home() / ".openclaw" / "patrol-l1-trigger.json",
        )


class PatrolRuntime:
    def __init__(self, config: Config):
        self.config = config
        self.state_dir = config.data_root / "state"
        self.logs_dir = config.data_root / "logs" / "decision"
        self.cycles_dir = config.data_root / "cycles"
        self.journal_dir = config.data_root / "journal"
        self.run_dir = config.agent_root / "run"
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

    def chart_python(self) -> str:
        candidates: list[Path] = []
        if self.config.tool_python_override:
            candidates.append(Path(self.config.tool_python_override))
        candidates.append(self.config.agent_root / ".venv" / "bin" / "python")
        for candidate in candidates:
            if candidate.exists():
                return str(candidate)
        return sys.executable or "python3"

    def tool_python(self) -> str:
        return self.chart_python()

    def chart_roots(self) -> list[Path]:
        roots = [self.config.charts_root]
        legacy_root = self.config.vault_root / "AB Console-Backend" / "data" / "charts"
        if legacy_root not in roots:
            roots.append(legacy_root)
        return roots

    def latest_chart_paths(self, symbol: str) -> list[str]:
        paths: list[Path] = []
        for root in self.chart_roots():
            today_dir = root / datetime.now().strftime("%Y-%m-%d")
            daily_dir = root / "daily"
            if today_dir.exists():
                paths.extend(sorted(today_dir.glob(f"{symbol}_*.png"), key=lambda p: p.stat().st_mtime, reverse=True)[:4])
            daily_path = daily_dir / f"{symbol}_1d.png"
            if daily_path.exists():
                paths.append(daily_path)
        paths = sorted(paths, key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)
        return [str(path) for path in paths[:5]]

    def chart_relative_path(self, path: str) -> str:
        resolved = Path(path).resolve()
        for root in self.chart_roots():
            try:
                return str(resolved.relative_to(root.resolve()))
            except Exception:
                continue
        return Path(path).name

    def chart_absolute_path(self, path: str | None) -> Path | None:
        if not path:
            return None
        candidate = Path(path)
        candidates = [candidate] if candidate.is_absolute() else [root / str(path) for root in self.chart_roots()]
        for item in candidates:
            try:
                resolved = item.expanduser().resolve()
            except Exception:
                continue
            if resolved.exists() and resolved.is_file():
                return resolved
        return None

    def build_chart_context(self, symbol: str, live: dict[str, Any]) -> dict[str, Any]:
        now = time.time()
        chart_paths = self.latest_chart_paths(symbol)
        if now - self.chart_refresh_state.get(symbol, 0.0) >= 90:
            try:
                cmd = [
                    self.chart_python(),
                    str(self.config.tools_root / "chart_gen.py"),
                    "-s",
                    symbol,
                    "-i",
                    "5m,15m,1h,1d",
                    "--port",
                    str(self.execution_port()),
                ]
                result = subprocess.run(
                    cmd,
                    cwd=str(self.config.agent_root),
                    capture_output=True,
                    text=True,
                    timeout=150,
                )
                if result.returncode != 0:
                    LOG.warning("generate charts failed for %s: %s", symbol, (result.stderr or result.stdout or "").strip())
                self.chart_refresh_state[symbol] = now
            except Exception as exc:
                LOG.warning("generate charts failed for %s: %s", symbol, exc)
        chart_paths = self.latest_chart_paths(symbol)
        relative_paths = [self.chart_relative_path(path) for path in chart_paths[:4]]
        latest_generated_at = None
        if chart_paths:
            try:
                latest_generated_at = datetime.fromtimestamp(
                    max(Path(path).stat().st_mtime for path in chart_paths[:4]),
                    tz=timezone.utc,
                ).astimezone().isoformat()
            except Exception:
                latest_generated_at = None

        return {
            "chart_files": [Path(path).name for path in chart_paths[:4]],
            "chart_paths": relative_paths,
            "chart_api_paths": [f"/api/charts?path={urllib.parse.quote(path)}" for path in relative_paths],
            "primary_chart_file": Path(chart_paths[0]).name if chart_paths else None,
            "primary_chart_path": relative_paths[0] if relative_paths else None,
            "primary_chart_api_path": (
                f"/api/charts?path={urllib.parse.quote(relative_paths[0])}" if relative_paths else None
            ),
            "latest_generated_at": latest_generated_at,
            "chart_note": "图表由 chart_gen.py 生成，内部会应用 ab_ema / ab_sr / ab_mm / ab_patterns 做可视化标注。",
        }

    def build_ab_context(self, symbol: str) -> dict[str, Any]:
        cmd = [
            self.tool_python(),
            str(self.config.tools_root / "patrol_ab_context.py"),
            "--symbol",
            symbol,
            "--port",
            str(self.execution_port()),
        ]
        try:
            result = subprocess.run(
                cmd,
                cwd=str(self.config.agent_root),
                capture_output=True,
                text=True,
                timeout=150,
            )
        except Exception as exc:
            return {"_error": str(exc)}
        if result.returncode != 0:
            return {"_error": (result.stderr or result.stdout or "").strip()}
        try:
            return json.loads((result.stdout or "").strip() or "{}")
        except json.JSONDecodeError as exc:
            return {"_error": f"invalid ab context json: {exc}"}

    def prompt_ab_context(self, ab_context: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(ab_context, dict):
            return {}
        frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
        summarized_frames: dict[str, Any] = {}
        for timeframe in ("5m", "15m", "1h", "1d"):
            frame = frames.get(timeframe)
            if not isinstance(frame, dict):
                continue
            ab_ema = frame.get("ab_ema") if isinstance(frame.get("ab_ema"), dict) else {}
            ab_sr = frame.get("ab_sr") if isinstance(frame.get("ab_sr"), dict) else {}
            ab_mm = frame.get("ab_mm") if isinstance(frame.get("ab_mm"), dict) else {}
            ab_patterns = frame.get("ab_patterns") if isinstance(frame.get("ab_patterns"), dict) else {}
            summarized_frames[timeframe] = {
                "ai": frame.get("ai"),
                "state": frame.get("state"),
                "signal": frame.get("signal"),
                "momentum_fading": frame.get("momentum_fading"),
                "events": [str(item) for item in (frame.get("events") or [])[:4]],
                "ab_ema": {
                    "mag_type": ab_ema.get("mag_type"),
                    "first_pb_type": ab_ema.get("first_pb_type"),
                    "first_pb_bars_ago": ab_ema.get("first_pb_bars_ago"),
                    "ema_sr_valid": ab_ema.get("ema_sr_valid"),
                },
                "ab_sr": {
                    "tr_position": ab_sr.get("tr_position"),
                    "trend_phase": ab_sr.get("trend_phase"),
                    "nearest_support": ab_sr.get("nearest_support"),
                    "nearest_resistance": ab_sr.get("nearest_resistance"),
                },
                "ab_mm": {
                    "nearest_bull_target": ab_mm.get("nearest_bull_target"),
                    "nearest_bear_target": ab_mm.get("nearest_bear_target"),
                },
                "ab_patterns": {
                    "latest_h": ab_patterns.get("latest_h"),
                    "latest_h_bars_ago": ab_patterns.get("latest_h_bars_ago"),
                    "latest_l": ab_patterns.get("latest_l"),
                    "latest_l_bars_ago": ab_patterns.get("latest_l_bars_ago"),
                    "wedge_count": ab_patterns.get("wedge_count"),
                    "pressure": ab_patterns.get("pressure"),
                    "pb_depth": ab_patterns.get("pb_depth"),
                },
            }
        return {
            "alignment_score": ab_context.get("alignment_score"),
            "dominant_direction": ab_context.get("dominant_direction"),
            "best_signal": ab_context.get("best_signal"),
            "quick_scan": ab_context.get("quick_scan") if isinstance(ab_context.get("quick_scan"), dict) else {},
            "timeframes": shrink_prompt_value(summarized_frames),
        }

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
        explicit_style = str(
            (base.get("entry_idea") or {}).get("style")
            or (base.get("planned_trade") or {}).get("style")
            or (base.get("trade") or {}).get("style")
            or ""
        ).strip()
        inferred_style = infer_trade_style_from_refs(
            market_state=state_upper,
            refs=refs,
            explicit_style=explicit_style,
        )
        combined = combine_brooks_text(
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
        tr_edge_top = any(str(event).startswith("tr_edge:top") for event in events)
        tr_edge_bottom = any(str(event).startswith("tr_edge:bottom") for event in events)
        has_breakout = event_has_prefix(events, ("state:BO", "state:BC", "state:TC", "state_change:"))
        reversal_clues = event_has_exact(events, {"wedge_or_mtr", "momentum_fading", "climax_suspected"}) or event_has_prefix(
            events,
            ("hl_signal:H",),
        ) or any(token in combined for token in ("双底", "双顶", "楔形", "mtr", "wedge", "reversal", "反转"))
        broad_channel_like = state_upper == "BC" or any(
            token in combined for token in ("宽幅多头通道", "宽幅空头通道", "broad channel", "宽通道")
        )
        strong_breakout = state_upper in {"BO", "TC", "BC"} or any(
            token in combined for token in ("ais", "aib", "always in", "强突破", "紧通道", "宽通道")
        )
        limit_order_environment = state_upper == "TR" or any(
            token in combined for token in ("交易区间", "limit order", "限价单", "blsh", "buy low sell high", "上三分之一", "下三分之一")
        )
        failed_breakout_context = any(
            token in combined for token in ("失败突破", "failed breakout", "双底下方失败突破", "双顶上方失败突破")
        )
        acceptance_clues = has_breakout or failed_breakout_context or any(
            token in combined for token in ("接受", "站上", "站回", "跟进", "follow-through", "acceptance", "higher low", "lower high")
        )
        continuation_clues = event_has_prefix(events, ("first_pb:",)) or event_has_exact(events, {"ema_touch", "cached_pre_signal"})
        tbtl_incomplete = any(token in combined for token in ("tbtl", "two legs", "十条腿", "两波"))
        if not tbtl_incomplete and reversal_clues and not has_signal_trigger:
            tbtl_incomplete = any(token in combined for token in ("双底", "双顶", "楔形", "mtr", "wedge"))
        has_plan = has_trade_plan(base)
        scalp_style = any(token in inferred_style for token in ("Scalp", "逆势", "反转试探"))
        preferred_order_type = infer_order_type_from_refs(
            market_state=state_upper,
            refs=refs,
            explicit_order_type=str((base.get("planned_trade") or {}).get("order_type") or ""),
            has_price=has_plan,
        )

        if limit_order_environment and not has_tr_edge and not has_signal_trigger:
            return {
                "category": "tr_middle_no_edge",
                "label": "交易区间中部无优势",
                "summary": "交易区间中部没有边缘优势，只保留观察，不升级候选单。",
                "max_status": "watching",
                "allow_executable": False,
                "preferred_style": inferred_style or "Scalp",
                "preferred_order_type": "LIMIT",
                "upgrade_condition": "先回到交易区间上/下三分之一边缘，再等信号。",
                "brooks_rule": "TR 以低买高卖 BLSHS 为主，中部位置通常没有优势。",
            }

        if strong_breakout and reversal_clues and not has_second_signal:
            return {
                "category": "strong_breakout_countertrend",
                "label": "强突破环境下逆势不做",
                "summary": "强突破背景里的第一次反转通常先按反转试探处理，不直接当 swing 可执行单。",
                "max_status": "pre_signal" if not has_plan else "entry_ready_blocked",
                "allow_executable": False,
                "preferred_style": "反转试探",
                "preferred_order_type": "STOP_MARKET" if has_breakout else preferred_order_type,
                "upgrade_condition": "至少等 H2/L2 或 HL/LH MTR，再看到明确接受，才考虑升级。",
                "brooks_rule": "强突破里多数反转先失败；第一次反转常只是小反转或 scalp。",
            }

        if tbtl_incomplete:
            return {
                "category": "tbtl_incomplete",
                "label": "TBTL 反转未完成",
                "summary": "两波/TBTL 反转还没完成，先留在预信号观察，不直接升级执行。",
                "max_status": "pre_signal",
                "allow_executable": False,
                "preferred_style": "反转试探",
                "preferred_order_type": preferred_order_type,
                "upgrade_condition": "等第二腿或二次入场信号完成后，再看是否升级。",
                "brooks_rule": "TBTL / two legs 未完成前，反转通常还不成熟。",
            }

        if reversal_clues and not has_second_signal:
            return {
                "category": "forty_percent_reversal_scalp_only",
                "label": "40%反转仅够 scalp",
                "summary": "当前反转更像 40% 级别的第一次反转，只适合试探或 scalp 观察，暂不作为 swing 可执行单。",
                "max_status": "pre_signal" if not has_plan else "entry_ready_blocked",
                "allow_executable": False,
                "preferred_style": inferred_style if scalp_style else "反转试探",
                "preferred_order_type": "LIMIT" if limit_order_environment else "STOP_MARKET",
                "upgrade_condition": "等 H2/L2、HL/LH MTR 或失败突破后的接受，再升级。",
                "brooks_rule": "大多数 MTR 只有约 40% 概率走出 2R 以上波段；第一次反转通常先小。",
            }

        if broad_channel_like and reversal_clues:
            return {
                "category": "broad_channel_countertrend_limit",
                "label": "宽通道逆势先限价",
                "summary": "宽通道更接近交易区间，逆势反转优先在边缘做 limit scalp，不直接追价做 swing。",
                "max_status": "entry_ready" if (has_plan and has_tr_edge and has_second_signal) else "pre_signal",
                "allow_executable": bool(has_plan and has_tr_edge and has_second_signal),
                "preferred_style": "反转试探" if not has_second_signal else inferred_style or "Scalp",
                "preferred_order_type": "LIMIT",
                "upgrade_condition": "先等到边缘，再等二次信号；没有二次信号就只保留试探/观察。",
                "brooks_rule": "Broad Channel 本质更像 TR：scalp more、swing less、use limit orders。",
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
                "preferred_style": inferred_style or "Swing",
                "preferred_order_type": "STOP_MARKET",
                "upgrade_condition": "先有顺势恢复/first pullback 完成，再看到接受或触发信号；没有恢复信号时不追 stop。",
                "brooks_rule": "Broad Channel 更像 TR：逆势多用 limit，顺势只有在恢复信号和接受都清晰时才用 stop。",
            }

        if limit_order_environment and has_tr_edge:
            if not has_second_signal and not has_signal_trigger:
                return {
                    "category": "tr_edge_limit_wait_second_signal",
                    "label": "TR 边缘先等二次信号",
                    "summary": "交易区间边缘虽然有位置优势，但只有第一次信号或背景不够清晰时，应先等二次信号，再把限价单升级为可执行单。",
                    "max_status": "pre_signal",
                    "allow_executable": False,
                    "preferred_style": inferred_style or "Scalp",
                    "preferred_order_type": "LIMIT",
                    "upgrade_condition": "等 H2/L2、二次失败或明确 signal bar，再从预信号升级成候选单。" if has_first_signal else "先等边缘出现明确 signal bar，再看是否形成二次入场。",
                    "brooks_rule": "TR 低买高卖主要靠边缘和二次入场；背景不清晰时要等第二次信号。",
                }
            return {
                "category": "tr_edge_limit_only",
                "label": "TR 边缘限价单环境",
                "summary": "当前属于 TR 上/下三分之一边缘，候选单可以存在，但应优先按计划委托/限价处理。",
                "max_status": "entry_ready" if ((has_second_signal or has_signal_trigger) and has_plan) else "pre_signal",
                "allow_executable": bool((has_second_signal or has_signal_trigger) and has_plan),
                "preferred_style": inferred_style or "Scalp",
                "preferred_order_type": "LIMIT",
                "upgrade_condition": "边缘 + 二次信号/清晰 signal bar 同时出现时，才升级成可执行限价单。",
                "brooks_rule": "TR 做法是 Buy Low Sell High，优先在上/下三分之一边缘用限价单处理。",
            }

        if has_signal_trigger or event_has_prefix(events, ("first_pb:", "pb_depth:")):
            return {
                "category": "trend_continuation_candidate",
                "label": "顺势候选",
                "summary": "当前属于顺势候选，允许继续走 candidate -> executable 的标准链路。",
                "max_status": "entry_ready" if has_plan else str(base.get("status") or "pre_signal"),
                "allow_executable": True,
                "preferred_style": inferred_style,
                "preferred_order_type": preferred_order_type,
                "upgrade_condition": "保持继续接受、触发价有效、结构未失效时，继续向可执行单推进。",
                "brooks_rule": "趋势恢复/first pullback 更适合 stop 触发，而不是在中间乱猜反转。",
            }

        return {
            "category": "watch_only",
            "label": "继续观察",
            "summary": "当前结构还不足以升级为候选单，继续观察并等待新证据。",
            "max_status": "watching" if not has_plan else str(base.get("status") or "watching"),
            "allow_executable": False,
            "preferred_style": inferred_style or "Scalp",
            "preferred_order_type": preferred_order_type,
            "upgrade_condition": "等待新的边缘、二次信号或接受证据出现。",
            "brooks_rule": "没有位置优势或没有信号完成时，最好的交易通常是等待。",
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
        base["evaluation"] = evaluation

        entry_idea["candidate_stage"] = semantics["candidate_stage"]
        entry_idea["candidate_stage_cn"] = semantics["candidate_stage_cn"]
        entry_idea["execution_mode"] = semantics["execution_mode"]
        entry_idea["execution_mode_cn"] = semantics["execution_mode_cn"]
        entry_idea["upgrade_condition"] = filter_meta.get("upgrade_condition")
        entry_idea["brooks_rule"] = filter_meta.get("brooks_rule")
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
        primary_s6 = classify_primary_s6_reference(state_upper, events)
        routed_s6 = self.route_s6_references(state_upper, events)

        if status_lower in {"pre_signal", "entry_ready", "entry_ready_blocked", "in_trade", "manage"}:
            add("S3b-key-levels.md", "S5-evaluation.md", "S6-common.md")
            for ref_name in routed_s6:
                if ref_name != "S6-common.md":
                    add(ref_name)
            if status_lower in {"in_trade", "manage"}:
                add("S7-management.md")
            return selected

        if event_has_prefix(events, ("signal_trigger:", "hl_signal:")):
            add("S3b-key-levels.md", "S5-evaluation.md", "S6-common.md")
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
            for ref_name in routed_s6:
                add(ref_name)
            return selected

        if event_has_prefix(events, ("first_pb:", "pb_depth:")) or event_has_exact(events, {"ema_touch", "cached_pre_signal"}):
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

    def http_get_json(self, path: str, query: dict[str, Any] | None = None) -> Any:
        url = self.config.execution_base + path
        if query:
            encoded = urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
            url = f"{url}?{encoded}"
        try:
            with urllib.request.urlopen(url, timeout=12) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc), "_url": url}

    def http_post_json(
        self,
        url: str,
        payload: dict[str, Any] | None = None,
        query: dict[str, Any] | None = None,
    ) -> Any:
        final_url = url
        if final_url.startswith("/"):
            final_url = self.config.execution_base + final_url
        if query:
            encoded = urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
            if encoded:
                final_url = f"{final_url}?{encoded}"
        body = json.dumps(payload or {}).encode("utf-8")
        request = urllib.request.Request(final_url, data=body, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}", "_url": final_url}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc), "_url": final_url}

    def http_delete_json(self, path: str, query: dict[str, Any] | None = None) -> Any:
        final_url = path
        if final_url.startswith("/"):
            final_url = self.config.execution_base + final_url
        if query:
            encoded = urllib.parse.urlencode({k: v for k, v in query.items() if v not in (None, "")})
            if encoded:
                final_url = f"{final_url}?{encoded}"
        request = urllib.request.Request(final_url, method="DELETE")
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}", "_url": final_url}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc), "_url": final_url}

    def http_post_telegram(self, payload: dict[str, Any]) -> Any:
        if not self.config.telegram_forward_url:
            return {"_error": "telegram forward disabled"}
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.config.telegram_forward_url,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}"}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as exc:
            return {"_error": str(exc)}

    def backend_bot_token(self) -> str:
        openclaw_config = Path.home() / ".openclaw" / "openclaw.json"
        if openclaw_config.exists():
            payload = load_json(openclaw_config, {})
            telegram_cfg = payload.get("channels", {}).get("telegram", {}) if isinstance(payload, dict) else {}
            token = str(telegram_cfg.get("botToken") or "").strip()
            if token:
                return token
        env_path = self.config.vault_root / "AB Console-Backend" / "config" / ".env"
        if env_path.exists():
            try:
                for raw in env_path.read_text(encoding="utf-8").splitlines():
                    line = raw.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, value = line.split("=", 1)
                    if key.strip() == "BOT_TOKEN":
                        token = value.strip().strip("\"' ")
                        if token:
                            return token
            except OSError:
                pass
        return ""

    def telegram_api_send_photo(self, photo_path: Path, caption: str) -> dict[str, Any]:
        token = self.backend_bot_token()
        if not token:
            return {"_error": "telegram bot token unavailable"}
        boundary = f"----ABPatrol{uuid.uuid4().hex}"
        parts: list[bytes] = []

        def add_field(name: str, value: str) -> None:
            parts.append(f"--{boundary}\r\n".encode("utf-8"))
            parts.append(f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"))
            parts.append(value.encode("utf-8"))
            parts.append(b"\r\n")

        add_field("chat_id", self.config.telegram_chat_id)
        add_field("parse_mode", "HTML")
        add_field("disable_notification", "true")
        if self.config.telegram_thread_id:
            add_field("message_thread_id", str(self.config.telegram_thread_id))
        if caption:
            add_field("caption", caption[:1024])

        image_bytes = photo_path.read_bytes()
        parts.append(f"--{boundary}\r\n".encode("utf-8"))
        parts.append(
            (
                f'Content-Disposition: form-data; name="photo"; filename="{photo_path.name}"\r\n'
                "Content-Type: image/png\r\n\r\n"
            ).encode("utf-8")
        )
        parts.append(image_bytes)
        parts.append(b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode("utf-8"))
        body = b"".join(parts)
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendPhoto",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="ignore")
            return {"_error": f"http {exc.code}: {detail}"}
        except (urllib.error.URLError, json.JSONDecodeError, TimeoutError, OSError) as exc:
            return {"_error": str(exc)}

    def openclaw_message_send(self, message: str) -> dict[str, Any]:
        cmd = [
            "openclaw",
            "message",
            "send",
            "--channel",
            "telegram",
            "--target",
            self.config.telegram_chat_id,
            "--thread-id",
            str(self.config.telegram_thread_id),
            "--message",
            message,
            "--silent",
            "--json",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            return {"_error": stderr or f"openclaw message send rc={result.returncode}"}
        stdout = (result.stdout or "").strip()
        try:
            return json.loads(stdout or "{}")
        except json.JSONDecodeError as exc:
            start = stdout.find("{")
            end = stdout.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(stdout[start : end + 1])
                except json.JSONDecodeError as exc:
                    return {"_error": f"invalid openclaw send json: {exc}"}
            return {"_error": f"invalid openclaw send json: {exc}"}

    def openclaw_photo_send(self, photo_path: Path, caption: str) -> dict[str, Any]:
        cmd = [
            "openclaw",
            "message",
            "send",
            "--channel",
            "telegram",
            "--target",
            self.config.telegram_chat_id,
            "--thread-id",
            str(self.config.telegram_thread_id),
            "--media",
            str(photo_path),
            "--message",
            caption[:1024],
            "--silent",
            "--json",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            return {"_error": stderr or f"openclaw photo send rc={result.returncode}"}
        stdout = (result.stdout or "").strip()
        try:
            return json.loads(stdout or "{}")
        except json.JSONDecodeError as exc:
            start = stdout.find("{")
            end = stdout.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    return json.loads(stdout[start : end + 1])
                except json.JSONDecodeError as inner_exc:
                    return {"_error": f"invalid openclaw photo json: {inner_exc}"}
            return {"_error": f"invalid openclaw photo json: {exc}"}

    def load_runtime_state(self) -> dict[str, Any]:
        return load_json(self.runtime_state_path, {})

    def load_market_cache(self) -> dict[str, Any]:
        return load_json(self.market_state_path, {"symbols": {}, "_meta": {}})

    def latest_cycle(self) -> tuple[Path | None, dict[str, Any]]:
        cycles = sorted(self.cycles_dir.glob("cycle_*.json"))
        if not cycles:
            return None, {}
        path = cycles[-1]
        return path, load_json(path, {})

    def record_runtime_failure(self, error: Exception | str, *, context: str = "loop") -> None:
        runtime = self.load_runtime_state()
        message = " ".join(str(error).split()) or "-"
        updated = dict(runtime)
        updated.update(
            {
                "status": "DEGRADED",
                "degraded": True,
                "last_failure_at": utc_iso(),
                "last_failure_reason": message[:500],
                "last_failure_context": context,
            }
        )
        write_json(self.runtime_state_path, updated)

    def latest_execution_log(self, limit: int = 8) -> list[dict[str, Any]]:
        path = self.journal_dir / "execution_log.jsonl"
        if not path.exists():
            return []
        rows: list[dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines()[-limit:]:
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return rows

    def build_pre_signal_meta(self, current: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        now = utc_now()
        existing_meta = current.get("pre_signal_meta") if isinstance(current.get("pre_signal_meta"), dict) else {}
        existing_expiry = parse_dt(existing_meta.get("expires_at"))
        pre_signal_text = str(patch.get("pre_signal") or current.get("pre_signal") or "").strip()
        timeframe = infer_signal_timeframe(
            pre_signal_text,
            patch.get("signal"),
            patch.get("thesis"),
            patch.get("entry_idea"),
            existing_meta.get("timeframe"),
        )
        default_ttl = PRE_SIGNAL_DEFAULT_TTL_SECONDS.get(timeframe, PRE_SIGNAL_DEFAULT_TTL_SECONDS["5m"])
        extension_ttl = PRE_SIGNAL_EXTENSION_SECONDS.get(timeframe, PRE_SIGNAL_EXTENSION_SECONDS["5m"])
        same_pre_signal = bool(pre_signal_text) and pre_signal_text == str(current.get("pre_signal") or "").strip()
        extended_once = bool(existing_meta.get("extended_once"))

        if same_pre_signal and existing_expiry and not extended_once:
            expires_at = max(existing_expiry, now) + timedelta(seconds=extension_ttl)
            extended_once = True
        elif same_pre_signal and existing_expiry:
            expires_at = existing_expiry
        else:
            expires_at = now + timedelta(seconds=default_ttl)
            extended_once = False

        return {
            "timeframe": timeframe,
            "created_at": existing_meta.get("created_at") or now.isoformat(),
            "expires_at": expires_at.isoformat(),
            "extended_once": extended_once,
        }

    def normalize_market_cache(self, market_cache: dict[str, Any]) -> dict[str, Any]:
        symbols = market_cache.get("symbols")
        if not isinstance(symbols, dict):
            return market_cache
        changed = False
        now = utc_now()
        for symbol, current in symbols.items():
            if not isinstance(current, dict):
                continue
            pre_signal_text = str(current.get("pre_signal") or "").strip()
            if not pre_signal_text:
                continue
            meta = current.get("pre_signal_meta") if isinstance(current.get("pre_signal_meta"), dict) else {}
            timeframe = infer_signal_timeframe(pre_signal_text, current.get("signal"), meta.get("timeframe"))
            expires_at = parse_dt(meta.get("expires_at"))
            if expires_at is None:
                created_at = parse_dt(meta.get("created_at")) or parse_dt(current.get("updated_at")) or now
                ttl = PRE_SIGNAL_DEFAULT_TTL_SECONDS.get(timeframe, PRE_SIGNAL_DEFAULT_TTL_SECONDS["5m"])
                expires_at = created_at + timedelta(seconds=ttl)
                current["pre_signal_meta"] = {
                    "timeframe": timeframe,
                    "created_at": created_at.isoformat(),
                    "expires_at": expires_at.isoformat(),
                    "extended_once": bool(meta.get("extended_once")),
                }
                changed = True
            if expires_at <= now:
                current.pop("pre_signal", None)
                current.pop("pre_signal_meta", None)
                if str(current.get("status") or "") in {"pre_signal", "entry_ready", "entry_ready_blocked"}:
                    current["status"] = "watching"
                    current["stage"] = "WATCH"
                current["last_pass_reason"] = "PRE_SIGNAL_EXPIRED"
                changed = True

        if changed:
            write_json(self.market_state_path, market_cache)
        return market_cache

    def poll_trigger(self) -> dict[str, Any] | None:
        trigger_file = self.config.trigger_file
        if trigger_file is None or not trigger_file.exists():
            return None
        stat = trigger_file.stat()
        if stat.st_mtime_ns <= self.last_trigger_mtime:
            return None
        payload = load_json(trigger_file, {})
        digest = hashlib.sha256(
            json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")
        ).hexdigest()
        self.last_trigger_mtime = stat.st_mtime_ns
        if digest == self.last_trigger_digest:
            return None
        self.last_trigger_digest = digest
        return payload if isinstance(payload, dict) else None

    def ack_trigger(self, trigger: dict[str, Any], cycle_id: str) -> None:
        payload = {
            "ok": True,
            "event_id": trigger.get("event_id", ""),
            "symbol": trigger.get("symbol", ""),
            "interval": trigger.get("interval", ""),
            "trigger_type": trigger.get("trigger_type", ""),
            "cycle_id": cycle_id,
            "handled_at": utc_iso(),
        }
        write_json(self.trigger_ack_path, payload)

    def execution_snapshot(self) -> dict[str, Any]:
        return {
            "health": self.http_get_json("/health"),
            "positions": self.http_get_json("/positions"),
            "orders": self.http_get_json("/orders/open"),
            "bot_summary": self.http_get_json(f"/trading/bot-summary/{self.config.execution_bot_id}"),
            "can_trade": self.http_get_json(f"/trading/can-trade/{self.config.execution_bot_id}"),
            "balance": self.http_get_json("/balance"),
        }

    def fetch_symbol_market(self, symbol: str) -> dict[str, Any]:
        data = self.http_get_json(f"/klines/{symbol}/multi")
        if not isinstance(data, dict):
            data = {}
        for interval in ("30m", "4h", "1d"):
            block = self.http_get_json(f"/klines/{symbol}", {"interval": interval, "limit": 150})
            if isinstance(block, dict) and not block.get("_error"):
                data[interval] = block
        return data

    def select_phase_plan(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        trigger: dict[str, Any] | None,
    ) -> dict[str, Any]:
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        active_symbols = list(symbol_cache.keys()) or ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
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
        for timeframe in ("5m", "15m", "30m", "1h", "4h", "1d"):
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
            if timeframe in {"5m", "15m", "1h"}:
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
            "quick_scan": shrink_prompt_value(ab_context.get("quick_scan") if isinstance(ab_context, dict) else {}),
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
        snapshot = {
            "health": {
                "status": health.get("status"),
                "exchange": health.get("exchange"),
                "mode": health.get("mode"),
                "trading_enabled": health.get("trading_enabled"),
            },
            "can_trade": {
                "can_trade": can_trade.get("can_trade"),
                "reason": can_trade.get("reason"),
            },
            "bot_summary": {
                "allocated_usdt": config.get("allocated_usdt"),
                "max_leverage": config.get("max_leverage"),
                "remaining_positions": bot_summary.get("remaining_positions"),
                "available_margin": bot_summary.get("available_margin"),
                "daily_pnl": daily_pnl,
                "risk_status": {
                    "daily_loss_ok": risk_status.get("daily_loss_ok"),
                    "correlation_exposure_pct": risk_status.get("correlation_exposure_pct"),
                    "cooldowns": risk_status.get("cooldowns"),
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
            "环境",
            'K 线数据量（Al Brooks: "Traders should only be trading charts that have about 100 bars"）',
            "缓存与 bar 数量的关系",
            "S 系列知识体系（L1+L2 融合）",
        )

        if phase_plan.get("full_refresh"):
            add(
                "Step 0: 首轮初始化",
                "Step 0b: 加载缓存",
                "Step 1: 获取全局数据 + Daily 偏置",
                "1a. API 数据（并行，每轮必做）",
                "1b. Daily 偏置（条件化）",
                "强制全刷新（Anti-Stale 机制）",
            )

        if positions:
            add(
                "Step 2: 持仓管理（有持仓时最优先）",
                "2a. 获取持仓品种 K 线（多周期）",
                "2a-1. 预计算持仓管理数据（ab_* 模块）",
                "2a-2. 生成持仓品种图表（Discord 推送 + 人工复盘用）",
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
            add("4d. Discord 周期汇报（每 6 轮一次，无需分析）")

        if any(ref in refs for ref in {"S4-strategy-match.md", "S5-evaluation.md", "S6-common.md", "S6-bo.md", "S6-channel.md", "S6-tr.md", "S6-reversal.md"}):
            add(
                "Scalp 快速通道（不进 Phase B，< 30 秒决策）",
                "Phase B: 深分析（仅有事件的品种）",
                "3d. 快速放弃条件（详见 S5 评估 + S6-channel / S6-bo 入场）",
                "3d-2. PASS 分类 + 反恐惧硬检查",
                "3d-3. SL 打掉后重新入场",
                "3e. 自我验证（下单前必做，10 项全过）",
                "3f. 执行开仓（含加仓路由）",
            )

        if any(ref in refs for ref in {"S0-daily-bias.md", "S1-reading.md", "S2-direction.md", "S3-market-state.md", "S3b-key-levels.md"}):
            add(
                "Step 1: 获取全局数据 + Daily 偏置",
                "1a. API 数据（并行，每轮必做）",
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
        budget_chars = 65000 if self.config.decision_provider == "openclaw" else 100000
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
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}

        market_live: dict[str, Any] = {}
        ab_context_by_symbol: dict[str, Any] = {}
        for symbol in phase_plan["focus_symbols"]:
            live = self.fetch_symbol_market(symbol)
            market_live[symbol] = live
            ab_context = self.build_ab_context(symbol)
            ab_context_by_symbol[symbol] = ab_context

        quick_scan_events: dict[str, Any] = {}
        for symbol in phase_plan["focus_symbols"]:
            cached = symbol_cache.get(symbol, {})
            ab_context = ab_context_by_symbol.get(symbol, {})
            event_map = dict(ab_context.get("quick_scan") or {}) if isinstance(ab_context, dict) else {}
            primary_state = self.current_market_state(cached, ab_context)
            cached_state = str(cached.get("market_state") or "")
            if primary_state:
                event_map.setdefault("5m", [])
                if f"state:{primary_state}" not in event_map["5m"]:
                    event_map["5m"].append(f"state:{primary_state}")
            if cached_state and primary_state and cached_state != primary_state:
                event_map.setdefault("5m", []).append(f"state_change:{cached_state}->{primary_state}")
            if cached.get("pre_signal"):
                event_map.setdefault("5m", []).append("cached_pre_signal")
            if int(cached.get("consecutive_watching") or 0) >= 6:
                event_map.setdefault("5m", []).append("stale:consecutive_watching")
            if trigger and trigger.get("symbol") == symbol:
                event_map.setdefault(str(trigger.get("interval") or "5m"), []).append(f"trigger:{trigger.get('trigger_type')}")
            if event_map:
                quick_scan_events[symbol] = event_map

        ranked_deep_candidates = self.ranked_eventful_symbols(
            phase_plan,
            symbol_cache,
            quick_scan_events,
            limit=len(phase_plan["focus_symbols"]),
            min_score=1,
        )

        deep_symbols: set[str] = set()
        deep_symbols.update(str(item).upper() for item in (phase_plan.get("manage_symbols") or []) if item)
        deep_symbols.update(ranked_deep_candidates)
        for symbol in phase_plan["focus_symbols"]:
            cached = symbol_cache.get(symbol, {})
            status = str(cached.get("status") or "").lower()
            if status in {"pre_signal", "entry_ready", "entry_ready_blocked", "in_trade", "manage"}:
                deep_symbols.add(symbol)
            if trigger and str(trigger.get("symbol") or "").upper() == symbol:
                deep_symbols.add(symbol)

        analysis_board: dict[str, Any] = {}
        for symbol in phase_plan["focus_symbols"]:
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
            if symbol in deep_symbols:
                chart_context = self.build_chart_context(symbol, live)
                if chart_context:
                    board["chart_context"] = chart_context
            analysis_board[symbol] = board

        prepared = {
            "symbol_cache": symbol_cache,
            "market_live": market_live,
            "ab_context_by_symbol": ab_context_by_symbol,
            "quick_scan_events": quick_scan_events,
            "analysis_board": analysis_board,
        }
        return prepared

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

        for action in decision.get("actions") or []:
            if not isinstance(action, dict):
                continue
            raw_action = dict(action)
            symbol_key = str(action.get("symbol") or "").upper()
            patch = merged_updates.get(symbol_key) if isinstance(merged_updates.get(symbol_key), dict) else {}
            action.clear()
            action.update(self.apply_brooks_filter_to_action(raw_action, patch))
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
        if intent in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"}:
            # S7-management 默认的加仓步进是 0.3 / 0.3 / 0.4，总风险不超过 1%。
            return 0.3
        return 1.0

    def format_ai_direction(self, value: Any) -> str:
        if isinstance(value, dict):
            direction = str(value.get("value") or "").strip()
            detail = str(value.get("detail") or "").strip()
            if direction and detail:
                return f"{direction} | {detail}"
            return direction or detail
        return str(value or "").strip()

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
            ai = str(item.get("ai") or "").strip()
            if ai:
                parts.append(f"{timeframe}:{ai}")
        if parts:
            return " ".join(parts)
        patch_value = self.format_ai_direction(patch.get("ai_direction"))
        if self.ai_direction_is_gate_ready(patch_value):
            return patch_value
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
        if p is None or r is None:
            patch_value = str(evaluation.get("reason") or patch.get("thesis") or "").strip()
            return existing or patch_value
        pxr = p * r
        return f"P={int(round(p * 100))}% R={r:.2f} PxR={pxr:.2f}"

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
        hydrated["equation"] = self.build_trade_equation(patch, hydrated)
        hydrated["refs"] = normalize_refs(hydrated.get("refs")) or normalize_refs(patch.get("refs"))
        hydrated["bar_reading"] = self.build_action_bar_reading(patch, hydrated)
        market_state = hydrated.get("market_state") or patch.get("market_state") or ""
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

    def validate_trade_gate(self, action: dict[str, Any]) -> dict[str, Any]:
        refs = ",".join(normalize_refs(action.get("refs")))
        cmd = [
            "python3",
            str(self.config.tools_root / "patrol_trade.py"),
            "--symbol",
            str(action.get("symbol", "")),
            "--side",
            str(action.get("side", "")),
            "--entry",
            str(action.get("entry", "")),
            "--sl",
            str(action.get("sl", "")),
            "--tp",
            str(action.get("tp", "")),
            "--risk",
            str(action.get("risk_usdt", 10)),
            "--strategy",
            str(action.get("strategy", "")),
            "--style",
            str(action.get("style", "")),
            "--ai-direction",
            str(action.get("ai_direction", "")),
            "--market-state",
            str(action.get("market_state", "")),
            "--signal-bar",
            str(action.get("signal_bar", "")),
            "--equation",
            str(action.get("equation", "")),
            "--refs",
            refs,
            "--bar-reading",
            str(action.get("bar_reading", "")),
            "--dry-run",
        ]
        result = subprocess.run(
            cmd,
            cwd=str(self.config.agent_root),
            capture_output=True,
            text=True,
            timeout=30,
        )
        return {
            "ok": result.returncode == 0,
            "stdout": (result.stdout or "").strip()[-1500:],
            "stderr": (result.stderr or "").strip()[-1500:],
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

        if action_type == "LOG_ONLY":
            result["success"] = True
            result["status"] = "LOG_ONLY"
            result["message"] = action.get("reason") or action.get("strategy") or "log only"
            return result

        if action_type == "OPEN_ORDER":
            gate = self.validate_trade_gate(action)
            result["trade_gate"] = gate
            if not gate["ok"]:
                result["success"] = False
                result["status"] = "VALIDATION_REJECTED"
                result["message"] = gate["stdout"] or gate["stderr"] or "trade gate rejected"
                return result

            can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
            if not can_trade.get("can_trade", False):
                result["success"] = False
                result["status"] = "BLOCKED"
                result["message"] = f"can_trade blocked: {can_trade.get('reason', '-')}"
                return result

            risk_percent = self.action_risk_percent(action, execution)
            size = self.http_get_json(
                f"/trading/calculate-size/{self.config.execution_bot_id}",
                {
                    "entry_price": safe_float(action.get("entry")),
                    "stop_loss": safe_float(action.get("sl")),
                    "risk_percent": risk_percent,
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
                "signal_source": self.config.operator_agent,
                "bot_id": self.config.execution_bot_id,
            }
            result["order_payload"] = order_payload
            if self.config.dry_run:
                result["success"] = True
                result["status"] = "DRY_RUN_VALIDATED"
                result["message"] = "trade gate passed; order not sent"
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

    def detect_new_pre_signals(
        self,
        previous_symbols: dict[str, Any],
        current_symbols: dict[str, Any],
        analysis_board: dict[str, Any],
        quick_scan_events: dict[str, Any],
    ) -> list[dict[str, Any]]:
        notices: list[dict[str, Any]] = []
        for symbol, current in current_symbols.items():
            if not isinstance(current, dict):
                continue
            pre_signal = str(current.get("pre_signal") or "").strip()
            if not pre_signal:
                continue
            previous = previous_symbols.get(symbol) if isinstance(previous_symbols.get(symbol), dict) else {}
            previous_pre_signal = str(previous.get("pre_signal") or "").strip()
            if previous_pre_signal == pre_signal:
                continue
            board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            live_frames = board.get("live_timeframes") if isinstance(board.get("live_timeframes"), dict) else {}
            latest_bar = (live_frames.get("5m") or {}).get("latest_bar") if isinstance(live_frames.get("5m"), dict) else {}
            meta = current.get("pre_signal_meta") if isinstance(current.get("pre_signal_meta"), dict) else {}
            notices.append(
                {
                    "symbol": symbol,
                    "status": current.get("status"),
                    "market_state": current.get("market_state"),
                    "pre_signal": pre_signal,
                    "expires_at": meta.get("expires_at"),
                    "timeframe": meta.get("timeframe") or infer_signal_timeframe(pre_signal),
                    "close": latest_bar.get("C") if isinstance(latest_bar, dict) else None,
                    "thesis": current.get("thesis") or current.get("structure_summary") or current.get("market_state_detail"),
                    "events": self.flatten_events(quick_scan_events.get(symbol)),
                    "planned_trade": current.get("planned_trade") if isinstance(current.get("planned_trade"), dict) else {},
                    "chart_context": board.get("chart_context") if isinstance(board.get("chart_context"), dict) else {},
                    "brooks_filter": current.get("brooks_filter") if isinstance(current.get("brooks_filter"), dict) else {},
                }
            )
        return notices

    def render_pre_signal_push(self, notice: dict[str, Any]) -> str:
        def status_cn(value: str) -> str:
            mapping = {
                "watching": "继续观察",
                "pre_signal": "预信号",
                "entry_ready": "候选单",
                "entry_ready_blocked": "候选单（规则待通过）",
                "in_trade": "持仓中",
                "manage": "正在管理",
                "cooldown": "冷却中",
            }
            return mapping.get(str(value), str(value))

        def trim_text(value: Any, limit: int = 180) -> str:
            text = " ".join(str(value or "-").split())
            if len(text) <= limit:
                return text
            return text[: max(0, limit - 1)].rstrip() + "…"

        def format_event(raw: Any) -> str:
            text = str(raw or "").strip()
            if not text:
                return ""
            mapping = {
                "ema_touch": "EMA回踩",
                "wedge_or_mtr": "楔形/MTR",
                "cached_pre_signal": "沿用上一轮预信号",
            }
            if text in mapping:
                return mapping[text]
            if text.startswith("signal_trigger:"):
                return "触发:" + text.split(":", 1)[1]
            if text.startswith("hl_signal:"):
                return "高低点:" + text.split(":", 1)[1]
            if text.startswith("state_change:"):
                return "状态切换:" + text.split(":", 1)[1].replace("->", "→")
            if text.startswith("state:"):
                return "状态:" + text.split(":", 1)[1]
            if text.startswith("tr_edge:"):
                edge = text.split(":", 1)[1]
                edge = {"top": "区间上沿", "bottom": "区间下沿"}.get(edge, edge)
                return edge
            if text.startswith("pb_depth:"):
                depth = text.split(":", 1)[1]
                depth = {"deep": "回撤偏深", "shallow": "回撤偏浅", "normal": "回撤正常", "too_deep": "回撤过深"}.get(depth, depth)
                return depth
            if text.startswith("first_pb:"):
                token = text.split(":", 1)[1]
                token = {"bull_pb": "首次回踩多", "bear_pb": "首次回踩空"}.get(token, token)
                return token
            return text

        symbol = str(notice.get("symbol") or "-")
        direction = str(notice.get("status") or "pre_signal")
        close = notice.get("close")
        close_text = f"{close}" if close not in (None, "") else "-"
        raw_events = [format_event(item) for item in (notice.get("events") or [])]
        events = " / ".join(item for item in raw_events if item) or "-"
        thesis = " ".join(str(notice.get("thesis") or "-").split())
        if len(thesis) > 180:
            thesis = thesis[:179].rstrip() + "…"
        expiry = notice.get("expires_at") or "-"
        timeframe = notice.get("timeframe") or "-"
        pre_signal_text = format_pre_signal_text(notice.get("pre_signal"))
        planned_trade = notice.get("planned_trade") if isinstance(notice.get("planned_trade"), dict) else {}
        brooks_filter = notice.get("brooks_filter") if isinstance(notice.get("brooks_filter"), dict) else {}
        planned_bits = []
        if planned_trade.get("candidate_stage_cn"):
            planned_bits.append(str(planned_trade.get("candidate_stage_cn")))
        if planned_trade.get("execution_mode_cn"):
            planned_bits.append(str(planned_trade.get("execution_mode_cn")))
        if planned_trade.get("order_type"):
            planned_bits.append(order_type_cn(str(planned_trade.get("order_type") or "")))
        if planned_trade.get("entry_price"):
            planned_bits.append(f"触发价 {planned_trade.get('entry_price')}")
        elif planned_trade.get("entry_zone"):
            planned_bits.append(f"触发区 {planned_trade.get('entry_zone')}")
        if planned_trade.get("stop_loss"):
            planned_bits.append(f"止损 {planned_trade.get('stop_loss')}")
        if planned_trade.get("take_profit"):
            planned_bits.append(f"止盈 {planned_trade.get('take_profit')}")
        plan_text = "｜".join(str(item) for item in planned_bits if item) or "-"
        filter_text = trim_text(brooks_filter.get("label") or "-", 80)
        upgrade_text = trim_text(brooks_filter.get("upgrade_condition") or "-", 120)
        chart_context = notice.get("chart_context") if isinstance(notice.get("chart_context"), dict) else {}
        chart_files = ", ".join(str(item) for item in (chart_context.get("chart_files") or [])[:3]) or "-"
        chart_hint = chart_context.get("primary_chart_path") or "-"

        # 格式化价格
        try:
            price_num = float(close_text.replace(',', ''))
            close_formatted = f"${price_num:,.2f}" if price_num > 100 else f"${price_num:.4f}"
        except:
            close_formatted = close_text

        # 简化状态
        market_state = notice.get('market_state', '')
        if isinstance(market_state, str) and '/' in market_state:
            state_parts = market_state.split('/')
            state_summary = ' / '.join(part.strip() for part in state_parts[:4])
        else:
            state_summary = str(market_state)[:80]

        # 格式化有效期
        if 'T' in expiry:
            expiry_date = expiry.split('T')[0]
            expiry_time = expiry.split('T')[1][:5]
            expiry_formatted = f"{expiry_date} {expiry_time}"
        else:
            expiry_formatted = expiry

        return "\n".join(
            [
                "━━━━━━━━━━━━━━━━━━━━",
                f"🟡 预信号 | {symbol}",
                "━━━━━━━━━━━━━━━━━━━━",
                "",
                f"⏱️  周期: {timeframe}",
                f"💵 价格: {close_formatted}",
                "",
                f"📊 市场状态",
                f"  {state_summary}",
                "",
                f"🎯 等待触发",
                f"  {pre_signal_text[:120]}",
                "",
                f"📚 Brooks 分类",
                f"  {filter_text}",
                "",
                f"🔓 升级条件",
                f"  {upgrade_text}",
                "",
                f"📝 结构分析",
                f"  {thesis[:180]}",
                "",
                f"📋 计划",
                f"  {plan_text[:150]}",
                "",
                f"🖼 图表",
                f"  {chart_files}",
                "",
                f"⏰ 有效期: {expiry_formatted}",
                "━━━━━━━━━━━━━━━━━━━━",
            ]
        )

    def render_housekeeping_card(
        self,
        updated_runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        decision: dict[str, Any],
        next_scan_seconds: int,
    ) -> str:
        balance = execution.get("balance") if isinstance(execution.get("balance"), dict) else {}
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        pending_pre_signals = updated_runtime.get("pending_pre_signals") or []
        meta = market_cache.get("_meta") if isinstance(market_cache.get("_meta"), dict) else {}
        actions = decision.get("actions") if isinstance(decision.get("actions"), list) else []
        pass_wait = sum(1 for item in actions if "[PASS-WAIT]" in str(item.get("reason") or ""))
        pass_rule = sum(1 for item in actions if "[PASS-RULE]" in str(item.get("reason") or ""))
        pre_signal_text = "、".join(str(item) for item in pending_pre_signals[:4]) if pending_pre_signals else "无"
        balance_value = (
            balance.get("available_balance")
            or balance.get("balance")
            or balance.get("wallet_balance")
            or "-"
        )
        # 提取市场总结
        market_summary = decision.get('market_summary') or {}
        regime = market_summary.get('regime', '-') if isinstance(market_summary, dict) else str(market_summary)[:200]
        best_candidate = market_summary.get('best_candidate', '-') if isinstance(market_summary, dict) else '-'
        trade_posture = market_summary.get('trade_posture', '-') if isinstance(market_summary, dict) else '-'

        # 格式化余额
        try:
            balance_num = float(str(balance_value).replace(',', '').replace('$', ''))
            balance_formatted = f"${balance_num:,.2f}"
        except:
            balance_formatted = str(balance_value)

        return "\n".join(
            [
                "━━━━━━━━━━━━━━━━━━━━",
                f"📊 PA交易 Loop #{updated_runtime.get('loop_seq')}",
                "━━━━━━━━━━━━━━━━━━━━",
                "",
                f"💰 余额: {balance_formatted}",
                f"📈 持仓: {len(positions)} 个",
                f"🎯 预信号: {pre_signal_text}",
                "",
                f"📊 累计统计",
                f"  • 信号: {meta.get('total_signals', 0)}",
                f"  • 交易: {meta.get('total_trades', 0)}",
                f"  • PASS: {meta.get('total_passes', 0)}",
                "",
                f"🎯 本轮最佳品种: {best_candidate}",
                "",
                f"📝 策略",
                f"{trade_posture[:200]}",
                "",
                f"📉 市场概况",
                f"{regime[:200]}",
                "",
                f"⏱️ 下轮扫描: {next_scan_seconds} 秒后",
                "━━━━━━━━━━━━━━━━━━━━",
            ]
        )

    def normalize_next_scan_seconds(
        self,
        decision: dict[str, Any],
        execution: dict[str, Any],
        analysis_board: dict[str, Any] | None = None,
    ) -> int:
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        requested = max(120, int(safe_float(decision.get("next_scan_seconds"), 480)))
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
        brooks_categories = {
            str(((patch or {}).get("brooks_filter") or {}).get("category") or "")
            for patch in symbol_updates.values()
            if isinstance(patch, dict) and isinstance(patch.get("brooks_filter"), dict)
        }
        has_entry_ready = any(status in {"entry_ready", "entry_ready_blocked"} for status in statuses)
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
            if atr14 > 0 and close_price > 0:
                if any(abs(close_price - price) < 0.3 * atr14 for price in numeric_prices(trigger_price)):
                    near_trigger = True
            ab_context = board.get("ab_context") if isinstance(board.get("ab_context"), dict) else {}
            frames = ab_context.get("timeframes") if isinstance(ab_context.get("timeframes"), dict) else {}
            frame_5m = frames.get("5m") if isinstance(frames.get("5m"), dict) else {}
            frame_15m = frames.get("15m") if isinstance(frames.get("15m"), dict) else {}
            state_upper = str(patch.get("market_state") or frame_5m.get("state") or "").upper()
            if event_has_prefix(list(patch.get("event_tags") or []), ("state_change:",)) and any(
                str(tag).endswith(("->BC", "->SC")) for tag in (patch.get("event_tags") or [])
            ):
                fresh_bc_sc = True
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
                        break
            if recent_continuation_momentum(recent_bars):
                momentum_active = True
            if str(symbol).upper() in position_symbols and isinstance(recent_bars, list) and len(recent_bars) >= 3:
                latest_ranges = [
                    abs(safe_float(item.get("H")) - safe_float(item.get("L")))
                    for item in recent_bars[-3:]
                    if isinstance(item, dict)
                ]
                avg_range = safe_float(((live_5m.get("browse_window_stats") or {}).get("avg_range")), 0.0)
                if avg_range > 0 and latest_ranges and max(latest_ranges) > avg_range * 2:
                    position_volatility_high = True

        if model_timeout:
            if near_trigger or position_volatility_high or fresh_bc_sc or tr_edge_active:
                return 120
            if any(category in brooks_categories for category in {"tr_edge_limit_only", "strong_breakout_countertrend", "forty_percent_reversal_scalp_only"}):
                return 180
            if momentum_active:
                return 180
            if positions or has_pre_signal:
                return 240
            if stale_count > 3:
                return 300
            if all_watching_three:
                return 720
            return 480

        if near_trigger or position_volatility_high or fresh_bc_sc or tr_edge_active:
            return 120
        if any(category in brooks_categories for category in {"tr_edge_limit_only", "strong_breakout_countertrend", "forty_percent_reversal_scalp_only"}):
            return 180
        if "tbtl_incomplete" in brooks_categories:
            return 240
        if "tr_middle_no_edge" in brooks_categories:
            return 480
        if momentum_active:
            return 180
        if positions:
            return 240
        if has_pre_signal:
            return 240
        if stale_count > 3:
            return 300
        if all_watching_three:
            return 720
        if not positions and not has_pre_signal:
            return 480

        buckets = [120, 180, 240, 300, 480, 720]
        for bucket in buckets:
            if requested <= bucket:
                return bucket
        return 720

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
        next_scan_seconds = self.normalize_next_scan_seconds(decision, execution, analysis_board)
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
                "market_profile": "crypto",
                "loop_seq": int(runtime.get("loop_seq") or 0) + 1,
                "status": "RUNNING",
                "current_phase": decision.get("phase") or phase_plan["phase"],
                "last_run_at": utc_iso(),
                "last_success_at": utc_iso(),
                "next_scan": {
                    "next_scan_at": next_scan_at.isoformat(),
                    "in_seconds": next_scan_seconds,
                    "reason_code": decision.get("next_scan_reason") or "PRE_SIGNAL_NEAR",
                    "reason_text": decision.get("next_scan_reason") or "follow decision",
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
        if session_id:
            updated["openclaw_runtime_session_id"] = session_id
            updated["decision_session_id"] = session_id
        updated["openclaw_runtime_agent"] = self.config.openclaw_agent if self.config.decision_provider == "openclaw" else None
        updated["openclaw_operator_agent"] = updated.get("openclaw_operator_agent") or self.config.operator_agent
        updated["openclaw_agent"] = updated.get("openclaw_agent") or self.config.operator_agent
        write_json(self.runtime_state_path, updated)
        write_json(self.next_scan_path, updated["next_scan"])
        return updated

    def render_push_card(
        self,
        cycle_id: str,
        runtime: dict[str, Any],
        decision: dict[str, Any],
        execution: dict[str, Any],
        execution_results: list[dict[str, Any]],
        next_scan_seconds: int,
        trigger: dict[str, Any] | None,
        quick_scan_events: dict[str, Any],
        analysis_board: dict[str, Any] | None = None,
    ) -> str:
        runtime_state = runtime if isinstance(runtime, dict) else {}
        can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        orders = execution.get("orders") if isinstance(execution.get("orders"), list) else []
        actions = [item for item in (decision.get("actions") or []) if isinstance(item, dict)]
        position_management = [item for item in (decision.get("position_management") or []) if isinstance(item, dict)]
        execution_results = [item for item in execution_results if isinstance(item, dict)]
        symbol_updates = decision.get("symbol_updates") or {}

        def phase_cn(value: str) -> str:
            mapping = {
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
            return mapping.get(str(value), str(value))

        def market_state_cn(value: str) -> str:
            mapping = {
                "TR": "区间",
                "BO": "突破",
                "TC": "紧通道",
                "BC": "宽通道",
                "SC": "高潮反转",
            }
            return mapping.get(str(value).upper(), str(value))

        def status_cn(value: str) -> str:
            mapping = {
                "watching": "继续观察",
                "pre_signal": "预信号",
                "entry_ready": "候选单",
                "entry_ready_blocked": "候选单（规则待通过）",
                "in_trade": "持仓中",
                "manage": "正在管理",
                "cooldown": "冷却中",
            }
            return mapping.get(str(value), str(value))

        def scan_reason_cn() -> str:
            focus = decision.get("focus_symbols") or []
            if "BTCUSDT" in focus or "ETHUSDT" in focus:
                if "BNBUSDT" in focus:
                    return "BTC、ETH 仍最接近触发点，BNB 也在区间边缘，需要继续快扫确认。"
                return "BTC、ETH 仍最接近触发点，需要继续快扫确认。"
            if "BNBUSDT" in focus:
                return "BNB 仍在关键区间边缘，需要继续确认。"
            return "继续按照当前观察名单复扫。"

        def trim_text(value: Any, limit: int = 180) -> str:
            text = " ".join(str(value or "").split())
            if not text:
                return "-"
            if len(text) <= limit:
                return text
            return text[: limit - 1].rstrip() + "…"

        def action_state_cn(patch: dict[str, Any], action: dict[str, Any], result: dict[str, Any]) -> str:
            result_status = str(result.get("status") or "")
            action_type = str(action.get("type") or "").upper()
            patch_status = str(patch.get("status") or "").lower()
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            candidate_stage = str(planned_trade.get("candidate_stage_cn") or "").strip()
            if result_status in {"FILLED", "PLACED", "MODIFIED", "closed", "CLOSED", "NEW"}:
                return "已执行"
            if action_type == "OPEN_ORDER":
                if result_status == "VALIDATION_REJECTED":
                    return "候选单（规则拒绝）"
                if result_status in {"BLOCKED", "SIZE_FAILED", "FAILED"}:
                    return "候选单（执行受阻）"
                return candidate_stage or "候选单"
            if candidate_stage:
                return candidate_stage
            if patch_status == "entry_ready_blocked":
                return "候选单（规则待通过）"
            if patch_status == "entry_ready":
                return "候选单"
            if patch_status == "pre_signal":
                return "预信号"
            if patch_status in {"in_trade", "manage"}:
                return "持仓管理"
            return status_cn(str(patch.get("status") or "-"))

        def event_text(symbol: str) -> str:
            def format_event(raw: Any) -> str:
                text = str(raw or "").strip()
                if not text:
                    return ""
                mapping = {
                    "ema_touch": "EMA回踩",
                    "wedge_or_mtr": "楔形/MTR",
                    "cached_pre_signal": "沿用预信号",
                }
                if text in mapping:
                    return mapping[text]
                if text.startswith("signal_trigger:"):
                    return "触发:" + text.split(":", 1)[1]
                if text.startswith("hl_signal:"):
                    return "高低点:" + text.split(":", 1)[1]
                if text.startswith("state_change:"):
                    return "状态切换:" + text.split(":", 1)[1].replace("->", "→")
                if text.startswith("state:"):
                    return "状态:" + text.split(":", 1)[1]
                if text.startswith("tr_edge:"):
                    edge = text.split(":", 1)[1]
                    return {"top": "区间上沿", "bottom": "区间下沿"}.get(edge, edge)
                if text.startswith("pb_depth:"):
                    depth = text.split(":", 1)[1]
                    return {"deep": "回撤偏深", "shallow": "回撤偏浅", "normal": "回撤正常", "too_deep": "回撤过深"}.get(depth, depth)
                if text.startswith("first_pb:"):
                    token = text.split(":", 1)[1]
                    return {"bull_pb": "首次回踩多", "bear_pb": "首次回踩空"}.get(token, token)
                return text

            event_map = quick_scan_events.get(symbol) if isinstance(quick_scan_events, dict) else {}
            if not isinstance(event_map, dict):
                return "-"
            parts: list[str] = []
            for timeframe in ("5m", "15m", "1h", "30m", "4h", "1d"):
                items = event_map.get(timeframe)
                if isinstance(items, list) and items:
                    pretty = [format_event(item) for item in items[:2]]
                    pretty = [item for item in pretty if item]
                    if pretty:
                        parts.append(f"{timeframe}:{' / '.join(pretty)}")
            return "；".join(parts)[:160] if parts else "-"

        def action_for_symbol(symbol: str) -> dict[str, Any]:
            for action in actions:
                if isinstance(action, dict) and str(action.get("symbol") or "").upper() == symbol:
                    return action
            return {}

        def management_for_symbol(symbol: str) -> dict[str, Any]:
            for item in position_management:
                if isinstance(item, dict) and str(item.get("symbol") or "").upper() == symbol:
                    return item
            return {}

        def chart_for_symbol(symbol: str) -> dict[str, Any]:
            if not analysis_board or not isinstance(analysis_board, dict):
                return {}
            board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            return board.get("chart_context") if isinstance(board.get("chart_context"), dict) else {}

        def execution_result_for_symbol(symbol: str) -> dict[str, Any]:
            for item in execution_results:
                if isinstance(item, dict) and str(item.get("symbol") or "").upper() == symbol:
                    return item
            return {}

        def collect_refs() -> list[str]:
            ordered: list[str] = []
            for bucket in (actions, position_management):
                for item in bucket:
                    if not isinstance(item, dict):
                        continue
                    for ref in normalize_refs(item.get("refs")):
                        if ref not in ordered:
                            ordered.append(ref)
            return ordered[:8]

        def concise_action_text(action: dict[str, Any], manage_item: dict[str, Any], patch: dict[str, Any]) -> str:
            action_type = canonical_action_type(action.get("type"))
            side = str(action.get("side") or (patch.get("entry_idea") or {}).get("side") or "").upper()
            style = str(action.get("style") or (patch.get("entry_idea") or {}).get("style") or "").strip()
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            candidate_stage = str(planned_trade.get("candidate_stage_cn") or "").strip()
            execution_mode = str(planned_trade.get("execution_mode_cn") or "").strip()
            label_map = {
                "OPEN_ORDER": "准备开仓",
                "PARTIAL_CLOSE": "分批减仓",
                "CLOSE_POSITION": "平仓",
                "MODIFY_STOP_LOSS": "移动止损",
                "MODIFY_TAKE_PROFIT": "调整止盈",
                "CANCEL_ALL_ORDERS": "撤销挂单",
                "LOG_ONLY": "仅记录",
            }
            label = label_map.get(action_type or "", "观察")
            side_text = {"BUY": "做多", "SELL": "做空"}.get(side, "")
            base = " ".join(part for part in [label, side_text, style, candidate_stage, execution_mode] if part)
            reason = manage_item.get("reason") if isinstance(manage_item, dict) and manage_item.get("reason") else action.get("reason")
            if base and reason:
                return f"{base}｜{trim_text(reason, 100)}"
            return base or trim_text(reason, 100)

        def local_summary_cn() -> str:
            if positions:
                return "当前存在持仓，本轮优先做 premise check、保护性止损和退出管理。"
            if actions and all(str(action.get("type") or "") == "LOG_ONLY" for action in actions):
                focus_notes = [
                    f"{symbol}:{status_cn(str((symbol_updates.get(symbol) or {}).get('status') or '-'))}"
                    for symbol in (decision.get("focus_symbols") or [])[:3]
                ]
                if focus_notes:
                    return "当前没有满足完整触发条件的入场机会，继续观察。重点监控 " + " / ".join(focus_notes) + "。"
                return "当前没有满足完整触发条件的入场机会，本轮继续观察。"
            if actions:
                return "已有明确动作候选，优先根据图形、风控和执行可用性处理。"
            return "本轮没有新增动作，继续按观察名单复扫。"

        def local_explanation_cn() -> str:
            if not can_trade_ok:
                return "当前首先受执行条件限制，即使图形接近可做，也不能直接下单。"
            if positions:
                return "当前重点不是找新单，而是确认原始 premise 是否仍成立，以及是否需要移损或退出。"
            return "当前重点仍是等信号K线完成、确认触发有效，并且让 post-fee Trader's Equation 达标。"

        focus_text = ", ".join(decision.get("focus_symbols") or []) or "-"
        can_trade_ok = bool(can_trade.get("can_trade"))
        trade_text = "可以" if can_trade_ok else "不可以"
        trade_reason = str(can_trade.get("reason") or "-")
        dry_run_text = "是" if self.config.dry_run else "否"
        knowledge_loading = (decision.get("state_patch") or {}).get("knowledge_loading") or {}
        refs_text = ", ".join(collect_refs()) or "-"
        summary_text = trim_text(decision.get("market_summary"), 260)
        explanation_text = trim_text(decision.get("explanation"), 320)
        knowledge_text = (
            f"skill={knowledge_loading.get('skill_mode', '-')}"
            f" | refs完整={knowledge_loading.get('full_reference_count', 0)}"
        )
        skill_sections = knowledge_loading.get("skill_sections") if isinstance(knowledge_loading.get("skill_sections"), list) else []
        skill_sections_text = " / ".join(str(item) for item in skill_sections[:6]) if skill_sections else "-"

        lines = [
            "🦁 PA交易 Crypto｜巡逻报告",
            "",
            "━━ 当前状态 ━━",
            f"• 轮次: {cycle_id}",
            f"• 阶段: {phase_cn(str(decision.get('phase', '-')))}",
            f"• 关注品种: {focus_text}",
            f"• 当前可交易: {trade_text} ({trade_reason})",
            f"• 持仓 / 挂单 / dry-run: {len(positions)} / {len(orders)} / {dry_run_text}",
            "• 读盘窗口: 后端每周期 150 根，浏览 80 根，精读最近 20 根",
        ]

        if trigger:
            trigger_text = f"{trigger.get('trigger_type', '-')}"
            if trigger.get("symbol"):
                trigger_text += f" {trigger.get('symbol')}"
            if trigger.get("interval"):
                trigger_text += f" {trigger.get('interval')}"
            lines.append(f"• 触发来源: {trigger_text}")

        lines.extend(
            [
                "",
                "━━ 巡逻结论 ━━",
                f"• 总结: {local_summary_cn()}",
                f"• 模型结论: {summary_text}",
            ]
        )

        focus_symbols = [str(item).upper() for item in (decision.get("focus_symbols") or [])]
        for symbol in focus_symbols[:3]:
            patch = (symbol_updates.get(symbol) or {}) if isinstance(symbol_updates, dict) else {}
            action = action_for_symbol(symbol)
            manage_item = management_for_symbol(symbol)
            result = execution_result_for_symbol(symbol)
            rank = focus_symbols.index(symbol) + 1
            direction = str(patch.get("ai_direction") or action.get("ai_direction") or "-")
            market_state = str(patch.get("market_state") or action.get("market_state") or "-")
            thesis = trim_text(
                patch.get("thesis")
                or patch.get("structure_summary")
                or patch.get("market_state_detail")
                or "-",
                140,
            )
            pre_signal = format_pre_signal_text(patch.get("pre_signal") or patch.get("signal") or "-")
            equation = trim_text(
                action.get("equation")
                or ((patch.get("evaluation") or {}).get("equation") if isinstance(patch.get("evaluation"), dict) else "")
                or "-",
                120,
            )
            entry_idea = patch.get("entry_idea") if isinstance(patch.get("entry_idea"), dict) else {}
            planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
            planned_summary = ""
            if planned_trade:
                planned_bits = [
                    str(planned_trade.get("candidate_stage_cn") or "").strip(),
                    str(planned_trade.get("execution_mode_cn") or "").strip(),
                    order_type_cn(str(planned_trade.get("order_type") or "").strip()),
                    {"BUY": "做多", "SELL": "做空"}.get(str(planned_trade.get("side") or "").upper(), ""),
                    str(planned_trade.get("style") or "").strip(),
                ]
                planned_bits = [item for item in planned_bits if item]
                if planned_bits:
                    planned_summary = "计划委托｜" + " ".join(planned_bits)
            entry_text = trim_text(
                concise_action_text(action, manage_item, patch)
                or entry_idea.get("idea")
                or entry_idea.get("setup")
                or entry_idea.get("summary")
                or planned_summary
                or "-",
                140,
            )
            result_text = "-"
            if result:
                status = str(result.get("status") or "-")
                if status == "LOG_ONLY":
                    result_text = "仅记录，不执行"
                elif status.startswith("DRY_RUN"):
                    result_text = "已通过校验，当前仅 dry-run"
                elif status in {"FILLED", "PLACED", "MODIFIED", "NEW", "closed", "CLOSED"}:
                    result_text = "已执行"
                elif status == "VALIDATION_REJECTED":
                    result_text = "规则拒绝｜" + format_gate_message(result.get("message") or status)
                else:
                    result_text = format_gate_message(result.get("message") or status)
            price_text = format_trigger_prices_text(
                planned_trade
                or ((patch.get("pre_signal") or {}).get("trigger_price") if isinstance(patch.get("pre_signal"), dict) else action)
            )
            stage_text = action_state_cn(patch, action, result)
            direction_text = format_ai_direction_text(direction)

            lines.extend(
                [
                    "",
                    f"━━ {rank}. {symbol}｜{stage_text} ━━",
                    f"• 方向: {direction_text}",
                    f"• 市场状态: {market_state_cn(market_state)}",
                    f"• Brooks 分类: {trim_text((patch.get('brooks_filter') or {}).get('label') or '-', 80)}",
                    f"• 升级条件: {trim_text((patch.get('brooks_filter') or {}).get('upgrade_condition') or '-', 120)}",
                    f"• 触发事件: {event_text(symbol)}",
                    f"• 结构: {thesis}",
                    f"• 入场条件: {pre_signal}",
                    f"• 计划价位: {price_text}",
                    f"• 执行语义: {trim_text((planned_trade.get('candidate_stage_cn') or '-') + '｜' + (planned_trade.get('execution_mode_cn') or '-') + '｜' + order_type_cn(planned_trade.get('order_type') or '-'), 140)}",
                    f"• 交易方程: {equation}",
                    f"• 候选动作: {entry_text}",
                    f"• 最终执行: {result_text}",
                ]
            )
            chart_context = chart_for_symbol(symbol)
            chart_files = ", ".join(str(item) for item in (chart_context.get("chart_files") or [])[:3]) or "-"
            primary_chart = chart_context.get("primary_chart_path") or "-"
            lines.extend(
                [
                    f"• 图表文件: {chart_files}",
                    f"• Web查看: http://127.0.0.1:3001/pa-bot（图: {primary_chart}）",
                ]
            )

        if positions:
            lines.extend(["", "━━ 持仓管理 ━━"])
            for item in positions[:5]:
                symbol = str(item.get("symbol") or "-")
                manage_item = management_for_symbol(symbol)
                premise = trim_text(manage_item.get("reason") if isinstance(manage_item, dict) else "-", 120)
                lines.append(
                    f"• {symbol}: {item.get('side')} @ {item.get('entry_price')} | 浮盈亏 {item.get('unrealized_pnl')} | 管理结论: {premise}"
                )

        show_debug = bool(trigger) or bool(positions) or any(
            str(item.get("status") or "") not in {"", "LOG_ONLY", "SKIPPED", "NO_ACTION"}
            for item in execution_results
            if isinstance(item, dict)
        ) or int(runtime_state.get("loop_seq") or 0) % 6 == 0
        if show_debug:
            lines.extend(
                [
                    "",
                    "━━ 调试信息 ━━",
                    f"• 参考文件: {refs_text}",
                    f"• 知识加载: {knowledge_text}",
                    f"• Skill章节: {trim_text(skill_sections_text, 180)}",
                    f"• 原始模型解释: {explanation_text}",
                    "• 图表上下文: chart_gen.py + ab_ema / ab_sr / ab_mm / ab_patterns 已接入分析板",
                ]
            )
        lines.extend(
            [
                "",
                "━━ 下一次扫描 ━━",
                f"• 时间: {next_scan_seconds} 秒后",
                f"• 原因: {trim_text(decision.get('next_scan_reason'), 180) if decision.get('next_scan_reason') else scan_reason_cn()}",
                f"• 巡逻说明: {scan_reason_cn()}",
                f"• 推送时间: {datetime.now().astimezone().strftime('%Y-%m-%d %H:%M:%S %Z')}",
            ]
        )
        return "\n".join(lines)[:4000]

    def should_push_cycle_card(
        self,
        runtime: dict[str, Any],
        updated_runtime: dict[str, Any],
        decision: dict[str, Any],
        execution: dict[str, Any],
        execution_results: list[dict[str, Any]],
        pre_signal_notices: list[dict[str, Any]],
        trigger: dict[str, Any] | None,
    ) -> bool:
        if trigger:
            return True
        if pre_signal_notices:
            return True
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        if positions:
            return True
        for item in execution_results:
            status = str(item.get("status") or "")
            if status and status not in {"LOG_ONLY", "SKIPPED", "NO_ACTION"}:
                return True
        for patch in (decision.get("symbol_updates") or {}).values():
            status = str((patch or {}).get("status") or "")
            if status in {"entry_ready", "entry_ready_blocked", "in_trade", "manage"}:
                return True
        if bool((decision.get("state_patch") or {}).get("model_timeout")):
            return False
        if int(updated_runtime.get("loop_seq") or 0) % 6 == 0:
            return True
        previous_summary = str(runtime.get("last_scan_decision") or "").strip()
        current_summary = str(decision.get("market_summary") or "").strip()
        if previous_summary and current_summary and previous_summary != current_summary:
            return True
        return False

    def push_telegram_update(self, message: str) -> dict[str, Any]:
        if not self.config.post_to_telegram:
            return {"ok": False, "skipped": True}
        direct = self.openclaw_message_send(message)
        if not direct.get("_error"):
            return direct
        payload = {
            "chat_id": self.config.telegram_chat_id,
            "message_thread_id": self.config.telegram_thread_id,
            "message": message,
            "disable_notification": True,
        }
        fallback = self.http_post_telegram(payload)
        return {"openclaw": direct, "fallback": fallback}

    def push_telegram_photo(self, photo_path: str | None, caption: str) -> dict[str, Any]:
        if not self.config.post_to_telegram:
            return {"ok": False, "skipped": True, "reason": "telegram_disabled"}
        absolute_path = self.chart_absolute_path(photo_path)
        if absolute_path is None:
            return {"ok": False, "skipped": True, "reason": "photo_missing"}
        direct = self.telegram_api_send_photo(absolute_path, caption)
        if not direct.get("_error"):
            return {"mode": "direct_bot_api", **direct}
        payload = {
            "chat_id": self.config.telegram_chat_id,
            "message_thread_id": self.config.telegram_thread_id,
            "message": "",
            "caption": caption[:1024],
            "photo_path": str(absolute_path),
            "disable_notification": True,
        }
        via_forward = self.http_post_telegram(payload)
        if not via_forward.get("_error"):
            return {"mode": "forward", **via_forward}
        direct_openclaw = self.openclaw_photo_send(absolute_path, caption)
        if not direct_openclaw.get("_error"):
            return {"mode": "openclaw", **direct_openclaw}
        return {
            "ok": False,
            "mode": "photo_failed",
            "direct_bot_api": direct,
            "forward": via_forward,
            "openclaw": direct_openclaw,
        }

    def primary_chart_for_decision(self, decision: dict[str, Any], analysis_board: dict[str, Any]) -> tuple[str | None, str | None]:
        for symbol in [str(item).upper() for item in (decision.get("focus_symbols") or [])]:
            board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
            chart_context = board.get("chart_context") if isinstance(board.get("chart_context"), dict) else {}
            primary = chart_context.get("primary_chart_path")
            if primary:
                return symbol, str(primary)
        return None, None

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
        symbol_cache = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        focus_symbols = [str(item).upper() for item in (phase_plan.get("focus_symbols") or [])]
        refs = list(phase_plan.get("prompt_references") or [])[:4]
        positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
        cached_pre_signal = any(str((symbol_cache.get(symbol, {}) or {}).get("status") or "") in {"pre_signal", "entry_ready", "entry_ready_blocked"} for symbol in focus_symbols)
        next_scan_seconds = 240 if positions or cached_pre_signal else 480
        symbol_updates: dict[str, Any] = {}
        actions: list[dict[str, Any]] = []

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
            actions.append(
                {
                    "type": "LOG_ONLY",
                    "symbol": symbol,
                    "reason": f"模型超时，保留上一轮判断；事件参考: {event_text}",
                    "refs": refs,
                }
            )

        if positions:
            market_summary = "本轮决策模型超时。为避免持仓无人看管，系统保留上一轮管理结论，不做新开仓，缩短到 60 秒后重试。"
        else:
            market_summary = "本轮决策模型超时。系统保留上一轮观察结论，不做新开仓，快速重试下一轮。"

        return {
            "phase": phase_plan["phase"],
            "market_summary": market_summary,
            "focus_symbols": focus_symbols,
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
        market_cache = self.normalize_market_cache(self.load_market_cache())
        execution = self.execution_snapshot()
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
        decision = self.validate_decision(decision, phase_plan, ref_names, market_cache, analysis_board, quick_scan_events)

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
        write_text(self.logs_dir / f"{cycle_id}_request.md", (self.logs_dir / "last_request.md").read_text(encoding="utf-8"))

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
                                f"📈 PA交易 Crypto｜{cycle_symbol or '-'} 图表\n• 轮次: {cycle_id}\n• 阶段: {phase_text}",
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
                            f"🖼 PA交易 Crypto｜{symbol} 预信号图表\n• 状态: {notice.get('status') or '-'}\n• 图表: {chart_context.get('primary_chart_file') or '-'}",
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
