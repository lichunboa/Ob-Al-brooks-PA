"""FastAPI 应用"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src import __version__
from src.routers import (
    health_router,
    symbols_router,
    candles_router,
    metrics_router,
    indicators_router,
    signals_router,
)

app = FastAPI(
    title="TradeCat API",
    description="对外数据消费 REST API 服务",
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

# 注册路由
app.include_router(health_router)
app.include_router(symbols_router)
app.include_router(candles_router)
app.include_router(metrics_router)
app.include_router(indicators_router)
app.include_router(signals_router)
