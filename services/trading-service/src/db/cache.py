"""
全局数据缓存（高性能版）

优化点：
1. 多周期并行初始化
2. 单SQL批量查询所有币种
3. 增量更新优化
"""
import logging
import time
import psycopg
from psycopg.rows import dict_row
from threading import Thread, Event, RLock
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
import pandas as pd

from ..config import config

LOG = logging.getLogger("indicator_service.cache")

# 周期秒数
INTERVAL_SECONDS = {
    "1m": 60, "5m": 300, "15m": 900, "1h": 3600,
    "4h": 14400, "1d": 86400, "1w": 604800,
}


class DataCache:
    """全局数据缓存（高性能版）"""

    MAX_ROWS = 500  # 每个交易对周期最多缓存 500 根 K 线

    def __init__(self, db_url: str = None, exchange: str = None, lookback: int = 300):
        self.db_url = db_url or config.db_url
        self.exchange = exchange or config.exchange
        self.lookback = min(lookback, self.MAX_ROWS)  # 不超过 MAX_ROWS

        # K线缓存: {interval: {symbol: DataFrame}}
        self._klines: Dict[str, Dict[str, pd.DataFrame]] = {}
        # 最后更新时间: {interval: {symbol: bucket_ts}}
        self._last_ts: Dict[str, Dict[str, Any]] = {}
        # 锁
        self._lock = RLock()
        # 初始化标记
        self._initialized: Dict[str, bool] = {}

    def init_interval(self, symbols: List[str], interval: str):
        """初始化单个周期 - 单SQL批量查询"""
        LOG.info(f"[{interval}] 初始化缓存 ({len(symbols)} 币种)...")
        t0 = time.time()

        with self._lock:
            self._klines[interval] = {}
            self._last_ts[interval] = {}

        table = f"candles_{interval}"
        symbols_set = set(symbols)
        count = 0

        # 计算时间范围，避免扫描全部分区
        interval_minutes = {"1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440, "1w": 10080}
        minutes = interval_minutes.get(interval, 5) * self.lookback * 2

        try:
            with psycopg.connect(self.db_url, row_factory=dict_row) as conn:
                # 使用窗口函数限制每个币种的行数，加时间范围过滤
                sql = f"""
                    WITH ranked AS (
                        SELECT symbol, bucket_ts, open, high, low, close, volume,
                               quote_volume, trade_count, taker_buy_volume, taker_buy_quote_volume,
                               ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC) as rn
                        FROM market_data.{table}
                        WHERE exchange = %s AND symbol = ANY(%s) AND bucket_ts > NOW() - INTERVAL '{minutes} minutes'
                    )
                    SELECT symbol, bucket_ts, open, high, low, close, volume,
                           quote_volume, trade_count, taker_buy_volume, taker_buy_quote_volume
                    FROM ranked WHERE rn <= %s
                    ORDER BY symbol, bucket_ts ASC
                """
                rows = conn.execute(sql, (self.exchange, list(symbols), self.lookback)).fetchall()

                # 按币种分组
                from itertools import groupby
                for symbol, group in groupby(rows, key=lambda x: x['symbol']):
                    row_list = list(group)
                    if row_list and symbol in symbols_set:
                        df = self._rows_to_df(row_list)
                        with self._lock:
                            self._klines[interval][symbol] = df
                            self._last_ts[interval][symbol] = df.index[-1]
                        count += 1

        except Exception as e:
            LOG.error(f"[{interval}] 初始化失败: {e}")

        with self._lock:
            self._initialized[interval] = True

        LOG.info(f"[{interval}] 缓存完成: {count} 币种, {time.time()-t0:.1f}s")

    def update_interval(self, symbols: List[str], interval: str) -> int:
        """增量更新单个周期"""
        if not self._initialized.get(interval):
            self.init_interval(symbols, interval)
            return len(symbols)

        table = f"candles_{interval}"
        updated = 0
        symbols = [s for s in symbols if s]
        if not symbols:
            return updated

        try:
            with psycopg.connect(self.db_url, row_factory=dict_row) as conn:
                last_ts_map = self._last_ts.get(interval, {})
                new_symbols = [s for s in symbols if not last_ts_map.get(s)]
                known_symbols = [s for s in symbols if s not in new_symbols]

                # 1) 已有币种：单次增量拉取（按最小时间过滤）
                if known_symbols:
                    min_ts = min(last_ts_map[s] for s in known_symbols if last_ts_map.get(s))
                    sql = f"""
                        SELECT symbol, bucket_ts, open, high, low, close, volume,
                               quote_volume, trade_count, taker_buy_volume, taker_buy_quote_volume
                        FROM market_data.{table}
                        WHERE exchange = %s AND symbol = ANY(%s) AND bucket_ts > %s
                        ORDER BY symbol, bucket_ts ASC
                    """
                    rows = conn.execute(sql, (self.exchange, known_symbols, min_ts)).fetchall()
                    rows_by_symbol: Dict[str, list] = {s: [] for s in known_symbols}
                    for row in rows:
                        symbol = row["symbol"]
                        last_ts = last_ts_map.get(symbol)
                        if last_ts and row["bucket_ts"] <= last_ts:
                            continue
                        row = dict(row)
                        row.pop("symbol", None)
                        rows_by_symbol[symbol].append(row)

                    for symbol, rows_list in rows_by_symbol.items():
                        if not rows_list:
                            continue
                        new_df = self._rows_to_df(rows_list)
                        with self._lock:
                            old_df = self._klines.get(interval, {}).get(symbol)
                            if old_df is not None:
                                combined = pd.concat([old_df, new_df])
                                combined = combined[~combined.index.duplicated(keep='last')]
                                combined = combined.tail(self.lookback)
                                self._klines[interval][symbol] = combined
                            else:
                                self._klines.setdefault(interval, {})[symbol] = new_df
                            self._last_ts.setdefault(interval, {})[symbol] = self._klines[interval][symbol].index[-1]
                        updated += 1

                # 2) 新币种：单次窗口查询（限制每个币种条数）
                if new_symbols:
                    sql = f"""
                        WITH ranked AS (
                            SELECT symbol, bucket_ts, open, high, low, close, volume,
                                   quote_volume, trade_count, taker_buy_volume, taker_buy_quote_volume,
                                   ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY bucket_ts DESC) as rn
                            FROM market_data.{table}
                            WHERE exchange = %s AND symbol = ANY(%s)
                        )
                        SELECT symbol, bucket_ts, open, high, low, close, volume,
                               quote_volume, trade_count, taker_buy_volume, taker_buy_quote_volume
                        FROM ranked WHERE rn <= %s
                        ORDER BY symbol, bucket_ts ASC
                    """
                    rows = conn.execute(sql, (self.exchange, new_symbols, self.lookback)).fetchall()
                    rows_by_symbol: Dict[str, list] = {s: [] for s in new_symbols}
                    for row in rows:
                        symbol = row["symbol"]
                        row = dict(row)
                        row.pop("symbol", None)
                        rows_by_symbol[symbol].append(row)

                    for symbol, rows_list in rows_by_symbol.items():
                        if not rows_list:
                            continue
                        new_df = self._rows_to_df(rows_list)
                        with self._lock:
                            self._klines.setdefault(interval, {})[symbol] = new_df
                            self._last_ts.setdefault(interval, {})[symbol] = new_df.index[-1]
                        updated += 1
        except Exception as e:
            LOG.error(f"[{interval}] 更新失败: {e}")

        return updated

    def get_klines(self, interval: str, symbol: str = None) -> Dict[str, pd.DataFrame]:
        """获取K线数据（从缓存）"""
        with self._lock:
            if interval not in self._klines:
                return {}
            if symbol:
                df = self._klines[interval].get(symbol)
                return {symbol: df.copy()} if df is not None else {}
            # 返回全部（复制）
            return {s: df.copy() for s, df in self._klines[interval].items()}

    def get_all_intervals(self) -> List[str]:
        """获取已缓存的周期"""
        with self._lock:
            return list(self._klines.keys())

    def get_symbols(self, interval: str) -> List[str]:
        """获取已缓存的币种"""
        with self._lock:
            return list(self._klines.get(interval, {}).keys())

    def _rows_to_df(self, rows: list) -> pd.DataFrame:
        df = pd.DataFrame(rows)
        df['bucket_ts'] = pd.to_datetime(df['bucket_ts'])
        df.set_index('bucket_ts', inplace=True)
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        return df


class CacheUpdater(Thread):
    """缓存更新线程"""

    def __init__(self, cache: DataCache, symbols: List[str], intervals: List[str]):
        super().__init__(daemon=True, name="CacheUpdater")
        self.cache = cache
        self.symbols = symbols
        self.intervals = intervals
        self._stop_event = Event()
        self._last_update: Dict[str, float] = {}

    def stop(self):
        self._stop_event.set()

    def run(self):
        LOG.info("缓存更新线程启动")

        while not self._stop_event.is_set():
            now = datetime.now(timezone.utc)
            ts = now.timestamp()

            for interval in self.intervals:
                period = INTERVAL_SECONDS.get(interval, 60)
                close_ts = int(ts // period) * period

                # K线闭合后2秒更新
                if ts - close_ts >= 2 and ts - close_ts < 5:
                    last = self._last_update.get(interval, 0)
                    if close_ts > last:
                        self._last_update[interval] = close_ts
                        updated = self.cache.update_interval(self.symbols, interval)
                        if updated > 0:
                            LOG.debug(f"[{interval}] 更新 {updated} 币种")

            time.sleep(0.5)

        LOG.info("缓存更新线程停止")


# 全局缓存实例
_global_cache: Optional[DataCache] = None
_cache_updater: Optional[CacheUpdater] = None


def get_cache() -> DataCache:
    """获取全局缓存"""
    global _global_cache
    if _global_cache is None:
        _global_cache = DataCache()
    return _global_cache


def init_cache(symbols: List[str], intervals: List[str], lookback: int = 300):
    """初始化全局缓存 - 多周期并行"""
    global _global_cache, _cache_updater

    _global_cache = DataCache(lookback=lookback)

    # 并行初始化所有周期
    workers = min(len(intervals), 7)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(_global_cache.init_interval, symbols, iv) for iv in intervals]
        for f in as_completed(futures):
            try:
                f.result()
            except Exception as e:
                LOG.error(f"初始化失败: {e}")

    _global_cache._initialized = {iv: True for iv in intervals}  # 标记已初始化

    # 启动更新线程
    _cache_updater = CacheUpdater(_global_cache, symbols, intervals)
    _cache_updater.start()

    return _global_cache


def stop_cache():
    """停止缓存更新"""
    global _cache_updater
    if _cache_updater:
        _cache_updater.stop()
        _cache_updater = None
