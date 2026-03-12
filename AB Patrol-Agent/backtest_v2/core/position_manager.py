"""
持仓管理器 - Premise Check + Strength Check

Al Brooks: "Management is based on what market is doing NOW."
"Does not matter where you buy. Exit based on current context."
"""

from typing import Optional, Tuple
from ..models import Position, Candle, MarketState, AIDirection, Direction
from ..indicators.market_state import MarketStateDetector


class PositionManager:
    """持仓管理器"""

    def __init__(self):
        self.state_detector = MarketStateDetector()

    def check_premise(
        self,
        position: Position,
        candles: list[Candle],
        ema_values: list[float],
        market_state: MarketState,
        ai_direction: AIDirection,
        indicators: dict
    ) -> Tuple[bool, str]:
        """
        Premise Check - 6 项检查

        Al Brooks: "If premise changed, exit immediately. Don't wait for stop."

        Returns:
            (是否通过, 失效原因)
        """

        # 1. AI 方向检查
        if position.direction == Direction.LONG and ai_direction == AIDirection.AIS:
            return False, "AI direction reversed to AIS"
        elif position.direction == Direction.SHORT and ai_direction == AIDirection.AIL:
            return False, "AI direction reversed to AIL"

        # 2. 市场状态检查
        if position.entry_state != market_state:
            # TC → TR: 降级但不一定平仓
            if position.entry_state == MarketState.TIGHT_CHANNEL and market_state == MarketState.TRADING_RANGE:
                return False, "Market changed from TC to TR"
            # BO → TR: 突破失败
            elif position.entry_state == MarketState.BREAKOUT and market_state == MarketState.TRADING_RANGE:
                return False, "BO failed, became TR"

        # 3. 信号 K 线检查（简化：检查价格是否回到入场价错误一侧）
        current_price = candles[-1].close
        if position.direction == Direction.LONG:
            # 多头：价格不应该跌破入场价太多
            if current_price < position.entry_price * 0.98:  # 跌破 2%
                return False, "Price fell below entry significantly"
        else:
            # 空头：价格不应该涨破入场价太多
            if current_price > position.entry_price * 1.02:  # 涨破 2%
                return False, "Price rose above entry significantly"

        # 4. FT 质量检查（简化：检查入场后是否有好的跟进）
        # 这里需要记录入场时的 K 线索引，暂时跳过

        # 5. TP 路径检查
        nearest_resistance = indicators.get('nearest_resistance')
        nearest_support = indicators.get('nearest_support')

        if position.direction == Direction.LONG and nearest_resistance:
            # 检查阻力是否在 TP 之前
            if nearest_resistance['price'] < position.take_profit:
                # 路径受阻，但不一定平仓，可能只是降低 TP
                pass

        # 6. 风险指标检查（简化：检查浮亏是否过大）
        pnl_pct = (current_price - position.entry_price) / position.entry_price
        if position.direction == Direction.SHORT:
            pnl_pct = -pnl_pct

        if pnl_pct < -0.05:  # 浮亏 > 5%（异常，止损应该早就触发了）
            return False, "Excessive floating loss"

        return True, ""

    def check_strength(
        self,
        position: Position,
        candles: list[Candle],
        indicators: dict
    ) -> str:
        """
        Strength Check - 7 项增强信号

        Al Brooks: "Tight channel 中的 sell signal → 大概率只是 minor reversal"

        Returns:
            "HIGH" | "MEDIUM" | "LOW"
        """

        strength_count = 0

        # 1. Gap 保持打开
        mag_count = indicators.get('mag_count_recent', 0)
        if mag_count > 3:
            strength_count += 1

        # 2. 新 Major HL/LH 形成
        swing_levels = indicators.get('swing_levels', [])
        if swing_levels:
            # 检查最近是否有新的 swing
            recent_swings = [s for s in swing_levels if s.get('bars_ago', 999) < 5]
            if recent_swings:
                strength_count += 1

        # 3. EMA 反弹干净
        price_vs_ema = indicators.get('price_vs_ema', 'touching')
        if position.direction == Direction.LONG and price_vs_ema == 'above':
            strength_count += 1
        elif position.direction == Direction.SHORT and price_vs_ema == 'below':
            strength_count += 1

        # 4. Micro gap 未关闭（简化：用 MAG 数量代替）
        if mag_count > 5:
            strength_count += 1

        # 5. PB 浅且有序
        # 需要更复杂的逻辑，暂时跳过

        # 6. 对手方形成楔形
        wedges = indicators.get('wedges', [])
        for wedge in wedges:
            if wedge.get('bars_ago', 999) < 10:
                # 检查是否是对手方的楔形
                if position.direction == Direction.LONG and wedge.get('direction') == 'bear':
                    strength_count += 1
                    break
                elif position.direction == Direction.SHORT and wedge.get('direction') == 'bull':
                    strength_count += 1
                    break

        # 7. 多 TF 同向（需要多周期数据，暂时跳过）

        # 评估
        if strength_count >= 4:
            return "HIGH"
        elif strength_count >= 2:
            return "MEDIUM"
        else:
            return "LOW"
