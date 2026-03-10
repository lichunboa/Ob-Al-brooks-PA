"""VPVR、布林区间与价值区模板。"""

from __future__ import annotations

import io
import logging
import os
import sys
from typing import Dict, List, Tuple

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import plotly.graph_objects as go
import seaborn as sns
from adjustText import adjust_text

logger = logging.getLogger(__name__)


def _fig_to_png(fig) -> bytes:
    """导出 matplotlib 图像为 PNG 字节。"""

    buffer = io.BytesIO()
    fig.savefig(buffer, format="png", dpi=160, bbox_inches="tight")
    plt.close(fig)
    buffer.seek(0)
    return buffer.read()


def _build_bin_edges(prices: List[float], bins: int, mode: str) -> np.ndarray:
    """根据模式构建统一的 bin 边界。"""

    arr = np.asarray(prices, dtype=float)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        raise ValueError("无有效价格数据")

    if mode == "percentile":
        edges = np.percentile(arr, np.linspace(0, 100, bins + 1))
    else:
        median = np.median(arr)
        span = abs(median) * 0.05 if median != 0 else 1.0
        edges = np.linspace(median - span, median + span, bins + 1)

    edges = np.maximum.accumulate(edges)
    for index in range(1, len(edges)):
        if edges[index] <= edges[index - 1]:
            edges[index] = edges[index - 1] + 1e-9
    return edges


def render_market_vpvr_heat(params: Dict, output: str) -> Tuple[object, str]:
    """全市场 VPVR 热力图。"""
    data = params.get("data")
    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表")

    bins = int(params.get("bins", 40))
    bin_mode = params.get("bin_mode", "percentile")
    scale = params.get("scale", "linear")
    top_n = params.get("top_n")

    all_prices: List[float] = []
    prepared: List[Tuple[str, np.ndarray, np.ndarray]] = []
    for item in data:
        symbol = item.get("symbol")
        prices = item.get("price") or item.get("close") or []
        volumes = item.get("volume") or item.get("volumes") or []
        if not symbol or not prices or not volumes:
            continue
        if len(prices) != len(volumes):
            continue
        price_array = np.asarray(prices, dtype=float)
        volume_array = np.asarray(volumes, dtype=float)
        mask = np.isfinite(price_array) & np.isfinite(volume_array) & (volume_array > 0)
        price_array = price_array[mask]
        volume_array = volume_array[mask]
        if price_array.size == 0:
            continue
        all_prices.extend(price_array.tolist())
        prepared.append((symbol, price_array, volume_array))

    if not prepared:
        raise ValueError("无有效的价格/成交量数据")

    edges = _build_bin_edges(all_prices, bins=bins, mode=bin_mode)

    rows = []
    symbols = []
    total_volumes = []
    for symbol, price_array, volume_array in prepared:
        hist, _ = np.histogram(price_array, bins=edges, weights=volume_array)
        total = hist.sum()
        if total <= 0:
            continue
        total_volumes.append((symbol, total))
        rows.append(hist / total)
        symbols.append(symbol)

    if not rows:
        raise ValueError("无有效聚合结果")

    if top_n:
        order = sorted(total_volumes, key=lambda item: item[1], reverse=True)[: int(top_n)]
        keep = {symbol for symbol, _ in order}
        row_indexes = [index for index, symbol in enumerate(symbols) if symbol in keep]
        rows = [rows[index] for index in row_indexes]
        symbols = [symbols[index] for index in row_indexes]

    matrix = np.vstack(rows)
    if scale == "log":
        matrix = np.log10(matrix + 1e-9)

    col_labels = [f"{edges[index]:.4g}-{edges[index + 1]:.4g}" for index in range(len(edges) - 1)]

    if output == "json":
        fig = go.Figure(
            data=go.Heatmap(
                z=matrix,
                x=col_labels,
                y=symbols,
                colorscale="Viridis",
                colorbar=dict(title="vol% (log)" if scale == "log" else "vol%"),
            )
        )
        fig.update_layout(
            title=params.get("title", "Market VPVR"),
            xaxis_title="Price bins",
            yaxis_title="Symbol",
            template="plotly_white",
        )
        return fig.to_dict(), "application/json"

    sns.set_theme(style="white")
    fig, ax = plt.subplots(figsize=(12, max(4, len(symbols) * 0.4)))
    sns.heatmap(
        matrix,
        ax=ax,
        yticklabels=symbols,
        xticklabels=False,
        cmap="viridis",
        cbar_kws={"label": "vol% (log)" if scale == "log" else "vol%"},
    )
    ax.set_title(params.get("title", "Market VPVR"))
    ax.set_xlabel("Price bins")
    ax.set_ylabel("Symbol")
    fig.tight_layout()
    return _fig_to_png(fig), "image/png"


def render_vpvr_zone_strip(params: Dict, output: str) -> Tuple[object, str]:
    """VPVR 价值区分布图。"""
    data = params.get("data")
    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表")

    bands = max(2, int(params.get("bands", 6)))

    df = pd.DataFrame(data)
    required_columns = {"symbol", "price", "value_area_low", "value_area_high"}
    if not required_columns.issubset(df.columns):
        raise ValueError("data 需包含 symbol, price, value_area_low, value_area_high")

    df = df.dropna(subset=["price", "value_area_low", "value_area_high"])
    df["span"] = (df["value_area_high"] - df["value_area_low"]).astype(float)
    df = df[df["span"] > 0]
    if df.empty:
        raise ValueError("无有效 VPVR 数据")

    raw_y = (df["price"] - df["value_area_low"]) / df["span"]
    df["y"] = raw_y.clip(0.01, 0.99)
    df["y_raw"] = raw_y.clip(0, 1)

    count = len(df)
    fig_height = min(14, max(10, count * 0.028))

    sns.set_theme(style="white")
    fig, ax = plt.subplots(1, 1, figsize=(16, fig_height), dpi=150)

    band_colors = ["#4a148c", "#1a237e", "#006064", "#1b5e20", "#f9a825", "#ff6f00"]
    if bands != 6:
        cmap = plt.cm.viridis
        band_colors = [cmap(index / max(1, bands - 1)) for index in range(bands)]

    for index in range(bands):
        y0 = index / bands
        ax.add_patch(plt.Rectangle((0.0, y0), 1.0, 1 / bands, facecolor=band_colors[index], alpha=0.85, edgecolor="none"))

    rng = np.random.default_rng(42)

    if "market_cap" in df.columns:
        market_cap = df["market_cap"].fillna(df["market_cap"].median())
        market_cap_sqrt = np.sqrt(market_cap.clip(lower=1))
        market_cap_norm = (market_cap_sqrt - market_cap_sqrt.min()) / (market_cap_sqrt.max() - market_cap_sqrt.min() + 1e-9)
        df["size_factor"] = 0.3 + market_cap_norm * 1.2
    else:
        df["size_factor"] = 1.0

    if "volume" in df.columns:
        volume = df["volume"].fillna(df["volume"].median())
        volume_log = np.log10(volume.clip(lower=1))
        volume_norm = (volume_log - volume_log.min()) / (volume_log.max() - volume_log.min() + 1e-9)
        df["vol_factor"] = volume_norm
    else:
        df["vol_factor"] = 0.5

    df = df.sort_values("y").reset_index(drop=True)
    y_bins = pd.cut(df["y"], bins=25, labels=False)
    df["y_bin"] = y_bins.fillna(0).astype(int)

    x_positions = []
    for bin_id in range(25):
        bin_mask = df["y_bin"] == bin_id
        bin_count = bin_mask.sum()
        if bin_count > 0:
            bin_indices = df[bin_mask].index.tolist()
            for index, row_index in enumerate(bin_indices):
                x_position = (index + 0.5) / bin_count * 0.88 + 0.06
                x_position += rng.uniform(-0.015, 0.015)
                x_positions.append((row_index, x_position))

    for row_index, x_position in x_positions:
        df.loc[row_index, "x"] = x_position
    df["x"] = df["x"].clip(0.03, 0.97)

    texts = []
    vol_cmap = plt.cm.RdYlGn

    for _, row in df.iterrows():
        label = str(row["symbol"]).replace("USDT", "")
        if len(label) > 6:
            label = label[:6] + ".."

        size_factor = row.get("size_factor", 1.0)
        font_size = 5.0 * (0.8 + size_factor * 0.7)

        vol_factor = row.get("vol_factor", 0.5)
        rgba = vol_cmap(vol_factor)
        point_color = f"#{int(rgba[0] * 255):02x}{int(rgba[1] * 255):02x}{int(rgba[2] * 255):02x}"

        price_change = row.get("price_change")
        if price_change is not None and price_change > 0.005:
            edge_color = "#1a9850"
        elif price_change is not None and price_change < -0.005:
            edge_color = "#d73027"
        else:
            edge_color = "#ffffff"

        edge_width = 1.0 + size_factor * 1.2
        texts.append(
            ax.text(
                row["x"],
                row["y"],
                label,
                ha="center",
                va="center",
                fontsize=font_size,
                color="#1a1a1a",
                fontweight="bold",
                zorder=4,
                bbox=dict(
                    boxstyle="circle,pad=0.4",
                    facecolor=point_color,
                    edgecolor=edge_color,
                    linewidth=edge_width,
                    alpha=0.92,
                ),
            )
        )

    try:
        adjust_text(
            texts,
            x=df["x"].tolist(),
            y=df["y"].tolist(),
            ax=ax,
            expand=(1.03, 1.05),
            force_text=(0.2, 0.3),
            force_static=(0.05, 0.08),
            force_pull=(0.02, 0.02),
            arrowprops=dict(arrowstyle="-", color="#666666", lw=0.3, alpha=0.4),
            time_lim=1.5,
            only_move={"text": "xy"},
        )
    except Exception as exc:
        logger.warning("adjustText failed: %s", exc)

    for spine in ["top", "right", "bottom"]:
        ax.spines[spine].set_visible(False)
    ax.spines["left"].set_color("#444444")
    ax.spines["left"].set_linewidth(1.2)

    ax.set_xticks([])
    ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 1.0])
    ax.set_yticklabels(["0%", "20%", "40%", "60%", "80%", "100%"], fontsize=9, color="#333333")
    ax.set_ylabel("Position in Value Area", fontsize=10, color="#333333", labelpad=8)

    from matplotlib.lines import Line2D

    legend_elements = [
        Line2D([0], [0], marker="o", color="w", markerfacecolor=band_colors[-1], markersize=10, label="Overbought"),
        Line2D(
            [0],
            [0],
            marker="o",
            color="w",
            markerfacecolor=band_colors[len(band_colors) // 2],
            markersize=10,
            label="POC Zone",
        ),
        Line2D([0], [0], marker="o", color="w", markerfacecolor=band_colors[0], markersize=10, label="Oversold"),
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#b71c1c", markersize=11, label="High Vol"),
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#ffffcc", markersize=8, label="Low Vol"),
        Line2D(
            [0],
            [0],
            marker="o",
            color="w",
            markerfacecolor="#ffcc80",
            markeredgecolor="#1a9850",
            markersize=10,
            markeredgewidth=2,
            label="Up",
        ),
        Line2D(
            [0],
            [0],
            marker="o",
            color="w",
            markerfacecolor="#ffcc80",
            markeredgecolor="#d73027",
            markersize=10,
            markeredgewidth=2,
            label="Down",
        ),
    ]
    ax.legend(handles=legend_elements, loc="lower right", fontsize=9, framealpha=0.9, edgecolor="#cccccc")

    ax.set_xlim(-0.01, 1.01)
    ax.set_ylim(-0.02, 1.02)

    fig.suptitle(params.get("title", "VPVR Zone Distribution"), fontsize=12, color="#1e293b", fontweight="bold", y=0.98)
    fig.tight_layout(rect=[0, 0.02, 0.92, 0.96])

    if output == "json":
        return {
            "title": params.get("title", "VPVR Zone Distribution"),
            "bands": bands,
            "points": [
                {
                    "symbol": row["symbol"],
                    "position": float(row["y_raw"]),
                    "x": float(row["x"]),
                    "size_factor": float(row.get("size_factor", 1)),
                    "vol_factor": float(row.get("vol_factor", 0.5)),
                }
                for _, row in df.iterrows()
            ],
        }, "application/json"

    return _fig_to_png(fig), "image/png"


def _fetch_ridge_data_from_db(
    symbol: str, interval: str, periods: int = 10, lookback: int = 200, bins: int = 48
) -> Tuple[List[Dict], List[Dict]]:
    """从 trading-service 的 VPVR 计算方法获取山脊图数据。"""

    trading_service_path = os.path.join(os.path.dirname(__file__), "../../../../services/trading-service/src")
    if trading_service_path not in sys.path:
        sys.path.insert(0, os.path.abspath(trading_service_path))

    try:
        from indicators.batch.vpvr import compute_vpvr_ridge_data
    except ImportError as exc:
        logger.warning("无法导入 VPVR 计算方法: %s", exc)
        return [], []

    result = compute_vpvr_ridge_data(symbol, interval, periods, lookback, bins)
    if not result or not result.get("periods"):
        return [], []

    ridge_data = []
    ohlc_data = []
    for period in result["periods"]:
        ridge_data.append(
            {
                "period": period["label"],
                "distribution": [{"price": center, "volume": volume} for center, volume in zip(period["bin_centers"], period["volumes"])],
            }
        )
        ohlc_data.append(
            {
                "period": period["label"],
                "open": period["ohlc"]["open"],
                "high": period["ohlc"]["high"],
                "low": period["ohlc"]["low"],
                "close": period["ohlc"]["close"],
            }
        )

    return ridge_data, ohlc_data


def render_vpvr_ridge(params: Dict, output: str) -> Tuple[object, str]:
    """VPVR 山脊图。"""
    data = params.get("data")
    ohlc_data = params.get("ohlc_data", [])
    bins = int(params.get("bins", 48))

    if not data and params.get("symbol"):
        symbol = params["symbol"]
        interval = params.get("interval", "1h")
        periods_count = int(params.get("periods", 10))
        lookback = int(params.get("lookback", 200))
        data, ohlc_data = _fetch_ridge_data_from_db(symbol, interval, periods_count, lookback, bins)
        if not data:
            raise ValueError(f"无法获取 {symbol} {interval} 数据")

    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表或 symbol 参数")

    overlap = float(params.get("overlap", 0.5))
    cmap_name = params.get("colormap", "viridis")
    show_ohlc = params.get("show_ohlc", True)

    if params.get("symbol"):
        default_title = f"{params['symbol']} VPVR Ridge - {params.get('interval', '1h')} x {params.get('periods', 10)}"
    else:
        default_title = "VPVR Ridge Plot"
    title = params.get("title", default_title)

    periods = []
    distributions = []
    for item in data:
        period = item.get("period", str(len(periods)))
        if "distribution" in item:
            distribution = item["distribution"]
            prices = [entry["price"] for entry in distribution]
            volumes = [entry["volume"] for entry in distribution]
        elif "prices" in item and "volumes" in item:
            prices = np.array(item["prices"], dtype=float)
            volumes = np.array(item["volumes"], dtype=float)
            if len(prices) != len(volumes) or len(prices) == 0:
                continue
        else:
            continue
        periods.append(period)
        distributions.append((prices, volumes))

    if not distributions:
        raise ValueError("无有效的分布数据")

    periods = periods[::-1]
    distributions = distributions[::-1]
    if ohlc_data:
        ohlc_data = ohlc_data[::-1]

    all_prices = np.concatenate([distribution[0] for distribution in distributions])
    price_min, price_max = np.nanmin(all_prices), np.nanmax(all_prices)
    bin_edges = np.linspace(price_min, price_max, bins + 1)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2

    histograms = []
    for prices, volumes in distributions:
        hist, _ = np.histogram(prices, bins=bin_edges, weights=volumes)
        hist = hist / (hist.max() + 1e-9)
        histograms.append(hist)

    period_count = len(periods)

    if output == "json":
        return {
            "title": title,
            "periods": periods,
            "bin_centers": bin_centers.tolist(),
            "distributions": [hist.tolist() for hist in histograms],
            "ohlc": ohlc_data,
        }, "application/json"

    import joypy
    from matplotlib import cm

    df_rows = []
    for period, hist in zip(periods, histograms):
        for price, volume in zip(bin_centers, hist):
            count = int(volume * 100) + 1
            for _ in range(count):
                df_rows.append({"period": period, "price": price})

    df = pd.DataFrame(df_rows)

    fig, axes = joypy.joyplot(
        df,
        by="period",
        column="price",
        colormap=cm.get_cmap(cmap_name),
        overlap=overlap,
        linewidth=1,
        linecolor="white",
        fade=True,
        figsize=(12, max(6, period_count * 0.8)),
        grid="y",
        xlabels=True,
        ylabels=True,
        legend=False,
    )

    fig.suptitle(title, fontsize=12, fontweight="bold", y=0.98)
    axes[-1].set_xlabel("Price", fontsize=10)

    if show_ohlc and ohlc_data and len(ohlc_data) == period_count:
        opens = [item["open"] for item in ohlc_data]
        highs = [item["high"] for item in ohlc_data]
        lows = [item["low"] for item in ohlc_data]
        closes = [item["close"] for item in ohlc_data]

        y_positions = []
        for axis in axes[:-1]:
            bbox = axis.get_position()
            y_positions.append(bbox.y0 + bbox.height * 0.3)

        main_axis = axes[-1]
        xlim = main_axis.get_xlim()

        def price_to_fig_x(price):
            bbox = main_axis.get_position()
            rel = (price - xlim[0]) / (xlim[1] - xlim[0])
            return bbox.x0 + rel * bbox.width

        from matplotlib.lines import Line2D

        ohlc_styles = [
            ("open", opens, "#2196F3", "-", 1.5),
            ("high", highs, "#4CAF50", "--", 1.2),
            ("low", lows, "#F44336", "--", 1.2),
            ("close", closes, "#FF9800", "-", 1.5),
        ]

        for _, prices, color, linestyle, linewidth in ohlc_styles:
            x_coords = [price_to_fig_x(price) for price in prices]
            fig.add_artist(
                Line2D(
                    x_coords,
                    y_positions,
                    color=color,
                    linestyle=linestyle,
                    linewidth=linewidth,
                    alpha=0.8,
                    transform=fig.transFigure,
                    zorder=10,
                )
            )
            for x_coord, y_coord in zip(x_coords, y_positions):
                fig.add_artist(plt.Circle((x_coord, y_coord), 0.006, color=color, transform=fig.transFigure, zorder=11))

        from matplotlib.patches import Patch

        legend_elements = [
            Patch(facecolor=cm.get_cmap(cmap_name)(0.0), label=f"{periods[0]} (oldest)"),
            Patch(facecolor=cm.get_cmap(cmap_name)(1.0), label=f"{periods[-1]} (newest)"),
            Line2D([0], [0], color="#2196F3", linestyle="-", linewidth=1.5, label="Open"),
            Line2D([0], [0], color="#4CAF50", linestyle="--", linewidth=1.2, label="High"),
            Line2D([0], [0], color="#F44336", linestyle="--", linewidth=1.2, label="Low"),
            Line2D([0], [0], color="#FF9800", linestyle="-", linewidth=1.5, label="Close"),
        ]
        axes[0].legend(handles=legend_elements, loc="upper right", fontsize=7, framealpha=0.9, ncol=2)
    else:
        from matplotlib.patches import Patch

        legend_elements = [
            Patch(facecolor=cm.get_cmap(cmap_name)(0.0), label=f"{periods[0]} (oldest)"),
            Patch(facecolor=cm.get_cmap(cmap_name)(1.0), label=f"{periods[-1]} (newest)"),
        ]
        axes[0].legend(handles=legend_elements, loc="upper right", fontsize=8, framealpha=0.9)

    return _fig_to_png(fig), "image/png"


def render_bb_zone_strip(params: Dict, output: str) -> Tuple[object, str]:
    """全市场布林带分布图。"""
    data = params.get("data")
    if not data or not isinstance(data, list):
        raise ValueError("缺少 data 列表")

    y_bands = max(2, int(params.get("bands", 5)))
    x_bands = 3

    df = pd.DataFrame(data)
    required_columns = {"symbol", "percent_b", "bandwidth"}
    if not required_columns.issubset(df.columns):
        raise ValueError("data 需包含 symbol, percent_b, bandwidth")

    df = df.dropna(subset=["percent_b", "bandwidth"])
    df["percent_b"] = df["percent_b"].astype(float)
    df["bandwidth"] = df["bandwidth"].astype(float)
    df = df[df["bandwidth"] > 0]
    df = df.drop_duplicates(subset=["symbol"], keep="first")
    if df.empty:
        raise ValueError("无有效布林带数据")

    raw_y = df["percent_b"].clip(-0.5, 1.5)
    df["y"] = ((raw_y + 0.5) / 2).clip(0.02, 0.98)
    df["y_raw"] = df["percent_b"]

    bandwidth = df["bandwidth"]
    q33 = bandwidth.quantile(0.33)
    q66 = bandwidth.quantile(0.66)

    def bandwidth_to_zone(value):
        if value <= q33:
            return 0
        if value <= q66:
            return 1
        return 2

    df["x_zone"] = df["bandwidth"].apply(bandwidth_to_zone)

    bandwidth_log = np.log10(bandwidth.clip(lower=0.1) + 1)
    bandwidth_norm = (bandwidth_log - bandwidth_log.min()) / (bandwidth_log.max() - bandwidth_log.min() + 1e-9)
    df["size_factor"] = 0.4 + bandwidth_norm * 1.0

    if "volume" in df.columns:
        volume = df["volume"].fillna(df["volume"].median())
        volume_log = np.log10(volume.clip(lower=1))
        volume_norm = (volume_log - volume_log.min()) / (volume_log.max() - volume_log.min() + 1e-9)
        df["vol_factor"] = volume_norm
    else:
        df["vol_factor"] = 0.5

    fig_height = min(14, max(10, len(df) * 0.025))

    sns.set_theme(style="white")
    fig, ax = plt.subplots(1, 1, figsize=(16, fig_height), dpi=150)

    band_colors = ["#1565C0", "#1976D2", "#4CAF50", "#FFA726", "#E53935"]
    if y_bands != 5:
        cmap = plt.cm.RdYlBu_r
        band_colors = [cmap(index / max(1, y_bands - 1)) for index in range(y_bands)]

    for y_band in range(y_bands):
        y0 = y_band / y_bands
        for x_band in range(x_bands):
            x0 = x_band / x_bands
            ax.add_patch(
                plt.Rectangle(
                    (x0, y0),
                    1 / x_bands,
                    1 / y_bands,
                    facecolor=band_colors[y_band],
                    alpha=0.75,
                    edgecolor="white",
                    linewidth=0.5,
                )
            )

    for index in range(1, x_bands):
        ax.axvline(x=index / x_bands, color="white", linewidth=2, alpha=0.9)

    def get_radius(size_factor):
        return 0.015 + size_factor * 0.008

    def check_overlap(x1, y1, r1, placed):
        count = 0
        for px, py, pr in placed:
            dx = (x1 - px) * 1.5
            dy = y1 - py
            dist = (dx**2 + dy**2) ** 0.5
            if dist < (r1 + pr) * 0.95:
                count += 1
        return count

    df["x"] = 0.5
    df["y_final"] = df["y"]

    for zone in range(x_bands):
        zone_mask = df["x_zone"] == zone
        zone_indices = df[zone_mask].index.tolist()
        if not zone_indices:
            continue

        zone_x_start = zone / x_bands + 0.02
        zone_x_end = (zone + 1) / x_bands - 0.02
        zone_df = df.loc[zone_indices].sort_values("size_factor", ascending=False)
        placed = []
        x_grid = np.linspace(zone_x_start + 0.015, zone_x_end - 0.015, 30)
        y_offsets = [0] + [distance * sign for distance in range(1, 25) for sign in [-0.01, 0.01]]

        for row_index in zone_df.index:
            row = df.loc[row_index]
            target_y = row["y"]
            radius = get_radius(row["size_factor"])
            best_position = None
            best_score = float("inf")

            for x_try in x_grid:
                for y_offset in y_offsets:
                    y_try = target_y + y_offset
                    if y_try < 0.02 or y_try > 0.98:
                        continue

                    overlap = check_overlap(x_try, y_try, radius, placed)
                    score = overlap * 100 + abs(y_offset) * 10 + abs(x_try - (zone_x_start + zone_x_end) / 2) * 2
                    if score < best_score:
                        best_score = score
                        best_position = (x_try, y_try)
                    if overlap == 0:
                        break
                if best_score == 0:
                    break

            if best_position:
                df.loc[row_index, "x"] = best_position[0]
                df.loc[row_index, "y_final"] = best_position[1]
                placed.append((best_position[0], best_position[1], radius))
            else:
                center_x = (zone_x_start + zone_x_end) / 2
                df.loc[row_index, "x"] = center_x
                df.loc[row_index, "y_final"] = target_y
                placed.append((center_x, target_y, radius))

    df["y"] = df["y_final"]
    df["x"] = df["x"].clip(0.02, 0.98)

    texts = []
    vol_cmap = plt.cm.YlOrRd

    for _, row in df.iterrows():
        label = str(row["symbol"]).replace("USDT", "")
        if len(label) > 5:
            label = label[:5] + ".."

        size_factor = row.get("size_factor", 1.0)
        font_size = 4.0 * (0.75 + size_factor * 0.4)

        vol_factor = row.get("vol_factor", 0.5)
        rgba = vol_cmap(vol_factor)
        point_color = f"#{int(rgba[0] * 255):02x}{int(rgba[1] * 255):02x}{int(rgba[2] * 255):02x}"

        price_change = row.get("price_change")
        if price_change is not None and price_change > 0.005:
            edge_color = "#1a9850"
        elif price_change is not None and price_change < -0.005:
            edge_color = "#d73027"
        else:
            edge_color = "#ffffff"

        edge_width = 0.8 + size_factor * 0.6
        texts.append(
            ax.text(
                row["x"],
                row["y"],
                label,
                ha="center",
                va="center",
                fontsize=font_size,
                color="#1a1a1a",
                fontweight="bold",
                zorder=4,
                bbox=dict(
                    boxstyle="circle,pad=0.25",
                    facecolor=point_color,
                    edgecolor=edge_color,
                    linewidth=edge_width,
                    alpha=0.92,
                ),
            )
        )

    try:
        adjust_text(
            texts,
            x=df["x"].tolist(),
            y=df["y"].tolist(),
            ax=ax,
            expand=(1.02, 1.03),
            force_text=(0.15, 0.2),
            force_static=(0.03, 0.05),
            force_pull=(0.01, 0.01),
            time_lim=1.2,
            only_move={"text": "xy"},
            arrowprops=dict(arrowstyle="-", color="#666666", lw=0.3, alpha=0.3),
        )
    except Exception as exc:
        logger.warning("adjustText failed: %s", exc)

    for spine in ax.spines.values():
        spine.set_visible(False)

    ax.set_yticks([0.1, 0.3, 0.5, 0.7, 0.9])
    ax.set_yticklabels(
        ["Oversold\n(<0%)", "Lower\n(0-25%)", "Middle\n(50%)", "Upper\n(75-100%)", "Overbought\n(>100%)"],
        fontsize=9,
        color="#333",
    )
    ax.set_ylabel("Bollinger %B", fontsize=11, color="#333", labelpad=10)

    ax.set_xticks([1 / 6, 3 / 6, 5 / 6])
    ax.set_xticklabels(["Squeeze\n(Narrowing)", "Normal", "Expansion\n(Volatile)"], fontsize=10, color="#333")
    ax.set_xlabel("Bandwidth (Volatility)", fontsize=11, color="#333", labelpad=10)

    from matplotlib.lines import Line2D

    legend_elements = [
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#ff6b6b", markersize=10, label="High Volume"),
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#ffffcc", markersize=8, label="Low Volume"),
        Line2D(
            [0],
            [0],
            marker="o",
            color="w",
            markerfacecolor="#ffcc80",
            markeredgecolor="#1a9850",
            markersize=9,
            markeredgewidth=2,
            label="Rising",
        ),
        Line2D(
            [0],
            [0],
            marker="o",
            color="w",
            markerfacecolor="#ffcc80",
            markeredgecolor="#d73027",
            markersize=9,
            markeredgewidth=2,
            label="Falling",
        ),
    ]
    ax.legend(handles=legend_elements, loc="upper left", fontsize=9, framealpha=0.9, edgecolor="#ccc")

    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)

    fig.suptitle(params.get("title", "Bollinger Band Matrix"), fontsize=13, color="#1e293b", fontweight="bold", y=0.98)
    fig.tight_layout(rect=[0, 0.03, 1, 0.95])

    if output == "json":
        return {
            "title": params.get("title", "Bollinger Band Matrix"),
            "y_bands": y_bands,
            "x_zones": ["squeeze", "normal", "expansion"],
            "bandwidth_thresholds": {"q33": float(q33), "q66": float(q66)},
            "points": [
                {
                    "symbol": row["symbol"],
                    "percent_b": float(row["y_raw"]),
                    "bandwidth": float(row["bandwidth"]),
                    "x_zone": int(row["x_zone"]),
                    "x": float(row["x"]),
                    "y": float(row["y"]),
                }
                for _, row in df.iterrows()
            ],
        }, "application/json"

    return _fig_to_png(fig), "image/png"
