"""PA 引擎共享数据模型。"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


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
    signal_bar_high: float = 0.0
    signal_bar_low: float = 0.0
    entry_trigger: float = 0.0
    entry_type: str = "STOP"
    confirmation_needed: bool = False
    extra: dict = field(default_factory=dict)


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
