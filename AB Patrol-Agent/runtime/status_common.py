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
from pathlib import Path
from typing import Any


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


def classify_trade_funnel(snapshot: dict[str, Any], hours: int = 48) -> dict[str, Any]:
    root = Path(str(snapshot["root"]))
    cycles_dir = root / "data" / "pa_trader" / "cycles"
    cutoff = time.time() - max(1, hours) * 3600

    counts = {
        "no_candidate": 0,
        "pre_signal_only": 0,
        "candidate_gate_rejected": 0,
        "candidate_execution_failed": 0,
        "candidate_pending": 0,
        "filled": 0,
    }
    themes = {
        "浅 PB 失效": 0,
        "顶部失败未完成": 0,
        "first PB 未完成": 0,
        "P×R 不通过": 0,
        "gate 格式问题": 0,
        "顺势 first PB 候选被格式链挡住": 0,
        "TR 边缘测试未确认": 0,
        "反转试探未被接受": 0,
        "反抽失败条件未完成": 0,
        "坏楔形/弱 MTR": 0,
        "强突破环境下逆势不做": 0,
        "交易区间中部无优势": 0,
        "40%反转仅够 scalp": 0,
        "TBTL 反转未完成": 0,
        "限价单环境未到边缘": 0,
    }
    samples: list[dict[str, Any]] = []

    for path in sorted(cycles_dir.glob("cycle_*.json")):
        try:
            if path.stat().st_mtime < cutoff:
                continue
        except OSError:
            continue
        payload = read_json(path)
        decision = payload.get("decision") if isinstance(payload.get("decision"), dict) else {}
        actions = decision.get("actions") if isinstance(decision.get("actions"), list) else []
        execution_results = payload.get("execution_results") if isinstance(payload.get("execution_results"), list) else []
        symbol_updates = decision.get("symbol_updates") if isinstance(decision.get("symbol_updates"), dict) else {}
        summary_text = json.dumps(decision.get("market_summary"), ensure_ascii=False) if decision.get("market_summary") else ""

        open_action = next(
            (
                item
                for item in actions
                if isinstance(item, dict) and str(item.get("type") or "").upper() == "OPEN_ORDER"
            ),
            None,
        )
        open_result = next(
            (
                item
                for item in execution_results
                if isinstance(item, dict) and str(item.get("type") or "").upper() == "OPEN_ORDER"
            ),
            None,
        )

        bucket = "no_candidate"
        if open_result:
            status = str(open_result.get("status") or "").upper()
            message = str(open_result.get("message") or "")
            if status in {"FILLED", "PLACED", "NEW", "OPEN", "PARTIALLY_FILLED"} and bool(open_result.get("success")):
                bucket = "filled"
            elif status == "VALIDATION_REJECTED":
                bucket = "candidate_gate_rejected"
                if "无法解析 Trader" in message or "格式应为" in message:
                    themes["gate 格式问题"] += 1
                if "盈亏比" in message or "P×R" in message:
                    themes["P×R 不通过"] += 1
            else:
                bucket = "candidate_execution_failed"
        elif open_action:
            bucket = "candidate_pending"
        else:
            statuses = {
                str(item.get("status") or "").lower()
                for item in symbol_updates.values()
                if isinstance(item, dict)
            }
            if statuses & {"pre_signal", "entry_ready", "entry_ready_blocked"}:
                bucket = "pre_signal_only"

        for symbol, patch in symbol_updates.items():
            if not isinstance(patch, dict):
                continue
            brooks_filter = patch.get("brooks_filter") if isinstance(patch.get("brooks_filter"), dict) else {}
            brooks_label = str(brooks_filter.get("label") or "").strip()
            thesis = str(patch.get("thesis") or "")
            structure = str(patch.get("structure_summary") or "")
            market_state = str(patch.get("market_state") or "")
            pre_signal = patch.get("pre_signal")
            pre_signal_text = json.dumps(pre_signal, ensure_ascii=False) if isinstance(pre_signal, dict) else str(pre_signal or "")
            combined = " ".join([summary_text, thesis, structure, market_state, pre_signal_text])

            if brooks_label in themes:
                themes[brooks_label] += 1

            if any(token in combined for token in ("第一次正常 PB", "first PB", "首次正常回踩", "首次正常回抽")):
                if bucket in {"candidate_gate_rejected", "candidate_pending", "candidate_execution_failed"}:
                    themes["顺势 first PB 候选被格式链挡住"] += 1
                elif bucket == "pre_signal_only":
                    themes["first PB 未完成"] += 1
            if any(token in combined for token in ("TR", "区间", "tr_edge", "下沿", "上沿")):
                if bucket in {"no_candidate", "pre_signal_only"}:
                    themes["TR 边缘测试未确认"] += 1
            if any(token in combined for token in ("TR", "区间", "中部", "range middle", "middle of range")):
                if bucket in {"no_candidate", "pre_signal_only"} and not any(
                    token in combined for token in ("tr_edge:top", "tr_edge:bottom", "上沿", "下沿")
                ):
                    themes["交易区间中部无优势"] += 1
            if any(token in combined for token in ("双底", "双顶", "楔形", "wedge", "MTR", "reversal", "反转")):
                if bucket in {"no_candidate", "pre_signal_only", "candidate_gate_rejected"}:
                    themes["反转试探未被接受"] += 1
                    themes["40%反转仅够 scalp"] += 1
            if any(token in combined for token in ("TBTL", "十条腿", "两波", "two legs", "双底", "双顶")):
                if bucket in {"no_candidate", "pre_signal_only", "candidate_gate_rejected"}:
                    themes["TBTL 反转未完成"] += 1
            if any(token in combined for token in ("坏楔形", "bad wedge", "弱 MTR", "weak MTR")):
                themes["坏楔形/弱 MTR"] += 1
            if any(token in combined for token in ("等待回抽", "等待反抽", "pullback fail", "回抽失败", "反抽失败")):
                if bucket in {"pre_signal_only", "candidate_pending"}:
                    themes["反抽失败条件未完成"] += 1
            if any(token in combined for token in ("BO", "突破", "always in", "AIS", "AIB")) and any(
                token in combined for token in ("双底", "双顶", "楔形", "wedge", "MTR", "reversal", "反转")
            ):
                if bucket in {"no_candidate", "pre_signal_only", "candidate_gate_rejected"}:
                    themes["强突破环境下逆势不做"] += 1
            if any(token in combined for token in ("限价单", "limit order", "BLSH", "sell high", "buy low")):
                if bucket in {"no_candidate", "pre_signal_only"} and not any(
                    token in combined for token in ("tr_edge:top", "tr_edge:bottom", "上沿", "下沿")
                ):
                    themes["限价单环境未到边缘"] += 1

        for item in execution_results:
            if not isinstance(item, dict):
                continue
            message = str(item.get("message") or "")
            if "浅 PB" in message:
                themes["浅 PB 失效"] += 1
            if "顶部失败" in message and "没完成" in message:
                themes["顶部失败未完成"] += 1
            if "first PB" in message and ("仍在继续" in message or "未完成" in message):
                themes["first PB 未完成"] += 1
        counts[bucket] += 1
        if bucket != "no_candidate" and len(samples) < 8:
            samples.append(
                {
                    "cycle_id": payload.get("cycle_id") or path.stem,
                    "bucket": bucket,
                    "summary": decision.get("market_summary"),
                    "symbol": (open_result or open_action or {}).get("symbol"),
                    "open_action": open_action,
                    "open_result": open_result,
                }
            )

    return {
        "lookback_hours": hours,
        "counts": counts,
        "themes": themes,
        "samples": samples,
    }


def render_trade_funnel_text(funnel: dict[str, Any]) -> str:
    counts = funnel.get("counts") or {}
    themes = funnel.get("themes") or {}
    rows = [
        f"最近 {funnel.get('lookback_hours', 48)} 小时交易漏斗",
        f"- 无候选: {counts.get('no_candidate', 0)}",
        f"- 有预信号未到候选单: {counts.get('pre_signal_only', 0)}",
        f"- 候选单被 gate 拒绝: {counts.get('candidate_gate_rejected', 0)}",
        f"- 候选单执行失败: {counts.get('candidate_execution_failed', 0)}",
        f"- 候选单待执行/未落执行结果: {counts.get('candidate_pending', 0)}",
        f"- 已成交: {counts.get('filled', 0)}",
        "",
        "无单主题归因",
        f"- 浅 PB 失效: {themes.get('浅 PB 失效', 0)}",
        f"- 顶部失败未完成: {themes.get('顶部失败未完成', 0)}",
        f"- first PB 未完成: {themes.get('first PB 未完成', 0)}",
        f"- P×R 不通过: {themes.get('P×R 不通过', 0)}",
        f"- gate 格式问题: {themes.get('gate 格式问题', 0)}",
        f"- 顺势 first PB 候选被格式链挡住: {themes.get('顺势 first PB 候选被格式链挡住', 0)}",
        f"- TR 边缘测试未确认: {themes.get('TR 边缘测试未确认', 0)}",
        f"- 反转试探未被接受: {themes.get('反转试探未被接受', 0)}",
        f"- 反抽失败条件未完成: {themes.get('反抽失败条件未完成', 0)}",
        f"- 坏楔形/弱 MTR: {themes.get('坏楔形/弱 MTR', 0)}",
        f"- 强突破环境下逆势不做: {themes.get('强突破环境下逆势不做', 0)}",
        f"- 交易区间中部无优势: {themes.get('交易区间中部无优势', 0)}",
        f"- 40%反转仅够 scalp: {themes.get('40%反转仅够 scalp', 0)}",
        f"- TBTL 反转未完成: {themes.get('TBTL 反转未完成', 0)}",
        f"- 限价单环境未到边缘: {themes.get('限价单环境未到边缘', 0)}",
    ]
    samples = funnel.get("samples") or []
    if samples:
        rows.append("")
        rows.append("候选单样本")
        for item in samples[:5]:
            rows.append(
                f"- {item.get('cycle_id')} | {item.get('symbol') or '-'} | {item.get('bucket')} | {str(item.get('summary') or '')[:120]}"
            )
    return "\n".join(rows)


def runtime_snapshot(root: Path, execution_base: str, execution_bot_id: str, *, include_funnel: bool = False) -> dict[str, Any]:
    data_dir = root / "data" / "pa_trader"
    state_file = data_dir / "state" / "runtime_state.json"
    next_scan_file = data_dir / "state" / "next_scan.json"
    session_state_file = data_dir / "state" / "decision_session.json"
    cycles_dir = data_dir / "cycles"
    decision_log = data_dir / "journal" / "decision_log.jsonl"
    execution_log = data_dir / "journal" / "execution_log.jsonl"
    request_path = data_dir / "logs" / "decision" / "last_request.md"
    run_pid = root / "run" / "service.pid"
    run_log = root / "run" / "service.log"
    query_pid = root / "run" / "query-service.pid"
    query_log = root / "run" / "query-service.log"
    watchdog_pid = root / "run" / "watchdog.pid"
    watchdog_log = root / "run" / "watchdog.log"
    watchdog_state_file = root / "run" / "watchdog-state.json"
    loop_label = os.getenv("AB_PATROL_LAUNCHD_LOOP_LABEL", "ai.abpatrol.loop").strip() or "ai.abpatrol.loop"
    query_label = os.getenv("AB_PATROL_LAUNCHD_QUERY_LABEL", "ai.abpatrol.query").strip() or "ai.abpatrol.query"
    watchdog_label = os.getenv("AB_PATROL_LAUNCHD_WATCHDOG_LABEL", "ai.abpatrol.watchdog").strip() or "ai.abpatrol.watchdog"

    runtime = read_json(state_file)
    next_scan = read_json(next_scan_file)
    session_state = read_json(session_state_file)
    cycle_path, cycle = latest_cycle(cycles_dir)
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

    execution = {
        "health": http_get(execution_base, "/health"),
        "positions": http_get(execution_base, "/positions"),
        "orders": http_get(execution_base, "/orders/open"),
        "can_trade": http_get(execution_base, f"/trading/can-trade/{execution_bot_id}"),
        "balance": http_get(execution_base, "/balance"),
    }
    if runtime.get("dry_run") is None:
        runtime["dry_run"] = "--execute" not in patrol_command if patrol_command else True
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
        "execution_port_open": port_open(8092),
        "recent_cycles": recent_cycles(cycles_dir, limit=5),
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
    if include_funnel:
        snapshot["trade_funnel"] = classify_trade_funnel({"root": str(root)})
    return snapshot


def render_status_card(snapshot: dict[str, Any]) -> str:
    runtime = snapshot["runtime"]
    execution = snapshot["execution"]
    monitoring = snapshot.get("monitoring") if isinstance(snapshot.get("monitoring"), dict) else {}
    can_trade = execution.get("can_trade") if isinstance(execution.get("can_trade"), dict) else {}
    positions = execution.get("positions") if isinstance(execution.get("positions"), list) else []
    orders = execution.get("orders") if isinstance(execution.get("orders"), list) else []
    decision = (snapshot.get("latest_cycle") or {}).get("decision") or {}
    summary = decision.get("market_summary") or runtime.get("last_scan_decision") or "-"
    if isinstance(summary, dict):
        summary = summary.get("decision") or summary.get("summary") or json.dumps(summary, ensure_ascii=False)
    active_provider = runtime.get("llm_provider") or "-"
    requested_provider = runtime.get("decision_requested_provider") or active_provider
    model = runtime.get("decision_model") or "-"
    decision_session_id = runtime.get("decision_session_id") or "-"
    next_scan = snapshot.get("next_scan") if isinstance(snapshot.get("next_scan"), dict) else {}
    overall_health = snapshot.get("overall_health") or "-"
    cycle_fresh = snapshot.get("cycle_fresh")
    stale_but_running = bool(snapshot.get("stale_but_running"))
    freshness_text = "新鲜" if cycle_fresh is True else ("陈旧" if cycle_fresh is False else "待确认")
    last_success_at = snapshot.get("last_success_at") or "-"
    last_failure_at = snapshot.get("last_failure_at") or "-"
    last_failure_reason = snapshot.get("last_failure_reason") or "-"
    mode_label = "自动交易" if not runtime.get("dry_run", True) else "观察模式"
    lines = [
        "PA交易 Crypto",
        f"overall_health: {overall_health}",
        f"patrol: {'UP' if snapshot['patrol_live'] else 'DOWN'} | pid: {snapshot['patrol_pid'] or '-'}",
        f"query-service: {'UP' if snapshot['query_live'] else 'DOWN'} | pid: {snapshot['query_pid'] or '-'}",
        f"watchdog: {'UP' if snapshot['watchdog_live'] else 'DOWN'} | pid: {snapshot['watchdog_pid'] or '-'}",
        f"cycle_fresh: {freshness_text} | stale_but_running: {stale_but_running}",
        f"execution-service: {'UP' if snapshot['execution_port_open'] else 'DOWN'}",
        f"provider: active={active_provider} | requested={requested_provider} | model={model}",
        f"decision_session: {decision_session_id}",
        (
            f"context_monitor: knowledge={monitoring.get('knowledge_chars') or '-'} chars"
            f" | refs={monitoring.get('refs_count') or 0}"
            f" | request={monitoring.get('request_chars') or '-'} chars"
            f" | session_age={monitoring.get('session_age_seconds') or '-'}s"
        ),
        f"phase: {runtime.get('current_phase') or decision.get('phase') or '-'}",
        f"focus: {', '.join(runtime.get('focus_symbols') or []) or '-'}",
        f"can_trade: {can_trade.get('can_trade')} | reason: {can_trade.get('reason') or 'OK'}",
        f"positions: {positions_count(positions)} | open_orders: {orders_count(orders)} | mode: {mode_label} | dry_run: {runtime.get('dry_run', True)}",
        f"latest_cycle: {snapshot.get('latest_cycle_path') or '-'}",
        f"cycle_age: {snapshot.get('latest_cycle_age_seconds') if snapshot.get('latest_cycle_age_seconds') is not None else '-'}s",
        f"next_scan: {next_scan.get('in_seconds') or '-'}s | {next_scan.get('reason_code') or next_scan.get('reason_text') or '-'}",
        f"next_scan_model: {next_scan.get('model_suggested_seconds') or next_scan.get('requested_seconds') or '-'}s | {next_scan.get('model_suggested_reason') or '-'}",
        f"next_scan_rule: {next_scan.get('bucket_rule') or '-'}",
        f"next_scan_refs: {', '.join(str(item) for item in (next_scan.get('bucket_source_refs') or [])[:4]) or '-'}",
        f"last_success_at: {last_success_at}",
        f"last_failure_at: {last_failure_at}",
        f"last_failure_reason: {last_failure_reason}",
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
