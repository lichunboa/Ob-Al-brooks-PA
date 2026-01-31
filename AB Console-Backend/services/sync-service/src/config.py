"""Sync Service Configuration"""
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """服务配置"""
    
    # Service
    service_name: str = "sync-service"
    version: str = "1.0.0"
    debug: bool = False
    
    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8089
    api_prefix: str = "/api/v1"
    
    # Database (支持 SQLite 和 PostgreSQL)
    database_url: str = "sqlite:///./data/sync.db"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    
    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")
    
    # Obsidian
    obsidian_vault_path: str = "/Users/mitchellcb/Desktop/Obsidian/Al-brooks-PA/AB Console-Obsidian"
    
    # Trade notes path (relative to vault)
    trades_path: str = "Daily/Trades"
    strategies_path: str = "策略仓库 (Strategy Repository)/Al Brooks 策略"
    
    # Sync
    sync_batch_size: int = 100
    auto_sync_interval: int = 300  # 5 minutes
    
    # Logging
    log_level: str = "INFO"
    
    class Config:
        env_prefix = "SYNC_"
        env_file = ".env"


settings = Settings()
