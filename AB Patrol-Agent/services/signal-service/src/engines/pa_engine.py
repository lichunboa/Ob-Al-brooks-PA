"""
纯价格行为信号引擎 (Al Brooks 方法)

基于 K 线 + EMA20 的信号检测，不依赖其他技术指标。
核心原则：
- 80/20 规则：趋势中 80% 反转失败，区间中 80% 突破失败
- 90% 规则：图表上 90% K 线在区间内
- EMA 回归：99.5% 概率触及 EMA20

策略体系：
- 急速方案：收线追进、高1低1
- 回调方案：双重顶底、楔形顶底、均线缺口
- 区间方案：看衰突破、急赴磁体、突破回调
- 反转方案：极速通道、末端旗形
"""

import logging
import threading
import time
from typing import Optional

try:
    from ..config import COOLDOWN_SECONDS, get_database_url
    from ..events import SignalEvent, SignalPublisher
    from ..storage.cooldown import get_cooldown_storage
except ImportError:
    from config import COOLDOWN_SECONDS, get_database_url
    from events import SignalEvent, SignalPublisher
    from storage.cooldown import get_cooldown_storage

from .base import BaseEngine
from .pa.analysis import (
    CandlePatterns,
    CycleIdentifier,
    MeasuredMoveCalculator,
    TradingSession,
    TrendValidator,
    calculate_atr,
    calculate_ema,
    ema_slope,
)
from .pa.models import Candle, MarketState, PASignal
from .pa.risk import RiskManager

logger = logging.getLogger(__name__)


# ============ 策略检测器 ============

class StrategyDetector:
    """11 策略检测器"""

    def __init__(self):
        self.patterns = CandlePatterns()

    # === 急速方案 ===

    def detect_buy_now(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[PASignal]:
        """
        收线追进（做多）
        条件：2+ 根强势阳线收在高点，动能持续
        """
        if len(candles) < 3:
            return None

        recent = candles[-3:]
        strong_count = sum(1 for c in recent if CandlePatterns.is_strong_bull(c))

        if strong_count >= 2:
            curr = candles[-1]

            # Phase 3: 加强入场条件
            if strong_count == 2:
                # 仅2根强势时，最后一根必须收在高点附近
                body_top = max(curr.close, curr.open)
                if body_top < curr.high * 0.998:
                    return None

            # 止损：最近低点 或 ATR 动态止损
            low_stop = min(c.low for c in recent)
            atr_stop = curr.close - 2.0 * atr if atr > 0 else curr.close * 0.995
            stop = min(low_stop, atr_stop)  # 取较宽的，避免被扫

            target = curr.close + (curr.close - stop) * 1.5  # 1.5:1 盈亏比（趋势策略）

            return PASignal(
                symbol=curr.symbol,
                signal_type="收线追进",
                direction="BUY",
                strength=min(95, 75 + strong_count * 10),
                message=f"连续{strong_count}根强势阳线，动能强劲",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.6,
                cycle="急速多",
                timeframe=curr.timeframe,
            )

        return None

    def detect_sell_now(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[PASignal]:
        """收线追进（做空）"""
        if len(candles) < 3:
            return None

        recent = candles[-3:]
        strong_count = sum(1 for c in recent if CandlePatterns.is_strong_bear(c))

        if strong_count >= 2:
            curr = candles[-1]

            # Phase 3: 加强入场条件
            if strong_count == 2:
                body_bot = min(curr.close, curr.open)
                if body_bot > curr.low * 1.002:
                    return None

            high_stop = max(c.high for c in recent)
            atr_stop = curr.close + 2.0 * atr if atr > 0 else curr.close * 1.005
            stop = max(high_stop, atr_stop)  # 取较宽的，避免被扫

            target = curr.close - (stop - curr.close) * 1.5

            return PASignal(
                symbol=curr.symbol,
                signal_type="收线追进",
                direction="SELL",
                strength=min(95, 75 + strong_count * 10),
                message=f"连续{strong_count}根强势阴线，动能强劲",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.6,
                cycle="急速空",
                timeframe=curr.timeframe,
            )

        return None

    def detect_high1_low1(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        高1/低1 (High 1/Low 1) — Al Brooks 标准

        Al Brooks High 1:
        1. 趋势确认: 至少有一组 HH+HL 结构
        2. 回调到 EMA20: pullback 棒触及 EMA 附近
        3. 回调棒质量: 弱棒（小实体或阴线），不是大阳线
        4. Higher Low: 回调低点高于之前的 swing low
        5. 信号棒: 当前 K 线突破回调棒极值，收盘有力
        """
        if len(candles) < 15 or len(ema20) < 10:
            return None

        curr = candles[-1]
        prev = candles[-2]
        prev2 = candles[-3]

        if cycle == "趋势多":
            # Al Brooks: H1 = 趋势中第一次回调后的买点
            # 回调不需要触及EMA20——强趋势中EMA可能离价格3-10个ATR
            # EMA接近度是"锦上添花"而非"必要条件"
            # 移除EMA接近度限制，回调只要是下跌棒（prev是弱棒）即可
            ema_val = ema20[-2]  # 仍然使用，但不做硬性过滤

            # --- 2. 回调棒必须是弱棒 ---
            if CandlePatterns.is_strong_bull(prev):
                return None  # 回调棒不应是强阳线
            # 优选阴线作为回调棒
            pullback_is_bear = CandlePatterns.is_bear(prev)

            # --- 3. 信号棒（当前K线）突破回调棒高点 ---
            if curr.close <= prev.high:
                return None
            # 信号棒应该是阳线且有力
            if not CandlePatterns.is_bull(curr):
                return None
            sig_quality = CandlePatterns.signal_bar_quality(
                curr, candles[-6:-1], "BUY")
            # Al Brooks: 信号棒只需收在回调高点之上。阈值0.65过严
            # 很多有效H1信号棒实体比例50%、有小上影线，但总分只有0.60-0.64
            if sig_quality < 0.55:
                return None

            # --- 4. Higher Low 结构验证 ---
            # 用 3-bar swing low 找回调前的真实 swing low
            pre_pullback = candles[-20:-3] if len(candles) >= 23 else candles[:-3]
            swings = CycleIdentifier._find_swings(pre_pullback)
            swing_lows = [s for s in swings if s["type"] == "low"]
            if not swing_lows:
                return None  # 没有结构性 swing low，无法确认 Higher Low
            prev_swing_low = swing_lows[-1]["price"]
            pullback_low = min(prev.low, prev2.low)
            if pullback_low <= prev_swing_low:
                return None  # 不是 Higher Low

            # --- 5. 止损和目标 ---
            # Al Brooks: 止损设在信号棒之外 + 1×ATR 缓冲（加密高波动适配）
            stop = min(prev.low, prev2.low)
            if atr > 0:
                atr_stop = curr.close - 1.0 * atr
                stop = min(stop, atr_stop)
            risk = curr.close - stop
            if risk <= 0:
                return None
            target = curr.close + risk * 2.0

            strength = 78  # V2: 75→78，高1是趋势回调核心策略，基础强度提升
            if pullback_is_bear:
                strength += 5
            if sig_quality >= 0.65:
                strength += 5

            return PASignal(
                symbol=curr.symbol,
                signal_type="高1",
                direction="BUY",
                strength=min(95, strength),
                message="趋势多中 Higher Low 回调 EMA20 后反弹",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.60,
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        elif cycle == "趋势空":
            # Al Brooks: L1 = 趋势空中第一次反弹后的空点
            # 反弹不需要触及EMA20——强下跌趋势中EMA可能离价格3-10个ATR之上
            # 移除硬性EMA接近度过滤，L1的核心是Lower High结构，不是到没到EMA

            if CandlePatterns.is_strong_bear(prev):
                return None
            pullback_is_bull = CandlePatterns.is_bull(prev)

            if curr.close >= prev.low:
                return None
            if not CandlePatterns.is_bear(curr):
                return None
            sig_quality = CandlePatterns.signal_bar_quality(
                curr, candles[-6:-1], "SELL")
            # Al Brooks: 低1信号棒只需收在反弹低点之下，阈值0.65过严
            if sig_quality < 0.55:
                return None

            # Lower High 结构验证 — 用 3-bar swing high
            pre_pullback = candles[-20:-3] if len(candles) >= 23 else candles[:-3]
            swings = CycleIdentifier._find_swings(pre_pullback)
            swing_highs = [s for s in swings if s["type"] == "high"]
            if not swing_highs:
                return None  # 没有结构性 swing high，无法确认 Lower High
            prev_swing_high = swing_highs[-1]["price"]
            pullback_high = max(prev.high, prev2.high)
            if pullback_high >= prev_swing_high:
                return None  # 不是 Lower High

            # Al Brooks: 止损设在信号棒之外 + 1×ATR 缓冲（加密高波动适配）
            stop = max(prev.high, prev2.high)
            if atr > 0:
                atr_stop = curr.close + 1.0 * atr
                stop = max(stop, atr_stop)
            risk = stop - curr.close
            if risk <= 0:
                return None
            target = curr.close - risk * 2.0

            strength = 78  # V2: 75→78，低1是趋势回落核心策略，基础强度提升
            if pullback_is_bull:
                strength += 5
            if sig_quality >= 0.65:
                strength += 5

            return PASignal(
                symbol=curr.symbol,
                signal_type="低1",
                direction="SELL",
                strength=min(95, strength),
                message="趋势空中 Lower High 反弹 EMA20 后回落",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.60,
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        elif cycle == "急速多":
            # Al Brooks: 急速拉升后的第一次回调买点（急速H1）
            # 急速多 = 连续强阳线快速上冲，此时的微回调就是H1入场机会
            # 与趋势多H1的区别: 不强求Higher Low，急速是新趋势的起点
            # 急速后回调 = 获利了结 / 空头试探，通常会延续方向

            # 1. 回调棒必须是弱棒（不能是强阳线，否则还在急速中）
            # 注意: prev2 通常就是急速阳线本身，不能要求 prev2 是弱棒
            if CandlePatterns.is_strong_bull(prev):
                return None
            pullback_is_bear = CandlePatterns.is_bear(prev)

            # 2. 信号棒突破回调棒高点，且收盘有力
            if curr.close <= prev.high:
                return None
            if not CandlePatterns.is_bull(curr):
                return None
            sig_quality = CandlePatterns.signal_bar_quality(curr, candles[-6:-1], "BUY")
            if sig_quality < 0.55:
                return None

            # 3. 止损和目标（与趋势H1相同逻辑）
            stop = min(prev.low, prev2.low)
            if atr > 0:
                atr_stop = curr.close - 1.0 * atr
                stop = min(stop, atr_stop)
            risk = curr.close - stop
            if risk <= 0:
                return None
            target = curr.close + risk * 2.0

            # 急速H1基础强度76（比趋势H1的78低2分：急速波动大，风险稍高）
            strength = 76
            if pullback_is_bear:
                strength += 5  # 回调是阴线 +5
            if sig_quality >= 0.65:
                strength += 5  # 高质量信号棒 +5

            return PASignal(
                symbol=curr.symbol,
                signal_type="高1",
                direction="BUY",
                strength=min(95, strength),
                message="急速多后微回调再入场（急速H1）",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.55,
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        elif cycle == "急速空":
            # Al Brooks: 急速下冲后的第一次反弹空点（急速L1）
            # 急速空 = 连续强阴线快速下冲，反弹是获利了结 / 多头试探

            # 1. 反弹棒必须是弱棒（不能是强阴线，否则还在急速中）
            # 注意: prev2 通常就是急速阴线本身，不能要求 prev2 是弱棒
            if CandlePatterns.is_strong_bear(prev):
                return None
            pullback_is_bull = CandlePatterns.is_bull(prev)

            # 2. 信号棒跌破反弹棒低点，且收盘有力（阴线）
            if curr.close >= prev.low:
                return None
            if not CandlePatterns.is_bear(curr):
                return None
            sig_quality = CandlePatterns.signal_bar_quality(curr, candles[-6:-1], "SELL")
            if sig_quality < 0.55:
                return None

            # 3. 止损和目标
            stop = max(prev.high, prev2.high)
            if atr > 0:
                atr_stop = curr.close + 1.0 * atr
                stop = max(stop, atr_stop)
            risk = stop - curr.close
            if risk <= 0:
                return None
            target = curr.close - risk * 2.0

            strength = 76
            if pullback_is_bull:
                strength += 5
            if sig_quality >= 0.65:
                strength += 5

            return PASignal(
                symbol=curr.symbol,
                signal_type="低1",
                direction="SELL",
                strength=min(95, strength),
                message="急速空后微反弹再空（急速L1）",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.55,
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        elif cycle == "区间":
            # Al Brooks: 区间中顺大趋势方向的H1
            # 急速拉升后进入区间整理 = 最常见的5m加密场景
            # 在区间内，顺着EMA方向的第一次回调买/卖 = 区间H1
            # 用EMA20斜率判断区间内的方向偏向
            if len(ema20) < 5:
                return None
            ema_slope_up = ema20[-1] > ema20[-4]   # EMA20向上 → 偏多
            ema_slope_dn = ema20[-1] < ema20[-4]   # EMA20向下 → 偏空

            if ema_slope_up:
                # 区间内偏多 → 做H1 BUY
                if CandlePatterns.is_strong_bull(prev):
                    return None
                pullback_is_bear = CandlePatterns.is_bear(prev)
                if curr.close <= prev.high:
                    return None
                if not CandlePatterns.is_bull(curr):
                    return None
                sig_quality = CandlePatterns.signal_bar_quality(
                    curr, candles[-6:-1], "BUY")
                if sig_quality < 0.55:
                    return None
                stop = min(prev.low, prev2.low)
                if atr > 0:
                    stop = min(stop, curr.close - 1.0 * atr)
                risk = curr.close - stop
                if risk <= 0:
                    return None
                target = curr.close + risk * 2.0
                # 区间H1基础强度78（需要两个加成才能过评分80）
                # 评分: trend=12, 加成后strength=88→quality=17+match=22+rr=16+risk=15=82 ✓
                # Al Brooks: 区间H1要求EMA方向+回调棒+高质量信号棒三个条件同时满足
                strength = 78
                if pullback_is_bear:
                    strength += 5
                if sig_quality >= 0.65:
                    strength += 5
                return PASignal(
                    symbol=curr.symbol,
                    signal_type="高1",
                    direction="BUY",
                    strength=min(95, strength),
                    message="区间整理中顺EMA方向回调买入（区间H1）",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.50,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                )

            elif ema_slope_dn:
                # 区间内偏空 → 做L1 SELL
                if CandlePatterns.is_strong_bear(prev):
                    return None
                pullback_is_bull = CandlePatterns.is_bull(prev)
                if curr.close >= prev.low:
                    return None
                if not CandlePatterns.is_bear(curr):
                    return None
                sig_quality = CandlePatterns.signal_bar_quality(
                    curr, candles[-6:-1], "SELL")
                if sig_quality < 0.55:
                    return None
                stop = max(prev.high, prev2.high)
                if atr > 0:
                    stop = max(stop, curr.close + 1.0 * atr)
                risk = stop - curr.close
                if risk <= 0:
                    return None
                target = curr.close - risk * 2.0
                # 区间L1基础强度78（对称）
                strength = 78
                if pullback_is_bull:
                    strength += 5
                if sig_quality >= 0.65:
                    strength += 5
                return PASignal(
                    symbol=curr.symbol,
                    signal_type="低1",
                    direction="SELL",
                    strength=min(95, strength),
                    message="区间整理中顺EMA方向反弹做空（区间L1）",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.50,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                )

        return None

    # === H2/L2 — Al Brooks 最佳入场 (Double Bottom / Double Top) ===

    def detect_h2_l2(self, candles: list[Candle], ema20: list[float],
                     cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        Al Brooks H2/L2 检测 — "每个双底 = H2"

        H2 (BUY): 趋势多中，两次回调低点接近（双底结构），
                   第二次回调后价格恢复 → 入场
        L2 (SELL): 趋势空中，两次回调高点接近（双顶结构），
                   第二次回调后价格恢复 → 入场

        Al Brooks: H2/L2 是最高概率的入场，因为：
        1. 第一次回调（H1）测试了支撑/阻力
        2. 第二次回调确认了该水平的有效性
        3. 双底/双顶 = 市场对该价位的双重确认
        """
        if len(candles) < 25:
            return None

        curr = candles[-1]
        prev = candles[-2]

        if cycle == "趋势多":
            # === H2 BUY — 双底结构 ===

            # 入场条件: 当前棒阳线且突破前棒高点
            if not CandlePatterns.is_bull(curr):
                return None
            if curr.close <= prev.high:
                return None

            # 信号棒质量
            sig_quality = CandlePatterns.signal_bar_quality(
                curr, candles[-6:-1], "BUY")
            if sig_quality < 0.50:
                return None

            # 用 swing 找双底: 在最近 25 根中找至少两个 swing low
            lookback = candles[-25:-1]
            swings = CycleIdentifier._find_swings(lookback)
            swing_lows = [s for s in swings if s["type"] == "low"]

            if len(swing_lows) < 2:
                return None

            # 取最近两个 swing low
            sl1 = swing_lows[-2]  # 第一个低点 (更早)
            sl2 = swing_lows[-1]  # 第二个低点 (更近)

            # 双底条件: Al Brooks H2 = 趋势中的两次回调
            # 两个低点价格差: atr * 2.0（原来 0.8 太严，Higher Low 也会被拒）
            # Al Brooks: H2不要求两个低点完全相同，Higher Low 是最理想的H2结构
            tolerance = atr * 2.0 if atr > 0 else abs(sl1["price"]) * 0.01
            price_diff = abs(sl2["price"] - sl1["price"])
            if price_diff > tolerance:
                return None  # 两次回调差距超过2倍ATR，不是合理H2

            # 两个低点之间必须有恢复尝试（即 H1 — 有棒的高点 > 前棒高点）
            resume_found = False
            for i in range(sl1["idx"] + 1, sl2["idx"]):
                if i > 0 and lookback[i].high > lookback[i - 1].high:
                    resume_found = True
                    break
            if not resume_found:
                return None  # 两个低点之间没有恢复尝试

            # 两个低点间距: 5-25 根合理范围
            bar_gap = sl2["idx"] - sl1["idx"]
            if bar_gap < 3 or bar_gap > 22:
                return None

            # Al Brooks: H2 = 趋势中的第二次回调，跟EMA距离没有硬性关系
            # EMA20 是重要参考位之一，但不是H2的必要条件
            # 在强趋势（Spike/TightChannel）中，回调可能远未触及EMA仍是有效H2
            # 原来的 near_ema 条件在强牛市中会杀死几乎所有H2信号

            # 止损和目标
            stop = min(sl1["price"], sl2["price"])
            if atr > 0:
                stop = min(stop, stop - atr * 0.3)  # 双底之下加小缓冲
            risk = curr.close - stop
            if risk <= 0:
                return None
            # Al Brooks: H2是最高概率入场，设3R目标（反转如果成功空间大）
            target = curr.close + risk * 3.0

            # 强度: H2 基础分更高
            strength = 82
            if sig_quality >= 0.65:
                strength += 5
            # 精确双底（两个低点几乎完全相同）额外加分
            if price_diff < tolerance * 0.3:
                strength += 3
            # 第二个低点是 Higher Low 额外加分
            if sl2["price"] > sl1["price"]:
                strength += 3

            return PASignal(
                symbol=curr.symbol,
                signal_type="高2",
                direction="BUY",
                strength=min(95, strength),
                message=f"趋势多双底H2: 两次回调低点{sl1['price']:.1f}/{sl2['price']:.1f}确认支撑",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.65,
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        elif cycle == "趋势空":
            # === L2 SELL — 双顶结构 ===

            # 入场条件: 当前棒阴线且跌破前棒低点
            if not CandlePatterns.is_bear(curr):
                return None
            if curr.close >= prev.low:
                return None

            # 信号棒质量
            sig_quality = CandlePatterns.signal_bar_quality(
                curr, candles[-6:-1], "SELL")
            if sig_quality < 0.50:
                return None

            # 用 swing 找双顶
            lookback = candles[-25:-1]
            swings = CycleIdentifier._find_swings(lookback)
            swing_highs = [s for s in swings if s["type"] == "high"]

            if len(swing_highs) < 2:
                return None

            sh1 = swing_highs[-2]  # 第一个高点
            sh2 = swing_highs[-1]  # 第二个高点

            # 双顶条件: Al Brooks L2 = 趋势空中的两次反弹
            # 容差扩至 atr * 2.0（原来 0.8 太严，Lower High 也是合理L2结构）
            tolerance = atr * 2.0 if atr > 0 else abs(sh1["price"]) * 0.01
            price_diff = abs(sh2["price"] - sh1["price"])
            if price_diff > tolerance:
                return None

            # 两个高点之间必须有回调（L1 — 有棒低点 < 前棒低点）
            pullback_found = False
            for i in range(sh1["idx"] + 1, sh2["idx"]):
                if i > 0 and lookback[i].low < lookback[i - 1].low:
                    pullback_found = True
                    break
            if not pullback_found:
                return None

            # 间距合理
            bar_gap = sh2["idx"] - sh1["idx"]
            if bar_gap < 3 or bar_gap > 22:
                return None

            # Al Brooks: L2 = 趋势空中的第二次反弹，跟EMA距离没有硬性关系
            # 在强空头趋势中，反弹可能远未触及EMA仍是有效L2

            # 止损和目标
            stop = max(sh1["price"], sh2["price"])
            if atr > 0:
                stop = max(stop, stop + atr * 0.3)
            risk = stop - curr.close
            if risk <= 0:
                return None
            # Al Brooks: L2是最高概率做空入场，设3R目标
            target = curr.close - risk * 3.0

            strength = 82
            if sig_quality >= 0.65:
                strength += 5
            if price_diff < tolerance * 0.3:
                strength += 3
            if sh2["price"] < sh1["price"]:
                strength += 3  # Lower High 加分

            return PASignal(
                symbol=curr.symbol,
                signal_type="低2",
                direction="SELL",
                strength=min(95, strength),
                message=f"趋势空双顶L2: 两次回调高点{sh1['price']:.1f}/{sh2['price']:.1f}确认阻力",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.65,
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        return None

    # === 区间方案 ===

    def detect_fade_breakout(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        看衰突破 (Fade Breakout)
        条件：区间中突破后立即失败（80/20 规则）
        """
        if cycle != "区间" or len(candles) < 20:
            return None

        # 找到区间高低点
        lookback = candles[-20:]
        range_high = max(c.high for c in lookback[:-2])
        range_low = min(c.low for c in lookback[:-2])

        curr = candles[-1]
        prev = candles[-2]

        # 上方突破失败
        if prev.close > range_high and curr.close < range_high:
            # 止损：前高 + 1 ATR
            stop = prev.high + (atr if atr > 0 else prev.high * 0.002)
            target = (range_high + range_low) / 2  # 目标区间中点

            return PASignal(
                symbol=curr.symbol,
                signal_type="看衰突破",
                direction="SELL",
                strength=75, # 反转策略 75 分
                message="区间上方突破失败，看衰做空（80/20规则）",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.8,  # 80% 概率区间突破失败
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        # 下方突破失败
        if prev.close < range_low and curr.close > range_low:
            stop = prev.low - (atr if atr > 0 else prev.low * 0.002)
            target = (range_high + range_low) / 2

            return PASignal(
                symbol=curr.symbol,
                signal_type="看衰突破",
                direction="BUY",
                strength=75, # 反转策略 75 分
                message="区间下方突破失败，看衰做多（80/20规则）",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.8,
                cycle=cycle,
                timeframe=curr.timeframe,
            )

        return None

    def detect_ema_gap(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        20均线缺口 / MAG (MA Gap Bar) — Al Brooks 定义
        - EMA触及 (7-14根远离): 普通均线回测，strength=80
        - MAG 20/20 Setup (15+根远离): Al Brooks原版定义，Final Trend Leg后触及，strength=85（scalp优先）
        条件：趋势中价格连续在EMA单侧后首次触及EMA20
        """
        if not cycle.startswith("趋势") or len(candles) < 25 or len(ema20) < 25:
            return None

        curr = candles[-1]

        # 检查之前连续远离 EMA 的根数（最多回看 22 根，覆盖真正 MAG 的 20 根）
        bars_away = 0
        for i in range(-2, -23, -1):
            if abs(i) > len(candles) or abs(i) > len(ema20):
                break
            if cycle == "趋势多":
                if candles[i].low > ema20[i] * 1.005:  # 价格持续高于 EMA
                    bars_away += 1
                else:
                    break  # 连续性中断即停止计数
            else:
                if candles[i].high < ema20[i] * 0.995:
                    bars_away += 1
                else:
                    break

        if bars_away < 7:  # 少于 7 根：EMA 未真正拉开，跳过
            return None

        # 是否为真正的 MAG (15+根 = Al Brooks 20/20 Setup)
        is_mag = bars_away >= 15
        strength = 85 if is_mag else 80
        label = "MAG 20/20 Setup" if is_mag else "20均线缺口"
        prob = 0.72 if is_mag else 0.65
        # MAG 是 scalp 优先，止盈目标收窄至 1.5R
        rr_mult = 1.5 if is_mag else 2.0

        # 首次触及 EMA
        if cycle == "趋势多":
            if curr.low <= ema20[-1] * 1.003 and curr.close > ema20[-1]:
                stop = curr.low - 1.0 * atr if atr > 0 else curr.low * 0.998
                target = curr.close + (curr.close - stop) * rr_mult

                return PASignal(
                    symbol=curr.symbol,
                    signal_type=label,
                    direction="BUY",
                    strength=strength,
                    message=f"{'MAG: 20+根远离后' if is_mag else '均线缺口'}触及 EMA20（{bars_away}根），scalp多",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=prob,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                )

        elif cycle == "趋势空":
            if curr.high >= ema20[-1] * 0.997 and curr.close < ema20[-1]:
                stop = curr.high + 1.0 * atr if atr > 0 else curr.high * 1.002
                target = curr.close - (stop - curr.close) * rr_mult

                return PASignal(
                    symbol=curr.symbol,
                    signal_type=label,
                    direction="SELL",
                    strength=strength,
                    message=f"{'MAG: 20+根远离后' if is_mag else '均线缺口'}触及 EMA20（{bars_away}根），scalp空",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=prob,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                )

        return None

    # === 反转方案 ===

    def detect_double_top_bottom(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[PASignal]:
        """
        双重顶底 (Double Top/Bottom)
        条件：
        - 两个相近高点/低点形成 M/W 形态
        - 第二个顶/底出现反转棒
        - 符合 Al Brooks 40% 规则：回撤至少 40%
        """
        if len(candles) < 20:
            return None

        # 寻找近期高低点
        lookback = candles[-20:]
        highs = [(i, c.high) for i, c in enumerate(lookback)]
        lows = [(i, c.low) for i, c in enumerate(lookback)]

        # 找最高点
        max_idx, max_high = max(highs, key=lambda x: x[1])
        # 找最低点
        min_idx, min_low = min(lows, key=lambda x: x[1])

        curr = candles[-1]
        prev = candles[-2]

        # 双重顶检测：当前接近之前高点且出现空头反转
        if max_idx < len(lookback) - 3:  # 高点不在最近3根
            # 检查当前是否接近之前高点（0.5% 以内）
            if abs(curr.high - max_high) / max_high < 0.005:
                reversal = CandlePatterns.is_reversal_bar(curr, prev)
                if reversal == "空头反转":
                    # 检查回撤是否至少 40%
                    range_size = max_high - min_low
                    pullback = max_high - lookback[max_idx + 1].low if max_idx + 1 < len(lookback) else 0
                    if range_size > 0 and pullback / range_size >= 0.4:
                        stop = max(curr.high, max_high) + 0.5 * atr if atr > 0 else curr.high * 1.002
                        risk = stop - curr.close
                        # Al Brooks: 双重顶是趋势末端反转，目标3R（成功则大利润）
                        target = curr.close - risk * 3.0

                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="双重顶",
                            direction="SELL",
                            strength=82,  # V2: 78→82，双顶是M40反转策略，强度提升
                            message="双重顶形态，第二顶出现反转棒",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=0.6,
                            cycle="反转空",
                            timeframe=curr.timeframe,
                        )

        # 双重底检测
        if min_idx < len(lookback) - 3:
            if abs(curr.low - min_low) / min_low < 0.005:
                reversal = CandlePatterns.is_reversal_bar(curr, prev)
                if reversal == "多头反转":
                    range_size = max_high - min_low
                    pullback = lookback[min_idx + 1].high - min_low if min_idx + 1 < len(lookback) else 0
                    if range_size > 0 and pullback / range_size >= 0.4:
                        stop = min(curr.low, min_low) - 0.5 * atr if atr > 0 else curr.low * 0.998
                        risk = curr.close - stop
                        # Al Brooks: 双重底是趋势末端反转，目标3R
                        target = curr.close + risk * 3.0

                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="双重底",
                            direction="BUY",
                            strength=82,  # V2: 78→82，双底是M40反转策略，强度提升
                            message="双重底形态，第二底出现反转棒",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=0.6,
                            cycle="反转多",
                            timeframe=curr.timeframe,
                        )

        return None

    def detect_wedge(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[PASignal]:
        """
        楔形顶底 (Wedge Top/Bottom)
        条件：
        - 三推形态（三个递增高点或递减低点）
        - 推动力递减（每次幅度变小）
        - 出现反转信号
        """
        if len(candles) < 15:
            return None

        lookback = candles[-15:]
        curr = candles[-1]
        prev = candles[-2]

        # 寻找三个递增高点（上升楔形 = 潜在空头）
        local_highs = []
        for i in range(2, len(lookback) - 1):
            if lookback[i].high > lookback[i-1].high and lookback[i].high > lookback[i+1].high:
                local_highs.append((i, lookback[i].high))

        if len(local_highs) >= 3:
            # 检查是否递增
            recent_highs = local_highs[-3:]
            if recent_highs[0][1] < recent_highs[1][1] < recent_highs[2][1]:
                # Al Brooks 好楔形 vs 坏楔形分类
                push1 = recent_highs[1][1] - recent_highs[0][1]
                push2 = recent_highs[2][1] - recent_highs[1][1]
                # 好楔形: 第三推 < 50% 第二推 → 75% 反向概率
                # 普通楔形: 第三推 50-70% 第二推 → 65% 反向概率
                # 坏楔形: 第三推 > 70% 第二推 → 不发信号（动能未衰竭）
                if push2 < push1 * 0.7:
                    is_good_wedge = push2 < push1 * 0.5
                    strength = 82 if is_good_wedge else 76
                    probability = 0.75 if is_good_wedge else 0.65
                    quality = "好楔形（动能强衰竭）" if is_good_wedge else "普通楔形"
                    reversal = CandlePatterns.is_reversal_bar(curr, prev)
                    if reversal == "空头反转" or CandlePatterns.is_strong_bear(curr):
                        stop = recent_highs[2][1] + 0.5 * atr if atr > 0 else recent_highs[2][1] * 1.002
                        target = curr.close - (stop - curr.close) * 2

                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="楔形顶",
                            direction="SELL",
                            strength=strength,
                            message=f"上升楔形三推，{quality}（第三推={push2/push1:.0%}第二推）",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=probability,
                            cycle="反转空",
                            timeframe=curr.timeframe,
                        )

        # 寻找三个递减低点（下降楔形 = 潜在多头）
        local_lows = []
        for i in range(2, len(lookback) - 1):
            if lookback[i].low < lookback[i-1].low and lookback[i].low < lookback[i+1].low:
                local_lows.append((i, lookback[i].low))

        if len(local_lows) >= 3:
            recent_lows = local_lows[-3:]
            if recent_lows[0][1] > recent_lows[1][1] > recent_lows[2][1]:
                push1 = recent_lows[0][1] - recent_lows[1][1]
                push2 = recent_lows[1][1] - recent_lows[2][1]
                if push2 < push1 * 0.7:
                    is_good_wedge = push2 < push1 * 0.5
                    strength = 82 if is_good_wedge else 76
                    probability = 0.75 if is_good_wedge else 0.65
                    quality = "好楔形（动能强衰竭）" if is_good_wedge else "普通楔形"
                    reversal = CandlePatterns.is_reversal_bar(curr, prev)
                    if reversal == "多头反转" or CandlePatterns.is_strong_bull(curr):
                        stop = recent_lows[2][1] - 0.5 * atr if atr > 0 else recent_lows[2][1] * 0.998
                        target = curr.close + (curr.close - stop) * 2

                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="楔形底",
                            direction="BUY",
                            strength=strength,
                            message=f"下降楔形三推，{quality}（第三推={push2/push1:.0%}第二推）",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=probability,
                            cycle="反转多",
                            timeframe=curr.timeframe,
                        )

        return None

    def detect_spike_channel(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[PASignal]:
        """
        急速通道 (Spike and Channel)
        条件：
        - 急速阶段后进入通道整理
        - 通道出现失败突破
        - 目标：回到急速阶段起点
        """
        if len(candles) < 30 or len(ema20) < 20:
            return None

        # 检测之前是否有急速阶段（连续 3+ 强势棒）
        spike_start = None
        for i in range(len(candles) - 20, len(candles) - 10):
            if i < 0:
                continue
            segment = candles[i:i+5]
            strong_bulls = sum(1 for c in segment if CandlePatterns.is_strong_bull(c))
            strong_bears = sum(1 for c in segment if CandlePatterns.is_strong_bear(c))
            if strong_bulls >= 3:
                spike_start = ("多", i, candles[i].low)
                break
            elif strong_bears >= 3:
                spike_start = ("空", i, candles[i].high)
                break

        if not spike_start:
            return None

        direction, start_idx, spike_origin = spike_start
        curr = candles[-1]
        prev = candles[-2]

        # 检测通道突破失败
        channel_candles = candles[start_idx + 5:]
        if len(channel_candles) < 5:
            return None

        if direction == "多":
            # 上升急速后的通道：高点创新高但失败回落
            channel_high = max(c.high for c in channel_candles[:-2])
            if prev.high > channel_high and curr.close < prev.low:
                stop = prev.high * 1.002
                target = spike_origin  # 回到急速起点

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="急速通道",
                    direction="SELL",
                    strength=80,
                    message="急速通道顶部突破失败，目标回到起点",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle="反转空",
                    timeframe=curr.timeframe,
                )

        else:  # 空头急速
            channel_low = min(c.low for c in channel_candles[:-2])
            if prev.low < channel_low and curr.close > prev.high:
                stop = prev.low * 0.998
                target = spike_origin

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="急速通道",
                    direction="BUY",
                    strength=80,
                    message="急速通道底部突破失败，目标回到起点",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle="反转多",
                    timeframe=curr.timeframe,
                )

        return None

    def detect_hoy_loy(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        HOY/LOY 突破策略 (High/Low Of Yesterday)
        Al Brooks: 昨日高低点是日内最关键的 S/R 水平
        - 有效突破昨日高点 + 确认 K 线 → 做多（目标: HOY + 昨日Range）
        - 有效突破昨日低点 + 确认 K 线 → 做空（目标: LOY - 昨日Range）
        - 需要 Always-In 方向支持（避免逆势 HOY/LOY 陷阱）
        """
        if len(candles) < 30 or len(ema20) < 5:
            return None

        curr = candles[-1]
        prev = candles[-2]

        # 从 K 线时间戳推算昨日高低点
        # crypto 24/7，以 UTC 0 点为日间分界
        from datetime import timezone, timedelta
        try:
            curr_ts = curr.timestamp
            # 找当日 0 点（UTC+8 北京时间）
            beijing_offset = timedelta(hours=8)
            curr_dt = curr_ts.replace(tzinfo=timezone.utc) + beijing_offset
            today_start = curr_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            today_start_utc = today_start - beijing_offset

            yesterday_candles = [
                c for c in candles
                if c.timestamp.replace(tzinfo=timezone.utc) < today_start_utc
            ]
        except Exception:
            return None  # 时间戳解析失败时跳过

        if len(yesterday_candles) < 6:  # 昨日数据不足
            return None

        hoy = max(c.high for c in yesterday_candles)
        loy = min(c.low for c in yesterday_candles)
        yesterday_range = hoy - loy

        if yesterday_range <= 0:
            return None

        # 突破确认：当前 K 线收盘突破 + 前一根 K 线在关键位附近
        # 防止假突破：要求收盘稳固在 HOY/LOY 之外，且与 cycle 方向一致
        bull_context = not cycle.startswith("趋势空")  # 非空头 cycle 才允许做多
        bear_context = not cycle.startswith("趋势多")  # 非多头 cycle 才允许做空

        # HOY 突破做多
        if bull_context and prev.close <= hoy and curr.close > hoy * 1.001:
            stop = hoy - 1.0 * atr if atr > 0 else hoy * 0.998
            target = hoy + yesterday_range * 0.75  # 目标约昨日Range的75%
            if curr.close <= stop:  # 止损倒挂时跳过
                return None
            rr = (target - curr.close) / (curr.close - stop) if curr.close > stop else 0
            if rr < 1.2:  # 盈亏比不足
                return None

            return PASignal(
                symbol=curr.symbol,
                signal_type="HOY突破",
                direction="BUY",
                strength=78,
                message=f"突破昨日高点 {hoy:.4f}，目标 {target:.4f}（昨日Range: {yesterday_range:.4f}）",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.60,
                cycle=cycle or "趋势多",
                timeframe=curr.timeframe,
            )

        # LOY 突破做空
        if bear_context and prev.close >= loy and curr.close < loy * 0.999:
            stop = loy + 1.0 * atr if atr > 0 else loy * 1.002
            target = loy - yesterday_range * 0.75
            if curr.close >= stop:
                return None
            rr = (curr.close - target) / (stop - curr.close) if stop > curr.close else 0
            if rr < 1.2:
                return None

            return PASignal(
                symbol=curr.symbol,
                signal_type="LOY突破",
                direction="SELL",
                strength=78,
                message=f"突破昨日低点 {loy:.4f}，目标 {target:.4f}（昨日Range: {yesterday_range:.4f}）",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.60,
                cycle=cycle or "趋势空",
                timeframe=curr.timeframe,
            )

        return None

    def detect_final_flag(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        末端旗形 (Final Flag)
        条件：
        - 趋势末期出现小幅回调（旗形）
        - 旗形突破失败
        - 通常是趋势终结信号
        """
        if not cycle.startswith("趋势") or len(candles) < 25:
            return None

        curr = candles[-1]
        prev = candles[-2]

        # 检测旗形：5-10 根小范围震荡
        flag_candles = candles[-10:-1]
        flag_range = max(c.high for c in flag_candles) - min(c.low for c in flag_candles)
        trend_range = max(c.high for c in candles[-25:-10]) - min(c.low for c in candles[-25:-10])

        # 旗形范围应该明显小于趋势范围
        if flag_range > trend_range * 0.4:
            return None

        # 检测旗形内 K 线是否较小
        avg_body = sum(CandlePatterns.body_size(c) for c in flag_candles) / len(flag_candles)
        trend_avg_body = sum(CandlePatterns.body_size(c) for c in candles[-25:-10]) / 15

        if avg_body > trend_avg_body * 0.5:  # 旗形 K 线应该明显较小
            return None

        if cycle == "趋势多":
            # 上升趋势末端旗形：突破失败 = 做空
            flag_high = max(c.high for c in flag_candles)
            if prev.high > flag_high and curr.close < prev.low:
                # 止损：前高 + 1 ATR
                stop = prev.high + (atr if atr > 0 else prev.high * 0.002)
                target = min(c.low for c in flag_candles)

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="末端旗形",
                    direction="SELL",
                    strength=82,
                    message="上升趋势末端旗形突破失败",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle="反转空",
                    timeframe=curr.timeframe,
                )

        elif cycle == "趋势空":
            flag_low = min(c.low for c in flag_candles)
            if prev.low < flag_low and curr.close > prev.high:
                stop = prev.low - (atr if atr > 0 else prev.low * 0.002)
                target = max(c.high for c in flag_candles)

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="末端旗形",
                    direction="BUY",
                    strength=82,
                    message="下降趋势末端旗形突破失败",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle="反转多",
                    timeframe=curr.timeframe,
                    signal_bar_high=prev.high,
                    signal_bar_low=prev.low,
                    entry_trigger=prev.high,
                    entry_type="STOP",
                )

    def detect_breakout_pullback(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        突破回调 (Breakout Pullback)
        条件：
        - 价格突破区间/趋势线后
        - 回调至突破点附近
        - 回调K线不超过突破幅度的50%
        - 出现反转确认
        """
        if len(candles) < 25:
            return None

        curr = candles[-1]

        # 寻找近期突破点（20根K线内的高/低点）
        lookback = candles[-25:-5]
        recent = candles[-5:]

        range_high = max(c.high for c in lookback)
        range_low = min(c.low for c in lookback)

        # 检测向上突破后的回调（只在确认趋势中）
        broke_up = any(c.close > range_high for c in recent[:-2])
        if broke_up and cycle == "趋势多":
            # 当前回调到突破点附近
            if curr.low <= range_high * 1.005 and curr.close > range_high:
                # 信号棒质量检查
                sbq = CandlePatterns.signal_bar_quality(
                    curr, candles[-6:-1], "BUY")
                if sbq < 0.45:
                    return None
                # 回调幅度检查
                highest_after_breakout = max(c.high for c in recent)
                pullback_depth = highest_after_breakout - curr.low
                breakout_height = highest_after_breakout - range_high

                if breakout_height > 0 and pullback_depth < breakout_height * 0.5:
                    stop = range_high - (atr if atr > 0 else range_high * 0.002)
                    target = curr.close + (curr.close - stop) * 2

                    return PASignal(
                        symbol=curr.symbol,
                        signal_type="突破回调",
                        direction="BUY",
                        strength=85, # 顺势高分
                        message="突破区间后回调至突破点，继续做多",
                        price=curr.close,
                        stop_loss=stop,
                        take_profit=target,
                        probability=0.65,
                        cycle=cycle,
                        timeframe=curr.timeframe,
                        signal_bar_high=curr.high,
                        signal_bar_low=curr.low,
                        entry_trigger=curr.high,
                        entry_type="STOP",
                        confirmation_needed=True,
                    )

        # 检测向下突破后的回调（只在确认趋势中）
        broke_down = any(c.close < range_low for c in recent[:-2])
        if broke_down and cycle == "趋势空":
            if curr.high >= range_low * 0.995 and curr.close < range_low:
                # 信号棒质量检查
                sbq = CandlePatterns.signal_bar_quality(
                    curr, candles[-6:-1], "SELL")
                if sbq < 0.45:
                    return None
                lowest_after_breakout = min(c.low for c in recent)
                pullback_depth = curr.high - lowest_after_breakout
                breakout_height = range_low - lowest_after_breakout

                if breakout_height > 0 and pullback_depth < breakout_height * 0.5:
                    stop = range_low + (atr if atr > 0 else range_low * 0.002)
                    target = curr.close - (stop - curr.close) * 2

                    return PASignal(
                        symbol=curr.symbol,
                        signal_type="突破回调",
                        direction="SELL",
                        strength=85, # 顺势高分
                        message="突破区间后回调至突破点，继续做空",
                        price=curr.close,
                        stop_loss=stop,
                        take_profit=target,
                        probability=0.65,
                        cycle=cycle,
                        timeframe=curr.timeframe,
                        signal_bar_high=curr.high,
                        signal_bar_low=curr.low,
                        entry_trigger=curr.low,
                        entry_type="STOP",
                        confirmation_needed=True,
                    )

        return None

    def detect_rush_to_magnet(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[PASignal]:
        """
        急赴磁体 (Rush to Magnet)
        条件：
        - 价格接近重要磁铁位（前高/前低/整数关口）
        - 距离磁铁 < 区间的25%
        - 出现减速/反转信号
        - 准备反向交易
        """
        if len(candles) < 30:
            return None

        curr = candles[-1]
        prev = candles[-2]

        # 寻找潜在磁铁位
        lookback = candles[-30:-5]
        range_high = max(c.high for c in lookback)
        range_low = min(c.low for c in lookback)
        range_size = range_high - range_low

        if range_size == 0:
            return None

        # 检测接近上方磁铁
        dist_to_high = range_high - curr.close
        if 0 < dist_to_high < range_size * 0.25:
            # 检测减速信号
            body_shrinking = CandlePatterns.body_size(curr) < CandlePatterns.body_size(prev) * 0.5
            reversal = CandlePatterns.is_reversal_bar(curr, prev)

            if body_shrinking or reversal == "空头反转":
                # 止损：磁铁位上方 1 ATR
                stop = range_high + (atr if atr > 0 else range_high * 0.002)
                target = range_low + range_size * 0.5  # 目标区间中点

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="急赴磁体",
                    direction="SELL",
                    strength=72,
                    message="价格接近前高磁铁位，准备反转做空",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.6,
                    cycle="区间",
                    timeframe=curr.timeframe,
                    signal_bar_high=curr.high,
                    signal_bar_low=curr.low,
                    entry_trigger=curr.low,
                    entry_type="STOP",
                    extra={"magnet": range_high, "distance": dist_to_high},
                )

        # 检测接近下方磁铁
        dist_to_low = curr.close - range_low
        if 0 < dist_to_low < range_size * 0.25:
            body_shrinking = CandlePatterns.body_size(curr) < CandlePatterns.body_size(prev) * 0.5
            reversal = CandlePatterns.is_reversal_bar(curr, prev)

            if body_shrinking or reversal == "多头反转":
                stop = range_low - (atr if atr > 0 else range_low * 0.002)
                target = range_high - range_size * 0.5

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="急赴磁体",
                    direction="BUY",
                    strength=72,
                    message="价格接近前低磁铁位，准备反转做多",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.6,
                    cycle="区间",
                    timeframe=curr.timeframe,
                    signal_bar_high=curr.high,
                    signal_bar_low=curr.low,
                    entry_trigger=curr.high,
                    entry_type="STOP",
                    extra={"magnet": range_low, "distance": dist_to_low},
                )

        return None

    def detect_first_ema_gap(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        第一均线缺口 (First EMA Gap)
        条件：
        - 趋势中首次远离 EMA20 形成明显缺口
        - 至少 5 根 K 线完全脱离 EMA
        - 价格回归 EMA20 时入场
        """
        if not cycle.startswith("趋势") or len(candles) < 20 or len(ema20) < 20:
            return None

        curr = candles[-1]

        # 检查是否形成首次缺口
        gap_bars = 0
        for i in range(-2, -15, -1):
            if abs(i) > len(candles) or abs(i) > len(ema20):
                break

            c = candles[i]
            ema = ema20[i]

            if cycle == "趋势多":
                # 多头趋势：K线最低点高于 EMA（形成向上缺口）
                if c.low > ema * 1.005:
                    gap_bars += 1
                else:
                    break
            else:
                # 空头趋势：K线最高点低于 EMA（形成向下缺口）
                if c.high < ema * 0.995:
                    gap_bars += 1
                else:
                    break

        if gap_bars < 5:
            return None

        # 首次触及 EMA 时入场
        if cycle == "趋势多":
            if curr.low <= ema20[-1] * 1.003 and curr.close > ema20[-1]:
                # 止损：前低 - 1 ATR
                stop = curr.low - (atr if atr > 0 else curr.low * 0.002)
                target = curr.close + (curr.close - stop) * 2.5

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="第一均线缺口",
                    direction="BUY",
                    strength=83, # 顺势高分
                    message=f"首次{gap_bars}根缺口后触及EMA20，高概率反弹",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                    signal_bar_high=curr.high,
                    signal_bar_low=curr.low,
                    entry_trigger=curr.high,
                    entry_type="STOP",
                    extra={"gap_bars": gap_bars},
                )

        elif cycle == "趋势空":
            if curr.high >= ema20[-1] * 0.997 and curr.close < ema20[-1]:
                stop = curr.high + (atr if atr > 0 else curr.high * 0.002)
                target = curr.close - (stop - curr.close) * 2.5

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="第一均线缺口",
                    direction="SELL",
                    strength=83,
                    message=f"首次{gap_bars}根缺口后触及EMA20，高概率回落",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                    signal_bar_high=curr.high,
                    signal_bar_low=curr.low,
                    entry_trigger=curr.low,
                    entry_type="STOP",
                    extra={"gap_bars": gap_bars},
                )

        return None

    # === ii/ioi 压缩突破 (08C) ===

    def detect_ii_breakout(self, candles: list[Candle], ema20: list[float], cycle: str, atr: float = 0.0) -> Optional[PASignal]:
        """
        ii/ioi 压缩突破检测 (Al Brooks 08C)
        - ii = 连续2根内包线（小周期三角形收敛）
        - ioi = 内包→外包→内包（压缩→试探→再压缩）
        条件：
        - 需要好的 Context（Bull BO后 = Flag, Trend末期 = Final Flag）
        - 最后一根 bar 的收盘方向暗示突破方向
        - 最佳环境: TTR / Bull-Bear Flag 中
        """
        if len(candles) < 6 or len(ema20) < 6:
            return None

        # 检查最近5根K线的 ii/ioi 模式
        bars = candles[-5:]

        def is_inside(child: Candle, parent: Candle) -> bool:
            return child.high <= parent.high and child.low >= parent.low

        def is_outside(child: Candle, parent: Candle) -> bool:
            return child.high > parent.high and child.low < parent.low

        pattern = None
        pattern_bars = []

        # 检测 ii (双内包): bars[-3]为母线, bars[-2]和bars[-1]连续内包
        if is_inside(bars[-2], bars[-3]) and is_inside(bars[-1], bars[-2]):
            pattern = "ii"
            pattern_bars = bars[-3:]
        # 检测 ioi (内外内): bars[-4]为起始, bars[-3]内包, bars[-2]外包, bars[-1]内包
        elif len(bars) >= 4 and is_inside(bars[-3], bars[-4]) and is_outside(bars[-2], bars[-3]) and is_inside(bars[-1], bars[-2]):
            pattern = "ioi"
            pattern_bars = bars[-4:]
        # 检测 iii (三重内包)
        elif len(bars) >= 4 and is_inside(bars[-3], bars[-4]) and is_inside(bars[-2], bars[-3]) and is_inside(bars[-1], bars[-2]):
            pattern = "iii"
            pattern_bars = bars[-4:]

        if not pattern:
            return None

        curr = candles[-1]
        # 最后一根bar的收盘方向决定信号方向
        is_bull_close = curr.close > (curr.open + curr.close) / 2 if curr.open != curr.close else curr.close > candles[-2].close

        # 确定突破范围（整个 pattern 的 high/low）
        pattern_high = max(b.high for b in pattern_bars)
        pattern_low = min(b.low for b in pattern_bars)
        pattern_range = pattern_high - pattern_low

        # 过滤: pattern 范围太大（>3 ATR）= 不是真正的压缩
        if atr > 0 and pattern_range > 3 * atr:
            return None

        # Context 检查: 在趋势末期 ii = Final Flag，可能反转
        is_late_trend = cycle.startswith("趋势") and len(candles) >= 30
        # EMA 附近增加可靠性
        near_ema = abs(curr.close - ema20[-1]) / ema20[-1] < 0.005 if ema20[-1] > 0 else False

        if is_bull_close:
            direction = "BUY"
            stop = pattern_low - 0.5 * atr if atr > 0 else pattern_low * 0.998
            risk = curr.close - stop
            target = curr.close + risk * 2.0
            entry_trigger = pattern_high  # 突破 pattern 高点入场

            # 趋势末期的 ii 可能是 Final Flag → 降低强度
            base_strength = 78 if is_late_trend else 82
            if near_ema:
                base_strength += 3

            return PASignal(
                symbol=curr.symbol,
                signal_type=f"{pattern}突破",
                direction=direction,
                strength=base_strength,
                message=f"{pattern}压缩突破做多，范围{pattern_range:.1f}{'（近EMA）' if near_ema else ''}",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.6,
                cycle=cycle if cycle else "压缩突破",
                timeframe=curr.timeframe,
                signal_bar_high=curr.high,
                signal_bar_low=curr.low,
                entry_trigger=entry_trigger,
                entry_type="STOP",
                extra={"pattern": pattern, "pattern_range": pattern_range, "near_ema": near_ema},
            )
        else:
            direction = "SELL"
            stop = pattern_high + 0.5 * atr if atr > 0 else pattern_high * 1.002
            risk = stop - curr.close
            target = curr.close - risk * 2.0
            entry_trigger = pattern_low  # 突破 pattern 低点入场

            base_strength = 78 if is_late_trend else 82
            if near_ema:
                base_strength += 3

            return PASignal(
                symbol=curr.symbol,
                signal_type=f"{pattern}突破",
                direction=direction,
                strength=base_strength,
                message=f"{pattern}压缩突破做空，范围{pattern_range:.1f}{'（近EMA）' if near_ema else ''}",
                price=curr.close,
                stop_loss=stop,
                take_profit=target,
                probability=0.6,
                cycle=cycle if cycle else "压缩突破",
                timeframe=curr.timeframe,
                signal_bar_high=curr.high,
                signal_bar_low=curr.low,
                entry_trigger=entry_trigger,
                entry_type="STOP",
                extra={"pattern": pattern, "pattern_range": pattern_range, "near_ema": near_ema},
            )

    # === 缺口类型检测 (11A-11D) ===

    def detect_gap_type(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[dict]:
        """
        缺口类型检测（11A-11D，仅作为上下文信息，不直接生成交易信号）
        返回 dict 而非 PASignal，用于丰富其他信号的 context

        检测:
        - Micro Gap: 趋势中前后bar无overlap
        - Exhaustion Gap: 趋势末期大K线的gap被填补
        - Stairs Pattern: 趋势后期gap被快速关闭（趋势衰竭）
        """
        if len(candles) < 15:
            return None

        result = {
            "micro_gaps_open": 0,      # 保持打开的 micro gap 数量
            "micro_gaps_closed": 0,    # 被关闭的 micro gap 数量
            "exhaustion_detected": False,
            "stairs_pattern": False,
            "gap_direction": "neutral",  # bull/bear/neutral
        }

        # 1. 检测 Micro Gap
        for i in range(-10, -2):
            if abs(i) >= len(candles) - 1:
                continue
            prev_bar = candles[i - 1]
            curr_bar = candles[i]
            next_bar = candles[i + 1]

            # Bull micro gap: prev.high < next.low (前后bar无overlap，向上)
            if prev_bar.high < next_bar.low and curr_bar.close > curr_bar.open:
                # 检查是否被后续关闭
                closed = any(c.low <= prev_bar.high for c in candles[i + 2:])
                if closed:
                    result["micro_gaps_closed"] += 1
                else:
                    result["micro_gaps_open"] += 1

            # Bear micro gap: prev.low > next.high
            elif prev_bar.low > next_bar.high and curr_bar.close < curr_bar.open:
                closed = any(c.high >= prev_bar.low for c in candles[i + 2:])
                if closed:
                    result["micro_gaps_closed"] += 1
                else:
                    result["micro_gaps_open"] += 1

        # 2. 判断 gap 方向
        if result["micro_gaps_open"] > result["micro_gaps_closed"]:
            # 判断多数 open gap 的方向
            bull_count = sum(1 for c in candles[-10:] if c.close > c.open)
            result["gap_direction"] = "bull" if bull_count > 5 else "bear"

        # 3. Exhaustion Gap 检测: 趋势10+bar后出现trend中最大K线
        bodies = [abs(c.close - c.open) for c in candles[-15:]]
        if bodies:
            max_body_idx = bodies.index(max(bodies))
            # 最大K线在最近3根中 + 趋势持续10+bar
            if max_body_idx >= 12:
                max_bar = candles[-15 + max_body_idx]
                # 检查是否为 climax（最大实体 + 远离EMA）
                if len(ema20) > 0:
                    ema_distance = abs(max_bar.close - ema20[-1]) / ema20[-1] if ema20[-1] > 0 else 0
                    if ema_distance > 0.015 and max(bodies) > sum(bodies) / len(bodies) * 2.0:
                        result["exhaustion_detected"] = True

        # 4. Stairs Pattern: gap被快速关闭的pattern
        if result["micro_gaps_closed"] >= 3 and result["micro_gaps_open"] <= 1:
            result["stairs_pattern"] = True

        return result if (result["micro_gaps_open"] > 0 or result["exhaustion_detected"] or result["stairs_pattern"]) else None

    # === 头肩形态检测 (27A) ===

    def detect_head_and_shoulders(self, candles: list[Candle], ema20: list[float], atr: float = 0.0) -> Optional[PASignal]:
        """
        头肩形态检测 (Al Brooks 27A: H&S = MTR 变体)
        条件：
        - TBTL: 5根大bar或10根小bar（在2条腿中）
        - 头部必须超过两肩（更高高/更低低）
        - 右肩形成时入场（非颈线突破）
        - 只交易突破 Major Channel Trend Line 的 H&S
        """
        if len(candles) < 30 or len(ema20) < 30:
            return None

        lookback = candles[-30:]
        highs = [c.high for c in lookback]
        lows = [c.low for c in lookback]
        curr = candles[-1]
        prev = candles[-2]

        # 头肩顶 (HST) 检测
        # 寻找: 左肩高点 → 头部(更高) → 右肩(较低高点，当前形成)
        head_idx = highs.index(max(highs))

        # 头部不能在最近3根或最早3根
        if head_idx < 5 or head_idx > len(lookback) - 5:
            pass  # 跳过 HST
        else:
            # 左肩: 头部之前的最高点
            left_highs = highs[:head_idx]
            if left_highs:
                left_shoulder_idx = left_highs.index(max(left_highs))
                left_shoulder = left_highs[left_shoulder_idx]

                # 右肩: 头部之后，当前附近的高点
                right_highs = highs[head_idx + 1:]
                if right_highs and len(right_highs) >= 3:
                    right_shoulder = max(right_highs[-5:]) if len(right_highs) >= 5 else max(right_highs)

                    head_high = highs[head_idx]

                    # 验证: 头部 > 两肩，右肩 < 头部
                    if head_high > left_shoulder and head_high > right_shoulder:
                        # 右肩不能太低（至少达到头部的50%回撤以上）
                        head_range = head_high - min(lows[head_idx - 2:head_idx + 3])
                        if right_shoulder > head_high - head_range * 0.7:

                            # TBTL 检查: 从头部到当前至少5大bar或10小bar
                            bars_since_head = lookback[head_idx:]
                            avg_body = sum(abs(c.close - c.open) for c in lookback) / len(lookback)
                            big_bars = sum(1 for c in bars_since_head if abs(c.close - c.open) > avg_body * 1.5)
                            small_bars = len(bars_since_head)

                            if big_bars >= 5 or small_bars >= 10:
                                # 当前出现空头反转bar = 右肩确认
                                reversal = CandlePatterns.is_reversal_bar(curr, prev)
                                if reversal == "空头反转":
                                    stop = max(curr.high, right_shoulder) + 0.5 * atr if atr > 0 else curr.high * 1.003
                                    risk = stop - curr.close
                                    target = curr.close - risk * 2.5

                                    return PASignal(
                                        symbol=curr.symbol,
                                        signal_type="头肩顶MTR",
                                        direction="SELL",
                                        strength=83,
                                        message=f"头肩顶形态（MTR），右肩确认，TBTL通过（{big_bars}大bar/{small_bars}总bar）",
                                        price=curr.close,
                                        stop_loss=stop,
                                        take_profit=target,
                                        probability=0.55,
                                        cycle="反转空",
                                        timeframe=curr.timeframe,
                                        signal_bar_high=curr.high,
                                        signal_bar_low=curr.low,
                                        entry_trigger=curr.low,
                                        entry_type="STOP",
                                        extra={"head": head_high, "left_shoulder": left_shoulder,
                                               "right_shoulder": right_shoulder, "tbtl_big": big_bars},
                                    )

        # 头肩底 (HSB) 检测
        head_low_idx = lows.index(min(lows))

        if head_low_idx < 5 or head_low_idx > len(lookback) - 5:
            return None

        # 左肩: 头部之前的最低点
        left_lows = lows[:head_low_idx]
        if not left_lows:
            return None
        left_shoulder_idx = left_lows.index(min(left_lows))
        left_shoulder_low = left_lows[left_shoulder_idx]

        # 右肩: 头部之后
        right_lows = lows[head_low_idx + 1:]
        if not right_lows or len(right_lows) < 3:
            return None
        right_shoulder_low = min(right_lows[-5:]) if len(right_lows) >= 5 else min(right_lows)

        head_low = lows[head_low_idx]

        # 验证: 头部 < 两肩
        if head_low < left_shoulder_low and head_low < right_shoulder_low:
            head_range = max(highs[head_low_idx - 2:head_low_idx + 3]) - head_low
            if right_shoulder_low < head_low + head_range * 0.7:

                # TBTL 检查
                bars_since_head = lookback[head_low_idx:]
                avg_body = sum(abs(c.close - c.open) for c in lookback) / len(lookback)
                big_bars = sum(1 for c in bars_since_head if abs(c.close - c.open) > avg_body * 1.5)
                small_bars = len(bars_since_head)

                if big_bars >= 5 or small_bars >= 10:
                    reversal = CandlePatterns.is_reversal_bar(curr, prev)
                    if reversal == "多头反转":
                        stop = min(curr.low, right_shoulder_low) - 0.5 * atr if atr > 0 else curr.low * 0.997
                        risk = curr.close - stop
                        target = curr.close + risk * 2.5

                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="头肩底MTR",
                            direction="BUY",
                            strength=83,
                            message=f"头肩底形态（MTR），右肩确认，TBTL通过（{big_bars}大bar/{small_bars}总bar）",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=0.55,
                            cycle="反转多",
                            timeframe=curr.timeframe,
                            signal_bar_high=curr.high,
                            signal_bar_low=curr.low,
                            entry_trigger=curr.high,
                            entry_type="STOP",
                            extra={"head": head_low, "left_shoulder": left_shoulder_low,
                                   "right_shoulder": right_shoulder_low, "tbtl_big": big_bars},
                        )

        return None
# ============ 主引擎 ============

class PASignalEngine(BaseEngine):
    """纯价格行为信号引擎"""

    def __init__(self, symbols: list[str] = None, timeframes: list[str] = None):
        super().__init__()
        self.symbols = symbols or ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
        # 多周期支持：1m激进、5m常用、15m保守、1h波段
        self.timeframes = timeframes or ["1m", "5m", "15m"]
        self.db_url = get_database_url()

        self.detector = StrategyDetector()
        self.risk_manager = RiskManager()  # 风控管理器
        self.cooldowns: dict[str, float] = {}
        self.cooldown_seconds = COOLDOWN_SECONDS
        self._cooldown_storage = get_cooldown_storage()

        # 周期配置（信号阈值: 1m/5m 最严85, 15m 保守75, 1h 波段70）
        self.timeframe_config = {
            "1m": {
                "signal_threshold": 85,
                "allowed_strategies": ["市价追进", "高1低1", "急速通道"],
                "cooldown_multiplier": 0.5,  # 更短冷却
            },
            "5m": {
                "signal_threshold": 85,
                "allowed_strategies": "all",
                "cooldown_multiplier": 1.0,
            },
            "15m": {
                "signal_threshold": 75,
                "allowed_strategies": ["20均线缺口", "突破回调", "首次均线缺口", "双重顶底", "失败突破", "急赴磁体", "楔形顶底", "急速通道", "末端旗形", "ii突破", "头肩MTR"],
                "cooldown_multiplier": 2.0,  # 更长冷却
            },
            "30m": {
                "signal_threshold": 75,
                "allowed_strategies": [
                    "20均线缺口", "突破回调", "首次均线缺口",
                    "双重顶底", "失败突破", "急赴磁体",
                    "楔形顶底", "急速通道", "末端旗形",
                    "ii突破", "头肩MTR",
                ],
                "cooldown_multiplier": 3.0,
            },
            "1h": {
                "signal_threshold": 70,
                "allowed_strategies": ["楔形顶底", "末端旗形", "急赴磁体", "头肩MTR"],
                "cooldown_multiplier": 4.0,
            },
        }

        self._conn = None
        self._running = False

        self.stats = {
            "checks": 0,
            "signals": 0,
            "errors": 0,
        }

    def _get_conn(self):
        """获取数据库连接"""
        if self._conn is None or self._conn.closed:
            try:
                import psycopg
                self._conn = psycopg.connect(self.db_url, autocommit=True)
                return self._conn
            except Exception as e:
                logger.error(f"Database connection failed: {e}")
                return None
        return self._conn

    def _fetch_candles(self, symbol: str, timeframe: str = "5m", limit: int = 50) -> list[Candle]:
        """从数据库获取 K 线数据，支持多周期聚合"""
        conn = self._get_conn()
        if not conn:
            return []

        try:
            # 根据 timeframe 计算需要的 1m K 线数量
            tf_minutes = {"1m": 1, "5m": 5, "15m": 15, "30m": 30, "1h": 60}
            minutes = tf_minutes.get(timeframe, 5)
            raw_limit = limit * minutes + minutes  # 多取一些用于聚合

            query = """
                SELECT bucket_ts, open, high, low, close, volume
                FROM market_data.candles_1m
                WHERE symbol = %s
                ORDER BY bucket_ts DESC
                LIMIT %s
            """

            with conn.cursor() as cur:
                cur.execute(query, (symbol, raw_limit))
                rows = cur.fetchall()

            if not rows:
                return []

            # 1m 直接返回
            if timeframe == "1m":
                candles = []
                for row in reversed(rows[:limit]):
                    candles.append(Candle(
                        symbol=symbol,
                        timestamp=row[0],
                        open=float(row[1]),
                        high=float(row[2]),
                        low=float(row[3]),
                        close=float(row[4]),
                        volume=float(row[5]) if row[5] else 0,
                        timeframe=timeframe,
                    ))
                return candles

            # 其他周期需要聚合
            raw_candles = list(reversed(rows))  # 按时间正序

            # 聚合成目标周期
            candles = []
            for i in range(0, len(raw_candles) - minutes + 1, minutes):
                chunk = raw_candles[i:i + minutes]
                if len(chunk) < minutes:
                    break

                agg = Candle(
                    symbol=symbol,
                    timestamp=chunk[0][0],  # 使用第一根的时间
                    open=float(chunk[0][1]),
                    high=max(float(c[2]) for c in chunk),
                    low=min(float(c[3]) for c in chunk),
                    close=float(chunk[-1][4]),
                    volume=sum(float(c[5]) if c[5] else 0 for c in chunk),
                    timeframe=timeframe,
                )
                candles.append(agg)

                if len(candles) >= limit:
                    break

            return candles

        except Exception as e:
            logger.error(f"Fetch candles error for {symbol} {timeframe}: {e}")
            self.stats["errors"] += 1
            return []

    def check_signals(self) -> list[PASignal]:
        """检查所有币种的价格行为信号"""
        self.stats["checks"] += 1
        all_signals = []

        for symbol in self.symbols:
            for tf in self.timeframes:
                try:
                    signals = self._check_symbol(symbol, tf)
                    all_signals.extend(signals)
                except Exception as e:
                    logger.error(f"Error checking {symbol} {tf}: {e}")
                    self.stats["errors"] += 1

        return all_signals

    def _check_symbol(self, symbol: str, timeframe: str) -> list[PASignal]:
        """检查单个币种，根据周期过滤策略"""
        candles = self._fetch_candles(symbol, timeframe, limit=50)
        if len(candles) < 20:
            return []

        # 获取周期配置
        tf_config = self.timeframe_config.get(timeframe, self.timeframe_config["5m"])
        allowed_strategies = tf_config.get("allowed_strategies", "all")
        signal_threshold = tf_config.get("signal_threshold", 70)

        # 计算 EMA20
        closes = [c.close for c in candles]
        ema20 = calculate_ema(closes, 20)
        if len(ema20) < 10:
            return []

        # V3.3: 计算 ATR (14) 用于动态止损
        atr = calculate_atr(candles, 14)

        # 识别市场周期（返回 MarketState 对象）
        market_state = CycleIdentifier.identify(candles, ema20)
        cycle = market_state.cycle  # 向后兼容的字符串

        # V5.0: 八状态分类 + 策略推荐
        from engines.market_state_engine import classify_market_state, get_strategy_recommendation
        v5_market_state = classify_market_state(market_state)
        v5_recommendation = get_strategy_recommendation(v5_market_state)

        signals = []

        def is_allowed(strategy_name: str) -> bool:
            """检查策略是否在当前周期允许"""
            if allowed_strategies == "all":
                return True
            return strategy_name in allowed_strategies

        # ============================================================
        # Al Brooks 四状态策略许可矩阵
        #
        # | 状态            | H1 | H2 | Fade | 动量 | 均线缺口 | 反转 |
        # |----------------|----|----|------|------|---------|------|
        # | Spike          | ✅ | ✅ |  ❌  |  ✅  |   ❌    |  ❌  |
        # | Tight Channel  | ✅ | ✅ |  ❌  |  ✅  |   ✅    |  ❌  |
        # | Broad Channel  | ❌ | ✅ |  ✅  |  ❌  |   ✅    |  ✅  |
        # | Trading Range  | ❌ | ❌ |  ✅  |  ❌  |   ❌    |  ✅  |
        # | TTR            | ❌ | ❌ |  ❌  |  ❌  |   ❌    |  ❌  |
        # ============================================================

        ch_type = market_state.channel_type   # "tight" / "broad" / "none"
        is_ttr = market_state.is_ttr

        # TTR = 死钱, 不交易任何策略
        if is_ttr:
            logger.debug(f"TTR 检测: {symbol} {timeframe} — 跳过所有策略")
            return []

        # --- Spike: 动量 + H1/H2 ---
        if cycle.startswith("急速"):
            if is_allowed("市价追进"):
                sig = self.detector.detect_buy_now(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
                sig = self.detector.detect_sell_now(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            # Spike 中也允许 H1/H2 (追第一根回调)
            if is_allowed("高2低2"):
                sig = self.detector.detect_h2_l2(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("高1低1"):
                sig = self.detector.detect_high1_low1(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        # --- Tight Channel: H1 + H2 + 动量 + EMA 缺口 ---
        if cycle.startswith("趋势") and ch_type == "tight":
            if is_allowed("高2低2"):
                sig = self.detector.detect_h2_l2(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("高1低1"):
                sig = self.detector.detect_high1_low1(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("20均线缺口"):
                sig = self.detector.detect_ema_gap(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("首次均线缺口"):
                sig = self.detector.detect_first_ema_gap(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("市价追进"):
                sig = self.detector.detect_buy_now(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
                sig = self.detector.detect_sell_now(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        # --- Broad Channel: H2 + EMA 缺口 + Fade + 反转 (NO H1, NO 动量) ---
        if cycle.startswith("趋势") and ch_type == "broad":
            if is_allowed("高2低2"):
                sig = self.detector.detect_h2_l2(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("20均线缺口"):
                sig = self.detector.detect_ema_gap(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("首次均线缺口"):
                sig = self.detector.detect_first_ema_gap(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            # Broad Channel 允许 fade 和反转
            if is_allowed("失败突破"):
                sig = self.detector.detect_fade_breakout(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("双重顶底"):
                sig = self.detector.detect_double_top_bottom(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("楔形顶底"):
                sig = self.detector.detect_wedge(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("末端旗形"):
                sig = self.detector.detect_final_flag(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        # --- Trading Range: Fade + 反转 + 顺EMA方向H1 ---
        if cycle == "区间":
            # 区间内顺EMA方向的H1（急速后整理阶段最常见的5m加密场景）
            if is_allowed("高1低1"):
                sig = self.detector.detect_high1_low1(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("失败突破"):
                sig = self.detector.detect_fade_breakout(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("双重顶底"):
                sig = self.detector.detect_double_top_bottom(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            if is_allowed("楔形顶底"):
                sig = self.detector.detect_wedge(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        # --- 跨状态策略 ---

        # 急速通道: Spike + Channel 都可能
        if (cycle.startswith("急速") or cycle.startswith("趋势")) and is_allowed("急速通道"):
            sig = self.detector.detect_spike_channel(candles, ema20, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 突破回调: 需要 Follow Through 确认
        if is_allowed("突破回调") and market_state.follow_through:
            sig = self.detector.detect_breakout_pullback(candles, ema20, cycle, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 急赴磁体: 区间 + Broad Channel 边界
        if (cycle == "区间" or ch_type == "broad") and is_allowed("急赴磁体"):
            sig = self.detector.detect_rush_to_magnet(candles, ema20, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # HOY/LOY 突破: 全状态均可触发，昨日高低点是最关键日内 S/R
        if is_allowed("HOY突破") or is_allowed("LOY突破"):
            sig = self.detector.detect_hoy_loy(candles, ema20, cycle, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # ii/ioi 压缩突破: TTR/Tight Channel/Broad Channel/TR 均可
        if not cycle.startswith("急速") and is_allowed("ii突破"):
            sig = self.detector.detect_ii_breakout(candles, ema20, cycle, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 头肩 MTR: Broad Channel / TR / 趋势末期
        if (cycle == "区间" or ch_type == "broad" or is_allowed("头肩MTR")) and not cycle.startswith("急速"):
            sig = self.detector.detect_head_and_shoulders(candles, ema20, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # Gap 上下文检测（enriches other signals, does not generate its own）
        gap_ctx = self.detector.detect_gap_type(candles, ema20, atr)
        if gap_ctx:
            for sig in signals:
                sig.extra["gap_context"] = gap_ctx
                # Exhaustion gap 惩罚顺势信号
                if gap_ctx.get("exhaustion_detected"):
                    if (sig.direction == "BUY" and gap_ctx.get("gap_direction") == "bull") or \
                       (sig.direction == "SELL" and gap_ctx.get("gap_direction") == "bear"):
                        sig.strength = max(50, sig.strength - 10)
                        sig.message = f"{sig.message} (⚠️ Exhaustion Gap)"
                # Stairs pattern 惩罚趋势信号
                if gap_ctx.get("stairs_pattern"):
                    sig.strength = max(50, sig.strength - 5)
                    sig.message = f"{sig.message} (⚠️ Stairs趋势衰竭)"

        # 过滤: Always In 方向 + 冷却 + 风控 + 多周期验证
        filtered = []
        cooldown_multiplier = tf_config.get("cooldown_multiplier", 1.0)
        ai_dir = market_state.always_in  # "long" / "short" / "neutral"

        for sig in signals:
            # Al Brooks: 趋势策略方向必须与 Always In 一致
            # 反转策略可以逆 Always In (但降分)
            _trend_strats = {"收线追进", "高1", "低1", "高2", "低2",
                             "20均线缺口", "突破回调", "首次均线缺口"}
            is_trend_strat = sig.signal_type in _trend_strats

            if ai_dir == "long" and sig.direction == "SELL" and is_trend_strat:
                logger.debug(f"Always In Long 阻止 SELL: {sig.symbol} {sig.signal_type}")
                continue
            if ai_dir == "short" and sig.direction == "BUY" and is_trend_strat:
                logger.debug(f"Always In Short 阻止 BUY: {sig.symbol} {sig.signal_type}")
                continue

            # 周期信号阈值检查
            if sig.strength < signal_threshold:
                logger.debug(f"PA Signal 低于周期阈值: {sig.symbol} {timeframe} {sig.strength} < {signal_threshold}")
                continue

            # 风控检查
            can_send, reject_reason = self.risk_manager.can_send_signal(sig)
            if not can_send:
                logger.debug(f"PA Signal 被风控拒绝: {sig.symbol} {sig.signal_type} - {reject_reason}")
                continue

            # 多周期趋势验证
            trend_valid, trend_msg = TrendValidator.validate_trend(candles, sig.direction)
            if not trend_valid:
                if is_trend_strat:
                    logger.debug(f"趋势策略多周期验证失败: {sig.symbol} {sig.signal_type}")
                    continue
                else:
                    sig.strength = max(50, sig.strength - 10)
                    sig.message = f"{sig.message} (警告: {trend_msg})"

            # 日内时段调整
            session, session_factor = TradingSession.get_session()
            sig.strength = TradingSession.adjust_signal_strength(sig.strength, session)
            sig.extra["session"] = session
            sig.extra["timeframe_style"] = tf_config.get("style", "normal")

            # 计算等距测量目标（增强止盈目标）
            leg1_start, leg1_end = MeasuredMoveCalculator.find_leg1(candles, sig.direction)
            if leg1_start > 0 and leg1_end > 0:
                mm_target = MeasuredMoveCalculator.calculate_target(sig.price, leg1_start, leg1_end, sig.direction)
                if mm_target > 0:
                    sig.extra["measured_move_target"] = mm_target
                    sig.extra["leg1_size"] = abs(leg1_end - leg1_start)

            # 检测反向信号（用于平仓提示）
            old_direction = self.risk_manager.active_directions.get(sig.symbol)
            if old_direction and old_direction != sig.direction:
                sig.extra["reversal_from"] = old_direction
                sig.message = f"{sig.message} [反向信号: 建议平{old_direction}仓]"

            # 冷却检查（根据周期调整冷却时间）
            signal_key = f"pa:{sig.symbol}_{sig.signal_type}_{sig.direction}_{timeframe}"
            effective_cooldown = self.cooldown_seconds * cooldown_multiplier
            if self._is_cooled_down(signal_key, effective_cooldown):
                if self._set_cooldown(signal_key):
                    # V3.7: 方向偏差检测 — 连续同方向信号降分
                    bias_key = f"bias:{sig.symbol}"
                    bias_state = self.cooldowns.get(bias_key, None)
                    if isinstance(bias_state, dict) and bias_state.get("dir") == sig.direction:
                        bias_state["count"] = bias_state.get("count", 0) + 1
                        if bias_state["count"] >= 5:
                            sig.strength -= 10
                            sig.message += f" [方向偏差: 连续{bias_state['count']}次{sig.direction}]"
                    else:
                        bias_state = {"dir": sig.direction, "count": 1}
                    self.cooldowns[bias_key] = bias_state

                    # V5.0: 注入市场状态到信号
                    sig.extra['market_state'] = v5_market_state
                    sig.extra['strategy_recommendation'] = v5_recommendation

                    # 记录到风控系统
                    self.risk_manager.record_signal(sig)
                    filtered.append(sig)
                    self._publish_event(sig)
                    self.stats["signals"] += 1
                    logger.info(f"PA Signal: {sig.symbol} {sig.signal_type} {sig.direction}")

        return filtered

    def _is_cooled_down(self, signal_key: str, cooldown_seconds: float = None) -> bool:
        """检查信号是否已冷却，支持自定义冷却时间"""
        last = self.cooldowns.get(signal_key, 0)
        effective_cooldown = cooldown_seconds if cooldown_seconds is not None else self.cooldown_seconds
        return time.time() - last > effective_cooldown

    def _set_cooldown(self, signal_key: str) -> bool:
        ts = time.time()
        try:
            self._cooldown_storage.set(signal_key, ts)
            self.cooldowns[signal_key] = ts
            return True
        except Exception as e:
            logger.error(f"Cooldown storage error: {e}")
            return False

    def _publish_event(self, signal: PASignal):
        """发布信号事件"""
        try:
            event = SignalEvent(
                symbol=signal.symbol,
                signal_type=signal.signal_type,
                direction=signal.direction,
                strength=signal.strength,
                message_key="signal.pa.custom",
                message_params={"message": signal.message},
                timestamp=signal.timestamp,
                timeframe=signal.timeframe,
                price=signal.price,
                source="pa",
                extra=signal.extra,
                stop_loss=signal.stop_loss,
                take_profit=signal.take_profit,
                entry_trigger=signal.entry_trigger,
                entry_type=signal.entry_type,
                signal_bar_high=signal.signal_bar_high,
                signal_bar_low=signal.signal_bar_low,
                probability=signal.probability,
                cycle=signal.cycle,
                confirmation_needed=signal.confirmation_needed,
                # V5.0: 市场状态 + 策略推荐
                market_state=signal.extra.get('market_state', ''),
                strategy_recommendation=signal.extra.get('strategy_recommendation', {}),
            )
            SignalPublisher.publish(event)
        except Exception as e:
            logger.error(f"Failed to publish PA signal: {e}")

    def get_stats(self) -> dict:
        return {
            **self.stats,
            "symbols": len(self.symbols),
            "timeframes": self.timeframes,
            "running": self._running,
        }

    def run_loop(self, interval: int = 30):
        """运行检测循环（实现 BaseEngine 抽象方法）
        V3.8: 默认间隔从 5s → 30s，减少信号生成频率，节省 Kimi API 额度
        """
        self._running = True
        logger.info(f"PA 引擎开始运行，检测间隔: {interval}秒")

        while self._running:
            try:
                signals = self.check_signals()
                if signals:
                    logger.info(f"PA 引擎检测到 {len(signals)} 个信号")
                time.sleep(interval)
            except Exception as e:
                logger.error(f"PA 引擎检测错误: {e}")
                self.stats["errors"] += 1
                time.sleep(interval)

        logger.info("PA 引擎已停止")


# 单例
_pa_engine: PASignalEngine | None = None
_pa_engine_lock = threading.Lock()


def get_pa_engine(symbols: list[str] = None) -> PASignalEngine:
    """获取 PA 信号引擎单例"""
    global _pa_engine
    if _pa_engine is None:
        with _pa_engine_lock:
            if _pa_engine is None:
                _pa_engine = PASignalEngine(symbols=symbols)
    return _pa_engine
