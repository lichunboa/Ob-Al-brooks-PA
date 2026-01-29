"""Strategies API"""
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from db.database import get_db, StrategyModel, TradeModel
from fastapi import HTTPException
from models.strategy import (
    StrategyCard, StrategySyncRequest, StrategySyncResponse,
    StrategyPerformance
)
from core.strategy_processor import StrategyProcessor

router = APIRouter()


@router.post("/sync", response_model=StrategySyncResponse)
async def sync_strategies(
    request: StrategySyncRequest,
    db: Session = Depends(get_db)
):
    """同步策略卡片到后端"""
    processor = StrategyProcessor(db)
    result = processor.sync_strategies(request.strategies, request.force_update)
    return StrategySyncResponse(**result)


@router.get("/list", response_model=List[StrategyCard])
async def list_strategies(
    category: Optional[str] = None,
    srs_due: Optional[bool] = None,
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """查询策略卡片"""
    query = db.query(StrategyModel)
    
    if category:
        query = query.filter(StrategyModel.category == category)
    if srs_due is not None:
        if srs_due:
            from datetime import datetime
            query = query.filter(
                StrategyModel.srs_due_date <= datetime.utcnow()
            )
    
    records = query.order_by(StrategyModel.name).limit(limit).all()
    return [_model_to_card(r) for r in records]


@router.get("/performance", response_model=List[StrategyPerformance])
async def get_strategy_performance(
    min_trades: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """获取策略表现统计"""
    # 获取所有策略
    strategies = db.query(StrategyModel).all()
    
    results = []
    for strategy in strategies:
        # 策略名称可能包含英文括号，如 "失败突破 (Failed Breakout)"
        # 提取中文部分用于匹配
        name = strategy.name
        name_base = name.split('(')[0].strip() if '(' in name else name
        
        # 统计该策略的交易（使用模糊匹配）
        trades_query = db.query(TradeModel).filter(
            (TradeModel.strategy_name == name) |
            (TradeModel.strategy_name == name_base) |
            TradeModel.strategy_name.like(f"{name_base}%")
        )
        
        trade_count = trades_query.count()
        if trade_count < min_trades:
            continue
            
        win_count = trades_query.filter(TradeModel.result == "win").count()
        loss_count = trades_query.filter(TradeModel.result == "loss").count()
        
        total_pnl_r = trades_query.with_entities(
            func.coalesce(func.sum(TradeModel.pnl_r), 0)
        ).scalar()
        
        total_pnl_money = trades_query.with_entities(
            func.coalesce(func.sum(TradeModel.pnl_money), 0)
        ).scalar()
        
        win_rate = (win_count / trade_count * 100) if trade_count > 0 else 0
        avg_pnl_r = (total_pnl_r / trade_count) if trade_count > 0 else 0
        
        results.append(StrategyPerformance(
            strategy_name=name,
            trade_count=trade_count,
            win_count=win_count,
            loss_count=loss_count,
            win_rate=win_rate,
            total_pnl_r=float(total_pnl_r or 0),
            avg_pnl_r=float(avg_pnl_r),
            total_pnl_money=float(total_pnl_money or 0),
        ))
    
    # 按总盈亏排序
    results.sort(key=lambda x: x.total_pnl_r, reverse=True)
    
    return results


@router.get("/categories")
async def get_categories(db: Session = Depends(get_db)):
    """获取所有策略分类"""
    categories = db.query(StrategyModel.category).distinct().all()
    return [c[0] for c in categories if c[0]]


@router.get("/{strategy_name}", response_model=StrategyCard)
async def get_strategy(
    strategy_name: str,
    db: Session = Depends(get_db)
):
    """获取单个策略详情"""
    model = db.query(StrategyModel).filter(
        StrategyModel.name == strategy_name
    ).first()
    
    if not model:
        raise HTTPException(status_code=404, detail="Strategy not found")
    
    return _model_to_card(model)


def _model_to_card(model: StrategyModel) -> StrategyCard:
    """数据库模型转 Pydantic 模型"""
    return StrategyCard(
        id=model.id,
        name=model.name,
        canonical_name=model.canonical_name,
        category=model.category,
        setup_type=model.setup_type,
        path=model.path,
        description=model.description,
        rules=model.rules or [],
        examples=model.examples or [],
        trade_count=model.trade_count,
        win_count=model.win_count,
        srs_enabled=model.srs_enabled,
        srs_due_date=model.srs_due_date,
        srs_interval=model.srs_interval,
        tags=model.tags or [],
        created_at=model.created_at,
        updated_at=model.updated_at,
        synced_at=model.synced_at,
        raw_frontmatter=model.raw_frontmatter,
    )
