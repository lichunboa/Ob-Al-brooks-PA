"""cryptofeed Provider - 加密货币 WebSocket 实时数据"""
# 注意: cryptofeed 主要用于实时流，不适合 TET Pipeline 模式
# 这里提供一个工具类供 collectors 使用

from .stream import CryptoFeedStream

__all__ = ["CryptoFeedStream"]
