"""Sync API - Obsidian 文件同步"""
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

import yaml
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

try:
    from ..config import settings
    from ..db.database import StrategyModel, SyncLog, TradeModel, get_db
except ImportError:
    from config import settings
    from db.database import StrategyModel, SyncLog, TradeModel, get_db

router = APIRouter()


@router.post("/obsidian/trades")
async def sync_obsidian_trades(
    background_tasks: BackgroundTasks,
    path: str = None,  # 可选：指定特定文件/目录
    db: Session = Depends(get_db)
):
    """从 Obsidian 同步交易记录
    
    如果指定 path，则同步该路径下的交易笔记
    否则同步默认交易目录 (Daily/Trades)
    """
    vault_path = Path(settings.obsidian_vault_path)
    
    if path:
        target_path = vault_path / path
    else:
        # 默认交易目录
        target_path = vault_path / settings.trades_path
    
    if not target_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Path not found: {target_path}"
        )
    
    # 后台执行同步
    background_tasks.add_task(
        _sync_trades_task,
        str(target_path),
        db
    )
    
    return {
        "success": True,
        "message": f"Trade sync started from {target_path.name}",
        "target": str(target_path),
        "file_count": len(list(target_path.glob("*.md")))
    }


@router.post("/obsidian/strategies")
async def sync_obsidian_strategies(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """从 Obsidian 同步策略卡片"""
    vault_path = Path(settings.obsidian_vault_path)
    strategies_path = vault_path / settings.strategies_path
    
    if not strategies_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Strategies path not found: {strategies_path}"
        )
    
    background_tasks.add_task(
        _sync_strategies_task,
        str(strategies_path),
        db
    )
    
    return {
        "success": True,
        "message": "Strategy sync started",
        "target": str(strategies_path)
    }


@router.post("/obsidian/full")
async def full_sync(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """完整同步 Obsidian 数据"""
    background_tasks.add_task(_full_sync_task, db)
    
    return {
        "success": True,
        "message": "Full sync started"
    }


@router.get("/logs")
async def get_sync_logs(
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """获取同步日志"""
    logs = db.query(SyncLog).order_by(
        SyncLog.created_at.desc()
    ).limit(limit).all()
    
    return [
        {
            "id": log.id,
            "sync_type": log.sync_type,
            "source": log.source,
            "status": log.status,
            "total": log.total,
            "created": log.created,
            "updated": log.updated,
            "errors": log.errors,
            "message": log.message,
            "created_at": log.created_at.isoformat(),
        }
        for log in logs
    ]


@router.get("/progress/{sync_id}")
async def get_sync_progress(sync_id: str):
    """获取同步进度（预留）"""
    # TODO: 实现进度追踪
    return {"sync_id": sync_id, "status": "running", "progress": 0}


# ============ 后台任务 ============

def _sync_trades_task(path: str, db: Session):
    """后台同步交易任务"""
    try:
        from ..core.obsidian_parser import ObsidianParser
        from ..core.trade_processor import TradeProcessor
    except ImportError:
        from core.obsidian_parser import ObsidianParser
        from core.trade_processor import TradeProcessor
    
    try:
        parser = ObsidianParser(path)
        trades = parser.parse_trades()
        
        processor = TradeProcessor(db)
        result = processor.sync_trades(trades, force_update=True)
        
        # 记录日志
        log = SyncLog(
            sync_type="trades",
            source="obsidian",
            status="success" if result["errors"] == 0 else "partial",
            total=result["total"],
            created=result["created"],
            updated=result["updated"],
            errors=result["errors"],
            message=result["message"]
        )
        db.add(log)
        db.commit()
        
    except Exception as e:
        log = SyncLog(
            sync_type="trades",
            source="obsidian",
            status="failed",
            message=str(e)
        )
        db.add(log)
        db.commit()


def _sync_strategies_task(path: str, db: Session):
    """后台同步策略任务"""
    try:
        from ..core.obsidian_parser import ObsidianParser
        from ..core.strategy_processor import StrategyProcessor
    except ImportError:
        from core.obsidian_parser import ObsidianParser
        from core.strategy_processor import StrategyProcessor
    
    try:
        parser = ObsidianParser(path)
        strategies = parser.parse_strategies()
        
        processor = StrategyProcessor(db)
        result = processor.sync_strategies(strategies, force_update=True)
        
        log = SyncLog(
            sync_type="strategies",
            source="obsidian",
            status="success" if result["errors"] == 0 else "partial",
            total=result["total"],
            created=result["created"],
            updated=result["updated"],
            errors=result["errors"],
            message=result["message"]
        )
        db.add(log)
        db.commit()
        
    except Exception as e:
        log = SyncLog(
            sync_type="strategies",
            source="obsidian",
            status="failed",
            message=str(e)
        )
        db.add(log)
        db.commit()


def _full_sync_task(db: Session):
    """完整同步任务"""
    vault_path = Path(settings.obsidian_vault_path)
    
    # 同步交易
    trades_path = vault_path / settings.trades_path
    if trades_path.exists():
        _sync_trades_task(str(trades_path), db)
    else:
        # 回退到 vault 根目录搜索
        _sync_trades_task(str(vault_path), db)
    
    # 同步策略
    strategies_path = vault_path / settings.strategies_path
    if strategies_path.exists():
        _sync_strategies_task(str(strategies_path), db)
