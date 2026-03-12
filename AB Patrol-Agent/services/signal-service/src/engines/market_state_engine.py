"""
市场状态引擎 (Market State Engine)
V5.0 — 将 CycleIdentifier 四状态映射到八状态 + 策略推荐

八种市场状态:
  strong_trend_bull  强势多头 (Spike/Tight Channel + long)
  strong_trend_bear  强势空头 (Spike/Tight Channel + short)
  weak_trend_bull    弱多头 (Broad Channel + long)
  weak_trend_bear    弱空头 (Broad Channel + short)
  tight_range        窄幅区间 (TTR)
  broad_range        宽幅区间 (Trading Range)
  breakout_bull      多头突破 (Spike + follow_through + long)
  breakout_bear      空头突破 (Spike + follow_through + short)
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


# ============================================================
# 1. 状态分类
# ============================================================

def classify_market_state(market_state) -> str:
    """
    将 CycleIdentifier 的 MarketState 映射到 V5.0 八状态字符串

    参数: pa_engine.MarketState dataclass (always_in, cycle, channel_type, is_ttr, follow_through, trend_strength)
    返回: str — 八状态之一
    """
    ai = getattr(market_state, 'always_in', 'neutral')
    cycle = getattr(market_state, 'cycle', '观望')
    ch = getattr(market_state, 'channel_type', 'none')
    is_ttr = getattr(market_state, 'is_ttr', False)
    ft = getattr(market_state, 'follow_through', False)
    strength = getattr(market_state, 'trend_strength', 0.0)

    # --- 突破 (Spike + Follow Through) ---
    if cycle in ('急速多', '急速空') and ft:
        return 'breakout_bull' if ai == 'long' else 'breakout_bear'

    # --- 强趋势 (Spike 或 Tight Channel) ---
    if cycle in ('急速多', '急速空'):
        return 'strong_trend_bull' if ai == 'long' else 'strong_trend_bear'

    if ch == 'tight':
        return 'strong_trend_bull' if ai == 'long' else 'strong_trend_bear'

    # --- 弱趋势 (Broad Channel) ---
    if ch == 'broad':
        return 'weak_trend_bull' if ai == 'long' else 'weak_trend_bear'

    # --- 区间 ---
    if cycle == '区间':
        return 'tight_range' if is_ttr else 'broad_range'

    # --- 观望/Neutral → 默认宽幅区间 ---
    if ai == 'neutral' or cycle == '观望':
        return 'broad_range'

    # Fallback
    return 'broad_range'


# ============================================================
# 2. 策略推荐矩阵
# ============================================================

# 每种市场状态对应的策略推荐
# recommended: 推荐策略列表
# prohibited: 禁止策略列表
# score_modifier: 评分修正 (-20 ~ +15)
# warning: 警告信息（可选）

STRATEGY_MATRIX: dict[str, dict[str, Any]] = {
    'strong_trend_bull': {
        'recommended': ['H1买入', 'H2买入', '突破回调', '均线缺口多', 'ii突破', 'LOY/HOY突破'],
        'prohibited': ['Fade做空', '双顶做空', '楔形顶做空', '头肩顶MTR'],
        'score_modifier': 10,
        'label': '📈 强势多头趋势',
        'label_en': 'Strong Bull Trend',
    },
    'strong_trend_bear': {
        'recommended': ['L1做空', 'L2做空', '突破回调', '均线缺口空', 'ii突破', 'LOY/HOY突破'],
        'prohibited': ['Fade做多', '双底做多', '楔形底做多', '头肩底MTR'],
        'score_modifier': 10,
        'label': '📉 强势空头趋势',
        'label_en': 'Strong Bear Trend',
    },
    'weak_trend_bull': {
        'recommended': ['H2买入', '楔形底做多', '通道回调', '均线缺口多'],
        'prohibited': ['H1买入', '追高', '动量突破'],
        'score_modifier': 0,
        'label': '📈 弱多头趋势 (Broad Channel)',
        'label_en': 'Weak Bull Trend',
    },
    'weak_trend_bear': {
        'recommended': ['L2做空', '楔形顶做空', '通道回调', '均线缺口空'],
        'prohibited': ['L1做空', '追空', '动量突破'],
        'score_modifier': 0,
        'label': '📉 弱空头趋势 (Broad Channel)',
        'label_en': 'Weak Bear Trend',
    },
    'tight_range': {
        'recommended': ['ii突破', 'ioi突破', 'iii突破', 'Fade区间'],
        'prohibited': ['H1买入', 'L1做空', '追势', '动量突破', '均线缺口多', '均线缺口空'],
        'score_modifier': -5,
        'warning': 'TTR 极窄区间，等待突破方向确认',
        'label': '⬜ 窄幅区间 (TTR)',
        'label_en': 'Tight Range',
    },
    'broad_range': {
        'recommended': ['双顶做空', '双底做多', 'Fade区间', '楔形底做多', '楔形顶做空', '头肩顶MTR', '头肩底MTR'],
        'prohibited': ['H1买入', 'L1做空', '追势', '动量突破'],
        'score_modifier': -5,
        'label': '⬜ 宽幅区间 (Trading Range)',
        'label_en': 'Broad Range',
    },
    'breakout_bull': {
        'recommended': ['突破回调', 'H1买入', '均线缺口多', 'ii突破', 'iii突破', 'HOY突破'],
        'prohibited': ['Fade做空', '逆势剥头皮'],
        'score_modifier': 15,
        'label': '🚀 多头突破',
        'label_en': 'Bull Breakout',
    },
    'breakout_bear': {
        'recommended': ['突破回调', 'L1做空', '均线缺口空', 'ii突破', 'iii突破', 'LOY突破'],
        'prohibited': ['Fade做多', '逆势剥头皮'],
        'score_modifier': 15,
        'label': '💥 空头突破',
        'label_en': 'Bear Breakout',
    },
}


def get_strategy_recommendation(state: str) -> dict[str, Any]:
    """
    获取市场状态对应的策略推荐

    返回: {recommended: [], prohibited: [], score_modifier: int, label: str}
    """
    return STRATEGY_MATRIX.get(state, {
        'recommended': [],
        'prohibited': [],
        'score_modifier': 0,
        'label': '❓ 未知状态',
        'label_en': 'Unknown',
    })


# ============================================================
# 3. Agent 专属推荐（按 agent 筛选推荐策略）
# ============================================================

# 每个 agent 只关心自己领域的策略
AGENT_STRATEGIES = {
    'al-brooks': {
        'H1买入', 'H2买入', 'L1做空', 'L2做空',
        '突破回调', 'Fade做空', 'Fade做多', 'Fade区间',
        '均线缺口多', '均线缺口空',
        '双顶做空', '双底做多', '楔形顶做空', '楔形底做多',
        '头肩顶MTR', '头肩底MTR',
        'ii突破', 'ioi突破', 'iii突破', 'HOY突破', 'LOY突破',
        '追高', '追空', '追势', '通道回调',
    },
    'trader': {
        '动量突破', '趋势跟踪', '均值回归做多', '均值回归做空',
        'RSI超买超卖', '布林带收口突破', '趋势确认做多', '趋势确认做空',
        '动量下行', '空头趋势',
    },
    'wyckoff': {
        '吸筹确认做多', '派发确认做空', 'Phase C Spring', 'Phase C UTAD',
        'Phase D/E 跟进', '低量蓄势', '吸筹/派发识别',
    },
}


def get_agent_recommendation(state: str, agent_id: str) -> dict[str, Any]:
    """
    获取市场状态下特定 agent 的策略推荐

    返回: {recommended: [], prohibited: [], score_modifier: int, label: str}
    """
    base = get_strategy_recommendation(state)
    agent_known = AGENT_STRATEGIES.get(agent_id, set())

    if not agent_known:
        return base

    return {
        'recommended': [s for s in base['recommended'] if s in agent_known],
        'prohibited': [s for s in base['prohibited'] if s in agent_known],
        'score_modifier': base['score_modifier'],
        'label': base['label'],
        'label_en': base.get('label_en', ''),
        'warning': base.get('warning', ''),
    }


# ============================================================
# 4. 格式化（给 signal-router.js 使用的状态块文本）
# ============================================================

def format_market_state_block(state: str) -> str:
    """
    生成市场状态文本块（注入到 agent 消息中）

    示例:
    🌐 市场状态: 📈 弱多头趋势 (Broad Bull Channel)
    ✅ 推荐: H2买入, 楔形底, 通道回调
    ❌ 禁止: 追高, 突破模式, 逆势剥头皮
    """
    rec = get_strategy_recommendation(state)
    lines = [
        f"🌐 市场状态: {rec['label']}",
    ]

    if rec['recommended']:
        lines.append(f"✅ 推荐: {', '.join(rec['recommended'])}")

    if rec['prohibited']:
        lines.append(f"❌ 禁止: {', '.join(rec['prohibited'])}")

    warning = rec.get('warning', '')
    if warning:
        lines.append(f"⚠️ {warning}")

    return '\n'.join(lines)
