"""PA 信号引擎子包。

按“数据模型 / 分析工具 / 风控管理”拆分 `pa_engine.py` 的共享层，
让主引擎文件只保留策略检测和编排逻辑。
"""

from .analysis import (
    CandlePatterns,
    CycleIdentifier,
    MeasuredMoveCalculator,
    TradingSession,
    TrendValidator,
    calculate_atr,
    calculate_ema,
    ema_slope,
)
from .models import Candle, MarketState, PASignal
from .risk import RiskManager
from .strategy_advanced import AdvancedStrategyDetectorMixin

__all__ = [
    "Candle",
    "PASignal",
    "MarketState",
    "TradingSession",
    "MeasuredMoveCalculator",
    "TrendValidator",
    "CandlePatterns",
    "CycleIdentifier",
    "RiskManager",
    "AdvancedStrategyDetectorMixin",
    "calculate_ema",
    "ema_slope",
    "calculate_atr",
]
