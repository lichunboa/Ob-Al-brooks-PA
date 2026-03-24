"""
执行服务保护单协调能力混入。
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from .config import SHARED_WORKSPACE
from .models import OpenOrder, OrderSide, Position, PositionSide

logger = logging.getLogger(__name__)


class ExecutionProtectionMixin:
    """执行服务保护单协调能力混入。"""

    @staticmethod
    def _is_max_stop_order_limit_error(exc: Exception | str) -> bool:
        """判断是否命中交易所保护单数量上限。"""
        return "Reach max stop order limit" in str(exc)

    def _place_reduce_only_take_profit_limit(
        self,
        symbol: str,
        *,
        side: OrderSide,
        quantity: float,
        target_price: float,
        current_price: float | None = None,
        bot_id: str | None,
        strategy: str,
    ) -> tuple[str | None, str]:
        """当 TP 市价单会立即触发时，回退成 reduce-only LIMIT。"""
        ccxt_symbol = self._normalize_symbol_for_ccxt(symbol)
        effective_target = float(target_price or 0.0)
        tick_size = max(0.0, float(self.get_symbol_info(symbol).get("tick_size") or 0.0))
        current = max(0.0, float(current_price or 0.0))
        if current > 0:
            safety_gap = tick_size if tick_size > 0 else max(current * 0.0005, 1e-8)
            if side == OrderSide.SELL:
                effective_target = max(effective_target, current + safety_gap)
            else:
                effective_target = min(effective_target, current - safety_gap) if effective_target > 0 else max(current - safety_gap, safety_gap)
        effective_target = self.snap_price_to_symbol(symbol, effective_target, side=side.value)
        tp_order = self._call_with_time_sync(
            "create_take_profit_limit_fallback",
            self.exchange.create_order,
            symbol=ccxt_symbol,
            type="limit",
            side=side.value.lower(),
            amount=quantity,
            price=effective_target,
            params={"reduceOnly": True},
        )
        tp_id = str(tp_order.get("id") or "")
        effective_bot = bot_id or self.get_position_bot_id(symbol)
        if effective_bot:
            self._register_order(tp_id, effective_bot, ccxt_symbol, strategy=strategy)
        self._register_protection_order(
            tp_id,
            effective_bot,
            symbol,
            strategy=strategy,
            order_type="LIMIT",
            side=side.value,
            quantity=quantity,
            stop_price=effective_target,
        )
        logger.info("止盈市价单回退为 reduce-only LIMIT: %s tp=%s qty=%s", symbol, effective_target, quantity)
        return tp_id, "TAKE_PROFIT_LIMIT_FALLBACK"

    @staticmethod
    def _clear_software_stop_record(symbol: str) -> None:
        """清理软件止损回退记录。"""
        try:
            SHARED_WORKSPACE.mkdir(parents=True, exist_ok=True)
            sl_file = SHARED_WORKSPACE / "sl_placed.json"
            if not sl_file.exists():
                return
            sl_data = json.loads(sl_file.read_text())
            normalized_symbol = str(symbol or "").replace("/", "")
            if normalized_symbol in sl_data:
                del sl_data[normalized_symbol]
                sl_file.write_text(json.dumps(sl_data, indent=2))
        except Exception as exc:
            logger.warning("清理软件止损记录失败 %s: %s", symbol, exc)

    async def _verify_ctrader_position_protection(
        self,
        symbol: str,
        *,
        position_id: str | int | None = None,
        stop_loss: float | None = None,
        take_profit: float | None = None,
        retries: int = 3,
        delay_seconds: float = 0.4,
    ) -> dict[str, Any]:
        """回读 cTrader 持仓，确认保护位已经真正写入交易所。"""

        def _matches(expected: float | None, actual: float | None) -> bool:
            if expected is None:
                return True
            if actual is None:
                return False
            tolerance = max(abs(expected) * 1e-6, 1e-6)
            return abs(float(actual) - float(expected)) <= tolerance

        expected_position_id = str(position_id or "").strip()
        normalized_symbol = self._norm_symbol_base(symbol)
        last_error = "未找到持仓"

        for attempt in range(max(retries, 1)):
            try:
                positions = self.exchange.get_positions() or []
            except Exception as exc:
                last_error = f"读取 cTrader 持仓失败: {exc}"
                positions = []

            for item in positions:
                if not isinstance(item, dict):
                    continue
                item_position_id = str(item.get("position_id") or "").strip()
                item_symbol = self._norm_symbol_base(item.get("symbol") or "")
                if expected_position_id:
                    if item_position_id != expected_position_id:
                        continue
                elif item_symbol != normalized_symbol:
                    continue

                actual_stop_loss = float(item.get("stop_loss") or 0) or None
                actual_take_profit = float(item.get("take_profit") or 0) or None
                stop_ok = _matches(stop_loss, actual_stop_loss)
                take_profit_ok = _matches(take_profit, actual_take_profit)
                if stop_ok and take_profit_ok:
                    return {
                        "success": True,
                        "position_id": item_position_id,
                        "stop_loss": actual_stop_loss,
                        "take_profit": actual_take_profit,
                    }
                last_error = (
                    f"回读保护位未生效: "
                    f"sl={actual_stop_loss if actual_stop_loss is not None else '-'} "
                    f"tp={actual_take_profit if actual_take_profit is not None else '-'}"
                )

            if attempt < max(retries, 1) - 1:
                await asyncio.sleep(delay_seconds)

        return {"success": False, "error": last_error}

    @staticmethod
    def _protection_price_matches(expected: float | None, actual: float | None) -> bool:
        """判断保护单价格是否可视为同一目标。"""
        if expected is None and actual is None:
            return True
        if expected is None or actual is None:
            return False
        tolerance = max(abs(float(expected)) * 1e-6, 1e-6)
        return abs(float(expected) - float(actual)) <= tolerance

    @staticmethod
    def _protection_quantity_matches(expected: float, actual: float) -> bool:
        """判断保护单数量是否与目标仓位一致。"""
        tolerance = max(abs(float(expected)) * 1e-6, 1e-8)
        return abs(float(expected) - float(actual)) <= tolerance

    @staticmethod
    def _open_order_timestamp(order: OpenOrder) -> float:
        """提取挂单时间戳，供重复保护单去重时比较新旧。"""
        if isinstance(order.created_at, datetime):
            return order.created_at.timestamp()
        return 0.0

    def _select_latest_open_order(self, orders: list[OpenOrder]) -> OpenOrder | None:
        """从一组挂单里选出最新的一笔。"""
        if not orders:
            return None
        return max(orders, key=self._open_order_timestamp)

    @staticmethod
    def _is_unknown_order_error(exc: Exception) -> bool:
        """判断是否属于交易所返回的“订单已不存在”错误。"""
        text = str(exc).lower()
        return "unknown order sent" in text or "-2011" in text or "order not found" in text

    def _drop_order_tracking(self, order_id: str) -> None:
        """同时清理保护单注册和 order→bot 追踪。"""
        protection_dirty = self._protection_order_map.pop(str(order_id), None) is not None
        order_dirty = self._order_bot_map.pop(str(order_id), None) is not None
        if protection_dirty:
            self._save_protection_order_map()
        if order_dirty:
            self._save_order_bot_map()

    @staticmethod
    def _protection_kind_from_strategy_or_type(strategy: str | None, order_type: str | None) -> str | None:
        """将策略/订单类型统一映射成保护单类别。"""
        strategy_text = str(strategy or "").lower()
        order_type_text = str(order_type or "").upper()
        if strategy_text.startswith("tp_") or order_type_text in {"TAKE_PROFIT_MARKET", "TAKE_PROFIT", "LIMIT"}:
            return "TAKE_PROFIT"
        if strategy_text.startswith("sl_") or order_type_text in {"STOP_MARKET", "STOP"}:
            return "STOP_LOSS"
        return None

    def _protection_signature(
        self,
        *,
        symbol: str,
        side: str,
        kind: str | None,
        stop_price: float | None,
        quantity: float | None,
    ) -> tuple[str, str, str, int, int] | None:
        """构造保护单唯一签名，用于新旧订单对账。"""
        if kind is None or stop_price in (None, "") or quantity in (None, ""):
            return None
        return (
            self._normalize_registry_symbol(symbol),
            str(side or "").upper(),
            str(kind).upper(),
            round(float(stop_price) * 1_000_000),
            round(float(quantity) * 1_000_000),
        )

    def _reconcile_registered_protection_orders(
        self,
        symbols: set[str],
        live_orders: list[dict[str, Any]],
        positions: list[Position],
    ) -> int:
        """用真实 open orders 对账本地保护单注册表，剔除已被新单替代的旧记录。"""
        if self.exchange_name == "ctrader":
            return 0

        normalized_symbols = {
            self._normalize_registry_symbol(symbol)
            for symbol in symbols
            if symbol
        }
        if not normalized_symbols:
            return 0

        position_symbols = {
            self._normalize_registry_symbol(pos.symbol)
            for pos in positions
        }
        live_signatures: dict[tuple[str, str, str, int, int], tuple[str, float]] = {}

        def _as_reduce_only(raw: Any) -> bool:
            if isinstance(raw, str):
                return raw.strip().lower() in {"true", "1", "yes", "y"}
            return bool(raw)

        for order in live_orders:
            if not isinstance(order, dict):
                continue
            info = order.get("info") if isinstance(order.get("info"), dict) else {}
            params = order.get("params") if isinstance(order.get("params"), dict) else {}
            order_status = str(order.get("status") or "").lower()
            if order_status not in {"open", "new"}:
                continue
            reduce_only = _as_reduce_only(
                order.get("reduceOnly")
                if order.get("reduceOnly") not in (None, "", False)
                else (
                    info.get("reduceOnly")
                    if info.get("reduceOnly") not in (None, "")
                    else (
                        info.get("closePosition")
                        if info.get("closePosition") not in (None, "")
                        else params.get("reduceOnly")
                    )
                )
            )
            order_type = str(order.get("type") or info.get("origType") or info.get("type") or "").upper()
            kind = self._protection_kind_from_strategy_or_type(None, order_type)
            if kind is None:
                continue
            if kind == "TAKE_PROFIT" and not reduce_only and order_type != "TAKE_PROFIT":
                continue
            stop_price = (
                order.get("stopPrice")
                or info.get("stopPrice")
                or info.get("triggerPrice")
                or info.get("activatePrice")
                or order.get("price")
            )
            signature = self._protection_signature(
                symbol=str(order.get("symbol") or info.get("symbol") or ""),
                side=str(order.get("side") or ""),
                kind=kind,
                stop_price=float(stop_price) if stop_price not in (None, "") else None,
                quantity=float(order.get("amount") or 0.0),
            )
            if signature is None or signature[0] not in normalized_symbols:
                continue
            try:
                created_at = datetime.fromisoformat(str(order.get("datetime") or "")).timestamp()
            except Exception:
                created_at = 0.0
            order_id = str(order.get("id") or "")
            current = live_signatures.get(signature)
            if current is None or created_at >= current[1]:
                live_signatures[signature] = (order_id, created_at)

        dropped = 0
        for order_id, payload in list(self._protection_order_map.items()):
            if not isinstance(payload, dict):
                continue
            normalized_symbol = self._normalize_registry_symbol(payload.get("symbol") or "")
            if normalized_symbol not in normalized_symbols:
                continue
            if normalized_symbol not in position_symbols:
                self._drop_order_tracking(str(order_id))
                dropped += 1
                continue
            signature = self._protection_signature(
                symbol=str(payload.get("symbol") or normalized_symbol),
                side=str(payload.get("side") or ""),
                kind=self._protection_kind_from_strategy_or_type(
                    str(payload.get("strategy") or ""),
                    str(payload.get("order_type") or ""),
                ),
                stop_price=float(payload.get("stop_price")) if payload.get("stop_price") not in (None, "") else None,
                quantity=float(payload.get("quantity") or 0.0),
            )
            if signature is None:
                continue
            live_match = live_signatures.get(signature)
            if live_match and live_match[0] and live_match[0] != str(order_id):
                self._drop_order_tracking(str(order_id))
                dropped += 1
        return dropped

    def _cleanup_live_protection_orders(
        self,
        orders: list[dict[str, Any]],
        positions: list[Position],
    ) -> int:
        """强制对账交易所真实保护单，移除无仓残留和重复保护单。"""
        if self.exchange_name == "ctrader":
            return 0

        position_symbols = {
            self._normalize_registry_symbol(pos.symbol)
            for pos in positions
            if pos.symbol
        }
        if not position_symbols:
            return 0

        def _as_reduce_only(raw: Any) -> bool:
            if isinstance(raw, str):
                return raw.strip().lower() in {"true", "1", "yes", "y"}
            return bool(raw)

        protection_groups: dict[tuple[str, str, str, int, int], list[tuple[dict[str, Any], float]]] = {}
        orders_to_cancel: dict[str, dict[str, Any]] = {}

        for order in orders:
            if not isinstance(order, dict):
                continue
            info = order.get("info") if isinstance(order.get("info"), dict) else {}
            params = order.get("params") if isinstance(order.get("params"), dict) else {}
            order_status = str(order.get("status") or "").lower()
            if order_status not in {"open", "new"}:
                continue

            reduce_only = _as_reduce_only(
                order.get("reduceOnly")
                if order.get("reduceOnly") not in (None, "", False)
                else (
                    info.get("reduceOnly")
                    if info.get("reduceOnly") not in (None, "")
                    else (
                        info.get("closePosition")
                        if info.get("closePosition") not in (None, "")
                        else params.get("reduceOnly")
                    )
                )
            )
            if not reduce_only:
                continue

            raw_symbol = str(order.get("symbol") or info.get("symbol") or "")
            normalized_symbol = self._normalize_registry_symbol(raw_symbol)
            order_id = str(order.get("id") or "")
            if not order_id:
                continue

            if normalized_symbol not in position_symbols:
                orders_to_cancel[order_id] = order
                continue

            order_type = str(order.get("type") or info.get("origType") or info.get("type") or "").upper()
            kind = self._protection_kind_from_strategy_or_type(None, order_type)
            stop_price = (
                order.get("stopPrice")
                or info.get("stopPrice")
                or info.get("triggerPrice")
                or info.get("activatePrice")
                or order.get("price")
            )
            signature = self._protection_signature(
                symbol=raw_symbol,
                side=str(order.get("side") or ""),
                kind=kind,
                stop_price=float(stop_price) if stop_price not in (None, "") else None,
                quantity=float(order.get("amount") or 0.0),
            )
            if signature is None:
                continue
            try:
                created_at = datetime.fromisoformat(str(order.get("datetime") or "")).timestamp()
            except Exception:
                created_at = 0.0
            protection_groups.setdefault(signature, []).append((order, created_at))

        for duplicate_orders in protection_groups.values():
            if len(duplicate_orders) <= 1:
                continue
            newest_order, _ = max(
                duplicate_orders,
                key=lambda item: (item[1], str(item[0].get("id") or "")),
            )
            newest_id = str(newest_order.get("id") or "")
            for order, _created_at in duplicate_orders:
                order_id = str(order.get("id") or "")
                if order_id and order_id != newest_id:
                    orders_to_cancel[order_id] = order

        cancelled_ids: set[str] = set()
        for order_id, order in orders_to_cancel.items():
            if order_id in cancelled_ids:
                continue
            raw_symbol = str(order.get("symbol") or "")
            ccxt_symbol = self._normalize_symbol_for_ccxt(raw_symbol)
            try:
                self._call_with_time_sync(
                    "cancel_stale_or_duplicate_protection",
                    self.exchange.cancel_order,
                    order_id,
                    ccxt_symbol,
                )
            except Exception as exc:
                if not self._is_unknown_order_error(exc):
                    logger.warning("取消残留保护单失败 %s: %s", order_id, exc)
                    continue
            self._drop_order_tracking(order_id)
            cancelled_ids.add(order_id)

        if cancelled_ids:
            orders[:] = [
                order
                for order in orders
                if str(order.get("id") or "") not in cancelled_ids
            ]
        return len(cancelled_ids)

    def _matching_reduce_only_orders(
        self,
        open_orders: list[OpenOrder],
        *,
        side: str,
        order_types: set[str],
        stop_price: float | None,
        quantity: float,
    ) -> tuple[list[OpenOrder], list[OpenOrder]]:
        """筛选某一侧保护单，并判断是否已有完全匹配的挂单。"""
        relevant: list[OpenOrder] = []
        matching: list[OpenOrder] = []
        side_upper = str(side or "").upper()
        allowed_types = {str(item).upper() for item in order_types}
        for order in open_orders:
            if not order.reduce_only:
                continue
            if str(order.side or "").upper() != side_upper:
                continue
            if str(order.order_type or "").upper() not in allowed_types:
                continue
            relevant.append(order)
            actual_stop = order.stop_price if order.stop_price not in (None, 0, "") else order.price
            if self._protection_price_matches(stop_price, actual_stop) and self._protection_quantity_matches(quantity, order.quantity):
                matching.append(order)
        return relevant, matching

    @staticmethod
    def _would_take_profit_trigger_immediately(pos: Position, target_price: float) -> bool:
        """判断止盈触发价是否已落在当前价格已触发的一侧。"""
        current_price = float(pos.mark_price or pos.entry_price or 0.0)
        if current_price <= 0 or target_price <= 0:
            return False
        tolerance = max(current_price * 0.0005, 1e-8)
        if pos.side == PositionSide.LONG:
            return current_price + tolerance >= target_price
        return current_price - tolerance <= target_price

    async def _rebuild_reduce_only_protection_orders(
        self,
        pos: Position,
        remaining_quantity: float,
        bot_id: str | None,
    ) -> dict[str, Any]:
        """部分平仓后按剩余仓位重建保护单，避免旧数量残留。"""
        if self.exchange_name == "ctrader":
            return {"success": True, "recreated": False, "reason": "ctrader 原生持仓保护单无需重建"}

        pos_symbol = pos.symbol
        ccxt_symbol = self._normalize_symbol_for_ccxt(pos_symbol)
        open_orders = await self.get_open_orders(pos_symbol)
        cancelled: list[str] = []
        for order in open_orders:
            if not order.reduce_only:
                continue
            try:
                self._call_with_time_sync("cancel_partial_close_protection", self.exchange.cancel_order, order.order_id, ccxt_symbol)
                cancelled.append(order.order_id)
                self._drop_order_tracking(order.order_id)
            except Exception as cancel_exc:
                if self._is_unknown_order_error(cancel_exc):
                    self._drop_order_tracking(order.order_id)
                logger.warning("部分平仓后取消旧保护单失败 %s: %s", order.order_id, cancel_exc)

        self._drop_registered_protection_orders_by_symbol(pos_symbol)
        if cancelled:
            await asyncio.sleep(0.4)
        created: dict[str, str | None] = {"stop_loss_order_id": None, "take_profit_order_id": None}
        effective_bot = bot_id or self.get_position_bot_id(pos_symbol)

        if pos.stop_loss is not None:
            sl_side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY
            try:
                sl_order = self._call_with_time_sync(
                    "rebuild_stop_loss_after_partial_close",
                    self.exchange.create_order,
                    symbol=ccxt_symbol,
                    type="stop_market",
                    side=sl_side.value.lower(),
                    amount=remaining_quantity,
                    params={
                        "stopPrice": pos.stop_loss,
                        "reduceOnly": True,
                    },
                )
            except Exception as sl_exc:
                if not self._is_max_stop_order_limit_error(sl_exc):
                    raise
                logger.warning("部分平仓后重建止损命中保护单上限，等待后重试: %s", pos_symbol)
                await asyncio.sleep(0.8)
                sl_order = self._call_with_time_sync(
                    "rebuild_stop_loss_after_partial_close_retry",
                    self.exchange.create_order,
                    symbol=ccxt_symbol,
                    type="stop_market",
                    side=sl_side.value.lower(),
                    amount=remaining_quantity,
                    params={
                        "stopPrice": pos.stop_loss,
                        "reduceOnly": True,
                    },
                )
            sl_id = str(sl_order.get("id") or "")
            if sl_id:
                created["stop_loss_order_id"] = sl_id
                if effective_bot:
                    self._register_order(sl_id, effective_bot, ccxt_symbol, strategy="sl_protect")
                self._register_protection_order(
                    sl_id,
                    effective_bot,
                    pos_symbol,
                    strategy="sl_protect",
                    order_type="STOP_MARKET",
                    side=sl_side.value,
                    quantity=remaining_quantity,
                    stop_price=pos.stop_loss,
                )

        if pos.take_profit is not None:
            if self._would_take_profit_trigger_immediately(pos, float(pos.take_profit)):
                return {
                    "success": True,
                    "recreated": bool(created["stop_loss_order_id"] or created["take_profit_order_id"]),
                    "cancelled_order_ids": cancelled,
                    **created,
                    "take_profit_fallback": "TAKE_PROFIT_WOULD_TRIGGER_IMMEDIATELY",
                }
            tp_side = OrderSide.SELL if pos.side == PositionSide.LONG else OrderSide.BUY
            try:
                tp_order = self._call_with_time_sync(
                    "rebuild_take_profit_after_partial_close",
                    self.exchange.create_order,
                    symbol=ccxt_symbol,
                    type="take_profit_market",
                    side=tp_side.value.lower(),
                    amount=remaining_quantity,
                    params={
                        "stopPrice": pos.take_profit,
                        "reduceOnly": True,
                    },
                )
            except Exception as tp_exc:
                if not self._is_max_stop_order_limit_error(tp_exc):
                    raise
                logger.warning("部分平仓后重建止盈命中保护单上限，等待后重试: %s", pos_symbol)
                await asyncio.sleep(0.8)
                tp_order = self._call_with_time_sync(
                    "rebuild_take_profit_after_partial_close_retry",
                    self.exchange.create_order,
                    symbol=ccxt_symbol,
                    type="take_profit_market",
                    side=tp_side.value.lower(),
                    amount=remaining_quantity,
                    params={
                        "stopPrice": pos.take_profit,
                        "reduceOnly": True,
                    },
                )
            tp_id = str(tp_order.get("id") or "")
            if tp_id:
                created["take_profit_order_id"] = tp_id
                if effective_bot:
                    self._register_order(tp_id, effective_bot, ccxt_symbol, strategy="tp_protect")
                self._register_protection_order(
                    tp_id,
                    effective_bot,
                    pos_symbol,
                    strategy="tp_protect",
                    order_type="TAKE_PROFIT_MARKET",
                    side=tp_side.value,
                    quantity=remaining_quantity,
                    stop_price=pos.take_profit,
                )

        return {
            "success": True,
            "recreated": bool(created["stop_loss_order_id"] or created["take_profit_order_id"]),
            "cancelled_order_ids": cancelled,
            **created,
        }

    def _build_registered_protection_stubs(
        self,
        symbols: set[str],
        positions: list[Position],
        existing_ids: set[str],
    ) -> list[dict[str, Any]]:
        """为交易所查不到的保护单构造兜底 stub。"""
        if self.exchange_name == "ctrader":
            return []
        normalized_symbols = {
            self._normalize_registry_symbol(symbol)
            for symbol in symbols
            if symbol
        }
        position_map = {self._normalize_registry_symbol(pos.symbol): pos for pos in positions}
        stubs: list[dict[str, Any]] = []
        for order_id, payload in self._protection_order_map.items():
            if not isinstance(payload, dict):
                continue
            normalized_symbol = self._normalize_registry_symbol(payload.get("symbol") or "")
            if normalized_symbol not in normalized_symbols or str(order_id) in existing_ids:
                continue
            pos = position_map.get(normalized_symbol)
            if pos is None:
                continue
            stubs.append(
                {
                    "id": str(order_id),
                    "symbol": str(payload.get("symbol") or normalized_symbol),
                    "side": str(payload.get("side") or "").lower(),
                    "type": str(payload.get("order_type") or "").lower(),
                    "amount": float(payload.get("quantity") or pos.quantity or 0.0),
                    "price": None,
                    "stopPrice": payload.get("stop_price"),
                    "status": "open",
                    "reduceOnly": True,
                    "datetime": payload.get("created_at"),
                    "clientOrderId": None,
                    "__registered_stub": True,
                    "info": {
                        "reduceOnly": True,
                        "stopPrice": payload.get("stop_price"),
                    },
                }
            )
        return stubs

    def _restore_registered_protection_orders(self, orders: list[dict[str, Any]]) -> int:
        """从交易所真实挂单恢复保护单注册表。"""
        if self.exchange_name == "ctrader":
            return 0

        restored = 0
        dirty = False

        def _as_reduce_only(raw: Any) -> bool:
            if isinstance(raw, str):
                return raw.strip().lower() in {"true", "1", "yes", "y"}
            return bool(raw)

        def _strategy_for_order(order_type: str, reduce_only: bool) -> str | None:
            order_type_upper = str(order_type or "").upper()
            if order_type_upper in {"TAKE_PROFIT_MARKET", "TAKE_PROFIT"}:
                return "tp_protect"
            if order_type_upper in {"STOP_MARKET", "STOP"}:
                return "sl_protect"
            if order_type_upper == "LIMIT" and reduce_only:
                return "tp_protect"
            return None

        for order in orders:
            if not isinstance(order, dict):
                continue
            order_id = str(order.get("id") or "")
            if not order_id:
                continue

            info = order.get("info") if isinstance(order.get("info"), dict) else {}
            params = order.get("params") if isinstance(order.get("params"), dict) else {}
            order_type = str(order.get("type") or info.get("origType") or info.get("type") or "").upper()
            order_status = str(order.get("status") or "").lower()
            stop_price = (
                order.get("stopPrice")
                or info.get("stopPrice")
                or info.get("triggerPrice")
                or info.get("activatePrice")
            )
            reduce_only = _as_reduce_only(
                order.get("reduceOnly")
                if order.get("reduceOnly") not in (None, "", False)
                else (
                    info.get("reduceOnly")
                    if info.get("reduceOnly") not in (None, "")
                    else (
                        info.get("closePosition")
                        if info.get("closePosition") not in (None, "")
                        else params.get("reduceOnly")
                    )
                )
            )
            strategy = _strategy_for_order(order_type, reduce_only)
            if strategy is None or order_status not in {"open", "new"} or stop_price in (None, ""):
                continue

            symbol = str(order.get("symbol") or info.get("symbol") or "").replace("/", "")
            if not symbol:
                continue

            bot_id = self._lookup_bot_id(order_id)
            client_order_id = str(order.get("clientOrderId") or info.get("clientOrderId") or "")
            if not bot_id and client_order_id:
                bot_id = self._parse_bot_id_from_client_order_id(client_order_id)
            if bot_id and order_id not in self._order_bot_map:
                self._order_bot_map[order_id] = {
                    "bot_id": bot_id,
                    "symbol": symbol,
                    "strategy": strategy,
                }
                dirty = True

            payload = {
                "symbol": self._normalize_registry_symbol(symbol),
                "bot_id": bot_id or "",
                "strategy": strategy,
                "order_type": order_type,
                "side": str(order.get("side") or "").upper(),
                "quantity": float(order.get("amount") or 0.0),
                "stop_price": float(stop_price),
                "created_at": str(order.get("datetime") or datetime.now(timezone.utc).isoformat()),
            }
            if self._protection_order_map.get(order_id) != payload:
                self._protection_order_map[order_id] = payload
                restored += 1
                dirty = True

        if dirty:
            self._save_order_bot_map()
            self._save_protection_order_map()
        return restored

    def _collect_registered_protection_levels(self) -> dict[str, dict[str, float]]:
        """从保护单注册表归并出每个持仓的止损/止盈。"""
        levels: dict[str, dict[str, Any]] = {}
        for order_id, payload in self._protection_order_map.items():
            if not isinstance(payload, dict):
                continue
            symbol = self._normalize_registry_symbol(str(payload.get("symbol") or ""))
            if not symbol:
                continue
            stop_price = payload.get("stop_price")
            if stop_price in (None, ""):
                continue
            order_type = str(payload.get("order_type") or "").upper()
            strategy = str(payload.get("strategy") or "")
            order_side = "take_profit" if strategy.startswith("tp_") or order_type.startswith("TAKE_PROFIT") else "stop_loss"
            try:
                numeric_order_id = int(str(order_id))
            except ValueError:
                numeric_order_id = 0
            slot = levels.setdefault(symbol, {})
            order_key = f"{order_side}_order_id"
            if numeric_order_id >= int(slot.get(order_key) or 0):
                slot[order_side] = float(stop_price)
                slot[order_key] = numeric_order_id
        return levels
