"""K线数据路由 (对齐 CoinGlass /api/futures/ohlc/history)"""

import asyncio
import os
import socket
import sys
from pathlib import Path

# 添加 data-service 路径以使用 ccxt 适配器
_data_service_path = str(Path(__file__).parents[4] / "services" / "data-service" / "src")
if _data_service_path not in sys.path:
    sys.path.insert(0, _data_service_path)

import psycopg
from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

from src.config import get_pg_pool
from src.utils.errors import ErrorCode, api_response, error_response
from src.utils.symbol import normalize_symbol

router = APIRouter(tags=["futures"])

VALID_INTERVALS = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w", "1M"]

TABLE_BY_INTERVAL = {
    "1m": "market_data.candles_1m",
    "3m": "market_data.candles_3m",
    "5m": "market_data.candles_5m",
    "15m": "market_data.candles_15m",
    "30m": "market_data.candles_30m",
    "1h": "market_data.candles_1h",
    "2h": "market_data.candles_2h",
    "4h": "market_data.candles_4h",
    "6h": "market_data.candles_6h",
    "12h": "market_data.candles_12h",
    "1d": "market_data.candles_1d",
    "1w": "market_data.candles_1w",
    "1M": "market_data.candles_1M",
}


def _normalize_exchange(exchange: str) -> str:
    """标准化交易所标识"""
    ex = (exchange or "").strip().lower()
    if ex in {"binance", "binance_futures", "binance_usdm", "binanceusdm", "binance_futures_um"}:
        return "binance_futures_um"
    return ex or "binance_futures_um"


# 数据库健康状态缓存
_db_health_cache = {"healthy": False, "last_check": 0}


def _check_db_health() -> bool:
    """检查数据库连接状态（带缓存）"""
    import time
    global _db_health_cache
    
    now = time.time()
    # 5秒内使用缓存结果
    if now - _db_health_cache["last_check"] < 5:
        return _db_health_cache["healthy"]
    
    try:
        pool = get_pg_pool()
        with pool.connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute("SELECT 1")
                _db_health_cache = {"healthy": True, "last_check": now}
                return True
    except Exception:
        _db_health_cache = {"healthy": False, "last_check": now}
        return False


@router.get("/candles/{symbol}")
async def get_candles_v1(
    symbol: str,
    interval: str = Query(default="1h", description="K线周期"),
    limit: int = Query(default=100, ge=1, le=1000, description="返回数量"),
    since: int | None = Query(default=None, description="开始时间 (毫秒)"),
) -> list:
    """获取K线数据 (前端兼容格式) - /api/v1/candles/{symbol}
    
    优先从数据库获取，数据库不可用时直接从交易所 API 获取
    """
    import socket
    
    symbol = normalize_symbol(symbol)
    
    if interval not in VALID_INTERVALS:
        return []
    
    # 检查数据库端口是否开放
    def check_port(host, port, timeout=1):
        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except:
            return False
    
    # 如果数据库可用，优先从数据库查询
    if check_port("localhost", 5434):
        table = TABLE_BY_INTERVAL.get(interval)
        if table:
            def _fetch_from_db():
                with get_pg_pool().connection() as conn:
                    with conn.cursor() as cursor:
                        query = f"""
                            SELECT symbol, bucket_ts, open, high, low, close, volume
                            FROM {table}
                            WHERE symbol = %s AND exchange = 'binance_futures_um'
                        """
                        params: list = [symbol]
                        
                        if since:
                            query += " AND bucket_ts >= to_timestamp(%s / 1000.0)"
                            params.append(since)
                        
                        query += " ORDER BY bucket_ts DESC LIMIT %s"
                        params.append(limit)
                        
                        cursor.execute(query, params)
                        return cursor.fetchall()
            
            try:
                rows = await asyncio.wait_for(run_in_threadpool(_fetch_from_db), timeout=3.0)
                if rows:
                    return [
                        {
                            "open_time": int(row[1].timestamp() * 1000),
                            "open": float(row[2]),
                            "high": float(row[3]),
                            "low": float(row[4]),
                            "close": float(row[5]),
                            "volume": float(row[6]) if row[6] else 0,
                            "close_time": int(row[1].timestamp() * 1000) + 60000,
                        }
                        for row in reversed(rows)
                    ]
            except Exception:
                pass  # 数据库查询失败，继续尝试从交易所获取
    
    # 数据库不可用或查询失败，直接从交易所获取
    try:
        # 动态导入 ccxt 适配器
        from adapters.ccxt import fetch_ohlcv
        
        # 转换 interval 格式
        ccxt_interval = interval  # ccxt 使用相同的格式: 1m, 5m, 15m, 1h, 4h, 1d
        
        # 计算 since 时间
        since_ms = since
        if not since_ms and limit:
            # 根据 limit 和 interval 估算起始时间
            interval_minutes = {
                "1m": 1, "5m": 5, "15m": 15, "30m": 30,
                "1h": 60, "2h": 120, "4h": 240, "1d": 1440
            }.get(interval, 5)
            import time
            since_ms = int((time.time() - limit * interval_minutes * 60) * 1000)
        
        # 从 Binance 获取数据
        candles = await asyncio.wait_for(
            asyncio.to_thread(fetch_ohlcv, "binance", symbol, ccxt_interval, since_ms, limit),
            timeout=10.0
        )
        
        if candles:
            return [
                {
                    "open_time": int(c[0]),
                    "open": float(c[1]),
                    "high": float(c[2]),
                    "low": float(c[3]),
                    "close": float(c[4]),
                    "volume": float(c[5]),
                    "close_time": int(c[0]) + 60000,  # 估算关闭时间
                }
                for c in candles
            ]
    except Exception as e:
        # 交易所获取也失败，返回空数组
        print(f"[ohlc] 从交易所获取数据失败: {e}")
    
    return []


@router.get("/ohlc/history")
async def get_ohlc_history(
    symbol: str = Query(..., description="交易对 (BTC 或 BTCUSDT)"),
    exchange: str = Query(default="Binance", description="交易所"),
    interval: str = Query(default="1h", description="K线周期"),
    limit: int = Query(default=100, ge=1, le=1000, description="返回数量"),
    startTime: int | None = Query(default=None, description="开始时间 (毫秒)"),
    endTime: int | None = Query(default=None, description="结束时间 (毫秒)"),
) -> dict:
    """获取K线历史数据"""
    symbol = normalize_symbol(symbol)

    if interval not in VALID_INTERVALS:
        return error_response(ErrorCode.INVALID_INTERVAL, f"无效的 interval: {interval}")
    table = TABLE_BY_INTERVAL.get(interval)
    if not table:
        return error_response(ErrorCode.TABLE_NOT_FOUND, f"未配置 interval: {interval}")

    def _fetch_rows():
        with get_pg_pool().connection() as conn:
            with conn.cursor() as cursor:
                exchange_code = _normalize_exchange(exchange)

                # 构建查询
                query = f"""
                    SELECT symbol, bucket_ts, open, high, low, close, volume, quote_volume
                    FROM {table}
                    WHERE symbol = %s AND exchange = %s
                """
                params: list = [symbol, exchange_code]

                if startTime:
                    query += " AND bucket_ts >= to_timestamp(%s / 1000.0)"
                    params.append(startTime)
                if endTime:
                    query += " AND bucket_ts <= to_timestamp(%s / 1000.0)"
                    params.append(endTime)

                query += " ORDER BY bucket_ts DESC LIMIT %s"
                params.append(limit)

                cursor.execute(query, params)
                return cursor.fetchall()

    try:
        rows = await run_in_threadpool(_fetch_rows)
        # 转换为 CoinGlass 格式
        data = [
            {
                "time": int(row[1].timestamp() * 1000),
                "open": str(row[2]),
                "high": str(row[3]),
                "low": str(row[4]),
                "close": str(row[5]),
                "volume": str(row[6]),
                "volume_usd": str(row[7]) if row[7] else "0",
            }
            for row in reversed(rows)
        ]
        return api_response(data)
    except psycopg.OperationalError as e:
        return error_response(ErrorCode.SERVICE_UNAVAILABLE, f"数据库连接失败: {e}")
    except Exception as e:
        return error_response(ErrorCode.INTERNAL_ERROR, f"查询失败: {e}")
