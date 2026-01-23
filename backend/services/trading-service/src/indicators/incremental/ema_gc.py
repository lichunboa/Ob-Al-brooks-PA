"""G，C点扫描器 - EMA7/25/99 + 趋势判定 + 带宽评分 完整复刻"""
import numpy as np
import pandas as pd
from ..base import Indicator, IndicatorMeta, register

EMA_PERIODS = (7, 25, 99)


def _trend_bias(e7: float, e25: float, e99: float, price: float) -> str:
    if any(not np.isfinite(v) for v in (e7, e25, e99, price)):
        return "未知"
    if e7 > e25 > e99:
        return "多头排列" if price >= e7 else "偏多"
    if e7 < e25 < e99:
        return "空头排列" if price <= e7 else "偏空"
    if price > e99:
        return "偏多"
    if price < e99:
        return "偏空"
    return "震荡"


def _bandwidth_score(e7: float, e25: float, e99: float, price: float, tau: float = 0.03) -> float:
    """指数压缩映射 0~100"""
    vals = [e7, e25, e99]
    if any(not np.isfinite(v) for v in vals) or not np.isfinite(price) or price == 0:
        return 0.0
    bw = (max(vals) - min(vals)) / abs(price)
    score = 100 * (1 - np.exp(-bw / max(tau, 1e-6)))
    return float(np.clip(score, 0.0, 100.0))


@register
class EmaGC(Indicator):
    meta = IndicatorMeta(name="G，C点扫描器.py", lookback=120, is_incremental=True)

    def compute(self, df: pd.DataFrame, symbol: str, interval: str) -> pd.DataFrame:
        if len(df) < 100:
            return pd.DataFrame()

        close = df["close"].astype(float)
        ema7 = close.ewm(span=7, adjust=False, min_periods=1).mean()
        ema25 = close.ewm(span=25, adjust=False, min_periods=1).mean()
        ema99 = close.ewm(span=99, adjust=False, min_periods=1).mean()

        price = float(close.iloc[-1])
        e7, e25, e99 = float(ema7.iloc[-1]), float(ema25.iloc[-1]), float(ema99.iloc[-1])

        trend = _trend_bias(e7, e25, e99, price)
        bandwidth = _bandwidth_score(e7, e25, e99, price)

        return self._make_result(df, symbol, interval, {
            "EMA7": round(e7, 6),
            "EMA25": round(e25, 6),
            "EMA99": round(e99, 6),
            "价格": price,
            "趋势方向": trend,
            "带宽评分": round(bandwidth, 2),
        })
