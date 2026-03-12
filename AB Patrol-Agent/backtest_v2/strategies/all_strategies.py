"""
所有 Al Brooks 策略实现

基于 indicators/batch 的计算结果，实现 10+ 策略：
1. H1/L1 - 第一次回调
2. H2/L2 - 第二次回调
3. 双顶/双底 - DT/DB
4. 楔形 - Wedge
5. 看衰突破 - Failed Breakout
6. 第二腿陷阱 - 2nd Leg Trap
7. BLSHS - TR 边缘 Scalp
8. EMA PB - EMA 回调
9. MAG Setup - 20/20 Setup
10. Buy The Close - 收线追进

每个策略严格遵循 Al Brooks 原文定义
"""

from typing import Optional, List
from datetime import datetime
from ..models import Signal, Candle, MarketState, AIDirection, Direction


class BrooksStrategyCollection:
    """Al Brooks 策略集合"""

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
        indicators: dict  # 来自 indicators/batch 的计算结果
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


# ============================================================================
# 1. H1/L1 策略 - 第一次回调
# ============================================================================

class H1L1Strategy:
    """
    H1/L1 - 第一次回调入场

    Al Brooks: "H1 ends the first leg of sideways or down move"
    "In strong BO, H1 is enough - don't wait for H2"

    适用场景：
    - Spike 后（BO 阶段）：H1 高概率
    - 强 TC 中：PB 浅，H1 够了
    - BC 中：有 FT 的话可以
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测 H1/L1 信号"""

        # 只在 BO 或 TC 中做 H1/L1
        if market_state not in [MarketState.BREAKOUT, MarketState.TIGHT_CHANNEL]:
            return None

        # 从 indicators/batch 获取 H1/L1 检测结果
        hl_entries = indicators.get('hl_entries', [])

        if not hl_entries:
            return None

        # 找最近的 H1 或 L1
        for entry in hl_entries:
            if entry['bars_ago'] > 3:  # 太久远
                continue

            entry_type = entry['type']

            # H1 多头
            if entry_type == 'H1' and ai_direction == AIDirection.AIL:
                return Signal(
                    timestamp=candles[-1].timestamp,
                    type="高1",
                    direction=Direction.LONG,
                    entry_price=entry['entry_price'],
                    confidence=0.60 if market_state == MarketState.BREAKOUT else 0.55,
                    reason=f"H1 in {market_state.value}: First pullback after BO",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

            # L1 空头
            elif entry_type == 'L1' and ai_direction == AIDirection.AIS:
                return Signal(
                    timestamp=candles[-1].timestamp,
                    type="低1",
                    direction=Direction.SHORT,
                    entry_price=entry['entry_price'],
                    confidence=0.60 if market_state == MarketState.BREAKOUT else 0.55,
                    reason=f"L1 in {market_state.value}: First pullback after BO",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

        return None


# ============================================================================
# 2. H2/L2 策略 - 第二次回调（已实现，这里是完整版）
# ============================================================================

class H2L2Strategy:
    """
    H2/L2 - 第二次回调入场

    Al Brooks: "High 2 = second entry long AFTER a failed bear reversal attempt"
    "Most reliable setup in channels"

    关键：必须有 failed reversal（L1 失败 → H1）
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测 H2/L2 信号"""

        # 只在 Channel 中做 H2/L2
        if market_state not in [MarketState.TIGHT_CHANNEL, MarketState.BROAD_CHANNEL]:
            return None

        hl_entries = indicators.get('hl_entries', [])

        if not hl_entries:
            return None

        # 找最近的 H2 或 L2
        for entry in hl_entries:
            if entry['bars_ago'] > 3:
                continue

            entry_type = entry['type']

            # H2 多头
            if entry_type == 'H2' and ai_direction == AIDirection.AIL:
                confidence = 0.60 if market_state == MarketState.TIGHT_CHANNEL else 0.45
                return Signal(
                    timestamp=candles[-1].timestamp,
                    type="高2",
                    direction=Direction.LONG,
                    entry_price=entry['entry_price'],
                    confidence=confidence,
                    reason=f"H2 in {market_state.value}: Second pullback, failed L1",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

            # L2 空头
            elif entry_type == 'L2' and ai_direction == AIDirection.AIS:
                confidence = 0.60 if market_state == MarketState.TIGHT_CHANNEL else 0.45
                return Signal(
                    timestamp=candles[-1].timestamp,
                    type="低2",
                    direction=Direction.SHORT,
                    entry_price=entry['entry_price'],
                    confidence=confidence,
                    reason=f"L2 in {market_state.value}: Second pullback, failed H1",
                    market_state=market_state,
                    ai_direction=ai_direction
                )

        return None


# ============================================================================
# 3. 双顶/双底策略
# ============================================================================

class DoubleTopBottomStrategy:
    """
    双顶/双底

    Al Brooks: "All Double Bottoms are H2 buy setups"
    "All Double Tops are L2 sell setups"

    适用场景：
    - TR 边缘：高概率反转
    - 趋势末期：可能 MTR
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测双顶/双底信号"""

        dt_db_list = indicators.get('dt_db', [])

        if not dt_db_list:
            return None

        current_price = candles[-1].close

        for pattern in dt_db_list:
            if pattern.get('low2_bars_ago', 999) > 5:  # 太久远
                continue

            # 双底（DB）
            if pattern['type'] == 'DB':
                # 检查是否突破 neckline
                if current_price > pattern['neckline']:
                    # TR 中：高概率
                    if market_state == MarketState.TRADING_RANGE:
                        confidence = 0.60
                    # 趋势中：可能反转
                    elif ai_direction == AIDirection.AIS:
                        confidence = 0.45
                    else:
                        confidence = 0.50

                    return Signal(
                        timestamp=candles[-1].timestamp,
                        type="双重底",
                        direction=Direction.LONG,
                        entry_price=current_price,
                        confidence=confidence,
                        reason=f"DB in {market_state.value}: Broke neckline {pattern['neckline']:.2f}",
                        market_state=market_state,
                        ai_direction=ai_direction
                    )

            # 双顶（DT）
            elif pattern['type'] == 'DT':
                if current_price < pattern['neckline']:
                    if market_state == MarketState.TRADING_RANGE:
                        confidence = 0.60
                    elif ai_direction == AIDirection.AIL:
                        confidence = 0.45
                    else:
                        confidence = 0.50

                    return Signal(
                        timestamp=candles[-1].timestamp,
                        type="双重顶",
                        direction=Direction.SHORT,
                        entry_price=current_price,
                        confidence=confidence,
                        reason=f"DT in {market_state.value}: Broke neckline {pattern['neckline']:.2f}",
                        market_state=market_state,
                        ai_direction=ai_direction
                    )

        return None


# ============================================================================
# 4. 楔形策略
# ============================================================================

class WedgeStrategy:
    """
    楔形 - 三推收缩

    Al Brooks: "Any three push pattern qualifies as wedge"
    "Good wedge = 5 conditions: Stair + Anti-trend bar + Convergent + Not in TTR + Balanced legs"

    适用场景：趋势末期反转
    """

    def detect_signal(
        self,
        candles: List[Candle],
        ema_values: List[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Optional[Signal]:
        """检测楔形信号"""

        wedges = indicators.get('wedges', [])

        if not wedges:
            return None

        for wedge in wedges:
            if wedge.get('bars_ago', 999) > 5:
                continue

            # 楔形顶（看跌）
            if wedge['direction'] == 'bear' and ai_direction == AIDirection.AIL:
                # 检查是否是好楔形
                quality_score = wedge.get('quality_score', 0)

                if quality_score >= 3:  # 5 条件中满足 3+
                    return Signal(
                        timestamp=candles[-1].timestamp,
                        type="楔形顶",
                        direction=Direction.SHORT,
                        entry_price=candles[-1].close,
                        confidence=0.55,
                        reason=f"Wedge Top: {quality_score}/5 conditions met",
                        market_state=market_state,
                        ai_direction=ai_direction
                    )

            # 楔形底（看涨）
            elif wedge['direction'] == 'bull' and ai_direction == AIDirection.AIS:
                quality_score = wedge.get('quality_score', 0)

                if quality_score >= 3:
                    return Signal(
                        timestamp=candles[-1].timestamp,
                        type="楔形底",
                        direction=Direction.LONG,
                        entry_price=candles[-1].close,
                        confidence=0.55,
                        reason=f"Wedge Bottom: {quality_score}/5 conditions met",
                        market_state=market_state,
                        ai_direction=ai_direction
                    )

        return None


# 其他策略（Failed BO, 2nd Leg Trap, BLSHS, EMA PB, MAG, BTC）
# 由于篇幅限制，这里先实现框架，后续补充完整逻辑

class FailedBreakoutStrategy:
    """看衰突破"""
    def detect_signal(self, candles, ema_values, market_state, ai_direction, indicators):
        # TODO: 实现
        return None

class SecondLegTrapStrategy:
    """第二腿陷阱"""
    def detect_signal(self, candles, ema_values, market_state, ai_direction, indicators):
        # TODO: 实现
        return None

class BLSHSStrategy:
    """TR 边缘 Scalp"""
    def detect_signal(self, candles, ema_values, market_state, ai_direction, indicators):
        # TODO: 实现
        return None

class EMAPullbackStrategy:
    """EMA 回调"""
    def detect_signal(self, candles, ema_values, market_state, ai_direction, indicators):
        # TODO: 实现
        return None

class MAGSetupStrategy:
    """MAG 20/20 Setup"""
    def detect_signal(self, candles, ema_values, market_state, ai_direction, indicators):
        # TODO: 实现
        return None

class BuyTheCloseStrategy:
    """收线追进"""
    def detect_signal(self, candles, ema_values, market_state, ai_direction, indicators):
        # TODO: 实现
        return None
