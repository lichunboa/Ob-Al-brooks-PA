"""
执行语义模块

提供交易执行语义相关功能：
- 交易语义提取
- 执行阶段推导
- 订单类型映射
- 中文标签转换
"""

from __future__ import annotations

from typing import Any

from utils import first_float, normalize_refs
from signal_analyzer import has_trade_plan


# ============================================================
# 交易语义提取
# ============================================================

def structured_trade_semantics(base: dict[str, Any]) -> dict[str, Any]:
    """
    从多个来源提取结构化的交易语义
    
    优先级：
    1. planned_trade
    2. entry_idea
    3. evaluation
    4. trade
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


# ============================================================
# 中文标签映射
# ============================================================

def candidate_stage_cn(value: str) -> str:
    """候选阶段中文标签"""
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
    """执行模式中文标签"""
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
    """订单类型中文标签"""
    mapping = {
        "LIMIT": "限价委托",
        "STOP_MARKET": "止损触发委托",
        "TAKE_PROFIT_MARKET": "止盈触发委托",
        "MARKET": "市价执行",
    }
    return mapping.get(str(value or "").strip().upper(), str(value or "").strip() or "-")


# ============================================================
# 执行语义推导
# ============================================================

def derive_trade_execution_semantics(base: dict[str, Any], filter_meta: dict[str, Any]) -> dict[str, Any]:
    """
    根据状态和过滤器元数据推导交易执行语义
    
    Returns:
        {
            "candidate_stage": str,
            "candidate_stage_cn": str,
            "execution_mode": str,
            "execution_mode_cn": str,
            "allow_executable": bool,
            "needs_exact_trigger": bool,
            "has_entry_price": bool,
            "has_entry_zone": bool,
            "stage_rule_source_refs": list,
            "stage_rule_summary": str,
        }
    """
    planned_trade = base.get("planned_trade") if isinstance(base.get("planned_trade"), dict) else {}
    status = str(base.get("status") or "watching").strip().lower()
    stage_family = str(filter_meta.get("stage_family") or "").strip().lower()
    order_type = str(planned_trade.get("order_type") or filter_meta.get("preferred_order_type") or "").strip().upper()
    exact_entry = first_float(planned_trade.get("entry_price"))
    has_zone = planned_trade.get("entry_zone") not in (None, "", [], {})
    has_plan = has_trade_plan(base)
    allow_executable = bool(filter_meta.get("allow_executable"))

    # 推导阶段和模式
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
        if allow_executable and exact_entry is not None:
            stage = "EXECUTABLE_LIMIT"
        elif allow_executable and has_zone:
            stage = "CANDIDATE_LIMIT"
        elif has_plan or has_zone or status in {"entry_ready", "entry_ready_blocked"}:
            stage = "CANDIDATE_LIMIT"
        else:
            stage = "PRE_SIGNAL"
        mode = "LIMIT_PLAN"
    elif stage_family == "stop_continuation":
        if allow_executable and exact_entry is not None:
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
        "stage_rule_source_refs": normalize_refs(filter_meta.get("source_refs")),
        "stage_rule_summary": str(filter_meta.get("summary") or "").strip(),
    }


def build_execution_semantics(
    planned_trade: dict[str, Any],
    filter_meta: dict[str, Any],
    semantics: dict[str, Any],
) -> dict[str, Any]:
    """
    构建完整的执行语义对象
    
    用于存储到 planned_trade.execution_semantics
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
        "brooks_label": filter_meta.get("label"),
        "upgrade_condition": filter_meta.get("upgrade_condition"),
        "brooks_rule": filter_meta.get("brooks_rule"),
        "stage_rule_source_refs": semantics.get("stage_rule_source_refs"),
        "stage_rule_summary": semantics.get("stage_rule_summary"),
    }


# ============================================================
# 执行阶段判断
# ============================================================

def is_executable_stage(stage: str) -> bool:
    """判断是否为可执行阶段"""
    stage_upper = str(stage or "").strip().upper()
    return stage_upper.startswith("EXECUTABLE_")


def is_candidate_stage(stage: str) -> bool:
    """判断是否为候选阶段"""
    stage_upper = str(stage or "").strip().upper()
    return stage_upper.startswith("CANDIDATE_")


def is_watch_stage(stage: str) -> bool:
    """判断是否为观察阶段"""
    stage_upper = str(stage or "").strip().upper()
    return stage_upper in {"WATCH", "PRE_SIGNAL"}


def requires_price_trigger(order_type: str) -> bool:
    """判断订单类型是否需要价格触发"""
    order_type_upper = str(order_type or "").strip().upper()
    return order_type_upper in {"LIMIT", "STOP_MARKET", "TAKE_PROFIT_MARKET"}
