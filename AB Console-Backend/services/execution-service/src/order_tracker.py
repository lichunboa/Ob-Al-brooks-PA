"""
订单状态追踪器 V2.6.1

功能:
- 追踪活跃订单状态
- 检测止盈/止损触发
- 生成状态变更通知
- 更新本地交易记录

作者: AL Brooks Trading Console
版本: 2.6.1
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from .evolution_manager import get_evolution_manager

logger = logging.getLogger(__name__)

# 文件路径
WORKSPACE = Path.home() / ".openclaw" / "workspace"
SHARED_WORKSPACE = Path.home() / ".openclaw" / "workspaces" / "trading-shared"

ACTIVE_TRADES_FILES = {
    "main": WORKSPACE / "active_trades.json",
    "al-brooks": SHARED_WORKSPACE / "al_brooks_active_trades.json",
    "trader": SHARED_WORKSPACE / "quant_active_trades.json",
    "wyckoff": SHARED_WORKSPACE / "wyckoff_active_trades.json",
}


@dataclass
class OrderStatusChange:
    """订单状态变更"""

    trade_id: str
    symbol: str
    bot_id: str
    old_status: str
    new_status: str
    trigger_reason: str  # 'stop_loss_hit', 'take_profit_hit', 'manual_close', 'expired'
    exit_price: Optional[float] = None
    pnl: Optional[float] = None  # USDT 金额 (V3.8 P1: 从百分比改为 USDT)
    pnl_percent: Optional[float] = None  # 百分比 (V3.8 P1 新增)
    timestamp: str = None

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


class OrderTracker:
    """订单追踪器"""

    def __init__(self, executor):
        self.executor = executor
        self._status_cache = {}  # symbol -> last_status

    async def check_all_orders(self) -> List[OrderStatusChange]:
        """
        检查所有活跃订单状态

        Returns:
            状态变更列表
        """
        changes = []

        # 获取币安当前持仓和挂单
        try:
            positions = await self.executor.get_positions()
            open_orders = await self.executor.get_open_orders()

            position_map = {p.symbol: p for p in positions}
            orders_by_symbol = {}
            for order in open_orders:
                sym = order.symbol
                if sym not in orders_by_symbol:
                    orders_by_symbol[sym] = []
                orders_by_symbol[sym].append(order)

        except Exception as e:
            logger.error(f"获取币安数据失败: {e}")
            return changes

        # 检查每个本地活跃交易
        for file_name, file_path in ACTIVE_TRADES_FILES.items():
            if not file_path.exists():
                continue

            try:
                file_changes = await self._check_file_orders(
                    file_path, position_map, orders_by_symbol, file_name
                )
                changes.extend(file_changes)
            except Exception as e:
                logger.error(f"检查 {file_name} 失败: {e}")

        return changes

    async def _check_file_orders(
        self,
        file_path: Path,
        position_map: Dict,
        orders_by_symbol: Dict,
        source_name: str,
    ) -> List[OrderStatusChange]:
        """检查单个文件的订单"""
        changes = []

        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                trades = data
            else:
                trades = data.get("trades", data.get("active_trades", []))

            for trade in trades:
                if trade.get("status") != "active":
                    continue

                symbol = trade.get("symbol", "").replace("/", "")
                trade_id = trade.get("trade_id")
                bot_id = trade.get("bot_id", source_name)

                # 检查是否已平仓
                if symbol not in position_map:
                    # 持仓已关闭，检查是止盈还是止损
                    change = await self._determine_exit_reason(
                        trade, symbol, orders_by_symbol, bot_id
                    )
                    if change:
                        changes.append(change)
                        # 更新本地记录
                        self._update_trade_status(
                            file_path, trade_id, change
                        )

                        # V3.2: 进化系统记录 (P4)
                        try:
                            evo = get_evolution_manager()
                            strategy = trade.get("strategy", "auto")
                            # Normalize symbol
                            raw_sym = symbol.split(':')[0] if ':' in symbol else symbol

                            evo.record_trade_result(
                                bot_id=bot_id,
                                strategy=strategy,
                                symbol=raw_sym,
                                pnl=change.pnl if change.pnl is not None else 0.0,
                                is_win=(change.pnl > 0) if change.pnl is not None else False
                            )
                            logger.info(f"[Evolution] 自动记录: {bot_id} {raw_sym} pnl={change.pnl}")
                        except Exception as e:
                            logger.warning(f"[Evolution] 记录失败: {e}")

                        # V3.7: 笔记闭环 — 回填 Obsidian 笔记结果字段
                        try:
                            note_path = trade.get("note_path")
                            if note_path and Path(note_path).exists():
                                self._backfill_note(note_path, change)
                        except Exception as e:
                            logger.warning(f"[NoteBackfill] 回填失败: {e}")

        except Exception as e:
            logger.error(f"检查文件订单失败: {e}")

        return changes

    async def _determine_exit_reason(
        self,
        trade: Dict,
        symbol: str,
        orders_by_symbol: Dict,
        bot_id: str,
    ) -> Optional[OrderStatusChange]:
        """判断出场原因"""

        # 检查挂单情况
        symbol_orders = orders_by_symbol.get(symbol, [])

        # 获取交易详情
        entry_price = trade.get("entry_price", 0)
        stop_loss = trade.get("stop_loss")
        take_profit = trade.get("take_profit")
        direction = trade.get("direction", "long")

        # 尝试从交易历史获取最后成交价
        try:
            history = await self.executor.get_trade_history(
                symbol=symbol, limit=10
            )
            if history:
                # 找到最近的平仓交易
                last_trade = history[0]
                exit_price = last_trade.price

                # 判断是止盈还是止损
                if direction == "long":
                    if take_profit and exit_price >= take_profit:
                        trigger_reason = "take_profit_hit"
                    elif stop_loss and exit_price <= stop_loss:
                        trigger_reason = "stop_loss_hit"
                    else:
                        trigger_reason = "manual_close"
                else:  # short
                    if take_profit and exit_price <= take_profit:
                        trigger_reason = "take_profit_hit"
                    elif stop_loss and exit_price >= stop_loss:
                        trigger_reason = "stop_loss_hit"
                    else:
                        trigger_reason = "manual_close"

                # 计算盈亏 (V3.8 P1: 同时计算 USDT 和百分比)
                quantity = trade.get("quantity", 0)
                if direction == "long":
                    pnl_usdt = (exit_price - entry_price) * quantity
                    pnl_pct = ((exit_price - entry_price) / entry_price) * 100
                else:
                    pnl_usdt = (entry_price - exit_price) * quantity
                    pnl_pct = ((entry_price - exit_price) / entry_price) * 100

                return OrderStatusChange(
                    trade_id=trade.get("trade_id"),
                    symbol=symbol,
                    bot_id=bot_id,
                    old_status="active",
                    new_status="closed",
                    trigger_reason=trigger_reason,
                    exit_price=exit_price,
                    pnl=pnl_usdt,
                    pnl_percent=pnl_pct,
                )

        except Exception as e:
            logger.warning(f"获取交易历史失败: {e}")

        # 无法确定原因，标记为未知
        return OrderStatusChange(
            trade_id=trade.get("trade_id"),
            symbol=symbol,
            bot_id=bot_id,
            old_status="active",
            new_status="closed",
            trigger_reason="unknown",
        )

    def _update_trade_status(
        self, file_path: Path, trade_id: str, change: OrderStatusChange
    ):
        """更新本地交易状态"""
        try:
            data = json.loads(file_path.read_text(encoding="utf-8"))

            # 查找交易
            if isinstance(data, list):
                trades = data
            else:
                trades = data.get("trades", data.get("active_trades", []))
            for trade in trades:
                if trade.get("trade_id") == trade_id:
                    # 更新状态
                    trade["status"] = change.new_status
                    trade["close_time"] = change.timestamp
                    trade["exit_reason"] = change.trigger_reason

                    if change.exit_price:
                        trade["exit_price"] = change.exit_price
                    if change.pnl is not None:
                        trade["pnl_usdt"] = change.pnl
                    if change.pnl_percent is not None:
                        trade["pnl_percent"] = change.pnl_percent

                    break

            # 重新组织数据
            if isinstance(data, dict) and "active_trades" in data:
                active = [
                    t for t in trades if t.get("status") == "active"
                ]
                closed = [
                    t for t in trades if t.get("status") != "active"
                ]
                data["active_trades"] = active

                if "trade_history" not in data:
                    data["trade_history"] = []
                data["trade_history"].extend(closed)

            # 保存
            file_path.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

            logger.info(
                f"已更新交易状态: {trade_id} -> {change.new_status} "
                f"({change.trigger_reason})"
            )

        except Exception as e:
            logger.error(f"更新交易状态失败: {e}")
            raise

    async def track_order(
        self, trade_id: str, bot_id: str, symbol: str
    ) -> Dict:
        """
        追踪单个订单

        Returns:
            {
                "trade_id": 交易ID,
                "status": 当前状态,
                "position_exists": 是否有持仓,
                "current_price": 当前价格,
                "pnl": 浮动盈亏,
                "open_orders": 挂单列表
            }
        """
        try:
            # 获取持仓
            positions = await self.executor.get_positions()
            position = next(
                (p for p in positions if p.symbol == symbol), None
            )

            # 获取挂单
            open_orders = await self.executor.get_open_orders(symbol)

            result = {
                "trade_id": trade_id,
                "bot_id": bot_id,
                "symbol": symbol,
                "position_exists": position is not None,
                "open_orders": len(open_orders),
            }

            if position:
                result.update(
                    {
                        "status": "active",
                        "current_price": position.mark_price,
                        "entry_price": position.entry_price,
                        "quantity": position.quantity,
                        "pnl": position.unrealized_pnl,
                        "pnl_percent": (
                            position.unrealized_pnl
                            / (position.entry_price * position.quantity)
                        )
                        * 100,
                    }
                )
            else:
                result.update(
                    {
                        "status": "closed_or_not_opened",
                        "current_price": None,
                        "pnl": 0,
                    }
                )

            return result

        except Exception as e:
            logger.error(f"追踪订单失败: {e}")
            return {
                "trade_id": trade_id,
                "bot_id": bot_id,
                "symbol": symbol,
                "error": str(e),
            }

    def generate_notification(
        self, change: OrderStatusChange
    ) -> Dict:
        """
        生成通知消息（用于发送到 Discord 或其他渠道）

        Returns:
            {
                "title": 标题,
                "message": 消息内容,
                "level": 级别 (info/success/warning/error),
                "data": 原始数据
            }
        """
        emoji_map = {
            "take_profit_hit": "🎯",
            "stop_loss_hit": "🛑",
            "manual_close": "✋",
            "expired": "⏰",
            "unknown": "❓",
        }

        level_map = {
            "take_profit_hit": "success",
            "stop_loss_hit": "warning",
            "manual_close": "info",
            "expired": "info",
            "unknown": "error",
        }

        emoji = emoji_map.get(change.trigger_reason, "📊")
        level = level_map.get(change.trigger_reason, "info")

        # 构建消息 (V3.8 P1: 显示 USDT + 百分比)
        pnl_pct = change.pnl_percent
        pnl_str = (
            f"${change.pnl:+.2f} ({pnl_pct:+.2f}%)" if change.pnl is not None and pnl_pct is not None
            else f"${change.pnl:+.2f}" if change.pnl is not None
            else "N/A"
        )
        price_str = (
            f"${change.exit_price:,.2f}"
            if change.exit_price
            else "未知"
        )

        message = f"""
{emoji} **交易已关闭** - {change.symbol}

**交易ID**: {change.trade_id}
**机器人**: {change.bot_id}
**出场原因**: {change.trigger_reason}
**出场价格**: {price_str}
**盈亏**: {pnl_str}
**时间**: {change.timestamp}
"""

        return {
            "title": f"交易关闭 - {change.symbol}",
            "message": message.strip(),
            "level": level,
            "data": asdict(change),
        }

    def _backfill_note(self, note_path: str, change: OrderStatusChange):
        """V3.7: 回填 Obsidian 笔记的结果字段（frontmatter YAML）"""
        import re
        p = Path(note_path)
        content = p.read_text(encoding="utf-8")

        # V3.8 P1+P2: 使用百分比回填笔记 + 空值保护
        pnl_pct = change.pnl_percent
        if pnl_pct is not None:
            outcome = "盈利" if pnl_pct > 0 else ("平局" if pnl_pct == 0 else "亏损")
        else:
            outcome = "未知"
        backfills = {
            "净利润/net_profit:": f"净利润/net_profit: {pnl_pct:.2f}%" if pnl_pct is not None else None,
            "结果/outcome:": f"结果/outcome: {outcome}",
            "出场原因/exit_reason:": f"出场原因/exit_reason: {change.trigger_reason}",
            "出场价格/exit_price:": f"出场价格/exit_price: {change.exit_price}" if change.exit_price else None,
        }

        updated = False
        for key, replacement in backfills.items():
            if replacement is None:
                continue
            # 匹配空值的 frontmatter 行: "key:" 或 "key: "
            pattern = re.compile(rf"^({re.escape(key)})\s*$", re.MULTILINE)
            if pattern.search(content):
                content = pattern.sub(replacement, content)
                updated = True

        if updated:
            p.write_text(content, encoding="utf-8")
            pnl_display = f"{pnl_pct:.2f}%" if pnl_pct is not None else "N/A"
            logger.info(f"[NoteBackfill] 已回填: {p.name} → {outcome} {pnl_display}")
