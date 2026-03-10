"""
执行服务阈值配置管理。
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel

from .config import WORKSPACE

logger = logging.getLogger(__name__)

THRESHOLDS_FILE = WORKSPACE / "stats" / "thresholds.json"

DEFAULT_THRESHOLDS = {
    "min_strength": 60,
    "bot_thresholds": {
        "al-brooks": {"min_score": 70, "trade_score": 70},
        "trader": {"min_score": 70, "trade_score": 70},
        "wyckoff": {"min_score": 50, "trade_score": 50},
    },
}


class ThresholdUpdate(BaseModel):
    """阈值更新请求。"""

    min_strength: Optional[int] = None
    bot_id: Optional[str] = None
    min_score: Optional[int] = None
    trade_score: Optional[int] = None


def load_thresholds() -> dict:
    """加载阈值配置。"""
    try:
        if THRESHOLDS_FILE.exists():
            with THRESHOLDS_FILE.open("r", encoding="utf-8") as handle:
                return {**DEFAULT_THRESHOLDS, **json.load(handle)}
    except Exception as exc:
        logger.error("加载阈值配置失败: %s", exc)
    return DEFAULT_THRESHOLDS


def save_thresholds(thresholds: dict) -> bool:
    """保存阈值配置。"""
    try:
        THRESHOLDS_FILE.parent.mkdir(parents=True, exist_ok=True)
        payload = dict(thresholds)
        payload["updated_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        with THRESHOLDS_FILE.open("w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
        return True
    except Exception as exc:
        logger.error("保存阈值配置失败: %s", exc)
        return False
