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
from datetime import datetime
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
        "ema_gap_setup_mode",
        "ema_gap_expectation",
        "management_template",
        "management_style",
        "setup_disposition",
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


def _mean(values: list[float]) -> float:
    """计算简单平均值。"""
    if not values:
        return 0.0
    return sum(values) / len(values)


def _calendar_days(start: str, end: str) -> int:
    """计算场景自然日跨度。"""
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    return max(1, (end_dt - start_dt).days + 1)


def _summarize_broad_range_scalp_only(rows: list[dict]) -> dict:
    """专门审 broad_range + scalp-only 这簇的真实 excursion。"""
    cluster = [
        row for row in rows
        if str(row.get("market_state") or "") == "broad_range"
        and str(row.get("setup_disposition") or "") == "scalp_only"
    ]
    wins = [row for row in cluster if row.get("result") == "WIN"]
    losses = [row for row in cluster if row.get("result") == "LOSS"]
    win_rate = len(wins) / len(cluster) * 100 if cluster else 0.0

    result = {
        "trades": len(cluster),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": round(win_rate, 2),
        "avg_mfe_r": round(_mean([float(row.get("mfe_r") or 0.0) for row in cluster]), 4),
        "avg_mae_r": round(_mean([float(row.get("mae_r") or 0.0) for row in cluster]), 4),
        "avg_win_mfe_r": round(_mean([float(row.get("mfe_r") or 0.0) for row in wins]), 4),
        "avg_loss_mfe_r": round(_mean([float(row.get("mfe_r") or 0.0) for row in losses]), 4),
        "avg_loss_mae_r": round(_mean([float(row.get("mae_r") or 0.0) for row in losses]), 4),
        "loss_reached_positive_r": {},
        "all_reached_positive_r": {},
    }
    for threshold in [0.1, 0.2, 0.3, 0.5, 1.0]:
        label = f">={threshold:.1f}R"
        result["loss_reached_positive_r"][label] = sum(
            1 for row in losses if float(row.get("max_positive_r") or 0.0) >= threshold
        )
        result["all_reached_positive_r"][label] = sum(
            1 for row in cluster if float(row.get("max_positive_r") or 0.0) >= threshold
        )
    return result


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
    days = _calendar_days(args.start, args.end)

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
                "ema_gap_setup_mode": t.get("ema_gap_setup_mode"),
                "ema_gap_expectation": t.get("ema_gap_expectation"),
                "ema_gap_expectation_reason": t.get("ema_gap_expectation_reason"),
                "ema_gap_structure_reference_timeframe": t.get("ema_gap_structure_reference_timeframe"),
                "ema_gap_structure_reference_cycle": t.get("ema_gap_structure_reference_cycle"),
                "ema_gap_structure_reference_channel_type": t.get("ema_gap_structure_reference_channel_type"),
                "ema_gap_structure_direction_match": t.get("ema_gap_structure_direction_match"),
                "ema_gap_comfortable_window": t.get("ema_gap_comfortable_window"),
                "ema_gap_first_touch_pullback": t.get("ema_gap_first_touch_pullback"),
                "ema_gap_fresh_touch_window": t.get("ema_gap_fresh_touch_window"),
                "ema_gap_recent_reclaim_ready": t.get("ema_gap_recent_reclaim_ready"),
                "ema_gap_continuation_cycle_ready": t.get("ema_gap_continuation_cycle_ready"),
                "ema_gap_quasi_trend_recovery": t.get("ema_gap_quasi_trend_recovery"),
                "ema_gap_trend_restoration_bar": t.get("ema_gap_trend_restoration_bar"),
                "ema_gap_strong_recovery_bar": t.get("ema_gap_strong_recovery_bar"),
                "ema_gap_soft_recovery_bar": t.get("ema_gap_soft_recovery_bar"),
                "ema_gap_touch_count": t.get("ema_gap_touch_count"),
                "ema_gap_reclaim_count": t.get("ema_gap_reclaim_count"),
                "first_target_distance_r": t.get("first_target_distance_r"),
                "close_test_target_distance_r": t.get("close_test_target_distance_r"),
                "rescue_target_distance_r": t.get("rescue_target_distance_r"),
                "swing_target_distance_r": t.get("swing_target_distance_r"),
                "mfe_price": t.get("mfe_price"),
                "mae_price": t.get("mae_price"),
                "mfe_r": t.get("mfe_r"),
                "mae_r": t.get("mae_r"),
                "max_positive_r": t.get("max_positive_r"),
                "max_negative_r": t.get("max_negative_r"),
                "entry_type": t.get("entry_type"),
                "original_entry_price": t.get("original_entry_price"),
                "valid_previous_entry": t.get("valid_previous_entry"),
                "signal_bar_type": t.get("signal_bar_type"),
                "signal_bar_quality": t.get("signal_bar_quality"),
                "signal_bar_close_position": t.get("signal_bar_close_position"),
                "signal_bar_tail_ratio": t.get("signal_bar_tail_ratio"),
                "management_template": t.get("management_template"),
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
            "calendar_days": days,
            "daily_frequency": len(result.trades) / days if days else 0.0,
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
        "cluster_analysis": {
            "broad_range_scalp_only": _summarize_broad_range_scalp_only(rows),
        },
        "trades": rows,
    }

    output = Path(args.output)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))
    print(str(output))


if __name__ == "__main__":
    main()
