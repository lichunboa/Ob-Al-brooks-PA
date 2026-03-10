"""
Execution Service - FastAPI 入口 V2.8.0

用法:
    python -m src                    # 启动服务
    python -m src --port 8092        # 指定端口

新增功能 (V2.8.0):
    - bot-summary / bot-positions / bot-pnl API
    - per-bot 风控配置 (10 新字段)
    - 进化系统管理 API
    - 修改止损 API
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

from .config import SERVICE_PORT, EXCHANGE, EXCHANGE_MODE, BINANCE_MODE, get_current_config, save_env_config
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
from .evolution_manager import get_evolution_manager, EvolutionManager
from .position_patrol import PositionPatrol
from .query_cache import get_query_cache, cached, invalidate_cache
from .service_bootstrap import (
    periodic_sync,
    sync_startup_balance,
    run_startup_reconciliation,
    recover_startup_bot_map,
    sync_startup_fees,
    sync_startup_leverage,
)
from .thresholds import ThresholdUpdate, load_thresholds, save_thresholds

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
evolution_mgr: Optional[EvolutionManager] = None
position_patrol: Optional[PositionPatrol] = None
_periodic_task: Optional[asyncio.Task] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    global risk_manager, executor, trading_state, reconciliation, order_tracker, note_sync, evolution_mgr, position_patrol, _periodic_task

    logger.info(f"Execution Service V4.1 启动中... (exchange={EXCHANGE}, mode={EXCHANGE_MODE})")
    risk_manager = RiskManager()
    executor = BinanceExecutor(risk_manager)
    trading_state = get_trading_state_manager()
    reconciliation = TradeReconciliation(executor)
    order_tracker = OrderTracker(executor)
    note_sync = NoteSync(executor)
    # V7.0: 进化系统暂停使用，保留文件不删除
    # evolution_mgr = get_evolution_manager()
    position_patrol = PositionPatrol(executor, trading_state)

    # 启动时同步币安数据
    await sync_startup_balance(executor=executor, trading_state=trading_state)

    # 启动时自动对账
    await run_startup_reconciliation(reconciliation=reconciliation)

    # 启动时从币安 open orders + trades history 恢复 bot 映射
    await recover_startup_bot_map(executor=executor)

    # 启动时自动获取币安手续费率并更新到 bot allocation
    sync_startup_fees(executor=executor, trading_state=trading_state)

    # 启动时自动为所有品种设置杠杆（V3.0, V3.6 修复: 取各品种最大杠杆）
    # 币安合约每品种只有一个全局杠杆，多 bot 共享时必须取最大值
    await sync_startup_leverage(executor=executor, trading_state=trading_state)

    # 启动定时任务（笔记同步 + 订单追踪，每 5 分钟）
    _periodic_task = asyncio.create_task(
        periodic_sync(
            executor=executor,
            trading_state=trading_state,
            position_patrol=position_patrol,
            note_sync=note_sync,
            order_tracker=order_tracker,
        )
    )
    logger.info("定时任务已启动: 余额同步(60s) + 持仓巡检(60s) + 笔记同步+订单追踪(5分钟)")

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
    description="币安合约交易执行服务 V4.0.0",
    version="4.0.0",
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
        "mode": EXCHANGE_MODE,
        "exchange": EXCHANGE,
        "service": "execution-service",
        "version": "4.1.0",
        "trading_enabled": trading_state.is_trading_enabled() if trading_state else False,
    }


# ========== K 线数据 (V4.0 阶段 1) ==========

@app.get("/klines/{symbol}")
@cached(ttl=60, key_prefix="klines")  # K 线缓存 60 秒
async def get_klines(
    symbol: str,
    interval: str = Query("1h", description="K线周期: 1m/5m/15m/30m/1h/4h/1d"),
    limit: int = Query(50, ge=1, le=200, description="K线数量"),
):
    """获取 K 线数据（OHLCV + EMA20 + ATR14）— Agent 主动分析用"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return executor.fetch_klines(symbol, interval, limit)


@app.get("/klines/{symbol}/multi")
@cached(ttl=60, key_prefix="klines_multi")  # 多周期 K 线缓存 60 秒
async def get_multi_tf_klines(symbol: str):
    """多周期 K 线快照（patrol-l1 默认每周期 150 根）"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return executor.fetch_multi_tf_klines(symbol)


# ========== 账户信息 ==========

@app.get("/balance")
@cached(ttl=30, key_prefix="balance")  # 余额缓存 30 秒
async def get_balance():
    """获取账户余额（V6.0 扩展版 - 包含 20+ 交易所字段）"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    result = await executor.get_balance()
    # 手动序列化，确保所有字段都被包含（包括 None 值）
    if result:
        return [b.model_dump(mode='json', exclude_none=False, exclude_unset=False) for b in result]
    return []


@app.get("/positions")
@cached(ttl=5, key_prefix="positions")  # 持仓缓存 5 秒（实时性要求高）
async def get_positions():
    """获取持仓（V3.9.3: 附带 bot_ids 多bot归属）"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    positions = await executor.get_positions()
    result = []
    for p in positions:
        d = p.model_dump()
        bot_ids = executor.get_position_bot_ids(p.symbol)
        d["bot_ids"] = bot_ids
        d["bot_id"] = bot_ids[0] if bot_ids else None  # 向后兼容
        result.append(d)
    return result


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
@invalidate_cache("positions")  # 下单后清除持仓缓存
@invalidate_cache("balance")    # 下单后清除余额缓存
async def place_order(request: OrderRequest):
    """下单"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    # 从 bot allocation 获取风控参数
    max_pos = 10
    daily_loss = 0.0
    bot_id = request.bot_id or ""
    if trading_state and bot_id:
        alloc = trading_state.state.allocations.get(bot_id, {})
        max_pos = alloc.get("max_positions", 10)
        # V7.0: 日亏限放宽为安全网（10%），不主动限制 agent
        fixed_limit = alloc.get("daily_loss_limit", 500)
        pct_limit = alloc.get("allocated_usdt", 0) * 0.10
        daily_loss = max(fixed_limit, pct_limit)
        # 自动应用 bot 配置的杠杆（agent 未传时使用配置值）
        if not request.leverage:
            request.leverage = alloc.get("max_leverage", 1)

        # V3.5: 开仓前 can_bot_trade 门禁（含累积名义检查）
        if not request.reduce_only:
            all_positions = await executor.get_positions()
            bot_positions = _filter_bot_positions(bot_id, all_positions)
            can_trade, reason = trading_state.can_bot_trade(
                bot_id,
                live_position_count=len(bot_positions),
                symbol=request.symbol,
                bot_positions=bot_positions,
            )
            if not can_trade:
                return OrderResponse(
                    success=False,
                    symbol=request.symbol,
                    side=request.side.value,
                    quantity=request.quantity,
                    status="REJECTED",
                    message=f"Bot风控拒绝: {reason}",
                )

            # V3.9.2: 跨 bot 冲突检测已移除 — 每个 bot 独立管理同品种持仓
            # 多 bot 同品种共存于同一币安仓位，position_bot_map 以列表追踪

            # V7.0: 盈亏比门禁已移除 — 让 agent 自行判断

    return await executor.place_order(request, max_positions=max_pos, daily_loss_limit=daily_loss, bot_id=bot_id)


@app.post("/order/{symbol}/close", response_model=OrderResponse)
@invalidate_cache("positions")  # 平仓后清除持仓缓存
@invalidate_cache("balance")    # 平仓后清除余额缓存
async def close_position(
    symbol: str,
    quantity: Optional[float] = None,
    bot_id: Optional[str] = Query(None, description="指定平仓的 bot_id（V3.9.2 多 bot 支持）"),
):
    """平仓"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    return await executor.close_position(symbol, quantity, bot_id=bot_id)


@app.delete("/orders")
async def cancel_all_orders(symbol: Optional[str] = None):
    """取消所有订单"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    success = await executor.cancel_all_orders(symbol)
    return {"success": success}


@app.post("/orders/cleanup-stale")
async def cleanup_stale_orders():
    """
    清理残留的 reduce_only 委托单（V7.1 修复 Testnet 问题）

    问题：Binance Testnet 的 SL/TP 单触发后，对手方委托单不会自动撤销
    解决：遍历所有挂单，取消没有对应持仓的 reduce_only 单
    """
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    try:
        # 1. 获取当前持仓
        positions = await executor.get_positions()
        position_symbols = {pos.symbol for pos in positions}

        # 2. 获取所有挂单
        open_orders = await executor.get_open_orders()

        # 3. 找出没有对应持仓的 reduce_only 单
        stale_orders = []
        for order in open_orders:
            # 检查是否是 reduce_only 单（SL/TP）
            if order.reduce_only or order.order_type in ('STOP_MARKET', 'TAKE_PROFIT_MARKET', 'STOP', 'TAKE_PROFIT'):
                # 检查是否有对应持仓
                if order.symbol not in position_symbols:
                    stale_orders.append(order)

        # 4. 取消残留委托单
        cancelled = []
        failed = []
        for order in stale_orders:
            try:
                # 使用 ccxt 的 cancel_order
                executor.exchange.cancel_order(order.order_id, order.symbol)
                cancelled.append({
                    "symbol": order.symbol,
                    "order_id": order.order_id,
                    "type": order.order_type,
                    "side": order.side,
                })
                logger.info(f"[清理] 取消残留委托单: {order.symbol} {order.order_type} {order.order_id}")
            except Exception as e:
                failed.append({
                    "symbol": order.symbol,
                    "order_id": order.order_id,
                    "error": str(e),
                })
                logger.warning(f"[清理] 取消失败 {order.symbol} {order.order_id}: {e}")

        return {
            "success": True,
            "total_stale": len(stale_orders),
            "cancelled": len(cancelled),
            "failed": len(failed),
            "details": {
                "cancelled": cancelled,
                "failed": failed,
            }
        }

    except Exception as e:
        logger.error(f"[清理] 清理残留委托单失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/order/close-all")
async def close_all_positions():
    """一键平仓所有持仓 + 取消所有挂单"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    results = {"closed": [], "failed": [], "orders_cancelled": False}

    # 1. 取消所有挂单
    try:
        await executor.cancel_all_orders()
        results["orders_cancelled"] = True
    except Exception as e:
        logger.warning(f"取消挂单失败: {e}")

    # 2. 逐个市价平仓
    positions = await executor.get_positions()
    for pos in positions:
        try:
            resp = await executor.close_position(pos.symbol)
            if resp.success:
                results["closed"].append(pos.symbol)
            else:
                results["failed"].append({"symbol": pos.symbol, "error": resp.message})
        except Exception as e:
            results["failed"].append({"symbol": pos.symbol, "error": str(e)})

    results["total_closed"] = len(results["closed"])
    results["total_failed"] = len(results["failed"])
    return results


# ========== 持仓巡检 V3.0 ==========

@app.get("/patrol/status")
async def get_patrol_status():
    """获取持仓巡检状态"""
    if not position_patrol:
        raise HTTPException(status_code=503, detail="巡检服务未就绪")
    return position_patrol.get_status()


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


@app.get("/config/exchange")
async def get_exchange():
    """获取当前交易所配置"""
    return {"exchange": EXCHANGE, "mode": EXCHANGE_MODE}


@app.put("/config/exchange")
async def switch_exchange(body: dict):
    """切换交易所（需要重启服务生效）"""
    exchange = body.get("exchange", "").lower()
    if exchange not in ("okx", "binance"):
        raise HTTPException(status_code=400, detail="exchange must be 'okx' or 'binance'")
    mode = body.get("mode", "demo")
    success = save_env_config({"EXCHANGE": exchange, "EXCHANGE_MODE": mode})
    if not success:
        raise HTTPException(status_code=500, detail="保存配置失败")
    return {"success": True, "message": f"已切换到 {exchange} ({mode})，请重启服务生效", "exchange": exchange, "mode": mode}


# ========== 交易状态管理 (V2.7.0 新增) ==========

class AllocationUpdate(BaseModel):
    """资金分配更新请求 V2.8.0"""
    allocated_usdt: Optional[float] = None
    max_leverage: Optional[int] = None
    max_positions: Optional[int] = None
    enabled: Optional[bool] = None
    # V2.8.0 新增
    risk_percent: Optional[float] = None
    fee_rate_maker: Optional[float] = None
    fee_rate_taker: Optional[float] = None
    allowed_symbols: Optional[list[str]] = None
    min_risk_reward: Optional[float] = None
    daily_loss_limit: Optional[float] = None
    daily_loss_pct: Optional[float] = None
    trailing_stop_enabled: Optional[bool] = None
    trailing_stop_trigger: Optional[float] = None
    max_hold_hours: Optional[int] = None
    cooldown_minutes: Optional[int] = None
    allocation_pct: Optional[float] = None
    # V3.0 新增 — 名义价值控制
    max_notional_per_position: Optional[float] = None


@app.get("/trading/status")
async def get_trading_status():
    """获取交易状态（实时同步余额后返回）"""
    if not trading_state:
        raise HTTPException(status_code=503, detail="服务未就绪")
    # 实时同步余额，确保数据不过时
    if executor:
        try:
            balances = await executor.get_balance()
            usdt = next((b for b in balances if b.asset == "USDT"), None)
            if usdt:
                trading_state.sync_balance(usdt.balance, usdt.available, usdt.unrealized_pnl)
        except Exception as e:
            logger.warning(f"trading/status 实时同步失败: {e}")
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
        **request.model_dump(exclude_none=True),
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
    """检查机器人是否可以交易（使用实时持仓数）"""
    if not trading_state or not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    # 获取实时持仓数
    all_positions = await executor.get_positions()
    bot_positions = _filter_bot_positions(bot_id, all_positions)
    can_trade, reason = trading_state.can_bot_trade(bot_id, live_position_count=len(bot_positions))
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


# ========== Bot 映射恢复 (V3.1 新增) ==========


@app.post("/trading/recover-bot-map")
async def recover_bot_map():
    """触发从文件+币安恢复 order/position bot 映射（解决孤儿持仓）"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    try:
        # 1. 从文件重新加载（支持外部修改后热更新）
        executor._position_bot_map = executor._load_position_bot_map()
        from_file = len(executor._position_bot_map)
        # 2. 从币安 clientOrderId 补充恢复
        result = await executor.recover_bot_map_from_binance()
        return {
            "success": True,
            "from_file": from_file,
            "position_bot_map": executor._position_bot_map,
            **result,
        }
    except Exception as e:
        logger.error(f"恢复 bot 映射失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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

# ========== Bot 详情 API (V2.8.0 新增) ==========


@app.get("/trading/bot-summary/{bot_id}")
async def get_bot_summary(bot_id: str):
    """获取 bot 完整状态摘要（一次调用获取所有决策数据）"""
    if not trading_state or not executor or not risk_manager:
        raise HTTPException(status_code=503, detail="服务未就绪")

    alloc = trading_state.get_allocation(bot_id)
    if not alloc:
        raise HTTPException(status_code=404, detail=f"未知机器人: {bot_id}")

    # 获取该 bot 的持仓
    all_positions = await executor.get_positions()
    bot_positions = _filter_bot_positions(bot_id, all_positions)

    # 盈亏
    bot_pnl = risk_manager.get_bot_daily_pnl(bot_id)
    unrealized = sum(p.unrealized_pnl for p in bot_positions)

    # 可用保证金 & 剩余仓位
    available = trading_state.get_available_margin(bot_id)
    remaining_pos = alloc.get("max_positions", 3) - len(bot_positions)

    # 交易检查（传入实时持仓数，不依赖 current_positions 缓存）
    can_trade, reason = trading_state.can_bot_trade(bot_id, live_position_count=len(bot_positions))

    # 冷却期
    cooldowns = {}
    cooldown_min = alloc.get("cooldown_minutes", 30)
    for p in bot_positions:
        ok, remaining = risk_manager.check_cooldown(
            bot_id, p.symbol, cooldown_min
        )
        if not ok:
            cooldowns[p.symbol] = remaining

    # 日亏损限额（动态：取固定值和百分比中较大者）
    fixed_limit = alloc.get("daily_loss_limit", 50.0)
    pct_limit = alloc.get("allocated_usdt", 0) * alloc.get("daily_loss_pct", 5) / 100
    daily_limit = max(fixed_limit, pct_limit)
    limit_ok, limit_remaining = risk_manager.check_bot_daily_limit(
        bot_id, daily_limit
    )

    # 名义价值控制（V3.0）
    max_notional = alloc.get("max_notional_per_position", 0)
    leverage = alloc.get("max_leverage", 5)
    max_positions = alloc.get("max_positions", 3)
    if max_notional <= 0:
        max_notional = (alloc.get("allocated_usdt", 0) / max_positions) * leverage

    # V3.7: 计算当前相关性暴露（供 signal-router 预检）
    total_balance = trading_state.state.binance_balance or 1
    corr_exposure = 0.0
    CORR_ASSETS = {'BTC', 'ETH', 'SOL', 'BNB'}
    for p in bot_positions:
        base = p.symbol.split('/')[0].replace('USDT', '').split(':')[0]
        if base in CORR_ASSETS:
            val = p.quantity * p.mark_price
            s = str(getattr(p.side, 'value', p.side)).upper()
            corr_exposure += val * (1 if s in ('LONG', 'BUY') else -1)

    return {
        "config": alloc,
        "positions": [
            {
                "symbol": p.symbol,
                "side": p.side.value if hasattr(p.side, 'value') else p.side,
                "quantity": p.quantity,
                "entry_price": p.entry_price,
                "mark_price": p.mark_price,
                "unrealized_pnl": p.unrealized_pnl,
            }
            for p in bot_positions
        ],
        "daily_pnl": {
            "realized": bot_pnl,
            "unrealized": unrealized,
        },
        "available_margin": available,
        "remaining_positions": max(0, remaining_pos),
        "can_trade": can_trade,
        "can_trade_reason": reason,
        "risk_status": {
            "daily_loss_remaining": limit_remaining,
            "daily_loss_ok": limit_ok,
            "cooldowns": cooldowns,
            "emergency_stop": risk_manager.emergency_stop,
            "correlation_exposure_pct": round(abs(corr_exposure) / total_balance * 100, 1),
        },
        "notional": {
            "max_per_position": max_notional,
            "total_capacity": max_notional * max_positions,
            "leverage": leverage,
        },
    }


@app.get("/trading/bot-positions/{bot_id}")
async def get_bot_positions(bot_id: str):
    """获取该 bot 的持仓"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    all_positions = await executor.get_positions()
    bot_positions = _filter_bot_positions(bot_id, all_positions)

    return [
        {
            "symbol": p.symbol,
            "side": p.side.value if hasattr(p.side, 'value') else p.side,
            "quantity": p.quantity,
            "entry_price": p.entry_price,
            "mark_price": p.mark_price,
            "unrealized_pnl": p.unrealized_pnl,
            "leverage": p.leverage,
        }
        for p in bot_positions
    ]


@app.get("/trading/bot-pnl/{bot_id}")
async def get_bot_pnl(bot_id: str):
    """获取 bot 今日盈亏"""
    if not risk_manager or not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    realized = risk_manager.get_bot_daily_pnl(bot_id)
    all_positions = await executor.get_positions()
    bot_positions = _filter_bot_positions(bot_id, all_positions)
    unrealized = sum(p.unrealized_pnl for p in bot_positions)

    return {
        "bot_id": bot_id,
        "realized": realized,
        "unrealized": unrealized,
        "total": realized + unrealized,
    }


def _filter_bot_positions(bot_id: str, positions: list) -> list:
    """通过 position_bot_map 过滤 bot 持仓 — V3.9.2 支持多 bot 同品种"""
    if not executor:
        return []

    result = []
    for p in positions:
        # V3.9.2: 使用 get_position_bot_ids 检查列表（支持多 bot 同品种）
        bot_ids = executor.get_position_bot_ids(p.symbol)
        if bot_id in bot_ids:
            result.append(p)
            continue
        if bot_ids:
            continue  # 已有明确归属，不属于当前 bot

        # 兜底：查 order_bot_map 中该 bot 关联的 symbol（标准化比较）
        bot_symbols = executor.get_bot_symbols(bot_id)
        p_base = executor._norm_symbol_base(p.symbol)
        if p_base in bot_symbols:
            result.append(p)

    return result


@app.post("/order/{symbol}/modify-sl")
async def modify_stop_loss(
    symbol: str,
    new_stop_loss: float = Query(..., description="新止损价"),
    bot_id: Optional[str] = Query(None, description="机器人ID"),
):
    """修改止损价 (V3.8 P1: 使用软件止损，巡检执行)"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")
    if not position_patrol:
        raise HTTPException(status_code=503, detail="巡检未就绪")

    try:
        # 验证持仓存在（V4.1: 模糊匹配，兼容 SOLUSDT / SOLUSDT:USDT / SOL/USDT:USDT）
        positions = await executor.get_positions()
        norm_input = executor._norm_symbol_base(symbol)
        pos = next((p for p in positions if executor._norm_symbol_base(p.symbol) == norm_input), None)
        if not pos:
            raise HTTPException(status_code=404, detail=f"未找到 {symbol} 持仓")

        # 用持仓中的实际 symbol 做后续操作
        pos_symbol = pos.symbol
        old_sl = position_patrol._sl_placed.get(pos_symbol) or position_patrol._sl_placed.get(symbol)

        # 尝试取消原生止损单（真实账户可能有，Demo 忽略错误）
        try:
            open_orders = await executor.get_open_orders(pos_symbol)
            for order in open_orders:
                if order.order_type in ('STOP_MARKET', 'STOP'):
                    if order.reduce_only:
                        ccxt_sym = executor._normalize_symbol_for_ccxt(pos_symbol)
                        executor.exchange.cancel_order(order.order_id, ccxt_sym)
                        logger.info(f"已取消原生止损单: {order.order_id}")
        except Exception as e:
            logger.debug(f"取消原生止损单跳过: {e}")

        # 更新软件止损 (sl_placed.json) — 用持仓的实际 symbol
        position_patrol._sl_placed[pos_symbol] = new_stop_loss
        position_patrol._save_sl_placed()

        # 同步移动止损状态
        if pos_symbol in position_patrol._trailing_state:
            position_patrol._trailing_state[pos_symbol]["current_sl"] = new_stop_loss
            logger.info(f"同步移动止损状态: {pos_symbol} → {new_stop_loss}")

        logger.info(
            f"止损已更新: {symbol} {old_sl} → {new_stop_loss} (软件止损)"
        )

        return {
            "success": True,
            "symbol": symbol,
            "old_stop_loss": old_sl,
            "new_stop_loss": new_stop_loss,
            "mode": "software",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"修改止损失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/order/{symbol}/modify-tp")
async def modify_take_profit(
    symbol: str,
    new_take_profit: float = Query(..., description="新止盈价"),
    bot_id: Optional[str] = Query(None, description="机器人ID"),
):
    """修改止盈价：取消旧 reduce-only TP 单并重建。"""
    if not executor:
        raise HTTPException(status_code=503, detail="服务未就绪")

    result = await executor.modify_take_profit(symbol, new_take_profit, bot_id=bot_id)
    if not result.get("success"):
        status = 404 if result.get("status") == "NOT_FOUND" else 500
        raise HTTPException(status_code=status, detail=result.get("message") or result.get("status"))
    return result


# ========== 进化系统 API (V2.8.0 新增) ==========


@app.get("/trading/evolution/{bot_id}")
async def get_evolution_summary(bot_id: str):
    """获取 bot 进化摘要（只读）"""
    if not evolution_mgr:
        raise HTTPException(status_code=503, detail="服务未就绪")

    summary = evolution_mgr.get_evolution_summary(bot_id)
    if not summary:
        raise HTTPException(
            status_code=404,
            detail=f"未找到 {bot_id} 进化配置"
        )
    return summary


class TradeResultRecord(BaseModel):
    """交易结果记录"""
    strategy: str
    symbol: str
    pnl: float
    is_win: bool


@app.post("/trading/evolution/{bot_id}/record")
async def record_evolution_result(
    bot_id: str, request: TradeResultRecord
):
    """记录交易结果（后端/定时任务调用）"""
    if not evolution_mgr:
        raise HTTPException(status_code=503, detail="服务未就绪")

    result = evolution_mgr.record_trade_result(
        bot_id=bot_id,
        strategy=request.strategy,
        symbol=request.symbol,
        pnl=request.pnl,
        is_win=request.is_win,
    )
    return result

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
