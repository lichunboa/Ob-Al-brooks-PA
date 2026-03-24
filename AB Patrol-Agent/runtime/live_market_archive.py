"""实盘 K 线日归档能力。"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from .path_layout import backtest_cache_dir
except ImportError:  # pragma: no cover - 兼容脚本直接运行 runtime/*.py
    from path_layout import backtest_cache_dir


LOG = logging.getLogger("ab_patrol_runtime")


def live_daily_cache_dir(agent_root: Path, date_text: str) -> Path:
    """返回某一天的实盘 1m K 线归档目录。"""
    return backtest_cache_dir(agent_root) / f"live_today_{date_text.replace('-', '')}"


def live_daily_cache_path(agent_root: Path, symbol: str, date_text: str) -> Path:
    """返回某一天某品种的实盘 1m K 线归档文件。"""
    safe_symbol = str(symbol or "").strip().upper()
    return live_daily_cache_dir(agent_root, date_text) / f"{safe_symbol}_{date_text}_1m.parquet"


def normalize_live_klines_block(block: dict[str, Any]) -> pd.DataFrame:
    """把 execution-service 的 K 线 block 统一成 DataFrame。"""
    bars = block.get("bars") if isinstance(block, dict) else None
    if not isinstance(bars, list) or not bars:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    frame = pd.DataFrame(bars)
    if frame.empty:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    frame["timestamp"] = pd.to_datetime(frame.get("time"), utc=True, errors="coerce").dt.tz_localize(None)
    frame["open"] = pd.to_numeric(frame.get("O"), errors="coerce")
    frame["high"] = pd.to_numeric(frame.get("H"), errors="coerce")
    frame["low"] = pd.to_numeric(frame.get("L"), errors="coerce")
    frame["close"] = pd.to_numeric(frame.get("C"), errors="coerce")
    frame["volume"] = pd.to_numeric(frame.get("vol"), errors="coerce").fillna(0.0)
    frame = frame.dropna(subset=["timestamp", "open", "high", "low", "close"])
    if frame.empty:
        return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])

    frame = frame[["timestamp", "open", "high", "low", "close", "volume"]]
    return frame.sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last").reset_index(drop=True)


def archive_live_klines(agent_root: Path, symbol: str, interval: str, block: dict[str, Any]) -> list[Path]:
    """把实盘 1m K 线按天增量归档到回测缓存目录。"""
    if str(interval or "").strip().lower() != "1m":
        return []
    if not isinstance(block, dict) or block.get("_error"):
        return []

    frame = normalize_live_klines_block(block)
    if frame.empty:
        return []

    written: list[Path] = []
    for date_text, daily_frame in frame.groupby(frame["timestamp"].dt.strftime("%Y-%m-%d")):
        cache_path = live_daily_cache_path(agent_root, symbol, str(date_text))
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        merged = daily_frame.copy()
        if cache_path.exists():
            try:
                existing = pd.read_parquet(cache_path)
                if "timestamp" in existing.columns:
                    existing["timestamp"] = pd.to_datetime(existing["timestamp"], utc=True, errors="coerce").dt.tz_localize(None)
                    merged = pd.concat([existing, daily_frame], ignore_index=True)
            except Exception as exc:
                LOG.warning("读取实盘 K 线归档失败，改为覆盖写入 %s: %s", cache_path, exc)
        merged = merged.dropna(subset=["timestamp"]).sort_values("timestamp").drop_duplicates(subset=["timestamp"], keep="last")
        merged.to_parquet(cache_path, index=False)
        written.append(cache_path)
    return written
