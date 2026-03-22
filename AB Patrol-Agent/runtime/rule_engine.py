#!/usr/bin/env python3
"""规则驱动交易引擎。

当前 live 链承接回测已经验证过的三类顺势入场：
1. H1/L1 首次入场
2. H2/L2 二次入场
3. MAG / EMA gap 家族

这里仍然只做 live 识别与执行语义桥接，不改回测模板本身。
"""

import re
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum

from libs.backtest.strategy_filters import resolve_live_strategy_selection, selection_matches_context


class Strategy(Enum):
    """当前 live 链允许的顺势策略。"""
    T1_H1_AFTER_BO = "T1: H1/L1 after BO"
    T2_TREND_H2 = "T2: H2/L2 trend second entry"
    T2_BROAD_CHANNEL_RECOVERY = "T2: H2/L2 broad channel recovery"
    T3_MAG_2020_SETUP = "T3: MAG 20/20 setup"
    T3_EMA_GAP_CONTINUATION = "T3: 20EMA gap continuation"
    T3_FIRST_EMA_GAP_REENTRY = "T3: first EMA gap reentry"
    UNKNOWN = "未知策略"


HL_SIGNAL_TOKEN_RE = re.compile(r"(?<![A-Z0-9])(H1|H2|L1|L2|高1|高2|低1|低2)(?![A-Z0-9])", re.IGNORECASE)
HL_SIGNAL_PRICE_RE = re.compile(
    r"(?<![A-Z0-9])(H1|H2|L1|L2|高1|高2|低1|低2)\s*@\s*(-?\d+(?:\.\d+)?)",
    re.IGNORECASE,
)
STATE_TOKEN_RE = re.compile(r"(TC|BO|TR|BC)", re.IGNORECASE)

MAG_MARKERS = {
    "MAG",
    "MAG 20/20 SETUP",
    "EMA_GAP_MAG_FINAL_LEG",
    "EMA_GAP_MAG_LEG_BASE",
    "EMA_GAP_MAG_WAIT_LL_LH",
    "MAG_FINAL_LEG_STOP",
    "MAG_LEG_BASE_LIMIT",
    "MAG_WAIT_LL_LH",
}
EMA_GAP_MARKERS = {
    "20均线缺口",
    "EMA_GAP_CONTINUATION",
    "EMA_GAP_TEST",
}
FIRST_EMA_GAP_MARKERS = {
    "第一均线缺口",
    "FIRST_EMA_GAP_REENTRY",
}


def _normalize_side(*values: Any) -> str:
    """把 runtime 各种方向字段统一成 LONG / SHORT。"""
    for value in values:
        text = str(value or "").strip().upper()
        if not text:
            continue
        if text in {"BUY", "LONG", "BULL", "BULLISH", "AIL"}:
            return "LONG"
        if text in {"SELL", "SHORT", "BEAR", "BEARISH", "AIS"}:
            return "SHORT"
    return ""


def _first_price(*values: Any) -> float:
    """返回第一个有效价格。"""
    for value in values:
        if isinstance(value, (list, tuple)):
            nested = _first_price(*value)
            if nested > 0:
                return nested
            continue
        if isinstance(value, dict):
            nested = _first_price(*value.values())
            if nested > 0:
                return nested
            continue
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number > 0:
            return number
    return 0.0


def _extract_signal_tokens(*values: Any) -> set[str]:
    """从字符串、列表、字典中提取 H1/H2/L1/L2 语义。"""
    alias_map = {"高1": "H1", "高2": "H2", "低1": "L1", "低2": "L2"}
    tokens: set[str] = set()
    for value in values:
        if isinstance(value, dict):
            tokens |= _extract_signal_tokens(*value.values())
            continue
        if isinstance(value, list):
            tokens |= _extract_signal_tokens(*value)
            continue
        text = str(value or "").upper()
        if not text:
            continue
        for match in HL_SIGNAL_TOKEN_RE.findall(text):
            token = str(match).upper()
            tokens.add(alias_map.get(token, token))
    return tokens


def _extract_signal_entries(*values: Any) -> list[tuple[str, float]]:
    """从运行态文本中提取信号标签与价位。"""
    alias_map = {"高1": "H1", "高2": "H2", "低1": "L1", "低2": "L2"}
    entries: list[tuple[str, float]] = []
    for value in values:
        if isinstance(value, dict):
            entries.extend(_extract_signal_entries(*value.values()))
            continue
        if isinstance(value, list):
            entries.extend(_extract_signal_entries(*value))
            continue
        text = str(value or "")
        if not text:
            continue
        for raw_token, raw_price in HL_SIGNAL_PRICE_RE.findall(text):
            token = alias_map.get(str(raw_token).upper(), str(raw_token).upper())
            try:
                price = float(raw_price)
            except (TypeError, ValueError):
                continue
            if price > 0:
                entries.append((token, price))
    return entries


def _side_from_signal_tokens(tokens: list[str]) -> str:
    """根据 H/L 语义推断方向。"""
    for token in tokens:
        normalized = str(token or "").upper()
        if normalized in {"H1", "H2"}:
            return "LONG"
        if normalized in {"L1", "L2"}:
            return "SHORT"
    return ""


def _first_signal_price(
    entries: list[tuple[str, float]],
    *,
    preferred_tokens: list[str] | None = None,
) -> float:
    """优先按指定信号顺序提取首个有效价位。"""
    priorities = [str(item or "").upper() for item in (preferred_tokens or []) if str(item or "").strip()]
    if priorities:
        for wanted in priorities:
            for token, price in entries:
                if str(token).upper() == wanted and price > 0:
                    return price
    for _, price in entries:
        if price > 0:
            return price
    return 0.0


def _compose_live_thesis(*values: Any) -> str:
    """把运行态里的结构化语义拼成最小 thesis。"""
    parts: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = str(value or "").strip()
        if not text or text in seen:
            continue
        seen.add(text)
        parts.append(text)
    return " | ".join(parts)


def _flatten_texts(*values: Any) -> list[str]:
    """把嵌套结构里的文本拍平成字符串列表。"""
    parts: list[str] = []
    for value in values:
        if isinstance(value, dict):
            parts.extend(_flatten_texts(*value.values()))
            continue
        if isinstance(value, (list, tuple, set, frozenset)):
            parts.extend(_flatten_texts(*value))
            continue
        text = str(value or "").strip()
        if text:
            parts.append(text)
    return parts


def _looks_like_stale_timeout(*values: Any) -> bool:
    """判断当前 patch 是否明显来自模型超时后的旧缓存。"""
    for text in _flatten_texts(*values):
        if "本轮模型超时，保持上一轮观察结论" in text:
            return True
    return False


def _detect_ema_gap_variant(*values: Any) -> str:
    """从 live patch 里识别 EMA gap / MAG 家族。"""
    texts = _flatten_texts(*values)
    if not texts:
        return ""
    upper_texts = [item.upper() for item in texts]
    if any(any(marker in text for marker in MAG_MARKERS) for text in upper_texts):
        return "MAG"
    if any(any(marker in text for marker in FIRST_EMA_GAP_MARKERS) for text in upper_texts):
        return "FIRST_EMA_GAP"
    if any(any(marker in text for marker in EMA_GAP_MARKERS) for text in upper_texts):
        return "EMA_GAP"
    return ""


@dataclass
class StrategyMatch:
    """策略匹配结果"""
    strategy: Strategy
    confidence: float  # 0-1
    side: str  # LONG/SHORT
    entry_price: float
    stop_loss: float
    take_profit: float
    reason: str
    timeframes: List[str]  # 确认的周期
    style: str  # Scalp/Swing


class RuleEngine:
    """规则驱动交易引擎"""

    def __init__(self):
        self.min_confidence = 0.40  # 最低置信度
        self.min_timeframes = 2  # 最少确认周期数
        self.live_strategy_selection = resolve_live_strategy_selection()

    def analyze_symbol(
        self,
        symbol: str,
        data: Dict[str, Any]
    ) -> Optional[StrategyMatch]:
        """分析单个品种，返回主策略匹配结果。"""
        candidates = self.analyze_symbol_candidates(symbol, data)
        return candidates[0] if candidates else None

    def analyze_symbol_candidates(
        self,
        symbol: str,
        data: Dict[str, Any]
    ) -> List[StrategyMatch]:
        """分析单个品种，返回所有通过 live 校验的策略候选。"""

        state = self._extract_market_state(data)
        candidates = self._identify_strategies(state)
        ranked = self._select_ranked_strategies(candidates, state)
        return [item for item in ranked if self._validate_entry(item, state)]

    def _extract_market_state(
        self,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """提取市场状态（从 runtime_state.json 的 symbols 字段）"""

        market_state_str = str(data.get("market_state") or "")
        stage = str(data.get("stage") or "")
        thesis = str(data.get("thesis") or "")
        pre_signal = data.get("pre_signal", {}) if isinstance(data.get("pre_signal"), dict) else {}
        pre_signal_text = str(data.get("pre_signal") or "").strip()
        planned_trade = data.get("planned_trade", {}) if isinstance(data.get("planned_trade"), dict) else {}
        trade = data.get("trade", {}) if isinstance(data.get("trade"), dict) else {}
        entry_idea = data.get("entry_idea", {}) if isinstance(data.get("entry_idea"), dict) else {}
        evaluation = data.get("evaluation", {}) if isinstance(data.get("evaluation"), dict) else {}
        key_levels = data.get("key_levels", {}) if isinstance(data.get("key_levels"), dict) else {}
        structured_timeframes = data.get("timeframes", {}) if isinstance(data.get("timeframes"), dict) else {}
        event_tags = data.get("event_tags", []) if isinstance(data.get("event_tags"), list) else []
        brooks_filter = data.get("brooks_filter", {}) if isinstance(data.get("brooks_filter"), dict) else {}
        signal_type = str(
            data.get("signal_type")
            or planned_trade.get("signal_type")
            or trade.get("signal_type")
            or entry_idea.get("signal_type")
            or ""
        ).strip()
        brooks_label = str(
            planned_trade.get("brooks_label")
            or entry_idea.get("brooks_label")
            or data.get("brooks_label")
            or ""
        ).strip()
        strategy = str(
            data.get("strategy")
            or planned_trade.get("strategy")
            or trade.get("strategy")
            or ""
        ).strip()
        strategy_family = str(
            data.get("latest_strategy_family")
            or data.get("strategy_family")
            or planned_trade.get("playbook_family")
            or trade.get("playbook_family")
            or entry_idea.get("playbook_family")
            or ""
        ).strip()
        management_template = str(
            planned_trade.get("management_template")
            or trade.get("management_template")
            or entry_idea.get("management_template")
            or ""
        ).strip()
        playbook_family = str(
            planned_trade.get("playbook_family")
            or trade.get("playbook_family")
            or entry_idea.get("playbook_family")
            or ""
        ).strip()
        playbook_id = str(
            planned_trade.get("playbook_id")
            or trade.get("playbook_id")
            or entry_idea.get("playbook_id")
            or ""
        ).strip()
        strategy_hint = str(
            planned_trade.get("strategy")
            or trade.get("strategy")
            or entry_idea.get("style")
            or ""
        ).strip()

        # 解析多周期状态
        timeframes = {}
        for tf, snapshot in structured_timeframes.items():
            if not isinstance(snapshot, dict):
                continue
            state_text = str(snapshot.get("state") or snapshot.get("market_state") or "").upper()
            match = STATE_TOKEN_RE.search(state_text)
            if match:
                timeframes[str(tf)] = str(match.group(1)).upper()
        if market_state_str:
            # 例如: "5分钟 TC + 15分钟 BO + 1小时 TC"
            parts = market_state_str.split("+")
            for part in parts:
                part = part.strip()
                if "分钟" in part or "小时" in part:
                    if "5分钟" in part:
                        tf = "5m"
                    elif "15分钟" in part:
                        tf = "15m"
                    elif "30分钟" in part:
                        tf = "30m"
                    elif "1小时" in part or "小时" in part:
                        tf = "1h"
                    else:
                        continue

                    # 提取状态
                    match = STATE_TOKEN_RE.search(part.upper())
                    if match:
                        timeframes[tf] = str(match.group(1)).upper()

        top_level_signal = data.get("signal")
        signal_tokens = _extract_signal_tokens(
            top_level_signal,
            pre_signal_text,
            stage,
            thesis,
            data.get("running_narrative"),
            event_tags,
            structured_timeframes,
        )
        signal_entries = _extract_signal_entries(
            top_level_signal,
            pre_signal_text,
            stage,
            thesis,
            data.get("running_narrative"),
            structured_timeframes,
        )
        direct_signal_tokens = [token for token, _ in signal_entries] or list(_extract_signal_tokens(top_level_signal, structured_timeframes))

        # 解析 stage 中的信号
        signals = {
            "H1": "H1" in signal_tokens,
            "H2": "H2" in signal_tokens,
            "L1": "L1" in signal_tokens,
            "L2": "L2" in signal_tokens,
            "breakout": "BREAKOUT" in stage.upper(),
            "continuation": "CONTINUATION" in stage.upper(),
            "reversal": "REVERSAL" in stage.upper(),
            "wedge": "WEDGE" in stage.upper() or "楔形" in thesis,
        }

        side = _normalize_side(
            planned_trade.get("side"),
            trade.get("direction"),
            entry_idea.get("direction"),
            data.get("ai_direction"),
            pre_signal.get("side"),
        ) or _side_from_signal_tokens(direct_signal_tokens or list(signal_tokens))
        candidate_stage = str(
            planned_trade.get("candidate_stage")
            or entry_idea.get("candidate_stage")
            or ""
        ).strip().upper()
        execution_mode = str(
            planned_trade.get("execution_mode")
            or entry_idea.get("execution_mode")
            or ""
        ).strip().upper()
        order_type = str(
            planned_trade.get("order_type")
            or trade.get("order_type")
            or entry_idea.get("order_type")
            or ""
        ).strip().upper()
        entry_price = _first_price(
            planned_trade.get("entry_price"),
            key_levels.get("entry_price"),
            trade.get("entry_price"),
            pre_signal.get("entry_price"),
        )
        limit_plan_requires_explicit_trigger = (
            candidate_stage == "EXECUTABLE_LIMIT"
            or execution_mode == "LIMIT_PLAN"
            or order_type == "LIMIT"
            or brooks_label == "TR 边缘限价单环境"
        )
        if not entry_price and not limit_plan_requires_explicit_trigger:
            entry_price = _first_signal_price(
                signal_entries,
                preferred_tokens=[
                    *direct_signal_tokens,
                    "H1" if side == "LONG" else "L1",
                    "H2" if side == "LONG" else "L2",
                ],
            )
        stop_loss = _first_price(
            planned_trade.get("stop_loss"),
            key_levels.get("stop_loss"),
            trade.get("stop_loss"),
            pre_signal.get("stop_loss"),
        )
        take_profit = _first_price(
            planned_trade.get("take_profit"),
            key_levels.get("take_profit"),
            trade.get("take_profit"),
            pre_signal.get("take_profit"),
        )
        style = (
            str(planned_trade.get("style") or "").strip()
            or str(trade.get("style") or "").strip()
            or str(entry_idea.get("style") or "").strip()
            or "Scalp"
        )
        thesis_text = _compose_live_thesis(
            thesis,
            entry_idea.get("filter_summary"),
            entry_idea.get("upgrade_condition"),
            entry_idea.get("brooks_rule"),
            planned_trade.get("upgrade_condition"),
            planned_trade.get("brooks_rule"),
            evaluation.get("risk"),
            evaluation.get("execution_decision"),
        )
        ema_gap_variant = _detect_ema_gap_variant(
            signal_type,
            brooks_label,
            management_template,
            playbook_family,
            playbook_id,
            strategy_hint,
            top_level_signal,
            data.get("ema_gap_variant"),
            data.get("ema_gap_signal_type"),
            data.get("ema_gap_brooks_label"),
            data.get("ema_gap_management_template"),
            data.get("ema_gap_playbook_family"),
            data.get("ema_gap_playbook_id"),
            data.get("running_narrative"),
            stage,
            thesis,
            entry_idea,
            planned_trade,
            event_tags,
        )
        last_pass_reason = str(data.get("last_pass_reason") or "").strip().upper()
        stale_model_timeout = _looks_like_stale_timeout(
            data.get("structure_summary"),
            thesis,
            data.get("running_narrative"),
            pre_signal_text,
        )

        return {
            "timeframes": timeframes,
            "signals": signals,
            "thesis": thesis_text,
            "stage": stage,
            "pre_signal": pre_signal,
            "pre_signal_text": pre_signal_text,
            "planned_trade": planned_trade,
            "trade": trade,
            "entry_idea": entry_idea,
            "evaluation": evaluation,
            "event_tags": event_tags,
            "brooks_filter": brooks_filter,
            "allow_executable": (
                planned_trade.get("allow_executable")
                if planned_trade.get("allow_executable") is not None
                else brooks_filter.get("allow_executable")
            ),
            "status": str(data.get("status") or ""),
            "side": side,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "take_profit": take_profit,
            "style": style,
            "strategy": strategy,
            "strategy_family": strategy_family,
            "candidate_stage": candidate_stage,
            "execution_mode": execution_mode,
            "signal_type": signal_type,
            "brooks_label": brooks_label,
            "management_template": management_template,
            "playbook_family": playbook_family,
            "playbook_id": playbook_id,
            "strategy_hint": strategy_hint,
            "ema_gap_variant": ema_gap_variant,
            "ema_gap_signal_type": str(data.get("ema_gap_signal_type") or ""),
            "ema_gap_brooks_label": str(data.get("ema_gap_brooks_label") or ""),
            "ema_gap_management_template": str(data.get("ema_gap_management_template") or ""),
            "ema_gap_playbook_family": str(data.get("ema_gap_playbook_family") or ""),
            "ema_gap_playbook_id": str(data.get("ema_gap_playbook_id") or ""),
            "last_pass_reason": last_pass_reason,
            "stale_model_timeout": stale_model_timeout,
        }

    def _preferred_strategy_from_state(self, state: Dict[str, Any]) -> Optional[Strategy]:
        """优先尊重当前主策略族，不让 EMA gap 辅助候选反向劫持主路由。"""

        def _upper(value: Any) -> str:
            return str(value or "").strip().upper()

        strategy = _upper(state.get("strategy"))
        playbook_id = _upper(state.get("playbook_id"))
        strategy_family = _upper(state.get("strategy_family"))
        playbook_family = _upper(state.get("playbook_family"))
        signal_type = _upper(state.get("signal_type"))

        # 先看显式主策略。
        explicit_blob = " ".join(part for part in (strategy, playbook_id) if part)
        if "T2_BROAD_CHANNEL_RECOVERY" in explicit_blob:
            return Strategy.T2_BROAD_CHANNEL_RECOVERY
        if "T2_TREND_H2" in explicit_blob:
            return Strategy.T2_TREND_H2
        if "T1_H1_AFTER_BO" in explicit_blob:
            return Strategy.T1_H1_AFTER_BO
        explicit_first_gap = "T3_FIRST_EMA_GAP_REENTRY" in explicit_blob
        explicit_ema_gap = "T3_EMA_GAP_CONTINUATION" in explicit_blob
        explicit_mag = "T3_MAG_2020_SETUP" in explicit_blob or "MAG 20/20" in explicit_blob

        # 再看当前主策略族。只要已经明确是 H1/H2/L1/L2，就不允许 MAG 辅助候选反向抢主路由。
        family_blob = " ".join(part for part in (strategy_family, playbook_family) if part)
        if any(token in family_blob for token in ("H1", "L1", "H1/L1")):
            return Strategy.T1_H1_AFTER_BO
        if any(token in family_blob for token in ("H2", "L2", "H2/L2")):
            return Strategy.T2_BROAD_CHANNEL_RECOVERY

        # 再看主信号标签本身。只要当前主信号已经明确是 H1/H2/L1/L2，
        # MAG 只能作为辅助上下文存在，不能反过来抢占主策略。
        signal_tokens = _extract_signal_tokens(
            signal_type,
            state.get("signal"),
            state.get("pre_signal"),
            state.get("stage"),
            state.get("thesis"),
        )
        if any(token in signal_tokens for token in ("H2", "L2")):
            return Strategy.T2_BROAD_CHANNEL_RECOVERY
        if any(token in signal_tokens for token in ("H1", "L1")):
            return Strategy.T1_H1_AFTER_BO

        # 最后才让 EMA gap 家族接管；signal_type 里的 H1/H2/L1/L2 不应被误判成 MAG。
        blob = " ".join(
            _flatten_texts(
                state.get("strategy_hint"),
                signal_type,
                state.get("brooks_label"),
            )
        ).upper()
        if explicit_first_gap or "T3_FIRST_EMA_GAP_REENTRY" in blob or "FIRST_EMA_GAP" == _upper(state.get("ema_gap_variant")):
            return Strategy.T3_FIRST_EMA_GAP_REENTRY
        if explicit_ema_gap or "T3_EMA_GAP_CONTINUATION" in blob or "EMA_GAP" == _upper(state.get("ema_gap_variant")):
            return Strategy.T3_EMA_GAP_CONTINUATION
        if explicit_mag or "T3_MAG_2020_SETUP" in blob or "MAG 20/20" in blob:
            return Strategy.T3_MAG_2020_SETUP
        return None

    def _identify_strategies(
        self,
        state: Dict[str, Any]
    ) -> List[StrategyMatch]:
        """识别当前 live 链允许的顺势策略。"""

        candidates = []
        preferred_strategy = self._preferred_strategy_from_state(state)
        timeframes = state["timeframes"]
        signals = state["signals"]

        # 获取方向和入场价
        side = state.get("side", "")
        entry = float(state.get("entry_price") or 0.0)
        style = str(state.get("style") or "Scalp")
        planned_stop = float(state.get("stop_loss") or 0.0)
        planned_target = float(state.get("take_profit") or 0.0)
        ema_gap_variant = str(state.get("ema_gap_variant") or "").upper()
        signal_type = str(state.get("signal_type") or "").strip()
        brooks_label = str(state.get("brooks_label") or "").strip()
        management_template = str(state.get("management_template") or "").strip()
        playbook_family = str(state.get("playbook_family") or "").strip()
        ema_gap_signal_type = str(state.get("ema_gap_signal_type") or signal_type).strip()
        ema_gap_brooks_label = str(state.get("ema_gap_brooks_label") or "").strip()
        ema_gap_management_template = str(state.get("ema_gap_management_template") or management_template).strip()
        ema_gap_playbook_family = str(state.get("ema_gap_playbook_family") or playbook_family).strip()

        if not side or not entry:
            return []

        # 统计周期确认数
        confirmed_tfs = list(timeframes.keys())
        bo_count = sum(1 for v in timeframes.values() if v == "BO")
        tc_count = sum(1 for v in timeframes.values() if v == "TC")
        bc_count = sum(1 for v in timeframes.values() if v == "BC")
        tr_count = sum(1 for v in timeframes.values() if v == "TR")
        channel_count = tc_count + bc_count

        # T1：H1/L1 首次入场
        if (signals["H1"] or signals["L1"]) and preferred_strategy in {None, Strategy.T1_H1_AFTER_BO}:
            context_bits = []
            if bo_count:
                context_bits.append(f"{bo_count} 周期 BO")
            if channel_count:
                context_bits.append(f"{channel_count} 周期 Channel")
            if tr_count:
                context_bits.append(f"{tr_count} 周期 TR 背景")
            confidence = min(0.90, 0.58 + len(confirmed_tfs) * 0.04 + bo_count * 0.05 + channel_count * 0.03)
            candidates.append(StrategyMatch(
                strategy=Strategy.T1_H1_AFTER_BO,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=planned_stop or self._calc_stop_loss(entry, side, 0.02),
                take_profit=planned_target or self._calc_take_profit(entry, side, 0.04),
                reason=(
                    "T1: H1/L1 首次入场"
                    + (f" ({' / '.join(context_bits)})" if context_bits else "")
                ),
                timeframes=confirmed_tfs,
                style=style,
            ))

        # T2：H2/L2 二次入场
        if (signals["H2"] or signals["L2"]) and preferred_strategy in {None, Strategy.T2_TREND_H2, Strategy.T2_BROAD_CHANNEL_RECOVERY}:
            context_bits = []
            if channel_count:
                context_bits.append(f"{channel_count} 周期 Channel")
            if tr_count:
                context_bits.append(f"{tr_count} 周期 TR 背景")
            if bo_count:
                context_bits.append(f"{bo_count} 周期 BO")
            broad_channel_like = bc_count > 0 or tr_count > 0 or (channel_count > bo_count and channel_count > 0)
            strategy = (
                Strategy.T2_BROAD_CHANNEL_RECOVERY
                if broad_channel_like
                else Strategy.T2_TREND_H2
            )
            confidence = min(
                0.92,
                0.60
                + len(confirmed_tfs) * 0.03
                + channel_count * 0.05
                + bo_count * 0.02
                + (0.03 if signals["H2"] or signals["L2"] else 0.0),
            )
            candidates.append(StrategyMatch(
                strategy=strategy,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=planned_stop or self._calc_stop_loss(entry, side, 0.02),
                take_profit=planned_target or self._calc_take_profit(entry, side, 0.04),
                reason=(
                    ("T2: H2/L2 宽通道恢复" if broad_channel_like else "T2: H2/L2 趋势二次入场")
                    + (f" ({' / '.join(context_bits)})" if context_bits else "")
                ),
                timeframes=confirmed_tfs,
                style=style,
            ))

        if ema_gap_variant and preferred_strategy in {
            None,
            Strategy.T3_MAG_2020_SETUP,
            Strategy.T3_FIRST_EMA_GAP_REENTRY,
            Strategy.T3_EMA_GAP_CONTINUATION,
        }:
            context_bits = []
            if ema_gap_management_template:
                context_bits.append(ema_gap_management_template)
            if ema_gap_playbook_family:
                context_bits.append(ema_gap_playbook_family)
            if tc_count:
                context_bits.append(f"{tc_count} 周期 TC")
            if bo_count:
                context_bits.append(f"{bo_count} 周期 BO")
            if tr_count:
                context_bits.append(f"{tr_count} 周期 TR")
            if ema_gap_variant == "MAG":
                strategy = Strategy.T3_MAG_2020_SETUP
                reason_prefix = "T3: MAG 20/20 Setup"
                confidence = min(0.94, 0.68 + len(confirmed_tfs) * 0.03 + tc_count * 0.04 + bo_count * 0.03)
            elif ema_gap_variant == "FIRST_EMA_GAP":
                strategy = Strategy.T3_FIRST_EMA_GAP_REENTRY
                reason_prefix = "T3: 第一均线缺口"
                confidence = min(0.90, 0.62 + len(confirmed_tfs) * 0.03 + tr_count * 0.02)
            else:
                strategy = Strategy.T3_EMA_GAP_CONTINUATION
                reason_prefix = "T3: 20均线缺口"
                confidence = min(0.92, 0.64 + len(confirmed_tfs) * 0.03 + tc_count * 0.03)
            label = ema_gap_brooks_label or ema_gap_signal_type or brooks_label or signal_type
            if label and label not in context_bits:
                context_bits.insert(0, label)
            candidates.append(StrategyMatch(
                strategy=strategy,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=planned_stop or self._calc_stop_loss(entry, side, 0.02),
                take_profit=planned_target or self._calc_take_profit(entry, side, 0.04),
                reason=reason_prefix + (f" ({' / '.join(context_bits)})" if context_bits else ""),
                timeframes=confirmed_tfs,
                style=style,
            ))

        if "ALL" in self.live_strategy_selection.whitelist:
            return candidates
        return [item for item in candidates if self._strategy_allowed(item.strategy)]

    def _strategy_allowed(self, strategy: Strategy) -> bool:
        """按实盘白名单过滤策略。"""
        selection = self.live_strategy_selection
        return selection_matches_context(selection, strategy.name, strategy.value)

    def _strategy_priority_bonus(
        self,
        match: StrategyMatch,
        state: Dict[str, Any],
    ) -> float:
        """给与当前主信号直接匹配的策略更高优先级。"""

        signals = state.get("signals") if isinstance(state.get("signals"), dict) else {}
        ema_gap_variant = str(state.get("ema_gap_variant") or "").strip().upper()

        if match.strategy == Strategy.T1_H1_AFTER_BO and (signals.get("H1") or signals.get("L1")):
            return 0.25
        if match.strategy in {Strategy.T2_TREND_H2, Strategy.T2_BROAD_CHANNEL_RECOVERY} and (
            signals.get("H2") or signals.get("L2")
        ):
            return 0.25
        if match.strategy == Strategy.T3_MAG_2020_SETUP and ema_gap_variant == "MAG":
            return 0.18
        if match.strategy == Strategy.T3_FIRST_EMA_GAP_REENTRY and ema_gap_variant == "FIRST_EMA_GAP":
            return 0.18
        if match.strategy == Strategy.T3_EMA_GAP_CONTINUATION and ema_gap_variant == "EMA_GAP":
            return 0.18
        return 0.0

    def _select_ranked_strategies(
        self,
        candidates: List[StrategyMatch],
        state: Dict[str, Any],
    ) -> List[StrategyMatch]:
        """返回按主信号优先级和置信度排序后的候选列表。"""

        if not candidates:
            return []

        eligible = [
            item
            for item in candidates
            if item.confidence >= self.min_confidence and len(item.timeframes) >= self.min_timeframes
        ]
        eligible.sort(
            key=lambda item: (
                self._strategy_priority_bonus(item, state),
                item.confidence,
                len(item.timeframes),
            ),
            reverse=True,
        )
        return eligible

    def _select_best_strategy(
        self,
        candidates: List[StrategyMatch],
        state: Dict[str, Any]
    ) -> Optional[StrategyMatch]:
        """选择主策略。"""
        ranked = self._select_ranked_strategies(candidates, state)
        return ranked[0] if ranked else None

    def _validate_entry(
        self,
        match: StrategyMatch,
        state: Dict[str, Any]
    ) -> bool:
        """验证入场条件"""

        # 0. Brooks 过滤器明确禁止执行时，live 规则引擎不能越权放单。
        if state.get("allow_executable") is False:
            return False
        if str(state.get("last_pass_reason") or "").upper() == "PRE_SIGNAL_EXPIRED":
            return False
        if bool(state.get("stale_model_timeout")):
            return False

        # 1. 必须有 pre_signal
        if not (
            state["pre_signal"].get("active")
            or state.get("pre_signal_text")
            or state.get("status") in {"pre_signal", "entry_ready", "entry_ready_blocked", "candidate", "executable"}
            or state.get("candidate_stage") in {
                "PRE_SIGNAL",
                "COUNTERTREND_PROBE",
                "EXECUTABLE_LIMIT",
                "EXECUTABLE_STOP",
                "EXECUTABLE_MARKET",
            }
            or state.get("execution_mode") in {
                "LIMIT_PLAN",
                "STOP_TRIGGER",
                "MARKET_IMMEDIATE",
            }
        ):
            return False

        # 2. 方向必须一致
        pre_signal_side = _normalize_side(
            state["pre_signal"].get("side"),
            state.get("side"),
        )
        if pre_signal_side and pre_signal_side != match.side:
            return False

        # 3. live 只允许 executable 阶段真正落单，candidate 仍然只是候选。
        if not str(state.get("candidate_stage") or "").upper().startswith("EXECUTABLE_"):
            return False

        # 4. 纯 watching + WATCH_ONLY 仍然不允许进入实盘
        if (
            state["status"] == "watching"
            and state.get("candidate_stage") in {"", "WATCH"}
            and state.get("execution_mode") in {"", "WATCH_ONLY"}
        ):
            return False

        # 5. 必须有最小 thesis
        if len(state["thesis"]) < 10:
            return False

        return True

    def _calc_stop_loss(self, entry: float, side: str, pct: float) -> float:
        """计算止损价"""
        if side == "LONG":
            return entry * (1 - pct)
        else:
            return entry * (1 + pct)

    def _calc_take_profit(
        self,
        entry: float,
        side: str,
        pct: float
    ) -> float:
        """计算止盈价"""
        if side == "LONG":
            return entry * (1 + pct)
        else:
            return entry * (1 - pct)


def analyze_all_symbols(
    symbols_data: Dict[str, Dict[str, Any]]
) -> Dict[str, Optional[StrategyMatch]]:
    """分析所有品种"""

    engine = RuleEngine()
    results = {}

    for symbol, data in symbols_data.items():
        match = engine.analyze_symbol(symbol, data)
        results[symbol] = match

    return results


def analyze_all_symbol_candidates(
    symbols_data: Dict[str, Dict[str, Any]]
) -> Dict[str, List[StrategyMatch]]:
    """分析所有品种，返回每个品种全部可执行策略候选。"""

    engine = RuleEngine()
    results: Dict[str, List[StrategyMatch]] = {}

    for symbol, data in symbols_data.items():
        matches = engine.analyze_symbol_candidates(symbol, data)
        results[symbol] = matches

    return results


def get_executable_trades(
    symbols_data: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """获取所有可执行的交易"""

    results = analyze_all_symbol_candidates(symbols_data)

    trades = []
    for symbol, matches in results.items():
        if matches:
            state = symbols_data.get(symbol, {}) if isinstance(symbols_data.get(symbol), dict) else {}
            planned_trade = state.get("planned_trade") if isinstance(state.get("planned_trade"), dict) else {}
            planned_execution_semantics = (
                planned_trade.get("execution_semantics")
                if isinstance(planned_trade.get("execution_semantics"), dict)
                else {}
            )
            live_candidate_stage = str(
                state.get("candidate_stage")
                or planned_execution_semantics.get("candidate_stage")
                or ""
            ).strip().upper()
            live_execution_mode = str(
                state.get("execution_mode")
                or planned_execution_semantics.get("execution_mode")
                or ""
            ).strip().upper()
            for match in matches:
                # 映射 LONG/SHORT 为 BUY/SELL（execution-service 期望的格式）
                side_mapping = {"LONG": "BUY", "SHORT": "SELL"}
                execution_side = side_mapping.get(match.side, match.side)
                reason = match.reason
                if str(planned_trade.get("intent") or "").upper() == "REENTRY":
                    reason = f"{reason} | S7 重入确认"

                trade = {
                    "symbol": symbol,
                    "strategy": match.strategy.value,
                    "side": execution_side,
                    "entry_price": match.entry_price,
                    "stop_loss": match.stop_loss,
                    "take_profit": match.take_profit,
                    "confidence": match.confidence,
                    "reason": reason,
                    "timeframes": match.timeframes,
                    "style": match.style,
                }
                for key in (
                    "intent",
                    "risk_percent",
                    "reentry_attempt",
                    "followup_profile",
                    "playbook_hint",
                    "playbook_id",
                    "playbook_family",
                ):
                    value = planned_trade.get(key)
                    if value not in (None, ""):
                        trade[key] = value
                if live_candidate_stage.startswith("EXECUTABLE_"):
                    trade["candidate_stage"] = live_candidate_stage
                if live_execution_mode:
                    trade["execution_mode"] = live_execution_mode
                if bool(planned_trade.get("reentry_candidate")):
                    trade["reentry_candidate"] = True
                trades.append(trade)

    return trades
