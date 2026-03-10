#!/usr/bin/env python3
"""
PA交易回测工具 V1.0

用历史K线数据回测评分系统，快速迭代策略参数。
数据源: HuggingFace 123olp/binance-futures-ohlcv-2018-2026

用法:
    # 回测最近30天 BTCUSDT
    python scripts/backtest_tool.py --symbol BTCUSDT --days 30

    # 回测指定日期范围
    python scripts/backtest_tool.py --symbol ETHUSDT --start 2025-12-01 --end 2026-01-01

    # 回测所有币种，输出详细报告
    python scripts/backtest_tool.py --all --verbose

    # 调整评分阈值
    python scripts/backtest_tool.py --symbol BTCUSDT --threshold 75 --days 60

依赖:
    pip install pandas pyarrow datasets
"""

import argparse
import json
import sys
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from libs.backtest.cycle_identifier import (
    BACKTEST_STRATEGY_MATRIX,
    CycleIdentifier,
    classify_backtest_market_state,
)
from libs.backtest.indicators import CandlePatterns, calculate_atr, calculate_ema, ema_slope
from libs.backtest.models import BackgroundContext, Candle, MarketState, PASignal, Trade

try:
    import pandas as pd
    import numpy as np
except ImportError:
    print("缺少依赖: pip install pandas numpy pyarrow datasets")
    sys.exit(1)


# ============================================================
# 5. 大周期背景分析
# ============================================================

class BackgroundAnalyzer:
    """根据日线 + 4h 级别确定大周期背景"""

    @staticmethod
    def analyze(daily_candles: list[Candle], h4_candles: list[Candle]) -> BackgroundContext:
        """从日线和4h K线确定背景"""
        # 计算日线EMA20斜率
        daily_prices = [c.close for c in daily_candles]
        daily_ema = calculate_ema(daily_prices, 20)
        daily_slope = ema_slope(daily_ema, 5) if len(daily_ema) >= 5 else 0.0

        # 计算4h EMA20斜率
        h4_prices = [c.close for c in h4_candles]
        h4_ema = calculate_ema(h4_prices, 20)
        h4_slope = ema_slope(h4_ema, 5) if len(h4_ema) >= 5 else 0.0

        # 判断日线趋势
        daily_trend = BackgroundAnalyzer._classify_trend(daily_slope, daily_candles, daily_ema)
        h4_trend = BackgroundAnalyzer._classify_trend(h4_slope, h4_candles, h4_ema)

        # 综合背景判断
        if daily_trend == "多头" and h4_trend == "多头":
            background = "🟢 多头背景"
        elif daily_trend == "空头" and h4_trend == "空头":
            background = "🔴 空头背景"
        elif daily_trend != h4_trend and daily_trend != "中性" and h4_trend != "中性":
            background = "⚡ 震荡背景"
        else:
            background = "⚪ 中性"

        return BackgroundContext(
            daily_trend=daily_trend,
            h4_trend=h4_trend,
            background=background,
            daily_slope=daily_slope,
            h4_slope=h4_slope,
        )

    @staticmethod
    def _classify_trend(slope: float, candles: list[Candle], ema: list[float]) -> str:
        if not ema or not candles:
            return "中性"
        price = candles[-1].close
        ema_val = ema[-1]
        price_above = price > ema_val

        if slope > 0.1 and price_above:
            return "多头"
        elif slope < -0.1 and not price_above:
            return "空头"
        elif abs(slope) < 0.05:
            return "震荡"
        return "中性"


# ============================================================
# 6. 策略检测器 (从 pa_engine.py 移植)
# ============================================================

class StrategyDetector:
    """策略检测器 V2 — 含 H2/L2 + Al Brooks 四状态路由"""

    def detect_all(self, candles: list[Candle], ema20: list[float],
                   atr: float, market_state: MarketState) -> list[PASignal]:
        """对当前K线窗口运行所有策略

        V2 升级:
        - 接受 MarketState 对象，利用 channel_type/is_ttr 做精细路由
        - TTR 直接返回空 (Al Brooks: TTR 是死钱)
        - Tight Channel: H1 + H2 (最高概率组合)
        - Broad Channel: H2 优先 (H1 回调太深不可靠)
        - 新增 H2/L2 二次入场检测器
        """
        signals = []
        cycle = market_state.cycle
        if len(candles) < 5 or not ema20:
            return signals

        # Al Brooks: TTR 不交易
        if market_state.is_ttr:
            return signals

        # 根据周期 + channel_type 运行对应策略
        if cycle == "急速多":
            detectors = [self.detect_high1_spike]
        elif cycle == "急速空":
            detectors = [self.detect_low1_spike]
        elif cycle == "趋势多":
            # V4.2: H2 + 20均线缺口 重新启用
            # H2 需要两个 swing low + 信号棒质量 >= 0.50，实现已足够严格
            detectors = [self.detect_high1,
                         self.detect_h2,
                         self.detect_ema_gap_long,
                         self.detect_breakout_pullback_long]
        elif cycle == "趋势空":
            # V4.2c: L2 仍禁用 — 牛市中 -33~-36% 巨亏, 实现精度不足
            # L2 只有熊市微正 (+5%), 无法补偿牛市损失
            # 20均线缺口(空) 保留 — 全环境正收益 73%+ 胜率
            detectors = [self.detect_low1,
                         self.detect_ema_gap_short,
                         self.detect_breakout_pullback_short]
        elif cycle == "区间":
            detectors = [self.detect_high1_range, self.detect_low1_range,
                         self.detect_fade_breakout, self.detect_double_top,
                         self.detect_double_bottom]
        elif cycle == "反转多":
            detectors = [self.detect_double_bottom, self.detect_wedge_bottom,
                         self.detect_final_flag_long]
        elif cycle == "反转空":
            detectors = [self.detect_double_top, self.detect_wedge_top,
                         self.detect_final_flag_short]
        else:
            detectors = []

        for detector in detectors:
            sig = detector(candles, ema20, atr)
            if sig:
                sig.cycle = cycle
                # P1-3: TR 位置过滤 — 只在上下 1/3 交易
                if cycle == "区间" and self._tr_position_filter(
                        sig, market_state):
                    continue
                signals.append(sig)

        return signals

    @staticmethod
    def _tr_position_filter(
        signal: PASignal, ms: MarketState
    ) -> bool:
        """Al Brooks: 区间中间1/3是死钱，只在边缘交易

        BUY: 只在下1/3 (价格接近 range_low)
        SELL: 只在上1/3 (价格接近 range_high)
        返回 True = 应该过滤掉
        """
        rng = ms.range_high - ms.range_low
        if rng <= 0:
            return False
        pos = (signal.price - ms.range_low) / rng

        if signal.direction == "BUY" and pos > 0.40:
            return True   # 价格在中上部，不做多
        if signal.direction == "SELL" and pos < 0.60:
            return True   # 价格在中下部，不做空
        return False

    # --- 急速方案 ---

    def detect_buy_now(self, candles: list[Candle], ema20: list[float],
                       atr: float) -> Optional[PASignal]:
        """收线追进（做多）: 2+根强势阳线"""
        recent = candles[-5:]
        strong_count = sum(1 for c in recent if CandlePatterns.is_strong_bull(c))
        if strong_count < 2:
            return None
        curr = candles[-1]
        sl = min(c.low for c in recent) if atr == 0 else curr.close - 2.0 * atr
        risk = curr.close - sl
        if risk <= 0:
            return None
        tp = curr.close + risk * 2.0
        return PASignal(
            symbol=curr.symbol, signal_type="收线追进", direction="BUY",
            strength=min(75 + 10 * strong_count, 95),
            message=f"连续{strong_count}根强势阳线",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.60,
            entry_trigger=curr.high,
        )

    def detect_sell_now(self, candles: list[Candle], ema20: list[float],
                        atr: float) -> Optional[PASignal]:
        """收线追进（做空）"""
        recent = candles[-5:]
        strong_count = sum(1 for c in recent if CandlePatterns.is_strong_bear(c))
        if strong_count < 2:
            return None
        curr = candles[-1]
        sl = max(c.high for c in recent) if atr == 0 else curr.close + 2.0 * atr
        risk = sl - curr.close
        if risk <= 0:
            return None
        tp = curr.close - risk * 2.0
        return PASignal(
            symbol=curr.symbol, signal_type="收线追进", direction="SELL",
            strength=min(75 + 10 * strong_count, 95),
            message=f"连续{strong_count}根强势阴线",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.60,
            entry_trigger=curr.low,
        )

    # --- 趋势方案 ---

    def detect_high1(self, candles: list[Candle], ema20: list[float],
                     atr: float) -> Optional[PASignal]:
        """高1: 趋势中首次回调到EMA20附近后反弹
        V2升级: 加入信号棒质量评估，动态strength（80-92）
        低质量信号棒（quality<0.25）直接拒绝
        """
        if len(candles) < 3 or len(ema20) < 3:
            return None
        curr = candles[-1]
        prev = candles[-2]
        ema_val = ema20[-1]
        # 前一根回调至EMA附近（1.5%内）且当前阳线突破前高
        if not (prev.low <= ema_val * 1.015
                and curr.close > prev.high
                and CandlePatterns.is_bull(curr)):
            return None
        # Al Brooks: 信号棒质量过滤 — 只拒绝真正的垃圾棒(无实体+逆向大影线)
        sig_q = CandlePatterns.signal_bar_quality(curr, candles[-6:-1], "BUY")
        if sig_q < 0.25:
            return None
        sl = min(prev.low, candles[-3].low) if len(candles) >= 3 else prev.low
        if atr > 0:
            sl = min(sl, curr.close - 1.5 * atr)
        risk = curr.close - sl
        if risk <= 0:
            return None
        tp = curr.close + risk * 2.5
        # 动态strength: 高质量棒获得奖励，通过质量门的棒最少保持v11水平(85)
        if sig_q >= 0.70:
            strength = 92
        elif sig_q >= 0.55:
            strength = 88
        else:
            strength = 85  # 所有通过门槛的信号棒保持v11基线，不降分
        return PASignal(
            symbol=curr.symbol, signal_type="高1", direction="BUY",
            strength=strength, message=f"回调EMA20后反弹(q={sig_q:.2f})",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.65,
            entry_trigger=curr.high,
        )

    def detect_low1(self, candles: list[Candle], ema20: list[float],
                    atr: float) -> Optional[PASignal]:
        """低1: 趋势中首次反弹到EMA20附近后回落
        V2升级: 加入信号棒质量评估，动态strength（80-92）
        低质量信号棒（quality<0.25）直接拒绝
        """
        if len(candles) < 3 or len(ema20) < 3:
            return None
        curr = candles[-1]
        prev = candles[-2]
        ema_val = ema20[-1]
        if not (prev.high >= ema_val * 0.985
                and curr.close < prev.low
                and CandlePatterns.is_bear(curr)):
            return None
        sig_q = CandlePatterns.signal_bar_quality(curr, candles[-6:-1], "SELL")
        if sig_q < 0.25:
            return None
        sl = max(prev.high, candles[-3].high) if len(candles) >= 3 else prev.high
        if atr > 0:
            sl = max(sl, curr.close + 1.5 * atr)
        risk = sl - curr.close
        if risk <= 0:
            return None
        tp = curr.close - risk * 2.5
        if sig_q >= 0.70:
            strength = 92
        elif sig_q >= 0.55:
            strength = 88
        else:
            strength = 85  # 所有通过门槛的信号棒保持v11基线，不降分
        return PASignal(
            symbol=curr.symbol, signal_type="低1", direction="SELL",
            strength=strength, message=f"反弹EMA20后回落(q={sig_q:.2f})",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.65,
            entry_trigger=curr.low,
        )

    def detect_high1_spike(self, candles: list[Candle], ema20: list[float],
                           atr: float) -> Optional[PASignal]:
        """急速H1: 急速多后第一次回调再入场
        Al Brooks: 急速冲后的第一次回调是最高概率的加仓机会
        """
        if len(candles) < 3 or not ema20:
            return None
        curr = candles[-1]
        prev = candles[-2]
        prev2 = candles[-3]
        # 前一根不是强阳线（回调已开始，不能继续追进）
        if CandlePatterns.is_strong_bull(prev):
            return None
        # 当前棒突破前一棒高点 + 收阳
        if curr.close <= prev.high:
            return None
        if not CandlePatterns.is_bull(curr):
            return None
        sl = min(prev.low, prev2.low)
        if atr > 0:
            sl = min(sl, curr.close - 1.0 * atr)
        risk = curr.close - sl
        if risk <= 0:
            return None
        tp = curr.close + risk * 2.5
        return PASignal(
            symbol=curr.symbol, signal_type="高1", direction="BUY",
            strength=86, message="急速多后回调再入场（急速H1）",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.60,
            entry_trigger=curr.high,
        )

    def detect_low1_spike(self, candles: list[Candle], ema20: list[float],
                          atr: float) -> Optional[PASignal]:
        """急速L1: 急速空后第一次反弹再做空"""
        if len(candles) < 3 or not ema20:
            return None
        curr = candles[-1]
        prev = candles[-2]
        prev2 = candles[-3]
        if CandlePatterns.is_strong_bear(prev):
            return None
        if curr.close >= prev.low:
            return None
        if not CandlePatterns.is_bear(curr):
            return None
        sl = max(prev.high, prev2.high)
        if atr > 0:
            sl = max(sl, curr.close + 1.0 * atr)
        risk = sl - curr.close
        if risk <= 0:
            return None
        tp = curr.close - risk * 2.5
        return PASignal(
            symbol=curr.symbol, signal_type="低1", direction="SELL",
            strength=86, message="急速空后反弹再做空（急速L1）",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.60,
            entry_trigger=curr.low,
        )

    # --- H2/L2 二次入场 (Al Brooks 最高概率入场) ---

    def detect_h2(self, candles: list[Candle], ema20: list[float],
                  atr: float) -> Optional[PASignal]:
        """
        H2 (高2): 趋势多中的二次入场 — Al Brooks 最高概率做多入场

        检测逻辑:
        1. 在最近 25 根中找两个 swing low (双底结构)
        2. 两个低点价差 < 2×ATR (允许 Higher Low)
        3. 两个低点之间有恢复尝试 (H1)
        4. 当前棒阳线突破前棒高点
        5. 信号棒质量 >= 0.50

        V4.2: 增加 EMA20 斜率确认 — 只在趋势确认时触发
        """
        if len(candles) < 25:
            return None

        # V4.2: EMA20 必须明确向上（斜率 > 0.05%），确认趋势有效
        if len(ema20) >= 10:
            ema_slope = (ema20[-1] - ema20[-10]) / ema20[-10] * 100
            if ema_slope < 0.05:
                return None

        curr = candles[-1]
        prev = candles[-2]

        if not CandlePatterns.is_bull(curr):
            return None
        if curr.close <= prev.high:
            return None

        sig_quality = CandlePatterns.signal_bar_quality(
            curr, candles[-6:-1], "BUY")
        if sig_quality < 0.50:
            return None

        lookback = candles[-25:-1]
        swings = CycleIdentifier._find_swings(lookback)
        swing_lows = [s for s in swings if s["type"] == "low"]

        if len(swing_lows) < 2:
            return None

        sl1 = swing_lows[-2]
        sl2 = swing_lows[-1]

        tolerance = (atr * 2.0 if atr > 0
                     else abs(sl1["price"]) * 0.01)
        price_diff = abs(sl2["price"] - sl1["price"])
        if price_diff > tolerance:
            return None

        # 两个低点之间必须有恢复尝试 (H1)
        resume_found = False
        for i in range(sl1["idx"] + 1, sl2["idx"]):
            if i > 0 and lookback[i].high > lookback[i - 1].high:
                resume_found = True
                break
        if not resume_found:
            return None

        bar_gap = sl2["idx"] - sl1["idx"]
        if bar_gap < 3 or bar_gap > 22:
            return None

        stop = min(sl1["price"], sl2["price"])
        if atr > 0:
            stop = min(stop, stop - atr * 0.3)
        risk = curr.close - stop
        if risk <= 0:
            return None
        target = curr.close + risk * 3.0

        strength = 82
        if sig_quality >= 0.65:
            strength += 5
        if price_diff < tolerance * 0.3:
            strength += 3
        if sl2["price"] > sl1["price"]:
            strength += 3  # Higher Low 加分

        return PASignal(
            symbol=curr.symbol, signal_type="高2",
            direction="BUY",
            strength=min(95, strength),
            message=(f"H2双底: 低点"
                     f"{sl1['price']:.1f}/{sl2['price']:.1f}"),
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=stop, take_profit=target,
            probability=0.65,
            entry_trigger=curr.high,
        )

    def detect_l2(self, candles: list[Candle], ema20: list[float],
                  atr: float) -> Optional[PASignal]:
        """
        L2 (低2): 趋势空中的二次入场 — Al Brooks 最高概率做空入场

        检测逻辑 (H2 的镜像):
        1. 找两个 swing high (双顶结构)
        2. 两个高点价差 < 2×ATR (允许 Lower High)
        3. 两个高点之间有回调 (L1)
        4. 当前棒阴线跌破前棒低点

        V4.2: 增加 EMA20 斜率确认 — 防止在牛市回调中做空
        """
        if len(candles) < 25:
            return None

        # V4.2: EMA20 必须明确向下（斜率 < -0.05%），防止牛市中假空
        if len(ema20) >= 10:
            ema_slope = (ema20[-1] - ema20[-10]) / ema20[-10] * 100
            if ema_slope > -0.05:
                return None

        curr = candles[-1]
        prev = candles[-2]

        if not CandlePatterns.is_bear(curr):
            return None
        if curr.close >= prev.low:
            return None

        sig_quality = CandlePatterns.signal_bar_quality(
            curr, candles[-6:-1], "SELL")
        if sig_quality < 0.50:
            return None

        lookback = candles[-25:-1]
        swings = CycleIdentifier._find_swings(lookback)
        swing_highs = [s for s in swings if s["type"] == "high"]

        if len(swing_highs) < 2:
            return None

        sh1 = swing_highs[-2]
        sh2 = swing_highs[-1]

        tolerance = (atr * 2.0 if atr > 0
                     else abs(sh1["price"]) * 0.01)
        price_diff = abs(sh2["price"] - sh1["price"])
        if price_diff > tolerance:
            return None

        pullback_found = False
        for i in range(sh1["idx"] + 1, sh2["idx"]):
            if i > 0 and lookback[i].low < lookback[i - 1].low:
                pullback_found = True
                break
        if not pullback_found:
            return None

        bar_gap = sh2["idx"] - sh1["idx"]
        if bar_gap < 3 or bar_gap > 22:
            return None

        stop = max(sh1["price"], sh2["price"])
        if atr > 0:
            stop = max(stop, stop + atr * 0.3)
        risk = stop - curr.close
        if risk <= 0:
            return None
        target = curr.close - risk * 3.0

        strength = 82
        if sig_quality >= 0.65:
            strength += 5
        if price_diff < tolerance * 0.3:
            strength += 3
        if sh2["price"] < sh1["price"]:
            strength += 3  # Lower High 加分

        return PASignal(
            symbol=curr.symbol, signal_type="低2",
            direction="SELL",
            strength=min(95, strength),
            message=(f"L2双顶: 高点"
                     f"{sh1['price']:.1f}/{sh2['price']:.1f}"),
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=stop, take_profit=target,
            probability=0.65,
            entry_trigger=curr.low,
        )

    # --- 区间方案 ---

    def detect_high1_range(self, candles: list[Candle], ema20: list[float],
                           atr: float) -> Optional[PASignal]:
        """区间H1: 区间内顺EMA方向的第一次回调买点
        Al Brooks: 区间内EMA向上 → 区间偏多 → 等回调后的第一次阳线突破
        """
        if len(candles) < 4 or len(ema20) < 5:
            return None
        curr = candles[-1]
        prev = candles[-2]
        prev2 = candles[-3]
        # EMA斜率向上（含水平）→ 区间内偏多
        # V2: >= 而非 >，避免EMA完全水平时两侧信号都不触发
        ema_slope_up = ema20[-1] >= ema20[-5]
        if not ema_slope_up:
            return None
        # 前一根不是强阳线（不能继续追）
        if CandlePatterns.is_strong_bull(prev):
            return None
        # 当前棒突破前一棒高点 + 收阳
        if curr.close <= prev.high:
            return None
        if not CandlePatterns.is_bull(curr):
            return None
        sl = min(prev.low, prev2.low)
        if atr > 0:
            sl = min(sl, curr.close - 1.0 * atr)
        risk = curr.close - sl
        if risk <= 0:
            return None
        tp = curr.close + risk * 3.0  # 3:1 RR，区间交易要求更高回报
        return PASignal(
            symbol=curr.symbol, signal_type="高1", direction="BUY",
            strength=85, message="区间整理顺EMA方向回调买入（区间H1）",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.55,
            entry_trigger=curr.high,
        )

    def detect_low1_range(self, candles: list[Candle], ema20: list[float],
                          atr: float) -> Optional[PASignal]:
        """区间L1: 区间内顺EMA方向的第一次回调空点"""
        if len(candles) < 4 or len(ema20) < 5:
            return None
        curr = candles[-1]
        prev = candles[-2]
        prev2 = candles[-3]
        # EMA斜率向下（含水平）→ 区间内偏空
        # V2: <= 而非 <，与 detect_high1_range 对称
        ema_slope_dn = ema20[-1] <= ema20[-5]
        if not ema_slope_dn:
            return None
        if CandlePatterns.is_strong_bear(prev):
            return None
        if curr.close >= prev.low:
            return None
        if not CandlePatterns.is_bear(curr):
            return None
        sl = max(prev.high, prev2.high)
        if atr > 0:
            sl = max(sl, curr.close + 1.0 * atr)
        risk = sl - curr.close
        if risk <= 0:
            return None
        tp = curr.close - risk * 3.0
        return PASignal(
            symbol=curr.symbol, signal_type="低1", direction="SELL",
            strength=85, message="区间整理顺EMA方向回调空点（区间L1）",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.55,
            entry_trigger=curr.low,
        )

    def detect_ema_gap_long(self, candles: list[Candle], ema20: list[float],
                            atr: float) -> Optional[PASignal]:
        """20均线缺口（做多）: 早期趋势中首次触及EMA20
        V5.1b 修复: Al Brooks MAG = 只有早期趋势的首次缺口回补才是入场
        晚期缺口回补是 Final Flag 反转预警，不入场
        """
        if len(candles) < 10 or len(ema20) < 10:
            return None
        curr = candles[-1]
        ema_val = ema20[-1]

        # V5.1b: EMA 斜率检查 — 必须在上升趋势中
        slope = (ema20[-1] - ema20[-10]) / ema20[-10] * 100
        if slope < 0.3:  # EMA 不够陡 → 不是新鲜趋势
            return None

        # 检查前5根是否完全脱离EMA（缺口存在）
        all_above = all(
            candles[-(i + 2)].low > ema20[-(i + 2)] * 1.003
            for i in range(5)
            if -(i + 2) >= -len(ema20)
        )
        if not (all_above and curr.low <= ema_val * 1.003
                and curr.close > ema_val):
            return None

        # V5.1b: 真正的 MAG 检查 — 确认这是首次缺口回补
        # 如果最近 20 根中已有 2+ 次触碰 EMA → 不是 MAG，是震荡
        recent_touches = 0
        for i in range(6, min(21, len(candles))):
            if i >= len(ema20):
                break
            c = candles[-i]
            e = ema20[-i]
            if abs(c.close - e) / e < 0.004:
                recent_touches += 1
        if recent_touches >= 2:
            return None  # 非首次缺口回补

        sl = curr.close - 2.0 * atr if atr > 0 else curr.low
        risk = curr.close - sl
        if risk <= 0:
            return None
        tp = curr.close + risk * 2.5
        return PASignal(
            symbol=curr.symbol, signal_type="20均线缺口", direction="BUY",
            strength=85, message="早期趋势首次触及EMA20缺口",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.70,
            entry_trigger=curr.high,
        )

    def detect_ema_gap_short(self, candles: list[Candle], ema20: list[float],
                             atr: float) -> Optional[PASignal]:
        """20均线缺口（做空）: 早期下跌趋势中首次触及EMA20
        V5.1b 修复: 同做多逻辑，区分早期/晚期趋势
        """
        if len(candles) < 10 or len(ema20) < 10:
            return None
        curr = candles[-1]
        ema_val = ema20[-1]

        # V5.1b: EMA 斜率检查 — 必须在下降趋势中
        slope = (ema20[-1] - ema20[-10]) / ema20[-10] * 100
        if slope > -0.3:  # EMA 不够陡 → 不是新鲜趋势
            return None

        all_below = all(
            candles[-(i + 2)].high < ema20[-(i + 2)] * 0.997
            for i in range(5)
            if -(i + 2) >= -len(ema20)
        )
        if not (all_below and curr.high >= ema_val * 0.997
                and curr.close < ema_val):
            return None

        # V5.1b: 真正的 MAG 检查
        recent_touches = 0
        for i in range(6, min(21, len(candles))):
            if i >= len(ema20):
                break
            c = candles[-i]
            e = ema20[-i]
            if abs(c.close - e) / e < 0.004:
                recent_touches += 1
        if recent_touches >= 2:
            return None

        sl = curr.close + 2.0 * atr if atr > 0 else curr.high
        risk = sl - curr.close
        if risk <= 0:
            return None
        tp = curr.close - risk * 2.5
        return PASignal(
            symbol=curr.symbol, signal_type="20均线缺口", direction="SELL",
            strength=85, message="早期趋势首次触及EMA20缺口(空)",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.70,
            entry_trigger=curr.low,
        )

    # --- 区间方案 ---

    def detect_fade_breakout(self, candles: list[Candle], ema20: list[float],
                             atr: float) -> Optional[PASignal]:
        """看衰突破: 区间内突破失败"""
        if len(candles) < 20:
            return None
        window = candles[-20:]
        range_high = max(c.high for c in window[:-2])
        range_low = min(c.low for c in window[:-2])
        curr = candles[-1]
        prev = candles[-2]

        # 上方假突破 → 做空
        if prev.close > range_high and curr.close < range_high:
            midpoint = (range_high + range_low) / 2
            sl = max(prev.high, curr.high) * 1.001
            risk = sl - curr.close
            if risk <= 0:
                return None
            tp = midpoint
            return PASignal(
                symbol=curr.symbol, signal_type="看衰突破", direction="SELL",
                strength=80, message="上方突破失败(80/20规则)",
                timestamp=curr.timestamp, price=curr.close,
                stop_loss=sl, take_profit=tp, probability=0.80,
                entry_trigger=curr.low,
            )

        # 下方假突破 → 做多
        if prev.close < range_low and curr.close > range_low:
            midpoint = (range_high + range_low) / 2
            sl = min(prev.low, curr.low) * 0.999
            risk = curr.close - sl
            if risk <= 0:
                return None
            tp = midpoint
            return PASignal(
                symbol=curr.symbol, signal_type="看衰突破", direction="BUY",
                strength=80, message="下方突破失败(80/20规则)",
                timestamp=curr.timestamp, price=curr.close,
                stop_loss=sl, take_profit=tp, probability=0.80,
                entry_trigger=curr.high,
            )
        return None

    def detect_double_top(self, candles: list[Candle], ema20: list[float],
                          atr: float) -> Optional[PASignal]:
        """双重顶: 两个相近高点 + 反转
        修复: 原retracement公式语义错误，改为检查两顶之间谷底的真实回撤深度
        """
        if len(candles) < 15:
            return None
        curr = candles[-1]
        window = candles[-15:-1]  # 14根K线窗口
        highs = [(i, c.high) for i, c in enumerate(window)]
        highs.sort(key=lambda x: x[1], reverse=True)
        if len(highs) < 2:
            return None
        h1_idx, h1 = highs[0]
        # 当前高点接近前高（1.5%以内）且当前是阴线
        # 注: 0.5%对BTC过严（$60K时只有$300容差），放宽至1.5%
        if abs(curr.high - h1) / h1 >= 0.015:
            return None
        if not CandlePatterns.is_bear(curr):
            return None
        # V2: 信号棒质量 — 反转需要更好的信号棒
        sig_q = CandlePatterns.signal_bar_quality(
            curr, candles[-6:-1], "SELL")
        if sig_q < 0.40:
            return None
        # 两顶之间必须有足够间隔（h1不能是最近1-2根）
        if h1_idx >= 12:
            return None
        bars_between = window[h1_idx + 1:]
        if not bars_between:
            return None
        trough = min(c.low for c in bars_between)
        retreat_pct = (h1 - trough) / h1
        if retreat_pct < 0.003:
            return None
        sl = max(h1, curr.high) * 1.001
        risk = sl - curr.close
        if risk <= 0:
            return None
        tp = curr.close - risk * 3.0
        strength = 80
        if sig_q >= 0.65:
            strength = 87
        elif sig_q >= 0.50:
            strength = 83
        return PASignal(
            symbol=curr.symbol, signal_type="双重顶", direction="SELL",
            strength=strength, message="双重顶反转",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.60,
            entry_trigger=curr.low,
        )

    def detect_double_bottom(self, candles: list[Candle], ema20: list[float],
                             atr: float) -> Optional[PASignal]:
        """双重底
        修复: 原retracement = (peak-l1)/(peak-l1) = 1.0 永远成立（严重Bug）
        改为检查两底之间反弹高度是否足够（至少0.5%）
        """
        if len(candles) < 15:
            return None
        curr = candles[-1]
        window = candles[-15:-1]  # 14根K线窗口
        lows = [(i, c.low) for i, c in enumerate(window)]
        lows.sort(key=lambda x: x[1])
        if len(lows) < 2:
            return None
        l1_idx, l1 = lows[0]
        # 当前低点接近前低（0.5%以内）且当前是阳线
        # 当前低点接近前低（1.5%以内）且当前是阳线
        # 注: 0.5%对BTC过严（$60K时只有$300容差），放宽至1.5%
        if abs(curr.low - l1) / l1 >= 0.015:
            return None
        if not CandlePatterns.is_bull(curr):
            return None
        # V2→V4.1: 信号棒质量过滤（0.40→0.50, 双重底3/7亏损需更严格门控）
        sig_q = CandlePatterns.signal_bar_quality(
            curr, candles[-6:-1], "BUY")
        if sig_q < 0.50:
            return None
        if l1_idx >= 12:
            return None
        bars_between = window[l1_idx + 1:]
        if not bars_between:
            return None
        peak = max(c.high for c in bars_between)
        bounce_pct = (peak - l1) / l1
        if bounce_pct < 0.003:
            return None
        sl = min(l1, curr.low) * 0.999
        risk = curr.close - sl
        if risk <= 0:
            return None
        tp = curr.close + risk * 3.0
        strength = 80
        if sig_q >= 0.65:
            strength = 87
        elif sig_q >= 0.50:
            strength = 83
        return PASignal(
            symbol=curr.symbol, signal_type="双重底", direction="BUY",
            strength=strength, message="双重底反转",
            timestamp=curr.timestamp, price=curr.close,
            stop_loss=sl, take_profit=tp, probability=0.60,
            entry_trigger=curr.high,
        )

    # --- 反转方案 ---

    def detect_wedge_top(self, candles: list[Candle], ema20: list[float],
                         atr: float) -> Optional[PASignal]:
        """楔形顶: 三推形态 + 推动力递减"""
        if len(candles) < 20:
            return None
        # 寻找三个递增高点且推动力递减
        highs = []
        for i in range(len(candles) - 20, len(candles) - 1):
            c = candles[i]
            if i > 0 and c.high > candles[i - 1].high and c.high > candles[i + 1].high if i + 1 < len(candles) else False:
                highs.append((i, c.high))
        if len(highs) < 3:
            return None
        # 检查三推递增但推动力递减
        h1, h2, h3 = highs[-3:]
        push1 = h2[1] - h1[1]
        push2 = h3[1] - h2[1]
        if push1 > 0 and push2 > 0 and push2 < push1 * 0.7:
            curr = candles[-1]
            if CandlePatterns.is_bear(curr):
                # V2: 信号棒质量
                sig_q = CandlePatterns.signal_bar_quality(
                    curr, candles[-6:-1], "SELL")
                if sig_q < 0.40:
                    return None
                sl = h3[1] * 1.001
                risk = sl - curr.close
                if risk <= 0:
                    return None
                tp = curr.close - risk * 3.0
                strength = 80
                if sig_q >= 0.65:
                    strength = 87
                elif sig_q >= 0.50:
                    strength = 83
                return PASignal(
                    symbol=curr.symbol, signal_type="楔形顶",
                    direction="SELL",
                    strength=strength, message="三推递减楔形顶",
                    timestamp=curr.timestamp, price=curr.close,
                    stop_loss=sl, take_profit=tp,
                    probability=0.65,
                    entry_trigger=curr.low,
                )
        return None

    def detect_wedge_bottom(self, candles: list[Candle], ema20: list[float],
                            atr: float) -> Optional[PASignal]:
        """楔形底"""
        if len(candles) < 20:
            return None
        lows = []
        for i in range(len(candles) - 20, len(candles) - 1):
            c = candles[i]
            if i > 0 and c.low < candles[i - 1].low:
                if i + 1 < len(candles) and c.low < candles[i + 1].low:
                    lows.append((i, c.low))
        if len(lows) < 3:
            return None
        l1, l2, l3 = lows[-3:]
        push1 = l1[1] - l2[1]
        push2 = l2[1] - l3[1]
        if push1 > 0 and push2 > 0 and push2 < push1 * 0.7:
            curr = candles[-1]
            if CandlePatterns.is_bull(curr):
                sig_q = CandlePatterns.signal_bar_quality(
                    curr, candles[-6:-1], "BUY")
                if sig_q < 0.40:
                    return None
                sl = l3[1] * 0.999
                risk = curr.close - sl
                if risk <= 0:
                    return None
                tp = curr.close + risk * 3.0
                strength = 80
                if sig_q >= 0.65:
                    strength = 87
                elif sig_q >= 0.50:
                    strength = 83
                return PASignal(
                    symbol=curr.symbol, signal_type="楔形底",
                    direction="BUY",
                    strength=strength, message="三推递减楔形底",
                    timestamp=curr.timestamp, price=curr.close,
                    stop_loss=sl, take_profit=tp,
                    probability=0.65,
                    entry_trigger=curr.high,
                )
        return None

    def detect_breakout_pullback_long(self, candles: list[Candle], ema20: list[float],
                                      atr: float) -> Optional[PASignal]:
        """突破回调(多): 突破区间后回调确认
        修复: 原breakout_size = curr.close - range_high（错误），
              应为 bo_peak - range_high（真实突破幅度）
        """
        if len(candles) < 20:
            return None
        window = candles[-20:]
        range_high = max(c.high for c in window[:-5])
        curr = candles[-1]
        # 前6根内有收盘突破
        broke_above = any(c.close > range_high for c in candles[-6:-1])
        if not broke_above:
            return None
        # 真实突破峰值
        bo_peak = max(c.high for c in candles[-6:-1])
        breakout_size = bo_peak - range_high  # 真实突破幅度（修复）
        if breakout_size <= 0:
            return None
        pullback_low = min(c.low for c in candles[-4:])
        pullback_size = bo_peak - pullback_low  # 从峰值的回调深度
        # 当前K须在区间高以上（未跌破 = 突破有效）
        if curr.close < range_high:
            return None
        # 回调深度 < 突破幅度的61.8%（斐波那契回调）
        if pullback_size <= breakout_size * 0.618:
            sl = pullback_low * 0.999
            risk = curr.close - sl
            if risk <= 0:
                return None
            tp = curr.close + risk * 2.5
            return PASignal(
                symbol=curr.symbol, signal_type="突破回调", direction="BUY",
                strength=85, message="突破后回调确认(多)",
                timestamp=curr.timestamp, price=curr.close,
                stop_loss=sl, take_profit=tp, probability=0.65,
                entry_trigger=curr.high,
            )
        return None

    def detect_breakout_pullback_short(self, candles: list[Candle], ema20: list[float],
                                       atr: float) -> Optional[PASignal]:
        """突破回调(空)
        修复: 同 long 版本，breakout_size 使用真实突破幅度
        """
        if len(candles) < 20:
            return None
        window = candles[-20:]
        range_low = min(c.low for c in window[:-5])
        curr = candles[-1]
        broke_below = any(c.close < range_low for c in candles[-6:-1])
        if not broke_below:
            return None
        bo_trough = min(c.low for c in candles[-6:-1])
        breakout_size = range_low - bo_trough
        if breakout_size <= 0:
            return None
        pullback_high = max(c.high for c in candles[-4:])
        pullback_size = pullback_high - bo_trough
        if curr.close > range_low:
            return None
        if pullback_size <= breakout_size * 0.618:
            sl = pullback_high * 1.001
            risk = sl - curr.close
            if risk <= 0:
                return None
            tp = curr.close - risk * 2.5
            return PASignal(
                symbol=curr.symbol, signal_type="突破回调", direction="SELL",
                strength=85, message="突破后回调确认(空)",
                timestamp=curr.timestamp, price=curr.close,
                stop_loss=sl, take_profit=tp, probability=0.65,
                entry_trigger=curr.low,
            )
        return None

    def _detect_breakout_pullback_short_old(self, candles: list[Candle], ema20: list[float],
                                       atr: float) -> Optional[PASignal]:
        """[已废弃] 原版本保留用于对比"""
        if len(candles) < 20:
            return None
        window = candles[-20:]
        range_low = min(c.low for c in window[:-5])
        curr = candles[-1]
        broke_below = any(c.close < range_low for c in candles[-5:-1])
        if broke_below and curr.close < range_low:
            pullback_high = max(c.high for c in candles[-3:])
            breakout_size = range_low - curr.close
            pullback_size = pullback_high - min(c.low for c in candles[-5:-1])
            if breakout_size > 0 and pullback_size <= breakout_size * 0.5:
                sl = pullback_high * 1.001
                risk = sl - curr.close
                if risk <= 0:
                    return None
                tp = curr.close - risk * 2.5
                return PASignal(
                    symbol=curr.symbol, signal_type="突破回调", direction="SELL",
                    strength=85, message="突破后回调确认(空)",
                    timestamp=curr.timestamp, price=curr.close,
                    stop_loss=sl, take_profit=tp, probability=0.65,
                    entry_trigger=curr.low,
                )
        return None

    def detect_final_flag_long(self, candles: list[Candle], ema20: list[float],
                               atr: float) -> Optional[PASignal]:
        """末端旗形(多): 趋势末期旗形突破失败 → 反转做多"""
        if len(candles) < 20:
            return None
        trend_low = min(c.low for c in candles[-20:-5])
        trend_high = max(c.high for c in candles[-20:-5])
        trend_range = trend_high - trend_low
        flag_candles = candles[-5:]
        flag_range = max(c.high for c in flag_candles) - min(c.low for c in flag_candles)
        curr = candles[-1]
        if trend_range > 0 and flag_range < trend_range * 0.4:
            # 旗形向下突破失败 → 多头反转
            prev = candles[-2]
            flag_low = min(c.low for c in flag_candles)
            if prev.close < flag_low and curr.close > flag_low and CandlePatterns.is_bull(curr):
                sl = min(prev.low, curr.low) * 0.999
                risk = curr.close - sl
                if risk <= 0:
                    return None
                tp = curr.close + risk * 2.5  # 2.5:1 → 反转后续势
                return PASignal(
                    symbol=curr.symbol, signal_type="末端旗形", direction="BUY",
                    strength=85, message="末端旗形空头突破失败→多",
                    timestamp=curr.timestamp, price=curr.close,
                    stop_loss=sl, take_profit=tp, probability=0.70,
                    entry_trigger=curr.high,
                )
        return None

    def detect_final_flag_short(self, candles: list[Candle], ema20: list[float],
                                atr: float) -> Optional[PASignal]:
        """末端旗形(空)"""
        if len(candles) < 20:
            return None
        trend_range = max(c.high for c in candles[-20:-5]) - min(c.low for c in candles[-20:-5])
        flag_candles = candles[-5:]
        flag_range = max(c.high for c in flag_candles) - min(c.low for c in flag_candles)
        curr = candles[-1]
        if trend_range > 0 and flag_range < trend_range * 0.4:
            prev = candles[-2]
            flag_high = max(c.high for c in flag_candles)
            if prev.close > flag_high and curr.close < flag_high and CandlePatterns.is_bear(curr):
                sl = max(prev.high, curr.high) * 1.001
                risk = sl - curr.close
                if risk <= 0:
                    return None
                tp = curr.close - risk * 2.5  # 2.5:1 → 反转后续势
                return PASignal(
                    symbol=curr.symbol, signal_type="末端旗形", direction="SELL",
                    strength=85, message="末端旗形多头突破失败→空",
                    timestamp=curr.timestamp, price=curr.close,
                    stop_loss=sl, take_profit=tp, probability=0.70,
                    entry_trigger=curr.low,
                )
        return None


# ============================================================
# 7. 评分系统（对应 scoring-rubric.md）
# ============================================================

class ScoringEngine:
    """
    评分系统 — 复现 scoring-rubric.md 的逻辑
    V5.0: 可选六维打分（+市场状态匹配度）
    """

    def __init__(self, market_state_enabled: bool = False):
        self.market_state_enabled = market_state_enabled

    def score_signal(self, signal: PASignal, background: BackgroundContext,
                     daily_losses: dict, strategy_history: dict,
                     daily_losses_by_dir: dict = None,
                     atr: float = 0.0) -> tuple[int, list[str]]:
        """
        对信号打分，返回 (总分, 扣分原因列表)
        daily_losses_by_dir: 可选，方向感知亏损计数 {sym: {"BUY": n, "SELL": n}}
        atr: ATR14 值，用于检测 Climax 环境（止损距离过宽）
        """
        reasons = []

        # === 五维打分 ===
        # 1. 趋势强度 (0-20)
        trend_score = self._score_trend(signal)
        # 2. 信号质量 (0-20)
        quality_score = self._score_quality(signal)
        # 3. 策略匹配 (0-25)
        match_score = self._score_match(signal)
        # 4. 盈亏比 (0-20)
        rr_score, rr_ratio = self._score_rr(signal)
        # 5. 风险因素 (0-15)
        risk_score = self._score_risk(signal, daily_losses)

        # 五维基础分（始终不变）
        base_total = (trend_score + quality_score + match_score
                      + rr_score + risk_score)

        if self.market_state_enabled:
            # V5.0: 市场状态作为加法修正（不归一化）
            # ⚠️ 暂时禁用: BTC 30m 回测发现 broad_range 推荐列表
            # 给双重顶 +5 加分, 导致134个边缘信号通过,
            # DD 从10.5%→12.4%, 复利收益损失11.5%.
            # 总PnL几乎无变化 (213% vs 213%) 但DD伤害复利.
            # 需要重新校准 STRATEGY_MATRIX 后再启用.
            # market_score, market_penalty = (
            #     self._score_market_state(signal))
            # base_total += (market_score - 5)
            # base_total = max(0, min(100, base_total))
            # if market_penalty:
            #     base_total -= 20
            #     reasons.append(market_penalty)
            pass

        # === 止损距离/ATR 惩罚 (Climax 环境检测) ===
        # Al Brooks: Climax bar 有巨大实体，止损必须放在其极值之外
        # 导致 SL 距离远超正常 ATR → 即使高评分也是高风险交易
        # 课程: "Bull/Bear Climax 后至少等 10 根 K 线 (TBTL)"
        # 回测诊断: score>=85 的 Top10 亏损中，SL距离平均 4.2×ATR
        sl_atr_deduction = 0
        if atr > 0:
            sl_dist = abs(signal.price - signal.stop_loss)
            sl_atr_ratio = sl_dist / atr
            if sl_atr_ratio > 5.0:
                sl_atr_deduction = 12
                reasons.append(f"SL距离{sl_atr_ratio:.1f}×ATR > 5.0 (Climax环境) -12")
            elif sl_atr_ratio > 4.0:
                sl_atr_deduction = 8
                reasons.append(f"SL距离{sl_atr_ratio:.1f}×ATR > 4.0 (宽止损) -8")
            elif sl_atr_ratio > 3.0:
                sl_atr_deduction = 5
                reasons.append(f"SL距离{sl_atr_ratio:.1f}×ATR > 3.0 -5")

        # === 盈亏比一票否决 ===
        if rr_ratio < 1.5:
            reasons.append(f"盈亏比{rr_ratio:.1f}:1 < 1.5:1 → 总分归零")
            return 0, reasons
        if rr_ratio < 2.0:
            reasons.append(f"盈亏比{rr_ratio:.1f}:1 < 2:1 → 总分归零")
            return 0, reasons

        # === A. 大周期背景扣分 ===
        bg_deduction = 0
        if signal.direction == "BUY" and "空头" in background.background:
            bg_deduction = 15
            reasons.append(f"逆大周期做多(空头背景) -15")
        elif signal.direction == "SELL" and "多头" in background.background:
            bg_deduction = 15
            reasons.append(f"逆大周期做空(多头背景) -15")

        # 4h方向扣分（V2: 10→5，4h背景重要但不绝对，与 libs/backtest/scoring.py 对齐）
        if signal.direction == "BUY" and background.h4_trend == "空头":
            bg_deduction += 5
            reasons.append(f"逆4h方向做多 -5")
        elif signal.direction == "SELL" and background.h4_trend == "多头":
            bg_deduction += 5
            reasons.append(f"逆4h方向做空 -5")

        # 震荡背景用趋势策略
        # V5.1: 加入 高2 — 回测验证震荡环境 H2 亏损 -4.8%, WR 33%
        # Al Brooks: H2 是趋势延续策略，震荡中趋势延续 80% 失败
        trend_strategies = {"收线追进", "高1", "低1", "高2", "20均线缺口", "突破回调"}
        if "震荡" in background.background and signal.signal_type in trend_strategies:
            bg_deduction += 10
            reasons.append(f"震荡背景使用趋势策略({signal.signal_type}) -10")

        # V5.1: 震荡背景中的双重顶也扣分 — 回测证明震荡中 DT WR 33%
        # Al Brooks: "TR 中间的双重顶/底 75% 只是旗形，不是反转"
        if "震荡" in background.background and signal.signal_type in {"双重顶", "双重底"}:
            bg_deduction += 8
            reasons.append(f"震荡背景使用{signal.signal_type}(TR中75%为旗形) -8")

        # === C. 进化记录扣分（V2: 方向感知——BUY亏不惩罚SELL信号）===
        evo_deduction = 0
        # 优先使用方向感知计数；无则回退到总损失
        if daily_losses_by_dir is not None:
            dir_map = daily_losses_by_dir.get(signal.symbol, {})
            symbol_losses = dir_map.get(signal.direction, 0)
        else:
            symbol_losses = daily_losses.get(signal.symbol, 0)
        if symbol_losses >= 2:
            evo_deduction += 15
            reasons.append(
                f"{signal.symbol} {signal.direction}方向今日已止损"
                f"{symbol_losses}次 -15"
            )
        elif symbol_losses == 1:
            evo_deduction += 5
            reasons.append(
                f"{signal.symbol} {signal.direction}方向今日已止损1次 -5"
            )

        strat_key = signal.signal_type
        strat_stats = strategy_history.get(strat_key, {})
        strat_trades = strat_stats.get("trades", 0)
        strat_wins = strat_stats.get("wins", 0)
        if strat_trades >= 5:
            win_rate = strat_wins / strat_trades * 100
            if win_rate < 30:
                evo_deduction += 10
                reasons.append(f"策略{strat_key}近{strat_trades}笔胜率{win_rate:.0f}% -10")

        final_score = max(0, base_total - bg_deduction - evo_deduction - sl_atr_deduction)
        return final_score, reasons

    def _score_trend(self, signal: PASignal) -> int:
        """趋势强度打分
        V2修复: 区间 8→12，与 libs/backtest/scoring.py 对齐
        CycleIdentifier 许可矩阵已过滤不适合的策略，区间H1是合法入场
        """
        cycle = signal.cycle
        if "急速" in cycle:
            return 18
        elif "趋势" in cycle:
            return 15
        elif "区间" in cycle:
            return 12  # V2: 8→12，避免系统性杀死所有区间策略
        elif "反转" in cycle:
            return 12
        return 5

    def _score_quality(self, signal: PASignal) -> int:
        """信号质量 — V3: 新增 90+ 档（对应高质量信号棒的动态strength）
        high1/low1 现在根据信号棒质量动态分配 strength (80/84/88/92)
        这使得 quality_score 真正反映信号棒实际质量，而非固定值
        """
        s = signal.strength
        if s >= 90:
            return 20  # 新增: 高质量信号棒专用档（sig_q>=0.70）
        elif s >= 85:
            return 17
        elif s >= 80:
            return 15
        elif s >= 75:
            return 13
        elif s >= 65:
            return 9
        return 5

    def _score_match(self, signal: PASignal) -> int:
        """策略匹配度 — V3: 新增 90+ 档，与 quality 保持独立维度
        match_score 侧重策略在当前市场状态下的适合度
        """
        s = signal.strength
        if s >= 90:
            return 25  # 新增: 卓越信号棒=策略高度吻合
        elif s >= 85:
            return 22
        elif s >= 80:
            return 19
        elif s >= 75:
            return 16
        return 12

    def _score_rr(self, signal: PASignal) -> tuple[int, float]:
        """盈亏比打分 — 保持 R:S >= 2.0 硬门槛

        回测验证: 动态门槛(1.5x/2.0x)导致DD从10%飙到25-41%
        R:S >= 2.0 硬门槛是经过验证的最优保护
        """
        risk = abs(signal.price - signal.stop_loss)
        reward = abs(signal.take_profit - signal.price)
        if risk == 0:
            return 0, 0.0
        rr = reward / risk
        if rr >= 3.0:
            return 20, rr
        elif rr >= 2.5:
            return 15, rr
        elif rr >= 2.0:
            return 10, rr
        return 0, rr

    def _score_risk(self, signal: PASignal, daily_losses: dict) -> int:
        """风险因素打分"""
        score = 15
        total_losses = sum(daily_losses.values())
        if total_losses >= 3:
            score -= 10
        elif total_losses >= 2:
            score -= 5
        return max(0, score)

    def _score_market_state(self, signal: PASignal) -> tuple[int, str]:
        """V5.0: 市场状态匹配打分 (0-15)
        方向感知: bull 状态的 modifier 不奖励 SELL，反之亦然
        """
        extra = getattr(signal, 'extra', {}) or {}
        rec = extra.get('strategy_recommendation', {})
        if not rec:
            return 5, ""  # 无市场状态信息 → 中性基础分

        recommended = rec.get('recommended', [])
        prohibited = rec.get('prohibited', [])
        modifier = rec.get('score_modifier', 0)
        strat = signal.signal_type
        state = extra.get('market_state', '')

        # 禁止策略 → 强制惩罚
        if strat in prohibited:
            return 0, f"策略[{strat}]在当前市场状态禁止列表中 -20"

        # 方向感知: 逆势信号不享受状态加成
        _BULL = {'strong_trend_bull', 'weak_trend_bull',
                 'breakout_bull'}
        _BEAR = {'strong_trend_bear', 'weak_trend_bear',
                 'breakout_bear'}
        if state in _BULL and signal.direction == 'SELL':
            modifier = min(0, modifier)
        elif state in _BEAR and signal.direction == 'BUY':
            modifier = min(0, modifier)

        # 推荐策略 → 高分
        if strat in recommended:
            return min(15, 10 + max(0, modifier)), ""

        # 中性 → 基础分 + modifier
        return max(0, min(15, 5 + modifier)), ""


# ============================================================
# 8. 交易模拟器
# ============================================================

class TradeSimulator:
    """模拟交易执行和结算"""

    def __init__(self, max_holding_bars: int = 48,
                 scalp_min_bars: int = 2,
                 scalp_max_bars: int = 4,
                 scalp_min_profit: float = 0.30):
        """max_holding_bars: 最大持仓K线数（5m周期下48根=4小时）
        scalp_*: SCALP参数（按周期自动缩放，由BacktestEngine传入）
        """
        self.max_holding_bars = max_holding_bars
        self.scalp_min_bars = scalp_min_bars
        self.scalp_max_bars = scalp_max_bars
        self.scalp_min_profit = scalp_min_profit
        self.open_trades: list[Trade] = []
        self.closed_trades: list[Trade] = []
        self.daily_losses: dict = {}  # {symbol: loss_count_today}
        # V2: 方向感知亏损追踪，区间双向信号相互独立
        self.daily_losses_by_dir: dict = {}  # {symbol: {"BUY": n, "SELL": n}}
        self.strategy_history: dict = {}  # {strategy: {trades, wins, losses}}
        self._current_date: str = ""

    def check_open_trades(self, candle: Candle, bar_index: int):
        """检查持仓是否触及止盈/止损"""
        still_open = []
        for trade in self.open_trades:
            closed = False

            if trade.direction == "BUY":
                # 止损
                if candle.low <= trade.stop_loss:
                    trade.exit_price = trade.stop_loss
                    trade.pnl_pct = (trade.exit_price - trade.entry_price) / trade.entry_price * 100
                    trade.result = "LOSS"
                    trade.exit_time = candle.timestamp
                    trade.exit_reason = "SL"
                    closed = True
                # 止盈
                elif candle.high >= trade.take_profit:
                    trade.exit_price = trade.take_profit
                    trade.pnl_pct = (trade.exit_price - trade.entry_price) / trade.entry_price * 100
                    trade.result = "WIN"
                    trade.exit_time = candle.timestamp
                    trade.exit_reason = "TP"
                    closed = True

            elif trade.direction == "SELL":
                if candle.high >= trade.stop_loss:
                    trade.exit_price = trade.stop_loss
                    trade.pnl_pct = (trade.entry_price - trade.exit_price) / trade.entry_price * 100
                    trade.result = "LOSS"
                    trade.exit_time = candle.timestamp
                    trade.exit_reason = "SL"
                    closed = True
                elif candle.low <= trade.take_profit:
                    trade.exit_price = trade.take_profit
                    trade.pnl_pct = (trade.entry_price - trade.exit_price) / trade.entry_price * 100
                    trade.result = "WIN"
                    trade.exit_time = candle.timestamp
                    trade.exit_reason = "TP"
                    closed = True

            if closed:
                self._record_close(trade)
                self.closed_trades.append(trade)
            else:
                still_open.append(trade)

        self.open_trades = still_open

    def timeout_old_trades(self, candle: Candle):
        """超时平仓 + SCALP早期获利了结 + PA停滞检测
        SCALP逻辑: 持仓2-4根K线后若浮盈>=0.3%，提前平仓锁定利润（v12g最优版本）
        固定阈值0.3%: BTC 51.8% WR | BNB 61.2% WR（经实测优于动态阈值版本）
        Al Brooks: 早期获利了结是高WR交易系统的关键（libs/backtest验证有效）

        V5.1 停滞检测:
        Al Brooks: "Scalp 2-3根K线没动就走" / "Premise 变了立刻走"
        回测诊断: 575/2775=20% 交易 TIMEOUT 出场，其中很多早已停滞
        """
        SCALP_MIN_BARS = self.scalp_min_bars
        SCALP_MAX_BARS = self.scalp_max_bars
        SCALP_MIN_PROFIT = self.scalp_min_profit
        # 停滞检测参数: SCALP 窗口后连续 N 根 K 线浮盈不变化 → 出场
        # V5.1b: 从 3 bars/0.10% 放宽到 5 bars/0.15%（ETH 诊断发现过激进）
        STALL_CHECK_AFTER = SCALP_MAX_BARS + 2  # SCALP 窗口之后开始检测
        STALL_BARS = 5                           # 连续 5 根无进展
        STALL_THRESHOLD = 0.15                   # 浮盈变化 < 0.15% 算停滞

        still_open = []
        for trade in self.open_trades:
            if hasattr(trade, '_bars_held'):
                trade._bars_held += 1
            else:
                trade._bars_held = 1

            # 记录浮盈历史（用于停滞检测）
            if trade.direction == "BUY":
                float_pnl = (candle.close - trade.entry_price) / trade.entry_price * 100
            else:
                float_pnl = (trade.entry_price - candle.close) / trade.entry_price * 100

            if not hasattr(trade, '_pnl_history'):
                trade._pnl_history = []
            trade._pnl_history.append(float_pnl)

            closed = False

            # SCALP早期出场检查（优先于超时）
            if SCALP_MIN_BARS <= trade._bars_held <= SCALP_MAX_BARS:
                if float_pnl >= SCALP_MIN_PROFIT:
                    trade.exit_price = candle.close
                    trade.pnl_pct = float_pnl
                    trade.result = "WIN"
                    trade.exit_time = candle.timestamp
                    trade.exit_reason = "SCALP"
                    self._record_close(trade)
                    self.closed_trades.append(trade)
                    closed = True

            # V5.1: PA 停滞检测 — SCALP 窗口后连续无进展则早退
            # Al Brooks: 交易应该很快证明你是对的，不动就是错的
            if (not closed and trade._bars_held >= STALL_CHECK_AFTER
                    and len(trade._pnl_history) >= STALL_BARS):
                recent = trade._pnl_history[-STALL_BARS:]
                pnl_range = max(recent) - min(recent)
                if pnl_range < STALL_THRESHOLD:
                    trade.exit_price = candle.close
                    trade.pnl_pct = float_pnl
                    trade.result = "WIN" if float_pnl > 0 else "LOSS" if float_pnl < -0.1 else "SCRATCH"
                    trade.exit_time = candle.timestamp
                    trade.exit_reason = "STALL"
                    self._record_close(trade)
                    self.closed_trades.append(trade)
                    closed = True

            # 超时平仓（兜底，停滞检测应已覆盖大部分）
            if not closed and trade._bars_held >= self.max_holding_bars:
                trade.exit_price = candle.close
                trade.pnl_pct = float_pnl
                trade.result = "WIN" if trade.pnl_pct > 0 else "LOSS" if trade.pnl_pct < -0.1 else "SCRATCH"
                trade.exit_time = candle.timestamp
                trade.exit_reason = "TIMEOUT"
                self._record_close(trade)
                self.closed_trades.append(trade)
                closed = True

            if not closed:
                still_open.append(trade)
        self.open_trades = still_open

    def open_trade(self, signal: PASignal, score: int, background: str):
        """开仓"""
        # 每日重置
        date_str = signal.timestamp.strftime("%Y-%m-%d")
        if date_str != self._current_date:
            self._current_date = date_str
            self.daily_losses = {}
            self.daily_losses_by_dir = {}

        # 检查同品种是否已有持仓
        has_same = any(t.symbol == signal.symbol for t in self.open_trades)
        if has_same:
            return  # 禁止同品种重复开仓

        trade = Trade(
            symbol=signal.symbol,
            direction=signal.direction,
            strategy=signal.signal_type,
            entry_price=signal.price,
            stop_loss=signal.stop_loss,
            take_profit=signal.take_profit,
            entry_time=signal.timestamp,
            score=score,
            background=background,
            cycle=signal.cycle,
        )
        trade._bars_held = 0
        self.open_trades.append(trade)

    def _record_close(self, trade: Trade):
        """记录平仓统计"""
        if trade.result == "LOSS":
            self.daily_losses[trade.symbol] = (
                self.daily_losses.get(trade.symbol, 0) + 1
            )
            # 方向感知亏损追踪
            if trade.symbol not in self.daily_losses_by_dir:
                self.daily_losses_by_dir[trade.symbol] = {"BUY": 0, "SELL": 0}
            self.daily_losses_by_dir[trade.symbol][trade.direction] += 1

        strat = trade.strategy
        if strat not in self.strategy_history:
            self.strategy_history[strat] = {"trades": 0, "wins": 0, "losses": 0, "pnl": 0.0}
        self.strategy_history[strat]["trades"] += 1
        if trade.result == "WIN":
            self.strategy_history[strat]["wins"] += 1
        elif trade.result == "LOSS":
            self.strategy_history[strat]["losses"] += 1
        self.strategy_history[strat]["pnl"] += trade.pnl_pct

    def get_stats(self, fee_rate: float = 0.0,
                  initial_capital: float = 500.0,
                  risk_pct: float = 1.0) -> dict:
        """返回回测统计
        fee_rate: 单边手续费(如0.0004=0.04%)，往返=fee_rate*2
        initial_capital: 初始资金(USD)，用于复利计算
        risk_pct: 每笔风险占资金比例(如1.0=1%)
        """
        trades = self.closed_trades
        if not trades:
            return {"total": 0}

        wins = [t for t in trades if t.result == "WIN"]
        losses = [t for t in trades if t.result == "LOSS"]
        total_pnl = sum(t.pnl_pct for t in trades)
        win_rate = len(wins) / len(trades) * 100 if trades else 0

        # 按策略统计
        by_strategy = {}
        for t in trades:
            if t.strategy not in by_strategy:
                by_strategy[t.strategy] = {"trades": 0, "wins": 0, "pnl": 0.0}
            by_strategy[t.strategy]["trades"] += 1
            if t.result == "WIN":
                by_strategy[t.strategy]["wins"] += 1
            by_strategy[t.strategy]["pnl"] += t.pnl_pct

        # 按背景统计
        by_bg = {}
        for t in trades:
            bg = t.background
            if bg not in by_bg:
                by_bg[bg] = {"trades": 0, "wins": 0, "pnl": 0.0}
            by_bg[bg]["trades"] += 1
            if t.result == "WIN":
                by_bg[bg]["wins"] += 1
            by_bg[bg]["pnl"] += t.pnl_pct

        # 按方向统计
        by_dir = {}
        for t in trades:
            d = t.direction
            if d not in by_dir:
                by_dir[d] = {"trades": 0, "wins": 0, "pnl": 0.0}
            by_dir[d]["trades"] += 1
            if t.result == "WIN":
                by_dir[d]["wins"] += 1
            by_dir[d]["pnl"] += t.pnl_pct

        scalp_count = sum(1 for t in wins if t.exit_reason == "SCALP")
        tp_count = sum(1 for t in wins if t.exit_reason == "TP")
        timeout_wins = sum(1 for t in trades
                          if t.exit_reason == "TIMEOUT" and t.result == "WIN")
        stall_count = sum(1 for t in trades if t.exit_reason == "STALL")

        # ── 复利权益曲线（基于风险百分比仓位 + 手续费）─────────────────
        fee_rt = fee_rate * 2  # 往返手续费
        risk_frac = risk_pct / 100.0
        capital = initial_capital
        peak_cap = initial_capital
        max_drawdown_usd = 0.0
        equity_curve = [initial_capital]

        sorted_trades = sorted(trades, key=lambda t: t.exit_time or t.entry_time)
        for t in sorted_trades:
            sl_dist = abs(t.entry_price - t.stop_loss)
            if sl_dist <= 0 or t.entry_price <= 0:
                continue
            sl_pct = sl_dist / t.entry_price  # SL距离(小数)
            # 仓位占比 = 风险金额 / (SL距离×仓位面值)，上限100%
            pos_frac = min(risk_frac / sl_pct, 1.0)
            net_pnl_pct = (t.pnl_pct / 100.0) - fee_rt  # 净收益率
            dollar_pnl = capital * pos_frac * net_pnl_pct
            capital = max(capital + dollar_pnl, 0.0)
            equity_curve.append(round(capital, 2))
            if capital > peak_cap:
                peak_cap = capital
            dd_usd = peak_cap - capital
            if dd_usd > max_drawdown_usd:
                max_drawdown_usd = dd_usd

        final_capital = round(capital, 2)
        compound_return_pct = (
            (final_capital - initial_capital) / initial_capital * 100
            if initial_capital > 0 else 0.0
        )
        max_dd_pct = (
            max_drawdown_usd / peak_cap * 100
            if peak_cap > 0 else 0.0
        )
        # 手续费调整后的平均盈亏
        avg_win_net = (
            sum(t.pnl_pct for t in wins) / len(wins) - fee_rt * 100
            if wins else 0.0
        )
        avg_loss_net = (
            sum(t.pnl_pct for t in losses) / len(losses) - fee_rt * 100
            if losses else 0.0
        )
        # ────────────────────────────────────────────────────────────────

        return {
            "total": len(trades),
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": win_rate,
            "total_pnl": total_pnl,
            "avg_win": sum(t.pnl_pct for t in wins) / len(wins) if wins else 0,
            "avg_loss": sum(t.pnl_pct for t in losses) / len(losses) if losses else 0,
            "best_trade": max(t.pnl_pct for t in trades),
            "worst_trade": min(t.pnl_pct for t in trades),
            "scalp_wins": scalp_count,
            "tp_wins": tp_count,
            "timeout_wins": timeout_wins,
            "stall_exits": stall_count,
            "by_strategy": by_strategy,
            "by_background": by_bg,
            "by_direction": by_dir,
            # 复利 + 手续费字段
            "fee_rate": fee_rate,
            "initial_capital": initial_capital,
            "final_capital": final_capital,
            "compound_return_pct": round(compound_return_pct, 2),
            "max_drawdown_usd": round(max_drawdown_usd, 2),
            "max_drawdown_pct": round(max_dd_pct, 2),
            "avg_win_net": round(avg_win_net, 3),
            "avg_loss_net": round(avg_loss_net, 3),
            "risk_pct": risk_pct,
        }


# ============================================================
# 9. 数据加载器
# ============================================================

class DataLoader:
    """从 HuggingFace 加载历史K线数据"""

    SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
    HF_DATASET = "123olp/binance-futures-ohlcv-2018-2026"
    CSV_GZ_FILE = "candles_1m.csv.gz"

    @staticmethod
    def load_from_hf(symbol: str, start_date: str = None, end_date: str = None,
                     cache_dir: str = None) -> pd.DataFrame:
        """
        从 HuggingFace 加载 1m K线数据（优先使用 CSV.gz 下载方式）

        返回 DataFrame，列: timestamp, open, high, low, close, volume
        """
        # 检查缓存
        cache_path = None
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)
            safe_start = start_date or "all"
            safe_end = end_date or "all"
            cache_path = Path(cache_dir) / f"{symbol}_{safe_start}_{safe_end}.parquet"
            if cache_path.exists():
                print(f"  从缓存加载: {cache_path}")
                df = pd.read_parquet(cache_path)
                print(f"  {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")
                return df

        # 方式1: 尝试从已下载的 CSV.gz 流式加载（最快）
        csv_gz_path = DataLoader._find_csv_gz(cache_dir)
        if csv_gz_path:
            print(f"  从本地 CSV.gz 加载: {csv_gz_path}")
            df = DataLoader._stream_csv_gz(csv_gz_path, symbol, start_date, end_date)
            if not df.empty and cache_path:
                df.to_parquet(cache_path)
                print(f"  已缓存到: {cache_path}")
            return df

        # 方式2: 下载 CSV.gz 文件
        try:
            from huggingface_hub import hf_hub_download
            download_dir = Path(cache_dir).parent / "hf_downloads" if cache_dir else Path.home() / ".cache" / "backtest"
            download_dir.mkdir(parents=True, exist_ok=True)
            local_csv = download_dir / DataLoader.CSV_GZ_FILE

            if not local_csv.exists():
                print(f"  下载 {DataLoader.CSV_GZ_FILE} 到 {download_dir}...")
                print(f"  (首次下载约 400MB，请耐心等待)")
                hf_hub_download(
                    repo_id=DataLoader.HF_DATASET,
                    filename=DataLoader.CSV_GZ_FILE,
                    repo_type="dataset",
                    local_dir=str(download_dir),
                )
                print(f"  下载完成!")

            df = DataLoader._stream_csv_gz(local_csv, symbol, start_date, end_date)
            if not df.empty and cache_path:
                df.to_parquet(cache_path)
                print(f"  已缓存到: {cache_path}")
            return df
        except ImportError:
            pass
        except Exception as e:
            print(f"  CSV.gz 下载失败: {e}")
            print(f"  回退到 streaming 模式...")

        # 方式3: 使用 datasets 库 streaming 模式（最慢但最可靠）
        return DataLoader._load_streaming(symbol, start_date, end_date, cache_path)

    @staticmethod
    def _find_csv_gz(cache_dir: str = None) -> Optional[Path]:
        """查找已下载的 CSV.gz 文件"""
        search_paths = []
        if cache_dir:
            search_paths.append(Path(cache_dir).parent / "hf_downloads" / DataLoader.CSV_GZ_FILE)
        search_paths.extend([
            Path.home() / ".cache" / "backtest" / DataLoader.CSV_GZ_FILE,
            Path(__file__).parent.parent / "data" / "hf_downloads" / DataLoader.CSV_GZ_FILE,
        ])
        for p in search_paths:
            if p.exists():
                return p
        return None

    @staticmethod
    def _stream_csv_gz(filepath: Path, symbol: str,
                       start_date: str = None, end_date: str = None) -> pd.DataFrame:
        """从 CSV.gz 流式读取并过滤"""
        start_ts = pd.Timestamp(start_date) if start_date else None
        end_ts = pd.Timestamp(end_date) if end_date else None

        chunks = []
        total = 0
        for chunk in pd.read_csv(filepath, compression="gzip", chunksize=200000):
            chunk = chunk[chunk["symbol"] == symbol]
            if chunk.empty:
                continue
            chunk["timestamp"] = pd.to_datetime(chunk["bucket_ts"], utc=True).dt.tz_localize(None)
            if start_ts:
                chunk = chunk[chunk["timestamp"] >= start_ts]
            if end_ts:
                chunk = chunk[chunk["timestamp"] <= end_ts]
            if not chunk.empty:
                chunks.append(chunk[["timestamp", "open", "high", "low", "close", "volume"]])
                total += len(chunks[-1])
                print(f"  已读取 {total:,} 根 {symbol} K线...", end="\r")

        if not chunks:
            print(f"  警告: {symbol} 无数据")
            return pd.DataFrame()

        df = pd.concat(chunks, ignore_index=True)
        df = df.sort_values("timestamp").reset_index(drop=True)
        print(f"  加载完成: {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")
        return df

    @staticmethod
    def _load_streaming(symbol: str, start_date: str = None, end_date: str = None,
                        cache_path: Path = None) -> pd.DataFrame:
        """使用 datasets 库 streaming 模式（备用）"""
        try:
            from datasets import load_dataset
        except ImportError:
            print("请安装: pip install datasets huggingface_hub")
            sys.exit(1)

        print(f"  从 HuggingFace streaming 加载 {symbol} 数据...")
        print(f"  (streaming 模式较慢，建议先下载 CSV.gz)")

        ds = load_dataset(DataLoader.HF_DATASET, split="train", streaming=True)

        rows = []
        count = 0
        for row in ds:
            if row.get("symbol") != symbol:
                continue
            ts = row.get("bucket_ts")
            if ts is None:
                continue
            if isinstance(ts, str):
                ts = pd.Timestamp(ts)
            elif isinstance(ts, (int, float)):
                ts = pd.Timestamp(ts, unit="ms")

            # V4.2: 统一时区比较 — 确保两边都是 tz-aware 或 tz-naive
            ts_naive = ts.tz_localize(None) if hasattr(ts, 'tz') and ts.tz else ts
            if start_date and ts_naive < pd.Timestamp(start_date):
                continue
            if end_date and ts_naive > pd.Timestamp(end_date):
                # 数据是时间排序的，超过结束日期可以提前退出
                if count > 0:
                    break
                continue

            rows.append({
                "timestamp": ts,
                "open": float(row["open"]),
                "high": float(row["high"]),
                "low": float(row["low"]),
                "close": float(row["close"]),
                "volume": float(row.get("volume", 0)),
            })
            count += 1
            if count % 50000 == 0:
                print(f"  已加载 {count:,} 根K线...", end="\r")

        if not rows:
            print(f"  警告: {symbol} 无数据")
            return pd.DataFrame()

        df = pd.DataFrame(rows)
        df = df.sort_values("timestamp").reset_index(drop=True)
        print(f"  加载完成: {len(df):,} 根 1m K线 ({df['timestamp'].min()} ~ {df['timestamp'].max()})")

        if cache_path:
            df.to_parquet(cache_path)
            print(f"  已缓存到: {cache_path}")
        return df

    @staticmethod
    def load_from_parquet(filepath: str, symbol: str = None,
                          start_date: str = None, end_date: str = None) -> pd.DataFrame:
        """从本地 parquet 文件加载"""
        df = pd.read_parquet(filepath)
        if symbol and "symbol" in df.columns:
            df = df[df["symbol"] == symbol]
        if "bucket_ts" in df.columns:
            df = df.rename(columns={"bucket_ts": "timestamp"})
        if "open_time" in df.columns and "timestamp" not in df.columns:
            df = df.rename(columns={"open_time": "timestamp"})
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
        if start_date:
            df = df[df["timestamp"] >= pd.Timestamp(start_date, tz="UTC")]
        if end_date:
            df = df[df["timestamp"] <= pd.Timestamp(end_date, tz="UTC")]
        df = df.sort_values("timestamp").reset_index(drop=True)
        return df

    @staticmethod
    def resample(df_1m: pd.DataFrame, timeframe: str) -> pd.DataFrame:
        """
        从 1m 聚合到更高时间框架
        支持: 5m, 15m, 1h, 4h, 1d
        """
        tf_map = {"5m": "5min", "15m": "15min", "30m": "30min", "1h": "1h", "4h": "4h", "1d": "1D"}
        rule = tf_map.get(timeframe)
        if not rule:
            raise ValueError(f"不支持的时间框架: {timeframe}")

        df = df_1m.set_index("timestamp")
        resampled = df.resample(rule).agg({
            "open": "first",
            "high": "max",
            "low": "min",
            "close": "last",
            "volume": "sum",
        }).dropna()
        resampled = resampled.reset_index()
        return resampled


# ============================================================
# 10. 回测引擎
# ============================================================

class BacktestEngine:
    """主回测引擎"""

    # 各周期的默认配置: (max_holding_bars, scalp_min, scalp_max, scalp_profit%)
    # V4.1: 1h scalp 0.50→0.65% — 回测显示72-77% SCALP占比过高，让更多趋势跑起来
    TF_DEFAULTS = {
        "5m":  (48,  2, 4, 0.30),
        "15m": (16,  2, 4, 0.35),
        "30m": (10,  2, 3, 0.40),
        "1h":  (12,  2, 3, 0.65),
    }

    def __init__(self, score_threshold: int = 80, max_holding_bars: int = None,
                 verbose: bool = False, trade_start: str = None,
                 sell_only: bool = False, q3_filter: bool = True,
                 timeframe: str = "5m",
                 fee_rate: float = 0.0,
                 initial_capital: float = 500.0,
                 risk_pct: float = 1.0,
                 market_state: bool = False):
        self.score_threshold = score_threshold
        self.timeframe = timeframe
        self.fee_rate = fee_rate
        self.initial_capital = initial_capital
        self.risk_pct = risk_pct
        self.market_state = market_state  # V5.0 市场状态匹配

        # 按周期自动设置 SCALP 和持仓参数
        tf_cfg = self.TF_DEFAULTS.get(timeframe, self.TF_DEFAULTS["5m"])
        hold_bars = max_holding_bars if max_holding_bars is not None else tf_cfg[0]

        self.detector = StrategyDetector()
        self.scoring = ScoringEngine(
            market_state_enabled=market_state)
        self.simulator = TradeSimulator(
            max_holding_bars=hold_bars,
            scalp_min_bars=tf_cfg[1],
            scalp_max_bars=tf_cfg[2],
            scalp_min_profit=tf_cfg[3],
        )
        self.verbose = verbose
        self.sell_only = sell_only    # V3 仅做空模式
        self.q3_filter = q3_filter    # V3 三域融合过滤(默认开启)
        # trade_start: 实际入场开始日期（之前数据用于预热背景分析）
        self.trade_start_dt = None
        if trade_start:
            from datetime import timezone as _tz
            self.trade_start_dt = datetime.strptime(
                trade_start, "%Y-%m-%d"
            ).replace(tzinfo=_tz.utc)

        # 统计
        self.signals_generated = 0
        self.signals_passed = 0
        self.signals_blocked_bg = 0
        self.signals_blocked_score = 0
        self.signals_blocked_rr = 0
        self.signals_blocked_counter_trend = 0  # Option B
        self.signals_blocked_position = 0       # 持仓阻断
        self.signals_blocked_q3 = 0             # V3 三域融合阻断
        self.signals_blocked_market = 0         # V5.0 市场状态禁止

    def run(self, symbol: str, df_1m: pd.DataFrame) -> dict:
        """
        运行回测

        参数:
            symbol: 交易对
            df_1m: 1分钟 K 线 DataFrame

        返回:
            回测统计结果
        """
        print(f"\n{'='*60}")
        print(f"  回测 {symbol}")
        print(f"  数据范围: {df_1m['timestamp'].min()} ~ {df_1m['timestamp'].max()}")
        print(f"  评分阈值: {self.score_threshold}")
        print(f"{'='*60}")

        # 聚合多时间框架
        tf = self.timeframe
        print(f"  聚合多时间框架（基础周期: {tf}）...")
        df_base = DataLoader.resample(df_1m, tf)
        df_4h = DataLoader.resample(df_1m, "4h")
        df_1d = DataLoader.resample(df_1m, "1d")

        print(f"  {tf}: {len(df_base):,} 根 | "
              f"4h: {len(df_4h):,} 根 | "
              f"1d: {len(df_1d):,} 根")

        # 转换为 Candle 对象 — 用于高时间框架的背景分析
        daily_candles = self._df_to_candles(df_1d, symbol, "1d")
        h4_candles = self._df_to_candles(df_4h, symbol, "4h")

        # 滚动窗口回测（基础周期K线）
        window_size = 50  # 至少50根K线才能计算所有指标
        total_bars = len(df_base)
        print(f"  开始滚动回测 (总计 {total_bars:,} 根{tf} K线)...")

        _prev_date = None  # 每日独立重置追踪器

        for i in range(window_size, total_bars):
            if i % 5000 == 0:
                pct = i / total_bars * 100
                print(f"  进度: {pct:.1f}% ({i:,}/{total_bars:,}) | "
                      f"信号: {self.signals_generated} | "
                      f"交易: {len(self.simulator.closed_trades)}", end="\r")

            # 当前基础周期K线窗口
            window_df = df_base.iloc[i - window_size:i + 1]
            candles = self._df_to_candles(window_df, symbol, tf)
            curr_time = candles[-1].timestamp

            # Bug修复: 每日亏损计数在主循环独立重置（原逻辑仅在 open_trade 内重置，
            # 导致当日2+亏损后无新交易开仓时日计数永不清零，陷入死锁）
            _curr_date = curr_time.strftime("%Y-%m-%d")
            if _curr_date != _prev_date:
                if _prev_date is not None:  # 非首根K线
                    self.simulator.daily_losses = {}
                    self.simulator.daily_losses_by_dir = {}
                    self.simulator._current_date = _curr_date
                _prev_date = _curr_date

            # 检查持仓（止盈/止损/超时）
            self.simulator.check_open_trades(candles[-1], i)
            self.simulator.timeout_old_trades(candles[-1])

            # 计算指标
            prices = [c.close for c in candles]
            ema20 = calculate_ema(prices, 20)
            if not ema20:
                continue
            atr = calculate_atr(candles, 14)

            # 识别周期 (V2: 返回 MarketState 对象)
            # ema20 对齐: ema20[0] 对应 candles[19]
            aligned_candles = candles[19:]  # 与EMA对齐
            market_state = CycleIdentifier.identify(
                aligned_candles, ema20)

            # V5.0: 计算市场状态（利用 channel_type）
            ms = None
            ms_rec = None
            if self.market_state:
                ms = classify_backtest_market_state(market_state)
                if ms:
                    ms_rec = BACKTEST_STRATEGY_MATRIX.get(ms, {})

            # 运行策略检测 (V2: 传入 MarketState)
            signals = self.detector.detect_all(
                aligned_candles, ema20, atr, market_state)
            if not signals:
                continue

            # 获取大周期背景
            bg = self._get_background(curr_time, daily_candles, h4_candles)

            for signal in signals:
                self.signals_generated += 1

                # V5.0: 注入市场状态到信号
                if ms_rec is not None:
                    signal.extra = {
                        'market_state': ms,
                        'strategy_recommendation': ms_rec,
                    }

                # 评分（传入方向感知亏损，使BUY/SELL惩罚相互独立）
                # V5.1: 传入 ATR 用于 Climax 环境检测
                score, reasons = self.scoring.score_signal(
                    signal, bg,
                    self.simulator.daily_losses,
                    self.simulator.strategy_history,
                    daily_losses_by_dir=self.simulator.daily_losses_by_dir,
                    atr=atr,
                )

                if score == 0:
                    self.signals_blocked_rr += 1
                    continue
                # V5.0: 市场状态禁止计数
                if any("禁止列表" in r for r in reasons):
                    self.signals_blocked_market += 1
                if score < self.score_threshold:
                    self.signals_blocked_score += 1
                    if any("逆" in r or "背景" in r for r in reasons):
                        self.signals_blocked_bg += 1
                    continue

                self.signals_passed += 1

                # 预热期内不入场（只建立背景数据）
                # 统一时区: curr_time 可能 naive, trade_start_dt 是 aware
                if (self.trade_start_dt and
                        curr_time.replace(tzinfo=None) < self.trade_start_dt.replace(tzinfo=None)):
                    continue

                # V3 SELL-only: 仅做空模式，过滤所有BUY信号
                if self.sell_only and signal.direction == "BUY":
                    continue

                # V3 三域融合: 日线 + 4h + 5m周期对信号方向的综合支持度
                # q = +1 (支持), 0 (中性), -1 (反对)
                if self.q3_filter:
                    q_daily = (
                        1 if (signal.direction == "SELL" and bg.daily_trend == "空头") or
                             (signal.direction == "BUY" and bg.daily_trend == "多头")
                        else (-1 if (signal.direction == "SELL" and bg.daily_trend == "多头") or
                                    (signal.direction == "BUY" and bg.daily_trend == "空头")
                        else 0)
                    )
                    q_h4 = (
                        1 if (signal.direction == "SELL" and bg.h4_trend == "空头") or
                             (signal.direction == "BUY" and bg.h4_trend == "多头")
                        else (-1 if (signal.direction == "SELL" and bg.h4_trend == "多头") or
                                    (signal.direction == "BUY" and bg.h4_trend == "空头")
                        else 0)
                    )
                    cycle_bearish = any(x in signal.cycle for x in ["急速空", "趋势空", "反转空"])
                    cycle_bullish = any(x in signal.cycle for x in ["急速多", "趋势多", "反转多"])
                    q_cycle = (
                        1 if (signal.direction == "SELL" and cycle_bearish) or
                             (signal.direction == "BUY" and cycle_bullish)
                        else (-1 if (signal.direction == "SELL" and cycle_bullish) or
                                    (signal.direction == "BUY" and cycle_bearish)
                        else 0)
                    )
                    q_sum = q_daily + q_h4 + q_cycle
                    # 三域净负(-1及以下): 至少2个域明确反对 → 强逆势 → 拦截
                    # q_sum=0 (中性): 单域支持/反对, 需要更高评分确认
                    # q_sum>=1: 有效顺势信号, 正常通过
                    if q_sum <= -1:
                        self.signals_blocked_bg += 1
                        self.signals_blocked_q3 += 1
                        continue
                    # 三域中性(q=0): 需要稍高评分 (threshold+3)
                    if q_sum == 0 and score < self.score_threshold + 3:
                        self.signals_blocked_q3 += 1
                        continue

                # Option B: 逆日线方向信号要求额外 +5 分
                # Al Brooks: 顺趋势策略优先，逆趋势需要更强确认
                daily_trend = bg.daily_trend
                is_counter = (
                    (daily_trend == "多头" and signal.direction == "SELL")
                    or (daily_trend == "空头" and signal.direction == "BUY")
                )
                if is_counter and score < self.score_threshold + 5:
                    self.signals_blocked_bg += 1
                    self.signals_blocked_counter_trend += 1
                    continue

                # 检查持仓冲突（在 open_trade 调用前计数）
                has_pos = any(
                    t.symbol == signal.symbol
                    for t in self.simulator.open_trades
                )
                if has_pos:
                    self.signals_blocked_position += 1
                    continue

                # 开仓
                self.simulator.open_trade(signal, score, bg.background)

                if self.verbose:
                    ct_tag = " [逆势]" if is_counter else ""
                    print(
                        f"\n  📊 {curr_time} | "
                        f"{signal.signal_type} {signal.direction}{ct_tag}"
                        f" @ {signal.price:.2f} | 评分: {score}"
                        f" | {bg.background}"
                    )

        # 强制平仓所有剩余持仓
        if self.open_trades_remaining():
            last_candle = self._df_to_candles(df_base.tail(1), symbol, tf)[0]
            for trade in self.simulator.open_trades:
                trade.exit_price = last_candle.close
                if trade.direction == "BUY":
                    trade.pnl_pct = (trade.exit_price - trade.entry_price) / trade.entry_price * 100
                else:
                    trade.pnl_pct = (trade.entry_price - trade.exit_price) / trade.entry_price * 100
                trade.result = "WIN" if trade.pnl_pct > 0 else "LOSS"
                trade.exit_time = last_candle.timestamp
                trade.exit_reason = "END"
                self.simulator.closed_trades.append(trade)
            self.simulator.open_trades = []

        print(f"\n  回测完成!")

        # 汇总统计（传入手续费和复利参数）
        stats = self.simulator.get_stats(
            fee_rate=self.fee_rate,
            initial_capital=self.initial_capital,
            risk_pct=self.risk_pct,
        )
        stats["timeframe"] = self.timeframe
        stats["signals_generated"] = self.signals_generated
        stats["signals_passed"] = self.signals_passed
        stats["signals_blocked_bg"] = self.signals_blocked_bg
        stats["signals_blocked_score"] = self.signals_blocked_score
        stats["signals_blocked_rr"] = self.signals_blocked_rr
        stats["signals_blocked_counter_trend"] = self.signals_blocked_counter_trend
        stats["signals_blocked_position"] = self.signals_blocked_position
        stats["signals_blocked_q3"] = self.signals_blocked_q3
        stats["signals_blocked_market"] = self.signals_blocked_market
        stats["threshold"] = self.score_threshold
        stats["sell_only"] = self.sell_only
        stats["q3_filter"] = self.q3_filter
        stats["market_state"] = self.market_state

        return stats

    def open_trades_remaining(self) -> bool:
        return len(self.simulator.open_trades) > 0

    def _df_to_candles(self, df: pd.DataFrame, symbol: str, tf: str) -> list[Candle]:
        """DataFrame → Candle列表"""
        candles = []
        for _, row in df.iterrows():
            candles.append(Candle(
                symbol=symbol,
                timestamp=row["timestamp"].to_pydatetime() if hasattr(row["timestamp"], "to_pydatetime") else row["timestamp"],
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row.get("volume", 0)),
                timeframe=tf,
            ))
        return candles

    def _get_background(self, current_time: datetime,
                        daily_candles: list[Candle],
                        h4_candles: list[Candle]) -> BackgroundContext:
        """获取当前时间点的大周期背景"""
        # 找到当前时间之前的日线K线
        daily_before = [c for c in daily_candles if c.timestamp <= current_time]
        h4_before = [c for c in h4_candles if c.timestamp <= current_time]

        if len(daily_before) < 25 or len(h4_before) < 25:
            return BackgroundContext("中性", "中性", "⚪ 中性", 0, 0)

        return BackgroundAnalyzer.analyze(daily_before[-50:], h4_before[-50:])


# ============================================================
# 11. 报告输出
# ============================================================

def print_report(stats: dict, symbol: str):
    """打印回测报告"""
    print(f"\n{'='*60}")
    print(f"  📊 回测报告 — {symbol}")
    print(f"{'='*60}")

    if stats["total"] == 0:
        print("  无交易记录")
        return

    print(f"\n  === 总览 ===")
    print(f"  信号生成: {stats.get('signals_generated', 0)}")
    print(f"  信号通过: {stats.get('signals_passed', 0)}")
    print(f"  背景拦截: {stats.get('signals_blocked_bg', 0)}"
          f" (逆势OptionB: {stats.get('signals_blocked_counter_trend', 0)}"
          f", 三域融合: {stats.get('signals_blocked_q3', 0)})")
    print(f"  评分拦截: {stats.get('signals_blocked_score', 0)}")
    print(f"  盈亏比拦截: {stats.get('signals_blocked_rr', 0)}")
    print(f"  持仓阻断: {stats.get('signals_blocked_position', 0)}")
    if stats.get('market_state'):
        blocked_ms = stats.get('signals_blocked_market', 0)
        print(f"  市场状态禁止: {blocked_ms}")
    print(f"  评分阈值: {stats.get('threshold', 80)}")
    if stats.get('market_state'):
        print(f"  V5.0 市场状态匹配: 已启用")

    tf = stats.get("timeframe", "5m")
    print(f"\n  === 交易统计 [{tf}周期] ===")
    print(f"  总交易: {stats['total']}")
    print(f"  胜: {stats['wins']} | 负: {stats['losses']}")
    print(f"  胜率: {stats['win_rate']:.1f}%")
    print(f"  总盈亏(毛): {stats['total_pnl']:.2f}%")
    print(f"  平均盈利: +{stats['avg_win']:.2f}% | 净: +{stats.get('avg_win_net', 0):.2f}%")
    print(f"  平均亏损: {stats['avg_loss']:.2f}% | 净: {stats.get('avg_loss_net', 0):.2f}%")
    print(f"  最佳: +{stats['best_trade']:.2f}% | 最差: {stats['worst_trade']:.2f}%")
    scalp = stats.get('scalp_wins', 0)
    tp = stats.get('tp_wins', 0)
    to = stats.get('timeout_wins', 0)
    if scalp or tp:
        print(f"  出场方式: SCALP={scalp} | TP={tp} | TIMEOUT胜={to}")

    # 手续费 + 复利展示
    fee = stats.get("fee_rate", 0)
    init_cap = stats.get("initial_capital", 500)
    final_cap = stats.get("final_capital", init_cap)
    comp_ret = stats.get("compound_return_pct", 0)
    max_dd_u = stats.get("max_drawdown_usd", 0)
    max_dd_p = stats.get("max_drawdown_pct", 0)
    risk = stats.get("risk_pct", 1.0)
    if fee > 0 or init_cap != 500:
        print(f"\n  === 复利模拟 (${init_cap:.0f} 初始, {risk:.1f}%风险/笔) ===")
        print(f"  手续费: {fee*100:.3f}% 单边 / {fee*200:.3f}% 往返")
        print(f"  ${init_cap:.0f} → ${final_cap:.2f}"
              f"  ({comp_ret:+.1f}%)")
        print(f"  最大回撤: ${max_dd_u:.2f} ({max_dd_p:.1f}%)")

    if stats.get("by_direction"):
        print(f"\n  === 按方向 ===")
        for d, s in stats["by_direction"].items():
            wr = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
            print(f"  {d}: {s['trades']}笔 | 胜率{wr:.0f}% | PnL {s['pnl']:.2f}%")

    if stats.get("by_background"):
        print(f"\n  === 按背景 ===")
        for bg, s in sorted(stats["by_background"].items()):
            wr = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
            print(f"  {bg}: {s['trades']}笔 | 胜率{wr:.0f}% | PnL {s['pnl']:.2f}%")

    if stats.get("by_strategy"):
        print(f"\n  === 按策略 ===")
        for strat, s in sorted(stats["by_strategy"].items(), key=lambda x: x[1]["pnl"], reverse=True):
            wr = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
            print(f"  {strat}: {s['trades']}笔 | 胜率{wr:.0f}% | PnL {s['pnl']:.2f}%")

    print(f"\n{'='*60}")


# ============================================================
# 12. 主入口
# ============================================================

def _serialize_trades(trades: list) -> list[dict]:
    """将 Trade 对象列表序列化为 dict 列表（按时间排序）"""
    sorted_trades = sorted(trades, key=lambda t: t.exit_time or t.entry_time)
    result = []
    for t in sorted_trades:
        result.append({
            "entry_time": str(t.entry_time),
            "exit_time": str(t.exit_time),
            "direction": t.direction,
            "strategy": t.strategy,
            "entry_price": round(t.entry_price, 2),
            "exit_price": round(t.exit_price, 2),
            "stop_loss": round(t.stop_loss, 2),
            "take_profit": round(t.take_profit, 2),
            "pnl_pct": round(t.pnl_pct, 4),
            "result": t.result,
            "exit_reason": t.exit_reason,
            "score": t.score,
            "background": t.background,
            "cycle": t.cycle,
        })
    return result


def main():
    parser = argparse.ArgumentParser(description="PA交易回测工具")
    parser.add_argument("--symbol", type=str, default="BTCUSDT",
                        help="交易对 (默认: BTCUSDT)")
    parser.add_argument("--all", action="store_true",
                        help="回测所有币种 (BTC/ETH/BNB/SOL)")
    parser.add_argument("--start", type=str, default=None,
                        help="开始日期 (如: 2025-12-01)")
    parser.add_argument("--end", type=str, default=None,
                        help="结束日期 (如: 2026-01-01)")
    parser.add_argument("--days", type=int, default=None,
                        help="回测最近N天")
    parser.add_argument("--threshold", type=int, default=80,
                        help="评分阈值 (默认: 80)")
    parser.add_argument("--max-hold", type=int, default=48,
                        help="最大持仓K线数 (默认: 48, 即4小时)")
    parser.add_argument("--verbose", "-v", action="store_true",
                        help="详细输出每笔交易")
    parser.add_argument("--parquet", type=str, default=None,
                        help="使用本地 parquet 文件而非 HuggingFace")
    parser.add_argument("--cache-dir", type=str,
                        default=str(Path(__file__).parent.parent / "data" / "backtest_cache"),
                        help="数据缓存目录")
    parser.add_argument("--compare-thresholds", action="store_true",
                        help="对比不同评分阈值 (70/75/80/85/90)")
    parser.add_argument("--output", type=str, default=None,
                        help="输出 JSON 结果文件")
    parser.add_argument("--sell-only", action="store_true",
                        help="V3: 仅做空，过滤所有BUY信号")
    parser.add_argument("--no-q3", action="store_true",
                        help="V3: 禁用三域融合过滤（默认开启）")
    parser.add_argument("--timeframe", "-tf", type=str, default="5m",
                        choices=["5m", "15m", "30m", "1h"],
                        help="回测基础周期 (默认: 5m)")
    parser.add_argument("--fee", type=float, default=0.0,
                        help="单边手续费率，如0.04表示0.04%% (默认:0)")
    parser.add_argument("--capital", type=float, default=500.0,
                        help="初始资金USD，用于复利计算 (默认: 500)")
    parser.add_argument("--risk", type=float, default=1.0,
                        help="每笔风险占资金比例%% (默认: 1.0)")
    parser.add_argument("--multi-tf", action="store_true",
                        help="多周期对比: 同时跑 5m/15m/30m/1h")
    parser.add_argument("--market-state", action="store_true",
                        help="V5.0: 启用市场状态匹配评分(六维)")
    parser.add_argument("--detailed", action="store_true",
                        help="输出每笔交易明细到 JSON (需配合 --output)")
    args = parser.parse_args()

    # 日期处理
    if args.days:
        args.end = datetime.now().strftime("%Y-%m-%d")
        args.start = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")

    symbols = DataLoader.SYMBOLS if args.all else [args.symbol.upper()]

    # --fee 输入是百分比(0.04)，转换为小数(0.0004)
    fee_rate = args.fee / 100.0 if args.fee > 0 else 0.0

    # --multi-tf: 决定要跑哪些周期
    timeframes = (["5m", "15m", "30m", "1h"]
                  if getattr(args, 'multi_tf', False)
                  else [args.timeframe])

    print("=" * 60)
    print("  PA交易回测工具 V2.0")
    print("=" * 60)
    print(f"  币种: {', '.join(symbols)}")
    print(f"  日期: {args.start or '全部'} ~ {args.end or '全部'}")
    print(f"  阈值: {args.threshold}")
    print(f"  周期: {', '.join(timeframes)}")
    if fee_rate > 0:
        print(f"  手续费: {args.fee:.3f}% 单边 / {args.fee*2:.3f}% 往返")
    print(f"  复利: ${args.capital:.0f} 初始 | {args.risk:.1f}% 风险/笔")
    ms_flag = getattr(args, 'market_state', False)
    if ms_flag:
        print(f"  V5.0: 市场状态匹配评分已启用(六维)")

    all_results = {}

    for symbol in symbols:
        # 加载数据（包含90天预热期，确保背景分析有足够历史数据）
        warmup_start = args.start
        if args.start:
            try:
                warmup_dt = (
                    datetime.strptime(args.start, "%Y-%m-%d")
                    - timedelta(days=90)
                )
                warmup_start = warmup_dt.strftime("%Y-%m-%d")
            except ValueError:
                warmup_start = args.start

        if args.parquet:
            df_1m = DataLoader.load_from_parquet(
                args.parquet, symbol=symbol,
                start_date=warmup_start, end_date=args.end
            )
        else:
            df_1m = DataLoader.load_from_hf(
                symbol, start_date=warmup_start, end_date=args.end,
                cache_dir=args.cache_dir
            )

        if df_1m.empty:
            print(f"  {symbol}: 无数据，跳过")
            continue

        if args.compare_thresholds:
            # 对比模式：多个阈值
            for threshold in [70, 75, 80, 85, 90]:
                engine = BacktestEngine(
                    score_threshold=threshold,
                    max_holding_bars=None,
                    verbose=False,
                    trade_start=args.start,
                    sell_only=getattr(args, 'sell_only', False),
                    q3_filter=not getattr(args, 'no_q3', False),
                    timeframe=args.timeframe,
                    fee_rate=fee_rate,
                    initial_capital=args.capital,
                    risk_pct=args.risk,
                    market_state=ms_flag,
                )
                stats = engine.run(symbol, df_1m)
                if getattr(args, 'detailed', False):
                    stats["trades_detail"] = _serialize_trades(engine.simulator.closed_trades)
                key = f"{symbol}_t{threshold}"
                all_results[key] = stats
                print(f"\n  阈值={threshold}: "
                      f"{stats['total']}笔 | 胜率{stats.get('win_rate', 0):.1f}% | "
                      f"PnL {stats.get('total_pnl', 0):.2f}%")
        elif getattr(args, 'multi_tf', False):
            # 多周期对比模式
            for tf in timeframes:
                engine = BacktestEngine(
                    score_threshold=args.threshold,
                    max_holding_bars=None,  # 按周期自动设定
                    verbose=False,
                    trade_start=args.start,
                    sell_only=getattr(args, 'sell_only', False),
                    q3_filter=not getattr(args, 'no_q3', False),
                    timeframe=tf,
                    fee_rate=fee_rate,
                    initial_capital=args.capital,
                    risk_pct=args.risk,
                    market_state=ms_flag,
                )
                stats = engine.run(symbol, df_1m)
                if getattr(args, 'detailed', False):
                    stats["trades_detail"] = _serialize_trades(engine.simulator.closed_trades)
                key = f"{symbol}_{tf}"
                all_results[key] = stats
                print_report(stats, f"{symbol} [{tf}]")
        else:
            engine = BacktestEngine(
                score_threshold=args.threshold,
                max_holding_bars=(None if args.max_hold == 48
                                  else args.max_hold),
                verbose=args.verbose,
                trade_start=args.start,
                sell_only=getattr(args, 'sell_only', False),
                q3_filter=not getattr(args, 'no_q3', False),
                timeframe=args.timeframe,
                fee_rate=fee_rate,
                initial_capital=args.capital,
                risk_pct=args.risk,
                market_state=ms_flag,
            )
            stats = engine.run(symbol, df_1m)
            if getattr(args, 'detailed', False):
                stats["trades_detail"] = _serialize_trades(engine.simulator.closed_trades)
            all_results[symbol] = stats
            print_report(stats, symbol)

    # 输出 JSON
    if args.output:
        with open(args.output, "w") as f:
            json.dump(all_results, f, indent=2, default=str, ensure_ascii=False)
        print(f"\n  结果已保存到: {args.output}")

    # 多币种汇总
    if len(symbols) > 1 and not args.compare_thresholds:
        print(f"\n{'='*60}")
        print(f"  📊 多币种汇总")
        print(f"{'='*60}")
        total_trades = sum(s.get("total", 0) for s in all_results.values())
        total_wins = sum(s.get("wins", 0) for s in all_results.values())
        total_pnl = sum(s.get("total_pnl", 0) for s in all_results.values())
        overall_wr = total_wins / total_trades * 100 if total_trades > 0 else 0
        print(f"  总交易: {total_trades}")
        print(f"  总胜率: {overall_wr:.1f}%")
        print(f"  总PnL: {total_pnl:.2f}%")
        for sym, s in all_results.items():
            print(f"  {sym}: {s.get('total', 0)}笔 | "
                  f"胜率{s.get('win_rate', 0):.1f}% | "
                  f"PnL {s.get('total_pnl', 0):.2f}%")


if __name__ == "__main__":
    main()
