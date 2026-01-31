"""Trade Data Models"""
from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


class TradeDirection(str, Enum):
    LONG = "long"
    SHORT = "short"


class TradeResult(str, Enum):
    WIN = "win"
    LOSS = "loss"
    BREAKEVEN = "breakeven"


class AccountType(str, Enum):
    LIVE = "Live"
    DEMO = "Demo"
    BACKTEST = "Backtest"


class TradeRecord(BaseModel):
    """交易记录模型 - 对应 Obsidian 交易笔记"""
    
    # 基本信息
    id: Optional[str] = Field(None, description="唯一ID")
    trade_date: date = Field(..., description="交易日期")
    symbol: str = Field(..., description="交易品种")
    direction: TradeDirection = Field(..., description="方向")
    
    # 价格 (可能未填写)
    entry_price: Optional[Decimal] = Field(None, description="入场价")
    exit_price: Optional[Decimal] = Field(None, description="出场价")
    stop_loss: Optional[Decimal] = Field(None, description="止损价")
    take_profit: Optional[Decimal] = Field(None, description="止盈价")
    
    # 规模
    position_size: Optional[Decimal] = Field(None, description="仓位大小")
    risk_percent: Optional[Decimal] = Field(None, description="风险百分比")
    
    # 结果
    result: Optional[TradeResult] = Field(None, description="结果")
    pnl_money: Optional[Decimal] = Field(None, description="盈亏金额")
    pnl_r: Optional[Decimal] = Field(None, description="盈亏R")
    
    # 账户类型
    account_type: AccountType = Field(AccountType.LIVE, description="账户类型: Live/Demo/Backtest")
    
    # 策略信息
    strategy_name: Optional[str] = Field(None, description="策略名称")
    setup_key: Optional[str] = Field(None, description="Setup Key")
    patterns: List[str] = Field(default_factory=list, description="形态")
    
    # 笔记元数据
    note_path: str = Field(..., description="Obsidian 笔记路径")
    note_title: str = Field(..., description="笔记标题")
    tags: List[str] = Field(default_factory=list, description="标签")
    
    # Al Brooks 特定
    market_cycle: Optional[str] = Field(None, description="市场周期")
    always_in: Optional[str] = Field(None, description="Always In (可接受列表)")
    entry_bar: Optional[int] = Field(None, description="入场K线")
    
    # 时间戳
    created_at: Optional[datetime] = Field(None, description="创建时间")
    updated_at: Optional[datetime] = Field(None, description="更新时间")
    synced_at: Optional[datetime] = Field(None, description="同步时间")
    
    # 原始数据
    raw_frontmatter: Optional[Dict[str, Any]] = Field(None, description="原始 frontmatter")
    
    class Config:
        json_encoders = {
            Decimal: str,
            date: lambda v: v.isoformat(),
            datetime: lambda v: v.isoformat(),
        }


class TradeSyncRequest(BaseModel):
    """交易同步请求"""
    trades: List[TradeRecord]
    force_update: bool = Field(False, description="强制更新已存在的记录")


class TradeSyncResponse(BaseModel):
    """交易同步响应"""
    success: bool
    message: str
    total: int
    created: int
    updated: int
    errors: int
    details: List[Dict[str, Any]] = Field(default_factory=list)


class TradeQueryParams(BaseModel):
    """交易查询参数"""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    symbol: Optional[str] = None
    strategy: Optional[str] = None
    result: Optional[TradeResult] = None
    limit: int = Field(100, ge=1, le=1000)
    offset: int = Field(0, ge=0)


class TradeStats(BaseModel):
    """交易统计"""
    total_trades: int
    win_count: int
    loss_count: int
    breakeven_count: int
    win_rate: Decimal
    total_pnl_r: Decimal
    total_pnl_money: Decimal
    avg_pnl_r: Decimal
    max_drawdown_r: Optional[Decimal] = None
    profit_factor: Optional[Decimal] = None
