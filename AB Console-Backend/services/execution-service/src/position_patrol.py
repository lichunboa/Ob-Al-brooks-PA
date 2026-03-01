"""持仓健康巡检器 - 60秒周期自动执行

三项巡检：
1. 裸仓检测 + 自动补止损
2. 持仓超时检测 + 自动平仓
3. 移动止损（trailing stop）
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from .config import SHARED_WORKSPACE

logger = logging.getLogger(__name__)

SL_PLACED_FILE = SHARED_WORKSPACE / "sl_placed.json"

# 默认保护性止损百分比
DEFAULT_STOP_PCT = 0.02


class PositionPatrol:

    # V5.7: SCALP 早期止盈参数（2026-02-26 调整）
    # 实盘发现: 0.3% 太早，SOL +1.04% 在 4 分钟被平，手续费吞 97% 利润
    # AB 原则 (stops-risk-scaling.md 2.4): 基于 premise 退出，不是基于时间/固定%
    # 调整: 给交易更多运行空间，至少等 1 根 15m K 线
    SCALP_MIN_SECS = 600     # 最少 10 分钟（~1 根 15m K 线，原 3 分钟太短）
    SCALP_MAX_SECS = 5400    # 最多 90 分钟
    SCALP_MIN_PROFIT = 0.005  # 最低 0.5% 浮盈触发（原 0.3%，覆盖手续费+保留利润）

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
        self._total_scalp_closed: int = 0
        self._total_trailing_moved: int = 0
        # 已补过止损的持仓（避免 Demo 模式下重复下单）— 持久化到文件
        self._sl_placed: dict[str, float] = self._load_sl_placed()
        # V3.4: 补单冷却时间戳（同一品种 5 分钟内不重复补单）
        self._sl_fix_timestamps: dict[str, datetime] = {}
        # V3.4: _sl_placed 连续缺席计数（连续 3 次确认才删除，防 API 偶发超时误删）
        self._sl_absent_count: dict[str, int] = {}

    @staticmethod
    def _load_sl_placed() -> dict[str, float]:
        try:
            if SL_PLACED_FILE.exists():
                return json.loads(SL_PLACED_FILE.read_text())
        except Exception as e:
            logger.warning(f"加载 sl_placed 失败: {e}")
        return {}

    def _save_sl_placed(self):
        try:
            SL_PLACED_FILE.parent.mkdir(parents=True, exist_ok=True)
            SL_PLACED_FILE.write_text(json.dumps(self._sl_placed, indent=2))
        except Exception as e:
            logger.warning(f"保存 sl_placed 失败: {e}")

    def get_status(self) -> dict:
        """返回巡检状态摘要"""
        return {
            "patrol_count": self._patrol_count,
            "totals": {
                "naked_fixed": self._total_naked_fixed,
                "expired_closed": self._total_expired_closed,
                "scalp_closed": self._total_scalp_closed,
                "trailing_moved": self._total_trailing_moved,
            },
            "tracked_positions": len(self._position_first_seen),
            "trailing_active": len(self._trailing_state),
            "recent_history": self._history[-10:],
        }

    async def patrol(self) -> dict:
        """主巡检入口，返回巡检报告"""
        report = {"naked_fixed": 0, "expired_closed": 0,
                  "scalp_closed": 0, "trailing_moved": 0, "errors": []}
        try:
            positions = await self.executor.get_positions()
            if not positions:
                # 不清理 position_bot_map（可能只是 API 超时）
                # 仅清理巡检内部状态
                for sym in list(self._position_first_seen.keys()):
                    del self._position_first_seen[sym]
                self._trailing_state.clear()
                return report

            open_orders = await self.executor.get_open_orders()
            stop_map = self._build_stop_order_map(open_orders)

            # Demo 模式兜底：fetch_open_orders 可能不返回 STOP_MARKET
            # 用 fetch_orders 查最近订单补充 stop_map
            if not stop_map and positions:
                stop_map = self._supplement_stop_map_via_fetch_orders(positions)

            active_symbols = set()

            # V3.1: 修复 used_margin 永远为 0 的 Bug
            # 统计每个 bot 的持仓数量和占用保证金
            bot_stats = {}  # bot_id -> {"count": 0, "margin": 0.0}

            for pos in positions:
                norm_sym = pos.symbol  # 已经是 SOLUSDT:USDT 格式
                active_symbols.add(norm_sym)
                # V3.9.2: 支持多 bot 同品种 — 每个 bot 各计一次持仓
                bot_ids = self.executor.get_position_bot_ids(norm_sym)

                leverage = pos.leverage if pos.leverage > 0 else 1
                position_value = pos.quantity * pos.mark_price
                # 多 bot 共享时均分保证金
                margin_per_bot = (position_value / leverage) / max(len(bot_ids), 1)

                for bid in bot_ids:
                    if bid not in bot_stats:
                        bot_stats[bid] = {"count": 0, "margin": 0.0}
                    bot_stats[bid]["count"] += 1
                    bot_stats[bid]["margin"] += margin_per_bot

            # 更新所有 bot 的状态（包括持仓为 0 的）
            if self.trading_state:
                all_allocs = self.trading_state.get_all_allocations()
                for bot_id in all_allocs:
                    stats = bot_stats.get(bot_id, {"count": 0, "margin": 0.0})
                    self.trading_state.update_bot_positions(
                        bot_id,
                        stats["count"],
                        stats["margin"]
                    )

            for pos in positions:
                norm_sym = pos.symbol  # 已经是 SOLUSDT:USDT 格式
                active_symbols.add(norm_sym)
                bot_id = self.executor.get_position_bot_id(norm_sym)
                alloc = (self.trading_state.get_allocation(bot_id)
                         if bot_id else None)
                # 1. 裸仓检测
                # V3.5: _sl_placed 交叉验证
                # Demo 模式下 stop_market 不可查询，用入场价变化检测：
                # 如果记录的止损价与当前应设止损价偏差 > 1%，
                # 说明持仓已变化（加仓/部分平仓），需重新补挂
                if norm_sym in self._sl_placed:
                    recorded_sl = self._sl_placed[norm_sym]
                    risk_pct = DEFAULT_STOP_PCT
                    if alloc:
                        risk_pct = alloc.get(
                            "risk_percent", 2.0) / 100
                    from .models import PositionSide
                    if pos.side == PositionSide.LONG:
                        expected_sl = pos.entry_price * (1 - risk_pct)
                    else:
                        expected_sl = pos.entry_price * (1 + risk_pct)
                    drift = (abs(recorded_sl - expected_sl)
                             / max(expected_sl, 1))
                    if drift > 0.01:
                        logger.info(
                            f"[巡检] {norm_sym} 入场价变化，"
                            f"止损需更新: 记录={recorded_sl:.2f}"
                            f" 应设={expected_sl:.2f}")
                        del self._sl_placed[norm_sym]
                        self._save_sl_placed()
                if norm_sym not in stop_map and norm_sym not in self._sl_placed:
                    fixed = await self._fix_naked_position(pos, alloc)
                    if fixed:
                        report["naked_fixed"] += 1

                # 1.5 软件止损检查（仅 fallback 模式，原生挂单由交易所执行）
                if norm_sym in self._sl_placed:
                    stopped = await self._check_software_stop(pos)
                    if stopped:
                        report["expired_closed"] += 1
                        continue  # 已平仓

                # 2. 持仓超时检测
                if norm_sym not in self._position_first_seen:
                    self._position_first_seen[norm_sym] = datetime.now(
                        timezone.utc)
                else:
                    exit_type = await self._check_hold_timeout(
                        pos, alloc, bot_id)
                    if exit_type:
                        if exit_type == "scalp":
                            report["scalp_closed"] += 1
                        else:
                            report["expired_closed"] += 1
                        continue

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
        self._total_scalp_closed += report["scalp_closed"]
        self._total_trailing_moved += report["trailing_moved"]

        if (report["naked_fixed"] or report["expired_closed"]
                or report["scalp_closed"]
                or report["trailing_moved"]
                or report["errors"]):
            entry = {
                "time": datetime.now(timezone.utc).isoformat(),
                **report,
            }
            self._history.append(entry)
            if len(self._history) > 20:
                self._history = self._history[-20:]
            logger.info(
                f"[巡检] 裸仓={report['naked_fixed']} "
                f"超时={report['expired_closed']} "
                f"SCALP={report['scalp_closed']} "
                f"移损={report['trailing_moved']}")
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

    def _supplement_stop_map_via_fetch_orders(self, positions) -> dict[str, list]:
        """Demo 模式兜底：通过 fetch_orders 查最近订单中的 STOP_MARKET"""
        stop_map: dict[str, list] = {}
        seen_symbols = set()
        for pos in positions:
            norm_sym = pos.symbol
            if norm_sym in seen_symbols:
                continue
            seen_symbols.add(norm_sym)
            ccxt_sym = self._to_ccxt_symbol(norm_sym)
            try:
                recent = self.executor.exchange.fetch_orders(ccxt_sym, limit=20)
                for o in recent:
                    otype = str(o.get('type', '')).lower()
                    ostatus = str(o.get('status', '')).lower()
                    if otype in ('stop_market', 'stop') and ostatus in ('open', 'new'):
                        # 构造简易对象供后续使用
                        class _StopStub:
                            def __init__(self, oid, sym, sp):
                                self.order_id = oid
                                self.symbol = sym
                                self.stop_price = sp
                                self.order_type = otype.upper()
                        sp = float(o.get('stopPrice') or o.get('info', {}).get('stopPrice') or 0)
                        stop_map.setdefault(norm_sym, []).append(
                            _StopStub(str(o.get('id')), norm_sym, sp))
            except Exception as e:
                logger.debug(f"[巡检] fetch_orders 补充查询失败 {norm_sym}: {e}")
        if stop_map:
            logger.info(f"[巡检] Demo 模式 fetch_orders 补充发现止损单: {list(stop_map.keys())}")
        return stop_map

    async def _fix_naked_position(self, pos, alloc) -> bool:
        """为裸仓设置软件止损（记录止损价，由巡检轮询执行）"""
        try:
            # V3.4: 冷却期检查 — 同一品种 5 分钟内不重复
            now = datetime.now(timezone.utc)
            last_fix = self._sl_fix_timestamps.get(pos.symbol)
            if last_fix and (now - last_fix).total_seconds() < 300:
                return False

            risk_pct = DEFAULT_STOP_PCT
            if alloc:
                risk_pct = alloc.get("risk_percent", 2.0) / 100

            entry = pos.entry_price
            if entry <= 0:
                return False

            from .models import PositionSide
            if pos.side == PositionSide.LONG:
                sl_price = round(entry * (1 - risk_pct), 2)
            else:
                sl_price = round(entry * (1 + risk_pct), 2)

            # V3.5: Demo 模式下不下条件委托，只记录止损价
            # 由巡检主循环 _check_software_stop 轮询执行
            # TODO(真实账户): 恢复 exchange.create_order(type='stop_market') 原生条件委托
            self._sl_placed[pos.symbol] = sl_price
            self._sl_fix_timestamps[pos.symbol] = now
            self._save_sl_placed()
            logger.warning(
                f"[巡检] 软件止损已设: {pos.symbol} "
                f"止损={sl_price} (入场={entry},"
                f" risk={risk_pct*100:.1f}%)")
            return True
        except Exception as e:
            logger.error(
                f"[巡检] 止损设置失败 {pos.symbol}: {e}")
            return False

    async def _check_software_stop(self, pos) -> bool:
        """检查软件止损是否触发，触发则市价平仓"""
        sl_price = self._sl_placed.get(pos.symbol)
        if not sl_price:
            return False

        from .models import PositionSide
        triggered = False
        if pos.side == PositionSide.LONG:
            triggered = pos.mark_price <= sl_price
        else:
            triggered = pos.mark_price >= sl_price

        if not triggered:
            return False

        ccxt_sym = self._to_ccxt_symbol(pos.symbol)
        sl_side = 'sell' if pos.side == PositionSide.LONG else 'buy'
        try:
            result = self.executor.exchange.create_order(
                symbol=ccxt_sym, type='market',
                side=sl_side, amount=pos.quantity,
                params={'reduceOnly': True}
            )
            logger.warning(
                f"[巡检] 软件止损触发: {pos.symbol} "
                f"mark={pos.mark_price:.2f} <= "
                f"sl={sl_price:.2f}, 已市价平仓"
                f" qty={pos.quantity}")
            # 清理记录
            del self._sl_placed[pos.symbol]
            self._save_sl_placed()
            # V3.8 P2: 记录进化 + bot PNL + 清理持仓
            bot_id = self.executor.get_position_bot_id(
                pos.symbol)
            if bot_id:
                # 计算 USDT 盈亏
                if pos.side == PositionSide.LONG:
                    pnl_usdt = (pos.mark_price - pos.entry_price) * pos.quantity
                else:
                    pnl_usdt = (pos.entry_price - pos.mark_price) * pos.quantity
                # 记录 bot 级日盈亏
                self.executor.risk_manager.record_bot_pnl(bot_id, pnl_usdt)
                # V7.0: 进化系统暂停使用
                # try:
                #     from .evolution_manager import get_evolution_manager
                #     evo = get_evolution_manager()
                #     evo.record_trade_result(...)
                # except Exception as e:
                #     logger.warning(f"[巡检] 进化记录失败: {e}")
                self.executor.unregister_position(
                    pos.symbol, bot_id)
            return True
        except Exception as e:
            logger.error(
                f"[巡检] 软件止损平仓失败 {pos.symbol}: {e}")
            return False

    async def _check_hold_timeout(
        self, pos, alloc, bot_id: Optional[str]
    ) -> str:
        """检查持仓超时/SCALP/僵尸单, 返回退出类型或空串"""
        max_hours = 48
        if alloc:
            max_hours = alloc.get("max_hold_hours", 48)

        first_seen = self._position_first_seen.get(pos.symbol)
        if not first_seen:
            return ""

        duration_secs = (
            datetime.now(timezone.utc) - first_seen
        ).total_seconds()
        held_hours = duration_secs / 3600

        # 1. 硬性最大持仓时间检查
        if max_hours > 0 and held_hours >= max_hours:
            logger.warning(
                f"[巡检] 超时平仓: {pos.symbol} "
                f"持仓 {held_hours:.1f}h > 限制 {max_hours}h")
            try:
                await self.executor.close_position(pos.symbol)
                return "timeout"
            except Exception as e:
                logger.error(
                    f"[巡检] 超时平仓失败 {pos.symbol}: {e}")
            return ""

        # 2. SCALP/ZOMBIE — V5.8 已禁用
        # 原因: AB 从不用时间判断出场 (stops-risk-scaling.md 2.4)
        # 出场决策由 Agent 15min PA 巡检执行（基于价格行为结构）
        # 代码层只保留: 止损保护 + trailing stop + 日亏损限额 + 硬性最大持仓时间
        #
        # 旧逻辑（保留参考）:
        # - SCALP: 10min-90min 内浮盈>=0.5% 自动平仓 → 问题: 切断好交易利润
        # - ZOMBIE: >20min 且近盈亏平衡 → 问题: 正常回调被误杀
        # 现在这两种情况由 Agent 巡检 cron (每15min) 用 PA 分析决策

        return ""

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
        elif sym in self._sl_placed:
            # Demo 模式兜底：用 _sl_placed 记录的止损价
            current_sl = self._sl_placed[sym]

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

        # V3.6: 纯软件移动止损（Demo 模式下不下条件委托）
        # 直接更新 _sl_placed，由 _check_software_stop 轮询执行
        # TODO(真实账户): 恢复 exchange.create_order(type='stop_market') 原生条件委托
        try:
            self._sl_placed[sym] = new_sl
            self._save_sl_placed()
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
        """清理已平仓的状态（含 position_bot_map 同步）"""
        for sym in list(self._position_first_seen.keys()):
            if sym not in active_symbols:
                del self._position_first_seen[sym]
        for sym in list(self._trailing_state.keys()):
            if sym not in active_symbols:
                del self._trailing_state[sym]
        # V3.4: _sl_placed 连续 3 次确认才删除，防止 API 偶发超时误删
        sl_changed = False
        for sym in list(self._sl_placed.keys()):
            if sym not in active_symbols:
                count = self._sl_absent_count.get(sym, 0) + 1
                self._sl_absent_count[sym] = count
                if count >= 3:
                    del self._sl_placed[sym]
                    del self._sl_absent_count[sym]
                    sl_changed = True
            else:
                self._sl_absent_count.pop(sym, None)
        if sl_changed:
            self._save_sl_placed()
        # 清理冷却时间戳（已平仓的品种）
        for sym in list(self._sl_fix_timestamps.keys()):
            if sym not in active_symbols:
                del self._sl_fix_timestamps[sym]
        # 同步清理 position_bot_map：仅当 active_symbols 非空时才清理
        # 防止 API 超时导致误删所有映射
        if active_symbols and hasattr(self.executor, '_position_bot_map'):
            stale = [sym for sym in self.executor._position_bot_map
                     if sym not in active_symbols]
            if stale:
                for sym in stale:
                    del self.executor._position_bot_map[sym]
                self.executor._save_position_bot_map()
                logger.debug(f"[巡检] 清理 position_bot_map 已平仓: {stale}")
