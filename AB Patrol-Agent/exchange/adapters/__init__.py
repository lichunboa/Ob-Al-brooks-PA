"""
交易所适配器模块

提供统一的交易所接口：
- Binance
- OKX
- cTrader
"""

from importlib import import_module

_EXPORTS = {
    "ExchangeAdapter": "exchange.adapters.base",
    "BinanceAdapter": "exchange.adapters.binance_adapter",
    "OKXAdapter": "exchange.adapters.okx_adapter",
    "CTraderAdapter": "exchange.adapters.ctrader_adapter",
}


def __getattr__(name: str):
    """按需加载适配器，避免无关依赖在包初始化时失败。"""
    target = _EXPORTS.get(name)
    if not target:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module = import_module(target)
    return getattr(module, name)

__all__ = [
    "ExchangeAdapter",
    "BinanceAdapter",
    "OKXAdapter",
    "CTraderAdapter",
]
