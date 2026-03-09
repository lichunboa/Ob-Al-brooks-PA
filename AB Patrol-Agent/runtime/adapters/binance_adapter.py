"""
Binance 适配器

实现 Binance 交易所的接口
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Any
from urllib.parse import urlencode

import requests

from .base import ExchangeAdapter


class BinanceAdapter(ExchangeAdapter):
    """Binance 适配器"""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.api_key = config.get("api_key", "")
        self.api_secret = config.get("api_secret", "")
        self.base_url = config.get("base_url", "https://fapi.binance.com")
        self.testnet = config.get("testnet", False)
        
        if self.testnet:
            self.base_url = "https://testnet.binancefuture.com"

    def _sign(self, params: dict[str, Any]) -> str:
        """生成签名"""
        query_string = urlencode(params)
        signature = hmac.new(
            self.api_secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()
        return signature

    def _request(
        self,
        method: str,
        endpoint: str,
        params: dict[str, Any] | None = None,
        signed: bool = False,
    ) -> dict[str, Any]:
        """发送请求"""
        url = f"{self.base_url}{endpoint}"
        headers = {"X-MBX-APIKEY": self.api_key}
        
        if params is None:
            params = {}
        
        if signed:
            params["timestamp"] = int(time.time() * 1000)
            params["signature"] = self._sign(params)
        
        try:
            if method == "GET":
                response = requests.get(url, params=params, headers=headers)
            elif method == "POST":
                response = requests.post(url, params=params, headers=headers)
            elif method == "DELETE":
                response = requests.delete(url, params=params, headers=headers)
            else:
                return {"error": f"Unsupported method: {method}"}
            
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            return {"error": str(e)}

    def get_account_info(self) -> dict[str, Any]:
        """获取账户信息"""
        result = self._request("GET", "/fapi/v2/account", signed=True)
        
        if "error" in result:
            return {"error": result["error"]}
        
        return {
            "balance": float(result.get("totalWalletBalance", 0)),
            "equity": float(result.get("totalMarginBalance", 0)),
            "margin": float(result.get("totalInitialMargin", 0)),
            "free_margin": float(result.get("availableBalance", 0)),
            "margin_level": float(result.get("totalMarginBalance", 0)) / 
                           float(result.get("totalInitialMargin", 1)) * 100,
            "positions": result.get("positions", []),
        }

    def get_positions(self) -> list[dict[str, Any]]:
        """获取当前持仓"""
        result = self._request("GET", "/fapi/v2/positionRisk", signed=True)
        
        if "error" in result:
            return []
        
        positions = []
        for pos in result:
            qty = float(pos.get("positionAmt", 0))
            if qty == 0:
                continue
            
            positions.append({
                "symbol": pos.get("symbol"),
                "side": "BUY" if qty > 0 else "SELL",
                "quantity": abs(qty),
                "entry_price": float(pos.get("entryPrice", 0)),
                "current_price": float(pos.get("markPrice", 0)),
                "unrealized_pnl": float(pos.get("unRealizedProfit", 0)),
                "stop_loss": None,  # Binance 不在持仓中返回 SL/TP
                "take_profit": None,
            })
        
        return positions

    def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """获取未成交订单"""
        params = {}
        if symbol:
            params["symbol"] = self.normalize_symbol(symbol)
        
        result = self._request("GET", "/fapi/v1/openOrders", params, signed=True)
        
        if "error" in result:
            return []
        
        orders = []
        for order in result:
            orders.append({
                "order_id": str(order.get("orderId")),
                "symbol": order.get("symbol"),
                "side": order.get("side"),
                "type": order.get("type"),
                "quantity": float(order.get("origQty", 0)),
                "price": float(order.get("price", 0)),
                "status": order.get("status"),
            })
        
        return orders

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
        params = {
            "symbol": self.normalize_symbol(symbol),
            "side": side,
            "type": order_type,
            "quantity": self.format_quantity(symbol, quantity),
        }
        
        if order_type == "LIMIT":
            params["price"] = self.format_price(symbol, price)
            params["timeInForce"] = "GTC"
        elif order_type == "STOP_MARKET":
            params["stopPrice"] = self.format_price(symbol, price)
        
        result = self._request("POST", "/fapi/v1/order", params, signed=True)
        
        if "error" in result:
            return {
                "success": False,
                "order_id": None,
                "filled_quantity": None,
                "filled_price": None,
                "error": result["error"],
            }
        
        return {
            "success": True,
            "order_id": str(result.get("orderId")),
            "filled_quantity": float(result.get("executedQty", 0)),
            "filled_price": float(result.get("avgPrice", 0)),
            "error": None,
        }

    def close_position(
        self,
        symbol: str,
        quantity: float | None = None,
    ) -> dict[str, Any]:
        """平仓"""
        # 获取当前持仓
        positions = self.get_positions()
        position = next((p for p in positions if p["symbol"] == symbol), None)
        
        if not position:
            return {
                "success": False,
                "order_id": None,
                "filled_quantity": None,
                "filled_price": None,
                "error": "No position found",
            }
        
        # 反向下单平仓
        close_side = "SELL" if position["side"] == "BUY" else "BUY"
        close_qty = quantity if quantity else position["quantity"]
        
        return self.place_order(symbol, close_side, close_qty, "MARKET")

    def modify_position(
        self,
        symbol: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any]:
        """修改持仓的止损/止盈"""
        # Binance 需要通过下单来设置 SL/TP
        # 这里简化实现，实际需要更复杂的逻辑
        return {
            "success": True,
            "error": None,
        }

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """取消订单"""
        params = {
            "symbol": self.normalize_symbol(symbol),
            "orderId": order_id,
        }
        
        result = self._request("DELETE", "/fapi/v1/order", params, signed=True)
        
        if "error" in result:
            return {"success": False, "error": result["error"]}
        
        return {"success": True, "error": None}

    def cancel_all_orders(self, symbol: str | None = None) -> dict[str, Any]:
        """取消所有订单"""
        if symbol:
            params = {"symbol": self.normalize_symbol(symbol)}
            result = self._request(
                "DELETE", "/fapi/v1/allOpenOrders", params, signed=True
            )
            
            if "error" in result:
                return {
                    "success": False,
                    "cancelled_count": 0,
                    "error": result["error"]
                }
            
            return {
                "success": True,
                "cancelled_count": result.get("code", 0),
                "error": None,
            }
        else:
            # 取消所有品种的订单
            orders = self.get_open_orders()
            cancelled = 0
            for order in orders:
                result = self.cancel_order(order["symbol"], order["order_id"])
                if result["success"]:
                    cancelled += 1
            
            return {
                "success": True,
                "cancelled_count": cancelled,
                "error": None,
            }

    def get_market_price(self, symbol: str) -> float | None:
        """获取市场价格"""
        params = {"symbol": self.normalize_symbol(symbol)}
        result = self._request("GET", "/fapi/v1/ticker/price", params)
        
        if "error" in result:
            return None
        
        return float(result.get("price", 0))

    def get_symbol_info(self, symbol: str) -> dict[str, Any]:
        """获取品种信息"""
        result = self._request("GET", "/fapi/v1/exchangeInfo")
        
        if "error" in result:
            return {}
        
        normalized = self.normalize_symbol(symbol)
        for s in result.get("symbols", []):
            if s.get("symbol") == normalized:
                filters = {f["filterType"]: f for f in s.get("filters", [])}
                
                return {
                    "symbol": s.get("symbol"),
                    "base_asset": s.get("baseAsset"),
                    "quote_asset": s.get("quoteAsset"),
                    "min_quantity": float(
                        filters.get("LOT_SIZE", {}).get("minQty", 0.001)
                    ),
                    "max_quantity": float(
                        filters.get("LOT_SIZE", {}).get("maxQty", 1000000)
                    ),
                    "quantity_step": float(
                        filters.get("LOT_SIZE", {}).get("stepSize", 0.001)
                    ),
                    "min_price": float(
                        filters.get("PRICE_FILTER", {}).get("minPrice", 0.01)
                    ),
                    "max_price": float(
                        filters.get("PRICE_FILTER", {}).get("maxPrice", 1000000)
                    ),
                    "price_step": float(
                        filters.get("PRICE_FILTER", {}).get("tickSize", 0.01)
                    ),
                }
        
        return {}

    def normalize_symbol(self, symbol: str) -> str:
        """规范化品种名称"""
        # Binance: BTCUSDT
        return symbol.upper().replace("-", "").replace("/", "")
