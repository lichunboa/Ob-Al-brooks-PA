"""Technical indicators module.

Provides 38+ technical indicators for market analysis.

Examples:
    >>> from tradecat import Data, Indicators
    >>> 
    >>> df = Data.klines("BTCUSDT", "1h", days=30)
    >>> ind = Indicators(df)
    >>> 
    >>> # Individual indicators
    >>> df["rsi"] = ind.rsi()
    >>> df["macd"], df["signal"], df["hist"] = ind.macd()
    >>> df["bb_upper"], df["bb_mid"], df["bb_lower"] = ind.bollinger()
    >>> 
    >>> # All indicators at once
    >>> df_full = ind.all()
"""

from tradecat.indicators.technical import Indicators

__all__ = ["Indicators"]
