"""FastAPI 应用 (对齐 CoinGlass V4 规范)"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src import __version__
from src.routers import (
    health_router,
    coins_router,
    ohlc_router,
    open_interest_router,
    funding_rate_router,
    futures_metrics_router,
    indicator_router,
    signal_router,
)

app = FastAPI(
    title="TradeCat API",
    description="对外数据消费 REST API 服务 (CoinGlass V4 风格)",
    version=__version__,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由 (对齐 CoinGlass 路径风格)
app.include_router(health_router, prefix="/api")
app.include_router(coins_router, prefix="/api/futures")
app.include_router(ohlc_router, prefix="/api/futures")
app.include_router(open_interest_router, prefix="/api/futures")
app.include_router(funding_rate_router, prefix="/api/futures")
app.include_router(futures_metrics_router, prefix="/api/futures")
app.include_router(indicator_router, prefix="/api")
app.include_router(signal_router, prefix="/api")
