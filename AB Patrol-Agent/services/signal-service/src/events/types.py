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
    source: str = "pg"  # 事件来源（默认：pg）

    # 规则信息
    rule_name: str = ""
    category: str = ""
    subcategory: str = ""
    table: str = ""

    # 扩展数据
    extra: dict[str, Any] = field(default_factory=dict)
    stop_loss: float = 0.0
    take_profit: float = 0.0
    entry_trigger: float = 0.0
    entry_type: str = ""
    signal_bar_high: float = 0.0
    signal_bar_low: float = 0.0
    probability: float = 0.0
    cycle: str = ""
    confirmation_needed: bool = False
    market_state: str = ""
    strategy_recommendation: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """转换为字典"""
        return {
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
            "stop_loss": self.stop_loss,
            "take_profit": self.take_profit,
            "entry_trigger": self.entry_trigger,
            "entry_type": self.entry_type,
            "signal_bar_high": self.signal_bar_high,
            "signal_bar_low": self.signal_bar_low,
            "probability": self.probability,
            "cycle": self.cycle,
            "confirmation_needed": self.confirmation_needed,
            "market_state": self.market_state,
            "strategy_recommendation": self.strategy_recommendation,
        }

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
            source=data.get("source", "pg"),
            rule_name=data.get("rule_name", ""),
            category=data.get("category", ""),
            subcategory=data.get("subcategory", ""),
            table=data.get("table", ""),
            extra=data.get("extra", {}),
            stop_loss=float(data.get("stop_loss", 0.0) or 0.0),
            take_profit=float(data.get("take_profit", 0.0) or 0.0),
            entry_trigger=float(data.get("entry_trigger", 0.0) or 0.0),
            entry_type=data.get("entry_type", ""),
            signal_bar_high=float(data.get("signal_bar_high", 0.0) or 0.0),
            signal_bar_low=float(data.get("signal_bar_low", 0.0) or 0.0),
            probability=float(data.get("probability", 0.0) or 0.0),
            cycle=data.get("cycle", ""),
            confirmation_needed=bool(data.get("confirmation_needed", False)),
            market_state=data.get("market_state", ""),
            strategy_recommendation=data.get("strategy_recommendation", {}),
        )
