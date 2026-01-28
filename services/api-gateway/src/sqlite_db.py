import aiosqlite
import logging
from typing import List, Dict, Any, Optional
from .config import settings

logger = logging.getLogger(__name__)

class SQLiteDB:
    def __init__(self):
        self.db_path = settings.indicator_sqlite_path
        self.conn: Optional[aiosqlite.Connection] = None

    async def connect(self):
        if not self.conn:
            try:
                logger.info(f"Connecting to SQLite: {self.db_path}")
                self.conn = await aiosqlite.connect(self.db_path)
                self.conn.row_factory = aiosqlite.Row
                logger.info("SQLite connected")
            except Exception as e:
                logger.error(f"SQLite Connection failed: {e}")
                # Don't raise, allow API to run even if indicators are missing
                
    async def disconnect(self):
        if self.conn:
            await self.conn.close()
            self.conn = None

    async def get_tables(self) -> List[str]:
        if not self.conn:
             return []
        try:
            async with self.conn.execute("SELECT name FROM sqlite_master WHERE type='table'") as cursor:
                rows = await cursor.fetchall()
                return [row['name'] for row in rows]
        except Exception as e:
            logger.error(f"Failed to get tables: {e}")
            return []

    async def fetch_table_data(self, table_name: str, symbol: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        if not self.conn:
            return []
        
        # Sanitize table name (basic check) to prevent injection if not handled by parameter binding (table names can't be bound)
        # In this system, table names are filenames like "Ichimoku.py", so we trust them or validate against get_tables()
        # For safety, let's validate against existing tables.
        valid_tables = await self.get_tables()
        if table_name not in valid_tables:
            logger.warning(f"Invalid table requested: {table_name}")
            return []

        query = f'SELECT * FROM "{table_name}"'
        params = []
        
        if symbol:
            query += ' WHERE "交易对" = ?' # TradeCat tables use Chinese columns "交易对"
            params.append(symbol)
        
        # Determine sorting column. Most tables have "数据时间"
        # We can perform a PRAGMA to check columns but for now assume "数据时间" exists if we want to sort.
        # Let's just retrieve latest.
        query += ' ORDER BY rowid DESC LIMIT ?' # Default robust sort
        params.append(limit)

        try:
            async with self.conn.execute(query, params) as cursor:
                rows = await cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Query {table_name} failed: {e}")
            return []

sqlite_db = SQLiteDB()
