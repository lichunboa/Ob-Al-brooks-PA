"""
Brooks 市场状态映射。

这里只保留当前主链真实在用的状态分类，不再保留旧推荐矩阵。
"""

import logging

logger = logging.getLogger(__name__)


def classify_market_state(market_state) -> str:
    """
    将 CycleIdentifier 的 MarketState 映射成 Brooks 主链使用的市场状态。

    参数:
    - `always_in`: `long / short / neutral`
    - `cycle`: `急速多 / 急速空 / 区间 / 观望`
    - `channel_type`: `tight / broad / none`
    - `is_ttr`: 是否紧密交易区间
    - `follow_through`: 是否有 follow-through
    """
    ai = getattr(market_state, "always_in", "neutral")
    cycle = getattr(market_state, "cycle", "观望")
    channel_type = getattr(market_state, "channel_type", "none")
    follow_through = getattr(market_state, "follow_through", False)
    is_ttr = getattr(market_state, "is_ttr", False)

    if cycle in {"急速多", "急速空"} and follow_through:
        return "breakout_bull" if ai == "long" else "breakout_bear"

    if cycle in {"急速多", "急速空"}:
        return "strong_trend_bull" if ai == "long" else "strong_trend_bear"

    if channel_type == "tight":
        return "strong_trend_bull" if ai == "long" else "strong_trend_bear"

    if channel_type == "broad":
        return "weak_trend_bull" if ai == "long" else "weak_trend_bear"

    if cycle == "区间":
        return "tight_range" if is_ttr else "broad_range"

    if ai == "neutral" or cycle == "观望":
        return "broad_range"

    return "broad_range"
