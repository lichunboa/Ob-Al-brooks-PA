"""
市场状态检测

Al Brooks: "Market is always in trend or TR. Know which one you're in."
"""

from typing import List, Tuple
from ..models import Candle, MarketState, AIDirection
from .ema import calculate_ema, ema_slope, ema_distance
from .structure import count_hh_hl


class MarketStateDetector:
    """市场状态检测器"""

    def detect(self, candles: List[Candle], ema_values: List[float]) -> MarketState:
        """
        判断当前市场状态

        BO: 连续3+大趋势K线 + gap
        TC: PB < 2× avg bar, 1-3 bar
        BC: PB > 50%, 5+ bar
        TR: 上下边界清晰，K线重叠多
        """
        if len(candles) < 20:
            return MarketState.UNKNOWN

        recent = candles[-20:]

        # 1. 检查是否BO
        if self._is_breakout(recent):
            return MarketState.BREAKOUT

        # 2. 检查是否Climax
        if self._is_climax(recent):
            return MarketState.CLIMAX

        # 3. 检查是否TR
        if self._is_trading_range(recent):
            return MarketState.TRADING_RANGE

        # 4. 检查是否Channel（TC vs BC）
        if self._is_tight_channel(recent, ema_values[-20:]):
            return MarketState.TIGHT_CHANNEL
        elif self._is_broad_channel(recent):
            return MarketState.BROAD_CHANNEL

        return MarketState.UNKNOWN

    def _is_breakout(self, candles: List[Candle]) -> bool:
        """
        是否突破中

        特征：
        - 连续3+根大趋势K线
        - 方向一致
        - 实体 > 平均的1.5倍
        """
        if len(candles) < 5:
            return False

        recent_5 = candles[-5:]
        avg_body = sum(c.body for c in candles) / len(candles)

        # 检查最近5根中是否有3+根大趋势K线
        big_bull_bars = sum(1 for c in recent_5 if c.is_bull and c.body > avg_body * 1.5)
        big_bear_bars = sum(1 for c in recent_5 if c.is_bear and c.body > avg_body * 1.5)

        return big_bull_bars >= 3 or big_bear_bars >= 3

    def _is_climax(self, candles: List[Candle]) -> bool:
        """
        是否高潮

        特征：
        - 最近1-2根K线异常大
        - 实体 > 平均的2倍
        """
        if len(candles) < 10:
            return False

        avg_body = sum(c.body for c in candles[:-2]) / (len(candles) - 2)
        recent_2 = candles[-2:]

        for c in recent_2:
            if c.body > avg_body * 2:
                return True

        return False

    def _is_trading_range(self, candles: List[Candle]) -> bool:
        """
        是否交易区间

        特征：
        - 上下边界清晰
        - K线重叠多
        - 大阳线后跟大阴线
        """
        if len(candles) < 10:
            return False

        # 计算价格范围
        high = max(c.high for c in candles)
        low = min(c.low for c in candles)
        range_pct = (high - low) / low

        # TR特征：范围不大（< 3%）
        if range_pct > 0.03:
            return False

        # 检查K线重叠
        overlap_count = 0
        for i in range(1, len(candles)):
            prev = candles[i-1]
            curr = candles[i]

            # 检查是否重叠
            if not (curr.low > prev.high or curr.high < prev.low):
                overlap_count += 1

        overlap_ratio = overlap_count / (len(candles) - 1)

        # TR特征：重叠率 > 70%
        return overlap_ratio > 0.7

    def _is_tight_channel(self, candles: List[Candle], ema_values: List[float]) -> bool:
        """
        是否紧密通道

        Al Brooks: "PB < 2x avg bar, 1-3 bars"
        """
        if len(candles) < 10:
            return False

        avg_range = sum(c.range for c in candles) / len(candles)

        # 检查最近的PB深度
        # 找到最近的swing
        recent_10 = candles[-10:]

        # 简化判断：检查EMA距离
        # TC: 价格很少远离EMA
        ema_distances = [abs(ema_distance(c.close, ema_values[i])) for i, c in enumerate(candles)]
        avg_ema_dist = sum(ema_distances) / len(ema_distances)

        # TC特征：平均EMA距离 < 1%
        return avg_ema_dist < 0.01

    def _is_broad_channel(self, candles: List[Candle]) -> bool:
        """
        是否宽幅通道

        特征：
        - 有明显的HH+HL或LH+LL
        - PB深度 > 50%
        """
        if len(candles) < 10:
            return False

        # 检查是否有趋势结构
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]

        # 简化判断：最高点和最低点不在两端
        max_idx = highs.index(max(highs))
        min_idx = lows.index(min(lows))

        # BC特征：极值点在中间（不是强趋势）
        return 2 < max_idx < len(candles) - 2 or 2 < min_idx < len(candles) - 2

    def detect_ai_direction(self, candles: List[Candle], ema_values: List[float], swing_points: List = None) -> AIDirection:
        """
        判断 Always-In 方向

        Al Brooks: "If forced to be in market right now, which side?"

        AIL: HH+HL, 阳线实体 > 阴线, EMA向上
        AIS: LH+LL, 阴线实体 > 阳线, EMA向下
        NEUTRAL: 不确定 = TR
        """
        if len(candles) < 20:
            return AIDirection.NEUTRAL

        recent = candles[-20:]

        # 1. K线序列（HH/HL vs LH/LL）
        if swing_points and len(swing_points) >= 4:
            hh_hl_score = count_hh_hl(swing_points, lookback=10)
            if hh_hl_score > 3:
                structure_vote = "bull"
            elif hh_hl_score < -3:
                structure_vote = "bear"
            else:
                structure_vote = "neutral"
        else:
            structure_vote = "neutral"

        # 2. K线实体对比
        bull_body = sum(c.body for c in recent if c.is_bull)
        bear_body = sum(c.body for c in recent if c.is_bear)

        if bull_body > bear_body * 1.2:
            body_vote = "bull"
        elif bear_body > bull_body * 1.2:
            body_vote = "bear"
        else:
            body_vote = "neutral"

        # 3. EMA方向
        slope = ema_slope(ema_values, len(ema_values) - 1, lookback=10)

        if slope > 0.0001:
            ema_vote = "bull"
        elif slope < -0.0001:
            ema_vote = "bear"
        else:
            ema_vote = "neutral"

        # 4. 价格与EMA位置
        current_price = candles[-1].close
        current_ema = ema_values[-1]

        if current_price > current_ema * 1.005:
            price_vote = "bull"
        elif current_price < current_ema * 0.995:
            price_vote = "bear"
        else:
            price_vote = "neutral"

        # 综合投票（主导特征 > K线序列 > EMA位置）
        votes = [structure_vote, body_vote, ema_vote, price_vote]
        bull_votes = votes.count("bull")
        bear_votes = votes.count("bear")

        if bull_votes >= 3:
            return AIDirection.AIL
        elif bear_votes >= 3:
            return AIDirection.AIS
        else:
            return AIDirection.NEUTRAL
