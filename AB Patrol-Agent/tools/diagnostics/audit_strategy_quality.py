#!/usr/bin/env python3
"""
按策略审计成交质量。

输出重点：
1. 每个策略的生成 / 放行 / 成交数；
2. 每个策略的胜率、PF、平均持仓、平均 R 倍数；
3. 哪些策略虽然能生成，但质量明显偏差。
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402
from libs.backtest.strategy_filters import ALL_KNOWN_STRATEGIES, classify_strategy_family  # noqa: E402

TIMEFRAME_MINUTES = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}


@dataclass
class AuditWindow:
    """单个审计时间窗口。"""

    label: str
    start: str
    end: str


def parse_csv(raw: str) -> list[str]:
    """解析逗号分隔参数。"""
    return [item.strip() for item in str(raw or "").split(",") if item.strip()]


def parse_windows(raw: str) -> list[AuditWindow]:
    """解析时间窗口列表。"""
    windows: list[AuditWindow] = []
    for index, item in enumerate(parse_csv(raw), start=1):
        if ":" not in item:
            raise ValueError(f"无效窗口定义: {item}")
        start, end = item.split(":", 1)
        datetime.fromisoformat(start.strip())
        datetime.fromisoformat(end.strip())
        windows.append(AuditWindow(label=f"W{index}", start=start.strip(), end=end.strip()))
    return windows


def new_bucket(strategy: str) -> dict[str, Any]:
    """初始化策略聚合桶。"""
    return {
        "strategy": strategy,
        "generated": 0,
        "passed": 0,
        "filtered": 0,
        "trades": 0,
        "wins": 0,
        "losses": 0,
        "scratches": 0,
        "gross_profit": 0.0,
        "gross_loss": 0.0,
        "pnl_sum": 0.0,
        "r_multiple_sum": 0.0,
        "bars_held_sum": 0,
        "holding_minutes_sum": 0.0,
        "account_pnl_pct_sum": 0.0,
        "samples": 0,
        "exit_reasons": defaultdict(int),
    }


def update_bucket_from_trade(bucket: dict[str, Any], trade: dict[str, Any]) -> None:
    """用单笔成交更新策略聚合桶。"""
    bucket["trades"] += 1
    bucket["samples"] += 1
    pnl_pct = float(trade.get("pnl_pct", 0.0) or 0.0)
    r_multiple = float(trade.get("r_multiple", 0.0) or 0.0)
    bars_held = int(trade.get("bars_held", 0) or 0)
    timeframe = str(trade.get("timeframe", "") or "")
    minutes = TIMEFRAME_MINUTES.get(timeframe, 0)
    holding_minutes = bars_held * minutes

    bucket["pnl_sum"] += pnl_pct
    bucket["r_multiple_sum"] += r_multiple
    bucket["bars_held_sum"] += bars_held
    bucket["holding_minutes_sum"] += holding_minutes
    bucket["account_pnl_pct_sum"] += float(trade.get("account_pnl_pct", 0.0) or 0.0)
    bucket["exit_reasons"][str(trade.get("exit_reason") or "UNKNOWN")] += 1

    result = str(trade.get("result") or "")
    if result == "WIN":
        bucket["wins"] += 1
        bucket["gross_profit"] += max(0.0, pnl_pct)
    elif result == "LOSS":
        bucket["losses"] += 1
        bucket["gross_loss"] += abs(min(0.0, pnl_pct))
    else:
        bucket["scratches"] += 1


def finalize_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    """把聚合桶整理成可输出结构。"""
    trades = int(bucket["trades"] or 0)
    gross_profit = float(bucket["gross_profit"] or 0.0)
    gross_loss = float(bucket["gross_loss"] or 0.0)
    top_exit_reasons = dict(
        sorted(bucket["exit_reasons"].items(), key=lambda item: (-int(item[1]), item[0]))[:5]
    )
    return {
        "strategy": bucket["strategy"],
        "generated": int(bucket["generated"] or 0),
        "passed": int(bucket["passed"] or 0),
        "filtered": int(bucket["filtered"] or 0),
        "trades": trades,
        "wins": int(bucket["wins"] or 0),
        "losses": int(bucket["losses"] or 0),
        "scratches": int(bucket["scratches"] or 0),
        "win_rate": (float(bucket["wins"]) / trades * 100) if trades else 0.0,
        "profit_factor": (
            gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)
        ),
        "avg_pnl_pct": (float(bucket["pnl_sum"]) / trades) if trades else 0.0,
        "avg_r_multiple": (float(bucket["r_multiple_sum"]) / trades) if trades else 0.0,
        "avg_bars_held": (float(bucket["bars_held_sum"]) / trades) if trades else 0.0,
        "avg_holding_minutes": (float(bucket["holding_minutes_sum"]) / trades) if trades else 0.0,
        "avg_account_pnl_pct": (float(bucket["account_pnl_pct_sum"]) / trades) if trades else 0.0,
        "top_exit_reasons": top_exit_reasons,
    }


def build_sample_row(symbol: str, timeframe: str, window: AuditWindow, bucket: dict[str, Any]) -> dict[str, Any]:
    """把单个品种/周期样本桶整理成输出行。"""
    row = finalize_bucket(bucket)
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "window": window.label,
        "start": window.start,
        "end": window.end,
        "total_trades": row["trades"],
        "win_rate": row["win_rate"],
        "profit_factor": row["profit_factor"],
        "avg_r_multiple": row["avg_r_multiple"],
    }


def merge_bucket(target: dict[str, Any], source: dict[str, Any]) -> None:
    """把原始策略桶聚合到族级桶。"""
    for key in (
        "generated",
        "passed",
        "filtered",
        "trades",
        "wins",
        "losses",
        "scratches",
        "gross_profit",
        "gross_loss",
        "pnl_sum",
        "r_multiple_sum",
        "bars_held_sum",
        "holding_minutes_sum",
        "account_pnl_pct_sum",
        "samples",
    ):
        target[key] += source[key]
    for reason, count in source["exit_reasons"].items():
        target["exit_reasons"][reason] += count


def main() -> None:
    parser = argparse.ArgumentParser(description="按策略审计成交质量")
    parser.add_argument("--symbols", default="BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT", help="币种，逗号分隔")
    parser.add_argument("--timeframes", default="5m,15m,1h", help="周期，逗号分隔")
    parser.add_argument(
        "--windows",
        required=True,
        help="窗口列表，格式 2022-01-01:2022-02-01,2023-01-01:2023-02-01",
    )
    parser.add_argument(
        "--management-profile",
        default="brooks_pdf",
        help="回测管理模板，默认使用 Brooks 管理语义",
    )
    parser.add_argument("--cache-dir", default=str(ROOT / "data" / "history" / "hf_parquet"), help="历史数据目录")
    parser.add_argument("--output", default="", help="输出 JSON 路径")
    args = parser.parse_args()

    symbols = parse_csv(args.symbols)
    timeframes = parse_csv(args.timeframes)
    windows = parse_windows(args.windows)

    strategy_buckets: dict[str, dict[str, Any]] = {
        strategy: new_bucket(strategy) for strategy in ALL_KNOWN_STRATEGIES
    }
    sample_rows: list[dict[str, Any]] = []

    for window in windows:
        cfg = BacktestConfig(
            symbols=symbols,
            timeframes=timeframes,
            start_date=window.start,
            end_date=window.end,
            days=max(1, (datetime.fromisoformat(window.end) - datetime.fromisoformat(window.start)).days),
            threshold=0,
            cache_dir=args.cache_dir,
            management_profile=args.management_profile,
        )
        result = BacktestRunner(cfg).run()

        for strategy in ALL_KNOWN_STRATEGIES:
            bucket = strategy_buckets[strategy]
            bucket["generated"] += int(result.signals_generated_by_strategy.get(strategy, 0) or 0)
            bucket["passed"] += int(result.signals_passed_by_strategy.get(strategy, 0) or 0)
            bucket["filtered"] += int(result.signals_blocked_strategy_by_strategy.get(strategy, 0) or 0)

        sample_buckets: dict[tuple[str, str], dict[str, Any]] = {}
        for trade in result.trades:
            strategy = str(trade.get("strategy") or "UNKNOWN")
            strategy_buckets.setdefault(strategy, new_bucket(strategy))
            update_bucket_from_trade(strategy_buckets[strategy], trade)

            sample_key = (
                str(trade.get("symbol") or "UNKNOWN"),
                str(trade.get("timeframe") or "UNKNOWN"),
            )
            sample_bucket = sample_buckets.setdefault(sample_key, new_bucket("sample"))
            update_bucket_from_trade(sample_bucket, trade)

        for (symbol, timeframe), bucket in sorted(sample_buckets.items()):
            sample_rows.append(build_sample_row(symbol, timeframe, window, bucket))

    strategy_rows = [
        finalize_bucket(bucket) for bucket in sorted(strategy_buckets.values(), key=lambda item: item["strategy"])
    ]
    strategy_rows.sort(key=lambda item: (-int(item["trades"]), item["strategy"]))

    family_buckets: dict[str, dict[str, Any]] = {}
    for strategy, bucket in strategy_buckets.items():
        family = classify_strategy_family(strategy)
        family_bucket = family_buckets.setdefault(family, new_bucket(family))
        merge_bucket(family_bucket, bucket)
    family_rows = []
    for family, bucket in family_buckets.items():
        row = finalize_bucket(bucket)
        row["family"] = family
        family_rows.append(row)
    family_rows.sort(key=lambda item: (-int(item["trades"]), item["strategy"]))

    payload = {
        "windows": [asdict(window) for window in windows],
        "samples": sample_rows,
        "summary": strategy_rows,
        "family_summary": family_rows,
        "zero_generated": [row["strategy"] for row in strategy_rows if int(row["generated"]) == 0],
        "zero_passed": [row["strategy"] for row in strategy_rows if int(row["passed"]) == 0],
        "zero_trades": [row["strategy"] for row in strategy_rows if int(row["trades"]) == 0],
        "top_traded": strategy_rows[:10],
        "top_families": family_rows[:10],
        "worst_profit_factor": sorted(
            strategy_rows,
            key=lambda item: (float(item["profit_factor"]), -int(item["trades"])),
        )[:10],
    }

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"已写出: {output_path}")
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
