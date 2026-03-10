"""
模板注册与示例渲染器。

内置 4 个即用模板：
- line-basic：基础折线（示例）
- kline-basic：K 线 + 均线 + 量能
- macd: 价格 + MACD
- equity-drawdown: 权益曲线 + 回撤
"""

from __future__ import annotations

import io
import json
import logging
import math
import os
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Tuple

import matplotlib
import mplfinance as mpf
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import seaborn as sns
from pydantic import BaseModel

from .intraday import (
    render_cvd_cumulative,
    render_intraday_volatility,
    render_intraday_volume_heatmap,
    render_long_short_ratio,
    render_oi_change,
    render_taker_ratio_heatmap,
)
from .vpvr import (
    render_bb_zone_strip,
    render_market_vpvr_heat,
    render_vpvr_ridge,
    render_vpvr_zone_strip,
)

# 使用无界面后端，避免服务器缺乏显示设备时报错
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

logger = logging.getLogger(__name__)


RenderFn = Callable[[Dict, str], Tuple[object, str]]


class TemplateMeta(BaseModel):
    """模板元信息，用于对外展示与路由校验。"""

    template_id: str
    name: str
    description: str
    outputs: List[str]
    params: List[str]
    sample: Dict


class TemplateRegistry:
    """简单的内存模板注册表。"""

    def __init__(self) -> None:
        self._templates: Dict[str, Tuple[TemplateMeta, RenderFn]] = {}

    def register(self, meta: TemplateMeta, render_fn: RenderFn) -> None:
        if meta.template_id in self._templates:
            raise ValueError(f"模板重复注册: {meta.template_id}")
        self._templates[meta.template_id] = (meta, render_fn)
        logger.info("已注册模板: %s", meta.template_id)

    def list(self) -> Iterable[TemplateMeta]:
        return (meta for meta, _ in self._templates.values())

    def get(self, template_id: str) -> Tuple[TemplateMeta, RenderFn] | None:
        return self._templates.get(template_id)


def render_line_basic(params: Dict, output: str) -> Tuple[object, str]:
    """
    基础折线图模板。

    输入参数：
    - series: 数值列表，必填
    - title: 图表标题，可选
    """

    series = params.get("series")
    if not series:
        raise ValueError("缺少参数 series（数值列表）")

    title = params.get("title", "Line Chart")
    df = pd.DataFrame({"y": series})
    df["x"] = df.index

    if output == "json":
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=df["x"], y=df["y"], mode="lines+markers", name="series"))
        fig.update_layout(title=title, template="plotly_white")
        return fig.to_dict(), "application/json"

    # 默认输出 PNG
    sns.set_theme(style="whitegrid")
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.plot(df["x"], df["y"], color="#2563eb", linewidth=1.8)
    ax.scatter(df["x"], df["y"], color="#1d4ed8", s=10)
    ax.set_title(title)
    ax.set_xlabel("index")
    ax.set_ylabel("value")
    fig.tight_layout()

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    return buffer.read(), "image/png"


def _fig_to_png(fig) -> bytes:
    """通用 PNG 导出。"""

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    return buffer.read()


def render_kline_basic(params: Dict, output: str) -> Tuple[object, str]:
    """
    基础 K 线图（含均线、量能）。

    必填：
    - open, high, low, close: 等长数列
    可选：
    - volume: 数列
    - ma_periods: 均线周期列表（默认 [7, 25]）
    - title: 标题
    - timestamps: 时间戳字符串数组（可选，长度一致则用于 X 轴）
    """

    required = ["open", "high", "low", "close"]
    for key in required:
        if key not in params:
            raise ValueError(f"缺少参数 {key}")

    df = pd.DataFrame(
        {
            "Open": params["open"],
            "High": params["high"],
            "Low": params["low"],
            "Close": params["close"],
        }
    )

    if "volume" in params:
        df["Volume"] = params["volume"]

    if "timestamps" in params and len(params["timestamps"]) == len(df):
        df.index = pd.to_datetime(params["timestamps"])
    else:
        df.index = pd.RangeIndex(len(df))

    ma_periods = params.get("ma_periods", [7, 25])
    title = params.get("title", "Kline")

    if output == "json":
        fig = go.Figure(
            data=[
                go.Candlestick(
                    x=df.index,
                    open=df["Open"],
                    high=df["High"],
                    low=df["Low"],
                    close=df["Close"],
                    name="Kline",
                )
            ]
        )
        for period in ma_periods:
            if period < len(df):
                fig.add_trace(
                    go.Scatter(
                        x=df.index,
                        y=df["Close"].rolling(period).mean(),
                        mode="lines",
                        name=f"MA{period}",
                    )
                )
        if "Volume" in df:
            fig.add_trace(
                go.Bar(x=df.index, y=df["Volume"], name="Volume", yaxis="y2", opacity=0.3)
            )
            fig.update_layout(
                yaxis2=dict(overlaying="y", side="right", showgrid=False, title="Volume")
            )
        fig.update_layout(title=title, template="plotly_white")
        return fig.to_dict(), "application/json"

    mpf_kwargs = {
        "type": "candle",
        "style": "yahoo",
        "mav": [p for p in ma_periods if p < len(df)],
        "volume": "Volume" in df.columns,
        "title": title,
        "returnfig": True,
        "figratio": (16, 9),
        "figscale": 1.1,
    }
    fig, _ = mpf.plot(df, **mpf_kwargs)
    return _fig_to_png(fig), "image/png"


def render_kline_trade(params: Dict, output: str) -> Tuple[object, str]:
    """
    交易标注 K 线图 - 用于订单完成后的可视化复盘。

    必填：
    - symbol: 交易对 (如 BTCUSDT)
    - interval: K 线周期 (如 5m, 15m, 1h)
    - entry_time: 入场时间戳 (毫秒或 ISO 格式)
    - entry_price: 入场价格
    - exit_time: 出场时间戳
    - exit_price: 出场价格

    可选：
    - direction: BUY/SELL (默认 BUY)
    - signal_type: 信号类型 (如 "H2 突破")
    - signal_strength: 信号强度 (0-100)
    - patterns: 形态列表 (如 ["H2", "Wedge"])
    - lookback: 显示的 K 线根数 (默认 50)
    - title: 图表标题
    """
    from core.settings import get_pg_pool, get_settings

    # 参数提取
    symbol = params.get("symbol")
    interval = params.get("interval", "15m")
    entry_time = params.get("entry_time")
    entry_price = float(params.get("entry_price", 0))
    exit_time = params.get("exit_time")
    exit_price = float(params.get("exit_price", 0))
    direction = params.get("direction", "BUY")
    signal_type = params.get("signal_type", "")
    signal_strength = params.get("signal_strength")
    patterns = params.get("patterns", [])
    lookback = int(params.get("lookback", 50))
    title = params.get("title")

    if not symbol:
        raise ValueError("缺少参数 symbol")
    if not entry_time or not exit_time:
        raise ValueError("缺少参数 entry_time 或 exit_time")

    # 时间戳转换
    def parse_timestamp(ts):
        if isinstance(ts, (int, float)):
            return datetime.fromtimestamp(ts / 1000 if ts > 1e10 else ts, tz=timezone.utc)
        return pd.to_datetime(ts).tz_localize(timezone.utc) if pd.to_datetime(ts).tzinfo is None else pd.to_datetime(ts)

    entry_dt = parse_timestamp(entry_time)
    exit_dt = parse_timestamp(exit_time)

    # 从数据库获取 K 线数据
    interval_norm = _normalize_interval(interval)
    table = _interval_table(interval_norm)
    exchange = params.get("exchange", "binance_futures_um")

    # 计算时间窗口：入场前 lookback/2 根到出场后 lookback/4 根
    interval_seconds = _interval_seconds(interval_norm)
    start_time = entry_dt - pd.Timedelta(seconds=interval_seconds * (lookback // 2))
    end_time = exit_dt + pd.Timedelta(seconds=interval_seconds * (lookback // 4))

    settings = get_settings()
    if not settings.database_url:
        raise ValueError("未配置 DATABASE_URL")

    with get_pg_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT bucket_ts, open, high, low, close, volume
                FROM market_data.{table}
                WHERE symbol = %s
                  AND exchange = %s
                  AND bucket_ts >= %s
                  AND bucket_ts <= %s
                ORDER BY bucket_ts ASC
                """,
                (symbol.upper(), exchange, start_time, end_time),
            )
            rows = cur.fetchall()

    if not rows:
        raise ValueError(f"无可用数据: {symbol} {interval_norm}")

    # 构建 DataFrame
    df = pd.DataFrame(rows, columns=["bucket_ts", "Open", "High", "Low", "Close", "Volume"])
    df.set_index("bucket_ts", inplace=True)
    df.index = pd.DatetimeIndex(df.index)

    # 找到入场和出场的 K 线索引
    entry_idx = df.index.get_indexer([entry_dt], method="nearest")[0]
    exit_idx = df.index.get_indexer([exit_dt], method="nearest")[0]

    # 默认标题
    if not title:
        pnl = ((exit_price - entry_price) / entry_price * 100) if direction == "BUY" else ((entry_price - exit_price) / entry_price * 100)
        pnl_str = f"+{pnl:.2f}%" if pnl >= 0 else f"{pnl:.2f}%"
        title = f"{symbol} {interval} | {direction} {pnl_str}"
        if signal_type:
            title += f" | {signal_type}"

    # 构建标注点
    # 入场点：绿色向上箭头(BUY) 或 红色向下箭头(SELL)
    entry_markers = [np.nan] * len(df)
    exit_markers = [np.nan] * len(df)

    if 0 <= entry_idx < len(df):
        entry_markers[entry_idx] = df["Low"].iloc[entry_idx] * 0.998 if direction == "BUY" else df["High"].iloc[entry_idx] * 1.002
    if 0 <= exit_idx < len(df):
        exit_markers[exit_idx] = df["High"].iloc[exit_idx] * 1.002 if direction == "BUY" else df["Low"].iloc[exit_idx] * 0.998

    # 添加信号标注
    signal_markers = [np.nan] * len(df)
    if signal_strength and signal_strength >= 70 and 0 <= entry_idx < len(df):
        # 信号标注在入场点上方
        signal_markers[entry_idx] = df["High"].iloc[entry_idx] * 1.005

    # mplfinance 附加绘图
    addplots = []

    # 入场标注
    entry_color = "#22c55e" if direction == "BUY" else "#ef4444"
    addplots.append(mpf.make_addplot(
        entry_markers, type="scatter", markersize=150,
        marker="^" if direction == "BUY" else "v",
        color=entry_color, panel=0
    ))

    # 出场标注
    exit_color = "#ef4444" if direction == "BUY" else "#22c55e"
    addplots.append(mpf.make_addplot(
        exit_markers, type="scatter", markersize=150,
        marker="v" if direction == "BUY" else "^",
        color=exit_color, panel=0
    ))

    # 信号强度标注（黄色星号）
    if any(not np.isnan(x) for x in signal_markers):
        addplots.append(mpf.make_addplot(
            signal_markers, type="scatter", markersize=200,
            marker="*", color="#fbbf24", panel=0
        ))

    # 自定义样式
    mc = mpf.make_marketcolors(
        up="#22c55e", down="#ef4444",
        edge="inherit", wick="inherit",
        volume={"up": "#22c55e", "down": "#ef4444"}
    )
    style = mpf.make_mpf_style(
        marketcolors=mc,
        gridstyle=":",
        gridcolor="#e5e7eb",
        facecolor="#ffffff",
    )

    # 绘制图表
    fig, axes = mpf.plot(
        df,
        type="candle",
        style=style,
        volume=True,
        title=title,
        addplot=addplots if addplots else None,
        returnfig=True,
        figratio=(16, 9),
        figscale=1.2,
        tight_layout=True,
    )

    # 添加文字标注
    ax = axes[0]

    # 入场价格标注
    if 0 <= entry_idx < len(df):
        ax.annotate(
            f"入场 {entry_price:.2f}",
            xy=(entry_idx, entry_price),
            xytext=(entry_idx + 2, entry_price),
            fontsize=9,
            color=entry_color,
            fontweight="bold",
            ha="left",
            va="center",
            bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor=entry_color, alpha=0.8),
        )

    # 出场价格标注
    if 0 <= exit_idx < len(df):
        ax.annotate(
            f"出场 {exit_price:.2f}",
            xy=(exit_idx, exit_price),
            xytext=(exit_idx + 2, exit_price),
            fontsize=9,
            color=exit_color,
            fontweight="bold",
            ha="left",
            va="center",
            bbox=dict(boxstyle="round,pad=0.3", facecolor="white", edgecolor=exit_color, alpha=0.8),
        )

    # 形态标注
    if patterns and 0 <= entry_idx < len(df):
        pattern_text = " ".join(patterns[:3])  # 最多显示 3 个形态
        ax.annotate(
            f"📐 {pattern_text}",
            xy=(entry_idx, df["High"].iloc[entry_idx]),
            xytext=(entry_idx, df["High"].iloc[entry_idx] * 1.01),
            fontsize=8,
            color="#6366f1",
            ha="center",
            va="bottom",
        )

    # 信号强度标注
    if signal_strength and 0 <= entry_idx < len(df):
        ax.annotate(
            f"⚡{signal_strength}",
            xy=(entry_idx, df["High"].iloc[entry_idx] * 1.008),
            fontsize=8,
            color="#f59e0b",
            fontweight="bold",
            ha="center",
            va="bottom",
        )

    return _fig_to_png(fig), "image/png"


# ==================== 多周期K线包络（复用外部模板） ====================
_INTERVAL_PATTERN = re.compile(r"^(\d+)([smhdwM])$")
_INTERVAL_UNIT_SECONDS = {"s": 1, "m": 60, "h": 3600, "d": 86400, "w": 604800, "M": 2592000}
_ALLOWED_INTERVALS = {
    "1m", "3m", "5m", "15m", "30m",
    "1h", "2h", "4h", "6h", "8h", "12h",
    "1d", "3d", "1w", "1M",
}
_DEFAULT_RANGE_DAYS = 30


def _parse_range_days(val: object) -> int | None:
    """解析 range 参数，支持 '30d'/'7'/'90D' 等。"""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return int(val)
    text = str(val).strip().lower()
    if text.endswith("d"):
        text = text[:-1]
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def _select_intervals_by_span(span_ms: int) -> List[str]:
    """根据时间跨度选择可视周期层级（LOD）。"""
    days = max(span_ms / 86400000, 0.0)
    if days > 180:
        return ["1d", "4h"]
    if days > 60:
        return ["1d", "4h", "1h"]
    if days > 14:
        return ["4h", "1h", "15m"]
    if days > 3:
        return ["1h", "15m", "5m"]
    return ["15m", "5m", "1m"]


def _normalize_interval(interval: str) -> str:
    """标准化周期字符串，并确保在允许列表内。"""
    match = _INTERVAL_PATTERN.match(str(interval).strip())
    if not match:
        raise ValueError(f"无效周期: {interval}")
    value, unit = match.groups()
    value = int(value)
    if unit == "M":
        normalized = f"{value}M"
    else:
        normalized = f"{value}{unit.lower()}"
    if normalized not in _ALLOWED_INTERVALS:
        raise ValueError(f"不支持的周期: {normalized}")
    return normalized


def _interval_seconds(interval: str) -> int:
    """返回周期秒数。"""
    match = _INTERVAL_PATTERN.match(interval)
    if not match:
        raise ValueError(f"无效周期: {interval}")
    value, unit = match.groups()
    return int(value) * _INTERVAL_UNIT_SECONDS[unit]


def _interval_table(interval: str) -> str:
    """周期到视图表名映射。"""
    if interval.endswith("M"):
        return '"candles_1M"'
    return f"candles_{interval}"


@lru_cache(maxsize=2)
def _load_envelope_template() -> str:
    """加载外部包络可视化 HTML 模板（原样复用）。"""
    template_path = Path(__file__).resolve().parents[4] / "libs" / "external" / "Financial-Fractal-KLine-main" / "multi_period_kline_static.html"
    if not template_path.exists():
        raise ValueError(f"未找到模板文件: {template_path}")
    return template_path.read_text(encoding="utf-8")


def _replace_embedded_payload(html: str, payload: Dict, title: str | None = None, lead: str | None = None) -> str:
    """将 payload 注入模板中的 embedded-klines 节点。"""
    payload_json = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    html = re.sub(
        r'(<script type="application/json" id="embedded-klines">)(.*?)(</script>)',
        rf"\1{payload_json}\3",
        html,
        flags=re.S,
    )
    if title:
        html = re.sub(r"(<h1>)(.*?)(</h1>)", rf"\1{title}\3", html, count=1, flags=re.S)
    if lead:
        html = re.sub(r'(<p class="lead">)(.*?)(</p>)', rf"\1{lead}\3", html, count=1, flags=re.S)
    return html


def _fetch_multi_interval_klines(params: Dict) -> Dict:
    """按时间窗口逐周期查询 TimescaleDB，构造包络可视化数据。"""
    from core.settings import get_pg_pool, get_settings
    import psycopg

    symbol = params.get("symbol")
    if not symbol:
        raise ValueError("缺少参数 symbol")
    symbol = str(symbol).upper()

    exchange = params.get("exchange") or os.environ.get("BINANCE_WS_DB_EXCHANGE") or os.environ.get("DB_EXCHANGE") or "binance_futures_um"
    intervals_param = params.get("intervals")

    if intervals_param and str(intervals_param).strip().lower() != "auto":
        if isinstance(intervals_param, str):
            intervals = [s.strip() for s in intervals_param.split(",") if s.strip()]
        else:
            intervals = list(intervals_param)
    else:
        intervals = []

    limit = int(params.get("limit", 500))
    if limit <= 0:
        raise ValueError("limit 必须 > 0")

    end_ms = params.get("end_time") or params.get("endTime")
    start_ms = params.get("start_time") or params.get("startTime")
    range_days = _parse_range_days(params.get("range_days") or params.get("rangeDays") or params.get("range"))

    settings = get_settings()
    if not settings.database_url:
        raise ValueError("未配置 DATABASE_URL / VIS_SERVICE_DATABASE_URL")

    with get_pg_pool().connection() as conn:
        if end_ms is None:
            with conn.cursor() as cur:
                candidates = []
                if intervals:
                    candidates = list(intervals)
                else:
                    candidates = ["1m", "5m", "15m", "1h", "4h", "1d"]
                resolved_base = None
                for interval in candidates:
                    table = _interval_table(interval)
                    try:
                        cur.execute(
                            f"SELECT MAX(bucket_ts) FROM market_data.{table} WHERE symbol = %s AND exchange = %s",
                            (symbol, exchange),
                        )
                        row = cur.fetchone()
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("读取 %s 失败: %s", table, exc)
                        continue
                    if row and row[0] is not None:
                        end_ms = int(row[0].timestamp() * 1000)
                        resolved_base = interval
                        break
                if end_ms is None:
                    if "1m" not in candidates:
                        table = _interval_table("1m")
                        try:
                            cur.execute(
                                f"SELECT MAX(bucket_ts) FROM market_data.{table} WHERE symbol = %s AND exchange = %s",
                                (symbol, exchange),
                            )
                            row = cur.fetchone()
                            if row and row[0] is not None:
                                end_ms = int(row[0].timestamp() * 1000)
                                resolved_base = "1m"
                        except Exception as exc:  # noqa: BLE001
                            logger.warning("读取 %s 失败: %s", table, exc)
                    if end_ms is None:
                        raise ValueError(f"无可用数据: {symbol} {exchange} ({','.join(candidates)})")
                if resolved_base:
                    base_interval = resolved_base

        if start_ms is None:
            if range_days is None:
                range_days = _DEFAULT_RANGE_DAYS
            start_ms = int(end_ms - (range_days * 86400000))

        if start_ms > end_ms:
            start_ms, end_ms = end_ms, start_ms

        span_ms = end_ms - start_ms

        if not intervals:
            intervals = _select_intervals_by_span(span_ms)

        intervals = [_normalize_interval(iv) for iv in intervals]
        if not intervals:
            raise ValueError("intervals 为空")

        base_interval = params.get("base_interval")
        if base_interval:
            base_interval = _normalize_interval(base_interval)
            if base_interval not in intervals:
                intervals.insert(0, base_interval)
        base_interval = base_interval or min(intervals, key=_interval_seconds)

        payload = {
            "symbol": symbol,
            "exchange": exchange,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
            "source": "TimescaleDB",
            "intervals": intervals,
            "klines": {},
        }

        has_any = False
        for interval in intervals:
            table = _interval_table(interval)
            interval_ms = _interval_seconds(interval) * 1000
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        f"""
                        SELECT bucket_ts, open, high, low, close, volume
                        FROM market_data.{table}
                        WHERE symbol = %s
                          AND exchange = %s
                          AND bucket_ts >= to_timestamp(%s / 1000.0)
                          AND bucket_ts <= to_timestamp(%s / 1000.0)
                        ORDER BY bucket_ts ASC
                        """,
                        (symbol, exchange, start_ms, end_ms),
                    )
                    rows = cur.fetchall()
            except Exception as exc:  # noqa: BLE001
                logger.warning("查询 %s 失败: %s", table, exc)
                rows = []

            series = []
            for bucket_ts, open_v, high_v, low_v, close_v, volume_v in rows:
                open_time = int(bucket_ts.timestamp() * 1000)
                series.append(
                    {
                        "openTime": open_time,
                        "open": float(open_v),
                        "high": float(high_v),
                        "low": float(low_v),
                        "close": float(close_v),
                        "volume": float(volume_v) if volume_v is not None else 0.0,
                        "closeTime": int(open_time + interval_ms - 1),
                    }
                )

            payload["klines"][interval] = series
            if series:
                has_any = True

    if not has_any:
        raise ValueError(f"无可用数据: {symbol} {exchange} ({','.join(intervals)})")

    return payload


def render_kline_envelope(params: Dict, output: str) -> Tuple[object, str]:
    """
    多周期 K 线包络（复用 Financial-Fractal-KLine 的前端逻辑）。

    必填：
    - symbol: 交易对

    可选：
    - intervals: 周期列表或逗号分隔字符串（默认 5m,1h,4h,1d）
    - base_interval: 用于计算窗口的基准周期
    - limit: 基准周期根数（默认 500）
    - startTime/endTime: 毫秒时间戳窗口
    - exchange: 交易所（默认 Binance）
    - title/lead: HTML 标题与说明
    """
    payload = _fetch_multi_interval_klines(params)

    if output == "json":
        return payload, "application/json"

    html = _load_envelope_template()
    title = params.get("title")
    lead = params.get("lead")
    html = _replace_embedded_payload(html, payload, title=title, lead=lead)
    return html, "text/html; charset=utf-8"


def render_macd(params: Dict, output: str) -> Tuple[object, str]:
    """
    价格 + MACD 双面板。

    必填：
    - close: 收盘价序列
    可选：
    - fast: 快线周期（默认12）
    - slow: 慢线周期（默认26）
    - signal: 信号线周期（默认9）
    - title: 标题
    """

    close = params.get("close")
    if not close:
        raise ValueError("缺少参数 close")
    fast = int(params.get("fast", 12))
    slow = int(params.get("slow", 26))
    signal = int(params.get("signal", 9))
    title = params.get("title", "MACD")

    s = pd.Series(close)
    ema_fast = s.ewm(span=fast, adjust=False).mean()
    ema_slow = s.ewm(span=slow, adjust=False).mean()
    macd_line = ema_fast - ema_slow
    signal_line = macd_line.ewm(span=signal, adjust=False).mean()
    hist = macd_line - signal_line
    x = list(range(len(s)))

    if output == "json":
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=x, y=s, mode="lines", name="Close"))
        fig.add_trace(go.Bar(x=x, y=hist, name="Hist", marker_color="rgba(99,102,241,0.5)"))
        fig.add_trace(go.Scatter(x=x, y=macd_line, mode="lines", name="MACD"))
        fig.add_trace(go.Scatter(x=x, y=signal_line, mode="lines", name="Signal"))
        fig.update_layout(title=title, template="plotly_white")
        return fig.to_dict(), "application/json"

    sns.set_theme(style="whitegrid")
    fig, axes = plt.subplots(2, 1, sharex=True, figsize=(10, 6), gridspec_kw={"height_ratios": [2, 1]})
    axes[0].plot(x, s, color="#2563eb", linewidth=1.6, label="Close")
    axes[0].set_title(title)
    axes[0].legend()

    axes[1].bar(x, hist, color="#a5b4fc", alpha=0.8, label="Hist")
    axes[1].plot(x, macd_line, color="#111827", linewidth=1.2, label="MACD")
    axes[1].plot(x, signal_line, color="#ef4444", linewidth=1.2, label="Signal")
    axes[1].legend()
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def render_equity_drawdown(params: Dict, output: str) -> Tuple[object, str]:
    """
    权益曲线 + 回撤面板。

    必填：
    - equity: 权益序列
    可选：
    - title: 标题
    - timestamps: 时间索引
    """

    equity = params.get("equity")
    if not equity:
        raise ValueError("缺少参数 equity")
    title = params.get("title", "Equity & Drawdown")

    s = pd.Series(equity)
    roll_max = s.cummax()
    drawdown = (s - roll_max) / roll_max
    x = params.get("timestamps")
    if x and len(x) == len(s):
        x_axis = pd.to_datetime(x)
    else:
        x_axis = list(range(len(s)))

    if output == "json":
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=x_axis, y=s, mode="lines", name="Equity"))
        fig.add_trace(
            go.Scatter(
                x=x_axis,
                y=drawdown,
                mode="lines",
                name="Drawdown",
                fill="tozeroy",
                fillcolor="rgba(239,68,68,0.25)",
            )
        )
        fig.update_layout(title=title, template="plotly_white")
        return fig.to_dict(), "application/json"

    sns.set_theme(style="whitegrid")
    fig, axes = plt.subplots(2, 1, sharex=True, figsize=(10, 6), gridspec_kw={"height_ratios": [2, 1]})
    axes[0].plot(x_axis, s, color="#10b981", linewidth=1.6, label="Equity")
    axes[0].set_title(title)
    axes[0].legend()

    axes[1].fill_between(x_axis, drawdown, 0, color="#fca5a5")
    axes[1].plot(x_axis, drawdown, color="#ef4444", linewidth=1.2, label="Drawdown")
    axes[1].legend()
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def register_defaults() -> TemplateRegistry:
    """注册内置模板，并返回注册表实例。"""

    registry = TemplateRegistry()
    registry.register(
        TemplateMeta(
            template_id="line-basic",
            name="基础折线图",
            description="示例模板：输入一组数值，输出基础折线图（PNG 或 plotly JSON）。",
            outputs=["png", "json"],
            params=["series(list[float])", "title?"],
            sample={"template_id": "line-basic", "output": "png", "params": {"series": [1, 3, 2, 5, 4]}},
        ),
        render_line_basic,
    )
    registry.register(
        TemplateMeta(
            template_id="kline-basic",
            name="K线+均线+量能",
            description="金融行情图：OHLC 必填，均线周期可选，支持量能",
            outputs=["png", "json"],
            params=[
                "open(list[float])",
                "high(list[float])",
                "low(list[float])",
                "close(list[float])",
                "volume?(list[float])",
                "ma_periods?(list[int])",
                "timestamps?(list[str])",
                "title?",
            ],
            sample={
                "template_id": "kline-basic",
                "output": "png",
                "params": {
                    "open": [10, 11, 12, 12.5, 12.2],
                    "high": [11, 12, 12.6, 13, 12.8],
                    "low": [9.8, 10.5, 11.5, 12, 12],
                    "close": [10.5, 11.8, 12.3, 12.7, 12.1],
                    "volume": [100, 120, 130, 90, 110],
                    "ma_periods": [3],
                    "title": "示例K线",
                },
            },
        ),
        render_kline_basic,
    )
    registry.register(
        TemplateMeta(
            template_id="kline-envelope",
            name="多周期K线包络",
            description="复用 Financial-Fractal-KLine 的多周期包络可视化（HTML/JSON）",
            outputs=["html", "json"],
            params=[
                "symbol(str)",
                "intervals?(list[str] | str)",
                "base_interval?(str)",
                "limit?(int)",
                "startTime?(int)",
                "endTime?(int)",
                "exchange?(str)",
                "title?(str)",
                "lead?(str)",
            ],
            sample={
                "template_id": "kline-envelope",
                "output": "html",
                "params": {
                    "symbol": "BTCUSDT",
                    "intervals": ["5m", "1h", "4h", "1d"],
                    "limit": 500,
                },
            },
        ),
        render_kline_envelope,
    )
    registry.register(
        TemplateMeta(
            template_id="macd",
            name="价格 + MACD",
            description="双面板显示收盘价与 MACD/Signal/Hist",
            outputs=["png", "json"],
            params=["close(list[float])", "fast?(int)", "slow?(int)", "signal?(int)", "title?"],
            sample={
                "template_id": "macd",
                "output": "png",
                "params": {"close": [1, 2, 3, 2.5, 3.2, 3.8, 3.5], "title": "示例MACD"},
            },
        ),
        render_macd,
    )
    registry.register(
        TemplateMeta(
            template_id="equity-drawdown",
            name="权益+回撤",
            description="上方权益曲线，下方回撤百分比阴影",
            outputs=["png", "json"],
            params=["equity(list[float])", "timestamps?(list[str])", "title?"],
            sample={
                "template_id": "equity-drawdown",
                "output": "png",
                "params": {"equity": [100, 105, 103, 110, 107, 120]},
            },
        ),
        render_equity_drawdown,
    )
    registry.register(
        TemplateMeta(
            template_id="market-vpvr-heat",
            name="全市场 VPVR 热力图",
            description="价格分桶的成交量占比热力图，X=价格区间，Y=币种",
            outputs=["png", "json"],
            params=[
                "data(list[ {symbol, price|close: list, volume|volumes: list} ])",
                "bins?(int, default 40)",
                "bin_mode?(percentile|relative)",
                "top_n?(int)",
                "scale?(linear|log)",
                "title?",
            ],
            sample={
                "template_id": "market-vpvr-heat",
                "output": "png",
                "params": {
                    "bins": 20,
                    "data": [
                        {"symbol": "BTCUSDT", "close": [100, 101, 102, 101.5], "volume": [10, 12, 9, 11]},
                        {"symbol": "ETHUSDT", "close": [50, 51, 50.5, 52], "volume": [8, 9, 7, 10]},
                    ],
                },
            },
        ),
        render_market_vpvr_heat,
    )
    registry.register(
        TemplateMeta(
            template_id="vpvr-zone-strip",
            name="VPVR 条带散点",
            description="按价值区位置分布，使用 adjustText 自动防重叠，支持涨跌/量比着色",
            outputs=["png", "json"],
            params=[
                "data(list[{symbol, price, value_area_low, value_area_high, price_change?, volume_change?}])",
                "bands?(int, default 5)",
                "title?",
            ],
            sample={
                "template_id": "vpvr-zone-strip",
                "output": "png",
                "params": {
                    "bands": 5,
                    "data": [
                        {"symbol": "ETHUSDT", "price": 1620, "value_area_low": 1500, "value_area_high": 1700, "price_change": 0.03},
                        {"symbol": "BTCUSDT", "price": 34500, "value_area_low": 33000, "value_area_high": 36000, "price_change": -0.05},
                        {"symbol": "SOLUSDT", "price": 135, "value_area_low": 120, "value_area_high": 140, "volume_change": 2.0},
                    ],
                },
            },
        ),
        render_vpvr_zone_strip,
    )
    registry.register(
        TemplateMeta(
            template_id="vpvr-ridge",
            name="VPVR 山脊图",
            description="展示成交量分布随时间演变，支持 OHLC 价格线叠加",
            outputs=["png", "json"],
            params=[
                "symbol(str)",
                "interval?(str, default 1h)",
                "periods?(int, default 10)",
                "lookback?(int, default 200)",
                "bins?(int, default 48)",
                "overlap?(float, default 0.5)",
                "colormap?(str, default viridis)",
                "show_ohlc?(bool, default True)",
                "title?",
            ],
            sample={
                "template_id": "vpvr-ridge",
                "output": "png",
                "params": {
                    "symbol": "BTCUSDT",
                    "interval": "1h",
                    "periods": 10,
                    "show_ohlc": True,
                },
            },
        ),
        render_vpvr_ridge,
    )
    registry.register(
        TemplateMeta(
            template_id="bb-zone-strip",
            name="布林带分布图",
            description="全市场布林带 %B 位置分布，展示各币种在布林带中的相对位置（超买/超卖）",
            outputs=["png", "json"],
            params=[
                "data(list[{symbol, percent_b, bandwidth?, price_change?, volume?}])",
                "bands?(int, default 5)",
                "title?",
            ],
            sample={
                "template_id": "bb-zone-strip",
                "output": "png",
                "params": {
                    "bands": 5,
                    "data": [
                        {"symbol": "BTCUSDT", "percent_b": 0.85, "bandwidth": 15.5, "price_change": 0.02},
                        {"symbol": "ETHUSDT", "percent_b": 0.45, "bandwidth": 20.3, "price_change": -0.01},
                        {"symbol": "SOLUSDT", "percent_b": 0.12, "bandwidth": 25.8, "price_change": -0.03},
                    ],
                },
            },
        ),
        render_bb_zone_strip,
    )
    # 日内分析图表
    registry.register(
        TemplateMeta(
            template_id="intraday-volume-heatmap",
            name="日内成交量热力图",
            description="展示各币种在24小时内的成交量分布，识别活跃交易时段",
            outputs=["png", "json"],
            params=["data(list[{symbol, hour, volume}])", "top_n?(int, default 30)", "normalize?(row/all/none)", "title?"],
            sample={"template_id": "intraday-volume-heatmap", "output": "png",
                    "params": {"top_n": 10, "data": [{"symbol": "BTCUSDT", "hour": 0, "volume": 1000},
                                                     {"symbol": "BTCUSDT", "hour": 8, "volume": 2500}]}},
        ),
        render_intraday_volume_heatmap,
    )
    registry.register(
        TemplateMeta(
            template_id="intraday-volatility",
            name="日内波动率曲线",
            description="展示24小时内各时段的平均波动率，识别最佳交易时段",
            outputs=["png", "json"],
            params=["data(list[{hour, volatility, volume?}])", "symbol?(str)", "show_volume?(bool)", "title?"],
            sample={"template_id": "intraday-volatility", "output": "png",
                    "params": {"symbol": "BTCUSDT", "data": [{"hour": 0, "volatility": 0.5}, {"hour": 8, "volatility": 1.2}]}},
        ),
        render_intraday_volatility,
    )
    registry.register(
        TemplateMeta(
            template_id="taker-ratio-heatmap",
            name="主动买卖比热力图",
            description="展示各币种各时段的主动买入占比，蓝色=买压，红色=卖压",
            outputs=["png", "json"],
            params=["data(list[{symbol, hour, taker_buy_ratio}])", "top_n?(int, default 30)", "title?"],
            sample={"template_id": "taker-ratio-heatmap", "output": "png",
                    "params": {"data": [{"symbol": "BTCUSDT", "hour": 0, "taker_buy_ratio": 0.55}]}},
        ),
        render_taker_ratio_heatmap,
    )
    registry.register(
        TemplateMeta(
            template_id="long-short-ratio",
            name="多空比时序图",
            description="展示大户/散户/主动成交三线多空比变化",
            outputs=["png", "json"],
            params=["data(list[{time, top_trader_ratio?, global_ratio?, taker_ratio?}])", "symbol?(str)", "title?"],
            sample={"template_id": "long-short-ratio", "output": "png",
                    "params": {"symbol": "BTCUSDT", "data": [{"time": "2024-01-01 00:00", "top_trader_ratio": 1.2, "global_ratio": 1.1}]}},
        ),
        render_long_short_ratio,
    )
    registry.register(
        TemplateMeta(
            template_id="cvd-cumulative",
            name="CVD累计图",
            description="累计成交量差 (Cumulative Volume Delta)，判断多空主导力量",
            outputs=["png", "json"],
            params=["data(list[{time, cvd, price?}])", "symbol?(str)", "show_price?(bool)", "title?"],
            sample={"template_id": "cvd-cumulative", "output": "png",
                    "params": {"symbol": "BTCUSDT", "data": [{"time": "2024-01-01 00:00", "cvd": 100}, {"time": "2024-01-01 01:00", "cvd": 250}]}},
        ),
        render_cvd_cumulative,
    )
    registry.register(
        TemplateMeta(
            template_id="oi-change",
            name="持仓量变化图",
            description="展示持仓量 (Open Interest) 随时间变化，配合价格判断趋势强度",
            outputs=["png", "json"],
            params=["data(list[{time, oi, price?}])", "symbol?(str)", "show_price?(bool)", "title?"],
            sample={"template_id": "oi-change", "output": "png",
                    "params": {"symbol": "BTCUSDT", "data": [{"time": "2024-01-01 00:00", "oi": 50000, "price": 42000}]}},
        ),
        render_oi_change,
    )
    # 交易标注 K 线图 - 用于订单完成后的可视化复盘
    registry.register(
        TemplateMeta(
            template_id="kline-trade",
            name="交易复盘图",
            description="带入场/出场/信号/形态标注的 K 线图，用于可视化交易复盘",
            outputs=["png"],
            params=[
                "symbol(str)", "interval(str)", 
                "entry_time(timestamp)", "entry_price(float)", 
                "exit_time(timestamp)", "exit_price(float)",
                "direction?(BUY|SELL)", "signal_type?(str)", 
                "signal_strength?(int)", "patterns?(list[str])",
                "lookback?(int, default 50)", "title?(str)"
            ],
            sample={
                "template_id": "kline-trade", 
                "output": "png",
                "params": {
                    "symbol": "BTCUSDT",
                    "interval": "15m",
                    "entry_time": 1706745600000,
                    "entry_price": 43250.5,
                    "exit_time": 1706752800000,
                    "exit_price": 43580.0,
                    "direction": "BUY",
                    "signal_type": "H2 突破",
                    "signal_strength": 85,
                    "patterns": ["H2", "Bull Flag"],
                }
            },
        ),
        render_kline_trade,
    )
    return registry
