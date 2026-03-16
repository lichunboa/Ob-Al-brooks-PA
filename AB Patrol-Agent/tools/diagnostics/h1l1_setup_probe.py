#!/usr/bin/env python3
"""
H1/L1 单策略 fixed/random 验证脚本。

用途：
1. 只回测 `高1/低1`，避免被其他策略噪音稀释；
2. 固定输出 fixed / random 场景结果，方便和基线做同口径对照；
3. 作为 H1/L1 模板化重构的专用验证入口。
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
    """单个 H1/L1 验证场景。"""

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


def _days(start: str, end: str) -> int:
    """计算场景跨度天数。"""
    start_dt = datetime.strptime(start, "%Y-%m-%d")
    end_dt = datetime.strptime(end, "%Y-%m-%d")
    return max(1, (end_dt - start_dt).days + 1)


def _write_checkpoint(output: Path, payload: dict[str, Any]) -> None:
    """每完成一个场景就落盘，避免长回测期间完全没有结果。"""
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _build_payload(
    scenarios: list[Scenario],
    rows: list[dict[str, Any]],
    total_trades: int,
    total_wins: int,
    pf_sum: float,
    h1_total: int,
    l1_total: int,
    completed_labels: list[str],
) -> dict[str, Any]:
    """构建统一输出结构。"""
    return {
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
            "h1_total_trades": h1_total,
            "l1_total_trades": l1_total,
        },
    }


def _summarize_group(
    scenarios: list[Scenario],
    cache_dir: str,
    fee_rate: float,
    output: Path,
) -> dict[str, Any]:
    """按场景运行 H1/L1，并返回聚合结果。"""
    rows: list[dict[str, Any]] = []
    total_trades = 0
    total_wins = 0
    pf_sum = 0.0
    h1_total = 0
    l1_total = 0
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
            strategy_whitelist=["高1", "低1"],
        )
        result = BacktestRunner(config).run()

        wins = sum(1 for trade in result.trades if str(trade.get("result") or "") == "WIN")
        h1_trades = sum(1 for trade in result.trades if str(trade.get("strategy") or "") == "高1")
        l1_trades = sum(1 for trade in result.trades if str(trade.get("strategy") or "") == "低1")
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
            "h1_trades": h1_trades,
            "l1_trades": l1_trades,
            "by_exit_reason": dict(result.by_exit_reason),
        }
        rows.append(row)

        total_trades += len(result.trades)
        total_wins += wins
        pf_sum += float(result.profit_factor)
        h1_total += h1_trades
        l1_total += l1_trades
        completed_labels.append(scenario.label)

        print(
            json.dumps(
                {
                    "label": scenario.label,
                    "trades": row["trades"],
                    "win_rate": row["win_rate"],
                    "profit_factor": row["profit_factor"],
                    "h1_trades": row["h1_trades"],
                    "l1_trades": row["l1_trades"],
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        _write_checkpoint(
            output,
            _build_payload(
                scenarios=scenarios,
                rows=rows,
                total_trades=total_trades,
                total_wins=total_wins,
                pf_sum=pf_sum,
                h1_total=h1_total,
                l1_total=l1_total,
                completed_labels=completed_labels,
            ),
        )

    return _build_payload(
        scenarios=scenarios,
        rows=rows,
        total_trades=total_trades,
        total_wins=total_wins,
        pf_sum=pf_sum,
        h1_total=h1_total,
        l1_total=l1_total,
        completed_labels=completed_labels,
    )


def main() -> None:
    """脚本入口。"""
    parser = argparse.ArgumentParser(description="H1/L1 单策略验证脚本")
    parser.add_argument("--group", choices=["fixed", "random"], required=True, help="验证场景组")
    parser.add_argument("--labels", default="", help="只跑指定标签，逗号分隔")
    parser.add_argument(
        "--cache-dir",
        default=str(ROOT / "data" / "history" / "hf_parquet"),
        help="历史数据目录",
    )
    parser.add_argument("--fee-rate", type=float, default=0.0004, help="单边手续费率")
    parser.add_argument("--output", required=True, help="输出 JSON 路径")
    args = parser.parse_args()

    scenarios = FIXED_SCENARIOS if args.group == "fixed" else RANDOM_SCENARIOS
    labels = {item.strip() for item in str(args.labels or "").split(",") if item.strip()}
    if labels:
        scenarios = [item for item in scenarios if item.label in labels]
    output = Path(args.output)
    payload = _summarize_group(scenarios, str(args.cache_dir), float(args.fee_rate), output)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已写出: {output}", flush=True)


if __name__ == "__main__":
    main()
