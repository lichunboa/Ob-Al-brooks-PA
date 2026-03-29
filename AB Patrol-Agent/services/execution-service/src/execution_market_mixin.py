"""
执行器市场信息与约束混入。
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

from .config import MAX_LEVERAGE

logger = logging.getLogger(__name__)


class ExecutionMarketMixin:
    """封装品种约束、时间同步、费率与杠杆相关逻辑。"""

    @staticmethod
    def _precision_to_step(value: Any) -> float | None:
        """把交易所 precision 字段安全转换成 step/tick。"""
        if value in (None, "", False):
            return None
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return None
        if numeric <= 0:
            return None
        if float(int(numeric)) == numeric and numeric >= 1:
            digits = int(numeric)
            if 0 < digits <= 18:
                return 10 ** (-digits)
        return numeric

    @staticmethod
    def _snap_quantity_with_rules(
        desired: float,
        *,
        min_qty: float,
        max_qty: float,
        step: float,
    ) -> float:
        """按交易所规格向下贴合数量。"""
        snapped = max(0.0, float(desired or 0.0))
        if snapped <= 0:
            return 0.0
        if step > 0:
            snapped = float(int(snapped / step)) * step
        if min_qty > 0 and snapped < min_qty:
            snapped = min_qty if desired >= min_qty else 0.0
        if max_qty > 0:
            snapped = min(snapped, max_qty)
        return max(0.0, snapped)

    def get_symbol_info(self, symbol: str) -> dict:
        """获取品种规格，失败时返回保守默认值。"""
        try:
            if hasattr(self.exchange, "get_symbol_info"):
                return self.exchange.get_symbol_info(symbol) or {}
        except Exception as exc:
            logger.warning("获取品种规格失败 %s: %s", symbol, exc)
        return {
            "symbol": symbol,
            "base_asset": "",
            "quote_asset": self.account_asset,
            "min_quantity": 0.0,
            "max_quantity": 0.0,
            "quantity_step": 0.0,
            "tick_size": 0.0,
            "lot_size": 0.0,
            "min_notional": 0.0,
        }

    def _load_market_descriptor(self, symbol: str) -> dict[str, Any]:
        """读取 ccxt market 元数据，优先返回与 symbol 最匹配的市场描述。"""
        if self.exchange_name == "ctrader":
            return {}
        try:
            markets = self._call_with_time_sync("load_markets", self.exchange.load_markets)
        except Exception as exc:
            logger.warning("加载市场元数据失败 %s: %s", symbol, exc)
            return {}

        candidates = [
            self._normalize_symbol_for_ccxt(symbol),
            str(symbol or ""),
            str(symbol or "").split(":")[0],
            self._norm_symbol_base(str(symbol or "")),
        ]
        for candidate in candidates:
            market = markets.get(candidate)
            if isinstance(market, dict):
                return market

        normalized_base = self._norm_symbol_base(self._normalize_symbol_for_ccxt(symbol))
        for market in markets.values():
            if not isinstance(market, dict):
                continue
            market_symbol = self._norm_symbol_base(str(market.get("symbol") or ""))
            market_id = self._norm_symbol_base(str(market.get("id") or ""))
            if normalized_base and normalized_base in {market_symbol, market_id}:
                return market
        return {}

    @staticmethod
    def _positive_float(*values: Any) -> float | None:
        """从多个候选值中提取首个有效正数。"""
        for value in values:
            if value in (None, "", False):
                continue
            try:
                numeric = float(value)
            except (TypeError, ValueError):
                continue
            if numeric > 0:
                return numeric
        return None

    def _fetch_symbol_max_leverage(self, symbol: str, market: dict[str, Any]) -> float | None:
        """读取单品种最大杠杆，优先用交易所实时或半实时数据。"""
        if self.exchange_name == "ctrader":
            try:
                info = self.exchange.get_account_info()
            except Exception as exc:
                logger.warning("读取 cTrader 杠杆上限失败 %s: %s", symbol, exc)
                return None
            return self._positive_float(info.get("leverage"))

        limits = (market.get("limits") or {}).get("leverage") if isinstance(market, dict) else {}
        info = market.get("info") if isinstance(market, dict) else {}
        max_leverage = self._positive_float(
            (limits or {}).get("max"),
            market.get("maxLeverage") if isinstance(market, dict) else None,
            (info or {}).get("maxLeverage") if isinstance(info, dict) else None,
            (info or {}).get("lever") if isinstance(info, dict) else None,
            (info or {}).get("maxLever") if isinstance(info, dict) else None,
            (info or {}).get("leverMax") if isinstance(info, dict) else None,
        )
        if max_leverage is not None:
            return max_leverage

        ccxt_symbol = str(market.get("symbol") or self._normalize_symbol_for_ccxt(symbol))
        if self.exchange_name == "binance" and hasattr(self.exchange, "fetch_market_leverage_tiers"):
            try:
                tiers = self._call_with_time_sync(
                    "fetch_market_leverage_tiers",
                    self.exchange.fetch_market_leverage_tiers,
                    ccxt_symbol,
                )
                if isinstance(tiers, list):
                    tier_levels = [
                        float(item.get("maxLeverage") or 0.0)
                        for item in tiers
                        if isinstance(item, dict) and float(item.get("maxLeverage") or 0.0) > 0
                    ]
                    if tier_levels:
                        return max(tier_levels)
            except Exception as exc:
                logger.warning("读取币安杠杆分层失败 %s: %s", symbol, exc)
        return None

    def get_symbol_constraints(self, symbol: str, desired_leverage: float | None = None) -> dict[str, Any]:
        """返回 live sizing / 下单都可直接复用的品种约束。"""
        cache_key = f"{self.exchange_name}:{self._norm_symbol_base(str(symbol or ''))}"
        cached = self._symbol_constraints_cache.get(cache_key, {})
        cached_at = float(cached.get("cached_at") or 0.0)

        if not cached or time.time() - cached_at > self._symbol_constraints_ttl_seconds:
            info = self.get_symbol_info(symbol)
            constraints: dict[str, Any] = {
                "symbol": str(info.get("symbol") or symbol),
                "exchange": self.exchange_name,
                "account_asset": self.account_asset,
                "base_asset": str(info.get("base_asset") or ""),
                "quote_asset": str(info.get("quote_asset") or self.account_asset),
                "min_quantity": float(info.get("min_quantity") or 0.0),
                "max_quantity": float(info.get("max_quantity") or 0.0),
                "quantity_step": float(info.get("quantity_step") or 0.0),
                "tick_size": float(info.get("tick_size") or 0.0),
                "lot_size": float(info.get("lot_size") or 0.0),
                "min_notional": float(info.get("min_notional") or 0.0),
                "contract_size": 0.0,
                "market_symbol": str(info.get("symbol") or symbol),
                "max_leverage": None,
                "cached_at": time.time(),
            }

            if self.exchange_name != "ctrader":
                market = self._load_market_descriptor(symbol)
                amount_precision = self._precision_to_step(
                    ((market.get("precision") or {}).get("amount") if isinstance(market, dict) else None)
                )
                price_precision = self._precision_to_step(
                    ((market.get("precision") or {}).get("price") if isinstance(market, dict) else None)
                )
                constraints["market_symbol"] = str(market.get("symbol") or self._normalize_symbol_for_ccxt(symbol))
                constraints["contract_size"] = float(market.get("contractSize") or 0.0) if isinstance(market, dict) else 0.0
                min_cost = self._positive_float(
                    ((market.get("limits") or {}).get("cost") or {}).get("min") if isinstance(market, dict) else None,
                    ((market.get("info") or {}).get("minNotional")) if isinstance(market, dict) else None,
                    ((market.get("info") or {}).get("notional")) if isinstance(market, dict) else None,
                )
                if min_cost is not None and constraints["min_notional"] <= 0:
                    constraints["min_notional"] = min_cost
                if constraints["quantity_step"] <= 0 and amount_precision is not None:
                    constraints["quantity_step"] = amount_precision
                if constraints["tick_size"] <= 0 and price_precision is not None:
                    constraints["tick_size"] = price_precision
                constraints["max_leverage"] = self._fetch_symbol_max_leverage(symbol, market)
            else:
                constraints["max_leverage"] = self._fetch_symbol_max_leverage(symbol, {})

            self._symbol_constraints_cache[cache_key] = constraints
            cached = constraints

        result = dict(cached)
        requested = self._positive_float(desired_leverage)
        global_cap = self._positive_float(MAX_LEVERAGE)
        if requested is not None and global_cap is not None:
            requested = min(requested, global_cap)
        max_leverage = self._positive_float(result.get("max_leverage"))
        if requested is not None and max_leverage is not None:
            result["effective_leverage"] = max(1.0, min(requested, max_leverage))
        elif requested is not None:
            result["effective_leverage"] = max(1.0, requested)
        else:
            result["effective_leverage"] = max_leverage
        return result

    def account_notional_to_quantity(self, symbol: str, notional: float, price: float) -> float:
        """把账户货币口径名义价值转换为下单数量。"""
        target_notional = max(0.0, float(notional or 0.0))
        if target_notional <= 0:
            return 0.0
        if self.exchange_name != "ctrader":
            return target_notional / price if price > 0 else 0.0

        info = self.get_symbol_info(symbol)
        base_asset = str(info.get("base_asset") or "").upper()
        quote_asset = str(info.get("quote_asset") or "").upper()
        account_asset = str(self.account_asset or "").upper()

        if base_asset and base_asset == account_asset:
            return target_notional
        if quote_asset and quote_asset == account_asset:
            return target_notional / price if price > 0 else 0.0
        return target_notional / price if price > 0 else 0.0

    def quantity_to_account_notional(self, symbol: str, quantity: float, price: float) -> float:
        """把下单数量换算为账户货币口径名义价值。"""
        actual_quantity = max(0.0, float(quantity or 0.0))
        if actual_quantity <= 0:
            return 0.0
        if self.exchange_name != "ctrader":
            return actual_quantity * max(price, 0.0)

        info = self.get_symbol_info(symbol)
        base_asset = str(info.get("base_asset") or "").upper()
        quote_asset = str(info.get("quote_asset") or "").upper()
        account_asset = str(self.account_asset or "").upper()

        if base_asset and base_asset == account_asset:
            return actual_quantity
        if quote_asset and quote_asset == account_asset:
            return actual_quantity * max(price, 0.0)
        return actual_quantity * max(price, 0.0)

    def snap_quantity_to_symbol(self, symbol: str, quantity: float) -> float:
        """把数量向下贴合到交易所允许的最小单位。"""
        desired = max(0.0, float(quantity or 0.0))
        if desired <= 0:
            return 0.0
        if self.exchange_name == "ctrader" and hasattr(self.exchange, "client"):
            try:
                volume = self.exchange.client.quantity_to_volume(symbol, desired)
                return float(self.exchange.client.volume_to_quantity(volume))
            except Exception as exc:
                logger.warning("cTrader 数量贴合失败 %s: %s", symbol, exc)

        info = self.get_symbol_info(symbol)
        min_qty = max(0.0, float(info.get("min_quantity") or 0.0))
        step = max(0.0, float(info.get("quantity_step") or 0.0))
        max_qty = max(0.0, float(info.get("max_quantity") or 0.0))
        return self._snap_quantity_with_rules(
            desired,
            min_qty=min_qty,
            max_qty=max_qty,
            step=step,
        )

    def snap_price_to_symbol(self, symbol: str, price: float, *, side: str | None = None) -> float:
        """把价格贴合到交易所允许的最小跳动单位。"""
        desired = float(price or 0.0)
        if desired <= 0:
            return 0.0
        info = self.get_symbol_info(symbol)
        tick_size = max(0.0, float(info.get("tick_size") or 0.0))
        if tick_size <= 0:
            return desired

        side_upper = str(side or "").strip().upper()
        ratio = desired / tick_size
        if side_upper == "BUY":
            snapped_units = int(ratio)
        elif side_upper == "SELL":
            snapped_units = int(-(-ratio // 1))
        else:
            snapped_units = round(ratio)
        snapped = float(snapped_units) * tick_size
        if snapped <= 0:
            snapped = tick_size
        return snapped

    def snap_close_quantity_to_symbol(self, symbol: str, quantity: float, *, held_quantity: float | None = None) -> float:
        """按平仓语义贴合数量，必要时自动升级为整仓平掉。"""
        desired = max(0.0, float(quantity or 0.0))
        held = max(0.0, float(held_quantity or 0.0))
        if desired <= 0:
            return 0.0
        if self.exchange_name == "ctrader" and hasattr(self.exchange, "client"):
            try:
                volume = self.exchange.client.quantity_to_volume(symbol, desired)
                snapped = float(self.exchange.client.volume_to_quantity(volume))
                if held > 0:
                    snapped = min(snapped, held)
                return max(0.0, snapped)
            except Exception as exc:
                logger.warning("cTrader 平仓数量贴合失败 %s: %s", symbol, exc)

        info = self.get_symbol_info(symbol)
        min_qty = max(0.0, float(info.get("min_quantity") or 0.0))
        max_qty = max(0.0, float(info.get("max_quantity") or 0.0))
        step = max(0.0, float(info.get("quantity_step") or 0.0))
        tol = max(step * 0.5, 1e-8) if step > 0 else 1e-8

        snapped = self._snap_quantity_with_rules(
            desired,
            min_qty=min_qty,
            max_qty=max_qty,
            step=step,
        )
        if held > 0:
            snapped = min(snapped, held)
            if held - desired <= tol:
                return held
            if snapped <= 0 and min_qty > 0 and held - desired < min_qty + tol:
                return held
            remaining = held - snapped
            if remaining > tol and min_qty > 0 and remaining < min_qty:
                return held
        return max(0.0, snapped)

    @staticmethod
    def _is_timestamp_error(exc: Exception) -> bool:
        text = str(exc)
        return "-1021" in text or "Timestamp for this request" in text

    def _sync_exchange_time(self) -> bool:
        try:
            if hasattr(self.exchange, "load_time_difference"):
                diff = self.exchange.load_time_difference()
                logger.info("交易所时间同步完成: timeDifference=%sms", diff)
                return True
            server_time = self.exchange.fetch_time()
            local_time = int(time.time() * 1000)
            diff = int(server_time) - local_time
            self.exchange.options["timeDifference"] = diff
            logger.info("交易所时间同步完成: timeDifference=%sms", diff)
            return True
        except Exception as sync_exc:
            logger.warning("交易所时间同步失败: %s", sync_exc)
            return False

    def _call_with_time_sync(self, op_name: str, func, *args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as exc:
            if self._is_timestamp_error(exc) and self._sync_exchange_time():
                logger.warning("%s 命中时间戳错误，已自动重试一次", op_name)
                return func(*args, **kwargs)
            raise

    def fetch_trading_fees(self) -> dict:
        """从币安获取实际交易费率（启动时调用一次）。"""
        if self.exchange_name == "ctrader":
            logger.info("cTrader 不使用交易所费率同步")
            return {}
        try:
            markets = self.exchange.load_markets()
            for symbol in ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT", "BNB/USDT:USDT"]:
                if symbol in markets:
                    market = markets[symbol]
                    self._cached_fees[market["id"]] = {
                        "maker": market.get("maker", 0.0002),
                        "taker": market.get("taker", 0.0004),
                    }
            logger.info("获取币安费率成功: %s 个品种", len(self._cached_fees))
            return self._cached_fees
        except Exception as exc:
            logger.warning("获取币安费率失败: %s", exc)
            return {}

    def _verify_stop_order(self, order_id: str, symbol: str) -> bool:
        """验证止损单是否真的存在于交易所（Demo 模式兜底检查）。"""
        try:
            order = self.exchange.fetch_order(order_id, symbol)
            status = str(order.get("status", "")).lower()
            return status in ("open", "new")
        except Exception as exc:
            logger.warning("止损单验证失败 (order_id=%s): %s", order_id, exc)
            return False

    def _check_connection(self) -> bool:
        """检查连接。"""
        try:
            if self.exchange_name == "ctrader":
                account = self.exchange.get_account_info()
                return "error" not in account
            self._call_with_time_sync("fetch_time", self.exchange.fetch_time)
            return True
        except Exception as exc:
            logger.error("连接检查失败: %s", exc)
            return False

    async def set_leverage(self, symbol: str, leverage: int) -> bool:
        """设置杠杆。"""
        if self.exchange_name == "ctrader":
            logger.info("cTrader 当前不通过 execution-service 设置杠杆，跳过: %s %sx", symbol, leverage)
            return True

        ok, msg = self.risk_manager.check_leverage(leverage)
        if not ok:
            logger.warning("杠杆设置被拒绝: %s", msg)
            return False

        if "/" not in symbol:
            raw = symbol.split(":")[0] if ":" in symbol else symbol
            settle = symbol.split(":")[1] if ":" in symbol else "USDT"
            for quote in ["USDT", "BUSD", "USDC"]:
                if raw.endswith(quote):
                    symbol = f"{raw[:-len(quote)]}/{quote}:{settle}"
                    break

        try:
            result = self._call_with_time_sync("set_leverage", self.exchange.set_leverage, leverage, symbol)
            actual_lev = result.get("leverage", leverage) if isinstance(result, dict) else leverage
            logger.info("设置 %s 杠杆为 %sx (请求=%sx)", symbol, actual_lev, leverage)
            return True
        except Exception as exc:
            logger.warning("设置杠杆失败 %s %sx: %s — 继续使用当前杠杆", symbol, leverage, exc)
            return False
