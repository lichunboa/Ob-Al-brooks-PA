#!/usr/bin/env python3
"""Local control entry for PA交易 Crypto."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.env_loader import load_agent_env
from runtime.status_common import render_recent_text, render_status_card, runtime_snapshot


load_agent_env(ROOT)

START_SCRIPT = ROOT / "scripts" / "start.sh"
DATA_DIR = ROOT / "data" / "pa_trader"
STATE_FILE = DATA_DIR / "state" / "runtime_state.json"
NEXT_SCAN_FILE = DATA_DIR / "state" / "next_scan.json"
CYCLES_DIR = DATA_DIR / "cycles"
DECISION_LOG = DATA_DIR / "journal" / "decision_log.jsonl"
EXECUTION_LOG = DATA_DIR / "journal" / "execution_log.jsonl"
RUN_LOG = ROOT / "run" / "service.log"
QUERY_LOG = ROOT / "run" / "query-service.log"
DOC_PATH = ROOT / "README.md"


def _execution_base() -> str:
    import os

    return os.getenv("AB_PATROL_EXECUTION_BASE", "http://127.0.0.1:8092").strip() or "http://127.0.0.1:8092"


def _execution_bot_id() -> str:
    import os

    return os.getenv("AB_PATROL_EXECUTION_BOT_ID", "claude-pa").strip() or "claude-pa"


def _query_base() -> str:
    import os

    return os.getenv("AB_PATROL_QUERY_BASE", "http://127.0.0.1:8086").strip() or "http://127.0.0.1:8086"


def _run(args: list[str], cwd: Path | None = None, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd) if cwd else None,
        text=True,
        capture_output=True,
        timeout=timeout,
    )


def _query_get(path: str, query: dict[str, Any] | None = None) -> Any:
    url = _query_base().rstrip("/") + path
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError):
        return None


def _local_snapshot() -> dict[str, Any]:
    return runtime_snapshot(ROOT, execution_base=_execution_base(), execution_bot_id=_execution_bot_id())


def _status_text() -> str:
    payload = _query_get("/api/v1/runtime/card")
    if isinstance(payload, dict) and payload.get("text"):
        return str(payload["text"])
    return render_status_card(_local_snapshot())


def _recent_text(limit: int = 5) -> str:
    payload = _query_get("/api/v1/runtime/recent", {"limit": limit})
    if isinstance(payload, dict) and payload.get("text"):
        return str(payload["text"])
    snapshot = _local_snapshot()
    return render_recent_text({"recent_cycles": (snapshot.get("recent_cycles") or [])[:limit]})


def _decision_payload() -> dict[str, Any]:
    payload = _query_get("/api/v1/runtime/decision")
    if isinstance(payload, dict) and payload.get("decision") is not None:
        return payload
    snapshot = _local_snapshot()
    return {
        "cycle_path": snapshot.get("latest_cycle_path"),
        "decision": ((snapshot.get("latest_cycle") or {}).get("decision") or {}),
    }


def cmd_status() -> int:
    print(_status_text())
    return 0


def cmd_recent() -> int:
    print(_recent_text())
    return 0


def cmd_decision() -> int:
    payload = _decision_payload()
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def cmd_paths() -> int:
    payload = {
        "root": str(ROOT),
        "data_dir": str(DATA_DIR),
        "runtime_state": str(STATE_FILE),
        "next_scan": str(NEXT_SCAN_FILE),
        "cycles_dir": str(CYCLES_DIR),
        "decision_log": str(DECISION_LOG),
        "execution_log": str(EXECUTION_LOG),
        "run_log": str(RUN_LOG),
        "query_log": str(QUERY_LOG),
        "doc": str(DOC_PATH),
        "query_base": _query_base(),
        "execution_base": _execution_base(),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


def cmd_start(extra: list[str]) -> int:
    result = _run(["bash", str(START_SCRIPT), "start", *extra], cwd=ROOT)
    print((result.stdout or result.stderr or "").strip())
    return result.returncode


def cmd_stop() -> int:
    result = _run(["bash", str(START_SCRIPT), "stop"], cwd=ROOT)
    print((result.stdout or result.stderr or "").strip())
    return result.returncode


def cmd_restart(extra: list[str]) -> int:
    result = _run(["bash", str(START_SCRIPT), "restart", *extra], cwd=ROOT)
    print((result.stdout or result.stderr or "").strip())
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description="PA交易 Crypto local controller")
    parser.add_argument("command", choices=["status", "card", "recent", "decision", "paths", "start", "stop", "restart"])
    parser.add_argument("extra", nargs="*")
    args = parser.parse_args()

    if args.command in {"status", "card"}:
        return cmd_status()
    if args.command == "recent":
        return cmd_recent()
    if args.command == "decision":
        return cmd_decision()
    if args.command == "paths":
        return cmd_paths()
    if args.command == "start":
        return cmd_start(args.extra)
    if args.command == "stop":
        return cmd_stop()
    if args.command == "restart":
        return cmd_restart(args.extra)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
