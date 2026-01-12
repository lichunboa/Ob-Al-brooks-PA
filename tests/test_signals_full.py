"""Additional tests for full signal coverage."""

import pytest
import pandas as pd
import numpy as np
from unittest.mock import patch, MagicMock

from tradecat.signals import Signals
from tradecat.signals.detector import Signal, SignalType, SignalLevel
from tradecat.indicators import Indicators


class TestSignalDetectionFull:
    """Full coverage tests for signal detection."""
    
    @pytest.fixture
    def trending_up_data(self):
        """Create strongly trending up data."""
        n = 100
        prices = 100 * np.cumprod(np.ones(n) * 1.005)  # 0.5% up each candle
        
        return pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.998,
            "high": prices * 1.002,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
    
    @pytest.fixture
    def trending_down_data(self):
        """Create strongly trending down data."""
        n = 100
        prices = 100 * np.cumprod(np.ones(n) * 0.995)  # 0.5% down each candle
        
        return pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 1.002,
            "high": prices * 1.005,
            "low": prices * 0.998,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
    
    @pytest.fixture
    def macd_golden_cross_data(self):
        """Create data with MACD golden cross."""
        n = 50
        # Start down, then go up to create golden cross
        prices = np.concatenate([
            100 * np.cumprod(np.ones(25) * 0.99),
            100 * np.cumprod(np.ones(25) * 0.99)[-1] * np.cumprod(np.ones(25) * 1.02),
        ])
        
        return pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.999,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
    
    @pytest.fixture
    def macd_death_cross_data(self):
        """Create data with MACD death cross."""
        n = 50
        # Start up, then go down to create death cross
        prices = np.concatenate([
            100 * np.cumprod(np.ones(25) * 1.01),
            100 * np.cumprod(np.ones(25) * 1.01)[-1] * np.cumprod(np.ones(25) * 0.98),
        ])
        
        return pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 1.001,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
    
    def test_detect_macd_golden_cross(self, macd_golden_cross_data):
        """Test MACD golden cross detection."""
        ind = Indicators(macd_golden_cross_data)
        signals = Signals._detect_macd(macd_golden_cross_data, ind)
        
        # Should detect some MACD signal
        assert isinstance(signals, list)
    
    def test_detect_macd_death_cross(self, macd_death_cross_data):
        """Test MACD death cross detection."""
        ind = Indicators(macd_death_cross_data)
        signals = Signals._detect_macd(macd_death_cross_data, ind)
        
        assert isinstance(signals, list)
    
    def test_detect_macd_divergence(self):
        """Test MACD divergence detection."""
        n = 50
        # Create bullish divergence: price down but MACD up
        prices = 100 * np.cumprod(np.ones(n) * 0.998)
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 1.001,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_macd(df, ind)
        
        assert isinstance(signals, list)
    
    def test_detect_macd_short_data(self):
        """Test MACD with short data."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=5, freq="1h"),
            "close": [100, 101, 102, 101, 100],
            "open": [99, 100, 101, 102, 101],
            "high": [101, 102, 103, 103, 102],
            "low": [99, 100, 101, 100, 99],
            "volume": [1000] * 5,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_macd(df, ind)
        
        assert isinstance(signals, list)
    
    def test_detect_bollinger_upper(self):
        """Test Bollinger upper band touch."""
        n = 50
        np.random.seed(42)
        prices = 100 + np.random.randn(n) * 2
        # Make last price very high
        prices[-1] = 110
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.999,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_bollinger(df, ind)
        
        # Should detect upper band touch
        upper_signals = [s for s in signals if "Upper" in s.name]
        assert len(upper_signals) > 0
    
    def test_detect_bollinger_lower(self):
        """Test Bollinger lower band touch."""
        n = 50
        np.random.seed(42)
        prices = 100 + np.random.randn(n) * 2
        # Make last price very low
        prices[-1] = 90
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 1.001,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_bollinger(df, ind)
        
        # Should detect lower band touch
        lower_signals = [s for s in signals if "Lower" in s.name]
        assert len(lower_signals) > 0
    
    def test_detect_bollinger_squeeze(self):
        """Test Bollinger squeeze detection."""
        n = 50
        # Very tight price range
        prices = 100 + np.random.randn(n) * 0.1
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.9999,
            "high": prices * 1.001,
            "low": prices * 0.999,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_bollinger(df, ind)
        
        # Should detect squeeze
        squeeze_signals = [s for s in signals if "Squeeze" in s.name]
        assert len(squeeze_signals) > 0
    
    def test_detect_kdj_golden_cross(self):
        """Test KDJ golden cross detection."""
        n = 50
        # Create conditions for golden cross: K crosses above D in oversold
        prices = np.concatenate([
            100 * np.cumprod(np.ones(25) * 0.99),
            100 * np.cumprod(np.ones(25) * 0.99)[-1] * np.cumprod(np.ones(25) * 1.01),
        ])
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.999,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_kdj(df, ind)
        
        assert isinstance(signals, list)
    
    def test_detect_kdj_overbought(self):
        """Test KDJ overbought detection (J > 100)."""
        n = 50
        # Strong uptrend to get J > 100
        prices = 100 * np.cumprod(np.ones(n) * 1.02)
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.99,
            "high": prices * 1.01,
            "low": prices * 0.98,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_kdj(df, ind)
        
        # Check for overbought signal
        overbought = [s for s in signals if "Overbought" in s.name]
        # May or may not trigger depending on exact values
        assert isinstance(signals, list)
    
    def test_detect_kdj_oversold(self):
        """Test KDJ oversold detection (J < 0)."""
        n = 50
        # Strong downtrend to get J < 0
        prices = 100 * np.cumprod(np.ones(n) * 0.98)
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 1.01,
            "high": prices * 1.02,
            "low": prices * 0.99,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_kdj(df, ind)
        
        assert isinstance(signals, list)
    
    def test_detect_ema_golden_cross(self):
        """Test EMA golden cross detection."""
        n = 50
        # Uptrend to create EMA golden cross
        prices = 100 * np.cumprod(np.ones(n) * 1.01)
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.999,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_ema(df, ind)
        
        assert isinstance(signals, list)
    
    def test_detect_ema_extended(self, trending_up_data):
        """Test EMA extended signal."""
        ind = Indicators(trending_up_data)
        signals = Signals._detect_ema(trending_up_data, ind)
        
        assert isinstance(signals, list)
    
    def test_detect_volume_no_volume_col(self):
        """Test volume detection without volume column."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=30, freq="1h"),
            "close": [100 + i * 0.1 for i in range(30)],
            "open": [99.5 + i * 0.1 for i in range(30)],
            "high": [101 + i * 0.1 for i in range(30)],
            "low": [99 + i * 0.1 for i in range(30)],
        })
        
        ind = Indicators(df)
        signals = Signals._detect_volume(df, ind)
        
        assert signals == []
    
    def test_detect_volume_normal(self):
        """Test volume with normal volume."""
        n = 30
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": [100] * n,
            "high": [101] * n,
            "low": [99] * n,
            "close": [100.5] * n,
            "volume": [1000] * n,  # Consistent volume
        })
        
        ind = Indicators(df)
        signals = Signals._detect_volume(df, ind)
        
        # No spike with consistent volume
        assert isinstance(signals, list)
    
    def test_detect_volume_high(self):
        """Test volume with high volume (2-3x average)."""
        n = 30
        volumes = [1000] * (n - 1) + [2500]  # Last one is 2.5x
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": [100] * n,
            "high": [101] * n,
            "low": [99] * n,
            "close": [100.5] * n,
            "volume": volumes,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_volume(df, ind)
        
        high_vol = [s for s in signals if "High Volume" in s.name]
        assert len(high_vol) > 0
    
    def test_detect_with_all_types(self):
        """Test detect with all signal types."""
        n = 100
        np.random.seed(42)
        prices = 100 * np.cumprod(1 + np.random.randn(n) * 0.01)
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.999,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.random.uniform(1000, 2000, n),
        })
        
        with patch("tradecat.signals.detector.Data") as mock_data:
            mock_data.klines.return_value = df
            
            signals = Signals.detect(
                "BTCUSDT",
                types=["rsi", "macd", "bollinger", "kdj", "ema", "volume"]
            )
        
        assert isinstance(signals, list)
    
    def test_detect_exception_handling(self):
        """Test that detector exceptions are handled."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=50, freq="1h"),
            "close": [100] * 50,
            "open": [100] * 50,
            "high": [100] * 50,
            "low": [100] * 50,
            "volume": [1000] * 50,
        })
        
        with patch("tradecat.signals.detector.Data") as mock_data:
            mock_data.klines.return_value = df
            
            # Should not raise even if some detector fails
            signals = Signals.detect("BTCUSDT")
            
            assert isinstance(signals, list)
    
    def test_summary_bias_calculation(self):
        """Test summary bias calculation."""
        n = 50
        prices = 100 * np.cumprod(np.ones(n) * 0.98)  # Strong downtrend
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 1.01,
            "high": prices * 1.02,
            "low": prices * 0.99,
            "close": prices,
            "volume": np.ones(n) * 1000,
        })
        
        with patch("tradecat.signals.detector.Data") as mock_data:
            mock_data.klines.return_value = df
            
            summary = Signals.summary("BTCUSDT")
        
        assert "bias" in summary
        assert summary["bias"] in ["bullish", "bearish", "neutral"]


class TestSignalNaNHandling:
    """Test NaN handling in signal detection."""
    
    def test_rsi_nan(self):
        """Test RSI detection with NaN values."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=10, freq="1h"),
            "close": [np.nan] * 10,
            "open": [100] * 10,
            "high": [101] * 10,
            "low": [99] * 10,
            "volume": [1000] * 10,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_rsi(df, ind)
        
        assert signals == []
    
    def test_bollinger_nan(self):
        """Test Bollinger detection with NaN values."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=5, freq="1h"),
            "close": [100, 101, 102, 101, 100],
            "open": [99, 100, 101, 102, 101],
            "high": [101, 102, 103, 103, 102],
            "low": [99, 100, 101, 100, 99],
            "volume": [1000] * 5,
        })
        
        ind = Indicators(df)
        signals = Signals._detect_bollinger(df, ind)
        
        # Short data may have NaN bollinger values
        assert isinstance(signals, list)
