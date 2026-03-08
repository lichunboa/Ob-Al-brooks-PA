"""
事件驱动架构 - WebSocket K 线监听

用途：
- 监听 K 线更新事件（5m/15m/1h）
- 触发 patrol-l1 分析
- 符合 Al Brooks "Every bar matters" 原则

架构：
- WebSocket 监听 K 线更新
- 触发机制：K 线更新 → 调用 patrol-l1
- 持仓管理定时器：独立于事件驱动，每分钟检查一次
- 断线重连 + 补齐缺失的 K 线
"""

import asyncio
import logging
from datetime import datetime
from typing import Callable, Optional
import ccxt.pro as ccxtpro

logger = logging.getLogger(__name__)


class KlineEventListener:
    """K 线事件监听器"""

    def __init__(
        self,
        exchange_id: str = "binance",
        symbols: list[str] = None,
        intervals: list[str] = None,
        on_kline_update: Optional[Callable] = None,
    ):
        """
        Args:
            exchange_id: 交易所 ID（binance/okx）
            symbols: 监听的品种列表
            intervals: 监听的周期列表（5m/15m/1h）
            on_kline_update: K 线更新回调函数
        """
        self.exchange_id = exchange_id
        self.symbols = symbols or ["BTC/USDT", "ETH/USDT", "BNB/USDT"]
        self.intervals = intervals or ["5m", "15m", "1h"]
        self.on_kline_update = on_kline_update

        self.exchange = None
        self.running = False
        self.tasks = []

        # 最后一根 K 线的时间戳（用于去重）
        self.last_kline_time = {}

    async def start(self):
        """启动监听"""
        if self.running:
            logger.warning("[KlineListener] 已经在运行中")
            return

        logger.info(f"[KlineListener] 启动 WebSocket 监听: {self.exchange_id}")
        logger.info(f"[KlineListener] 品种: {self.symbols}")
        logger.info(f"[KlineListener] 周期: {self.intervals}")

        # 创建交易所实例
        if self.exchange_id == "binance":
            self.exchange = ccxtpro.binance({
                "options": {"defaultType": "future"},
            })
        elif self.exchange_id == "okx":
            self.exchange = ccxtpro.okx({
                "options": {"defaultType": "swap"},
            })
        else:
            raise ValueError(f"不支持的交易所: {self.exchange_id}")

        self.running = True

        # 为每个品种 × 周期创建监听任务
        for symbol in self.symbols:
            for interval in self.intervals:
                task = asyncio.create_task(self._watch_kline(symbol, interval))
                self.tasks.append(task)

        logger.info(f"[KlineListener] 已启动 {len(self.tasks)} 个监听任务")

    async def stop(self):
        """停止监听"""
        if not self.running:
            return

        logger.info("[KlineListener] 停止 WebSocket 监听")
        self.running = False

        # 取消所有任务
        for task in self.tasks:
            task.cancel()

        # 等待所有任务结束
        await asyncio.gather(*self.tasks, return_exceptions=True)

        # 关闭交易所连接
        if self.exchange:
            await self.exchange.close()

        self.tasks.clear()
        logger.info("[KlineListener] 已停止")

    async def _watch_kline(self, symbol: str, interval: str):
        """监听单个品种的 K 线更新"""
        key = f"{symbol}:{interval}"
        retry_count = 0
        max_retries = 5

        while self.running:
            try:
                # 监听 K 线更新
                ohlcv = await self.exchange.watch_ohlcv(symbol, interval)

                if not ohlcv:
                    continue

                # 获取最新的 K 线
                latest = ohlcv[-1]
                timestamp = latest[0]  # 时间戳
                open_price = latest[1]
                high = latest[2]
                low = latest[3]
                close = latest[4]
                volume = latest[5]

                # 去重：只处理新的 K 线
                if key in self.last_kline_time and timestamp <= self.last_kline_time[key]:
                    continue

                self.last_kline_time[key] = timestamp

                # 构造 K 线数据
                kline_data = {
                    "symbol": symbol,
                    "interval": interval,
                    "timestamp": timestamp,
                    "datetime": datetime.fromtimestamp(timestamp / 1000).isoformat(),
                    "open": open_price,
                    "high": high,
                    "low": low,
                    "close": close,
                    "volume": volume,
                }

                logger.info(f"[KlineListener] 新 K 线: {symbol} {interval} @ {kline_data['datetime']}")

                # 调用回调函数
                if self.on_kline_update:
                    try:
                        await self.on_kline_update(kline_data)
                    except Exception as e:
                        logger.error(f"[KlineListener] 回调函数异常: {e}")

                # 重置重试计数
                retry_count = 0

            except asyncio.CancelledError:
                logger.info(f"[KlineListener] 任务取消: {key}")
                break

            except Exception as e:
                retry_count += 1
                logger.error(f"[KlineListener] 监听异常 ({retry_count}/{max_retries}): {key} | {e}")

                if retry_count >= max_retries:
                    logger.error(f"[KlineListener] 达到最大重试次数，停止监听: {key}")
                    break

                # 等待后重试
                await asyncio.sleep(5 * retry_count)

    def get_status(self) -> dict:
        """获取监听状态"""
        return {
            "running": self.running,
            "exchange": self.exchange_id,
            "symbols": self.symbols,
            "intervals": self.intervals,
            "tasks": len(self.tasks),
            "active_tasks": sum(1 for t in self.tasks if not t.done()),
        }


# 全局监听器实例
_kline_listener: Optional[KlineEventListener] = None


def get_kline_listener() -> Optional[KlineEventListener]:
    """获取全局监听器实例"""
    return _kline_listener


async def start_kline_listener(
    exchange_id: str,
    symbols: list[str],
    intervals: list[str],
    on_kline_update: Callable,
):
    """启动 K 线监听器"""
    global _kline_listener

    if _kline_listener and _kline_listener.running:
        logger.warning("[KlineListener] 监听器已在运行中")
        return

    _kline_listener = KlineEventListener(
        exchange_id=exchange_id,
        symbols=symbols,
        intervals=intervals,
        on_kline_update=on_kline_update,
    )

    await _kline_listener.start()


async def stop_kline_listener():
    """停止 K 线监听器"""
    global _kline_listener

    if _kline_listener:
        await _kline_listener.stop()
        _kline_listener = None
