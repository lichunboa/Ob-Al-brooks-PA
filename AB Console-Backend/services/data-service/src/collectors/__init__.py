"""
数据采集器模块

包含：
- FuturesCollector: 期货指标采集（持仓量、多空比、资金费率等）
- VolumeCollector: 成交量指标采集（成交量、买卖比、异常检测等）
"""

from .futures import (
    FuturesMetrics,
    FuturesCollector,
    get_futures_collector,
    get_futures_metrics,
    get_all_futures_metrics,
)

from .volume import (
    VolumeMetrics,
    VolumeCollector,
    get_volume_collector,
    get_volume_metrics,
    get_all_volume_metrics,
    detect_volume_spikes,
)

__all__ = [
    # 期货指标
    "FuturesMetrics",
    "FuturesCollector",
    "get_futures_collector",
    "get_futures_metrics",
    "get_all_futures_metrics",
    # 成交量指标
    "VolumeMetrics",
    "VolumeCollector",
    "get_volume_collector",
    "get_volume_metrics",
    "get_all_volume_metrics",
    "detect_volume_spikes",
]
