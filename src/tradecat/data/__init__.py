"""Data module - fetch market data from various sources.

This module provides unified access to market data from multiple exchanges
and local databases.

Examples:
    >>> from tradecat import Data
    >>> 
    >>> # Fetch K-line data
    >>> df = Data.klines("BTCUSDT", interval="1h", days=30)
    >>> 
    >>> # Fetch multiple symbols
    >>> df = Data.klines(["BTCUSDT", "ETHUSDT"], interval="1d", days=365)
    >>> 
    >>> # Use local database
    >>> from tradecat import Config
    >>> Config.set_database("postgresql://localhost:5434/market_data")
    >>> df = Data.klines("BTCUSDT", source="local")
"""

from tradecat.data.klines import Data
from tradecat.data.futures import Futures

__all__ = ["Data", "Futures"]
