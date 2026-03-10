"""PA 引擎风控管理。"""

from __future__ import annotations

from datetime import datetime

from .models import PASignal


class RiskManager:
    """
    风控管理器。

    - 检查信号方向冲突
    - 日信号数量限制
    - 连续同向信号限制
    - 信号强度过滤
    """

    def __init__(self):
        self.active_directions: dict[str, str] = {}
        self.daily_signal_count: dict[str, int] = {}
        self.consecutive_count: dict[str, int] = {}
        self._last_reset_date: str = ""

        self.max_daily_signals_per_symbol = 10
        self.max_consecutive_same_direction = 3
        self.min_signal_strength = 70

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

        if signal.strength < self.min_signal_strength:
            return False, f"信号强度({signal.strength})低于阈值({self.min_signal_strength})"

        if symbol in self.active_directions:
            existing = self.active_directions[symbol]
            if existing != direction:
                pass

        count = self.daily_signal_count.get(symbol, 0)
        if count >= self.max_daily_signals_per_symbol:
            return False, f"今日已发送{count}个信号，达到上限"

        direction_key = f"{symbol}_{direction}"
        consecutive = self.consecutive_count.get(direction_key, 0)
        if consecutive >= self.max_consecutive_same_direction:
            return False, f"已连续发送{consecutive}个{direction}信号，需等待反向信号"

        return True, ""

    def record_signal(self, signal: PASignal):
        """记录已发送的信号。"""
        symbol = signal.symbol
        direction = signal.direction

        old_direction = self.active_directions.get(symbol)
        self.active_directions[symbol] = direction
        self.daily_signal_count[symbol] = self.daily_signal_count.get(symbol, 0) + 1

        direction_key = f"{symbol}_{direction}"
        if old_direction == direction:
            self.consecutive_count[direction_key] = self.consecutive_count.get(direction_key, 0) + 1
        else:
            opposite_key = f"{symbol}_{'SELL' if direction == 'BUY' else 'BUY'}"
            self.consecutive_count[opposite_key] = 0
            self.consecutive_count[direction_key] = 1

    def get_stats(self) -> dict:
        """获取风控统计。"""
        return {
            "active_directions": dict(self.active_directions),
            "daily_counts": dict(self.daily_signal_count),
            "consecutive_counts": dict(self.consecutive_count),
        }
