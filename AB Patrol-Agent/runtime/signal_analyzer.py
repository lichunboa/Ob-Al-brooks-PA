"""
信号分析模块

提供信号分析相关功能：
- 信号分类
- 风格推断
- 订单类型推断
- K线统计
"""

from __future__ import annotations

import json
import re
from typing import Any

from utils import safe_float, bar_range, shrink_prompt_value


# ============================================================
# 信号事件分析
# ============================================================

SIGNAL_EVENT_PATTERN = re.compile(r"^(?:signal_trigger|hl_signal):([HL])(\d+)")


def event_has_prefix(events: list[str], prefixes: tuple[str, ...]) -> bool:
    """检查事件列表是否包含指定前缀"""
    return any(str(event).startswith(prefixes) for event in events)


def event_has_exact(events: list[str], names: set[str]) -> bool:
    """检查事件列表是否包含指定名称"""
    return any(str(event) in names for event in events)


def signal_event_ranks(events: list[str]) -> list[tuple[str, int]]:
    """提取信号事件的等级"""
    ranks: list[tuple[str, int]] = []
    for event in events:
        match = SIGNAL_EVENT_PATTERN.match(str(event or "").strip())
        if not match:
            continue
        ranks.append((match.group(1), int(match.group(2))))
    return ranks


def has_second_entry_signal(events: list[str]) -> bool:
    """检查是否有二次入场信号"""
    return any(rank >= 2 for _, rank in signal_event_ranks(events))


def has_first_entry_signal(events: list[str]) -> bool:
    """检查是否有首次入场信号"""
    return any(rank == 1 for _, rank in signal_event_ranks(events))


# ============================================================
# S6 参考文件分类
# ============================================================

def classify_primary_s6_reference(state: str, events: list[str]) -> str:
    """
    根据市场状态和事件分类主要的 S6 参考文件
    
    Returns:
        S6-bo.md | S6-tr.md | S6-reversal.md | S6-channel.md | S6-common.md
    """
    state_upper = str(state or "").upper()
    normalized = [str(event or "").strip() for event in events]
    
    # BO 突破
    if any(event.startswith("signal_trigger:") for event in normalized) and state_upper == "BO":
        return "S6-bo.md"
    
    # TR 震荡
    if any(event.startswith("tr_edge:") for event in normalized) or state_upper == "TR":
        return "S6-tr.md"
    
    # 反转
    if any(
        event == "wedge_or_mtr"
        or event.startswith("hl_signal:H")
        or event.startswith(("state:SC", "state:BC"))
        or event == "climax_suspected"
        or event == "momentum_fading"
        for event in normalized
    ):
        return "S6-reversal.md"
    
    # 状态变化到 BO
    if any(event.startswith("state_change:") and event.endswith("->BO") for event in normalized):
        return "S6-bo.md"
    
    # BO 状态
    if any(event.startswith("state:BO") for event in normalized) or state_upper == "BO":
        return "S6-bo.md"
    
    # Channel 通道
    if any(
        event in {"ema_touch", "cached_pre_signal"}
        or event.startswith(("first_pb:", "signal_trigger:", "hl_signal:L"))
        for event in normalized
    ) or state_upper in {"TC", "BC"}:
        return "S6-channel.md"
    
    return "S6-common.md"


# ============================================================
# 交易风格推断
# ============================================================

def infer_trade_style_from_refs(
    *,
    market_state: str,
    refs: list[str],
    explicit_style: str = "",
    intent: str = "",
) -> str:
    """
    根据市场状态和参考文件推断交易风格
    
    Returns:
        Scalp | Swing | 反转试探
    """
    explicit = str(explicit_style or "").strip()
    if explicit:
        return explicit

    refs_upper = {str(item).upper() for item in refs}
    state_upper = str(market_state or "").upper()
    intent_upper = str(intent or "").upper()

    # 反转试探
    if "PROBE" in intent_upper or "试探" in intent_upper:
        return "反转试探"
    if "S6-REVERSAL.MD" in refs_upper:
        return "反转试探"
    
    # Scalp
    if "S6-CHANNEL.MD" in refs_upper and state_upper in {"TR", "BC"}:
        return "Scalp"
    if "S6-TR.MD" in refs_upper or state_upper == "TR":
        return "Scalp"
    if state_upper == "BC":
        return "Scalp"
    
    # Swing
    if "S6-BO.MD" in refs_upper or "S6-CHANNEL.MD" in refs_upper or state_upper in {"TC", "BO"}:
        return "Swing"
    
    return "Swing"


# ============================================================
# 订单类型推断
# ============================================================

def infer_order_type_from_refs(
    *,
    market_state: str,
    refs: list[str],
    explicit_order_type: str = "",
    intent: str = "",
    has_price: bool = False,
) -> str:
    """
    根据市场状态和参考文件推断订单类型
    
    Returns:
        MARKET | STOP_MARKET | LIMIT | TAKE_PROFIT_MARKET
    """
    explicit = str(explicit_order_type or "").strip().upper()
    if explicit:
        if explicit in {"STOP", "STOP_ORDER", "STOP_LIMIT", "STOP_MARKET"}:
            return "STOP_MARKET"
        if explicit in {"TP", "TAKE_PROFIT", "TAKE_PROFIT_ORDER", "TAKE_PROFIT_MARKET"}:
            return "TAKE_PROFIT_MARKET"
        return explicit

    refs_upper = {str(item).upper() for item in refs}
    state_upper = str(market_state or "").upper()
    intent_upper = str(intent or "").upper()
    
    reversal_like = "S6-REVERSAL.MD" in refs_upper
    channel_ref = "S6-CHANNEL.MD" in refs_upper
    channel_reversal_like = channel_ref and state_upper in {"TR", "BC", "TC"}
    broad_channel_like = channel_ref and state_upper == "BC"
    continuation_like = any(token in intent_upper for token in ("CONTINUATION", "PULLBACK", "TREND", "RESUMPTION", "STOP"))
    countertrend_like = any(token in intent_upper for token in ("PROBE", "FADE", "COUNTERTREND", "试探", "LIMIT"))

    if "CANCEL" in intent_upper:
        return "MARKET"
    
    # 反转
    if reversal_like or channel_reversal_like:
        if "LIMIT" in intent_upper and has_price:
            return "LIMIT"
        if state_upper in {"TR", "BC"} and ("PROBE" in intent_upper or "试探" in intent_upper) and has_price:
            return "LIMIT"
        return "STOP_MARKET" if has_price else "MARKET"
    
    # Broad Channel
    if broad_channel_like:
        if countertrend_like or "TR_FADE" in intent_upper or "FAILED_BO_FADE" in intent_upper:
            return "LIMIT" if has_price else "MARKET"
        if continuation_like:
            return "STOP_MARKET" if has_price else "MARKET"
        return "STOP_MARKET" if has_price else "MARKET"
    
    # TR
    if "S6-TR.MD" in refs_upper or state_upper == "TR":
        return "LIMIT" if has_price else "MARKET"
    
    # 加仓
    if "ADD_ON" in intent_upper or "SCALE_IN" in intent_upper:
        return "LIMIT" if has_price else "MARKET"
    
    # BO
    if "S6-BO.MD" in refs_upper or state_upper in {"BO", "TC"}:
        return "STOP_MARKET" if has_price else "MARKET"
    
    # Channel
    if channel_ref:
        return "STOP_MARKET" if has_price else "MARKET"
    
    return "MARKET"


# ============================================================
# 状态管理
# ============================================================

STATUS_PRIORITY = {
    "watching": 0,
    "cooldown": 0,
    "pre_signal": 1,
    "entry_ready_blocked": 2,
    "entry_ready": 3,
    "in_trade": 4,
    "manage": 5,
}


def cap_status(current_status: Any, max_status: str) -> str:
    """限制状态不超过最大状态"""
    current = str(current_status or "watching").strip().lower() or "watching"
    capped = str(max_status or current).strip().lower() or current
    if STATUS_PRIORITY.get(current, 0) > STATUS_PRIORITY.get(capped, 0):
        return capped
    return current


# ============================================================
# K线统计
# ============================================================

def recent_continuation_momentum(recent_bars: list[dict[str, Any]]) -> bool:
    """检查最近是否有延续动能（连续 3 根同向强势 K 线）"""
    if not isinstance(recent_bars, list) or len(recent_bars) < 3:
        return False
    sample = [item for item in recent_bars[-3:] if isinstance(item, dict)]
    if len(sample) < 3:
        return False
    directions: list[int] = []
    for bar in sample:
        body = safe_float(bar.get("C")) - safe_float(bar.get("O"))
        rng = max(bar_range(bar), 0.0)
        if rng <= 0:
            return False
        if abs(body) < rng * 0.5:
            return False
        directions.append(1 if body > 0 else -1)
    return abs(sum(directions)) == 3


def recent_bar_stats(bars: list[dict[str, Any]]) -> dict[str, Any]:
    """计算最近 K 线的统计信息"""
    valid = [bar for bar in bars if isinstance(bar, dict)]
    if not valid:
        return {}

    bull = 0
    bear = 0
    doji = 0
    above_ema = 0
    ranges: list[float] = []
    
    for bar in valid:
        body_text = str(bar.get("body") or "")
        if "bull" in body_text:
            bull += 1
        elif "bear" in body_text:
            bear += 1
        else:
            doji += 1
        
        vs_ema = bar.get("vs_ema20")
        if isinstance(vs_ema, str):
            try:
                if float(vs_ema.split()[0]) >= 0:
                    above_ema += 1
            except ValueError:
                pass
        ranges.append(bar_range(bar))

    first_bar = valid[0]
    last_bar = valid[-1]
    first_open = safe_float(first_bar.get("O"))
    last_close = safe_float(last_bar.get("C"))
    net_change = last_close - first_open
    avg_range = sum(ranges) / len(ranges) if ranges else 0.0

    return {
        "count": len(valid),
        "from": first_bar.get("time"),
        "to": last_bar.get("time"),
        "net_change": round(net_change, 2),
        "bull_bars": bull,
        "bear_bars": bear,
        "doji_bars": doji,
        "bars_above_ema": above_ema,
        "high": round(max(safe_float(bar.get("H")) for bar in valid), 2),
        "low": round(min(safe_float(bar.get("L")) for bar in valid), 2),
        "avg_range": round(avg_range, 2),
    }


def compact_stats_for_prompt(stats: dict[str, Any]) -> dict[str, Any]:
    """压缩统计信息用于 prompt"""
    if not isinstance(stats, dict):
        return {}
    payload = {
        "count": stats.get("count"),
        "from": stats.get("from"),
        "to": stats.get("to"),
        "net_change": stats.get("net_change"),
        "bull_bars": stats.get("bull_bars"),
        "bear_bars": stats.get("bear_bars"),
        "doji_bars": stats.get("doji_bars"),
        "bars_above_ema": stats.get("bars_above_ema"),
        "high": stats.get("high"),
        "low": stats.get("low"),
        "avg_range": stats.get("avg_range"),
    }
    return {key: value for key, value in payload.items() if value not in (None, "", [], {})}


# ============================================================
# 文本处理
# ============================================================

def combine_brooks_text(*values: Any) -> str:
    """组合 Brooks 文本"""
    parts: list[str] = []
    for value in values:
        if value in (None, "", [], {}):
            continue
        if isinstance(value, dict):
            try:
                parts.append(json.dumps(value, ensure_ascii=False))
            except TypeError:
                parts.append(str(value))
            continue
        if isinstance(value, list):
            parts.extend(str(item) for item in value if item not in (None, ""))
            continue
        parts.append(str(value))
    return " ".join(part for part in parts if part).lower()


def has_trade_plan(base: dict[str, Any]) -> bool:
    """检查是否有交易计划"""
    planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
    pre_signal = base.get("pre_signal") if isinstance(base.get("pre_signal"), dict) else {}
    trigger_price = pre_signal.get("trigger_price") if isinstance(pre_signal.get("trigger_price"), dict) else {}
    return any(
        value not in (None, "", [], {})
        for value in (
            planned_trade.get("entry_price"),
            planned_trade.get("entry_zone"),
            planned_trade.get("stop_loss"),
            planned_trade.get("take_profit"),
            trigger_price.get("entry"),
            trigger_price.get("entry_zone"),
            trigger_price.get("retest_zone"),
            trigger_price.get("breakout"),
            trigger_price.get("breakdown"),
            trigger_price.get("stop_loss"),
            trigger_price.get("take_profit"),
        )
    )


# ============================================================
# 时间框架推断
# ============================================================

TIMEFRAME_PATTERN = re.compile(r"\b(5m|15m|30m|1h)\b", re.IGNORECASE)


def infer_signal_timeframe(*values: Any) -> str:
    """推断信号的时间框架"""
    for value in values:
        if isinstance(value, dict):
            for nested in value.values():
                match = TIMEFRAME_PATTERN.search(str(nested))
                if match:
                    return match.group(1).lower()
            continue
        match = TIMEFRAME_PATTERN.search(str(value or ""))
        if match:
            return match.group(1).lower()
    return "5m"


# ============================================================
# 缓存字段定义
# ============================================================

PROMPT_CACHED_FIELDS = (
    "status",
    "stage",
    "consecutive_watching",
    "daily_bias",
    "daily_bias_expires",
    "market_state",
    "market_state_detail",
    "structure_summary",
    "running_narrative",
    "pre_signal",
    "pre_signal_meta",
    "key_levels",
    "thesis",
    "trade",
    "last_pass_reason",
)

VALIDATION_CACHE_FIELDS = (
    "status",
    "stage",
    "consecutive_watching",
    "daily_bias",
    "daily_bias_expires",
    "trade",
    "last_pass_reason",
)


def prompt_cached_state(cached: dict[str, Any]) -> dict[str, Any]:
    """提取用于 prompt 的缓存状态"""
    payload = {field: cached.get(field) for field in PROMPT_CACHED_FIELDS if cached.get(field) not in (None, "", [], {})}
    return shrink_prompt_value(payload)


def validation_seed_state(cached: dict[str, Any]) -> dict[str, Any]:
    """提取用于验证的种子状态"""
    return {field: cached.get(field) for field in VALIDATION_CACHE_FIELDS if cached.get(field) not in (None, "", [], {})}


def frame_summary_text(frame: dict[str, Any]) -> str:
    """格式化框架摘要文本"""
    summary = frame.get("summary")
    if isinstance(summary, dict):
        ordered = []
        for key in ("trend", "last_pullback", "range", "day_type"):
            value = summary.get(key)
            if value:
                ordered.append(f"{key}={value}")
        return " | ".join(ordered)
    return str(summary or "").strip()
