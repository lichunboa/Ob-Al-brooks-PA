"""
动量类规则 - RSI
"""
from ..base import SignalRule, ConditionType

RSI_RULES = [
    # 1.2.1.1 RSI进入超买区
    SignalRule(
        name="RSI进入超买区",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="SELL",
        strength=60,
        priority="medium",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "位置",
            "from_values": ["中性区", "中性", "超卖区"],
            "to_values": ["超买区"]
        },
        message_template="RSI进入超买区: {rsi7:.1f}/{rsi14:.1f}/{rsi21:.1f}",
        fields={"rsi7": "RSI7", "rsi14": "RSI14", "rsi21": "RSI21"}
    ),
    # 1.2.1.2 RSI进入超卖区
    SignalRule(
        name="RSI进入超卖区",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="BUY",
        strength=60,
        priority="medium",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "位置",
            "from_values": ["中性区", "中性", "超买区"],
            "to_values": ["超卖区"]
        },
        message_template="RSI进入超卖区: {rsi7:.1f}/{rsi14:.1f}/{rsi21:.1f}",
        fields={"rsi7": "RSI7", "rsi14": "RSI14", "rsi21": "RSI21"}
    ),
    # 1.2.1.3 RSI离开超买区
    SignalRule(
        name="RSI离开超买区",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="BUY",
        strength=70,
        priority="high",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "位置",
            "from_values": ["超买区"],
            "to_values": ["中性区", "中性", "超卖区"]
        },
        message_template="RSI离开超买区: {rsi7:.1f}/{rsi14:.1f}/{rsi21:.1f}",
        fields={"rsi7": "RSI7", "rsi14": "RSI14", "rsi21": "RSI21"}
    ),
    # 1.2.1.4 RSI离开超卖区
    SignalRule(
        name="RSI离开超卖区",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="SELL",
        strength=70,
        priority="high",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "位置",
            "from_values": ["超卖区"],
            "to_values": ["中性区", "中性", "超买区"]
        },
        message_template="RSI离开超卖区: {rsi7:.1f}/{rsi14:.1f}/{rsi21:.1f}",
        fields={"rsi7": "RSI7", "rsi14": "RSI14", "rsi21": "RSI21"}
    ),
    # 1.2.1.5 RSI顶背离
    SignalRule(
        name="RSI顶背离",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="SELL",
        strength=80,
        priority="high",
        cooldown=7200,
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "背离",
            "from_values": ["无背离", "none", "", "底背离"],
            "to_values": ["顶背离"]
        },
        message_template="⚠️ RSI顶背离! 均值: {rsi_avg:.1f}",
        fields={"rsi_avg": "RSI均值"}
    ),
    # 1.2.1.6 RSI底背离
    SignalRule(
        name="RSI底背离",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="BUY",
        strength=80,
        priority="high",
        cooldown=7200,
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={
            "field": "背离",
            "from_values": ["无背离", "none", "", "顶背离"],
            "to_values": ["底背离"]
        },
        message_template="⚠️ RSI底背离! 均值: {rsi_avg:.1f}",
        fields={"rsi_avg": "RSI均值"}
    ),
    # 1.2.1.7 RSI7金叉RSI21
    SignalRule(
        name="RSI7金叉RSI21",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="BUY",
        strength=55,
        priority="low",
        condition_type=ConditionType.CROSS_UP,
        condition_config={"field_a": "RSI7", "field_b": "RSI21"},
        message_template="RSI7({rsi7:.1f})上穿RSI21({rsi21:.1f})",
        fields={"rsi7": "RSI7", "rsi21": "RSI21"}
    ),
    # 1.2.1.8 RSI7死叉RSI21
    SignalRule(
        name="RSI7死叉RSI21",
        table="智能RSI扫描器.py",
        category="momentum",
        subcategory="rsi",
        direction="SELL",
        strength=55,
        priority="low",
        condition_type=ConditionType.CROSS_DOWN,
        condition_config={"field_a": "RSI7", "field_b": "RSI21"},
        message_template="RSI7({rsi7:.1f})下穿RSI21({rsi21:.1f})",
        fields={"rsi7": "RSI7", "rsi21": "RSI21"}
    ),
]
