"""运行时状态与执行快照管理。"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from utils import load_json, parse_dt, shrink_prompt_value, write_json

LOG = logging.getLogger("ab_patrol_runtime")
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


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso() -> str:
    return utc_now().isoformat()


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


class StateManagerMixin:
    """封装运行态缓存、预信号 TTL 与执行快照读取。"""

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
            "tracked_orders": self.http_post_json("/trading/track-orders"),
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
