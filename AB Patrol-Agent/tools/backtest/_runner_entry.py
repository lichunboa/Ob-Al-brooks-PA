#!/usr/bin/env python3
"""
BacktestRunner 共享入口工具。

统一 `tools/backtest/` 下各个脚本的参数风格与执行链，避免再各自维护
一套轻量回测逻辑。
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

from libs.backtest.runner import BacktestConfig, BacktestRunner  # noqa: E402
from runtime.path_layout import backtest_reports_dir  # noqa: E402

DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
DEFAULT_TIMEFRAMES = ["5m"]


@dataclass(frozen=True)
class ScenarioSpec:
    """历史回放场景定义。"""

    name: str
    desc: str
    symbols: tuple[str, ...]
    start: str
    end: str
    threshold: int = 0
    timeframes: tuple[str, ...] = ("5m",)


SCENARIOS: dict[str, ScenarioSpec] = {
    "trend_bull": ScenarioSpec(
        name="强势多头趋势（5品种）",
        desc="2020 年下半年牛市冲刺，适合验证顺势追随与回调恢复。",
        symbols=("BTCUSDT", "ETHUSDT", "BNBUSDT", "ADAUSDT", "DOGEUSDT"),
        start="2020-07-20",
        end="2021-01-10",
    ),
    "trend_bear": ScenarioSpec(
        name="强势空头趋势",
        desc="BTC 2021 年 5 月崩盘，适合验证空头趋势恢复与突破追随。",
        symbols=("BTCUSDT",),
        start="2021-05-10",
        end="2021-05-25",
    ),
    "tr_choppy": ScenarioSpec(
        name="横盘震荡",
        desc="BTC 2021 年 6-7 月区间，适合验证 TR fade 与边缘反做。",
        symbols=("BTCUSDT",),
        start="2021-06-20",
        end="2021-07-05",
    ),
    "reversal": ScenarioSpec(
        name="趋势反转",
        desc="BTC 2021 年 4 月高潮后反转，适合验证 MTR / climax reversal。",
        symbols=("BTCUSDT",),
        start="2021-04-10",
        end="2021-04-25",
    ),
    "bad_market": ScenarioSpec(
        name="假突破洗盘",
        desc="ETH 2021 年夏季反复假突破，适合验证失败突破与过滤链。",
        symbols=("ETHUSDT",),
        start="2021-07-15",
        end="2021-07-30",
    ),
}


def parse_csv_list(raw: str) -> list[str]:
    """解析逗号分隔列表。"""
    return [item.strip() for item in str(raw or "").split(",") if item.strip()]


def parse_threshold_map(raw: str) -> dict[str, int]:
    """解析周期阈值覆盖，格式如 `5m:80,15m:72`。"""
    mapping: dict[str, int] = {}
    for item in parse_csv_list(raw):
        if ":" not in item:
            raise ValueError(f"无效 engine-thresholds 项: {item}")
        timeframe, threshold = item.split(":", 1)
        mapping[timeframe.strip()] = int(threshold.strip())
    return mapping


def fee_percent_to_rate(fee_percent: float) -> float:
    """把百分比手续费转成小数费率。"""
    return max(0.0, float(fee_percent or 0.0) / 100.0)


def build_output_path(raw_output: str) -> Path:
    """解析输出路径，并在需要时创建默认报告目录。"""
    output = Path(raw_output)
    if not output.is_absolute():
        output = ROOT / output
    output.parent.mkdir(parents=True, exist_ok=True)
    return output


def default_report_path(stem: str) -> Path:
    """生成默认回测报告路径。"""
    reports_dir = backtest_reports_dir(ROOT)
    reports_dir.mkdir(parents=True, exist_ok=True)
    return reports_dir / f"{stem}.json"


def maybe_warn_legacy_risk(raw_risk: float | None) -> None:
    """提示旧轻量回测参数已退出权威链。"""
    if raw_risk is None:
        return
    print("提示: 当前权威回测链不再读取旧 `--risk` 参数。")
    print("提示: 实际仓位风险由真实信号、结构止损与 SimExchange 统一决定。")


def make_config(
    *,
    symbols: list[str],
    timeframes: list[str],
    days: int,
    start_date: str | None,
    end_date: str | None,
    threshold: int,
    balance: float,
    fee_percent: float,
    max_hold: int,
    parquet: str | None,
    cache_dir: str | None,
    verbose: bool,
    engine_thresholds: str,
    strategy_profile: str,
    strategy_whitelist: str,
    strategy_blacklist: str,
    management_profile: str,
) -> BacktestConfig:
    """把 CLI 参数收敛成统一 BacktestConfig。"""
    return BacktestConfig(
        symbols=[item.upper() for item in symbols],
        timeframes=timeframes,
        days=max(0, int(days or 0)),
        start_date=start_date,
        end_date=end_date,
        threshold=int(threshold),
        max_holding_bars=int(max_hold),
        fee_rate=fee_percent_to_rate(fee_percent),
        cache_dir=cache_dir or None,
        parquet_path=parquet or None,
        verbose=bool(verbose),
        initial_capital=float(balance),
        engine_threshold_overrides=parse_threshold_map(engine_thresholds) if engine_thresholds else {},
        strategy_profile=str(strategy_profile or "").strip(),
        strategy_whitelist=parse_csv_list(strategy_whitelist),
        strategy_blacklist=parse_csv_list(strategy_blacklist),
        management_profile=str(management_profile or "").strip() or "default",
    )


def result_payload(result) -> dict[str, Any]:
    """把 BacktestResult 转成字典。"""
    return json.loads(result.to_json())


def save_payload(payload: dict[str, Any], output: Path) -> None:
    """把聚合结果写入 JSON 文件。"""
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"结果已保存到: {output}")


def add_common_arguments(parser: argparse.ArgumentParser, *, multi: bool = False) -> None:
    """给脚本补齐统一的 runner 参数。"""
    if multi:
        parser.add_argument("--symbols", default=",".join(DEFAULT_SYMBOLS), help="逗号分隔交易品种")
        parser.add_argument("--timeframes", default=",".join(DEFAULT_TIMEFRAMES), help="逗号分隔周期")
    else:
        parser.add_argument("--symbol", default="BTCUSDT", help="交易品种")
        parser.add_argument("--timeframe", default="5m", help="回测周期")

    parser.add_argument("--days", type=int, default=30, help="回测最近 N 天")
    parser.add_argument("--start", default=None, help="开始日期 YYYY-MM-DD")
    parser.add_argument("--end", default=None, help="结束日期 YYYY-MM-DD")
    parser.add_argument("--balance", type=float, default=10000.0, help="初始资金")
    parser.add_argument("--threshold", type=int, default=0, help="兼容旧参数，当前已忽略")
    parser.add_argument("--max-hold", type=int, default=48, help="最大持仓 K 线数")
    parser.add_argument("--fee", type=float, default=0.08, help="往返手续费百分比")
    parser.add_argument(
        "--risk",
        type=float,
        default=None,
        help="旧轻量回测参数，保留兼容；当前 runner 不再直接读取。",
    )
    parser.add_argument("--strategy-profile", default="", help="策略配置档")
    parser.add_argument("--strategy-whitelist", default="", help="策略白名单，逗号分隔")
    parser.add_argument("--strategy-blacklist", default="", help="策略黑名单，逗号分隔")
    parser.add_argument("--management-profile", default="brooks_pdf", help="管理模板")
    parser.add_argument("--engine-thresholds", default="", help="兼容旧参数，当前已忽略")
    parser.add_argument("--parquet", default=None, help="本地 Parquet 文件路径")
    parser.add_argument("--cache-dir", default=None, help="数据缓存目录")
    parser.add_argument("--output", default="", help="输出 JSON 报告路径")
    parser.add_argument("--verbose", action="store_true", help="详细输出")


def run_single_main() -> None:
    """单品种 runner 入口。"""
    parser = argparse.ArgumentParser(description="运行权威 BacktestRunner 单品种回测")
    add_common_arguments(parser, multi=False)
    args = parser.parse_args()

    maybe_warn_legacy_risk(args.risk)

    config = make_config(
        symbols=[args.symbol],
        timeframes=[args.timeframe],
        days=args.days,
        start_date=args.start,
        end_date=args.end,
        threshold=args.threshold,
        balance=args.balance,
        fee_percent=args.fee,
        max_hold=args.max_hold,
        parquet=args.parquet,
        cache_dir=args.cache_dir,
        verbose=args.verbose,
        engine_thresholds=args.engine_thresholds,
        strategy_profile=args.strategy_profile,
        strategy_whitelist=args.strategy_whitelist,
        strategy_blacklist=args.strategy_blacklist,
        management_profile=args.management_profile,
    )

    print("=" * 70)
    print("权威回测入口")
    print("=" * 70)
    print(f"品种: {config.symbols[0]}")
    print(f"周期: {', '.join(config.timeframes)}")
    print(f"日期: {config.start_date or '-'} ~ {config.end_date or f'最近 {config.days} 天'}")
    print(f"初始资金: ${config.initial_capital:,.2f}")
    print()

    result = BacktestRunner(config).run()
    result.print_report()

    if args.output:
        result.to_json(str(build_output_path(args.output)))


def run_multi_main() -> None:
    """多品种 runner 入口。"""
    parser = argparse.ArgumentParser(description="运行权威 BacktestRunner 多品种回测")
    add_common_arguments(parser, multi=True)
    args = parser.parse_args()

    maybe_warn_legacy_risk(args.risk)

    symbols = [item.upper() for item in parse_csv_list(args.symbols)] or DEFAULT_SYMBOLS
    timeframes = parse_csv_list(args.timeframes) or DEFAULT_TIMEFRAMES
    run_count = max(1, len(symbols) * len(timeframes))
    per_run_balance = float(args.balance) / run_count

    print("=" * 70)
    print("多品种权威回测入口")
    print("=" * 70)
    print(f"品种: {', '.join(symbols)}")
    print(f"周期: {', '.join(timeframes)}")
    print(f"总资金: ${float(args.balance):,.2f}")
    print(f"每个组合分配资金: ${per_run_balance:,.2f}")
    print()

    runs: list[dict[str, Any]] = []
    total_trades = 0
    total_wins = 0
    total_losses = 0
    total_signal_generated = 0
    total_signal_passed = 0
    total_pnl_amount = 0.0
    worst_account_drawdown = 0.0

    for symbol in symbols:
        for timeframe in timeframes:
            print(f"[运行] {symbol} | {timeframe}")
            config = make_config(
                symbols=[symbol],
                timeframes=[timeframe],
                days=args.days,
                start_date=args.start,
                end_date=args.end,
                threshold=args.threshold,
                balance=per_run_balance,
                fee_percent=args.fee,
                max_hold=args.max_hold,
                parquet=args.parquet,
                cache_dir=args.cache_dir,
                verbose=args.verbose,
                engine_thresholds=args.engine_thresholds,
                strategy_profile=args.strategy_profile,
                strategy_whitelist=args.strategy_whitelist,
                strategy_blacklist=args.strategy_blacklist,
                management_profile=args.management_profile,
            )
            result = BacktestRunner(config).run()
            payload = result_payload(result)
            payload["symbol"] = symbol
            payload["timeframe"] = timeframe
            runs.append(payload)

            summary = payload.get("summary", {})
            total_trades += int(summary.get("total_trades", 0) or 0)
            total_wins += int(summary.get("wins", 0) or 0)
            total_losses += int(summary.get("losses", 0) or 0)
            total_signal_generated += int(payload.get("signals", {}).get("generated", 0) or 0)
            total_signal_passed += int(payload.get("signals", {}).get("passed", 0) or 0)
            total_pnl_amount += float(summary.get("account_total_pnl_amount", 0.0) or 0.0)
            worst_account_drawdown = max(
                worst_account_drawdown,
                float(summary.get("account_max_drawdown", 0.0) or 0.0),
            )

            print(
                f"  交易 {int(summary.get('total_trades', 0) or 0)} 笔 | "
                f"胜率 {float(summary.get('win_rate', 0.0) or 0.0):.1f}% | "
                f"账户收益 {float(summary.get('account_return_pct', 0.0) or 0.0):+.2f}%"
            )

    print()
    print("=" * 70)
    print("多品种汇总")
    print("=" * 70)
    print(f"组合数: {run_count}")
    print(f"总信号: {total_signal_generated}")
    print(f"总通过: {total_signal_passed}")
    print(f"总交易: {total_trades}")
    print(f"总胜率: {total_wins / total_trades * 100:.1f}%" if total_trades else "总胜率: 0.0%")
    print(f"总账户盈亏金额: ${total_pnl_amount:,.2f}")
    print(f"最大账户回撤（最差组合）: {worst_account_drawdown:.2f}%")

    if args.output:
        payload = {
            "config": {
                "symbols": symbols,
                "timeframes": timeframes,
                "days": args.days,
                "start": args.start,
                "end": args.end,
                "threshold": args.threshold,
                "balance": args.balance,
                "per_run_balance": per_run_balance,
                "fee_percent": args.fee,
                "strategy_profile": args.strategy_profile,
                "strategy_whitelist": parse_csv_list(args.strategy_whitelist),
                "strategy_blacklist": parse_csv_list(args.strategy_blacklist),
                "management_profile": args.management_profile,
                "engine_thresholds": parse_threshold_map(args.engine_thresholds) if args.engine_thresholds else {},
            },
            "summary": {
                "runs": run_count,
                "signals_generated": total_signal_generated,
                "signals_passed": total_signal_passed,
                "total_trades": total_trades,
                "wins": total_wins,
                "losses": total_losses,
                "win_rate": (total_wins / total_trades * 100) if total_trades else 0.0,
                "account_total_pnl_amount": total_pnl_amount,
                "worst_account_drawdown": worst_account_drawdown,
            },
            "runs": runs,
        }
        save_payload(payload, build_output_path(args.output))


def run_scenario_main() -> None:
    """历史场景回测入口。"""
    parser = argparse.ArgumentParser(description="按预置历史场景运行权威 BacktestRunner")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), default="trend_bull", help="预置场景")
    parser.add_argument("--hours", type=int, default=0, help="只截取场景末尾 N 小时")
    parser.add_argument("--symbols", default="", help="覆盖场景默认品种，逗号分隔")
    parser.add_argument("--timeframes", default="", help="覆盖场景默认周期，逗号分隔")
    parser.add_argument("--start", default=None, help="手动覆盖开始日期 YYYY-MM-DD")
    parser.add_argument("--end", default=None, help="手动覆盖结束日期 YYYY-MM-DD")
    parser.add_argument("--balance", type=float, default=10000.0, help="总资金")
    parser.add_argument("--threshold", type=int, default=0, help="兼容旧参数，当前已忽略")
    parser.add_argument("--fee", type=float, default=0.08, help="往返手续费百分比")
    parser.add_argument("--max-hold", type=int, default=48, help="最大持仓 K 线数")
    parser.add_argument("--risk", type=float, default=None, help="旧参数，当前只保留兼容提示")
    parser.add_argument("--strategy-profile", default="", help="策略配置档")
    parser.add_argument("--strategy-whitelist", default="", help="策略白名单，逗号分隔")
    parser.add_argument("--strategy-blacklist", default="", help="策略黑名单，逗号分隔")
    parser.add_argument("--management-profile", default="brooks_pdf", help="管理模板")
    parser.add_argument("--engine-thresholds", default="", help="兼容旧参数，当前已忽略")
    parser.add_argument("--parquet", default=None, help="本地 Parquet 文件路径")
    parser.add_argument("--cache-dir", default=None, help="数据缓存目录")
    parser.add_argument("--output", default="", help="输出 JSON 报告路径")
    parser.add_argument("--verbose", action="store_true", help="详细输出")
    args = parser.parse_args()

    maybe_warn_legacy_risk(args.risk)

    spec = SCENARIOS[args.scenario]
    symbols = [item.upper() for item in parse_csv_list(args.symbols)] or list(spec.symbols)
    timeframes = parse_csv_list(args.timeframes) or list(spec.timeframes)
    end_dt = datetime.fromisoformat(args.end or spec.end)
    start_dt = datetime.fromisoformat(args.start or spec.start)
    if args.hours and args.hours > 0:
        start_dt = max(start_dt, end_dt - timedelta(hours=args.hours))
    days = max(1, math.ceil((end_dt - start_dt).total_seconds() / 86400))
    run_count = max(1, len(symbols) * len(timeframes))
    per_run_balance = float(args.balance) / run_count

    print("=" * 70)
    print(f"历史场景回测: {spec.name}")
    print("=" * 70)
    print(f"场景: {args.scenario}")
    print(f"说明: {spec.desc}")
    print(f"品种: {', '.join(symbols)}")
    print(f"周期: {', '.join(timeframes)}")
    print(f"区间: {start_dt.strftime('%Y-%m-%d')} ~ {end_dt.strftime('%Y-%m-%d')}")
    print(f"总资金: ${float(args.balance):,.2f}")
    print(f"每个组合分配资金: ${per_run_balance:,.2f}")
    print()

    runs: list[dict[str, Any]] = []
    total_pnl_amount = 0.0
    total_trades = 0
    total_wins = 0
    worst_account_drawdown = 0.0

    for symbol in symbols:
        for timeframe in timeframes:
            print(f"[场景运行] {symbol} | {timeframe}")
            config = make_config(
                symbols=[symbol],
                timeframes=[timeframe],
                days=days,
                start_date=start_dt.strftime("%Y-%m-%d"),
                end_date=end_dt.strftime("%Y-%m-%d"),
                threshold=0,
                balance=per_run_balance,
                fee_percent=args.fee,
                max_hold=args.max_hold,
                parquet=args.parquet,
                cache_dir=args.cache_dir,
                verbose=args.verbose,
                engine_thresholds=args.engine_thresholds,
                strategy_profile=args.strategy_profile,
                strategy_whitelist=args.strategy_whitelist,
                strategy_blacklist=args.strategy_blacklist,
                management_profile=args.management_profile,
            )
            result = BacktestRunner(config).run()
            payload = result_payload(result)
            payload["symbol"] = symbol
            payload["timeframe"] = timeframe
            runs.append(payload)
            summary = payload.get("summary", {})
            total_pnl_amount += float(summary.get("account_total_pnl_amount", 0.0) or 0.0)
            total_trades += int(summary.get("total_trades", 0) or 0)
            total_wins += int(summary.get("wins", 0) or 0)
            worst_account_drawdown = max(
                worst_account_drawdown,
                float(summary.get("account_max_drawdown", 0.0) or 0.0),
            )
            print(
                f"  交易 {int(summary.get('total_trades', 0) or 0)} 笔 | "
                f"胜率 {float(summary.get('win_rate', 0.0) or 0.0):.1f}% | "
                f"账户收益 {float(summary.get('account_return_pct', 0.0) or 0.0):+.2f}%"
            )

    print()
    print("=" * 70)
    print("场景汇总")
    print("=" * 70)
    print(f"总交易: {total_trades}")
    print(f"总胜率: {total_wins / total_trades * 100:.1f}%" if total_trades else "总胜率: 0.0%")
    print(f"总账户盈亏金额: ${total_pnl_amount:,.2f}")
    print(f"最大账户回撤（最差组合）: {worst_account_drawdown:.2f}%")

    if args.output:
        payload = {
            "scenario": {
                "id": args.scenario,
                "name": spec.name,
                "desc": spec.desc,
                "start": start_dt.strftime("%Y-%m-%d"),
                "end": end_dt.strftime("%Y-%m-%d"),
                "symbols": symbols,
                "timeframes": timeframes,
                "threshold": 0,
                "balance": args.balance,
                "per_run_balance": per_run_balance,
                "parquet": args.parquet,
                "cache_dir": args.cache_dir,
            },
            "summary": {
                "total_trades": total_trades,
                "win_rate": (total_wins / total_trades * 100) if total_trades else 0.0,
                "account_total_pnl_amount": total_pnl_amount,
                "worst_account_drawdown": worst_account_drawdown,
            },
            "runs": runs,
        }
        save_payload(payload, build_output_path(args.output))
