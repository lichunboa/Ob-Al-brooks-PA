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

from .data_loader import DataLoader
from .market_replay import MarketReplay
from .sim_exchange import SimExchange
from .scoring import ScoringEngine
from .background import BackgroundAnalyzer, BackgroundContext
from .runner import BacktestRunner, BacktestConfig
from .report import BacktestResult

__all__ = [
    "DataLoader",
    "MarketReplay",
    "SimExchange",
    "ScoringEngine",
    "BackgroundAnalyzer",
    "BackgroundContext",
    "BacktestRunner",
    "BacktestConfig",
    "BacktestResult",
]
