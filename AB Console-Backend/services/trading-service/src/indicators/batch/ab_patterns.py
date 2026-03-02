"""
AB Patterns — Al Brooks 形态识别模块
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5 种核心形态:
  1. H1/H2/L1/L2 — 腿计数入场形态 (Al Brooks 标志性方法)
  2. DT/DB + Neckline — 双顶/双底反转
  3. Inside Bars (ii/iii) — 内包 K 线组合
  4. Wedge (3 pushes) — 楔形三推
  5. Pressure — 多根 bar 的买/卖压力读取

课程依据:
  - "H2 is reliable buy signal in bull trend"
  - "All Double Bottoms are H2 buy setups"
  - "Any three push pattern qualifies as wedge"
  - "Many large bull bars clearly more prominent = buying pressure"

输出 (analyze_ab_patterns):
  hl_entries: [{type, bars_ago, entry_price, ...}, ...]
  dt_db: [{type, neckline, ...}, ...]
  inside_bars: [{type, bars_ago, ...}, ...]
  wedges: [{type, direction, ...}, ...]
  pressure: {direction, bull_pct, bear_pct, ...}
"""

import numpy as np
import pandas as pd
from ..base import Indicator, IndicatorMeta, register


# ─── 内部工具 ──────────────────────────────────────────────────

def _find_swings(high: np.ndarray, low: np.ndarray,
                 order: int = 5) -> list[tuple]:
    """轻量 swing 检测: [(index, price, "high"/"low"), ...]"""
    n = len(high)
    swings = []
    for i in range(order, n - order):
        is_sh = all(high[i] >= high[i - j] for j in range(1, order + 1)) and \
                all(high[i] >= high[i + j] for j in range(1, order + 1))
        if is_sh:
            swings.append((i, float(high[i]), "high"))

        is_sl = all(low[i] <= low[i - j] for j in range(1, order + 1)) and \
                all(low[i] <= low[i + j] for j in range(1, order + 1))
        if is_sl:
            swings.append((i, float(low[i]), "low"))

    swings.sort(key=lambda x: x[0])
    return swings


# ─── 1. H1/H2/L1/L2 入场形态 ──────────────────────────────────

def detect_hl_entries(high: np.ndarray, low: np.ndarray,
                      lookback: int = 30) -> list[dict]:
    """
    H1/H2/L1/L2 腿计数。

    课程原文:
      H1: "High 1 ends the first leg of sideways or down move"
          → 回调后第一次 HH (high > prior high)
      H2: "Bar counting: 2 leg down is High 2"
          → 第二次回调后再次 HH
      L1/L2: 对称 (bear 趋势中 LL 计数)

    计数规则:
      - pb_active=True: 当出现 LH (H系列) 或 HL (L系列)
      - 当 pb_active 且出现 HH/LL → 计数+1
      - H1=第1次, H2=第2次 (需中间有回调)
    """
    n = len(high)
    scan = min(lookback, n - 1)
    results = []

    # H 系列 (多头入场: 回调中的 HH 计数)
    h_count = 0
    pb_active = False
    for i in range(max(1, n - scan), n):
        if high[i] < high[i - 1]:
            pb_active = True
        elif high[i] > high[i - 1] and pb_active:
            h_count += 1
            pb_active = False
            if h_count <= 4:
                results.append({
                    "type": f"H{h_count}",
                    "bars_ago": n - 1 - i,
                    "entry_price": float(high[i]),
                    "signal_bar_low": float(low[i - 1]),
                })

    # L 系列 (空头入场: 回弹中的 LL 计数)
    l_count = 0
    rally_active = False
    for i in range(max(1, n - scan), n):
        if low[i] > low[i - 1]:
            rally_active = True
        elif low[i] < low[i - 1] and rally_active:
            l_count += 1
            rally_active = False
            if l_count <= 4:
                results.append({
                    "type": f"L{l_count}",
                    "bars_ago": n - 1 - i,
                    "entry_price": float(low[i]),
                    "signal_bar_high": float(high[i - 1]),
                })

    return results


# ─── 2. DT/DB + Neckline ───────────────────────────────────────

def detect_dt_db(high: np.ndarray, low: np.ndarray,
                 order: int = 3, tolerance_pct: float = 0.005) -> list[dict]:
    """
    双顶/双底检测 + Neckline。

    课程原文:
      "All Double Bottoms are H2 buy setups"
      "All Double Tops are L2 sell setups"
      "Neck Line of DB: if rallies above → TR or Bull Trend"

    tolerance_pct: 两个极值之间允许的偏差比例
    """
    swings = _find_swings(high, low, order)
    results = []

    # 找 swing lows 对 → DB
    lows = [(idx, price) for idx, price, stype in swings if stype == "low"]
    for i in range(len(lows) - 1):
        idx1, p1 = lows[i]
        idx2, p2 = lows[i + 1]
        if abs(p1 - p2) / max(p1, p2) <= tolerance_pct:
            # 找两低点之间的最高点 = neckline
            between_high = float(high[idx1:idx2 + 1].max())
            results.append({
                "type": "DB",
                "low1": p1,
                "low2": p2,
                "low1_bars_ago": len(high) - 1 - idx1,
                "low2_bars_ago": len(high) - 1 - idx2,
                "neckline": between_high,
                "depth": round(between_high - min(p1, p2), 6),
            })

    # 找 swing highs 对 → DT
    highs = [(idx, price) for idx, price, stype in swings if stype == "high"]
    for i in range(len(highs) - 1):
        idx1, p1 = highs[i]
        idx2, p2 = highs[i + 1]
        if abs(p1 - p2) / max(p1, p2) <= tolerance_pct:
            between_low = float(low[idx1:idx2 + 1].min())
            results.append({
                "type": "DT",
                "high1": p1,
                "high2": p2,
                "high1_bars_ago": len(high) - 1 - idx1,
                "high2_bars_ago": len(high) - 1 - idx2,
                "neckline": between_low,
                "depth": round(max(p1, p2) - between_low, 6),
            })

    return results


# ─── 3. Inside Bars ─────────────────────────────────────────────

def detect_inside_bars(high: np.ndarray, low: np.ndarray,
                       lookback: int = 20) -> list[dict]:
    """
    内包 K 线检测 (ib, ii, iii)。

    课程原文:
      ib: "inside bar, within prior bar's range"
      ii: "consecutive inside bars" → 微型 TR
      iii: 3 根连续内包 (罕见, 强压缩)

    检测: high[i] <= high[i-1] AND low[i] >= low[i-1]
    """
    n = len(high)
    scan = min(lookback, n - 1)
    results = []

    i = max(1, n - scan)
    while i < n:
        if high[i] <= high[i - 1] and low[i] >= low[i - 1]:
            # 找连续内包数
            count = 1
            j = i + 1
            while j < n and high[j] <= high[j - 1] and low[j] >= low[j - 1]:
                count += 1
                j += 1

            label = "ib" if count == 1 else f"i{'i' * count}"
            results.append({
                "type": label,
                "count": count,
                "bars_ago": n - 1 - i,
                "range_high": float(high[i - 1]),
                "range_low": float(low[i - 1]),
            })
            i = j
        else:
            i += 1

    return results


# ─── 4. Wedge (3 Pushes) ────────────────────────────────────────

def detect_wedge(high: np.ndarray, low: np.ndarray,
                 order: int = 3) -> list[dict]:
    """
    楔形 (三推) 检测。

    课程原文:
      "Any three push pattern qualifies"
      "Wedge Bull Flags are H3 buy setups"
      "Strong trends always form Wedge reversals, but 80% fail"

    Wedge Up: 3 个递增的 swing high (看跌反转信号)
    Wedge Down: 3 个递减的 swing low (看涨反转信号)
    """
    swings = _find_swings(high, low, order)
    results = []
    n = len(high)

    # Wedge Up: 3 consecutive higher swing highs
    # Al Brooks: 第三推可以不破新高（头肩顶 = MTR）
    highs = [(idx, price) for idx, price, stype in swings if stype == "high"]
    for i in range(len(highs) - 2):
        h1_idx, h1 = highs[i]
        h2_idx, h2 = highs[i + 1]
        h3_idx, h3 = highs[i + 2]

        # Al Brooks 定义：只要求逐推弱化，不要求每推更高
        # 标准 Wedge: h1 < h2 < h3
        # MTR (头肩顶): h1 < h2, h3 ≈ h2 或 h3 < h2（第三推弱化）
        if h1 < h2:  # 前两推必须上升
            push1 = h2 - h1
            push2 = h3 - h2

            # 检测逐推弱化（动量递减）
            momentum_decreasing = push2 < push1

            # Al Brooks: 第三推可以不破新高
            is_standard_wedge = h3 > h2  # 标准 Wedge
            is_mtr = h3 <= h2 and momentum_decreasing  # MTR（头肩顶）

            if is_standard_wedge or is_mtr:
                results.append({
                    "type": "wedge_up" if is_standard_wedge else "mtr_top",
                    "direction": "bear",  # wedge up / MTR → 看跌反转
                    "push1_price": round(h1, 2),
                    "push2_price": round(h2, 2),
                    "push3_price": round(h3, 2),
                    "push1": round(push1, 6),
                    "push2": round(push2, 6),
                    "top": h3,
                    "bars_ago": n - 1 - h3_idx,
                    "momentum_decreasing": momentum_decreasing,
                    "is_mtr": is_mtr,
       })

    # Wedge Down: 3 consecutive lower swing lows
    # Al Brooks: 第三推可以不破新低（头肩底 = MTR）
    lows = [(idx, price) for idx, price, stype in swings if stype == "low"]
    for i in range(len(lows) - 2):
        l1_idx, l1 = lows[i]
        l2_idx, l2 = lows[i + 1]
        l3_idx, l3 = lows[i + 2]

        # Al Brooks 定义：只要求逐推弱化，不要求每推更低
        # 标准 Wedge: l1 > l2 > l3
        # MTR (头肩底): l1 > l2, l3 ≈ l2 或 l3 > l2（第三推弱化）
        if l1 > l2:  # 前两推必须下降
            push1 = l1 - l2
            push2 = l2 - l3

            # 检测逐推弱化（动量递减）
            momentum_decreasing = push2 < push1

            # Al Brooks: 第三推可以不破新低
            is_standard_wedge = l3 < l2  # 标准 Wedge
            is_mtr = l3 >= l2 and momentum_decreasing  # MTR（头肩底）

            if is_standard_wedge or is_mtr:
                results.append({
                    "type": "wedge_down" if is_standard_wedge else "mtr_bottom",
                    "direction": "bull",  # wedge down / MTR → 看涨反转
                    "push1_price": round(l1, 2),
                    "push2_price": round(l2, 2),
                    "push3_price": round(l3, 2),
                    "push1": round(push1, 6),
                    "push2": round(push2, 6),
                    "bottom": l3,
                    "bars_ago": n - 1 - l3_idx,
                    "momentum_decreasing": momentum_decreasing,
                    "is_mtr": is_mtr,
                })
                "push2": round(push2, 6),
                "bottom": l3,
                "bars_ago": n - 1 - l3_idx,
                "momentum_decreasing": push2 < push1,
            })

    return results


# ─── 5. Pressure (买/卖压力) ─────────────────────────────────────

def calc_pressure(open_arr: np.ndarray, high: np.ndarray,
                  low: np.ndarray, close: np.ndarray,
                  lookback: int = 10) -> dict:
    """
    买/卖压力读取。

    课程原文:
      买压: "Many large bull bars clearly more prominent"
            + 收盘接近高点 + 上影短
      卖压: "Many large bear bars clearly more prominent"
            + 收盘接近低点 + 下影短
      中性: "Alternating bull and bear bars, lots of dojis"

    指标:
      - bull_pct: 阳线占比
      - avg_close_position: 平均收盘位置 (0=低, 1=高)
      - body_ratio: 平均实体/总体比
      - direction: "bull_pressure" / "bear_pressure" / "neutral"
    """
    n = len(close)
    scan = min(lookback, n)
    start = n - scan

    bull_count = 0
    close_positions = []
    body_ratios = []

    for i in range(start, n):
        bar_range = high[i] - low[i]
        body = close[i] - open_arr[i]

        if body > 0:
            bull_count += 1

        if bar_range > 0:
            # 收盘在 bar 中的位置: 0=底, 1=顶
            close_pos = (close[i] - low[i]) / bar_range
            close_positions.append(close_pos)
            body_ratios.append(abs(body) / bar_range)
        else:
            close_positions.append(0.5)
            body_ratios.append(0.0)

    bull_pct = bull_count / scan if scan > 0 else 0.5
    avg_close_pos = float(np.mean(close_positions))
    avg_body_ratio = float(np.mean(body_ratios))

    # 方向判断
    if bull_pct >= 0.65 and avg_close_pos >= 0.6:
        direction = "bull_pressure"
    elif bull_pct <= 0.35 and avg_close_pos <= 0.4:
        direction = "bear_pressure"
    else:
        direction = "neutral"

    return {
        "direction": direction,
        "bull_pct": round(bull_pct, 4),
        "avg_close_position": round(avg_close_pos, 4),
        "avg_body_ratio": round(avg_body_ratio, 4),
        "bull_bars": bull_count,
        "total_bars": scan,
    }


# ─── 6. PB 深度分类 ──────────────────────────────────────────────

def classify_pb_depth(high: np.ndarray, low: np.ndarray,
                      close: np.ndarray, lookback: int = 30) -> dict:
    """
    回调深度分类。

    课程原文:
      - Shallow PB (<30%): 趋势强势, H1/L1
      - Normal PB (30-50%): 健康回调
      - Deep PB (50-70%): Leg1=Leg2 最小目标
      - Too Deep (>70%): 可能是反转 (MTR)
    """
    n = len(close)
    scan = min(lookback, n)
    seg_h = high[-scan:]
    seg_l = low[-scan:]

    recent_high = float(seg_h.max())
    recent_low = float(seg_l.min())
    leg_range = recent_high - recent_low

    if leg_range <= 0:
        return {"depth": "unknown", "pct": 0, "leg_range": 0}

    price = float(close[-1])
    high_idx = int(np.argmax(seg_h))
    low_idx = int(np.argmin(seg_l))

    if high_idx > low_idx:
        # 上涨 leg, PB = 从高点回落多少
        pb_amount = recent_high - price
    else:
        # 下跌 leg, PB = 从低点反弹多少
        pb_amount = price - recent_low

    pb_pct = pb_amount / leg_range

    if pb_pct < 0.1:
        depth = "none"
    elif pb_pct < 0.3:
        depth = "shallow"
    elif pb_pct <= 0.5:
        depth = "normal"
    elif pb_pct <= 0.7:
        depth = "deep"
    else:
        depth = "too_deep"

    return {
        "depth": depth,
        "pct": round(pb_pct, 4),
        "leg_range": round(leg_range, 6),
        "leg_direction": "up" if high_idx > low_idx else "down",
    }


# ─── 完整分析入口 ─────────────────────────────────────────────────

def analyze_ab_patterns(open_arr: np.ndarray, high: np.ndarray,
                        low: np.ndarray, close: np.ndarray) -> dict:
    """
    完整形态分析。
    可独立调用 (chart_gen, patrol-l1)，也可通过 Indicator.compute() 调用。
    """
    n = len(close)
    if n < 20:
        return {"error": "data insufficient", "min_required": 20}

    hl = detect_hl_entries(high, low, lookback=30)
    dtdb = detect_dt_db(high, low, order=3)
    inside = detect_inside_bars(high, low, lookback=20)
    wedges = detect_wedge(high, low, order=3)
    pressure = calc_pressure(open_arr, high, low, close, lookback=10)
    pb = classify_pb_depth(high, low, close, lookback=30)

    # 最新的 H/L entry
    recent_hl = sorted(hl, key=lambda x: x["bars_ago"])
    latest_h = next((x for x in recent_hl if x["type"].startswith("H")), None)
    latest_l = next((x for x in recent_hl if x["type"].startswith("L")), None)

    return {
        "hl_entries": hl,
        "dt_db": dtdb,
        "inside_bars": inside,
        "wedges": wedges,
        "pressure": pressure,
        "pb_depth": pb,
        "latest_h": latest_h["type"] if latest_h else None,
        "latest_h_bars_ago": latest_h["bars_ago"] if latest_h else None,
        "latest_l": latest_l["type"] if latest_l else None,
        "latest_l_bars_ago": latest_l["bars_ago"] if latest_l else None,
        "dt_count": sum(1 for x in dtdb if x["type"] == "DT"),
        "db_count": sum(1 for x in dtdb if x["type"] == "DB"),
        "inside_count": len(inside),
        "wedge_count": len(wedges),
    }


# ─── Indicator 接口（trading-service 集成）────────────────────────

@register
class ABPatterns(Indicator):
    meta = IndicatorMeta(
        name="AB_Patterns.py",
        lookback=300,
        is_incremental=False,
        min_data=20,
    )

    def compute(self, df: pd.DataFrame, symbol: str, interval: str) -> pd.DataFrame:
        if not self._check_data(df):
            return self._make_insufficient_result(df, symbol, interval, {
                "最新H": None, "最新L": None, "压力方向": None,
            })

        result = analyze_ab_patterns(
            df["open"].values, df["high"].values,
            df["low"].values, df["close"].values,
        )

        if "error" in result:
            return self._make_insufficient_result(df, symbol, interval, {
                "最新H": None, "最新L": None, "压力方向": None,
            })

        flat = {
            "最新H": result["latest_h"],
            "H距今": result["latest_h_bars_ago"],
            "最新L": result["latest_l"],
            "L距今": result["latest_l_bars_ago"],
            "DT数": result["dt_count"],
            "DB数": result["db_count"],
            "内包数": result["inside_count"],
            "楔形数": result["wedge_count"],
            "压力方向": result["pressure"]["direction"],
            "阳线占比": result["pressure"]["bull_pct"],
            "PB深度": result["pb_depth"]["depth"],
            "PB百分比": result["pb_depth"]["pct"],
        }

        return self._make_result(df, symbol, interval, flat)
