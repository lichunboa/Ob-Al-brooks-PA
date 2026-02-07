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
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import SERVICE_PORT, BINANCE_MODE, get_current_config, save_env_config
from .models import (
    OrderRequest, OrderResponse, Position, Balance, RiskStatus,
    ConfigStatus, ConfigUpdate, OpenOrder, TradeHistory, AccountSummary
)
from .risk_manager import RiskManager
from .executor import BinanceExecutor
from .trading_state import get_trading_state_manager, TradingStateManager
from .reconciliation import TradeReconciliation
from .order_tracker import OrderTracker
from .note_sync import NoteSync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 全局实例
risk_manager: Optional[RiskManager] = None
executor: Optional[BinanceExecutor] = None
trading_state: Optional[TradingStateManager] = None
reconciliation: Optional[TradeReconciliation] = None
order_tracker: Optional[OrderTracker] = None
note_sync: Optional[NoteSync] = None
_periodic_task: Optional[asyncio.Task] = None

# 定时任务间隔（秒）
NOTE_SYNC_INTERVAL = 300  # 5 分钟
ORDER_TRACK_INTERVAL = 300  # 5 分钟


async def _periodic_sync():
    """定时任务：笔记同步 + 订单追踪"""
    await asyncio.sleep(60)  # 启动后 1 分钟再开始
    while True:
        try:
            # 笔记反向同步
            if note_sync:
                result = await note_sync.sync_all()
                synced = result.get("synced", 0)
                if synced > 0:
                    logger.info(f"[定时] 笔记同步: {synced} 笔更新")

            # 订单状态追踪
            if order_tracker:
                changes = await order_tracker.check_all_orders()
                if changes:
                    logger.info(f"[定时] 订单追踪: {len(changes)} 笔状态变更")

        except Exception as e:
            logger.error(f"[定时] 同步任务异常: {e}")

        await asyncio.sleep(NOTE_SYNC_INTERVAL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    global risk_manager, executor, trading_state, reconciliation, order_tracker, note_sync, _periodic_task

    logger.info("Execution Service V2.6.0 启动中...")
    risk_manager = RiskManager()
    executor = BinanceExecutor(risk_manager)
    trading_state = get_trading_state_manager()
    reconciliation = TradeReconciliation(executor)
    order_tracker = OrderTracker(executor)
    note_sync = NoteSync(executor)

    # 启动时同步币安数据
    try:
        balances = await executor.get_balance()
        usdt = next((b for b in balances if b.asset == "USDT"), None)
        if usdt:
            trading_state.sync_balance(usdt.balance, usdt.available, usdt.unrealized_pnl)
            logger.info(f"启动同步完成: 余额 ${usdt.balance:.2f}")
    except Exception as e:
        logger.warning(f"启动同步失败: {e}")

    # 启动时自动对账
    try:
        report = await reconciliation.get_reconciliation_report()
        issues = report["summary"]["issues_found"]
        fixed = report["summary"]["auto_fixed"]
        if issues > 0:
            logger.warning(f"启动对账: 发现 {issues} 处不一致，自动修复 {fixed} 笔")
        else:
            logger.info("启动对账: 数据一致")
    except Exception as e:
        logger.warning(f"启动对账失败: {e}")

    # 启动定时任务（笔记同步 + 订单追踪，每 5 分钟）
    _periodic_task = asyncio.create_task(_periodic_sync())
    logger.info("定时任务已启动: 笔记同步 + 订单追踪 (每 5 分钟)")

    logger.info(f"Execution Service 已启动 (mode={BINANCE_MODE}, trading={'ON' if trading_state.is_trading_enabled() else 'OFF'})")

    yield

    # 关闭定时任务
    if _periodic_task:
        _periodic_task.cancel()
        try:
            await _periodic_task
        except asyncio.CancelledError:
            pass
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


@app.get("/orders/open")
async def get_open_orders(symbol: Optional[str] = None):
    """获取挂单"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return await executor.get_open_orders(symbol)


@app.get("/trades/history")
async def get_trade_history(
    symbol: Optional[str] = None,
    limit: int = Query(50, ge=1, le=500)
):
    """获取交易历史"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return await executor.get_trade_history(symbol, limit)


@app.get("/account/summary")
async def get_account_summary():
    """获取账户汇总信息"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    summary = await executor.get_account_summary()
    if not summary:
        raise HTTPException(status_code=500, detail="获取账户汇总失败")
    return summary


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


# ========== 阈值管理 (V2.6.1 新增) ==========

import json
import os
from pathlib import Path

THRESHOLDS_FILE = Path.home() / ".openclaw" / "workspace" / "stats" / "thresholds.json"

DEFAULT_THRESHOLDS = {
    "min_strength": 60,
    "bot_thresholds": {
        "al-brooks": {"min_score": 70, "trade_score": 70},
        "trader": {"min_score": 70, "trade_score": 70},
        "wyckoff": {"min_score": 50, "trade_score": 50}
    }
}


def load_thresholds() -> dict:
    """加载阈值配置"""
    try:
        if THRESHOLDS_FILE.exists():
            with open(THRESHOLDS_FILE, 'r') as f:
                return {**DEFAULT_THRESHOLDS, **json.load(f)}
    except Exception as e:
        logger.error(f"加载阈值配置失败: {e}")
    return DEFAULT_THRESHOLDS


def save_thresholds(thresholds: dict) -> bool:
    """保存阈值配置"""
    try:
        THRESHOLDS_FILE.parent.mkdir(parents=True, exist_ok=True)
        thresholds["updated_at"] = __import__('datetime').datetime.utcnow().isoformat() + "Z"
        with open(THRESHOLDS_FILE, 'w') as f:
            json.dump(thresholds, f, indent=2)
        return True
    except Exception as e:
        logger.error(f"保存阈值配置失败: {e}")
        return False


class ThresholdUpdate(BaseModel):
    """阈值更新请求"""
    min_strength: Optional[int] = None
    bot_id: Optional[str] = None
    min_score: Optional[int] = None
    trade_score: Optional[int] = None


@app.get("/thresholds")
async def get_thresholds():
    """获取阈值配置"""
    return load_thresholds()


@app.post("/thresholds")
async def update_thresholds(request: ThresholdUpdate):
    """更新阈值配置"""
    thresholds = load_thresholds()

    if request.min_strength is not None:
        thresholds["min_strength"] = request.min_strength

    if request.bot_id and request.bot_id in thresholds["bot_thresholds"]:
        if request.min_score is not None:
            thresholds["bot_thresholds"][request.bot_id]["min_score"] = request.min_score
        if request.trade_score is not None:
            thresholds["bot_thresholds"][request.bot_id]["trade_score"] = request.trade_score

    if save_thresholds(thresholds):
        return {"success": True, "thresholds": thresholds}
    else:
        raise HTTPException(status_code=500, detail="保存阈值配置失败")


# ========== 数据对账 (V2.6.1 新增) ==========

@app.post("/trading/reconcile")
async def reconcile_trades():
    """
    数据对账 - 对比本地记录和币安实际持仓

    Returns:
        {
            "total_checked": 总检查数,
            "discrepancies": 不一致列表,
            "fixed_count": 自动修复数,
            "errors": 错误列表
        }
    """
    if not reconciliation:
        raise HTTPException(status_code=503, detail="对账服务未就绪")

    try:
        result = await reconciliation.reconcile_all()
        return result
    except Exception as e:
        logger.error(f"对账失败: {e}")
        raise HTTPException(status_code=500, detail=f"对账失败: {str(e)}")


@app.get("/trading/reconcile/report")
async def get_reconciliation_report():
    """
    获取完整对账报告

    Returns:
        {
            "timestamp": 对账时间,
            "binance_positions": 币安持仓数,
            "local_active_trades": 本地活跃交易数,
            "discrepancies": 不一致列表,
            "orphaned_positions": 孤儿持仓列表,
            "summary": 摘要
        }
    """
    if not reconciliation:
        raise HTTPException(status_code=503, detail="对账服务未就绪")

    try:
        report = await reconciliation.get_reconciliation_report()
        return report
    except Exception as e:
        logger.error(f"获取对账报告失败: {e}")
        raise HTTPException(status_code=500, detail=f"获取对账报告失败: {str(e)}")


@app.get("/trading/orphaned-positions")
async def get_orphaned_positions():
    """
    获取孤儿持仓（币安有持仓但本地无记录）

    Returns:
        孤儿持仓列表
    """
    if not reconciliation:
        raise HTTPException(status_code=503, detail="对账服务未就绪")

    try:
        orphans = await reconciliation.check_orphaned_positions()
        return {
            "count": len(orphans),
            "positions": orphans
        }
    except Exception as e:
        logger.error(f"检查孤儿持仓失败: {e}")
        raise HTTPException(status_code=500, detail=f"检查孤儿持仓失败: {str(e)}")


# ========== 订单追踪 (V2.6.1 新增) ==========

@app.post("/trading/track-orders")
async def track_all_orders():
    """
    追踪所有活跃订单状态

    Returns:
        {
            "checked_at": 检查时间,
            "status_changes": 状态变更列表,
            "notifications": 通知消息列表
        }
    """
    if not order_tracker:
        raise HTTPException(status_code=503, detail="订单追踪服务未就绪")

    try:
        changes = await order_tracker.check_all_orders()

        # 生成通知消息
        notifications = [
            order_tracker.generate_notification(change)
            for change in changes
        ]

        return {
            "checked_at": __import__('datetime').datetime.now(
                __import__('datetime').timezone.utc
            ).isoformat(),
            "status_changes": [
                {
                    "trade_id": c.trade_id,
                    "symbol": c.symbol,
                    "bot_id": c.bot_id,
                    "trigger_reason": c.trigger_reason,
                    "exit_price": c.exit_price,
                    "pnl": c.pnl,
                }
                for c in changes
            ],
            "notifications": notifications,
        }
    except Exception as e:
        logger.error(f"追踪订单失败: {e}")
        raise HTTPException(status_code=500, detail=f"追踪订单失败: {str(e)}")


@app.get("/trading/track/{trade_id}")
async def track_single_order(
    trade_id: str,
    bot_id: str = Query(..., description="机器人ID"),
    symbol: str = Query(..., description="交易对"),
):
    """
    追踪单个订单状态

    Returns:
        {
            "trade_id": 交易ID,
            "status": 当前状态,
            "position_exists": 是否有持仓,
            "current_price": 当前价格,
            "pnl": 浮动盈亏
        }
    """
    if not order_tracker:
        raise HTTPException(status_code=503, detail="订单追踪服务未就绪")

    try:
        result = await order_tracker.track_order(trade_id, bot_id, symbol)
        return result
    except Exception as e:
        logger.error(f"追踪订单失败: {e}")
        raise HTTPException(status_code=500, detail=f"追踪订单失败: {str(e)}")


# ========== 笔记反向同步 (V2.6.4 新增) ==========

@app.post("/trades/sync-notes")
async def sync_notes_from_binance():
    """
    反向同步 - 从币安交易数据回填 Obsidian 笔记

    扫描笔记中的 order_id，匹配币安已实现盈亏，
    写回 净利润/net_profit、结果/outcome、追踪状态
    """
    if not note_sync:
        raise HTTPException(
            status_code=503, detail="笔记同步服务未就绪"
        )

    try:
        result = await note_sync.sync_all()
        return result
    except Exception as e:
        logger.error(f"笔记同步失败: {e}")
        raise HTTPException(
            status_code=500, detail=f"笔记同步失败: {str(e)}"
        )


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
