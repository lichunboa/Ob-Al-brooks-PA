"""
事件类型定义
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class SignalEvent:
    """信号事件 - 解耦的信号数据结构"""

    # 基础信息
    symbol: str
    signal_type: str
    direction: str  # BUY / SELL / ALERT
    strength: int  # 0-100

    # 消息（i18n key + 参数，由消费端翻译）
    message_key: str
    message_params: dict[str, Any] = field(default_factory=dict)

    # 元数据
    timestamp: datetime = field(default_factory=datetime.now)
    timeframe: str = "1h"
    price: float = 0.0
    source: str = "sqlite"  # sqlite / pg

    # 规则信息
    rule_name: str = ""
    category: str = ""
    subcategory: str = ""
    table: str = ""

    # PA 信号入场字段
    stop_loss: float = 0.0
    take_profit: float = 0.0
    entry_trigger: float = 0.0
    entry_type: str = ""  # STOP/LIMIT/MARKET
    signal_bar_high: float = 0.0
    signal_bar_low: float = 0.0
    probability: float = 0.0
    cycle: str = ""
    confirmation_needed: bool = False

    # V5.0: 市场状态 + 策略推荐
    market_state: str = ""  # strong_trend_bull/bear, weak_trend_bull/bear, tight_range, broad_range, breakout_bull/bear
    strategy_recommendation: dict[str, Any] = field(default_factory=dict)  # {recommended: [], prohibited: [], score_modifier: int}
    route_to: str = ""  # V5.0: 后端决定路由目标 (al-brooks/trader/wyckoff)

    # 扩展数据
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        result = {
            "symbol": self.symbol,
            "signal_type": self.signal_type,
            "direction": self.direction,
            "strength": self.strength,
            "message_key": self.message_key,
            "message_params": self.message_params,
            "timestamp": self.timestamp.isoformat(),
            "timeframe": self.timeframe,
            "price": self.price,
            "source": self.source,
            "rule_name": self.rule_name,
            "category": self.category,
            "subcategory": self.subcategory,
            "table": self.table,
            "extra": self.extra,
        }
        # V5.0: 市场状态 + 路由
        if self.market_state:
            result["market_state"] = self.market_state
        if self.strategy_recommendation:
            result["strategy_recommendation"] = self.strategy_recommendation
        if self.route_to:
            result["route_to"] = self.route_to
        # PA 信号入场字段（仅当有值时添加）
        if self.stop_loss:
            result["stop_loss"] = self.stop_loss
        if self.take_profit:
            result["take_profit"] = self.take_profit
        if self.entry_trigger:
            result["entry_trigger"] = self.entry_trigger
        if self.entry_type:
            result["entry_type"] = self.entry_type
        if self.signal_bar_high:
            result["signal_bar_high"] = self.signal_bar_high
            result["signal_bar_low"] = self.signal_bar_low
        if self.probability:
            result["probability"] = self.probability
        if self.cycle:
            result["cycle"] = self.cycle
        if self.confirmation_needed:
            result["confirmation_needed"] = self.confirmation_needed
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SignalEvent":
        """从字典创建"""
        ts = data.get("timestamp")
        if isinstance(ts, str):
            ts = datetime.fromisoformat(ts)
        elif ts is None:
            ts = datetime.now()

        return cls(
            symbol=data.get("symbol", ""),
            signal_type=data.get("signal_type", ""),
            direction=data.get("direction", "ALERT"),
            strength=data.get("strength", 0),
            message_key=data.get("message_key", ""),
            message_params=data.get("message_params", {}),
            timestamp=ts,
            timeframe=data.get("timeframe", "1h"),
            price=data.get("price", 0.0),
            source=data.get("source", "sqlite"),
            rule_name=data.get("rule_name", ""),
            category=data.get("category", ""),
            subcategory=data.get("subcategory", ""),
            table=data.get("table", ""),
            extra=data.get("extra", {}),
            # V5.0
            market_state=data.get("market_state", ""),
            strategy_recommendation=data.get("strategy_recommendation", {}),
            route_to=data.get("route_to", ""),
            # PA 信号入场字段
            stop_loss=data.get("stop_loss", 0.0),
            take_profit=data.get("take_profit", 0.0),
            entry_trigger=data.get("entry_trigger", 0.0),
            entry_type=data.get("entry_type", ""),
            signal_bar_high=data.get("signal_bar_high", 0.0),
            signal_bar_low=data.get("signal_bar_low", 0.0),
            probability=data.get("probability", 0.0),
            cycle=data.get("cycle", ""),
            confirmation_needed=data.get("confirmation_needed", False),
        )
