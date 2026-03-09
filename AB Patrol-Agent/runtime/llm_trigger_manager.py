"""
LLM 触发管理器

优化 LLM 调用时机，只在必要时触发：
1. 开仓决策（新信号出现）
2. 持仓管理变化（止损/止盈调整）
3. 平仓决策（Premise 失效）
4. 异常情况（需要人工判断）

正常扫描时使用规则引擎，不调用 LLM。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from utils import safe_float, utc_now


class LLMTriggerManager:
    """LLM 触发管理器"""
    
    def __init__(self):
        self.last_llm_call = None
        self.last_position_state = {}
        self.last_signal_state = {}
        self.llm_call_count = 0
        self.rule_engine_count = 0
    
    def should_trigger_llm(
        self,
        phase: str,
        execution: dict[str, Any],
        market_cache: dict[str, Any],
        runtime: dict[str, Any],
    ) -> tuple[bool, str]:
        """
        判断是否需要触发 LLM
        
        Returns:
            (should_trigger, reason)
        """
        positions = execution.get("positions", [])
        has_position = len(positions) > 0
        
        # 1. 有持仓时，检查是否需要管理
        if has_position:
            return self._check_position_management(positions, market_cache)
        
        # 2. 无持仓时，检查是否有新信号
        if phase in {"ENTRY_READY", "SCAN"}:
            return self._check_new_signals(market_cache, runtime)
        
        # 3. 其他情况：不触发 LLM
        return False, "正常扫描，使用规则引擎"
    
    def _check_position_management(
        self,
        positions: list[dict[str, Any]],
        market_cache: dict[str, Any],
    ) -> tuple[bool, str]:
        """
        检查持仓管理是否需要 LLM

        触发条件：
        1. 持仓状态变化（新开仓、部分平仓）
        2. 止损/止盈需要调整
        3. Premise 可能失效
        4. 止损移动时（Trailing SL）
        5. 分批止盈时（Partial Close）
        """
        current_state = {}
        for pos in positions:
            symbol = pos.get("symbol", "")
            current_state[symbol] = {
                "quantity": safe_float(pos.get("quantity"), 0),
                "stop_loss": safe_float(pos.get("stop_loss"), 0),
                "take_profit": safe_float(pos.get("take_profit"), 0),
                "unrealized_pnl": safe_float(pos.get("unrealized_pnl"), 0),
                "entry_price": safe_float(pos.get("entry_price"), 0),
                "side": pos.get("side", ""),
            }

        # 检查是否有新持仓
        new_positions = set(current_state.keys()) - set(self.last_position_state.keys())
        if new_positions:
            self.last_position_state = current_state
            return True, f"新开仓: {', '.join(new_positions)}"

        # 检查是否有持仓关闭
        closed_positions = set(self.last_position_state.keys()) - set(current_state.keys())
        if closed_positions:
            self.last_position_state = current_state
            return True, f"持仓关闭: {', '.join(closed_positions)}"

        # 检查止损/止盈是否变化
        for symbol, state in current_state.items():
            if symbol not in self.last_position_state:
                continue

            last_state = self.last_position_state[symbol]

            # 止损变化（Trailing SL）
            if abs(state["stop_loss"] - last_state["stop_loss"]) > 0.01:
                self.last_position_state = current_state
                return True, f"{symbol} 止损移动（Trailing SL）"

            # 止盈变化
            if abs(state["take_profit"] - last_state["take_profit"]) > 0.01:
                self.last_position_state = current_state
                return True, f"{symbol} 止盈调整"

            # 数量变化（部分平仓 / Partial Close）
            if abs(state["quantity"] - last_state["quantity"]) > 0.001:
                self.last_position_state = current_state
                return True, f"{symbol} 分批止盈（Partial Close）"

        # 检查 Premise 是否可能失效
        for symbol, state in current_state.items():
            if symbol not in self.last_position_state:
                continue

            last_state = self.last_position_state[symbol]

            # 检查浮盈是否变负（可能 Premise 失效）
            if state["unrealized_pnl"] < 0 and last_state["unrealized_pnl"] >= 0:
                self.last_position_state = current_state
                return True, f"{symbol} 浮盈转负，检查 Premise"

            # 检查是否回撤过大（可能 Premise 失效）
            entry_price = state["entry_price"]
            current_price = entry_price + state["unrealized_pnl"] / state["quantity"]

            if entry_price > 0:
                if state["side"] == "BUY":
                    drawdown = (entry_price - current_price) / entry_price
                    if drawdown > 0.02:  # 回撤超过 2%
                        self.last_position_state = current_state
                        return True, f"{symbol} 回撤 {drawdown*100:.1f}%，检查 Premise"
                else:
                    drawdown = (current_price - entry_price) / entry_price
                    if drawdown > 0.02:
                        self.last_position_state = current_state
                        return True, f"{symbol} 回撤 {drawdown*100:.1f}%，检查 Premise"

        # 检查是否需要深度分析（每 10 分钟一次）
        if self.last_llm_call:
            try:
                last_call_dt = datetime.fromisoformat(self.last_llm_call.replace("Z", "+00:00"))
                now_dt = utc_now()
                minutes_since = (now_dt - last_call_dt).total_seconds() / 60

                if minutes_since >= 10:
                    self.last_position_state = current_state
                    return True, "定期持仓分析（10分钟）"
            except:
                pass

        # 不需要 LLM
        self.last_position_state = current_state
        return False, "持仓稳定，使用规则引擎"
    
    def _check_new_signals(
        self,
        market_cache: dict[str, Any],
        runtime: dict[str, Any],
    ) -> tuple[bool, str]:
        """
        检查是否有新信号需要 LLM 分析
        
        触发条件：
        1. 有品种状态变为 entry_ready
        2. 有新的 pre_signal 出现
        3. 市场状态发生重大变化
        """
        symbols = market_cache.get("symbols", {})
        
        current_signals = {}
        entry_ready_symbols = []
        
        for symbol, data in symbols.items():
            if not isinstance(data, dict):
                continue
            
            status = str(data.get("status", "")).lower()
            
            # 收集 entry_ready 品种
            if status == "entry_ready":
                entry_ready_symbols.append(symbol)
            
            # 记录信号状态
            current_signals[symbol] = {
                "status": status,
                "ai_direction": data.get("ai_direction", ""),
                "market_state": data.get("market_state", ""),
            }
        
        # 检查是否有新的 entry_ready
        new_entry_ready = []
        for symbol in entry_ready_symbols:
            last_status = self.last_signal_state.get(symbol, {}).get("status", "")
            if last_status != "entry_ready":
                new_entry_ready.append(symbol)
        
        if new_entry_ready:
            self.last_signal_state = current_signals
            return True, f"新信号: {', '.join(new_entry_ready)}"
        
        # 检查市场状态变化
        for symbol, state in current_signals.items():
            if symbol not in self.last_signal_state:
                continue
            
            last_state = self.last_signal_state[symbol]
            
            # AI 方向变化
            if state["ai_direction"] != last_state["ai_direction"]:
                if state["ai_direction"] and last_state["ai_direction"]:
                    self.last_signal_state = current_signals
                    return True, f"{symbol} AI方向变化: {last_state['ai_direction']} → {state['ai_direction']}"
            
            # 市场状态变化
            if state["market_state"] != last_state["market_state"]:
                # 只在重大状态变化时触发
                major_states = {"BO", "TC", "TR"}
                if any(s in state["market_state"] for s in major_states):
                    self.last_signal_state = current_signals
                    return True, f"{symbol} 市场状态变化: {last_state['market_state']} → {state['market_state']}"
        
        # 检查是否长时间没有调用 LLM（30 分钟）
        if self.last_llm_call:
            try:
                last_call_dt = datetime.fromisoformat(self.last_llm_call.replace("Z", "+00:00"))
                now_dt = utc_now()
                minutes_since = (now_dt - last_call_dt).total_seconds() / 60
                
                if minutes_since >= 30:
                    self.last_signal_state = current_signals
                    return True, "定期市场分析（30分钟）"
            except:
                pass
        
        # 不需要 LLM
        self.last_signal_state = current_signals
        return False, "无新信号，使用规则引擎"
    
    def record_llm_call(self):
        """记录 LLM 调用"""
        self.last_llm_call = utc_now().isoformat() + "Z"
        self.llm_call_count += 1
    
    def record_rule_engine_call(self):
        """记录规则引擎调用"""
        self.rule_engine_count += 1
    
    def get_statistics(self) -> dict[str, Any]:
        """获取统计数据"""
        total = self.llm_call_count + self.rule_engine_count
        llm_ratio = self.llm_call_count / total * 100 if total > 0 else 0
        
        return {
            "llm_calls": self.llm_call_count,
            "rule_engine_calls": self.rule_engine_count,
            "total_calls": total,
            "llm_ratio": llm_ratio,
            "last_llm_call": self.last_llm_call,
        }
    
    def reset_statistics(self):
        """重置统计"""
        self.llm_call_count = 0
        self.rule_engine_count = 0


# 全局实例
_trigger_manager = None


def get_trigger_manager() -> LLMTriggerManager:
    """获取全局触发管理器"""
    global _trigger_manager
    if _trigger_manager is None:
        _trigger_manager = LLMTriggerManager()
    return _trigger_manager
