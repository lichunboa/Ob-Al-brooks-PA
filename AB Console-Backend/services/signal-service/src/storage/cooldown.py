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
import stat

logger = logging.getLogger(__name__)


def _get_cooldown_db_path() -> str:
    """获取冷却数据库路径"""
    # 优先使用环境变量
    if os.environ.get('COOLDOWN_DB_PATH'):
        return os.environ.get('COOLDOWN_DB_PATH')
    
    # 其次使用 SQLITE_DB_PATH 环境变量
    if os.environ.get('SQLITE_DB_PATH'):
        db_path = Path(os.environ.get('SQLITE_DB_PATH'))
        return str(db_path.parent / 'cooldown.db')
    
    # 本地环境：使用 ~/.openclaw/workspace/
    # Docker 环境：使用 /app/data/
    local_path = Path.home() / ".openclaw" / "workspace" / "cooldown.db"
    docker_path = Path("/app/data/cooldown.db")
    if docker_path.parent.exists() and os.access(str(docker_path.parent), os.W_OK):
        return str(docker_path)
    return str(local_path)


class CooldownStorage:
    """冷却状态持久化存储"""

    def __init__(self, db_path: str = None):
        raw_path = db_path or _get_cooldown_db_path()
        resolved = Path(raw_path).resolve()
        # 安全检查：确保路径在 /app/data 下（Docker环境）
        allowed_roots = [Path("/app/data").resolve(), Path("/tmp").resolve()]
        is_allowed = any(str(resolved).startswith(str(root)) for root in allowed_roots)
        if not is_allowed and not str(resolved).startswith(str(Path.home())):
            raise ValueError(f"非法冷却存储路径: {resolved}")
        self.db_path = str(resolved)
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
        try:
            os.chmod(self.db_path, stat.S_IRUSR | stat.S_IWUSR)
        except Exception as e:
            logger.warning("设置冷却数据库权限失败: %s", e)

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
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
