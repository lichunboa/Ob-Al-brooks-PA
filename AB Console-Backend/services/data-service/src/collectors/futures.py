"""
期货指标采集器 - AB Console 专用

采集 Binance Futures 的期货指标：
1. 持仓量 (Open Interest)
2. 多空比 (Long/Short Ratio)
3. 资金费率 (Funding Rate)
4. 大户持仓比 (Top Trader Ratio)
5. 主动买卖比 (Taker Buy/Sell Ratio)

数据源：Binance Futures API
"""
import asyncio
import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# Binance Futures API 基础 URL
BINANCE_FUTURES_API = "https://fapi.binance.com"

# 支持的交易对
SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]


@dataclass
class FuturesMetrics:
    """期货指标数据"""
    symbol: str
    timestamp: float

    # 持仓量
    open_interest: float = 0.0
    open_interest_value: float = 0.0  # 美元价值

    # 多空比
    long_short_ratio: float = 1.0  # > 1 多头占优，< 1 空头占优
    long_account_pct: float = 50.0
    short_account_pct: float = 50.0

    # 资金费率
    funding_rate: float = 0.0
    next_funding_time: float = 0.0

    # 大户持仓比
    top_trader_long_ratio: float = 50.0
    top_trader_short_ratio: float = 50.0

    # 主动买卖比
    taker_buy_volume: float = 0.0
    taker_sell_volume: float = 0.0
    taker_buy_sell_ratio: float = 1.0

    def to_dict(self) -> Dict:
        return {
            "symbol": self.symbol,
            "timestamp": self.timestamp,
            "open_interest": self.open_interest,
            "open_interest_value": self.open_interest_value,
            "long_short_ratio": self.long_short_ratio,
            "long_account_pct": self.long_account_pct,
            "short_account_pct": self.short_account_pct,
            "funding_rate": self.funding_rate,
            "next_funding_time": self.next_funding_time,
            "top_trader_long_ratio": self.top_trader_long_ratio,
            "top_trader_short_ratio": self.top_trader_short_ratio,
            "taker_buy_volume": self.taker_buy_volume,
            "taker_sell_volume": self.taker_sell_volume,
            "taker_buy_sell_ratio": self.taker_buy_sell_ratio,
        }

    def get_signal_hints(self) -> List[str]:
        """获取信号提示"""
        hints = []

        # 多空比分析
        if self.long_short_ratio > 1.5:
            hints.append(f"多头拥挤 ({self.long_short_ratio:.2f})，警惕回调")
        elif self.long_short_ratio < 0.7:
            hints.append(f"空头拥挤 ({self.long_short_ratio:.2f})，警惕反弹")

        # 资金费率分析
        if self.funding_rate > 0.001:  # 0.1%
            hints.append(f"资金费率高 ({self.funding_rate*100:.3f}%)，做空成本低")
        elif self.funding_rate < -0.001:
            hints.append(f"资金费率负 ({self.funding_rate*100:.3f}%)，做多成本低")

        # 大户持仓分析
        if self.top_trader_long_ratio > 60:
            hints.append(f"大户偏多 ({self.top_trader_long_ratio:.1f}%)")
        elif self.top_trader_short_ratio > 60:
            hints.append(f"大户偏空 ({self.top_trader_short_ratio:.1f}%)")

        # 主动买卖分析
        if self.taker_buy_sell_ratio > 1.3:
            hints.append(f"主动买入强 ({self.taker_buy_sell_ratio:.2f})")
        elif self.taker_buy_sell_ratio < 0.7:
            hints.append(f"主动卖出强 ({self.taker_buy_sell_ratio:.2f})")

        return hints


class FuturesCollector:
    """期货指标采集器"""

    def __init__(self, symbols: List[str] = None):
        self.symbols = symbols or SUPPORTED_SYMBOLS
        self._cache: Dict[str, FuturesMetrics] = {}
        self._cache_ttl = 60  # 缓存 60 秒

    async def collect(self, symbol: str) -> Optional[FuturesMetrics]:
        """
        采集单个品种的期货指标

        Args:
            symbol: 交易对，如 BTCUSDT

        Returns:
            FuturesMetrics 或 None
        """
        # 检查缓存
        if symbol in self._cache:
            cached = self._cache[symbol]
            if time.time() - cached.timestamp < self._cache_ttl:
                return cached

        try:
            # 并行采集所有指标
            tasks = [
                self._get_open_interest(symbol),
                self._get_long_short_ratio(symbol),
                self._get_funding_rate(symbol),
                self._get_top_trader_ratio(symbol),
                self._get_taker_buy_sell(symbol),
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # 组装结果
            metrics = FuturesMetrics(
                symbol=symbol,
                timestamp=time.time(),
            )

            # 持仓量
            if isinstance(results[0], dict):
                metrics.open_interest = results[0].get("open_interest", 0)
                metrics.open_interest_value = results[0].get("open_interest_value", 0)

            # 多空比
            if isinstance(results[1], dict):
                metrics.long_short_ratio = results[1].get("long_short_ratio", 1.0)
                metrics.long_account_pct = results[1].get("long_account_pct", 50.0)
                metrics.short_account_pct = results[1].get("short_account_pct", 50.0)

            # 资金费率
            if isinstance(results[2], dict):
                metrics.funding_rate = results[2].get("funding_rate", 0)
                metrics.next_funding_time = results[2].get("next_funding_time", 0)

            # 大户持仓比
            if isinstance(results[3], dict):
                metrics.top_trader_long_ratio = results[3].get("long_ratio", 50.0)
                metrics.top_trader_short_ratio = results[3].get("short_ratio", 50.0)

            # 主动买卖比
            if isinstance(results[4], dict):
                metrics.taker_buy_volume = results[4].get("buy_volume", 0)
                metrics.taker_sell_volume = results[4].get("sell_volume", 0)
                metrics.taker_buy_sell_ratio = results[4].get("ratio", 1.0)

            # 更新缓存
            self._cache[symbol] = metrics
            logger.debug(f"[Futures] {symbol} 指标采集完成")

            return metrics

        except Exception as e:
            logger.error(f"[Futures] {symbol} 采集失败: {e}")
            return None

    async def collect_all(self) -> Dict[str, FuturesMetrics]:
        """采集所有品种的期货指标"""
        results = {}
        tasks = [self.collect(symbol) for symbol in self.symbols]
        metrics_list = await asyncio.gather(*tasks)

        for symbol, metrics in zip(self.symbols, metrics_list):
            if metrics:
                results[symbol] = metrics

        return results

    async def _get_open_interest(self, symbol: str) -> Dict:
        """获取持仓量"""
        url = f"{BINANCE_FUTURES_API}/fapi/v1/openInterest?symbol={symbol}"
        data = await self._fetch(url)
        if data:
            return {
                "open_interest": float(data.get("openInterest", 0)),
                "open_interest_value": 0,  # 需要乘以价格
            }
        return {}

    async def _get_long_short_ratio(self, symbol: str) -> Dict:
        """获取多空比（全市场）"""
        url = f"{BINANCE_FUTURES_API}/futures/data/globalLongShortAccountRatio?symbol={symbol}&period=5m&limit=1"
        data = await self._fetch(url)
        if data and isinstance(data, list) and len(data) > 0:
            item = data[0]
            long_pct = float(item.get("longAccount", 50))
            short_pct = float(item.get("shortAccount", 50))
            ratio = long_pct / short_pct if short_pct > 0 else 1.0
            return {
                "long_short_ratio": ratio,
                "long_account_pct": long_pct * 100,
                "short_account_pct": short_pct * 100,
            }
        return {}

    async def _get_funding_rate(self, symbol: str) -> Dict:
        """获取资金费率"""
        url = f"{BINANCE_FUTURES_API}/fapi/v1/premiumIndex?symbol={symbol}"
        data = await self._fetch(url)
        if data:
            return {
                "funding_rate": float(data.get("lastFundingRate", 0)),
                "next_funding_time": float(data.get("nextFundingTime", 0)) / 1000,
            }
        return {}

    async def _get_top_trader_ratio(self, symbol: str) -> Dict:
        """获取大户持仓比"""
        url = f"{BINANCE_FUTURES_API}/futures/data/topLongShortPositionRatio?symbol={symbol}&period=5m&limit=1"
        data = await self._fetch(url)
        if data and isinstance(data, list) and len(data) > 0:
            item = data[0]
            return {
                "long_ratio": float(item.get("longAccount", 50)) * 100,
                "short_ratio": float(item.get("shortAccount", 50)) * 100,
            }
        return {}

    async def _get_taker_buy_sell(self, symbol: str) -> Dict:
        """获取主动买卖比"""
        url = f"{BINANCE_FUTURES_API}/futures/data/takerlongshortRatio?symbol={symbol}&period=5m&limit=1"
        data = await self._fetch(url)
        if data and isinstance(data, list) and len(data) > 0:
            item = data[0]
            buy_vol = float(item.get("buyVol", 1))
            sell_vol = float(item.get("sellVol", 1))
            ratio = buy_vol / sell_vol if sell_vol > 0 else 1.0
            return {
                "buy_volume": buy_vol,
                "sell_volume": sell_vol,
                "ratio": ratio,
            }
        return {}

    async def _fetch(self, url: str) -> Optional[Dict]:
        """HTTP 请求"""
        def _request():
            req = urllib.request.Request(url, headers={"User-Agent": "AB-Console/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))

        try:
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, _request)
        except Exception as e:
            logger.warning(f"[Futures] 请求失败 {url}: {e}")
            return None


# 全局实例
_collector: Optional[FuturesCollector] = None


def get_futures_collector() -> FuturesCollector:
    """获取全局期货采集器"""
    global _collector
    if _collector is None:
        _collector = FuturesCollector()
    return _collector


async def get_futures_metrics(symbol: str) -> Optional[FuturesMetrics]:
    """获取期货指标（便捷函数）"""
    return await get_futures_collector().collect(symbol)


async def get_all_futures_metrics() -> Dict[str, FuturesMetrics]:
    """获取所有期货指标（便捷函数）"""
    return await get_futures_collector().collect_all()


__all__ = [
    "FuturesMetrics",
    "FuturesCollector",
    "get_futures_collector",
    "get_futures_metrics",
    "get_all_futures_metrics",
]
