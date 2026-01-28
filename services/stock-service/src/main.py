import asyncio
import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from .config import settings
from .db import db
from .collector import collector

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()

async def job_fetch_stocks():
    logger.info("Starting stock collection cycle...")
    for sym in settings.STOCK_SYMBOLS:
        sym = sym.strip()
        data = collector.process_symbol(sym)
        if data:
            await db.save_candles(data)
    logger.info("Stock collection cycle finished.")

async def main():
    logger.info("Starting Stock Service...")
    await db.connect()

    # Schedule regular tasks
    scheduler.add_job(job_fetch_stocks, 'interval', seconds=settings.COLLECTION_INTERVAL_SECONDS)
    scheduler.start()

    # Allow startup time then run immediately once
    await asyncio.sleep(2)
    await job_fetch_stocks()

    # Keep alive
    try:
        while True:
            await asyncio.sleep(1)
    except (KeyboardInterrupt, asyncio.CancelledError):
        logger.info("Stopping...")
        await db.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
