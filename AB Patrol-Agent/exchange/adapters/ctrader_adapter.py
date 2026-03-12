"""
cTrader 适配器。

对外维持 execution-service 需要的统一接口，
底层实际使用官方 Open API protobuf 协议。
"""

from __future__ import annotations

from typing import Any

from .base import ExchangeAdapter
from .ctrader_openapi_client import CTraderOpenAPIClient


class CTraderAdapter(ExchangeAdapter):
    """cTrader 统一适配层。"""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.client = CTraderOpenAPIClient(config)

    def get_account_info(self) -> dict[str, Any]:
        return self.client.get_account_info()

    def get_positions(self) -> list[dict[str, Any]]:
        return self.client.get_positions()

    def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        return self.client.get_open_orders(symbol)

    def place_order(
        self,
        symbol: str,
        side: str,
        quantity: float,
        order_type: str = "MARKET",
        price: float | None = None,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any]:
        return self.client.place_order(
            symbol=symbol,
            side=side,
            quantity=quantity,
            order_type=order_type,
            price=price,
            stop_loss=stop_loss,
            take_profit=take_profit,
        )

    def close_position(
        self,
        symbol: str,
        quantity: float | None = None,
    ) -> dict[str, Any]:
        return self.client.close_position(symbol, quantity)

    def modify_position(
        self,
        symbol: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any]:
        return self.client.modify_position(symbol, stop_loss=stop_loss, take_profit=take_profit)

    def cancel_order(self, symbol: str, order_id: str | None = None) -> dict[str, Any]:
        """兼容两种参数顺序。"""
        target_order_id = order_id
        if order_id is None:
            target_order_id = symbol
        elif str(symbol).isdigit() and not str(order_id).isdigit():
            target_order_id = symbol
        return self.client.cancel_order(str(target_order_id or ""))

    def cancel_all_orders(self, symbol: str | None = None) -> dict[str, Any]:
        return self.client.cancel_all_orders(symbol)

    def get_market_price(self, symbol: str) -> float | None:
        return self.client.get_market_price(symbol)

    def get_symbol_info(self, symbol: str) -> dict[str, Any]:
        try:
            return self.client.get_symbol_info(symbol)
        except Exception:
            normalized = self._fallback_normalize_symbol(symbol)
            return {
                "symbol": normalized,
                "base_asset": normalized[:3],
                "quote_asset": normalized[3:],
                "min_quantity": 1.0,
                "max_quantity": 1_000_000.0,
                "quantity_step": 1.0,
                "tick_size": 0.01,
                "lot_size": self._fallback_lot_quantity(normalized),
            }

    def normalize_symbol(self, symbol: str) -> str:
        try:
            return self.client.normalize_symbol_name(symbol)
        except Exception:
            return self._fallback_normalize_symbol(symbol)

    def quantity_to_lots(self, symbol: str, quantity: float) -> float:
        try:
            return self.client.quantity_to_lots(symbol, quantity)
        except Exception:
            lot_quantity = self._fallback_lot_quantity(self._fallback_normalize_symbol(symbol))
            return float(quantity or 0) / lot_quantity if lot_quantity > 0 else 0.0

    def lots_to_quantity(self, symbol: str, lots: float) -> float:
        try:
            return self.client.lots_to_quantity(symbol, lots)
        except Exception:
            return float(lots or 0) * self._fallback_lot_quantity(self._fallback_normalize_symbol(symbol))

    def get_trendbars(self, symbol: str, interval: str = "1h", limit: int = 50) -> list[dict[str, Any]]:
        return self.client.get_trendbars(symbol, interval=interval, limit=limit)

    @staticmethod
    def _fallback_normalize_symbol(symbol: str) -> str:
        raw = str(symbol or "").upper().replace("/", "").replace("-", "").replace("_", "").strip()
        raw = raw.replace("USDT", "USD")
        alias = {
            "US30": "US 30",
            "US500": "US 500",
            "NAS100": "US TECH 100",
            "US100": "US TECH 100",
            "GER40": "GERMANY 40",
            "UK100": "UK 100",
        }
        return alias.get(raw, raw)

    @staticmethod
    def _fallback_lot_quantity(symbol: str) -> float:
        normalized = str(symbol or "").upper()
        if normalized == "XAUUSD":
            return 100.0
        if normalized == "XAGUSD":
            return 5000.0
        if any(token in normalized for token in ["EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD", "USD"]):
            return 100000.0
        return 1.0
