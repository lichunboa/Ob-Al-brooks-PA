"""
期货情绪类规则
"""
from ..base import SignalRule, ConditionType

SENTIMENT_RULES = [
    SignalRule(
        name="大户极度看多",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="ALERT",
        strength=75,
        priority="high",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "大户多空比", "threshold": 2.0},
        message_template="⚠️ 大户极度看多: {ratio:.2f} (> 2.0)",
        fields={"ratio": "大户多空比"}
    ),
    SignalRule(
        name="大户极度看空",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="ALERT",
        strength=75,
        priority="high",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("大户多空比") or 1) > 0.5 and (c.get("大户多空比") or 1) < 0.5},
        message_template="⚠️ 大户极度看空: {ratio:.2f} (< 0.5)",
        fields={"ratio": "大户多空比"}
    ),
    SignalRule(
        name="主动买盘极端",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="BUY",
        strength=70,
        priority="high",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "主动成交多空比", "threshold": 1.5},
        message_template="主动买盘极端: {ratio:.2f} (> 1.5)",
        fields={"ratio": "主动成交多空比"}
    ),
    SignalRule(
        name="主动卖盘极端",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="SELL",
        strength=70,
        priority="high",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("主动成交多空比") or 1) > 0.67 and (c.get("主动成交多空比") or 1) < 0.67},
        message_template="主动卖盘极端: {ratio:.2f} (< 0.67)",
        fields={"ratio": "主动成交多空比"}
    ),
    SignalRule(
        name="情绪翻转看多",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="BUY",
        strength=80,
        priority="high",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={"field": "情绪翻转信号", "from_values": ["无", "", "空翻"], "to_values": ["多翻"]},
        message_template="⚠️ 情绪翻转看多!",
        fields={}
    ),
    SignalRule(
        name="情绪翻转看空",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="SELL",
        strength=80,
        priority="high",
        condition_type=ConditionType.STATE_CHANGE,
        condition_config={"field": "情绪翻转信号", "from_values": ["无", "", "多翻"], "to_values": ["空翻"]},
        message_template="⚠️ 情绪翻转看空!",
        fields={}
    ),
    SignalRule(
        name="风险分高位",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="ALERT",
        strength=70,
        priority="high",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "风险分", "threshold": 80},
        message_template="⚠️ 风险分高位: {score}",
        fields={"score": "风险分"}
    ),
    SignalRule(
        name="OI连续增仓",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="ALERT",
        strength=65,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "OI连续根数", "threshold": 5},
        message_template="OI连续增仓: {cnt}根",
        fields={"cnt": "OI连续根数"}
    ),
    SignalRule(
        name="OI连续减仓",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="ALERT",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("OI连续根数") or 0) > -5 and (c.get("OI连续根数") or 0) < -5},
        message_template="OI连续减仓: {cnt}根",
        fields={"cnt": "OI连续根数"}
    ),
    SignalRule(
        name="持仓Z分数异常高",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="ALERT",
        strength=70,
        priority="high",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "持仓Z分数", "threshold": 2.0},
        message_template="持仓Z分数异常高: {z:.2f}",
        fields={"z": "持仓Z分数"}
    ),
    SignalRule(
        name="持仓Z分数异常低",
        table="期货情绪聚合表.py",
        category="futures",
        subcategory="sentiment",
        direction="ALERT",
        strength=70,
        priority="high",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("持仓Z分数") or 0) > -2 and (c.get("持仓Z分数") or 0) < -2},
        message_template="持仓Z分数异常低: {z:.2f}",
        fields={"z": "持仓Z分数"}
    ),
]

FUTURES_RULES = SENTIMENT_RULES
