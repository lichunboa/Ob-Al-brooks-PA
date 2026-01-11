"""
动量类规则 - CCI/WilliamsR/MFI/谐波
"""
from ..base import SignalRule, ConditionType

CCI_RULES = [
    SignalRule(
        name="CCI进入超买",
        table="CCI.py",
        category="momentum",
        subcategory="cci",
        direction="SELL",
        strength=55,
        priority="low",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "CCI", "threshold": 100},
        message_template="CCI进入超买区: {cci:.1f} (> 100)",
        fields={"cci": "CCI"}
    ),
    SignalRule(
        name="CCI进入超卖",
        table="CCI.py",
        category="momentum",
        subcategory="cci",
        direction="BUY",
        strength=55,
        priority="low",
        condition_type=ConditionType.THRESHOLD_CROSS_DOWN,
        condition_config={"field": "CCI", "threshold": -100},
        message_template="CCI进入超卖区: {cci:.1f} (< -100)",
        fields={"cci": "CCI"}
    ),
    SignalRule(
        name="CCI离开超买",
        table="CCI.py",
        category="momentum",
        subcategory="cci",
        direction="BUY",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("CCI") or 0) > 100 and (c.get("CCI") or 100) < 100},
        message_template="CCI离开超买区: {cci:.1f}",
        fields={"cci": "CCI"}
    ),
    SignalRule(
        name="CCI离开超卖",
        table="CCI.py",
        category="momentum",
        subcategory="cci",
        direction="SELL",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("CCI") or 0) < -100 and (c.get("CCI") or -100) > -100},
        message_template="CCI离开超卖区: {cci:.1f}",
        fields={"cci": "CCI"}
    ),
]

WR_RULES = [
    SignalRule(
        name="WR进入超买",
        table="WilliamsR.py",
        category="momentum",
        subcategory="williams",
        direction="SELL",
        strength=55,
        priority="low",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "WilliamsR", "threshold": -20},
        message_template="WilliamsR进入超买区: {wr:.1f} (> -20)",
        fields={"wr": "WilliamsR"}
    ),
    SignalRule(
        name="WR进入超卖",
        table="WilliamsR.py",
        category="momentum",
        subcategory="williams",
        direction="BUY",
        strength=55,
        priority="low",
        condition_type=ConditionType.THRESHOLD_CROSS_DOWN,
        condition_config={"field": "WilliamsR", "threshold": -80},
        message_template="WilliamsR进入超卖区: {wr:.1f} (< -80)",
        fields={"wr": "WilliamsR"}
    ),
    SignalRule(
        name="WR离开超买",
        table="WilliamsR.py",
        category="momentum",
        subcategory="williams",
        direction="BUY",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("WilliamsR") or -50) > -20 and (c.get("WilliamsR") or -20) < -20},
        message_template="WilliamsR离开超买区: {wr:.1f}",
        fields={"wr": "WilliamsR"}
    ),
    SignalRule(
        name="WR离开超卖",
        table="WilliamsR.py",
        category="momentum",
        subcategory="williams",
        direction="SELL",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("WilliamsR") or -50) < -80 and (c.get("WilliamsR") or -80) > -80},
        message_template="WilliamsR离开超卖区: {wr:.1f}",
        fields={"wr": "WilliamsR"}
    ),
]

MFI_RULES = [
    SignalRule(
        name="MFI超买",
        table="MFI资金流量扫描器.py",
        category="momentum",
        subcategory="mfi",
        direction="SELL",
        strength=60,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "MFI值", "threshold": 80},
        message_template="MFI资金流量超买: {mfi:.1f} (> 80)",
        fields={"mfi": "MFI值"}
    ),
    SignalRule(
        name="MFI超卖",
        table="MFI资金流量扫描器.py",
        category="momentum",
        subcategory="mfi",
        direction="BUY",
        strength=60,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_DOWN,
        condition_config={"field": "MFI值", "threshold": 20},
        message_template="MFI资金流量超卖: {mfi:.1f} (< 20)",
        fields={"mfi": "MFI值"}
    ),
    SignalRule(
        name="MFI离开超买",
        table="MFI资金流量扫描器.py",
        category="momentum",
        subcategory="mfi",
        direction="BUY",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("MFI值") or 50) > 80 and (c.get("MFI值") or 80) < 80},
        message_template="MFI离开超买区: {mfi:.1f}",
        fields={"mfi": "MFI值"}
    ),
    SignalRule(
        name="MFI离开超卖",
        table="MFI资金流量扫描器.py",
        category="momentum",
        subcategory="mfi",
        direction="SELL",
        strength=65,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("MFI值") or 50) < 20 and (c.get("MFI值") or 20) > 20},
        message_template="MFI离开超卖区: {mfi:.1f}",
        fields={"mfi": "MFI值"}
    ),
]

ADX_RULES = [
    SignalRule(
        name="ADX趋势增强",
        table="ADX.py",
        category="momentum",
        subcategory="adx",
        direction="ALERT",
        strength=60,
        priority="medium",
        condition_type=ConditionType.THRESHOLD_CROSS_UP,
        condition_config={"field": "ADX", "threshold": 25},
        message_template="ADX趋势增强: {adx:.1f} (> 25)",
        fields={"adx": "ADX"}
    ),
    SignalRule(
        name="ADX趋势减弱",
        table="ADX.py",
        category="momentum",
        subcategory="adx",
        direction="ALERT",
        strength=55,
        priority="low",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: p and (p.get("ADX") or 0) > 25 and (c.get("ADX") or 25) < 25},
        message_template="ADX趋势减弱: {adx:.1f} (< 25)",
        fields={"adx": "ADX"}
    ),
]

HARMONIC_RULES = [
    SignalRule(
        name="谐波信号出现",
        table="谐波信号扫描器.py",
        category="momentum",
        subcategory="harmonic",
        direction="ALERT",
        strength=70,
        priority="medium",
        condition_type=ConditionType.CUSTOM,
        condition_config={"func": lambda p, c: c.get("谐波值") and abs(c.get("谐波值") or 0) > 0.5},
        message_template="谐波信号: {val:.2f}",
        fields={"val": "谐波值"}
    ),
]

MOMENTUM_OTHER_RULES = CCI_RULES + WR_RULES + MFI_RULES + ADX_RULES + HARMONIC_RULES
