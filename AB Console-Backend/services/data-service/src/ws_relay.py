"""WebSocket 中继服务器

将币安实时数据中继给前端客户端，实现毫秒级图表更新。

功能：
1. 接收来自 WSCollector 的 K 线数据
2. 通过 WebSocket 推送给订阅的客户端
3. 支持多客户端、多品种订阅

端口：8082（与健康检查 8081 分开）
"""
from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)

# 全局中继实例
_relay: Optional["WebSocketRelay"] = None
_relay_lock = threading.Lock()


@dataclass
class ClientConnection:
    """客户端连接"""
    writer: asyncio.StreamWriter
    subscriptions: Set[str] = field(default_factory=set)
    connected_at: float = field(default_factory=time.time)
    messages_sent: int = 0


class WebSocketRelay:
    """WebSocket 中继服务器

    简化实现：使用原生 asyncio 而不是 websockets 库，减少依赖。
    协议：简单的 JSON 行协议（每行一个 JSON 消息）
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 8085):
        self.host = host
        self.port = port
        self._clients: Dict[str, ClientConnection] = {}
        self._clients_lock = asyncio.Lock()
        self._server: Optional[asyncio.Server] = None
        self._running = False
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self.stats = {
            "total_connections": 0,
            "total_messages": 0,
            "active_clients": 0,
        }

    async def _handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        """处理客户端连接"""
        addr = writer.get_extra_info("peername")
        client_id = f"{addr[0]}:{addr[1]}" if addr else f"unknown_{time.time()}"

        logger.info("客户端连接: %s", client_id)
        self.stats["total_connections"] += 1

        client = ClientConnection(writer=writer)

        async with self._clients_lock:
            self._clients[client_id] = client
            self.stats["active_clients"] = len(self._clients)

        try:
            # 发送欢迎消息
            await self._send_json(writer, {
                "type": "connected",
                "client_id": client_id,
                "ts": datetime.now(timezone.utc).isoformat(),
            })

            # 读取客户端消息
            while self._running:
                try:
                    line = await asyncio.wait_for(
                        reader.readline(), timeout=60.0
                    )
                    if not line:
                        break

                    await self._handle_message(client_id, client, line.decode().strip())

                except asyncio.TimeoutError:
                    # 发送心跳
                    await self._send_json(writer, {"type": "ping"})
                except Exception as e:
                    logger.warning("读取消息错误 %s: %s", client_id, e)
                    break

        except Exception as e:
            logger.error("客户端处理错误 %s: %s", client_id, e)
        finally:
            async with self._clients_lock:
                self._clients.pop(client_id, None)
                self.stats["active_clients"] = len(self._clients)

            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

            logger.info("客户端断开: %s", client_id)

    async def _handle_message(
        self, client_id: str, client: ClientConnection, message: str
    ) -> None:
        """处理客户端消息"""
        if not message:
            return

        try:
            data = json.loads(message)
            msg_type = data.get("type")

            if msg_type == "subscribe":
                symbol = data.get("symbol", "").upper()
                if symbol:
                    client.subscriptions.add(symbol)
                    await self._send_json(client.writer, {
                        "type": "subscribed",
                        "symbol": symbol,
                    })
                    logger.debug("%s 订阅 %s", client_id, symbol)

            elif msg_type == "unsubscribe":
                symbol = data.get("symbol", "").upper()
                client.subscriptions.discard(symbol)
                await self._send_json(client.writer, {
                    "type": "unsubscribed",
                    "symbol": symbol,
                })

            elif msg_type == "pong":
                pass  # 心跳响应

        except json.JSONDecodeError:
            logger.warning("无效 JSON: %s", message[:100])

    async def _send_json(
        self, writer: asyncio.StreamWriter, data: dict
    ) -> bool:
        """发送 JSON 消息"""
        try:
            line = json.dumps(data) + "\n"
            writer.write(line.encode())
            await writer.drain()
            return True
        except Exception as e:
            logger.debug("发送失败: %s", e)
            return False

    async def broadcast_candle(
        self,
        symbol: str,
        timestamp: float,
        open_: float,
        high: float,
        low: float,
        close: float,
        volume: float,
    ) -> int:
        """广播 K 线数据给订阅的客户端"""
        message = {
            "type": "candle",
            "symbol": symbol,
            "data": {
                "time": int(timestamp),
                "open": open_,
                "high": high,
                "low": low,
                "close": close,
                "volume": volume,
            },
            "ts": datetime.now(timezone.utc).isoformat(),
        }

        sent_count = 0
        async with self._clients_lock:
            for client_id, client in list(self._clients.items()):
                # 检查是否订阅了该品种
                if symbol in client.subscriptions or "*" in client.subscriptions:
                    if await self._send_json(client.writer, message):
                        client.messages_sent += 1
                        sent_count += 1

        if sent_count > 0:
            self.stats["total_messages"] += sent_count

        return sent_count

    async def broadcast_price(
        self,
        symbol: str,
        price: float,
        change_24h: float = 0,
    ) -> int:
        """广播价格更新"""
        message = {
            "type": "price_update",
            "symbol": symbol,
            "data": {
                "price": price,
                "change24h": change_24h,
                "timestamp": int(time.time() * 1000),
            },
        }

        sent_count = 0
        async with self._clients_lock:
            for client in self._clients.values():
                if symbol in client.subscriptions or "*" in client.subscriptions:
                    if await self._send_json(client.writer, message):
                        sent_count += 1

        return sent_count

    def broadcast_candle_sync(
        self,
        symbol: str,
        timestamp: float,
        open_: float,
        high: float,
        low: float,
        close: float,
        volume: float,
    ) -> None:
        """同步版本的广播（供 WSCollector 回调使用）"""
        if not self._running or not self._loop:
            return

        try:
            asyncio.run_coroutine_threadsafe(
                self.broadcast_candle(
                    symbol, timestamp, open_, high, low, close, volume
                ),
                self._loop,
            )
        except Exception as e:
            logger.debug("广播失败: %s", e)

    async def _run_server(self) -> None:
        """运行服务器"""
        self._server = await asyncio.start_server(
            self._handle_client,
            self.host,
            self.port,
        )

        addr = self._server.sockets[0].getsockname()
        logger.info("WebSocket 中继服务器启动: %s:%s", addr[0], addr[1])

        async with self._server:
            await self._server.serve_forever()

    def start(self) -> None:
        """启动服务器（非阻塞）"""
        if self._running:
            return

        self._running = True

        def run_loop():
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            try:
                self._loop.run_until_complete(self._run_server())
            except Exception as e:
                logger.error("中继服务器错误: %s", e)
            finally:
                self._loop.close()

        self._thread = threading.Thread(target=run_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """停止服务器"""
        self._running = False
        if self._server:
            self._server.close()
        if self._loop:
            self._loop.call_soon_threadsafe(self._loop.stop)

    def get_stats(self) -> dict:
        """获取统计信息"""
        return {
            **self.stats,
            "running": self._running,
            "subscriptions": {
                cid: list(c.subscriptions)
                for cid, c in self._clients.items()
            },
        }


def get_relay() -> WebSocketRelay:
    """获取全局中继实例"""
    global _relay
    if _relay is None:
        with _relay_lock:
            if _relay is None:
                _relay = WebSocketRelay()
    return _relay


def start_relay(port: int = 8082) -> WebSocketRelay:
    """启动中继服务器"""
    relay = get_relay()
    relay.port = port
    relay.start()
    return relay


def stop_relay() -> None:
    """停止中继服务器"""
    global _relay
    if _relay:
        _relay.stop()
        _relay = None
