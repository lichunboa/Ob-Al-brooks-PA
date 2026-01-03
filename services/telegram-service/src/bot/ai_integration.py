# -*- coding: utf-8 -*-
"""
AI 服务集成模块 - 桥接 telegram-service 和 ai-service
"""
from __future__ import annotations

import sys
from pathlib import Path

# 添加 ai-service 到 path
AI_SERVICE_PATH = Path(__file__).resolve().parents[3] / "ai-service"
if str(AI_SERVICE_PATH) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_PATH))

# 导入 ai-service 模块
from src.bot import (
    AIAnalysisHandler,
    get_ai_handler,
    register_ai_handlers,
    prompt_registry,
    SELECTING_COIN,
    SELECTING_INTERVAL,
)
from src.process import run_process

__all__ = [
    "AIAnalysisHandler",
    "get_ai_handler",
    "register_ai_handlers",
    "prompt_registry",
    "run_process",
    "SELECTING_COIN",
    "SELECTING_INTERVAL",
]
