import asyncpg
import logging
from .config import settings

logger = logging.getLogger(__name__)

class Database:
    def __init__(self):
        self.pool = None

    async def connect(self):
        if not self.pool:
            try:
                self.pool = await asyncpg.create_pool(settings.DATABASE_URL)
                logger.info("Connected to TimescaleDB")
            except Exception as e:
                logger.error(f"DB Connection failed: {e}")
                raise

    async def close(self):
        if self.pool:
            await self.pool.close()

    async def save_candles(self, candles):
        """
        Batch insert candles into raw.crypto_kline_1m
        candles: list of dicts with keys: symbol, open_time, open, high, low, close, volume
        """
        if not candles:
            return

        query = """
            INSERT INTO raw.crypto_kline_1m (
                symbol, open_time, open, high, low, close, volume, 
                quote_volume, trades, taker_buy_volume, taker_buy_quote_volume, 
                batch_id, created_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, 
                0, 0, 0, 0, 
                NULL, NOW()
            )
            ON CONFLICT (symbol, open_time) DO UPDATE SET
                open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                created_at = NOW()
        """

        records = [
            (
                c['symbol'], c['open_time'], c['open'], c['high'], c['low'], c['close'], c['volume']
            )
            for c in candles
        ]

        async with self.pool.acquire() as conn:
            try:
                await conn.executemany(query, records)
                logger.info(f"Inserted/Updated {len(records)} candles")
            except Exception as e:
                logger.error(f"Failed to insert candles: {e}")

db = Database()
