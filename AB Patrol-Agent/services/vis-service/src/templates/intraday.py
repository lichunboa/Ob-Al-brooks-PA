"""日内热力与微结构模板。"""

from __future__ import annotations

import io
from typing import Dict, Tuple

import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns


def _fig_to_png(fig) -> bytes:
    """导出 matplotlib 图像为 PNG 字节。"""

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    return buffer.read()


def render_intraday_volume_heatmap(params: Dict, output: str) -> Tuple[object, str]:
    """日内成交量热力图。"""
    data = params.get("data")
    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表")

    df = pd.DataFrame(data)
    if not {"symbol", "hour", "volume"}.issubset(df.columns):
        raise ValueError("data 需包含 symbol, hour, volume")

    df["hour"] = df["hour"].astype(int)
    df["volume"] = df["volume"].astype(float)

    pivot = df.pivot_table(index="symbol", columns="hour", values="volume", aggfunc="sum", fill_value=0)
    for hour in range(24):
        if hour not in pivot.columns:
            pivot[hour] = 0
    pivot = pivot.reindex(columns=sorted(pivot.columns))

    top_n = int(params.get("top_n", 30))
    row_sums = pivot.sum(axis=1).sort_values(ascending=False)
    pivot = pivot.loc[row_sums.head(top_n).index]

    normalize = params.get("normalize", "row")
    if normalize == "row":
        pivot = pivot.div(pivot.max(axis=1) + 1e-10, axis=0)
    elif normalize == "all":
        pivot = pivot / (pivot.max().max() + 1e-10)

    if output == "json":
        return {
            "title": params.get("title", "Intraday Volume Heatmap"),
            "symbols": pivot.index.tolist(),
            "hours": list(range(24)),
            "values": pivot.values.tolist(),
        }, "application/json"

    fig_height = max(6, len(pivot) * 0.25)
    fig, ax = plt.subplots(figsize=(14, fig_height))
    sns.heatmap(
        pivot,
        ax=ax,
        cmap="YlOrRd",
        linewidths=0.5,
        linecolor="#f0f0f0",
        cbar_kws={"label": "Volume (normalized)", "shrink": 0.6},
    )
    ax.set_xlabel("Hour (UTC)", fontsize=11)
    ax.set_ylabel("Symbol", fontsize=11)
    ax.set_title(params.get("title", "Intraday Volume Heatmap"), fontsize=13, fontweight="bold")
    for hour in [8, 14, 20]:
        ax.axvline(x=hour, color="#333", linestyle="--", alpha=0.3, linewidth=1)
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def render_intraday_volatility(params: Dict, output: str) -> Tuple[object, str]:
    """日内波动率曲线。"""
    data = params.get("data")
    if not data:
        raise ValueError("缺少 data")

    if isinstance(data, dict):
        df = pd.DataFrame(
            {
                "hour": data.get("hours", list(range(24))),
                "volatility": data.get("volatilities", [0] * 24),
                "volume": data.get("volumes", [0] * 24),
            }
        )
    else:
        df = pd.DataFrame(data)

    if "hour" not in df.columns or "volatility" not in df.columns:
        raise ValueError("data 需包含 hour, volatility")

    df = df.groupby("hour").agg({"volatility": "mean", "volume": "sum"}).reset_index().sort_values("hour")
    symbol = params.get("symbol", "")

    if output == "json":
        return {
            "title": params.get("title", f"Intraday Volatility {symbol}".strip()),
            "hours": df["hour"].tolist(),
            "volatility": df["volatility"].tolist(),
            "volume": df["volume"].tolist() if "volume" in df.columns else None,
        }, "application/json"

    fig, ax1 = plt.subplots(figsize=(12, 5))
    ax1.fill_between(df["hour"], df["volatility"], alpha=0.3, color="#e74c3c")
    ax1.plot(df["hour"], df["volatility"], color="#c0392b", linewidth=2, marker="o", markersize=5)
    ax1.set_xlabel("Hour (UTC)", fontsize=11)
    ax1.set_ylabel("Volatility (%)", fontsize=11, color="#c0392b")
    ax1.tick_params(axis="y", labelcolor="#c0392b")
    ax1.set_xlim(-0.5, 23.5)
    ax1.set_xticks(range(24))

    if params.get("show_volume", True) and "volume" in df.columns and df["volume"].sum() > 0:
        ax2 = ax1.twinx()
        ax2.bar(df["hour"], df["volume"], alpha=0.3, color="#3498db", width=0.6)
        ax2.set_ylabel("Volume", fontsize=11, color="#3498db")
        ax2.tick_params(axis="y", labelcolor="#3498db")

    high_vol_hours = df.nlargest(3, "volatility")["hour"].tolist()
    for hour in high_vol_hours:
        ax1.axvline(x=hour, color="#e74c3c", linestyle="--", alpha=0.5, linewidth=1)

    ax1.set_title(params.get("title", f"Intraday Volatility {symbol}".strip()), fontsize=13, fontweight="bold")
    ax1.grid(axis="y", alpha=0.3)
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def render_taker_ratio_heatmap(params: Dict, output: str) -> Tuple[object, str]:
    """主动买卖比热力图。"""
    data = params.get("data")
    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表")

    df = pd.DataFrame(data)
    if not {"symbol", "hour", "taker_buy_ratio"}.issubset(df.columns):
        raise ValueError("data 需包含 symbol, hour, taker_buy_ratio")

    df["hour"] = df["hour"].astype(int)
    df["taker_buy_ratio"] = df["taker_buy_ratio"].astype(float)

    pivot = df.pivot_table(index="symbol", columns="hour", values="taker_buy_ratio", aggfunc="mean", fill_value=0.5)
    for hour in range(24):
        if hour not in pivot.columns:
            pivot[hour] = 0.5
    pivot = pivot.reindex(columns=sorted(pivot.columns))

    top_n = int(params.get("top_n", 30))
    row_std = pivot.std(axis=1).sort_values(ascending=False)
    pivot = pivot.loc[row_std.head(top_n).index]

    if output == "json":
        return {
            "title": params.get("title", "Taker Buy Ratio Heatmap"),
            "symbols": pivot.index.tolist(),
            "hours": list(range(24)),
            "values": pivot.values.tolist(),
        }, "application/json"

    fig_height = max(6, len(pivot) * 0.25)
    fig, ax = plt.subplots(figsize=(14, fig_height))
    sns.heatmap(
        pivot,
        ax=ax,
        cmap="RdBu",
        center=0.5,
        vmin=0.3,
        vmax=0.7,
        linewidths=0.5,
        linecolor="#f0f0f0",
        cbar_kws={"label": "Taker Buy Ratio", "shrink": 0.6},
    )
    ax.set_xlabel("Hour (UTC)", fontsize=11)
    ax.set_ylabel("Symbol", fontsize=11)
    ax.set_title(params.get("title", "Taker Buy Ratio Heatmap (Blue=Buy, Red=Sell)"), fontsize=13, fontweight="bold")
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def render_long_short_ratio(params: Dict, output: str) -> Tuple[object, str]:
    """多空比时序图。"""
    data = params.get("data")
    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表")

    df = pd.DataFrame(data)
    if "time" not in df.columns:
        raise ValueError("data 需包含 time 字段")

    df["time"] = pd.to_datetime(df["time"])
    df = df.sort_values("time")
    symbol = params.get("symbol", "")

    if output == "json":
        result = {
            "title": params.get("title", f"Long/Short Ratio {symbol}".strip()),
            "time": df["time"].dt.strftime("%Y-%m-%d %H:%M").tolist(),
        }
        for column in ["top_trader_ratio", "global_ratio", "taker_ratio"]:
            if column in df.columns:
                result[column] = df[column].tolist()
        return result, "application/json"

    fig, ax = plt.subplots(figsize=(14, 6))
    colors = {"top_trader_ratio": "#e74c3c", "global_ratio": "#3498db", "taker_ratio": "#2ecc71"}
    labels = {"top_trader_ratio": "Top Traders", "global_ratio": "All Traders", "taker_ratio": "Taker"}
    for column, color in colors.items():
        if column in df.columns:
            ax.plot(df["time"], df[column], color=color, linewidth=1.5, label=labels[column], alpha=0.8)
    ax.axhline(y=1.0, color="#666", linestyle="--", alpha=0.5, linewidth=1, label="Balance (1.0)")
    ax.set_xlabel("Time", fontsize=11)
    ax.set_ylabel("Long/Short Ratio", fontsize=11)
    ax.set_title(params.get("title", f"Long/Short Ratio {symbol}".strip()), fontsize=13, fontweight="bold")
    ax.legend(loc="upper right", fontsize=9)
    ax.grid(axis="y", alpha=0.3)
    fig.autofmt_xdate(rotation=45)
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def render_cvd_cumulative(params: Dict, output: str) -> Tuple[object, str]:
    """CVD 累计图。"""
    data = params.get("data")
    if not data:
        raise ValueError("缺少 data")

    if isinstance(data, dict):
        df = pd.DataFrame(
            {
                "time": data.get("times", []),
                "cvd": data.get("cvd_values", []),
                "price": data.get("prices", [None] * len(data.get("times", []))),
            }
        )
    else:
        df = pd.DataFrame(data)

    if "time" not in df.columns or "cvd" not in df.columns:
        raise ValueError("data 需包含 time, cvd")

    df["time"] = pd.to_datetime(df["time"])
    df = df.sort_values("time")
    symbol = params.get("symbol", "")
    show_price = params.get("show_price", False) and "price" in df.columns

    if output == "json":
        result = {
            "title": params.get("title", f"CVD {symbol}".strip()),
            "time": df["time"].dt.strftime("%Y-%m-%d %H:%M").tolist(),
            "cvd": df["cvd"].tolist(),
        }
        if show_price:
            result["price"] = df["price"].tolist()
        return result, "application/json"

    fig, ax1 = plt.subplots(figsize=(14, 6))
    cvd = df["cvd"]
    ax1.fill_between(df["time"], cvd, where=(cvd >= 0), color="#2ecc71", alpha=0.4, label="Buying Pressure")
    ax1.fill_between(df["time"], cvd, where=(cvd < 0), color="#e74c3c", alpha=0.4, label="Selling Pressure")
    ax1.plot(df["time"], cvd, color="#333", linewidth=1.2)
    ax1.axhline(y=0, color="#666", linestyle="-", alpha=0.5, linewidth=1)
    ax1.set_xlabel("Time", fontsize=11)
    ax1.set_ylabel("CVD (Cumulative Volume Delta)", fontsize=11)

    if show_price and df["price"].notna().any():
        ax2 = ax1.twinx()
        ax2.plot(df["time"], df["price"], color="#f39c12", linewidth=1.5, alpha=0.7, label="Price")
        ax2.set_ylabel("Price", fontsize=11, color="#f39c12")
        ax2.tick_params(axis="y", labelcolor="#f39c12")

    ax1.set_title(params.get("title", f"CVD (Cumulative Volume Delta) {symbol}".strip()), fontsize=13, fontweight="bold")
    ax1.legend(loc="upper left", fontsize=9)
    ax1.grid(axis="y", alpha=0.3)
    fig.autofmt_xdate(rotation=45)
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def render_oi_change(params: Dict, output: str) -> Tuple[object, str]:
    """持仓量变化图。"""
    data = params.get("data")
    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表")

    df = pd.DataFrame(data)
    if "time" not in df.columns or "oi" not in df.columns:
        raise ValueError("data 需包含 time, oi")

    df["time"] = pd.to_datetime(df["time"])
    df = df.sort_values("time")
    df["oi_change"] = df["oi"].diff().fillna(0)

    symbol = params.get("symbol", "")
    show_price = params.get("show_price", True) and "price" in df.columns

    if output == "json":
        result = {
            "title": params.get("title", f"Open Interest {symbol}".strip()),
            "time": df["time"].dt.strftime("%Y-%m-%d %H:%M").tolist(),
            "oi": df["oi"].tolist(),
            "oi_change": df["oi_change"].tolist(),
        }
        if show_price:
            result["price"] = df["price"].tolist()
        return result, "application/json"

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(14, 8), gridspec_kw={"height_ratios": [2, 1]}, sharex=True)

    ax1.plot(df["time"], df["oi"], color="#9b59b6", linewidth=2, label="Open Interest")
    ax1.set_ylabel("Open Interest", fontsize=11, color="#9b59b6")
    ax1.tick_params(axis="y", labelcolor="#9b59b6")
    ax1.legend(loc="upper left", fontsize=9)

    if show_price and df["price"].notna().any():
        ax1_price = ax1.twinx()
        ax1_price.plot(df["time"], df["price"], color="#f39c12", linewidth=1.5, alpha=0.7, label="Price")
        ax1_price.set_ylabel("Price", fontsize=11, color="#f39c12")
        ax1_price.tick_params(axis="y", labelcolor="#f39c12")
        ax1_price.legend(loc="upper right", fontsize=9)

    colors = ["#2ecc71" if value >= 0 else "#e74c3c" for value in df["oi_change"]]
    ax2.bar(df["time"], df["oi_change"], color=colors, alpha=0.7, width=0.02)
    ax2.axhline(y=0, color="#666", linestyle="-", alpha=0.5, linewidth=1)
    ax2.set_ylabel("OI Change", fontsize=11)
    ax2.set_xlabel("Time", fontsize=11)

    ax1.set_title(params.get("title", f"Open Interest {symbol}".strip()), fontsize=13, fontweight="bold")
    ax1.grid(axis="y", alpha=0.3)
    ax2.grid(axis="y", alpha=0.3)
    fig.autofmt_xdate(rotation=45)
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"
