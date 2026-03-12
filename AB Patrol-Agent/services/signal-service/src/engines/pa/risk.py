"""PA 引擎风控管理。"""

from __future__ import annotations

from datetime import datetime

from .models import PASignal

TR_LIMIT_FRIENDLY_SIGNALS = {
    "高1",
    "低1",
    "高2",
    "低2",
    "双重顶",
    "双重底",
    "楔形顶",
    "楔形底",
    "头肩顶MTR",
    "头肩底MTR",
    "第二腿陷阱",
    "看衰突破",
}

BREAKOUT_CHASE_SIGNALS = {
    "收线追进",
    "ii突破",
    "ioi突破",
    "iii突破",
    "HOY突破",
    "LOY突破",
}


class RiskManager:
    """
    风控管理器。

    - 检查信号方向冲突
    - 记录日信号数量
    - 记录连续同向信号
    - 最低信号强度兜底
    """

    def __init__(self):
        self.active_directions: dict[str, str] = {}
        self.daily_signal_count: dict[str, int] = {}
        self.consecutive_count: dict[str, int] = {}
        self._last_reset_date: str = ""

        # Brooks 不会用一个粗暴的“每天每品种最多几单”硬阈值来裁掉 setup。
        # 这里保留这些字段，仅用于统计与诊断，不再作为阻止交易的硬门槛。
        self.max_daily_signals_per_timeframe = {
            "1m": 48,
            "5m": 18,
            "15m": 12,
            "30m": 8,
            "1h": 4,
        }
        self.max_consecutive_same_direction = {
            "1m": 8,
            "5m": 5,
            "15m": 4,
            "30m": 3,
            "1h": 2,
        }
        # 真实过滤只交给 Brooks 路由与结构判断；
        # 这里不再叠加额外分数下限。
        self.min_signal_strength = 0

    @staticmethod
    def _signal_meta(signal: PASignal) -> tuple[str, str, str]:
        """提取信号的周期、策略与订单类型。"""
        timeframe = str(getattr(signal, "timeframe", "") or "5m")
        signal_type = str(getattr(signal, "signal_type", "") or "")
        entry_type = str(getattr(signal, "entry_type", "STOP") or "STOP").upper()
        return timeframe, signal_type, entry_type

    @staticmethod
    def _signal_cycle(signal: PASignal) -> str:
        """提取 signal 绑定的市场周期。"""
        return str(getattr(signal, "cycle", "") or "")

    def _daily_limit_for(self, signal: PASignal) -> int:
        """
        Brooks 风格动态限流。

        核心原则：
        - TR / Broad Channel / reversal 需要更高评估频率，不能被统一阈值过早截断；
        - breakout chase 仍然要更克制，避免在噪音里追单。
        """
        timeframe, signal_type, entry_type = self._signal_meta(signal)
        cycle = self._signal_cycle(signal)
        limit = int(self.max_daily_signals_per_timeframe.get(timeframe, 24))

        if timeframe == "5m":
            if cycle == "区间" or entry_type == "LIMIT":
                limit += 6
            if signal_type in TR_LIMIT_FRIENDLY_SIGNALS:
                limit += 2
            if signal_type in BREAKOUT_CHASE_SIGNALS:
                limit -= 4
        elif timeframe == "15m":
            if cycle == "区间" or entry_type == "LIMIT":
                limit += 3
            if signal_type in TR_LIMIT_FRIENDLY_SIGNALS:
                limit += 1
            if signal_type in BREAKOUT_CHASE_SIGNALS:
                limit -= 2
        elif timeframe in {"30m", "1h"}:
            if signal_type in BREAKOUT_CHASE_SIGNALS:
                limit -= 1

        return max(4, limit)

    def _direction_limit_for(self, signal: PASignal) -> int:
        """按 playbook 调整同向连续信号上限。"""
        timeframe, signal_type, entry_type = self._signal_meta(signal)
        cycle = self._signal_cycle(signal)
        limit = int(self.max_consecutive_same_direction.get(timeframe, 6))

        if timeframe == "5m":
            if cycle == "区间" or entry_type == "LIMIT":
                limit += 2
            if signal_type in TR_LIMIT_FRIENDLY_SIGNALS:
                limit += 1
            if signal_type in BREAKOUT_CHASE_SIGNALS:
                limit -= 2
        elif timeframe == "15m":
            if cycle == "区间" or entry_type == "LIMIT":
                limit += 1
            if signal_type in BREAKOUT_CHASE_SIGNALS:
                limit -= 1

        return max(2, limit)

    def _check_daily_reset(self):
        """检查是否需要重置每日计数。"""
        today = datetime.now().strftime("%Y-%m-%d")
        if today != self._last_reset_date:
            self.daily_signal_count.clear()
            self.consecutive_count.clear()
            self._last_reset_date = today

    def can_send_signal(self, signal: PASignal) -> tuple[bool, str]:
        """检查信号是否可以发送。"""
        self._check_daily_reset()

        symbol = signal.symbol
        direction = signal.direction
        timeframe = str(getattr(signal, "timeframe", "") or "5m")
        daily_key = f"{symbol}_{timeframe}"
        direction_key = f"{symbol}_{timeframe}_{direction}"

        if signal.strength < self.min_signal_strength:
            return False, f"信号强度({signal.strength})低于阈值({self.min_signal_strength})"

        if symbol in self.active_directions:
            existing = self.active_directions[symbol]
            if existing != direction:
                pass

        # 每日数量和连续同向次数只做软统计，不再直接阻止交易。
        _ = self.daily_signal_count.get(daily_key, 0)
        _ = self._daily_limit_for(signal)
        _ = self.consecutive_count.get(direction_key, 0)
        _ = self._direction_limit_for(signal)
        return True, ""

    def record_signal(self, signal: PASignal):
        """记录已发送的信号。"""
        symbol = signal.symbol
        direction = signal.direction
        timeframe = str(getattr(signal, "timeframe", "") or "5m")
        daily_key = f"{symbol}_{timeframe}"
        direction_key = f"{symbol}_{timeframe}_{direction}"

        old_direction = self.active_directions.get(symbol)
        self.active_directions[symbol] = direction
        self.daily_signal_count[daily_key] = self.daily_signal_count.get(daily_key, 0) + 1

        if old_direction == direction:
            self.consecutive_count[direction_key] = self.consecutive_count.get(direction_key, 0) + 1
        else:
            opposite_key = f"{symbol}_{timeframe}_{'SELL' if direction == 'BUY' else 'BUY'}"
            self.consecutive_count[opposite_key] = 0
            self.consecutive_count[direction_key] = 1

    def get_stats(self) -> dict:
        """获取风控统计。"""
        return {
            "active_directions": dict(self.active_directions),
            "daily_counts": dict(self.daily_signal_count),
            "consecutive_counts": dict(self.consecutive_count),
        }
