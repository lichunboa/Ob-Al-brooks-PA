"""TimescaleDB 存储适配器"""
from __future__ import annotations

from contextlib import contextmanager
from threading import Lock
from typing import Iterator, Sequence

from psycopg_pool import ConnectionPool

from config import settings
from models.candle import Candle


_SHARED_POOL: ConnectionPool | None = None
_SHARED_POOL_LOCK = Lock()


def get_shared_pool() -> ConnectionPool:
    """获取共享连接池（全服务复用）"""
    global _SHARED_POOL
    if _SHARED_POOL is None:
        with _SHARED_POOL_LOCK:
            if _SHARED_POOL is None:
                _SHARED_POOL = ConnectionPool(
                    settings.database_url,
                    min_size=2,
                    max_size=10,
                    timeout=30.0,
                )
    return _SHARED_POOL


class TimescaleStorage:
    """TimescaleDB 存储"""

    def __init__(self, db_url: str | None = None, schema: str | None = None):
        self.db_url = db_url or settings.database_url
        self.schema = schema or settings.db_schema
        self._pool: ConnectionPool | None = None

    @property
    def pool(self) -> ConnectionPool:
        if self.db_url == settings.database_url:
            return get_shared_pool()
        if self._pool is None:
            self._pool = ConnectionPool(
                self.db_url,
                min_size=2,
                max_size=10,
                timeout=30.0,
            )
        return self._pool

    def close(self):
        if self._pool and self.db_url != settings.database_url:
            self._pool.close()
            self._pool = None

    @contextmanager
    def connection(self) -> Iterator:
        with self.pool.connection() as conn:
            yield conn

    def upsert_candles(self, candles: Sequence[Candle], batch_size: int = 2000) -> int:
        """批量写入 K 线"""
        if not candles:
            return 0

        table = f"{self.schema}.candles"
        cols = ["market", "asset_type", "exchange", "symbol", "interval",
                "bucket_ts", "open", "high", "low", "close", "volume",
                "quote_volume", "open_interest", "source"]

        total = 0
        with self.connection() as conn:
            with conn.cursor() as cur:
                for i in range(0, len(candles), batch_size):
                    batch = candles[i:i + batch_size]
                    values = []
                    for c in batch:
                        values.append((
                            c.market, c.asset_type, c.exchange, c.symbol, c.interval,
                            c.timestamp, float(c.open), float(c.high), float(c.low),
                            float(c.close), float(c.volume),
                            float(c.quote_volume) if c.quote_volume else None,
                            float(c.open_interest) if c.open_interest else None,
                            c.source
                        ))

                    # 使用 executemany
                    cur.executemany(
                        f"""INSERT INTO {table} ({', '.join(cols)})
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (market, asset_type, exchange, symbol, interval, bucket_ts)
                            DO UPDATE SET open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low,
                                close=EXCLUDED.close, volume=EXCLUDED.volume, updated_at=NOW()""",
                        values
                    )
                    total += len(batch)
                conn.commit()
        return total
