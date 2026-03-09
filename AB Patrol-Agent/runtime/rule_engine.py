#!/usr/bin/env python3
"""规则驱动交易引擎 — 完全不依赖 LLM 的决策系统

核心理念：
1. 策略识别：100% 规则匹配（不用 LLM）
2. 入场决策：多周期确认 + 概率评估
3. 持仓管理：止损/止盈用规则，复杂情况用 LLM
4. 频率：每 2 分钟扫描，符合条件就下单

Al Brooks: "Trading is a probability game. Take every reasonable setup."
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from enum import Enum


class Strategy(Enum):
    """Al Brooks 15 个 Playbook + 扩展"""
    # A 组：顺势入场（T1-T6）
    T1_H1_AFTER_BO = "T1: H1/L1 after BO"
    T2_H2_IN_CHANNEL = "T2: H2/L2 in Channel"
    T3_EMA_PB = "T3: EMA PB (MAG)"
    T4_WEDGE_PB = "T4: Wedge PB"
    T5_BUY_SELL_CLOSE = "T5: Buy/Sell The Close"
    T6_CHANNEL_PB = "T6: Channel 内 PB"

    # B 组：反转入场（R1-R3）
    R1_MTR = "R1: MTR 5 条件"
    R2_CLIMAX = "R2: Climax Reversal"
    R3_CHANNEL_LINE_FADE = "R3: Channel Line BO Fade"

    # C 组：TR 入场（TR1-TR4）
    TR1_BLSHS = "TR1: BLSHS"
    TR2_FAILED_BO_FADE = "TR2: Failed BO Fade"
    TR3_2ND_LEG_TRAP = "TR3: 2nd Leg Trap"
    TR4_DAILY_TR_FADE = "TR4: Daily TR Fade"

    # D 组：特殊（S1-S2）
    S1_HTF_SR_REVERSAL = "S1: HTF S/R Reversal"
    S2_MICRO_CHANNEL = "S2: Micro Channel"

    UNKNOWN = "未知策略"


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

    def analyze_symbol(
        self,
        symbol: str,
        data: Dict[str, Any]
    ) -> Optional[StrategyMatch]:
        """分析单个品种，返回策略匹配结果"""

        # 1. 提取市场状态
        state = self._extract_market_state(data)

        # 2. 识别所有可能的策略
        candidates = self._identify_strategies(state)

        # 3. 选择最佳策略
        best = self._select_best_strategy(candidates, state)

        # 4. 验证入场条件
        if best and self._validate_entry(best, state):
            return best

        return None

    def _extract_market_state(
        self,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """提取市场状态（从 runtime_state.json 的 symbols 字段）"""

        market_state_str = data.get("market_state", "")
        stage = data.get("stage", "")
        thesis = data.get("thesis", "")
        pre_signal = data.get("pre_signal", {})
        planned_trade = data.get("planned_trade", {})

        # 解析多周期状态
        timeframes = {}
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
                    if "TC" in part:
                        timeframes[tf] = "TC"
                    elif "BO" in part:
                        timeframes[tf] = "BO"
                    elif "TR" in part:
                        timeframes[tf] = "TR"

        # 解析 stage 中的信号
        signals = {
            "H1": "H1" in stage,
            "H2": "H2" in stage,
            "L1": "L1" in stage,
            "L2": "L2" in stage,
            "breakout": "BREAKOUT" in stage.upper(),
            "continuation": "CONTINUATION" in stage.upper(),
            "reversal": "REVERSAL" in stage.upper(),
            "wedge": "WEDGE" in stage.upper() or "楔形" in thesis,
        }

        return {
            "timeframes": timeframes,
            "signals": signals,
            "thesis": thesis,
            "stage": stage,
            "pre_signal": pre_signal,
            "planned_trade": planned_trade,
            "status": data.get("status", ""),
        }

    def _identify_strategies(
        self,
        state: Dict[str, Any]
    ) -> List[StrategyMatch]:
        """识别所有可能的策略（15 个 Playbook）"""

        candidates = []
        timeframes = state["timeframes"]
        signals = state["signals"]
        pre_signal = state["pre_signal"]
        planned = state["planned_trade"]

        # 获取方向和入场价
        side = pre_signal.get("side", "")
        entry = planned.get("entry_price", 0)
        style = planned.get("style", "Scalp")

        if not side or not entry:
            return []

        # 统计周期确认数
        confirmed_tfs = list(timeframes.keys())
        bo_count = sum(1 for v in timeframes.values() if v == "BO")
        tc_count = sum(1 for v in timeframes.values() if v == "TC")
        tr_count = sum(1 for v in timeframes.values() if v == "TR")

        # === A 组：顺势入场（T1-T6）===

        # T1: H1/L1 after BO
        if bo_count >= 1 and (signals["H1"] or signals["L1"]):
            confidence = 0.55 + bo_count * 0.1
            candidates.append(StrategyMatch(
                strategy=Strategy.T1_H1_AFTER_BO,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.02),
                take_profit=self._calc_take_profit(entry, side, 0.04),
                reason=f"T1: BO 后首次 PB ({bo_count} 周期 BO)",
                timeframes=confirmed_tfs,
                style="Swing",
            ))

        # T2: H2/L2 in Channel
        if tc_count >= 2 and (signals["H2"] or signals["L2"]):
            confidence = 0.50 + tc_count * 0.05
            candidates.append(StrategyMatch(
                strategy=Strategy.T2_H2_IN_CHANNEL,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.018),
                take_profit=self._calc_take_profit(entry, side, 0.04),
                reason=f"T2: 通道中第二次 PB ({tc_count} 周期 TC)",
                timeframes=confirmed_tfs,
                style="Swing",
            ))

        # T3: EMA PB (MAG)
        if tc_count >= 1 and "EMA" in state["thesis"].upper():
            confidence = 0.48 + tc_count * 0.06
            candidates.append(StrategyMatch(
                strategy=Strategy.T3_EMA_PB,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.015),
                take_profit=self._calc_take_profit(entry, side, 0.035),
                reason=f"T3: EMA PB ({tc_count} 周期 TC)",
                timeframes=confirmed_tfs,
                style="Scalp",
            ))

        # T4: Wedge PB
        if signals["wedge"] and tc_count >= 1:
            confidence = 0.52 + tc_count * 0.05
            candidates.append(StrategyMatch(
                strategy=Strategy.T4_WEDGE_PB,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.022),
                take_profit=self._calc_take_profit(entry, side, 0.05),
                reason=f"T4: Wedge PB ({tc_count} 周期 TC)",
                timeframes=confirmed_tfs,
                style="Swing",
            ))

        # T5: Buy/Sell The Close
        if signals["breakout"] and bo_count >= 1:
            confidence = 0.53 + bo_count * 0.08
            candidates.append(StrategyMatch(
                strategy=Strategy.T5_BUY_SELL_CLOSE,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.018),
                take_profit=self._calc_take_profit(entry, side, 0.045),
                reason=f"T5: Buy/Sell The Close ({bo_count} 周期 BO)",
                timeframes=confirmed_tfs,
                style="Swing",
            ))

        # T6: Channel 内 PB
        if tc_count >= 1 and (signals["H1"] or signals["H2"]):
            confidence = 0.45 + tc_count * 0.05
            candidates.append(StrategyMatch(
                strategy=Strategy.T6_CHANNEL_PB,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.015),
                take_profit=self._calc_take_profit(entry, side, 0.03),
                reason=f"T6: 通道内 PB ({tc_count} 周期 TC)",
                timeframes=confirmed_tfs,
                style=style,
            ))

        # === B 组：反转入场（R1-R3）===

        # R1: MTR 5 条件
        if signals["reversal"] and len(confirmed_tfs) >= 2:
            confidence = 0.42 + len(confirmed_tfs) * 0.05
            candidates.append(StrategyMatch(
                strategy=Strategy.R1_MTR,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.025),
                take_profit=self._calc_take_profit(entry, side, 0.06),
                reason=f"R1: MTR ({len(confirmed_tfs)} 周期确认)",
                timeframes=confirmed_tfs,
                style="Swing",
            ))

        # R2: Climax Reversal
        if "CLIMAX" in state["stage"].upper() or "高潮" in state["thesis"]:
            confidence = 0.44
            candidates.append(StrategyMatch(
                strategy=Strategy.R2_CLIMAX,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.022),
                take_profit=self._calc_take_profit(entry, side, 0.05),
                reason="R2: Climax Reversal",
                timeframes=confirmed_tfs,
                style="Scalp",
            ))

        # R3: Channel Line BO Fade
        if "FADE" in state["stage"].upper() and tc_count >= 1:
            confidence = 0.50 + tc_count * 0.05
            candidates.append(StrategyMatch(
                strategy=Strategy.R3_CHANNEL_LINE_FADE,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.02),
                take_profit=self._calc_take_profit(entry, side, 0.045),
                reason=f"R3: Channel Line Fade ({tc_count} 周期 TC)",
                timeframes=confirmed_tfs,
                style="Swing",
            ))

        # === C 组：TR 入场（TR1-TR4）===

        # TR1: BLSHS
        if tr_count >= 1:
            confidence = 0.45 + tr_count * 0.05
            candidates.append(StrategyMatch(
                strategy=Strategy.TR1_BLSHS,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.015),
                take_profit=self._calc_take_profit(entry, side, 0.025),
                reason=f"TR1: BLSHS ({tr_count} 周期 TR)",
                timeframes=confirmed_tfs,
                style="Scalp",
            ))

        # TR2: Failed BO Fade
        if tr_count >= 1 and bo_count >= 1:
            confidence = 0.48
            candidates.append(StrategyMatch(
                strategy=Strategy.TR2_FAILED_BO_FADE,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.018),
                take_profit=self._calc_take_profit(entry, side, 0.03),
                reason="TR2: Failed BO Fade",
                timeframes=confirmed_tfs,
                style="Scalp",
            ))

        # TR3: 2nd Leg Trap
        if tr_count >= 1 and "2ND" in state["stage"].upper():
            confidence = 0.46
            candidates.append(StrategyMatch(
                strategy=Strategy.TR3_2ND_LEG_TRAP,
                confidence=confidence,
                side=side,
                entry_price=entry,
                stop_loss=self._calc_stop_loss(entry, side, 0.018),
                take_profit=self._calc_take_profit(entry, side, 0.03),
                reason="TR3: 2nd Leg Trap",
                timeframes=confirmed_tfs,
                style="Scalp",
            ))

        return candidates

    def _select_best_strategy(
        self,
        candidates: List[StrategyMatch],
        state: Dict[str, Any]
    ) -> Optional[StrategyMatch]:
        """选择最佳策略"""

        if not candidates:
            return None

        # 按置信度排序
        candidates.sort(key=lambda x: x.confidence, reverse=True)

        # 返回置信度最高的
        best = candidates[0]

        # 检查最低置信度
        if best.confidence < self.min_confidence:
            return None

        # 检查最少周期数
        if len(best.timeframes) < self.min_timeframes:
            return None

        return best

    def _validate_entry(
        self,
        match: StrategyMatch,
        state: Dict[str, Any]
    ) -> bool:
        """验证入场条件"""

        # 1. 必须有 pre_signal
        if not state["pre_signal"].get("active"):
            return False

        # 2. 方向必须一致
        if state["pre_signal"].get("side") != match.side:
            return False

        # 3. 不能是 watching 状态
        if state["status"] == "watching":
            return False

        # 4. 必须有 thesis
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


def get_executable_trades(
    symbols_data: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """获取所有可执行的交易"""

    results = analyze_all_symbols(symbols_data)

    trades = []
    for symbol, match in results.items():
        if match:
            # 映射 LONG/SHORT 为 BUY/SELL（execution-service 期望的格式）
            side_mapping = {"LONG": "BUY", "SHORT": "SELL"}
            execution_side = side_mapping.get(match.side, match.side)

            trades.append({
                "symbol": symbol,
                "strategy": match.strategy.value,
                "side": execution_side,  # 使用映射后的 BUY/SELL
                "entry_price": match.entry_price,
                "stop_loss": match.stop_loss,
                "take_profit": match.take_profit,
                "confidence": match.confidence,
                "reason": match.reason,
                "timeframes": match.timeframes,
                "style": match.style,
            })

    return trades
