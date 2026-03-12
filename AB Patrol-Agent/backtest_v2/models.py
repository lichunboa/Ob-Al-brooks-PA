"""
数据模型定义
"""

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional


class Direction(Enum):
    LONG = "LONG"
    SHORT = "SHORT"


class MarketState(Enum):
    """市场状态"""
    BREAKOUT = "BO"              # 突破中
    TIGHT_CHANNEL = "TC"         # 紧密通道
    BROAD_CHANNEL = "BC"         # 宽幅通道
    TRADING_RANGE = "TR"         # 交易区间
    CLIMAX = "CLIMAX"            # 高潮
    UNKNOWN = "UNKNOWN"          # 不确定


class AIDirection(Enum):
    """Always-In 方向"""
    AIL = "AIL"                  # Always-In Long
    AIS = "AIS"                  # Always-In Short
    NEUTRAL = "NEUTRAL"          # 不确定（TR）


@dataclass
class Candle:
    """K线"""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float

    @property
    def body(self) -> float:
        """实体大小"""
        return abs(self.close - self.open)

    @property
    def range(self) -> float:
        """全幅"""
        return self.high - self.low

    @property
    def is_bull(self) -> bool:
        """是否阳线"""
        return self.close > self.open

    @property
    def is_bear(self) -> bool:
        """是否阴线"""
        return self.close < self.open

    @property
    def upper_shadow(self) -> float:
        """上影线"""
        return self.high - max(self.open, self.close)

    @property
    def lower_shadow(self) -> float:
        """下影线"""
        return min(self.open, self.close) - self.low

    @property
    def close_position(self) -> float:
        """收盘位置（0-1，0=最低，1=最高）"""
        if self.range == 0:
            return 0.5
        return (self.close - self.low) / self.range


@dataclass
class SwingPoint:
    """结构位（Swing High/Low）"""
    index: int
    price: float
    is_high: bool  # True=swing high, False=swing low
    is_major: bool  # True=major, False=minor


@dataclass
class SRLevel:
    """支撑/阻力位"""
    price: float
    type: str  # "swing_high" | "swing_low" | "tr_top" | "tr_bottom" | "bo_origin"
    strength: float  # 0-1


@dataclass
class Signal:
    """交易信号"""
    timestamp: datetime
    type: str  # "高1", "高2", "低1", "低2", "双重顶", etc.
    direction: Direction
    entry_price: float
    confidence: float  # 概率估计（0-1）
    reason: str
    market_state: MarketState
    ai_direction: AIDirection


@dataclass
class Position:
    """持仓"""
    entry_time: datetime
    entry_price: float
    direction: Direction
    size: float
    stop_loss: float
    take_profit: float
    signal_type: str
    entry_state: MarketState
    entry_ai_direction: AIDirection
    premise: str  # 入场理由


@dataclass
class Trade:
    """已平仓交易"""
    entry_time: datetime
    exit_time: datetime
    entry_price: float
    exit_price: float
    direction: Direction
    size: float
    pnl: float
    pnl_pct: float
    signal_type: str
    exit_reason: str
    bars_held: int


@dataclass
class BacktestResult:
    """回测结果"""
    symbol: str
    timeframe: str
    start_date: datetime
    end_date: datetime
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    profit_factor: float
    total_pnl: float
    total_pnl_pct: float
    avg_win: float
    avg_loss: float
    max_drawdown: float
    trades: list[Trade]
