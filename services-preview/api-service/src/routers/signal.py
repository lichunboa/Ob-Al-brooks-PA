"""信号数据路由"""

import random
import sqlite3
import time

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

from src.config import get_settings
from src.utils.errors import ErrorCode, api_response, error_response

router = APIRouter(tags=["signal"])

# 模拟信号数据库
MOCK_SIGNALS = [
    {"id": "1", "symbol": "BTCUSDT", "signal_name": "20均线缺口", "direction": "BUY", "strength": 0.75, "pattern": "20 EMA Gap", "timeframe": "5m", "message": "价格回调至EMA20附近，出现做多机会"},
    {"id": "2", "symbol": "ETHUSDT", "signal_name": "失败突破", "direction": "SELL", "strength": 0.68, "pattern": "Failed Breakout", "timeframe": "15m", "message": "突破失败后回落，看空信号"},
    {"id": "3", "symbol": "BTCUSDT", "signal_name": "区间突破回调", "direction": "BUY", "strength": 0.70, "pattern": "Breakout Pullback", "timeframe": "1h", "message": "突破后回调，趋势继续向上"},
    {"id": "4", "symbol": "ES=F", "signal_name": "双重顶底", "direction": "SELL", "strength": 0.80, "pattern": "Double Top", "timeframe": "5m", "message": "形成双重顶形态，看空"},
    {"id": "5", "symbol": "NQ=F", "signal_name": "楔形形态", "direction": "BUY", "strength": 0.72, "pattern": "Wedge", "timeframe": "15m", "message": "楔形收敛后向上突破"},
]


@router.get("/signal/cooldown")
async def get_cooldown_status() -> dict:
    """获取信号冷却状态"""
    settings = get_settings()
    db_path = settings.SQLITE_COOLDOWN_PATH

    if not db_path.exists():
        return error_response(ErrorCode.SERVICE_UNAVAILABLE, "冷却数据库不可用")

    def _fetch_rows():
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT key, timestamp FROM cooldown ORDER BY timestamp DESC")
            rows = cursor.fetchall()
            return [
                {
                    "key": row[0],
                    "timestamp": int(row[1] * 1000),  # 转为毫秒
                    "expireTime": int(row[1] * 1000)
                }
                for row in rows
            ]

    try:
        data = await run_in_threadpool(_fetch_rows)
        return api_response(data)
    except Exception as e:
        return error_response(ErrorCode.INTERNAL_ERROR, f"查询失败: {e}")


@router.get("/signals")
async def get_signals(
    symbol: str = Query(None, description="过滤特定品种"),
    direction: str = Query(None, description="过滤方向: BUY/SELL/ALERT"),
    limit: int = Query(50, ge=1, le=100, description="返回数量")
) -> dict:
    """获取交易信号列表"""
    signals = MOCK_SIGNALS.copy()
    
    # 添加时间戳
    current_time = int(time.time() * 1000)
    for i, s in enumerate(signals):
        s["timestamp"] = current_time - i * 300000  # 每5分钟一个信号
    
    # 过滤
    if symbol:
        signals = [s for s in signals if symbol.upper() in s["symbol"].upper() or s["symbol"].upper() in symbol.upper()]
    if direction:
        signals = [s for s in signals if s["direction"] == direction.upper()]
    
    # 限制数量
    signals = signals[:limit]
    
    return {"signals": signals, "count": len(signals)}
