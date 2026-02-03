"""FastAPI 应用 (对齐 CoinGlass V4 规范)"""

import httpx
from fastapi import FastAPI, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.exceptions import RequestValidationError

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
    ws_router,
)
from src.routers.obsidian import router as obsidian_router
from src.utils.errors import ErrorCode

# Sync Service 代理配置
SYNC_SERVICE_URL = "http://sync-service:8089"

app = FastAPI(
    title="AB Console API",
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


# 统一异常处理 (对齐 CoinGlass V4 响应格式)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """参数校验错误处理"""
    errors = exc.errors()
    if errors:
        first_error = errors[0]
        field = ".".join(str(loc) for loc in first_error.get("loc", []))
        msg = f"参数错误: {field} - {first_error.get('msg', 'invalid')}"
    else:
        msg = "参数校验失败"
    
    return JSONResponse(
        status_code=400,
        content={
            "code": ErrorCode.PARAM_ERROR.value,
            "msg": msg,
            "data": None,
            "success": False
        }
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理"""
    return JSONResponse(
        status_code=500,
        content={
            "code": ErrorCode.INTERNAL_ERROR.value,
            "msg": f"服务器错误: {str(exc)}",
            "data": None,
            "success": False
        }
    )

# 注册路由 (对齐 CoinGlass 路径风格)
app.include_router(health_router, prefix="/api")

# 根路径健康检查 (兼容 Obsidian 插件)
@app.get("/health", tags=["health"])
async def root_health():
    return {
        "status": "healthy",
        "service": "api-service",
        "version": __version__,
        "timestamp": int(__import__("time").time() * 1000)
    }
app.include_router(coins_router, prefix="/api/futures")
app.include_router(ohlc_router, prefix="/api/futures")
app.include_router(ohlc_router, prefix="/api/v1")  # 前端兼容路由
app.include_router(open_interest_router, prefix="/api/futures")
app.include_router(funding_rate_router, prefix="/api/futures")
app.include_router(futures_metrics_router, prefix="/api/futures")
app.include_router(indicator_router, prefix="/api")
app.include_router(signal_router, prefix="/api")
app.include_router(ws_router)  # WebSocket 路由不需要前缀

# 注册 Obsidian 同步路由 (AB Console 专属)
app.include_router(obsidian_router, prefix="/api/v1")


# ============================================================
# 代理路由 - 转发到 Sync Service (端口 8089)
# ============================================================
@app.get("/api/v1/strategies/list")
async def proxy_strategies_list():
    """代理策略列表请求到 Sync Service"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{SYNC_SERVICE_URL}/api/v1/strategies/list")
            return resp.json()
        except Exception as e:
            return JSONResponse(
                status_code=503,
                content={"code": "SERVICE_UNAVAILABLE", "msg": f"Sync Service 不可用: {str(e)}"}
            )


@app.get("/api/v1/strategies/performance")
async def proxy_strategies_performance():
    """代理策略表现统计请求到 Sync Service"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(f"{SYNC_SERVICE_URL}/api/v1/strategies/performance")
            return resp.json()
        except Exception as e:
            return JSONResponse(
                status_code=503,
                content={"code": "SERVICE_UNAVAILABLE", "msg": f"Sync Service 不可用: {str(e)}"}
            )


@app.get("/api/v1/signals")
async def proxy_signals(
    symbol: str = Query(None, description="过滤特定品种"),
    direction: str = Query(None, description="过滤方向"),
    limit: int = Query(50, ge=1, le=100)
):
    """获取交易信号"""
    # 返回模拟信号数据
    import time
    import random
    
    signals = [
        {"id": "1", "symbol": "BTCUSDT", "signal_name": "20均线缺口", "direction": "BUY", "strength": 0.75, "pattern": "20 EMA Gap", "timeframe": "5m", "message": "价格回调至EMA20附近，出现做多机会", "timestamp": int(time.time() * 1000) - 300000},
        {"id": "2", "symbol": "ETHUSDT", "signal_name": "失败突破", "direction": "SELL", "strength": 0.68, "pattern": "Failed Breakout", "timeframe": "15m", "message": "突破失败后回落，看空信号", "timestamp": int(time.time() * 1000) - 600000},
        {"id": "3", "symbol": "BTCUSDT", "signal_name": "区间突破回调", "direction": "BUY", "strength": 0.70, "pattern": "Breakout Pullback", "timeframe": "1h", "message": "突破后回调，趋势继续向上", "timestamp": int(time.time() * 1000) - 900000},
        {"id": "4", "symbol": "ES=F", "signal_name": "双重顶底", "direction": "SELL", "strength": 0.80, "pattern": "Double Top", "timeframe": "5m", "message": "形成双重顶形态，看空", "timestamp": int(time.time() * 1000) - 1200000},
        {"id": "5", "symbol": "NQ=F", "signal_name": "楔形形态", "direction": "BUY", "strength": 0.72, "pattern": "Wedge", "timeframe": "15m", "message": "楔形收敛后向上突破", "timestamp": int(time.time() * 1000) - 1500000},
    ]
    
    # 过滤
    if symbol:
        signals = [s for s in signals if symbol.upper() in s["symbol"].upper() or s["symbol"].upper() in symbol.upper()]
    if direction:
        signals = [s for s in signals if s["direction"] == direction.upper()]
    
    return {"signals": signals[:limit], "count": len(signals[:limit])}
