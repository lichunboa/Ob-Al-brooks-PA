#!/usr/bin/env python3
"""
均线缺口单策略逐笔审计脚本。

用途：
1. 只跑单个 gap 子策略，输出逐笔成交明细
2. 补出 20-gap 继续拆需要的关键字段
3. 让后续归零分析不再依赖临时内联脚本
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402


def _summarize(rows: list[dict]) -> dict:
    """按关键维度做简单分桶。"""
    summary: dict[str, dict[str, dict[str, int]]] = {}
    for key in [
        "signal_bar_type",
        "market_state",
        "higher_market_state",
        "ema_gap_expectation",
        "valid_previous_entry",
    ]:
        buckets: dict[str, dict[str, int]] = {}
        for row in rows:
            label = str(row.get(key) or "")
            rec = buckets.setdefault(label, {"trades": 0, "wins": 0, "losses": 0})
            rec["trades"] += 1
            rec["wins"] += 1 if row.get("result") == "WIN" else 0
            rec["losses"] += 1 if row.get("result") == "LOSS" else 0
        summary[key] = buckets
    return summary


def main() -> None:
    """脚本入口。"""
    parser = argparse.ArgumentParser(description="均线缺口逐笔审计")
    parser.add_argument("--symbol", required=True)
    parser.add_argument("--timeframe", required=True)
    parser.add_argument("--start", required=True)
    parser.add_argument("--end", required=True)
    parser.add_argument(
        "--strategy",
        default="20均线缺口",
        choices=["20均线缺口", "第一均线缺口", "MAG 20/20 Setup"],
    )
    parser.add_argument(
        "--cache-dir",
        default=str(ROOT / "data" / "history" / "hf_parquet"),
    )
    parser.add_argument("--fee-rate", type=float, default=0.0004)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    config = BacktestConfig(
        symbols=[args.symbol],
        timeframes=[args.timeframe],
        start_date=args.start,
        end_date=args.end,
        days=1,
        threshold=0,
        cache_dir=args.cache_dir,
        fee_rate=args.fee_rate,
        management_profile="brooks_pdf",
        strategy_whitelist=[args.strategy],
    )
    result = BacktestRunner(config).run()

    rows: list[dict] = []
    for t in result.trades:
        rows.append(
            {
                "entry_time": t.get("entry_time"),
                "exit_time": t.get("exit_time"),
                "result": t.get("result"),
                "exit_reason": t.get("exit_reason"),
                "market_state": t.get("market_state"),
                "higher_market_state": t.get("higher_market_state"),
                "ema_gap_variant": t.get("ema_gap_variant"),
                "ema_gap_bars": t.get("ema_gap_bars"),
                "ema_gap_context_tier": t.get("ema_gap_context_tier"),
                "ema_gap_expectation": t.get("ema_gap_expectation"),
                "ema_gap_expectation_reason": t.get("ema_gap_expectation_reason"),
                "first_target_distance_r": t.get("first_target_distance_r"),
                "close_test_target_distance_r": t.get("close_test_target_distance_r"),
                "rescue_target_distance_r": t.get("rescue_target_distance_r"),
                "swing_target_distance_r": t.get("swing_target_distance_r"),
                "valid_previous_entry": t.get("valid_previous_entry"),
                "signal_bar_type": t.get("signal_bar_type"),
                "signal_bar_quality": t.get("signal_bar_quality"),
                "signal_bar_close_position": t.get("signal_bar_close_position"),
                "signal_bar_tail_ratio": t.get("signal_bar_tail_ratio"),
                "management_style": t.get("management_style"),
                "setup_disposition": t.get("setup_disposition"),
                "setup_disposition_reason": t.get("setup_disposition_reason"),
            }
        )

    payload = {
        "scenario": {
            "symbol": args.symbol,
            "timeframe": args.timeframe,
            "start": args.start,
            "end": args.end,
            "strategy": args.strategy,
        },
        "summary": {
            "trades": len(result.trades),
            "win_rate": result.win_rate,
            "profit_factor": result.profit_factor,
            "signals_generated": result.signals_generated,
            "signals_passed": result.signals_passed,
            "signals_generated_by_strategy": dict(result.signals_generated_by_strategy),
            "signals_passed_by_strategy": dict(result.signals_passed_by_strategy),
            "entry_block_by_strategy": dict(result.entry_block_by_strategy),
            "by_exit_reason": dict(result.by_exit_reason),
        },
        "buckets": _summarize(rows),
        "trades": rows,
    }

    output = Path(args.output)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))
    print(str(output))


if __name__ == "__main__":
    main()
