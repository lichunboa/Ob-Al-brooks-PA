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

import pandas as pd
import requests

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.data_loader import DataLoader  # noqa: E402
from runtime.live_market_archive import live_daily_cache_path  # noqa: E402


TIMEFRAME_RULES = {
    "1m": pd.Timedelta(minutes=1),
    "5m": pd.Timedelta(minutes=5),
    "15m": pd.Timedelta(minutes=15),
    "1h": pd.Timedelta(hours=1),
    "1d": pd.Timedelta(days=1),
}

WINDOW_BARS = {
    "1m": 160,
    "5m": 120,
    "15m": 100,
    "1h": 72,
    "1d": 40,
}


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
    matched = text[:3] if text.startswith("15m") else text[:2]
    for candidate in ("1m", "5m", "15m", "1h", "1d"):
        if text.startswith(candidate):
            return candidate
    return "15m"


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
) -> tuple[pd.Timestamp, pd.Timestamp]:
    delta = TIMEFRAME_RULES.get(timeframe, pd.Timedelta(minutes=5))
    radius = WINDOW_BARS.get(timeframe, 100)
    if selected_ts is not None:
        return selected_ts - delta * radius, selected_ts + delta * radius
    if not anchors:
        now = pd.Timestamp.utcnow().tz_localize(None)
        return now - delta * radius, now + delta * radius
    return min(anchors) - delta * 20, max(anchors) + delta * 20


def _load_backtest_bars(symbol: str, timeframe: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    cache_candidates = [
        ROOT / "data" / "history" / "cache",
        ROOT / "data" / "backtest_cache",
    ]
    df_1m = pd.DataFrame()
    for cache_dir in cache_candidates:
        df_1m = DataLoader.load(
            symbol,
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
            cache_dir=str(cache_dir),
        )
        if not df_1m.empty:
            break
    if df_1m.empty:
        raise RuntimeError(f"{symbol} 没有可用历史数据")
    if timeframe == "1m":
        bars = df_1m.copy()
    else:
        bars = DataLoader.resample(df_1m, timeframe)
    bars["timestamp"] = pd.to_datetime(bars["timestamp"], utc=True).dt.tz_localize(None)
    bars = bars[(bars["timestamp"] >= start) & (bars["timestamp"] <= end)].reset_index(drop=True)
    if bars.empty:
        raise RuntimeError(f"{symbol} {timeframe} 在选定窗口内没有 K 线")
    return bars


def _load_live_bars(symbol: str, timeframe: str, date_text: str, start: pd.Timestamp, end: pd.Timestamp, base_url: str) -> pd.DataFrame:
    cache_path = live_daily_cache_path(ROOT, symbol, date_text)
    if cache_path.exists():
        bars_1m = pd.read_parquet(cache_path)
        bars_1m["timestamp"] = pd.to_datetime(bars_1m["timestamp"], utc=True, errors="coerce").dt.tz_localize(None)
        bars_1m = bars_1m.dropna(subset=["timestamp"]).sort_values("timestamp").reset_index(drop=True)
    else:
        response = requests.get(
            f"{base_url.rstrip('/')}/klines/{symbol}",
            params={"interval": timeframe, "limit": max(120, WINDOW_BARS.get(timeframe, 100) * 2)},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        bars = payload.get("bars") if isinstance(payload, dict) else None
        if not isinstance(bars, list) or not bars:
            raise RuntimeError(f"{symbol} {timeframe} 没有可用 K 线")
        bars_1m = pd.DataFrame(bars)
        bars_1m["timestamp"] = pd.to_datetime(bars_1m.get("time"), utc=True, errors="coerce").dt.tz_localize(None)
        bars_1m["open"] = pd.to_numeric(bars_1m.get("O"), errors="coerce")
        bars_1m["high"] = pd.to_numeric(bars_1m.get("H"), errors="coerce")
        bars_1m["low"] = pd.to_numeric(bars_1m.get("L"), errors="coerce")
        bars_1m["close"] = pd.to_numeric(bars_1m.get("C"), errors="coerce")
        bars_1m["volume"] = pd.to_numeric(bars_1m.get("vol"), errors="coerce").fillna(0.0)
        bars_1m = bars_1m.dropna(subset=["timestamp", "open", "high", "low", "close"])
        bars_1m = bars_1m[["timestamp", "open", "high", "low", "close", "volume"]].reset_index(drop=True)
    if timeframe == "1m":
        bars = bars_1m.copy()
    else:
        bars = DataLoader.resample(bars_1m, timeframe)
    bars["timestamp"] = pd.to_datetime(bars["timestamp"], utc=True, errors="coerce").dt.tz_localize(None)
    bars = bars[(bars["timestamp"] >= start) & (bars["timestamp"] <= end)].reset_index(drop=True)
    if bars.empty:
        raise RuntimeError(f"{symbol} {timeframe} 在选定窗口内没有实时 K 线")
    return bars


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


def _backtest_chart_payload(symbol: str, timeframe: str, trades: list[dict[str, Any]], selected_index: int | None) -> dict[str, Any]:
    normalized = _normalize_trade_items(trades)
    if not normalized:
        raise RuntimeError("缺少可用回测交易")
    selected = normalized[selected_index] if selected_index is not None and 0 <= selected_index < len(normalized) else normalized[-1]
    anchors = [item["entry_time"] for item in normalized] + [item["exit_time"] for item in normalized]
    window_start, window_end = _resolve_window(anchors, timeframe, selected["entry_time"])
    bars = _load_backtest_bars(symbol, timeframe, window_start, window_end)
    window_trades = [item for item in normalized if item["entry_time"] <= bars["timestamp"].iloc[-1] and item["exit_time"] >= bars["timestamp"].iloc[0]] or normalized
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
        "markers": markers,
        "priceLines": price_lines,
        "focusMeta": {
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


def _live_chart_payload(symbol: str, timeframe: str, events: list[dict[str, Any]], selected_index: int | None, base_url: str) -> dict[str, Any]:
    normalized = _normalize_event_items(events)
    if not normalized:
        raise RuntimeError("缺少可用实盘事件")
    selected = normalized[selected_index] if selected_index is not None and 0 <= selected_index < len(normalized) else normalized[-1]
    anchors = [item["logged_at"] for item in normalized]
    window_start, window_end = _resolve_window(anchors, timeframe, selected["logged_at"])
    date_text = selected["logged_at"].strftime("%Y-%m-%d")
    bars = _load_live_bars(symbol, timeframe, date_text, window_start, window_end, base_url)
    window_events = [item for item in normalized if bars["timestamp"].iloc[0] <= item["logged_at"] <= bars["timestamp"].iloc[-1]] or normalized[-12:]
    timestamps = pd.DatetimeIndex(bars["timestamp"])

    markers: list[dict[str, Any]] = []
    for item in window_events:
        event_type = str(item.get("type") or "").upper()
        side = str(item.get("side") or "").upper()
        event_price = _safe_float(item.get("eventPrice")) or _safe_float(item.get("entryPrice"))
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
                "text": f"{_event_type_label(item)} {item.get('strategy') or item.get('playbookId') or ''}".strip(),
                "price": event_price,
            }
        )

    price_lines = []
    for price, color, title in (
        (_safe_float(selected.get("entryPrice")), "#22c55e", "入场"),
        (_safe_float(selected.get("stopLoss")), "#ef4444", "止损"),
        (_safe_float(selected.get("takeProfit")), "#f59e0b", "止盈"),
        (_safe_float(selected.get("eventPrice")), "#e2e8f0", "事件价格"),
    ):
        if price is not None and price > 0:
            price_lines.append({"price": price, "color": color, "title": title})

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
        "markers": markers,
        "priceLines": price_lines,
        "focusMeta": {
            "strategy": selected.get("strategy"),
            "playbookId": selected.get("playbookId"),
            "marketState": selected.get("marketState"),
            "type": selected.get("type"),
            "status": selected.get("status"),
            "side": selected.get("side"),
            "loggedAt": selected["logged_at"].isoformat(),
            "entryPrice": _safe_float(selected.get("entryPrice")),
            "eventPrice": _safe_float(selected.get("eventPrice")),
            "stopLoss": _safe_float(selected.get("stopLoss")),
            "takeProfit": _safe_float(selected.get("takeProfit")),
            "orderClass": selected.get("orderClass"),
            "protectionKind": selected.get("protectionKind"),
        },
    }


def main() -> None:
    args = parse_args()
    payload = _load_payload(Path(args.payload_file))
    symbol = str(payload.get("symbol") or "").strip().upper()
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
    elif isinstance(payload.get("events"), list):
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
