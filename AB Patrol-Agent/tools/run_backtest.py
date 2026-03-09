#!/usr/bin/env python3
"""
运行回测

使用独立回测引擎测试规则引擎和持仓管理逻辑。

用法:
    python tools/run_backtest.py --symbol BTCUSDT --days 7
"""

import argparse
import json
import sys
from pathlib import Path

# 添加 runtime 到路径
sys.path.insert(0, str(Path(__file__).parent.parent / "runtime"))

from backtest_engine import BacktestEngine, print_backtest_results
from position_manager import manage_position
from data_loader import DataLoader, calculate_indicators


def simple_signal_generator(bars):
    """
    简单的信号生成器（示例）

    实际使用时应该集成 execution_semantics 和 market_scanner
    """
    if len(bars) < 20:
        return None

    # 计算简单的 EMA
    closes = [b.close for b in bars[-20:]]
    ema20 = sum(closes) / len(closes)

    last = bars[-1]
    prev = bars[-2]

    # 简单的突破策略
    if last.close > ema20 and prev.close <= ema20:
        # 多头突破
        sl = min(b.low for b in bars[-5:])
        tp = last.close + (last.close - sl) * 2

        return {
            "symbol": "BTCUSDT",
            "side": "BUY",
            "sl": sl,
            "tp": tp,
            "style": "Swing",
            "premise": "EMA20 突破",
            "playbook": "T3-EMA",
        }

    elif last.close < ema20 and prev.close >= ema20:
        # 空头突破
        sl = max(b.high for b in bars[-5:])
        tp = last.close - (sl - last.close) * 2

        return {
            "symbol": "BTCUSDT",
            "side": "SELL",
            "sl": sl,
            "tp": tp,
            "style": "Swing",
            "premise": "EMA20 突破",
            "playbook": "T3-EMA",
        }

    return None


def load_historical_data(symbol: str, days: int, interval: str = "5m") -> list:
    """
    加载历史数据
    """
    loader = DataLoader()

    # 从 Binance 加载
    klines = loader.load_binance_klines(symbol, interval, days)

    if not klines:
        return []

    # 计算指标
    klines = calculate_indicators(klines)

    return klines


def main():
    parser = argparse.ArgumentParser(description="运行回测")
    parser.add_argument("--symbol", default="BTCUSDT", help="交易品种")
    parser.add_argument("--days", type=int, default=7, help="回测天数")
    parser.add_argument("--balance", type=float, default=10000.0, help="初始余额")
    parser.add_argument("--risk", type=float, default=0.3, help="风险百分比")
    parser.add_argument("--output", help="输出文件路径")
    args = parser.parse_args()
    
    print(f"\n{'='*70}")
    print(f"  回测配置")
    print(f"{'='*70}")
    print(f"  品种: {args.symbol}")
    print(f"  天数: {args.days}")
    print(f"  初始余额: ${args.balance:.2f}")
    print(f"  风险: {args.risk}%")
    print(f"{'='*70}\n")
    
    # 加载数据
    print("  加载历史数据...")
    bars_data = load_historical_data(args.symbol, args.days)
    
    if not bars_data:
        print("  ❌ 没有数据，无法运行回测")
        print("\n  提示：")
        print("  1. 从 Binance API 下载数据")
        print("  2. 或使用 tools/backtest_v4.py 连接 sim_server")
        return
    
    # 创建回测引擎
    engine = BacktestEngine(
        initial_balance=args.balance,
        risk_pct=args.risk,
    )
    
    # 加载 K 线
    engine.load_bars(bars_data)
    print(f"  ✅ 加载了 {len(bars_data)} 根 K 线")
    
    # 运行回测
    print("\n  开始回测...")
    stats = engine.run(
        signal_generator=simple_signal_generator,
        position_manager=manage_position,  # 使用 S7 持仓管理
        start_index=100,
    )
    
    # 打印结果
    print_backtest_results(stats)
    
    # 保存结果
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(stats, f, indent=2, ensure_ascii=False)
        print(f"  结果已保存到: {output_path}")


if __name__ == "__main__":
    main()
