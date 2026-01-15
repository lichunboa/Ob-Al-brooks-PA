"""币种列表路由"""

import sqlite3

from fastapi import APIRouter, HTTPException

from src.config import get_settings
from src.schemas import SymbolsResponse

router = APIRouter(prefix="/api/v1", tags=["symbols"])


@router.get("/symbols", response_model=SymbolsResponse)
async def get_symbols() -> SymbolsResponse:
    """获取支持的币种列表"""
    settings = get_settings()
    db_path = settings.SQLITE_INDICATORS_PATH

    if not db_path.exists():
        raise HTTPException(status_code=503, detail="指标数据库不可用")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT DISTINCT "交易对" FROM "基础数据同步器.py" ORDER BY "交易对"')
        rows = cursor.fetchall()
        conn.close()

        symbols = [row[0] for row in rows if row[0]]
        return SymbolsResponse(symbols=symbols, count=len(symbols))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")
