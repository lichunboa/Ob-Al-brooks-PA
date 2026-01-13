"""
冷却状态持久化
防止服务重启后重复推送信号
"""

import logging
import os
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path

logger = logging.getLogger(__name__)


def _get_cooldown_db_path() -> str:
    """获取冷却数据库路径"""
    # 兼容直接运行和作为模块导入
    try:
        from ..config import REPO_ROOT
    except ImportError:
        REPO_ROOT = Path(__file__).resolve().parents[4]
    return str(REPO_ROOT / "libs/database/services/signal-service/cooldown.db")


class CooldownStorage:
    """冷却状态持久化存储"""

    def __init__(self, db_path: str = None):
        self.db_path = db_path or _get_cooldown_db_path()
        self._ensure_db()

    def _ensure_db(self):
        """确保数据库存在"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS cooldown (
                    key TEXT PRIMARY KEY,
                    timestamp REAL NOT NULL
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_ts ON cooldown(timestamp)")

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path, timeout=5)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def get(self, key: str) -> float:
        """获取冷却时间戳，不存在返回 0"""
        with self._conn() as conn:
            row = conn.execute("SELECT timestamp FROM cooldown WHERE key = ?", (key,)).fetchone()
            return row[0] if row else 0.0

    def set(self, key: str, timestamp: float = None):
        """设置冷却时间戳"""
        ts = timestamp or time.time()
        with self._conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO cooldown (key, timestamp) VALUES (?, ?)",
                (key, ts)
            )

    def load_all(self) -> dict[str, float]:
        """加载所有冷却状态"""
        with self._conn() as conn:
            rows = conn.execute("SELECT key, timestamp FROM cooldown").fetchall()
            return {k: v for k, v in rows}

    def cleanup(self, max_age: int = 86400):
        """清理过期记录（默认24小时）"""
        cutoff = time.time() - max_age
        with self._conn() as conn:
            conn.execute("DELETE FROM cooldown WHERE timestamp < ?", (cutoff,))


# 单例
_storage: CooldownStorage | None = None


def get_cooldown_storage() -> CooldownStorage:
    global _storage
    if _storage is None:
        _storage = CooldownStorage()
    return _storage
