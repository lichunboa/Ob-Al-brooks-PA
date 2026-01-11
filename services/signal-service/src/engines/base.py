"""
引擎基类
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, List, Optional, Dict, Any


@dataclass
class Signal:
    """通用信号数据结构"""
    symbol: str
    direction: str      # BUY / SELL / ALERT
    strength: int       # 0-100
    rule_name: str
    timeframe: str
    price: float
    message: str
    full_message: str = ""
    timestamp: datetime = field(default_factory=datetime.now)
    category: str = ""
    subcategory: str = ""
    table: str = ""
    priority: str = "medium"
    extra: Dict[str, Any] = field(default_factory=dict)


class BaseEngine(ABC):
    """信号检测引擎基类"""
    
    def __init__(self):
        self._callbacks: List[Callable[[Signal], None]] = []
        self._running = False
    
    def register_callback(self, callback: Callable[[Signal], None]):
        """注册信号回调"""
        if callback not in self._callbacks:
            self._callbacks.append(callback)
    
    def unregister_callback(self, callback: Callable[[Signal], None]):
        """取消注册回调"""
        if callback in self._callbacks:
            self._callbacks.remove(callback)
    
    def _emit_signal(self, signal: Signal):
        """触发信号回调"""
        for cb in self._callbacks:
            try:
                cb(signal)
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(f"信号回调失败: {e}")
    
    @abstractmethod
    def check_signals(self) -> List[Signal]:
        """检查信号（单次）"""
        pass
    
    @abstractmethod
    def run_loop(self, interval: int = 60):
        """运行检测循环"""
        pass
    
    def stop(self):
        """停止循环"""
        self._running = False
