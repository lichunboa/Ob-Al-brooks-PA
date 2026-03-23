"""
执行服务下单与改单能力混入。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional

from .config import SHARED_WORKSPACE
from .models import OrderRequest, OrderResponse, OrderSide, OrderType, PositionSide

logger = logging.getLogger(__name__)


class ExecutionOrderMixin:
    """执行服务下单与改单能力混入。"""

    @staticmethod
    def _is_precision_or_size_error(exc: Exception) -> bool:
        """识别交易所因精度、最小数量、最小成交额触发的下单错误。"""
        text = str(exc or "").lower()
        return any(
            token in text
            for token in (
                "minimum amount precision",
                "min_notional",
                "min notional",
                "minimum notional",
                "precision is over the maximum defined",
                "lot_size",
                "invalid quantity",
                "quantity less than zero",
                "must be greater than minimum amount",
                "must be greater than minimum amount precision",
            )
        )

    def _reload_symbol_market_constraints(self, symbol: str) -> bool:
        """刷新交易所市场约束，给精度错误一次自愈机会。"""
        if self.exchange_name == "ctrader" or not hasattr(self.exchange, "load_markets"):
            return False
        try:
            self._call_with_time_sync("reload_markets", self.exchange.load_markets, True)
            logger.info("已刷新市场约束: %s", symbol)
            return True
        except TypeError:
            try:
                self._call_with_time_sync("reload_markets", self.exchange.load_markets)
                logger.info("已刷新市场约束(兼容调用): %s", symbol)
                return True
            except Exception as exc:
                logger.warning("刷新市场约束失败 %s: %s", symbol, exc)
                return False
        except Exception as exc:
            logger.warning("刷新市场约束失败 %s: %s", symbol, exc)
            return False

    async def place_order(
        self,
        request: OrderRequest,
        max_positions: int = 10,
        daily_loss_limit: float = 0,
        bot_id: str = "",
        position_limit: float | None = None,
    ) -> OrderResponse:
        """下单"""
        symbol = self._normalize_symbol_for_ccxt(request.symbol)
        snapped_quantity = self.snap_quantity_to_symbol(symbol, float(request.quantity or 0.0))
        if snapped_quantity <= 0 and float(request.quantity or 0.0) > 0 and self._reload_symbol_market_constraints(symbol):
            snapped_quantity = self.snap_quantity_to_symbol(symbol, float(request.quantity or 0.0))
        if snapped_quantity <= 0:
            return OrderResponse(
                success=False,
                symbol=symbol,
                side=request.side.value,
                quantity=0.0,
                status="SIZE_FAILED",
                message="规格贴合后达不到最小下单单位",
            )
        reference_price = float(request.price or 0.0)
        if reference_price <= 0 and self.exchange_name == "ctrader":
            reference_price = float(self.exchange.get_market_price(symbol) or 0.0)
        symbol_constraints = self.get_symbol_constraints(symbol)
        min_notional = float(symbol_constraints.get("min_notional") or 0.0)
        if min_notional > 0 and reference_price > 0:
            snapped_notional = self.quantity_to_account_notional(symbol, snapped_quantity, reference_price)
            if snapped_notional + 1e-9 < min_notional:
                return OrderResponse(
                    success=False,
                    symbol=symbol,
                    side=request.side.value,
                    quantity=0.0,
                    status="SIZE_FAILED",
                    message=f"规格贴合后名义价值 ${snapped_notional:.4f} 小于最小成交额 ${min_notional:.4f}",
                )
        if abs(snapped_quantity - float(request.quantity or 0.0)) > 1e-12:
            logger.info(
                "下单数量已按交易所规格贴合: %s %s -> %s",
                symbol,
                request.quantity,
                snapped_quantity,
            )
        price_update: dict[str, Any] = {"quantity": snapped_quantity}
        if request.price:
            price_update["price"] = self.snap_price_to_symbol(symbol, float(request.price), side=request.side.value)
        if request.stop_loss:
            protective_side = OrderSide.SELL.value if request.side == OrderSide.BUY else OrderSide.BUY.value
            price_update["stop_loss"] = self.snap_price_to_symbol(symbol, float(request.stop_loss), side=protective_side)
        if request.take_profit:
            protective_side = OrderSide.SELL.value if request.side == OrderSide.BUY else OrderSide.BUY.value
            price_update["take_profit"] = self.snap_price_to_symbol(symbol, float(request.take_profit), side=protective_side)
        request = request.model_copy(update=price_update)
        exchange_block = self.get_exchange_block_status()
        if exchange_block.get("blocked") and not request.reduce_only:
            reason = str(exchange_block.get("reason") or exchange_block.get("code") or "EXCHANGE_BLOCKED")
            return OrderResponse(
                success=False,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                status="EXCHANGE_BLOCKED",
                message=f"交易所阻断: {reason}",
            )

        positions = await self.get_positions()
        estimated_price = request.price or 0
        if self.exchange_name == "ctrader" and estimated_price <= 0:
            estimated_price = float(self.exchange.get_market_price(symbol) or 0)
        position_size = self.quantity_to_account_notional(
            symbol,
            request.quantity,
            estimated_price,
        )

        if not request.reduce_only and request.signal_source != "claude-pa":
            bal_res = await self.get_balance()
            total_bal = bal_res[0].balance if bal_res else 0

            current_price = request.price
            if not current_price:
                try:
                    ticker = self.exchange.fetch_ticker(symbol)
                    current_price = float(ticker["last"])
                except Exception:
                    current_price = 0.0

            effective_bot = bot_id or request.bot_id or ""
            if effective_bot:
                bot_positions = []
                bot_syms = self.get_bot_symbols(effective_bot)
                for p in positions:
                    pos_bot = self.get_position_bot_id(p.symbol)
                    if pos_bot == effective_bot:
                        bot_positions.append(p)
                    elif pos_bot is None:
                        if self._norm_symbol_base(p.symbol) in bot_syms:
                            bot_positions.append(p)
            else:
                bot_positions = positions

            _ = total_bal
            _ = current_price
            _ = bot_positions

        ok, msg = self.risk_manager.check_can_open(
            position_size,
            len(positions),
            max_positions=max_positions,
            daily_loss_limit=daily_loss_limit,
            bot_id=bot_id or request.bot_id or "",
            max_position_size_override=position_limit,
        )
        if not ok and not request.reduce_only and request.signal_source != "claude-pa":
            return OrderResponse(
                success=False,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                status="REJECTED",
                message=f"风控拒绝: {msg}",
            )

        duplicate_state = await self._detect_duplicate_entry_state(request, positions)
        if duplicate_state is not None:
            logger.info(
                "执行侧幂等防护生效: %s %s %s",
                request.symbol,
                request.side.value,
                duplicate_state.message,
            )
            return duplicate_state

        if request.leverage:
            await self.set_leverage(symbol, request.leverage)

        if self.exchange_name == "ctrader":
            try:
                order_type = "LIMIT" if request.order_type == OrderType.LIMIT else "MARKET"
                attach_stop_loss = request.stop_loss if order_type != "MARKET" else None
                attach_take_profit = request.take_profit if order_type != "MARKET" else None
                order = self.exchange.place_order(
                    symbol=symbol,
                    side=request.side.value,
                    quantity=request.quantity,
                    order_type=order_type,
                    price=request.price,
                    stop_loss=attach_stop_loss,
                    take_profit=attach_take_profit,
                )
                if (
                    not order.get("success")
                    and str(order.get("error") or "").upper() == "INVALID_REQUEST"
                    and (attach_stop_loss is not None or attach_take_profit is not None)
                ):
                    logger.warning(
                        "cTrader 市价单附带 SL/TP 被拒绝，回退为先开仓后补改: %s %s",
                        symbol,
                        order.get("error"),
                    )
                    order = self.exchange.place_order(
                        symbol=symbol,
                        side=request.side.value,
                        quantity=request.quantity,
                        order_type=order_type,
                        price=request.price,
                        stop_loss=None,
                        take_profit=None,
                    )
                if not order.get("success"):
                    return OrderResponse(
                        success=False,
                        symbol=symbol,
                        side=request.side.value,
                        quantity=request.quantity,
                        status="FAILED",
                        message=str(order.get("error") or "cTrader 下单失败"),
                    )

                order_id = str(order.get("order_id") or "")
                strat = request.strategy or request.signal_source or "auto"
                if request.bot_id:
                    self._register_order(order_id, request.bot_id, symbol, strategy=strat)
                    if not request.reduce_only:
                        self.register_position(
                            symbol,
                            request.bot_id,
                            strategy=strat,
                            quantity=request.quantity,
                            side=request.side.value,
                        )
                        await self._sync_bot_margin_state(request.bot_id)

                native_protection_result: dict[str, Any] | None = None
                if not request.reduce_only and (request.stop_loss is not None or request.take_profit is not None):
                    target_position_id = order.get("position_id")
                    for _attempt in range(3):
                        native_protection_result = self.exchange.modify_position(
                            symbol,
                            stop_loss=request.stop_loss,
                            take_profit=request.take_profit,
                            position_id=target_position_id,
                        )
                        if native_protection_result.get("success"):
                            verification = await self._verify_ctrader_position_protection(
                                symbol,
                                position_id=target_position_id,
                                stop_loss=request.stop_loss,
                                take_profit=request.take_profit,
                            )
                            native_protection_result["verification"] = verification
                            if verification.get("success"):
                                break
                            native_protection_result = {
                                "success": False,
                                "error": verification.get("error") or "保护位回读校验失败",
                                "verification": verification,
                            }
                        await asyncio.sleep(0.4)
                    if not native_protection_result or not native_protection_result.get("success"):
                        logger.warning(
                            "cTrader 开仓后补改 SL/TP 失败: %s",
                            (native_protection_result or {}).get("error"),
                        )

                logger.info(
                    "cTrader 订单已提交: %s %s %s @ %s [bot=%s]",
                    symbol,
                    request.side.value,
                    request.quantity,
                    order.get("filled_price") or request.price or "MARKET",
                    request.bot_id or "unknown",
                )
                return OrderResponse(
                    success=True,
                    order_id=order_id,
                    symbol=symbol,
                    side=request.side.value,
                    quantity=request.quantity,
                    price=float(order.get("filled_price")) if order.get("filled_price") is not None else request.price,
                    status="PLACED",
                    message=None,
                    stop_loss_order_id=(
                        "native_position"
                        if (native_protection_result or {}).get("success") and request.stop_loss is not None
                        else None
                    ),
                    take_profit_order_id=(
                        "native_position"
                        if (native_protection_result or {}).get("success") and request.take_profit is not None
                        else None
                    ),
                    bot_id=request.bot_id,
                )
            except Exception as e:
                logger.error(f"cTrader 下单失败: {e}")
                return OrderResponse(
                    success=False,
                    symbol=symbol,
                    side=request.side.value,
                    quantity=request.quantity,
                    status="FAILED",
                    message=str(e),
                )

        def build_order_params(current_request: OrderRequest) -> dict[str, Any]:
            params: dict[str, Any] = {
                "symbol": symbol,
                "type": current_request.order_type.value.lower(),
                "side": current_request.side.value.lower(),
                "amount": current_request.quantity,
            }

            if current_request.order_type == OrderType.LIMIT and current_request.price:
                params["price"] = current_request.price
            elif current_request.order_type == OrderType.STOP_MARKET:
                trigger_price = current_request.price or current_request.stop_loss
                if not trigger_price:
                    raise ValueError("STOP_MARKET 缺少触发价(price)")
                params.setdefault("params", {})["stopPrice"] = trigger_price
            elif current_request.order_type == OrderType.TAKE_PROFIT_MARKET:
                trigger_price = current_request.price or current_request.take_profit
                if not trigger_price:
                    raise ValueError("TAKE_PROFIT_MARKET 缺少触发价(price)")
                params.setdefault("params", {})["stopPrice"] = trigger_price

            if current_request.reduce_only:
                params.setdefault("params", {})["reduceOnly"] = True

            if current_request.bot_id:
                client_id = f"AB_{current_request.bot_id}_{int(time.time())}"
                params.setdefault("params", {})["newClientOrderId"] = client_id

            if native_attach_supported and not current_request.reduce_only:
                if current_request.stop_loss:
                    params.setdefault("params", {})["stopLoss"] = {
                        "triggerPrice": current_request.stop_loss,
                        "type": "market",
                    }
                if current_request.take_profit:
                    params.setdefault("params", {})["takeProfit"] = {
                        "triggerPrice": current_request.take_profit,
                        "type": "market",
                    }
            return params

        try:
            native_attach_supported = self.exchange_name == "okx"
            order_params = build_order_params(request)
            try:
                order = self._call_with_time_sync("create_order", self.exchange.create_order, **order_params)
            except Exception as first_exc:
                if not self._is_precision_or_size_error(first_exc):
                    raise
                logger.warning("下单命中规格错误，准备刷新市场约束后重试: %s %s", symbol, first_exc)
                self._reload_symbol_market_constraints(symbol)
                refreshed_request = request.model_copy(
                    update={
                        "quantity": self.snap_quantity_to_symbol(symbol, float(request.quantity or 0.0)),
                        "price": self.snap_price_to_symbol(symbol, float(request.price), side=request.side.value) if request.price else request.price,
                        "stop_loss": self.snap_price_to_symbol(symbol, float(request.stop_loss), side=(OrderSide.SELL.value if request.side == OrderSide.BUY else OrderSide.BUY.value)) if request.stop_loss else request.stop_loss,
                        "take_profit": self.snap_price_to_symbol(symbol, float(request.take_profit), side=(OrderSide.SELL.value if request.side == OrderSide.BUY else OrderSide.BUY.value)) if request.take_profit else request.take_profit,
                    }
                )
                if float(refreshed_request.quantity or 0.0) <= 0:
                    return OrderResponse(
                        success=False,
                        symbol=symbol,
                        side=request.side.value,
                        quantity=0.0,
                        status="SIZE_FAILED",
                        message="刷新规格后达不到最小下单单位",
                    )
                request = refreshed_request
                order_params = build_order_params(request)
                order = self._call_with_time_sync("create_order_retry_constraints", self.exchange.create_order, **order_params)
            self._clear_exchange_block_state("BINANCE_REGION_RESTRICTED")

            order_id = str(order.get("id"))

            if request.bot_id:
                strat = request.strategy or request.signal_source or "auto"
                self._register_order(order_id, request.bot_id, symbol, strategy=strat)
                if not request.reduce_only:
                    self.register_position(
                        symbol,
                        request.bot_id,
                        strategy=strat,
                        quantity=request.quantity,
                        side=request.side.value,
                    )
                    await self._sync_bot_margin_state(request.bot_id)

            response = OrderResponse(
                success=True,
                order_id=order_id,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                price=float(order.get("price", 0)) if order.get("price") else None,
                status=order.get("status") or "NEW",
                bot_id=request.bot_id,
            )

            sl_embedded = bool(native_attach_supported and request.stop_loss and not request.reduce_only)
            tp_embedded = bool(native_attach_supported and request.take_profit and not request.reduce_only)

            if sl_embedded:
                response.stop_loss_order_id = "embedded_native"
                logger.info(f"原生止损已嵌入主订单: {symbol} sl={request.stop_loss}")
            if tp_embedded:
                response.take_profit_order_id = "embedded_native"
                logger.info(f"原生止盈已嵌入主订单: {symbol} tp={request.take_profit}")

            logger.info(f"订单已提交: {symbol} {request.side.value} {request.quantity} @ {order.get('price', 'MARKET')} [bot={request.bot_id or 'unknown'}]")

            order_status = str(order.get("status") or "").lower()
            entry_filled = request.order_type == OrderType.MARKET or order_status in {"closed", "filled"}

            if not request.stop_loss and not request.reduce_only:
                risk_pct = 0.02
                entry_price = float(order.get("average") or order.get("price") or 0)
                if entry_price <= 0:
                    try:
                        ticker = self.exchange.fetch_ticker(symbol)
                        entry_price = float(ticker.get("last", 0))
                        logger.warning(f"entry_price 兜底: 使用 ticker.last={entry_price}")
                    except Exception as te:
                        logger.error(f"fetch_ticker 兜底失败: {te}")
                if entry_price > 0:
                    if request.side == OrderSide.BUY:
                        request.stop_loss = self.snap_price_to_symbol(symbol, entry_price * (1 - risk_pct), side=OrderSide.SELL.value)
                    else:
                        request.stop_loss = self.snap_price_to_symbol(symbol, entry_price * (1 + risk_pct), side=OrderSide.BUY.value)
                    logger.info(f"自动保护性止损: {request.stop_loss} (入场={entry_price}, risk={risk_pct*100}%)")
                    try:
                        SHARED_WORKSPACE.mkdir(parents=True, exist_ok=True)
                        sl_file = SHARED_WORKSPACE / "sl_placed.json"
                        try:
                            sl_data = json.loads(sl_file.read_text()) if sl_file.exists() else {}
                        except Exception:
                            sl_data = {}
                        norm_sym = symbol.replace("/", "")
                        sl_data[norm_sym] = request.stop_loss
                        sl_file.write_text(json.dumps(sl_data, indent=2))
                        response.stop_loss_order_id = "software_sl"
                        logger.info(f"自动保护性软件止损已记录: {norm_sym} sl={request.stop_loss}")
                    except Exception as sl_exc:
                        logger.warning(f"记录软件止损失败（不影响主订单）: {sl_exc}")

            if request.stop_loss and not sl_embedded and not request.reduce_only and entry_filled:
                try:
                    sl_side = OrderSide.SELL if request.side == OrderSide.BUY else OrderSide.BUY
                    sl_order = self._call_with_time_sync(
                        "create_stop_loss_order",
                        self.exchange.create_order,
                        symbol=symbol,
                        type="stop_market",
                        side=sl_side.value.lower(),
                        amount=request.quantity,
                        params={
                            "stopPrice": request.stop_loss,
                            "reduceOnly": True,
                        },
                    )
                    sl_id = str(sl_order.get("id"))
                    response.stop_loss_order_id = sl_id
                    if request.bot_id:
                        self._register_order(sl_id, request.bot_id, symbol, strategy=strat)
                    self._register_protection_order(
                        sl_id,
                        request.bot_id,
                        symbol,
                        strategy="sl_protect",
                        order_type="STOP_MARKET",
                        side=sl_side.value,
                        quantity=request.quantity,
                        stop_price=request.stop_loss,
                    )
                    self._clear_software_stop_record(symbol)
                    logger.info(f"止损单已设置: {symbol} sl={request.stop_loss}")
                except Exception as e:
                    self._capture_exchange_block(e)
                    logger.warning(f"止损单设置失败: {e}")

            if request.take_profit and not tp_embedded and entry_filled:
                try:
                    tp_side = OrderSide.SELL if request.side == OrderSide.BUY else OrderSide.BUY
                    live_positions = await self.get_positions()
                    live_pos = next((p for p in live_positions if self._norm_symbol_base(p.symbol) == self._norm_symbol_base(symbol)), None)
                    if live_pos and self._would_take_profit_trigger_immediately(live_pos, float(request.take_profit)):
                        tp_id, tp_note = self._place_reduce_only_take_profit_limit(
                            symbol,
                            side=tp_side,
                            quantity=request.quantity,
                            target_price=float(request.take_profit),
                            current_price=float(live_pos.mark_price or live_pos.entry_price or 0.0),
                            bot_id=request.bot_id,
                            strategy="tp_protect",
                        )
                        response.take_profit_order_id = tp_id
                        logger.warning(
                            "止盈单改用 LIMIT 兜底：%s tp=%s mark=%s note=%s",
                            symbol,
                            request.take_profit,
                            live_pos.mark_price,
                            tp_note,
                        )
                    else:
                        tp_order = self._call_with_time_sync(
                            "create_take_profit_order",
                            self.exchange.create_order,
                            symbol=symbol,
                            type="take_profit_market",
                            side=tp_side.value.lower(),
                            amount=request.quantity,
                            params={
                                "stopPrice": request.take_profit,
                                "reduceOnly": True,
                            },
                        )
                        tp_id = str(tp_order.get("id"))
                        response.take_profit_order_id = tp_id
                        if request.bot_id:
                            self._register_order(tp_id, request.bot_id, symbol, strategy=strat)
                        self._register_protection_order(
                            tp_id,
                            request.bot_id,
                            symbol,
                            strategy="tp_protect",
                            order_type="TAKE_PROFIT_MARKET",
                            side=tp_side.value,
                            quantity=request.quantity,
                            stop_price=request.take_profit,
                        )
                        logger.info(f"止盈单已设置: {request.take_profit}")
                except Exception as e:
                    self._capture_exchange_block(e)
                    logger.warning(f"止盈单设置失败: {e}")

            return response

        except Exception as e:
            block = self._capture_exchange_block(e)
            logger.error(f"下单失败: {e}")
            return OrderResponse(
                success=False,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                status="BLOCKED" if block else "FAILED",
                message=(f"{block['code']}: {block['reason']}" if block else str(e)),
            )

    async def close_position(self, symbol: str, quantity: Optional[float] = None, bot_id: str = None) -> OrderResponse:
        """平仓 — V3.9.3: per-bot 数量平仓 + 只注销自己"""
        try:
            positions = await self.get_positions()
            norm_input = self._norm_symbol_base(symbol)
            pos = next((p for p in positions if self._norm_symbol_base(p.symbol) == norm_input), None)

            if not pos:
                return OrderResponse(
                    success=False,
                    symbol=symbol,
                    side="",
                    quantity=0,
                    status="NOT_FOUND",
                    message=f"未找到 {symbol} 持仓",
                )

            close_side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY

            if bot_id and not quantity:
                bot_qty = self._get_bot_registered_quantity(symbol, bot_id)
                if bot_qty > 0:
                    close_qty = min(bot_qty, pos.quantity)
                    logger.info(f"per-bot 平仓: {bot_id} 注册 {bot_qty}, 物理 {pos.quantity}, 平 {close_qty}")
                else:
                    close_qty = pos.quantity
                    logger.warning(f"per-bot 平仓: {bot_id} 无注册数量, 平全部 {pos.quantity}")
            else:
                close_qty = quantity or pos.quantity

            effective_bot = bot_id or self.get_position_bot_id(symbol)
            effective_strategy = self.get_position_strategy(symbol, effective_bot)
            close_qty = min(close_qty, pos.quantity)
            close_qty = self.snap_close_quantity_to_symbol(symbol, close_qty, held_quantity=pos.quantity)
            if close_qty <= 0:
                return OrderResponse(
                    success=False,
                    symbol=pos.symbol,
                    side=close_side.value,
                    quantity=0.0,
                    status="SKIPPED",
                    message="当前数量贴合后达不到最小平仓单位",
                    bot_id=effective_bot,
                )
            full_close = close_qty >= max(pos.quantity - 1e-8, 0.0)
            remaining_qty = max(pos.quantity - close_qty, 0.0)

            if self.exchange_name == "ctrader":
                response = self.exchange.close_position(pos.symbol, close_qty)
                if response.get("success"):
                    if effective_bot:
                        self.risk_manager.record_bot_pnl(effective_bot, pos.unrealized_pnl)
                    else:
                        self.risk_manager.record_pnl(pos.unrealized_pnl)

                    if full_close:
                        if effective_bot:
                            self.unregister_position(symbol, effective_bot)
                        else:
                            self.unregister_position(symbol)
                        try:
                            self.exchange.cancel_all_orders(pos.symbol)
                        except Exception:
                            pass
                        self._drop_registered_protection_orders_by_symbol(pos.symbol)
                        self._clear_software_stop_record(pos.symbol)
                    else:
                        if effective_bot:
                            self.register_position(
                                symbol,
                                effective_bot,
                                strategy=effective_strategy,
                                quantity=remaining_qty,
                                side=pos.side.value,
                            )
                    if effective_bot:
                        await self._sync_bot_margin_state(effective_bot)
                    return OrderResponse(
                        success=True,
                        order_id=str(response.get("order_id") or ""),
                        symbol=pos.symbol,
                        side=close_side.value,
                        quantity=close_qty,
                        price=float(response.get("filled_price")) if response.get("filled_price") is not None else None,
                        status="CLOSED" if full_close else "PARTIAL_CLOSED",
                        message=None if full_close else "部分平仓成功，保留原生保护位",
                        bot_id=effective_bot,
                    )
                return OrderResponse(
                    success=False,
                    symbol=pos.symbol,
                    side=close_side.value,
                    quantity=close_qty,
                    status="FAILED",
                    message=str(response.get("error") or "cTrader 平仓失败"),
                )

            request = OrderRequest(
                symbol=symbol,
                side=close_side,
                quantity=close_qty,
                order_type=OrderType.MARKET,
                reduce_only=True,
            )

            response = await self.place_order(request)

            if response.success:
                if effective_bot:
                    self.risk_manager.record_bot_pnl(effective_bot, pos.unrealized_pnl)
                else:
                    self.risk_manager.record_pnl(pos.unrealized_pnl)
                if full_close:
                    if effective_bot:
                        self.unregister_position(symbol, effective_bot)
                        logger.info(f"注销 {effective_bot} 在 {symbol} 的持仓归属")
                    else:
                        self.unregister_position(symbol)

                    try:
                        sl_file = SHARED_WORKSPACE / "sl_placed.json"
                        if sl_file.exists():
                            sl_data = json.loads(sl_file.read_text())
                            norm_sym = symbol.replace("/", "")
                            if norm_sym in sl_data:
                                del sl_data[norm_sym]
                                sl_file.write_text(json.dumps(sl_data, indent=2))
                                logger.info(f"平仓后清理软件止损: {norm_sym}")
                    except Exception as e_clean:
                        logger.warning(f"平仓后清理止损记录失败: {e_clean}")
                    try:
                        self.exchange.cancel_all_orders(symbol)
                        logger.info(f"平仓后取消 {symbol} 所有挂单")
                    except Exception:
                        pass
                    self._drop_registered_protection_orders_by_symbol(symbol)
                    self._clear_software_stop_record(symbol)
                else:
                    if effective_bot:
                        self.register_position(
                            symbol,
                            effective_bot,
                            strategy=effective_strategy,
                            quantity=remaining_qty,
                            side=pos.side.value,
                        )
                    rebuild_result = await self._rebuild_reduce_only_protection_orders(
                        pos,
                        remaining_qty,
                        effective_bot,
                    )
                    if not rebuild_result.get("success"):
                        logger.warning("部分平仓后重建保护单失败 %s: %s", symbol, rebuild_result)
                    else:
                        logger.info("部分平仓后已重建保护单 %s: %s", symbol, rebuild_result)

            if response.success and effective_bot:
                await self._sync_bot_margin_state(effective_bot)

            if response.success and not full_close:
                response.status = "PARTIAL_CLOSED"
                if not response.message:
                    response.message = "部分平仓成功，保护单已按剩余仓位重建"

            return response

        except Exception as e:
            logger.error(f"平仓失败: {e}")
            return OrderResponse(
                success=False,
                symbol=symbol,
                side="",
                quantity=0,
                status="FAILED",
                message=str(e),
            )

    async def modify_stop_loss(self, symbol: str, new_stop_loss: float, bot_id: str = None) -> dict:
        """修改止损：优先使用交易所原生保护单。"""
        try:
            positions = await self.get_positions()
            norm_input = self._norm_symbol_base(symbol)
            pos = next((p for p in positions if self._norm_symbol_base(p.symbol) == norm_input), None)
            if not pos:
                return {
                    "success": False,
                    "status": "NOT_FOUND",
                    "symbol": symbol,
                    "message": f"未找到 {symbol} 持仓",
                }

            if self.exchange_name == "ctrader":
                result = self.exchange.modify_position(
                    pos.symbol,
                    stop_loss=new_stop_loss,
                    take_profit=pos.take_profit,
                    position_id=pos.position_id,
                )
                if result.get("success"):
                    verification = await self._verify_ctrader_position_protection(
                        pos.symbol,
                        position_id=pos.position_id,
                        stop_loss=new_stop_loss,
                        take_profit=pos.take_profit,
                    )
                    if not verification.get("success"):
                        return {
                            "success": False,
                            "status": "FAILED",
                            "symbol": symbol,
                            "message": str(verification.get("error") or "cTrader 止损回读校验失败"),
                        }
                    logger.info("cTrader 止损已更新: %s -> %s", pos.symbol, new_stop_loss)
                    return {
                        "success": True,
                        "status": "MODIFIED",
                        "symbol": symbol,
                        "old_stop_loss_orders": [],
                        "new_stop_loss": new_stop_loss,
                        "new_order_id": None,
                    }
                return {
                    "success": False,
                    "status": "FAILED",
                    "symbol": symbol,
                    "message": str(result.get("error") or "cTrader 修改止损失败"),
                }

            pos_symbol = pos.symbol
            new_stop_loss = self.snap_price_to_symbol(
                pos_symbol,
                float(new_stop_loss or 0.0),
                side=OrderSide.SELL.value if pos.side == PositionSide.LONG else OrderSide.BUY.value,
            )
            sl_side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY
            open_orders = await self.get_open_orders(pos_symbol)
            relevant_orders, matching_orders = self._matching_reduce_only_orders(
                open_orders,
                side=sl_side.value,
                order_types={"STOP_MARKET", "STOP"},
                stop_price=new_stop_loss,
                quantity=pos.quantity,
            )
            if matching_orders:
                keep_order = self._select_latest_open_order(matching_orders)
                cancelled_duplicates: list[str] = []
                for order in relevant_orders:
                    if keep_order and order.order_id == keep_order.order_id:
                        continue
                    try:
                        self._call_with_time_sync("cancel_stop_loss_order", self.exchange.cancel_order, order.order_id, self._normalize_symbol_for_ccxt(pos_symbol))
                        cancelled_duplicates.append(order.order_id)
                        self._drop_order_tracking(order.order_id)
                    except Exception as cancel_exc:
                        if self._is_unknown_order_error(cancel_exc):
                            self._drop_order_tracking(order.order_id)
                        logger.warning("去重止损单失败 %s: %s", order.order_id, cancel_exc)
                if keep_order is not None:
                    if cancelled_duplicates:
                        logger.info("止损保护单已去重: 保留 %s, 清理 %s", keep_order.order_id, cancelled_duplicates)
                    else:
                        logger.info("止损未变化，跳过重复改单: %s -> %s", pos_symbol, new_stop_loss)
                    return {
                        "success": True,
                        "status": "UNCHANGED",
                        "symbol": symbol,
                        "old_stop_loss_orders": cancelled_duplicates or [keep_order.order_id],
                        "new_stop_loss": new_stop_loss,
                        "new_order_id": keep_order.order_id,
                    }
            if len(relevant_orders) == 1 and len(matching_orders) == 1:
                logger.info("止损未变化，跳过重复改单: %s -> %s", pos_symbol, new_stop_loss)
                return {
                    "success": True,
                    "status": "UNCHANGED",
                    "symbol": symbol,
                    "old_stop_loss_orders": [matching_orders[0].order_id],
                    "new_stop_loss": new_stop_loss,
                    "new_order_id": matching_orders[0].order_id,
                }
            cancelled: list[str] = []
            ccxt_symbol = self._normalize_symbol_for_ccxt(pos_symbol)
            for order in relevant_orders:
                try:
                    self._call_with_time_sync("cancel_stop_loss_order", self.exchange.cancel_order, order.order_id, ccxt_symbol)
                    cancelled.append(order.order_id)
                    self._drop_order_tracking(order.order_id)
                except Exception as cancel_exc:
                    if self._is_unknown_order_error(cancel_exc):
                        self._drop_order_tracking(order.order_id)
                    logger.warning(f"取消旧止损单失败 {order.order_id}: {cancel_exc}")

            sl_order = self._call_with_time_sync(
                "create_stop_loss_order",
                self.exchange.create_order,
                symbol=ccxt_symbol,
                type="stop_market",
                side=sl_side.value.lower(),
                amount=pos.quantity,
                params={
                    "stopPrice": new_stop_loss,
                    "reduceOnly": True,
                },
            )
            sl_order_id = str(sl_order.get("id") or "")
            effective_bot = bot_id or self.get_position_bot_id(pos_symbol)
            if bot_id:
                self._register_order(sl_order_id, bot_id, ccxt_symbol, strategy="sl_adjust")
            elif effective_bot:
                self._register_order(sl_order_id, effective_bot, ccxt_symbol, strategy="sl_adjust")
            self._register_protection_order(
                sl_order_id,
                effective_bot,
                pos_symbol,
                strategy="sl_adjust",
                order_type="STOP_MARKET",
                side=sl_side.value,
                quantity=pos.quantity,
                stop_price=new_stop_loss,
            )
            self._clear_software_stop_record(pos_symbol)

            logger.info(f"止损已更新: {pos_symbol} -> {new_stop_loss} (cancelled={cancelled})")
            return {
                "success": True,
                "status": "MODIFIED",
                "symbol": symbol,
                "old_stop_loss_orders": cancelled,
                "new_stop_loss": new_stop_loss,
                "new_order_id": sl_order_id,
            }
        except Exception as e:
            logger.error(f"修改止损失败: {e}")
            return {
                "success": False,
                "status": "FAILED",
                "symbol": symbol,
                "message": str(e),
            }

    async def modify_take_profit(self, symbol: str, new_take_profit: float, bot_id: str = None) -> dict:
        """修改止盈：取消现有 reduce-only TP 单并重建。"""
        try:
            positions = await self.get_positions()
            norm_input = self._norm_symbol_base(symbol)
            pos = next((p for p in positions if self._norm_symbol_base(p.symbol) == norm_input), None)
            if not pos:
                return {
                    "success": False,
                    "status": "NOT_FOUND",
                    "symbol": symbol,
                    "message": f"未找到 {symbol} 持仓",
                }

            if self.exchange_name == "ctrader":
                result = self.exchange.modify_position(
                    pos.symbol,
                    stop_loss=pos.stop_loss,
                    take_profit=new_take_profit,
                    position_id=pos.position_id,
                )
                if result.get("success"):
                    verification = await self._verify_ctrader_position_protection(
                        pos.symbol,
                        position_id=pos.position_id,
                        stop_loss=pos.stop_loss,
                        take_profit=new_take_profit,
                    )
                    if not verification.get("success"):
                        return {
                            "success": False,
                            "status": "FAILED",
                            "symbol": symbol,
                            "message": str(verification.get("error") or "cTrader 止盈回读校验失败"),
                        }
                    logger.info("cTrader 止盈已更新: %s -> %s", pos.symbol, new_take_profit)
                    return {
                        "success": True,
                        "status": "MODIFIED",
                        "symbol": symbol,
                        "old_take_profit_orders": [],
                        "new_take_profit": new_take_profit,
                        "new_order_id": None,
                    }
                return {
                    "success": False,
                    "status": "FAILED",
                    "symbol": symbol,
                    "message": str(result.get("error") or "cTrader 修改止盈失败"),
                }

            pos_symbol = pos.symbol
            new_take_profit = self.snap_price_to_symbol(
                pos_symbol,
                float(new_take_profit or 0.0),
                side=OrderSide.SELL.value if pos.side == PositionSide.LONG else OrderSide.BUY.value,
            )
            tp_side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY
            open_orders = await self.get_open_orders(pos_symbol)
            relevant_orders, matching_orders = self._matching_reduce_only_orders(
                open_orders,
                side=tp_side.value,
                order_types={"TAKE_PROFIT_MARKET", "TAKE_PROFIT", "LIMIT"},
                stop_price=new_take_profit,
                quantity=pos.quantity,
            )
            if matching_orders:
                keep_order = self._select_latest_open_order(matching_orders)
                cancelled_duplicates: list[str] = []
                for order in relevant_orders:
                    if keep_order and order.order_id == keep_order.order_id:
                        continue
                    try:
                        self._call_with_time_sync("cancel_take_profit_order", self.exchange.cancel_order, order.order_id, self._normalize_symbol_for_ccxt(pos_symbol))
                        cancelled_duplicates.append(order.order_id)
                        self._drop_order_tracking(order.order_id)
                    except Exception as cancel_exc:
                        if self._is_unknown_order_error(cancel_exc):
                            self._drop_order_tracking(order.order_id)
                        logger.warning("去重止盈单失败 %s: %s", order.order_id, cancel_exc)
                if keep_order is not None:
                    if cancelled_duplicates:
                        logger.info("止盈保护单已去重: 保留 %s, 清理 %s", keep_order.order_id, cancelled_duplicates)
                    else:
                        logger.info("止盈未变化，跳过重复改单: %s -> %s", pos_symbol, new_take_profit)
                    return {
                        "success": True,
                        "status": "UNCHANGED",
                        "symbol": symbol,
                        "old_take_profit_orders": cancelled_duplicates or [keep_order.order_id],
                        "new_take_profit": new_take_profit,
                        "new_order_id": keep_order.order_id,
                    }
            if len(relevant_orders) == 1 and len(matching_orders) == 1:
                logger.info("止盈未变化，跳过重复改单: %s -> %s", pos_symbol, new_take_profit)
                return {
                    "success": True,
                    "status": "UNCHANGED",
                    "symbol": symbol,
                    "old_take_profit_orders": [matching_orders[0].order_id],
                    "new_take_profit": new_take_profit,
                    "new_order_id": matching_orders[0].order_id,
                }
            cancelled: list[str] = []
            ccxt_symbol = self._normalize_symbol_for_ccxt(pos_symbol)
            for order in relevant_orders:
                try:
                    self._call_with_time_sync("cancel_take_profit_order", self.exchange.cancel_order, order.order_id, ccxt_symbol)
                    cancelled.append(order.order_id)
                    self._drop_order_tracking(order.order_id)
                except Exception as cancel_exc:
                    if self._is_unknown_order_error(cancel_exc):
                        self._drop_order_tracking(order.order_id)
                    logger.warning(f"取消旧止盈单失败 {order.order_id}: {cancel_exc}")
            if cancelled:
                await asyncio.sleep(0.4)

            if self._would_take_profit_trigger_immediately(pos, float(new_take_profit)):
                return {
                    "success": True,
                    "status": "SKIPPED",
                    "symbol": symbol,
                    "old_take_profit_orders": cancelled,
                    "new_take_profit": new_take_profit,
                    "new_order_id": None,
                    "message": "TAKE_PROFIT_WOULD_TRIGGER_IMMEDIATELY",
                }

            try:
                tp_order = self._call_with_time_sync(
                    "create_take_profit_order",
                    self.exchange.create_order,
                    symbol=ccxt_symbol,
                    type="take_profit_market",
                    side=tp_side.value.lower(),
                    amount=pos.quantity,
                    params={
                        "stopPrice": new_take_profit,
                        "reduceOnly": True,
                    },
                )
            except Exception as tp_exc:
                if not self._is_max_stop_order_limit_error(tp_exc):
                    raise
                logger.warning("止盈改单命中保护单上限，等待后重试: %s", pos_symbol)
                await asyncio.sleep(0.8)
                try:
                    tp_order = self._call_with_time_sync(
                        "create_take_profit_order_retry",
                        self.exchange.create_order,
                        symbol=ccxt_symbol,
                        type="take_profit_market",
                        side=tp_side.value.lower(),
                        amount=pos.quantity,
                        params={
                            "stopPrice": new_take_profit,
                            "reduceOnly": True,
                        },
                    )
                except Exception as retry_exc:
                    if not self._is_max_stop_order_limit_error(retry_exc):
                        raise
                    tp_order_id, tp_note = self._place_reduce_only_take_profit_limit(
                        pos_symbol,
                        side=tp_side,
                        quantity=pos.quantity,
                        target_price=float(new_take_profit),
                        current_price=float(pos.mark_price or pos.entry_price or 0.0),
                        bot_id=bot_id,
                        strategy="tp_adjust",
                    )
                    logger.warning(
                        "止盈改单在保护单上限下改用 LIMIT 兜底：%s tp=%s mark=%s note=%s",
                        pos_symbol,
                        new_take_profit,
                        pos.mark_price,
                        tp_note,
                    )
                    return {
                        "success": True,
                        "status": "MODIFIED",
                        "symbol": symbol,
                        "old_take_profit_orders": cancelled,
                        "new_take_profit": new_take_profit,
                        "new_order_id": tp_order_id,
                        "message": tp_note,
                    }
            tp_order_id = str(tp_order.get("id") or "")
            effective_bot = bot_id or self.get_position_bot_id(pos_symbol)
            if bot_id:
                self._register_order(tp_order_id, bot_id, ccxt_symbol, strategy="tp_adjust")
            elif effective_bot:
                self._register_order(tp_order_id, effective_bot, ccxt_symbol, strategy="tp_adjust")
            self._register_protection_order(
                tp_order_id,
                effective_bot,
                pos_symbol,
                strategy="tp_adjust",
                order_type="TAKE_PROFIT_MARKET",
                side=tp_side.value,
                quantity=pos.quantity,
                stop_price=new_take_profit,
            )

            logger.info(f"止盈已更新: {pos_symbol} -> {new_take_profit} (cancelled={cancelled})")
            return {
                "success": True,
                "status": "MODIFIED",
                "symbol": symbol,
                "old_take_profit_orders": cancelled,
                "new_take_profit": new_take_profit,
                "new_order_id": tp_order_id,
            }
        except Exception as e:
            logger.error(f"修改止盈失败: {e}")
            return {
                "success": False,
                "status": "FAILED",
                "symbol": symbol,
                "message": str(e),
            }

    async def cancel_all_orders(self, symbol: Optional[str] = None) -> bool:
        """取消所有订单"""
        try:
            if self.exchange_name == "ctrader":
                result = self.exchange.cancel_all_orders(symbol)
                ok = bool(result.get("success"))
                if ok:
                    logger.info("cTrader 已取消挂单 (symbol=%s)", symbol or "ALL")
                    if symbol:
                        self._drop_registered_protection_orders_by_symbol(symbol)
                else:
                    logger.warning("cTrader 取消挂单失败: %s", result.get("error"))
                return ok
            if symbol:
                self._call_with_time_sync("cancel_all_orders", self.exchange.cancel_all_orders, self._normalize_symbol_for_ccxt(symbol))
                try:
                    SHARED_WORKSPACE.mkdir(parents=True, exist_ok=True)
                    sl_file = SHARED_WORKSPACE / "sl_placed.json"
                    if sl_file.exists():
                        sl_data = json.loads(sl_file.read_text())
                        norm_sym = self._normalize_symbol_for_ccxt(symbol).replace("/", "")
                        if norm_sym in sl_data:
                            del sl_data[norm_sym]
                            sl_file.write_text(json.dumps(sl_data, indent=2))
                            logger.info(f"撤单后清理软件止损记录: {norm_sym}")
                except Exception as clean_exc:
                    logger.warning(f"撤单后清理软件止损失败: {clean_exc}")
                self._drop_registered_protection_orders_by_symbol(symbol)
            else:
                positions = await self.get_positions()
                symbols_to_clear = {pos.symbol for pos in positions}
                for pos in positions:
                    self._call_with_time_sync("cancel_all_orders", self.exchange.cancel_all_orders, self._normalize_symbol_for_ccxt(pos.symbol))
                for target_symbol in symbols_to_clear:
                    self._drop_registered_protection_orders_by_symbol(target_symbol)
            logger.info(f"已取消所有订单 (symbol={symbol or 'ALL'})")
            return True
        except Exception as e:
            logger.error(f"取消订单失败: {e}")
            return False
