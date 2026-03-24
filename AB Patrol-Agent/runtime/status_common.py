#!/usr/bin/env python3
"""Shared status/query helpers for AB Patrol-Agent."""

from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from runtime.execution_targets import build_execution_targets, normalize_exchange, primary_target_exchange
from runtime.path_layout import data_run_dir
from runtime.runtime_state_cleanup import prune_runtime_state


def _now_ts() -> float:
    return time.time()


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def read_jsonl_tail(path: Path, limit: int = 10) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    items: list[dict[str, Any]] = []
    for line in lines[-limit:]:
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            items.append(payload)
    return items


def read_text(path: Path) -> str:
    if not path.exists():
        return ""
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.0)
        return sock.connect_ex((host, port)) == 0


def http_get(base: str, path: str, query: dict[str, Any] | None = None, timeout: int = 12) -> Any:
    url = base.rstrip("/") + path
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as exc:
        return {"_error": str(exc), "_url": url}


def _pid_alive(pid: int | None) -> bool:
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _pid_from_file(path: Path) -> int | None:
    if not path.exists():
        return None
    raw = path.read_text(encoding="utf-8").strip()
    return int(raw) if raw.isdigit() else None


def _launchd_pid(label: str) -> int | None:
    if os.uname().sysname != "Darwin":
        return None
    try:
        result = subprocess.run(
            ["launchctl", "print", f"gui/{os.getuid()}/{label}"],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    match = re.search(r"\bpid = (\d+)", result.stdout or "")
    if not match:
        return None
    pid = int(match.group(1))
    return pid if pid > 0 else None


def _process_command(pid: int | None) -> str:
    if pid is None:
        return ""
    try:
        result = subprocess.run(
            ["ps", "-p", str(pid), "-o", "command="],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except Exception:
        return ""
    return (result.stdout or "").strip()


def _normalized_symbol_set(values: Any) -> set[str]:
    normalized: set[str] = set()
    if isinstance(values, dict):
        values = values.keys()
    if not isinstance(values, (list, tuple, set)):
        values = [values]
    for value in values:
        text = str(value or "").strip().upper()
        if ":" in text:
            text = text.split(":", 1)[0].strip()
        if text:
            normalized.add(text)
    return normalized


def _cycle_focus_symbols(payload: dict[str, Any]) -> list[str]:
    if not isinstance(payload, dict):
        return []
    decision = payload.get("decision") if isinstance(payload.get("decision"), dict) else {}
    phase_plan = payload.get("phase_plan") if isinstance(payload.get("phase_plan"), dict) else {}
    focus_symbols = decision.get("focus_symbols") or phase_plan.get("focus_symbols") or []
    return [str(symbol).strip() for symbol in focus_symbols if str(symbol).strip()]


def _runtime_symbol_universe(runtime: dict[str, Any]) -> set[str]:
    symbols = runtime.get("symbols") if isinstance(runtime.get("symbols"), dict) else {}
    return _normalized_symbol_set(
        [
            *(runtime.get("focus_symbols") or []),
            *(runtime.get("active_symbols") or []),
            *symbols.keys(),
        ]
    )


def _configured_exchange() -> str:
    """读取当前主执行交易所。"""
    fallback_exchange = normalize_exchange(
        os.getenv("AB_PATROL_EXECUTION_EXCHANGE")
        or os.getenv("AB_PATROL_EXCHANGE")
        or "binance"
    )
    root = Path(__file__).resolve().parents[1]
    default_base = os.getenv("AB_PATROL_EXECUTION_BASE") or "http://127.0.0.1:8092"
    targets = build_execution_targets(root, fallback_exchange, default_base)
    return primary_target_exchange(targets, fallback_exchange)


def latest_cycle(
    cycles_dir: Path,
    *,
    preferred_cycle_id: str | None = None,
    preferred_symbols: set[str] | None = None,
) -> tuple[Path | None, dict[str, Any]]:
    if preferred_cycle_id:
        preferred_path = cycles_dir / f"{preferred_cycle_id}.json"
        if preferred_path.exists():
            return preferred_path, read_json(preferred_path)
    files = sorted(cycles_dir.glob("cycle_*.json"))
    if not files:
        return None, {}
    if preferred_symbols:
        for path in reversed(files):
            payload = read_json(path)
            if _normalized_symbol_set(_cycle_focus_symbols(payload)) & preferred_symbols:
                return path, payload
    path = files[-1]
    return path, read_json(path)


def recent_cycles(cycles_dir: Path, limit: int = 5, *, preferred_symbols: set[str] | None = None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    files = list(sorted(cycles_dir.glob("cycle_*.json")))
    selected: list[tuple[Path, dict[str, Any]]] = []
    if preferred_symbols:
        matched: list[tuple[Path, dict[str, Any]]] = []
        fallback: list[tuple[Path, dict[str, Any]]] = []
        for path in reversed(files):
            payload = read_json(path)
            if _normalized_symbol_set(_cycle_focus_symbols(payload)) & preferred_symbols:
                matched.append((path, payload))
            else:
                fallback.append((path, payload))
        selected = matched[:limit] or fallback[:limit]
    else:
        selected = [(path, read_json(path)) for path in reversed(files[-limit:])]
    for path, payload in selected:
        decision = payload.get("decision") if isinstance(payload.get("decision"), dict) else {}
        items.append(
            {
                "cycle_id": path.stem,
                "path": str(path),
                "phase": decision.get("phase") or payload.get("phase") or "-",
                "focus_symbols": decision.get("focus_symbols") or [],
                "next_scan_seconds": decision.get("next_scan_seconds"),
                "market_summary": decision.get("market_summary") or "",
            }
        )
    return items


def positions_count(positions: Any) -> int:
    return len(positions) if isinstance(positions, list) else 0


def orders_count(orders: Any) -> int:
    return len(orders) if isinstance(orders, list) else 0


def _trim_text(value: Any, limit: int = 140) -> str:
    text = " ".join(str(value or "-").split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def _format_money(value: Any) -> str:
    try:
        return f"${float(value):,.2f}"
    except Exception:
        return str(value or "-")


def _format_price(value: Any) -> str:
    try:
        price = float(str(value).replace(",", "").replace("$", ""))
    except Exception:
        return str(value or "-")
    if abs(price) >= 100:
        return f"{price:,.2f}"
    if abs(price) >= 1:
        return f"{price:,.4f}"
    return f"{price:,.5f}"


def _primary_balance_entry(balance_rows: list[Any]) -> dict[str, Any]:
    for item in balance_rows:
        if isinstance(item, dict):
            return item
    return {}


def _repair_execution_bundle(exchange: str, bundle: dict[str, Any]) -> dict[str, Any]:
    """对 execution 聚合结果做保守回退，避免单点超时误报不可交易。"""
    bot_summary = bundle.get("bot_summary") if isinstance(bundle.get("bot_summary"), dict) else {}
    can_trade = bundle.get("can_trade") if isinstance(bundle.get("can_trade"), dict) else {}
    live_context = bundle.get("live_context") if isinstance(bundle.get("live_context"), dict) else {}
    balance_rows = bundle.get("balance") if isinstance(bundle.get("balance"), list) else []
    positions = bundle.get("positions") if isinstance(bundle.get("positions"), list) else []
    orders = bundle.get("orders") if isinstance(bundle.get("orders"), list) else []

    if (not can_trade or can_trade.get("_error")) and "can_trade" in bot_summary:
        bundle["can_trade"] = {
            "can_trade": bool(bot_summary.get("can_trade")),
            "reason": str(bot_summary.get("can_trade_reason") or "OK"),
            "source": "bot_summary_fallback",
        }
        can_trade = bundle["can_trade"]

    if exchange == "ctrader" and (not live_context or live_context.get("_error")):
        balance_entry = _primary_balance_entry(balance_rows)
        allocation = bot_summary.get("config") if isinstance(bot_summary.get("config"), dict) else {}
        account_summary = {
            "total_balance": balance_entry.get("balance"),
            "available_balance": balance_entry.get("available"),
            "total_unrealized_pnl": balance_entry.get("unrealized_pnl"),
            "total_margin_balance": balance_entry.get("total_margin_balance") or balance_entry.get("balance"),
            "position_count": len(positions),
            "open_order_count": len(orders),
            "margin_ratio": balance_entry.get("margin_ratio"),
            "can_trade": can_trade.get("can_trade"),
        }
        bundle["live_context"] = {
            "exchange": exchange,
            "requested_symbols": bundle.get("symbols") or [],
            "account_balance": balance_entry.get("balance"),
            "account_available": balance_entry.get("available"),
            "allocation": allocation,
            "account_summary": account_summary,
            "source": "runtime_fallback",
        }

    return bundle


def _fetch_execution_bundle(
    *,
    exchange: str,
    base_url: str,
    execution_bot_id: str,
    symbols: list[str],
    include_positions: bool,
    include_orders: bool,
    include_bot_summary: bool,
    include_can_trade: bool,
    include_balance: bool,
    include_live_context: bool,
    allow_ctrader_retry: bool,
) -> dict[str, Any]:
    """并发拉取单个 execution target 的运行态快照。"""
    is_ctrader = exchange == "ctrader"
    health = http_get(base_url, "/health", timeout=6 if is_ctrader else 4)
    bundle = {
        "exchange": exchange,
        "base_url": base_url,
        "health": health,
        "positions": [] if include_positions else [],
        "orders": [] if include_orders else [],
        "bot_summary": {},
        "can_trade": {"can_trade": False, "reason": health.get("_error") or "service_unavailable"} if include_can_trade and isinstance(health, dict) and health.get("_error") else {},
        "balance": [],
        "live_context": {"exchange": exchange, "requested_symbols": symbols, "_error": health.get("_error")} if include_live_context and isinstance(health, dict) and health.get("_error") else {},
        "symbols": symbols,
    }
    if isinstance(health, dict) and health.get("_error"):
        return _repair_execution_bundle(exchange, bundle)

    timeout_profile = {
        "positions": 8 if is_ctrader else 6,
        "orders": 8 if is_ctrader else 6,
        "bot_summary": 10 if is_ctrader else 8,
        "can_trade": 10 if is_ctrader else 8,
        "balance": 10 if is_ctrader else 8,
        "live_context": 12 if is_ctrader else 8,
    }

    def _fetch_item(name: str) -> tuple[str, Any]:
        if name == "positions":
            return name, http_get(base_url, "/positions", timeout=timeout_profile[name])
        if name == "orders":
            return name, http_get(base_url, "/orders/open", timeout=timeout_profile[name])
        if name == "bot_summary":
            return name, http_get(base_url, f"/trading/bot-summary/{execution_bot_id}", timeout=timeout_profile[name])
        if name == "can_trade":
            return name, http_get(base_url, f"/trading/can-trade/{execution_bot_id}", timeout=timeout_profile[name])
        if name == "balance":
            return name, http_get(base_url, "/balance", timeout=timeout_profile[name])
        return name, http_get(
            base_url,
            f"/trading/live-context/{execution_bot_id}",
            {"symbols": ",".join(symbols)},
            timeout=timeout_profile[name],
        )

    item_names: list[str] = []
    if include_positions:
        item_names.append("positions")
    if include_orders:
        item_names.append("orders")
    if include_bot_summary:
        item_names.append("bot_summary")
    if include_can_trade:
        item_names.append("can_trade")
    if include_balance:
        item_names.append("balance")
    if include_live_context:
        item_names.append("live_context")
    if not item_names:
        return _repair_execution_bundle(exchange, bundle)
    with ThreadPoolExecutor(max_workers=len(item_names)) as pool:
        for name, payload in pool.map(_fetch_item, item_names):
            bundle[name] = payload

    if is_ctrader and allow_ctrader_retry:
        if include_bot_summary and (not bundle["bot_summary"] or bundle["bot_summary"].get("_error")):
            bundle["bot_summary"] = http_get(base_url, f"/trading/bot-summary/{execution_bot_id}", timeout=12)
        if include_can_trade and (not bundle["can_trade"] or bundle["can_trade"].get("_error")):
            bundle["can_trade"] = http_get(base_url, f"/trading/can-trade/{execution_bot_id}", timeout=10)
        if include_balance and (not bundle["balance"] or (isinstance(bundle["balance"], dict) and bundle["balance"].get("_error"))):
            bundle["balance"] = http_get(base_url, "/balance", timeout=12)
        if include_live_context and (not bundle["live_context"] or bundle["live_context"].get("_error")):
            bundle["live_context"] = http_get(
                base_url,
                f"/trading/live-context/{execution_bot_id}",
                {"symbols": ",".join(symbols)},
                timeout=12,
            )

    return _repair_execution_bundle(exchange, bundle)


def _execution_fetch_profile(view: str) -> dict[str, bool]:
    """按视图裁剪 execution 聚合深度，避免 overview 为了重详情阻塞。"""
    normalized_view = str(view or "full").strip().lower() or "full"
    if normalized_view in {"overview", "audit", "system", "settings"}:
        return {
            "include_positions": False,
            "include_orders": False,
            "include_bot_summary": False,
            "include_can_trade": False,
            "include_balance": False,
            "include_live_context": False,
            "allow_ctrader_retry": False,
        }
    if normalized_view in {"orders", "review"}:
        return {
            "include_positions": False,
            "include_orders": True,
            "include_bot_summary": False,
            "include_can_trade": False,
            "include_balance": False,
            "include_live_context": False,
            "allow_ctrader_retry": False,
        }
    if normalized_view == "accounts":
        return {
            "include_positions": True,
            "include_orders": True,
            "include_bot_summary": True,
            "include_can_trade": False,
            "include_balance": True,
            "include_live_context": False,
            "allow_ctrader_retry": False,
        }
    return {
        "include_positions": True,
        "include_orders": True,
        "include_bot_summary": True,
        "include_can_trade": False,
        "include_balance": True,
        "include_live_context": False,
        "allow_ctrader_retry": True,
    }


def _side_cn(value: Any) -> str:
    return {
        "BUY": "做多",
        "LONG": "做多",
        "SELL": "做空",
        "SHORT": "做空",
    }.get(str(value or "").upper(), str(value or "-"))


def _status_cn(value: Any) -> str:
    return {
        "watching": "继续观察",
        "pre_signal": "预信号",
        "entry_ready": "候选单",
        "entry_ready_blocked": "候选单（规则待通过）",
        "executable": "可执行单",
        "in_trade": "持仓中",
        "manage": "正在管理",
        "cooldown": "冷却中",
    }.get(str(value or "").lower(), str(value or "-"))


def _compact_ts(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "-"
    if "T" in text:
        date_part, time_part = text.split("T", 1)
        return f"{date_part} {time_part[:5]}"
    return text[:16]


def _latest_live_bar(board: dict[str, Any]) -> tuple[dict[str, Any], str]:
    """优先展示更接近实时的 K 线时间，但不改策略本身的 5m 结构判断。"""
    live_frames = board.get("live_timeframes") if isinstance(board.get("live_timeframes"), dict) else {}
    for timeframe in ("1m", "5m", "15m", "1h"):
        frame = live_frames.get(timeframe) if isinstance(live_frames, dict) else {}
        latest_bar = frame.get("latest_bar") if isinstance(frame, dict) else {}
        if isinstance(latest_bar, dict) and latest_bar:
            return latest_bar, timeframe
    return {}, "-"


def _brooks_rule_conclusion(patch: dict[str, Any]) -> str:
    entry_idea = patch.get("entry_idea") if isinstance(patch.get("entry_idea"), dict) else {}
    evaluation = patch.get("evaluation") if isinstance(patch.get("evaluation"), dict) else {}
    planned_trade = patch.get("planned_trade") if isinstance(patch.get("planned_trade"), dict) else {}
    brooks_filter = patch.get("brooks_filter") if isinstance(patch.get("brooks_filter"), dict) else {}
    primary = (
        brooks_filter.get("summary")
        or entry_idea.get("filter_summary")
        or evaluation.get("risk")
        or patch.get("thesis")
        or "-"
    )
    rule = (
        brooks_filter.get("brooks_rule")
        or entry_idea.get("brooks_rule")
        or evaluation.get("brooks_rule")
        or ""
    )
    upgrade = (
        planned_trade.get("upgrade_condition")
        or brooks_filter.get("upgrade_condition")
        or entry_idea.get("upgrade_condition")
        or ""
    )
    parts = [_trim_text(primary, 80)]
    if rule and rule not in str(primary):
        parts.append("规则 " + _trim_text(rule, 42))
    if upgrade and upgrade not in str(primary) and upgrade not in str(rule):
        parts.append("下一步 " + _trim_text(upgrade, 42))
    return " | ".join(parts[:3])


def _watchdog_state(path: Path) -> dict[str, Any]:
    return read_json(path)


def _latest_failure_summary(runtime: dict[str, Any], watchdog: dict[str, Any]) -> tuple[str | None, str | None]:
    failure_at = runtime.get("last_failure_at")
    failure_reason = runtime.get("last_failure_reason")
    watchdog_reason = watchdog.get("reason")
    watchdog_at = watchdog.get("checked_at")
    if not failure_at and watchdog_reason and str(watchdog.get("health") or "").upper() == "DEGRADED":
        failure_at = watchdog_at
        failure_reason = watchdog_reason
    return (str(failure_at) if failure_at else None, str(failure_reason) if failure_reason else None)


def _cycle_health(latest_cycle_age_seconds: int | None, stale_seconds: int, patrol_live: bool) -> tuple[bool | None, bool]:
    if latest_cycle_age_seconds is None:
        return (None, patrol_live)
    cycle_fresh = latest_cycle_age_seconds <= stale_seconds
    return (cycle_fresh, patrol_live and not cycle_fresh)


def runtime_snapshot(root: Path, execution_base: str, execution_bot_id: str, view: str = "full") -> dict[str, Any]:
    normalized_view = str(view or "full").strip().lower() or "full"
    data_dir = root / "data" / "pa_trader"
    state_file = data_dir / "state" / "runtime_state.json"
    next_scan_file = data_dir / "state" / "next_scan.json"
    session_state_file = data_dir / "state" / "decision_session.json"
    cycles_dir = data_dir / "cycles"
    decision_log = data_dir / "journal" / "decision_log.jsonl"
    execution_log = data_dir / "journal" / "execution_log.jsonl"
    request_path = data_dir / "logs" / "decision" / "last_request.md"
    run_dir = data_run_dir(root)
    run_pid = run_dir / "service.pid"
    run_log = run_dir / "service.log"
    query_pid = run_dir / "query-service.pid"
    query_log = run_dir / "query-service.log"
    watchdog_pid = run_dir / "watchdog.pid"
    watchdog_log = run_dir / "watchdog.log"
    watchdog_state_file = run_dir / "watchdog-state.json"
    loop_label = os.getenv("AB_PATROL_LAUNCHD_LOOP_LABEL", "ai.abpatrol.loop").strip() or "ai.abpatrol.loop"
    query_label = os.getenv("AB_PATROL_LAUNCHD_QUERY_LABEL", "ai.abpatrol.query").strip() or "ai.abpatrol.query"
    watchdog_label = os.getenv("AB_PATROL_LAUNCHD_WATCHDOG_LABEL", "ai.abpatrol.watchdog").strip() or "ai.abpatrol.watchdog"

    runtime = read_json(state_file)
    current_symbols = _runtime_symbol_universe(runtime)
    runtime = prune_runtime_state(runtime, current_symbols)
    cycle_symbol_scope = current_symbols if normalized_view in {"full", "system"} else None
    next_scan = read_json(next_scan_file)
    session_state = read_json(session_state_file)
    cycle_path, cycle = latest_cycle(
        cycles_dir,
        preferred_cycle_id=str(runtime.get("last_cycle_id") or "").strip() or None,
        preferred_symbols=cycle_symbol_scope or None,
    )
    decision_tail = read_jsonl_tail(decision_log, limit=5)
    execution_tail = read_jsonl_tail(execution_log, limit=5)
    watchdog_state = _watchdog_state(watchdog_state_file)

    patrol_pid = _pid_from_file(run_pid) or _launchd_pid(loop_label)
    patrol_live = _pid_alive(patrol_pid)
    patrol_command = _process_command(patrol_pid)

    query_pid_value = _pid_from_file(query_pid) or _launchd_pid(query_label)
    query_live = _pid_alive(query_pid_value) or port_open(8086)

    watchdog_pid_value = _pid_from_file(watchdog_pid) or _launchd_pid(watchdog_label)
    watchdog_live = _pid_alive(watchdog_pid_value)

    latest_cycle_mtime = None
    latest_cycle_age_seconds = None
    if cycle_path and cycle_path.exists():
        try:
            latest_cycle_mtime = cycle_path.stat().st_mtime
            latest_cycle_age_seconds = max(0, int(_now_ts() - latest_cycle_mtime))
        except OSError:
            latest_cycle_mtime = None
            latest_cycle_age_seconds = None

    latest_cycle_decision = (cycle.get("decision") or {}) if isinstance(cycle, dict) else {}
    latest_cycle_state_patch = (
        latest_cycle_decision.get("state_patch") if isinstance(latest_cycle_decision.get("state_patch"), dict) else {}
    )
    latest_knowledge = (
        latest_cycle_state_patch.get("knowledge_loading")
        if isinstance(latest_cycle_state_patch.get("knowledge_loading"), dict)
        else {}
    )
    request_text = read_text(request_path)
    request_chars = len(request_text)
    request_size_bytes = request_path.stat().st_size if request_path.exists() else 0
    session_bootstrapped_at = session_state.get("bootstrapped_at")
    session_last_used_at = session_state.get("last_used_at")
    session_age_seconds = None
    if session_bootstrapped_at:
        try:
            session_age_seconds = max(0, int(_now_ts() - float(session_bootstrapped_at)))
        except (TypeError, ValueError):
            session_age_seconds = None
    monitoring = {
        "knowledge_chars": latest_knowledge.get("knowledge_chars"),
        "refs_count": int(latest_knowledge.get("full_reference_count") or 0)
        + int(latest_knowledge.get("brief_reference_count") or 0),
        "full_refs_count": int(latest_knowledge.get("full_reference_count") or 0),
        "brief_refs_count": int(latest_knowledge.get("brief_reference_count") or 0),
        "request_chars": request_chars,
        "request_size_bytes": request_size_bytes,
        "session_age_seconds": session_age_seconds,
        "session_turn_count": session_state.get("turn_count"),
        "session_thread_id": session_state.get("thread_id"),
        "session_model": session_state.get("model"),
        "session_bootstrapped_at": session_bootstrapped_at,
        "session_last_used_at": session_last_used_at,
        "skill_mode": latest_knowledge.get("skill_mode"),
        "skill_sections": latest_knowledge.get("skill_sections") if isinstance(latest_knowledge.get("skill_sections"), list) else [],
    }

    targets = build_execution_targets(root, _configured_exchange(), execution_base)
    execution_services: dict[str, Any] = {}
    combined_positions: list[dict[str, Any]] = []
    combined_orders: list[dict[str, Any]] = []
    primary_exchange = _configured_exchange()
    primary_bundle: dict[str, Any] = {}
    requested_symbols = list(current_symbols) or (runtime.get("focus_symbols") or [])
    execution_profile = _execution_fetch_profile(view)
    target_items = list(targets.items())

    def _fetch_target(item: tuple[str, dict[str, Any]]) -> tuple[str, str, dict[str, Any]]:
        exchange, target = item
        base_url = str(target.get("base_url") or "").rstrip("/")
        symbols = [str(symbol).upper() for symbol in (target.get("symbols") or []) if str(symbol).strip()]
        bundle = _fetch_execution_bundle(
            exchange=exchange,
            base_url=base_url,
            execution_bot_id=execution_bot_id,
            symbols=symbols or requested_symbols,
            include_positions=execution_profile["include_positions"],
            include_orders=execution_profile["include_orders"],
            include_bot_summary=execution_profile["include_bot_summary"],
            include_can_trade=execution_profile["include_can_trade"],
            include_balance=execution_profile["include_balance"],
            include_live_context=execution_profile["include_live_context"],
            allow_ctrader_retry=execution_profile["allow_ctrader_retry"],
        )
        return exchange, base_url, bundle

    with ThreadPoolExecutor(max_workers=max(1, len(target_items))) as pool:
        fetched_targets = list(pool.map(_fetch_target, target_items))

    for exchange, base_url, bundle in fetched_targets:
        execution_services[exchange] = bundle
        if exchange == primary_exchange:
            primary_bundle = bundle
        for item in bundle.get("positions") if isinstance(bundle.get("positions"), list) else []:
            if isinstance(item, dict):
                combined_positions.append({**item, "exchange": exchange, "execution_base": base_url})
        for item in bundle.get("orders") if isinstance(bundle.get("orders"), list) else []:
            if isinstance(item, dict):
                combined_orders.append({**item, "exchange": exchange, "execution_base": base_url})

    execution = {
        "health": primary_bundle.get("health") or {},
        "positions": combined_positions,
        "orders": combined_orders,
        "can_trade": primary_bundle.get("can_trade") or {},
        "balance": primary_bundle.get("balance") or [],
        "live_context": primary_bundle.get("live_context") or {},
        "services": execution_services,
    }
    if patrol_command:
        runtime["dry_run"] = "--execute" not in patrol_command
    elif runtime.get("dry_run") is None:
        runtime["dry_run"] = True
    stale_seconds = int(os.getenv("AB_PATROL_WATCHDOG_STALE_SECONDS", "900"))
    cycle_fresh, stale_but_running = _cycle_health(latest_cycle_age_seconds, stale_seconds, patrol_live)
    last_failure_at, last_failure_reason = _latest_failure_summary(runtime, watchdog_state)
    overall_health = "DOWN"
    if patrol_live or query_live or watchdog_live:
        overall_health = "DEGRADED"
    if patrol_live and query_live and watchdog_live and execution.get("health", {}).get("status") == "healthy" and cycle_fresh is True:
        overall_health = "HEALTHY"
    snapshot = {
        "root": str(root),
        "runtime": runtime,
        "next_scan": next_scan,
        "latest_cycle_path": str(cycle_path) if cycle_path else None,
        "latest_cycle": cycle,
        "decision_tail": decision_tail,
        "execution_tail": execution_tail,
        "patrol_pid": patrol_pid,
        "patrol_live": patrol_live,
        "patrol_command": patrol_command,
        "query_pid": query_pid_value,
        "query_live": query_live,
        "watchdog_pid": watchdog_pid_value,
        "watchdog_live": watchdog_live,
        "run_log": str(run_log),
        "query_log": str(query_log),
        "watchdog_log": str(watchdog_log),
        "execution": execution,
        "execution_port_open": any(
            port_open(urllib.parse.urlparse(str(service.get("base_url") or "")).port or 8092)
            for service in execution_services.values()
            if isinstance(service, dict)
        ),
        "recent_cycles": recent_cycles(cycles_dir, limit=5, preferred_symbols=cycle_symbol_scope or None),
        "latest_cycle_mtime": latest_cycle_mtime,
        "latest_cycle_age_seconds": latest_cycle_age_seconds,
        "stale_seconds": stale_seconds,
        "cycle_fresh": cycle_fresh,
        "stale_but_running": stale_but_running,
        "overall_health": overall_health,
        "last_success_at": runtime.get("last_success_at"),
        "last_failure_at": last_failure_at,
        "last_failure_reason": last_failure_reason,
        "watchdog_state": watchdog_state,
        "monitoring": monitoring,
    }
    return snapshot


def render_status_card(snapshot: dict[str, Any]) -> str:
    runtime = snapshot["runtime"]
    execution = snapshot["execution"]
    can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
    positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
    orders = execution.get("orders") if isinstance(execution.get("orders"), list) else []
    live_context = execution.get("live_context") if isinstance(execution.get("live_context"), dict) else {}
    services = execution.get("services") if isinstance(execution.get("services"), dict) else {}
    account_summary = live_context.get("account_summary") if isinstance(live_context.get("account_summary"), dict) else {}
    allocation = live_context.get("allocation") if isinstance(live_context.get("allocation"), dict) else {}
    symbol_constraints = live_context.get("symbol_constraints") if isinstance(live_context.get("symbol_constraints"), list) else []
    decision = (snapshot.get("latest_cycle") or {}).get("decision") or {}
    next_scan = snapshot.get("next_scan") if isinstance(snapshot.get("next_scan"), dict) else {}
    overall_health = snapshot.get("overall_health") or "-"
    cycle_fresh = snapshot.get("cycle_fresh")
    freshness_text = "新鲜" if cycle_fresh is True else ("陈旧" if cycle_fresh is False else "待确认")
    last_success_at = snapshot.get("last_success_at") or "-"
    last_failure_at = snapshot.get("last_failure_at") or "-"
    last_failure_reason = snapshot.get("last_failure_reason") or "-"
    runtime_exchange = str(runtime.get("exchange") or execution.get("health", {}).get("exchange") or "").lower()
    runtime_profile = str(runtime.get("market_profile") or "").lower()
    title_text = "PA交易 实盘状态"
    if runtime_exchange == "ctrader" or "multi" in runtime_profile:
        title_text = "PA交易 Multi-Asset 状态"
    elif runtime_exchange == "okx" or "swap" in runtime_profile:
        title_text = "PA交易 OKX 状态"
    focus_symbols = [str(item).upper() for item in (runtime.get("focus_symbols") or decision.get("focus_symbols") or []) if str(item).strip()]
    symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
    balance_rows = execution.get("balance") if isinstance(execution.get("balance"), list) else []
    balance_head = balance_rows[0] if balance_rows else {}
    balance_total = (
        live_context.get("account_balance")
        or balance_head.get("balance")
        or balance_head.get("wallet_balance")
        or "-"
    )
    balance_available = (
        live_context.get("account_available")
        or balance_head.get("available")
        or balance_head.get("available_balance")
        or balance_total
    )
    candidate_count = 0
    executable_count = 0
    for patch in symbol_updates.values():
        if not isinstance(patch, dict):
            continue
        status = str(patch.get("status") or "").lower()
        if status in {"entry_ready", "entry_ready_blocked"}:
            candidate_count += 1
        elif status == "executable":
            executable_count += 1
    focus_lines: list[str] = []
    for symbol in focus_symbols:
        patch = symbol_updates.get(symbol) if isinstance(symbol_updates.get(symbol), dict) else {}
        status_text = _status_cn(patch.get("status"))
        brooks_text = _brooks_rule_conclusion(patch) if patch else "-"
        latest_price = "-"
        latest_time = "-"
        latest_cycle = snapshot.get("latest_cycle") if isinstance(snapshot.get("latest_cycle"), dict) else {}
        analysis_board = latest_cycle.get("analysis_board") if isinstance(latest_cycle.get("analysis_board"), dict) else {}
        board = analysis_board.get(symbol) if isinstance(analysis_board.get(symbol), dict) else {}
        latest_bar, latest_tf = _latest_live_bar(board)
        if isinstance(latest_bar, dict):
            latest_price = _format_price(latest_bar.get("C"))
            latest_time = _compact_ts(latest_bar.get("time"))
        tf_text = latest_tf if latest_tf and latest_tf != "-" else "K线"
        focus_lines.append(f"• {symbol}: {status_text} | 现价 {latest_price} | {brooks_text} | {tf_text} {latest_time}")
    constraint_lines = []
    for item in symbol_constraints:
        if not isinstance(item, dict):
            continue
        constraint_lines.append(
            f"• {item.get('symbol')}: 步长 {item.get('quantity_step') or '-'} | 最小量 {item.get('min_quantity') or '-'} | 有效杠杆 {item.get('effective_leverage') or '-'}x"
        )
    account_lines: list[str] = []
    for exchange, service in services.items():
        if not isinstance(service, dict):
            continue
        service_live = service.get("live_context") if isinstance(service.get("live_context"), dict) else {}
        service_balance_rows = service.get("balance") if isinstance(service.get("balance"), list) else []
        service_balance = service_balance_rows[0] if service_balance_rows else {}
        service_can_trade = service.get("can_trade") if isinstance(service.get("can_trade"), dict) else {}
        service_total = (
            service_balance.get("balance")
            or service_balance.get("wallet_balance")
            or service_balance.get("account_balance")
            or service_live.get("account_balance")
            or "-"
        )
        service_available = (
            service_balance.get("available_balance")
            or service_balance.get("available")
            or service_balance.get("account_available")
            or service_live.get("account_available")
            or service_total
        )
        account_lines.append(
            f"• {str(exchange).upper()}: {_format_money(service_total)} / {_format_money(service_available)} | {'可交易' if service_can_trade.get('can_trade') else '受限'} ({service_can_trade.get('reason') or '-'})"
        )
    lines = [
        title_text,
        "",
        "账户",
        f"• 交易所/模式: {runtime_exchange or '-'} | {live_context.get('mode') or '-'} | Bot {runtime.get('bot_id') or '-'}",
        f"• 健康/可交易: {overall_health} | {can_trade.get('can_trade')} ({can_trade.get('reason') or 'OK'})",
        f"• 余额/可用: {_format_money(balance_total)} / {_format_money(balance_available)}",
        f"• 今日成交/持仓: {account_summary.get('today_trade_count') or 0} / {positions_count(positions)}",
        f"• 配置风控: 风险 {allocation.get('risk_percent') or '-'}% | 最大杠杆 {allocation.get('max_leverage') or '-'}x | 单笔保证金上限 {allocation.get('max_margin_pct_per_order') or '-'}%",
        *(["", "账户总览", *account_lines] if account_lines else []),
        "",
        "运行",
        f"• Patrol/Query/Execution: {'UP' if snapshot['patrol_live'] else 'DOWN'} / {'UP' if snapshot['query_live'] else 'DOWN'} / {'UP' if snapshot['execution_port_open'] else 'DOWN'}",
        f"• 阶段/焦点: {runtime.get('current_phase') or decision.get('phase') or '-'} | {', '.join(focus_symbols) or '-'}",
        f"• Dry Run / Fresh: {runtime.get('dry_run', True)} / {freshness_text}",
        f"• 最近成功: {last_success_at}",
        f"• 最近失败: {last_failure_at or '-'} | {_trim_text(last_failure_reason or '-', 120)}",
        "",
        "本轮结论",
        f"• {_trim_text(decision.get('market_summary') or runtime.get('last_scan_decision') or '-', 220)}",
        f"• 候选/可执行/挂单: {candidate_count} / {executable_count} / {orders_count(orders)}",
        "",
        "观察清单",
        *(focus_lines or ["• 当前没有焦点品种。"]),
        "",
        "约束",
        *(constraint_lines or ["• 当前没有品种约束快照。"]),
        "",
        "调度",
        f"• 最新 cycle: {snapshot.get('latest_cycle_path') or '-'}",
        f"• cycle age: {snapshot.get('latest_cycle_age_seconds') if snapshot.get('latest_cycle_age_seconds') is not None else '-'}s",
        f"• 下轮扫描: {next_scan.get('in_seconds') or '-'}s | {_trim_text(next_scan.get('reason_text') or next_scan.get('reason_code') or '-', 100)}",
        f"• 分桶规则: {_trim_text(next_scan.get('bucket_rule') or '-', 100)}",
    ]
    return "\n".join(lines)


def render_recent_text(snapshot: dict[str, Any]) -> str:
    rows = ["最近 5 轮巡逻"]
    for item in snapshot.get("recent_cycles") or []:
        focus = ", ".join(item.get("focus_symbols") or []) or "-"
        rows.append(
            f"- {item.get('cycle_id')} | {item.get('phase')} | {item.get('next_scan_seconds') or '-'}s | {focus}"
        )
        summary = str(item.get("market_summary") or "").strip()
        if summary:
            rows.append(f"  {summary[:180]}")
    return "\n".join(rows)
