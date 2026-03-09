"""
cTrader 适配器

实现 cTrader 的接口（通过 Open API）

API 文档：https://help.ctrader.com/open-api/
"""

from __future__ import annotations

from typing import Any

import requests

from .base import ExchangeAdapter


class CTraderAdapter(ExchangeAdapter):
    """cTrader 适配器"""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.client_id = config.get("client_id", "")
        self.client_secret = config.get("client_secret", "")
        self.access_token = config.get("access_token", "")
        self.account_id = config.get("account_id", "")
        self.base_url = config.get("base_url", "https://api.ctrader.com")
        self.demo = config.get("demo", False)

        if self.demo:
            self.base_url = "https://demo.ctraderapi.com"

        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        })

    def _request(
        self,
        method: str,
        endpoint: str,
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """发送 API 请求"""
        url = self.base_url + endpoint

        try:
            if method == "GET":
                response = self.session.get(url, params=params, timeout=10)
            elif method == "POST":
                response = self.session.post(url, json=data, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")

            response.raise_for_status()
            return response.json()

        except Exception as e:
            return {"error": str(e)}

    def get_account_info(self) -> dict[str, Any]:
        """获取账户信息"""
        try:
            result = self._request("GET", f"/v2/accounts/{self.account_id}")

            if not result or "error" in result:
                return {
                    "balance": 0.0,
                    "equity": 0.0,
                    "margin": 0.0,
                    "free_margin": 0.0,
                    "margin_level": 0.0,
                    "positions": [],
                }

            balance = float(result.get("balance", 0))
            equity = float(result.get("equity", 0))
            margin = float(result.get("margin", 0))
            free_margin = float(result.get("freeMargin", 0))
            margin_level = float(result.get("marginLevel", 0))

            return {
                "balance": balance,
                "equity": equity,
                "margin": margin,
                "free_margin": free_margin,
                "margin_level": margin_level,
                "positions": [],
            }
        except Exception as e:
            return {
                "balance": 0.0,
                "equity": 0.0,
                "margin": 0.0,
                "free_margin": 0.0,
                "margin_level": 0.0,
                "positions": [],
                "error": str(e),
            }

    def get_positions(self) -> list[dict[str, Any]]:
        """获取当前持仓"""
        try:
            result = self._request("GET", f"/v2/accounts/{self.account_id}/positions")

            if not result or "error" in result:
                return []

            positions = []
            for pos in result.get("positions", []):
                if not isinstance(pos, dict):
                    continue

                symbol = pos.get("symbolName", "")
                side = "BUY" if pos.get("tradeSide") == "BUY" else "SELL"
                lots = float(pos.get("volume", 0))
                quantity = self.lots_to_quantity(symbol, lots)
                entry_price = float(pos.get("entryPrice", 0))
                current_price = float(pos.get("currentPrice", entry_price))

                positions.append({
                    "symbol": symbol,
                    "side": side,
                    "quantity": quantity,
                    "entry_price": entry_price,
                    "current_price": current_price,
                    "unrealized_pnl": float(pos.get("swap", 0)) + float(pos.get("commission", 0)),
                    "margin": float(pos.get("margin", 0)),
                })

            return positions
        except Exception as e:
            return []

    def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """获取未成交订单"""
        try:
            result = self._request("GET", f"/v2/accounts/{self.account_id}/orders")

            if not result or "error" in result:
                return []

            orders = []
            for order in result.get("orders", []):
                if not isinstance(order, dict):
                    continue

                order_symbol = order.get("symbolName", "")
                if symbol and order_symbol != self.normalize_symbol(symbol):
                    continue

                lots = float(order.get("volume", 0))
                quantity = self.lots_to_quantity(order_symbol, lots)

                orders.append({
                    "order_id": str(order.get("orderId", "")),
                    "symbol": order_symbol,
                    "side": "BUY" if order.get("tradeSide") == "BUY" else "SELL",
                    "type": order.get("orderType", "").upper(),
                    "quantity": quantity,
                    "price": float(order.get("limitPrice", 0)) if order.get("limitPrice") else None,
                    "filled_quantity": 0.0,
                    "status": order.get("status", ""),
                })

            return orders
        except Exception as e:
            return []

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
        """下单"""
        try:
            symbol_name = self.normalize_symbol(symbol)
            lots = self.quantity_to_lots(symbol_name, quantity)

            # 构建订单参数
            order_data = {
                "accountId": self.account_id,
                "symbolName": symbol_name,
                "tradeSide": side,
                "volume": lots,
            }

            if order_type == "MARKET":
                order_data["orderType"] = "MARKET"
            elif order_type == "LIMIT":
                order_data["orderType"] = "LIMIT"
                order_data["limitPrice"] = price

            # 添加止损/止盈
            if stop_loss:
                order_data["stopLoss"] = stop_loss
            if take_profit:
                order_data["takeProfit"] = take_profit

            # 下单
            result = self._request("POST", "/v2/orders", data=order_data)

            if not result or "error" in result:
                return {
                    "success": False,
                    "order_id": None,
                    "filled_quantity": None,
                    "filled_price": None,
                    "error": result.get("error", "Unknown error"),
                }

            order_id = str(result.get("orderId", ""))
            filled_price = float(result.get("executionPrice", 0)) if result.get("executionPrice") else None

            return {
                "success": True,
                "order_id": order_id,
                "filled_quantity": quantity,
                "filled_price": filled_price,
                "error": None,
            }
        except Exception as e:
            return {
                "success": False,
                "order_id": None,
                "filled_quantity": None,
                "filled_price": None,
                "error": str(e),
            }

    def close_position(
        self,
        symbol: str,
        quantity: float | None = None,
    ) -> dict[str, Any]:
        """平仓"""
        try:
            # 获取当前持仓
            positions = self.get_positions()
            position = next((p for p in positions if p["symbol"] == symbol), None)

            if not position:
                return {
                    "success": False,
                    "order_id": None,
                    "filled_quantity": None,
                    "filled_price": None,
                    "error": "Position not found",
                }

            # 平仓数量
            close_qty = quantity if quantity else position["quantity"]

            # 平仓方向相反
            close_side = "SELL" if position["side"] == "BUY" else "BUY"

            # 使用市价单平仓
            return self.place_order(
                symbol=symbol,
                side=close_side,
                quantity=close_qty,
                order_type="MARKET",
            )
        except Exception as e:
            return {
                "success": False,
                "order_id": None,
                "filled_quantity": None,
                "filled_price": None,
                "error": str(e),
            }

    def modify_position(
        self,
        symbol: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any]:
        """修改持仓的止损/止盈"""
        try:
            # 获取持仓 ID
            positions = self.get_positions()
            position = next((p for p in positions if p["symbol"] == symbol), None)

            if not position:
                return {"success": False, "error": "Position not found"}

            # cTrader 需要通过修改订单来修改 SL/TP
            data = {
                "accountId": self.account_id,
                "positionId": position.get("position_id", ""),
            }

            if stop_loss:
                data["stopLoss"] = stop_loss
            if take_profit:
                data["takeProfit"] = take_profit

            result = self._request("POST", "/v2/positions/modify", data=data)

            if not result or "error" in result:
                return {"success": False, "error": result.get("error", "Unknown error")}

            return {"success": True, "error": None}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """取消订单"""
        try:
            data = {
                "accountId": self.account_id,
                "orderId": order_id,
            }
            result = self._request("POST", "/v2/orders/cancel", data=data)

            if not result or "error" in result:
                return {"success": False, "error": result.get("error", "Unknown error")}

            return {"success": True, "error": None}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def cancel_all_orders(self, symbol: str | None = None) -> dict[str, Any]:
        """取消所有订单"""
        try:
            # 获取所有未成交订单
            orders = self.get_open_orders(symbol)

            cancelled_count = 0
            for order in orders:
                result = self.cancel_order(order["symbol"], order["order_id"])
                if result.get("success"):
                    cancelled_count += 1

            return {
                "success": True,
                "cancelled_count": cancelled_count,
                "error": None,
            }
        except Exception as e:
            return {
                "success": False,
                "cancelled_count": 0,
                "error": str(e),
            }

    def get_market_price(self, symbol: str) -> float | None:
        """获取市场价格"""
        try:
            symbol_name = self.normalize_symbol(symbol)
            result = self._request("GET", f"/v2/symbols/{symbol_name}/quote")

            if not result or "error" in result:
                return None

            # cTrader 返回 bid/ask
            bid = float(result.get("bid", 0))
            ask = float(result.get("ask", 0))

            # 返回中间价
            return (bid + ask) / 2 if bid and ask else None
        except Exception as e:
            return None

    def get_symbol_info(self, symbol: str) -> dict[str, Any]:
        """获取品种信息"""
        try:
            symbol_name = self.normalize_symbol(symbol)
            result = self._request("GET", f"/v2/symbols/{symbol_name}")

            if not result or "error" in result:
                return {}

            return {
                "symbol": symbol_name,
                "base_asset": result.get("baseAsset", ""),
                "quote_asset": result.get("quoteAsset", ""),
                "min_quantity": float(result.get("minVolume", 0)),
                "max_quantity": float(result.get("maxVolume", 0)),
                "tick_size": float(result.get("tickSize", 0)),
                "lot_size": float(result.get("lotSize", 0)),
            }
        except Exception as e:
            return {}

    def normalize_symbol(self, symbol: str) -> str:
        """规范化品种名称"""
        # cTrader: EURUSD, GBPUSD, XAUUSD
        # 移除所有分隔符
        symbol = symbol.upper().replace("-", "").replace("/", "")

        # 特殊处理：USDT -> USD
        if "USDT" in symbol:
            symbol = symbol.replace("USDT", "USD")

        # 特殊处理：黄金
        if symbol == "GOLD" or symbol == "XAUUSD":
            symbol = "XAUUSD"

        return symbol

    def quantity_to_lots(self, symbol: str, quantity: float) -> float:
        """
        将数量转换为 lots

        cTrader 使用 lots 作为单位：
        - 外汇：1 lot = 100,000 units
        - 黄金：1 lot = 100 oz
        - 加密货币：1 lot = 1 unit
        """
        if "XAU" in symbol:
            # 黄金：1 lot = 100 oz
            return quantity / 100
        elif any(curr in symbol for curr in ["EUR", "GBP", "USD", "JPY", "CHF", "CAD", "AUD", "NZD"]):
            # 外汇：1 lot = 100,000 units
            return quantity / 100000
        else:
            # 加密货币：1 lot = 1 unit
            return quantity

    def lots_to_quantity(self, symbol: str, lots: float) -> float:
        """
        将 lots 转换为数量
        """
        if "XAU" in symbol:
            return lots * 100
        elif any(curr in symbol for curr in ["EUR", "GBP", "USD", "JPY", "CHF", "CAD", "AUD", "NZD"]):
            return lots * 100000
        else:
            return lots
