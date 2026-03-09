"""
格式化工具函数

用于格式化各种数据结构，供 LLM prompt 使用
"""

from __future__ import annotations

from typing import Any


def format_ai_direction_text(value: Any) -> str:
    """格式化 AI 方向文本"""
    if not value:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("direction", "")).strip()
    return str(value).strip()


def normalize_trade_side(value: Any) -> str:
    """规范化交易方向"""
    if not value:
        return ""
    s = str(value).strip().upper()
    if s in {"BUY", "LONG", "做多"}:
        return "BUY"
    if s in {"SELL", "SHORT", "做空"}:
        return "SELL"
    return s


def format_trigger_prices_text(value: Any) -> str:
    """
    格式化触发价格文本

    输入可能是：
    - 单个数字
    - 列表 [price1, price2]
    - 字典 {"buy": price, "sell": price}
    - 字符串 "price1, price2"
    """
    if not value:
        return ""

    if isinstance(value, (int, float)):
        return f"{value:.2f}"

    if isinstance(value, list):
        return ", ".join(f"{p:.2f}" for p in value if isinstance(p, (int, float)))

    if isinstance(value, dict):
        parts = []
        for k, v in value.items():
            if isinstance(v, (int, float)):
                parts.append(f"{k}={v:.2f}")
        return ", ".join(parts)

    return str(value).strip()


def format_pre_signal_text(value: Any) -> str:
    """
    格式化 pre_signal 文本

    输入可能是：
    - 字符串描述
    - 字典 {"type": "...", "price": ..., "timeframe": "..."}
    """
    if not value:
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        parts = []
        if "type" in value:
            parts.append(str(value["type"]))
        if "price" in value:
            parts.append(f"@{value['price']:.2f}")
        if "timeframe" in value:
            parts.append(f"({value['timeframe']})")
        return " ".join(parts)

    return str(value).strip()


def format_gate_message(value: Any) -> str:
    """
    格式化 gate 消息

    Gate 消息用于说明为什么某个品种被阻止交易
    """
    if not value:
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        reason = value.get("reason", "")
        details = value.get("details", "")
        if reason and details:
            return f"{reason}: {details}"
        return reason or details or ""

    return str(value).strip()


def candidate_stage_cn(value: str) -> str:
    """候选阶段中文名"""
    mapping = {
        "watching": "观察中",
        "pre_signal": "信号酝酿",
        "candidate": "候选",
        "executable": "可执行",
        "planned_trade": "计划交易",
        "in_trade": "持仓中",
    }
    return mapping.get(value, value)


def execution_mode_cn(value: str) -> str:
    """执行模式中文名"""
    mapping = {
        "market": "市价",
        "limit": "限价",
        "stop": "止损",
        "stop_limit": "止损限价",
    }
    return mapping.get(value, value)


def order_type_cn(value: str) -> str:
    """订单类型中文名"""
    mapping = {
        "MARKET": "市价单",
        "LIMIT": "限价单",
        "STOP": "止损单",
        "STOP_LIMIT": "止损限价单",
    }
    return mapping.get(value, value)


def combine_brooks_text(*values: Any) -> str:
    """
    组合多个 Brooks 文本片段

    过滤空值，用换行符连接
    """
    parts = []
    for v in values:
        if not v:
            continue
        s = str(v).strip()
        if s:
            parts.append(s)
    return "\n".join(parts)


def frame_summary_text(frame: dict[str, Any]) -> str:
    """
    生成周期摘要文本

    用于 LLM prompt
    """
    if not frame:
        return ""

    parts = []

    # 状态
    state = frame.get("state", "")
    if state:
        parts.append(f"状态={state}")

    # 事件
    events = frame.get("events", [])
    if events:
        parts.append(f"事件={', '.join(events[:3])}")

    # EMA
    ema_info = frame.get("ab_ema", {})
    if ema_info:
        ema20 = ema_info.get("ema20")
        if ema20:
            parts.append(f"EMA20={ema20:.2f}")

    # S/R
    sr_info = frame.get("ab_sr", {})
    if sr_info:
        major_hl = sr_info.get("major_hl")
        major_lh = sr_info.get("major_lh")
        if major_hl:
            parts.append(f"HL={major_hl:.2f}")
        if major_lh:
            parts.append(f"LH={major_lh:.2f}")

    return " | ".join(parts)
