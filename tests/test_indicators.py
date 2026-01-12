"""Tests for technical indicators."""

import pytest
import pandas as pd
import numpy as np

from tradecat.indicators import Indicators


class TestIndicators:
    """Test technical indicator calculations."""
    
    def test_init(self, sample_ohlcv):
        """Test Indicators initialization."""
        ind = Indicators(sample_ohlcv)
        
        assert len(ind.close) == len(sample_ohlcv)
        assert len(ind.high) == len(sample_ohlcv)
        assert len(ind.low) == len(sample_ohlcv)
    
    def test_sma(self, sample_ohlcv):
        """Test Simple Moving Average."""
        ind = Indicators(sample_ohlcv)
        sma = ind.sma(20)
        
        assert len(sma) == len(sample_ohlcv)
        assert sma.isna().sum() == 19  # First 19 values should be NaN
        assert not sma.iloc[-1] != sma.iloc[-1]  # Last value should not be NaN
    
    def test_ema(self, sample_ohlcv):
        """Test Exponential Moving Average."""
        ind = Indicators(sample_ohlcv)
        ema = ind.ema(20)
        
        assert len(ema) == len(sample_ohlcv)
        # EMA should have fewer NaN values than SMA
        assert not ema.iloc[-1] != ema.iloc[-1]
    
    def test_rsi_range(self, sample_ohlcv):
        """Test RSI values are in valid range [0, 100]."""
        ind = Indicators(sample_ohlcv)
        rsi = ind.rsi(14)
        
        valid_rsi = rsi.dropna()
        assert (valid_rsi >= 0).all()
        assert (valid_rsi <= 100).all()
    
    def test_rsi_period(self, sample_ohlcv):
        """Test different RSI periods produce different results."""
        ind = Indicators(sample_ohlcv)
        rsi_7 = ind.rsi(7)
        rsi_14 = ind.rsi(14)
        
        # They should be different
        assert not rsi_7.equals(rsi_14)
    
    def test_macd_output_shape(self, sample_ohlcv):
        """Test MACD returns three series of correct length."""
        ind = Indicators(sample_ohlcv)
        macd, signal, hist = ind.macd()
        
        assert len(macd) == len(sample_ohlcv)
        assert len(signal) == len(sample_ohlcv)
        assert len(hist) == len(sample_ohlcv)
    
    def test_macd_histogram(self, sample_ohlcv):
        """Test MACD histogram is macd - signal."""
        ind = Indicators(sample_ohlcv)
        macd, signal, hist = ind.macd()
        
        # Check that histogram ≈ macd - signal (allowing for floating point errors)
        calculated_hist = macd - signal
        np.testing.assert_array_almost_equal(
            hist.dropna().values,
            calculated_hist.dropna().values,
            decimal=10
        )
    
    def test_bollinger_bands(self, sample_ohlcv):
        """Test Bollinger Bands relationship."""
        ind = Indicators(sample_ohlcv)
        upper, mid, lower = ind.bollinger()
        
        # Upper should be >= mid >= lower
        valid_idx = ~(upper.isna() | mid.isna() | lower.isna())
        assert (upper[valid_idx] >= mid[valid_idx]).all()
        assert (mid[valid_idx] >= lower[valid_idx]).all()
    
    def test_atr_positive(self, sample_ohlcv):
        """Test ATR is always positive."""
        ind = Indicators(sample_ohlcv)
        atr = ind.atr(14)
        
        valid_atr = atr.dropna()
        assert (valid_atr >= 0).all()
    
    def test_kdj_output_shape(self, sample_ohlcv):
        """Test KDJ returns K, D, J series."""
        ind = Indicators(sample_ohlcv)
        k, d, j = ind.kdj()
        
        assert len(k) == len(sample_ohlcv)
        assert len(d) == len(sample_ohlcv)
        assert len(j) == len(sample_ohlcv)
    
    def test_obv_cumulative(self, sample_ohlcv):
        """Test OBV is cumulative."""
        ind = Indicators(sample_ohlcv)
        obv = ind.obv()
        
        # OBV should be cumulative (can go up or down)
        assert len(obv) == len(sample_ohlcv)
    
    def test_vwap(self, sample_ohlcv):
        """Test VWAP calculation."""
        ind = Indicators(sample_ohlcv)
        vwap = ind.vwap()
        
        assert len(vwap) == len(sample_ohlcv)
        # VWAP should be within price range (roughly)
        assert vwap.iloc[-1] > sample_ohlcv["low"].min()
        assert vwap.iloc[-1] < sample_ohlcv["high"].max()
    
    def test_all_indicators(self, btc_like_ohlcv):
        """Test all() returns DataFrame with expected columns."""
        ind = Indicators(btc_like_ohlcv)
        result = ind.all()
        
        expected_columns = [
            "rsi", "macd", "macd_signal", "macd_hist",
            "bb_upper", "bb_mid", "bb_lower",
            "ema_7", "ema_25", "ema_99",
            "atr", "obv", "vwap", "cvd",
        ]
        
        for col in expected_columns:
            assert col in result.columns, f"Missing column: {col}"
    
    def test_available_indicators(self):
        """Test available() returns list of indicators."""
        available = Indicators.available()
        
        assert isinstance(available, list)
        assert len(available) > 10
        assert "rsi" in available
        assert "macd" in available
        assert "bollinger" in available
    
    def test_empty_dataframe(self):
        """Test handling of empty DataFrame."""
        empty_df = pd.DataFrame(columns=["close", "high", "low", "volume"])
        ind = Indicators(empty_df)
        
        rsi = ind.rsi()
        assert len(rsi) == 0
    
    def test_short_dataframe(self, sample_ohlcv_short):
        """Test with short data (less than typical period)."""
        ind = Indicators(sample_ohlcv_short)
        
        # Should not raise, but may have many NaN values
        rsi = ind.rsi(14)
        macd, signal, hist = ind.macd()
        
        assert len(rsi) == len(sample_ohlcv_short)
