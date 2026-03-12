"""
H2/L2 策略 - 第二次回调

Al Brooks: "High 2 = second entry long AFTER a failed bear reversal attempt"
"""

from typing import Optional
from ..models import Signal, Candle, MarketState, AIDirection, Direction
from datetime import datetime


class H2L2Strategy:
    """H2/L2 策略"""

    def detect_signal(
        self,
        candles: list[Candle],
        ema_values: list[float],
        market_state: MarketState,
        ai_direction: AIDirection
    ) -> Optional[Signal]:
        """
        检测 H2/L2 信号

        关键条件：
        1. 必须有 failed reversal attempt（L1失败 → H1）
        2. 第二次回调（两根阴线后的阳线）
        3. 市场状态 = Channel
        4. AI方向 = 顺势
        """
        if len(candles) < 15:
            return None

        # 只在Channel中做H2/L2
        if market_state not in [MarketState.TIGHT_CHANNEL, MarketState.BROAD_CHANNEL]:
            return None

        # 检测多头H2
        if ai_direction == AIDirection.AIL:
            signal = self._detect_h2(candles, ema_values, market_state)
            if signal:
                return signal

        # 检测空头L2
        if ai_direction == AIDirection.AIS:
            signal = self._detect_l2(candles, ema_values, market_state)
            if signal:
                return signal

        return None

    def _detect_h2(
        self,
        candles: list[Candle],
        ema_values: list[float],
        market_state: MarketState
    ) -> Optional[Signal]:
        """
        检测多头H2

        定义：
        - 先有L1尝试（1-2根阴线）
        - L1失败（没破结构位）
        - 然后H1（阳线）
        - 再有小回调
        - 然后H2（当前阳线）
        """
        recent_10 = candles[-10:]

        # 1. 检查是否有failed reversal（L1失败）
        has_failed_l1 = False
        for i in range(len(recent_10) - 5, len(recent_10) - 2):
            if i < 0:
                continue

            # 找到阴线（L1尝试）
            if recent_10[i].is_bear:
                # 检查后面是否有阳线恢复（L1失败）
                if i + 1 < len(recent_10) and recent_10[i + 1].is_bull:
                    has_failed_l1 = True
                    break

        if not has_failed_l1:
            return None

        # 2. 检查当前是否是第二次回调后的阳线
        recent_5 = candles[-5:]

        # 计数最近的阴线和阳线
        bear_count = sum(1 for c in recent_5[:-1] if c.is_bear)
        current = candles[-1]

        # H2特征：前面有1-2根阴线，当前是阳线
        if not (bear_count >= 1 and current.is_bull):
            return None

        # 3. 检查是否接近EMA（PB完成）
        current_ema = ema_values[-1]
        distance_to_ema = abs(current.close - current_ema) / current_ema

        if distance_to_ema > 0.02:  # 距离EMA > 2%
            return None

        # 4. 估算概率
        if market_state == MarketState.TIGHT_CHANNEL:
            confidence = 0.60  # 强趋势H2
        else:
            confidence = 0.45  # 弱趋势H2

        return Signal(
            timestamp=current.timestamp,
            type="高2",
            direction=Direction.LONG,
            entry_price=current.close,
            confidence=confidence,
            reason=f"H2 in {market_state.value}: Failed L1 + Second pullback",
            market_state=market_state,
            ai_direction=AIDirection.AIL
        )

    def _detect_l2(
        self,
        candles: list[Candle],
        ema_values: list[float],
        market_state: MarketState
    ) -> Optional[Signal]:
        """
        检测空头L2（逻辑与H2对称）
        """
        recent_10 = candles[-10:]

        # 1. 检查是否有failed reversal（H1失败）
        has_failed_h1 = False
        for i in range(len(recent_10) - 5, len(recent_10) - 2):
            if i < 0:
                continue

            if recent_10[i].is_bull:
                if i + 1 < len(recent_10) and recent_10[i + 1].is_bear:
                    has_failed_h1 = True
                    break

        if not has_failed_h1:
            return None

        # 2. 检查当前是否是第二次回调后的阴线
        recent_5 = candles[-5:]
        bull_count = sum(1 for c in recent_5[:-1] if c.is_bull)
        current = candles[-1]

        if not (bull_count >= 1 and current.is_bear):
            return None

        # 3. 检查是否接近EMA
        current_ema = ema_values[-1]
        distance_to_ema = abs(current.close - current_ema) / current_ema

        if distance_to_ema > 0.02:
            return None

        # 4. 估算概率
        if market_state == MarketState.TIGHT_CHANNEL:
            confidence = 0.60
        else:
            confidence = 0.45

        return Signal(
            timestamp=current.timestamp,
            type="低2",
            direction=Direction.SHORT,
            entry_price=current.close,
            confidence=confidence,
            reason=f"L2 in {market_state.value}: Failed H1 + Second pullback",
            market_state=market_state,
            ai_direction=AIDirection.AIS
        )
