"""持仓健康巡检器 - 60秒周期自动执行

三项巡检：
1. 裸仓检测 + 自动补止损
2. 持仓超时检测 + 自动平仓
3. 移动止损（trailing stop）
"""

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# 默认保护性止损百分比
DEFAULT_STOP_PCT = 0.02


class PositionPatrol:

    def __init__(self, executor, trading_state):
        self.executor = executor
        self.trading_state = trading_state
        # 持仓首次发现时间: {norm_symbol: datetime}
        self._position_first_seen: dict[str, datetime] = {}
        # 移动止损状态: {norm_symbol: {highest_price, breakeven_set}}
        self._trailing_state: dict[str, dict] = {}
        # 巡检历史（最近 20 条）
        self._history: list[dict] = []
        self._patrol_count: int = 0
        self._total_naked_fixed: int = 0
        self._total_expired_closed: int = 0
        self._total_trailing_moved: int = 0
        # 已补过止损的持仓（避免 Demo 模式下重复下单）
        self._sl_placed: dict[str, float] = {}  # {norm_symbol: sl_price}

    def get_status(self) -> dict:
        """返回巡检状态摘要"""
        return {
            "patrol_count": self._patrol_count,
            "totals": {
                "naked_fixed": self._total_naked_fixed,
                "expired_closed": self._total_expired_closed,
                "trailing_moved": self._total_trailing_moved,
            },
            "tracked_positions": len(self._position_first_seen),
            "trailing_active": len(self._trailing_state),
            "recent_history": self._history[-10:],
        }

    async def patrol(self) -> dict:
        """主巡检入口，返回巡检报告"""
        report = {"naked_fixed": 0, "expired_closed": 0,
                  "trailing_moved": 0, "errors": []}
        try:
            positions = await self.executor.get_positions()
            if not positions:
                self._cleanup_stale_state(set())
                return report

            open_orders = await self.executor.get_open_orders()
            stop_map = self._build_stop_order_map(open_orders)
            active_symbols = set()

            for pos in positions:
                norm_sym = pos.symbol  # 已经是 SOLUSDT:USDT 格式
                active_symbols.add(norm_sym)
                bot_id = self.executor.get_position_bot_id(norm_sym)
                alloc = (self.trading_state.get_allocation(bot_id)
                         if bot_id else None)
                # 1. 裸仓检测（跳过已补过止损的）
                if norm_sym not in stop_map and norm_sym not in self._sl_placed:
                    fixed = await self._fix_naked_position(pos, alloc)
                    if fixed:
                        report["naked_fixed"] += 1

                # 2. 持仓超时检测
                if norm_sym not in self._position_first_seen:
                    self._position_first_seen[norm_sym] = datetime.now(
                        timezone.utc)
                else:
                    closed = await self._check_hold_timeout(
                        pos, alloc, bot_id)
                    if closed:
                        report["expired_closed"] += 1
                        continue  # 已平仓，跳过移动止损

                # 3. 移动止损
                if alloc and alloc.get("trailing_stop_enabled"):
                    moved = await self._check_trailing_stop(
                        pos, alloc, stop_map.get(norm_sym))
                    if moved:
                        report["trailing_moved"] += 1

            self._cleanup_stale_state(active_symbols)

        except Exception as e:
            logger.error(f"[巡检] 异常: {e}")
            report["errors"].append(str(e))

        # 更新统计
        self._patrol_count += 1
        self._total_naked_fixed += report["naked_fixed"]
        self._total_expired_closed += report["expired_closed"]
        self._total_trailing_moved += report["trailing_moved"]

        if (report["naked_fixed"] or report["expired_closed"]
                or report["trailing_moved"] or report["errors"]):
            entry = {
                "time": datetime.now(timezone.utc).isoformat(),
                **report,
            }
            self._history.append(entry)
            if len(self._history) > 20:
                self._history = self._history[-20:]
            logger.info(
                f"[巡检] 裸仓修复={report['naked_fixed']} "
                f"超时平仓={report['expired_closed']} "
                f"移动止损={report['trailing_moved']}")
        return report

    def _build_stop_order_map(
        self, open_orders: list
    ) -> dict[str, list]:
        """构建 {norm_symbol: [stop_orders]} 映射"""
        stop_map: dict[str, list] = {}
        for order in open_orders:
            if order.order_type in ('STOP_MARKET', 'STOP'):
                sym = order.symbol
                stop_map.setdefault(sym, []).append(order)
        return stop_map

    async def _fix_naked_position(self, pos, alloc) -> bool:
        """为裸仓补设保护性止损"""
        try:
            risk_pct = DEFAULT_STOP_PCT
            if alloc:
                risk_pct = alloc.get("risk_percent", 2.0) / 100

            entry = pos.entry_price
            if entry <= 0:
                return False

            from .models import PositionSide
            if pos.side == PositionSide.LONG:
                sl_price = round(entry * (1 - risk_pct), 2)
                sl_side = 'sell'
            else:
                sl_price = round(entry * (1 + risk_pct), 2)
                sl_side = 'buy'

            # 转换 symbol 格式: SOLUSDT:USDT → SOL/USDT:USDT
            ccxt_sym = pos.symbol
            if ':' in ccxt_sym and '/' not in ccxt_sym:
                base_quote = ccxt_sym.split(':')[0]
                settle = ccxt_sym.split(':')[1]
                for quote in ['USDT', 'BUSD', 'USDC']:
                    if base_quote.endswith(quote):
                        base = base_quote[:-len(quote)]
                        ccxt_sym = f"{base}/{quote}:{settle}"
                        break
            result = self.executor.exchange.create_order(
                symbol=ccxt_sym, type='stop_market',
                side=sl_side, amount=pos.quantity,
                params={'stopPrice': sl_price, 'reduceOnly': True}
            )
            order_id = result.get('id', 'unknown') if result else 'no-result'
            # 记录已补止损（避免 Demo 模式下重复下单）
            self._sl_placed[pos.symbol] = sl_price
            logger.warning(
                f"[巡检] 裸仓修复: {pos.symbol} 补设止损 {sl_price}"
                f" (入场={entry}, risk={risk_pct*100:.1f}%,"
                f" order_id={order_id})")
            return True
        except Exception as e:
            logger.error(f"[巡检] 裸仓修复失败 {pos.symbol}: {e}")
            return False

    async def _check_hold_timeout(
        self, pos, alloc, bot_id: Optional[str]
    ) -> bool:
        """检查持仓是否超时"""
        max_hours = 48
        if alloc:
            max_hours = alloc.get("max_hold_hours", 48)
        if max_hours <= 0:
            return False

        first_seen = self._position_first_seen.get(pos.symbol)
        if not first_seen:
            return False

        held_hours = (
            datetime.now(timezone.utc) - first_seen
        ).total_seconds() / 3600

        if held_hours >= max_hours:
            logger.warning(
                f"[巡检] 超时平仓: {pos.symbol} "
                f"持仓 {held_hours:.1f}h > 限制 {max_hours}h")
            try:
                await self.executor.close_position(pos.symbol)
                return True
            except Exception as e:
                logger.error(
                    f"[巡检] 超时平仓失败 {pos.symbol}: {e}")
        return False

    async def _check_trailing_stop(
        self, pos, alloc, stop_orders: Optional[list]
    ) -> bool:
        """移动止损检查"""
        trigger_pct = alloc.get("trailing_stop_trigger", 1.0) / 100
        entry = pos.entry_price
        mark = pos.mark_price
        if entry <= 0 or mark <= 0:
            return False

        from .models import PositionSide
        is_long = pos.side == PositionSide.LONG
        pnl_pct = (mark - entry) / entry if is_long else (
            entry - mark) / entry

        sym = pos.symbol
        state = self._trailing_state.get(sym, {
            "highest_price": mark if is_long else mark,
            "breakeven_set": False,
        })

        # 未达到触发条件
        if pnl_pct < trigger_pct:
            self._trailing_state[sym] = state
            return False

        # 更新最高/最低价
        if is_long:
            if mark > state["highest_price"]:
                state["highest_price"] = mark
        else:
            if mark < state.get("lowest_price", mark):
                state["lowest_price"] = mark

        # 计算新止损价
        if is_long:
            new_sl = round(
                state["highest_price"] * (1 - trigger_pct), 2)
            # 至少保本
            new_sl = max(new_sl, entry)
        else:
            lowest = state.get("lowest_price", mark)
            new_sl = round(lowest * (1 + trigger_pct), 2)
            new_sl = min(new_sl, entry)

        # 检查是否需要移动（比现有止损更优）
        current_sl = None
        if stop_orders:
            current_sl = stop_orders[0].stop_price

        need_move = False
        if current_sl is None:
            need_move = True
        elif is_long and new_sl > current_sl:
            need_move = True
        elif not is_long and new_sl < current_sl:
            need_move = True

        if not need_move:
            self._trailing_state[sym] = state
            return False

        # 执行移动止损
        try:
            ccxt_sym = self._to_ccxt_symbol(sym)
            sl_side = 'sell' if is_long else 'buy'

            # 取消旧止损单
            if stop_orders:
                for so in stop_orders:
                    try:
                        self.executor.exchange.cancel_order(
                            so.order_id, ccxt_sym)
                    except Exception:
                        pass

            # 下新止损单
            self.executor.exchange.create_order(
                symbol=ccxt_sym, type='stop_market',
                side=sl_side, amount=pos.quantity,
                params={'stopPrice': new_sl, 'reduceOnly': True}
            )
            logger.info(
                f"[巡检] 移动止损: {sym} SL {current_sl} → {new_sl}"
                f" (最高={state.get('highest_price', '?')},"
                f" 盈利={pnl_pct*100:.1f}%)")
            state["breakeven_set"] = True
            self._trailing_state[sym] = state
            return True
        except Exception as e:
            logger.error(f"[巡检] 移动止损失败 {sym}: {e}")
            self._trailing_state[sym] = state
            return False

    def _to_ccxt_symbol(self, norm_sym: str) -> str:
        """SOLUSDT:USDT → SOL/USDT:USDT"""
        if '/' in norm_sym:
            return norm_sym
        if ':' in norm_sym:
            base_quote = norm_sym.split(':')[0]
            settle = norm_sym.split(':')[1]
            for quote in ['USDT', 'BUSD', 'USDC']:
                if base_quote.endswith(quote):
                    base = base_quote[:-len(quote)]
                    return f"{base}/{quote}:{settle}"
        return norm_sym

    def _cleanup_stale_state(self, active_symbols: set):
        """清理已平仓的状态"""
        for sym in list(self._position_first_seen.keys()):
            if sym not in active_symbols:
                del self._position_first_seen[sym]
        for sym in list(self._trailing_state.keys()):
            if sym not in active_symbols:
                del self._trailing_state[sym]
        for sym in list(self._sl_placed.keys()):
            if sym not in active_symbols:
                del self._sl_placed[sym]
