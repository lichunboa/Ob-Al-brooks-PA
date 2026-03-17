"""Brooks 多时间周期角色定义。

把“结构周期 / 主背景周期 / 锚定周期”拆成共享模块，
避免 signal-service 和 backtest runner 各自维护一套不同映射。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TimeframeRoles:
    """某个执行周期对应的 Brooks 多周期角色。"""

    signal: str
    structure: str
    context: str
    anchor: str


# 说明：
# - structure: 当前 setup 所在的更高一级结构周期，用来看“形状是否完整”；
# - context: 当前执行周期的主背景周期，用来看趋势 / TR / 大级别支撑阻力；
# - anchor: 更大的锚定周期，用来看日线级别磁体、机构常看的位置。
# 这里不把 weekly 强行接进主系统，因为当前数据抓取和聚合主链稳定支持到 1d。
_ROLE_MAP: dict[str, TimeframeRoles] = {
    "1m": TimeframeRoles(signal="1m", structure="5m", context="15m", anchor="1h"),
    "5m": TimeframeRoles(signal="5m", structure="15m", context="1h", anchor="1d"),
    "15m": TimeframeRoles(signal="15m", structure="1h", context="4h", anchor="1d"),
    "30m": TimeframeRoles(signal="30m", structure="1h", context="4h", anchor="1d"),
    "1h": TimeframeRoles(signal="1h", structure="4h", context="1d", anchor="1d"),
    "4h": TimeframeRoles(signal="4h", structure="1d", context="1d", anchor="1d"),
    "1d": TimeframeRoles(signal="1d", structure="1d", context="1d", anchor="1d"),
}


def resolve_timeframe_roles(timeframe: str) -> TimeframeRoles:
    """返回执行周期对应的 Brooks 角色定义。"""
    key = str(timeframe or "5m")
    return _ROLE_MAP.get(key, _ROLE_MAP["5m"])


def resolve_filter_cycles(timeframe: str) -> dict[str, str]:
    """给回测链返回统一的质量/主背景/锚定周期。"""
    roles = resolve_timeframe_roles(timeframe)
    return {
        "quality": roles.signal,
        "structure": roles.structure,
        "trend": roles.context,
        "counter": roles.anchor,
    }

