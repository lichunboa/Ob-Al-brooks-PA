"""
回测策略过滤与管理模板。

目标：
1. 让回测支持“策略白名单 / 黑名单”。
2. 用 Al Brooks 原课里的术语做族级别名，避免每次都手填所有信号名。
3. 为回测模拟器提供基于原课的管理模板分类，不污染生产执行链。
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

from trading.market.playbook_router import (
    CHANNEL_LINE_FADE_PLAYBOOK,
    DAILY_TR_FADE_PLAYBOOK,
    HTF_SR_REVERSAL_PLAYBOOK,
    MICRO_CHANNEL_REVERSAL_PLAYBOOK,
    WEDGE_PULLBACK_PLAYBOOK,
)

ALL_KNOWN_STRATEGIES = {
    "收线追进",
    "高1",
    "低1",
    "高2",
    "低2",
    "看衰突破",
    "第二腿陷阱",
    "双重顶",
    "双重底",
    "楔形顶",
    "楔形底",
    "急速通道",
    "末端旗形",
    "20均线缺口",
    "MAG 20/20 Setup",
    "第一均线缺口",
    "突破回调",
    "ii突破",
    "ioi突破",
    "iii突破",
    "头肩顶MTR",
    "头肩底MTR",
    "HOY突破",
    "LOY突破",
}


STRATEGY_ALIASES: dict[str, set[str]] = {
    "双重顶底": {"双重顶", "双重底"},
    "楔形顶底": {"楔形顶", "楔形底"},
    "头肩mtr": {"头肩顶MTR", "头肩底MTR"},
    "头肩MTR": {"头肩顶MTR", "头肩底MTR"},
    "第二腿陷阱": {"第二腿陷阱", "2nd Leg Trap"},
    "高低1": {"高1", "低1"},
    "高低2": {"高2", "低2"},
    "高低12": {"高1", "低1", "高2", "低2"},
    "均线缺口": {"20均线缺口", "MAG 20/20 Setup", "第一均线缺口"},
    "突破追单": {"收线追进", "ii突破", "ioi突破", "iii突破", "HOY突破", "LOY突破"},
    "突破追随": {"收线追进", "ii突破", "ioi突破", "iii突破", "HOY突破", "LOY突破"},
    "inside突破": {"ii突破", "ioi突破", "iii突破"},
    "反转核心": {"双重顶", "双重底", "楔形顶", "楔形底", "头肩顶MTR", "头肩底MTR"},
    "趋势回调": {"高1", "低1", "高2", "低2", "突破回调"},
}


PROFILE_PRESETS = {
    "brooks_pullback_core": {
        "description": "优先做回调、MTR 与更清晰的二次信号，屏蔽大突破追单和均线缺口抢跑。",
        "whitelist": ["头肩MTR", "双重顶底", "突破回调", "ioi突破", "高低2"],
        "blacklist": ["收线追进", "均线缺口", "ii突破"],
        "management_profile": "brooks_pdf",
    },
    "brooks_mtr_focus": {
        "description": "聚焦 MTR / 双重顶底 / 突破回调，适合趋势末段与宽通道反转验证。",
        "whitelist": ["头肩MTR", "双重顶底", "突破回调"],
        "blacklist": ["收线追进", "均线缺口", "ii突破", "楔形顶底", "高低12", "ioi突破"],
        "management_profile": "brooks_pdf",
    },
}


@dataclass(frozen=True)
class StrategySelection:
    """策略过滤解析结果。"""

    whitelist: frozenset[str]
    blacklist: frozenset[str]
    profile: str = ""
    description: str = ""
    raw_whitelist: tuple[str, ...] = ()
    raw_blacklist: tuple[str, ...] = ()

    @property
    def is_active(self) -> bool:
        return bool(self.whitelist or self.blacklist)


def normalize_strategy_label(label: str) -> str:
    """统一策略标签格式。"""
    return str(label or "").strip()


def expand_strategy_terms(raw_terms: Iterable[str]) -> set[str]:
    """把族级术语展开为真实策略名。"""
    expanded: set[str] = set()
    for raw_term in raw_terms:
        term = normalize_strategy_label(raw_term)
        if not term:
            continue
        alias = STRATEGY_ALIASES.get(term) or STRATEGY_ALIASES.get(term.lower())
        if alias:
            expanded.update(alias)
            continue
        expanded.add(term)
    return {item for item in expanded if item}


def resolve_strategy_selection(
    whitelist_terms: Iterable[str] | None = None,
    blacklist_terms: Iterable[str] | None = None,
    profile: str = "",
) -> StrategySelection:
    """合并配置档与显式白黑名单。"""
    profile_key = normalize_strategy_label(profile)
    preset = PROFILE_PRESETS.get(profile_key, {})
    raw_whitelist = [*list(preset.get("whitelist", [])), *list(whitelist_terms or [])]
    raw_blacklist = [*list(preset.get("blacklist", [])), *list(blacklist_terms or [])]
    whitelist = expand_strategy_terms(raw_whitelist)
    blacklist = expand_strategy_terms(raw_blacklist)
    if whitelist:
        whitelist = {item for item in whitelist if item in ALL_KNOWN_STRATEGIES or item}
    if blacklist:
        blacklist = {item for item in blacklist if item in ALL_KNOWN_STRATEGIES or item}
    return StrategySelection(
        whitelist=frozenset(sorted(whitelist)),
        blacklist=frozenset(sorted(blacklist)),
        profile=profile_key,
        description=str(preset.get("description", "")),
        raw_whitelist=tuple(normalize_strategy_label(item) for item in raw_whitelist if normalize_strategy_label(item)),
        raw_blacklist=tuple(normalize_strategy_label(item) for item in raw_blacklist if normalize_strategy_label(item)),
    )


def is_strategy_allowed(signal_type: str, selection: StrategySelection) -> bool:
    """判断某个真实策略名是否允许进入回测。"""
    label = normalize_strategy_label(signal_type)
    if not label:
        return False
    if selection.whitelist and label not in selection.whitelist:
        return False
    if selection.blacklist and label in selection.blacklist:
        return False
    return True


def describe_strategy_selection(selection: StrategySelection) -> str:
    """生成便于打印的过滤说明。"""
    parts: list[str] = []
    if selection.profile:
        parts.append(f"配置档={selection.profile}")
    if selection.whitelist:
        parts.append("白名单=" + "/".join(sorted(selection.whitelist)))
    if selection.blacklist:
        parts.append("黑名单=" + "/".join(sorted(selection.blacklist)))
    return " | ".join(parts) if parts else "未启用策略过滤"


def default_management_profile(profile: str = "") -> str:
    """从策略配置档推导默认管理模板。"""
    preset = PROFILE_PRESETS.get(normalize_strategy_label(profile), {})
    return str(preset.get("management_profile") or "default")


def classify_management_style(
    signal_type: str,
    management_profile: str = "default",
    *,
    market_state: str = "",
    higher_market_state: str = "",
    timeframe: str = "",
    entry_type: str = "STOP",
    route_style: str = "",
    playbook_id: str = "",
) -> str:
    """把策略映射到回测专用管理模板。"""
    label = normalize_strategy_label(signal_type)
    if management_profile != "brooks_pdf":
        return "default"

    market_key = normalize_strategy_label(market_state)
    higher_key = normalize_strategy_label(higher_market_state)
    tf = normalize_strategy_label(timeframe)
    order_type = normalize_strategy_label(entry_type).upper()
    route_key = normalize_strategy_label(route_style)
    playbook_key = normalize_strategy_label(playbook_id)

    # Brooks 原课里 5m 纯 TR 优先 BLSHS: limit + scalp。
    # 但 broad channel 不能一概按 TR scalp 管理，否则会把顺势恢复和 reversal swing 一起压扁。
    if tf == "5m" and (
        playbook_key in {
            "TR1_BLSHS",
            "TR2_FAILED_BO_FADE",
            "TR3_SECOND_LEG_TRAP",
            "R2_TR_EDGE_REVERSAL",
            "T6_TR_LEG_FIRST_PULLBACK",
            "T6_TR_LEG_CHANNEL_RECOVERY",
            "T6_TR_LEG_EMA_RECOVERY",
        }
        or market_key == "tight_range"
        or higher_key in {"tight_range", "broad_range"}
        or route_key in {"tr_blshs_limit", "higher_tr_limit_reversal", "tr_leg_limit_pullback"}
    ):
        if order_type == "LIMIT" or label in {
            "高1",
            "高2",
            "低1",
            "低2",
            "第二腿陷阱",
            "双重顶",
            "双重底",
            "楔形顶",
            "楔形底",
            "头肩顶MTR",
            "头肩底MTR",
        }:
            return "brooks_tr_blshs"

    if playbook_key == CHANNEL_LINE_FADE_PLAYBOOK:
        return "brooks_r3_channel_line_fade"
    if playbook_key == "R1_BROAD_CHANNEL_REVERSAL":
        return "brooks_wedge_reversal"
    if playbook_key == DAILY_TR_FADE_PLAYBOOK:
        return "brooks_tr4_daily_tr_fade"
    if playbook_key == HTF_SR_REVERSAL_PLAYBOOK:
        return "brooks_s1_htf_sr_reversal"
    if playbook_key == MICRO_CHANNEL_REVERSAL_PLAYBOOK:
        return "brooks_s2_micro_channel"
    if playbook_key == WEDGE_PULLBACK_PLAYBOOK:
        return "brooks_t4_wedge_pullback"

    if label in {"20均线缺口", "MAG 20/20 Setup", "第一均线缺口"}:
        return "brooks_scalp"
    if label in {"头肩顶MTR", "头肩底MTR"}:
        return "brooks_hs_reversal"
    if label in {"双重顶", "双重底"}:
        return "brooks_dt_db_reversal"
    if label in {"楔形顶", "楔形底", "末端旗形", "急速通道", "看衰突破", "第二腿陷阱"}:
        return "brooks_wedge_reversal"
    if label in {"高1", "低1", "高2", "低2", "突破回调", "ioi突破", "HOY突破", "LOY突破"}:
        return "brooks_swing"
    if label in {"收线追进", "ii突破", "iii突破"}:
        return "brooks_breakout"
    return "default"


def management_score_floor(
    signal_type: str,
    management_profile: str = "default",
    *,
    market_state: str = "",
    higher_market_state: str = "",
    timeframe: str = "",
    entry_type: str = "STOP",
    route_style: str = "",
    playbook_id: str = "",
) -> int:
    """不同管理模板下的最低分要求。"""
    style = classify_management_style(
        signal_type,
        management_profile,
        market_state=market_state,
        higher_market_state=higher_market_state,
        timeframe=timeframe,
        entry_type=entry_type,
        route_style=route_style,
        playbook_id=playbook_id,
    )
    if management_profile != "brooks_pdf":
        return 0
    if style == "brooks_breakout":
        return 66
    if style == "brooks_hs_reversal":
        return 58
    if style == "brooks_dt_db_reversal":
        if timeframe == "5m":
            return 63
        return 61
    if style == "brooks_t4_wedge_pullback":
        return 64 if timeframe == "5m" else 62
    if style == "brooks_r3_channel_line_fade":
        return 68 if timeframe == "5m" else 65
    if style == "brooks_tr4_daily_tr_fade":
        return 57
    if style == "brooks_s1_htf_sr_reversal":
        return 62 if timeframe == "5m" else 60
    if style == "brooks_s2_micro_channel":
        return 63 if timeframe == "5m" else 61
    if style == "brooks_wedge_reversal":
        if timeframe == "5m":
            return 66
        return 63
    if style == "brooks_tr_blshs":
        return 52
    if style == "brooks_swing":
        return 60
    if style == "brooks_scalp":
        return 50
    return 0
