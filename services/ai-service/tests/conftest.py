"""ai-service 测试配置。"""

from pathlib import Path
import sys

import pytest

# 保障 tests 可直接导入 src/*
SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


@pytest.fixture
def sample_symbol():
    """测试用交易对。"""
    return "BTCUSDT"
