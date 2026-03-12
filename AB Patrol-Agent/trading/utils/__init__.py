"""工具函数模块

提供文件操作、解析、格式化、Brooks 分析、K线分析、事件分析等通用工具函数。
同时保留旧版 ``from utils import ...`` 的兼容导出，避免拆分后导入路径失效。
"""

from datetime import UTC, datetime

from .bar_analysis import (
    bar_range,
    compact_bar_record,
    compact_stats_for_prompt,
    recent_bar_stats,
    recent_continuation_momentum,
)
from .brooks_analysis import (
    build_execution_semantics,
    candidate_stage_cn,
    cap_status,
    classify_primary_s6_reference,
    combine_brooks_text,
    derive_trade_execution_semantics,
    execution_mode_cn,
    has_trade_plan,
    infer_order_type_from_refs,
    infer_trade_style_from_refs,
    order_type_cn,
    structured_trade_semantics,
)
from .event_analysis import (
    event_has_exact,
    event_has_prefix,
    has_first_entry_signal,
    has_second_entry_signal,
    signal_event_ranks,
)
from .file_ops import (
    append_jsonl,
    ensure_dir,
    load_json,
    write_json,
    write_text,
)
from .formatting import (
    ACTION_TYPE_ALIASES,
    canonical_action_type,
    compact_json,
    format_ai_direction_text,
    format_gate_message,
    format_pre_signal_text,
    format_trigger_prices_text,
    normalize_action_payload,
    normalize_trade_side,
    shrink_prompt_value,
    truncate_text,
)
from .parsing import (
    all_floats,
    first_float,
    normalize_refs,
    parse_dt,
    parse_structured_value,
    safe_float,
)
from .target_magnets import (
    build_target_magnets,
    resolve_target_path,
)


def utc_now() -> datetime:
    """返回当前 UTC 时间，兼容旧版 utils 导入方式。"""
    return datetime.now(UTC)


def utc_iso() -> str:
    """返回当前 UTC 时间的 ISO 字符串。"""
    return utc_now().isoformat()

__all__ = [
    # time
    "utc_now",
    "utc_iso",
    # file_ops
    "ensure_dir",
    "load_json",
    "write_text",
    "write_json",
    "append_jsonl",
    # parsing
    "parse_dt",
    "safe_float",
    "normalize_refs",
    "first_float",
    "all_floats",
    "parse_structured_value",
    # formatting
    "truncate_text",
    "compact_json",
    "shrink_prompt_value",
    "format_ai_direction_text",
    "normalize_trade_side",
    "format_trigger_prices_text",
    "format_pre_signal_text",
    "format_gate_message",
    "canonical_action_type",
    "normalize_action_payload",
    "ACTION_TYPE_ALIASES",
    # brooks_analysis
    "classify_primary_s6_reference",
    "infer_trade_style_from_refs",
    "infer_order_type_from_refs",
    "cap_status",
    "combine_brooks_text",
    "has_trade_plan",
    "structured_trade_semantics",
    "derive_trade_execution_semantics",
    "build_execution_semantics",
    "candidate_stage_cn",
    "execution_mode_cn",
    "order_type_cn",
    "build_target_magnets",
    "resolve_target_path",
    # bar_analysis
    "bar_range",
    "compact_bar_record",
    "recent_continuation_momentum",
    "recent_bar_stats",
    "compact_stats_for_prompt",
    # event_analysis
    "event_has_prefix",
    "event_has_exact",
    "signal_event_ranks",
    "has_second_entry_signal",
    "has_first_entry_signal",
]
