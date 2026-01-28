import aiosqlite
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional
from .config import settings

logger = logging.getLogger(__name__)

# Hardcoded path logic similar to signal-service configuration
# Start from api-gateway/src -> parent -> parent -> parent -> libs...
# api-gateway path: backend/tradecat-core/services/api-gateway/src
# Core root: backend/tradecat-core
CORE_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SIGNAL_DB_PATH = CORE_ROOT / "libs/database/services/signal-service/signal_history.db"

class SignalDB:
    def __init__(self):
        self.db_path = str(SIGNAL_DB_PATH)
        self.conn: Optional[aiosqlite.Connection] = None

    async def connect(self):
        # We don't create the DB, we expect signal-service to manage it.
        # But we can open it in read-only mode or just open it.
        # If it doesn't exist, we can't do much.
        if not Path(self.db_path).exists():
             logger.warning(f"Signal DB not found at {self.db_path}")
             return

        if not self.conn:
            try:
                logger.info(f"Connecting to Signal DB: {self.db_path}")
                self.conn = await aiosqlite.connect(self.db_path)
                self.conn.row_factory = aiosqlite.Row
                logger.info("Signal DB connected")
            except Exception as e:
                logger.error(f"Signal DB Connection failed: {e}")
                
    async def disconnect(self):
        if self.conn:
            await self.conn.close()
            self.conn = None

    async def get_recent_signals(self, limit: int = 50, symbol: Optional[str] = None) -> List[Dict[str, Any]]:
        if not self.conn:
             # Try connecting if file appeared late
             if Path(self.db_path).exists():
                 await self.connect()
             
             if not self.conn:
                 return []
        
        try:
            query = "SELECT * FROM signal_history"
            params = []
            conditions = []
            
            if symbol:
                conditions.append("symbol = ?")
                params.append(symbol)
                
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
                
            query += " ORDER BY timestamp DESC LIMIT ?"
            params.append(limit)

            async with self.conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Failed to fetch signals: {e}")
            return []

signal_db = SignalDB()
