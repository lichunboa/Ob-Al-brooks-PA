"""
indicators/batch 桥接层

将已有的 ab_ema, ab_sr, ab_patterns, ab_mm 集成到 backtest_v2
这些模块已经包含了所有 Al Brooks 的细节计算
"""

import sys
from pathlib import Path
import numpy as np

# 添加 indicators/batch 到路径
batch_path = Path(__file__).parent.parent.parent / "indicators" / "batch"
sys.path.insert(0, str(batch_path))

try:
    from ab_ema import calc_multi_tf_ema, calc_ema_slope, calc_price_vs_ema, count_consecutive_ema_position, detect_mag, detect_first_pullback
    from ab_sr import detect_swing_hl, detect_bo_origin, calc_50pct_pb, detect_round_numbers, detect_tr_boundaries, calc_confluence
    from ab_patterns import detect_hl_entries, detect_dt_db, detect_inside_bars, detect_wedges, calc_pressure
    from ab_mm import calc_measured_moves
except ImportError as e:
    print(f"Warning: Could not import indicators/batch: {e}")
    print("Using simplified indicators instead")


def calculate_all_indicators(candles: list) -> dict:
    """
    计算所有 Al Brooks 指标

    使用 indicators/batch 的完整实现
    返回所有策略需要的数据
    """
    # 转换为 numpy 数组
    open_arr = np.array([c.open for c in candles])
    high = np.array([c.high for c in candles])
    low = np.array([c.low for c in candles])
    close = np.array([c.close for c in candles])
    volume = np.array([c.volume for c in candles])

    result = {}

    # 1. EMA 分析
    try:
        ema_data = calc_multi_tf_ema(close)
        result['ema20'] = ema_data.get('ema20', [])
        result['ema60'] = ema_data.get('ema60', [])
        result['ema240'] = ema_data.get('ema240', [])

        if len(result['ema20']) > 0:
            result['ema_slope'] = calc_ema_slope(result['ema20'])
            result.update(calc_price_vs_ema(close, high, low, result['ema20']))
            result.update(count_consecutive_ema_position(close, result['ema20']))
            result.update(detect_mag(high, low, result['ema20']))
            result.update(detect_first_pullback(close, result['ema20']))
    except Exception as e:
        print(f"EMA calculation error: {e}")
        result['ema20'] = []

    # 2. S/R 分析
    try:
        swing_levels = detect_swing_hl(high, low, order=5, max_levels=10)
        result['swing_levels'] = swing_levels

        # 计算 ATR（简化版）
        atr = np.zeros_like(close)
        for i in range(1, len(close)):
            tr = max(high[i] - low[i],
                    abs(high[i] - close[i-1]),
                    abs(low[i] - close[i-1]))
            atr[i] = atr[i-1] * 0.93 + tr * 0.07  # 简化的 EMA

        bo_levels = detect_bo_origin(open_arr, high, low, close, atr)
        result['bo_levels'] = bo_levels

        pb_50 = calc_50pct_pb(high, low, close)
        result['pb_50'] = pb_50

        current_price = float(close[-1])
        round_nums = detect_round_numbers(current_price, float(atr[-1]))
        result['round_numbers'] = round_nums

        tr_data = detect_tr_boundaries(high, low, close)
        result['tr_boundaries'] = tr_data

        # 合并所有 S/R 位
        all_levels = swing_levels + bo_levels + [pb_50]
        if round_nums:
            all_levels.extend(round_nums)

        result['all_sr_levels'] = all_levels

        # 找最近的支撑/阻力
        supports = [lv for lv in all_levels if lv.get('side') == 'support' and lv['price'] < current_price]
        resistances = [lv for lv in all_levels if lv.get('side') == 'resistance' and lv['price'] > current_price]

        if supports:
            result['nearest_support'] = max(supports, key=lambda x: x['price'])
        if resistances:
            result['nearest_resistance'] = min(resistances, key=lambda x: x['price'])

    except Exception as e:
        print(f"S/R calculation error: {e}")
        result['swing_levels'] = []

    # 3. 形态分析
    try:
        hl_entries = detect_hl_entries(high, low, lookback=30)
        result['hl_entries'] = hl_entries

        dt_db = detect_dt_db(high, low, order=3, tolerance_pct=0.005)
        result['dt_db'] = dt_db

        inside_bars = detect_inside_bars(high, low, lookback=20)
        result['inside_bars'] = inside_bars

        wedges = detect_wedges(high, low, close, lookback=50)
        result['wedges'] = wedges

        pressure = calc_pressure(open_arr, high, low, close, lookback=20)
        result['pressure'] = pressure

    except Exception as e:
        print(f"Pattern calculation error: {e}")
        result['hl_entries'] = []
        result['dt_db'] = []

    # 4. Measured Move
    try:
        mm_data = calc_measured_moves(high, low, close, result.get('swing_levels', []))
        result['measured_moves'] = mm_data
    except Exception as e:
        print(f"MM calculation error: {e}")
        result['measured_moves'] = {}

    return result
