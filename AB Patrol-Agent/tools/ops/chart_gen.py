#!/usr/bin/env python3
"""
chart_gen.py — Al Brooks 风格 K 线图生成器
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

用法:
  # 单品种多周期
  uv run python tools/ops/chart_gen.py -s BTCUSDT -i 5m,15m,1d

  # patrol-l1 批量（5 品种 × 3 周期）
  uv run python tools/ops/chart_gen.py --patrol --port 8094

  # 清理 3 天前的图片
  uv run python tools/ops/chart_gen.py --cleanup --keep-days 3

输出: data/charts/YYYY-MM-DD/{SYMBOL}_{INTERVAL}_{HHMMSS}.png
"""

import argparse
import os
import shutil
import sys
from datetime import datetime, timedelta
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import mplfinance as mpf
import numpy as np
import pandas as pd
import requests
from _bootstrap import ensure_agent_root_on_path

ROOT = ensure_agent_root_on_path()

# ab_* 模块路径（避免包导入链）
_INDICATORS_DIR = ROOT / "indicators" / "batch"
_AB_EMA_PATH = _INDICATORS_DIR / "ab_ema.py"
_AB_SR_PATH = _INDICATORS_DIR / "ab_sr.py"
_AB_MM_PATH = _INDICATORS_DIR / "ab_mm.py"
_AB_PATTERNS_PATH = _INDICATORS_DIR / "ab_patterns.py"


def _load_ab_module(path: Path, name: str):
    """通用 ab_* 模块懒加载"""
    import types
    mod = types.ModuleType(name)
    mod.__dict__["np"] = np
    mod.__dict__["pd"] = pd
    with open(path) as f:
        lines = f.readlines()
    # 跳过包依赖和 Indicator class
    core = []
    skip = False
    for line in lines:
        if "from ..base" in line or "import pandas" in line:
            continue
        if line.startswith("@register"):
            skip = True
            continue
        if skip and (line.startswith("class ") or line.strip() == ""):
            if line.startswith("class "):
                skip = True
                continue
        if skip and not line.startswith(" ") and not line.startswith("\t") and line.strip():
            if not line.startswith("class "):
                skip = False
        if skip:
            continue
        core.append(line)
    exec(compile("".join(core), name, "exec"), mod.__dict__)
    return mod


_ab_ema_mod = None
_ab_sr_mod = None
_ab_mm_mod = None
_ab_patterns_mod = None


def _get_ab_ema():
    global _ab_ema_mod
    if _ab_ema_mod is None:
        try:
            _ab_ema_mod = _load_ab_module(_AB_EMA_PATH, "ab_ema")
        except Exception as e:
            print(f"  ⚠️  ab_ema load failed: {e}")
    return _ab_ema_mod


def _get_ab_sr():
    global _ab_sr_mod
    if _ab_sr_mod is None:
        try:
            _ab_sr_mod = _load_ab_module(_AB_SR_PATH, "ab_sr")
        except Exception as e:
            print(f"  ⚠️  ab_sr load failed: {e}")
    return _ab_sr_mod


def _get_ab_mm():
    global _ab_mm_mod
    if _ab_mm_mod is None:
        try:
            _ab_mm_mod = _load_ab_module(_AB_MM_PATH, "ab_mm")
        except Exception as e:
            print(f"  ⚠️  ab_mm load failed: {e}")
    return _ab_mm_mod


def _get_ab_patterns():
    global _ab_patterns_mod
    if _ab_patterns_mod is None:
        try:
            _ab_patterns_mod = _load_ab_module(_AB_PATTERNS_PATH, "ab_patterns")
        except Exception as e:
            print(f"  ⚠️  ab_patterns load failed: {e}")
    return _ab_patterns_mod


# ─── 配置 ────────────────────────────────────────────────────

DEFAULT_PORT = 8094

# 项目内存储：data/charts/YYYY-MM-DD/
CHARTS_ROOT = ROOT / "data" / "charts"

PATROL_SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT"]  # patrol-l1 V4.3 三品种

LIMITS = {
    "1m": 80,
    "5m": 150,
    "15m": 150,
    "30m": 150,
    "1h": 150,
    "4h": 150,
    "1d": 150,
}

CLEANUP_KEEP_DAYS = 3  # 默认保留最近 3 天

# ─── 主题 ────────────────────────────────────────────────────

AB_COLORS = mpf.make_marketcolors(
    up="#26a69a", down="#ef5350",
    edge="inherit", wick="inherit",
    volume={"up": "#26a69a80", "down": "#ef535080"},
)

AB_STYLE = mpf.make_mpf_style(
    base_mpf_style="nightclouds",
    marketcolors=AB_COLORS,
    facecolor="#1a1a2e",
    edgecolor="#2a2a3e",
    figcolor="#1a1a2e",
    gridcolor="#2a2a3e",
    gridstyle=":",
    gridaxis="both",
    y_on_right=True,
    rc={
        "axes.labelcolor": "#cccccc",
        "axes.titlesize": 11,
        "xtick.color": "#888888",
        "ytick.color": "#888888",
        "font.size": 9,
    },
)


# ─── 路径管理 ────────────────────────────────────────────────

def _today_dir() -> Path:
    """今天的图片目录: data/charts/YYYY-MM-DD/"""
    d = CHARTS_ROOT / datetime.now().strftime("%Y-%m-%d")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _daily_dir() -> Path:
    """日线图单独目录: data/charts/daily/ (不按日期分，每天覆盖)"""
    d = CHARTS_ROOT / "daily"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _chart_path(symbol: str, interval: str) -> Path:
    """生成带时间戳的文件路径"""
    ts = datetime.now().strftime("%H%M%S")
    if interval == "1d":
        # 日线放 daily/ 目录，文件名不带时间戳（每天覆盖）
        return _daily_dir() / f"{symbol}_1d.png"
    return _today_dir() / f"{symbol}_{interval}_{ts}.png"


def cleanup_old_charts(keep_days: int = CLEANUP_KEEP_DAYS) -> int:
    """清理 keep_days 天前的图片目录"""
    if not CHARTS_ROOT.exists():
        return 0
    cutoff = datetime.now() - timedelta(days=keep_days)
    removed = 0
    for d in CHARTS_ROOT.iterdir():
        if not d.is_dir() or d.name == "daily":
            continue
        try:
            dir_date = datetime.strptime(d.name, "%Y-%m-%d")
            if dir_date < cutoff:
                shutil.rmtree(d)
                removed += 1
                print(f"  🗑️  {d.name}/")
        except ValueError:
            continue
    return removed


# ─── API ─────────────────────────────────────────────────────

def fetch_klines(symbol: str, interval: str, limit: int, port: int) -> dict | None:
    """从 execution-service 获取 K 线数据"""
    url = f"http://localhost:{port}/klines/{symbol}"
    try:
        resp = requests.get(url, params={"interval": interval, "limit": limit}, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            print(f"  ⚠️  {symbol} {interval}: {data['error']}")
            return None
        return data
    except Exception as e:
        print(f"  ❌ {symbol} {interval}: {e}")
        return None


# ─── 数据转换 ────────────────────────────────────────────────

def to_dataframe(data: dict) -> pd.DataFrame:
    """API 响应 → mplfinance DataFrame"""
    bars = data["bars"]
    df = pd.DataFrame(bars)
    df["Date"] = pd.to_datetime(df["time"], utc=True)
    df = df.set_index("Date")
    df = df.rename(columns={"O": "Open", "H": "High", "L": "Low", "C": "Close", "vol": "Volume"})
    for col in ["Open", "High", "Low", "Close", "Volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# ─── S/R 检测 ────────────────────────────────────────────────

def detect_swing_levels(df: pd.DataFrame, window: int = 5, max_levels: int = 6) -> list[dict]:
    """简单 swing high/low 检测"""
    highs = df["High"].values
    lows = df["Low"].values
    levels = []

    for i in range(window, len(df) - window):
        if all(highs[i] >= highs[i - j] for j in range(1, window + 1)) and \
           all(highs[i] >= highs[i + j] for j in range(1, window + 1)):
            levels.append({"price": highs[i], "type": "R", "idx": i})
        if all(lows[i] <= lows[i - j] for j in range(1, window + 1)) and \
           all(lows[i] <= lows[i + j] for j in range(1, window + 1)):
            levels.append({"price": lows[i], "type": "S", "idx": i})

    if not levels:
        return levels
    levels.sort(key=lambda x: x["price"])
    deduped = [levels[0]]
    for lvl in levels[1:]:
        if abs(lvl["price"] - deduped[-1]["price"]) / deduped[-1]["price"] > 0.003:
            deduped.append(lvl)
    deduped.sort(key=lambda x: x["idx"], reverse=True)
    return deduped[:max_levels]


# ─── TR 边界检测 ──────────────────────────────────────────────

def detect_trading_range(df: pd.DataFrame, atr: float) -> dict | None:
    """最近 20 根 range < 2.5 × ATR → Trading Range"""
    if atr <= 0 or len(df) < 20:
        return None
    recent = df.tail(20)
    high = recent["High"].max()
    low = recent["Low"].min()
    if high - low < 2.5 * atr:
        return {"top": high, "bottom": low}
    return None


# ─── 图表生成 ─────────────────────────────────────────────────

def generate_chart(
    symbol: str,
    interval: str,
    port: int = DEFAULT_PORT,
    limit: int | None = None,
    outdir: str | None = None,
) -> str | None:
    """
    生成单张 K 线图。
    返回 PNG 文件路径，失败返回 None。
    """
    if limit is None:
        limit = LIMITS.get(interval, 80)

    data = fetch_klines(symbol, interval, limit, port)
    if not data:
        return None

    df = to_dataframe(data)
    if len(df) < 10:
        print(f"  ⚠️  {symbol} {interval}: data insufficient ({len(df)} bars)")
        return None

    ema_top = data.get("ema20", "—")
    atr_top = data.get("atr14", 0)
    summary = data.get("summary", {})

    # ── addplot ──
    addplots = []

    # EMA20
    if "ema20" in df.columns:
        ema_s = pd.to_numeric(df["ema20"], errors="coerce")
        if ema_s.notna().sum() > 5:
            addplots.append(mpf.make_addplot(ema_s, color="#42A5F5", width=1.8))

    # ── ab_sr: S/R 分析 + 虚线 ──
    hlines_cfg = None
    ab_sr_mod = _get_ab_sr()
    sr_info = {}
    if ab_sr_mod:
        try:
            sr_info = ab_sr_mod.analyze_ab_sr(
                df["Open"].values, df["High"].values,
                df["Low"].values, df["Close"].values,
            )
            # 过滤: 只显示可见范围内的 level (±10% 价格范围)
            price = float(df["Close"].iloc[-1])
            price_range = price * 0.1
            visible_levels = [
                lv for lv in sr_info.get("levels", [])
                if abs(lv["price"] - price) <= price_range
            ]
            # 优先显示重合区 + 最近 S/R，限制 8 条线
            conf_prices = [z["price_center"] for z in sr_info.get("confluence_zones", [])[:3]]
            nearest_s = sr_info.get("nearest_support")
            nearest_r = sr_info.get("nearest_resistance")
            if nearest_s:
                conf_prices.append(nearest_s)
            if nearest_r:
                conf_prices.append(nearest_r)
            # 补充其他 visible levels
            for lv in visible_levels:
                if len(conf_prices) >= 8:
                    break
                if lv["price"] not in conf_prices:
                    conf_prices.append(lv["price"])

            if conf_prices:
                colors = ["#ef535099" if p > price else "#26a69a99" for p in conf_prices]
                hlines_cfg = dict(hlines=conf_prices, colors=colors, linestyle="--", linewidths=0.7)
        except Exception:
            pass

    # Fallback: 简单 swing 检测
    if not hlines_cfg:
        levels = detect_swing_levels(df)
        if levels:
            prices = [lv["price"] for lv in levels]
            colors = ["#ef535099" if lv["type"] == "R" else "#26a69a99" for lv in levels]
            hlines_cfg = dict(hlines=prices, colors=colors, linestyle="--", linewidths=0.7)

    # TR
    tr = detect_trading_range(df, float(atr_top) if atr_top else 0)
    if tr:
        tr_top_line = pd.Series(tr["top"], index=df.index)
        tr_bot_line = pd.Series(tr["bottom"], index=df.index)
        addplots.append(mpf.make_addplot(tr_top_line, color="#ffffff30", width=0.5, linestyle="--"))
        addplots.append(mpf.make_addplot(tr_bot_line, color="#ffffff30", width=0.5, linestyle="--"))

    # ── ab_ema: 分析 + 仅标 PB 事件（不标每根 MAG，太乱）──
    ab_mod = _get_ab_ema()
    ab_info = {}
    if ab_mod and "ema20" in df.columns:
        highs = df["High"].values
        lows = df["Low"].values
        closes = df["Close"].values
        n = len(df)

        try:
            ab_info = ab_mod.analyze_ab_ema(highs, lows, closes)
            # 仅标记 First PB to EMA（可操作事件）
            pb_ago = ab_info.get("first_pb_bars_ago", 0)
            pb_type = ab_info.get("first_pb_type", "none")
            if pb_ago > 0 and pb_ago < n:
                pb_markers = pd.Series(np.nan, index=df.index)
                idx = n - 1 - pb_ago
                if pb_type == "bull_pb":
                    pb_markers.iloc[idx] = lows[idx] * 0.999
                else:
                    pb_markers.iloc[idx] = highs[idx] * 1.001
                addplots.append(mpf.make_addplot(
                    pb_markers, type="scatter", markersize=80,
                    marker="*", color="#FF6D00"  # 橙色星号 = First PB
                ))
        except Exception:
            pass

    # ── ab_mm: MM 目标线 (点线) ──
    ab_mm_mod = _get_ab_mm()
    mm_info = {}
    if ab_mm_mod:
        try:
            mm_info = ab_mm_mod.analyze_ab_mm(
                df["Open"].values, df["High"].values,
                df["Low"].values, df["Close"].values,
            )
            # 只显示最近的多空目标各 1 个
            bull_target = mm_info.get("nearest_bull_target")
            bear_target = mm_info.get("nearest_bear_target")
            if bull_target:
                target_line = pd.Series(bull_target["price"], index=df.index)
                addplots.append(mpf.make_addplot(target_line, color="#26a69a80", width=0.8, linestyle=":"))
            if bear_target:
                target_line = pd.Series(bear_target["price"], index=df.index)
                addplots.append(mpf.make_addplot(target_line, color="#ef535080", width=0.8, linestyle=":"))
        except Exception:
            pass

    # ── ab_patterns: 形态标记 ──
    ab_pat_mod = _get_ab_patterns()
    pat_info = {}
    if ab_pat_mod:
        try:
            pat_info = ab_pat_mod.analyze_ab_patterns(
                df["Open"].values, df["High"].values,
                df["Low"].values, df["Close"].values,
            )
            n = len(df)
            # H/L 入场 (只显示最近 2 个)
            hl_entries = pat_info.get("hl_entries", [])
            recent_hl = sorted(hl_entries, key=lambda x: x["bars_ago"])[:2]
            for entry in recent_hl:
                idx = n - 1 - entry["bars_ago"]
                if 0 <= idx < n:
                    markers = pd.Series(np.nan, index=df.index)
                    if entry["type"].startswith("H"):
                        markers.iloc[idx] = df["Low"].iloc[idx] * 0.998
                        addplots.append(mpf.make_addplot(
                            markers, type="scatter", markersize=60,
                            marker="^", color="#26a69a"
                        ))
                    else:
                        markers.iloc[idx] = df["High"].iloc[idx] * 1.002
                        addplots.append(mpf.make_addplot(
                            markers, type="scatter", markersize=60,
                            marker="v", color="#ef5350"
                        ))

            # DT/DB (最近 1 个)
            dtdb = pat_info.get("dt_db", [])
            if dtdb:
                recent_dtdb = sorted(dtdb, key=lambda x: x.get("low2_bars_ago", x.get("high2_bars_ago", 999)))[0]
                idx = n - 1 - recent_dtdb.get("low2_bars_ago", recent_dtdb.get("high2_bars_ago", 0))
                if 0 <= idx < n:
                    markers = pd.Series(np.nan, index=df.index)
                    if recent_dtdb["type"] == "DB":
                        markers.iloc[idx] = df["Low"].iloc[idx] * 0.997
                        addplots.append(mpf.make_addplot(
                            markers, type="scatter", markersize=80,
                            marker="D", color="#26a69a"
                        ))
                    else:
                        markers.iloc[idx] = df["High"].iloc[idx] * 1.003
                        addplots.append(mpf.make_addplot(
                            markers, type="scatter", markersize=80,
                            marker="D", color="#ef5350"
                        ))

            # Wedge (最近 1 个)
            wedges = pat_info.get("wedges", [])
            if wedges:
                recent_wedge = sorted(wedges, key=lambda x: x["bars_ago"])[0]
                idx = n - 1 - recent_wedge["bars_ago"]
                if 0 <= idx < n:
                    markers = pd.Series(np.nan, index=df.index)
                    if recent_wedge["direction"] == "bull":
                        markers.iloc[idx] = df["Low"].iloc[idx] * 0.996
                    else:
                        markers.iloc[idx] = df["High"].iloc[idx] * 1.004
                    addplots.append(mpf.make_addplot(
                        markers, type="scatter", markersize=100,
                        marker="*", color="#FFA726"
                    ))
        except Exception:
            pass

    # ── title ──
    trend_raw = summary.get("trend", "")
    if "Always In Long" in str(trend_raw):
        trend_tag = "AIL ↑"
    elif "Always In Short" in str(trend_raw):
        trend_tag = "AIS ↓"
    else:
        trend_tag = "—"

    day_type_map = {
        "窄幅区间": "Tight TR",
        "窄幅趋势": "Tight Trend",
        "正常区间": "Normal TR",
        "宽幅区间": "Wide TR",
        "趋势日": "Trend Day",
        "大趋势日": "Strong Trend",
    }
    day_type_raw = summary.get("day_type", "")
    day_type = day_type_map.get(day_type_raw, day_type_raw)

    # ab_ema 补充信息
    slope_tag = ""
    if ab_info:
        s = ab_info.get("ema_slope", "")
        mag_b = ab_info.get("bull_mag_count", 0)
        mag_r = ab_info.get("bear_mag_count", 0)
        if s in ("steep_rise", "rising"):
            slope_tag = f"EMA↑ MAG:{mag_r}B/{mag_b}S"
        elif s in ("steep_fall", "falling"):
            slope_tag = f"EMA↓ MAG:{mag_b}B/{mag_r}S"
        elif s == "flat":
            slope_tag = "EMA— (TR)"

    # 第一行: 基础信息
    title = f"{symbol}  {interval}   EMA20={ema_top}  ATR={atr_top}   {trend_tag}  {day_type}"
    if slope_tag:
        title += f"   {slope_tag}"

    # 第二行: S/R + MM + 形态
    subtitle_parts = []
    if sr_info:
        tr_pos = sr_info.get("tr_position", "—")
        phase = sr_info.get("trend_phase", "—")
        subtitle_parts.append(f"TR:{tr_pos} Phase:{phase}")
        nearest_s = sr_info.get("nearest_support")
        nearest_r = sr_info.get("nearest_resistance")
        if nearest_s:
            s_fmt = f"{nearest_s:.0f}" if nearest_s > 1000 else f"{nearest_s:.2f}"
            subtitle_parts.append(f"S:{s_fmt}")
        if nearest_r:
            r_fmt = f"{nearest_r:.0f}" if nearest_r > 1000 else f"{nearest_r:.2f}"
            subtitle_parts.append(f"R:{r_fmt}")

    if mm_info:
        bull_t = mm_info.get("nearest_bull_target")
        bear_t = mm_info.get("nearest_bear_target")
        if bull_t:
            t_fmt = f"{bull_t['price']:.0f}" if bull_t['price'] > 1000 else f"{bull_t['price']:.2f}"
            subtitle_parts.append(f"MM↑:{t_fmt}")
        if bear_t:
            t_fmt = f"{bear_t['price']:.0f}" if bear_t['price'] > 1000 else f"{bear_t['price']:.2f}"
            subtitle_parts.append(f"MM↓:{t_fmt}")

    if pat_info:
        latest_h = pat_info.get("latest_h")
        latest_l = pat_info.get("latest_l")
        pressure = pat_info.get("pressure", {}).get("direction", "")
        if latest_h:
            subtitle_parts.append(f"{latest_h}")
        if latest_l:
            subtitle_parts.append(f"{latest_l}")
        if pressure and pressure != "neutral":
            p_tag = "买压" if pressure == "bull_pressure" else "卖压"
            subtitle_parts.append(p_tag)

    if subtitle_parts:
        title += "\n" + "   ".join(subtitle_parts)

    # ── output ──
    if outdir:
        Path(outdir).mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime("%H%M%S")
        outpath = os.path.join(outdir, f"{symbol}_{interval}_{ts}.png")
    else:
        outpath = str(_chart_path(symbol, interval))

    kwargs = dict(
        type="candle",
        style=AB_STYLE,
        title=title,
        volume=True,
        figsize=(12, 6),  # 增大尺寸，预留更多空间
        tight_layout=True,
        warn_too_much_data=200,
        savefig=dict(fname=outpath, dpi=120, bbox_inches="tight"),
    )
    if addplots:
        kwargs["addplot"] = addplots
    if hlines_cfg:
        kwargs["hlines"] = hlines_cfg

    try:
        # 先绘制图表（不保存）
        fig, axes = mpf.plot(df, **{k: v for k, v in kwargs.items() if k != "savefig"}, returnfig=True)

        # 添加 S/R 类型标签
        if sr_info and hlines_cfg:
            ax = axes[0]  # 主图 axis
            y_min, y_max = ax.get_ylim()
            x_max = len(df) - 1

            # 类型简写映射
            type_abbr = {
                "swing_high": "SwH", "swing_low": "SwL",
                "bo_origin": "BO", "50pct_pb": "50%",
                "round_number": "Rnd", "gap_traditional": "Gap",
                "gap_body": "GapB", "gap_micro": "GapM",
            }

            # 只标注可见的 S/R（最多 8 个）
            visible_levels = [
                lv for lv in sr_info.get("levels", [])
                if y_min <= lv["price"] <= y_max
            ][:8]

            for lv in visible_levels:
                price = lv["price"]
                lv_type = lv.get("type", "")
                abbr = type_abbr.get(lv_type, lv_type[:4])
                color = "#66BB6A" if lv["side"] == "support" else "#EF5350"

                # 标签位置：右侧，略微偏移
                ax.text(
                    x_max + 1, price, f" {abbr}",
                    fontsize=7, color=color, alpha=0.8,
                    verticalalignment="center",
                    bbox=dict(boxstyle="round,pad=0.3", facecolor="black", alpha=0.6, edgecolor=color, linewidth=0.5)
                )

        # 保存图表
        fig.savefig(outpath, dpi=120, bbox_inches="tight")
        plt.close("all")
        size_kb = os.path.getsize(outpath) / 1024
        print(f"  ✅ {outpath}  ({size_kb:.0f} KB)")
        return outpath
    except Exception as e:
        print(f"  ❌ {symbol} {interval}: {e}")
        plt.close("all")
        return None


# ─── 批量入口 ─────────────────────────────────────────────────

def generate_trading_set(
    symbol: str,
    trading_tf: str = "5m",
    structure_tf: str = "1h",  # 改为 1h
    port: int = DEFAULT_PORT,
    include_daily: bool = True,
) -> list[str]:
    """
    为单个品种生成完整图组:
      - 交易周期 (5m)
      - 结构周期 (1h)
      - 日线 (每天只生成一次)
    """
    paths = []
    print(f"\n{'─'*50}")
    print(f"📊 {symbol}")
    print(f"{'─'*50}")

    for tf in [trading_tf, "15m", structure_tf]:  # 5m, 15m, 1h
        p = generate_chart(symbol, tf, port)
        if p:
            paths.append(p)

    if include_daily:
        daily_path = _daily_dir() / f"{symbol}_1d.png"
        if daily_path.exists():
            mtime = datetime.fromtimestamp(daily_path.stat().st_mtime)
            if mtime.date() == datetime.now().date():
                print("  ℹ️  1d today already generated")
                paths.append(str(daily_path))
                return paths

        p = generate_chart(symbol, "1d", port)
        if p:
            paths.append(p)

    return paths


def generate_patrol_charts(
    port: int = DEFAULT_PORT,
    symbols: list[str] | None = None,
    trading_tf: str = "5m",
    structure_tf: str = "1h",  # 改为 1h
) -> dict[str, list[str]]:
    """patrol-l1 批量：生成所有品种图表（5m, 15m, 1h）"""
    if symbols is None:
        symbols = PATROL_SYMBOLS

    # 每次批量前自动清理旧图片
    removed = cleanup_old_charts()
    if removed:
        print(f"🗑️  cleaned {removed} old chart dirs")

    results = {}
    for sym in symbols:
        paths = generate_trading_set(sym, trading_tf, structure_tf, port)
        results[sym] = paths

    total = sum(len(v) for v in results.values())
    today = _today_dir()
    print(f"\n{'═'*50}")
    print(f"📊 {total} charts → {today}/")
    print(f"{'═'*50}")
    return results


# ─── CLI ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="AL Brooks K line chart generator")
    parser.add_argument("-s", "--symbol", help="Symbol (e.g. BTCUSDT)")
    parser.add_argument("-i", "--intervals", default="5m,15m", help="Intervals (comma-separated)")
    parser.add_argument("-p", "--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("-o", "--outdir", default=None, help="Custom output dir (default: data/charts/)")
    parser.add_argument("-l", "--limit", type=int, default=None)
    parser.add_argument("--patrol", action="store_true", help="patrol-l1 mode: 5 symbols × 3 timeframes")
    parser.add_argument("--symbols", help="Custom symbol list (comma-separated)")
    parser.add_argument("--cleanup", action="store_true", help="Cleanup old chart dirs")
    parser.add_argument("--keep-days", type=int, default=CLEANUP_KEEP_DAYS, help="Days to keep (default 3)")
    args = parser.parse_args()

    if args.cleanup:
        removed = cleanup_old_charts(args.keep_days)
        print(f"Cleaned {removed} dirs (kept last {args.keep_days} days)")
    elif args.patrol:
        syms = [s.strip() for s in args.symbols.split(",")] if args.symbols else None
        generate_patrol_charts(port=args.port, symbols=syms)
    elif args.symbol:
        intervals = [i.strip() for i in args.intervals.split(",")]
        for tf in intervals:
            generate_chart(args.symbol, tf, args.port, limit=args.limit, outdir=args.outdir)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
