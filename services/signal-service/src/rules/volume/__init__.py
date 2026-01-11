"""
量价类规则 - MACD/OBV/CVD/量比
"""
from ..base import SignalRule, ConditionType

MACD_RULES = [
    SignalRule(
        name="MACD金叉",
        table="MACD柱状扫描器.py",
        category="volume",
        subcategory="macd",
        direction="BUY",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CROSS_UP,
        condition_config={"field_a": "DIF", "field_b": "DEA"},
        message_template="MACD金叉: DIF({dif:.4f})上穿DEA({dea:.4f})",
        fields={"dif": "DIF", "dea": "DEA"}
    ),
    SignalRule(
        name="MACD死叉",
        table="MACD柱状扫描器.py",
        category="volume",
        subcategory="macd",
        direction="SELL",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CROSS_DOWN,
        condition_config={"field_a": "DIF", "field_b": "DEA"},
        message_template="MACD死叉: DIF({dif:.4f})下穿DEA({dea:.4f})",
        fields={"dif": "DIF", "dea": "DEA"}
    ),
    SignalRule(
        name="MACD柱状转正",
        table="MACD柱状扫描器.py",
        category="volume",
        subcategory="macd",
        direction="BUY",
        strength=55,
        priority="low",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("MACD柱状图") or 0) < 0 and (c.get("MACD柱状图") or 0) > 0},
        message_template="MACD柱状图由负转正",
        fields={}
    ),
    SignalRule(
        name="MACD柱状转负",
        table="MACD柱状扫描器.py",
        category="volume",
        subcategory="macd",
        direction="SELL",
        strength=55,
        priority="low",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("MACD柱状图") or 0) > 0 and (c.get("MACD柱状图") or 0) < 0},
        message_template="MACD柱状图由正转负",
        fields={}
    ),
    SignalRule(
        name="MACD零轴上穿",
        table="MACD柱状扫描器.py",
        category="volume",
        subcategory="macd",
        direction="BUY",
        strength=60,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "DIF", "threshold": 0},
        message_template="MACD DIF上穿零轴",
        fields={}
    ),
]

OBV_RULES = [
    SignalRule(
        name="OBV大幅上升",
        table="OBV能量潮扫描器.py",
        category="volume",
        subcategory="obv",
        direction="BUY",
        strength=60,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: (c.get("OBV变化率") or 0) > 20},
        message_template="OBV大幅上升 变化率:{rate:.1f}%",
        fields={"rate": "OBV变化率"}
    ),
    SignalRule(
        name="OBV大幅下降",
        table="OBV能量潮扫描器.py",
        category="volume",
        subcategory="obv",
        direction="SELL",
        strength=60,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: (c.get("OBV变化率") or 0) < -20},
        message_template="OBV大幅下降 变化率:{rate:.1f}%",
        fields={"rate": "OBV变化率"}
    ),
]

CVD_RULES = [
    SignalRule(
        name="CVD大幅上升",
        table="CVD信号排行榜.py",
        category="volume",
        subcategory="cvd",
        direction="BUY",
        strength=60,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: (c.get("变化率") or 0) > 30},
        message_template="CVD大幅上升 变化率:{rate:.1f}%",
        fields={"rate": "变化率"}
    ),
    SignalRule(
        name="CVD大幅下降",
        table="CVD信号排行榜.py",
        category="volume",
        subcategory="cvd",
        direction="SELL",
        strength=60,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: (c.get("变化率") or 0) < -30},
        message_template="CVD大幅下降 变化率:{rate:.1f}%",
        fields={"rate": "变化率"}
    ),
]

VOLUME_RATIO_RULES = [
    SignalRule(
        name="量比放大",
        table="成交量比率扫描器.py",
        category="volume",
        subcategory="ratio",
        direction="ALERT",
        strength=65,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "量比", "threshold": 2.0},
        message_template="量比放大: {ratio:.2f} (> 2.0)",
        fields={"ratio": "量比"}
    ),
    SignalRule(
        name="量比极度放大",
        table="成交量比率扫描器.py",
        category="volume",
        subcategory="ratio",
        direction="ALERT",
        strength=80,
        priority="high",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "量比", "threshold": 5.0},
        message_template="⚠️ 量比极度放大: {ratio:.2f} (> 5.0)",
        fields={"ratio": "量比"}
    ),
]

TAKER_RATIO_RULES = [
    SignalRule(
        name="主动买盘极端",
        table="主动买卖比扫描器.py",
        category="volume",
        subcategory="taker",
        direction="BUY",
        strength=70,
        priority="high",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "主动买卖比", "threshold": 1.5},
        message_template="主动买盘极端: {ratio:.2f} (> 1.5)",
        fields={"ratio": "主动买卖比"}
    ),
    SignalRule(
        name="主动卖盘极端",
        table="主动买卖比扫描器.py",
        category="volume",
        subcategory="taker",
        direction="SELL",
        strength=70,
        priority="high",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("主动买卖比") or 1) > 0.67 and (c.get("主动买卖比") or 1) < 0.67},
        message_template="主动卖盘极端: {ratio:.2f} (< 0.67)",
        fields={"ratio": "主动买卖比"}
    ),
]

VOLUME_RULES = MACD_RULES + OBV_RULES + CVD_RULES + VOLUME_RATIO_RULES + TAKER_RATIO_RULES
