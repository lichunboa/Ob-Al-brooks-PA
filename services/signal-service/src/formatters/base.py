"""
基础格式化工具
"""
from typing import Any, Dict, Optional, Callable


def strength_bar(value: float, max_val: float = 100) -> str:
    """生成强度条"""
    if value is None:
        return "░░░░░░░░░░"
    pct = min(max(value / max_val, 0), 1)
    filled = int(pct * 10)
    return "█" * filled + "░" * (10 - filled)


def fmt_price(val: Any) -> str:
    """格式化价格"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if v >= 1000:
            return f"${v:,.0f}"
        elif v >= 1:
            return f"${v:.2f}"
        else:
            return f"${v:.4f}"
    except Exception:
        return str(val)


def fmt_pct(val: Any, with_sign: bool = True) -> str:
    """格式化百分比"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if with_sign and v > 0:
            return f"+{v:.2f}%"
        return f"{v:.2f}%"
    except Exception:
        return str(val)


def fmt_vol(val: Any) -> str:
    """格式化成交额"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if v >= 1e9:
            return f"${v/1e9:.2f}B"
        elif v >= 1e6:
            return f"${v/1e6:.1f}M"
        elif v >= 1e3:
            return f"${v/1e3:.0f}K"
        return f"${v:.0f}"
    except Exception:
        return str(val)


def fmt_num(val: Any, decimals: int = 2) -> str:
    """格式化数字"""
    if val is None:
        return "-"
    try:
        v = float(val)
        if decimals == 0:
            return f"{v:,.0f}"
        return f"{v:.{decimals}f}"
    except Exception:
        return str(val)


class BaseFormatter:
    """
    基础格式化器
    
    设计原则：
    - 不依赖 i18n，由消费端翻译
    - 返回结构化数据或通用格式
    """
    
    def __init__(self, translator: Callable[[str, Dict], str] = None):
        """
        Args:
            translator: 可选的翻译函数 (key, params) -> text
        """
        self._t = translator or (lambda key, params: key)
    
    def translate(self, key: str, **params) -> str:
        """翻译消息"""
        return self._t(key, params)
    
    def format_direction_icon(self, direction: str) -> str:
        """获取方向图标"""
        return {"BUY": "🟢", "SELL": "🔴", "ALERT": "⚠️"}.get(direction, "📊")
    
    def format_basic(
        self,
        symbol: str,
        direction: str,
        signal_type: str,
        strength: int,
        price: float,
        timeframe: str,
        message: str,
    ) -> str:
        """基础格式化"""
        icon = self.format_direction_icon(direction)
        bar = strength_bar(strength)
        
        return f"""{icon} {direction} | {symbol}

📌 {signal_type}
⏱ 周期: {timeframe}
💰 价格: {fmt_price(price)}
📊 强度: [{bar}] {strength}%

💬 {message}"""
