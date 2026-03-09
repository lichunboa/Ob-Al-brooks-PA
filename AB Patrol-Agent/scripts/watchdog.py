#!/usr/bin/env python3
"""AB Patrol-Agent watchdog.

Checks whether the patrol loop is stale and restarts the loop/query stack if needed.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from runtime.env_loader import load_agent_env


load_agent_env(ROOT)

RUN_DIR = ROOT / "run"
DATA_DIR = ROOT / "data" / "pa_trader"
PID_FILE = RUN_DIR / "watchdog.pid"
LOG_FILE = RUN_DIR / "watchdog.log"
STATE_FILE = RUN_DIR / "watchdog-state.json"
SERVICE_PID = RUN_DIR / "service.pid"
QUERY_PID = RUN_DIR / "query-service.pid"
SERVICE_LOG = RUN_DIR / "service.log"
DECISION_LOG_DIR = DATA_DIR / "logs" / "decision"
START_SCRIPT = ROOT / "scripts" / "start.sh"
QUERY_HEALTH_URL = "http://127.0.0.1:8086/api/v1/runtime/card"

CHECK_INTERVAL = int(os.getenv("AB_PATROL_WATCHDOG_CHECK_INTERVAL", "60"))
STALE_SECONDS = int(os.getenv("AB_PATROL_WATCHDOG_STALE_SECONDS", "900"))
RECOVERY_COOLDOWN = int(os.getenv("AB_PATROL_WATCHDOG_RECOVERY_COOLDOWN", "180"))
AUTO_RESTART_HOURS = float(os.getenv("AB_PATROL_WATCHDOG_AUTO_RESTART_HOURS", "3.0"))
TELEGRAM_FORWARD_URL = os.getenv("AB_PATROL_TELEGRAM_FORWARD_URL", "").strip()
TELEGRAM_CHAT_ID = os.getenv("AB_PATROL_TELEGRAM_CHAT_ID", "-1003512657369").strip() or "-1003512657369"
TELEGRAM_THREAD_ID = int(os.getenv("AB_PATROL_TELEGRAM_THREAD_ID", "3"))


def setup_logging() -> logging.Logger:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="[%(asctime)s] %(levelname)s %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )
    return logging.getLogger("ab_patrol_watchdog")


log = setup_logging()


def _pid_alive(path: Path) -> bool:
    if not path.exists():
        return False
    try:
        pid = int(path.read_text(encoding="utf-8").strip())
        os.kill(pid, 0)
        return True
    except Exception:
        return False


def _query_alive() -> bool:
    if _pid_alive(QUERY_PID):
        return True
    try:
        with urllib.request.urlopen(QUERY_HEALTH_URL, timeout=3) as response:
            return response.status == 200
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return False


def _read_pid(path: Path) -> int | None:
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return int(raw) if raw.isdigit() else None


def _terminate_pid(pid: int, label: str) -> bool:
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return False
    deadline = time.time() + 8
    while time.time() < deadline:
        try:
            os.kill(pid, 0)
        except OSError:
            log.info("%s stopped gracefully (pid=%s)", label, pid)
            return True
        time.sleep(0.5)
    try:
        os.kill(pid, signal.SIGKILL)
    except OSError:
        log.info("%s already exited before SIGKILL (pid=%s)", label, pid)
        return True
    log.warning("%s force killed (pid=%s)", label, pid)
    return True


def _latest_cycle_path() -> Path | None:
    cycles_dir = DATA_DIR / "cycles"
    files = sorted(cycles_dir.glob("cycle_*.json"))
    return files[-1] if files else None


def _latest_activity_age() -> tuple[int | None, str]:
    cycle_path = _latest_cycle_path()
    if cycle_path and cycle_path.exists():
        try:
            latest_ts = cycle_path.stat().st_mtime
            return max(0, int(time.time() - latest_ts)), f"cycle:{cycle_path.name}"
        except OSError:
            pass
    candidates: list[tuple[float, str]] = []
    for path in (
        DECISION_LOG_DIR / "last_response.json",
        DECISION_LOG_DIR / "last_decision.json",
        DECISION_LOG_DIR / "_codex_last_message.txt",
        SERVICE_LOG,
    ):
        if not path.exists():
            continue
        try:
            candidates.append((path.stat().st_mtime, path.name))
        except OSError:
            continue
    if not candidates:
        return None, "no-activity"
    latest_ts, label = max(candidates, key=lambda item: item[0])
    return max(0, int(time.time() - latest_ts)), label


def _notify(message: str) -> None:
    if not TELEGRAM_FORWARD_URL:
        return
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "message_thread_id": TELEGRAM_THREAD_ID,
        "text": message,
    }
    raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        TELEGRAM_FORWARD_URL,
        data=raw,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=8):
            return
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return


def _write_state(payload: dict) -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(STATE_FILE)


def _run_start_command(*args: str, timeout: int = 90) -> tuple[bool, str]:
    result = subprocess.run(
        ["bash", str(START_SCRIPT), *args],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    output = (result.stdout or result.stderr or "").strip()
    return result.returncode == 0, output[:800]


def _recover(reason: str, loop_alive: bool, query_alive: bool) -> bool:
    log.warning("watchdog recovery start: %s", reason)
    actions: list[str] = []
    ok = True

    if reason.startswith("stale:"):
        pid = _read_pid(SERVICE_PID)
        if pid:
            actions.append("bounce-loop")
            _notify(f"🛠️ PA交易 Crypto watchdog 接管\n原因: {reason}\n动作: 杀掉卡住的 loop，让 Terminal 长会话自动续跑")
            ok = _terminate_pid(pid, "patrol loop") and ok
        else:
            actions.append("loop-start")
            step_ok, output = _run_start_command("loop-start", timeout=90)
            ok = step_ok and ok
            if not step_ok:
                log.error("watchdog loop-start failed: %s", output)
        if not query_alive:
            actions.append("query-start")
            step_ok, output = _run_start_command("query-start", timeout=60)
            ok = step_ok and ok
            if not step_ok:
                log.error("watchdog query-start failed: %s", output)
    else:
        if not loop_alive:
            actions.append("loop-start")
            step_ok, output = _run_start_command("loop-start", timeout=90)
            ok = step_ok and ok
            if not step_ok:
                log.error("watchdog loop-start failed: %s", output)
        if not query_alive:
            actions.append("query-start")
            step_ok, output = _run_start_command("query-start", timeout=60)
            ok = step_ok and ok
            if not step_ok:
                log.error("watchdog query-start failed: %s", output)
        if reason == "no_cycle_yet" and loop_alive and query_alive:
            pid = _read_pid(SERVICE_PID)
            if pid:
                actions.append("bounce-loop")
                ok = _terminate_pid(pid, "patrol loop") and ok

    if ok:
        action_text = ", ".join(actions) if actions else "none"
        log.info("watchdog recovery success | actions=%s", action_text)
        _notify(f"✅ PA交易 Crypto watchdog 恢复完成\n动作: {action_text}")
    else:
        _notify(f"❌ PA交易 Crypto watchdog 恢复失败\n原因: {reason}")
    return ok


def _write_pid() -> None:
    PID_FILE.write_text(str(os.getpid()), encoding="utf-8")


def _cleanup(*_: object) -> None:
    try:
        PID_FILE.unlink(missing_ok=True)
    finally:
        raise SystemExit(0)


def run() -> int:
    signal.signal(signal.SIGTERM, _cleanup)
    signal.signal(signal.SIGINT, _cleanup)
    _write_pid()
    last_recovery_at = 0.0
    loop_start_time = time.time()
    log.info(
        "watchdog started | interval=%ss stale=%ss cooldown=%ss auto_restart=%sh",
        CHECK_INTERVAL,
        STALE_SECONDS,
        RECOVERY_COOLDOWN,
        AUTO_RESTART_HOURS,
    )
    while True:
        loop_alive = _pid_alive(SERVICE_PID)
        query_alive = _query_alive()
        age_seconds, age_label = _latest_activity_age()
        uptime_hours = (time.time() - loop_start_time) / 3600.0
        reason = None
        if not loop_alive:
            reason = "loop_down"
        elif not query_alive:
            reason = "query_down"
        elif age_seconds is None:
            reason = "no_cycle_yet"
        elif age_seconds > STALE_SECONDS:
            reason = f"stale:{age_seconds}s:{age_label}"
        elif uptime_hours >= AUTO_RESTART_HOURS:
            reason = f"auto_restart:{uptime_hours:.1f}h"
            log.info("watchdog auto-restart triggered | uptime=%sh", uptime_hours)

        state_payload = {
            "checked_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "loop_alive": loop_alive,
            "query_alive": query_alive,
            "age_seconds": age_seconds,
            "age_label": age_label,
            "reason": reason,
            "health": "HEALTHY",
            "last_recovery_at": None,
            "last_recovery_reason": None,
        }
        if reason:
            remaining = RECOVERY_COOLDOWN - (time.time() - last_recovery_at)
            state_payload["health"] = "DEGRADED"
            log.warning(
                "watchdog trigger | reason=%s | loop=%s | query=%s | age=%s",
                reason,
                loop_alive,
                query_alive,
                age_seconds,
            )
            if remaining <= 0:
                if _recover(reason, loop_alive, query_alive):
                    last_recovery_at = time.time()
                    if reason.startswith("auto_restart:"):
                        loop_start_time = time.time()
                    state_payload["health"] = "RECOVERING"
                    state_payload["last_recovery_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                    state_payload["last_recovery_reason"] = reason
            else:
                log.info("watchdog cooldown active: %ss", int(remaining))
        else:
            log.info("watchdog ok | age=%ss via %s", age_seconds, age_label)
        _write_state(state_payload)
        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    raise SystemExit(run())
