"""
OKX 适配器

实现 OKX 交易所的接口

API 文档：https://www.okx.com/docs-v5/en/
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from datetime import datetime
from typing import Any

import requests

from .base import ExchangeAdapter


class OKXAdapter(ExchangeAdapter):
    """OKX 适配器"""

    def __init__(self, config: dict[str, Any]):
        super().__init__(config)
        self.api_key = config.get("api_key", "")
        self.api_secret = config.get("api_secret", "")
        self.passphrase = config.get("passphrase", "")
        self.base_url = config.get("base_url", "https://www.okx.com")
        self.testnet = config.get("testnet", False)

        if self.testnet:
            self.base_url = "https://www.okx.com"  # OKX 没有公开测试网

        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "OK-ACCESS-KEY": self.api_key,
        })

    def _sign(self, timestamp: str, method: str, request_path: str, body: str = "") -> str:
        """生成签名"""
        message = timestamp + method + request_path + body
        mac = hmac.new(
            self.api_secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256
        )
        return base64.b64encode(mac.digest()).decode("utf-8")

    def _request(
        self,
        method: str,
        endpoint: str,
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """发送 API 请求"""
        url = self.base_url + endpoint
        timestamp = datetime.utcnow().isoformat(timespec="milliseconds") + "Z"

        # 构建请求路径
        request_path = endpoint
        if params:
            query_string = "&".join(f"{k}={v}" for k, v in params.items())
            request_path += "?" + query_string

        # 构建请求体
        body = ""
        if data:
            body = json.dumps(data)

        # 生成签名
        sign = self._sign(timestamp, method, request_path, body)

        # 设置请求头
        headers = {
            "OK-ACCESS-KEY": self.api_key,
            "OK-ACCESS-SIGN": sign,
            "OK-ACCESS-TIMESTAMP": timestamp,
            "OK-ACCESS-PASSPHRASE": self.passphrase,
            "Content-Type": "application/json",
        }

        try:
            if method == "GET":
                response = self.session.get(url, params=params, headers=headers, timeout=10)
            elif method == "POST":
                response = self.session.post(url, json=data, headers=headers, timeout=10)
            else:
                raise ValueError(f"Unsupported method: {method}")

            response.raise_for_status()
            result = response.json()

            # OKX API 返回格式：{"code": "0", "msg": "", "data": [...]}
            if result.get("code") != "0":
                raise RuntimeError(f"OKX API error: {result.get('msg')}")

            return result.get("data", {})

        except Exception as e:
            return {"error": str(e)}

    def get_account_info(self) -> dict[str, Any]:
        """获取账户信息"""
        try:
            # 获取账户余额
            result = self._request("GET", "/api/v5/account/balance")

            if not result or "error" in result:
                return {
                    "balance": 0.0,
                    "equity": 0.0,
                    "margin": 0.0,
                    "free_margin": 0.0,
                    "margin_level": 0.0,
                    "positions": [],
                }

            # OKX 返回多个账户，取第一个
            if isinstance(result, list) and len(result) > 0:
                account = result[0]
                total_eq = float(account.get("totalEq", 0))
                avail_eq = float(account.get("availEq", 0))

                return {
                    "balance": total_eq,
                    "equity": total_eq,
                    "margin": total_eq - avail_eq,
                    "free_margin": avail_eq,
                    "margin_level": 100.0 if total_eq > 0 else 0.0,
                    "positions": [],
                }

            return {
                "balance": 0.0,
                "equity": 0.0,
                "margin": 0.0,
                "free_margin": 0.0,
                "margin_level": 0.0,
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
            result = self._request("GET", "/api/v5/account/positions")

            if not result or "error" in result:
                return []

            positions = []
            for pos in result:
                if not isinstance(pos, dict):
                    continue

                # 跳过空仓
                if float(pos.get("pos", 0)) == 0:
                    continue

                symbol = pos.get("instId", "")
                side = "BUY" if pos.get("posSide") == "long" else "SELL"
                quantity = abs(float(pos.get("pos", 0)))
                entry_price = float(pos.get("avgPx", 0))
                current_price = float(pos.get("last", entry_price))

                positions.append({
                    "symbol": self.denormalize_symbol(symbol),
                    "side": side,
                    "quantity": quantity,
                    "entry_price": entry_price,
                    "current_price": current_price,
                    "unrealized_pnl": float(pos.get("upl", 0)),
                    "margin": float(pos.get("margin", 0)),
                })

            return positions
        except Exception as e:
            return []

    def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """获取未成交订单"""
        try:
            params = {}
            if symbol:
                params["instId"] = self.normalize_symbol(symbol)

            result = self._request("GET", "/api/v5/trade/orders-pending", params=params)

            if not result or "error" in result:
                return []

            orders = []
            for order in result:
                if not isinstance(order, dict):
                    continue

                orders.append({
                    "order_id": order.get("ordId", ""),
                    "symbol": self.denormalize_symbol(order.get("instId", "")),
                    "side": "BUY" if order.get("side") == "buy" else "SELL",
                    "type": order.get("ordType", "").upper(),
                    "quantity": float(order.get("sz", 0)),
                    "price": float(order.get("px", 0)) if order.get("px") else None,
                    "filled_quantity": float(order.get("accFillSz", 0)),
                    "status": order.get("state", ""),
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
            inst_id = self.normalize_symbol(symbol)

            # 构建订单参数
            order_data = {
                "instId": inst_id,
                "tdMode": "cross",  # 全仓模式
                "side": "buy" if side == "BUY" else "sell",
                "ordType": "market" if order_type == "MARKET" else "limit",
                "sz": str(quantity),
            }

            if order_type == "LIMIT" and price:
                order_data["px"] = str(price)

            # 下单
            result = self._request("POST", "/api/v5/trade/order", data=order_data)

            if not result or "error" in result:
                return {
                    "success": False,
                    "order_id": None,
                    "filled_quantity": None,
                    "filled_price": None,
                    "error": result.get("error", "Unknown error"),
                }

            # OKX 返回订单 ID
            if isinstance(result, list) and len(result) > 0:
                order = result[0]
                order_id = order.get("ordId", "")

                # 如果有止损/止盈，设置 TP/SL
                if stop_loss or take_profit:
                    self.modify_position(symbol, stop_loss, take_profit)

                return {
                    "success": True,
                    "order_id": order_id,
                    "filled_quantity": quantity,
                    "filled_price": None,  # 市价单需要查询成交价
                    "error": None,
                }

            return {
                "success": False,
                "order_id": None,
                "filled_quantity": None,
                "filled_price": None,
                "error": "Invalid response",
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
            inst_id = self.normalize_symbol(symbol)

            # 获取当前持仓
            positions = self.get_positions()
            position = next((p for p in positions if p["symbol"] == symbol), None)

            if not position:
                return {"success": False, "error": "Position not found"}

            # 平仓方向与持仓相反
            close_side = "sell" if position["side"] == "BUY" else "buy"

            # 1. 取消旧的止损止盈算法订单
            # OKX 需要先查询算法订单，然后取消
            algo_orders = self._request("GET", "/api/v5/trade/orders-algo-pending", params={
                "instId": inst_id,
                "ordType": "conditional"
            })

            if isinstance(algo_orders, list):
                for order in algo_orders:
                    if isinstance(order, dict):
                        algo_id = order.get("algoId")
                        if algo_id:
                            self._request("POST", "/api/v5/trade/cancel-algos", data=[{
                                "instId": inst_id,
                                "algoId": algo_id
                            }])

            # 2. 挂新的止损止盈算法订单
            sl_order_id = None
            tp_order_id = None

            if stop_loss:
                sl_data = {
                    "instId": inst_id,
                    "tdMode": "cross",
                    "side": close_side,
                    "ordType": "conditional",
                    "sz": str(position["quantity"]),
                    "slTriggerPx": str(stop_loss),
                    "slOrdPx": "-1",  # 市价
                }
                sl_result = self._request("POST", "/api/v5/trade/order-algo", data=sl_data)
                if isinstance(sl_result, list) and len(sl_result) > 0:
                    sl_order_id = sl_result[0].get("algoId")

            if take_profit:
                tp_data = {
                    "instId": inst_id,
                    "tdMode": "cross",
                    "side": close_side,
                    "ordType": "conditional",
                    "sz": str(position["quantity"]),
                    "tpTriggerPx": str(take_profit),
                    "tpOrdPx": "-1",  # 市价
                }
                tp_result = self._request("POST", "/api/v5/trade/order-algo", data=tp_data)
                if isinstance(tp_result, list) and len(tp_result) > 0:
                    tp_order_id = tp_result[0].get("algoId")

            return {
                "success": True,
                "stop_loss_order_id": sl_order_id,
                "take_profit_order_id": tp_order_id,
                "error": None,
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """取消订单"""
        try:
            inst_id = self.normalize_symbol(symbol)
            data = {
                "instId": inst_id,
                "ordId": order_id,
            }
            result = self._request("POST", "/api/v5/trade/cancel-order", data=data)

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
            inst_id = self.normalize_symbol(symbol)
            result = self._request("GET", "/api/v5/market/ticker", params={"instId": inst_id})

            if not result or "error" in result:
                return None

            if isinstance(result, list) and len(result) > 0:
                ticker = result[0]
                return float(ticker.get("last", 0))

            return None
        except Exception as e:
            return None

    def get_symbol_info(self, symbol: str) -> dict[str, Any]:
        """获取品种信息"""
        try:
            inst_id = self.normalize_symbol(symbol)
            result = self._request("GET", "/api/v5/public/instruments", params={
                "instType": "SWAP",
                "instId": inst_id,
            })

            if not result or "error" in result:
                return {}

            if isinstance(result, list) and len(result) > 0:
                info = result[0]
                return {
                    "symbol": self.denormalize_symbol(info.get("instId", "")),
                    "base_asset": info.get("baseCcy", ""),
                    "quote_asset": info.get("quoteCcy", ""),
                    "min_quantity": float(info.get("minSz", 0)),
                    "max_quantity": float(info.get("maxSz", 0)),
                    "tick_size": float(info.get("tickSz", 0)),
                    "lot_size": float(info.get("lotSz", 0)),
                }

            return {}
        except Exception as e:
            return {}

    def normalize_symbol(self, symbol: str) -> str:
        """规范化品种名称"""
        # OKX: BTC-USDT-SWAP
        symbol = symbol.upper().replace("/", "-")
        if "-" not in symbol and "USDT" in symbol:
            # BTCUSDT -> BTC-USDT-SWAP
            symbol = symbol.replace("USDT", "-USDT-SWAP")
        elif not symbol.endswith("-SWAP"):
            symbol += "-SWAP"
        return symbol

    def denormalize_symbol(self, symbol: str) -> str:
        """反规范化品种名称（转回通用格式）"""
        # BTC-USDT-SWAP -> BTCUSDT
        return symbol.replace("-SWAP", "").replace("-", "")
