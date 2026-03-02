"""
AB EMA — Al Brooks EMA 20 分析模块
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Al Brooks 唯一使用的指标 = EMA 20。
本模块严格按课程原文实现。

课程原文依据:
  - MAG Bull: "gap between MA and high of bar" → high < EMA
  - MAG Bear: "gap between MA and low of bar" → low > EMA
  - First PB to EMA: "买第一个 close below EMA" → first close crossing EMA
  - Multi-TF: "15m EMA on 5m = period 60, 1h EMA on 5m = period 240"
  - AI方向: 定性判断(dominant feature + EMA位置)，非固定数字规则

输出字段:
  EMA20, EMA60, EMA240,
  ema_slope (flat/rising/falling/steep_rise/steep_fall),
  price_vs_ema (above/below/touching),
  bars_above_ema, bars_below_ema (连续计数),
  mag_type (none/bull_mag/bear_mag),
  mag_count_recent (最近20根中的MAG数),
  first_pb_bars_ago (第一次PB到EMA距当前的bar数, 0=无),
  ema_sr_valid (True=趋势中EMA有效, False=TR中无效)
"""

import numpy as np
import pandas as pd
from ..base import Indicator, IndicatorMeta, register


# ─── 核心计算函数（可独立调用）────────────────────────────────

def ema(arr: np.ndarray, period: int) -> np.ndarray:
    """标准 EMA 计算"""
    alpha = 2.0 / (period + 1)
    result = np.empty_like(arr, dtype=float)
    result[0] = arr[0]
    for i in range(1, len(arr)):
        result[i] = arr[i] * alpha + result[i - 1] * (1 - alpha)
    return result


def calc_multi_tf_ema(close: np.ndarray) -> dict:
    """
    Multi-TF EMA (Al Brooks 课程原文):
      - EMA 20: 当前周期
      - EMA 60: 15m on 5m chart (课程说 50 更准确，但标准用 60)
      - EMA 240: 1h on 5m chart (课程说 220 更好，但标准用 240)
    """
    result = {"ema20": ema(close, 20)}

    if len(close) >= 60:
        result["ema60"] = ema(close, 60)
    if len(close) >= 240:
        result["ema240"] = ema(close, 240)

    return result


def calc_ema_slope(ema20: np.ndarray, lookback: int = 5) -> str:
    """
    EMA 斜率判断:
      - flat: EMA 变化 < 0.05% (lookback 根内) → TR 状态
      - rising/falling: 0.05% ~ 0.3%
      - steep_rise/steep_fall: > 0.3% → 强趋势
    """
    if len(ema20) < lookback + 1:
        return "flat"
    recent = ema20[-lookback:]
    pct_change = (recent[-1] - recent[0]) / recent[0] * 100

    if abs(pct_change) < 0.05:
        return "flat"
    elif pct_change > 0.3:
        return "steep_rise"
    elif pct_change > 0.05:
        return "rising"
    elif pct_change < -0.3:
        return "steep_fall"
    else:
        return "falling"


def calc_price_vs_ema(close: np.ndarray, high: np.ndarray, low: np.ndarray,
                      ema20: np.ndarray) -> dict:
    """
    价格与 EMA 的关系 (最后一根 bar):
      - above: close > EMA 且 low > EMA
      - below: close < EMA 且 high < EMA
      - touching: bar 跨越 EMA (low <= EMA <= high)
    """
    c = close[-1]
    h = high[-1]
    lo = low[-1]
    e = ema20[-1]

    if lo > e:
        position = "above"
    elif h < e:
        position = "below"
    else:
        position = "touching"

    return {"price_vs_ema": position}


def count_consecutive_ema_position(close: np.ndarray, ema20: np.ndarray) -> dict:
    """
    从最新 bar 往回数，连续在 EMA 上方/下方的 bar 数。
    Al Brooks: "majority of bars above/below EMA" = AI 方向确认
    """
    n = len(close)
    above_count = 0
    below_count = 0

    # 从最后一根往回数
    for i in range(n - 1, -1, -1):
        if close[i] > ema20[i]:
            if below_count > 0:
                break
            above_count += 1
        elif close[i] < ema20[i]:
            if above_count > 0:
                break
            below_count += 1
        else:
            break  # 精确 = EMA 的很少，视为中断

    return {"bars_above_ema": above_count, "bars_below_ema": below_count}


def detect_mag(high: np.ndarray, low: np.ndarray, ema20: np.ndarray) -> dict:
    """
    MAG (Moving Average Gap) 检测。
    课程原文:
      - Bull MAG: "gap between MA and HIGH of bar" → bar.high < EMA
        (整根 bar 在 EMA 下方，趋势中代表空方力量)
      - Bear MAG: "gap between MA and LOW of bar" → bar.low > EMA
        (整根 bar 在 EMA 上方，趋势中代表多方力量)

    返回:
      - mag_type: 最后一根 bar 的 MAG 类型
      - mag_count_recent: 最近 20 根中 MAG 的数量
      - last_mag_idx: 最后一个 MAG 的位置 (从末尾数)
    """
    n = len(high)
    last_bar_mag = "none"

    # 最后一根 bar
    if high[-1] < ema20[-1]:
        last_bar_mag = "bull_mag"  # 整根在 EMA 下方 → 空方主导
    elif low[-1] > ema20[-1]:
        last_bar_mag = "bear_mag"  # 整根在 EMA 上方 → 多方主导

    # 最近 20 根的 MAG 统计
    lookback = min(20, n)
    bull_mag_count = 0
    bear_mag_count = 0
    last_mag_bars_ago = 0

    for i in range(n - lookback, n):
        if high[i] < ema20[i]:
            bull_mag_count += 1
            last_mag_bars_ago = n - 1 - i
        elif low[i] > ema20[i]:
            bear_mag_count += 1
            last_mag_bars_ago = n - 1 - i

    return {
        "mag_type": last_bar_mag,
        "mag_count_recent": bull_mag_count + bear_mag_count,
        "bull_mag_count": bull_mag_count,
        "bear_mag_count": bear_mag_count,
    }


def detect_first_pullback(close: np.ndarray, ema20: np.ndarray,
                          lookback: int = 30) -> dict:
    """
    第一次 PB 到 EMA 检测。
    课程原文:
      - Bull Trend: "买第一个 close below EMA"
      - Bear Trend: "卖第一个 close above EMA"
      - "强调'第一个' — 后续可能是 last flag before MTR"

    逻辑:
      1. 确定当前趋势方向 (多数 bar 在 EMA 上方 = bull)
      2. 从最近往回扫描，找第一次 close 穿越 EMA
      3. 返回距当前多少根 bar

    返回:
      - first_pb_bars_ago: 距当前多少根 (0 = 没找到)
      - first_pb_type: "bull_pb" / "bear_pb" / "none"
    """
    n = len(close)
    scan_range = min(lookback, n)

    # 确定方向: 最近 scan_range 根中多数在 EMA 上方 or 下方
    above = sum(1 for i in range(n - scan_range, n) if close[i] > ema20[i])
    below = scan_range - above

    if above > below * 1.5:
        # Bull trend: 找第一个 close < EMA 的 bar
        trend = "bull"
        for i in range(n - 1, n - scan_range - 1, -1):
            if i < 0:
                break
            if close[i] < ema20[i]:
                return {
                    "first_pb_bars_ago": n - 1 - i,
                    "first_pb_type": "bull_pb",
                }
    elif below > above * 1.5:
        # Bear trend: 找第一个 close > EMA 的 bar
        trend = "bear"
        for i in range(n - 1, n - scan_range - 1, -1):
            if i < 0:
                break
            if close[i] > ema20[i]:
                return {
                    "first_pb_bars_ago": n - 1 - i,
                    "first_pb_type": "bear_pb",
                }

    return {"first_pb_bars_ago": 0, "first_pb_type": "none"}


def assess_ema_sr_validity(ema_slope: str, close: np.ndarray,
                           ema20: np.ndarray) -> bool:
    """
    EMA 作为 S/R 是否有效:
      - 趋势中 (slope != flat): EMA 是动态 S/R → True
      - TR 中 (slope = flat, 价格反复穿越): EMA 无效 → False

    课程原文: "EMA flat → 无明确 AI 方向，等待 BO"
    """
    if ema_slope == "flat":
        return False

    # 额外检查: 最近 10 根穿越 EMA 超过 3 次 = TR
    n = len(close)
    lookback = min(10, n - 1)
    crossings = 0
    for i in range(n - lookback, n):
        if i < 1:
            continue
        prev_above = close[i - 1] > ema20[i - 1]
        curr_above = close[i] > ema20[i]
        if prev_above != curr_above:
            crossings += 1

    if crossings >= 3:
        return False

    return True


# ─── 完整分析入口 ─────────────────────────────────────────────

def analyze_ab_ema(high: np.ndarray, low: np.ndarray, close: np.ndarray) -> dict:
    """
    完整 AB EMA 分析，返回所有字段。
    可独立调用，也可通过 Indicator.compute() 调用。
    """
    if len(close) < 30:
        return {"error": "data insufficient", "min_required": 30}

    # Multi-TF EMA
    emas = calc_multi_tf_ema(close)
    ema20 = emas["ema20"]

    # 基础数值
    result = {
        "EMA20": round(float(ema20[-1]), 2),
    }
    if "ema60" in emas:
        result["EMA60"] = round(float(emas["ema60"][-1]), 2)
    if "ema240" in emas:
        result["EMA240"] = round(float(emas["ema240"][-1]), 2)

    # EMA 斜率
    slope = calc_ema_slope(ema20)
    result["ema_slope"] = slope

    # Price vs EMA
    pve = calc_price_vs_ema(close, high, low, ema20)
    result.update(pve)

    # 连续计数
    consec = count_consecutive_ema_position(close, ema20)
    result.update(consec)

    # MAG
    mag = detect_mag(high, low, ema20)
    result.update(mag)

    # First PB
    pb = detect_first_pullback(close, ema20)
    result.update(pb)

    # EMA as S/R
    result["ema_sr_valid"] = assess_ema_sr_validity(slope, close, ema20)

    return result


# ─── Indicator 接口（trading-service 集成）────────────────────

@register
class ABEmaAnalysis(Indicator):
    meta = IndicatorMeta(
        name="AB_EMA.py",
        lookback=300,  # 需要 240+ 根算 1h EMA
        is_incremental=False,
        min_data=30,
    )

    def compute(self, df: pd.DataFrame, symbol: str, interval: str) -> pd.DataFrame:
        if not self._check_data(df):
            return self._make_insufficient_result(df, symbol, interval, {
                "EMA20": None, "ema_slope": None, "price_vs_ema": None,
            })

        result = analyze_ab_ema(
            df["high"].values,
            df["low"].values,
            df["close"].values,
        )

        if "error" in result:
            return self._make_insufficient_result(df, symbol, interval, {
                "EMA20": None, "ema_slope": None, "price_vs_ema": None,
            })

        return self._make_result(df, symbol, interval, result)
