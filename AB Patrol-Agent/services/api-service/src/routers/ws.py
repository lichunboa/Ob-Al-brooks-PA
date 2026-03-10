"""WebSocket 实时数据推送

提供实时价格、K线更新、交易信号推送
Web 端和 Obsidian 插件都可以连接
"""

import asyncio
import json
import time
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

router = APIRouter(tags=["websocket"])

# 存储活跃的 WebSocket 连接
class ConnectionManager:
    def __init__(self):
        # symbol -> set of websockets
        self.symbol_subscriptions: Dict[str, Set[WebSocket]] = {}
        # websocket -> set of symbols
        self.client_subscriptions: Dict[WebSocket, Set[str]] = {}
        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.client_subscriptions[websocket] = set()
        
    def disconnect(self, websocket: WebSocket):
        # 从所有品种订阅中移除
        symbols = self.client_subscriptions.get(websocket, set())
        for symbol in symbols:
            if symbol in self.symbol_subscriptions:
                self.symbol_subscriptions[symbol].discard(websocket)
                if not self.symbol_subscriptions[symbol]:
                    del self.symbol_subscriptions[symbol]
        
        # 清理客户端订阅记录
        if websocket in self.client_subscriptions:
            del self.client_subscriptions[websocket]
            
    def subscribe(self, websocket: WebSocket, symbol: str):
        """客户端订阅某个品种"""
        if symbol not in self.symbol_subscriptions:
            self.symbol_subscriptions[symbol] = set()
        self.symbol_subscriptions[symbol].add(websocket)
        
        if websocket not in self.client_subscriptions:
            self.client_subscriptions[websocket] = set()
        self.client_subscriptions[websocket].add(symbol)
        
    def unsubscribe(self, websocket: WebSocket, symbol: str):
        """客户端取消订阅某个品种"""
        if symbol in self.symbol_subscriptions:
            self.symbol_subscriptions[symbol].discard(websocket)
            if not self.symbol_subscriptions[symbol]:
                del self.symbol_subscriptions[symbol]
                
        if websocket in self.client_subscriptions:
            self.client_subscriptions[websocket].discard(symbol)
            
    async def broadcast_to_symbol(self, symbol: str, message: dict):
        """向订阅了某个品种的所有客户端广播消息"""
        if symbol not in self.symbol_subscriptions:
            return
            
        disconnected = []
        for websocket in self.symbol_subscriptions[symbol]:
            try:
                if websocket.client_state == WebSocketState.CONNECTED:
                    await websocket.send_json(message)
            except Exception:
                disconnected.append(websocket)
                
        # 清理断开的连接
        for ws in disconnected:
            self.disconnect(ws)


# 全局连接管理器
manager = ConnectionManager()

# 模拟实时数据生成器
async def generate_mock_data():
    """生成模拟实时数据（用于测试）"""
    symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "ES=F", "NQ=F"]
    base_prices = {
        "BTCUSDT": 77500,
        "ETHUSDT": 2950,
        "SOLUSDT": 148,
        "ES=F": 5200,
        "NQ=F": 18500,
    }
    current_prices = base_prices.copy()
    
    while True:
        await asyncio.sleep(5)  # 每5秒推送一次
        
        for symbol in symbols:
            if symbol not in manager.symbol_subscriptions:
                continue
                
            # 模拟价格小幅波动
            volatility = 0.001  # 0.1%
            change = (2 * (hash(f"{symbol}{time.time()}") % 1000) / 1000 - 1) * volatility
            current_prices[symbol] *= (1 + change)
            
            # 计算24h变化（模拟）
            change24h = (current_prices[symbol] / base_prices[symbol] - 1) * 100
            
            message = {
                "type": "price_update",
                "symbol": symbol,
                "data": {
                    "price": round(current_prices[symbol], 2),
                    "change24h": round(change24h, 2),
                    "high24h": round(current_prices[symbol] * 1.02, 2),
                    "low24h": round(current_prices[symbol] * 0.98, 2),
                    "volume24h": round(1000000 + (hash(symbol) % 5000000), 2),
                    "timestamp": int(time.time() * 1000)
                }
            }
            
            await manager.broadcast_to_symbol(symbol, message)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket 主端点
    
    客户端连接后需要发送订阅消息:
    - {"type": "subscribe", "symbol": "BTCUSDT"} - 订阅品种
    - {"type": "unsubscribe", "symbol": "BTCUSDT"} - 取消订阅
    - {"type": "ping"} - 心跳
    
    服务器推送:
    - {"type": "price_update", "symbol": "...", "data": {...}} - 价格更新
    - {"type": "signal", "data": {...}} - 交易信号
    - {"type": "candle_update", "symbol": "...", "data": {...}} - K线更新
    - {"type": "pong"} - 心跳响应
    """
    await manager.connect(websocket)
    
    try:
        while True:
            # 接收客户端消息
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                msg_type = message.get("type")
                
                if msg_type == "subscribe":
                    symbol = message.get("symbol", "").upper()
                    if symbol:
                        manager.subscribe(websocket, symbol)
                        await websocket.send_json({
                            "type": "subscribed",
                            "symbol": symbol,
                            "timestamp": int(time.time() * 1000)
                        })
                        
                elif msg_type == "unsubscribe":
                    symbol = message.get("symbol", "").upper()
                    if symbol:
                        manager.unsubscribe(websocket, symbol)
                        await websocket.send_json({
                            "type": "unsubscribed",
                            "symbol": symbol,
                            "timestamp": int(time.time() * 1000)
                        })
                        
                elif msg_type == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": int(time.time() * 1000)
                    })
                    
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {msg_type}"
                    })
                    
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON"
                })
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        manager.disconnect(websocket)


# 启动后台数据推送任务
@router.on_event("startup")
async def start_mock_data_generator():
    """启动模拟数据生成器"""
    asyncio.create_task(generate_mock_data())
