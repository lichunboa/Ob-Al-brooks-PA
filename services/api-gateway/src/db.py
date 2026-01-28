"""
Database connection management
"""
import logging
import os
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any

import asyncpg
from fastapi import FastAPI

from .config import settings

logger = logging.getLogger(__name__)


class Database:
    """AsyncPG database connection manager"""

    def __init__(self):
        self.pool: Optional[asyncpg.Pool] = None

    async def connect(self):
        """Create connection pool"""
        if self.pool:
            return

        try:
            logger.info(f"Connecting to database: {settings.database_url}")
            self.pool = await asyncpg.create_pool(
                dsn=settings.database_url,
                min_size=2,
                max_size=10,
                command_timeout=60,
            )
            logger.info("Database connected successfully")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise

    async def disconnect(self):
        """Close connection pool"""
        if self.pool:
            await self.pool.close()
            self.pool = None
            logger.info("Database disconnected")

    async def fetch_candles(
        self,
        symbol: str,
        interval: str,
        limit: int,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Fetch candles from TimescaleDB"""
        if not self.pool:
            raise RuntimeError("Database not connected")

        # 根据 interval 选择正确的聚合表
        # 支持的周期: 1m, 5m, 15m, 1h, 4h
        interval_table_map = {
            "1m": "candles_1m",
            "5m": "candles_5m",
            "15m": "candles_15m",
            "1h": "candles_1h",
            "4h": "candles_4h",
        }
        
        # 默认使用1m表
        table_suffix = interval_table_map.get(interval, "candles_1m")
        
        # Smart table routing based on symbol type:
        # - Crypto (ending in USDT/BTC/ETH): market_data.candles_Xm (column: bucket_ts)
        # - Stocks/Futures (ES=F, NQ=F, NVDA, etc.): raw.crypto_kline_1m (column: open_time)
        is_crypto = symbol.endswith(("USDT", "BUSD", "BTC", "ETH")) and "=" not in symbol
        
        if is_crypto:
            table_name = f"market_data.{table_suffix}"
            time_column = "bucket_ts"
        else:
            # 股票/期货暂时只有1m数据
            table_name = "raw.crypto_kline_1m"
            time_column = "open_time"
        
        query = f"""
            SELECT 
                {time_column},
                open, high, low, close, volume,
                quote_volume
            FROM {table_name}
            WHERE symbol = $1
        """
        
        params = [symbol]
        
        if start_time:
            query += f" AND {time_column} >= $2"
            params.append(start_time)
        
        query += f" ORDER BY {time_column} DESC LIMIT $" + str(len(params) + 1)
        params.append(limit)

        try:
            rows = await self.pool.fetch(query, *params)
            return [
                {
                    "symbol": symbol,
                    "interval": interval,
                    "open_time": r[time_column].isoformat(),
                    "open": float(r["open"]),
                    "high": float(r["high"]),
                    "low": float(r["low"]),
                    "close": float(r["close"]),
                    "volume": float(r["volume"]),
                    "quote_volume": float(r["quote_volume"]) if r["quote_volume"] else 0.0
                }
                for r in rows
            ]
        except Exception as e:
            logger.error(f"Query failed: {e}")
            return []

db = Database()
