"""
Execution Service - FastAPI 入口

用法:
    python -m src                    # 启动服务
    python -m src --port 8091        # 指定端口
"""
import argparse
import logging
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import SERVICE_PORT, BINANCE_MODE, get_current_config, save_env_config
from .models import OrderRequest, OrderResponse, Position, Balance, RiskStatus, ConfigStatus, ConfigUpdate
from .risk_manager import RiskManager
from .executor import BinanceExecutor

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 全局实例
risk_manager: Optional[RiskManager] = None
executor: Optional[BinanceExecutor] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    global risk_manager, executor

    logger.info("Execution Service 启动中...")
    risk_manager = RiskManager()
    executor = BinanceExecutor(risk_manager)
    logger.info(f"Execution Service 已启动 (mode={BINANCE_MODE})")

    yield

    logger.info("Execution Service 关闭")


app = FastAPI(
    title="Execution Service",
    description="币安合约交易执行服务",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========== 健康检查 ==========

@app.get("/health")
async def health():
    """健康检查"""
    return {
        "status": "healthy",
        "mode": BINANCE_MODE,
        "service": "execution-service",
    }


# ========== 账户信息 ==========

@app.get("/balance", response_model=list[Balance])
async def get_balance():
    """获取账户余额"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return await executor.get_balance()


@app.get("/positions", response_model=list[Position])
async def get_positions():
    """获取持仓"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return await executor.get_positions()


# ========== 交易操作 ==========

@app.post("/order", response_model=OrderResponse)
async def place_order(request: OrderRequest):
    """下单"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return await executor.place_order(request)


@app.post("/order/{symbol}/close", response_model=OrderResponse)
async def close_position(symbol: str, quantity: Optional[float] = None):
    """平仓"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return await executor.close_position(symbol, quantity)


@app.delete("/orders")
async def cancel_all_orders(symbol: Optional[str] = None):
    """取消所有订单"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    success = await executor.cancel_all_orders(symbol)
    return {"success": success}


# ========== 风控管理 ==========

@app.get("/risk/status", response_model=RiskStatus)
async def get_risk_status():
    """获取风控状态"""
    if not risk_manager or not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    positions = await executor.get_positions()
    return risk_manager.get_status(len(positions))


@app.post("/risk/emergency-stop")
async def set_emergency_stop(enabled: bool):
    """设置紧急停止"""
    if not risk_manager:
        raise HTTPException(status_code=503, detail="服务未就绪")
    risk_manager.set_emergency_stop(enabled)
    return {"success": True, "emergency_stop": enabled}


@app.post("/risk/reset-daily")
async def reset_daily_stats():
    """重置每日统计"""
    if not risk_manager:
        raise HTTPException(status_code=503, detail="服务未就绪")
    risk_manager.reset_daily()
    return {"success": True}


# ========== 配置管理 ==========

@app.get("/config", response_model=ConfigStatus)
async def get_config():
    """获取当前配置"""
    return ConfigStatus(**get_current_config())


@app.post("/config")
async def update_config(request: ConfigUpdate):
    """更新配置（需要重启服务生效）"""
    config = {}

    if request.mode:
        config["BINANCE_MODE"] = request.mode

    if request.api_key:
        if request.mode == "mainnet":
            config["BINANCE_API_KEY"] = request.api_key
        else:
            config["BINANCE_TESTNET_API_KEY"] = request.api_key

    if request.api_secret:
        if request.mode == "mainnet":
            config["BINANCE_SECRET"] = request.api_secret
        else:
            config["BINANCE_TESTNET_SECRET"] = request.api_secret

    if request.max_daily_loss is not None:
        config["MAX_DAILY_LOSS_USDT"] = str(request.max_daily_loss)

    if request.max_position_size is not None:
        config["MAX_POSITION_SIZE_USDT"] = str(request.max_position_size)

    if request.max_leverage is not None:
        config["MAX_LEVERAGE"] = str(request.max_leverage)

    if config:
        success = save_env_config(config)
        if not success:
            raise HTTPException(status_code=500, detail="保存配置失败")

    return {
        "success": True,
        "message": "配置已保存，请重启服务生效",
        "updated_keys": list(config.keys())
    }


def main():
    parser = argparse.ArgumentParser(description="Execution Service")
    parser.add_argument("--port", type=int, default=SERVICE_PORT, help="服务端口")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="监听地址")
    args = parser.parse_args()

    uvicorn.run(
        "src.__main__:app",
        host=args.host,
        port=args.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
