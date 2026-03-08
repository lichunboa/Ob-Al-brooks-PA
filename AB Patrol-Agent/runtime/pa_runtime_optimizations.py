#!/usr/bin/env python3
"""
PA Runtime 优化补丁
基于 Al Brooks 交易理念的 7 个核心优化

使用方法：
1. 在 pa_runtime.py 开头导入: from pa_runtime_optimizations import *
2. 或者直接将这些函数复制到 pa_runtime.py 中
"""

from typing import Any


# ═══════════════════════════════════════════════════════════════════════════
# 优化 1: 修正 P×R 计算（最严重的 bug）
# ═══════════════════════════════════════════════════════════════════════════

def validate_trader_equation(P: float, R: float) -> dict[str, Any]:
    """
    Al Brooks 统一评估标准
    P×R > (1-P) 是唯一硬门槛

    Args:
        P: 概率 (0-1 之间)
        R: 盈亏比

    Returns:
        {
            "valid": bool,
            "te": float,  # Trader's Equation 值
            "reason": str
        }

    Examples:
        >>> validate_trader_equation(0.55, 2.0)
        {'valid': True, 'te': 0.55, 'reason': '[EXECUTE] P×R=1.100 > (1-P)=0.450, TE=0.650'}

        >>> validate_trader_equation(0.45, 1.5)
        {'valid': True, 'te': 0.225, 'reason': '[EXECUTE] P×R=0.675 > (1-P)=0.550, TE=0.125'}

        >>> validate_trader_equation(0.40, 1.0)
        {'valid': False, 'te': -0.2, 'reason': '[PASS-RULE] P×R=0.400 ≤ (1-P)=0.600, TE 为负'}
    """
    left = P * R
    right = 1 - P
    te = left - right

    if left <= right:
        return {
            "valid": False,
            "te": te,
            "reason": f"[PASS-RULE] P×R={left:.3f} ≤ (1-P)={right:.3f}, TE 为负"
        }

    return {
        "valid": True,
        "te": te,
        "reason": f"[EXECUTE] P×R={left:.3f} > (1-P)={right:.3f}, TE={te:.3f}"
    }


# ═══════════════════════════════════════════════════════════════════════════
# 优化 2: 简化状态机
# ═══════════════════════════════════════════════════════════════════════════

def simplify_status(old_status: str, P: float, R: float, has_trigger_price: bool = False) -> str:
    """
    简化状态机：watching → candidate → executable

    Al Brooks: 看到 setup → 评估 P×R → 入场
    不需要 4 个状态（watching → pre_signal → entry_ready_blocked → entry_ready）

    Args:
        old_status: 当前状态
        P: 概率
        R: 盈亏比
        has_trigger_price: 是否有触发价格

    Returns:
        新状态: "watching" | "candidate" | "executable"
    """
    te_result = validate_trader_equation(P, R)

    # P×R 达标 → executable
    if te_result["valid"]:
        return "executable"

    # 接近达标（90% 阈值）→ candidate
    if P * R > 0.9 * (1 - P):
        return "candidate"

    # 其他 → watching
    return "watching"


# ═══════════════════════════════════════════════════════════════════════════
# 优化 3: 放宽信号 K 线要求
# ═══════════════════════════════════════════════════════════════════════════

def validate_signal_bar(bar_body: float, context_score: int, price: float = 100.0) -> dict[str, Any]:
    """
    Context 清晰时，小 body 也可以
    Al Brooks: "Context > 形态 > 信号K线"

    Args:
        bar_body: K 线 body 大小（绝对值）
        context_score: Context 评分 (0-10)
            - 7-10: 强 context (强趋势 + EMA 支撑 + 多周期确认)
            - 5-6: 中等 context
            - 0-4: 弱 context
        price: 当前价格（用于计算相对 body）

    Returns:
        {
            "valid": bool,
            "min_body": float,
            "reason": str
        }
    """
    # 强 context (强趋势 + EMA 支撑 + 多周期确认)
    if context_score >= 7:
        min_body = 2  # 放宽到 2 点
    elif context_score >= 5:
        min_body = 3
    else:
        min_body = 5

    # 对于高价币种，使用相对 body（body/price > 0.02%）
    if price > 1000:
        relative_body = (bar_body / price) * 100
        if relative_body < 0.02:
            return {
                "valid": False,
                "min_body": min_body,
                "reason": f"[PASS-WAIT] body={bar_body:.1f} ({relative_body:.3f}%) 太小 (context={context_score})"
            }
    else:
        if bar_body < min_body:
            return {
                "valid": False,
                "min_body": min_body,
                "reason": f"[PASS-WAIT] body={bar_body:.1f} < {min_body} (context={context_score})"
            }

    return {
        "valid": True,
        "min_body": min_body,
        "reason": f"[OK] body={bar_body:.1f} >= {min_body} (context={context_score})"
    }


def calculate_context_score(
    trend_strength: int,
    ema_support: bool,
    multi_tf_aligned: int,
    recent_spike: bool = False,
    at_key_level: bool = False
) -> int:
    """
    计算 context 评分 (0-10)

    Args:
        trend_strength: 趋势强度 (0-10)
        ema_support: 是否有 EMA 支撑
        multi_tf_aligned: 多周期对齐数量 (0-4)
        recent_spike: 最近是否有 Spike
        at_key_level: 是否在关键位

    Returns:
        context_score: 0-10
    """
    score = 0

    # 趋势强度贡献 (0-4 分)
    score += min(trend_strength // 2.5, 4)

    # EMA 支撑 (0-2 分)
    if ema_support:
        score += 2

    # 多周期对齐 (0-3 分)
    score += min(multi_tf_aligned * 0.75, 3)

    # 最近 Spike (0-1 分)
    if recent_spike:
        score += 1

    # 关键位 (0-1 分)
    if at_key_level:
        score += 1

    return min(int(score), 10)


# ═══════════════════════════════════════════════════════════════════════════
# 优化 4: 启用多周期独立入场
# ═══════════════════════════════════════════════════════════════════════════

def should_trigger_deep_analysis(events: dict[str, Any], timeframe: str) -> bool:
    """
    判断是否应该触发深度分析
    Al Brooks: "5m TR → 立即查 15m/1h 是否有 setup"

    任何周期有信号都应该触发深度分析，不只是 5m

    Args:
        events: 事件字典
        timeframe: 时间周期 ("5m" | "15m" | "1h")

    Returns:
        是否触发深度分析
    """
    if timeframe not in events:
        return False

    tf_events = events[timeframe]
    if not isinstance(tf_events, list):
        return False

    # 任何有效信号都触发
    signal_keywords = [
        "h1", "h2", "l1", "l2",
        "ema_touch", "pb_complete",
        "wedge", "spike", "bo",
        "tr_edge", "blshs"
    ]

    for event in tf_events:
        event_str = str(event).lower()
        if any(kw in event_str for kw in signal_keywords):
            return True

    return False


def extract_trigger_timeframes(events: dict[str, Any]) -> list[str]:
    """
    提取所有触发深度分析的时间周期

    Args:
        events: 事件字典

    Returns:
        触发的时间周期列表，按优先级排序 ["15m", "1h", "5m"]
    """
    triggered = []

    # 优先级：15m > 1h > 5m
    # 因为 15m/1h 的 Swing 信号更可靠
    for tf in ["15m", "1h", "5m"]:
        if should_trigger_deep_analysis(events, tf):
            triggered.append(tf)

    return triggered


# ═══════════════════════════════════════════════════════════════════════════
# 优化 5: 增强 Scalp 快速通道
# ═══════════════════════════════════════════════════════════════════════════

SCALP_TRIGGERS = {
    "tr_edge": {"desc": "TR 边缘 BLSHS", "P": 0.60, "R": 1.0},
    "ema_touch": {"desc": "EMA PB Scalp", "P": 0.60, "R": 1.0},
    "first_pb": {"desc": "First PB after BO", "P": 0.60, "R": 1.0},
    "h2_l2_trigger": {"desc": "H2/L2 in tight channel", "P": 0.55, "R": 1.0},
    "wedge_complete": {"desc": "Wedge PB 完成", "P": 0.55, "R": 1.5},
    "blshs": {"desc": "Buy Low Sell High Scalp", "P": 0.60, "R": 1.0},
    "failed_bo": {"desc": "Failed BO Fade", "P": 0.55, "R": 1.0},
}


def detect_scalp_trigger(events: list[str]) -> tuple[str | None, dict[str, Any] | None]:
    """
    检测 Scalp 快速通道触发器

    Args:
        events: 事件列表

    Returns:
        (trigger_key, trigger_config) 或 (None, None)
    """
    for event in events:
        event_lower = str(event).lower()

        for trigger_key, config in SCALP_TRIGGERS.items():
            if trigger_key in event_lower:
                return trigger_key, config

    return None, None


def scalp_fast_lane(
    symbol: str,
    trigger_key: str,
    trigger_config: dict[str, Any],
    current_price: float,
    side: str
) -> dict[str, Any]:
    """
    Scalp 快速通道：< 30 秒决策
    Al Brooks: TR 边缘 BLSHS = 60% 概率

    Args:
        symbol: 交易品种
        trigger_key: 触发器 key
        trigger_config: 触发器配置
        current_price: 当前价格
        side: 方向 ("BUY" | "SELL")

    Returns:
        {
            "action": "OPEN_ORDER" | "PASS",
            "symbol": str,
            "style": "Scalp",
            "trigger": str,
            "P": float,
            "R": float,
            "te": float,
            "reason": str
        }
    """
    P = trigger_config["P"]
    R = trigger_config["R"]
    desc = trigger_config["desc"]

    # 验证 P×R
    te_result = validate_trader_equation(P, R)
    if not te_result["valid"]:
        return {
            "action": "PASS",
            "reason": te_result["reason"]
        }

    # 立即执行，不降级到 Phase B
    return {
        "action": "OPEN_ORDER",
        "symbol": symbol,
        "side": side,
        "style": "Scalp",
        "trigger": desc,
        "P": P,
        "R": R,
        "te": te_result["te"],
        "reason": f"[SCALP-FAST] {desc} - P={P:.0%} R={R:.1f} TE={te_result['te']:.3f}"
    }


# ═══════════════════════════════════════════════════════════════════════════
# 优化 6: 实现反恐惧强制执行
# ═══════════════════════════════════════════════════════════════════════════

class FearDetector:
    """
    Al Brooks: "Beginners fear loss and miss great trades"
    检测连续 PASS 且无有效理由的恐惧模式
    """

    def __init__(self):
        self.consecutive_fear_passes = 0
        self.last_check_time = None

    def check_fear_pattern(self, all_results: list[dict[str, Any]]) -> dict[str, Any]:
        """
        检测恐惧模式

        Args:
            all_results: 所有品种的决策结果

        Returns:
            {
                "force_next_valid": bool,
                "reason": str,
                "consecutive_passes": int
            }
        """
        all_passed = all(r.get("action") == "PASS" for r in all_results)

        # 检查是否有有效理由（RULE 或 WAIT）
        valid_reasons = [
            r.get("reason", "")
            for r in all_results
            if r.get("reason", "").startswith(("[PASS-RULE]", "[PASS-WAIT]"))
        ]

        no_valid_reason = len(valid_reasons) == 0

        if all_passed and no_valid_reason:
            self.consecutive_fear_passes += 1
        else:
            self.consecutive_fear_passes = 0

        # 强制执行机制
        if self.consecutive_fear_passes >= 2:
            return {
                "force_next_valid": True,
                "reason": f"[ANTI-FEAR] 连续 {self.consecutive_fear_passes} 轮恐惧，下一笔 P×R 达标的 setup 强制执行",
                "consecutive_passes": self.consecutive_fear_passes
            }

        return {
            "force_next_valid": False,
            "reason": "",
            "consecutive_passes": self.consecutive_fear_passes
        }

    def find_first_valid_setup(self, all_setups: list[dict[str, Any]]) -> dict[str, Any] | None:
        """
        找到第一个 P×R 达标的 setup

        Args:
            all_setups: 所有候选 setup

        Returns:
            第一个有效的 setup 或 None
        """
        for setup in all_setups:
            P = setup.get("P", 0)
            R = setup.get("R", 0)

            te_result = validate_trader_equation(P, R)
            if te_result["valid"]:
                return setup

        return None

    def reset(self):
        """重置恐惧计数器"""
        self.consecutive_fear_passes = 0


# ═══════════════════════════════════════════════════════════════════════════
# 优化 7: 增加 H1 入场优先级
# ═══════════════════════════════════════════════════════════════════════════

def validate_h1_entry(
    state: str,
    recent_spike: bool,
    recent_bo: bool,
    trend_strength: int,
    bars_since_spike: int = 999
) -> dict[str, Any]:
    """
    Al Brooks: Spike 后默认 H1，不等 H2

    Args:
        state: 市场状态 ("BO" | "TC" | "BC" | "TR")
        recent_spike: 最近是否有 Spike
        recent_bo: 最近是否有 BO
        trend_strength: 趋势强度 (0-10)
        bars_since_spike: 距离 Spike 的 K 线数

    Returns:
        {
            "valid": bool,
            "entry_type": "H1" | "H2",
            "reason": str
        }
    """
    # Spike 后 5 根 K 线内默认 H1
    if (recent_spike or recent_bo) and bars_since_spike <= 5:
        return {
            "valid": True,
            "entry_type": "H1",
            "reason": "H1_ENTRY - Spike/BO 后默认 H1"
        }

    # 强 TC 中 H1 也有效
    if state == "TC" and trend_strength >= 7:
        return {
            "valid": True,
            "entry_type": "H1",
            "reason": "H1_ENTRY - 强 TC 中 H1 有效"
        }

    # BO 状态中 H1 有效
    if state == "BO":
        return {
            "valid": True,
            "entry_type": "H1",
            "reason": "H1_ENTRY - BO 状态中 H1 有效"
        }

    # 其他情况等 H2
    return {
        "valid": False,
        "entry_type": "H2",
        "reason": "[PASS-WAIT] 等 H2 - 非 Spike/强TC/BO 环境"
    }


# ═══════════════════════════════════════════════════════════════════════════
# 辅助函数
# ═══════════════════════════════════════════════════════════════════════════

def parse_equation_from_string(equation_str: str) -> dict[str, Any]:
    """
    从字符串解析 P×R 参数

    Args:
        equation_str: "P=55% R=2.5 PxR=1.38" 格式的字符串

    Returns:
        {"P": float, "R": float, "PxR": float} 或 {"error": str}
    """
    import re

    try:
        compact = equation_str.upper().replace(" ", "")

        # 解析 P
        p_match = re.search(r"P=([0-9.]+)%?", compact)
        if not p_match:
            return {"error": "无法解析 P"}

        P = float(p_match.group(1))
        if "%" in p_match.group(0) or P > 1:
            P /= 100.0

        # 解析 R
        r_match = re.search(r"R=([0-9.]+)", compact)
        if not r_match:
            return {"error": "无法解析 R"}

        R = float(r_match.group(1))

        # 解析 PxR（可选）
        pxr_match = re.search(r"(?:PXR|P×R)=([0-9.]+)", compact)
        PxR = float(pxr_match.group(1)) if pxr_match else P * R

        return {"P": P, "R": R, "PxR": PxR}

    except (ValueError, AttributeError) as e:
        return {"error": f"解析失败: {e}"}


# ═══════════════════════════════════════════════════════════════════════════
# 测试用例
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("PA Runtime 优化补丁 - 测试")
    print("=" * 60)

    # 测试 1: P×R 计算
    print("\n测试 1: P×R 计算")
    print("-" * 60)
    test_cases = [
        (0.55, 2.0, True),   # Swing 顺势
        (0.45, 1.5, True),   # 之前被错误拒绝的案例
        (0.60, 1.0, True),   # Scalp
        (0.40, 2.0, True),   # 反转试探
        (0.40, 1.0, False),  # 不达标
    ]

    for P, R, expected in test_cases:
        result = validate_trader_equation(P, R)
        status = "✅" if result["valid"] == expected else "❌"
        print(f"{status} P={P:.0%} R={R:.1f} → {result['reason']}")

    # 测试 2: Context Score
    print("\n测试 2: Context Score 计算")
    print("-" * 60)
    score = calculate_context_score(
        trend_strength=8,
        ema_support=True,
        multi_tf_aligned=3,
        recent_spike=True,
        at_key_level=False
    )
    print(f"Context Score: {score}/10")

    # 测试 3: 信号 K 线验证
    print("\n测试 3: 信号 K 线验证")
    print("-" * 60)
    result = validate_signal_bar(bar_body=3.0, context_score=8, price=100.0)
    print(f"{'✅' if result['valid'] else '❌'} {result['reason']}")

    # 测试 4: H1 入场验证
    print("\n测试 4: H1 入场验证")
    print("-" * 60)
    result = validate_h1_entry(
        state="TC",
        recent_spike=True,
        recent_bo=False,
        trend_strength=8,
        bars_since_spike=3
    )
    print(f"{'✅' if result['valid'] else '❌'} {result['reason']}")

    print("\n" + "=" * 60)
    print("所有测试完成")
    print("=" * 60)
