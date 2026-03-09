"""
持仓管理模块
基于 Al Brooks 价格行为理论的持仓管理策略
"""
import logging
from typing import Any

LOG = logging.getLogger("position_manager")


def manage_positions(
    positions: list[dict[str, Any]],
    market_data: dict[str, Any],
    execution_snapshot: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    持仓管理主函数

    返回: position_management actions 列表
    """
    actions = []

    for position in positions:
        symbol = position.get("symbol", "")
        side = position.get("side", "")
        entry_price = float(position.get("entry_price", 0))
        current_price = float(position.get("current_price", 0))
        unrealized_pnl_pct = float(position.get("unrealized_pnl_pct", 0))

        if not symbol or not entry_price or not current_price:
            continue

        # 1. 固定止损：-2%
        if unrealized_pnl_pct <= -2.0:
            actions.append({
                "type": "CLOSE_POSITION",
                "symbol": symbol,
                "reason": f"固定止损触发: {unrealized_pnl_pct:.2f}% <= -2%",
                "refs": ["position_manager.py"],
            })
            LOG.info(f"[POSITION_MANAGER] {symbol} 触发止损: {unrealized_pnl_pct:.2f}%")
            continue

        # 2. 固定止盈：+3%
        if unrealized_pnl_pct >= 3.0:
            actions.append({
                "type": "CLOSE_POSITION",
                "symbol": symbol,
                "reason": f"固定止盈触发: {unrealized_pnl_pct:.2f}% >= +3%",
                "refs": ["position_manager.py"],
            })
            LOG.info(f"[POSITION_MANAGER] {symbol} 触发止盈: {unrealized_pnl_pct:.2f}%")
            continue

        # 3. 移动止损：盈利超过 1.5% 后，回撤 0.5% 就平仓
        if unrealized_pnl_pct >= 1.5:
            # 计算最高盈利点（需要从 position 中获取）
            max_pnl_pct = float(position.get("max_pnl_pct", unrealized_pnl_pct))
            if unrealized_pnl_pct < max_pnl_pct - 0.5:
                actions.append({
                    "type": "CLOSE_POSITION",
                    "symbol": symbol,
                    "reason": f"移动止损触发: 从 {max_pnl_pct:.2f}% 回撤到 {unrealized_pnl_pct:.2f}%",
                    "refs": ["position_manager.py"],
                })
                LOG.info(f"[POSITION_MANAGER] {symbol} 触发移动止损")
                continue

        # 4. 时间止损：持仓超过 4 小时且未盈利，平仓
        hold_minutes = int(position.get("hold_minutes", 0))
        if hold_minutes >= 240 and unrealized_pnl_pct < 0.5:
            actions.append({
                "type": "CLOSE_POSITION",
                "symbol": symbol,
                "reason": f"时间止损触发: 持仓 {hold_minutes} 分钟，盈利 {unrealized_pnl_pct:.2f}%",
                "refs": ["position_manager.py"],
            })
            LOG.info(f"[POSITION_MANAGER] {symbol} 触发时间止损")
            continue

    return actions


def should_scale_out(position: dict[str, Any]) -> tuple[bool, str]:
    """
    判断是否应该分批止盈

    返回: (是否分批, 原因)
    """
    unrealized_pnl_pct = float(position.get("unrealized_pnl_pct", 0))

    # 盈利超过 2% 时，平掉 50% 仓位
    if unrealized_pnl_pct >= 2.0:
        return True, f"分批止盈: 盈利 {unrealized_pnl_pct:.2f}% >= 2%，平掉 50% 仓位"

    return False, ""
