"""
Signal Service 配置
"""

import os
from pathlib import Path

# 路径
SRC_DIR = Path(__file__).resolve().parent
SERVICE_ROOT = SRC_DIR.parent
# 独立运行模式：不依赖 TradeCat 目录结构
DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
LOGS_DIR = Path(os.getenv("LOGS_DIR", "/app/logs"))

# 确保目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)


# 数据库配置
def get_database_url() -> str:
    """获取 TimescaleDB 连接 URL"""
    return os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/market_data")


def get_sqlite_path() -> Path:
    """获取 SQLite 指标数据库路径"""
    env_path = os.environ.get("INDICATOR_SQLITE_PATH")
    if env_path:
        return Path(env_path)
    return DATA_DIR / "indicators.db"


def get_history_db_path() -> Path:
    """获取信号历史数据库路径"""
    env_path = os.environ.get("SIGNAL_HISTORY_DB_PATH")
    if env_path:
        return Path(env_path)
    return DATA_DIR / "signal_history.db"


def get_subscription_db_path() -> Path:
    """获取订阅数据库路径"""
    env_path = os.environ.get("SIGNAL_SUBSCRIPTION_DB_PATH")
    if env_path:
        return Path(env_path)
    return DATA_DIR / "signal_subs.db"


# 信号检测配置
DEFAULT_TIMEFRAMES = ["1h", "4h", "1d"]
DEFAULT_MIN_VOLUME = 100000
DEFAULT_CHECK_INTERVAL = 60  # 秒
COOLDOWN_SECONDS = 300  # 同一信号冷却时间
# 数据新鲜度阈值（秒），超过则视为陈旧数据不参与信号计算
DATA_MAX_AGE_SECONDS = int(os.environ.get("SIGNAL_DATA_MAX_AGE", "600"))

# 历史记录配置
MAX_RETENTION_DAYS = int(os.environ.get("SIGNAL_HISTORY_RETENTION_DAYS", "30"))
