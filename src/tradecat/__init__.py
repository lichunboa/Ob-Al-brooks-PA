"""TradeCat - Quantitative Trading for Everyone

A comprehensive quantitative trading toolkit providing:
- Market data fetching from multiple exchanges
- 38+ technical indicators
- Signal detection with 129 rules
- AI-powered market analysis

Quick Start:
    >>> from tradecat import Data, Indicators, Signals
    >>> 
    >>> # Fetch K-line data
    >>> df = Data.klines("BTCUSDT", interval="1h", days=30)
    >>> 
    >>> # Calculate indicators
    >>> ind = Indicators(df)
    >>> df["rsi"] = ind.rsi()
    >>> df["macd"], df["signal"], df["hist"] = ind.macd()
    >>> 
    >>> # Detect signals
    >>> signals = Signals.detect("BTCUSDT")

Installation:
    pip install tradecat          # Basic
    pip install tradecat[full]    # With TA-Lib
    pip install tradecat[ai]      # With AI support
    pip install tradecat[all]     # Everything

Documentation:
    https://docs.tradecat.dev

Repository:
    https://github.com/tukuaiai/tradecat
"""

from __future__ import annotations

__version__ = "0.1.0"
__author__ = "TradeCat Team"
__license__ = "MIT"

from tradecat.data import Data
from tradecat.indicators import Indicators
from tradecat.signals import Signals
from tradecat.ai import AI
from tradecat._internal.config import Config

__all__ = [
    "Data",
    "Indicators", 
    "Signals",
    "AI",
    "Config",
    "__version__",
]
