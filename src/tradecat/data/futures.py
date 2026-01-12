"""Futures-specific data (funding rate, open interest, etc.)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd

from tradecat._internal.config import Config

logger = logging.getLogger(__name__)


class Futures:
    """Futures market data interface.
    
    Provides access to futures-specific data like funding rates,
    open interest, and long/short ratios.
    
    Examples:
        >>> from tradecat import Futures
        >>> 
        >>> # Get funding rate
        >>> rate = Futures.funding_rate("BTCUSDT")
        >>> print(f"Funding rate: {rate['rate']:.4%}")
        >>> 
        >>> # Get open interest
        >>> oi = Futures.open_interest("BTCUSDT")
        >>> print(f"OI: ${oi['value']:,.0f}")
        >>> 
        >>> # Get long/short ratio
        >>> ratio = Futures.long_short_ratio("BTCUSDT")
    """
    
    _exchange_cache: dict = {}
    
    @classmethod
    def _get_exchange(cls, name: str = "binance"):
        """Get exchange instance."""
        if name not in cls._exchange_cache:
            try:
                import ccxt
            except ImportError:
                raise ImportError(
                    "ccxt is required. Install with: pip install ccxt"
                )
            
            config = Config._get_config()
            
            options = {
                "enableRateLimit": config.rate_limit,
                "timeout": config.timeout * 1000,
                "options": {"defaultType": "future"},
            }
            
            if config.proxy:
                options["proxies"] = {"http": config.proxy, "https": config.proxy}
            
            cls._exchange_cache[name] = getattr(ccxt, name)(options)
        
        return cls._exchange_cache[name]
    
    @classmethod
    def funding_rate(
        cls,
        symbol: str,
        exchange: str = "binance",
    ) -> dict:
        """Get current funding rate for a perpetual contract.
        
        Args:
            symbol: Trading pair (e.g., "BTCUSDT")
            exchange: Exchange name
        
        Returns:
            Dict with:
                - symbol: Trading pair
                - rate: Current funding rate (as decimal)
                - next_time: Next funding time
                - mark_price: Current mark price
        
        Examples:
            >>> rate = Futures.funding_rate("BTCUSDT")
            >>> print(f"Funding: {rate['rate']:.4%}")
        """
        ex = cls._get_exchange(exchange)
        symbol = symbol.upper()
        
        try:
            info = ex.fetch_funding_rate(symbol)
            return {
                "symbol": symbol,
                "rate": info.get("fundingRate", 0),
                "next_time": info.get("fundingTimestamp"),
                "mark_price": info.get("markPrice"),
                "index_price": info.get("indexPrice"),
            }
        except Exception as e:
            logger.warning(f"Failed to fetch funding rate for {symbol}: {e}")
            return {"symbol": symbol, "rate": None, "error": str(e)}
    
    @classmethod
    def funding_rate_history(
        cls,
        symbol: str,
        days: int = 30,
        exchange: str = "binance",
    ) -> pd.DataFrame:
        """Get historical funding rates.
        
        Args:
            symbol: Trading pair
            days: Number of days of history
            exchange: Exchange name
        
        Returns:
            DataFrame with timestamp and funding rate columns
        """
        ex = cls._get_exchange(exchange)
        symbol = symbol.upper()
        
        since = int((datetime.utcnow() - timedelta(days=days)).timestamp() * 1000)
        
        try:
            history = ex.fetch_funding_rate_history(symbol, since=since, limit=1000)
            
            if not history:
                return pd.DataFrame(columns=["timestamp", "rate"])
            
            df = pd.DataFrame(history)
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            df = df.rename(columns={"fundingRate": "rate"})
            
            return df[["timestamp", "rate"]]
        except Exception as e:
            logger.warning(f"Failed to fetch funding history: {e}")
            return pd.DataFrame(columns=["timestamp", "rate"])
    
    @classmethod
    def open_interest(
        cls,
        symbol: str,
        exchange: str = "binance",
    ) -> dict:
        """Get current open interest.
        
        Args:
            symbol: Trading pair
            exchange: Exchange name
        
        Returns:
            Dict with:
                - symbol: Trading pair
                - amount: OI in base currency
                - value: OI in quote currency (USDT)
        """
        ex = cls._get_exchange(exchange)
        symbol = symbol.upper()
        
        try:
            oi = ex.fetch_open_interest(symbol)
            return {
                "symbol": symbol,
                "amount": oi.get("openInterestAmount"),
                "value": oi.get("openInterestValue"),
                "timestamp": oi.get("timestamp"),
            }
        except Exception as e:
            logger.warning(f"Failed to fetch OI for {symbol}: {e}")
            return {"symbol": symbol, "amount": None, "value": None, "error": str(e)}
    
    @classmethod
    def open_interest_history(
        cls,
        symbol: str,
        interval: str = "5m",
        days: int = 7,
        exchange: str = "binance",
    ) -> pd.DataFrame:
        """Get historical open interest.
        
        Args:
            symbol: Trading pair
            interval: Time interval (5m, 15m, 1h, 4h, 1d)
            days: Number of days
            exchange: Exchange name
        
        Returns:
            DataFrame with timestamp and open interest columns
        """
        ex = cls._get_exchange(exchange)
        symbol = symbol.upper()
        
        since = int((datetime.utcnow() - timedelta(days=days)).timestamp() * 1000)
        
        try:
            history = ex.fetch_open_interest_history(symbol, interval, since=since, limit=500)
            
            if not history:
                return pd.DataFrame(columns=["timestamp", "amount", "value"])
            
            df = pd.DataFrame(history)
            df["timestamp"] = pd.to_datetime(df["timestamp"], unit="ms")
            df = df.rename(columns={
                "openInterestAmount": "amount",
                "openInterestValue": "value",
            })
            
            return df[["timestamp", "amount", "value"]]
        except Exception as e:
            logger.warning(f"Failed to fetch OI history: {e}")
            return pd.DataFrame(columns=["timestamp", "amount", "value"])
    
    @classmethod
    def long_short_ratio(
        cls,
        symbol: str,
        period: str = "5m",
        exchange: str = "binance",
    ) -> dict:
        """Get long/short account ratio.
        
        Args:
            symbol: Trading pair
            period: Time period
            exchange: Exchange name
        
        Returns:
            Dict with long/short ratio info
        """
        # Note: This requires Binance-specific API calls
        # For now, return a placeholder structure
        import requests
        
        symbol = symbol.upper()
        config = Config._get_config()
        
        url = f"https://fapi.binance.com/futures/data/globalLongShortAccountRatio"
        params = {"symbol": symbol, "period": period, "limit": 1}
        
        proxies = None
        if config.proxy:
            proxies = {"http": config.proxy, "https": config.proxy}
        
        try:
            resp = requests.get(url, params=params, proxies=proxies, timeout=config.timeout)
            resp.raise_for_status()
            data = resp.json()
            
            if data:
                latest = data[0]
                return {
                    "symbol": symbol,
                    "long_ratio": float(latest.get("longAccount", 0)),
                    "short_ratio": float(latest.get("shortAccount", 0)),
                    "long_short_ratio": float(latest.get("longShortRatio", 1)),
                    "timestamp": int(latest.get("timestamp", 0)),
                }
        except Exception as e:
            logger.warning(f"Failed to fetch L/S ratio: {e}")
        
        return {"symbol": symbol, "long_short_ratio": None, "error": "Failed to fetch"}
    
    @classmethod
    def top_trader_ratio(
        cls,
        symbol: str,
        period: str = "5m",
        exchange: str = "binance",
    ) -> dict:
        """Get top trader long/short ratio.
        
        Args:
            symbol: Trading pair
            period: Time period
            exchange: Exchange name
        
        Returns:
            Dict with top trader position ratio
        """
        import requests
        
        symbol = symbol.upper()
        config = Config._get_config()
        
        url = f"https://fapi.binance.com/futures/data/topLongShortPositionRatio"
        params = {"symbol": symbol, "period": period, "limit": 1}
        
        proxies = None
        if config.proxy:
            proxies = {"http": config.proxy, "https": config.proxy}
        
        try:
            resp = requests.get(url, params=params, proxies=proxies, timeout=config.timeout)
            resp.raise_for_status()
            data = resp.json()
            
            if data:
                latest = data[0]
                return {
                    "symbol": symbol,
                    "long_ratio": float(latest.get("longAccount", 0)),
                    "short_ratio": float(latest.get("shortAccount", 0)),
                    "long_short_ratio": float(latest.get("longShortRatio", 1)),
                    "timestamp": int(latest.get("timestamp", 0)),
                }
        except Exception as e:
            logger.warning(f"Failed to fetch top trader ratio: {e}")
        
        return {"symbol": symbol, "long_short_ratio": None, "error": "Failed to fetch"}
