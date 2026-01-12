"""Additional tests for full indicator coverage."""

import pytest
import pandas as pd
import numpy as np

from tradecat.indicators import Indicators
from tradecat.indicators.technical import TALIB_AVAILABLE


class TestIndicatorsFull:
    """Test all indicator methods for full coverage."""
    
    @pytest.fixture
    def long_ohlcv(self):
        """Generate longer OHLCV data for indicators that need more history."""
        n = 200
        np.random.seed(42)
        prices = 100 * np.cumprod(1 + np.random.randn(n) * 0.01)
        
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=n, freq="1h"),
            "open": prices * 0.999,
            "high": prices * 1.005,
            "low": prices * 0.995,
            "close": prices,
            "volume": np.random.uniform(1000, 5000, n),
        })
        df["high"] = df[["open", "high", "low", "close"]].max(axis=1)
        df["low"] = df[["open", "high", "low", "close"]].min(axis=1)
        
        return df
    
    def test_wma(self, long_ohlcv):
        """Test Weighted Moving Average."""
        ind = Indicators(long_ohlcv)
        wma = ind.wma(20)
        
        assert len(wma) == len(long_ohlcv)
        assert not wma.iloc[-1] != wma.iloc[-1]  # Not NaN
    
    def test_adx(self, long_ohlcv):
        """Test Average Directional Index."""
        ind = Indicators(long_ohlcv)
        adx = ind.adx(14)
        
        assert len(adx) == len(long_ohlcv)
        # ADX should be between 0 and 100
        valid = adx.dropna()
        assert (valid >= 0).all()
        assert (valid <= 100).all()
    
    def test_cci(self, long_ohlcv):
        """Test Commodity Channel Index."""
        ind = Indicators(long_ohlcv)
        cci = ind.cci(20)
        
        assert len(cci) == len(long_ohlcv)
        # CCI can be any value, just check it's not all NaN
        assert not cci.dropna().empty
    
    def test_williams_r(self, long_ohlcv):
        """Test Williams %R."""
        ind = Indicators(long_ohlcv)
        wr = ind.williams_r(14)
        
        assert len(wr) == len(long_ohlcv)
        # Williams %R should be between -100 and 0
        valid = wr.dropna()
        assert (valid >= -100).all()
        assert (valid <= 0).all()
    
    def test_mfi(self, long_ohlcv):
        """Test Money Flow Index."""
        ind = Indicators(long_ohlcv)
        mfi = ind.mfi(14)
        
        assert len(mfi) == len(long_ohlcv)
        # MFI should be between 0 and 100
        valid = mfi.dropna()
        assert (valid >= 0).all()
        assert (valid <= 100).all()
    
    def test_keltner(self, long_ohlcv):
        """Test Keltner Channel."""
        ind = Indicators(long_ohlcv)
        upper, mid, lower = ind.keltner(20, 2.0)
        
        assert len(upper) == len(long_ohlcv)
        assert len(mid) == len(long_ohlcv)
        assert len(lower) == len(long_ohlcv)
        
        # Upper >= Mid >= Lower
        valid_idx = ~(upper.isna() | mid.isna() | lower.isna())
        assert (upper[valid_idx] >= mid[valid_idx]).all()
        assert (mid[valid_idx] >= lower[valid_idx]).all()
    
    def test_donchian(self, long_ohlcv):
        """Test Donchian Channel."""
        ind = Indicators(long_ohlcv)
        upper, mid, lower = ind.donchian(20)
        
        assert len(upper) == len(long_ohlcv)
        assert len(mid) == len(long_ohlcv)
        assert len(lower) == len(long_ohlcv)
        
        # Upper >= Mid >= Lower
        valid_idx = ~(upper.isna() | mid.isna() | lower.isna())
        assert (upper[valid_idx] >= mid[valid_idx]).all()
        assert (mid[valid_idx] >= lower[valid_idx]).all()
    
    def test_cvd(self, long_ohlcv):
        """Test Cumulative Volume Delta."""
        ind = Indicators(long_ohlcv)
        cvd = ind.cvd()
        
        assert len(cvd) == len(long_ohlcv)
        # CVD is cumulative, should not be all zeros
        assert cvd.iloc[-1] != 0 or cvd.std() > 0
    
    def test_all_with_slow(self, long_ohlcv):
        """Test all() with include_slow=True."""
        ind = Indicators(long_ohlcv)
        df = ind.all(include_slow=True)
        
        # Should have additional columns
        assert "adx" in df.columns
        assert "dc_upper" in df.columns
        assert "kc_upper" in df.columns
    
    def test_custom_price_col(self, long_ohlcv):
        """Test using custom price column."""
        df = long_ohlcv.copy()
        df["adjusted_close"] = df["close"] * 1.01
        
        ind = Indicators(df, price_col="adjusted_close")
        rsi = ind.rsi()
        
        # Should use adjusted_close for calculations
        assert len(rsi) == len(df)
    
    def test_missing_volume(self):
        """Test indicators when volume is missing."""
        df = pd.DataFrame({
            "timestamp": pd.date_range("2024-01-01", periods=50, freq="1h"),
            "close": [100 + i * 0.1 for i in range(50)],
        })
        
        ind = Indicators(df)
        
        # Should still work with zero volume
        obv = ind.obv()
        assert len(obv) == len(df)
    
    def test_series_conversion(self, long_ohlcv):
        """Test _series method."""
        ind = Indicators(long_ohlcv)
        arr = np.array([1.0, 2.0, 3.0])
        
        # Create a short indicator instance to test
        short_df = long_ohlcv.head(3).copy()
        short_ind = Indicators(short_df)
        series = short_ind._series(arr)
        
        assert isinstance(series, pd.Series)
        assert len(series) == 3


class TestIndicatorsPurePython:
    """Test pure Python implementations (when TA-Lib not available)."""
    
    @pytest.fixture
    def sample_data(self):
        """Generate sample data."""
        n = 100
        np.random.seed(123)
        prices = 100 * np.cumprod(1 + np.random.randn(n) * 0.01)
        
        return pd.DataFrame({
            "close": prices,
            "high": prices * 1.01,
            "low": prices * 0.99,
            "open": prices * 0.995,
            "volume": np.random.uniform(1000, 5000, n),
        })
    
    def test_rsi_pure_python(self, sample_data):
        """Test RSI pure Python implementation."""
        # Force pure Python by temporarily hiding TA-Lib
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            rsi = ind.rsi(14)
            
            valid = rsi.dropna()
            assert len(valid) > 0
            assert (valid >= 0).all()
            assert (valid <= 100).all()
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_macd_pure_python(self, sample_data):
        """Test MACD pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            macd, signal, hist = ind.macd()
            
            assert len(macd) == len(sample_data)
            assert len(signal) == len(sample_data)
            assert len(hist) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_bollinger_pure_python(self, sample_data):
        """Test Bollinger Bands pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            upper, mid, lower = ind.bollinger()
            
            valid_idx = ~(upper.isna() | mid.isna() | lower.isna())
            assert (upper[valid_idx] >= mid[valid_idx]).all()
            assert (mid[valid_idx] >= lower[valid_idx]).all()
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_atr_pure_python(self, sample_data):
        """Test ATR pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            atr = ind.atr(14)
            
            valid = atr.dropna()
            assert (valid >= 0).all()
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_adx_pure_python(self, sample_data):
        """Test ADX pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            adx = ind.adx(14)
            
            # ADX might have many NaN at start
            assert len(adx) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_kdj_pure_python(self, sample_data):
        """Test KDJ pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            k, d, j = ind.kdj()
            
            assert len(k) == len(sample_data)
            assert len(d) == len(sample_data)
            assert len(j) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_cci_pure_python(self, sample_data):
        """Test CCI pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            cci = ind.cci(20)
            
            assert len(cci) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_williams_r_pure_python(self, sample_data):
        """Test Williams %R pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            wr = ind.williams_r(14)
            
            valid = wr.dropna()
            assert (valid >= -100).all()
            assert (valid <= 0).all()
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_mfi_pure_python(self, sample_data):
        """Test MFI pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            mfi = ind.mfi(14)
            
            assert len(mfi) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_obv_pure_python(self, sample_data):
        """Test OBV pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            obv = ind.obv()
            
            assert len(obv) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_sma_pure_python(self, sample_data):
        """Test SMA pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            sma = ind.sma(20)
            
            assert len(sma) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_ema_pure_python(self, sample_data):
        """Test EMA pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            ema = ind.ema(20)
            
            assert len(ema) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
    
    def test_wma_pure_python(self, sample_data):
        """Test WMA pure Python implementation."""
        import tradecat.indicators.technical as tech
        original = tech.TALIB_AVAILABLE
        tech.TALIB_AVAILABLE = False
        
        try:
            ind = Indicators(sample_data)
            wma = ind.wma(20)
            
            assert len(wma) == len(sample_data)
        finally:
            tech.TALIB_AVAILABLE = original
