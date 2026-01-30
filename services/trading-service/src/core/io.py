"""
IO 模块：数据读取与缓存装配
"""
from typing import Dict, List, Tuple, Optional

import pandas as pd


# ==================== K 线读取 ====================

def load_klines(
    symbols: List[str],
    intervals: List[str],
    max_lookback: int,
) -> Dict[Tuple[str, str], pd.DataFrame]:
    """读取并返回 (symbol, interval) -> DataFrame 的映射"""
    from ..db.cache import get_cache, init_cache

    cache = get_cache()
    symbols_set = set(symbols)

    # 检查缓存初始化状态
    need_init = not cache._initialized or not all(iv in cache._initialized for iv in intervals)
    if need_init:
        cache = init_cache(symbols, intervals, max_lookback)
    else:
        for iv in intervals:
            cache.update_interval(symbols, iv)

    all_klines: Dict[Tuple[str, str], pd.DataFrame] = {}
    for interval in intervals:
        klines = cache.get_klines(interval)
        for sym, df in klines.items():
            if sym in symbols_set:
                all_klines[(sym, interval)] = df

    return all_klines


# ==================== 期货缓存预取 ====================

def preload_futures_cache(
    symbols: List[str],
    intervals: List[str],
    indicators: Dict[str, type],
) -> Optional[Dict[str, dict]]:
    """预取期货相关缓存（仅在指标启用时）"""
    futures_cache: Dict[str, dict] = {}

    if "期货情绪元数据.py" in indicators:
        from src.indicators.incremental.futures_sentiment import get_metrics_cache
        futures_cache["latest_metrics"] = get_metrics_cache()

    if "期货情绪聚合表.py" in indicators:
        from src.indicators.batch.futures_aggregate import get_history_cache
        futures_cache["history"] = get_history_cache(symbols, intervals, limit=240)

    if "期货情绪缺口监控.py" in indicators:
        from src.indicators.batch.futures_gap_monitor import get_times_cache
        futures_cache["times"] = get_times_cache(symbols, interval="5m", limit=240)

    return futures_cache or None
