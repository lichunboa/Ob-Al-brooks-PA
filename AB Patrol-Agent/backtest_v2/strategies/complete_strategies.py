"""
完整的 Al Brooks 策略实现

基于 indicators/batch 的计算结果，实现所有 10+ 策略
"""

from typing import Optional, List
from datetime import datetime
from ..models import Signal, Candle, MarketState, AIDirection, Direction


# ============================================================================
# 5. 看衰突破策略 - Failed Breakout
# ============================================================================

class FailedBreakoutStrategy:
    """
    看衰突破 - Fade Weak Breakout

    Al Brooks: "80% of breakouts fail in TR"
    "BO bar + 2-3 bars no follow-through → fade it"

    适用场景：TR 突破后无 FT
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测看衰突破信号"""

        # 只在 TR 中做 Failed BO
        if market_state != MarketState.TRADING_RANGE:
            return None

        if len(candles) < 5:
            return None

        # 检查是否有 TR 边界
        tr_boundaries = indicators.get('tr_boundaries', {})
        if not tr_boundaries:
            return None

        tr_top = tr_boundaries.get('top')
        tr_bottom = tr_boundaries.get('bottom')

        if not tr_top or not tr_bottom:
            return None

        recent_5 = candles[-5:]
        current = candles[-1]

        # 检查是否有突破尝试
        # 向上突破失败
        for i in range(len(recent_5) - 3):
            if recent_5[i].high > tr_top:
                # 检查后续 2-3 根是否无 FT
                has_ft = False
                for j in range(i + 1, min(i + 4, len(recent_5))):
                    if recent_5[j].close > tr_top:
                        has_ft = True
                        break

                if not has_ft and current.close < tr_top:
                    # 突破失败，做空
                    return Signal(
                        timestamp=current.timestamp,
                        type="看衰突破",
                        direction=Direction.SHORT,
                        entry_price=current.close,
                        confidence=0.60,  # TR 中 80% BO 失败
                        reason=f"Failed BO above TR top {tr_top:.2f}, no FT",
                        market_state=market_state,
                        ai_direction=ai_direction
                    )

        # 向下突破失败
        for i in range(len(recent_5) - 3):
            if recent_5[i].low < tr_bottom:
                has_ft = False
                for j in range(i + 1, min(i + 4, len(recent_5))):
                    if recent_5[j].close < tr_bottom:
                        has_ft = True
                        break

                if not has_ft and current.close > tr_bottom:
                    # 突破失败，做多
                    return Signal(
                        timestamp=current.timestamp,
                        type="看衰突破",
                        direction=Direction.LONG,
                        entry_price=current.close,
                        confidence=0.60,
                        reason=f"Failed BO below TR bottom {tr_bottom:.2f}, no FT",
                        market_state=market_state,
                        ai_direction=ai_direction
                    )

        return None


# ============================================================================
# 6. 第二腿陷阱策略 - 2nd Leg Trap
# ============================================================================

class SecondLegTrapStrategy:
    """
    第二腿陷阱 - 2nd Leg Trap

    Al Brooks: "BO + FT + 2nd leg (DT/DB) + no FT → trapped traders"
    "Different from Failed BO: this one HAD follow-through first"

    关键区别：
    - Failed BO: BO 后立即无 FT
    - 2nd Leg Trap: BO 后有 FT，然后 double top/bottom 失败
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测第二腿陷阱信号"""

        # 在 TR 或 BC 中做 2nd Leg Trap
        if market_state not in [MarketState.TRADING_RANGE, MarketState.BROAD_CHANNEL]:
            return None

        # 从 indicators 获取 DT/DB
        dt_db_list = indicators.get('dt_db', [])

        if not dt_db_list:
            return None

        current_price = candles[-1].close

        for pattern in dt_db_list:
            # 检查是否是最近的形态
            if pattern.get('low2_bars_ago', 999) > 10:
                continue

            # 双底陷阱（2nd leg 失败）
            if pattern['type'] == 'DB':
                low1_ago = pattern.get('low1_bars_ago', 999)
                low2_ago = pattern.get('low2_bars_ago', 999)

                # 确保有时间间隔（不是立即失败）
                if low2_ago < low1_ago and (low1_ago - low2_ago) > 3:
                    # 检查第二腿是否失败（没有突破 neckline）
                    if current_price < pattern['neckline']:
                        return Signal(
                            timestamp=candles[-1].timestamp,
                            type="第二腿陷阱",
                            direction=Direction.SHORT,
                            entry_price=current_price,
                            confidence=0.55,
                            reason=f"2nd Leg Trap: DB failed at {pattern['neckline']:.2f}",
                            market_state=market_state,
                            ai_direction=ai_direction
                        )

            # 双顶陷阱
            elif pattern['type'] == 'DT':
                high1_ago = pattern.get('high1_bars_ago', 999)
                high2_ago = pattern.get('high2_bars_ago', 999)

                if high2_ago < high1_ago and (high1_ago - high2_ago) > 3:
                    if current_price > pattern['neckline']:
                        return Signal(
                            timestamp=candles[-1].timestamp,
                            type="第二腿陷阱",
                            direction=Direction.LONG,
                            entry_price=current_price,
                            confidence=0.55,
                            reason=f"2nd Leg Trap: DT failed at {pattern['neckline']:.2f}",
                            market_state=market_state,
                            ai_direction=ai_direction
                        )

        return None


# ============================================================================
# 7. BLSHS 策略 - Buy Low Sell High Scalp
# ============================================================================

class BLSHSStrategy:
    """
    BLSHS - Buy Low Sell High Scalp

    Al Brooks: "TR = limit order market"
    "Buy bottom 1/3, sell top 1/3, don't trade middle"

    适用场景：TR 边缘
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测 BLSHS 信号"""

        # 只在 TR 中做 BLSHS
        if market_state != MarketState.TRADING_RANGE:
            return None

        tr_boundaries = indicators.get('tr_boundaries', {})
        if not tr_boundaries:
            return None

        tr_top = tr_boundaries.get('top')
        tr_bottom = tr_boundaries.get('bottom')
        tr_position = tr_boundaries.get('position', 'middle')

        if not tr_top or not tr_bottom:
            return None

        current = candles[-1]

        # 在底部 1/3 做多
        if tr_position == 'bottom':
            # 检查是否有反转 K 线
            if current.is_bull and current.close_position > 0.6:
                return Signal(
                    timestamp=current.timestamp,
                    type="BLSHS",
                    direction=Direction.LONG,
                    entry_price=current.close,
                    confidence=0.60,
                    reason=f"BLSHS: Buy at TR bottom, target {tr_top:.2f}",
                    market_state=market_state,
                    ai_direction=AIDirection.NEUTRAL  # TR 中不看 AI 方向
                )

        # 在顶部 1/3 做空
        elif tr_position == 'top':
            if current.is_bear and current.close_position < 0.4:
                return Signal(
                    timestamp=current.timestamp,
                    type="BLSHS",
                    direction=Direction.SHORT,
                    entry_price=current.close,
                    confidence=0.60,
                    reason=f"BLSHS: Sell at TR top, target {tr_bottom:.2f}",
                    market_state=market_state,
                    ai_direction=AIDirection.NEUTRAL
                )

        return None


# ============================================================================
# 8. EMA 回调策略 - EMA Pullback
# ============================================================================

class EMAPullbackStrategy:
    """
    EMA 回调 - EMA PB

    Al Brooks: "Strong trend, EMA is natural S/R"
    "First PB to EMA = high probability bounce"

    适用场景：强趋势中首次触及 EMA
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测 EMA PB 信号"""

        # 只在趋势中做 EMA PB
        if market_state not in [MarketState.TIGHT_CHANNEL, MarketState.BROAD_CHANNEL]:
            return None

        # 检查是否首次 PB
        first_pb_data = indicators.get('first_pb_bars_ago', 0)
        first_pb_type = indicators.get('first_pb_type', 'none')

        if first_pb_data == 0 or first_pb_type == 'none':
            return None

        # 首次 PB 必须是最近的（< 5 根）
        if first_pb_data > 5:
            return None

        current = candles[-1]
        price_vs_ema = indicators.get('price_vs_ema', 'touching')

        # 多头趋势中的首次 PB
        if first_pb_type == 'bull_pb' and ai_direction == AIDirection.AIL:
            if price_vs_ema == 'touching' and current.is_bull:
                return Signal(
                    timestamp=current.timestamp,
                    type="EMA回调",
                    direction=Direction.LONG,
                    entry_price=current.close,
                    confidence=0.60,
                    reason="First PB to EMA in bull trend",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

        # 空头趋势中的首次 PB
        elif first_pb_type == 'bear_pb' and ai_direction == AIDirection.AIS:
            if price_vs_ema == 'touching' and current.is_bear:
                return Signal(
                    timestamp=current.timestamp,
                    type="EMA回调",
                    direction=Direction.SHORT,
                    entry_price=current.close,
                    confidence=0.60,
                    reason="First PB to EMA in bear trend",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

        return None


# ============================================================================
# 9. MAG Setup 策略 - 20/20 Setup
# ============================================================================

class MAGSetupStrategy:
    """
    MAG Setup - 20/20 Setup

    Al Brooks: "20+ bars on one side of EMA, first touch = high probability"
    "60% chance of MTR attempt, but 60% of those fail"

    适用场景：极强趋势后首次触及 EMA
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测 MAG Setup 信号"""

        # 检查是否有 20+ bars 在 EMA 一侧
        bars_above = indicators.get('bars_above_ema', 0)
        bars_below = indicators.get('bars_below_ema', 0)

        if bars_above < 20 and bars_below < 20:
            return None

        current = candles[-1]
        price_vs_ema = indicators.get('price_vs_ema', 'touching')

        # 20+ bars 在上方，首次触及 EMA
        if bars_above >= 20 and price_vs_ema == 'touching':
            # 这是反弹机会（Scalp）
            if current.is_bull:
                return Signal(
                    timestamp=current.timestamp,
                    type="MAG 20/20",
                    direction=Direction.LONG,
                    entry_price=current.close,
                    confidence=0.60,
                    reason=f"20/20 Setup: {bars_above} bars above EMA, first touch",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

        # 20+ bars 在下方，首次触及 EMA
        elif bars_below >= 20 and price_vs_ema == 'touching':
            if current.is_bear:
                return Signal(
                    timestamp=current.timestamp,
                    type="MAG 20/20",
                    direction=Direction.SHORT,
                    entry_price=current.close,
                    confidence=0.60,
                    reason=f"20/20 Setup: {bars_below} bars below EMA, first touch",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

        return None


# ============================================================================
# 10. 收线追进策略 - Buy The Close
# ============================================================================

class BuyTheCloseStrategy:
    """
    收线追进 - Buy The Close (BTC)

    Al Brooks: "Strong bull bar, buy the close"
    "In strong BO, chase is correct"

    适用场景：强 BO 中的大趋势 K 线
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测收线追进信号"""

        # 只在 BO 中做 BTC
        if market_state != MarketState.BREAKOUT:
            return None

        if len(candles) < 3:
            return None

        current = candles[-1]

        # 计算平均 K 线大小
        recent_10 = candles[-10:]
        avg_body = sum(c.body for c in recent_10) / len(recent_10)

        # 检查当前 K 线是否是大趋势 K 线
        # 实体 > 1.5× 平均，收盘在极端
        if current.body > avg_body * 1.5:
            # 大阳线，做多
            if current.is_bull and current.close_position > 0.8 and ai_direction == AIDirection.AIL:
                return Signal(
                    timestamp=current.timestamp,
                    type="收线追进",
                    direction=Direction.LONG,
                    entry_price=current.close,
                    confidence=0.55,
                    reason=f"BTC: Strong bull bar in BO, body {current.body:.2f} > avg {avg_body:.2f}",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

            # 大阴线，做空
            elif current.is_bear and current.close_position < 0.2 and ai_direction == AIDirection.AIS:
                return Signal(
                    timestamp=current.timestamp,
                    type="收线追进",
                    direction=Direction.SHORT,
                    entry_price=current.close,
                    confidence=0.55,
                    reason=f"BTC: Strong bear bar in BO, body {current.body:.2f} > avg {avg_body:.2f}",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

        return None


# ============================================================================
# 策略集合（更新版）
# ============================================================================

class BrooksStrategyCollection:
    """Al Brooks 策略集合 - 完整版"""

    def __init__(self):
        self.strategies = [
            H1L1Strategy(),
            H2L2Strategy(),
            DoubleTopBottomStrategy(),
            WedgeStrategy(),
            FailedBreakoutStrategy(),
            SecondLegTrapStrategy(),
            BLSHSStrategy(),
            EMAPullbackStrategy(),
            MAGSetupStrategy(),
            BuyTheCloseStrategy(),
        ]

    def scan_all(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> List[Signal]:
        """扫描所有策略"""
        signals = []

        for strategy in self.strategies:
            signal = strategy.detect_signal(
                candles, ema_values, market_state, ai_direction, indicators
            )
            if signal:
                signals.append(signal)

        return signals


# 导入前面实现的策略
from .all_strategies import (
    H1L1Strategy,
    H2L2Strategy,
    DoubleTopBottomStrategy,
    WedgeStrategy
)
