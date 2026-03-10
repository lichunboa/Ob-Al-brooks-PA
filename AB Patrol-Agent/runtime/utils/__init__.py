"""工具函数模块

提供文件操作、解析、格式化、Brooks 分析、K线分析、事件分析等通用工具函数。
同时保留旧版 ``from utils import ...`` 的兼容导出，避免拆分后导入路径失效。
"""

from datetime import datetime, timezone

from .file_ops import (
    ensure_dir,
    load_json,
    write_text,
    write_json,
    append_jsonl,
)

from .parsing import (
    parse_dt,
    safe_float,
    normalize_refs,
    first_float,
    all_floats,
    parse_structured_value,
)

from .formatting import (
    truncate_text,
    compact_json,
    shrink_prompt_value,
    format_ai_direction_text,
    normalize_trade_side,
    format_trigger_prices_text,
    format_pre_signal_text,
    format_gate_message,
    canonical_action_type,
    normalize_action_payload,
    ACTION_TYPE_ALIASES,
)

from .brooks_analysis import (
    classify_primary_s6_reference,
    infer_trade_style_from_refs,
    infer_order_type_from_refs,
    cap_status,
    combine_brooks_text,
    has_trade_plan,
    structured_trade_semantics,
    derive_trade_execution_semantics,
    build_execution_semantics,
    candidate_stage_cn,
    execution_mode_cn,
    order_type_cn,
)

from .bar_analysis import (
    bar_range,
    compact_bar_record,
    recent_continuation_momentum,
    recent_bar_stats,
    compact_stats_for_prompt,
)

from .event_analysis import (
    event_has_prefix,
    event_has_exact,
    signal_event_ranks,
    has_second_entry_signal,
    has_first_entry_signal,
)


def utc_now() -> datetime:
    """返回当前 UTC 时间，兼容旧版 utils 导入方式。"""
    return datetime.now(timezone.utc)


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
