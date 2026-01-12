"""Tests for futures data module."""

import pytest
import pandas as pd
from unittest.mock import patch, MagicMock

from tradecat.data.futures import Futures
from tradecat._internal.config import _config


class TestFutures:
    """Test futures data functionality."""
    
    def setup_method(self):
        """Clear exchange cache before each test."""
        Futures._exchange_cache.clear()
        _config.proxy = None
    
    def test_funding_rate_mock(self):
        """Test funding rate with mocked exchange."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_funding_rate.return_value = {
            "fundingRate": 0.0001,
            "fundingTimestamp": 1704067200000,
            "markPrice": 42000.0,
            "indexPrice": 41990.0,
        }
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            result = Futures.funding_rate("BTCUSDT")
        
        assert result["symbol"] == "BTCUSDT"
        assert result["rate"] == 0.0001
        assert result["mark_price"] == 42000.0
    
    def test_funding_rate_error(self):
        """Test funding rate when API fails."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_funding_rate.side_effect = Exception("API Error")
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            result = Futures.funding_rate("BTCUSDT")
        
        assert result["symbol"] == "BTCUSDT"
        assert result["rate"] is None
        assert "error" in result
    
    def test_funding_rate_history_mock(self):
        """Test funding rate history."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_funding_rate_history.return_value = [
            {"timestamp": 1704067200000, "fundingRate": 0.0001},
            {"timestamp": 1704096000000, "fundingRate": 0.00015},
        ]
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            df = Futures.funding_rate_history("BTCUSDT", days=7)
        
        assert len(df) == 2
        assert "timestamp" in df.columns
        assert "rate" in df.columns
    
    def test_funding_rate_history_empty(self):
        """Test funding rate history with no data."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_funding_rate_history.return_value = []
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            df = Futures.funding_rate_history("BTCUSDT", days=7)
        
        assert len(df) == 0
    
    def test_funding_rate_history_error(self):
        """Test funding rate history when API fails."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_funding_rate_history.side_effect = Exception("API Error")
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            df = Futures.funding_rate_history("BTCUSDT", days=7)
        
        assert len(df) == 0
    
    def test_open_interest_mock(self):
        """Test open interest."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_open_interest.return_value = {
            "openInterestAmount": 10000,
            "openInterestValue": 420000000,
            "timestamp": 1704067200000,
        }
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            result = Futures.open_interest("BTCUSDT")
        
        assert result["symbol"] == "BTCUSDT"
        assert result["amount"] == 10000
        assert result["value"] == 420000000
    
    def test_open_interest_error(self):
        """Test open interest when API fails."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_open_interest.side_effect = Exception("API Error")
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            result = Futures.open_interest("BTCUSDT")
        
        assert result["symbol"] == "BTCUSDT"
        assert result["amount"] is None
        assert "error" in result
    
    def test_open_interest_history_mock(self):
        """Test open interest history."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_open_interest_history.return_value = [
            {"timestamp": 1704067200000, "openInterestAmount": 10000, "openInterestValue": 420000000},
            {"timestamp": 1704070800000, "openInterestAmount": 10500, "openInterestValue": 441000000},
        ]
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            df = Futures.open_interest_history("BTCUSDT", interval="1h", days=1)
        
        assert len(df) == 2
        assert "amount" in df.columns
        assert "value" in df.columns
    
    def test_open_interest_history_empty(self):
        """Test OI history with no data."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_open_interest_history.return_value = []
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            df = Futures.open_interest_history("BTCUSDT", days=1)
        
        assert len(df) == 0
    
    def test_open_interest_history_error(self):
        """Test OI history when API fails."""
        mock_exchange = MagicMock()
        mock_exchange.fetch_open_interest_history.side_effect = Exception("API Error")
        
        with patch.object(Futures, "_get_exchange", return_value=mock_exchange):
            df = Futures.open_interest_history("BTCUSDT", days=1)
        
        assert len(df) == 0
    
    def test_long_short_ratio_mock(self):
        """Test long/short ratio."""
        mock_response = MagicMock()
        mock_response.json.return_value = [{
            "longAccount": "0.6",
            "shortAccount": "0.4",
            "longShortRatio": "1.5",
            "timestamp": 1704067200000,
        }]
        mock_response.raise_for_status = MagicMock()
        
        with patch("requests.get", return_value=mock_response):
            result = Futures.long_short_ratio("BTCUSDT")
        
        assert result["symbol"] == "BTCUSDT"
        assert result["long_ratio"] == 0.6
        assert result["short_ratio"] == 0.4
        assert result["long_short_ratio"] == 1.5
    
    def test_long_short_ratio_empty(self):
        """Test L/S ratio with empty response."""
        mock_response = MagicMock()
        mock_response.json.return_value = []
        mock_response.raise_for_status = MagicMock()
        
        with patch("requests.get", return_value=mock_response):
            result = Futures.long_short_ratio("BTCUSDT")
        
        assert result["long_short_ratio"] is None
    
    def test_long_short_ratio_error(self):
        """Test L/S ratio when API fails."""
        with patch("requests.get", side_effect=Exception("Network error")):
            result = Futures.long_short_ratio("BTCUSDT")
        
        assert result["long_short_ratio"] is None
        assert "error" in result
    
    def test_top_trader_ratio_mock(self):
        """Test top trader ratio."""
        mock_response = MagicMock()
        mock_response.json.return_value = [{
            "longAccount": "0.55",
            "shortAccount": "0.45",
            "longShortRatio": "1.22",
            "timestamp": 1704067200000,
        }]
        mock_response.raise_for_status = MagicMock()
        
        with patch("requests.get", return_value=mock_response):
            result = Futures.top_trader_ratio("BTCUSDT")
        
        assert result["symbol"] == "BTCUSDT"
        assert result["long_short_ratio"] == 1.22
    
    def test_top_trader_ratio_error(self):
        """Test top trader ratio when API fails."""
        with patch("requests.get", side_effect=Exception("Error")):
            result = Futures.top_trader_ratio("BTCUSDT")
        
        assert result["long_short_ratio"] is None
    
    def test_get_exchange_with_proxy(self):
        """Test exchange creation with proxy."""
        _config.proxy = "http://127.0.0.1:7890"
        Futures._exchange_cache.clear()
        
        with patch("ccxt.binance") as mock_binance:
            mock_exchange = MagicMock()
            mock_binance.return_value = mock_exchange
            
            Futures._get_exchange("binance")
            
            # Verify proxy was passed
            call_args = mock_binance.call_args[0][0]
            assert "proxies" in call_args
    
    def test_get_exchange_cached(self):
        """Test exchange caching."""
        mock_exchange = MagicMock()
        Futures._exchange_cache["binance"] = mock_exchange
        
        result = Futures._get_exchange("binance")
        
        assert result is mock_exchange
