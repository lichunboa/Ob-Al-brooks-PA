"""
Al Brooks 价格行为分析工具函数

包含：
- S6 参考文档分类
- 交易风格推断
- 订单类型推断
- 交易语义结构化
- 执行语义构建
"""

import json
import re
from typing import Any

from .parsing import first_float, normalize_refs

# ===== 常量定义 =====

STATUS_PRIORITY = {
    "watching": 0,
    "cooldown": 0,
    "pre_signal": 1,
    "entry_ready_blocked": 2,
    "entry_ready": 3,
    "in_trade": 4,
    "manage": 5,
}

SIGNAL_EVENT_PATTERN = re.compile(r"^(?:signal_trigger|hl_signal):([HL])(\d+)")


def signal_event_ranks(events: list[str]) -> list[tuple[str, int]]:
    """提取 H1/H2/L1/L2 的等级。"""
    ranks: list[tuple[str, int]] = []
    for event in events:
        match = SIGNAL_EVENT_PATTERN.match(str(event or "").strip())
        if not match:
            continue
        ranks.append((match.group(1), int(match.group(2))))
    return ranks


# ===== 核心函数 =====

def classify_primary_s6_reference(state: str, events: list[str]) -> str:
    """
    根据市场状态和事件分类主要的 S6 参考文档

    Args:
        state: 市场状态（BO/TR/TC/BC/SC）
        events: 事件列表

    Returns:
        S6 参考文档名称
    """
    state_upper = str(state or "").upper()
    normalized = [str(event or "").strip() for event in events]

    if any(event.startswith("signal_trigger:") for event in normalized) and state_upper == "BO":
        return "S6-bo.md"
    if any(event.startswith("tr_edge:") for event in normalized) or state_upper == "TR":
        return "S6-tr.md"
    if any(
        event == "wedge_or_mtr"
        or event.startswith("hl_signal:H")
        or event.startswith(("state:SC", "state:BC"))
        or event == "climax_suspected"
        or event == "momentum_fading"
        for event in normalized
    ):
        return "S6-reversal.md"
    if any(event.startswith("state_change:") and event.endswith("->BO") for event in normalized):
        return "S6-bo.md"
    if any(event.startswith("state:BO") for event in normalized) or state_upper == "BO":
        return "S6-bo.md"
    if any(
        event in {"ema_touch", "cached_pre_signal"}
        or event.startswith(("first_pb:", "signal_trigger:", "hl_signal:L"))
        for event in normalized
    ) or state_upper in {"TC", "BC"}:
        return "S6-channel.md"
    return "S6-common.md"


def infer_trade_style_from_refs(
    *,
    market_state: str,
    refs: list[str],
    explicit_style: str = "",
    intent: str = "",
) -> str:
    """
    从引用和市场状态推断交易风格

    Args:
        market_state: 市场状态
        refs: 引用列表
        explicit_style: 显式指定的风格
        intent: 交易意图

    Returns:
        交易风格（Swing/Scalp/反转试探）
    """
    explicit = str(explicit_style or "").strip()
    if explicit:
        return explicit

    refs_upper = {str(item).upper() for item in refs}
    state_upper = str(market_state or "").upper()
    intent_upper = str(intent or "").upper()

    if "PROBE" in intent_upper or "试探" in intent_upper:
        return "反转试探"
    if "S6-REVERSAL.MD" in refs_upper:
        return "反转试探"
    if "S6-CHANNEL.MD" in refs_upper and state_upper in {"TR", "BC"}:
        return "Scalp"
    if "S6-TR.MD" in refs_upper or state_upper == "TR":
        return "Scalp"
    if state_upper == "BC":
        return "Scalp"
    if "S6-BO.MD" in refs_upper or "S6-CHANNEL.MD" in refs_upper or state_upper in {"TC", "BO"}:
        return "Swing"
    return "Swing"


def infer_order_type_from_refs(
    *,
    market_state: str,
    refs: list[str],
    explicit_order_type: str = "",
    intent: str = "",
    has_price: bool = False,
) -> str:
    """
    从引用和市场状态推断订单类型

    Args:
        market_state: 市场状态
        refs: 引用列表
        explicit_order_type: 显式指定的订单类型
        intent: 交易意图
        has_price: 是否有价格

    Returns:
        订单类型（MARKET/LIMIT/STOP_MARKET/TAKE_PROFIT_MARKET）
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
    continuation_tokens = ("CONTINUATION", "PULLBACK", "TREND", "RESUMPTION", "STOP")
    continuation_like = any(token in intent_upper for token in continuation_tokens)
    countertrend_like = any(token in intent_upper for token in ("PROBE", "FADE", "COUNTERTREND", "试探", "LIMIT"))

    if "CANCEL" in intent_upper:
        return "MARKET"
    if reversal_like or channel_reversal_like:
        if "LIMIT" in intent_upper and has_price:
            return "LIMIT"
        if state_upper in {"TR", "BC"} and ("PROBE" in intent_upper or "试探" in intent_upper) and has_price:
            return "LIMIT"
        return "STOP_MARKET" if has_price else "MARKET"
    if broad_channel_like:
        if countertrend_like or "TR_FADE" in intent_upper or "FAILED_BO_FADE" in intent_upper:
            return "LIMIT" if has_price else "MARKET"
        if continuation_like:
            return "STOP_MARKET" if has_price else "MARKET"
        return "STOP_MARKET" if has_price else "MARKET"
    if "S6-TR.MD" in refs_upper or state_upper == "TR":
        return "LIMIT" if has_price else "MARKET"
    if "ADD_ON" in intent_upper or "SCALE_IN" in intent_upper:
        return "LIMIT" if has_price else "MARKET"
    if "S6-BO.MD" in refs_upper or state_upper in {"BO", "TC"}:
        return "STOP_MARKET" if has_price else "MARKET"
    if channel_ref:
        return "STOP_MARKET" if has_price else "MARKET"
    return "MARKET"


def cap_status(current_status: Any, max_status: str) -> str:
    """
    限制状态不超过最大状态

    Args:
        current_status: 当前状态
        max_status: 最大允许状态

    Returns:
        限制后的状态
    """
    current = str(current_status or "watching").strip().lower() or "watching"
    capped = str(max_status or current).strip().lower() or current
    if STATUS_PRIORITY.get(current, 0) > STATUS_PRIORITY.get(capped, 0):
        return capped
    return current


def combine_brooks_text(*values: Any) -> str:
    """
    组合 Brooks 文本片段

    Args:
        *values: 多个值（字符串、列表、字典）

    Returns:
        组合后的小写文本
    """
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
    """
    检查是否有交易计划

    Args:
        base: 基础数据字典

    Returns:
        是否有交易计划
    """
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


def structured_trade_semantics(base: dict[str, Any]) -> dict[str, Any]:
    """
    结构化交易语义

    Args:
        base: 基础数据字典

    Returns:
        结构化的交易语义字典
    """
    planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
    entry_idea = base.get("entry_idea") if isinstance(base.get("entry_idea"), dict) else {}
    evaluation = base.get("evaluation") if isinstance(base.get("evaluation"), dict) else {}
    trade = base.get("trade") if isinstance(base.get("trade"), dict) else {}
    execution_semantics = (
        planned_trade.get("execution_semantics") if isinstance(planned_trade.get("execution_semantics"), dict) else {}
    )
    regime = str(
        evaluation.get("regime")
        or planned_trade.get("brooks_label")
        or entry_idea.get("filter_summary")
        or ""
    ).strip()
    execution_decision = str(
        evaluation.get("execution_decision")
        or entry_idea.get("execution_mode_cn")
        or execution_semantics.get("execution_mode_cn")
        or ""
    ).strip()
    candidate_stage = str(
        planned_trade.get("candidate_stage")
        or entry_idea.get("candidate_stage")
        or execution_semantics.get("candidate_stage")
        or ""
    ).strip().upper()
    execution_mode = str(
        planned_trade.get("execution_mode")
        or entry_idea.get("execution_mode")
        or execution_semantics.get("execution_mode")
        or ""
    ).strip().upper()
    style = str(
        planned_trade.get("style")
        or entry_idea.get("style")
        or trade.get("style")
        or ""
    ).strip()
    upgrade_condition = str(
        planned_trade.get("upgrade_condition")
        or entry_idea.get("upgrade_condition")
        or ""
    ).strip()
    order_type = str(
        planned_trade.get("order_type")
        or trade.get("order_type")
        or ""
    ).strip().upper()
    return {
        "regime": regime,
        "execution_decision": execution_decision,
        "candidate_stage": candidate_stage,
        "execution_mode": execution_mode,
        "style": style,
        "upgrade_condition": upgrade_condition,
        "order_type": order_type,
    }


def candidate_stage_cn(value: str) -> str:
    """候选阶段中文翻译"""
    mapping = {
        "WATCH": "继续观察",
        "PRE_SIGNAL": "预信号",
        "COUNTERTREND_PROBE": "反转试探",
        "CANDIDATE_LIMIT": "候选单（限价）",
        "CANDIDATE_STOP": "候选单（止损触发）",
        "CANDIDATE_MARKET": "候选单（市价）",
        "EXECUTABLE_LIMIT": "规则通过可执行单（限价）",
        "EXECUTABLE_STOP": "规则通过可执行单（止损触发）",
        "EXECUTABLE_MARKET": "规则通过可执行单（市价）",
    }
    return mapping.get(str(value or "").strip().upper(), str(value or "").strip() or "-")


def execution_mode_cn(value: str) -> str:
    """执行模式中文翻译"""
    mapping = {
        "WATCH_ONLY": "仅观察，不生成委托",
        "WAIT_ACCEPTANCE": "等待接受/二次确认",
        "COUNTERTREND_PROBE": "仅反转试探，不直接做 swing",
        "LIMIT_PLAN": "限价计划委托",
        "STOP_TRIGGER": "止损触发委托",
        "MARKET_IMMEDIATE": "市价立即执行",
    }
    return mapping.get(str(value or "").strip().upper(), str(value or "").strip() or "-")


def order_type_cn(value: str) -> str:
    """订单类型中文翻译"""
    mapping = {
        "LIMIT": "限价委托",
        "STOP_MARKET": "止损触发委托",
        "TAKE_PROFIT_MARKET": "止盈触发委托",
        "MARKET": "市价执行",
    }
    return mapping.get(str(value or "").strip().upper(), str(value or "").strip() or "-")


def derive_trade_execution_semantics(base: dict[str, Any], filter_meta: dict[str, Any]) -> dict[str, Any]:
    """
    推导交易执行语义

    Args:
        base: 基础数据字典
        filter_meta: 过滤器元数据

    Returns:
        执行语义字典
    """
    planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
    status = str(base.get("status") or "watching").strip().lower()
    stage_family = str(filter_meta.get("stage_family") or "").strip().lower()
    order_type = str(planned_trade.get("order_type") or filter_meta.get("preferred_order_type") or "").strip().upper()
    exact_entry = first_float(planned_trade.get("entry_price"))
    has_zone = planned_trade.get("entry_zone") not in (None, "", [], {})
    has_plan = has_trade_plan(base)
    allow_executable = bool(filter_meta.get("allow_executable"))
    signal_rank = int(filter_meta.get("signal_rank") or 0)
    has_signal_trigger = bool(filter_meta.get("has_signal_trigger"))
    requires_second_entry = bool(filter_meta.get("requires_second_entry"))
    acceptance_ready = bool(filter_meta.get("acceptance_ready"))
    executable_signal_ready = not requires_second_entry or signal_rank >= 2 or (has_signal_trigger and acceptance_ready)

    if stage_family == "watch_only" or status in {"watching", "cooldown"}:
        stage = "WATCH"
        mode = "WATCH_ONLY"
    elif stage_family == "wait_acceptance":
        stage = "PRE_SIGNAL"
        mode = "WAIT_ACCEPTANCE"
    elif stage_family == "countertrend_probe":
        stage = "COUNTERTREND_PROBE"
        mode = "COUNTERTREND_PROBE"
    elif stage_family == "limit_edge":
        if allow_executable and exact_entry is not None and executable_signal_ready:
            stage = "EXECUTABLE_LIMIT"
        elif allow_executable and has_zone:
            stage = "CANDIDATE_LIMIT"
        elif has_plan or has_zone or status in {"entry_ready", "entry_ready_blocked"}:
            stage = "CANDIDATE_LIMIT"
        else:
            stage = "PRE_SIGNAL"
        mode = "LIMIT_PLAN"
    elif stage_family == "stop_continuation":
        if allow_executable and exact_entry is not None and executable_signal_ready:
            stage = "EXECUTABLE_STOP"
        elif has_plan or has_zone or status in {"entry_ready", "entry_ready_blocked"}:
            stage = "CANDIDATE_STOP"
        else:
            stage = "PRE_SIGNAL"
        mode = "STOP_TRIGGER"
    elif allow_executable:
        if order_type == "STOP_MARKET":
            stage = "EXECUTABLE_STOP" if exact_entry is not None else "CANDIDATE_STOP"
            mode = "STOP_TRIGGER"
        elif order_type == "LIMIT":
            stage = "EXECUTABLE_LIMIT" if exact_entry is not None else "CANDIDATE_LIMIT"
            mode = "LIMIT_PLAN"
        else:
            stage = "EXECUTABLE_MARKET" if status in {"entry_ready", "entry_ready_blocked"} else "CANDIDATE_MARKET"
            mode = "MARKET_IMMEDIATE"
    elif has_plan or has_zone or status in {"pre_signal", "entry_ready", "entry_ready_blocked"}:
        if order_type == "LIMIT":
            stage = "CANDIDATE_LIMIT"
            mode = "LIMIT_PLAN"
        elif order_type == "STOP_MARKET":
            stage = "CANDIDATE_STOP"
            mode = "STOP_TRIGGER"
        else:
            stage = "PRE_SIGNAL"
            mode = "WAIT_ACCEPTANCE"
    else:
        stage = "WATCH"
        mode = "WATCH_ONLY"

    return {
        "candidate_stage": stage,
        "candidate_stage_cn": candidate_stage_cn(stage),
        "execution_mode": mode,
        "execution_mode_cn": execution_mode_cn(mode),
        "allow_executable": allow_executable,
        "needs_exact_trigger": order_type in {"LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"} and exact_entry is None,
        "has_entry_price": exact_entry is not None,
        "has_entry_zone": has_zone,
        "signal_rank": signal_rank,
        "requires_second_entry": requires_second_entry,
        "acceptance_ready": acceptance_ready,
        "executable_signal_ready": executable_signal_ready,
        "stage_rule_source_refs": normalize_refs(filter_meta.get("source_refs")),
        "stage_rule_summary": str(filter_meta.get("summary") or "").strip(),
    }


def build_execution_semantics(
    planned_trade: dict[str, Any],
    filter_meta: dict[str, Any],
    semantics: dict[str, Any],
) -> dict[str, Any]:
    """
    构建执行语义

    Args:
        planned_trade: 计划交易
        filter_meta: 过滤器元数据
        semantics: 语义字典

    Returns:
        完整的执行语义字典
    """
    return {
        "candidate_stage": semantics.get("candidate_stage"),
        "candidate_stage_cn": semantics.get("candidate_stage_cn"),
        "execution_mode": semantics.get("execution_mode"),
        "execution_mode_cn": semantics.get("execution_mode_cn"),
        "order_type": planned_trade.get("order_type"),
        "order_type_cn": order_type_cn(str(planned_trade.get("order_type") or "")),
        "style": planned_trade.get("style"),
        "allow_executable": semantics.get("allow_executable"),
        "needs_exact_trigger": semantics.get("needs_exact_trigger"),
        "has_entry_price": semantics.get("has_entry_price"),
        "has_entry_zone": semantics.get("has_entry_zone"),
        "signal_rank": semantics.get("signal_rank"),
        "requires_second_entry": semantics.get("requires_second_entry"),
        "acceptance_ready": semantics.get("acceptance_ready"),
        "executable_signal_ready": semantics.get("executable_signal_ready"),
        "brooks_label": filter_meta.get("label"),
        "upgrade_condition": filter_meta.get("upgrade_condition"),
        "brooks_rule": filter_meta.get("brooks_rule"),
        "stage_rule_source_refs": semantics.get("stage_rule_source_refs"),
        "stage_rule_summary": semantics.get("stage_rule_summary"),
    }
