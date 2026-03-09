"""
交易所适配器基类

定义统一的交易所接口
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ExchangeAdapter(ABC):
    """交易所适配器基类"""

    def __init__(self, config: dict[str, Any]):
        """
        初始化适配器
        
        Args:
            config: 配置字典，包含 API key、secret 等
        """
        self.config = config
        self.exchange_name = config.get("exchange", "unknown")

    @abstractmethod
    def get_account_info(self) -> dict[str, Any]:
        """
        获取账户信息
        
        Returns:
            {
                "balance": float,
                "equity": float,
                "margin": float,
                "free_margin": float,
                "margin_level": float,
                "positions": list[dict],
            }
        """
        pass

    @abstractmethod
    def get_positions(self) -> list[dict[str, Any]]:
        """
        获取当前持仓
        
        Returns:
            [
                {
                    "symbol": str,
                    "side": "BUY" | "SELL",
                    "quantity": float,
                    "entry_price": float,
                    "current_price": float,
                    "unrealized_pnl": float,
                    "stop_loss": float | None,
                    "take_profit": float | None,
                },
                ...
            ]
        """
        pass

    @abstractmethod
    def get_open_orders(self, symbol: str | None = None) -> list[dict[str, Any]]:
        """
        获取未成交订单
        
        Args:
            symbol: 品种（可选，None 表示所有品种）
        
        Returns:
            [
                {
                    "order_id": str,
                    "symbol": str,
                    "side": "BUY" | "SELL",
                    "type": "LIMIT" | "STOP_MARKET" | "MARKET",
                    "quantity": float,
                    "price": float | None,
                    "status": str,
                },
                ...
            ]
        """
        pass

    @abstractmethod
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
        """
        下单
        
        Args:
            symbol: 品种
            side: "BUY" | "SELL"
            quantity: 数量
            order_type: "MARKET" | "LIMIT" | "STOP_MARKET"
            price: 价格（限价单/止损单需要）
            stop_loss: 止损价
            take_profit: 止盈价
        
        Returns:
            {
                "success": bool,
                "order_id": str | None,
                "filled_quantity": float | None,
                "filled_price": float | None,
                "error": str | None,
            }
        """
        pass

    @abstractmethod
    def close_position(
        self,
        symbol: str,
        quantity: float | None = None,
    ) -> dict[str, Any]:
        """
        平仓
        
        Args:
            symbol: 品种
            quantity: 数量（None 表示全平）
        
        Returns:
            {
                "success": bool,
                "order_id": str | None,
                "filled_quantity": float | None,
                "filled_price": float | None,
                "error": str | None,
            }
        """
        pass

    @abstractmethod
    def modify_position(
        self,
        symbol: str,
        stop_loss: float | None = None,
        take_profit: float | None = None,
    ) -> dict[str, Any]:
        """
        修改持仓的止损/止盈
        
        Args:
            symbol: 品种
            stop_loss: 新止损价
            take_profit: 新止盈价
        
        Returns:
            {
                "success": bool,
                "error": str | None,
            }
        """
        pass

    @abstractmethod
    def cancel_order(self, symbol: str, order_id: str) -> dict[str, Any]:
        """
        取消订单
        
        Args:
            symbol: 品种
            order_id: 订单 ID
        
        Returns:
            {
                "success": bool,
                "error": str | None,
            }
        """
        pass

    @abstractmethod
    def cancel_all_orders(self, symbol: str | None = None) -> dict[str, Any]:
        """
        取消所有订单
        
        Args:
            symbol: 品种（None 表示所有品种）
        
        Returns:
            {
                "success": bool,
                "cancelled_count": int,
                "error": str | None,
            }
        """
        pass

    @abstractmethod
    def get_market_price(self, symbol: str) -> float | None:
        """
        获取市场价格
        
        Args:
            symbol: 品种
        
        Returns:
            当前价格，失败返回 None
        """
        pass

    @abstractmethod
    def get_symbol_info(self, symbol: str) -> dict[str, Any]:
        """
        获取品种信息
        
        Args:
            symbol: 品种
        
        Returns:
            {
                "symbol": str,
                "base_asset": str,
                "quote_asset": str,
                "min_quantity": float,
                "max_quantity": float,
                "quantity_step": float,
                "min_price": float,
                "max_price": float,
                "price_step": float,
            }
        """
        pass

    # 辅助方法

    def normalize_symbol(self, symbol: str) -> str:
        """
        规范化品种名称
        
        不同交易所的品种名称格式不同：
        - Binance: BTCUSDT
        - OKX: BTC-USDT
        - cTrader: BTCUSD
        
        子类应该重写此方法
        """
        return symbol.upper()

    def format_quantity(self, symbol: str, quantity: float) -> float:
        """
        格式化数量（根据交易所规则）
        """
        symbol_info = self.get_symbol_info(symbol)
        step = symbol_info.get("quantity_step", 0.001)
        return round(quantity / step) * step

    def format_price(self, symbol: str, price: float) -> float:
        """
        格式化价格（根据交易所规则）
        """
        symbol_info = self.get_symbol_info(symbol)
        step = symbol_info.get("price_step", 0.01)
        return round(price / step) * step
