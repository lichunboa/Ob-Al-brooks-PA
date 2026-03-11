#!/usr/bin/env python3
"""
多品种多周期回测矩阵工具。

用途:
1. 为当前 PA 引擎建立可重复的多场景回测基线
2. 每次微调后快速比较不同品种 / 周期 / 分段行情表现
3. 统一输出目标达成情况（胜率 / 日均交易数 / 盈利因子）

推荐运行:
    uv run --with pandas --with pyarrow --with datasets python tools/backtest_matrix.py
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402

DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
DEFAULT_TIMEFRAMES = ["5m", "15m", "1h"]
DEFAULT_THRESHOLDS = [80]


@dataclass
class SegmentWindow:
    """单个回测时间窗口。"""

    label: str
    start: str
    end: str
    days: int


def parse_csv_list(raw: str) -> list[str]:
    """解析逗号分隔字符串。"""
    return [item.strip() for item in str(raw or "").split(",") if item.strip()]


def parse_int_list(raw: str) -> list[int]:
    """解析逗号分隔整数列表。"""
    values: list[int] = []
    for item in parse_csv_list(raw):
        values.append(int(item))
    return values


def parse_threshold_map(raw: str) -> dict[str, int]:
    """解析周期阈值覆盖，格式如 5m:80,15m:70。"""
    mapping: dict[str, int] = {}
    for item in parse_csv_list(raw):
        if ":" not in item:
            raise ValueError(f"无效 engine-thresholds 项: {item}")
        timeframe, threshold = item.split(":", 1)
        mapping[timeframe.strip()] = int(threshold.strip())
    return mapping


def build_segments(args: argparse.Namespace) -> list[SegmentWindow]:
    """构造多段行情窗口。"""
    if args.segments:
        segments: list[SegmentWindow] = []
        for index, raw in enumerate(parse_csv_list(args.segments), start=1):
            if ":" not in raw:
                raise ValueError(f"无效 segments 项: {raw}")
            start, end = raw.split(":", 1)
            start_dt = datetime.fromisoformat(start.strip())
            end_dt = datetime.fromisoformat(end.strip())
            days = max(1, (end_dt - start_dt).days)
            segments.append(
                SegmentWindow(
                    label=f"S{index}",
                    start=start_dt.strftime("%Y-%m-%d"),
                    end=end_dt.strftime("%Y-%m-%d"),
                    days=days,
                )
            )
        return segments

    anchor = datetime.fromisoformat(args.anchor_date) if args.anchor_date else datetime.now()
    segments = []
    segment_days = max(1, int(args.days))
    gap_days = max(1, int(args.segment_gap_days))
    for index in range(args.segment_count):
        end_dt = anchor - timedelta(days=index * gap_days)
        start_dt = end_dt - timedelta(days=segment_days)
        segments.append(
            SegmentWindow(
                label=f"S{index + 1}",
                start=start_dt.strftime("%Y-%m-%d"),
                end=end_dt.strftime("%Y-%m-%d"),
                days=segment_days,
            )
        )
    return segments


def build_timeframe_sets(mode: str, timeframes: list[str]) -> list[tuple[str, list[str]]]:
    """生成周期组合。"""
    cleaned = [item for item in timeframes if item]
    if mode == "combined":
        return [("+".join(cleaned), cleaned)]
    if mode == "both":
        combos = [(timeframe, [timeframe]) for timeframe in cleaned]
        if len(cleaned) > 1:
            combos.append(("+".join(cleaned), cleaned))
        return combos
    return [(timeframe, [timeframe]) for timeframe in cleaned]


def compute_goal_status(
    row: dict[str, Any],
    goal_win_rate: float,
    goal_trades_per_day: float,
    goal_pf: float,
) -> dict[str, Any]:
    """计算目标达成情况。"""
    return {
        "win_rate_ok": float(row["win_rate"] or 0) >= goal_win_rate,
        "trades_per_day_ok": float(row["trades_per_day"] or 0) >= goal_trades_per_day,
        "profit_factor_ok": float(row["profit_factor"] or 0) >= goal_pf,
    }


def merge_group_stats(target: dict[str, dict[str, float | int]], incoming: dict[str, Any]) -> None:
    """合并分组统计。"""
    for key, raw_bucket in (incoming or {}).items():
        bucket = target.setdefault(
            str(key),
            {
                "trades": 0,
                "wins": 0,
                "losses": 0,
                "scratches": 0,
                "pnl": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
            },
        )
        source = raw_bucket or {}
        bucket["trades"] += int(source.get("trades", 0) or 0)
        bucket["wins"] += int(source.get("wins", 0) or 0)
        bucket["losses"] += int(source.get("losses", 0) or 0)
        bucket["scratches"] += int(source.get("scratches", 0) or 0)
        bucket["pnl"] += float(source.get("pnl", 0.0) or 0.0)
        bucket["gross_profit"] += float(source.get("gross_profit", 0.0) or 0.0)
        bucket["gross_loss"] += float(source.get("gross_loss", 0.0) or 0.0)


def finalize_group_stats(grouped: dict[str, dict[str, float | int]], limit: int = 5) -> list[dict[str, Any]]:
    """把分组桶转换成排序后的列表。"""
    rows: list[dict[str, Any]] = []
    for label, bucket in grouped.items():
        trades_count = int(bucket["trades"])
        wins = int(bucket["wins"])
        gross_profit = float(bucket["gross_profit"])
        gross_loss = float(bucket["gross_loss"])
        rows.append(
            {
                "label": label,
                "trades": trades_count,
                "wins": wins,
                "losses": int(bucket["losses"]),
                "scratches": int(bucket["scratches"]),
                "pnl": float(bucket["pnl"]),
                "win_rate": wins / trades_count * 100 if trades_count else 0.0,
                "profit_factor": gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0),
            }
        )
    rows.sort(key=lambda item: (float(item["pnl"]), float(item["win_rate"]), int(item["trades"])), reverse=True)
    return rows[:limit]


def aggregate_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """按 symbol / timeframe / threshold 汇总结果。"""
    grouped: dict[tuple[str, str, int, str, str], dict[str, Any]] = {}
    for row in rows:
        if row.get("error"):
            continue
        key = (
            str(row["symbol"]),
            str(row["timeframe_set"]),
            int(row["threshold"]),
            str(row.get("filter_signature") or ""),
            str(row.get("management_profile") or "default"),
        )
        bucket = grouped.setdefault(
            key,
            {
                "symbol": row["symbol"],
                "timeframe_set": row["timeframe_set"],
                "threshold": row["threshold"],
                "strategy_profile": row.get("strategy_profile") or "",
                "management_profile": row.get("management_profile") or "default",
                "strategy_filter_description": row.get("strategy_filter_description") or "",
                "strategy_whitelist": list(row.get("strategy_whitelist") or []),
                "strategy_blacklist": list(row.get("strategy_blacklist") or []),
                "filter_signature": row.get("filter_signature") or "",
                "segments": 0,
                "days": 0,
                "total_trades": 0,
                "wins": 0,
                "losses": 0,
                "total_pnl": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
                "signals_generated": 0,
                "signals_passed": 0,
                "signals_blocked_strategy": 0,
                "signals_blocked_route": 0,
                "max_drawdown": 0.0,
                "account_max_drawdown": 0.0,
                "initial_capital": 0.0,
                "ending_equity": 0.0,
                "account_total_pnl_amount": 0.0,
                "account_return_pct_weighted": 0.0,
                "strategy_stats": {},
            },
        )
        bucket["segments"] += 1
        bucket["days"] += int(row["days"])
        bucket["total_trades"] += int(row["total_trades"])
        bucket["wins"] += int(row["wins"])
        bucket["losses"] += int(row["losses"])
        bucket["total_pnl"] += float(row["total_pnl"])
        bucket["signals_generated"] += int(row["signals_generated"])
        bucket["signals_passed"] += int(row["signals_passed"])
        bucket["signals_blocked_strategy"] += int(row.get("signals_blocked_strategy", 0) or 0)
        bucket["signals_blocked_route"] += int(row.get("signals_blocked_route", 0) or 0)
        bucket["max_drawdown"] = max(float(bucket["max_drawdown"]), float(row["max_drawdown"]))
        bucket["account_max_drawdown"] = max(
            float(bucket["account_max_drawdown"]),
            float(row.get("account_max_drawdown", 0.0) or 0.0),
        )
        bucket["gross_profit"] += max(0.0, float(row["avg_win"]) * int(row["wins"]))
        bucket["gross_loss"] += abs(min(0.0, float(row["avg_loss"]) * int(row["losses"])))
        bucket["initial_capital"] += float(row.get("initial_capital", 0.0) or 0.0)
        bucket["ending_equity"] += float(row.get("ending_equity", 0.0) or 0.0)
        bucket["account_total_pnl_amount"] += float(row.get("account_total_pnl_amount", 0.0) or 0.0)
        bucket["account_return_pct_weighted"] += float(row.get("account_return_pct", 0.0) or 0.0) * int(row["days"])
        merge_group_stats(bucket["strategy_stats"], row.get("by_strategy", {}))

    summary_rows: list[dict[str, Any]] = []
    for bucket in grouped.values():
        total_trades = int(bucket["total_trades"])
        wins = int(bucket["wins"])
        total_days = max(1, int(bucket["days"]))
        gross_profit = float(bucket["gross_profit"])
        gross_loss = float(bucket["gross_loss"])
        summary_rows.append(
            {
                **bucket,
                "win_rate": wins / total_trades * 100 if total_trades else 0.0,
                "trades_per_day": total_trades / total_days,
                "profit_factor": gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0),
                "initial_capital": float(bucket["initial_capital"]),
                "ending_equity": float(bucket["ending_equity"]),
                "account_total_pnl_amount": float(bucket["account_total_pnl_amount"]),
                "account_return_pct": float(bucket["account_return_pct_weighted"]) / total_days if total_days else 0.0,
                "account_max_drawdown": float(bucket["account_max_drawdown"]),
                "top_strategies": finalize_group_stats(bucket["strategy_stats"]),
            }
        )
    summary_rows.sort(
        key=lambda item: (
            float(item["profit_factor"]),
            float(item["win_rate"]),
            float(item["trades_per_day"]),
        ),
        reverse=True,
    )
    return summary_rows


def run_matrix(args: argparse.Namespace) -> dict[str, Any]:
    """执行回测矩阵。"""
    from libs.backtest.strategy_filters import (  # noqa: E402
        default_management_profile,
        describe_strategy_selection,
        resolve_strategy_selection,
    )

    symbols = [item.upper() for item in parse_csv_list(args.symbols)] or DEFAULT_SYMBOLS
    timeframes = parse_csv_list(args.timeframes) or DEFAULT_TIMEFRAMES
    thresholds = parse_int_list(args.thresholds) or DEFAULT_THRESHOLDS
    segments = build_segments(args)
    timeframe_sets = build_timeframe_sets(args.mode, timeframes)
    engine_threshold_overrides = parse_threshold_map(args.engine_thresholds)
    strategy_whitelist = parse_csv_list(args.strategy_whitelist)
    strategy_blacklist = parse_csv_list(args.strategy_blacklist)
    strategy_profile = str(args.strategy_profile or "").strip()
    strategy_selection = resolve_strategy_selection(strategy_whitelist, strategy_blacklist, strategy_profile)
    strategy_filter_description = describe_strategy_selection(strategy_selection)
    management_profile = (
        str(args.management_profile or "").strip()
        or default_management_profile(strategy_profile)
        or "default"
    )
    filter_signature = "|".join(
        [
            strategy_profile or "-",
            ",".join(sorted(strategy_selection.whitelist)) or "-",
            ",".join(sorted(strategy_selection.blacklist)) or "-",
            management_profile,
        ]
    )
    rows: list[dict[str, Any]] = []

    print("=" * 80)
    print("PA 回测矩阵")
    print("=" * 80)
    print(f"品种: {', '.join(symbols)}")
    print(f"周期: {', '.join(timeframes)} | 模式: {args.mode}")
    print(f"阈值: {', '.join(str(item) for item in thresholds)}")
    print(f"初始资金: ${args.initial_capital:,.2f}")
    if engine_threshold_overrides:
        print(
            "引擎阈值覆盖: "
            + ", ".join(
                f"{timeframe}:{threshold}"
                for timeframe, threshold in sorted(engine_threshold_overrides.items())
            )
        )
    if strategy_selection.is_active:
        print(f"策略过滤: {strategy_filter_description}")
        if strategy_selection.description:
            print(f"过滤依据: {strategy_selection.description}")
    print(f"管理模板: {management_profile}")
    print(f"分段: {', '.join(f'{seg.label}({seg.start}~{seg.end})' for seg in segments)}")
    print()

    for symbol in symbols:
        for timeframe_label, timeframe_set in timeframe_sets:
            for threshold in thresholds:
                for segment in segments:
                    print(
                        f"[运行] {symbol} | {timeframe_label} | 阈值 {threshold} | "
                        f"{segment.label} {segment.start}~{segment.end}"
                    )
                    row = {
                        "symbol": symbol,
                        "timeframe_set": timeframe_label,
                        "timeframes": timeframe_set,
                        "threshold": threshold,
                        "segment": segment.label,
                        "start": segment.start,
                        "end": segment.end,
                        "days": segment.days,
                        "strategy_profile": strategy_profile,
                        "management_profile": management_profile,
                        "strategy_filter_description": strategy_filter_description,
                        "strategy_whitelist": list(strategy_selection.whitelist),
                        "strategy_blacklist": list(strategy_selection.blacklist),
                        "filter_signature": filter_signature,
                    }
                    try:
                        config = BacktestConfig(
                            symbols=[symbol],
                            timeframes=timeframe_set,
                            days=segment.days,
                            start_date=segment.start,
                            end_date=segment.end,
                            threshold=threshold,
                            max_holding_bars=args.max_hold,
                            fee_rate=args.fee_rate,
                            cache_dir=args.cache_dir,
                            parquet_path=args.parquet,
                            verbose=args.verbose,
                            initial_capital=args.initial_capital,
                            engine_threshold_overrides=engine_threshold_overrides,
                            strategy_whitelist=strategy_whitelist,
                            strategy_blacklist=strategy_blacklist,
                            strategy_profile=strategy_profile,
                            management_profile=management_profile,
                        )
                        result = BacktestRunner(config).run()
                        row.update(
                            {
                                "total_trades": result.total_trades,
                                "wins": result.wins,
                                "losses": result.losses,
                                "scratches": result.scratches,
                                "win_rate": result.win_rate,
                                "trades_per_day": result.total_trades / max(1, segment.days),
                                "total_pnl": result.total_pnl,
                                "avg_win": result.avg_win,
                                "avg_loss": result.avg_loss,
                                "best_trade": result.best_trade,
                                "worst_trade": result.worst_trade,
                                "max_drawdown": result.max_drawdown,
                                "profit_factor": result.profit_factor,
                                "initial_capital": result.initial_capital,
                                "ending_equity": result.ending_equity,
                                "account_return_pct": result.account_return_pct,
                                "account_max_drawdown": result.account_max_drawdown,
                                "account_total_pnl_amount": result.account_total_pnl_amount,
                                "signals_generated": result.signals_generated,
                                "signals_passed": result.signals_passed,
                                "signals_blocked_bg": result.signals_blocked_bg,
                                "signals_blocked_score": result.signals_blocked_score,
                                "signals_blocked_rr": result.signals_blocked_rr,
                                "signals_blocked_strategy": result.signals_blocked_strategy,
                                "signals_blocked_route": result.signals_blocked_route,
                                "by_strategy": result.by_strategy,
                                "error": None,
                            }
                        )
                        row["goals"] = compute_goal_status(
                            row,
                            args.goal_win_rate,
                            args.goal_trades_per_day,
                            args.goal_profit_factor,
                        )
                    except Exception as exc:  # noqa: BLE001
                        row.update(
                            {
                                "error": str(exc),
                                "total_trades": 0,
                                "wins": 0,
                                "losses": 0,
                                "scratches": 0,
                                "win_rate": 0.0,
                                "trades_per_day": 0.0,
                                "total_pnl": 0.0,
                                "avg_win": 0.0,
                                "avg_loss": 0.0,
                                "best_trade": 0.0,
                                "worst_trade": 0.0,
                                "max_drawdown": 0.0,
                                "profit_factor": 0.0,
                                "initial_capital": args.initial_capital,
                                "ending_equity": args.initial_capital,
                                "account_return_pct": 0.0,
                                "account_max_drawdown": 0.0,
                                "account_total_pnl_amount": 0.0,
                                "signals_generated": 0,
                                "signals_passed": 0,
                                "signals_blocked_bg": 0,
                                "signals_blocked_score": 0,
                                "signals_blocked_rr": 0,
                                "signals_blocked_strategy": 0,
                                "signals_blocked_route": 0,
                                "by_strategy": {},
                                "goals": {
                                    "win_rate_ok": False,
                                    "trades_per_day_ok": False,
                                    "profit_factor_ok": False,
                                },
                            }
                        )
                        print(f"  失败: {exc}")
                    rows.append(row)

    summary_rows = aggregate_rows(rows)
    top_rows = summary_rows[: min(10, len(summary_rows))]
    return {
        "generated_at": datetime.now().isoformat(),
        "config": {
            "symbols": symbols,
            "timeframes": timeframes,
            "mode": args.mode,
            "thresholds": thresholds,
            "segments": [asdict(seg) for seg in segments],
            "max_hold": args.max_hold,
            "fee_rate": args.fee_rate,
            "initial_capital": args.initial_capital,
            "cache_dir": args.cache_dir,
            "parquet": args.parquet,
            "engine_threshold_overrides": engine_threshold_overrides,
            "strategy_profile": strategy_profile,
            "strategy_whitelist": list(strategy_selection.whitelist),
            "strategy_blacklist": list(strategy_selection.blacklist),
            "strategy_filter_description": strategy_filter_description,
            "management_profile": management_profile,
            "goals": {
                "win_rate": args.goal_win_rate,
                "trades_per_day": args.goal_trades_per_day,
                "profit_factor": args.goal_profit_factor,
            },
        },
        "runs": rows,
        "summary": summary_rows,
        "top": top_rows,
    }


def print_top_summary(report: dict[str, Any]) -> None:
    """打印汇总结果。"""
    print()
    print("=" * 80)
    print("回测矩阵汇总")
    print("=" * 80)
    top_rows = report.get("top") or []
    if not top_rows:
        print("没有成功完成的回测结果。")
        return

    for index, row in enumerate(top_rows, start=1):
        print(
            f"{index:>2}. {row['symbol']} | {row['timeframe_set']} | 阈值 {row['threshold']} | "
            f"段数 {row['segments']} | 交易 {row['total_trades']} | "
            f"胜率 {row['win_rate']:.1f}% | 日均 {row['trades_per_day']:.2f} | "
            f"PF {row['profit_factor']:.2f} | 价格回撤 {row['max_drawdown']:.2f}% | "
            f"账户收益 {row['account_return_pct']:+.2f}% | 账户回撤 {row['account_max_drawdown']:.2f}%"
        )
        if row.get("strategy_filter_description"):
            print(f"    过滤: {row['strategy_filter_description']}")
        top_strategy = (row.get("top_strategies") or [{}])[0]
        if top_strategy.get("label"):
            print(
                f"    主导策略: {top_strategy['label']} | "
                f"{top_strategy['trades']}笔 | 胜率 {top_strategy['win_rate']:.1f}% | "
                f"PF {top_strategy['profit_factor']:.2f}"
            )


def save_report(report: dict[str, Any], output_path: str | None) -> Path:
    """保存 JSON 报告。"""
    if output_path:
        path = Path(output_path)
    else:
        reports_dir = ROOT / "reports" / "backtest"
        reports_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        path = reports_dir / f"matrix_{timestamp}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n结果已保存: {path}")
    return path


def build_parser() -> argparse.ArgumentParser:
    """构造命令行参数。"""
    parser = argparse.ArgumentParser(description="多品种多周期回测矩阵工具")
    parser.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS), help="回测品种，逗号分隔")
    parser.add_argument("--timeframes", default=",".join(DEFAULT_TIMEFRAMES), help="周期列表，逗号分隔")
    parser.add_argument(
        "--mode",
        choices=["split", "combined", "both"],
        default="both",
        help="周期运行方式: 单周期 / 合并周期 / 两者都跑",
    )
    parser.add_argument("--thresholds", default=",".join(str(item) for item in DEFAULT_THRESHOLDS), help="评分阈值列表")
    parser.add_argument("--days", type=int, default=30, help="单段回测天数")
    parser.add_argument("--segment-count", type=int, default=3, help="自动生成的行情段数")
    parser.add_argument("--segment-gap-days", type=int, default=45, help="相邻分段向前偏移天数")
    parser.add_argument("--segments", default="", help="手动指定分段: 2025-01-01:2025-02-01,2025-03-01:2025-04-01")
    parser.add_argument("--anchor-date", default="", help="自动分段锚点日期，默认今天")
    parser.add_argument("--max-hold", type=int, default=48, help="最大持仓 K 线数")
    parser.add_argument("--fee-rate", type=float, default=0.0004, help="手续费率")
    parser.add_argument("--initial-capital", type=float, default=10000.0, help="初始资金")
    parser.add_argument("--cache-dir", default=str(ROOT / "data" / "backtest_cache"), help="数据缓存目录")
    parser.add_argument("--parquet", default="", help="直接使用指定 Parquet 文件")
    parser.add_argument("--output", default="", help="JSON 输出路径")
    parser.add_argument("--engine-thresholds", default="", help="覆盖 PA 引擎周期阈值，例如 5m:80,15m:70")
    parser.add_argument("--strategy-profile", default="", help="策略配置档，例如 brooks_pullback_core")
    parser.add_argument("--strategy-whitelist", default="", help="策略白名单，支持族别名，如 头肩MTR,双重顶底")
    parser.add_argument("--strategy-blacklist", default="", help="策略黑名单，支持族别名，如 均线缺口,收线追进")
    parser.add_argument("--management-profile", default="", help="回测管理模板，例如 brooks_pdf")
    parser.add_argument("--goal-win-rate", type=float, default=85.0, help="目标胜率")
    parser.add_argument("--goal-trades-per-day", type=float, default=50.0, help="目标日均交易数")
    parser.add_argument("--goal-profit-factor", type=float, default=1.5, help="目标盈利因子")
    parser.add_argument("--verbose", action="store_true", help="打印详细交易过程")
    return parser


def main() -> int:
    """程序入口。"""
    parser = build_parser()
    args = parser.parse_args()
    report = run_matrix(args)
    print_top_summary(report)
    save_report(report, args.output or None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
