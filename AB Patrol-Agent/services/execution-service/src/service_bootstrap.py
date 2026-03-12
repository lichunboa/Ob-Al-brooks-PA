"""
执行服务启动与定时同步辅助。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

BALANCE_SYNC_INTERVAL = 60  # 1 分钟同步余额
NOTE_SYNC_INTERVAL = 300  # 5 分钟同步笔记+订单


def _pick_cash_balance(balances: list[Any]) -> Any:
    """优先取 USDT / USD 现金余额，不存在则回退到首个条目。"""
    for asset in ("USDT", "USD"):
        matched = next((balance for balance in balances if getattr(balance, "asset", None) == asset), None)
        if matched:
            return matched
    return balances[0] if balances else None


async def periodic_sync(
    *,
    executor: Any,
    trading_state: Any,
    position_patrol: Any,
    note_sync: Any,
    order_tracker: Any,
    exchange: str = "binance",
) -> None:
    """定时任务：余额同步、持仓巡检、笔记同步、订单追踪。"""
    if executor and trading_state:
        trading_state.set_account_context(
            asset=getattr(executor, "account_asset", "USDT"),
            exchange=getattr(executor, "exchange_name", exchange),
        )
    await asyncio.sleep(30)
    tick = 0
    while True:
        try:
            if executor and trading_state:
                balances = await executor.get_balance()
                balance = _pick_cash_balance(balances)
                if balance:
                    trading_state.sync_balance(
                        balance.balance,
                        balance.available,
                        balance.unrealized_pnl,
                        asset=getattr(balance, "asset", "USDT"),
                        exchange=exchange,
                    )

            if position_patrol:
                await position_patrol.patrol()

            if tick % max(1, NOTE_SYNC_INTERVAL // BALANCE_SYNC_INTERVAL) == 0:
                if note_sync:
                    result = await note_sync.sync_all()
                    synced = result.get("synced", 0)
                    if synced > 0:
                        logger.info("[定时] 笔记同步: %s 笔更新", synced)

                if order_tracker:
                    changes = await order_tracker.check_all_orders()
                    if changes:
                        logger.info("[定时] 订单追踪: %s 笔状态变更", len(changes))

        except Exception as exc:
            logger.error("[定时] 同步任务异常: %s", exc)

        tick += 1
        await asyncio.sleep(BALANCE_SYNC_INTERVAL)


async def sync_startup_balance(*, executor: Any, trading_state: Any) -> None:
    """启动时同步余额。"""
    try:
        exchange = getattr(executor, "exchange_name", "binance")
        trading_state.set_account_context(
            asset=getattr(executor, "account_asset", "USDT"),
            exchange=exchange,
            reset_snapshot_on_change=True,
        )
        balances = await executor.get_balance()
        balance = _pick_cash_balance(balances)
        if balance:
            trading_state.sync_balance(
                balance.balance,
                balance.available,
                balance.unrealized_pnl,
                asset=getattr(balance, "asset", "USDT"),
                exchange=exchange,
            )
            logger.info("启动同步完成: 余额 $%.2f", balance.balance)
    except Exception as exc:
        logger.warning("启动同步失败: %s", exc)


async def run_startup_reconciliation(*, reconciliation: Any) -> None:
    """启动时执行一次自动对账。"""
    try:
        report = await reconciliation.get_reconciliation_report()
        issues = report["summary"]["issues_found"]
        fixed = report["summary"]["auto_fixed"]
        if issues > 0:
            logger.warning("启动对账: 发现 %s 处不一致，自动修复 %s 笔", issues, fixed)
        else:
            logger.info("启动对账: 数据一致")
    except Exception as exc:
        logger.warning("启动对账失败: %s", exc)


async def recover_startup_bot_map(*, executor: Any) -> None:
    """启动时从交易所恢复 bot 映射。"""
    try:
        result = await executor.recover_bot_map_from_binance()
        recovered_orders = result.get("recovered_orders", 0)
        recovered_positions = result.get("recovered_positions", 0)
        if recovered_orders > 0 or recovered_positions > 0:
            logger.info("启动恢复: 订单映射 +%s, 持仓映射 +%s", recovered_orders, recovered_positions)
        else:
            logger.info("启动恢复: bot 映射已完整 (%s 个挂单)", result.get("total_open", 0))
    except Exception as exc:
        logger.warning("启动恢复 bot 映射失败: %s", exc)


def sync_startup_fees(*, executor: Any, trading_state: Any) -> None:
    """启动时同步费率到分配配置。"""
    try:
        fees = executor.fetch_trading_fees()
        if fees and trading_state:
            allocations = trading_state.state.allocations
            btc_fees = fees.get("BTCUSDT", {})
            if btc_fees and allocations:
                for bot_id in allocations:
                    allocations[bot_id]["fee_rate_maker"] = btc_fees["maker"]
                    allocations[bot_id]["fee_rate_taker"] = btc_fees["taker"]
                trading_state._save_state()
                logger.info(
                    "启动同步: 币安费率已更新 (maker=%s, taker=%s)",
                    btc_fees["maker"],
                    btc_fees["taker"],
                )
    except Exception as exc:
        logger.warning("启动同步币安费率失败: %s", exc)


async def sync_startup_leverage(*, executor: Any, trading_state: Any) -> None:
    """启动时为所有品种设置共享最大杠杆。"""
    try:
        allocations = trading_state.state.allocations
        symbol_max_leverage: dict[str, int] = {}
        for _, allocation in allocations.items():
            leverage = allocation.get("max_leverage", 5)
            for symbol in allocation.get("allowed_symbols", []):
                ccxt_symbol = f"{symbol}:USDT" if ":" not in symbol else symbol
                symbol_max_leverage[ccxt_symbol] = max(symbol_max_leverage.get(ccxt_symbol, 0), leverage)
        for ccxt_symbol, leverage in symbol_max_leverage.items():
            await executor.set_leverage(ccxt_symbol, leverage)
        logger.info("启动杠杆: %s", ", ".join(f"{symbol}={leverage}x" for symbol, leverage in symbol_max_leverage.items()))
    except Exception as exc:
        logger.warning("启动设置杠杆失败: %s", exc)
