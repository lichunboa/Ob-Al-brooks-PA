"""K-line (OHLCV) data fetching."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Union

import pandas as pd

from tradecat._internal.config import Config

logger = logging.getLogger(__name__)

# Lazy import for optional dependencies
_ccxt = None
_sqlalchemy = None


def _get_ccxt():
    """Lazy load ccxt."""
    global _ccxt
    if _ccxt is None:
        try:
            import ccxt
            _ccxt = ccxt
        except ImportError:
            raise ImportError(
                "ccxt is required for remote data fetching. "
                "Install with: pip install ccxt"
            )
    return _ccxt


class Data:
    """Unified data access interface.
    
    Provides methods to fetch market data from exchanges or local databases.
    
    Examples:
        >>> from tradecat import Data
        >>> 
        >>> # Basic usage
        >>> df = Data.klines("BTCUSDT", interval="1h", days=30)
        >>> 
        >>> # Multiple symbols
        >>> df = Data.klines(["BTCUSDT", "ETHUSDT"], interval="1d", days=7)
        >>> 
        >>> # Custom time range
        >>> from datetime import datetime
        >>> df = Data.klines(
        ...     "BTCUSDT",
        ...     interval="4h",
        ...     start=datetime(2024, 1, 1),
        ...     end=datetime(2024, 1, 31)
        ... )
        >>> 
        >>> # List available symbols
        >>> symbols = Data.symbols()
    
    Attributes:
        INTERVALS: Supported time intervals
    """
    
    INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"]
    
    _exchange_cache: dict = {}
    
    @classmethod
    def _get_exchange(cls, name: str = "binance"):
        """Get or create exchange instance."""
        if name not in cls._exchange_cache:
            ccxt = _get_ccxt()
            config = Config._get_config()
            
            exchange_class = getattr(ccxt, name, None)
            if exchange_class is None:
                raise ValueError(f"Unknown exchange: {name}")
            
            options = {
                "enableRateLimit": config.rate_limit,
                "timeout": config.timeout * 1000,
                "options": {"defaultType": "future"},
            }
            
            if config.api_key and config.api_secret:
                options["apiKey"] = config.api_key
                options["secret"] = config.api_secret
            
            if config.proxy:
                options["proxies"] = {
                    "http": config.proxy,
                    "https": config.proxy,
                }
            
            cls._exchange_cache[name] = exchange_class(options)
        
        return cls._exchange_cache[name]
    
    @classmethod
    def klines(
        cls,
        symbol: Union[str, List[str]],
        interval: str = "1h",
        days: int = 30,
        start: Optional[datetime] = None,
        end: Optional[datetime] = None,
        source: str = "remote",
        exchange: str = "binance",
        limit: Optional[int] = None,
    ) -> pd.DataFrame:
        """Fetch K-line (OHLCV) data.
        
        Args:
            symbol: Trading pair(s), e.g., "BTCUSDT" or ["BTCUSDT", "ETHUSDT"]
            interval: Time interval (1m, 5m, 15m, 1h, 4h, 1d, 1w, etc.)
            days: Number of days to fetch (default: 30)
            start: Start datetime (overrides days if provided)
            end: End datetime (default: now)
            source: Data source - "remote" (exchange API) or "local" (database)
            exchange: Exchange name (default: "binance")
            limit: Maximum number of candles (default: calculated from days)
        
        Returns:
            DataFrame with columns:
                - timestamp: Datetime index
                - open: Opening price
                - high: Highest price
                - low: Lowest price
                - close: Closing price
                - volume: Trading volume
                - symbol: (only for multi-symbol queries)
        
        Raises:
            ValueError: If symbol or interval is invalid
            ImportError: If required dependencies are not installed
        
        Examples:
            >>> df = Data.klines("BTCUSDT", "1h", days=30)
            >>> df = Data.klines(["BTCUSDT", "ETHUSDT"], "1d", days=365)
        """
        # Validate interval
        if interval not in cls.INTERVALS:
            raise ValueError(
                f"Invalid interval: {interval}. "
                f"Supported: {', '.join(cls.INTERVALS)}"
            )
        
        # Handle local source
        if source == "local":
            return cls._klines_from_db(symbol, interval, days, start, end)
        
        # Handle multiple symbols
        if isinstance(symbol, list):
            dfs = []
            for sym in symbol:
                df = cls._fetch_klines(sym, interval, days, start, end, exchange, limit)
                df["symbol"] = sym
                dfs.append(df)
            return pd.concat(dfs, ignore_index=True)
        
        return cls._fetch_klines(symbol, interval, days, start, end, exchange, limit)
    
    @classmethod
    def _fetch_klines(
        cls,
        symbol: str,
        interval: str,
        days: int,
        start: Optional[datetime],
        end: Optional[datetime],
        exchange: str,
        limit: Optional[int],
    ) -> pd.DataFrame:
        """Fetch K-lines from exchange."""
        ex = cls._get_exchange(exchange)
        
        # Normalize symbol
        symbol = symbol.upper()
        if not symbol.endswith("USDT") and not symbol.endswith("USD"):
            symbol = f"{symbol}USDT"
        
        # Calculate time range
        if end is None:
            end = datetime.utcnow()
        if start is None:
            start = end - timedelta(days=days)
        
        since = int(start.timestamp() * 1000)
        
        # Calculate limit based on interval and time range
        if limit is None:
            interval_minutes = cls._interval_to_minutes(interval)
            total_minutes = (end - start).total_seconds() / 60
            limit = min(int(total_minutes / interval_minutes) + 1, 1000)
        
        logger.debug(f"Fetching {symbol} {interval} from {start} to {end}, limit={limit}")
        
        # Fetch data
        try:
            ohlcv = ex.fetch_ohlcv(symbol, interval, since, limit)
        except Exception as e:
            raise ValueError(f"Failed to fetch data for {symbol}: {e}")
        
        if not ohlcv:
            return pd.DataFrame(columns=["timestamp", "open", "high", "low", "close", "volume"])
        
        # Convert to DataFrame
        df = pd.DataFrame(
            ohlcv,
            columns=["timestamp", "open", "high", "low", "close", "volume"]
        )
        df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
        
        # Filter by end time
        df = df[df["timestamp"] <= pd.Timestamp(end)]
        
        return df
    
    @classmethod
    def _klines_from_db(
        cls,
        symbol: Union[str, List[str]],
        interval: str,
        days: int,
        start: Optional[datetime],
        end: Optional[datetime],
    ) -> pd.DataFrame:
        """Fetch K-lines from local database."""
        config = Config._get_config()
        
        if not config.database_url:
            raise ValueError(
                "Database not configured. "
                "Use Config.set_database('postgresql://...') first, "
                "or use source='remote' for exchange data."
            )
        
        try:
            from sqlalchemy import create_engine, text
        except ImportError:
            raise ImportError(
                "sqlalchemy is required for local data. "
                "Install with: pip install sqlalchemy psycopg[binary]"
            )
        
        engine = create_engine(config.database_url)
        
        # Calculate time range
        if end is None:
            end = datetime.utcnow()
        if start is None:
            start = end - timedelta(days=days)
        
        # Handle symbol(s)
        symbols = [symbol] if isinstance(symbol, str) else symbol
        symbols = [s.upper() for s in symbols]
        
        # Query based on interval
        table = "market_data.candles_1m" if interval == "1m" else f"market_data.candles_{interval}"
        
        query = text(f"""
            SELECT 
                bucket_ts as timestamp,
                symbol,
                open, high, low, close, volume
            FROM {table}
            WHERE symbol = ANY(:symbols)
              AND bucket_ts >= :start
              AND bucket_ts <= :end
            ORDER BY symbol, bucket_ts
        """)
        
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={
                "symbols": symbols,
                "start": start,
                "end": end,
            })
        
        if len(symbols) == 1:
            df = df.drop(columns=["symbol"], errors="ignore")
        
        return df
    
    @classmethod
    def _interval_to_minutes(cls, interval: str) -> int:
        """Convert interval string to minutes."""
        mapping = {
            "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
            "1h": 60, "2h": 120, "4h": 240, "6h": 360, "8h": 480, "12h": 720,
            "1d": 1440, "3d": 4320, "1w": 10080, "1M": 43200,
        }
        return mapping.get(interval, 60)
    
    @classmethod
    def symbols(cls, exchange: str = "binance", quote: str = "USDT") -> List[str]:
        """Get list of available trading symbols.
        
        Args:
            exchange: Exchange name (default: "binance")
            quote: Quote currency filter (default: "USDT")
        
        Returns:
            List of symbol strings
        
        Examples:
            >>> symbols = Data.symbols()
            >>> print(symbols[:5])
            ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT']
        """
        ex = cls._get_exchange(exchange)
        
        if not ex.markets:
            ex.load_markets()
        
        return [
            s for s in ex.markets.keys()
            if s.endswith(quote) and ex.markets[s].get("active", True)
        ]
    
    @classmethod
    def ticker(cls, symbol: str, exchange: str = "binance") -> dict:
        """Get current ticker data for a symbol.
        
        Args:
            symbol: Trading pair (e.g., "BTCUSDT")
            exchange: Exchange name
        
        Returns:
            Dict with price, volume, change info
        """
        ex = cls._get_exchange(exchange)
        symbol = symbol.upper()
        
        ticker = ex.fetch_ticker(symbol)
        
        return {
            "symbol": symbol,
            "price": ticker.get("last"),
            "open": ticker.get("open"),
            "high": ticker.get("high"),
            "low": ticker.get("low"),
            "volume": ticker.get("baseVolume"),
            "quote_volume": ticker.get("quoteVolume"),
            "change": ticker.get("change"),
            "change_percent": ticker.get("percentage"),
            "timestamp": ticker.get("timestamp"),
        }
