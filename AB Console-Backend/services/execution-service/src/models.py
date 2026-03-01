"""
数据模型
"""
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, field_validator


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

    @field_validator("side", mode="before")
    @classmethod
    def normalize_side(cls, v):
        if isinstance(v, str):
            return v.upper()
        return v

    @field_validator("symbol", mode="before")
    @classmethod
    def normalize_symbol(cls, v):
        if isinstance(v, str):
            v = v.split(":")[0].upper()
        return v
    order_type: OrderType = Field(default=OrderType.MARKET, description="订单类型")
    price: Optional[float] = Field(None, description="限价单价格")
    stop_loss: Optional[float] = Field(None, description="止损价格")
    take_profit: Optional[float] = Field(None, description="止盈价格")
    leverage: Optional[int] = Field(None, ge=1, le=125, description="杠杆倍数")
    reduce_only: bool = Field(False, description="是否只减仓")

    # 关联信息（用于追踪）
    trade_id: Optional[str] = Field(None, description="关联的交易 ID")
    signal_source: Optional[str] = Field(None, description="信号来源")
    strategy: Optional[str] = Field(None, description="策略名称 (用于进化系统)")
    bot_id: Optional[str] = Field(None, description="机器人 ID (al-brooks/trader/wyckoff)")


class OrderResponse(BaseModel):
    """下单响应"""
    success: bool
    order_id: Optional[str] = None
    symbol: str
    side: str
    quantity: float
    price: Optional[float] = None
    status: str = "UNKNOWN"
    message: Optional[str] = None

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, v):
        """OKX Demo 可能返回 status=None，防 Pydantic 校验崩溃"""
        if v is None:
            return "UNKNOWN"
        return str(v)
    timestamp: datetime = Field(default_factory=datetime.now)

    # 关联的止损止盈订单
    stop_loss_order_id: Optional[str] = None
    take_profit_order_id: Optional[str] = None
    # 机器人追踪
    bot_id: Optional[str] = None


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


class OpenOrder(BaseModel):
    """挂单信息"""
    order_id: str
    symbol: str
    side: str
    order_type: str
    quantity: float
    price: Optional[float] = None
    stop_price: Optional[float] = None
    status: str
    reduce_only: bool = False
    created_at: Optional[datetime] = None
    # 机器人追踪
    bot_id: Optional[str] = None
    client_order_id: Optional[str] = None


class TradeHistory(BaseModel):
    """交易历史"""
    trade_id: str
    order_id: str
    symbol: str
    side: str
    quantity: float
    price: float
    realized_pnl: float
    commission: float
    commission_asset: str
    timestamp: datetime
    # 机器人追踪
    bot_id: Optional[str] = None


class AccountSummary(BaseModel):
    """账户汇总信息"""
    # 余额
    total_balance: float
    available_balance: float
    total_unrealized_pnl: float
    total_margin_balance: float

    # 持仓统计
    position_count: int
    total_position_value: float

    # 挂单统计
    open_order_count: int

    # 今日统计
    today_realized_pnl: float
    today_trade_count: int
    today_commission: float

    # 风控
    margin_ratio: Optional[float] = None
    can_trade: bool = True
