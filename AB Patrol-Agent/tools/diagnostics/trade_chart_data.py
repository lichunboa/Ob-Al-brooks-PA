#!/usr/bin/env python3
"""
统一交易图表数据导出脚本。

输入:
  - payload-file: 包含 symbol / timeframe / trades 或 events 的 JSON
输出:
  - JSON 文件，供 Web 直接渲染交互式 K 线图
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any
import glob

import pandas as pd

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.common.bar_store import load_canonical_bars  # noqa: E402
from libs.common.market_symbols import normalize_bar_symbol  # noqa: E402
from brooks_chart_overlay import build_brooks_chart_overlay  # noqa: E402


TIMEFRAME_RULES = {
    "1m": pd.Timedelta(minutes=1),
    "5m": pd.Timedelta(minutes=5),
    "15m": pd.Timedelta(minutes=15),
    "30m": pd.Timedelta(minutes=30),
    "1h": pd.Timedelta(hours=1),
    "4h": pd.Timedelta(hours=4),
    "1d": pd.Timedelta(days=1),
}

WINDOW_BARS = {
    "1m": 260,
    "5m": 220,
    "15m": 220,
    "30m": 180,
    "1h": 140,
    "4h": 100,
    "1d": 72,
}

RUNTIME_STATE_PATH = ROOT / "data" / "pa_trader" / "state" / "runtime_state.json"
LATEST_CYCLE_GLOB = str(ROOT / "data" / "pa_trader" / "cycles" / "cycle_*.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="导出交易图表 JSON 数据")
    parser.add_argument("--payload-file", required=True, help="请求 JSON 文件")
    parser.add_argument("--output", required=True, help="输出 JSON 路径")
    return parser.parse_args()


def _load_payload(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _normalize_timeframe(value: Any) -> str:
    text = str(value or "").strip().lower()
    for candidate in ("1m", "5m", "15m", "30m", "1h", "4h", "1d"):
        if text.startswith(candidate):
            return candidate
    return "1m"


def _to_naive_utc(value: Any) -> pd.Timestamp | None:
    text = str(value or "").strip()
    if not text:
        return None
    ts = pd.Timestamp(text)
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return ts


def _to_epoch_seconds(ts: pd.Timestamp) -> int:
    if ts.tzinfo is not None:
        ts = ts.tz_convert("UTC").tz_localize(None)
    return int(ts.timestamp())


def _safe_float(value: Any) -> float | None:
    if value in (None, "", False):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not pd.notna(parsed):
        return None
    return parsed


def _flatten_template14(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {}
    payload: dict[str, Any] = {}
    for key, item in value.items():
        if item in (None, "", []):
            continue
        payload[str(key)] = item
    return payload


def _summary_item(
    key: str,
    label: str,
    color: str,
    detail_lines: list[str],
    *,
    group_key: str | None = None,
    group_label: str | None = None,
) -> dict[str, Any]:
    payload = {
        "key": key,
        "label": label,
        "color": color,
        "detailTitle": label,
        "detailLines": detail_lines,
    }
    if group_key:
        payload["groupKey"] = group_key
    if group_label:
        payload["groupLabel"] = group_label
    return payload


def _infer_tradingview_market_meta(symbol: str, base_url: str | None = None) -> dict[str, Any]:
    normalized_symbol = normalize_bar_symbol(symbol)
    base = str(base_url or "").strip()
    if not normalized_symbol:
        return {}

    if normalized_symbol.endswith("USDT") or ":8093" in base:
        return {
            "marketSymbol": normalized_symbol,
            "marketKind": "crypto",
            "tradingViewDefaultExchange": "BINANCE",
            "tradingViewFullSymbol": f"BINANCE:{normalized_symbol}.P",
        }

    if len(normalized_symbol) == 6 and normalized_symbol.isalpha():
        return {
            "marketSymbol": normalized_symbol,
            "marketKind": "forex",
            "tradingViewDefaultExchange": "OANDA",
            "tradingViewFullSymbol": f"OANDA:{normalized_symbol}",
        }

    return {
        "marketSymbol": normalized_symbol,
        "marketKind": "unknown",
        "tradingViewDefaultExchange": "BINANCE",
        "tradingViewFullSymbol": normalized_symbol,
    }


def _load_runtime_symbol_context(symbol: str) -> dict[str, Any]:
    normalized_symbol = normalize_bar_symbol(symbol)
    if not normalized_symbol:
        return {}

    try:
        if RUNTIME_STATE_PATH.exists():
            runtime_state = json.loads(RUNTIME_STATE_PATH.read_text(encoding="utf-8"))
            container = runtime_state.get("symbols") or {}
            if isinstance(container, dict):
                direct = container.get(normalized_symbol)
                if isinstance(direct, dict):
                    return direct
                for key, item in container.items():
                    if normalize_bar_symbol(str(key)) == normalized_symbol and isinstance(item, dict):
                        return item
            direct_root = runtime_state.get(normalized_symbol)
            if isinstance(direct_root, dict):
                return direct_root
    except Exception:
        pass

    try:
        cycle_files = sorted(glob.glob(LATEST_CYCLE_GLOB))
        if cycle_files:
            latest = json.loads(Path(cycle_files[-1]).read_text(encoding="utf-8"))
            decision = latest.get("decision") or {}
            for container_key in ("symbols", "symbol_updates"):
                container = decision.get(container_key)
                if isinstance(container, dict):
                    direct = container.get(normalized_symbol)
                    if isinstance(direct, dict):
                        return direct
                    for key, item in container.items():
                        if normalize_bar_symbol(str(key)) == normalized_symbol and isinstance(item, dict):
                            return item
    except Exception:
        pass
    return {}


def _build_runtime_status_summary(symbol: str) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    context = _load_runtime_symbol_context(symbol)
    if not context:
        return None, {}

    status = str(context.get("status") or "").strip() or "unknown"
    signal = str(context.get("signal") or context.get("signal_type") or "").strip()
    candidate_stage = str(context.get("candidate_stage") or "").strip()
    execution_mode = str(context.get("execution_mode") or "").strip()
    strategy = str(context.get("strategy") or "").strip()
    planned_trade = context.get("planned_trade")
    has_planned_trade = isinstance(planned_trade, dict) and bool(planned_trade)

    if status == "watching":
        label = "机会：等待中"
        color = "#94a3b8"
        detail_lines = [
            f"当前 runtime 状态：{status}。",
            "这意味着系统没有把当前结构升级成 pre-signal / candidate / executable。",
            "图上的 H/L、ii/ioi、MAG、MM 只是结构层与目标层，不等于系统已经认可开仓。",
            "只有 signal、candidate_stage、planned_trade 和 trade gate 同时过关，才会进入真实下单链。",
        ]
    else:
        label = f"机会：{status}"
        color = "#22c55e" if status in {"entry_ready", "candidate", "executable"} else "#f59e0b"
        detail_lines = [
            f"当前 runtime 状态：{status}。",
            f"signal：{signal or '无'}；candidate_stage：{candidate_stage or '无'}；execution_mode：{execution_mode or '无'}。",
            f"策略：{strategy or '无'}；planned_trade：{'有' if has_planned_trade else '无'}。",
            "这张图里的结构标记只是辅助读图，真正是否下单仍以 runtime 当前状态为准。",
        ]

    return (
        _summary_item(
            "strategy_gate",
            label,
            color,
            detail_lines,
            group_key="runtime_gate",
            group_label="运行态 / 执行链",
        ),
        {
            "runtimeStatus": status,
            "runtimeSignal": signal or None,
            "runtimeCandidateStage": candidate_stage or None,
            "runtimeExecutionMode": execution_mode or None,
            "runtimeStrategy": strategy or None,
            "runtimeHasPlannedTrade": has_planned_trade,
        },
    )


def _event_scope_summary() -> dict[str, Any]:
    return _summary_item(
        "chart_scope",
        "图表范围：事件复盘",
        "#818cf8",
        [
            "当前图围绕选中的历史主事件窗口重算结构标记，用来解释那笔事件当时的上下文。",
            "窗口里的 H/L、ii/ioi、MM 是该窗口内的结构投影，不等于当前 live 仍然存在同样机会。",
            "如果要看当前是否有 live 机会，请结合“机会”按钮和运行态状态一起判断。",
            "历史事件复盘图用于解释过去发生了什么，live 是否下单仍以当前 runtime 决策链为准。",
        ],
        group_key="runtime_gate",
        group_label="运行态 / 执行链",
    )


def _normalize_trade_items(trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for trade in trades:
        entry_time = _to_naive_utc(trade.get("entry_time"))
        exit_time = _to_naive_utc(trade.get("exit_time"))
        if entry_time is None:
            continue
        item = dict(trade)
        item["entry_time"] = entry_time
        item["exit_time"] = exit_time or entry_time
        normalized.append(item)
    normalized.sort(key=lambda item: item["entry_time"])
    return normalized


def _normalize_event_items(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for event in events:
        logged_at = _to_naive_utc(event.get("loggedAt") or event.get("logged_at") or event.get("timestamp"))
        if logged_at is None:
            continue
        item = dict(event)
        item["logged_at"] = logged_at
        normalized.append(item)
    normalized.sort(key=lambda item: item["logged_at"])
    return normalized


def _resolve_window(
    anchors: list[pd.Timestamp],
    timeframe: str,
    selected_ts: pd.Timestamp | None,
    requested_bars: int | None = None,
) -> tuple[pd.Timestamp, pd.Timestamp]:
    delta = TIMEFRAME_RULES.get(timeframe, pd.Timedelta(minutes=5))
    radius = requested_bars or WINDOW_BARS.get(timeframe, 100)
    radius = max(40, int(radius))
    if selected_ts is not None:
        return selected_ts - delta * radius, selected_ts + delta * radius
    if not anchors:
        now = pd.Timestamp.utcnow().tz_localize(None)
        return now - delta * radius, now + delta * radius
    return min(anchors) - delta * 20, max(anchors) + delta * 20


def _load_backtest_bars(symbol: str, timeframe: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    bars = load_canonical_bars(
        ROOT,
        normalize_bar_symbol(symbol),
        timeframe,
        start,
        end,
        prefer_live=False,
    )
    bars.attrs["candle_source"] = "统一 bar 数据层：historical"
    return bars


def _load_live_bars(symbol: str, timeframe: str, date_text: str, start: pd.Timestamp, end: pd.Timestamp, base_url: str) -> pd.DataFrame:
    _ = date_text
    return load_canonical_bars(
        ROOT,
        normalize_bar_symbol(symbol),
        timeframe,
        start,
        end,
        base_url=base_url,
        prefer_live=True,
    )


def _nearest_index(index: pd.DatetimeIndex, ts: pd.Timestamp) -> int:
    position = index.get_indexer([ts], method="nearest")[0]
    return max(0, int(position))


def _serialize_candles(bars: pd.DataFrame) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    for row in bars.itertuples(index=False):
        payload.append(
            {
                "time": _to_epoch_seconds(row.timestamp),
                "open": float(row.open),
                "high": float(row.high),
                "low": float(row.low),
                "close": float(row.close),
                "volume": float(getattr(row, "volume", 0.0) or 0.0),
            }
        )
    return payload


def _serialize_ema(bars: pd.DataFrame) -> list[dict[str, Any]]:
    ema = bars["close"].ewm(span=20, adjust=False).mean()
    payload: list[dict[str, Any]] = []
    for ts, value in zip(bars["timestamp"], ema, strict=False):
        if pd.isna(value):
            continue
        payload.append({"time": _to_epoch_seconds(ts), "value": float(value)})
    return payload


def _serialize_volume(bars: pd.DataFrame) -> list[dict[str, Any]]:
    payload: list[dict[str, Any]] = []
    previous_close: float | None = None
    for row in bars.itertuples(index=False):
        close_price = float(row.close)
        color = "#22c55e" if previous_close is None or close_price >= previous_close else "#f97316"
        payload.append({"time": _to_epoch_seconds(row.timestamp), "value": float(getattr(row, "volume", 0.0) or 0.0), "color": color})
        previous_close = close_price
    return payload


def _merge_overlay_price_lines(
    base_lines: list[dict[str, Any]],
    overlay_lines: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    merged = list(base_lines)
    seen = {
        (
            round(float(item.get("price") or 0.0), 8),
            str(item.get("title") or ""),
        )
        for item in merged
        if _safe_float(item.get("price")) is not None
    }
    for item in overlay_lines:
        price = _safe_float(item.get("price"))
        if price is None or price <= 0:
            continue
        signature = (round(price, 8), str(item.get("title") or ""))
        if signature in seen:
            continue
        seen.add(signature)
        payload = dict(item)
        payload["price"] = price
        merged.append(payload)
    return merged


def _backtest_chart_payload(symbol: str, timeframe: str, trades: list[dict[str, Any]], selected_index: int | None) -> dict[str, Any]:
    normalized = _normalize_trade_items(trades)
    if not normalized:
        raise RuntimeError("缺少可用回测交易")
    selected = normalized[selected_index] if selected_index is not None and 0 <= selected_index < len(normalized) else normalized[-1]
    anchors = [item["entry_time"] for item in normalized] + [item["exit_time"] for item in normalized]
    window_start, window_end = _resolve_window(anchors, timeframe, selected["entry_time"])
    bars = _load_backtest_bars(symbol, timeframe, window_start, window_end)
    window_trades = [selected]
    timestamps = pd.DatetimeIndex(bars["timestamp"])

    markers: list[dict[str, Any]] = []
    for item in window_trades:
        entry_price = _safe_float(item.get("entry_price")) or float(bars.iloc[_nearest_index(timestamps, item["entry_time"])]["close"])
        exit_price = _safe_float(item.get("exit_price")) or float(bars.iloc[_nearest_index(timestamps, item["exit_time"])]["close"])
        direction = str(item.get("direction") or "").upper()
        strategy = str(item.get("strategy") or item.get("playbook_id") or item.get("playbook_family") or "未命名策略")
        markers.append(
            {
                "time": _to_epoch_seconds(item["entry_time"]),
                "position": "belowBar" if direction == "BUY" else "aboveBar",
                "shape": "arrowUp" if direction == "BUY" else "arrowDown",
                "color": "#22c55e" if direction == "BUY" else "#f97316",
                "text": f"开仓 {strategy}",
                "price": entry_price,
            }
        )
        markers.append(
            {
                "time": _to_epoch_seconds(item["exit_time"]),
                "position": "inBar",
                "shape": "circle",
                "color": "#e2e8f0",
                "text": f"平仓 {item.get('exit_reason') or 'EXIT'}",
                "price": exit_price,
            }
        )

    price_lines = []
    for price, color, title in (
        (_safe_float(selected.get("entry_price")), "#22c55e", "入场"),
        (_safe_float(selected.get("stop_loss")), "#ef4444", "止损"),
        (_safe_float(selected.get("take_profit")), "#f59e0b", "止盈"),
        (_safe_float(selected.get("exit_price")), "#e2e8f0", "平仓"),
    ):
        if price is not None and price > 0:
            price_lines.append({"price": price, "color": color, "title": title})

    overlay = build_brooks_chart_overlay(bars, timeframe)

    focus_title = (
        f"{symbol} {timeframe} | "
        f"{selected.get('strategy') or selected.get('playbook_id') or selected.get('playbook_family') or '未命名策略'} | "
        f"{selected.get('exit_reason') or '未标注退出'} | "
        f"{float(selected.get('pnl_pct') or 0.0):+.4f}%"
    )
    return {
        "source": "backtest",
        "symbol": symbol,
        "timeframe": timeframe,
        "focusTitle": focus_title,
        "candles": _serialize_candles(bars),
        "ema20": _serialize_ema(bars),
        "volume": _serialize_volume(bars),
        "markers": list(overlay.get("markers") or []) + markers,
        "priceLines": _merge_overlay_price_lines(price_lines, list(overlay.get("priceLines") or [])),
        "overlayLines": list(overlay.get("overlayLines") or []),
        "signalSummary": list(overlay.get("signalSummary") or []),
        "focusMeta": {
            **dict(overlay.get("focusMeta") or {}),
            **_infer_tradingview_market_meta(symbol),
            "strategy": selected.get("strategy"),
            "playbookId": selected.get("playbook_id"),
            "playbookFamily": selected.get("playbook_family"),
            "direction": selected.get("direction"),
            "entryTime": selected["entry_time"].isoformat(),
            "exitTime": selected["exit_time"].isoformat(),
            "entryPrice": _safe_float(selected.get("entry_price")),
            "exitPrice": _safe_float(selected.get("exit_price")),
            "stopLoss": _safe_float(selected.get("stop_loss")),
            "takeProfit": _safe_float(selected.get("take_profit")),
            "exitReason": selected.get("exit_reason"),
            "pnlPct": _safe_float(selected.get("pnl_pct")),
            "result": selected.get("result"),
        },
    }


def _event_type_label(event: dict[str, Any]) -> str:
    return str(event.get("type") or event.get("status") or "EVENT")


def _pick_live_focus_events(events: list[dict[str, Any]], selected: dict[str, Any]) -> list[dict[str, Any]]:
    """只保留单笔主事件链，避免把同品种历史动作全部挤在一张图里。"""
    ordered = sorted(events, key=lambda item: item["logged_at"])
    selected_order_id = str(selected.get("orderId") or "").strip()
    if selected_order_id:
        ordered = [item for item in ordered if str(item.get("orderId") or "").strip() == selected_order_id] or ordered
    else:
        ordered = [selected]

    selected_time = selected["logged_at"]
    selected_type = str(selected.get("type") or "").upper()
    chosen: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    def push(item: dict[str, Any] | None) -> None:
        if not item:
            return
        signature = (
            str(item.get("type") or "").upper(),
            str(item.get("status") or "").upper(),
            item["logged_at"].isoformat(),
        )
        if signature in seen:
            return
        chosen.append(item)
        seen.add(signature)

    entry_candidate = next(
        (
            item
            for item in reversed(ordered)
            if item["logged_at"] <= selected_time and str(item.get("type") or "").upper() == "OPEN_ORDER"
        ),
        None,
    )
    if selected_type != "OPEN_ORDER":
        push(entry_candidate)

    push(selected)

    if selected_order_id:
        if selected_type in {"MODIFY_STOP_LOSS", "MODIFY_TAKE_PROFIT"}:
            entry_candidate = next(
                (
                    item
                    for item in reversed(ordered)
                    if item["logged_at"] <= selected_time and str(item.get("type") or "").upper() == "OPEN_ORDER"
                ),
                None,
            )
            if entry_candidate is not None:
                chosen = [entry_candidate, selected]
                seen = {
                    (
                        str(entry_candidate.get("type") or "").upper(),
                        str(entry_candidate.get("status") or "").upper(),
                        entry_candidate["logged_at"].isoformat(),
                    ),
                    (
                        str(selected.get("type") or "").upper(),
                        str(selected.get("status") or "").upper(),
                        selected["logged_at"].isoformat(),
                    ),
                }
        exit_candidate = next(
            (
                item
                for item in ordered
                if item["logged_at"] >= selected_time
                and str(item.get("type") or "").upper() in {"CLOSE_POSITION", "PARTIAL_CLOSE", "REDUCE_POSITION"}
            ),
            None,
        )
        push(exit_candidate)

    return chosen or [selected]


def _live_signal_only_payload(symbol: str, timeframe: str, base_url: str) -> dict[str, Any]:
    """仅按品种/周期生成实时信号总览，不依赖具体事件。"""
    now = pd.Timestamp.utcnow().tz_localize(None)
    window_start, window_end = _resolve_window([now], timeframe, now)
    date_text = now.strftime("%Y-%m-%d")
    bars = _load_live_bars(symbol, timeframe, date_text, window_start, window_end, base_url)
    candle_source = str(bars.attrs.get("candle_source") or "未知")
    overlay = build_brooks_chart_overlay(bars, timeframe)
    runtime_summary, runtime_meta = _build_runtime_status_summary(symbol)
    signal_summary = list(overlay.get("signalSummary") or [])
    if runtime_summary is not None:
        signal_summary.insert(1, runtime_summary)
    return {
        "source": "live",
        "symbol": symbol,
        "timeframe": timeframe,
        "focusTitle": f"{symbol} {timeframe} | 实时 Brooks 信号总览",
        "candles": _serialize_candles(bars),
        "ema20": _serialize_ema(bars),
        "volume": _serialize_volume(bars),
        "markers": list(overlay.get("markers") or []),
        "priceLines": list(overlay.get("priceLines") or []),
        "overlayLines": list(overlay.get("overlayLines") or []),
        "signalSummary": signal_summary,
        "focusMeta": {
            **dict(overlay.get("focusMeta") or {}),
            **_infer_tradingview_market_meta(symbol, base_url),
            **runtime_meta,
            "strategy": None,
            "playbookId": None,
            "marketState": None,
            "type": "SIGNAL_OVERVIEW",
            "status": "watching",
            "side": None,
            "loggedAt": now.isoformat(),
            "entryPrice": None,
            "plannedEntryPrice": None,
            "actualEntryPrice": None,
            "eventPrice": None,
            "stopLoss": None,
            "plannedStopLoss": None,
            "actualStopLoss": None,
            "takeProfit": None,
            "plannedTakeProfit": None,
            "actualTakeProfit": None,
            "orderClass": None,
            "protectionKind": None,
            "candleSource": candle_source,
        },
    }


def _live_chart_payload(symbol: str, timeframe: str, events: list[dict[str, Any]], selected_index: int | None, base_url: str) -> dict[str, Any]:
    normalized = _normalize_event_items(events)
    if not normalized:
        return _live_signal_only_payload(symbol, timeframe, base_url)
    selected = normalized[selected_index] if selected_index is not None and 0 <= selected_index < len(normalized) else normalized[-1]
    anchors = [item["logged_at"] for item in normalized]
    window_start, window_end = _resolve_window(anchors, timeframe, selected["logged_at"])
    date_text = selected["logged_at"].strftime("%Y-%m-%d")
    bars = _load_live_bars(symbol, timeframe, date_text, window_start, window_end, base_url)
    selected_order_id = str(selected.get("orderId") or "").strip()
    if selected_order_id:
        focused = [
            item
            for item in normalized
            if str(item.get("orderId") or "").strip() == selected_order_id
        ]
    else:
        focused = [
            item
            for item in normalized
            if item["logged_at"] == selected["logged_at"]
            and str(item.get("type") or "") == str(selected.get("type") or "")
            and str(item.get("strategy") or "") == str(selected.get("strategy") or "")
        ]
    narrowed = _pick_live_focus_events(focused or [selected], selected)
    window_events = [item for item in narrowed if bars["timestamp"].iloc[0] <= item["logged_at"] <= bars["timestamp"].iloc[-1]] or narrowed
    timestamps = pd.DatetimeIndex(bars["timestamp"])
    candle_source = str(bars.attrs.get("candle_source") or "未知")
    planned_entry_price = _safe_float(selected.get("plannedEntryPrice")) or _safe_float(selected.get("entryPrice"))
    actual_entry_price = _safe_float(selected.get("actualEntryPrice"))
    planned_stop_loss = _safe_float(selected.get("plannedStopLoss")) or _safe_float(selected.get("stopLoss"))
    actual_stop_loss = _safe_float(selected.get("actualStopLoss"))
    planned_take_profit = _safe_float(selected.get("plannedTakeProfit")) or _safe_float(selected.get("takeProfit"))
    actual_take_profit = _safe_float(selected.get("actualTakeProfit"))
    display_entry_price = actual_entry_price or planned_entry_price
    display_stop_loss = actual_stop_loss or planned_stop_loss
    display_take_profit = actual_take_profit or planned_take_profit

    markers: list[dict[str, Any]] = []
    for item in window_events:
        event_type = str(item.get("type") or "").upper()
        side = str(item.get("side") or "").upper()
        is_focus = (
            item["logged_at"] == selected["logged_at"]
            and str(item.get("type") or "") == str(selected.get("type") or "")
            and str(item.get("orderId") or "") == str(selected.get("orderId") or "")
        )
        event_price = (
            _safe_float(item.get("eventPrice"))
            or _safe_float(item.get("plannedEntryPrice"))
            or _safe_float(item.get("entryPrice"))
        )
        if event_price is None:
            event_price = float(bars.iloc[_nearest_index(timestamps, item["logged_at"])]["close"])
        if event_type == "OPEN_ORDER":
            position = "belowBar" if side in {"BUY", "LONG"} else "aboveBar"
            shape = "arrowUp" if side in {"BUY", "LONG"} else "arrowDown"
            color = "#22c55e" if side in {"BUY", "LONG"} else "#f97316"
        elif "CLOSE" in event_type:
            position = "inBar"
            shape = "circle"
            color = "#e2e8f0"
        else:
            position = "inBar"
            shape = "square"
            color = "#facc15"
        markers.append(
            {
                "time": _to_epoch_seconds(item["logged_at"]),
                "position": position,
                "shape": shape,
                "color": color,
                "text": (
                    f"{_event_type_label(item)} {item.get('strategy') or item.get('playbookId') or ''}".strip()
                    if is_focus
                    else "退出"
                    if event_type in {"CLOSE_POSITION", "PARTIAL_CLOSE", "REDUCE_POSITION"}
                    else ""
                ),
                "price": event_price,
            }
        )

    price_lines = []
    for price, color, title in (
        (display_entry_price, "#22c55e", "入场"),
        (display_stop_loss, "#ef4444", "止损"),
        (display_take_profit, "#f59e0b", "止盈"),
        (_safe_float(selected.get("eventPrice")), "#e2e8f0", "事件价格"),
    ):
        if price is not None and price > 0:
            price_lines.append({"price": price, "color": color, "title": title, "lineStyle": "solid"})
    if actual_entry_price is not None and planned_entry_price is not None and abs(actual_entry_price - planned_entry_price) > max(1e-6, abs(actual_entry_price) * 1e-5):
        price_lines.append({"price": planned_entry_price, "color": "#94a3b8", "title": "计划入场", "lineStyle": "dotted"})
    if actual_stop_loss is not None and planned_stop_loss is not None and abs(actual_stop_loss - planned_stop_loss) > max(1e-6, abs(actual_stop_loss) * 1e-5):
        price_lines.append({"price": planned_stop_loss, "color": "#fca5a5", "title": "计划止损", "lineStyle": "dotted"})
    if actual_take_profit is not None and planned_take_profit is not None and abs(actual_take_profit - planned_take_profit) > max(1e-6, abs(actual_take_profit) * 1e-5):
        price_lines.append({"price": planned_take_profit, "color": "#fcd34d", "title": "计划止盈", "lineStyle": "dotted"})

    overlay = build_brooks_chart_overlay(bars, timeframe)
    runtime_summary, runtime_meta = _build_runtime_status_summary(symbol)
    signal_summary = list(overlay.get("signalSummary") or [])
    signal_summary.insert(0, _event_scope_summary())
    if runtime_summary is not None:
        signal_summary.insert(1, runtime_summary)

    focus_title = (
        f"{symbol} {timeframe} | "
        f"{selected.get('strategy') or selected.get('playbookId') or '未命名策略'} | "
        f"{selected.get('type') or '-'} | "
        f"{selected.get('status') or '-'}"
    )
    return {
        "source": "live",
        "symbol": symbol,
        "timeframe": timeframe,
        "focusTitle": focus_title,
        "candles": _serialize_candles(bars),
        "ema20": _serialize_ema(bars),
        "volume": _serialize_volume(bars),
        "markers": list(overlay.get("markers") or []) + markers,
        "priceLines": _merge_overlay_price_lines(price_lines, list(overlay.get("priceLines") or [])),
        "overlayLines": list(overlay.get("overlayLines") or []),
        "signalSummary": signal_summary,
        "focusMeta": {
            **dict(overlay.get("focusMeta") or {}),
            **_infer_tradingview_market_meta(symbol, base_url),
            **runtime_meta,
            "strategy": selected.get("strategy"),
            "playbookId": selected.get("playbookId"),
            "marketState": selected.get("marketState"),
            "type": selected.get("type"),
            "status": selected.get("status"),
            "side": selected.get("side"),
            "loggedAt": selected["logged_at"].isoformat(),
            "entryPrice": display_entry_price,
            "plannedEntryPrice": planned_entry_price,
            "actualEntryPrice": actual_entry_price,
            "eventPrice": _safe_float(selected.get("eventPrice")),
            "stopLoss": display_stop_loss,
            "plannedStopLoss": planned_stop_loss,
            "actualStopLoss": actual_stop_loss,
            "takeProfit": display_take_profit,
            "plannedTakeProfit": planned_take_profit,
            "actualTakeProfit": actual_take_profit,
            "orderClass": selected.get("orderClass"),
            "protectionKind": selected.get("protectionKind"),
            "candleSource": candle_source,
            **_flatten_template14(selected.get("template14")),
        },
    }


def main() -> None:
    args = parse_args()
    payload = _load_payload(Path(args.payload_file))
    symbol = normalize_bar_symbol(str(payload.get("symbol") or ""))
    timeframe = _normalize_timeframe(payload.get("timeframe"))
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if not symbol:
        raise RuntimeError("payload 缺少 symbol")

    if isinstance(payload.get("trades"), list):
        result = _backtest_chart_payload(
            symbol,
            timeframe,
            list(payload.get("trades") or []),
            int(payload["tradeIndex"]) if payload.get("tradeIndex") is not None else None,
        )
    elif isinstance(payload.get("events"), list) or "events" not in payload:
        result = _live_chart_payload(
            symbol,
            timeframe,
            list(payload.get("events") or []),
            int(payload["eventIndex"]) if payload.get("eventIndex") is not None else None,
            str(payload.get("baseUrl") or "http://127.0.0.1:8093").strip(),
        )
    else:
        raise RuntimeError("payload 必须包含 trades 或 events")

    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
