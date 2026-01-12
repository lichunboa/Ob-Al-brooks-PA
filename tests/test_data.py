"""Tests for data module."""

import pytest
import pandas as pd
from unittest.mock import MagicMock, patch

from tradecat.data import Data


class TestData:
    """Test data fetching functionality."""
    
    def test_intervals_defined(self):
        """Test that INTERVALS constant is defined."""
        assert hasattr(Data, "INTERVALS")
        assert "1m" in Data.INTERVALS
        assert "1h" in Data.INTERVALS
        assert "1d" in Data.INTERVALS
    
    def test_invalid_interval(self):
        """Test that invalid interval raises ValueError."""
        with pytest.raises(ValueError, match="Invalid interval"):
            Data.klines("BTCUSDT", interval="invalid")
    
    def test_interval_to_minutes(self):
        """Test interval to minutes conversion."""
        assert Data._interval_to_minutes("1m") == 1
        assert Data._interval_to_minutes("5m") == 5
        assert Data._interval_to_minutes("1h") == 60
        assert Data._interval_to_minutes("4h") == 240
        assert Data._interval_to_minutes("1d") == 1440
    
    @patch("tradecat.data.klines._get_ccxt")
    def test_klines_mock(self, mock_ccxt):
        """Test klines with mocked exchange."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ohlcv.return_value = [
            [1704067200000, 42000, 42500, 41800, 42300, 1000],
            [1704070800000, 42300, 42600, 42100, 42400, 1200],
        ]
        mock_ccxt.return_value = mock_exchange
        
        # Clear cache
        Data._exchange_cache.clear()
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            df = Data.klines("BTCUSDT", interval="1h", days=1)
        
        assert len(df) == 2
        assert "close" in df.columns
        assert "volume" in df.columns
    
    def test_klines_local_no_db(self):
        """Test that local source raises error without database config."""
        with pytest.raises(ValueError, match="Database not configured"):
            Data.klines("BTCUSDT", source="local")
    
    @pytest.mark.integration
    def test_klines_real_api(self):
        """Test real API call (requires network)."""
        df = Data.klines("BTCUSDT", interval="1h", days=1)
        
        assert len(df) > 0
        assert "close" in df.columns
        assert "open" in df.columns
        assert "high" in df.columns
        assert "low" in df.columns
        assert "volume" in df.columns
    
    @pytest.mark.integration
    def test_symbols_real_api(self):
        """Test getting symbols list (requires network)."""
        symbols = Data.symbols()
        
        assert len(symbols) > 0
        # ccxt returns symbols in format "BTC/USDT" or "BTCUSDT"
        btc_found = any("BTC" in s and "USDT" in s for s in symbols)
        eth_found = any("ETH" in s and "USDT" in s for s in symbols)
        assert btc_found
        assert eth_found
    
    @pytest.mark.integration  
    def test_ticker_real_api(self):
        """Test getting ticker data (requires network)."""
        ticker = Data.ticker("BTCUSDT")
        
        assert "symbol" in ticker
        assert "price" in ticker
        assert ticker["symbol"] == "BTCUSDT"


class TestDataMultiSymbol:
    """Test multi-symbol data fetching."""
    
    @patch("tradecat.data.klines._get_ccxt")
    def test_klines_multiple_symbols(self, mock_ccxt):
        """Test fetching multiple symbols."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_ohlcv.return_value = [
            [1704067200000, 100, 105, 95, 102, 1000],
        ]
        
        Data._exchange_cache.clear()
        
        with patch.object(Data, "_get_exchange", return_value=mock_exchange):
            df = Data.klines(["BTCUSDT", "ETHUSDT"], interval="1h", days=1)
        
        # Should have symbol column
        assert "symbol" in df.columns
        assert set(df["symbol"].unique()) == {"BTCUSDT", "ETHUSDT"}
