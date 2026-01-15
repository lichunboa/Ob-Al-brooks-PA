"""K线数据路由"""

import psycopg

from fastapi import APIRouter, HTTPException, Query

from src.config import get_settings
from src.schemas import CandleData, CandlesResponse

router = APIRouter(prefix="/api/v1", tags=["candles"])


@router.get("/candles/{symbol}", response_model=CandlesResponse)
async def get_candles(
    symbol: str,
    interval: str = Query(default="1m", description="K线周期"),
    limit: int = Query(default=100, ge=1, le=1000, description="返回数量"),
) -> CandlesResponse:
    """获取K线数据"""
    settings = get_settings()
    symbol = symbol.upper()

    try:
        conn = psycopg.connect(settings.DATABASE_URL)
        cursor = conn.cursor()

        query = """
            SELECT symbol, bucket_ts, open, high, low, close, volume, quote_volume
            FROM market_data.candles_1m
            WHERE symbol = %s
            ORDER BY bucket_ts DESC
            LIMIT %s
        """
        cursor.execute(query, (symbol, limit))
        rows = cursor.fetchall()
        conn.close()

        data = [
            CandleData(
                symbol=row[0],
                timestamp=row[1],
                open=float(row[2]),
                high=float(row[3]),
                low=float(row[4]),
                close=float(row[5]),
                volume=float(row[6]),
                quote_volume=float(row[7]) if row[7] else None,
            )
            for row in rows
        ]

        return CandlesResponse(
            symbol=symbol,
            interval=interval,
            data=list(reversed(data)),
            count=len(data),
        )
    except psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"数据库连接失败: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")
