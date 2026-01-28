"""
AL Brooks Trading Console - API Gateway
Main FastAPI application
"""

import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .config import settings

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


from .db import db
from .sqlite_db import sqlite_db
from .signal_db import signal_db

# ============================================================
# Lifespan
# ============================================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler"""
    logger.info("Starting AL Brooks Trading Console API Gateway...")
    await db.connect()
    await sqlite_db.connect()
    await signal_db.connect()
    logger.info(f"API listening on {settings.api_host}:{settings.api_port}")
    yield
    logger.info("Shutting down API Gateway...")
    await signal_db.disconnect()
    await sqlite_db.disconnect()
    await db.disconnect()

# ============================================================
# App
# ============================================================
app = FastAPI(
    title="AL Brooks Trading Console API",
    description="Backend API for AL Brooks Price Action trading analysis",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# Auth
# ============================================================
async def verify_token(x_api_token: Optional[str] = Header(None)):
    """Verify API token if configured"""
    if settings.api_token and x_api_token != settings.api_token:
        raise HTTPException(status_code=401, detail="Invalid API token")
    return x_api_token


# ============================================================
# Models
# ============================================================
class HealthResponse(BaseModel):
    status: str
    timestamp: str
    version: str


class CandleData(BaseModel):
    symbol: str
    interval: str
    open_time: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float


class IndicatorData(BaseModel):
    symbol: str
    interval: str
    timestamp: str
    rsi_14: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_hist: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    sma_20: Optional[float] = None
    ema_20: Optional[float] = None
    atr_14: Optional[float] = None


class SignalData(BaseModel):
    symbol: str
    signal_name: str
    direction: str  # BUY, SELL, ALERT
    strength: int
    timestamp: str
    message: str


class AnalysisRequest(BaseModel):
    symbol: str
    prompt: str = "market_analysis"
    interval: str = "1h"


class AnalysisResponse(BaseModel):
    symbol: str
    analysis: str
    timestamp: str
    model: str


# ============================================================
# Routes: Health
# ============================================================
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow().isoformat(),
        version="0.2.0",
    )


@app.get("/api/v1/status")
async def get_status(token: str = Depends(verify_token)):
    """Get system status"""
    return {
        "status": "running",
        "services": {
            "database": "connected" if db.pool else "disconnected",
            "indicators_db": "connected" if sqlite_db.conn else "disconnected",
            "signals_db": "connected" if signal_db.conn else "disconnected",
            "data_service": "running",
            "trading_service": "running",
            "signal_service": "running",
            "ai_service": "running",
        },
        "timestamp": datetime.utcnow().isoformat(),
    }


# ============================================================
# Routes: Market Data
# ============================================================
@app.get("/api/v1/candles/{symbol}", response_model=list[CandleData])
async def get_candles(
    symbol: str,
    interval: str = Query("1h", description="K-line interval"),
    limit: int = Query(100, ge=1, le=1000, description="Number of candles"),
    token: str = Depends(verify_token),
):
    """Get K-line/candle data for a symbol"""
    logger.info(f"Getting candles for {symbol}, interval={interval}, limit={limit}")
    
    candles = await db.fetch_candles(
        symbol=symbol,
        interval=interval,
        limit=limit
    )
    return candles



@app.get("/api/v1/symbols")
async def get_symbols(token: str = Depends(verify_token)):
    """Get list of available symbols"""
    # TODO: Implement actual symbol list from database
    return {
        "symbols": [
            "BTCUSDT",
            "ETHUSDT",
            "BNBUSDT",
            "SOLUSDT",
            "ES=F",
            "NQ=F",
            "NVDA",
        ],
        "count": 7,
    }


# ============================================================
# Routes: Indicators - New for Obsidian
# ============================================================
@app.get("/api/v1/indicators/tables")
async def get_indicator_tables(token: str = Depends(verify_token)):
    """Get list of available indicator tables"""
    tables = await sqlite_db.get_tables()
    return {"tables": tables}

@app.get("/api/v1/indicators/table/{table_name}")
async def get_indicator_table_data(
    table_name: str,
    symbol: Optional[str] = Query(None),
    limit: int = Query(50),
    token: str = Depends(verify_token)
):
    """Get data from a specific indicator table"""
    data = await sqlite_db.fetch_table_data(table_name, symbol, limit)
    return data


# ============================================================
# Routes: Signals - New for Obsidian
# ============================================================
@app.get("/api/v1/signals/{symbol}")
async def get_signals_by_symbol(
    symbol: str,
    limit: int = Query(50),
    token: str = Depends(verify_token)
):
    """Get recent signals for a symbol"""
    signals = await signal_db.get_recent_signals(limit, symbol)
    return signals

@app.get("/api/v1/signals")
async def get_signals(
    limit: int = Query(50),
    direction: Optional[str] = Query(None),
    token: str = Depends(verify_token)
):
    """Get recent signals from history"""
    # Note: signal_db.get_recent_signals doesn't support direction filtering yet
    # We can fetch and filter in memory for now
    signals = await signal_db.get_recent_signals(limit, None)
    
    if direction:
        signals = [s for s in signals if s.get("direction") == direction]
        
    return {"signals": signals, "count": len(signals)}

# ============================================================
# Error Handler
# ============================================================
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    # Don't expose stack trace in production, but helpful for debugging now
    # return JSONResponse(
    #     status_code=500,
    #     content={"detail": "Internal server error"},
    # )
    # Fallback to default behavior which might show detail if debug=True
    raise exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
