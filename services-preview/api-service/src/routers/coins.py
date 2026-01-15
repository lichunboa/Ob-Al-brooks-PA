"""支持币种路由 (对齐 CoinGlass /api/futures/supported-coins)"""

import sqlite3

from fastapi import APIRouter

from src.config import get_settings
from src.utils.errors import ErrorCode, api_response, error_response
from src.utils.symbol import to_base_symbol

router = APIRouter(tags=["futures"])


@router.get("/supported-coins")
async def get_supported_coins() -> dict:
    """获取支持的币种列表"""
    settings = get_settings()
    db_path = settings.SQLITE_INDICATORS_PATH

    if not db_path.exists():
        return error_response(ErrorCode.SERVICE_UNAVAILABLE, "指标数据库不可用")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute('SELECT DISTINCT "交易对" FROM "基础数据同步器.py" ORDER BY "交易对"')
        rows = cursor.fetchall()
        conn.close()

        # 转换为 CoinGlass 格式 (BTC 而非 BTCUSDT)
        symbols = [to_base_symbol(row[0]) for row in rows if row[0]]
        # 去重并排序
        symbols = sorted(set(symbols))
        
        return api_response(symbols)
    except Exception as e:
        return error_response(ErrorCode.INTERNAL_ERROR, f"查询失败: {e}")
