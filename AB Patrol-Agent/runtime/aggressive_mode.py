#!/usr/bin/env python3
"""激进交易模式 — 快速决策，多下单，根据实际结果调整

核心理念：
1. 先让订单跑起来（每天 2-5 单）
2. 收集真实数据
3. 根据结果调整规则
4. 不要陷入"完美主义陷阱"（几天 0 单）

Al Brooks: "Setups look good enough to experts. Experts buy for any reason."
"""

from typing import Dict, Any, Optional


def _normalize_pre_signal(symbol_data: Dict[str, Any]) -> Dict[str, Any]:
    """统一兼容字符串/字典两种 pre_signal 形态。"""

    raw = symbol_data.get("pre_signal")
    if isinstance(raw, dict):
        return raw
    text = str(raw or "").strip()
    if not text:
        return {}
    side = ""
    upper_text = text.upper()
    if "LONG" in upper_text or "BUY" in upper_text:
        side = "LONG"
    elif "SHORT" in upper_text or "SELL" in upper_text:
        side = "SHORT"
    return {
        "active": True,
        "side": side,
        "label": text,
    }


def should_execute_aggressive(symbol_data: Dict[str, Any]) -> tuple[bool, str]:
    """激进模式：快速判断是否执行

    返回: (是否执行, 原因)
    """

    pre_signal = _normalize_pre_signal(symbol_data)
    planned = symbol_data.get("planned_trade", {}) if isinstance(symbol_data.get("planned_trade"), dict) else {}
    thesis = str(symbol_data.get("thesis", "") or "")

    # 1. 基本检查
    if not pre_signal.get("active"):
        return False, "无预信号"

    if not planned.get("entry_price"):
        return False, "无入场价"

    # 2. 策略识别
    strategy = identify_strategy(symbol_data)
    if strategy == "UNKNOWN":
        return False, "无法识别策略"

    # 3. 快速合理性检查（5 项，通过 3 项即可）
    checks = {
        "has_direction": pre_signal.get("side") in ["LONG", "SHORT"],
        "has_entry": planned.get("entry_price") is not None,
        "has_style": planned.get("style") in ["Scalp", "Swing"],
        "not_watching": symbol_data.get("status") != "watching",
        "has_thesis": len(thesis) > 10,
    }

    passed = sum(checks.values())
    if passed < 3:
        failed = [k for k, v in checks.items() if not v]
        return False, f"合理性检查不足: {failed}"

    # 4. 策略特定条件（放宽）
    rules = AGGRESSIVE_STRATEGY_RULES.get(strategy, {})
    min_prob = rules.get("min_probability", 0.40)  # 降低到 40%

    # 5. 执行
    return True, f"{strategy} 策略匹配（激进模式）"


def identify_strategy(symbol_data: Dict[str, Any]) -> str:
    """识别策略类型（不需要 LLM）"""

    state = str(symbol_data.get("market_state", "") or "")
    stage = str(symbol_data.get("stage", "") or "")
    thesis = str(symbol_data.get("thesis", "") or "")

    # BO 策略
    if "BO" in state and ("突破" in thesis or "breakout" in stage.lower()):
        return "BO_CONTINUATION"

    # Channel 策略
    if "TC" in state or "宽幅区间" in state or "channel" in stage.lower():
        return "CHANNEL_TRADE"

    # TR 策略
    if "TR" in state and "edge" in stage.lower():
        return "TR_EDGE"

    # H1/H2 策略（高位入场）
    if "H1" in stage or "H2" in stage:
        return "HIGH_ENTRY"

    # L1/L2 策略（低位入场）
    if "L1" in stage or "L2" in stage:
        return "LOW_ENTRY"

    # 反转策略
    if "反转" in thesis or "reversal" in stage.lower():
        return "REVERSAL"

    # 延续策略
    if "延续" in thesis or "continuation" in stage.lower():
        return "CONTINUATION"

    return "UNKNOWN"


# 激进模式策略规则（放宽条件）
AGGRESSIVE_STRATEGY_RULES = {
    "BO_CONTINUATION": {
        "min_probability": 0.40,  # 降低到 40%
        "description": "突破延续 — 有方向 + 有入场价即可",
    },
    "CHANNEL_TRADE": {
        "min_probability": 0.45,
        "description": "通道交易 — 有边缘信号即可",
    },
    "TR_EDGE": {
        "min_probability": 0.45,
        "description": "交易区间边缘 — 有边缘 + 有信号即可",
    },
    "HIGH_ENTRY": {
        "min_probability": 0.40,
        "description": "高位入场 — 有信号 + 有方向即可",
    },
    "LOW_ENTRY": {
        "min_probability": 0.40,
        "description": "低位入场 — 有信号 + 有方向即可",
    },
    "REVERSAL": {
        "min_probability": 0.40,
        "description": "反转 — 有反转信号即可",
    },
    "CONTINUATION": {
        "min_probability": 0.40,
        "description": "延续 — 有延续信号即可",
    },
}


def get_aggressive_mode_status() -> Dict[str, Any]:
    """获取激进模式状态"""
    return {
        "enabled": True,
        "min_probability": 0.40,
        "min_checks_passed": 3,
        "strategies": list(AGGRESSIVE_STRATEGY_RULES.keys()),
        "description": "激进模式：快速决策，多下单，根据实际结果调整",
    }
