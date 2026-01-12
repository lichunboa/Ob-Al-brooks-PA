"""Signal detection module.

Provides automated signal detection based on technical indicators.

Examples:
    >>> from tradecat import Signals
    >>> 
    >>> # Detect signals for a symbol
    >>> signals = Signals.detect("BTCUSDT")
    >>> for sig in signals:
    ...     print(f"{sig['type']}: {sig['level']}")
    >>> 
    >>> # Get specific signal types
    >>> rsi_signals = Signals.detect("BTCUSDT", types=["rsi"])
"""

from tradecat.signals.detector import Signals

__all__ = ["Signals"]
