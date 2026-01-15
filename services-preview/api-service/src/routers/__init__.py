"""API 路由模块"""

from .health import router as health_router
from .symbols import router as symbols_router
from .candles import router as candles_router
from .metrics import router as metrics_router
from .indicators import router as indicators_router
from .signals import router as signals_router

__all__ = [
    "health_router",
    "symbols_router",
    "candles_router",
    "metrics_router",
    "indicators_router",
    "signals_router",
]
