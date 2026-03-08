"""
AB MM — Al Brooks Measured Move 模块
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

课程 6 种 MM:
  1. Leg 1 = Leg 2 (最高概率, 自动检测)
  2. TR 高度投影 (TR BO 后, 自动检测)
  3. Measuring Gap (Gap = 移动中点, 自动检测)
  4. Wedge MM (楔形高度投影, 需 ab_patterns 传入参数)
  5. Channel MM (通道宽度投影, 需 ab_patterns 传入参数)
  6. Second-order MM (已有 MM 的二阶投影)

1-3 由 analyze_ab_mm() 自动检测。
4-6 提供纯计算函数，由外部调用 (ab_patterns / patrol-l1)。

课程依据:
  - "Deep PB (~50%) → Leg 1 = Leg 2 is minimum goal"
  - "Strong bull BO: 60% chance of MM up based on bodies"
  - "TR: Always look for MM based on height of TR"
  - "Gaps often lead to Measured Moves"
  - "先使用最近的目标 (Use nearest targets first)"
  - "Move often ends within 1 tick of projection" (Emini)

输出:
  targets: [{price, type, direction, ...}, ...]
  nearest_bull_target, nearest_bear_target
"""

import numpy as np
import pandas as pd
from ..base import Indicator, IndicatorMeta, register


# ─── 内部工具 ──────────────────────────────────────────────────

def _calc_atr(high: np.ndarray, low: np.ndarray, close: np.ndarray,
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


def _find_swings(high: np.ndarray, low: np.ndarray,
                 order: int = 5) -> list[tuple]:
    """轻量 swing 检测: [(index, price, "high"/"low"), ...]"""
    n = len(high)
    swings = []
    for i in range(order, n - order):
        is_sh = True
        for j in range(1, order + 1):
            if high[i] < high[i - j] or high[i] < high[i + j]:
                is_sh = False
                break
        if is_sh:
            swings.append((i, float(high[i]), "high"))

        is_sl = True
        for j in range(1, order + 1):
            if low[i] > low[i - j] or low[i] > low[i + j]:
                is_sl = False
                break
        if is_sl:
            swings.append((i, float(low[i]), "low"))

    swings.sort(key=lambda x: x[0])
    return swings


# ─── 纯计算函数 (可被 ab_patterns / patrol-l1 直接调用) ────────

def calc_leg_mm(leg_height: float, pb_point: float,
                direction: str) -> float:
    """
    Leg 1 = Leg 2 计算。
    课程: "Height of Leg 2 almost equal to height of Leg 1"
    """
    if direction == "up":
        return pb_point + leg_height
    return pb_point - leg_height


def calc_tr_mm(tr_height: float, bo_point: float,
               direction: str) -> float:
    """
    TR 高度投影。
    课程: "Always look for MM based on height of TR"
    """
    if direction == "up":
        return bo_point + tr_height
    return bo_point - tr_height


def calc_gap_mm(move_start: float, gap_mid: float) -> float:
    """
    Measuring Gap MM: Gap = 移动中点 → 投影到对称位置。
    课程: "Gaps often lead to Measured Moves"
    target = move_start + 2 * (gap_mid - move_start)
    """
    return move_start + 2 * (gap_mid - move_start)


def calc_wedge_mm(wedge_height: float, bo_point: float,
                  direction: str) -> float:
    """
    Wedge MM: 楔形高度从 BO 点投影。
    课程: "Sell for Leg 1 = Leg 2 MM down" (at wedge top)
    """
    if direction == "up":
        return bo_point + wedge_height
    return bo_point - wedge_height


def calc_channel_mm(channel_width: float, bo_point: float,
                    direction: str) -> float:
    """
    Channel MM: 通道宽度从 BO 点投影。
    课程: "Based on gap within channel (failed Wedge Top)"
    """
    if direction == "up":
        return bo_point + channel_width
    return bo_point - channel_width


def calc_second_order_mm(first_mm_target: float,
                         original_start: float) -> float:
    """
    二阶 MM: 第一个 MM 到达后，投影同等距离。
    课程: "If break above first target, observe next target"
    target = first_mm + (first_mm - original_start)
    """
    return first_mm_target + (first_mm_target - original_start)


# ─── 自动检测函数 (从原始 OHLC 自动识别) ────────────────────────

def detect_leg_mm(high: np.ndarray, low: np.ndarray,
                  close: np.ndarray, order: int = 5) -> list[dict]:
    """
    自动检测 Leg 1 = Leg 2 MM 目标。

    逻辑:
      1. 找 swing points (枢轴点)
      2. 识别 L→H→L (bull) 或 H→L→H (bear) 序列
      3. PB 深度 30%~80% → 有效 (太深 = 反转, 太浅 = 还没 PB)
      4. 从 PB 点投影 Leg 1 高度

    课程: "When PB is deep (~50%), Leg 1 = Leg 2 is minimum goal"
    """
    swings = _find_swings(high, low, order)
    if len(swings) < 3:
        return []

    targets = []
    n = len(close)

    for i in range(len(swings) - 2):
        s1_idx, s1_price, s1_type = swings[i]
        s2_idx, s2_price, s2_type = swings[i + 1]
        s3_idx, s3_price, s3_type = swings[i + 2]

        # Bull: Low → High → Low (上涨 leg + 回撤)
        if s1_type == "low" and s2_type == "high" and s3_type == "low":
            leg_height = s2_price - s1_price
            if leg_height <= 0:
                continue
            pb_depth = s2_price - s3_price
            pb_ratio = pb_depth / leg_height

            if 0.3 <= pb_ratio <= 0.8:
                target = calc_leg_mm(leg_height, s3_price, "up")
                targets.append({
                    "price": round(target, 6),
                    "type": "leg1_eq_leg2",
                    "direction": "up",
                    "leg_start": s1_price,
                    "leg_end": s2_price,
                    "pb_point": s3_price,
                    "leg_height": round(leg_height, 6),
                    "pb_ratio": round(pb_ratio, 4),
                    "bars_ago": n - 1 - s3_idx,
                })

        # Bear: High → Low → High (下跌 leg + 回撤)
        elif s1_type == "high" and s2_type == "low" and s3_type == "high":
            leg_height = s1_price - s2_price
            if leg_height <= 0:
                continue
            pb_depth = s3_price - s2_price
            pb_ratio = pb_depth / leg_height

            if 0.3 <= pb_ratio <= 0.8:
                target = calc_leg_mm(leg_height, s3_price, "down")
                targets.append({
                    "price": round(target, 6),
                    "type": "leg1_eq_leg2",
                    "direction": "down",
                    "leg_start": s1_price,
                    "leg_end": s2_price,
                    "pb_point": s3_price,
                    "leg_height": round(leg_height, 6),
                    "pb_ratio": round(pb_ratio, 4),
                    "bars_ago": n - 1 - s3_idx,
                })

    return targets


def detect_tr_mm(high: np.ndarray, low: np.ndarray,
                 close: np.ndarray, min_bars: int = 10,
                 lookback: int = 80) -> list[dict]:
    """
    自动检测 TR 高度 MM。

    逻辑:
      1. 在 lookback 范围内找窄幅整理区 (最小 min_bars 根)
      2. 计算 TR 高度
      3. 如果当前价已 BO → 投影 TR 高度

    课程: "Computers also use height of TR for MM projection"
    """
    n = len(close)
    scan = min(lookback, n)
    if scan < min_bars + 5:
        return []

    targets = []
    price = float(close[-1])
    atr = _calc_atr(high, low, close)
    avg_atr = float(np.mean(atr[-scan:]))

    # 滑动窗口找最窄的 min_bars 区间
    best_range = float("inf")
    best_start = 0

    for start in range(n - scan, n - min_bars):
        window_h = float(high[start:start + min_bars].max())
        window_l = float(low[start:start + min_bars].min())
        window_range = window_h - window_l
        if window_range < best_range:
            best_range = window_range
            best_start = start

    if best_range <= 0 or best_range > 5 * avg_atr:
        return []

    tr_top = float(high[best_start:best_start + min_bars].max())
    tr_bottom = float(low[best_start:best_start + min_bars].min())
    tr_height = tr_top - tr_bottom

    # 检查是否已 BO
    if price > tr_top:
        target = calc_tr_mm(tr_height, tr_top, "up")
        targets.append({
            "price": round(target, 6),
            "type": "tr_height",
            "direction": "up",
            "tr_top": tr_top,
            "tr_bottom": tr_bottom,
            "tr_height": round(tr_height, 6),
            "bars_ago": n - 1 - best_start,
        })
    elif price < tr_bottom:
        target = calc_tr_mm(tr_height, tr_bottom, "down")
        targets.append({
            "price": round(target, 6),
            "type": "tr_height",
            "direction": "down",
            "tr_top": tr_top,
            "tr_bottom": tr_bottom,
            "tr_height": round(tr_height, 6),
            "bars_ago": n - 1 - best_start,
        })

    return targets


def detect_gap_mm(high: np.ndarray, low: np.ndarray,
                  close: np.ndarray, lookback: int = 50) -> list[dict]:
    """
    Measuring Gap MM: 未回补 gap = 移动中点 → 投影对称目标。

    课程: "These gaps sometimes become measuring gaps"
    Gap midpoint ≈ move midpoint → target = start + 2*(gap - start)
    """
    n = len(high)
    scan = min(lookback, n - 1)
    targets = []

    for i in range(max(1, n - scan), n):
        gap_mid = None
        direction = None
        move_start = None

        # Gap Up
        if low[i] > high[i - 1]:
            gap_mid = (float(low[i]) + float(high[i - 1])) / 2
            # 检查未回补
            filled = any(low[j] <= high[i - 1] for j in range(i + 1, n))
            if filled:
                continue
            direction = "up"
            # move_start = 最近的 swing low (在 gap 之前)
            move_start = float(low[max(0, i - 10):i].min())

        # Gap Down
        elif high[i] < low[i - 1]:
            gap_mid = (float(high[i]) + float(low[i - 1])) / 2
            filled = any(high[j] >= low[i - 1] for j in range(i + 1, n))
            if filled:
                continue
            direction = "down"
            move_start = float(high[max(0, i - 10):i].max())

        if gap_mid is not None:
            target = calc_gap_mm(move_start, gap_mid)
            targets.append({
                "price": round(target, 6),
                "type": "gap_mm",
                "direction": direction,
                "gap_mid": round(gap_mid, 6),
                "move_start": move_start,
                "bars_ago": n - 1 - i,
            })

    return targets


# ─── 完整分析入口 ─────────────────────────────────────────────────

def analyze_ab_mm(open_arr: np.ndarray, high: np.ndarray,
                  low: np.ndarray, close: np.ndarray) -> dict:
    """
    完整 MM 分析。自动检测 3 种 MM (Leg, TR, Gap)。
    4-6 种 (Wedge, Channel, Second-order) 需外部传入参数调用纯计算函数。

    课程: "Use nearest targets first"
    """
    n = len(close)
    if n < 30:
        return {"error": "data insufficient", "min_required": 30}

    price = float(close[-1])
    all_targets = []

    # 1. Leg 1 = Leg 2
    legs = detect_leg_mm(high, low, close, order=5)
    all_targets.extend(legs)

    # 2. TR 高度 MM
    trs = detect_tr_mm(high, low, close, min_bars=10)
    all_targets.extend(trs)

    # 3. Gap MM
    gaps = detect_gap_mm(high, low, close, lookback=50)
    all_targets.extend(gaps)

    # 按方向分类，找最近目标
    bull_targets = sorted(
        [t for t in all_targets if t["direction"] == "up" and t["price"] > price],
        key=lambda x: x["price"],
    )
    bear_targets = sorted(
        [t for t in all_targets if t["direction"] == "down" and t["price"] < price],
        key=lambda x: x["price"],
        reverse=True,
    )

    return {
        "targets": all_targets,
        "nearest_bull_target": bull_targets[0] if bull_targets else None,
        "nearest_bear_target": bear_targets[0] if bear_targets else None,
        "bull_target_count": len(bull_targets),
        "bear_target_count": len(bear_targets),
        "total_targets": len(all_targets),
        "current_price": price,
    }


# ─── Indicator 接口（trading-service 集成）────────────────────────

@register
class ABMeasuredMove(Indicator):
    meta = IndicatorMeta(
        name="AB_MM.py",
        lookback=300,
        is_incremental=False,
        min_data=30,
    )

    def compute(self, df: pd.DataFrame, symbol: str, interval: str) -> pd.DataFrame:
        if not self._check_data(df):
            return self._make_insufficient_result(df, symbol, interval, {
                "多头目标": None, "空头目标": None,
            })

        result = analyze_ab_mm(
            df["open"].values, df["high"].values,
            df["low"].values, df["close"].values,
        )

        if "error" in result:
            return self._make_insufficient_result(df, symbol, interval, {
                "多头目标": None, "空头目标": None,
            })

        bull = result["nearest_bull_target"]
        bear = result["nearest_bear_target"]

        flat = {
            "多头目标": bull["price"] if bull else None,
            "多头类型": bull["type"] if bull else None,
            "空头目标": bear["price"] if bear else None,
            "空头类型": bear["type"] if bear else None,
            "目标总数": result["total_targets"],
        }

        return self._make_result(df, symbol, interval, flat)
