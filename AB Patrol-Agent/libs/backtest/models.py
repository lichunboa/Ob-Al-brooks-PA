"""
回测公共数据模型。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass
class Candle:
    """K 线数据。"""

    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    timeframe: str = "5m"


@dataclass
class PASignal:
    """价格行为信号。"""

    symbol: str
    signal_type: str
    direction: str
    strength: int
    message: str
    timestamp: datetime = field(default_factory=datetime.now)
    timeframe: str = "5m"
    price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    probability: float = 0.6
    cycle: str = ""
    entry_trigger: float = 0.0
    entry_type: str = "STOP"
    extra: dict = field(default_factory=dict)


@dataclass
class BackgroundContext:
    """大周期背景。"""

    daily_trend: str
    h4_trend: str
    background: str
    daily_slope: float
    h4_slope: float


@dataclass
class MarketState:
    """Al Brooks 四状态市场模型。"""

    always_in: str
    cycle: str
    trend_strength: float
    range_high: float = 0.0
    range_low: float = 0.0
    ema_slope: float = 0.0
    bar_count_from_ema: int = 0
    channel_type: str = "none"
    is_ttr: bool = False
    follow_through: bool = False
    pullback_ratio: float = 0.0


@dataclass
class Trade:
    """模拟交易记录。"""

    symbol: str
    direction: str
    strategy: str
    entry_price: float
    stop_loss: float
    take_profit: float
    entry_time: datetime
    exit_time: Optional[datetime] = None
    exit_price: float = 0.0
    pnl_pct: float = 0.0
    result: str = ""
    score: int = 0
    background: str = ""
    cycle: str = ""
    exit_reason: str = ""
    timeframe: str = "5m"
    bars_held: int = 0
