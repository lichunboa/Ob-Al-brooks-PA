#!/usr/bin/env python3
"""从 Binance Futures API 下载 1m K线数据到 parquet 缓存"""

import os
import time
import sys
import requests
import pandas as pd
from pathlib import Path
from datetime import datetime, timezone

CACHE_DIR = Path(__file__).parent.parent / "data" / "backtest_cache"
BASE_URL = "https://fapi.binance.com/fapi/v1/klines"
LIMIT = 1500  # Binance max per request


def fetch_klines(symbol: str, start_date: str, end_date: str) -> pd.DataFrame:
    """Download 1m klines from Binance Futures API"""
    cache_path = CACHE_DIR / f"{symbol}_{start_date}_{end_date}.parquet"
    if cache_path.exists():
        df = pd.read_parquet(cache_path)
        print(f"  [cached] {symbol} {start_date}~{end_date}: {len(df):,} rows")
        return df

    start_ts = int(pd.Timestamp(start_date, tz="UTC").timestamp() * 1000)
    end_ts = int(pd.Timestamp(end_date, tz="UTC").timestamp() * 1000)

    all_rows = []
    current_ts = start_ts
    req_count = 0

    print(f"  Downloading {symbol} {start_date} ~ {end_date}...")
    while current_ts < end_ts:
        params = {
            "symbol": symbol,
            "interval": "1m",
            "startTime": current_ts,
            "endTime": end_ts,
            "limit": LIMIT,
        }
        for attempt in range(5):
            try:
                resp = requests.get(BASE_URL, params=params, timeout=30)
                resp.raise_for_status()
                break
            except Exception as e:
                if attempt < 4:
                    wait = 2 ** attempt
                    print(f"    Retry {attempt+1}/5 in {wait}s: {e}")
                    time.sleep(wait)
                else:
                    raise

        data = resp.json()
        if not data:
            break

        for row in data:
            all_rows.append({
                "timestamp": pd.Timestamp(row[0], unit="ms", tz="UTC"),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "volume": float(row[5]),
            })

        current_ts = data[-1][0] + 60000  # next minute
        req_count += 1
        if req_count % 20 == 0:
            print(f"    {len(all_rows):,} rows fetched...", end="\r")

        # Binance rate limit: 2400 req/min, be conservative
        if req_count % 100 == 0:
            time.sleep(1)

    if not all_rows:
        print(f"  WARNING: No data for {symbol} {start_date}~{end_date}")
        return pd.DataFrame()

    df = pd.DataFrame(all_rows)
    df = df.sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df.to_parquet(cache_path)
    print(f"  Done: {symbol} {start_date}~{end_date} → {len(df):,} rows ({cache_path.stat().st_size/1024/1024:.1f}MB)")
    return df


def main():
    """Download all required periods for backtest matrix"""
    tasks = [
        # BTC bull market
        ("BTCUSDT", "2024-10-01", "2025-06-01"),
        # BTC bear already cached: BTCUSDT_2022-01-01_2022-12-31.parquet
        # ETH
        ("ETHUSDT", "2024-10-01", "2025-06-01"),
        ("ETHUSDT", "2022-01-01", "2022-07-01"),
        # BNB
        ("BNBUSDT", "2024-10-01", "2025-06-01"),
        ("BNBUSDT", "2022-01-01", "2022-07-01"),
        # SOL
        ("SOLUSDT", "2025-01-01", "2026-01-01"),
    ]

    if len(sys.argv) > 1:
        # Allow running specific task: python fetch_binance_data.py BTCUSDT 2024-10-01 2025-06-01
        symbol = sys.argv[1]
        start = sys.argv[2]
        end = sys.argv[3]
        fetch_klines(symbol, start, end)
        return

    print(f"=== Binance Futures Data Fetcher ===")
    print(f"Tasks: {len(tasks)}")
    print()

    for symbol, start, end in tasks:
        try:
            fetch_klines(symbol, start, end)
        except Exception as e:
            print(f"  ERROR: {symbol} {start}~{end}: {e}")
        print()

    print("All done!")
    print(f"Cache dir: {CACHE_DIR}")
    print(f"Files: {list(CACHE_DIR.glob('*.parquet'))}")


if __name__ == "__main__":
    main()
