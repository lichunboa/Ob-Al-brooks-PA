"""API Router"""
from datetime import datetime
import time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

try:
    from ..config import settings
    from ..db.database import StrategyModel, TradeModel, get_db
    from .config import router as config_router
    from .strategies import router as strategies_router
    from .sync import router as sync_router
    from .trades import router as trades_router
except ImportError:
    from config import settings
    from db.database import StrategyModel, TradeModel, get_db
    from api.config import router as config_router
    from api.strategies import router as strategies_router
    from api.sync import router as sync_router
    from api.trades import router as trades_router

# 启动时间
_start_time = time.time()

# 主路由
router = APIRouter(prefix="/api/v1")

# 子路由
router.include_router(trades_router, prefix="/trades", tags=["trades"])
router.include_router(strategies_router, prefix="/strategies", tags=["strategies"])
router.include_router(sync_router, prefix="/sync", tags=["sync"])
router.include_router(config_router, tags=["config"])


@router.get("/health")
async def health_check(db: Session = Depends(get_db)):
    """
    健康检查
    
    返回服务整体健康状态和各个组件的检查结果
    """
    checks = []
    
    # 检查数据库
    try:
        from sqlalchemy import text
        start = time.time()
        db.execute(text("SELECT 1"))
        response_time = (time.time() - start) * 1000
        
        checks.append({
            "name": "database",
            "status": "healthy",
            "message": "数据库连接正常",
            "response_time_ms": round(response_time, 2)
        })
    except Exception as e:
        checks.append({
            "name": "database",
            "status": "unhealthy",
            "message": f"数据库连接失败: {str(e)}"
        })
    
    # 检查Obsidian仓库路径
    try:
        import os
        
        vault_path = settings.obsidian_vault_path
        if vault_path and os.path.exists(vault_path):
            checks.append({
                "name": "obsidian_vault",
                "status": "healthy",
                "message": f"Obsidian仓库可访问: {vault_path}"
            })
        else:
            checks.append({
                "name": "obsidian_vault",
                "status": "degraded",
                "message": f"Obsidian仓库不可访问: {vault_path}"
            })
    except Exception as e:
        checks.append({
            "name": "obsidian_vault",
            "status": "degraded",
            "message": f"Obsidian仓库检查失败: {str(e)}"
        })
    
    # 确定总体状态
    if any(c['status'] == 'unhealthy' for c in checks):
        status = 'unhealthy'
        status_code = 503
    elif any(c['status'] == 'degraded' for c in checks):
        status = 'degraded'
        status_code = 200
    else:
        status = 'healthy'
        status_code = 200
    
    uptime = time.time() - _start_time
    
    return JSONResponse(
        status_code=status_code,
        content={
            "service": "sync-service",
            "version": "2.0.0",
            "status": status,
            "uptime_seconds": round(uptime, 2),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "checks": checks
        }
    )


@router.get("/health/live")
async def liveness_probe():
    """Kubernetes存活探针"""
    return {
        "status": "alive",
        "service": "sync-service",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


@router.get("/health/ready")
async def readiness_probe(db: Session = Depends(get_db)):
    """Kubernetes就绪探针"""
    try:
        # 简单检查数据库是否可用
        from sqlalchemy import text
        db.execute(text("SELECT 1"))
        return {
            "status": "ready",
            "service": "sync-service"
        }
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "reason": str(e)
            }
        )


@router.get("/status")
async def get_status(db: Session = Depends(get_db)):
    """获取同步服务状态"""
    from sqlalchemy import func
    
    trade_count = db.query(func.count(TradeModel.id)).scalar()
    strategy_count = db.query(func.count(StrategyModel.id)).scalar()
    
    # 最近同步时间
    last_trade_sync = db.query(func.max(TradeModel.synced_at)).scalar()
    last_strategy_sync = db.query(func.max(StrategyModel.synced_at)).scalar()
    
    uptime = time.time() - _start_time
    
    return {
        "status": "running",
        "version": "2.0.0",
        "uptime_seconds": round(uptime, 2),
        "stats": {
            "total_trades": trade_count,
            "total_strategies": strategy_count,
        },
        "last_sync": {
            "trades": last_trade_sync.isoformat() if last_trade_sync else None,
            "strategies": last_strategy_sync.isoformat() if last_strategy_sync else None,
        }
    }
