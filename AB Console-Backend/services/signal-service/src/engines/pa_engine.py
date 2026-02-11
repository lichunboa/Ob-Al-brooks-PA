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
from dataclasses import dataclass, field
from datetime import datetime
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

logger = logging.getLogger(__name__)


# ============ 数据结构 ============

@dataclass
class Candle:
    """K 线数据"""
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    timeframe: str = "5m"


@dataclass
class PASignal:
    """价格行为信号"""
    symbol: str
    signal_type: str  # 策略名称
    direction: str    # BUY/SELL
    strength: int     # 0-100
    message: str
    timestamp: datetime = field(default_factory=datetime.now)
    timeframe: str = "5m"
    price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    probability: float = 0.6  # 基于 Al Brooks 概率规则
    cycle: str = ""  # 市场周期：急速/趋势/区间/反转
    # === 入场增强字段 ===
    signal_bar_high: float = 0.0  # 信号K高点
    signal_bar_low: float = 0.0   # 信号K低点
    entry_trigger: float = 0.0    # 入场触发价（突破此价入场）
    entry_type: str = "STOP"      # 入场方式: STOP(止损单)/LIMIT(限价)/MARKET(市价)
    confirmation_needed: bool = False  # 是否需要跟随K确认
    extra: dict = field(default_factory=dict)


# ============ 日内时段分析 ============

class TradingSession:
    """
    日内交易时段分析器
    根据 Al Brooks 日内时段理论调整信号质量
    
    时段划分 (UTC):
    - 亚洲时段: 00:00-08:00 UTC (北京 08:00-16:00)
    - 欧洲时段: 08:00-14:00 UTC (北京 16:00-22:00)
    - 美洲时段: 14:00-21:00 UTC (北京 22:00-05:00)
    - 收盘时段: 21:00-00:00 UTC (北京 05:00-08:00)
    """
    
    @staticmethod
    def get_session(utc_hour: int = None) -> tuple[str, float]:
        """
        获取当前交易时段和强度调整系数
        返回: (时段名称, 强度调整系数)
        """
        from datetime import datetime, timezone
        
        if utc_hour is None:
            utc_hour = datetime.now(timezone.utc).hour
        
        # 亚洲时段：波动较小，突破信号可靠性较低
        if 0 <= utc_hour < 8:
            return "亚洲", 0.9  # 降低10%强度
        
        # 欧洲时段：波动增加，趋势信号较好
        elif 8 <= utc_hour < 14:
            return "欧洲", 1.0  # 标准强度
        
        # 美洲时段：波动最大，信号最活跃
        elif 14 <= utc_hour < 21:
            return "美洲", 1.1  # 增加10%强度
        
        # 收盘时段：波动降低，谨慎交易
        else:
            return "收盘", 0.85  # 降低15%强度
    
    @staticmethod
    def adjust_signal_strength(base_strength: int, session: str = None) -> int:
        """根据时段调整信号强度"""
        if session is None:
            session, factor = TradingSession.get_session()
        else:
            session_factors = {"亚洲": 0.9, "欧洲": 1.0, "美洲": 1.1, "收盘": 0.85}
            factor = session_factors.get(session, 1.0)
        
        adjusted = int(base_strength * factor)
        return max(50, min(100, adjusted))  # 限制在 50-100 范围
    
    @staticmethod
    def is_high_volatility_session() -> bool:
        """是否处于高波动时段（美洲开盘）"""
        session, _ = TradingSession.get_session()
        return session == "美洲"


# ============ 等距测量 (Measured Move) ============

class MeasuredMoveCalculator:
    """
    等距测量计算器
    Al Brooks 核心概念：第1腿 ≈ 第2腿
    """
    
    @staticmethod
    def find_leg1(candles: list[Candle], direction: str) -> tuple[float, float]:
        """
        寻找第一腿的起点和终点
        返回：(leg1_start, leg1_end)
        """
        if len(candles) < 10:
            return (0.0, 0.0)
        
        lookback = candles[-20:]
        
        if direction == "BUY":
            # 多头：寻找最近的低点到高点
            lows = [(i, c.low) for i, c in enumerate(lookback)]
            highs = [(i, c.high) for i, c in enumerate(lookback)]
            
            min_idx, min_low = min(lows, key=lambda x: x[1])
            # 寻找低点之后的最高点
            highs_after = [(i, h) for i, h in highs if i > min_idx]
            if not highs_after:
                return (0.0, 0.0)
            max_idx, max_high = max(highs_after, key=lambda x: x[1])
            return (min_low, max_high)
        
        else:  # SELL
            highs = [(i, c.high) for i, c in enumerate(lookback)]
            lows = [(i, c.low) for i, c in enumerate(lookback)]
            
            max_idx, max_high = max(highs, key=lambda x: x[1])
            lows_after = [(i, l) for i, l in lows if i > max_idx]
            if not lows_after:
                return (0.0, 0.0)
            min_idx, min_low = min(lows_after, key=lambda x: x[1])
            return (max_high, min_low)
    
    @staticmethod
    def calculate_target(current_price: float, leg1_start: float, leg1_end: float, direction: str) -> float:
        """
        根据第1腿计算等距测量目标
        """
        leg1_size = abs(leg1_end - leg1_start)
        if leg1_size == 0:
            return 0.0
        
        if direction == "BUY":
            # 从当前回调低点向上等距
            return current_price + leg1_size
        else:
            return current_price - leg1_size


# ============ 多周期趋势验证 ============

class TrendValidator:
    """
    多周期趋势验证
    用更高周期确认趋势方向
    """
    
    @staticmethod
    def validate_trend(candles_5m: list[Candle], direction: str) -> tuple[bool, str]:
        """
        使用15分钟趋势验证5分钟信号
        通过聚合5m K线模拟15m
        返回：(是否验证通过, 验证消息)
        """
        if len(candles_5m) < 30:  # 需要至少30根5分钟 = 10根15分钟
            return True, "数据不足，跳过验证"
        
        # 聚合为15分钟K线（每3根5分钟聚合）
        candles_15m = []
        for i in range(0, len(candles_5m) - 2, 3):
            chunk = candles_5m[i:i+3]
            if len(chunk) < 3:
                continue
            
            agg = Candle(
                symbol=chunk[0].symbol,
                timestamp=chunk[0].timestamp,
                open=chunk[0].open,
                high=max(c.high for c in chunk),
                low=min(c.low for c in chunk),
                close=chunk[-1].close,
                volume=sum(c.volume for c in chunk),
                timeframe="15m",
            )
            candles_15m.append(agg)
        
        if len(candles_15m) < 5:
            return True, "聚合数据不足"
        
        # 计算15m EMA20
        closes_15m = [c.close for c in candles_15m]
        ema_15m = calculate_ema(closes_15m, min(20, len(closes_15m)))
        if not ema_15m:
            return True, "EMA计算失败"
        
        # 判断15m趋势方向
        slope = ema_slope(ema_15m, 3)
        current_price = candles_15m[-1].close
        current_ema = ema_15m[-1]
        
        if direction == "BUY":
            # 多头信号需要15m趋势向上或中性
            if slope < -0.1 and current_price < current_ema:
                return False, "15m趋势向下，与BUY信号冲突"
            return True, "15m趋势支持BUY"
        
        else:  # SELL
            if slope > 0.1 and current_price > current_ema:
                return False, "15m趋势向上，与SELL信号冲突"
            return True, "15m趋势支持SELL"


# ============ K 线形态识别 ============

class CandlePatterns:
    """K 线形态识别工具类"""
    
    @staticmethod
    def body_size(candle: Candle) -> float:
        """实体大小"""
        return abs(candle.close - candle.open)
    
    @staticmethod
    def range_size(candle: Candle) -> float:
        """整根 K 线范围"""
        return candle.high - candle.low
    
    @staticmethod
    def body_ratio(candle: Candle) -> float:
        """实体占比（实体/范围）"""
        r = CandlePatterns.range_size(candle)
        if r == 0:
            return 0
        return CandlePatterns.body_size(candle) / r
    
    @staticmethod
    def is_bull(candle: Candle) -> bool:
        """是否阳线"""
        return candle.close > candle.open
    
    @staticmethod
    def is_bear(candle: Candle) -> bool:
        """是否阴线"""
        return candle.close < candle.open
    
    @staticmethod
    def is_doji(candle: Candle, threshold: float = 0.1) -> bool:
        """十字星：实体极小"""
        return CandlePatterns.body_ratio(candle) < threshold
    
    @staticmethod
    def is_strong_bull(candle: Candle, threshold: float = 0.7) -> bool:
        """
        强势阳线：
        - 大实体（>70% 范围）
        - 收盘接近最高
        - 最小上影线
        """
        if not CandlePatterns.is_bull(candle):
            return False
        body_r = CandlePatterns.body_ratio(candle)
        upper_shadow = candle.high - candle.close
        body = CandlePatterns.body_size(candle)
        return body_r > threshold and (upper_shadow < body * 0.1 if body > 0 else True)
    
    @staticmethod
    def is_strong_bear(candle: Candle, threshold: float = 0.7) -> bool:
        """
        强势阴线：
        - 大实体（>70% 范围）
        - 收盘接近最低
        - 最小下影线
        """
        if not CandlePatterns.is_bear(candle):
            return False
        body_r = CandlePatterns.body_ratio(candle)
        lower_shadow = candle.close - candle.low
        body = CandlePatterns.body_size(candle)
        return body_r > threshold and (lower_shadow < body * 0.1 if body > 0 else True)
    
    @staticmethod
    def is_signal_bar(candle: Candle, threshold: float = 0.3) -> bool:
        """
        信号棒：
        - 实体小（<30% 范围）
        - 位于关键位置（由调用方判断）
        """
        return CandlePatterns.body_ratio(candle) < threshold
    
    @staticmethod
    def is_reversal_bar(curr: Candle, prev: Candle) -> Optional[str]:
        """
        反转棒检测
        返回 "多头反转" / "空头反转" / None
        """
        # 多头反转：前一根是阴线，当前是阳线且收盘高于前一根高点
        if CandlePatterns.is_bear(prev) and CandlePatterns.is_bull(curr):
            if curr.close > prev.high:
                return "多头反转"
        
        # 空头反转：前一根是阳线，当前是阴线且收盘低于前一根低点
        if CandlePatterns.is_bull(prev) and CandlePatterns.is_bear(curr):
            if curr.close < prev.low:
                return "空头反转"
        
        return None
    
    @staticmethod
    def is_inside_bar(curr: Candle, prev: Candle) -> bool:
        """内包棒：当前 K 线完全被前一根包含"""
        return curr.high <= prev.high and curr.low >= prev.low
    
    @staticmethod
    def is_outside_bar(curr: Candle, prev: Candle) -> bool:
        """外包棒：当前 K 线完全包含前一根"""
        return curr.high > prev.high and curr.low < prev.low


# ============ EMA 计算 ============

def calculate_ema(prices: list[float], period: int = 20) -> list[float]:
    """计算 EMA"""
    if len(prices) < period:
        return []
    
    multiplier = 2 / (period + 1)
    ema = [sum(prices[:period]) / period]  # 第一个 EMA = SMA
    
    for price in prices[period:]:
        ema.append((price - ema[-1]) * multiplier + ema[-1])
    
    return ema


def ema_slope(ema_values: list[float], lookback: int = 5) -> float:
    """EMA 斜率（正=上升，负=下降）"""
    if len(ema_values) < lookback:
        return 0.0
    recent = ema_values[-lookback:]
    return (recent[-1] - recent[0]) / recent[0] * 100  # 百分比


def calculate_atr(candles: list[Candle], period: int = 14) -> float:
    """计算 ATR (Average True Range)"""
    if len(candles) < period + 1:
        return 0.0

    tr_list = []
    for i in range(1, len(candles)):
        c = candles[i]
        prev = candles[i-1]
        hl = c.high - c.low
        hc = abs(c.high - prev.close)
        lc = abs(c.low - prev.close)
        tr = max(hl, hc, lc)
        tr_list.append(tr)

    if not tr_list:
        return 0.0

    # 简单移动平均计算 ATR
    recent_tr = tr_list[-period:]
    return sum(recent_tr) / len(recent_tr)


# ============ 市场周期识别 ============

class CycleIdentifier:
    """市场周期识别器"""
    
    @staticmethod
    def identify(candles: list[Candle], ema20: list[float]) -> str:
        """
        识别当前市场周期
        返回：急速 / 趋势 / 区间 / 反转 / 观望
        """
        if len(candles) < 5 or len(ema20) < 5:
            return "观望"
        
        # 计算 EMA 斜率
        slope = ema_slope(ema20, 5)
        
        # 检查最近 5 根 K 线
        recent = candles[-5:]
        strong_bulls = sum(1 for c in recent if CandlePatterns.is_strong_bull(c))
        strong_bears = sum(1 for c in recent if CandlePatterns.is_strong_bear(c))
        
        # 急速：连续强势棒
        if strong_bulls >= 3:
            return "急速多"
        if strong_bears >= 3:
            return "急速空"
        
        # 趋势：EMA 斜率明显
        if abs(slope) > 0.1:
            # 价格沿 EMA 运行
            price_vs_ema = candles[-1].close - ema20[-1]
            if slope > 0 and price_vs_ema > 0:
                return "趋势多"
            elif slope < 0 and price_vs_ema < 0:
                return "趋势空"
        
        # 区间：EMA 平坦 + 价格在 EMA 附近震荡
        if abs(slope) < 0.05:
            # 检查价格是否在 EMA 附近波动
            deviations = [abs(c.close - ema20[i]) / ema20[i] for i, c in enumerate(candles[-10:]) if i < len(ema20)]
            if deviations and max(deviations) < 0.02:  # 2% 范围内
                return "区间"
        
        # 反转信号检测
        if len(candles) >= 2:
            reversal = CandlePatterns.is_reversal_bar(candles[-1], candles[-2])
            if reversal == "多头反转" and slope < -0.05:
                return "反转多"
            elif reversal == "空头反转" and slope > 0.05:
                return "反转空"
        
        return "观望"


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
            # 止损：最近低点 或 ATR 动态止损
            low_stop = min(c.low for c in recent)
            atr_stop = curr.close - 2.0 * atr if atr > 0 else curr.close * 0.995
            stop = max(low_stop, atr_stop) # 取较近的，还是较远的？通常取结构低点，ATR作为辅助
            # Al Brooks: 止损在信号棒下方1 tick. 如果太远，用ATR保护

            target = curr.close + (curr.close - stop) * 2  # 2:1 盈亏比

            return PASignal(
                symbol=curr.symbol,
                signal_type="收线追进",
                direction="BUY",
                strength=min(95, 75 + strong_count * 10), # 顺势信号给高分
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
            high_stop = max(c.high for c in recent)
            atr_stop = curr.close + 2.0 * atr if atr > 0 else curr.close * 1.005
            stop = min(high_stop, atr_stop)

            target = curr.close - (stop - curr.close) * 2

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
        高1/低1 (High 1/Low 1)
        条件：趋势中第一次回调到 EMA20
        """
        if len(candles) < 10 or len(ema20) < 10:
            return None

        curr = candles[-1]
        prev = candles[-2]

        if cycle == "趋势多":
            # 检测回调到 EMA20
            if prev.low <= ema20[-2] * 1.003 and curr.close > prev.high:
                struct_stop = min(candles[-3].low, prev.low)
                atr_stop = curr.close - 2.0 * atr if atr > 0 else curr.close * 0.995
                stop = max(struct_stop, atr_stop) # 结构止损和ATR止损取较高者（更紧）? 不，通常取较远者避免被扫，或者较近者控制风险？
                # Al Brooks: Always swing stop (previous major low) for trend trading.
                # Use structure stop if reasonable.
                stop = struct_stop

                target = curr.close + (curr.close - stop) * 2

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="高1",
                    direction="BUY",
                    strength=85, # 顺势高分
                    message="趋势中首次回调到 EMA20 后反弹",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.65,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                )

        elif cycle == "趋势空":
            if prev.high >= ema20[-2] * 0.997 and curr.close < prev.low:
                struct_stop = max(candles[-3].high, prev.high)
                stop = struct_stop
                target = curr.close - (stop - curr.close) * 2

                return PASignal(
                    symbol=curr.symbol,
                    signal_type="低1",
                    direction="SELL",
                    strength=85, # 顺势高分
                    message="趋势中首次反弹到 EMA20 后回落",
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
        20均线缺口 (20 EMA Gap)
        条件：趋势中价格首次触及 EMA20
        """
        if not cycle.startswith("趋势") or len(candles) < 20 or len(ema20) < 20:
            return None
        
        curr = candles[-1]
        
        # 检查之前是否远离 EMA
        bars_away = 0
        for i in range(-2, -15, -1):
            if abs(i) > len(candles) or abs(i) > len(ema20):
                break
            if cycle == "趋势多":
                if candles[i].low > ema20[i] * 1.005:  # 价格持续高于 EMA
                    bars_away += 1
            else:
                if candles[i].high < ema20[i] * 0.995:
                    bars_away += 1
        
        if bars_away < 5:  # 需要至少 5 根远离
            return None
        
        # 首次触及 EMA
        if cycle == "趋势多":
            if curr.low <= ema20[-1] * 1.003 and curr.close > ema20[-1]:
                stop = curr.low * 0.998
                target = curr.close + (curr.close - stop) * 2.5
                
                return PASignal(
                    symbol=curr.symbol,
                    signal_type="20均线缺口",
                    direction="BUY",
                    strength=82,
                    message=f"趋势中首次触及 EMA20（{bars_away}根远离后）",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                )
        
        elif cycle == "趋势空":
            if curr.high >= ema20[-1] * 0.997 and curr.close < ema20[-1]:
                stop = curr.high * 1.002
                target = curr.close - (stop - curr.close) * 2.5
                
                return PASignal(
                    symbol=curr.symbol,
                    signal_type="20均线缺口",
                    direction="SELL",
                    strength=82,
                    message=f"趋势中首次触及 EMA20（{bars_away}根远离后）",
                    price=curr.close,
                    stop_loss=stop,
                    take_profit=target,
                    probability=0.7,
                    cycle=cycle,
                    timeframe=curr.timeframe,
                )
        
        return None
    
    # === 反转方案 ===
    
    def detect_double_top_bottom(self, candles: list[Candle], ema20: list[float]) -> Optional[PASignal]:
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
                        stop = curr.high * 1.002
                        target = curr.close - (stop - curr.close) * 2
                        
                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="双重顶",
                            direction="SELL",
                            strength=78,
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
                        stop = curr.low * 0.998
                        target = curr.close + (curr.close - stop) * 2
                        
                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="双重底",
                            direction="BUY",
                            strength=78,
                            message="双重底形态，第二底出现反转棒",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=0.6,
                            cycle="反转多",
                            timeframe=curr.timeframe,
                        )
        
        return None
    
    def detect_wedge(self, candles: list[Candle], ema20: list[float]) -> Optional[PASignal]:
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
                # 检查推动力是否递减
                push1 = recent_highs[1][1] - recent_highs[0][1]
                push2 = recent_highs[2][1] - recent_highs[1][1]
                if push2 < push1 * 0.7:  # 第二次推动力明显减弱
                    reversal = CandlePatterns.is_reversal_bar(curr, prev)
                    if reversal == "空头反转" or CandlePatterns.is_strong_bear(curr):
                        stop = recent_highs[2][1] * 1.002
                        target = curr.close - (stop - curr.close) * 2
                        
                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="楔形顶",
                            direction="SELL",
                            strength=76,
                            message="上升楔形三推，动能衰竭",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=0.65,
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
                    reversal = CandlePatterns.is_reversal_bar(curr, prev)
                    if reversal == "多头反转" or CandlePatterns.is_strong_bull(curr):
                        stop = recent_lows[2][1] * 0.998
                        target = curr.close + (curr.close - stop) * 2
                        
                        return PASignal(
                            symbol=curr.symbol,
                            signal_type="楔形底",
                            direction="BUY",
                            strength=76,
                            message="下降楔形三推，动能衰竭",
                            price=curr.close,
                            stop_loss=stop,
                            take_profit=target,
                            probability=0.65,
                            cycle="反转多",
                            timeframe=curr.timeframe,
                        )
        
        return None
    
    def detect_spike_channel(self, candles: list[Candle], ema20: list[float]) -> Optional[PASignal]:
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
        prev = candles[-2]

        # 寻找近期突破点（20根K线内的高/低点）
        lookback = candles[-25:-5]
        recent = candles[-5:]

        range_high = max(c.high for c in lookback)
        range_low = min(c.low for c in lookback)

        # 检测向上突破后的回调
        broke_up = any(c.close > range_high for c in recent[:-2])
        if broke_up and cycle in ("趋势多", "观望"):
            # 当前回调到突破点附近
            if curr.low <= range_high * 1.005 and curr.close > range_high:
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

        # 检测向下突破后的回调
        broke_down = any(c.close < range_low for c in recent[:-2])
        if broke_down and cycle in ("趋势空", "观望"):
            if curr.high >= range_low * 0.995 and curr.close < range_low:
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
                    message=f"价格接近前高磁铁位，准备反转做空",
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
                    message=f"价格接近前低磁铁位，准备反转做多",
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


# ============ 风控管理器 ============

class RiskManager:
    """
    风控管理器
    - 检查信号方向冲突（避免同一币种同时发多空信号）
    - 日信号数量限制
    - 连续同向信号限制
    - 信号强度过滤
    """
    
    def __init__(self):
        # 当前已发送信号的方向记录 {symbol: direction}
        self.active_directions: dict[str, str] = {}
        # 每日信号计数 {symbol: count}
        self.daily_signal_count: dict[str, int] = {}
        # 连续同向信号计数 {symbol_direction: count}
        self.consecutive_count: dict[str, int] = {}
        # 最后重置日期
        self._last_reset_date: str = ""
        
        # 风控参数
        self.max_daily_signals_per_symbol = 10  # 每币种每日最多信号数
        self.max_consecutive_same_direction = 3  # 连续同向信号最多次数
        self.min_signal_strength = 70  # 最低信号强度
    
    def _check_daily_reset(self):
        """检查是否需要重置每日计数"""
        today = datetime.now().strftime("%Y-%m-%d")
        if today != self._last_reset_date:
            self.daily_signal_count.clear()
            self.consecutive_count.clear()
            self._last_reset_date = today
    
    def can_send_signal(self, signal: PASignal) -> tuple[bool, str]:
        """
        检查信号是否可以发送
        返回：(可以发送, 拒绝原因)
        """
        self._check_daily_reset()
        
        symbol = signal.symbol
        direction = signal.direction
        
        # 1. 强度过滤
        if signal.strength < self.min_signal_strength:
            return False, f"信号强度({signal.strength})低于阈值({self.min_signal_strength})"
        
        # 2. 方向冲突检查（同一币种不能同时多空）
        if symbol in self.active_directions:
            existing = self.active_directions[symbol]
            if existing != direction:
                # 有反向信号 - 可以发送（可能是反转信号）
                pass
            # 同向信号 - 继续检查其他规则
        
        # 3. 日信号数量限制
        count = self.daily_signal_count.get(symbol, 0)
        if count >= self.max_daily_signals_per_symbol:
            return False, f"今日已发送{count}个信号，达到上限"
        
        # 4. 连续同向信号限制
        direction_key = f"{symbol}_{direction}"
        consecutive = self.consecutive_count.get(direction_key, 0)
        if consecutive >= self.max_consecutive_same_direction:
            return False, f"已连续发送{consecutive}个{direction}信号，需等待反向信号"
        
        return True, ""
    
    def record_signal(self, signal: PASignal):
        """记录已发送的信号"""
        symbol = signal.symbol
        direction = signal.direction
        
        # 更新方向记录
        old_direction = self.active_directions.get(symbol)
        self.active_directions[symbol] = direction
        
        # 更新日计数
        self.daily_signal_count[symbol] = self.daily_signal_count.get(symbol, 0) + 1
        
        # 更新连续计数
        direction_key = f"{symbol}_{direction}"
        if old_direction == direction:
            self.consecutive_count[direction_key] = self.consecutive_count.get(direction_key, 0) + 1
        else:
            # 方向改变，重置反向计数
            opposite_key = f"{symbol}_{'SELL' if direction == 'BUY' else 'BUY'}"
            self.consecutive_count[opposite_key] = 0
            self.consecutive_count[direction_key] = 1
    
    def get_stats(self) -> dict:
        """获取风控统计"""
        return {
            "active_directions": dict(self.active_directions),
            "daily_counts": dict(self.daily_signal_count),
            "consecutive_counts": dict(self.consecutive_count),
        }


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

        # 周期配置（信号阈值: 1m最严70, 5m常用70, 15m保守65, 1h波段65）
        # V3.3: 降低引擎层过滤阈值，让反转信号(65-70分)能通过，由Router层做最终筛选
        self.timeframe_config = {
            "1m": {
                "signal_threshold": 70,
                "allowed_strategies": ["市价追进", "高1低1", "急速通道"],
                "cooldown_multiplier": 0.5,  # 更短冷却
            },
            "5m": {
                "signal_threshold": 70,
                "allowed_strategies": "all",
                "cooldown_multiplier": 1.0,
            },
            "15m": {
                "signal_threshold": 65,
                "allowed_strategies": ["20均线缺口", "突破回调", "首次均线缺口", "双重顶底", "失败突破", "急赴磁体", "楔形顶底", "急速通道", "末端旗形"],
                "cooldown_multiplier": 2.0,  # 更长冷却
            },
            "1h": {
                "signal_threshold": 65,
                "allowed_strategies": ["楔形顶底", "末端旗形", "急赴磁体"],
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
            tf_minutes = {"1m": 1, "5m": 5, "15m": 15, "1h": 60}
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

        # 识别市场周期
        cycle = CycleIdentifier.identify(candles, ema20)

        signals = []

        def is_allowed(strategy_name: str) -> bool:
            """检查策略是否在当前周期允许"""
            if allowed_strategies == "all":
                return True
            return strategy_name in allowed_strategies

        # 根据周期运行对应策略 (传入 atr 参数)
        if cycle.startswith("急速"):
            # 收线追进
            if is_allowed("市价追进"):
                sig = self.detector.detect_buy_now(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
                sig = self.detector.detect_sell_now(candles, ema20, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        elif cycle.startswith("趋势"):
            # 高1/低1
            if is_allowed("高1低1"):
                sig = self.detector.detect_high1_low1(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)
            # 均线缺口
            if is_allowed("20均线缺口"):
                sig = self.detector.detect_ema_gap(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        elif cycle == "区间":
            # 看衰突破
            if is_allowed("失败突破"):
                sig = self.detector.detect_fade_breakout(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        # === 反转策略（根据周期过滤） ===

        # 双重顶底
        if is_allowed("双重顶底"):
            sig = self.detector.detect_double_top_bottom(candles, ema20, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 楔形顶底
        if is_allowed("楔形顶底"):
            sig = self.detector.detect_wedge(candles, ema20, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 急速通道
        if is_allowed("急速通道"):
            sig = self.detector.detect_spike_channel(candles, ema20, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 末端旗形（仅趋势周期）
        if cycle.startswith("趋势") and is_allowed("末端旗形"):
            sig = self.detector.detect_final_flag(candles, ema20, cycle, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

            # 第一均线缺口（仅趋势周期）
            if is_allowed("首次均线缺口"):
                sig = self.detector.detect_first_ema_gap(candles, ema20, cycle, atr)
                if sig:
                    sig.timeframe = timeframe
                    signals.append(sig)

        # 突破回调（趋势或观望周期）
        if is_allowed("突破回调"):
            sig = self.detector.detect_breakout_pullback(candles, ema20, cycle, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 急赴磁体（接近区间边界时）
        if is_allowed("急赴磁体"):
            sig = self.detector.detect_rush_to_magnet(candles, ema20, atr)
            if sig:
                sig.timeframe = timeframe
                signals.append(sig)

        # 过滤冷却中的信号 + 风控检查 + 多周期验证
        filtered = []
        cooldown_multiplier = tf_config.get("cooldown_multiplier", 1.0)

        for sig in signals:
            # 周期信号阈值检查
            if sig.strength < signal_threshold:
                logger.debug(f"PA Signal 低于周期阈值: {sig.symbol} {timeframe} {sig.strength} < {signal_threshold}")
                continue

            # 风控检查
            can_send, reject_reason = self.risk_manager.can_send_signal(sig)
            if not can_send:
                logger.debug(f"PA Signal 被风控拒绝: {sig.symbol} {sig.signal_type} - {reject_reason}")
                continue

            # 多周期趋势验证（可选，增加信号可靠性）
            trend_valid, trend_msg = TrendValidator.validate_trend(candles, sig.direction)
            if not trend_valid:
                logger.debug(f"PA Signal 多周期验证失败: {sig.symbol} - {trend_msg}")
                # 不完全拒绝，但降低强度
                sig.strength = max(50, sig.strength - 15)
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
    
    def run_loop(self, interval: int = 5):
        """运行检测循环（实现 BaseEngine 抽象方法）"""
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
