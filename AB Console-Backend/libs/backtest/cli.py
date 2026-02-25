"""
回测模块 CLI 入口

用法:
    # 使用真实 PA 引擎回测 BTC 最近 30 天
    python -m libs.backtest.cli --symbol BTCUSDT --days 30

    # 多币种回测
    python -m libs.backtest.cli --all --days 30

    # 对比不同评分阈值
    python -m libs.backtest.cli --symbol BTCUSDT --days 60 --compare-thresholds

    # 详细输出每笔交易
    python -m libs.backtest.cli --symbol BTCUSDT --days 30 -v

    # 输出 JSON 报告
    python -m libs.backtest.cli --symbol BTCUSDT --days 30 --output report.json
"""

import argparse
import sys
from datetime import datetime, timedelta
from pathlib import Path

from .runner import BacktestRunner, BacktestConfig


DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]


def main():
    parser = argparse.ArgumentParser(
        description="可复用回测模块 — 使用真实 PA 引擎回测历史数据"
    )
    parser.add_argument("--symbol", type=str, default="BTCUSDT",
                        help="交易对 (默认: BTCUSDT)")
    parser.add_argument("--all", action="store_true",
                        help="回测所有币种 (BTC/ETH/BNB/SOL)")
    parser.add_argument("--start", type=str, default=None,
                        help="开始日期 (如: 2025-12-01)")
    parser.add_argument("--end", type=str, default=None,
                        help="结束日期 (如: 2026-01-01)")
    parser.add_argument("--days", type=int, default=30,
                        help="回测最近N天 (默认: 30)")
    parser.add_argument("--threshold", type=int, default=80,
                        help="评分阈值 (默认: 80)")
    parser.add_argument("--timeframes", type=str, default="5m",
                        help="检测周期，逗号分隔 (默认: 5m)")
    parser.add_argument("--max-hold", type=int, default=48,
                        help="最大持仓K线数 (默认: 48, 即4小时)")
    parser.add_argument("--fee-rate", type=float, default=0.0004,
                        help="手续费率 (默认: 0.0004)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="详细输出每笔交易")
    parser.add_argument("--parquet", type=str, default=None,
                        help="使用本地 Parquet 文件")
    parser.add_argument("--cache-dir", type=str, default=None,
                        help="数据缓存目录")
    parser.add_argument("--compare-thresholds", action="store_true",
                        help="对比不同评分阈值 (70/75/80/85/90)")
    parser.add_argument("--output", type=str, default=None,
                        help="输出 JSON 结果文件")
    args = parser.parse_args()

    symbols = DEFAULT_SYMBOLS if args.all else [args.symbol.upper()]
    timeframes = [tf.strip() for tf in args.timeframes.split(",")]

    if args.compare_thresholds:
        _run_compare(symbols, timeframes, args)
    else:
        for symbol in symbols:
            config = BacktestConfig(
                symbols=[symbol],
                timeframes=timeframes,
                days=args.days,
                start_date=args.start,
                end_date=args.end,
                threshold=args.threshold,
                max_holding_bars=args.max_hold,
                fee_rate=args.fee_rate,
                cache_dir=args.cache_dir,
                parquet_path=args.parquet,
                verbose=args.verbose,
            )
            runner = BacktestRunner(config)
            result = runner.run()
            result.print_report()

            if args.output:
                out_path = args.output
                if len(symbols) > 1:
                    base, ext = args.output.rsplit(".", 1) if "." in args.output else (args.output, "json")
                    out_path = f"{base}_{symbol}.{ext}"
                result.to_json(out_path)

    # 多币种汇总
    if len(symbols) > 1:
        print(f"\n{'='*60}")
        print(f"  多币种汇总")
        print(f"{'='*60}")


def _run_compare(symbols: list, timeframes: list, args):
    """对比不同评分阈值"""
    thresholds = [70, 75, 80, 85, 90]

    for symbol in symbols:
        print(f"\n{'='*60}")
        print(f"  阈值对比 — {symbol}")
        print(f"{'='*60}")
        print(f"  {'阈值':>4} | {'交易':>4} | {'胜率':>6} | {'PnL':>8} | {'盈亏因子':>6} | {'最大回撤':>6}")
        print(f"  {'-'*50}")

        for threshold in thresholds:
            config = BacktestConfig(
                symbols=[symbol],
                timeframes=timeframes,
                days=args.days,
                start_date=args.start,
                end_date=args.end,
                threshold=threshold,
                max_holding_bars=args.max_hold,
                fee_rate=args.fee_rate,
                cache_dir=args.cache_dir,
                parquet_path=args.parquet,
                verbose=False,
            )
            runner = BacktestRunner(config)
            result = runner.run()

            print(f"  {threshold:>4} | {result.total_trades:>4} | "
                  f"{result.win_rate:>5.1f}% | {result.total_pnl:>+7.2f}% | "
                  f"{result.profit_factor:>6.2f} | {result.max_drawdown:>5.2f}%")


if __name__ == "__main__":
    main()
