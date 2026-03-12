"""交易流程第 3 层：持仓生命周期管理。"""

from .checks import premise_check, strength_check
from .exits import calculate_partial_close, calculate_take_profit_adjustment, calculate_trailing_sl
from .followup import annotate_followup_signal, build_followup_open_plan
from .manager import manage_position

__all__ = [
    "annotate_followup_signal",
    "build_followup_open_plan",
    "premise_check",
    "strength_check",
    "calculate_partial_close",
    "calculate_take_profit_adjustment",
    "calculate_trailing_sl",
    "manage_position",
]
