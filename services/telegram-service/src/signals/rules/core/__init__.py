"""
核心信号规则 - 高价值、低噪音的基础信号
专注于：
1. 多指标共振信号
2. 极端值异常信号
3. 关键位突破信号
"""
from ..base import SignalRule, ConditionType

# =============================================================================
# 多指标共振信号 - 多个指标同时确认，可信度更高
# =============================================================================
CONFLUENCE_RULES = [
    # 动量+趋势共振做多
    SignalRule(
        name="动量趋势共振做多",
        table="智能RSI扫描器.py",
        category="core",
        subcategory="confluence",
        direction="BUY",
        strength=85,
        priority="high",
        cooldown=7200,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # RSI从超卖区回升
                (p.get("位置") in ["超卖区"] and c.get("位置") in ["中性区", "中性"]) and
                # RSI7上穿RSI21
                (p.get("RSI7") or 50) <= (p.get("RSI21") or 50) and
                (c.get("RSI7") or 50) > (c.get("RSI21") or 50) and
                # RSI均值上升
                (c.get("RSI均值") or 50) > (p.get("RSI均值") or 50)
            )
        },
        message_template="⚡ 动量趋势共振做多! RSI从超卖回升+金叉",
        fields={}
    ),
    # 动量+趋势共振做空
    SignalRule(
        name="动量趋势共振做空",
        table="智能RSI扫描器.py",
        category="core",
        subcategory="confluence",
        direction="SELL",
        strength=85,
        priority="high",
        cooldown=7200,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # RSI从超买区回落
                (p.get("位置") in ["超买区"] and c.get("位置") in ["中性区", "中性"]) and
                # RSI7下穿RSI21
                (p.get("RSI7") or 50) >= (p.get("RSI21") or 50) and
                (c.get("RSI7") or 50) < (c.get("RSI21") or 50) and
                # RSI均值下降
                (c.get("RSI均值") or 50) < (p.get("RSI均值") or 50)
            )
        },
        message_template="⚡ 动量趋势共振做空! RSI从超买回落+死叉",
        fields={}
    ),
]

# =============================================================================
# 期货情绪极端信号 - 基于合约数据的极端情况
# =============================================================================
FUTURES_EXTREME_RULES = [
    # 多空比极端失衡 - 大户极度看多
    SignalRule(
        name="大户极度看多警告",
        table="期货情绪聚合表.py",
        category="core",
        subcategory="futures_extreme",
        direction="ALERT",
        strength=80,
        priority="high",
        cooldown=14400,  # 4小时冷却
        min_volume=1000000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                (c.get("大户多空比") or 1) > 2.5 and  # 大户多空比>2.5
                (c.get("风险分") or 0) > 70  # 风险分>70
            )
        },
        message_template="⚠️ 大户极度看多! 多空比:{ratio:.2f} 风险分:{risk:.0f}",
        fields={"ratio": "大户多空比", "risk": "风险分"}
    ),
    # 多空比极端失衡 - 大户极度看空
    SignalRule(
        name="大户极度看空警告",
        table="期货情绪聚合表.py",
        category="core",
        subcategory="futures_extreme",
        direction="ALERT",
        strength=80,
        priority="high",
        cooldown=14400,
        min_volume=1000000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                (c.get("大户多空比") or 1) < 0.4 and  # 大户多空比<0.4
                (c.get("风险分") or 0) > 70
            )
        },
        message_template="⚠️ 大户极度看空! 多空比:{ratio:.2f} 风险分:{risk:.0f}",
        fields={"ratio": "大户多空比", "risk": "风险分"}
    ),
    # 持仓量Z分数异常 - 持仓量显著偏离历史均值
    SignalRule(
        name="持仓量异常高",
        table="期货情绪聚合表.py",
        category="core",
        subcategory="futures_extreme",
        direction="ALERT",
        strength=75,
        priority="high",
        cooldown=7200,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                (p.get("持仓Z分数") or 0) < 2.5 and
                (c.get("持仓Z分数") or 0) >= 2.5
            )
        },
        message_template="⚠️ 持仓量异常高! Z分数:{z:.2f} (>2.5σ)",
        fields={"z": "持仓Z分数"}
    ),
    # 情绪差值极端
    SignalRule(
        name="情绪差值极端看多",
        table="期货情绪聚合表.py",
        category="core",
        subcategory="futures_extreme",
        direction="BUY",
        strength=70,
        priority="medium",
        cooldown=7200,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                (p.get("情绪差值") or 0) < 0.5 and
                (c.get("情绪差值") or 0) >= 0.5 and
                (c.get("OI连续根数") or 0) >= 3  # OI连续增仓
            )
        },
        message_template="情绪差值转正+OI增仓! 差值:{diff:.2f} OI连续:{oi}根",
        fields={"diff": "情绪差值", "oi": "OI连续根数"}
    ),
    SignalRule(
        name="情绪差值极端看空",
        table="期货情绪聚合表.py",
        category="core",
        subcategory="futures_extreme",
        direction="SELL",
        strength=70,
        priority="medium",
        cooldown=7200,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                (p.get("情绪差值") or 0) > -0.5 and
                (c.get("情绪差值") or 0) <= -0.5 and
                (c.get("OI连续根数") or 0) <= -3  # OI连续减仓
            )
        },
        message_template="情绪差值转负+OI减仓! 差值:{diff:.2f} OI连续:{oi}根",
        fields={"diff": "情绪差值", "oi": "OI连续根数"}
    ),
]

# =============================================================================
# 量价异常信号 - 成交量/资金流向异常
# =============================================================================
VOLUME_ANOMALY_RULES = [
    # 放量突破
    SignalRule(
        name="放量上涨",
        table="基础数据同步器.py",
        category="core",
        subcategory="volume_anomaly",
        direction="BUY",
        strength=70,
        priority="medium",
        cooldown=3600,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # 成交额放大2倍以上
                (c.get("成交额") or 0) > (p.get("成交额") or 1) * 2 and
                # 价格上涨
                (c.get("变化率") or 0) > 1 and
                # 主动买入占优
                (c.get("主动买卖比") or 1) > 1.2
            )
        },
        message_template="放量上涨! 成交额放大{ratio:.1f}倍 涨幅:{chg:.2f}%",
        fields={"chg": "变化率"}
    ),
    # 放量下跌
    SignalRule(
        name="放量下跌",
        table="基础数据同步器.py",
        category="core",
        subcategory="volume_anomaly",
        direction="SELL",
        strength=70,
        priority="medium",
        cooldown=3600,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # 成交额放大2倍以上
                (c.get("成交额") or 0) > (p.get("成交额") or 1) * 2 and
                # 价格下跌
                (c.get("变化率") or 0) < -1 and
                # 主动卖出占优
                (c.get("主动买卖比") or 1) < 0.8
            )
        },
        message_template="放量下跌! 成交额放大 跌幅:{chg:.2f}%",
        fields={"chg": "变化率"}
    ),
    # 大额资金净流入
    SignalRule(
        name="大额资金净流入",
        table="基础数据同步器.py",
        category="core",
        subcategory="volume_anomaly",
        direction="BUY",
        strength=75,
        priority="high",
        cooldown=7200,
        min_volume=1000000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # 资金流向显著为正
                (c.get("资金流向") or 0) > (c.get("成交额") or 1) * 0.3 and
                # 相比前值大幅增加
                (c.get("资金流向") or 0) > (p.get("资金流向") or 0) * 2
            )
        },
        message_template="大额资金净流入! 流入:{flow:.0f}",
        fields={"flow": "资金流向"}
    ),
    # 大额资金净流出
    SignalRule(
        name="大额资金净流出",
        table="基础数据同步器.py",
        category="core",
        subcategory="volume_anomaly",
        direction="SELL",
        strength=75,
        priority="high",
        cooldown=7200,
        min_volume=1000000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # 资金流向显著为负
                (c.get("资金流向") or 0) < -(c.get("成交额") or 1) * 0.3 and
                # 相比前值大幅减少
                (c.get("资金流向") or 0) < (p.get("资金流向") or 0) * 2
            )
        },
        message_template="大额资金净流出! 流出:{flow:.0f}",
        fields={"flow": "资金流向"}
    ),
]

# =============================================================================
# SMC智能资金信号 - 结构突破
# =============================================================================
SMC_STRUCTURE_RULES = [
    # BOS多头突破
    SignalRule(
        name="BOS多头结构突破",
        table="大资金操盘扫描器.py",
        category="core",
        subcategory="smc",
        direction="BUY",
        strength=80,
        priority="high",
        cooldown=7200,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                "BOS" in str(c.get("结构事件", "")) and
                c.get("偏向") == "看涨" and
                (c.get("评分") or 0) >= 60
            )
        },
        message_template="⚡ BOS多头突破! 评分:{score:.0f} 事件:{event}",
        fields={"score": "评分", "event": "结构事件"}
    ),
    # BOS空头突破
    SignalRule(
        name="BOS空头结构突破",
        table="大资金操盘扫描器.py",
        category="core",
        subcategory="smc",
        direction="SELL",
        strength=80,
        priority="high",
        cooldown=7200,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                "BOS" in str(c.get("结构事件", "")) and
                c.get("偏向") == "看跌" and
                (c.get("评分") or 0) >= 60
            )
        },
        message_template="⚡ BOS空头突破! 评分:{score:.0f} 事件:{event}",
        fields={"score": "评分", "event": "结构事件"}
    ),
    # CHoCH趋势变化
    SignalRule(
        name="CHoCH趋势变化看涨",
        table="大资金操盘扫描器.py",
        category="core",
        subcategory="smc",
        direction="BUY",
        strength=85,
        priority="high",
        cooldown=14400,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                ("CHoCH" in str(c.get("结构事件", "")) or "CHOCH" in str(c.get("结构事件", ""))) and
                c.get("偏向") == "看涨"
            )
        },
        message_template="⚡ CHoCH趋势变化看涨! 事件:{event}",
        fields={"event": "结构事件"}
    ),
    SignalRule(
        name="CHoCH趋势变化看跌",
        table="大资金操盘扫描器.py",
        category="core",
        subcategory="smc",
        direction="SELL",
        strength=85,
        priority="high",
        cooldown=14400,
        min_volume=500000,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                ("CHoCH" in str(c.get("结构事件", "")) or "CHOCH" in str(c.get("结构事件", ""))) and
                c.get("偏向") == "看跌"
            )
        },
        message_template="⚡ CHoCH趋势变化看跌! 事件:{event}",
        fields={"event": "结构事件"}
    ),
]

# =============================================================================
# MACD关键信号 - 零轴/背离
# =============================================================================
MACD_KEY_RULES = [
    # MACD零轴上方金叉(强势金叉)
    SignalRule(
        name="MACD强势金叉",
        table="MACD柱状扫描器.py",
        category="core",
        subcategory="macd",
        direction="BUY",
        strength=75,
        priority="high",
        cooldown=7200,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # DIF上穿DEA
                (p.get("DIF") or 0) <= (p.get("DEA") or 0) and
                (c.get("DIF") or 0) > (c.get("DEA") or 0) and
                # 在零轴上方
                (c.get("DIF") or 0) > 0 and
                (c.get("DEA") or 0) > 0
            )
        },
        message_template="MACD强势金叉! 零轴上方 DIF:{dif:.4f} DEA:{dea:.4f}",
        fields={"dif": "DIF", "dea": "DEA"}
    ),
    # MACD零轴下方死叉(强势死叉)
    SignalRule(
        name="MACD强势死叉",
        table="MACD柱状扫描器.py",
        category="core",
        subcategory="macd",
        direction="SELL",
        strength=75,
        priority="high",
        cooldown=7200,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # DIF下穿DEA
                (p.get("DIF") or 0) >= (p.get("DEA") or 0) and
                (c.get("DIF") or 0) < (c.get("DEA") or 0) and
                # 在零轴下方
                (c.get("DIF") or 0) < 0 and
                (c.get("DEA") or 0) < 0
            )
        },
        message_template="MACD强势死叉! 零轴下方 DIF:{dif:.4f} DEA:{dea:.4f}",
        fields={"dif": "DIF", "dea": "DEA"}
    ),
    # MACD柱状图由负转正且放大
    SignalRule(
        name="MACD柱状放大转多",
        table="MACD柱状扫描器.py",
        category="core",
        subcategory="macd",
        direction="BUY",
        strength=65,
        priority="medium",
        cooldown=3600,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                (p.get("MACD柱状图") or 0) < 0 and
                (c.get("MACD柱状图") or 0) > 0 and
                abs(c.get("MACD柱状图") or 0) > abs(p.get("MACD柱状图") or 0) * 1.5
            )
        },
        message_template="MACD柱状放大转多! 柱状图:{hist:.4f}",
        fields={"hist": "MACD柱状图"}
    ),
]

# =============================================================================
# 支撑阻力信号
# =============================================================================
SUPPORT_RESISTANCE_RULES = [
    # 接近强支撑位
    SignalRule(
        name="接近强支撑位",
        table="全量支撑阻力扫描器.py",
        category="core",
        subcategory="sr",
        direction="BUY",
        strength=65,
        priority="medium",
        cooldown=3600,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # 距支撑位小于1%
                (c.get("距支撑百分比") or 100) < 1.0 and
                # 从更远的位置接近
                (p.get("距支撑百分比") or 0) > (c.get("距支撑百分比") or 100)
            )
        },
        message_template="接近强支撑位! 距离:{dist:.2f}% 支撑:{support}",
        fields={"dist": "距支撑百分比", "support": "支撑位"}
    ),
    # 接近强阻力位
    SignalRule(
        name="接近强阻力位",
        table="全量支撑阻力扫描器.py",
        category="core",
        subcategory="sr",
        direction="SELL",
        strength=65,
        priority="medium",
        cooldown=3600,
        condition_type=ConditionType.CUSTOM,
        condition_config={
            "func": lambda p, c: (
                p and
                # 距阻力位小于1%
                (c.get("距阻力百分比") or 100) < 1.0 and
                # 从更远的位置接近
                (p.get("距阻力百分比") or 0) > (c.get("距阻力百分比") or 100)
            )
        },
        message_template="接近强阻力位! 距离:{dist:.2f}% 阻力:{resistance}",
        fields={"dist": "距阻力百分比", "resistance": "阻力位"}
    ),
]

# =============================================================================
# 汇总
# =============================================================================
CORE_RULES = (
    CONFLUENCE_RULES +
    FUTURES_EXTREME_RULES +
    VOLUME_ANOMALY_RULES +
    SMC_STRUCTURE_RULES +
    MACD_KEY_RULES +
    SUPPORT_RESISTANCE_RULES
)

__all__ = ["CORE_RULES"]
