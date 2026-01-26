"""期货情绪缺口监控 - 检测5m情绪数据缺口"""
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Optional, TypedDict

import pandas as pd

from ...db.reader import inc_pg_query, shared_pg_conn
from ..base import Indicator, IndicatorMeta, register

# ==================== 数据契约 ====================

class GapInfo(TypedDict):
    """期货情绪缺口监控输出契约"""
    已加载根数: int
    最新时间: Optional[str]
    缺失根数: Optional[int]
    首缺口起: Optional[str]
    首缺口止: Optional[str]

# 期货时间序列缓存（按周期、按币种）
_TIMES_CACHE: Dict[str, Dict[str, List[datetime]]] = {}
_CACHE_TS: Dict[str, float] = {}
_CACHE_SYMBOLS: Dict[str, set] = {}
_CACHE_TTL_SECONDS = 60

def _fetch_metrics_times_batch(symbols: List[str], limit: int, interval: str = "5m") -> Dict[str, List[datetime]]:
    """批量读取期货时间序列"""
    if not symbols:
        return {}

    # 根据周期选择表和列名
    if interval == "5m":
        table = "binance_futures_metrics_5m"
        time_col = "create_time"
    else:
        table = f"binance_futures_metrics_{interval}_last"
        time_col = "bucket"

    sql = f"""
        WITH ranked AS (
            SELECT symbol, {time_col},
                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY {time_col} DESC) as rn
            FROM market_data.{table}
            WHERE symbol = ANY(%s) AND {time_col} > NOW() - INTERVAL '30 days'
        )
        SELECT symbol, {time_col}
        FROM ranked WHERE rn <= %s
        ORDER BY symbol, {time_col} ASC
    """

    result: Dict[str, List[datetime]] = {s: [] for s in symbols}
    try:
        with shared_pg_conn() as conn:
            with conn.cursor() as cur:
                inc_pg_query()
                cur.execute(sql, (symbols, limit))
                for row in cur.fetchall():
                    ts = row[1].replace(tzinfo=timezone.utc) if row[1] else None
                    if ts:
                        result[row[0]].append(ts)
    except Exception:
        return {}
    return result


def _ensure_times_cache(symbols: List[str], interval: str, limit: int):
    """确保时间序列缓存可用"""
    import time

    symbols = [s for s in symbols if s]
    if not symbols:
        return

    now = time.time()
    stale = (now - _CACHE_TS.get(interval, 0)) >= _CACHE_TTL_SECONDS
    if stale:
        _TIMES_CACHE[interval] = {}
        _CACHE_SYMBOLS[interval] = set()

    cached_symbols = _CACHE_SYMBOLS.get(interval, set())
    missing_symbols = [s for s in symbols if s not in cached_symbols]

    if stale or missing_symbols:
        batch = _fetch_metrics_times_batch(missing_symbols or symbols, limit, interval)
        if batch:
            _TIMES_CACHE.setdefault(interval, {}).update(batch)
            _CACHE_SYMBOLS[interval] = cached_symbols.union(batch.keys())
            _CACHE_TS[interval] = now


def get_times_cache(symbols: List[str], interval: str = "5m", limit: int = 240) -> Dict[str, Dict[str, List[datetime]]]:
    """预取时间序列缓存（供引擎使用）"""
    _ensure_times_cache(symbols, interval, limit)
    interval_cache = _TIMES_CACHE.get(interval, {})
    return {interval: {s: interval_cache.get(s, []) for s in symbols}}


def set_times_cache(cache: Dict[str, Dict[str, List[datetime]]]):
    """设置时间序列缓存（用于跨进程传递）"""
    import time
    global _TIMES_CACHE, _CACHE_TS, _CACHE_SYMBOLS
    _TIMES_CACHE = cache or {}
    _CACHE_TS = {iv: time.time() for iv in _TIMES_CACHE}
    _CACHE_SYMBOLS = {iv: set(_TIMES_CACHE[iv].keys()) for iv in _TIMES_CACHE}


def get_metrics_times(symbol: str, limit: int = 240, interval: str = "5m") -> List[datetime]:
    """从 PostgreSQL 获取时间戳列表"""
    _ensure_times_cache([symbol], interval, limit)
    times = _TIMES_CACHE.get(interval, {}).get(symbol, [])
    if limit and len(times) > limit:
        return times[-limit:]
    return times


def detect_gaps(times: List[datetime], interval_sec: int = 300) -> GapInfo:
    """检测时间序列中的缺口"""
    if not times:
        return {"已加载根数": 0, "最新时间": None, "缺失根数": None, "首缺口起": None, "首缺口止": None}

    times = sorted(set(times))
    missing_segments = []
    for i in range(1, len(times)):
        delta = (times[i] - times[i-1]).total_seconds()
        if delta > interval_sec:
            miss = int(delta // interval_sec) - 1
            gap_start = times[i-1] + timedelta(seconds=interval_sec)
            gap_end = times[i] - timedelta(seconds=interval_sec)
            missing_segments.append((gap_start, gap_end, miss))

    total_missing = sum(seg[2] for seg in missing_segments)
    first_gap = missing_segments[0] if missing_segments else (None, None, 0)

    return {
        "已加载根数": len(times),
        "最新时间": times[-1].isoformat(),
        "缺失根数": total_missing,
        "首缺口起": first_gap[0].isoformat() if first_gap[0] else None,
        "首缺口止": first_gap[1].isoformat() if first_gap[1] else None,
    }


@register
class FuturesGapMonitor(Indicator):
    meta = IndicatorMeta(name="期货情绪缺口监控.py", lookback=1, is_incremental=False, min_data=1)

    def compute(self, df: pd.DataFrame, symbol: str, interval: str) -> pd.DataFrame:
        # 只监控 5m 周期
        if interval != "5m":
            return self._make_insufficient_result(df, symbol, interval, {"信号": "仅支持5m周期"})

        times = get_metrics_times(symbol, 240, interval)
        gap_info = detect_gaps(times, 300)

        # 不使用 _make_result，直接构建（因为没有数据时间字段）
        row = {"交易对": symbol, **gap_info}
        return pd.DataFrame([row])
