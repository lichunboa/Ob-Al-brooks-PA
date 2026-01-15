"""期货指标路由"""

import psycopg

from fastapi import APIRouter, HTTPException, Query

from src.config import get_settings
from src.schemas import MetricsData, MetricsResponse

router = APIRouter(prefix="/api/v1", tags=["metrics"])


@router.get("/metrics/{symbol}", response_model=MetricsResponse)
async def get_metrics(
    symbol: str,
    interval: str = Query(default="5m", description="周期"),
    limit: int = Query(default=100, ge=1, le=1000, description="返回数量"),
) -> MetricsResponse:
    """获取期货指标数据"""
    settings = get_settings()
    symbol = symbol.upper()

    try:
        conn = psycopg.connect(settings.DATABASE_URL)
        cursor = conn.cursor()

        query = """
            SELECT symbol, create_time, sum_open_interest_value, sum_toptrader_long_short_ratio, sum_taker_long_short_vol_ratio
            FROM market_data.binance_futures_metrics_5m
            WHERE symbol = %s
            ORDER BY create_time DESC
            LIMIT %s
        """
        cursor.execute(query, (symbol, limit))
        rows = cursor.fetchall()
        conn.close()

        data = [
            MetricsData(
                symbol=row[0],
                timestamp=row[1],
                open_interest=float(row[2]) if row[2] else None,
                funding_rate=float(row[3]) if row[3] else None,
                long_short_ratio=float(row[4]) if row[4] else None,
            )
            for row in rows
        ]

        return MetricsResponse(
            symbol=symbol,
            interval=interval,
            data=list(reversed(data)),
            count=len(data),
        )
    except psycopg.OperationalError as e:
        raise HTTPException(status_code=503, detail=f"数据库连接失败: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")
