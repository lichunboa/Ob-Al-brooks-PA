"""信号数据路由"""

import sqlite3
from datetime import datetime

from fastapi import APIRouter, HTTPException

from src.config import get_settings
from src.schemas import CooldownItem, CooldownResponse

router = APIRouter(prefix="/api/v1", tags=["signals"])


@router.get("/signals/cooldown", response_model=CooldownResponse)
async def get_cooldown_status() -> CooldownResponse:
    """获取信号冷却状态"""
    settings = get_settings()
    db_path = settings.SQLITE_COOLDOWN_PATH

    if not db_path.exists():
        raise HTTPException(status_code=503, detail="冷却数据库不可用")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT key, timestamp FROM cooldown ORDER BY timestamp DESC")
        rows = cursor.fetchall()
        conn.close()

        data = [
            CooldownItem(
                key=row[0],
                timestamp=row[1],
                expires_at=datetime.fromtimestamp(row[1]),
            )
            for row in rows
        ]

        return CooldownResponse(data=data, count=len(data))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查询失败: {e}")
