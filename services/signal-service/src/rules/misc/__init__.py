"""
其他类规则 - 流动性/剥头皮/基础数据
"""
from ..base import SignalRule, ConditionType

LIQUIDITY_RULES = [
    SignalRule(
        name="流动性改善",
        table="流动性扫描器.py",
        category="misc",
        subcategory="liquidity",
        direction="ALERT",
        strength=55,
        priority="low",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={"field": "流动性等级", "from_values": ["差", "较差"], "to_values": ["良好", "优秀"]},
        message_template="流动性改善: {level} 得分:{score}",
        fields={"level": "流动性等级", "score": "流动性得分"}
    ),
    SignalRule(
        name="流动性恶化",
        table="流动性扫描器.py",
        category="misc",
        subcategory="liquidity",
        direction="ALERT",
        strength=65,
        priority="medium",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={"field": "流动性等级", "from_values": ["良好", "优秀"], "to_values": ["差", "较差"]},
        message_template="⚠️ 流动性恶化: {level} 得分:{score}",
        fields={"level": "流动性等级", "score": "流动性得分"}
    ),
]

SCALPING_RULES = [
    SignalRule(
        name="剥头皮多头信号",
        table="剥头皮信号扫描器.py",
        category="misc",
        subcategory="scalping",
        direction="BUY",
        strength=60,
        priority="medium",
        timeframes=["1h"],
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={"field": "剥头皮信号", "from_values": ["空头", "中性", ""], "to_values": ["多头"]},
        message_template="剥头皮多头 RSI:{rsi:.1f}",
        fields={"rsi": "RSI"}
    ),
    SignalRule(
        name="剥头皮空头信号",
        table="剥头皮信号扫描器.py",
        category="misc",
        subcategory="scalping",
        direction="SELL",
        strength=60,
        priority="medium",
        timeframes=["1h"],
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={"field": "剥头皮信号", "from_values": ["多头", "中性", ""], "to_values": ["空头"]},
        message_template="剥头皮空头 RSI:{rsi:.1f}",
        fields={"rsi": "RSI"}
    ),
]

BASIC_DATA_RULES = [
    SignalRule(
        name="成交额暴增",
        table="基础数据同步器.py",
        category="misc",
        subcategory="basic",
        direction="ALERT",
        strength=70,
        priority="high",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (c.get("成交额") or 0) > (p.get("成交额") or 1) * 3},
        message_template="⚠️ 成交额暴增 3倍以上",
        fields={}
    ),
    SignalRule(
        name="振幅异常",
        table="基础数据同步器.py",
        category="misc",
        subcategory="basic",
        direction="ALERT",
        strength=65,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "振幅", "threshold": 10},
        message_template="振幅异常: {amp:.2f}% (> 10%)",
        fields={"amp": "振幅"}
    ),
    SignalRule(
        name="买卖比极端看多",
        table="基础数据同步器.py",
        category="misc",
        subcategory="basic",
        direction="BUY",
        strength=65,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "主动买卖比", "threshold": 1.5},
        message_template="买卖比极端看多: {ratio:.2f}",
        fields={"ratio": "主动买卖比"}
    ),
    SignalRule(
        name="买卖比极端看空",
        table="基础数据同步器.py",
        category="misc",
        subcategory="basic",
        direction="SELL",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("主动买卖比") or 1) > 0.67 and (c.get("主动买卖比") or 1) < 0.67},
        message_template="买卖比极端看空: {ratio:.2f}",
        fields={"ratio": "主动买卖比"}
    ),
]

MISC_RULES = LIQUIDITY_RULES + SCALPING_RULES + BASIC_DATA_RULES
