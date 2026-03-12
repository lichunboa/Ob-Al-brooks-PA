"""
Trader's Equation 评估器

Al Brooks: "P × R > (1-P) is all that matters."
"""

from ..models import Signal, MarketState


class TraderEquation:
    """交易方程评估器"""

    def evaluate(
        self,
        signal: Signal,
        stop_price: float,
        target_price: float,
        market_state: MarketState
    ) -> tuple[bool, float, float, float]:
        """
        评估 P×R > (1-P)

        Returns:
            (是否通过, P, R, TE值)
        """
        # 计算R
        entry = signal.entry_price
        risk = abs(entry - stop_price)
        reward = abs(target_price - entry)

        if risk == 0:
            return False, 0, 0, 0

        R = reward / risk

        # 估算P
        P = self._estimate_probability(signal, market_state, R)

        # 评估TE
        te_value = P * R
        te_threshold = 1 - P

        passed = te_value > te_threshold

        return passed, P, R, te_value

    def _estimate_probability(
        self,
        signal: Signal,
        market_state: MarketState,
        R: float
    ) -> float:
        """
        根据信号类型和市场状态估算概率

        Al Brooks: "Most setups are 40-60%. Best setups are 60%."
        """
        base_p = signal.confidence  # 信号自带的概率估计

        # 根据市场状态调整
        if market_state == MarketState.TIGHT_CHANNEL:
            # 强趋势：概率提升
            if signal.type in ["高1", "低1", "高2", "低2"]:
                base_p = min(0.65, base_p + 0.05)

        elif market_state == MarketState.BROAD_CHANNEL:
            # 弱趋势：概率降低
            if signal.type in ["高2", "低2"]:
                base_p = max(0.35, base_p - 0.10)

        elif market_state == MarketState.TRADING_RANGE:
            # TR：边缘高概率，中间低概率
            if signal.type in ["双重顶", "双重底", "BLSHS"]:
                base_p = 0.60
            else:
                base_p = 0.40

        elif market_state == MarketState.BREAKOUT:
            # BO后：第一次PB高概率
            if signal.type in ["高1", "低1"]:
                base_p = 0.60
            else:
                base_p = 0.50

        # R太小时降低概率（可能是假信号）
        if R < 1.0:
            base_p = max(0.35, base_p - 0.05)

        # R很大时也要谨慎（可能到不了）
        if R > 3.0:
            base_p = max(0.40, base_p - 0.05)

        return base_p

    def get_minimum_r(self, P: float) -> float:
        """
        给定概率P，计算最小R要求

        P×R > (1-P)
        R > (1-P)/P
        """
        if P <= 0 or P >= 1:
            return 999

        return (1 - P) / P

    def get_minimum_p(self, R: float) -> float:
        """
        给定R，计算最小P要求

        P×R > (1-P)
        P > 1/(1+R)
        """
        if R <= 0:
            return 1.0

        return 1 / (1 + R)
