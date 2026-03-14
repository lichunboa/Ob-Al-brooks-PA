#!/usr/bin/env python3
"""
精选样本管理链报告。

用途：
1. 用少量但有代表性的 Brooks 样本，快速验证整条管理链是否偏离方向；
2. 汇总策略、家族、退出原因、管理动作占比；
3. 可选对照历史基线 JSON，输出前后差异。
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402
from libs.backtest.strategy_filters import classify_strategy_family, normalize_management_style  # noqa: E402

TIMEFRAME_MINUTES = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "30m": 30,
    "1h": 60,
    "4h": 240,
    "1d": 1440,
}

PREMISE_EXIT_REASONS = {"PREMISE", "FAILED_FT", "WEAK_SCALP", "ZOMBIE"}


@dataclass
class Scenario:
    """单个精选回测场景。"""

    label: str
    symbol: str
    timeframe: str
    start: str
    end: str


DEFAULT_SCENARIOS = [
    Scenario("C1_BTC_5m_2022", "BTCUSDT", "5m", "2022-01-24", "2022-02-23"),
    Scenario("C2_BTC_15m_2022", "BTCUSDT", "15m", "2022-01-24", "2022-02-23"),
    Scenario("C3_ETH_5m_2022", "ETHUSDT", "5m", "2022-01-24", "2022-02-23"),
    Scenario("C4_ETH_15m_2023", "ETHUSDT", "15m", "2023-07-10", "2023-08-09"),
    Scenario("C5_BTC_1h_2022", "BTCUSDT", "1h", "2022-01-24", "2022-02-23"),
    Scenario("R1_BTC_5m_2025", "BTCUSDT", "5m", "2025-05-06", "2025-06-05"),
    Scenario("R2_ETH_15m_2023Q1", "ETHUSDT", "15m", "2023-01-13", "2023-02-12"),
    Scenario("R3_BNB_15m_2022Q1", "BNBUSDT", "15m", "2022-02-27", "2022-03-29"),
    Scenario("R4_SOL_15m_2025Q2", "SOLUSDT", "15m", "2025-05-06", "2025-06-05"),
]


def new_quality_bucket(name: str) -> dict[str, Any]:
    """初始化质量聚合桶。"""
    return {
        "name": name,
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
        "exit_reasons": defaultdict(int),
    }


def update_quality_bucket(bucket: dict[str, Any], trade: dict[str, Any]) -> None:
    """用单笔交易更新质量桶。"""
    bucket["trades"] += 1
    pnl_pct = float(trade.get("pnl_pct", 0.0) or 0.0)
    r_multiple = float(trade.get("r_multiple", 0.0) or 0.0)
    bars_held = int(trade.get("bars_held", 0) or 0)
    timeframe = str(trade.get("timeframe", "") or "")
    minutes = TIMEFRAME_MINUTES.get(timeframe, 0)

    bucket["pnl_sum"] += pnl_pct
    bucket["r_multiple_sum"] += r_multiple
    bucket["bars_held_sum"] += bars_held
    bucket["holding_minutes_sum"] += bars_held * minutes
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


def finalize_quality_bucket(bucket: dict[str, Any]) -> dict[str, Any]:
    """整理质量桶输出。"""
    trades = int(bucket["trades"] or 0)
    gross_profit = float(bucket["gross_profit"] or 0.0)
    gross_loss = float(bucket["gross_loss"] or 0.0)
    return {
        "name": bucket["name"],
        "generated": int(bucket["generated"] or 0),
        "passed": int(bucket["passed"] or 0),
        "filtered": int(bucket["filtered"] or 0),
        "trades": trades,
        "win_rate": (float(bucket["wins"]) / trades * 100) if trades else 0.0,
        "profit_factor": gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0),
        "avg_pnl_pct": float(bucket["pnl_sum"]) / trades if trades else 0.0,
        "avg_r_multiple": float(bucket["r_multiple_sum"]) / trades if trades else 0.0,
        "avg_bars_held": float(bucket["bars_held_sum"]) / trades if trades else 0.0,
        "avg_holding_minutes": float(bucket["holding_minutes_sum"]) / trades if trades else 0.0,
        "top_exit_reasons": dict(
            sorted(bucket["exit_reasons"].items(), key=lambda item: (-int(item[1]), item[0]))[:5]
        ),
    }


def merge_quality_bucket(target: dict[str, Any], source: dict[str, Any]) -> None:
    """把策略桶合并到家族桶。"""
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
    ):
        target[key] += source[key]
    for reason, count in source["exit_reasons"].items():
        target["exit_reasons"][reason] += count


def new_component_bucket(name: str) -> dict[str, Any]:
    """初始化管理动作桶。"""
    return {
        "name": name,
        "trades": 0,
        "wins": 0,
        "losses": 0,
        "gross_profit": 0.0,
        "gross_loss": 0.0,
        "pnl_sum": 0.0,
        "r_multiple_sum": 0.0,
    }


def update_component_bucket(bucket: dict[str, Any], trade: dict[str, Any]) -> None:
    """用单笔交易更新管理动作桶。"""
    bucket["trades"] += 1
    pnl_pct = float(trade.get("pnl_pct", 0.0) or 0.0)
    bucket["pnl_sum"] += pnl_pct
    bucket["r_multiple_sum"] += float(trade.get("r_multiple", 0.0) or 0.0)
    result = str(trade.get("result") or "")
    if result == "WIN":
        bucket["wins"] += 1
        bucket["gross_profit"] += max(0.0, pnl_pct)
    elif result == "LOSS":
        bucket["losses"] += 1
        bucket["gross_loss"] += abs(min(0.0, pnl_pct))


def finalize_component_bucket(bucket: dict[str, Any], total_trades: int) -> dict[str, Any]:
    """整理管理动作桶输出。"""
    trades = int(bucket["trades"] or 0)
    gross_profit = float(bucket["gross_profit"] or 0.0)
    gross_loss = float(bucket["gross_loss"] or 0.0)
    return {
        "name": bucket["name"],
        "trades": trades,
        "share_pct": trades / total_trades * 100 if total_trades else 0.0,
        "win_rate": (float(bucket["wins"]) / trades * 100) if trades else 0.0,
        "profit_factor": gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0),
        "avg_pnl_pct": float(bucket["pnl_sum"]) / trades if trades else 0.0,
        "avg_r_multiple": float(bucket["r_multiple_sum"]) / trades if trades else 0.0,
    }


def is_partial_close_involved(trade: dict[str, Any]) -> bool:
    """是否发生过分批止盈/减仓。"""
    return any(
        (
            bool(trade.get("tp1_done", False)),
            bool(trade.get("tp2_done", False)),
            int(trade.get("partial_close_count", 0) or 0) > 0,
            int(trade.get("premise_reduce_count", 0) or 0) > 0,
        )
    )


def is_trailing_stop_exit(trade: dict[str, Any]) -> bool:
    """是否属于被移损后的止损出场。"""
    if str(trade.get("exit_reason") or "") != "SL":
        return False
    initial_stop = float(trade.get("initial_stop_loss", 0.0) or 0.0)
    final_stop = float(trade.get("stop_loss", 0.0) or 0.0)
    return abs(final_stop - initial_stop) > 1e-9 or int(trade.get("stop_adjust_count", 0) or 0) > 0


def is_protective_stop_exit(trade: dict[str, Any]) -> bool:
    """是否属于保护性止损被打。"""
    return str(trade.get("trailing_exit_type") or "") == "protective_stop"


def is_runner_trailing_exit(trade: dict[str, Any]) -> bool:
    """是否属于真正余仓 trailing 退出。"""
    return str(trade.get("trailing_exit_type") or "") == "runner_trailing"


def is_breakeven_stop_exit(trade: dict[str, Any]) -> bool:
    """是否属于保本/保护性止损被打。"""
    if str(trade.get("exit_reason") or "") != "SL":
        return False
    entry_price = float(trade.get("entry_price", 0.0) or 0.0)
    final_stop = float(trade.get("stop_loss", 0.0) or 0.0)
    if entry_price <= 0 or final_stop <= 0:
        return False
    return abs(final_stop - entry_price) / entry_price <= 0.0015 or (
        (str(trade.get("direction") or "") == "BUY" and final_stop >= entry_price)
        or (str(trade.get("direction") or "") == "SELL" and final_stop <= entry_price)
    )


def is_take_profit_exit(trade: dict[str, Any]) -> bool:
    """是否由最终止盈结束。"""
    return str(trade.get("exit_reason") or "") == "TP"


def is_premise_failure_exit(trade: dict[str, Any]) -> bool:
    """是否属于 premise / 弱跟进链主动退出。"""
    return str(trade.get("exit_reason") or "") in PREMISE_EXIT_REASONS


def is_protective_scalp_involved(trade: dict[str, Any]) -> bool:
    """是否经历过保护性 scalp。"""
    return str(trade.get("management_state") or "") == "protective_scalp"


def is_protective_scalp_exit(trade: dict[str, Any]) -> bool:
    """是否由保护态主动兑现退出。"""
    return str(trade.get("profit_exit_type") or "") in {"protective_scalp", "protective_scalp_runner"}


def is_tp_after_scaleout_exit(trade: dict[str, Any]) -> bool:
    """是否属于 TP1/TP2 之后的余仓止盈。"""
    return str(trade.get("profit_exit_type") or "") == "tp_after_scaleout"


def parse_scenarios(raw: str) -> list[Scenario]:
    """解析场景 JSON；为空时使用默认值。"""
    if not raw:
        return list(DEFAULT_SCENARIOS)
    data = json.loads(raw)
    return [Scenario(**item) for item in data]


def load_baseline_samples(path: str) -> dict[tuple[str, str, str, str], dict[str, Any]]:
    """加载历史质量基线样本。"""
    if not path:
        return {}
    payload = json.loads(Path(path).read_text())
    result = {}
    for row in payload.get("samples", []):
        key = (
            str(row.get("symbol") or ""),
            str(row.get("timeframe") or ""),
            str(row.get("start") or ""),
            str(row.get("end") or ""),
        )
        result[key] = row
    return result


def load_baseline_exit_samples(path: str) -> dict[tuple[str, str], dict[str, Any]]:
    """加载历史管理链基线样本。"""
    if not path:
        return {}
    payload = json.loads(Path(path).read_text())
    result = {}
    for row in payload.get("samples", []):
        key = (
            str(row.get("start") or ""),
            str(row.get("end") or ""),
        )
        result[key] = row
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="精选样本管理链报告")
    parser.add_argument("--management-profile", default="brooks_pdf", help="回测管理模板")
    parser.add_argument("--cache-dir", default=str(ROOT / "data" / "history" / "hf_parquet"), help="历史数据目录")
    parser.add_argument("--output", required=True, help="输出 JSON 路径")
    parser.add_argument("--scenarios", default="", help="场景 JSON，留空则使用默认场景")
    parser.add_argument("--baseline-quality", default="/tmp/ab_strategy_quality_premise_probe_20260314.json", help="历史质量基线 JSON")
    parser.add_argument("--baseline-management", default="/tmp/ab_management_chain_premise_probe_20260314.json", help="历史管理链基线 JSON")
    args = parser.parse_args()

    scenarios = parse_scenarios(args.scenarios)
    strategy_buckets: dict[str, dict[str, Any]] = {}
    family_buckets: dict[str, dict[str, Any]] = {}
    by_exit_reason: dict[str, int] = defaultdict(int)
    management_components = {
        "partial_close_involved": new_component_bucket("partial_close_involved"),
        "trailing_stop_exit": new_component_bucket("trailing_stop_exit"),
        "protective_stop_exit": new_component_bucket("protective_stop_exit"),
        "runner_trailing_exit": new_component_bucket("runner_trailing_exit"),
        "breakeven_stop_exit": new_component_bucket("breakeven_stop_exit"),
        "take_profit_exit": new_component_bucket("take_profit_exit"),
        "tp_after_scaleout_exit": new_component_bucket("tp_after_scaleout_exit"),
        "premise_failure_exit": new_component_bucket("premise_failure_exit"),
        "plain_stop_loss_exit": new_component_bucket("plain_stop_loss_exit"),
        "protective_scalp_involved": new_component_bucket("protective_scalp_involved"),
        "protective_scalp_exit": new_component_bucket("protective_scalp_exit"),
        "reentry_trade": new_component_bucket("reentry_trade"),
        "scale_in_trade": new_component_bucket("scale_in_trade"),
    }
    scenario_rows: list[dict[str, Any]] = []
    total_trades = 0

    baseline_quality = load_baseline_samples(args.baseline_quality)
    baseline_management = load_baseline_exit_samples(args.baseline_management)
    baseline_compare_rows: list[dict[str, Any]] = []

    for index, scenario in enumerate(scenarios, start=1):
        print(
            f"[{index}/{len(scenarios)}] 运行 {scenario.label}: "
            f"{scenario.symbol} {scenario.timeframe} {scenario.start}~{scenario.end}"
        )
        cfg = BacktestConfig(
            symbols=[scenario.symbol],
            timeframes=[scenario.timeframe],
            start_date=scenario.start,
            end_date=scenario.end,
            days=1,
            threshold=0,
            cache_dir=args.cache_dir,
            management_profile=args.management_profile,
        )
        result = BacktestRunner(cfg).run()

        sample_bucket = new_quality_bucket(scenario.label)
        for trade in result.trades:
            total_trades += 1
            update_quality_bucket(sample_bucket, trade)
            strategy = str(trade.get("strategy") or "UNKNOWN")
            family = classify_strategy_family(strategy)
            strategy_bucket = strategy_buckets.setdefault(strategy, new_quality_bucket(strategy))
            family_bucket = family_buckets.setdefault(family, new_quality_bucket(family))
            update_quality_bucket(strategy_bucket, trade)
            update_quality_bucket(family_bucket, trade)

            exit_reason = str(trade.get("exit_reason") or "UNKNOWN")
            by_exit_reason[exit_reason] += 1
            if is_partial_close_involved(trade):
                update_component_bucket(management_components["partial_close_involved"], trade)
            if is_trailing_stop_exit(trade):
                update_component_bucket(management_components["trailing_stop_exit"], trade)
            if is_protective_stop_exit(trade):
                update_component_bucket(management_components["protective_stop_exit"], trade)
            if is_runner_trailing_exit(trade):
                update_component_bucket(management_components["runner_trailing_exit"], trade)
            if is_breakeven_stop_exit(trade):
                update_component_bucket(management_components["breakeven_stop_exit"], trade)
            if is_take_profit_exit(trade):
                update_component_bucket(management_components["take_profit_exit"], trade)
            if is_tp_after_scaleout_exit(trade):
                update_component_bucket(management_components["tp_after_scaleout_exit"], trade)
            if is_premise_failure_exit(trade):
                update_component_bucket(management_components["premise_failure_exit"], trade)
            if exit_reason == "SL" and not is_trailing_stop_exit(trade):
                update_component_bucket(management_components["plain_stop_loss_exit"], trade)
            if is_protective_scalp_involved(trade):
                update_component_bucket(management_components["protective_scalp_involved"], trade)
            if is_protective_scalp_exit(trade):
                update_component_bucket(management_components["protective_scalp_exit"], trade)
            if int(trade.get("reentry_attempt", 0) or 0) > 0:
                update_component_bucket(management_components["reentry_trade"], trade)
            if int(trade.get("scale_legs", 1) or 1) > 1:
                update_component_bucket(management_components["scale_in_trade"], trade)

        sample_row = finalize_quality_bucket(sample_bucket)
        sample_row.update(
            {
                "label": scenario.label,
                "symbol": scenario.symbol,
                "timeframe": scenario.timeframe,
                "start": scenario.start,
                "end": scenario.end,
                "signals_generated": result.signals_generated,
                "signals_passed": result.signals_passed,
                "signals_blocked_route": result.signals_blocked_route,
                "signals_blocked_management": result.signals_blocked_rr,
                "by_exit_reason": result.by_exit_reason,
            }
        )
        scenario_rows.append(sample_row)

        baseline_key = (scenario.symbol, scenario.timeframe, scenario.start, scenario.end)
        baseline_row = baseline_quality.get(baseline_key, {})
        baseline_mgmt_row = baseline_management.get((scenario.start, scenario.end), {})
        if baseline_row:
            baseline_compare_rows.append(
                {
                    "label": scenario.label,
                    "symbol": scenario.symbol,
                    "timeframe": scenario.timeframe,
                    "start": scenario.start,
                    "end": scenario.end,
                    "before_total_trades": baseline_row.get("total_trades", 0),
                    "after_total_trades": sample_row.get("trades", 0),
                    "before_win_rate": baseline_row.get("win_rate", 0.0),
                    "after_win_rate": sample_row.get("win_rate", 0.0),
                    "before_profit_factor": baseline_row.get("profit_factor", 0.0),
                    "after_profit_factor": sample_row.get("profit_factor", 0.0),
                    "before_exit_reason_snapshot": baseline_mgmt_row.get("by_exit_reason", {}),
                    "after_exit_reason_snapshot": result.by_exit_reason,
                }
            )

    strategy_rows = [finalize_quality_bucket(bucket) for bucket in strategy_buckets.values()]
    strategy_rows.sort(key=lambda item: (-int(item["trades"]), item["name"]))
    family_rows = [finalize_quality_bucket(bucket) for bucket in family_buckets.values()]
    family_rows.sort(key=lambda item: (-int(item["trades"]), item["name"]))

    payload = {
        "scenarios": [asdict(item) for item in scenarios],
        "scenario_results": scenario_rows,
        "baseline_compare": baseline_compare_rows,
        "overall_management": {
            key: finalize_component_bucket(bucket, total_trades)
            for key, bucket in management_components.items()
        },
        "by_exit_reason": dict(sorted(by_exit_reason.items(), key=lambda item: (-int(item[1]), item[0]))),
        "strategy_summary": strategy_rows,
        "family_summary": family_rows,
        "total_trades": total_trades,
    }

    output_path = Path(args.output)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(f"已写出: {output_path}")


if __name__ == "__main__":
    main()
