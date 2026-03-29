#!/usr/bin/env python3
"""live follow-up / re-entry 状态同步。"""

from __future__ import annotations

import logging
import re
from datetime import timedelta
from typing import Any

from utils import (
    normalize_trade_side,
    parse_dt,
    safe_float,
    utc_iso,
    utc_now,
)


LOG = logging.getLogger(__name__)
TIMEFRAME_PATTERN = re.compile(r"\b(5m|15m|30m|1h)\b", re.IGNORECASE)


def _infer_signal_timeframe(*values: Any) -> str:
    """在 follow-up 模块内本地推断周期，避免依赖外部兼容导出。"""
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
    return "15m"


class LiveFollowupStateMixin:
    """抽离 live follow-up / re-entry 状态同步逻辑。"""

    @staticmethod
    def _protection_geometry_valid(direction: str, entry_price: float, stop_loss: float, take_profit: float) -> bool:
        """校验恢复出来的保护价是否与真实持仓几何一致。"""
        side = str(direction or "").upper()
        entry = safe_float(entry_price, 0.0)
        stop = safe_float(stop_loss, 0.0)
        target = safe_float(take_profit, 0.0)
        if entry <= 0 or stop <= 0 or target <= 0 or side not in {"BUY", "SELL"}:
            return False
        if side == "BUY":
            return stop < entry < target
        return target < entry < stop

    @staticmethod
    def _same_market_state_family(current: str, previous: str) -> bool:
        """强/弱趋势与宽/紧区间允许视作同一前提族。"""
        current_key = str(current or "").strip()
        previous_key = str(previous or "").strip()
        if not current_key or not previous_key or current_key == previous_key:
            return True
        bull_family = {"strong_trend_bull", "weak_trend_bull"}
        bear_family = {"strong_trend_bear", "weak_trend_bear"}
        range_family = {"tight_range", "broad_range"}
        return (
            (current_key in bull_family and previous_key in bull_family)
            or (current_key in bear_family and previous_key in bear_family)
            or (current_key in range_family and previous_key in range_family)
        )

    @staticmethod
    def _reentry_window_seconds(timeframe: str) -> int:
        """把回测的 bars 窗口折成 live 的时间窗口。"""
        if timeframe == "15m":
            return 45 * 60
        if timeframe == "30m":
            return 90 * 60
        if timeframe == "1h":
            return 120 * 60
        return 25 * 60

    def _infer_followup_timeframe(self, symbol_state: dict[str, Any], fallback: str = "15m") -> str:
        """从当前信号缓存推断 follow-up 所属周期。"""
        if not isinstance(symbol_state, dict):
            return fallback
        planned_trade = symbol_state.get("planned_trade") if isinstance(symbol_state.get("planned_trade"), dict) else {}
        pre_signal = symbol_state.get("pre_signal") if isinstance(symbol_state.get("pre_signal"), dict) else {}
        meta = symbol_state.get("pre_signal_meta") if isinstance(symbol_state.get("pre_signal_meta"), dict) else {}
        timeframe = _infer_signal_timeframe(
            meta.get("timeframe"),
            pre_signal,
            symbol_state.get("signal"),
            symbol_state.get("stage"),
            {},
            symbol_state.get("market_state_detail"),
            planned_trade.get("signal_timeframe") or planned_trade.get("timeframe") or fallback,
        )
        return str(timeframe or fallback).lower()

    def _build_followup_seed(
        self,
        *,
        symbol: str,
        side: Any,
        symbol_state: dict[str, Any] | None,
        existing_seed: dict[str, Any] | None = None,
        entry_price: float = 0.0,
        stop_loss: float = 0.0,
        take_profit: float = 0.0,
        timeframe: str = "",
        strategy: str = "",
        style: str = "",
        playbook_hint: str = "",
        playbook_id: str = "",
        reentry_attempt: int = 0,
    ) -> dict[str, Any]:
        """统一构建 live follow-up 种子。"""
        symbol_key = str(symbol or "").upper()
        current_state = symbol_state if isinstance(symbol_state, dict) else {}
        existing = existing_seed if isinstance(existing_seed, dict) else {}
        planned_trade = (
            current_state.get("planned_trade")
            if isinstance(current_state.get("planned_trade"), dict)
            else {}
        )
        entry_idea = current_state.get("entry_idea") if isinstance(current_state.get("entry_idea"), dict) else {}
        direction = normalize_trade_side(side or existing.get("direction"))
        if not symbol_key or direction not in {"BUY", "SELL"}:
            return {}

        resolved_entry = safe_float(entry_price or existing.get("entry_price"), 0.0)
        if resolved_entry <= 0:
            return {}

        seed = {
            "symbol": symbol_key,
            "direction": direction,
            "entry_price": resolved_entry,
            "stop_loss": safe_float(
                stop_loss
                or planned_trade.get("stop_loss")
                or existing.get("stop_loss"),
                0.0,
            ),
            "take_profit": safe_float(
                take_profit
                or planned_trade.get("take_profit")
                or existing.get("take_profit"),
                0.0,
            ),
            "timeframe": str(
                timeframe
                or planned_trade.get("management_timeframe")
                or planned_trade.get("signal_timeframe")
                or planned_trade.get("reference_timeframe")
                or self._infer_followup_timeframe(current_state)
                or existing.get("timeframe")
                or "15m"
            ).lower(),
            "market_state": str(
                current_state.get("market_state")
                or current_state.get("state")
                or existing.get("market_state")
                or ""
            ).strip(),
            "strategy": str(
                strategy
                or existing.get("strategy")
                or planned_trade.get("strategy")
                or playbook_id
                or playbook_hint
                or ""
            ).strip(),
            "style": str(
                style
                or existing.get("style")
                or planned_trade.get("style")
                or entry_idea.get("style")
                or ""
            ).strip(),
            "playbook_hint": str(
                playbook_hint
                or existing.get("playbook_hint")
                or planned_trade.get("playbook_hint")
                or planned_trade.get("playbook_id")
                or ""
            ).strip(),
            "playbook_id": str(
                playbook_id
                or existing.get("playbook_id")
                or planned_trade.get("playbook_id")
                or playbook_hint
                or ""
            ).strip(),
            "reentry_attempt": int(
                reentry_attempt
                or existing.get("reentry_attempt")
                or planned_trade.get("reentry_attempt")
                or 0
            ),
            "updated_at": utc_iso(),
        }
        if not self._protection_geometry_valid(
            direction,
            resolved_entry,
            seed.get("stop_loss") or 0.0,
            seed.get("take_profit") or 0.0,
        ):
            live_stop = safe_float(stop_loss, 0.0)
            live_take_profit = safe_float(take_profit, 0.0)
            if self._protection_geometry_valid(direction, resolved_entry, live_stop, live_take_profit):
                seed["stop_loss"] = live_stop
                seed["take_profit"] = live_take_profit
        return seed

    def _build_followup_seed_from_position(
        self,
        position: dict[str, Any],
        symbol_state: dict[str, Any] | None,
        existing_seed: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """用 live 持仓和当前缓存恢复 follow-up 种子。"""
        symbol = str(position.get("symbol") or "").upper()
        return self._build_followup_seed(
            symbol=symbol,
            side=position.get("side"),
            symbol_state=symbol_state,
            existing_seed=existing_seed,
            entry_price=safe_float(position.get("entry_price"), 0.0),
            stop_loss=safe_float(position.get("stop_loss"), 0.0),
            take_profit=safe_float(position.get("take_profit"), 0.0),
            timeframe=str(
                position.get("management_timeframe")
                or position.get("signal_timeframe")
                or position.get("reference_timeframe")
                or position.get("timeframe")
                or ""
            ),
            strategy=str(position.get("strategy") or ""),
            style=str(position.get("style") or ""),
            playbook_hint=str(position.get("playbook_hint") or ""),
            playbook_id=str(position.get("playbook_id") or ""),
            reentry_attempt=int(position.get("reentry_attempt") or 0),
        )

    def _build_followup_seed_from_action_snapshot(
        self,
        snapshot: dict[str, Any],
        symbol_state: dict[str, Any] | None,
        existing_seed: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """用成功下单动作更新 follow-up 种子。"""
        symbol = str(snapshot.get("symbol") or "").upper()
        return self._build_followup_seed(
            symbol=symbol,
            side=snapshot.get("side"),
            symbol_state=symbol_state,
            existing_seed=existing_seed,
            entry_price=safe_float(snapshot.get("entry") or snapshot.get("entry_price"), 0.0),
            stop_loss=safe_float(snapshot.get("sl") or snapshot.get("stop_loss"), 0.0),
            take_profit=safe_float(snapshot.get("tp") or snapshot.get("take_profit"), 0.0),
            timeframe=str(
                snapshot.get("management_timeframe")
                or snapshot.get("signal_timeframe")
                or snapshot.get("reference_timeframe")
                or snapshot.get("timeframe")
                or ""
            ),
            strategy=str(snapshot.get("strategy") or ""),
            style=str(snapshot.get("style") or ""),
            playbook_hint=str(snapshot.get("playbook_hint") or ""),
            playbook_id=str(snapshot.get("playbook_id") or ""),
            reentry_attempt=int(snapshot.get("reentry_attempt") or 0),
        )

    @staticmethod
    def _is_watch_active(watch: dict[str, Any]) -> bool:
        """检查 re-entry 观察窗口是否仍然有效。"""
        expires_at = parse_dt(watch.get("expires_at"))
        if expires_at is None:
            return False
        return expires_at > utc_now()

    @staticmethod
    def _tracked_exit_event_id(change: dict[str, Any]) -> str:
        """为已消费的平仓事件生成稳定指纹。"""
        return "|".join(
            [
                str(change.get("trade_id") or ""),
                str(change.get("symbol") or "").upper(),
                str(change.get("trigger_reason") or ""),
                str(change.get("exit_price") or ""),
            ]
        )

    def _seed_allows_reentry(self, seed: dict[str, Any]) -> bool:
        """只允许 Brooks 主链 setup 进入一次性重入观察。"""
        if not isinstance(seed, dict):
            return False
        if int(seed.get("reentry_attempt") or 0) >= 1:
            return False
        playbook_key = str(seed.get("playbook_id") or seed.get("playbook_hint") or seed.get("strategy") or "").upper()
        prefixes = (
            "T1",
            "T2",
            "T3",
            "T4",
            "T5",
            "T6",
            "R1",
            "R2",
            "R3",
            "TR1",
            "TR2",
            "TR3",
            "TR4",
            "S1",
            "S2",
        )
        if any(playbook_key.startswith(prefix) for prefix in prefixes):
            return True
        return bool(str(seed.get("market_state") or "").strip() and str(seed.get("timeframe") or "").strip())

    def _build_reentry_watch(self, seed: dict[str, Any], event_id: str) -> dict[str, Any]:
        """把止损事件转换为 live 重入观察窗口。"""
        if not self._seed_allows_reentry(seed):
            return {}
        timeframe = str(seed.get("timeframe") or "15m").lower()
        next_attempt = int(seed.get("reentry_attempt") or 0) + 1
        return {
            "direction": str(seed.get("direction") or ""),
            "timeframe": timeframe,
            "market_state": str(seed.get("market_state") or ""),
            "playbook_hint": str(seed.get("playbook_hint") or ""),
            "playbook_id": str(seed.get("playbook_id") or seed.get("playbook_hint") or ""),
            "strategy": str(seed.get("strategy") or ""),
            "style": str(seed.get("style") or ""),
            "next_attempt": next_attempt,
            "created_at": utc_iso(),
            "expires_at": (utc_now() + timedelta(seconds=self._reentry_window_seconds(timeframe))).isoformat(),
            "source_event_id": event_id,
        }

    def _symbol_matches_reentry_watch(self, cached: dict[str, Any], watch: dict[str, Any]) -> bool:
        """确认当前缓存是否满足同方向、同前提族的重入条件。"""
        if not isinstance(cached, dict) or not self._is_watch_active(watch):
            return False
        planned_trade = cached.get("planned_trade") if isinstance(cached.get("planned_trade"), dict) else {}
        pre_signal = cached.get("pre_signal") if isinstance(cached.get("pre_signal"), dict) else {}
        entry_idea = cached.get("entry_idea") if isinstance(cached.get("entry_idea"), dict) else {}
        trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
        side = normalize_trade_side(
            planned_trade.get("side")
            or entry_idea.get("side")
            or pre_signal.get("side")
            or pre_signal.get("direction")
        )
        if side != str(watch.get("direction") or ""):
            return False
        timeframe = self._infer_followup_timeframe(cached, str(watch.get("timeframe") or "15m"))
        if timeframe != str(watch.get("timeframe") or "").lower():
            return False
        market_state = str(cached.get("market_state") or cached.get("state") or "").strip()
        if not self._same_market_state_family(market_state, str(watch.get("market_state") or "")):
            return False
        status = str(cached.get("status") or "").lower()
        qualified_status = {"pre_signal", "entry_ready", "entry_ready_blocked", "executable"}
        if not pre_signal and status not in qualified_status:
            return False
        entry_price = safe_float(
            planned_trade.get("entry_price")
            or trigger_price.get("entry")
            or trigger_price.get("breakout")
            or trigger_price.get("breakdown"),
            0.0,
        )
        stop_loss = safe_float(planned_trade.get("stop_loss") or trigger_price.get("stop_loss"), 0.0)
        return entry_price > 0 and stop_loss > 0

    def _apply_reentry_overlay(
        self,
        symbol_cache: dict[str, Any],
        reentry_watch: dict[str, Any],
        active_symbols: set[str],
    ) -> None:
        """把 live re-entry 计划写入缓存，供规则引擎与通知链复用。"""
        if not isinstance(symbol_cache, dict):
            return
        for symbol, watch in reentry_watch.items():
            symbol_key = str(symbol or "").upper()
            if symbol_key in active_symbols:
                continue
            cached = symbol_cache.get(symbol_key)
            if not isinstance(cached, dict):
                continue
            if not self._symbol_matches_reentry_watch(cached, watch):
                continue
            planned_trade = dict(cached.get("planned_trade") or {})
            planned_trade["intent"] = "REENTRY"
            planned_trade["risk_percent"] = planned_trade.get("risk_percent") or 0.4
            planned_trade["reentry_attempt"] = int(watch.get("next_attempt") or 1)
            planned_trade["followup_profile"] = "reentry_after_stop"
            planned_trade["reentry_candidate"] = True
            if watch.get("playbook_hint") and not planned_trade.get("playbook_hint"):
                planned_trade["playbook_hint"] = watch.get("playbook_hint")
            if watch.get("playbook_id") and not planned_trade.get("playbook_id"):
                planned_trade["playbook_id"] = watch.get("playbook_id")
            cached["planned_trade"] = planned_trade
            cached["reentry_watch"] = {
                "active": True,
                "next_attempt": int(watch.get("next_attempt") or 1),
                "expires_at": watch.get("expires_at"),
                "reason": "S7 重入：止损后同方向、同前提族观察窗口仍有效",
            }

    def _apply_followup_seed_overlay(
        self,
        symbol_cache: dict[str, Any],
        position_seeds: dict[str, Any],
        tracked_symbols: set[str],
    ) -> None:
        """把 live follow-up 种子写回缓存，供持仓管理与白名单过滤复用。"""
        if not isinstance(symbol_cache, dict):
            return
        for symbol, seed in position_seeds.items():
            symbol_key = str(symbol or "").upper()
            if tracked_symbols and symbol_key not in tracked_symbols:
                continue
            cached = symbol_cache.get(symbol_key)
            if not isinstance(cached, dict):
                continue
            cached["followup_seed"] = dict(seed) if isinstance(seed, dict) else {}

    def sync_live_followup_state(
        self,
        runtime: dict[str, Any],
        market_cache: dict[str, Any],
        execution: dict[str, Any],
        *,
        execution_results: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """同步 live add-on / re-entry 运行态，并把重入计划注入当前缓存。"""
        runtime_symbols = runtime.get("symbols") if isinstance(runtime.get("symbols"), dict) else {}
        market_symbols = market_cache.get("symbols") if isinstance(market_cache.get("symbols"), dict) else {}
        position_seeds = dict(runtime.get("position_seeds") if isinstance(runtime.get("position_seeds"), dict) else {})
        reentry_watch = {
            str(symbol).upper(): dict(watch)
            for symbol, watch in (runtime.get("reentry_watch") or {}).items()
            if isinstance(watch, dict)
        }
        processed_exit_events = [
            str(item)
            for item in (runtime.get("processed_exit_events") or [])
            if str(item).strip()
        ]
        processed_exit_set = set(processed_exit_events)

        live_positions = self._tracked_bot_positions(execution)
        active_symbols = {
            str(item.get("symbol") or "").upper()
            for item in live_positions
            if str(item.get("symbol") or "").strip()
        }
        active_order_symbols = {
            str(item.get("symbol") or "").upper()
            for item in self._tracked_bot_orders(execution)
            if str(item.get("symbol") or "").strip()
        }
        for symbol in list(reentry_watch.keys()):
            if symbol in active_symbols or not self._is_watch_active(reentry_watch[symbol]):
                reentry_watch.pop(symbol, None)

        for position in live_positions:
            symbol = str(position.get("symbol") or "").upper()
            symbol_state = runtime_symbols.get(symbol) if isinstance(runtime_symbols.get(symbol), dict) else {}
            if not symbol_state:
                symbol_state = market_symbols.get(symbol) if isinstance(market_symbols.get(symbol), dict) else {}
            seed = self._build_followup_seed_from_position(position, symbol_state, position_seeds.get(symbol))
            if seed:
                position_seeds[symbol] = seed

        tracked_orders = (
            execution.get("tracked_orders")
            if isinstance(execution.get("tracked_orders"), dict)
            else {}
        )
        status_changes = (
            tracked_orders.get("status_changes")
            if isinstance(tracked_orders.get("status_changes"), list)
            else []
        )
        for change in status_changes:
            if not isinstance(change, dict):
                continue
            if str(change.get("bot_id") or "") != self.config.execution_bot_id:
                continue
            if str(change.get("trigger_reason") or "") != "stop_loss_hit":
                continue
            symbol = str(change.get("symbol") or "").upper()
            if not symbol or symbol in active_symbols:
                continue
            event_id = self._tracked_exit_event_id(change)
            if not event_id or event_id in processed_exit_set:
                continue
            processed_exit_set.add(event_id)
            processed_exit_events.append(event_id)
            seed = position_seeds.get(symbol)
            watch = self._build_reentry_watch(seed or {}, event_id)
            if watch:
                reentry_watch[symbol] = watch
                LOG.info("[FOLLOWUP] %s 注册 live re-entry 观察窗口，attempt=%s", symbol, watch.get("next_attempt"))

        for item in execution_results or []:
            if not isinstance(item, dict):
                continue
            if str(item.get("type") or "").upper() != "OPEN_ORDER" or not item.get("success"):
                continue
            snapshot = item.get("action_snapshot") if isinstance(item.get("action_snapshot"), dict) else {}
            symbol = str(item.get("symbol") or snapshot.get("symbol") or "").upper()
            if not symbol:
                continue
            order_type = str(snapshot.get("order_type") or "").strip().upper()
            execution_mode = str(snapshot.get("execution_mode") or "").strip().upper()
            should_keep_seed = (
                symbol in active_symbols
                or symbol in active_order_symbols
                or order_type == "MARKET"
                or execution_mode == "MARKET_IMMEDIATE"
            )
            if not should_keep_seed:
                reentry_watch.pop(symbol, None)
                continue
            symbol_state = runtime_symbols.get(symbol) if isinstance(runtime_symbols.get(symbol), dict) else {}
            if not symbol_state:
                symbol_state = market_symbols.get(symbol) if isinstance(market_symbols.get(symbol), dict) else {}
            seed = self._build_followup_seed_from_action_snapshot(snapshot, symbol_state, position_seeds.get(symbol))
            if seed:
                position_seeds[symbol] = seed
            reentry_watch.pop(symbol, None)

        keep_symbols = active_symbols | active_order_symbols | set(reentry_watch.keys())
        position_seeds = {
            symbol: seed
            for symbol, seed in position_seeds.items()
            if symbol in keep_symbols
        }
        processed_exit_events = processed_exit_events[-200:]

        self._apply_followup_seed_overlay(runtime_symbols, position_seeds, keep_symbols)
        self._apply_followup_seed_overlay(market_symbols, position_seeds, keep_symbols)
        self._apply_reentry_overlay(runtime_symbols, reentry_watch, active_symbols)
        self._apply_reentry_overlay(market_symbols, reentry_watch, active_symbols)

        return {
            "position_seeds": position_seeds,
            "reentry_watch": reentry_watch,
            "processed_exit_events": processed_exit_events,
        }
