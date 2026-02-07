"""
数据模型
"""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class OrderSide(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class OrderType(str, Enum):
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    STOP_MARKET = "STOP_MARKET"
    TAKE_PROFIT_MARKET = "TAKE_PROFIT_MARKET"


class PositionSide(str, Enum):
    LONG = "LONG"
    SHORT = "SHORT"
    BOTH = "BOTH"


class OrderRequest(BaseModel):
    """下单请求"""
    symbol: str = Field(..., description="交易对，如 BTCUSDT")
    side: OrderSide = Field(..., description="买卖方向")
    quantity: float = Field(..., gt=0, description="数量")
    order_type: OrderType = Field(default=OrderType.MARKET, description="订单类型")
    price: Optional[float] = Field(None, description="限价单价格")
    stop_loss: Optional[float] = Field(None, description="止损价格")
    take_profit: Optional[float] = Field(None, description="止盈价格")
    leverage: Optional[int] = Field(None, ge=1, le=125, description="杠杆倍数")
    reduce_only: bool = Field(False, description="是否只减仓")

    # 关联信息（用于追踪）
    trade_id: Optional[str] = Field(None, description="关联的交易 ID")
    signal_source: Optional[str] = Field(None, description="信号来源")


class OrderResponse(BaseModel):
    """下单响应"""
    success: bool
    order_id: Optional[str] = None
    symbol: str
    side: str
    quantity: float
    price: Optional[float] = None
    status: str
    message: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

    # 关联的止损止盈订单
    stop_loss_order_id: Optional[str] = None
    take_profit_order_id: Optional[str] = None


class Position(BaseModel):
    """持仓信息"""
    symbol: str
    side: PositionSide
    quantity: float
    entry_price: float
    mark_price: float
    unrealized_pnl: float
    leverage: int
    margin_type: str
    liquidation_price: Optional[float] = None


class Balance(BaseModel):
    """账户余额"""
    asset: str
    balance: float
    available: float
    unrealized_pnl: float


class RiskStatus(BaseModel):
    """风控状态"""
    emergency_stop: bool
    daily_pnl: float
    daily_loss_limit: float
    remaining_loss_budget: float
    open_positions: int
    max_position_size: float
    can_open_new_position: bool


class ConfigStatus(BaseModel):
    """配置状态"""
    mode: str
    api_key_configured: bool
    api_key_preview: str
    secret_configured: bool
    max_daily_loss: float
    max_position_size: float
    max_leverage: int


class ConfigUpdate(BaseModel):
    """配置更新请求"""
    mode: Optional[str] = Field(None, description="testnet 或 mainnet")
    api_key: Optional[str] = Field(None, description="API Key")
    api_secret: Optional[str] = Field(None, description="API Secret")
    max_daily_loss: Optional[float] = Field(None, description="每日最大亏损")
    max_position_size: Optional[float] = Field(None, description="单笔最大仓位")
    max_leverage: Optional[int] = Field(None, description="最大杠杆")
