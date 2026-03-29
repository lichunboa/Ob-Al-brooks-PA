"""共享 K 线读取与合并层。"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Iterable
from urllib.parse import quote

import pandas as pd
import requests

from libs.backtest.data_loader import DataLoader
from runtime.live_market_archive import archive_live_klines, live_daily_cache_path

from .market_symbols import normalize_bar_symbol

_EMPTY_COLUMNS = ["timestamp", "open", "high", "low", "close", "volume"]


def _empty_bars() -> pd.DataFrame:
    return pd.DataFrame(columns=_EMPTY_COLUMNS)


def _normalize_bars(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return _empty_bars()
    normalized = frame.copy()
    normalized["timestamp"] = pd.to_datetime(normalized["timestamp"], utc=True, errors="coerce").dt.tz_localize(None)
    for column in ("open", "high", "low", "close", "volume"):
        normalized[column] = pd.to_numeric(normalized[column], errors="coerce")
    normalized = normalized.dropna(subset=["timestamp", "open", "high", "low", "close"])
    if normalized.empty:
        return _empty_bars()
    if "volume" not in normalized:
        normalized["volume"] = 0.0
    normalized["volume"] = normalized["volume"].fillna(0.0)
    return (
        normalized[_EMPTY_COLUMNS]
        .sort_values("timestamp")
        .drop_duplicates(subset=["timestamp"], keep="last")
        .reset_index(drop=True)
    )


def _clip_window(frame: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    normalized = _normalize_bars(frame)
    if normalized.empty:
        return normalized
    return normalized[(normalized["timestamp"] >= start) & (normalized["timestamp"] <= end)].reset_index(drop=True)


def _iter_cache_dates(start: pd.Timestamp, end: pd.Timestamp) -> Iterable[str]:
    current = start.normalize()
    end_date = end.normalize()
    while current <= end_date:
        yield current.strftime("%Y-%m-%d")
        current = current + pd.Timedelta(days=1)


def _load_historical_1m(agent_root: Path, symbol: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    cache_candidates = [
        agent_root / "data" / "history" / "cache",
        agent_root / "data" / "backtest_cache",
    ]
    transport_symbol = normalize_bar_symbol(symbol)
    for cache_dir in cache_candidates:
        bars = DataLoader.load(
            transport_symbol,
            start_date=start.strftime("%Y-%m-%d"),
            end_date=end.strftime("%Y-%m-%d"),
            cache_dir=str(cache_dir),
        )
        if not bars.empty:
            bars = bars.rename(columns={column: column.lower() for column in bars.columns})
            if "timestamp" not in bars.columns:
                continue
            return _clip_window(bars, start, end)
    return _empty_bars()


def _load_live_archived_1m(agent_root: Path, symbol: str, start: pd.Timestamp, end: pd.Timestamp) -> pd.DataFrame:
    frames: list[pd.DataFrame] = []
    for date_text in _iter_cache_dates(start, end):
        cache_path = live_daily_cache_path(agent_root, symbol, date_text)
        if not cache_path.exists():
            continue
        try:
            frame = pd.read_parquet(cache_path)
        except Exception:
            continue
        frames.append(frame)
    if not frames:
        return _empty_bars()
    merged = pd.concat(frames, ignore_index=True)
    return _clip_window(merged, start, end)


def _fetch_live_1m(base_url: str, symbol: str, start: pd.Timestamp, end: pd.Timestamp) -> tuple[pd.DataFrame, dict]:
    if not base_url:
        return _empty_bars(), {}

    needed_minutes = max(180, int(math.ceil((end - start).total_seconds() / 60.0)) + 40)
    limit = min(300, needed_minutes)
    transport_symbol = normalize_bar_symbol(symbol)
    try:
        response = requests.get(
            f"{base_url.rstrip('/')}/klines/{quote(transport_symbol, safe='')}",
            params={"interval": "1m", "limit": limit},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json() if response.content else {}
    except Exception:
        return _empty_bars(), {}
    bars = payload.get("bars") if isinstance(payload, dict) else None
    if not isinstance(bars, list) or not bars:
        return _empty_bars(), payload if isinstance(payload, dict) else {}

    frame = pd.DataFrame(bars)
    frame["timestamp"] = pd.to_datetime(frame.get("time"), utc=True, errors="coerce").dt.tz_localize(None)
    frame["open"] = pd.to_numeric(frame.get("O"), errors="coerce")
    frame["high"] = pd.to_numeric(frame.get("H"), errors="coerce")
    frame["low"] = pd.to_numeric(frame.get("L"), errors="coerce")
    frame["close"] = pd.to_numeric(frame.get("C"), errors="coerce")
    frame["volume"] = pd.to_numeric(frame.get("vol"), errors="coerce").fillna(0.0)
    normalized = _clip_window(frame[_EMPTY_COLUMNS], start, end)
    return normalized, payload if isinstance(payload, dict) else {}


def _merge_sources(history_bars: pd.DataFrame, live_bars: pd.DataFrame) -> pd.DataFrame:
    if history_bars.empty and live_bars.empty:
        return _empty_bars()
    merged = pd.concat([history_bars, live_bars], ignore_index=True)
    return _normalize_bars(merged)


def _resample_bars(frame: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if frame.empty:
        return _empty_bars()
    if timeframe == "1m":
        return frame.reset_index(drop=True)
    return _normalize_bars(DataLoader.resample(frame, timeframe))


def load_canonical_bars(
    agent_root: Path,
    symbol: str,
    timeframe: str,
    start: pd.Timestamp,
    end: pd.Timestamp,
    *,
    base_url: str = "",
    prefer_live: bool = False,
) -> pd.DataFrame:
    """统一读取单一 bar 数据层。"""
    history_1m = _load_historical_1m(agent_root, symbol, start, end)
    live_archive_1m = _load_live_archived_1m(agent_root, symbol, start, end)
    direct_live_1m, raw_block = _fetch_live_1m(base_url, symbol, start, end) if prefer_live else (_empty_bars(), {})

    if raw_block:
        try:
            archive_live_klines(agent_root, normalize_bar_symbol(symbol), "1m", raw_block)
        except Exception:
            pass

    merged_live_1m = _merge_sources(live_archive_1m, direct_live_1m)
    merged_1m = _merge_sources(history_1m, merged_live_1m)
    bars = _resample_bars(merged_1m, timeframe)
    bars = _clip_window(bars, start, end)
    if bars.empty:
        raise RuntimeError(f"{normalize_bar_symbol(symbol)} {timeframe} 在选定窗口内没有可用 K 线")

    if not merged_live_1m.empty and not history_1m.empty:
        candle_source = "统一 bar 数据层：live + historical"
    elif not merged_live_1m.empty:
        candle_source = "统一 bar 数据层：live"
    else:
        candle_source = "统一 bar 数据层：historical"
    bars.attrs["candle_source"] = candle_source
    return bars.reset_index(drop=True)
