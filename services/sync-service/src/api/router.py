"""API Router"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.database import get_db
from api.trades import router as trades_router
from api.strategies import router as strategies_router
from api.sync import router as sync_router

# 主路由
router = APIRouter(prefix="/api/v1")

# 子路由
router.include_router(trades_router, prefix="/trades", tags=["trades"])
router.include_router(strategies_router, prefix="/strategies", tags=["strategies"])
router.include_router(sync_router, prefix="/sync", tags=["sync"])


@router.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "sync-service",
        "version": "1.0.0"
    }


@router.get("/status")
async def get_status(db: Session = Depends(get_db)):
    """获取同步服务状态"""
    from sqlalchemy import func
    from db.database import TradeModel, StrategyModel
    
    trade_count = db.query(func.count(TradeModel.id)).scalar()
    strategy_count = db.query(func.count(StrategyModel.id)).scalar()
    
    # 最近同步时间
    last_trade_sync = db.query(func.max(TradeModel.synced_at)).scalar()
    last_strategy_sync = db.query(func.max(StrategyModel.synced_at)).scalar()
    
    return {
        "status": "running",
        "stats": {
            "total_trades": trade_count,
            "total_strategies": strategy_count,
        },
        "last_sync": {
            "trades": last_trade_sync.isoformat() if last_trade_sync else None,
            "strategies": last_strategy_sync.isoformat() if last_strategy_sync else None,
        }
    }
