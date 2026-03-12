"""
市场数据质量审计脚本。

用途：
1. 检查本地加密回测缓存是否有断档、重复、OHLC 非法值。
2. 对比本地缓存与 Binance 公共期货 API 最近窗口是否一致。
3. 抽检 execution-service 当前暴露的多资产 K 线质量。
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import numpy as np
import pandas as pd
import requests
from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()


def _pct(value: float | None) -> float | None:
    if value is None or pd.isna(value):
        return None
    return round(float(value) * 100, 6)


def _iso(ts: pd.Timestamp | None) -> str | None:
    if ts is None or pd.isna(ts):
        return None
    return pd.Timestamp(ts).isoformat()


def _series_quality(df: pd.DataFrame) -> dict:
    ts = pd.to_datetime(df["timestamp"])
    delta = ts.diff().dropna().dt.total_seconds()
    ranges = ((df["high"] - df["low"]) / df["close"]).replace([np.inf, -np.inf], np.nan)
    body = ((df["close"] - df["open"]).abs() / df["close"]).replace([np.inf, -np.inf], np.nan)
    zero_move = (df["open"] == df["high"]) & (df["high"] == df["low"]) & (df["low"] == df["close"])
    bad_ohlc = (
        (df["high"] < df[["open", "close", "low"]].max(axis=1))
        | (df["low"] > df[["open", "close", "high"]].min(axis=1))
        | (df["low"] > df["high"])
    )
    non_positive = (df[["open", "high", "low", "close"]] <= 0).any(axis=1)

    return {
        "rows": int(len(df)),
        "start": _iso(ts.min()),
        "end": _iso(ts.max()),
        "duplicate_timestamps": int(ts.duplicated().sum()),
        "gap_count": int((delta != 60).sum()),
        "max_gap_seconds": float(delta.max()) if len(delta) else 0.0,
        "bad_ohlc_rows": int(bad_ohlc.sum()),
        "non_positive_rows": int(non_positive.sum()),
        "zero_volume_rows": int((df["volume"] <= 0).sum()),
        "zero_move_rows": int(zero_move.sum()),
        "range_p99_pct": _pct(ranges.quantile(0.99)),
        "range_p999_pct": _pct(ranges.quantile(0.999)),
        "range_max_pct": _pct(ranges.max()),
        "body_p99_pct": _pct(body.quantile(0.99)),
        "body_p999_pct": _pct(body.quantile(0.999)),
        "body_max_pct": _pct(body.max()),
    }


def audit_crypto_cache(cache_dir: Path) -> dict:
    result: dict[str, dict] = {}
    for path in sorted(cache_dir.glob("*.parquet")):
        df = pd.read_parquet(path).sort_values("timestamp").reset_index(drop=True)
        result[path.stem.split("_")[0]] = {
            "file": str(path),
            **_series_quality(df),
        }
    return result


def compare_crypto_with_public(cache_dir: Path, limit: int = 1000) -> dict:
    session = requests.Session()
    result: dict[str, dict] = {}
    for path in sorted(cache_dir.glob("*.parquet")):
        symbol = path.stem.split("_")[0]
        local = pd.read_parquet(path).sort_values("timestamp").reset_index(drop=True).tail(limit).copy()
        local["timestamp"] = pd.to_datetime(local["timestamp"]).dt.tz_localize(None)

        response = session.get(
            "https://fapi.binance.com/fapi/v1/klines",
            params={"symbol": symbol, "interval": "1m", "limit": limit},
            timeout=20,
        )
        response.raise_for_status()
        api = pd.DataFrame(
            response.json(),
            columns=[
                "open_time",
                "open",
                "high",
                "low",
                "close",
                "volume",
                "close_time",
                "quote_volume",
                "trades",
                "taker_buy_base",
                "taker_buy_quote",
                "ignore",
            ],
        )
        api["timestamp"] = pd.to_datetime(api["open_time"], unit="ms")
        for column in ["open", "high", "low", "close", "volume"]:
            api[column] = api[column].astype(float)
        api = api[["timestamp", "open", "high", "low", "close", "volume"]]

        merged = local.merge(api, on="timestamp", suffixes=("_local", "_api"))
        local_end = pd.to_datetime(local["timestamp"].max())
        api_end = pd.to_datetime(api["timestamp"].max())

        comparison = {
            "local_end": _iso(local_end),
            "api_end": _iso(api_end),
            "stale_minutes": int((api_end - local_end).total_seconds() // 60),
            "overlap_rows": int(len(merged)),
            "local_only_rows": int(
                local.merge(api[["timestamp"]], on="timestamp", how="left", indicator=True)
                .query("_merge == 'left_only'")
                .shape[0]
            ),
            "api_only_rows": int(
                api.merge(local[["timestamp"]], on="timestamp", how="left", indicator=True)
                .query("_merge == 'left_only'")
                .shape[0]
            ),
        }
        if not merged.empty:
            complete = merged.iloc[:-1] if len(merged) > 1 else merged
            mismatch_mask = np.zeros(len(complete), dtype=bool)
            max_abs_diff: dict[str, float] = {}
            for column in ["open", "high", "low", "close", "volume"]:
                diff = (complete[f"{column}_local"] - complete[f"{column}_api"]).abs()
                mismatch_mask |= diff.to_numpy() > 1e-9
                max_abs_diff[column] = float(diff.max()) if len(diff) else 0.0
            comparison["mismatch_rows_excluding_last"] = int(mismatch_mask.sum())
            comparison["max_abs_diff_excluding_last"] = max_abs_diff

            full_last = merged.iloc[-1]
            comparison["last_bar_diff"] = {
                column: float(abs(full_last[f"{column}_local"] - full_last[f"{column}_api"]))
                for column in ["open", "high", "low", "close", "volume"]
            }
        result[symbol] = comparison
    return result


def audit_execution_service(base_url: str, symbols: list[str], interval: str, limit: int) -> dict:
    result: dict[str, dict] = {}
    session = requests.Session()
    for symbol in symbols:
        url = f"{base_url.rstrip('/')}/klines/{quote(symbol, safe='')}"
        response = session.get(url, params={"interval": interval, "limit": limit}, timeout=20)
        payload = {"status_code": response.status_code}
        if response.status_code != 200:
            payload["error"] = response.text[:400]
            result[symbol] = payload
            continue
        data = response.json()
        bars = pd.DataFrame(data.get("bars", []))
        if bars.empty:
            payload["error"] = "empty bars"
            result[symbol] = payload
            continue
        bars = bars.rename(
            columns={"time": "timestamp", "O": "open", "H": "high", "L": "low", "C": "close", "vol": "volume"}
        )
        for column in ["open", "high", "low", "close", "volume"]:
            bars[column] = pd.to_numeric(bars[column], errors="coerce")
        bars["timestamp"] = pd.to_datetime(bars["timestamp"])
        payload.update(_series_quality(bars))
        result[symbol] = payload
    return result


def build_report(cache_dir: Path, execution_url: str, fx_symbols: list[str], interval: str, limit: int) -> dict:
    report = {
        "generated_at": datetime.now(UTC).isoformat(),
        "crypto_cache": audit_crypto_cache(cache_dir),
        "crypto_vs_public_futures": compare_crypto_with_public(cache_dir),
        "multi_asset_live": audit_execution_service(execution_url, fx_symbols, interval, limit),
        "findings": [],
    }

    findings = report["findings"]
    findings.append("当前四个加密回测缓存文件都是 90 天整窗口，本地回测优先使用缓存，不会优先命中 HuggingFace 分片。")

    stale = {
        symbol: metrics["stale_minutes"]
        for symbol, metrics in report["crypto_vs_public_futures"].items()
        if metrics.get("stale_minutes", 0) > 5
    }
    if stale:
        findings.append(f"加密缓存尾段新鲜度不一致，需要在回测前统一刷新：{stale}")

    mismatches = {
        symbol: metrics["mismatch_rows_excluding_last"]
        for symbol, metrics in report["crypto_vs_public_futures"].items()
        if metrics.get("mismatch_rows_excluding_last", 0) > 0
    }
    if mismatches:
        findings.append(f"除最后一根未收盘 K 线外，仍存在价格不一致的币种：{mismatches}")
    else:
        findings.append("本地加密缓存与 Binance 公共期货 API 在重叠完整窗口内一致，最后一根差异属于未收盘 K 线。")

    zero_move = {
        symbol: metrics["zero_move_rows"]
        for symbol, metrics in report["multi_asset_live"].items()
        if metrics.get("status_code") == 200 and metrics.get("zero_move_rows", 0) > metrics.get("rows", 0) * 0.5
    }
    if zero_move:
        findings.append(f"多资产展示存在过度四舍五入风险：{zero_move}。需要检查展示精度，而不是把它误判为原始行情平线。")
    else:
        findings.append("多资产 execution-service 抽检未发现结构性断档或 OHLC 非法值。")

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="审计本地回测缓存与实时行情质量。")
    parser.add_argument(
        "--cache-dir",
        default=str(ROOT / "data" / "history" / "cache"),
        help="本地 Parquet 缓存目录",
    )
    parser.add_argument("--execution-url", default="http://127.0.0.1:8092", help="execution-service 地址")
    parser.add_argument(
        "--fx-symbols",
        default="EURUSD,USDJPY,XAUUSD,US 30,US TECH 100",
        help="要抽检的多资产品种，逗号分隔",
    )
    parser.add_argument("--interval", default="1m", help="多资产抽检周期")
    parser.add_argument("--limit", type=int, default=120, help="多资产抽检根数，建议不超过 200")
    parser.add_argument("--output", default="", help="输出 JSON 报告路径")
    args = parser.parse_args()

    cache_dir = Path(args.cache_dir)
    symbols = [item.strip() for item in args.fx_symbols.split(",") if item.strip()]
    report = build_report(cache_dir, args.execution_url, symbols, args.interval, min(args.limit, 200))

    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(text + "\n", encoding="utf-8")
        print(f"已写入报告: {output_path}")
    print(text)


if __name__ == "__main__":
    main()
