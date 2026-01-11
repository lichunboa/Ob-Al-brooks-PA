"""
动量类规则汇总
"""
from .rsi import RSI_RULES
from .kdj import KDJ_RULES
from .others import MOMENTUM_OTHER_RULES

MOMENTUM_RULES = RSI_RULES + KDJ_RULES + MOMENTUM_OTHER_RULES
