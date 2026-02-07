"""
Execution Service - FastAPI 入口 V2.6.0

用法:
    python -m src                    # 启动服务
    python -m src --port 8092        # 指定端口

新增功能 (V2.6.0):
    - 交易开关控制
    - 机器人资金分配
    - 币安数据同步
"""
import argparse
import logging
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import SERVICE_PORT, BINANCE_MODE, get_current_config, save_env_config
from .models import OrderRequest, OrderResponse, Position, Balance, RiskStatus, ConfigStatus, ConfigUpdate
from .risk_manager import RiskManager
from .executor import BinanceExecutor
from .trading_state import get_trading_state_manager, TradingStateManager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 全局实例
risk_manager: Optional[RiskManager] = None
executor: Optional[BinanceExecutor] = None
trading_state: Optional[TradingStateManager] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    global risk_manager, executor, trading_state

    logger.info("Execution Service V2.6.0 启动中...")
    risk_manager = RiskManager()
    executor = BinanceExecutor(risk_manager)
    trading_state = get_trading_state_manager()

    # 启动时同步币安数据
    try:
        balances = await executor.get_balance()
        usdt = next((b for b in balances if b.asset == "USDT"), None)
        if usdt:
            trading_state.sync_balance(usdt.balance, usdt.available, usdt.unrealized_pnl)
            logger.info(f"启动同步完成: 余额 ${usdt.balance:.2f}")
    except Exception as e:
        logger.warning(f"启动同步失败: {e}")

    logger.info(f"Execution Service 已启动 (mode={BINANCE_MODE}, trading={'ON' if trading_state.is_trading_enabled() else 'OFF'})")

    yield

    logger.info("Execution Service 关闭")


app = FastAPI(
    title="Execution Service",
    description="币安合约交易执行服务 V2.6.0",
    version="0.2.0",
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
        "version": "0.2.0",
        "trading_enabled": trading_state.is_trading_enabled() if trading_state else False,
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


# ========== 交易状态管理 (V2.6.0 新增) ==========

class AllocationUpdate(BaseModel):
    """资金分配更新请求"""
    allocated_usdt: Optional[float] = None
    max_leverage: Optional[int] = None
    max_positions: Optional[int] = None
    enabled: Optional[bool] = None


@app.get("/trading/status")
async def get_trading_status():
    """获取交易状态"""
    if not trading_state:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return trading_state.get_status_summary()


@app.post("/trading/toggle")
async def toggle_trading(enabled: bool = Query(..., description="是否开启交易")):
    """开关交易"""
    if not trading_state or not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    # 开启前先同步余额
    if enabled:
        try:
            balances = await executor.get_balance()
            usdt = next((b for b in balances if b.asset == "USDT"), None)
            if usdt:
                trading_state.sync_balance(usdt.balance, usdt.available, usdt.unrealized_pnl)
        except Exception as e:
            logger.warning(f"同步余额失败: {e}")

    result = trading_state.toggle_trading(enabled)
    return {
        "success": True,
        "trading_enabled": result,
        "message": "交易已开启，机器人可以执行交易" if result else "交易已关闭，机器人仅分析不交易"
    }


@app.post("/trading/allocate/{bot_id}")
async def allocate_funds(bot_id: str, request: AllocationUpdate):
    """分配机器人资金"""
    if not trading_state:
        raise HTTPException(status_code=503, detail="服务未就绪")

    success = trading_state.update_allocation(
        bot_id,
        allocated_usdt=request.allocated_usdt,
        max_leverage=request.max_leverage,
        max_positions=request.max_positions,
        enabled=request.enabled,
    )

    if not success:
        raise HTTPException(status_code=404, detail=f"未知机器人: {bot_id}")

    return {
        "success": True,
        "bot_id": bot_id,
        "allocation": trading_state.get_allocation(bot_id)
    }


@app.get("/trading/can-trade/{bot_id}")
async def can_bot_trade(bot_id: str):
    """检查机器人是否可以交易"""
    if not trading_state:
        raise HTTPException(status_code=503, detail="服务未就绪")

    can_trade, reason = trading_state.can_bot_trade(bot_id)
    allocation = trading_state.get_allocation(bot_id)

    return {
        "can_trade": can_trade,
        "reason": reason,
        "bot_id": bot_id,
        "allocation": allocation
    }


@app.post("/trading/sync")
async def sync_from_binance():
    """从币安同步数据"""
    if not trading_state or not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    try:
        balances = await executor.get_balance()
        positions = await executor.get_positions()

        usdt = next((b for b in balances if b.asset == "USDT"), None)
        if usdt:
            trading_state.sync_balance(usdt.balance, usdt.available, usdt.unrealized_pnl)

        return {
            "success": True,
            "balance": usdt.balance if usdt else 0,
            "available": usdt.available if usdt else 0,
            "unrealized_pnl": usdt.unrealized_pnl if usdt else 0,
            "positions_count": len(positions),
            "last_sync": trading_state.state.last_sync
        }
    except Exception as e:
        logger.error(f"同步失败: {e}")
        raise HTTPException(status_code=500, detail=f"同步失败: {str(e)}")


@app.get("/trading/calculate-size/{bot_id}")
async def calculate_position_size(
    bot_id: str,
    entry_price: float = Query(..., description="入场价格"),
    stop_loss: float = Query(..., description="止损价格"),
    risk_percent: float = Query(1.0, description="风险百分比"),
):
    """计算仓位大小"""
    if not trading_state:
        raise HTTPException(status_code=503, detail="服务未就绪")

    quantity, explanation = trading_state.calculate_position_size(
        bot_id, entry_price, stop_loss, risk_percent
    )

    return {
        "bot_id": bot_id,
        "quantity": quantity,
        "explanation": explanation,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "risk_percent": risk_percent
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
