"""Additional tests for klines module."""

import pytest
import pandas as pd
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

from tradecat.data.klines import Data, _get_ccxt
from tradecat._internal.config import _config, Config


class TestDataKlines:
    """Test Data.klines functionality."""
    
    def setup_method(self):
        """Clear cache before each test."""
        Data._exchange_cache.clear()
        _config.proxy = None
        _config.api_key = None
        _config.api_secret = None
    
    def test_get_ccxt_import_error(self):
        """Test error when ccxt not available."""
        with patch.dict("sys.modules", {"ccxt": None}):
            # Clear the cached import
            import tradecat.data.klines as klines_module
            original_ccxt = getattr(klines_module, "_ccxt", None)
            klines_module._ccxt = None
            
            try:
                with pytest.raises(ImportError, match="ccxt is required"):
                    _get_ccxt()
            finally:
                klines_module._ccxt = original_ccxt
    
    def test_get_exchange_unknown(self):
        """Test error with unknown exchange."""
        with patch("tradecat.data.klines._get_ccxt") as mock_ccxt:
            mock_ccxt_module = MagicMock()
            mock_ccxt_module.unknown_exchange = None
            delattr(mock_ccxt_module, "unknown_exchange") if hasattr(mock_ccxt_module, "unknown_exchange") else None
            mock_ccxt.return_value = mock_ccxt_module
            
            with pytest.raises(ValueError, match="Unknown exchange"):
                Data._get_exchange("unknown_exchange")
    
    def test_get_exchange_with_credentials(self):
        """Test exchange creation with API credentials."""
        _config.api_key = "test_key"
        _config.api_secret = "test_secret"
        Data._exchange_cache.clear()
        
        with patch("tradecat.data.klines._get_ccxt") as mock_get_ccxt:
            mock_ccxt = MagicMock()
            mock_exchange_class = MagicMock()
            mock_ccxt.binance = mock_exchange_class
            mock_get_ccxt.return_value = mock_ccxt
            
            Data._get_exchange("binance")
            
            call_args = mock_exchange_class.call_args[0][0]
            assert call_args["apiKey"] == "test_key"
            assert call_args["secret"] == "test_secret"
    
    def test_get_exchange_with_proxy(self):
        """Test exchange creation with proxy."""
        _config.proxy = "http://127.0.0.1:7890"
        Data._exchange_cache.clear()
        
        with patch("tradecat.data.klines._get_ccxt") as mock_get_ccxt:
            mock_ccxt = MagicMock()
            mock_exchange_class = MagicMock()
            mock_ccxt.binance = mock_exchange_class
            mock_get_ccxt.return_value = mock_ccxt
            
            Data._get_exchange("binance")
            
            call_args = mock_exchange_class.call_args[0][0]
            assert "proxies" in call_args
    
    def test_get_exchange_cached(self):
        """Test exchange caching."""
        mock_exchange = MagicMock()
        Data._exchange_cache["binance"] = mock_exchange
        
        result = Data._get_exchange("binance")
        
        assert result is mock_exchange
    
    def test_klines_normalize_symbol(self):
        """Test symbol normalization."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ohlcv.return_value = [
            [1704067200000, 100, 105, 95, 102, 1000],
        ]
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            # Without USDT suffix
            df = Data.klines("BTC", interval="1h", days=1)
            
            # Should have called with BTCUSDT
            call_args = mock_exchange.fetch_ohlcv.call_args
            assert "BTCUSDT" in call_args[0][0]
    
    def test_klines_custom_time_range(self):
        """Test klines with custom start/end."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ohlcv.return_value = [
            [1704067200000, 100, 105, 95, 102, 1000],
        ]
        
        start = datetime(2024, 1, 1)
        end = datetime(2024, 1, 15)
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            df = Data.klines("BTCUSDT", interval="1d", start=start, end=end)
            
            assert len(df) > 0
    
    def test_klines_empty_response(self):
        """Test klines with empty response."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ohlcv.return_value = []
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            df = Data.klines("BTCUSDT", interval="1h", days=1)
            
            assert len(df) == 0
            assert "close" in df.columns
    
    def test_klines_fetch_error(self):
        """Test klines with fetch error."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ohlcv.side_effect = Exception("API Error")
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            with pytest.raises(ValueError, match="Failed to fetch data"):
                Data.klines("BTCUSDT", interval="1h", days=1)
    
    def test_klines_with_limit(self):
        """Test klines with explicit limit."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ohlcv.return_value = [
            [1704067200000, 100, 105, 95, 102, 1000],
        ] * 50
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            df = Data.klines("BTCUSDT", interval="1h", days=1, limit=50)
            
            # Verify limit was passed
            call_args = mock_exchange.fetch_ohlcv.call_args
            assert call_args[0][3] == 50  # limit is 4th positional arg
    
    def test_klines_local_no_sqlalchemy(self):
        """Test local source without sqlalchemy installed."""
        Config.set_database("postgresql://test")
        
        with patch.dict("sys.modules", {"sqlalchemy": None}):
            with pytest.raises(ImportError, match="sqlalchemy is required"):
                Data._klines_from_db("BTCUSDT", "1h", 7, None, None)
    
    def test_klines_local_with_db(self):
        """Test local source with database."""
        Config.set_database("postgresql://test")
        
        mock_df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=10, freq="1h"),
            "symbol": ["BTCUSDT"] * 10,
            "open": [100] * 10,
            "high": [105] * 10,
            "low": [95] * 10,
            "close": [102] * 10,
            "volume": [1000] * 10,
        })
        
        with patch("sqlalchemy.create_engine") as mock_create:
            mock_engine = MagicMock()
            mock_create.return_value = mock_engine
            with patch("pandas.read_sql", return_value=mock_df):
                df = Data._klines_from_db("BTCUSDT", "1h", 7, None, None)
                
                assert len(df) == 10
                assert "symbol" not in df.columns  # Should be dropped for single symbol
    
    def test_klines_local_multiple_symbols(self):
        """Test local source with multiple symbols."""
        Config.set_database("postgresql://test")
        
        mock_df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=10, freq="1h"),
            "symbol": ["BTCUSDT", "ETHUSDT"] * 5,
            "open": [100] * 10,
            "high": [105] * 10,
            "low": [95] * 10,
            "close": [102] * 10,
            "volume": [1000] * 10,
        })
        
        with patch("sqlalchemy.create_engine"):
            with patch("pandas.read_sql", return_value=mock_df):
                df = Data._klines_from_db(["BTCUSDT", "ETHUSDT"], "1h", 7, None, None)
                
                assert "symbol" in df.columns  # Should keep symbol column
    
    def test_symbols_list(self):
        """Test getting symbols list."""
        mock_exchange = MagicMock()
        mock_exchange.markets = {
            "BTC/USDT": {"active": True},
            "ETH/USDT": {"active": True},
            "XRP/USDT": {"active": False},
            "BTC/BTC": {"active": True},
        }
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            symbols = Data.symbols()
            
            assert "BTC/USDT" in symbols
            assert "ETH/USDT" in symbols
            assert "XRP/USDT" not in symbols  # inactive
            assert "BTC/BTC" not in symbols  # wrong quote
    
    def test_symbols_load_markets(self):
        """Test symbols loads markets if not loaded."""
        mock_exchange = MagicMock()
        mock_exchange.markets = None
        mock_exchange.load_markets.return_value = {"BTC/USDT": {"active": True}}
        
        # After load_markets, markets should be set
        def set_markets():
            mock_exchange.markets = {"BTC/USDT": {"active": True}}
        mock_exchange.load_markets.side_effect = set_markets
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            symbols = Data.symbols()
            
            mock_exchange.load_markets.assert_called_once()
    
    def test_ticker(self):
        """Test getting ticker."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ticker.return_value = {
            "last": 42000,
            "open": 41500,
            "high": 42500,
            "low": 41000,
            "baseVolume": 10000,
            "quoteVolume": 420000000,
            "change": 500,
            "percentage": 1.2,
            "timestamp": 1704067200000,
        }
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            ticker = Data.ticker("BTCUSDT")
            
            assert ticker["symbol"] == "BTCUSDT"
            assert ticker["price"] == 42000
            assert ticker["change_percent"] == 1.2
    
    def test_interval_to_minutes_all(self):
        """Test all interval conversions."""
        assert Data._interval_to_minutes("1m") == 1
        assert Data._interval_to_minutes("3m") == 3
        assert Data._interval_to_minutes("5m") == 5
        assert Data._interval_to_minutes("15m") == 15
        assert Data._interval_to_minutes("30m") == 30
        assert Data._interval_to_minutes("1h") == 60
        assert Data._interval_to_minutes("2h") == 120
        assert Data._interval_to_minutes("4h") == 240
        assert Data._interval_to_minutes("6h") == 360
        assert Data._interval_to_minutes("8h") == 480
        assert Data._interval_to_minutes("12h") == 720
        assert Data._interval_to_minutes("1d") == 1440
        assert Data._interval_to_minutes("3d") == 4320
        assert Data._interval_to_minutes("1w") == 10080
        assert Data._interval_to_minutes("1M") == 43200
        assert Data._interval_to_minutes("unknown") == 60  # default
