"""
成交量指标采集器 - AB Console 专用

采集 Binance 的成交量相关指标：
1. 实时成交量 (Volume)
2. 成交量变化率 (Volume Change)
3. 买卖成交量比 (Buy/Sell Volume Ratio)
4. 大单成交量 (Large Order Volume)
5. 成交量异常检测 (Volume Spike Detection)

数据源：Binance API
"""
import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# Binance API 基础 URL
BINANCE_API = "https://api.binance.com"
BINANCE_FUTURES_API = "https://fapi.binance.com"

# 支持的交易对
SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]

# 成交量异常阈值
VOLUME_SPIKE_THRESHOLD = 2.0  # 当前成交量 > 平均成交量 * 2 视为异常


@dataclass
class VolumeMetrics:
    """成交量指标数据"""
    symbol: str
    timestamp: float
    timeframe: str = "5m"

    # 基础成交量
    volume: float = 0.0  # 成交量（币）
    quote_volume: float = 0.0  # 成交额（USDT）
    trade_count: int = 0  # 成交笔数

    # 买卖成交量
    taker_buy_volume: float = 0.0  # 主动买入量
    taker_sell_volume: float = 0.0  # 主动卖出量
    buy_sell_ratio: float = 1.0  # 买卖比

    # 成交量变化
    volume_change_pct: float = 0.0  # 成交量变化率
    avg_volume_20: float = 0.0  # 20 周期平均成交量

    # 异常检测
    is_volume_spike: bool = False  # 是否成交量异常
    spike_ratio: float = 1.0  # 异常倍数

    # 大单统计（期货）
    large_buy_volume: float = 0.0  # 大单买入量
    large_sell_volume: float = 0.0  # 大单卖出量

    def to_dict(self) -> Dict:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "timeframe": self.timeframe,
            "volume": self.volume,
            "quote_volume": self.quote_volume,
            "trade_count": self.trade_count,
            "taker_buy_volume": self.taker_buy_volume,
            "taker_sell_volume": self.taker_sell_volume,
            "buy_sell_ratio": self.buy_sell_ratio,
            "volume_change_pct": self.volume_change_pct,
            "avg_volume_20": self.avg_volume_20,
            "is_volume_spike": self.is_volume_spike,
            "spike_ratio": self.spike_ratio,
            "large_buy_volume": self.large_buy_volume,
            "large_sell_volume": self.large_sell_volume,
        }

    def get_signal_hints(self) -> List[str]:
        """获取信号提示"""
        hints = []

        # 成交量异常
        if self.is_volume_spike:
            hints.append(f"成交量异常 ({self.spike_ratio:.1f}x)，关注突破")

        # 买卖比分析
        if self.buy_sell_ratio > 1.5:
            hints.append(f"主动买入强势 ({self.buy_sell_ratio:.2f})，多头占优")
        elif self.buy_sell_ratio < 0.67:
            hints.append(f"主动卖出强势 ({self.buy_sell_ratio:.2f})，空头占优")

        # 成交量变化
        if self.volume_change_pct > 50:
            hints.append(f"成交量放大 (+{self.volume_change_pct:.0f}%)，趋势可能加速")
        elif self.volume_change_pct < -50:
            hints.append(f"成交量萎缩 ({self.volume_change_pct:.0f}%)，趋势可能减弱")

        # 大单分析
        if self.large_buy_volume > 0 and self.large_sell_volume > 0:
            large_ratio = self.large_buy_volume / self.large_sell_volume if self.large_sell_volume > 0 else 1.0
            if large_ratio > 1.5:
                hints.append(f"大单买入占优 ({large_ratio:.2f}x)")
            elif large_ratio < 0.67:
                hints.append(f"大单卖出占优 ({1/large_ratio:.2f}x)")

        return hints


class VolumeCollector:
    """成交量指标采集器"""

    def __init__(self, symbols: List[str] = None):
        self.symbols = symbols or SUPPORTED_SYMBOLS
        self._cache: Dict[str, Dict[str, VolumeMetrics]] = {}  # {symbol: {timeframe: metrics}}
        self._cache_ttl = 30  # 缓存 30 秒

    async def collect(
        self,
        symbol: str,
        timeframe: str = "5m",
    ) -> Optional[VolumeMetrics]:
        """
        采集单个品种的成交量指标

        Args:
            symbol: 交易对，如 BTCUSDT
            timeframe: 时间周期，如 1m, 5m, 15m, 1h

        Returns:
            VolumeMetrics 或 None
        """
        # 检查缓存
        cache_key = f"{symbol}_{timeframe}"
        if symbol in self._cache and timeframe in self._cache[symbol]:
            cached = self._cache[symbol][timeframe]
            if time.time() - cached.timestamp < self._cache_ttl:
                return cached

        try:
            # 获取 K 线数据（包含成交量）
            klines = await self._get_klines(symbol, timeframe, limit=21)
            if not klines or len(klines) < 2:
                return None

            # 最新 K 线
            latest = klines[-1]
            # 前 20 根 K 线用于计算平均值
            prev_klines = klines[:-1]

            # 解析最新 K 线
            # [open_time, open, high, low, close, volume, close_time, quote_volume, trades, taker_buy_base, taker_buy_quote, ignore]
            volume = float(latest[5])
            quote_volume = float(latest[7])
            trade_count = int(latest[8])
            taker_buy_volume = float(latest[9])
            taker_sell_volume = volume - taker_buy_volume

            # 计算买卖比
            buy_sell_ratio = taker_buy_volume / taker_sell_volume if taker_sell_volume > 0 else 1.0

            # 计算 20 周期平均成交量
            avg_volume_20 = sum(float(k[5]) for k in prev_klines) / len(prev_klines) if prev_klines else volume

            # 计算成交量变化率
            prev_volume = float(prev_klines[-1][5]) if prev_klines else volume
            volume_change_pct = ((volume - prev_volume) / prev_volume * 100) if prev_volume > 0 else 0

            # 异常检测
            spike_ratio = volume / avg_volume_20 if avg_volume_20 > 0 else 1.0
            is_volume_spike = spike_ratio >= VOLUME_SPIKE_THRESHOLD

            # 组装结果
            metrics = VolumeMetrics(
                symbol=symbol,
                timestamp=time.time(),
                timeframe=timeframe,
                volume=volume,
                quote_volume=quote_volume,
                trade_count=trade_count,
                taker_buy_volume=taker_buy_volume,
                taker_sell_volume=taker_sell_volume,
                buy_sell_ratio=buy_sell_ratio,
                volume_change_pct=volume_change_pct,
                avg_volume_20=avg_volume_20,
                is_volume_spike=is_volume_spike,
                spike_ratio=spike_ratio,
            )

            # 尝试获取大单数据（期货）
            large_orders = await self._get_large_orders(symbol)
            if large_orders:
                metrics.large_buy_volume = large_orders.get("buy", 0)
                metrics.large_sell_volume = large_orders.get("sell", 0)

            # 更新缓存
            if symbol not in self._cache:
                self._cache[symbol] = {}
            self._cache[symbol][timeframe] = metrics
            logger.debug(f"[Volume] {symbol}/{timeframe} 指标采集完成")

            return metrics

        except Exception as e:
            logger.error(f"[Volume] {symbol}/{timeframe} 采集失败: {e}")
            return None

    async def collect_all(self, timeframe: str = "5m") -> Dict[str, VolumeMetrics]:
        """采集所有品种的成交量指标"""
        results = {}
        tasks = [self.collect(symbol, timeframe) for symbol in self.symbols]
        metrics_list = await asyncio.gather(*tasks)

        for symbol, metrics in zip(self.symbols, metrics_list):
            if metrics:
                results[symbol] = metrics

        return results

    async def detect_volume_spikes(self, timeframe: str = "5m") -> List[Tuple[str, VolumeMetrics]]:
        """检测所有品种的成交量异常"""
        all_metrics = await self.collect_all(timeframe)
        spikes = []

        for symbol, metrics in all_metrics.items():
            if metrics.is_volume_spike:
                spikes.append((symbol, metrics))

        # 按异常倍数排序
        spikes.sort(key=lambda x: x[1].spike_ratio, reverse=True)
        return spikes

    async def _get_klines(
        self,
        symbol: str,
        timeframe: str,
        limit: int = 21,
    ) -> Optional[List]:
        """获取 K 线数据"""
        url = f"{BINANCE_API}/api/v3/klines?symbol={symbol}&interval={timeframe}&limit={limit}"
        return await self._fetch(url)

    async def _get_large_orders(self, symbol: str) -> Optional[Dict]:
        """
        获取大单数据（期货）

        注意：Binance 没有直接的大单 API，这里使用 takerlongshortRatio 近似
        """
        url = f"{BINANCE_FUTURES_API}/futures/data/takerlongshortRatio?symbol={symbol}&period=5m&limit=1"
        data = await self._fetch(url)
        if data and isinstance(data, list) and len(data) > 0:
            item = data[0]
            buy_vol = float(item.get("buyVol", 0))
            sell_vol = float(item.get("sellVol", 0))
            return {
                "buy": buy_vol,
                "sell": sell_vol,
            }
        return None

    async def _fetch(self, url: str) -> Optional[any]:
        """HTTP 请求"""
        def _request():
            req = urllib.request.Request(url, headers={"User-Agent": "AB-Console/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _request)
        except Exception as e:
            logger.warning(f"[Volume] 请求失败 {url}: {e}")
            return None


# 全局实例
_collector: Optional[VolumeCollector] = None


def get_volume_collector() -> VolumeCollector:
    """获取全局成交量采集器"""
    global _collector
    if _collector is None:
        _collector = VolumeCollector()
    return _collector


async def get_volume_metrics(symbol: str, timeframe: str = "5m") -> Optional[VolumeMetrics]:
    """获取成交量指标（便捷函数）"""
    return await get_volume_collector().collect(symbol, timeframe)


async def get_all_volume_metrics(timeframe: str = "5m") -> Dict[str, VolumeMetrics]:
    """获取所有成交量指标（便捷函数）"""
    return await get_volume_collector().collect_all(timeframe)


async def detect_volume_spikes(timeframe: str = "5m") -> List[Tuple[str, VolumeMetrics]]:
    """检测成交量异常（便捷函数）"""
    return await get_volume_collector().detect_volume_spikes(timeframe)


__all__ = [
    "VolumeMetrics",
    "VolumeCollector",
    "get_volume_collector",
    "get_volume_metrics",
    "get_all_volume_metrics",
    "detect_volume_spikes",
]
