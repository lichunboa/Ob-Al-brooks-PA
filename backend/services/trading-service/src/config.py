"""
配置管理

环境变量:
    DATABASE_URL: TimescaleDB 连接串
    INDICATOR_SQLITE_PATH: SQLite 输出路径
    MAX_WORKERS: 并行计算线程数
    KLINE_INTERVALS: K线指标计算周期
    FUTURES_INTERVALS: 期货情绪计算周期
"""
import os
from pathlib import Path
from dataclasses import dataclass, field
from typing import List

SERVICE_ROOT = Path(__file__).resolve().parents[1]  # src/config.py -> trading-service
# 独立运行模式：不依赖 TradeCat 目录结构
DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
LOGS_DIR = Path(os.getenv("LOGS_DIR", "/app/logs"))

# 确保目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)


def _parse_intervals(env_key: str, default: str) -> List[str]:
    return [x.strip() for x in os.getenv(env_key, default).split(",") if x.strip()]


@dataclass
class Config:
    # TimescaleDB（读取K线）
    db_url: str = field(default_factory=lambda: os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5433/market_data"
    ))

    # SQLite（写入指标结果）
    sqlite_path: Path = field(default_factory=lambda: Path(os.getenv(
        "INDICATOR_SQLITE_PATH",
        str(DATA_DIR / "indicators.db")
    )))

    # 计算参数
    default_lookback: int = 300
    max_workers: int = field(default_factory=lambda: int(os.getenv("MAX_WORKERS", "6")))
    exchange: str = "binance_futures_um"
    # 计算后端: thread | process | hybrid（IO用线程，CPU用进程）
    compute_backend: str = field(default_factory=lambda: os.getenv("COMPUTE_BACKEND", "thread").lower())

    # IO/CPU 拆分执行器配置
    max_io_workers: int = field(default_factory=lambda: int(os.getenv("MAX_IO_WORKERS", "8")))
    max_cpu_workers: int = field(default_factory=lambda: int(os.getenv("MAX_CPU_WORKERS", "4")))

    # K线指标周期
    kline_intervals: List[str] = field(default_factory=lambda: _parse_intervals(
        "KLINE_INTERVALS", "1m,5m,15m,1h,4h,1d,1w"
    ))

    # 期货情绪周期
    futures_intervals: List[str] = field(default_factory=lambda: _parse_intervals(
        "FUTURES_INTERVALS", "5m,15m,1h,4h,1d,1w"
    ))

    # 兼容旧代码
    @property
    def intervals(self) -> List[str]:
        return self.kline_intervals


config = Config()
