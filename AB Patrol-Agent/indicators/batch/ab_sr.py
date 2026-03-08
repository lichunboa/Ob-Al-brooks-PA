"""
AB S/R — Al Brooks 支撑阻力分析模块
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

S3b-key-levels.md 定义了 9 种关键位置，本模块负责计算层:
  #1 前日 H/L (从数据推算)
  #2 Swing H/L (枢轴点检测)
  #6 整数关口
  #8 TR 边界 (区间 + 1/3 位置)
  #9 Gap (未回补缺口)
  + BO 起点 (强势 bar 的发射点)
  + 50% PB (回撤中点)
  + 重合评分 (Confluence)

不负责: #3 EMA(→ab_ema.py), #4 趋势线(→ab_patterns.py), #5 MM(→ab_mm.py)

输出 (analyze_ab_sr):
  levels: [{price, type, side, bars_ago}, ...]
  confluence_zones: [{price_center, types, score}, ...]
  nearest_support, nearest_resistance
  tr_position: "top" / "middle" / "bottom"
"""

import numpy as np
import pandas as pd
from ..base import Indicator, IndicatorMeta, register


# ─── ATR 工具 ──────────────────────────────────────────────────

def calc_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray,
             period: int = 14) -> np.ndarray:
    """ATR (Wilder smoothing)"""
    n = len(close)
    tr = np.empty(n)
    tr[0] = high[0] - low[0]
    for i in range(1, n):
        tr[i] = max(high[i] - low[i],
                     abs(high[i] - close[i - 1]),
                     abs(low[i] - close[i - 1]))
    atr = np.empty(n)
    atr[0] = tr[0]
    alpha = 1.0 / period
    for i in range(1, n):
        atr[i] = atr[i - 1] * (1 - alpha) + tr[i] * alpha
    return atr


# ─── 1. Swing H/L 检测 ──────────────────────────────────────────

def detect_swing_hl(high: np.ndarray, low: np.ndarray,
                    order: int = 5, max_levels: int = 10) -> list[dict]:
    """
    Swing High/Low 枢轴点检测。

    课程原文: "Prior swing H/L = 任何周期最强的 S/R"

    Swing High: high[i] >= 两侧各 order 根 bar 的 high
    Swing Low:  low[i]  <= 两侧各 order 根 bar 的 low
    order 越大 → 越"重要"的 swing point
    """
    n = len(high)
    levels = []

    for i in range(order, n - order):
        # Swing High
        is_sh = True
        for j in range(1, order + 1):
            if high[i] < high[i - j] or high[i] < high[i + j]:
                is_sh = False
                break
        if is_sh:
            levels.append({
                "price": float(high[i]),
                "type": "swing_high",
                "side": "resistance",
                "bars_ago": n - 1 - i,
            })

        # Swing Low
        is_sl = True
        for j in range(1, order + 1):
            if low[i] > low[i - j] or low[i] > low[i + j]:
                is_sl = False
                break
        if is_sl:
            levels.append({
                "price": float(low[i]),
                "type": "swing_low",
                "side": "support",
                "bars_ago": n - 1 - i,
            })

    levels.sort(key=lambda x: x["bars_ago"])
    return levels[:max_levels]


# ─── 2. BO 起点检测 ─────────────────────────────────────────────

def detect_bo_origin(open_arr: np.ndarray, high: np.ndarray,
                     low: np.ndarray, close: np.ndarray,
                     atr: np.ndarray, body_mult: float = 1.5,
                     max_levels: int = 6) -> list[dict]:
    """
    BO 起点 = 大实体 bar 的 open，价格常回来测试。

    课程原文: "BO 的起点是未来的 S/R"
    "强 BO bar 表示一方完全控制，其 open = 发射点"

    检测: body > body_mult × ATR 的 bar，open = S/R
    """
    n = len(close)
    levels = []

    for i in range(1, n):
        body = abs(close[i] - open_arr[i])
        if atr[i] > 0 and body > body_mult * atr[i]:
            if close[i] > open_arr[i]:  # Bull BO
                levels.append({
                    "price": float(open_arr[i]),
                    "type": "bo_origin",
                    "side": "support",
                    "bars_ago": n - 1 - i,
                })
            else:  # Bear BO
                levels.append({
                    "price": float(open_arr[i]),
                    "type": "bo_origin",
                    "side": "resistance",
                    "bars_ago": n - 1 - i,
                })

    levels.sort(key=lambda x: x["bars_ago"])
    return levels[:max_levels]


# ─── 3. 50% PB ──────────────────────────────────────────────────

def calc_50pct_pb(high: np.ndarray, low: np.ndarray,
                  close: np.ndarray, lookback: int = 50) -> dict:
    """
    最近 leg 的 50% 回撤位。

    课程原文: "50% PB 是最常见的回撤深度"
    "第一次 PB 到 50% = 健康回撤，深于 50% = PB 力度过大"

    逻辑: lookback 内最高点和最低点 →
      高点在后 → 上涨 leg → 50% 是支撑
      低点在后 → 下跌 leg → 50% 是阻力
    """
    n = len(close)
    scan = min(lookback, n)
    seg_h = high[-scan:]
    seg_l = low[-scan:]

    recent_high = float(seg_h.max())
    recent_low = float(seg_l.min())
    high_idx = int(np.argmax(seg_h))
    low_idx = int(np.argmin(seg_l))

    mid = (recent_high + recent_low) / 2.0
    side = "support" if high_idx > low_idx else "resistance"

    return {
        "price": round(mid, 6),
        "type": "50pct_pb",
        "side": side,
        "leg_high": recent_high,
        "leg_low": recent_low,
        "bars_ago": 0,
    }


# ─── 4. 整数关口 ────────────────────────────────────────────────

def detect_round_numbers(price: float, atr_value: float) -> list[dict]:
    """
    整数关口 = 心理 S/R + 磁体。

    课程原文: "交易者常在整数设止损和止盈 → 整数 = 磁体"
    S3b: "BTC: 50k/60k/100k 等"

    根据价格量级自动选择间距，搜索 ±5ATR 范围。
    strength: 能被多少级整数整除 (1000→1, 5000→2, 10000→3)
    """
    if price > 10000:
        steps = [1000, 5000, 10000]
    elif price > 1000:
        steps = [100, 500, 1000]
    elif price > 100:
        steps = [10, 50, 100]
    elif price > 10:
        steps = [1, 5, 10]
    else:
        steps = [0.1, 0.5, 1.0]

    step = steps[0]
    search_range = max(atr_value * 5, price * 0.03)

    levels = []
    level = (price - search_range) // step * step + step
    while level <= price + search_range:
        strength = sum(1 for s in steps if s > 0 and abs(level % s) < s * 0.001)
        levels.append({
            "price": float(round(level, 6)),
            "type": "round_number",
            "side": "support" if level < price else "resistance",
            "strength": strength,
            "bars_ago": 0,
        })
        level += step

    return levels


# ─── 5. Gap 检测 (完整版) ────────────────────────────────────────

def detect_gaps(high: np.ndarray, low: np.ndarray,
                open_arr: np.ndarray = None, close: np.ndarray = None,
                lookback: int = 50) -> list[dict]:
    """
    Al Brooks 完整 Gap 检测 (3 层)。

    课程原文:
      "Gaps mean strength" — 有 gap = 趋势强
      "Every trend bar is a BO, Gap, and Climax"
      "Gap closed = BO evolves into channel"

    Layer 1: Traditional Gap (low > prev.high 或 high < prev.low)
    Layer 2: Body Gap (实体之间不重叠, 需 open/close)
    Layer 3: Micro Gap (相邻 bar 实体微小空间, 需 open/close)

    每个 gap 标注:
      - filled: 是否已被后续 bar 回补
      - fill_bars: 多少根 bar 后被回补 (0=未回补)
      - gap_class: "breakaway"/"measuring"/"exhaustion"/"common" (基于位置)
    """
    n = len(high)
    scan = min(lookback, n - 1)
    levels = []
    has_oc = open_arr is not None and close is not None

    for i in range(max(1, n - scan), n):
        gaps_at_i = []

        # ── Layer 1: Traditional Gap ──
        if low[i] > high[i - 1]:
            gaps_at_i.append({
                "layer": "traditional",
                "direction": "up",
                "gap_top": float(low[i]),
                "gap_bottom": float(high[i - 1]),
            })
        elif high[i] < low[i - 1]:
            gaps_at_i.append({
                "layer": "traditional",
                "direction": "down",
                "gap_top": float(low[i - 1]),
                "gap_bottom": float(high[i]),
            })

        # ── Layer 2: Body Gap (实体不重叠) ──
        if has_oc:
            prev_body_top = max(open_arr[i - 1], close[i - 1])
            prev_body_bot = min(open_arr[i - 1], close[i - 1])
            curr_body_top = max(open_arr[i], close[i])
            curr_body_bot = min(open_arr[i], close[i])

            if curr_body_bot > prev_body_top:
                gaps_at_i.append({
                    "layer": "body",
                    "direction": "up",
                    "gap_top": float(curr_body_bot),
                    "gap_bottom": float(prev_body_top),
                })
            elif curr_body_top < prev_body_bot:
                gaps_at_i.append({
                    "layer": "body",
                    "direction": "down",
                    "gap_top": float(prev_body_bot),
                    "gap_bottom": float(curr_body_top),
                })

        # ── 处理每个检测到的 gap ──
        for gap in gaps_at_i:
            g_top = gap["gap_top"]
            g_bot = gap["gap_bottom"]
            direction = gap["direction"]

            # 回补检测
            filled = False
            fill_bars = 0
            for j in range(i + 1, n):
                if direction == "up" and low[j] <= g_bot:
                    filled = True
                    fill_bars = j - i
                    break
                elif direction == "down" and high[j] >= g_top:
                    filled = True
                    fill_bars = j - i
                    break

            # Gap 分类 (基于位置: 前1/3=breakaway, 中1/3=measuring, 后1/3=exhaustion)
            position_in_scan = (i - max(1, n - scan)) / max(scan - 1, 1)
            if position_in_scan < 0.33:
                gap_class = "breakaway"
            elif position_in_scan < 0.67:
                gap_class = "measuring"
            else:
                gap_class = "exhaustion" if filled else "measuring"

            side = "support" if direction == "up" else "resistance"
            mid = (g_top + g_bot) / 2

            levels.append({
                "price": round(mid, 6),
                "type": f"gap_{gap['layer']}",
                "side": side,
                "gap_top": g_top,
                "gap_bottom": g_bot,
                "gap_size": round(g_top - g_bot, 6),
                "gap_class": gap_class,
                "filled": filled,
                "fill_bars": fill_bars,
                "bars_ago": n - 1 - i,
            })

    return levels


def calc_gap_stats(high: np.ndarray, low: np.ndarray,
                   open_arr: np.ndarray, close: np.ndarray,
                   lookback: int = 20) -> dict:
    """
    Gap 统计 — 趋势强度指标。

    课程原文:
      "As long as PBs create gaps: still in breakout phase"
      "When gaps close → BO evolves into channel"
      "Micro gap is sign of strength"

    统计 lookback 内:
      - open_gaps: 未回补的 gap 数 (越多 = 趋势越强)
      - filled_gaps: 已回补的 gap 数 (越多 = 进入 channel/TR)
      - micro_gaps: 微型 gap 数 (实体间小空隙)
      - trend_phase: "breakout" / "channel" / "tr"
    """
    n = len(close)
    scan = min(lookback, n - 1)

    open_count = 0
    filled_count = 0
    micro_count = 0

    for i in range(max(1, n - scan), n):
        # Traditional gap
        is_trad_gap = low[i] > high[i - 1] or high[i] < low[i - 1]

        # Micro gap (实体间)
        prev_top = max(open_arr[i - 1], close[i - 1])
        prev_bot = min(open_arr[i - 1], close[i - 1])
        curr_top = max(open_arr[i], close[i])
        curr_bot = min(open_arr[i], close[i])
        is_micro = curr_bot > prev_top or curr_top < prev_bot

        if is_trad_gap or is_micro:
            # 检查是否回补
            direction_up = (low[i] > high[i - 1]) if is_trad_gap else (curr_bot > prev_top)
            filled = False
            if direction_up:
                ref = high[i - 1] if is_trad_gap else prev_top
                filled = any(low[j] <= ref for j in range(i + 1, n))
            else:
                ref = low[i - 1] if is_trad_gap else prev_bot
                filled = any(high[j] >= ref for j in range(i + 1, n))

            if filled:
                filled_count += 1
            else:
                open_count += 1

            if is_micro and not is_trad_gap:
                micro_count += 1

    # 趋势阶段判断
    total = open_count + filled_count
    if total == 0:
        phase = "tr"
    elif open_count > filled_count:
        phase = "breakout"
    elif filled_count > open_count * 2:
        phase = "tr"
    else:
        phase = "channel"

    return {
        "open_gaps": open_count,
        "filled_gaps": filled_count,
        "micro_gaps": micro_count,
        "total_gaps": total,
        "trend_phase": phase,
    }


# ─── 6. TR 位置 ─────────────────────────────────────────────────

def calc_tr_position(price: float, tr_high: float, tr_low: float) -> str:
    """
    价格在 TR 中的 1/3 位置。

    S3b: "底部 1/3 → 60% 先涨 → 偏多
          中间 1/3 → 50/50 → 不做
          顶部 1/3 → 60% 先跌 → 偏空"
    """
    if tr_high <= tr_low:
        return "unknown"
    relative = (price - tr_low) / (tr_high - tr_low)
    if relative <= 1 / 3:
        return "bottom"
    elif relative >= 2 / 3:
        return "top"
    return "middle"


# ─── 7. 重合评分 ────────────────────────────────────────────────

def score_confluence(levels: list[dict], atr_value: float,
                     tolerance_mult: float = 0.5) -> list[dict]:
    """
    S/R 重合评分。

    课程原文: "多个 S/R 重合 = 强磁力 → 高概率反转区"
    S3b: "多个 S/R 重合在 TP 前 → 大概率到不了"

    tolerance = tolerance_mult × ATR 内视为同一区域。
    score = level 数 + type 种类数 (越高 = 越强)
    """
    if not levels:
        return []

    tolerance = atr_value * tolerance_mult
    sorted_lvs = sorted(levels, key=lambda x: x["price"])
    zones = []
    used = set()

    for i, lv in enumerate(sorted_lvs):
        if i in used:
            continue
        cluster = [lv]
        used.add(i)

        for j in range(i + 1, len(sorted_lvs)):
            if j in used:
                continue
            if sorted_lvs[j]["price"] - lv["price"] <= tolerance:
                cluster.append(sorted_lvs[j])
                used.add(j)
            else:
                break

        if len(cluster) >= 2:
            prices = [c["price"] for c in cluster]
            types = list(set(c["type"] for c in cluster))
            zones.append({
                "price_center": round(sum(prices) / len(prices), 6),
                "width": round(max(prices) - min(prices), 6),
                "types": types,
                "count": len(cluster),
                "score": len(cluster) + len(types),
            })

    zones.sort(key=lambda x: x["score"], reverse=True)
    return zones


# ─── 完整分析入口 ─────────────────────────────────────────────────

def analyze_ab_sr(open_arr: np.ndarray, high: np.ndarray,
                  low: np.ndarray, close: np.ndarray) -> dict:
    """
    完整 AB S/R 分析，返回所有 level + 重合区 + 摘要。
    可独立调用 (chart_gen, patrol-l1)，也可通过 Indicator.compute() 调用。
    """
    n = len(close)
    if n < 30:
        return {"error": "data insufficient", "min_required": 30}

    price = float(close[-1])
    atr = calc_atr(high, low, close)
    atr_val = float(atr[-1])

    # ── 收集所有 S/R ──
    all_levels = []

    swings = detect_swing_hl(high, low, order=5, max_levels=10)
    all_levels.extend(swings)

    bos = detect_bo_origin(open_arr, high, low, close, atr,
                           body_mult=1.5, max_levels=6)
    all_levels.extend(bos)

    pb = calc_50pct_pb(high, low, close, lookback=50)
    all_levels.append(pb)

    rounds = detect_round_numbers(price, atr_val)
    all_levels.extend(rounds)

    gaps = detect_gaps(high, low, open_arr, close, lookback=50)
    # Gap level 只取未回补的作为 S/R
    gap_levels = [g for g in gaps if not g.get("filled", False)]
    all_levels.extend(gap_levels)

    # ── Gap 统计 (趋势强度) ──
    gap_stats = calc_gap_stats(high, low, open_arr, close, lookback=20)

    # ── 重合评分 ──
    confluence = score_confluence(all_levels, atr_val)

    # ── 最近支撑/阻力 ──
    supports = [lv for lv in all_levels if lv["price"] < price]
    resistances = [lv for lv in all_levels if lv["price"] > price]

    nearest_sup = max(supports, key=lambda x: x["price"]) if supports else None
    nearest_res = min(resistances, key=lambda x: x["price"]) if resistances else None

    # ── TR 位置 ──
    scan = min(50, n)
    tr_high = float(high[-scan:].max())
    tr_low = float(low[-scan:].min())
    tr_pos = calc_tr_position(price, tr_high, tr_low)

    return {
        "levels": all_levels,
        "all_gaps": gaps,
        "gap_stats": gap_stats,
        "confluence_zones": confluence,
        "nearest_support": nearest_sup["price"] if nearest_sup else None,
        "nearest_resistance": nearest_res["price"] if nearest_res else None,
        "support_type": nearest_sup["type"] if nearest_sup else None,
        "resistance_type": nearest_res["type"] if nearest_res else None,
        "dist_support_pct": round((price - nearest_sup["price"]) / price * 100, 4) if nearest_sup else None,
        "dist_resistance_pct": round((nearest_res["price"] - price) / price * 100, 4) if nearest_res else None,
        "tr_position": tr_pos,
        "tr_high": tr_high,
        "tr_low": tr_low,
        "current_price": price,
        "ATR": round(atr_val, 6),
        "total_levels": len(all_levels),
        "confluence_count": len(confluence),
        "trend_phase": gap_stats["trend_phase"],
    }


# ─── Indicator 接口（trading-service 集成）────────────────────────

@register
class ABSupportResistance(Indicator):
    meta = IndicatorMeta(
        name="AB_SR.py",
        lookback=300,
        is_incremental=False,
        min_data=30,
    )

    def compute(self, df: pd.DataFrame, symbol: str, interval: str) -> pd.DataFrame:
        if not self._check_data(df):
            return self._make_insufficient_result(df, symbol, interval, {
                "最近支撑": None, "最近阻力": None, "TR位置": None,
            })

        result = analyze_ab_sr(
            df["open"].values, df["high"].values,
            df["low"].values, df["close"].values,
        )

        if "error" in result:
            return self._make_insufficient_result(df, symbol, interval, {
                "最近支撑": None, "最近阻力": None, "TR位置": None,
            })

        # 扁平化摘要 (Indicator 标准输出)
        best_zone = result["confluence_zones"][0] if result["confluence_zones"] else None
        flat = {
            "最近支撑": result["nearest_support"],
            "最近阻力": result["nearest_resistance"],
            "支撑类型": result["support_type"],
            "阻力类型": result["resistance_type"],
            "距支撑%": result["dist_support_pct"],
            "距阻力%": result["dist_resistance_pct"],
            "TR位置": result["tr_position"],
            "ATR": result["ATR"],
            "SR总数": result["total_levels"],
            "重合区数": result["confluence_count"],
            "最强重合": (
                f"{best_zone['price_center']}(score={best_zone['score']})"
                if best_zone else "无"
            ),
            "趋势阶段": result["trend_phase"],
            "开放Gap": result["gap_stats"]["open_gaps"],
            "回补Gap": result["gap_stats"]["filled_gaps"],
        }

        return self._make_result(df, symbol, interval, flat)
