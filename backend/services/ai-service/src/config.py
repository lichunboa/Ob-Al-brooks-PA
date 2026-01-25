# -*- coding: utf-8 -*-
"""AI 服务配置"""
from __future__ import annotations

import os
import sys
from pathlib import Path

try:
    from dotenv import load_dotenv
    # 尝试加载 .env 文件
    _env_file = Path(__file__).resolve().parents[2] / ".env"
    if _env_file.exists():
        load_dotenv(_env_file)
except ImportError:
    pass  # dotenv 不是必需的，环境变量可通过 Docker 传入

# 项目路径
SERVICE_ROOT = Path(__file__).resolve().parents[1]  # ai-service/
# 独立运行模式：不依赖 TradeCat 目录结构
DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
LOGS_DIR = Path(os.getenv("LOGS_DIR", "/app/logs"))

# 确保目录存在
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOGS_DIR.mkdir(parents=True, exist_ok=True)

# 数据库路径
INDICATOR_DB = Path(os.getenv("INDICATOR_SQLITE_PATH", str(DATA_DIR / "indicators.db")))

# Bot Token（复用 telegram-service 配置）
BOT_TOKEN = os.getenv("BOT_TOKEN") or os.getenv("TELEGRAM_BOT_TOKEN")

# 代理
HTTP_PROXY = os.getenv("HTTP_PROXY") or os.getenv("HTTPS_PROXY")

# 提示词目录
PROMPTS_DIR = SERVICE_ROOT / "prompts"

# LLM 后端: cli (默认) 或 api
LLM_BACKEND = os.getenv("LLM_BACKEND", "cli")
