"""VPVR排行生成器 - 完整复刻原代码"""
import pandas as pd
from dataclasses import dataclass
from typing import List
from ..base import Indicator, IndicatorMeta, register


@dataclass(slots=True)
class 成交密度桶:
    下沿价格: float
    上沿价格: float
    总成交量: float = 0.0
    主动买量: float = 0.0
    主动卖量: float = 0.0

    @property
    def 中心价格(self) -> float:
        return (self.下沿价格 + self.上沿价格) / 2


def _钳制比例(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _提取节点(桶集合: List[成交密度桶], 条件) -> tuple:
    return tuple(桶.中心价格 for 桶 in 桶集合 if 条件(桶))


def _计算价值区(桶集合: List[成交密度桶], 控制点索引: int, 覆盖目标: float, 总成交量: float):
    left = right = 控制点索引
    当前覆盖 = 桶集合[控制点索引].总成交量 / 总成交量
    while 当前覆盖 < 覆盖目标 and (left > 0 or right < len(桶集合) - 1):
        左值 = 桶集合[left - 1].总成交量 if left > 0 else -1
        右值 = 桶集合[right + 1].总成交量 if right < len(桶集合) - 1 else -1
        if 左值 >= 右值 and left > 0:
            left -= 1
            当前覆盖 += 左值 / 总成交量
        elif right < len(桶集合) - 1:
            right += 1
            当前覆盖 += 右值 / 总成交量
        else:
            break
    return 桶集合[left].下沿价格, 桶集合[right].上沿价格, 当前覆盖


@register
class VPVR(Indicator):
    meta = IndicatorMeta(name="VPVR排行生成器.py", lookback=200, is_incremental=False, min_data=5)

    def compute(self, df: pd.DataFrame, symbol: str, interval: str) -> pd.DataFrame:
        桶数量 = 48
        价值区占比 = 0.7
        高节点系数 = 0.7
        低节点系数 = 0.25

        if not self._check_data(df):
            return self._make_insufficient_result(df, symbol, interval, {"控制点价格": None})

        价格下限 = float(df["low"].min())
        价格上限 = float(df["high"].max())
        if 价格上限 <= 价格下限:
            调整 = max(价格下限 * 0.001, 1e-6)
            价格上限 += 调整
            价格下限 -= 调整

        桶宽 = (价格上限 - 价格下限) / 桶数量
        桶集合: List[成交密度桶] = [
            成交密度桶(价格下限 + i * 桶宽, 价格下限 + (i + 1) * 桶宽) for i in range(桶数量)
        ]

        总成交量 = 0.0
        for _, row in df.iterrows():
            成交量 = float(row.get("volume", 0.0) or 0.0)
            if 成交量 <= 0:
                continue
            主动买 = float(row.get("taker_buy_volume", 成交量 * 0.5) or 成交量 * 0.5)
            主动卖 = max(成交量 - 主动买, 0.0)
            典型价 = (row["high"] + row["low"] + row["close"]) / 3
            相对 = (典型价 - 价格下限) / (价格上限 - 价格下限)
            索引 = min(max(int(相对 * 桶数量), 0), 桶数量 - 1)
            桶 = 桶集合[索引]
            桶.总成交量 += 成交量
            桶.主动买量 += 主动买
            桶.主动卖量 += 主动卖
            总成交量 += 成交量

        if 总成交量 <= 0:
            return self._make_insufficient_result(df, symbol, interval, {"控制点价格": None})

        控制点索引 = max(range(桶数量), key=lambda i: 桶集合[i].总成交量)
        控制点桶 = 桶集合[控制点索引]
        价值区下沿, 价值区上沿, 覆盖率 = _计算价值区(
            桶集合, 控制点索引, _钳制比例(价值区占比, 0.1, 0.95), 总成交量
        )
        高阈值 = 控制点桶.总成交量 * max(高节点系数, 0.1)
        低阈值 = 控制点桶.总成交量 * max(min(低节点系数, 高节点系数), 0.05)
        高节点 = _提取节点(桶集合, lambda 桶: 桶.总成交量 >= 高阈值)
        低节点 = _提取节点(桶集合, lambda 桶: 0 < 桶.总成交量 <= 低阈值)

        last_price = float(df["close"].iloc[-1])
        if last_price > 价值区上沿:
            价值区位置 = "价值区上方"
        elif last_price < 价值区下沿:
            价值区位置 = "价值区下方"
        else:
            价值区位置 = "价值区内"

        return self._make_result(df, symbol, interval, {
            "VPVR价格": round(控制点桶.中心价格, 6),
            "成交量分布": round(控制点桶.总成交量, 2),
            "价值区下沿": round(价值区下沿, 6),
            "价值区上沿": round(价值区上沿, 6),
            "价值区宽度": round(价值区上沿 - 价值区下沿, 6),
            "价值区宽度百分比": round((价值区上沿 - 价值区下沿) / 控制点桶.中心价格 * 100, 4) if 控制点桶.中心价格 else 0,
            "价值区覆盖率": round(覆盖率 * 100, 2),
            "高成交节点": ",".join(str(round(p, 2)) for p in 高节点),
            "低成交节点": ",".join(str(round(p, 2)) for p in 低节点),
            "价值区位置": 价值区位置,
        })


# ============ 可视化专用方法 ============

def compute_vpvr_distribution(df: pd.DataFrame, bins: int = 48) -> dict:
    """
    计算 VPVR 成交量分布，供可视化使用。
    
    Args:
        df: K线数据，需包含 high, low, close, volume 列
        bins: 价格分桶数量，默认 48（与指标计算一致）
    
    Returns:
        {
            "bin_centers": [价格中心点列表],
            "volumes": [对应成交量列表],
            "poc_price": 控制点价格,
            "poc_volume": 控制点成交量,
            "va_low": 价值区下沿,
            "va_high": 价值区上沿,
            "ohlc": {"open": x, "high": x, "low": x, "close": x}
        }
    """
    if df is None or len(df) < 5:
        return None
    
    价格下限 = float(df["low"].min())
    价格上限 = float(df["high"].max())
    if 价格上限 <= 价格下限:
        调整 = max(价格下限 * 0.001, 1e-6)
        价格上限 += 调整
        价格下限 -= 调整
    
    桶宽 = (价格上限 - 价格下限) / bins
    桶集合: List[成交密度桶] = [
        成交密度桶(价格下限 + i * 桶宽, 价格下限 + (i + 1) * 桶宽) for i in range(bins)
    ]
    
    总成交量 = 0.0
    for _, row in df.iterrows():
        成交量 = float(row.get("volume", 0.0) or 0.0)
        if 成交量 <= 0:
            continue
        典型价 = (row["high"] + row["low"] + row["close"]) / 3
        相对 = (典型价 - 价格下限) / (价格上限 - 价格下限)
        索引 = min(max(int(相对 * bins), 0), bins - 1)
        桶集合[索引].总成交量 += 成交量
        总成交量 += 成交量
    
    if 总成交量 <= 0:
        return None
    
    # 控制点
    控制点索引 = max(range(bins), key=lambda i: 桶集合[i].总成交量)
    控制点桶 = 桶集合[控制点索引]
    
    # 价值区
    价值区下沿, 价值区上沿, _ = _计算价值区(桶集合, 控制点索引, 0.7, 总成交量)
    
    # OHLC
    ohlc = {
        "open": float(df["open"].iloc[0]),
        "high": float(df["high"].max()),
        "low": float(df["low"].min()),
        "close": float(df["close"].iloc[-1]),
    }
    
    return {
        "bin_centers": [桶.中心价格 for 桶 in 桶集合],
        "volumes": [桶.总成交量 for 桶 in 桶集合],
        "poc_price": 控制点桶.中心价格,
        "poc_volume": 控制点桶.总成交量,
        "va_low": 价值区下沿,
        "va_high": 价值区上沿,
        "ohlc": ohlc,
    }


def compute_vpvr_ridge_data(
    symbol: str,
    interval: str = "1h",
    periods: int = 10,
    lookback: int = 200,
    bins: int = 48,
    db_url: str = None,
) -> dict:
    """
    计算 VPVR 山脊图数据，供可视化使用。
    
    Args:
        symbol: 交易对，如 BTCUSDT
        interval: K线周期，如 1h, 4h, 1d
        periods: 山脊周期数量
        lookback: 每个周期的 K 线数量（默认 200，与指标一致）
        bins: 价格分桶数量（默认 48）
        db_url: 数据库连接串，默认从环境变量读取
    
    Returns:
        {
            "symbol": str,
            "interval": str,
            "periods": [{
                "label": "T-0",
                "bin_centers": [...],
                "volumes": [...],
                "poc_price": float,
                "va_low": float,
                "va_high": float,
                "ohlc": {"open", "high", "low", "close"}
            }, ...]
        }
    """
    import os
    try:
        import psycopg2
    except ImportError:
        return None
    
    if db_url is None:
        db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/market_data")
    
    # interval 转分钟数
    interval_map = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "4h": 240, "1d": 1440}
    minutes = interval_map.get(interval, 60)
    
    # 每个周期需要的 1m K 线数 = lookback * interval分钟数
    candles_per_period = lookback * minutes
    total_candles = periods * candles_per_period
    
    try:
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        # 获取原始 1m K 线
        cur.execute("""
            SELECT bucket_ts, open, high, low, close, volume
            FROM market_data.candles_1m
            WHERE symbol = %s
            ORDER BY bucket_ts DESC
            LIMIT %s
        """, (symbol, total_candles))
        rows = cur.fetchall()
        conn.close()
    except Exception:
        return None
    
    if len(rows) < candles_per_period:
        return None
    
    # 按时间正序
    rows = rows[::-1]
    
    # 分割成 periods 个周期
    result_periods = []
    for i in range(periods):
        start = i * candles_per_period
        end = start + candles_per_period
        if end > len(rows):
            break
        
        chunk = rows[start:end]
        df = pd.DataFrame(chunk, columns=["bucket_ts", "open", "high", "low", "close", "volume"])
        # 转换 Decimal 为 float
        for col in ["open", "high", "low", "close", "volume"]:
            df[col] = df[col].astype(float)
        
        dist = compute_vpvr_distribution(df, bins)
        if dist:
            dist["label"] = f"T-{i}"
            result_periods.append(dist)
    
    return {
        "symbol": symbol,
        "interval": interval,
        "lookback": lookback,
        "periods": result_periods,
    }
