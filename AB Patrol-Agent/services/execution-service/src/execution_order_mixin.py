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

    @staticmethod
    def _sanitize_client_order_token(value: Any, max_len: int, *, keep_dash: bool = False) -> str:
        """把客户端订单号片段压到交易所安全字符集合。"""
        cleaned = "".join(
            ch
            for ch in str(value or "")
            if ch.isalnum() or (keep_dash and ch == "-")
        )
        return cleaned[:max_len]

    def _build_client_order_id(self, bot_id: str, symbol: str) -> str:
        """构造唯一且可回查的客户端订单号。"""
        bot_token = self._sanitize_client_order_token(bot_id, 9, keep_dash=True) or "bot"
        symbol_token = self._sanitize_client_order_token(self._norm_symbol_base(symbol).upper(), 6) or "SYMBOL"
        timestamp_token = str(int(time.time() * 1000))
        nonce_token = f"{time.time_ns() % 100:02d}"
        return f"AB_{bot_token}_{symbol_token}_{timestamp_token}{nonce_token}"[:36]

    @staticmethod
    def _normalize_exchange_order_status(value: Any) -> str:
        """统一交易所订单状态字符串，便于二次确认。"""
        return str(value or "").strip().lower()

    def _binance_market_id(self, symbol: str) -> str:
        """把标准 symbol 转成币安原生 market id。"""
        market = self._load_market_descriptor(symbol)
        market_id = str(market.get("id") or "").upper().replace(":", "")
        if not market_id:
            market_id = self._norm_symbol_base(symbol).upper()
        return market_id

    @staticmethod
    def _order_matches_identifier(order: Any, order_id: str = "", client_order_id: str = "") -> bool:
        """同时兼容 orderId 与 clientOrderId 两种回查口径。"""
        payload = order if isinstance(order, dict) else {}
        info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
        order_id_text = str(order_id or "").strip()
        client_order_id_text = str(client_order_id or "").strip()
        if order_id_text:
            candidates = (
                payload.get("id"),
                payload.get("orderId"),
                payload.get("algoId"),
                info.get("orderId"),
                info.get("algoId"),
                info.get("id"),
            )
            if any(str(candidate or "").strip() == order_id_text for candidate in candidates):
                return True
        if client_order_id_text:
            candidates = (
                payload.get("clientOrderId"),
                payload.get("clientAlgoId"),
                payload.get("client_order_id"),
                info.get("clientOrderId"),
                info.get("clientAlgoId"),
                info.get("origClientOrderId"),
            )
            if any(str(candidate or "").strip() == client_order_id_text for candidate in candidates):
                return True
        return False

    @staticmethod
    def _extract_binance_order_status(payload: dict[str, Any]) -> str:
        """统一提取普通单 / 条件单状态。"""
        info = payload.get("info") if isinstance(payload.get("info"), dict) else {}
        raw_status = str(
            payload.get("status")
            or info.get("status")
            or payload.get("algoStatus")
            or info.get("algoStatus")
            or ""
        ).strip().upper()
        mapping = {
            "NEW": "new",
            "OPEN": "open",
            "WORKING": "open",
            "PARTIALLY_FILLED": "partially_filled",
            "FILLED": "filled",
            "CANCELED": "canceled",
            "CANCELLED": "canceled",
            "REJECTED": "rejected",
            "EXPIRED": "expired",
            "FINISHED": "filled",
        }
        return mapping.get(raw_status, str(raw_status or "").lower())

    def _load_native_binance_order(
        self,
        order_id: str,
        symbol: str,
        client_order_id: str = "",
    ) -> dict[str, Any]:
        """直接用币安原生接口回查，优先按订单号，必要时回退到 clientOrderId。"""
        native_fetch = getattr(self.exchange, "fapiPrivateGetOrder", None)
        if not callable(native_fetch):
            return {}
        market_id = self._binance_market_id(symbol)
        if not market_id or (not order_id and not client_order_id):
            return {}

        queries: list[tuple[str, dict[str, Any]]] = []
        if order_id:
            queries.append(("native_get_order", {"symbol": market_id, "orderId": order_id}))
        if client_order_id:
            queries.append(("native_get_order_by_client_id", {"symbol": market_id, "origClientOrderId": client_order_id}))

        last_error: Exception | None = None
        for op_name, params in queries:
            try:
                raw_order = self._call_with_time_sync(op_name, native_fetch, params)
            except Exception as exc:
                last_error = exc
                continue
            if not isinstance(raw_order, dict) or not raw_order:
                continue
            try:
                parsed = self.exchange.parse_order(raw_order)
                return parsed if isinstance(parsed, dict) else raw_order
            except Exception:
                return raw_order
        if last_error is not None:
            raise last_error
        return {}

    def _load_native_binance_all_orders(self, symbol: str, limit: int = 50) -> list[dict[str, Any]]:
        """直接拉取币安原生历史订单，补足 ccxt 在 demo 环境下的漏回读。"""
        native_all = getattr(self.exchange, "fapiPrivateGetAllOrders", None)
        if not callable(native_all):
            return []
        market_id = self._binance_market_id(symbol)
        if not market_id:
            return []
        raw_orders = self._call_with_time_sync(
            "native_all_orders",
            native_all,
            {"symbol": market_id, "limit": max(1, int(limit or 50))},
        )
        if not isinstance(raw_orders, list) or not raw_orders:
            return []
        parsed_orders: list[dict[str, Any]] = []
        for raw_order in raw_orders:
            if not isinstance(raw_order, dict) or not raw_order:
                continue
            try:
                parsed = self.exchange.parse_order(raw_order)
                parsed_orders.append(parsed if isinstance(parsed, dict) else raw_order)
            except Exception:
                parsed_orders.append(raw_order)
        return parsed_orders

    def _load_native_binance_algo_order(
        self,
        order_id: str,
        symbol: str,
        client_order_id: str = "",
    ) -> dict[str, Any]:
        """查询 Binance Demo 条件单。"""
        native_fetch = getattr(self.exchange, "fapiPrivateGetAlgoOrder", None)
        if not callable(native_fetch):
            return {}
        market_id = self._binance_market_id(symbol)
        if not market_id or (not order_id and not client_order_id):
            return {}
        queries: list[tuple[str, dict[str, Any]]] = []
        if order_id:
            queries.append(("native_get_algo_order", {"symbol": market_id, "algoId": order_id}))
        if client_order_id:
            queries.append(("native_get_algo_order_by_client_id", {"symbol": market_id, "clientAlgoId": client_order_id}))
        last_error: Exception | None = None
        for op_name, params in queries:
            try:
                raw_order = self._call_with_time_sync(op_name, native_fetch, params)
            except Exception as exc:
                last_error = exc
                continue
            if isinstance(raw_order, dict) and raw_order:
                return raw_order
        if last_error is not None:
            raise last_error
        return {}

    def _load_native_binance_open_algo_orders(self, symbol: str) -> list[dict[str, Any]]:
        """查询当前 Binance Demo 条件单列表。"""
        native_fetch = getattr(self.exchange, "fapiPrivateGetOpenAlgoOrders", None)
        if not callable(native_fetch):
            return []
        market_id = self._binance_market_id(symbol)
        if not market_id:
            return []
        raw_orders = self._call_with_time_sync(
            "native_get_open_algo_orders",
            native_fetch,
            {"symbol": market_id},
        )
        return raw_orders if isinstance(raw_orders, list) else []

    def _load_native_binance_all_algo_orders(self, symbol: str, limit: int = 50) -> list[dict[str, Any]]:
        """查询 Binance Demo 条件单历史。"""
        native_fetch = getattr(self.exchange, "fapiPrivateGetAllAlgoOrders", None)
        if not callable(native_fetch):
            return []
        market_id = self._binance_market_id(symbol)
        if not market_id:
            return []
        raw_orders = self._call_with_time_sync(
            "native_get_all_algo_orders",
            native_fetch,
            {"symbol": market_id, "page": 1, "pageSize": max(1, int(limit or 50))},
        )
        return raw_orders if isinstance(raw_orders, list) else []

    def _would_immediately_trigger(self, request: OrderRequest, reference_price: float, tick_size: float) -> bool:
        """在提交到交易所前拦住会立刻触发的止损触发单。"""
        if request.order_type != OrderType.STOP_MARKET:
            return False
        trigger_price = float(request.price or 0.0)
        if trigger_price <= 0 or reference_price <= 0:
            return False
        tolerance = max(tick_size, reference_price * 1e-6)
        if request.side == OrderSide.BUY:
            return trigger_price <= reference_price + tolerance
        return trigger_price >= reference_price - tolerance

    def _load_order_reference_price(self, symbol: str, side: OrderSide) -> float:
        """优先用实时盘口作为止损触发预检基准，避免拿计划价自己对自己比较。"""
        if self.exchange_name == "ctrader":
            try:
                price = float(self.exchange.get_market_price(symbol) or 0.0)
                if price > 0:
                    return price
            except Exception:
                pass

        if hasattr(self.exchange, "fetch_ticker"):
            try:
                ticker = self.exchange.fetch_ticker(symbol) or {}
                bid = float((ticker or {}).get("bid") or 0.0)
                ask = float((ticker or {}).get("ask") or 0.0)
                mark = float((ticker or {}).get("mark") or (ticker or {}).get("markPrice") or 0.0)
                last = float((ticker or {}).get("last") or 0.0)
                if side == OrderSide.BUY:
                    return ask or mark or last or bid
                return bid or mark or last or ask
            except Exception:
                pass

        if hasattr(self.exchange, "fetch_order_book"):
            try:
                order_book = self.exchange.fetch_order_book(symbol) or {}
                bids = order_book.get("bids") or []
                asks = order_book.get("asks") or []
                best_bid = float(bids[0][0]) if bids else 0.0
                best_ask = float(asks[0][0]) if asks else 0.0
                if side == OrderSide.BUY:
                    return best_ask or best_bid
                return best_bid or best_ask
            except Exception:
                pass

        return 0.0

    def _maybe_convert_immediate_trigger_stop_to_market(
        self,
        request: OrderRequest,
        reference_price: float,
        tick_size: float,
    ) -> tuple[OrderRequest, dict[str, Any] | None]:
        """当 stop-entry 已被最新价轻微穿越时，按 Brooks 的跟进入场语义回退为市价。"""
        if request.order_type != OrderType.STOP_MARKET or request.reduce_only:
            return request, None

        trigger_price = float(request.price or 0.0)
        if trigger_price <= 0 or reference_price <= 0:
            return request, None

        tolerance = max(tick_size, reference_price * 1e-6)
        if request.side == OrderSide.BUY:
            cross_distance = max(0.0, reference_price - trigger_price)
        else:
            cross_distance = max(0.0, trigger_price - reference_price)

        actual_risk = abs(trigger_price - float(request.stop_loss or 0.0))
        max_chase_distance = max(tick_size * 4, actual_risk * 0.20 if actual_risk > 0 else 0.0)

        context = {
            "trigger_price": trigger_price,
            "reference_price": reference_price,
            "cross_distance": cross_distance,
            "tolerance": tolerance,
            "max_chase_distance": max_chase_distance,
        }

        if max_chase_distance > 0 and cross_distance <= max_chase_distance + tolerance:
            adjusted_request = request.model_copy(update={"order_type": OrderType.MARKET, "price": None})
            context["fallback"] = "MARKET"
            return adjusted_request, context

        context["fallback"] = "REJECT"
        return request, context

    @staticmethod
    def _position_matches_request_side(request_side: OrderSide, position_side: Any) -> bool:
        """判断实时持仓方向是否与请求方向一致。"""
        normalized_position = str(position_side.value if isinstance(position_side, PositionSide) else position_side or "").upper()
        if request_side == OrderSide.BUY:
            return normalized_position in {"LONG", "BUY"}
        return normalized_position in {"SHORT", "SELL"}

    async def _confirm_primary_order(
        self,
        order_id: str,
        symbol: str,
        request: OrderRequest,
        client_order_id: str = "",
    ) -> tuple[bool, dict[str, Any]]:
        """二次确认主开仓单是否真的存在于交易所。"""
        last_payload: dict[str, Any] = {}
        if not order_id:
            return False, last_payload

        for attempt in range(3):
            if self.exchange_name == "binance":
                try:
                    native_order = self._load_native_binance_order(order_id, symbol, client_order_id)
                    if native_order:
                        last_payload = native_order
                        status = self._extract_binance_order_status(native_order)
                        if status in {"open", "new", "partially_filled", "partiallyfilled", "partial"}:
                            return True, native_order
                        if status in {"closed", "filled"} and not request.reduce_only:
                            live_positions = await self.get_positions()
                            for position in live_positions:
                                if self._norm_symbol_base(position.symbol) != self._norm_symbol_base(symbol):
                                    continue
                                if not self._position_matches_request_side(request.side, position.side):
                                    continue
                                filled_price = float(getattr(position, "entry_price", 0.0) or 0.0)
                                return True, {
                                    **native_order,
                                    "filled_price": filled_price or native_order.get("average") or native_order.get("price"),
                                    "average": filled_price or native_order.get("average") or native_order.get("price"),
                                    "status": native_order.get("status") or "filled",
                                }
                        if status in {"canceled", "cancelled", "expired", "rejected"}:
                            return False, native_order
                    else:
                        logger.warning("主订单二次确认 native_get_order 未返回订单: %s %s attempt=%s", symbol, order_id, attempt + 1)
                except Exception as exc:
                    self._capture_exchange_block(exc)
                    logger.warning("主订单二次确认 native_get_order 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

                try:
                    native_algo_order = self._load_native_binance_algo_order(order_id, symbol, client_order_id)
                    if native_algo_order:
                        last_payload = native_algo_order
                        status = self._extract_binance_order_status(native_algo_order)
                        if status in {"open", "new", "partially_filled", "partiallyfilled", "partial"}:
                            return True, native_algo_order
                        if status in {"closed", "filled"} and not request.reduce_only:
                            actual_order_id = str(native_algo_order.get("actualOrderId") or "").strip()
                            if actual_order_id:
                                try:
                                    fetched_actual = self._call_with_time_sync("fetch_order", self.exchange.fetch_order, actual_order_id, symbol)
                                    if isinstance(fetched_actual, dict) and fetched_actual:
                                        return True, fetched_actual
                                except Exception:
                                    pass
                            live_positions = await self.get_positions()
                            for position in live_positions:
                                if self._norm_symbol_base(position.symbol) != self._norm_symbol_base(symbol):
                                    continue
                                if not self._position_matches_request_side(request.side, position.side):
                                    continue
                                filled_price = float(getattr(position, "entry_price", 0.0) or 0.0)
                                return True, {
                                    **native_algo_order,
                                    "filled_price": filled_price,
                                    "average": filled_price,
                                    "status": "filled",
                                }
                        if status in {"canceled", "cancelled", "expired", "rejected"}:
                            return False, native_algo_order
                except Exception as exc:
                    self._capture_exchange_block(exc)
                    logger.warning("主订单二次确认 native_get_algo_order 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

            try:
                fetched = self._call_with_time_sync("fetch_order", self.exchange.fetch_order, order_id, symbol)
                if isinstance(fetched, dict) and fetched:
                    last_payload = fetched
                    status = self._normalize_exchange_order_status(fetched.get("status"))
                    if self.exchange_name != "binance" and status in {"open", "new", "closed", "filled", "partially_filled", "partiallyfilled", "partial"}:
                        return True, fetched
                    if self.exchange_name == "binance" and status in {"open", "new", "partially_filled", "partiallyfilled", "partial"}:
                        return True, fetched
            except Exception as exc:
                self._capture_exchange_block(exc)
                logger.warning("主订单二次确认 fetch_order 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

            try:
                open_orders = self._call_with_time_sync("fetch_open_orders", self.exchange.fetch_open_orders, symbol)
                for item in open_orders or []:
                    if self._order_matches_identifier(item, order_id, client_order_id):
                        return True, item or {}
            except Exception as exc:
                self._capture_exchange_block(exc)
                logger.warning("主订单二次确认 fetch_open_orders 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

            try:
                recent_orders = self._call_with_time_sync("fetch_orders", self.exchange.fetch_orders, symbol, None, 20)
                for item in recent_orders or []:
                    if not self._order_matches_identifier(item, order_id, client_order_id):
                        continue
                    last_payload = item or {}
                    status = self._normalize_exchange_order_status((item or {}).get("status"))
                    if status in {"open", "new", "closed", "filled", "partially_filled", "partiallyfilled", "partial"}:
                        return True, item or {}
                    if status in {"canceled", "cancelled", "expired", "rejected"}:
                        return False, item or {}
            except Exception as exc:
                self._capture_exchange_block(exc)
                logger.warning("主订单二次确认 fetch_orders 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

            if self.exchange_name == "binance":
                try:
                    native_orders = self._load_native_binance_all_orders(symbol, limit=50)
                    for item in native_orders:
                        if not self._order_matches_identifier(item, order_id, client_order_id):
                            continue
                        last_payload = item or {}
                        status = self._normalize_exchange_order_status(
                            (item or {}).get("status") or (item or {}).get("info", {}).get("status"),
                        )
                        if status in {"open", "new", "closed", "filled", "partially_filled", "partiallyfilled", "partial"}:
                            return True, item or {}
                        if status in {"canceled", "cancelled", "expired", "rejected"}:
                            return False, item or {}
                except Exception as exc:
                    self._capture_exchange_block(exc)
                    logger.warning("主订单二次确认 native_all_orders 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

                try:
                    for item in self._load_native_binance_open_algo_orders(symbol):
                        if not self._order_matches_identifier(item, order_id, client_order_id):
                            continue
                        last_payload = item or {}
                        status = self._extract_binance_order_status(item or {})
                        if status in {"open", "new", "partially_filled", "partiallyfilled", "partial"}:
                            return True, item or {}
                    for item in self._load_native_binance_all_algo_orders(symbol, limit=50):
                        if not self._order_matches_identifier(item, order_id, client_order_id):
                            continue
                        last_payload = item or {}
                        status = self._extract_binance_order_status(item or {})
                        if status in {"open", "new", "closed", "filled", "partially_filled", "partiallyfilled", "partial"}:
                            return True, item or {}
                        if status in {"canceled", "cancelled", "expired", "rejected"}:
                            return False, item or {}
                except Exception as exc:
                    self._capture_exchange_block(exc)
                    logger.warning("主订单二次确认 algo_orders 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

                try:
                    live_positions = await self.get_positions()
                    for position in live_positions:
                        if self._norm_symbol_base(position.symbol) != self._norm_symbol_base(symbol):
                            continue
                        if not self._position_matches_request_side(request.side, position.side):
                            continue
                        filled_price = float(getattr(position, "entry_price", 0.0) or 0.0)
                        return True, {
                            **last_payload,
                            "filled_price": filled_price,
                            "average": filled_price or last_payload.get("average") or last_payload.get("price"),
                            "status": last_payload.get("status") or "filled",
                        }
                except Exception as exc:
                    self._capture_exchange_block(exc)
                    logger.warning("主订单二次确认 live_positions 失败: %s %s attempt=%s", symbol, exc, attempt + 1)

            if attempt < 2:
                await asyncio.sleep(0.6)

        return False, last_payload

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
        reference_price = self._load_order_reference_price(symbol, request.side)
        if reference_price <= 0:
            reference_price = float(request.price or 0.0)
        symbol_constraints = self.get_symbol_constraints(symbol)
        min_notional = float(symbol_constraints.get("min_notional") or 0.0)
        if min_notional > 0 and reference_price > 0:
            snapped_notional = self.quantity_to_account_notional(symbol, snapped_quantity, reference_price)
            if snapped_notional + 1e-9 < min_notional:
                if self._reload_symbol_market_constraints(symbol):
                    snapped_quantity = self.snap_quantity_to_symbol(symbol, float(request.quantity or 0.0))
                    symbol_constraints = self.get_symbol_constraints(symbol)
                    min_notional = float(symbol_constraints.get("min_notional") or 0.0)
                    snapped_notional = self.quantity_to_account_notional(symbol, snapped_quantity, reference_price)
                if snapped_quantity <= 0:
                    return OrderResponse(
                        success=False,
                        symbol=symbol,
                        side=request.side.value,
                        quantity=0.0,
                        status="SIZE_FAILED",
                        message="刷新市场约束后仍达不到最小下单单位",
                    )
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
        planned_trigger_price = float(request.price) if request.price is not None else None
        tick_size = float(symbol_constraints.get("tick_size") or 0.0)
        if self.exchange_name == "binance" and self._would_immediately_trigger(request, reference_price, tick_size):
            adjusted_request, immediate_trigger_context = self._maybe_convert_immediate_trigger_stop_to_market(
                request,
                reference_price,
                tick_size,
            )
            if immediate_trigger_context and immediate_trigger_context.get("fallback") == "MARKET":
                logger.info(
                    "止损触发单已被最新价轻微穿越，按市价跟进入场: %s side=%s trigger=%s reference=%s cross=%s max=%s",
                    symbol,
                    request.side.value,
                    immediate_trigger_context.get("trigger_price"),
                    immediate_trigger_context.get("reference_price"),
                    immediate_trigger_context.get("cross_distance"),
                    immediate_trigger_context.get("max_chase_distance"),
                )
                request = adjusted_request
            else:
                return OrderResponse(
                    success=False,
                    symbol=symbol,
                    side=request.side.value,
                    quantity=request.quantity,
                    price=float(request.price) if request.price is not None else None,
                    status="WOULD_IMMEDIATELY_TRIGGER",
                    message="提交前预检：该止损触发单会立即触发，且已超出允许跟进范围，已按失败处理",
                    planned_price=planned_trigger_price,
                    planned_stop_loss=request.stop_loss,
                    planned_take_profit=request.take_profit,
                    bot_id=request.bot_id,
                )
        exchange_block = self.get_exchange_block_status()
        block_exchange = str(exchange_block.get("exchange") or self.exchange_name).strip().lower()
        if exchange_block.get("blocked") and block_exchange == str(self.exchange_name).strip().lower() and not request.reduce_only:
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
                if request.order_type == OrderType.LIMIT:
                    order_type = "LIMIT"
                elif request.order_type == OrderType.STOP_MARKET:
                    order_type = "STOP_MARKET"
                else:
                    order_type = "MARKET"
                # cTrader 支持在下单时附带 SL/TP（包括 MARKET 单）
                attach_stop_loss = request.stop_loss
                attach_take_profit = request.take_profit
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
                    self._register_order(
                        order_id,
                        request.bot_id,
                        symbol,
                        strategy=strat,
                        timeframe=request.timeframe,
                    )
                    if not request.reduce_only:
                        self.register_position(
                            symbol,
                            request.bot_id,
                            strategy=strat,
                            quantity=request.quantity,
                            side=request.side.value,
                            timeframe=request.timeframe or "",
                        )
                        await self._sync_bot_margin_state(request.bot_id)

                native_protection_result: dict[str, Any] | None = None
                desired_sl = request.stop_loss
                desired_tp = request.take_profit
                if not request.reduce_only and (request.stop_loss is not None or request.take_profit is not None):
                    target_position_id = order.get("position_id")
                    filled_price = float(order.get("filled_price") or 0.0)

                    # 如果实际成交价和预期入场价不同，按实际成交价重算 SL/TP
                    # 保持 risk 距离相同，但基于实际成交价偏移
                    planned_entry = float(request.price or 0.0)
                    if filled_price > 0 and planned_entry > 0 and abs(filled_price - planned_entry) > 1e-9:
                        price_delta = filled_price - planned_entry
                        if desired_sl is not None:
                            desired_sl = round(desired_sl + price_delta, 10)
                        if desired_tp is not None:
                            desired_tp = round(desired_tp + price_delta, 10)
                        # 几何校验：SL 和 TP 必须在入场价的正确侧
                        side_is_buy = request.side.value.upper() in ("BUY", "LONG")
                        if desired_sl is not None:
                            if side_is_buy and desired_sl >= filled_price:
                                desired_sl = None  # BUY 的 SL 不能 ≥ 入场价
                            elif not side_is_buy and desired_sl <= filled_price:
                                desired_sl = None  # SELL 的 SL 不能 ≤ 入场价
                        if desired_tp is not None:
                            if side_is_buy and desired_tp <= filled_price:
                                desired_tp = None  # BUY 的 TP 不能 ≤ 入场价
                            elif not side_is_buy and desired_tp >= filled_price:
                                desired_tp = None  # SELL 的 TP 不能 ≥ 入场价
                        if desired_sl is not None:
                            desired_sl = self.snap_price_to_symbol(
                                symbol, desired_sl,
                                side=(OrderSide.SELL.value if side_is_buy else OrderSide.BUY.value),
                            )
                        if desired_tp is not None:
                            desired_tp = self.snap_price_to_symbol(
                                symbol, desired_tp,
                                side=(OrderSide.SELL.value if side_is_buy else OrderSide.BUY.value),
                            )
                        logger.info(
                            "SL/TP 按实际成交价重算: %s planned=%s filled=%s delta=%s sl=%s→%s tp=%s→%s",
                            symbol, planned_entry, filled_price, price_delta,
                            request.stop_loss, desired_sl, request.take_profit, desired_tp,
                        )

                    if desired_sl is not None or desired_tp is not None:
                        for _attempt in range(3):
                            native_protection_result = self.exchange.modify_position(
                                symbol,
                                stop_loss=desired_sl,
                                take_profit=desired_tp,
                                position_id=target_position_id,
                            )
                            if native_protection_result.get("success"):
                                verification = await self._verify_ctrader_position_protection(
                                    symbol,
                                    position_id=target_position_id,
                                    stop_loss=desired_sl,
                                    take_profit=desired_tp,
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
                            "cTrader 开仓后补改 SL/TP 失败: %s sl=%s tp=%s",
                            (native_protection_result or {}).get("error"),
                            desired_sl, desired_tp,
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
                    planned_price=request.price,
                    filled_price=float(order.get("filled_price")) if order.get("filled_price") is not None else None,
                    status="PLACED",
                    message=None,
                    planned_stop_loss=request.stop_loss,
                    actual_stop_loss=(
                        desired_sl
                        if (native_protection_result or {}).get("success") and desired_sl is not None
                        else request.stop_loss
                    ),
                    planned_take_profit=request.take_profit,
                    actual_take_profit=(
                        desired_tp
                        if (native_protection_result or {}).get("success") and desired_tp is not None
                        else request.take_profit
                    ),
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
                client_id = self._build_client_order_id(current_request.bot_id, symbol)
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
            requested_client_order_id = str((order_params.get("params") or {}).get("newClientOrderId") or "").strip()
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
                requested_client_order_id = str((order_params.get("params") or {}).get("newClientOrderId") or "").strip()
                order = self._call_with_time_sync("create_order_retry_constraints", self.exchange.create_order, **order_params)

            order_id = str(order.get("id"))
            confirmed_order = dict(order)
            exchange_confirmed = True
            if self.exchange_name == "binance" and not request.reduce_only:
                exchange_confirmed, verified_order = await self._confirm_primary_order(
                    order_id,
                    symbol,
                    request,
                    requested_client_order_id,
                )
                if verified_order:
                    confirmed_order = {**order, **verified_order}
                if not exchange_confirmed:
                    exchange_block = self.get_exchange_block_status()
                    if exchange_block.get("blocked"):
                        reason = str(exchange_block.get("reason") or exchange_block.get("code") or "EXCHANGE_BLOCKED")
                        return OrderResponse(
                            success=False,
                            order_id=order_id,
                            symbol=symbol,
                            side=request.side.value,
                            quantity=request.quantity,
                            price=float(order.get("price", 0)) if order.get("price") else None,
                            status="EXCHANGE_BLOCKED",
                            message=f"交易所阻断: {reason}",
                            planned_price=float(request.price) if request.price is not None else None,
                            planned_stop_loss=request.stop_loss,
                            planned_take_profit=request.take_profit,
                            exchange_confirmed=False,
                            bot_id=request.bot_id,
                        )
                    logger.error("主订单未获交易所确认，按失败处理: %s %s", symbol, order_id)
                    return OrderResponse(
                        success=False,
                        order_id=order_id,
                        symbol=symbol,
                        side=request.side.value,
                        quantity=request.quantity,
                        price=float(order.get("price", 0)) if order.get("price") else None,
                        status="EXCHANGE_NOT_CONFIRMED",
                        message="交易所未确认主订单，已按失败处理",
                        planned_price=float(request.price) if request.price is not None else None,
                        planned_stop_loss=request.stop_loss,
                        planned_take_profit=request.take_profit,
                        exchange_confirmed=False,
                        bot_id=request.bot_id,
                    )
                self._clear_exchange_block_state("BINANCE_REGION_RESTRICTED")

            order_status = self._normalize_exchange_order_status(confirmed_order.get("status"))
            entry_filled = request.order_type == OrderType.MARKET or order_status in {"closed", "filled"}
            filled_price = float(confirmed_order.get("average") or confirmed_order.get("filled_price") or confirmed_order.get("price") or 0) or None
            planned_price = planned_trigger_price

            if request.bot_id:
                strat = request.strategy or request.signal_source or "auto"
                self._register_order(
                    order_id,
                    request.bot_id,
                    symbol,
                    strategy=strat,
                    timeframe=request.timeframe,
                )
                if not request.reduce_only and entry_filled:
                    self.register_position(
                        symbol,
                        request.bot_id,
                        strategy=strat,
                        quantity=request.quantity,
                        side=request.side.value,
                        timeframe=request.timeframe or "",
                    )
                    await self._sync_bot_margin_state(request.bot_id)

            sl_embedded = bool(native_attach_supported and request.stop_loss and not request.reduce_only)
            tp_embedded = bool(native_attach_supported and request.take_profit and not request.reduce_only)

            response = OrderResponse(
                success=True,
                order_id=order_id,
                symbol=symbol,
                side=request.side.value,
                quantity=request.quantity,
                price=float(confirmed_order.get("price", 0)) if confirmed_order.get("price") else None,
                status=confirmed_order.get("status") or "NEW",
                planned_price=planned_price,
                filled_price=filled_price if entry_filled else None,
                planned_stop_loss=request.stop_loss,
                actual_stop_loss=request.stop_loss if sl_embedded else None,
                planned_take_profit=request.take_profit,
                actual_take_profit=request.take_profit if tp_embedded else None,
                exchange_confirmed=exchange_confirmed,
                bot_id=request.bot_id,
            )

            if sl_embedded:
                response.stop_loss_order_id = "embedded_native"
                logger.info(f"原生止损已嵌入主订单: {symbol} sl={request.stop_loss}")
            if tp_embedded:
                response.take_profit_order_id = "embedded_native"
                logger.info(f"原生止盈已嵌入主订单: {symbol} tp={request.take_profit}")

            logger.info(f"订单已提交: {symbol} {request.side.value} {request.quantity} @ {confirmed_order.get('price', 'MARKET')} [bot={request.bot_id or 'unknown'}]")

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
                        response.planned_stop_loss = request.stop_loss
                        response.actual_stop_loss = request.stop_loss
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
                    response.planned_stop_loss = request.stop_loss
                    response.actual_stop_loss = request.stop_loss
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
                        response.planned_take_profit = request.take_profit
                        response.actual_take_profit = request.take_profit
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
                        response.planned_take_profit = request.take_profit
                        response.actual_take_profit = request.take_profit
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
                                timeframe=getattr(pos, "timeframe", "") or "",
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
                            timeframe=getattr(pos, "timeframe", "") or "",
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
