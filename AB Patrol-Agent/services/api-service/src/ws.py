"""WebSocket 实时数据推送

提供实时价格、K线更新、交易信号推送
Web 端和 Obsidian 插件都可以连接

数据流:
1. 价格数据: 从 TimescaleDB 定期查询最新价格
2. K线数据: 监听 data-service 的写入
3. 信号数据: 监听 signal-service 的检测
"""

import asyncio
import json
import time
import threading
from pathlib import Path
from typing import Dict, Set, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState
import asyncpg

router = APIRouter(tags=["websocket"])

# 数据库配置 (从环境变量读取)
import os
DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/market_data")
REPO_ROOT = Path(__file__).resolve().parents[3]


def resolve_signal_history_db() -> Path | None:
    """定位信号历史库。"""
    candidates = [
        REPO_ROOT / "libs" / "database" / "services" / "signal-service" / "signal_history.db",
        REPO_ROOT / "libs" / "database" / "services" / "signal-service" / "history.db",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None

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

# 最新价格缓存
latest_prices: Dict[str, dict] = {}
# 最新信号缓存
latest_signals: list = []
# 新 K线缓存
new_candles: Dict[str, list] = {}


async def fetch_latest_prices():
    """从 TimescaleDB 获取最新价格"""
    try:
        conn = await asyncpg.connect(DB_URL)
        try:
            rows = await conn.fetch("""
                SELECT DISTINCT ON (symbol) 
                    symbol, close, bucket_ts,
                    high, low, volume
                FROM candles_1m 
                ORDER BY symbol, bucket_ts DESC
                LIMIT 500
            """)
            
            for row in rows:
                symbol = row['symbol']
                # 标准化 symbol (统一格式)
                normalized_symbol = symbol
                
                latest_prices[normalized_symbol] = {
                    "price": float(row['close']),
                    "high": float(row['high']),
                    "low": float(row['low']),
                    "volume": float(row['volume']),
                    "timestamp": row['bucket_ts'].timestamp() * 1000
                }
        finally:
            await conn.close()
    except Exception as e:
        print(f"[WebSocket] Failed to fetch prices: {e}")


async def fetch_latest_signals():
    """从信号服务数据库获取最新信号"""
    try:
        # 读取 SQLite 信号历史
        import sqlite3
        signal_db_path = resolve_signal_history_db()

        if signal_db_path is None:
            return

        conn = sqlite3.connect(signal_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        # 获取最近5分钟的信号
        five_min_ago = (datetime.now() - timedelta(minutes=5)).isoformat()
        cursor.execute("""
            SELECT * FROM signal_history 
            WHERE created_at > ?
            ORDER BY created_at DESC
            LIMIT 50
        """, (five_min_ago,))
        
        rows = cursor.fetchall()
        conn.close()
        
        global latest_signals
        latest_signals = [
            {
                "id": row['id'],
                "symbol": row['symbol'],
                "signal_name": row['signal_name'],
                "direction": row['direction'],
                "strength": row['strength'],
                "timestamp": int(datetime.fromisoformat(row['created_at']).timestamp() * 1000),
                "timeframe": row['timeframe'] if 'timeframe' in row.keys() else '5m'
            }
            for row in rows
        ]
    except Exception as e:
        print(f"[WebSocket] Failed to fetch signals: {e}")


async def price_broadcast_loop():
    """价格广播循环 - 每3秒推送一次价格更新"""
    while True:
        await asyncio.sleep(3)
        
        # 刷新价格数据
        await fetch_latest_prices()
        
        # 向订阅的客户端推送价格
        for symbol, price_data in latest_prices.items():
            if symbol in manager.symbol_subscriptions:
                # 计算 24h 变化 (简化：使用前一日同时间数据)
                change_24h = 0.0  # 暂时为0，后续可以从历史计算
                
                message = {
                    "type": "price_update",
                    "symbol": symbol,
                    "data": {
                        "price": price_data["price"],
                        "change24h": change_24h,
                        "high24h": price_data["high"],
                        "low24h": price_data["low"],
                        "volume24h": price_data["volume"],
                        "timestamp": int(time.time() * 1000)
                    }
                }
                await manager.broadcast_to_symbol(symbol, message)


async def signal_broadcast_loop():
    """信号广播循环 - 每5秒检查一次新信号"""
    last_signal_count = 0
    
    while True:
        await asyncio.sleep(5)
        
        # 刷新信号数据
        await fetch_latest_signals()
        
        # 如果有新信号，推送给相关客户端
        if len(latest_signals) > last_signal_count:
            new_signals = latest_signals[:len(latest_signals) - last_signal_count]
            
            for signal in new_signals:
                symbol = signal['symbol']
                if symbol in manager.symbol_subscriptions:
                    message = {
                        "type": "signal",
                        "data": signal
                    }
                    await manager.broadcast_to_symbol(symbol, message)
            
            last_signal_count = len(latest_signals)


async def candle_broadcast_loop():
    """K线广播循环 - 每分钟检查新 K线"""
    last_check = time.time()
    
    while True:
        await asyncio.sleep(10)  # 每10秒检查一次
        
        try:
            conn = await asyncpg.connect(DB_URL)
            try:
                # 获取最近1分钟的新 K线
                one_min_ago = datetime.now() - timedelta(minutes=1)
                rows = await conn.fetch("""
                    SELECT symbol, bucket_ts, open, high, low, close, volume
                    FROM candles_1m 
                    WHERE bucket_ts > $1
                    ORDER BY bucket_ts DESC
                    LIMIT 100
                """, one_min_ago)
                
                for row in rows:
                    symbol = row['symbol']
                    if symbol in manager.symbol_subscriptions:
                        message = {
                            "type": "candle_update",
                            "symbol": symbol,
                            "data": {
                                "time": int(row['bucket_ts'].timestamp()),
                                "open": float(row['open']),
                                "high": float(row['high']),
                                "low": float(row['low']),
                                "close": float(row['close']),
                                "volume": float(row['volume'])
                            }
                        }
                        await manager.broadcast_to_symbol(symbol, message)
                        
            finally:
                await conn.close()
        except Exception as e:
            print(f"[WebSocket] Failed to fetch candles: {e}")


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
                        
                        # 立即推送当前价格和最新信号
                        if symbol in latest_prices:
                            price_data = latest_prices[symbol]
                            await websocket.send_json({
                                "type": "price_update",
                                "symbol": symbol,
                                "data": {
                                    "price": price_data["price"],
                                    "change24h": 0.0,
                                    "high24h": price_data["high"],
                                    "low24h": price_data["low"],
                                    "volume24h": price_data["volume"],
                                    "timestamp": int(time.time() * 1000)
                                }
                            })
                        
                        # 推送该品种的最新信号
                        symbol_signals = [s for s in latest_signals if s['symbol'] == symbol]
                        if symbol_signals:
                            await websocket.send_json({
                                "type": "signals_batch",
                                "symbol": symbol,
                                "data": symbol_signals[:5]
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
async def start_broadcast_loops():
    """启动广播循环"""
    # 先加载初始数据
    await fetch_latest_prices()
    await fetch_latest_signals()
    
    # 启动后台任务
    asyncio.create_task(price_broadcast_loop())
    asyncio.create_task(signal_broadcast_loop())
    asyncio.create_task(candle_broadcast_loop())
