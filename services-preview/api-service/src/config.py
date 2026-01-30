"""配置管理"""

import os
from functools import lru_cache
from pathlib import Path
from threading import Lock

from dotenv import load_dotenv
from psycopg_pool import ConnectionPool

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
ENV_FILE = PROJECT_ROOT / "config" / ".env"

load_dotenv(ENV_FILE)


class Settings:
    """服务配置"""

    # API 服务
    HOST: str = os.getenv("API_SERVICE_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("API_SERVICE_PORT", "8088"))
    DEBUG: bool = os.getenv("API_SERVICE_DEBUG", "false").lower() == "true"

    # TimescaleDB
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5434/market_data"
    )

    # SQLite 路径
    SQLITE_INDICATORS_PATH: Path = (
        PROJECT_ROOT / "libs" / "database" / "services" / "telegram-service" / "market_data.db"
    )
    SQLITE_COOLDOWN_PATH: Path = (
        PROJECT_ROOT / "libs" / "database" / "services" / "signal-service" / "cooldown.db"
    )


_PG_POOL: ConnectionPool | None = None
_PG_POOL_LOCK = Lock()


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_pg_pool() -> ConnectionPool:
    """获取共享 PG 连接池"""
    global _PG_POOL
    if _PG_POOL is None:
        with _PG_POOL_LOCK:
            if _PG_POOL is None:
                settings = get_settings()
                _PG_POOL = ConnectionPool(
                    settings.DATABASE_URL,
                    min_size=1,
                    max_size=10,
                    timeout=30,
                    kwargs={"connect_timeout": 3},
                )
    return _PG_POOL
