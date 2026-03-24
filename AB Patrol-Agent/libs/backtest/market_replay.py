"""
MarketReplay — 历史数据回放器

替代 PA 引擎的 _fetch_candles() 方法，从预聚合的历史数据中
按虚拟时钟返回 K 线窗口，模拟真实市场数据源。

接口兼容:
  engine._fetch_candles(symbol, timeframe="5m", limit=50) -> list[Candle]
"""

from collections.abc import Iterator
from datetime import datetime

import pandas as pd

from .models import Candle


class MarketReplay:
    """
    历史数据回放器

    持有全部历史 1m 数据，预聚合所有时间框架。
    按虚拟时钟步进，只返回 virtual_time 之前的数据。
    """

    def __init__(self, symbols: list[str], df_1m_dict: dict[str, pd.DataFrame],
                 timeframes: list[str] = None):
        """
        Args:
            symbols: 币种列表
            df_1m_dict: {symbol: DataFrame(timestamp, open, high, low, close, volume)}
            timeframes: 需要预聚合的时间框架列表
        """
        self.symbols = symbols
        self.timeframes = timeframes or ["1m", "5m", "15m", "1h", "4h", "1d"]
        self._virtual_time: datetime = None
        self._window_cache: dict[tuple[str, str, int], list[Candle]] = {}

        # 预聚合所有时间框架
        self._data: dict[str, dict[str, pd.DataFrame]] = {}
        for symbol in symbols:
            self._data[symbol] = {}
            df = df_1m_dict.get(symbol, pd.DataFrame())
            if df.empty:
                continue
            # 确保时间排序
            df = df.sort_values("timestamp").reset_index(drop=True)
            self._data[symbol]["1m"] = df

            for tf in self.timeframes:
                if tf == "1m":
                    continue
                self._data[symbol][tf] = self._aggregate(df, tf)

        # 生成 5m 步进时间戳序列
        self._step_timestamps: list[datetime] = []
        self._build_step_timestamps()

    def _aggregate(self, df_1m: pd.DataFrame, timeframe: str) -> pd.DataFrame:
        """从 1m 聚合到目标时间框架"""
        tf_map = {"5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "4h": "4h", "1d": "1D"}
        rule = tf_map.get(timeframe)
        if not rule:
            return pd.DataFrame()

        df = df_1m.set_index("timestamp")
        resampled = df.resample(rule).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }).dropna()
        return resampled.reset_index()

    def _build_step_timestamps(self):
        """构建步进时间戳（用第一个有数据的 symbol 的 5m 时间戳）"""
        for symbol in self.symbols:
            df_5m = self._data.get(symbol, {}).get("5m", pd.DataFrame())
            if not df_5m.empty:
                self._step_timestamps = df_5m["timestamp"].tolist()
                break

    def advance_to(self, timestamp: datetime):
        """推进虚拟时钟"""
        self._virtual_time = timestamp
        self._window_cache.clear()

    @property
    def virtual_time(self) -> datetime:
        return self._virtual_time

    def get_candles(self, symbol: str, timeframe: str = "5m", limit: int = 50) -> list:
        """
        替代 engine._fetch_candles() — 返回虚拟时钟之前的 K 线

        签名与 PASignalEngine._fetch_candles 完全一致:
            _fetch_candles(symbol, timeframe="5m", limit=50) -> list[Candle]

        注意: 返回的 Candle 类型由 runner 在 monkey-patch 时确定，
              这里使用本模块的 Candle 类（与 PA 引擎的 Candle 字段完全兼容）。
        """
        if self._virtual_time is None:
            return []

        cache_key = (symbol, timeframe, int(limit))
        cached = self._window_cache.get(cache_key)
        if cached is not None:
            return cached

        df = self._data.get(symbol, {}).get(timeframe, pd.DataFrame())
        if df.empty:
            return []

        # 只取虚拟时钟之前的数据
        mask = df["timestamp"] <= self._virtual_time
        available = df[mask]
        if available.empty:
            return []

        # 取最后 limit 根
        window = available.tail(limit)

        candles = []
        for _, row in window.iterrows():
            ts = row["timestamp"]
            if hasattr(ts, "to_pydatetime"):
                ts = ts.to_pydatetime()
            candles.append(Candle(
                symbol=symbol,
                timestamp=ts,
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row.get("volume", 0)),
                timeframe=timeframe,
            ))
        self._window_cache[cache_key] = candles
        return candles

    def get_current_candle(self, symbol: str, timeframe: str = "5m"):
        """获取当前虚拟时钟对应的单根 K 线"""
        candles = self.get_candles(symbol, timeframe, limit=1)
        return candles[-1] if candles else None

    def get_daily_candles(self, symbol: str, limit: int = 50) -> list:
        """获取日线 K 线（背景分析用）"""
        return self.get_candles(symbol, "1d", limit)

    def get_h4_candles(self, symbol: str, limit: int = 50) -> list:
        """获取 4h K 线（背景分析用）"""
        return self.get_candles(symbol, "4h", limit)

    def timestamps(self, timeframe: str = "5m") -> Iterator[datetime]:
        """生成步进时间戳"""
        if timeframe == "5m":
            for ts in self._step_timestamps:
                yield ts
        else:
            for symbol in self.symbols:
                df = self._data.get(symbol, {}).get(timeframe, pd.DataFrame())
                if not df.empty:
                    for ts in df["timestamp"].tolist():
                        yield ts
                    break

    @property
    def total_steps(self) -> int:
        """总步数"""
        return len(self._step_timestamps)

    def get_candles_1m_at(self, symbol: str, timestamp: datetime, limit: int = 300) -> list:
        """获取指定时间点前 N 根 1m K 线（用于 SL/TP 检查等精细操作）"""
        df = self._data.get(symbol, {}).get("1m", pd.DataFrame())
        if df.empty:
            return []
        mask = df["timestamp"] <= timestamp
        window = df[mask].tail(limit)
        candles = []
        for _, row in window.iterrows():
            ts = row["timestamp"]
            if hasattr(ts, "to_pydatetime"):
                ts = ts.to_pydatetime()
            candles.append(Candle(
                symbol=symbol,
                timestamp=ts,
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row.get("volume", 0)),
                timeframe="1m",
            ))
        return candles
