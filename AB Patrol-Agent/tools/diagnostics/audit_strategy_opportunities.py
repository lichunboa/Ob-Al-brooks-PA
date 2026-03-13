#!/usr/bin/env python3
"""
按策略审计机会生成、放行与成交情况。

用途：
1. 检查哪些策略没有生成机会；
2. 检查哪些策略生成了但没有通过；
3. 统计每个策略最主要的路由/入场阻挡原因。
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
from libs.backtest.strategy_filters import ALL_KNOWN_STRATEGIES  # noqa: E402


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
        # 只做格式校验
        datetime.fromisoformat(start.strip())
        datetime.fromisoformat(end.strip())
        windows.append(AuditWindow(label=f"W{index}", start=start.strip(), end=end.strip()))
    return windows


def merge_reason_map(target: dict[str, int], incoming: dict[str, Any]) -> None:
    """合并原因计数字典。"""
    for key, value in (incoming or {}).items():
        label = str(key or "UNKNOWN")
        target[label] = int(target.get(label, 0) or 0) + int(value or 0)


def main() -> None:
    parser = argparse.ArgumentParser(description="按策略审计机会生成、放行与成交情况")
    parser.add_argument("--symbols", default="BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT", help="币种，逗号分隔")
    parser.add_argument("--timeframes", default="5m,15m,1h", help="周期，逗号分隔")
    parser.add_argument(
        "--windows",
        required=True,
        help="窗口列表，格式 2022-01-01:2022-02-01,2023-01-01:2023-02-01",
    )
    parser.add_argument("--cache-dir", default=str(ROOT / "data" / "history" / "hf_parquet"), help="历史数据目录")
    parser.add_argument("--output", default="", help="输出 JSON 路径")
    args = parser.parse_args()

    symbols = parse_csv(args.symbols)
    timeframes = parse_csv(args.timeframes)
    windows = parse_windows(args.windows)

    rows: list[dict[str, Any]] = []
    aggregate: dict[tuple[str, str], dict[str, Any]] = {}

    for symbol in symbols:
        for timeframe in timeframes:
            for window in windows:
                cfg = BacktestConfig(
                    symbols=[symbol],
                    timeframes=[timeframe],
                    start_date=window.start,
                    end_date=window.end,
                    days=max(1, (datetime.fromisoformat(window.end) - datetime.fromisoformat(window.start)).days),
                    threshold=0,
                    cache_dir=args.cache_dir,
                )
                result = BacktestRunner(cfg).run()
                row = {
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "window": window.label,
                    "start": window.start,
                    "end": window.end,
                    "signals_generated_by_strategy": result.signals_generated_by_strategy,
                    "signals_passed_by_strategy": result.signals_passed_by_strategy,
                    "signals_blocked_strategy_by_strategy": result.signals_blocked_strategy_by_strategy,
                    "route_block_by_strategy": result.route_block_by_strategy,
                    "entry_block_by_strategy": result.entry_block_by_strategy,
                    "by_strategy": result.by_strategy,
                }
                rows.append(row)

                bucket = aggregate.setdefault(
                    (symbol, timeframe),
                    {
                        "symbol": symbol,
                        "timeframe": timeframe,
                        "generated": defaultdict(int),
                        "passed": defaultdict(int),
                        "filtered": defaultdict(int),
                        "trades": defaultdict(int),
                        "route_reasons": defaultdict(lambda: defaultdict(int)),
                        "entry_reasons": defaultdict(lambda: defaultdict(int)),
                    },
                )
                for strategy in ALL_KNOWN_STRATEGIES:
                    bucket["generated"][strategy] += int(result.signals_generated_by_strategy.get(strategy, 0) or 0)
                    bucket["passed"][strategy] += int(result.signals_passed_by_strategy.get(strategy, 0) or 0)
                    bucket["filtered"][strategy] += int(result.signals_blocked_strategy_by_strategy.get(strategy, 0) or 0)
                    bucket["trades"][strategy] += int((result.by_strategy.get(strategy) or {}).get("trades", 0) or 0)
                    merge_reason_map(
                        bucket["route_reasons"][strategy],
                        result.route_block_by_strategy.get(strategy, {}) if result.route_block_by_strategy else {},
                    )
                    merge_reason_map(
                        bucket["entry_reasons"][strategy],
                        result.entry_block_by_strategy.get(strategy, {}) if result.entry_block_by_strategy else {},
                    )

    summary: list[dict[str, Any]] = []
    for (_, _), bucket in sorted(aggregate.items(), key=lambda item: (item[0][0], item[0][1])):
        strategy_rows: list[dict[str, Any]] = []
        for strategy in sorted(ALL_KNOWN_STRATEGIES):
            route_reasons = dict(
                sorted(
                    (bucket["route_reasons"][strategy] or {}).items(),
                    key=lambda item: (-int(item[1]), item[0]),
                )[:5]
            )
            entry_reasons = dict(
                sorted(
                    (bucket["entry_reasons"][strategy] or {}).items(),
                    key=lambda item: (-int(item[1]), item[0]),
                )[:5]
            )
            strategy_rows.append(
                {
                    "strategy": strategy,
                    "generated": int(bucket["generated"][strategy]),
                    "passed": int(bucket["passed"][strategy]),
                    "filtered": int(bucket["filtered"][strategy]),
                    "trades": int(bucket["trades"][strategy]),
                    "top_route_reasons": route_reasons,
                    "top_entry_reasons": entry_reasons,
                }
            )
        summary.append(
            {
                "symbol": bucket["symbol"],
                "timeframe": bucket["timeframe"],
                "strategies": strategy_rows,
                "zero_generated": [row["strategy"] for row in strategy_rows if row["generated"] == 0],
                "zero_passed": [row["strategy"] for row in strategy_rows if row["passed"] == 0],
                "zero_trades": [row["strategy"] for row in strategy_rows if row["trades"] == 0],
            }
        )

    payload = {
        "windows": [asdict(window) for window in windows],
        "rows": rows,
        "summary": summary,
    }

    if args.output:
        output_path = Path(args.output)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        print(f"已写出: {output_path}")
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
