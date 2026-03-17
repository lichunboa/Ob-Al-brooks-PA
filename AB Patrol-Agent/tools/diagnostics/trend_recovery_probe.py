#!/usr/bin/env python3
"""
趋势恢复族 H2/L2 / 突破回调验证脚本。

用途：
1. 只回测 `高2 / 低2 / 突破回调`；
2. 复用 fixed / random / stress5m 场景；
3. 验证共用模块扩展后是否稳定。
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
    """单个趋势恢复验证场景。"""

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

STRATEGIES = ["高2", "低2", "突破回调"]


def _days(start: str, end: str) -> int:
    """计算场景跨度天数。"""
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    return max(1, (end_dt - start_dt).days + 1)


def _write_checkpoint(output: Path, payload: dict[str, Any]) -> None:
    """每完成一个场景就落盘。"""
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


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
) -> dict[str, Any]:
    """按场景运行 H2/L2 与突破回调。"""
    rows: list[dict[str, Any]] = []
    total_trades = 0
    total_wins = 0
    pf_sum = 0.0
    completed_labels: list[str] = []

    for index, scenario in enumerate(scenarios, start=1):
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
    parser = argparse.ArgumentParser(description="趋势恢复族 H2/L2 / 突破回调验证脚本")
    parser.add_argument(
        "--group",
        choices=["fixed", "random", "stress5m"],
        required=True,
        help="验证场景组",
    )
    parser.add_argument("--cache-dir", default=str(ROOT / "data" / "history" / "hf_parquet"))
    parser.add_argument("--fee-rate", type=float, default=0.0004)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    if args.group == "fixed":
        scenarios = FIXED_SCENARIOS
    elif args.group == "random":
        scenarios = RANDOM_SCENARIOS
    else:
        scenarios = STRESS_5M_SCENARIOS

    payload = _summarize_group(
        scenarios=scenarios,
        cache_dir=args.cache_dir,
        fee_rate=args.fee_rate,
        output=Path(args.output),
    )
    Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload["summary"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
