"""信号历史记录测试。"""

from datetime import datetime


def test_history_normalize_signal_event(sample_signal_event):
    """SignalEvent 能被规范化成 PG 历史记录。"""
    from src.storage.history import PgSignalHistory

    data = PgSignalHistory._normalize_signal(sample_signal_event, source="pa")

    assert data["symbol"] == "BTCUSDT"
    assert data["signal_type"] == "price_surge"
    assert data["message"] == sample_signal_event.message_key
    assert data["source"] == "pa"
    assert data["extra"]["message_key"] == sample_signal_event.message_key
    assert data["extra"]["message_params"] == sample_signal_event.message_params


def test_history_normalize_pa_signal():
    """PASignal 能被规范化成 PG 历史记录。"""
    from src.engines.pa.models import PASignal
    from src.storage.history import PgSignalHistory

    signal = PASignal(
        symbol="BTCUSDT",
        signal_type="高2",
        direction="BUY",
        strength=80,
        message="趋势多双底 H2",
        timestamp=datetime.now(),
        timeframe="5m",
        price=50000.0,
        stop_loss=49800.0,
        take_profit=50600.0,
        extra={"playbook_hint": "T2_TREND_H2"},
    )

    data = PgSignalHistory._normalize_signal(signal, source="pa")

    assert data["symbol"] == "BTCUSDT"
    assert data["signal_type"] == "高2"
    assert data["message"] == "趋势多双底 H2"
    assert data["source"] == "pa"
    assert data["extra"]["playbook_hint"] == "T2_TREND_H2"
