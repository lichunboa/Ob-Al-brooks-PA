"""指标数据路由"""

import sqlite3

from fastapi import APIRouter, HTTPException, Query

from src.config import get_settings
from src.schemas import IndicatorResponse, TablesResponse

router = APIRouter(prefix="/api/v1", tags=["indicators"])


@router.get("/indicators/tables", response_model=TablesResponse)
async def get_indicator_tables() -> TablesResponse:
    """获取可用的指标表列表"""
    settings = get_settings()
    db_path = settings.SQLITE_INDICATORS_PATH

    if not db_path.exists():
        raise HTTPException(status_code=503, detail="指标数据库不可用")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        rows = cursor.fetchall()
        conn.close()

        tables = [row[0] for row in rows]
        return TablesResponse(tables=tables, count=len(tables))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")


@router.get("/indicators/{table}", response_model=IndicatorResponse)
async def get_indicator_data(
    table: str,
    symbol: str | None = Query(default=None, description="交易对"),
    interval: str | None = Query(default=None, description="周期"),
    limit: int = Query(default=100, ge=1, le=1000, description="返回数量"),
) -> IndicatorResponse:
    """获取指标数据"""
    settings = get_settings()
    db_path = settings.SQLITE_INDICATORS_PATH

    if not db_path.exists():
        raise HTTPException(status_code=503, detail="指标数据库不可用")

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 检查表是否存在
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
        if not cursor.fetchone():
            conn.close()
            raise HTTPException(status_code=404, detail=f"表 '{table}' 不存在")

        # 构建查询
        query = f'SELECT * FROM "{table}"'
        params: list = []
        conditions = []

        if symbol:
            conditions.append('"交易对" = ?')
            params.append(symbol.upper())

        if interval:
            conditions.append('"周期" = ?')
            params.append(interval)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += f" LIMIT {limit}"

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        data = [dict(row) for row in rows]
        return IndicatorResponse(
            table=table,
            symbol=symbol,
            interval=interval,
            data=data,
            count=len(data),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")
