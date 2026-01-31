"""
Pytest 配置和 fixtures
"""
import sys
from pathlib import Path

import pytest

# 确保 src 在路径中
PROJECT_ROOT = Path(__file__).parent.parent
SRC_DIR = PROJECT_ROOT / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture
def sample_signal_event():
    """示例信号事件"""
    from src.events.types import SignalEvent
    
    return SignalEvent(
        symbol="BTCUSDT",
        signal_type="price_surge",
        direction="BUY",
        strength=75,
        message_key="signal.pg.msg.price_surge",
        message_params={"pct": "3.5"},
        price=50000.0,
        timeframe="5m",
    )


@pytest.fixture
def clean_publisher():
    """清理 SignalPublisher 状态"""
    from src.events.publisher import SignalPublisher
    
    SignalPublisher.clear()
    yield SignalPublisher
    SignalPublisher.clear()
