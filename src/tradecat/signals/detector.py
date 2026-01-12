"""Signal detection engine."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import List, Optional, Dict, Any

import pandas as pd

from tradecat.data import Data
from tradecat.indicators import Indicators

logger = logging.getLogger(__name__)


class SignalLevel(str, Enum):
    """Signal strength levels."""
    STRONG = "strong"
    MEDIUM = "medium"
    WEAK = "weak"


class SignalType(str, Enum):
    """Signal types."""
    BULLISH = "bullish"
    BEARISH = "bearish"
    NEUTRAL = "neutral"


@dataclass
class Signal:
    """Trading signal."""
    name: str
    type: SignalType
    level: SignalLevel
    value: float
    threshold: Optional[float] = None
    message: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "type": self.type.value,
            "level": self.level.value,
            "value": self.value,
            "threshold": self.threshold,
            "message": self.message,
        }


class Signals:
    """Signal detection interface.
    
    Detects trading signals based on technical indicators and rules.
    
    Examples:
        >>> from tradecat import Signals
        >>> 
        >>> # Get all signals
        >>> signals = Signals.detect("BTCUSDT")
        >>> 
        >>> # Filter by type
        >>> signals = Signals.detect("BTCUSDT", types=["rsi", "macd"])
        >>> 
        >>> # Custom interval
        >>> signals = Signals.detect("BTCUSDT", interval="4h")
        >>> 
        >>> # Get signal summary
        >>> summary = Signals.summary("BTCUSDT")
    """
    
    @classmethod
    def detect(
        cls,
        symbol: str,
        interval: str = "1h",
        types: Optional[List[str]] = None,
        lookback: int = 100,
    ) -> List[Dict[str, Any]]:
        """Detect trading signals for a symbol.
        
        Args:
            symbol: Trading pair (e.g., "BTCUSDT")
            interval: Time interval (default: "1h")
            types: Signal types to detect (default: all)
                   Options: rsi, macd, bollinger, kdj, ema, volume
            lookback: Number of candles to analyze
        
        Returns:
            List of signal dictionaries with:
                - name: Signal name
                - type: "bullish", "bearish", or "neutral"
                - level: "strong", "medium", or "weak"
                - value: Current indicator value
                - message: Human-readable description
        
        Examples:
            >>> signals = Signals.detect("BTCUSDT")
            >>> for s in signals:
            ...     print(f"{s['name']}: {s['type']} ({s['level']})")
        """
        # Fetch data
        df = Data.klines(symbol, interval=interval, days=lookback // 24 + 7)
        
        if len(df) < 30:
            logger.warning(f"Insufficient data for {symbol}")
            return []
        
        # Calculate indicators
        ind = Indicators(df)
        
        signals = []
        
        # Define detectors
        detectors = {
            "rsi": cls._detect_rsi,
            "macd": cls._detect_macd,
            "bollinger": cls._detect_bollinger,
            "kdj": cls._detect_kdj,
            "ema": cls._detect_ema,
            "volume": cls._detect_volume,
        }
        
        # Filter by types if specified
        if types:
            detectors = {k: v for k, v in detectors.items() if k in types}
        
        # Run detectors
        for name, detector in detectors.items():
            try:
                detected = detector(df, ind)
                signals.extend(detected)
            except Exception as e:
                logger.warning(f"Failed to detect {name} signals: {e}")
        
        return [s.to_dict() for s in signals]
    
    @classmethod
    def _detect_rsi(cls, df: pd.DataFrame, ind: Indicators) -> List[Signal]:
        """Detect RSI signals."""
        signals = []
        rsi = ind.rsi()
        current = rsi.iloc[-1]
        
        if pd.isna(current):
            return signals
        
        if current < 30:
            level = SignalLevel.STRONG if current < 20 else SignalLevel.MEDIUM
            signals.append(Signal(
                name="RSI Oversold",
                type=SignalType.BULLISH,
                level=level,
                value=round(current, 2),
                threshold=30,
                message=f"RSI at {current:.1f} (oversold < 30)",
            ))
        elif current > 70:
            level = SignalLevel.STRONG if current > 80 else SignalLevel.MEDIUM
            signals.append(Signal(
                name="RSI Overbought",
                type=SignalType.BEARISH,
                level=level,
                value=round(current, 2),
                threshold=70,
                message=f"RSI at {current:.1f} (overbought > 70)",
            ))
        
        return signals
    
    @classmethod
    def _detect_macd(cls, df: pd.DataFrame, ind: Indicators) -> List[Signal]:
        """Detect MACD signals."""
        signals = []
        macd, signal, hist = ind.macd()
        
        if len(hist) < 2:
            return signals
        
        current_hist = hist.iloc[-1]
        prev_hist = hist.iloc[-2]
        
        if pd.isna(current_hist) or pd.isna(prev_hist):
            return signals
        
        # Golden cross (histogram turns positive)
        if prev_hist < 0 and current_hist > 0:
            signals.append(Signal(
                name="MACD Golden Cross",
                type=SignalType.BULLISH,
                level=SignalLevel.MEDIUM,
                value=round(current_hist, 4),
                message="MACD histogram crossed above zero",
            ))
        # Death cross (histogram turns negative)
        elif prev_hist > 0 and current_hist < 0:
            signals.append(Signal(
                name="MACD Death Cross",
                type=SignalType.BEARISH,
                level=SignalLevel.MEDIUM,
                value=round(current_hist, 4),
                message="MACD histogram crossed below zero",
            ))
        
        # Divergence detection (simplified)
        if len(hist) >= 5:
            hist_trend = hist.iloc[-5:].diff().mean()
            price_trend = df["close"].iloc[-5:].pct_change().mean()
            
            # Bullish divergence: price down, MACD up
            if price_trend < -0.01 and hist_trend > 0:
                signals.append(Signal(
                    name="MACD Bullish Divergence",
                    type=SignalType.BULLISH,
                    level=SignalLevel.WEAK,
                    value=round(hist_trend, 4),
                    message="Price falling but MACD rising",
                ))
            # Bearish divergence: price up, MACD down
            elif price_trend > 0.01 and hist_trend < 0:
                signals.append(Signal(
                    name="MACD Bearish Divergence",
                    type=SignalType.BEARISH,
                    level=SignalLevel.WEAK,
                    value=round(hist_trend, 4),
                    message="Price rising but MACD falling",
                ))
        
        return signals
    
    @classmethod
    def _detect_bollinger(cls, df: pd.DataFrame, ind: Indicators) -> List[Signal]:
        """Detect Bollinger Band signals."""
        signals = []
        upper, mid, lower = ind.bollinger()
        close = df["close"].iloc[-1]
        
        if pd.isna(upper.iloc[-1]):
            return signals
        
        bb_upper = upper.iloc[-1]
        bb_lower = lower.iloc[-1]
        bb_width = (bb_upper - bb_lower) / mid.iloc[-1] * 100
        
        # Price near/above upper band
        if close >= bb_upper:
            signals.append(Signal(
                name="BB Upper Touch",
                type=SignalType.BEARISH,
                level=SignalLevel.MEDIUM,
                value=round(close, 2),
                threshold=round(bb_upper, 2),
                message=f"Price at upper Bollinger Band",
            ))
        # Price near/below lower band
        elif close <= bb_lower:
            signals.append(Signal(
                name="BB Lower Touch",
                type=SignalType.BULLISH,
                level=SignalLevel.MEDIUM,
                value=round(close, 2),
                threshold=round(bb_lower, 2),
                message=f"Price at lower Bollinger Band",
            ))
        
        # Squeeze detection (narrow bands)
        if bb_width < 3:
            signals.append(Signal(
                name="BB Squeeze",
                type=SignalType.NEUTRAL,
                level=SignalLevel.WEAK,
                value=round(bb_width, 2),
                message=f"Bollinger Band squeeze ({bb_width:.1f}%), breakout imminent",
            ))
        
        return signals
    
    @classmethod
    def _detect_kdj(cls, df: pd.DataFrame, ind: Indicators) -> List[Signal]:
        """Detect KDJ signals."""
        signals = []
        k, d, j = ind.kdj()
        
        if len(k) < 2:
            return signals
        
        k_curr, d_curr, j_curr = k.iloc[-1], d.iloc[-1], j.iloc[-1]
        k_prev, d_prev = k.iloc[-2], d.iloc[-2]
        
        if pd.isna(k_curr):
            return signals
        
        # Golden cross
        if k_prev < d_prev and k_curr > d_curr and k_curr < 50:
            signals.append(Signal(
                name="KDJ Golden Cross",
                type=SignalType.BULLISH,
                level=SignalLevel.MEDIUM,
                value=round(k_curr, 2),
                message=f"K crossed above D (K={k_curr:.1f}, D={d_curr:.1f})",
            ))
        # Death cross
        elif k_prev > d_prev and k_curr < d_curr and k_curr > 50:
            signals.append(Signal(
                name="KDJ Death Cross",
                type=SignalType.BEARISH,
                level=SignalLevel.MEDIUM,
                value=round(k_curr, 2),
                message=f"K crossed below D (K={k_curr:.1f}, D={d_curr:.1f})",
            ))
        
        # Oversold/Overbought
        if j_curr < 0:
            signals.append(Signal(
                name="KDJ Oversold",
                type=SignalType.BULLISH,
                level=SignalLevel.STRONG,
                value=round(j_curr, 2),
                threshold=0,
                message=f"J value negative ({j_curr:.1f}), oversold",
            ))
        elif j_curr > 100:
            signals.append(Signal(
                name="KDJ Overbought",
                type=SignalType.BEARISH,
                level=SignalLevel.STRONG,
                value=round(j_curr, 2),
                threshold=100,
                message=f"J value above 100 ({j_curr:.1f}), overbought",
            ))
        
        return signals
    
    @classmethod
    def _detect_ema(cls, df: pd.DataFrame, ind: Indicators) -> List[Signal]:
        """Detect EMA signals."""
        signals = []
        
        ema7 = ind.ema(7)
        ema25 = ind.ema(25)
        ema99 = ind.ema(99)
        close = df["close"]
        
        if len(ema7) < 2:
            return signals
        
        ema7_curr, ema25_curr = ema7.iloc[-1], ema25.iloc[-1]
        ema7_prev, ema25_prev = ema7.iloc[-2], ema25.iloc[-2]
        
        if pd.isna(ema7_curr):
            return signals
        
        # EMA7 x EMA25 cross
        if ema7_prev < ema25_prev and ema7_curr > ema25_curr:
            signals.append(Signal(
                name="EMA Golden Cross (7x25)",
                type=SignalType.BULLISH,
                level=SignalLevel.MEDIUM,
                value=round(ema7_curr, 2),
                message="EMA7 crossed above EMA25",
            ))
        elif ema7_prev > ema25_prev and ema7_curr < ema25_curr:
            signals.append(Signal(
                name="EMA Death Cross (7x25)",
                type=SignalType.BEARISH,
                level=SignalLevel.MEDIUM,
                value=round(ema7_curr, 2),
                message="EMA7 crossed below EMA25",
            ))
        
        # Trend strength based on EMA99
        if not pd.isna(ema99.iloc[-1]):
            price = close.iloc[-1]
            ema99_val = ema99.iloc[-1]
            distance = (price - ema99_val) / ema99_val * 100
            
            if distance > 10:
                signals.append(Signal(
                    name="Extended Above EMA99",
                    type=SignalType.BEARISH,
                    level=SignalLevel.WEAK,
                    value=round(distance, 2),
                    message=f"Price {distance:.1f}% above EMA99",
                ))
            elif distance < -10:
                signals.append(Signal(
                    name="Extended Below EMA99",
                    type=SignalType.BULLISH,
                    level=SignalLevel.WEAK,
                    value=round(distance, 2),
                    message=f"Price {abs(distance):.1f}% below EMA99",
                ))
        
        return signals
    
    @classmethod
    def _detect_volume(cls, df: pd.DataFrame, ind: Indicators) -> List[Signal]:
        """Detect volume signals."""
        signals = []
        
        if "volume" not in df.columns:
            return signals
        
        volume = df["volume"]
        avg_vol = volume.rolling(20).mean()
        
        if len(avg_vol) < 1 or pd.isna(avg_vol.iloc[-1]):
            return signals
        
        current_vol = volume.iloc[-1]
        avg = avg_vol.iloc[-1]
        vol_ratio = current_vol / avg
        
        if vol_ratio > 3:
            price_change = (df["close"].iloc[-1] - df["open"].iloc[-1]) / df["open"].iloc[-1]
            sig_type = SignalType.BULLISH if price_change > 0 else SignalType.BEARISH
            signals.append(Signal(
                name="Volume Spike",
                type=sig_type,
                level=SignalLevel.STRONG,
                value=round(vol_ratio, 2),
                threshold=3.0,
                message=f"Volume {vol_ratio:.1f}x average (significant activity)",
            ))
        elif vol_ratio > 2:
            signals.append(Signal(
                name="High Volume",
                type=SignalType.NEUTRAL,
                level=SignalLevel.MEDIUM,
                value=round(vol_ratio, 2),
                threshold=2.0,
                message=f"Volume {vol_ratio:.1f}x average",
            ))
        
        return signals
    
    @classmethod
    def summary(
        cls,
        symbol: str,
        interval: str = "1h",
    ) -> Dict[str, Any]:
        """Get signal summary for a symbol.
        
        Returns:
            Dict with bullish/bearish counts and overall bias
        """
        signals = cls.detect(symbol, interval)
        
        bullish = [s for s in signals if s["type"] == "bullish"]
        bearish = [s for s in signals if s["type"] == "bearish"]
        
        bullish_score = sum(
            3 if s["level"] == "strong" else 2 if s["level"] == "medium" else 1
            for s in bullish
        )
        bearish_score = sum(
            3 if s["level"] == "strong" else 2 if s["level"] == "medium" else 1
            for s in bearish
        )
        
        if bullish_score > bearish_score * 1.5:
            bias = "bullish"
        elif bearish_score > bullish_score * 1.5:
            bias = "bearish"
        else:
            bias = "neutral"
        
        return {
            "symbol": symbol,
            "interval": interval,
            "total_signals": len(signals),
            "bullish_count": len(bullish),
            "bearish_count": len(bearish),
            "bullish_score": bullish_score,
            "bearish_score": bearish_score,
            "bias": bias,
            "signals": signals,
        }
