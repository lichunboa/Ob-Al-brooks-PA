"""
动量类规则 - KDJ
"""
from ..base import SignalRule, ConditionType

KDJ_RULES = [
    # 1.2.2.1 KDJ金叉
    SignalRule(
        name="KDJ金叉",
        table="KDJ随机指标扫描器.py",
        category="momentum",
        subcategory="kdj",
        direction="BUY",
        strength=65,
        priority="medium",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "信号概述",
            "from_values": ["延续", "死叉", "J<0 极值", "J>100 极值"],
            "to_values": ["金叉"]
        },
        message_template="KDJ金叉: K={k:.1f} D={d:.1f} J={j:.1f}",
        fields={"k": "K值", "d": "D值", "j": "J值"}
    ),
    # 1.2.2.2 KDJ死叉
    SignalRule(
        name="KDJ死叉",
        table="KDJ随机指标扫描器.py",
        category="momentum",
        subcategory="kdj",
        direction="SELL",
        strength=65,
        priority="medium",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "信号概述",
            "from_values": ["延续", "金叉", "J<0 极值", "J>100 极值"],
            "to_values": ["死叉"]
        },
        message_template="KDJ死叉: K={k:.1f} D={d:.1f} J={j:.1f}",
        fields={"k": "K值", "d": "D值", "j": "J值"}
    ),
    # 1.2.2.3 J值超卖极值
    SignalRule(
        name="J值超卖极值",
        table="KDJ随机指标扫描器.py",
        category="momentum",
        subcategory="kdj",
        direction="BUY",
        strength=75,
        priority="high",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "信号概述",
            "from_values": ["延续", "金叉", "死叉", "J>100 极值"],
            "to_values": ["J<0 极值"]
        },
        message_template="⚠️ KDJ J值超卖极值: J={j:.1f} (< 0)",
        fields={"j": "J值"}
    ),
    # 1.2.2.4 J值超买极值
    SignalRule(
        name="J值超买极值",
        table="KDJ随机指标扫描器.py",
        category="momentum",
        subcategory="kdj",
        direction="SELL",
        strength=75,
        priority="high",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "信号概述",
            "from_values": ["延续", "金叉", "死叉", "J<0 极值"],
            "to_values": ["J>100 极值"]
        },
        message_template="⚠️ KDJ J值超买极值: J={j:.1f} (> 100)",
        fields={"j": "J值"}
    ),
]
