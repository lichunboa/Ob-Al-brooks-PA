#!/usr/bin/env python3
"""Shared status/query helpers for AB Patrol-Agent."""

from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


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


def port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1.0)
        return sock.connect_ex((host, port)) == 0


def http_get(base: str, path: str, query: dict[str, Any] | None = None) -> Any:
    url = base.rstrip("/") + path
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    try:
        with urllib.request.urlopen(url, timeout=12) as response:
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


def latest_cycle(cycles_dir: Path) -> tuple[Path | None, dict[str, Any]]:
    files = sorted(cycles_dir.glob("cycle_*.json"))
    if not files:
        return None, {}
    path = files[-1]
    return path, read_json(path)


def recent_cycles(cycles_dir: Path, limit: int = 5) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for path in sorted(cycles_dir.glob("cycle_*.json"))[-limit:]:
        payload = read_json(path)
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
    return list(reversed(items))


def positions_count(positions: Any) -> int:
    return len(positions) if isinstance(positions, list) else 0


def orders_count(orders: Any) -> int:
    return len(orders) if isinstance(orders, list) else 0


def runtime_snapshot(root: Path, execution_base: str, execution_bot_id: str) -> dict[str, Any]:
    data_dir = root / "data" / "pa_trader"
    state_file = data_dir / "state" / "runtime_state.json"
    next_scan_file = data_dir / "state" / "next_scan.json"
    cycles_dir = data_dir / "cycles"
    decision_log = data_dir / "journal" / "decision_log.jsonl"
    execution_log = data_dir / "journal" / "execution_log.jsonl"
    run_pid = root / "run" / "service.pid"
    run_log = root / "run" / "service.log"
    query_pid = root / "run" / "query-service.pid"
    query_log = root / "run" / "query-service.log"
    watchdog_pid = root / "run" / "watchdog.pid"
    watchdog_log = root / "run" / "watchdog.log"
    loop_label = os.getenv("AB_PATROL_LAUNCHD_LOOP_LABEL", "ai.abpatrol.loop").strip() or "ai.abpatrol.loop"
    query_label = os.getenv("AB_PATROL_LAUNCHD_QUERY_LABEL", "ai.abpatrol.query").strip() or "ai.abpatrol.query"
    watchdog_label = os.getenv("AB_PATROL_LAUNCHD_WATCHDOG_LABEL", "ai.abpatrol.watchdog").strip() or "ai.abpatrol.watchdog"

    runtime = read_json(state_file)
    next_scan = read_json(next_scan_file)
    cycle_path, cycle = latest_cycle(cycles_dir)
    decision_tail = read_jsonl_tail(decision_log, limit=5)
    execution_tail = read_jsonl_tail(execution_log, limit=5)

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
            import time
            latest_cycle_age_seconds = max(0, int(time.time() - latest_cycle_mtime))
        except OSError:
            latest_cycle_mtime = None
            latest_cycle_age_seconds = None

    execution = {
        "health": http_get(execution_base, "/health"),
        "positions": http_get(execution_base, "/positions"),
        "orders": http_get(execution_base, "/orders/open"),
        "can_trade": http_get(execution_base, f"/trading/can-trade/{execution_bot_id}"),
        "balance": http_get(execution_base, "/balance"),
    }
    if runtime.get("dry_run") is None:
        runtime["dry_run"] = "--execute" not in patrol_command if patrol_command else True
    return {
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
        "execution_port_open": port_open(8092),
        "recent_cycles": recent_cycles(cycles_dir, limit=5),
        "latest_cycle_mtime": latest_cycle_mtime,
        "latest_cycle_age_seconds": latest_cycle_age_seconds,
    }


def render_status_card(snapshot: dict[str, Any]) -> str:
    runtime = snapshot["runtime"]
    execution = snapshot["execution"]
    can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
    positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
    orders = execution.get("orders") if isinstance(execution.get("orders"), list) else []
    decision = (snapshot.get("latest_cycle") or {}).get("decision") or {}
    summary = decision.get("market_summary") or runtime.get("last_scan_decision") or "-"
    active_provider = runtime.get("llm_provider") or "-"
    requested_provider = runtime.get("decision_requested_provider") or active_provider
    model = runtime.get("decision_model") or "-"
    decision_session_id = runtime.get("decision_session_id") or "-"
    next_scan = snapshot.get("next_scan") if isinstance(snapshot.get("next_scan"), dict) else {}
    lines = [
        "PA交易 Crypto",
        f"patrol: {'UP' if snapshot['patrol_live'] else 'DOWN'} | pid: {snapshot['patrol_pid'] or '-'}",
        f"query-service: {'UP' if snapshot['query_live'] else 'DOWN'} | pid: {snapshot['query_pid'] or '-'}",
        f"watchdog: {'UP' if snapshot['watchdog_live'] else 'DOWN'} | pid: {snapshot['watchdog_pid'] or '-'}",
        f"execution-service: {'UP' if snapshot['execution_port_open'] else 'DOWN'}",
        f"provider: active={active_provider} | requested={requested_provider} | model={model}",
        f"decision_session: {decision_session_id}",
        f"phase: {runtime.get('current_phase') or decision.get('phase') or '-'}",
        f"focus: {', '.join(runtime.get('focus_symbols') or []) or '-'}",
        f"can_trade: {can_trade.get('can_trade')} | reason: {can_trade.get('reason') or 'OK'}",
        f"positions: {positions_count(positions)} | open_orders: {orders_count(orders)} | dry_run: {runtime.get('dry_run', True)}",
        f"latest_cycle: {snapshot.get('latest_cycle_path') or '-'}",
        f"cycle_age: {snapshot.get('latest_cycle_age_seconds') if snapshot.get('latest_cycle_age_seconds') is not None else '-'}s",
        f"next_scan: {next_scan.get('in_seconds') or '-'}s | {next_scan.get('reason_code') or next_scan.get('reason_text') or '-'}",
        "",
        "本轮结论",
        str(summary).strip(),
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
