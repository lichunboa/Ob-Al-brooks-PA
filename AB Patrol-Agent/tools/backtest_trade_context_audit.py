"""
回测交易上下文审计。

用途：
1. 直接运行单次回测，保留交易级明细；
2. 聚合指定策略在不同上下文中的胜率 / 盈亏因子；
3. 用于定位 Brooks 路由里哪些上下文应该继续收紧。
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.append(str(ROOT))

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402,I001


CONTEXT_FIELDS = [
    "market_state",
    "higher_market_state",
    "follow_through",
    "higher_follow_through",
    "trendline_break_confirmed",
    "failed_breakout_evidence",
    "signal_bar_quality",
    "signal_bar_tail_ratio",
    "signal_bar_close_position",
    "reclaimed_prior_close",
    "broke_micro_extreme",
    "candidate_stage",
    "requires_second_entry",
    "acceptance_ready",
    "executable_signal_ready",
    "first_target_distance_r",
    "blocking_magnet_distance_r",
    "trapped_side",
    "prior_leg_context",
    "prior_leg_bars",
    "prior_leg_overlap_ratio",
    "playbook_id",
    "playbook_family",
    "order_bias",
    "signal_stage",
    "signal_stage_reason",
    "background",
    "entry_type",
    "route_style",
    "management_style",
    "target_path_clear",
    "stop_structure_ok",
    "exit_reason",
]


def _bucket_stats() -> dict[str, float | int]:
    return {
        "trades": 0,
        "wins": 0,
        "losses": 0,
        "scratches": 0,
        "gross_profit": 0.0,
        "gross_loss": 0.0,
        "pnl": 0.0,
    }


def _update_bucket(bucket: dict[str, float | int], trade: dict) -> None:
    bucket["trades"] += 1
    bucket["pnl"] += float(trade["pnl_pct"])
    result = str(trade["result"])
    pnl = float(trade["pnl_pct"])
    if result == "WIN":
        bucket["wins"] += 1
        bucket["gross_profit"] += max(0.0, pnl)
    elif result == "LOSS":
        bucket["losses"] += 1
        bucket["gross_loss"] += abs(min(0.0, pnl))
    else:
        bucket["scratches"] += 1


def _finalize_bucket(bucket: dict[str, float | int]) -> dict[str, float | int]:
    trades = int(bucket["trades"])
    wins = int(bucket["wins"])
    gross_profit = float(bucket["gross_profit"])
    gross_loss = float(bucket["gross_loss"])
    return {
        **bucket,
        "win_rate": round(wins / trades * 100, 2) if trades else 0.0,
        "profit_factor": (
            round(gross_profit / gross_loss, 4)
            if gross_loss > 0
            else (999.0 if gross_profit > 0 else 0.0)
        ),
    }


def aggregate_contexts(trades: list[dict], strategies: set[str]) -> dict:
    strategy_buckets: dict[str, dict[str, dict[str, dict[str, float | int]]]] = {}

    for strategy in sorted(strategies):
        strategy_trades = [trade for trade in trades if trade["strategy"] == strategy]
        per_field: dict[str, dict[str, dict[str, float | int]]] = {}
        for field in CONTEXT_FIELDS:
            grouped: dict[str, dict[str, float | int]] = defaultdict(_bucket_stats)
            for trade in strategy_trades:
                key = str(trade.get(field, "UNKNOWN"))
                _update_bucket(grouped[key], trade)
            per_field[field] = {
                key: _finalize_bucket(bucket)
                for key, bucket in sorted(grouped.items(), key=lambda item: (-int(item[1]["trades"]), item[0]))
            }
        strategy_buckets[strategy] = per_field

    return strategy_buckets


def run_single(symbol: str, timeframe: str, start: str, end: str, threshold: int, management_profile: str,
               engine_thresholds: dict[str, int]) -> dict:
    cfg = BacktestConfig(
        symbols=[symbol],
        timeframes=[timeframe],
        start_date=start,
        end_date=end,
        threshold=threshold,
        management_profile=management_profile,
        engine_threshold_overrides=engine_thresholds,
    )
    result = BacktestRunner(cfg).run()
    payload = json.loads(result.to_json())
    payload["symbol"] = symbol
    payload["timeframe"] = timeframe
    payload["start"] = start
    payload["end"] = end
    return payload


def parse_overrides(raw: str) -> dict[str, int]:
    overrides: dict[str, int] = {}
    for chunk in (part.strip() for part in raw.split(",") if part.strip()):
        key, value = chunk.split(":", 1)
        overrides[key.strip()] = int(value.strip())
    return overrides


def main() -> None:
    parser = argparse.ArgumentParser(description="分析指定回测条件下的交易上下文。")
    parser.add_argument("--symbols", default="BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT", help="逗号分隔")
    parser.add_argument("--timeframe", default="5m")
    parser.add_argument("--segments", default="2026-02-18:2026-03-11,2026-01-04:2026-01-25", help="start:end,...")
    parser.add_argument("--threshold", type=int, default=60)
    parser.add_argument("--management-profile", default="brooks_pdf")
    parser.add_argument("--engine-thresholds", default="5m:80,15m:70")
    parser.add_argument("--strategies", default="高2,低2", help="只统计这些策略")
    parser.add_argument("--output", default="", help="输出 JSON")
    args = parser.parse_args()

    symbols = [item.strip() for item in args.symbols.split(",") if item.strip()]
    strategies = {item.strip() for item in args.strategies.split(",") if item.strip()}
    overrides = parse_overrides(args.engine_thresholds) if args.engine_thresholds else {}
    segments = []
    for chunk in (item.strip() for item in args.segments.split(",") if item.strip()):
        start, end = chunk.split(":", 1)
        segments.append((start.strip(), end.strip()))

    runs = []
    all_trades: list[dict] = []
    for symbol in symbols:
        for start, end in segments:
            payload = run_single(
                symbol=symbol,
                timeframe=args.timeframe,
                start=start,
                end=end,
                threshold=args.threshold,
                management_profile=args.management_profile,
                engine_thresholds=overrides,
            )
            runs.append(payload)
            for trade in payload.get("trades", []):
                trade["symbol"] = symbol
                trade["timeframe"] = args.timeframe
                trade["segment"] = f"{start}:{end}"
                all_trades.append(trade)

    filtered = [trade for trade in all_trades if trade["strategy"] in strategies]
    grouped_by_strategy = aggregate_contexts(filtered, strategies)

    report = {
        "config": {
            "symbols": symbols,
            "timeframe": args.timeframe,
            "segments": segments,
            "threshold": args.threshold,
            "management_profile": args.management_profile,
            "engine_thresholds": overrides,
            "strategies": sorted(strategies),
        },
        "runs": runs,
        "filtered_trade_count": len(filtered),
        "contexts": grouped_by_strategy,
        "trades": filtered,
    }

    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(text + "\n", encoding="utf-8")
        print(f"已写入报告: {output}")
    print(text)


if __name__ == "__main__":
    main()
