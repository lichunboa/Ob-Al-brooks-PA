"""Global configuration management."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class _Config:
    """Global configuration singleton."""
    
    database_url: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    proxy: Optional[str] = None
    default_exchange: str = "binance"
    timeout: int = 30
    rate_limit: bool = True
    _initialized: bool = field(default=False, repr=False)
    
    def _load_from_env(self) -> None:
        """Load configuration from environment variables."""
        if self._initialized:
            return
        
        self.database_url = os.environ.get("TRADECAT_DATABASE_URL") or os.environ.get("DATABASE_URL")
        self.api_key = os.environ.get("TRADECAT_API_KEY") or os.environ.get("BINANCE_API_KEY")
        self.api_secret = os.environ.get("TRADECAT_API_SECRET") or os.environ.get("BINANCE_API_SECRET")
        self.proxy = os.environ.get("TRADECAT_PROXY") or os.environ.get("HTTP_PROXY")
        self._initialized = True


_config = _Config()


class Config:
    """Configuration interface for TradeCat.
    
    Examples:
        >>> from tradecat import Config
        >>> 
        >>> # Set database for local data
        >>> Config.set_database("postgresql://localhost:5434/market_data")
        >>> 
        >>> # Set API credentials
        >>> Config.set_credentials(api_key="xxx", api_secret="yyy")
        >>> 
        >>> # Set proxy
        >>> Config.set_proxy("http://127.0.0.1:7890")
        >>> 
        >>> # View current config
        >>> print(Config.get_all())
    """
    
    @classmethod
    def set_database(cls, url: str) -> None:
        """Set database URL for local data source.
        
        Args:
            url: PostgreSQL connection string
                 e.g., "postgresql://user:pass@localhost:5434/market_data"
        """
        _config.database_url = url
    
    @classmethod
    def set_credentials(
        cls,
        api_key: Optional[str] = None,
        api_secret: Optional[str] = None,
    ) -> None:
        """Set API credentials for exchange access.
        
        Args:
            api_key: Exchange API key
            api_secret: Exchange API secret
        """
        if api_key:
            _config.api_key = api_key
        if api_secret:
            _config.api_secret = api_secret
    
    @classmethod
    def set_proxy(cls, proxy: str) -> None:
        """Set HTTP proxy for network requests.
        
        Args:
            proxy: Proxy URL, e.g., "http://127.0.0.1:7890"
        """
        _config.proxy = proxy
    
    @classmethod
    def set_exchange(cls, exchange: str) -> None:
        """Set default exchange.
        
        Args:
            exchange: Exchange name (binance, okx, bybit, etc.)
        """
        _config.default_exchange = exchange.lower()
    
    @classmethod
    def set_timeout(cls, timeout: int) -> None:
        """Set request timeout in seconds."""
        _config.timeout = timeout
    
    @classmethod
    def get_all(cls) -> dict:
        """Get all configuration values."""
        _config._load_from_env()
        return {
            "database_url": _config.database_url,
            "api_key": "***" if _config.api_key else None,
            "api_secret": "***" if _config.api_secret else None,
            "proxy": _config.proxy,
            "default_exchange": _config.default_exchange,
            "timeout": _config.timeout,
            "rate_limit": _config.rate_limit,
        }
    
    @classmethod
    def _get_config(cls) -> _Config:
        """Internal: get config object."""
        _config._load_from_env()
        return _config
