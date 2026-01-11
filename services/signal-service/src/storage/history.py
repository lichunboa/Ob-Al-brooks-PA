"""
信号历史记录管理
存储和查询信号触发历史
"""
import os
import stat
import sqlite3
import logging
import threading
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from contextlib import contextmanager

from ..config import get_history_db_path

logger = logging.getLogger(__name__)


def _get_db_path() -> str:
    """获取数据库路径"""
    return str(get_history_db_path())

# 最大保留天数
_MAX_RETENTION_DAYS = int(os.environ.get("SIGNAL_HISTORY_RETENTION_DAYS", "30"))


def _init_db(db_path: str):
    """初始化历史数据库"""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    # 创建数据库文件
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS signal_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            symbol TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            direction TEXT NOT NULL,
            strength INTEGER NOT NULL,
            message TEXT,
            timeframe TEXT,
            price REAL,
            source TEXT DEFAULT 'sqlite',
            extra TEXT
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_symbol ON signal_history(symbol)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON signal_history(timestamp)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_direction ON signal_history(direction)")
    conn.commit()
    conn.close()
    
    # 设置文件权限为 600（仅所有者可读写）
    try:
        os.chmod(db_path, stat.S_IRUSR | stat.S_IWUSR)
    except Exception as e:
        logger.warning(f"设置数据库文件权限失败: {e}")


class SignalHistory:
    """信号历史记录管理器"""
    
    def __init__(self, db_path: str = None):
        self.db_path = db_path or _get_db_path()
        self._lock = threading.Lock()
        self._initialized = False
        self._ensure_initialized()
    
    def _ensure_initialized(self):
        """确保数据库已初始化"""
        if not self._initialized:
            with self._lock:
                if not self._initialized:
                    _init_db(self.db_path)
                    self._initialized = True
    
    @contextmanager
    def _get_conn(self):
        """获取数据库连接（使用 context manager 确保关闭）"""
        conn = None
        try:
            conn = sqlite3.connect(self.db_path, timeout=10)
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass
    
    def save(self, signal, source: str = "sqlite", max_retries: int = 2) -> int:
        """保存信号到历史记录（带重试）"""
        for attempt in range(max_retries + 1):
            try:
                with self._get_conn() as conn:
                    # 处理不同类型的信号对象
                    if hasattr(signal, 'signal_type'):
                        # PGSignal
                        data = {
                            "timestamp": signal.timestamp.isoformat(),
                            "symbol": signal.symbol,
                            "signal_type": signal.signal_type,
                            "direction": signal.direction,
                            "strength": signal.strength,
                            "message": signal.message,
                            "timeframe": getattr(signal, 'timeframe', '5m'),
                            "price": getattr(signal, 'price', 0),
                            "source": source,
                            "extra": str(getattr(signal, 'extra', {})),
                        }
                    else:
                        # SQLite Signal
                        data = {
                            "timestamp": signal.timestamp.isoformat() if hasattr(signal, 'timestamp') else datetime.now().isoformat(),
                            "symbol": signal.symbol,
                            "signal_type": signal.rule_name,
                            "direction": signal.direction,
                            "strength": signal.strength,
                            "message": signal.message,
                            "timeframe": getattr(signal, 'timeframe', '1h'),
                            "price": getattr(signal, 'price', 0),
                            "source": source,
                            "extra": "",
                        }
                    
                    cursor = conn.execute("""
                        INSERT INTO signal_history 
                        (timestamp, symbol, signal_type, direction, strength, message, timeframe, price, source, extra)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        data["timestamp"], data["symbol"], data["signal_type"],
                        data["direction"], data["strength"], data["message"],
                        data["timeframe"], data["price"], data["source"], data["extra"]
                    ))
                    
                    conn.commit()
                    return cursor.lastrowid
            except sqlite3.OperationalError as e:
                if attempt < max_retries:
                    logger.warning(f"保存信号历史失败(重试{attempt + 1}): {e}")
                    import time
                    time.sleep(0.1 * (attempt + 1))
                else:
                    logger.error(f"保存信号历史失败(已重试{max_retries}次): {e}")
                    return -1
            except Exception as e:
                logger.error(f"保存信号历史失败: {e}")
                return -1
        return -1
    
    def get_recent(self, limit: int = 20, symbol: str = None, direction: str = None) -> List[Dict]:
        """获取最近的信号记录"""
        try:
            with self._get_conn() as conn:
                query = "SELECT * FROM signal_history WHERE 1=1"
                params = []
                
                if symbol:
                    query += " AND symbol = ?"
                    params.append(symbol)
                
                if direction:
                    query += " AND direction = ?"
                    params.append(direction)
                
                query += " ORDER BY timestamp DESC LIMIT ?"
                params.append(limit)
                
                rows = conn.execute(query, params).fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"获取信号历史失败: {e}")
            return []
    
    def get_by_symbol(self, symbol: str, days: int = 7, limit: int = 50) -> List[Dict]:
        """获取指定币种的信号历史"""
        try:
            with self._get_conn() as conn:
                since = (datetime.now() - timedelta(days=days)).isoformat()
                
                rows = conn.execute("""
                    SELECT * FROM signal_history 
                    WHERE symbol = ? AND timestamp > ?
                    ORDER BY timestamp DESC 
                    LIMIT ?
                """, (symbol, since, limit)).fetchall()
                
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"获取币种信号历史失败: {e}")
            return []
    
    def get_stats(self, days: int = 7) -> Dict:
        """获取信号统计"""
        try:
            with self._get_conn() as conn:
                since = (datetime.now() - timedelta(days=days)).isoformat()
                
                # 总数
                total = conn.execute(
                    "SELECT COUNT(*) FROM signal_history WHERE timestamp > ?", (since,)
                ).fetchone()[0]
                
                # 按方向统计
                by_direction = {}
                for row in conn.execute("""
                    SELECT direction, COUNT(*) as cnt 
                    FROM signal_history WHERE timestamp > ?
                    GROUP BY direction
                """, (since,)):
                    by_direction[row[0]] = row[1]
                
                # 按币种统计 Top 10
                by_symbol = []
                for row in conn.execute("""
                    SELECT symbol, COUNT(*) as cnt 
                    FROM signal_history WHERE timestamp > ?
                    GROUP BY symbol ORDER BY cnt DESC LIMIT 10
                """, (since,)):
                    by_symbol.append({"symbol": row[0], "count": row[1]})
                
                # 按来源统计
                by_source = {}
                for row in conn.execute("""
                    SELECT source, COUNT(*) as cnt 
                    FROM signal_history WHERE timestamp > ?
                    GROUP BY source
                """, (since,)):
                    by_source[row[0]] = row[1]
                
                return {
                    "total": total,
                    "days": days,
                    "by_direction": by_direction,
                    "by_symbol": by_symbol,
                    "by_source": by_source,
                }
        except Exception as e:
            logger.error(f"获取信号统计失败: {e}")
            return {"total": 0, "days": days, "by_direction": {}, "by_symbol": [], "by_source": {}}
    
    def cleanup(self, days: int = None) -> int:
        """清理旧记录"""
        if days is None:
            days = _MAX_RETENTION_DAYS
        try:
            with self._get_conn() as conn:
                cutoff = (datetime.now() - timedelta(days=days)).isoformat()
                cursor = conn.execute("DELETE FROM signal_history WHERE timestamp < ?", (cutoff,))
                deleted = cursor.rowcount
                conn.commit()
                
                if deleted > 0:
                    logger.info(f"清理了 {deleted} 条旧信号记录")
                return deleted
        except Exception as e:
            logger.error(f"清理信号历史失败: {e}")
            return 0
    
    def format_history_text(self, records: List[Dict], title: str = "信号历史") -> str:
        """格式化历史记录为文本"""
        if not records:
            return f"📜 {title}\n\n暂无记录"
        
        lines = [f"📜 {title} ({len(records)}条)", ""]
        
        dir_icons = {"BUY": "🟢", "SELL": "🔴", "ALERT": "⚠️"}
        
        for r in records[:15]:  # 最多显示15条
            ts = r.get("timestamp", "")[:16].replace("T", " ")
            symbol = r.get("symbol", "").replace("USDT", "")
            direction = r.get("direction", "")
            signal_type = r.get("signal_type", "")
            strength = r.get("strength", 0)
            icon = dir_icons.get(direction, "📊")
            
            lines.append(f"{icon} {symbol} | {signal_type}")
            lines.append(f"   {ts} | 强度:{strength}")
        
        if len(records) > 15:
            lines.append(f"\n... 还有 {len(records) - 15} 条")
        
        return "\n".join(lines)


# 单例
_history: Optional[SignalHistory] = None
_history_lock = threading.Lock()

def get_history() -> SignalHistory:
    """获取历史记录管理器单例"""
    global _history
    if _history is None:
        with _history_lock:
            if _history is None:
                _history = SignalHistory()
                # 启动时清理旧记录
                _history.cleanup()
    return _history
