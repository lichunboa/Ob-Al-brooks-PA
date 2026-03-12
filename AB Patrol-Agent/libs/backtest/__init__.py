"""
可复用回测模块

让真实 PA 引擎直接跑在历史数据上，零代码复制。

架构:
  真实: Binance WS → TimescaleDB → PA Engine → Signal → Trading → Binance API
  回测: Parquet   → MarketReplay → PA Engine → Signal → SimExchange → 统计报告

用法:
    from libs.backtest import BacktestRunner, BacktestConfig

    config = BacktestConfig(symbols=["BTCUSDT"], days=30)
    runner = BacktestRunner(config)
    result = runner.run()
    result.print_report()
"""

from .cycle_identifier import BACKTEST_STRATEGY_MATRIX, CycleIdentifier, classify_backtest_market_state
from .indicators import CandlePatterns, calculate_atr, calculate_ema, ema_slope
from .models import Candle, MarketState, PASignal, Trade
from .sim_exchange import SimExchange

try:
    from .data_loader import DataLoader
except ModuleNotFoundError:
    DataLoader = None

try:
    from .market_replay import MarketReplay
except ModuleNotFoundError:
    MarketReplay = None

try:
    from .runner import BacktestConfig, BacktestRunner
except ModuleNotFoundError:
    BacktestRunner = None
    BacktestConfig = None

try:
    from .report import BacktestResult
except ModuleNotFoundError:
    BacktestResult = None

__all__ = [
    "Candle",
    "DataLoader",
    "MarketReplay",
    "PASignal",
    "MarketState",
    "Trade",
    "SimExchange",
    "CandlePatterns",
    "calculate_ema",
    "ema_slope",
    "calculate_atr",
    "CycleIdentifier",
    "classify_backtest_market_state",
    "BACKTEST_STRATEGY_MATRIX",
    "BacktestRunner",
    "BacktestConfig",
    "BacktestResult",
]
