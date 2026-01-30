import pandas as pd
import pytest

from src.indicators.batch.tv_trend_cloud import TvTrendCloud
from src.indicators.incremental.kdj import KDJ


# ==================== 测试数据构造 ====================

def _make_sample_df(rows: int = 240) -> pd.DataFrame:
    index = pd.date_range("2024-01-01", periods=rows, freq="1min", tz="UTC")
    base = pd.Series(range(rows), index=index, dtype="float64")
    close = base + 100.0
    open_ = close + 0.1
    high = close + 1.0
    low = close - 1.0
    volume = base + 10.0
    quote_volume = volume * close
    return pd.DataFrame({
        "open": open_,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
        "quote_volume": quote_volume,
    })


@pytest.mark.parametrize("indicator, rows", [
    (TvTrendCloud(), 240),
    (KDJ(), 120),
])
def test_indicator_does_not_mutate_input(indicator, rows):
    """输入不变更：指标计算不得修改原始 K 线数据"""
    df = _make_sample_df(rows)
    original = df.copy(deep=True)

    indicator.compute(df, "BTCUSDT", "5m")

    pd.testing.assert_frame_equal(df, original, check_exact=True)
