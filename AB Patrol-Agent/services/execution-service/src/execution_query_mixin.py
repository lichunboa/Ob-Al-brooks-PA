"""
执行服务查询能力混入。
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from .models import AccountSummary, Balance, OpenOrder, Position, PositionSide, TradeHistory

logger = logging.getLogger(__name__)


class ExecutionQueryMixin:
    """执行服务查询能力混入。"""

    async def _call_with_time_async(self, op_name: str, func, *args, **kwargs):
        """把同步交易所查询放到线程池，避免阻塞事件循环。"""
        return await asyncio.to_thread(self._call_with_time_sync, op_name, func, *args, **kwargs)

    async def get_balance(self) -> list[Balance]:
        """获取账户余额（扩展版 - 包含更多交易所信息）"""
        try:
            if self.exchange_name == "ctrader":
                info = self.exchange.get_account_info()
                if not info or info.get("error"):
                    return []
                balance = float(info.get("balance", 0))
                equity = float(info.get("equity", balance))
                margin = float(info.get("margin", 0))
                free_margin = float(info.get("free_margin", balance))
                unrealized_pnl = equity - balance
                margin_level = float(info.get("margin_level", 0)) if info.get("margin_level") is not None else None
                risk_level = "safe"
                if margin_level is not None and margin_level > 0:
                    if margin_level < 1.2:
                        risk_level = "danger"
                    elif margin_level < 2.0:
                        risk_level = "warning"
                return [
                    Balance(
                        asset=self.account_asset,
                        balance=balance,
                        available=free_margin,
                        unrealized_pnl=unrealized_pnl,
                        equity=equity,
                        margin_ratio=margin_level,
                        initial_margin=margin,
                        total_wallet_balance=equity,
                        total_margin_balance=equity,
                        total_position_margin=margin,
                        total_order_margin=0.0,
                        available_balance=free_margin,
                        margin_level=margin_level,
                        risk_level=risk_level,
                    )
                ]

            balance = await self._call_with_time_async("fetch_balance", self.exchange.fetch_balance)
            self._clear_exchange_block_on_private_success()

            usdt = balance.get("USDT", {})
            if usdt:
                info = balance.get("info", {})

                total_balance = float(usdt.get("total", 0))
                available = float(usdt.get("free", 0))
                unrealized_pnl = 0

                cross_wallet_balance = None
                cross_unpnl = None
                available_balance = None
                max_withdraw_amount = None
                equity = None
                frozen_balance = None
                margin_ratio = None
                notional_usd = None
                initial_margin = None
                maintenance_margin = None

                if self.exchange_name == "binance":
                    if isinstance(info, list) and info:
                        usdt_info = next((item for item in info if item.get("asset") == "USDT"), {})
                    else:
                        usdt_info = info

                    unrealized_pnl = float(usdt_info.get("totalUnrealizedProfit", 0))
                    cross_wallet_balance = float(usdt_info.get("crossWalletBalance", total_balance))
                    cross_unpnl = float(usdt_info.get("crossUnPnl", unrealized_pnl))
                    available_balance = float(usdt_info.get("availableBalance", available))
                    max_withdraw_amount = float(usdt_info.get("maxWithdrawAmount", available))

                    total_initial_margin = float(usdt_info.get("totalInitialMargin", 0))
                    total_maint_margin = float(usdt_info.get("totalMaintMargin", 0))
                    total_wallet_balance = float(usdt_info.get("totalWalletBalance", total_balance))

                    initial_margin = total_initial_margin
                    maintenance_margin = total_maint_margin

                    if total_maint_margin > 0:
                        margin_ratio = (total_wallet_balance + unrealized_pnl) / total_maint_margin

                elif self.exchange_name == "okx":
                    if isinstance(info, dict):
                        data = info.get("data", [])
                        if data and isinstance(data, list):
                            account_data = data[0]
                            details = account_data.get("details", [])

                            usdt_detail = next((d for d in details if d.get("ccy") == "USDT"), {})

                            if usdt_detail:
                                equity = float(usdt_detail.get("eq", total_balance))
                                available = float(usdt_detail.get("availBal", available))
                                frozen_balance = float(usdt_detail.get("frozenBal", 0))
                                unrealized_pnl = float(usdt_detail.get("upl", 0))

                            notional_usd = float(account_data.get("notionalUsd", 0))
                            initial_margin = float(account_data.get("imr", 0))
                            maintenance_margin = float(account_data.get("mmr", 0))

                            margin_ratio_str = account_data.get("mgnRatio", "")
                            if margin_ratio_str:
                                try:
                                    margin_ratio = float(margin_ratio_str)
                                except Exception:
                                    margin_ratio = None

                margin_level = None
                risk_level = "safe"

                if maintenance_margin and maintenance_margin > 0:
                    effective_equity = (equity or total_balance) + unrealized_pnl
                    margin_level = effective_equity / maintenance_margin

                    if margin_level < 1.2:
                        risk_level = "danger"
                    elif margin_level < 2.0:
                        risk_level = "warning"
                    else:
                        risk_level = "safe"

                return [
                    Balance(
                        asset="USDT",
                        balance=total_balance,
                        available=available,
                        unrealized_pnl=unrealized_pnl,
                        cross_wallet_balance=cross_wallet_balance,
                        cross_unpnl=cross_unpnl,
                        available_balance=available_balance,
                        max_withdraw_amount=max_withdraw_amount,
                        equity=equity,
                        frozen_balance=frozen_balance,
                        margin_ratio=margin_ratio,
                        notional_usd=notional_usd,
                        initial_margin=initial_margin,
                        maintenance_margin=maintenance_margin,
                        total_wallet_balance=cross_wallet_balance or total_balance,
                        total_margin_balance=(cross_wallet_balance or total_balance) + unrealized_pnl,
                        total_position_margin=initial_margin,
                        total_order_margin=0.0,
                        leverage=None,
                        margin_level=margin_level,
                        risk_level=risk_level,
                    )
                ]

            return []
        except Exception as e:
            self._capture_exchange_block(e)
            logger.error(f"获取余额失败: {e}")
            return []

    async def get_positions(self) -> list[Position]:
        """获取持仓"""
        try:
            def _resolved_strategy(symbol: str) -> str | None:
                bot_ids = self.get_position_bot_ids(symbol)
                strategy = self.get_position_strategy(symbol, bot_ids[0] if bot_ids else None)
                if strategy and str(strategy).strip().lower() != "auto":
                    return str(strategy)
                recovered = self._recover_bot_from_order_map(symbol) or self._recover_bot_from_execution_log(symbol)
                recovered_strategy = str((recovered or {}).get("strategy") or "").strip()
                if recovered_strategy and recovered_strategy.lower() != "auto":
                    return recovered_strategy
                return None

            def _resolved_timeframe(symbol: str) -> str | None:
                bot_ids = self.get_position_bot_ids(symbol)
                timeframe = self.get_position_timeframe(symbol, bot_ids[0] if bot_ids else None)
                if timeframe:
                    return str(timeframe).strip().lower()
                recovered = self._recover_bot_from_order_map(symbol) or self._recover_bot_from_execution_log(symbol)
                recovered_timeframe = str((recovered or {}).get("timeframe") or "").strip().lower()
                return recovered_timeframe or None

            if self.exchange_name == "ctrader":
                positions = self.exchange.get_positions()
                result = []
                for pos in positions:
                    symbol = str(pos.get("symbol", "")).upper()
                    side = PositionSide.LONG if str(pos.get("side", "")).upper() == "BUY" else PositionSide.SHORT
                    quantity = abs(float(pos.get("quantity", 0) or 0))
                    if quantity <= 0:
                        continue
                    mark_price = float(pos.get("current_price", pos.get("entry_price", 0)) or 0)
                    margin = float(pos.get("margin", 0) or 0)
                    notional = self.quantity_to_account_notional(
                        symbol,
                        quantity,
                        mark_price,
                    )
                    leverage = max(1, round(notional / margin)) if margin > 0 else 1
                    result.append(
                        Position(
                            symbol=symbol,
                            side=side,
                            quantity=quantity,
                            entry_price=float(pos.get("entry_price", 0) or 0),
                            mark_price=mark_price,
                            unrealized_pnl=float(pos.get("unrealized_pnl", 0) or 0),
                            leverage=leverage,
                            margin_type="cross",
                            liquidation_price=None,
                            stop_loss=float(pos.get("stop_loss", 0) or 0) or None,
                            take_profit=float(pos.get("take_profit", 0) or 0) or None,
                            position_id=str(pos.get("position_id") or "") or None,
                            native_stop_loss=bool(float(pos.get("stop_loss", 0) or 0) or None),
                            native_take_profit=bool(float(pos.get("take_profit", 0) or 0) or None),
                            strategy=_resolved_strategy(symbol),
                            timeframe=_resolved_timeframe(symbol),
                        )
                    )
                return result

            positions = await self._call_with_time_async("fetch_positions", self.exchange.fetch_positions)
            self._clear_exchange_block_on_private_success()
            result = []

            for pos in positions:
                contracts = pos.get("contracts")
                try:
                    contracts_float = float(contracts) if contracts is not None else 0
                except (ValueError, TypeError):
                    contracts_float = 0

                if contracts_float != 0:
                    side = PositionSide.LONG if pos.get("side") == "long" else PositionSide.SHORT

                    def safe_float(val, default=0):
                        if val is None:
                            return default
                        try:
                            return float(val)
                        except (ValueError, TypeError):
                            return default

                    def safe_int(val, default=1):
                        if val is None:
                            return default
                        try:
                            return int(val)
                        except (ValueError, TypeError):
                            return default

                    raw_leverage = pos.get("leverage")
                    if raw_leverage is not None:
                        calc_leverage = safe_int(raw_leverage, 1)
                    else:
                        notional = safe_float(pos.get("notional"))
                        init_margin = safe_float(pos.get("initialMargin"))
                        if init_margin > 0 and notional > 0:
                            calc_leverage = max(1, round(notional / init_margin))
                        else:
                            calc_leverage = 1

                    symbol = pos.get("symbol", "").replace("/", "")
                    result.append(
                        Position(
                            symbol=symbol,
                            side=side,
                            quantity=abs(contracts_float),
                            entry_price=safe_float(pos.get("entryPrice")),
                            mark_price=safe_float(pos.get("markPrice")),
                            unrealized_pnl=safe_float(pos.get("unrealizedPnl")),
                            leverage=calc_leverage,
                            margin_type=pos.get("marginType", "cross"),
                            liquidation_price=safe_float(pos.get("liquidationPrice")) if pos.get("liquidationPrice") else None,
                            stop_loss=None,
                            take_profit=None,
                            position_id=None,
                            native_stop_loss=False,
                            native_take_profit=False,
                            strategy=_resolved_strategy(symbol),
                            timeframe=_resolved_timeframe(symbol),
                        )
                    )

            protection_levels = self._collect_registered_protection_levels()
            for position in result:
                levels = protection_levels.get(self._normalize_registry_symbol(position.symbol))
                if not levels:
                    continue
                if position.stop_loss is None and levels.get("stop_loss") is not None:
                    position.stop_loss = float(levels["stop_loss"])
                if position.take_profit is None and levels.get("take_profit") is not None:
                    position.take_profit = float(levels["take_profit"])

            return result
        except Exception as e:
            self._capture_exchange_block(e)
            logger.error(f"获取持仓失败: {e}")
            return []

    async def get_open_orders(self, symbol: Optional[str] = None) -> list[OpenOrder]:
        """获取挂单"""
        try:
            def _as_reduce_only(raw: Any) -> bool:
                if isinstance(raw, str):
                    return raw.strip().lower() in {"true", "1", "yes", "y"}
                return bool(raw)

            if self.exchange_name == "ctrader":
                orders = self.exchange.get_open_orders(symbol)
                result = []
                for order in orders:
                    order_id = str(order.get("order_id", ""))
                    bot_id = self._lookup_bot_id(order_id)
                    strategy = self.get_order_strategy(order_id)
                    timeframe = self.get_order_timeframe(order_id)
                    if strategy == "auto":
                        recovered = self._recover_bot_from_execution_log(str(order.get("symbol", "")).upper())
                        strategy = str((recovered or {}).get("strategy") or "auto")
                        timeframe = timeframe or str((recovered or {}).get("timeframe") or "").strip().lower() or None
                    result.append(
                        OpenOrder(
                            order_id=order_id,
                            symbol=str(order.get("symbol", "")).upper(),
                            side=str(order.get("side", "")).upper(),
                            order_type=str(order.get("type", "")).upper(),
                            quantity=float(order.get("quantity", 0) or 0),
                            price=float(order.get("price")) if order.get("price") is not None else None,
                            stop_price=None,
                            status=str(order.get("status", "")),
                            reduce_only=False,
                            created_at=None,
                            bot_id=bot_id,
                            client_order_id=None,
                            strategy=None if strategy == "auto" else strategy,
                            timeframe=timeframe,
                        )
                    )
                return result

            orders = []
            if symbol:
                ccxt_sym = self._normalize_symbol_for_ccxt(symbol)
                orders = await self._call_with_time_async("fetch_open_orders", self.exchange.fetch_open_orders, ccxt_sym)
                self._clear_exchange_block_on_private_success()
            else:
                positions = await self.get_positions()
                symbols_to_check = set(self._iter_allowed_ccxt_symbols())
                for pos in positions:
                    symbols_to_check.add(self._normalize_symbol_for_ccxt(pos.symbol))
                for sym in symbols_to_check:
                    try:
                        sym_orders = await self._call_with_time_async("fetch_open_orders", self.exchange.fetch_open_orders, sym)
                        self._clear_exchange_block_on_private_success()
                        orders.extend(sym_orders)
                    except Exception as exc:
                        self._capture_exchange_block(exc)
                        pass

            if self.exchange_name == "binance":
                native_orders = await asyncio.to_thread(self._fetch_native_binance_open_orders, symbol)
                if native_orders:
                    self._clear_exchange_block_on_private_success()
                    existing_ids = {str(order.get("id") or "") for order in orders if isinstance(order, dict)}
                    for order in native_orders:
                        order_id = str(order.get("id") or "")
                        if order_id and order_id not in existing_ids:
                            orders.append(order)
                            existing_ids.add(order_id)
                native_algo_orders = await asyncio.to_thread(self._fetch_native_binance_open_algo_orders, symbol)
                if native_algo_orders:
                    self._clear_exchange_block_on_private_success()
                    existing_ids = {str(order.get("id") or "") for order in orders if isinstance(order, dict)}
                    for order in native_algo_orders:
                        order_id = str(order.get("id") or "")
                        if order_id and order_id not in existing_ids:
                            orders.append(order)
                            existing_ids.add(order_id)

            if self.exchange_name != "ctrader":
                existing_ids = {str(order.get("id") or "") for order in orders if isinstance(order, dict)}
                symbols_to_supplement: set[str] = set()
                if symbol:
                    symbols_to_supplement.add(self._normalize_symbol_for_ccxt(symbol))
                else:
                    positions = await self.get_positions()
                    for pos in positions:
                        symbols_to_supplement.add(self._normalize_symbol_for_ccxt(pos.symbol))
                    symbols_to_supplement.update(self._iter_allowed_ccxt_symbols())
                for sym in symbols_to_supplement:
                    try:
                        recent_orders = await self._call_with_time_async("fetch_orders", self.exchange.fetch_orders, sym, None, 50)
                        self._clear_exchange_block_on_private_success()
                    except Exception as exc:
                        self._capture_exchange_block(exc)
                        continue
                    for order in recent_orders:
                        if not isinstance(order, dict):
                            continue
                        info = order.get("info") if isinstance(order.get("info"), dict) else {}
                        params = order.get("params") if isinstance(order.get("params"), dict) else {}
                        order_id = str(order.get("id") or "")
                        if not order_id or order_id in existing_ids:
                            continue
                        order_type = str(order.get("type") or "").upper()
                        order_status = str(order.get("status") or "").lower()
                        reduce_only_recent = _as_reduce_only(
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
                        if order_type not in {"STOP_MARKET", "STOP", "TAKE_PROFIT_MARKET", "TAKE_PROFIT"} and not (
                            reduce_only_recent and order_type == "LIMIT"
                        ):
                            continue
                        if order_status not in {"open", "new"}:
                            continue
                        orders.append(order)
                        existing_ids.add(order_id)

                positions = await self.get_positions()
                cleaned = self._cleanup_live_protection_orders(
                    [item for item in orders if isinstance(item, dict)],
                    positions,
                )
                if cleaned:
                    logger.info("已强制清理 %s 条残留/重复保护单", cleaned)
                stub_symbols = set(symbols_to_supplement)
                if symbol:
                    stub_symbols.add(self._normalize_symbol_for_ccxt(symbol))
                dropped = self._reconcile_registered_protection_orders(
                    stub_symbols,
                    [item for item in orders if isinstance(item, dict)],
                    positions,
                )
                if dropped:
                    logger.info("保护单注册表已对账，移除 %s 条旧记录", dropped)
                registered_stubs = self._build_registered_protection_stubs(
                    stub_symbols,
                    positions,
                    existing_ids,
                )
                if registered_stubs:
                    orders.extend(registered_stubs)

                self._restore_registered_protection_orders(orders)

            result = []
            for order in orders:
                order_id = str(order.get("id", ""))
                info = order.get("info") if isinstance(order.get("info"), dict) else {}
                bot_id = self._lookup_bot_id(order_id)
                client_id = order.get("clientOrderId", "")
                if not bot_id and client_id and client_id.startswith("AB_"):
                    parts = client_id.split("_")
                    if len(parts) >= 2:
                        bot_id = parts[1]

                order_type = str(
                    order.get("type")
                    or info.get("origType")
                    or info.get("type")
                    or ""
                ).upper()
                stop_price = (
                    order.get("stopPrice")
                    or info.get("stopPrice")
                    or info.get("triggerPrice")
                    or info.get("activatePrice")
                )
                params = order.get("params") if isinstance(order.get("params"), dict) else {}
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

                result.append(
                    OpenOrder(
                        order_id=str(order.get("id", "")),
                        symbol=order.get("symbol", "").replace("/", ""),
                        side=order.get("side", "").upper(),
                        order_type=order_type,
                        quantity=float(order.get("amount", 0)),
                        price=float(order.get("price")) if order.get("price") else None,
                        stop_price=float(stop_price) if stop_price else None,
                        status=order.get("status") or "",
                        reduce_only=reduce_only,
                        created_at=order.get("datetime"),
                        exchange_confirmed=not bool(order.get("__registered_stub")),
                        bot_id=bot_id,
                        client_order_id=client_id,
                        strategy=(
                            None
                            if self.get_order_strategy(order_id) == "auto"
                            else self.get_order_strategy(order_id)
                        ),
                        timeframe=self.get_order_timeframe(order_id),
                    )
                )

            return result
        except Exception as e:
            self._capture_exchange_block(e)
            logger.error(f"获取挂单失败: {e}")
            return []

    async def get_trade_history(
        self,
        symbol: Optional[str] = None,
        limit: int = 50,
    ) -> list[TradeHistory]:
        """获取交易历史"""
        try:
            if self.exchange_name == "ctrader":
                logger.info("cTrader 交易历史接口尚未接入，返回空列表")
                return []
            if symbol:
                ccxt_sym = self._normalize_symbol_for_ccxt(symbol)
                trades = await self._call_with_time_async("fetch_my_trades", self.exchange.fetch_my_trades, ccxt_sym, limit=limit)
                self._clear_exchange_block_on_private_success()
            else:
                symbols_to_check = {
                    "BTC/USDT:USDT",
                    "ETH/USDT:USDT",
                    "SOL/USDT:USDT",
                    "BNB/USDT:USDT",
                }
                positions = await self.get_positions()
                for pos in positions:
                    symbols_to_check.add(self._normalize_symbol_for_ccxt(pos.symbol))

                trades = []
                for sym in symbols_to_check:
                    try:
                        sym_trades = await self._call_with_time_async(
                            "fetch_my_trades",
                            self.exchange.fetch_my_trades,
                            sym,
                            limit=limit,
                        )
                        self._clear_exchange_block_on_private_success()
                        trades.extend(sym_trades)
                    except Exception as exc:
                        self._capture_exchange_block(exc)
                        pass

            result = []
            for trade in trades:
                info = trade.get("info", {})
                fee = trade.get("fee") or {}

                order_id = str(trade.get("order", ""))

                bot_id = self._lookup_bot_id(order_id)
                if not bot_id:
                    client_id = info.get("clientOrderId", "")
                    if client_id and client_id.startswith("AB_"):
                        parts = client_id.split("_")
                        if len(parts) >= 2:
                            bot_id = parts[1]

                result.append(
                    TradeHistory(
                        trade_id=str(trade.get("id", "")),
                        order_id=order_id,
                        symbol=trade.get("symbol", "").replace("/", ""),
                        side=trade.get("side", "").upper(),
                        quantity=float(trade.get("amount", 0)),
                        price=float(trade.get("price", 0)),
                        realized_pnl=float(info.get("realizedPnl", 0)),
                        commission=float(fee.get("cost", 0)),
                        commission_asset=fee.get("currency", "USDT"),
                        timestamp=trade.get("datetime"),
                        bot_id=bot_id,
                    )
                )

            return result
        except Exception as e:
            self._capture_exchange_block(e)
            logger.error(f"获取交易历史失败: {e}")
            return []

    async def get_account_summary(self) -> Optional[AccountSummary]:
        """获取账户汇总信息"""
        try:
            if self.exchange_name == "ctrader":
                balances = await self.get_balance()
                balance = balances[0] if balances else None
                positions = await self.get_positions()
                open_orders = await self.get_open_orders()
                if not balance:
                    return None
                position_value = sum(p.quantity * p.mark_price for p in positions)
                return AccountSummary(
                    total_balance=balance.balance,
                    available_balance=balance.available,
                    total_unrealized_pnl=balance.unrealized_pnl,
                    total_margin_balance=balance.total_margin_balance or balance.balance,
                    position_count=len(positions),
                    total_position_value=position_value,
                    open_order_count=len(open_orders),
                    today_realized_pnl=0.0,
                    today_trade_count=0,
                    today_commission=0.0,
                    margin_ratio=balance.margin_ratio,
                    can_trade=True,
                )

            balance = await self._call_with_time_async("fetch_balance", self.exchange.fetch_balance)
            info = balance.get("info", {})

            usdt = balance.get("USDT", {})
            total_balance = float(usdt.get("total", 0))
            available = float(usdt.get("free", 0))
            unrealized_pnl = float(info.get("totalUnrealizedProfit", 0))
            margin_balance = float(info.get("totalMarginBalance", total_balance))

            positions = await self.get_positions()
            position_value = sum(p.quantity * p.mark_price for p in positions)

            open_orders = await self.get_open_orders()

            trades = await self.get_trade_history(limit=100)
            today = datetime.now(timezone.utc).date()
            today_trades = [
                t for t in trades
                if t.timestamp and t.timestamp.date() == today
            ]
            today_pnl = sum(t.realized_pnl for t in today_trades)
            today_commission = sum(t.commission for t in today_trades)

            return AccountSummary(
                total_balance=total_balance,
                available_balance=available,
                total_unrealized_pnl=unrealized_pnl,
                total_margin_balance=margin_balance,
                position_count=len(positions),
                total_position_value=position_value,
                open_order_count=len(open_orders),
                today_realized_pnl=today_pnl,
                today_trade_count=len(today_trades),
                today_commission=today_commission,
                margin_ratio=float(info.get("marginRatio")) if info.get("marginRatio") else None,
                can_trade=bool(info.get("canTrade", True)),
            )
        except Exception as e:
            self._capture_exchange_block(e)
            logger.error(f"获取账户汇总失败: {e}")
            return None
