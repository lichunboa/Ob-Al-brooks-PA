#!/usr/bin/env python3
"""
均线缺口族验证脚本。

用途：
1. 只回测 `20均线缺口 / MAG 20/20 Setup / 第一均线缺口`
2. 复用 fixed / random / stress5m 场景
3. 验证 gap 族模板扩展后是否稳定
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402


@dataclass(frozen=True)
class Scenario:
    """单个 gap 验证场景。"""

    label: str
    symbol: str
    timeframe: str
    start: str
    end: str


FIXED_SCENARIOS = [
    Scenario("F1_BTC_15m_2022", "BTCUSDT", "15m", "2022-01-24", "2022-02-23"),
    Scenario("F2_BTC_5m_2024Q3", "BTCUSDT", "5m", "2024-08-10", "2024-09-09"),
    Scenario("F3_ETH_15m_2024Q2", "ETHUSDT", "15m", "2024-05-15", "2024-06-14"),
]

RANDOM_SCENARIOS = [
    Scenario("R1_BTC_5m_2024Q3", "BTCUSDT", "5m", "2024-08-10", "2024-09-09"),
    Scenario("R2_ETH_15m_2024Q2", "ETHUSDT", "15m", "2024-05-15", "2024-06-14"),
    Scenario("R3_BNB_15m_2023Q4", "BNBUSDT", "15m", "2023-10-01", "2023-10-31"),
    Scenario("R4_SOL_15m_2025Q3", "SOLUSDT", "15m", "2025-08-01", "2025-08-31"),
]

STRESS_5M_SCENARIOS = [
    Scenario("P1_BTC_5m_2022Q1", "BTCUSDT", "5m", "2022-01-24", "2022-02-23"),
    Scenario("P2_BTC_5m_2024Q1", "BTCUSDT", "5m", "2024-02-01", "2024-03-02"),
    Scenario("P3_BTC_5m_2024Q3", "BTCUSDT", "5m", "2024-08-10", "2024-09-09"),
    Scenario("P4_ETH_5m_2022Q1", "ETHUSDT", "5m", "2022-01-24", "2022-02-23"),
    Scenario("P5_ETH_5m_2024Q3", "ETHUSDT", "5m", "2024-08-10", "2024-09-09"),
    Scenario("P6_BNB_5m_2024Q3", "BNBUSDT", "5m", "2024-08-10", "2024-09-09"),
    Scenario("P7_SOL_5m_2025Q3", "SOLUSDT", "5m", "2025-08-01", "2025-08-31"),
]

STRATEGIES = ["20均线缺口", "MAG 20/20 Setup", "第一均线缺口"]

GROUP_SCENARIOS = {
    "fixed": FIXED_SCENARIOS,
    "random": RANDOM_SCENARIOS,
    "stress5m": STRESS_5M_SCENARIOS,
}


def _days(start: str, end: str) -> int:
    """计算场景跨度天数。"""
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    return max(1, (end_dt - start_dt).days + 1)


def _write_checkpoint(output: Path, payload: dict[str, Any]) -> None:
    """每完成一个场景就落盘。"""
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _resolve_scenarios(group: str, label: str) -> list[Scenario]:
    """按 group 或单场景标签解析场景列表。"""
    scenarios = list(GROUP_SCENARIOS[group])
    if not label:
        return scenarios
    filtered = [item for item in scenarios if item.label == label]
    if not filtered:
        raise ValueError(f"场景标签不存在: {label}")
    return filtered


def _build_payload(
    scenarios: list[Scenario],
    rows: list[dict[str, Any]],
    total_trades: int,
    total_wins: int,
    pf_sum: float,
    completed_labels: list[str],
) -> dict[str, Any]:
    """构建统一输出结构。"""
    return {
        "strategies": STRATEGIES,
        "scenarios": [asdict(item) for item in scenarios],
        "completed_labels": completed_labels,
        "scenario_results": rows,
        "summary": {
            "total_trades": total_trades,
            "weighted_win_rate": (total_wins / total_trades * 100.0) if total_trades else 0.0,
            "average_profit_factor": pf_sum / len(completed_labels) if completed_labels else 0.0,
            "average_daily_trades": (
                sum(float(item["avg_trades_per_day"]) for item in rows) / len(rows) if rows else 0.0
            ),
        },
    }


def _summarize_group(
    scenarios: list[Scenario],
    cache_dir: str,
    fee_rate: float,
    output: Path,
    resume: bool = False,
    loose_gap_preroute: bool = False,
) -> dict[str, Any]:
    """按场景运行 gap 族。"""
    rows: list[dict[str, Any]] = []
    total_trades = 0
    total_wins = 0
    pf_sum = 0.0
    completed_labels: list[str] = []

    if resume and output.exists():
        try:
            prior = json.loads(output.read_text(encoding="utf-8"))
            completed_labels = [str(item) for item in prior.get("completed_labels", [])]
            rows = list(prior.get("scenario_results", []))
            total_trades = int(prior.get("summary", {}).get("total_trades", 0) or 0)
            total_wins = int(
                round(total_trades * float(prior.get("summary", {}).get("weighted_win_rate", 0.0) or 0.0) / 100.0)
            )
            pf_sum = float(prior.get("summary", {}).get("average_profit_factor", 0.0) or 0.0) * len(completed_labels)
        except Exception:
            rows = []
            total_trades = 0
            total_wins = 0
            pf_sum = 0.0
            completed_labels = []

    for index, scenario in enumerate(scenarios, start=1):
        if scenario.label in completed_labels:
            print(f"[{index}/{len(scenarios)}] 跳过已完成 {scenario.label}", flush=True)
            continue
        print(
            f"[{index}/{len(scenarios)}] 运行 {scenario.label}: "
            f"{scenario.symbol} {scenario.timeframe} {scenario.start}~{scenario.end}",
            flush=True,
        )
        config = BacktestConfig(
            symbols=[scenario.symbol],
            timeframes=[scenario.timeframe],
            start_date=scenario.start,
            end_date=scenario.end,
            days=1,
            threshold=0,
            cache_dir=cache_dir,
            fee_rate=fee_rate,
            management_profile="brooks_pdf",
            strategy_whitelist=STRATEGIES,
        )
        if loose_gap_preroute:
            original_prepare = BacktestRunner._prepare_ema_gap_pre_route_disposition

            def _allow_all_gap_preroute(self, event, candles_q, replay, market_state, higher_market_state, *, management_profile):
                """宽松探针：只看 detector/执行频率，不让 gap preroute 把信号拦掉。"""
                extra = dict(getattr(event, "extra", {}) or {})
                extra.setdefault("ema_gap_context_tier", "")
                extra.setdefault("ema_gap_expectation", "")
                extra.setdefault("ema_gap_expectation_reason", "probe_loose_gap_preroute")
                extra.setdefault("setup_disposition", "")
                extra.setdefault("setup_disposition_reason", "")
                event.extra = extra
                return True, False

            BacktestRunner._prepare_ema_gap_pre_route_disposition = _allow_all_gap_preroute
            try:
                result = BacktestRunner(config).run()
            finally:
                BacktestRunner._prepare_ema_gap_pre_route_disposition = original_prepare
        else:
            result = BacktestRunner(config).run()

        wins = sum(1 for trade in result.trades if str(trade.get("result") or "") == "WIN")
        days = _days(scenario.start, scenario.end)

        row = {
            **asdict(scenario),
            "trades": len(result.trades),
            "win_rate": float(result.win_rate),
            "profit_factor": float(result.profit_factor),
            "avg_trades_per_day": len(result.trades) / days if days else 0.0,
            "signals_generated": int(result.signals_generated),
            "signals_passed": int(result.signals_passed),
            "signals_blocked_route": int(result.signals_blocked_route),
            "signals_blocked_management": int(result.signals_blocked_rr),
            "signals_generated_by_strategy": dict(result.signals_generated_by_strategy),
            "signals_passed_by_strategy": dict(result.signals_passed_by_strategy),
            "signals_blocked_strategy_by_strategy": dict(result.signals_blocked_strategy_by_strategy),
            "route_block_by_strategy": dict(result.route_block_by_strategy),
            "entry_block_by_strategy": dict(result.entry_block_by_strategy),
            "by_exit_reason": dict(result.by_exit_reason),
            "by_strategy": dict(result.by_strategy),
        }
        rows.append(row)

        total_trades += len(result.trades)
        total_wins += wins
        pf_sum += float(result.profit_factor)
        completed_labels.append(scenario.label)

        _write_checkpoint(
            output,
            _build_payload(
                scenarios=scenarios,
                rows=rows,
                total_trades=total_trades,
                total_wins=total_wins,
                pf_sum=pf_sum,
                completed_labels=completed_labels,
            ),
        )

    return _build_payload(
        scenarios=scenarios,
        rows=rows,
        total_trades=total_trades,
        total_wins=total_wins,
        pf_sum=pf_sum,
        completed_labels=completed_labels,
    )


def main() -> None:
    """脚本入口。"""
    parser = argparse.ArgumentParser(description="均线缺口族验证脚本")
    parser.add_argument("--group", choices=["fixed", "random", "stress5m"], required=True)
    parser.add_argument("--label", default="", help="只运行单个场景标签，如 F2_BTC_5m_2024Q3")
    parser.add_argument("--cache-dir", default=str(ROOT / "data" / "history" / "hf_parquet"))
    parser.add_argument("--fee-rate", type=float, default=0.0004)
    parser.add_argument("--output", required=True)
    parser.add_argument("--resume", action="store_true", help="从已落盘 checkpoint 继续")
    parser.add_argument("--loose-gap-preroute", action="store_true", help="宽松探针：跳过 gap preroute 处置层")
    args = parser.parse_args()
    scenarios = _resolve_scenarios(args.group, args.label)

    payload = _summarize_group(
        scenarios=scenarios,
        cache_dir=args.cache_dir,
        fee_rate=args.fee_rate,
        output=Path(args.output),
        resume=args.resume,
        loose_gap_preroute=args.loose_gap_preroute,
    )
    Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
