"""
完整回测测试 - 使用真实数据

从 TimescaleDB 加载历史K线，运行完整回测
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backtest_v2.engine import BrooksBacktestEngine
from backtest_v2.strategies.all_strategies import BrooksStrategyCollection
from backtest_v2.models import Candle
from datetime import datetime
import pandas as pd


def load_candles_from_parquet(symbol: str, start_date: str, end_date: str) -> list[Candle]:
    """
    从 parquet 缓存加载K线数据

    如果缓存不存在，需要从 TimescaleDB 加载
    """
    cache_file = Path(__file__).parent.parent / "data" / "backtest_cache" / f"{symbol}_{start_date}_{end_date}.parquet"

    if not cache_file.exists():
        print(f"缓存文件不存在: {cache_file}")
        print("需要从 TimescaleDB 加载数据")
        return []

    print(f"从缓存加载: {cache_file}")
    df = pd.read_parquet(cache_file)

    candles = []
    for _, row in df.iterrows():
        candle = Candle(
            timestamp=pd.to_datetime(row['timestamp']),
            open=float(row['open']),
            high=float(row['high']),
            low=float(row['low']),
            close=float(row['close']),
            volume=float(row['volume'])
        )
        candles.append(candle)

    return candles


def main():
    """主函数"""
    print("="*60)
    print("Al Brooks 回测系统 V2.0 - 完整测试")
    print("100% 遵循 Brooks 哲学")
    print("="*60)
    print()

    # 配置
    symbol = "BTCUSDT"
    timeframe = "5m"
    start_date = "2025-12-11"
    end_date = "2026-03-11"

    # 1. 加载数据
    print(f"加载数据: {symbol} {timeframe}")
    print(f"时间范围: {start_date} ~ {end_date}")
    candles = load_candles_from_parquet(symbol, start_date, end_date)

    if not candles:
        print("\n❌ 数据加载失败")
        print("\n请先运行数据加载脚本:")
        print("  python backtest_v2/load_data.py")
        return

    print(f"✅ 加载了 {len(candles)} 根K线")
    print(f"   时间范围: {candles[0].timestamp} ~ {candles[-1].timestamp}")
    print()

    # 2. 创建引擎
    print("初始化回测引擎...")
    engine = BrooksBacktestEngine()

    # 3. 添加所有策略
    print("加载策略集合...")
    strategy_collection = BrooksStrategyCollection()
    for strategy in strategy_collection.strategies:
        engine.add_strategy(strategy)

    print(f"✅ 加载了 {len(strategy_collection.strategies)} 个策略")
    print()

    # 4. 运行回测
    print("开始回测...")
    print("="*60)
    result = engine.run(
        candles=candles,
        symbol=symbol,
        timeframe=timeframe
    )

    # 5. 输出结果
    if result:
        print("\n" + "="*60)
        print("回测完成！")
        print("="*60)
        print(f"最终资金: ${engine.current_capital:.2f}")
        print(f"收益率: {(engine.current_capital/engine.initial_capital - 1)*100:.2f}%")
        print(f"胜率: {result.win_rate*100:.1f}%")
        print(f"盈利因子: {result.profit_factor:.2f}")
        print(f"最大回撤: {result.max_drawdown*100:.2f}%")
        print()

        # 按策略统计
        print("按策略统计:")
        print("-"*60)
        strategy_stats = {}
        for trade in result.trades:
            st = trade.signal_type
            if st not in strategy_stats:
                strategy_stats[st] = {'total': 0, 'win': 0, 'pnl': 0}
            strategy_stats[st]['total'] += 1
            if trade.pnl > 0:
                strategy_stats[st]['win'] += 1
            strategy_stats[st]['pnl'] += trade.pnl

        for st, stats in sorted(strategy_stats.items(), key=lambda x: x[1]['total'], reverse=True):
            wr = stats['win'] / stats['total'] * 100 if stats['total'] > 0 else 0
            print(f"{st:15s}: {stats['total']:3d} 笔, 胜率 {wr:5.1f}%, 盈亏 ${stats['pnl']:8.2f}")

        print("="*60)
    else:
        print("\n❌ 回测失败")


if __name__ == "__main__":
    main()
