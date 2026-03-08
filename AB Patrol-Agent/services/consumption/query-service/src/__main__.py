#!/usr/bin/env python3
"""AB Patrol-Agent Query Service."""

from __future__ import annotations

import os
import signal
import sys
from pathlib import Path

from fastapi import FastAPI, Query
import uvicorn


ROOT = Path(__file__).resolve().parents[4]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.env_loader import load_agent_env
from runtime.status_common import render_recent_text, render_status_card, runtime_snapshot


load_agent_env(ROOT)

EXECUTION_BASE = os.getenv("AB_PATROL_EXECUTION_BASE", "http://127.0.0.1:8092").strip()
EXECUTION_BOT_ID = os.getenv("AB_PATROL_EXECUTION_BOT_ID", "claude-pa").strip()
HOST = os.getenv("AB_PATROL_QUERY_HOST", "127.0.0.1").strip()
PORT = int(os.getenv("AB_PATROL_QUERY_PORT", "8086"))
RUN_DIR = ROOT / "run"
PID_FILE = RUN_DIR / "query-service.pid"

app = FastAPI(title="AB Patrol-Agent Query Service", version="0.1.0")


def build_snapshot() -> dict:
    snapshot = runtime_snapshot(ROOT, execution_base=EXECUTION_BASE, execution_bot_id=EXECUTION_BOT_ID)
    snapshot["query_live"] = True
    snapshot["query_pid"] = os.getpid()
    return snapshot


@app.get("/health")
def health() -> dict:
    snapshot = build_snapshot()
    return {
        "ok": True,
        "query_service": True,
        "patrol_live": snapshot.get("patrol_live"),
        "execution_port_open": snapshot.get("execution_port_open"),
    }


@app.get("/api/v1/runtime/status")
def status() -> dict:
    return build_snapshot()


@app.get("/api/v1/runtime/card")
def card() -> dict:
    snapshot = build_snapshot()
    return {"text": render_status_card(snapshot), "snapshot": snapshot}


@app.get("/api/v1/runtime/recent")
def recent(limit: int = Query(default=5, ge=1, le=20)) -> dict:
    snapshot = build_snapshot()
    recent_rows = (snapshot.get("recent_cycles") or [])[:limit]
    return {"items": recent_rows, "text": render_recent_text({"recent_cycles": recent_rows})}


@app.get("/api/v1/runtime/decision")
def decision() -> dict:
    snapshot = build_snapshot()
    latest_cycle = snapshot.get("latest_cycle") or {}
    return {
        "cycle_path": snapshot.get("latest_cycle_path"),
        "decision": latest_cycle.get("decision") or {},
    }


@app.get("/api/v1/runtime/full")
def full() -> dict:
    snapshot = build_snapshot()
    latest_cycle = snapshot.get("latest_cycle") or {}
    recent_rows = (snapshot.get("recent_cycles") or [])[:5]
    return {
        "snapshot": snapshot,
        "card": render_status_card(snapshot),
        "recent": {
            "items": recent_rows,
            "text": render_recent_text({"recent_cycles": recent_rows}),
        },
        "decision": {
            "cycle_path": snapshot.get("latest_cycle_path"),
            "decision": latest_cycle.get("decision") or {},
        },
    }


def _write_pid() -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")


def _cleanup(*_: object) -> None:
    PID_FILE.unlink(missing_ok=True)
    raise SystemExit(0)


def main() -> int:
    signal.signal(signal.SIGTERM, _cleanup)
    signal.signal(signal.SIGINT, _cleanup)
    _write_pid()
    try:
        uvicorn.run(app, host=HOST, port=PORT, log_level="info")
    finally:
        PID_FILE.unlink(missing_ok=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
