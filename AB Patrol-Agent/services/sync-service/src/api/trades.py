"""Trades API"""
from decimal import Decimal
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

try:
    from ..core.trade_processor import TradeProcessor
    from ..db.database import TradeModel, get_db
    from ..models.trade import (
        TradeQueryParams,
        TradeRecord,
        TradeResult,
        TradeStats,
        TradeSyncRequest,
        TradeSyncResponse,
    )
except ImportError:
    from core.trade_processor import TradeProcessor
    from db.database import TradeModel, get_db
    from models.trade import (
        TradeQueryParams,
        TradeRecord,
        TradeResult,
        TradeStats,
        TradeSyncRequest,
        TradeSyncResponse,
    )

router = APIRouter()


@router.post("/sync", response_model=TradeSyncResponse)
async def sync_trades(
    request: TradeSyncRequest,
    db: Session = Depends(get_db)
):
    """同步交易记录到后端"""
    processor = TradeProcessor(db)
    result = processor.sync_trades(request.trades, request.force_update)
    return TradeSyncResponse(**result)


@router.get("/list", response_model=List[TradeRecord])
async def list_trades(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    symbol: Optional[str] = None,
    strategy: Optional[str] = None,
    result: Optional[TradeResult] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """查询交易记录"""
    query = db.query(TradeModel)
    
    if start_date:
        query = query.filter(TradeModel.trade_date >= start_date)
    if end_date:
        query = query.filter(TradeModel.trade_date <= end_date)
    if symbol:
        query = query.filter(TradeModel.symbol == symbol)
    if strategy:
        query = query.filter(TradeModel.strategy_name == strategy)
    if result:
        query = query.filter(TradeModel.result == result.value)
    
    query = query.order_by(desc(TradeModel.trade_date))
    query = query.offset(offset).limit(limit)
    
    records = query.all()
    return [_model_to_record(r) for r in records]


@router.get("/stats", response_model=TradeStats)
async def get_trade_stats(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    strategy: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """获取交易统计"""
    query = db.query(TradeModel)
    
    if start_date:
        query = query.filter(TradeModel.trade_date >= start_date)
    if end_date:
        query = query.filter(TradeModel.trade_date <= end_date)
    if strategy:
        query = query.filter(TradeModel.strategy_name == strategy)
    
    # 基础统计
    total = query.count()
    win_count = query.filter(TradeModel.result == "win").count()
    loss_count = query.filter(TradeModel.result == "loss").count()
    breakeven_count = query.filter(TradeModel.result == "breakeven").count()

    # 已完成交易数 = win + loss + breakeven（与插件 stats.ts 保持一致）
    completed = win_count + loss_count + breakeven_count

    # PnL 统计
    total_pnl_r = query.filter(TradeModel.pnl_r != None).with_entities(
        func.coalesce(func.sum(TradeModel.pnl_r), Decimal(0))
    ).scalar()

    total_pnl_money = query.filter(TradeModel.pnl_money != None).with_entities(
        func.coalesce(func.sum(TradeModel.pnl_money), Decimal(0))
    ).scalar()

    avg_pnl_r = query.filter(TradeModel.pnl_r != None).with_entities(
        func.coalesce(func.avg(TradeModel.pnl_r), Decimal(0))
    ).scalar()

    # 胜率基于已完成交易计算（与插件 stats.ts 保持一致）
    win_rate = Decimal(win_count) / Decimal(completed) * 100 if completed > 0 else Decimal(0)
    
    return TradeStats(
        total_trades=total,
        win_count=win_count,
        loss_count=loss_count,
        breakeven_count=breakeven_count,
        win_rate=win_rate,
        total_pnl_r=total_pnl_r or Decimal(0),
        total_pnl_money=total_pnl_money or Decimal(0),
        avg_pnl_r=avg_pnl_r or Decimal(0),
    )


@router.get("/stats/by-account")
async def get_trade_stats_by_account(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """按账户类型统计交易数据（实盘/模拟/回测）"""
    from decimal import Decimal

    def get_stats_for_account(account_type: Optional[str] = None):
        """获取指定账户类型的统计，account_type=None 表示所有账户"""
        query = db.query(TradeModel)

        if account_type:
            query = query.filter(TradeModel.account_type == account_type)

        if start_date:
            query = query.filter(TradeModel.trade_date >= start_date)
        if end_date:
            query = query.filter(TradeModel.trade_date <= end_date)

        total = query.count()
        win_count = query.filter(TradeModel.result == "win").count()
        loss_count = query.filter(TradeModel.result == "loss").count()
        breakeven_count = query.filter(TradeModel.result == "breakeven").count()

        # 已完成交易数 = win + loss + breakeven（与插件保持一致）
        completed = win_count + loss_count + breakeven_count

        total_pnl_money = query.filter(TradeModel.pnl_money != None).with_entities(
            func.coalesce(func.sum(TradeModel.pnl_money), Decimal(0))
        ).scalar()

        # 胜率基于已完成交易计算（与插件 stats.ts 保持一致）
        win_rate = Decimal(win_count) / Decimal(completed) * 100 if completed > 0 else Decimal(0)

        return {
            "account_type": account_type or "All",
            "total_trades": total,
            "win_count": win_count,
            "loss_count": loss_count,
            "win_rate": float(win_rate),
            "total_pnl_money": float(total_pnl_money or 0),
        }

    return {
        "Live": get_stats_for_account("Live"),
        "Demo": get_stats_for_account("Demo"),
        "Backtest": get_stats_for_account("Backtest"),
        "All": get_stats_for_account(None)  # 所有账户类型汇总
    }


@router.get("/symbols")
async def get_symbols(db: Session = Depends(get_db)):
    """获取所有交易品种"""
    symbols = db.query(TradeModel.symbol).distinct().all()
    return [s[0] for s in symbols]


@router.get("/daily")
async def get_daily_trades(
    date: date,
    db: Session = Depends(get_db)
):
    """获取某天的交易记录"""
    records = db.query(TradeModel).filter(
        TradeModel.trade_date == date
    ).order_by(TradeModel.created_at).all()
    
    return [_model_to_record(r) for r in records]


def _model_to_record(model: TradeModel) -> TradeRecord:
    """数据库模型转 Pydantic 模型"""
    return TradeRecord(
        id=model.id,
        trade_date=model.trade_date,
        symbol=model.symbol,
        direction=model.direction,
        entry_price=model.entry_price,
        exit_price=model.exit_price,
        stop_loss=model.stop_loss,
        take_profit=model.take_profit,
        position_size=model.position_size,
        risk_percent=model.risk_percent,
        result=model.result,
        pnl_money=model.pnl_money,
        pnl_r=model.pnl_r,
        strategy_name=model.strategy_name,
        setup_key=model.setup_key,
        patterns=model.patterns or [],
        note_path=model.note_path,
        note_title=model.note_title,
        tags=model.tags or [],
        market_cycle=model.market_cycle,
        always_in=model.always_in,
        entry_bar=model.entry_bar,
        account_type=model.account_type or "Live",
        created_at=model.created_at,
        updated_at=model.updated_at,
        synced_at=model.synced_at,
        raw_frontmatter=model.raw_frontmatter,
    )
