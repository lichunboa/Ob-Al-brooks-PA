import os
import logging

class Settings:
    def __init__(self):
        # Database
        self.DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/market_data")
        
        # Symbols (Separated by comma)
        # Default: Futures (ES=F, NQ=F), Indexes (SPY, QQQ), Tech (NVDA, TSLA, AAPL, MSFT)
        self.STOCK_SYMBOLS = os.getenv("STOCK_SYMBOLS", "ES=F,NQ=F,SPY,QQQ,NVDA,TSLA,AAPL,MSFT").split(",")
        
        # Collection Loop
        self.COLLECTION_INTERVAL_SECONDS = int(os.getenv("STOCK_COLLECTION_INTERVAL", "60"))
        
        # Logging
        self.LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

settings = Settings()

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
