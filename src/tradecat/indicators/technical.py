"""Technical indicator calculations."""

from __future__ import annotations

import logging
from typing import Optional, Tuple, Union

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

# Try to import TA-Lib (optional)
try:
    import talib
    TALIB_AVAILABLE = True
except ImportError:
    TALIB_AVAILABLE = False
    logger.debug("TA-Lib not available, using pure Python implementations")


class Indicators:
    """Technical indicators calculator.
    
    Supports 38+ indicators with optional TA-Lib acceleration.
    Falls back to pure Python implementations if TA-Lib is not installed.
    
    Args:
        df: DataFrame with OHLCV data
        price_col: Column name for close price (default: "close")
    
    Examples:
        >>> from tradecat import Data, Indicators
        >>> 
        >>> df = Data.klines("BTCUSDT", "1h", days=30)
        >>> ind = Indicators(df)
        >>> 
        >>> # Trend indicators
        >>> df["ema7"] = ind.ema(7)
        >>> df["ema25"] = ind.ema(25)
        >>> df["sma20"] = ind.sma(20)
        >>> 
        >>> # Momentum indicators
        >>> df["rsi"] = ind.rsi()
        >>> df["macd"], df["signal"], df["hist"] = ind.macd()
        >>> df["k"], df["d"], df["j"] = ind.kdj()
        >>> 
        >>> # Volatility indicators
        >>> df["atr"] = ind.atr()
        >>> df["bb_u"], df["bb_m"], df["bb_l"] = ind.bollinger()
        >>> 
        >>> # Volume indicators
        >>> df["obv"] = ind.obv()
        >>> df["vwap"] = ind.vwap()
        >>> 
        >>> # Get all at once
        >>> df_all = ind.all()
    """
    
    def __init__(
        self,
        df: pd.DataFrame,
        price_col: str = "close",
    ):
        self.df = df.copy()
        self._price_col = price_col
        
        # Extract arrays
        self.close = df[price_col].values.astype(float)
        self.high = df.get("high", df[price_col]).values.astype(float)
        self.low = df.get("low", df[price_col]).values.astype(float)
        self.open = df.get("open", df[price_col]).values.astype(float)
        self.volume = df.get("volume", pd.Series([0.0] * len(df))).values.astype(float)
        
        self._index = df.index
    
    def _series(self, arr: np.ndarray) -> pd.Series:
        """Convert numpy array to pandas Series with original index."""
        return pd.Series(arr, index=self._index)
    
    # ==================== Trend Indicators ====================
    
    def sma(self, period: int = 20) -> pd.Series:
        """Simple Moving Average."""
        if TALIB_AVAILABLE:
            return self._series(talib.SMA(self.close, period))
        return pd.Series(self.close, index=self._index).rolling(period).mean()
    
    def ema(self, period: int = 20) -> pd.Series:
        """Exponential Moving Average."""
        if TALIB_AVAILABLE:
            return self._series(talib.EMA(self.close, period))
        return pd.Series(self.close, index=self._index).ewm(span=period, adjust=False).mean()
    
    def wma(self, period: int = 20) -> pd.Series:
        """Weighted Moving Average."""
        if TALIB_AVAILABLE:
            return self._series(talib.WMA(self.close, period))
        weights = np.arange(1, period + 1)
        return pd.Series(self.close, index=self._index).rolling(period).apply(
            lambda x: np.dot(x, weights) / weights.sum(), raw=True
        )
    
    def macd(
        self,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """MACD (Moving Average Convergence Divergence).
        
        Returns:
            Tuple of (macd_line, signal_line, histogram)
        """
        if TALIB_AVAILABLE:
            macd, sig, hist = talib.MACD(self.close, fast, slow, signal)
            return self._series(macd), self._series(sig), self._series(hist)
        
        close = pd.Series(self.close, index=self._index)
        ema_fast = close.ewm(span=fast, adjust=False).mean()
        ema_slow = close.ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        
        return macd_line, signal_line, histogram
    
    def adx(self, period: int = 14) -> pd.Series:
        """Average Directional Index."""
        if TALIB_AVAILABLE:
            return self._series(talib.ADX(self.high, self.low, self.close, period))
        
        # Pure Python implementation
        high = pd.Series(self.high, index=self._index)
        low = pd.Series(self.low, index=self._index)
        close = pd.Series(self.close, index=self._index)
        
        plus_dm = high.diff()
        minus_dm = low.diff().abs()
        
        plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
        minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
        
        tr = pd.concat([
            high - low,
            (high - close.shift()).abs(),
            (low - close.shift()).abs()
        ], axis=1).max(axis=1)
        
        atr = tr.rolling(period).mean()
        plus_di = 100 * (plus_dm.rolling(period).mean() / atr)
        minus_di = 100 * (minus_dm.rolling(period).mean() / atr)
        
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
        adx = dx.rolling(period).mean()
        
        return adx
    
    # ==================== Momentum Indicators ====================
    
    def rsi(self, period: int = 14) -> pd.Series:
        """Relative Strength Index."""
        if TALIB_AVAILABLE:
            return self._series(talib.RSI(self.close, period))
        
        close = pd.Series(self.close, index=self._index)
        delta = close.diff()
        
        gain = delta.where(delta > 0, 0).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
        
        rs = gain / loss.replace(0, np.nan)
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
    
    def kdj(
        self,
        k_period: int = 9,
        d_period: int = 3,
        j_period: int = 3,
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """KDJ (Stochastic Oscillator variant).
        
        Returns:
            Tuple of (K, D, J)
        """
        if TALIB_AVAILABLE:
            k, d = talib.STOCH(
                self.high, self.low, self.close,
                fastk_period=k_period,
                slowk_period=d_period,
                slowd_period=j_period,
            )
            k, d = self._series(k), self._series(d)
        else:
            high = pd.Series(self.high, index=self._index)
            low = pd.Series(self.low, index=self._index)
            close = pd.Series(self.close, index=self._index)
            
            lowest_low = low.rolling(k_period).min()
            highest_high = high.rolling(k_period).max()
            
            rsv = 100 * (close - lowest_low) / (highest_high - lowest_low)
            k = rsv.ewm(com=d_period - 1, adjust=False).mean()
            d = k.ewm(com=j_period - 1, adjust=False).mean()
        
        j = 3 * k - 2 * d
        return k, d, j
    
    def cci(self, period: int = 20) -> pd.Series:
        """Commodity Channel Index."""
        if TALIB_AVAILABLE:
            return self._series(talib.CCI(self.high, self.low, self.close, period))
        
        tp = (pd.Series(self.high) + pd.Series(self.low) + pd.Series(self.close)) / 3
        tp = pd.Series(tp.values, index=self._index)
        sma = tp.rolling(period).mean()
        mad = tp.rolling(period).apply(lambda x: np.abs(x - x.mean()).mean(), raw=True)
        
        return (tp - sma) / (0.015 * mad)
    
    def williams_r(self, period: int = 14) -> pd.Series:
        """Williams %R."""
        if TALIB_AVAILABLE:
            return self._series(talib.WILLR(self.high, self.low, self.close, period))
        
        high = pd.Series(self.high, index=self._index)
        low = pd.Series(self.low, index=self._index)
        close = pd.Series(self.close, index=self._index)
        
        highest = high.rolling(period).max()
        lowest = low.rolling(period).min()
        
        return -100 * (highest - close) / (highest - lowest)
    
    def mfi(self, period: int = 14) -> pd.Series:
        """Money Flow Index."""
        if TALIB_AVAILABLE:
            return self._series(talib.MFI(self.high, self.low, self.close, self.volume, period))
        
        tp = (pd.Series(self.high) + pd.Series(self.low) + pd.Series(self.close)) / 3
        mf = tp * pd.Series(self.volume)
        
        tp_diff = tp.diff()
        pos_mf = mf.where(tp_diff > 0, 0).rolling(period).sum()
        neg_mf = mf.where(tp_diff < 0, 0).rolling(period).sum()
        
        mfi = 100 - (100 / (1 + pos_mf / neg_mf.replace(0, np.nan)))
        return pd.Series(mfi.values, index=self._index)
    
    # ==================== Volatility Indicators ====================
    
    def atr(self, period: int = 14) -> pd.Series:
        """Average True Range."""
        if TALIB_AVAILABLE:
            return self._series(talib.ATR(self.high, self.low, self.close, period))
        
        high = pd.Series(self.high, index=self._index)
        low = pd.Series(self.low, index=self._index)
        close = pd.Series(self.close, index=self._index)
        
        tr1 = high - low
        tr2 = (high - close.shift()).abs()
        tr3 = (low - close.shift()).abs()
        
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        return tr.rolling(period).mean()
    
    def bollinger(
        self,
        period: int = 20,
        std_dev: float = 2.0,
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """Bollinger Bands.
        
        Returns:
            Tuple of (upper_band, middle_band, lower_band)
        """
        if TALIB_AVAILABLE:
            upper, mid, lower = talib.BBANDS(self.close, period, std_dev, std_dev)
            return self._series(upper), self._series(mid), self._series(lower)
        
        close = pd.Series(self.close, index=self._index)
        mid = close.rolling(period).mean()
        std = close.rolling(period).std()
        
        upper = mid + std_dev * std
        lower = mid - std_dev * std
        
        return upper, mid, lower
    
    def keltner(
        self,
        period: int = 20,
        atr_mult: float = 2.0,
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """Keltner Channel.
        
        Returns:
            Tuple of (upper, middle, lower)
        """
        mid = self.ema(period)
        atr = self.atr(period)
        
        upper = mid + atr_mult * atr
        lower = mid - atr_mult * atr
        
        return upper, mid, lower
    
    def donchian(
        self,
        period: int = 20,
    ) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """Donchian Channel.
        
        Returns:
            Tuple of (upper, middle, lower)
        """
        high = pd.Series(self.high, index=self._index)
        low = pd.Series(self.low, index=self._index)
        
        upper = high.rolling(period).max()
        lower = low.rolling(period).min()
        mid = (upper + lower) / 2
        
        return upper, mid, lower
    
    # ==================== Volume Indicators ====================
    
    def obv(self) -> pd.Series:
        """On-Balance Volume."""
        if TALIB_AVAILABLE:
            return self._series(talib.OBV(self.close, self.volume))
        
        close = pd.Series(self.close, index=self._index)
        volume = pd.Series(self.volume, index=self._index)
        
        direction = np.sign(close.diff())
        return (direction * volume).cumsum()
    
    def vwap(self) -> pd.Series:
        """Volume Weighted Average Price."""
        tp = (pd.Series(self.high) + pd.Series(self.low) + pd.Series(self.close)) / 3
        volume = pd.Series(self.volume)
        
        vwap = (tp * volume).cumsum() / volume.cumsum()
        return pd.Series(vwap.values, index=self._index)
    
    def cvd(self) -> pd.Series:
        """Cumulative Volume Delta (approximation).
        
        Note: True CVD requires tick data. This is an approximation
        based on candle close position within the range.
        """
        high = pd.Series(self.high)
        low = pd.Series(self.low)
        close = pd.Series(self.close)
        volume = pd.Series(self.volume)
        
        # Estimate buy/sell volume based on close position
        range_pct = (close - low) / (high - low).replace(0, np.nan)
        range_pct = range_pct.fillna(0.5)
        
        buy_vol = volume * range_pct
        sell_vol = volume * (1 - range_pct)
        
        delta = buy_vol - sell_vol
        return pd.Series(delta.cumsum().values, index=self._index)
    
    # ==================== Composite ====================
    
    def all(self, include_slow: bool = False) -> pd.DataFrame:
        """Calculate all common indicators.
        
        Args:
            include_slow: Include computationally expensive indicators
        
        Returns:
            DataFrame with original data plus all indicators
        """
        df = self.df.copy()
        
        # Trend
        df["sma_20"] = self.sma(20)
        df["ema_7"] = self.ema(7)
        df["ema_25"] = self.ema(25)
        df["ema_99"] = self.ema(99)
        
        # MACD
        df["macd"], df["macd_signal"], df["macd_hist"] = self.macd()
        
        # Momentum
        df["rsi"] = self.rsi()
        df["k"], df["d"], df["j"] = self.kdj()
        df["mfi"] = self.mfi()
        df["cci"] = self.cci()
        df["williams_r"] = self.williams_r()
        
        # Volatility
        df["atr"] = self.atr()
        df["bb_upper"], df["bb_mid"], df["bb_lower"] = self.bollinger()
        
        # Volume
        df["obv"] = self.obv()
        df["vwap"] = self.vwap()
        df["cvd"] = self.cvd()
        
        if include_slow:
            df["adx"] = self.adx()
            dc_u, dc_m, dc_l = self.donchian()
            df["dc_upper"], df["dc_mid"], df["dc_lower"] = dc_u, dc_m, dc_l
            kc_u, kc_m, kc_l = self.keltner()
            df["kc_upper"], df["kc_mid"], df["kc_lower"] = kc_u, kc_m, kc_l
        
        return df
    
    @staticmethod
    def available() -> list:
        """List all available indicators."""
        return [
            "sma", "ema", "wma", "macd", "adx",
            "rsi", "kdj", "cci", "williams_r", "mfi",
            "atr", "bollinger", "keltner", "donchian",
            "obv", "vwap", "cvd",
        ]
