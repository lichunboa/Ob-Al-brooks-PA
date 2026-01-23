"""
API Gateway Configuration
"""

import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """API Gateway settings"""

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8088
    api_token: str = ""

    # Database
    database_url: str = "postgresql://postgres:postgres@localhost:5434/market_data"
    indicator_sqlite_path: str = "/app/data/indicators.db"

    # CORS
    cors_origins: list[str] = ["*"]

    # Logging
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
