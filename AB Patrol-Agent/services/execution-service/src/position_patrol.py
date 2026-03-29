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
from typing import Any, Optional

from .config import SHARED_WORKSPACE

logger = logging.getLogger(__name__)

SL_PLACED_FILE = SHARED_WORKSPACE / "sl_placed.json"
JOURNAL_FILE = Path(__file__).resolve().parents[3] / "data" / "pa_trader" / "journal" / "execution_log.jsonl"
RUNTIME_STATE_FILE = Path(__file__).resolve().parents[3] / "data" / "pa_trader" / "state" / "runtime_state.json"


class PositionPatrol:

    # V5.7: SCALP 早期止盈参数（2026-02-26 调整）
    # 实盘发现: 0.3% 太早，SOL +1.04% 在 4 分钟被平，手续费吞 97% 利润
    # AB 原则 (stops-risk-scaling.md 2.4): 基于 premise 退出，不是基于时间/固定%
    # 调整: 给交易更多运行空间，至少等 1 根 15m K 线
    SCALP_MIN_SECS = 600     # 最少 10 分钟（~1 根 15m K 线，原 3 分钟太短）
    SCALP_MAX_SECS = 5400    # 最多 90 分钟
    SCALP_MIN_PROFIT = 0.005  # 最低 0.5% 浮盈触发（原 0.3%，覆盖手续费+保留利润）
    ENTRY_ORDER_STALE_SECS = 1800  # 无持仓的首仓挂单最多保留 30 分钟，避免旧候选无限悬挂

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
        # 最近成功开仓的保护单缓存，避免每轮重复扫 journal。
        self._protection_targets_cache: dict[tuple[str, str, str, str], dict[str, float | None]] = {}
        self._protection_targets_mtime: float = 0.0
        self._protection_runtime_mtime: float = 0.0

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

    @staticmethod
    def _protection_key(pos) -> str:
        """同品种多仓时优先按 position_id 做保护单冷却键。"""
        return str(getattr(pos, "position_id", "") or getattr(pos, "symbol", ""))

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
            open_orders = await self.executor.get_open_orders()
            if not positions:
                # 不清理 position_bot_map（可能只是 API 超时）
                # 仅清理巡检内部状态
                for sym in list(self._position_first_seen.keys()):
                    del self._position_first_seen[sym]
                self._trailing_state.clear()
                # 无持仓时仍要继续清理残留委托单。
                # 否则 Binance Demo 上旧首仓挂单会永久残留，持续阻塞同品种新信号。
                stale_cleaned = await self._cleanup_stale_orders(set(), open_orders)
                if stale_cleaned > 0:
                    report["stale_orders_cleaned"] = stale_cleaned
                return report

            stop_map = self._build_stop_order_map(open_orders)
            take_profit_map = self._build_take_profit_order_map(open_orders)

            # Demo 模式兜底：fetch_open_orders 可能漏掉 reduce-only 条件单。
            if positions and (not stop_map or not take_profit_map):
                extra_stop_map, extra_take_profit_map = self._supplement_reduce_only_maps_via_fetch_orders(positions)
                if extra_stop_map:
                    stop_map = extra_stop_map
                if extra_take_profit_map:
                    take_profit_map = extra_take_profit_map

            active_symbols = set()

            # V3.1: 修复 used_margin 永远为 0 的 Bug
            # 统计每个 bot 的持仓数量和占用保证金
            bot_stats = {}  # bot_id -> {"count": 0, "margin": 0.0}

            for pos in positions:
                norm_sym = pos.symbol
                # 统一转换成 position_bot_map 使用的 key，避免外汇现货这类无 `:USDT`
                # 后缀的持仓被误判成“已平仓残留”而被清理掉。
                active_symbols.add(self.executor._norm_position_key(norm_sym))
                # V3.9.2: 支持多 bot 同品种 — 每个 bot 各计一次持仓
                bot_ids = self.executor.get_position_bot_ids(norm_sym)

                leverage = pos.leverage if pos.leverage > 0 else 1
                position_value = self.executor.quantity_to_account_notional(
                    norm_sym,
                    pos.quantity,
                    pos.mark_price,
                )
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
                has_native_stop = bool(getattr(pos, "native_stop_loss", False) and getattr(pos, "stop_loss", None))
                has_native_take_profit = bool(getattr(pos, "native_take_profit", False) and getattr(pos, "take_profit", None))
                # 1. 裸仓检测
                # V3.5: _sl_placed 交叉验证
                # Demo 模式下 stop_market 不可查询，用入场价变化检测：
                # 如果记录的止损价与当前应设止损价偏差 > 1%，
                # 说明持仓已变化（加仓/部分平仓），需重新补挂
                if norm_sym in self._sl_placed:
                    recorded_sl = self._sl_placed[norm_sym]
                    targets = self._lookup_protection_targets(pos)
                    expected_sl = float(targets.get("stop_loss") or 0) or None
                    if expected_sl is None:
                        logger.info(f"[巡检] {norm_sym} 未找到同源止损模板，清理旧的软件止损缓存")
                        del self._sl_placed[norm_sym]
                        self._save_sl_placed()
                    else:
                        drift = (abs(recorded_sl - expected_sl) / max(abs(expected_sl), 1e-8))
                        if drift <= 0.01:
                            expected_sl = None
                    if expected_sl is not None:
                        logger.info(
                            f"[巡检] {norm_sym} 入场价变化，"
                            f"止损需更新: 记录={recorded_sl:.2f}"
                            f" 应设={expected_sl:.2f}")
                        del self._sl_placed[norm_sym]
                        self._save_sl_placed()
                if self.executor.exchange_name == "ctrader":
                    # cTrader 以持仓原生 SL/TP 为准，不能让旧的软件止损缓存短路原生补挂。
                    needs_stop_fix = not has_native_stop
                else:
                    needs_stop_fix = (not has_native_stop and norm_sym not in stop_map and norm_sym not in self._sl_placed)
                needs_take_profit_fix = (not has_native_take_profit and norm_sym not in take_profit_map)
                if needs_stop_fix or needs_take_profit_fix:
                    fixed = await self._fix_position_protection(pos, alloc, needs_stop_fix, needs_take_profit_fix)
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

            # V7.1: 自动清理残留的 reduce_only 委托单
            stale_cleaned = await self._cleanup_stale_orders(active_symbols, open_orders)
            if stale_cleaned > 0:
                report["stale_orders_cleaned"] = stale_cleaned

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
            # Binance Demo 的条件单查询经常漏掉交易所侧条件单。
            # execution.get_open_orders() 会补上本地注册的保护单 stub，
            # 巡检层必须把这些 stub 也视作已存在的止损单，否则会每轮重复补挂。
            if order.order_type in ('STOP_MARKET', 'STOP'):
                sym = order.symbol
                stop_map.setdefault(sym, []).append(order)
        return stop_map

    def _build_take_profit_order_map(
        self, open_orders: list
    ) -> dict[str, list]:
        """构建 {norm_symbol: [take_profit_orders]} 映射"""
        take_profit_map: dict[str, list] = {}
        for order in open_orders:
            # 同上：本地注册的 reduce-only 止盈 stub 也要参与巡检映射，
            # 否则 patrol 会误判成“没有止盈单”，不断重复补挂/改单。
            if order.order_type in ('TAKE_PROFIT_MARKET', 'TAKE_PROFIT'):
                sym = order.symbol
                take_profit_map.setdefault(sym, []).append(order)
        return take_profit_map

    def _supplement_reduce_only_maps_via_fetch_orders(self, positions) -> tuple[dict[str, list], dict[str, list]]:
        """Demo 模式兜底：通过 fetch_orders 查最近订单中的 reduce-only 止损/止盈。"""
        stop_map: dict[str, list] = {}
        take_profit_map: dict[str, list] = {}
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
                    if ostatus not in ('open', 'new'):
                        continue

                    if otype in ('stop_market', 'stop'):
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
                    elif otype in ('take_profit_market', 'take_profit'):
                        class _TakeProfitStub:
                            def __init__(self, oid, sym, sp):
                                self.order_id = oid
                                self.symbol = sym
                                self.stop_price = sp
                                self.order_type = otype.upper()
                        sp = float(o.get('stopPrice') or o.get('info', {}).get('stopPrice') or 0)
                        take_profit_map.setdefault(norm_sym, []).append(
                            _TakeProfitStub(str(o.get('id')), norm_sym, sp))
            except Exception as e:
                logger.debug(f"[巡检] fetch_orders 补充查询失败 {norm_sym}: {e}")
        if stop_map or take_profit_map:
            logger.info(
                "[巡检] Demo 模式 fetch_orders 补充发现保护单: stop=%s tp=%s",
                list(stop_map.keys()),
                list(take_profit_map.keys()),
            )
        return stop_map, take_profit_map

    @staticmethod
    def _normalize_cache_marker(value: object) -> str:
        """统一保护价缓存键的文本标识。"""
        return str(value or "").strip().lower()

    @staticmethod
    def _normalize_trade_side(value: object) -> str:
        text = str(value or "").strip().upper()
        if text in {"BUY", "LONG"} or text.endswith("LONG"):
            return "BUY"
        if text in {"SELL", "SHORT"} or text.endswith("SHORT"):
            return "SELL"
        return ""

    @staticmethod
    def _to_price(value: object) -> float | None:
        try:
            price = float(value or 0)
        except (TypeError, ValueError):
            return None
        return price if price > 0 else None

    def _cache_protection_targets(
        self,
        cache: dict[tuple[str, str, str, str], dict[str, float | None]],
        *,
        symbol: object,
        side: object,
        strategy: object,
        timeframe: object,
        entry_price: object,
        stop_loss: object,
        take_profit: object,
    ) -> None:
        normalized_symbol = self.executor._norm_position_key(str(symbol or "").upper().strip())
        normalized_side = self._normalize_trade_side(side)
        if not normalized_symbol or normalized_side not in {"BUY", "SELL"}:
            return
        payload_entry = {
            "entry_price": self._to_price(entry_price),
            "stop_loss": self._to_price(stop_loss),
            "take_profit": self._to_price(take_profit),
            "strategy": self._normalize_cache_marker(strategy) or None,
            "timeframe": self._normalize_cache_marker(timeframe) or None,
        }
        if payload_entry["stop_loss"] is None and payload_entry["take_profit"] is None:
            return
        strategy_key = payload_entry["strategy"] or ""
        timeframe_key = payload_entry["timeframe"] or ""
        cache[(normalized_symbol, normalized_side, strategy_key, timeframe_key)] = payload_entry
        cache[(normalized_symbol, normalized_side, strategy_key, "")] = payload_entry
        cache[(normalized_symbol, normalized_side, "", timeframe_key)] = payload_entry
        cache[(normalized_symbol, normalized_side, "", "")] = payload_entry

    @staticmethod
    def _protection_geometry_valid(
        side: object,
        entry_price: object,
        stop_loss: object | None = None,
        take_profit: object | None = None,
    ) -> bool:
        direction = str(side or "").strip().upper()
        entry = PositionPatrol._to_price(entry_price) or 0.0
        stop = PositionPatrol._to_price(stop_loss) or 0.0
        target = PositionPatrol._to_price(take_profit) or 0.0
        if direction in {"LONG"}:
            direction = "BUY"
        elif direction in {"SHORT"}:
            direction = "SELL"
        if entry <= 0 or direction not in {"BUY", "SELL"}:
            return False
        if stop > 0:
            if direction == "BUY" and not stop < entry:
                return False
            if direction == "SELL" and not stop > entry:
                return False
        if target > 0:
            if direction == "BUY" and not target > entry:
                return False
            if direction == "SELL" and not target < entry:
                return False
        return stop > 0 or target > 0

    @staticmethod
    def _translate_protection_targets(
        side: object,
        live_entry: object,
        template_entry: object,
        stop_loss: object | None,
        take_profit: object | None,
    ) -> dict[str, float | None]:
        direction = str(side or "").strip().upper()
        if direction == "LONG":
            direction = "BUY"
        elif direction == "SHORT":
            direction = "SELL"
        live_entry_price = PositionPatrol._to_price(live_entry) or 0.0
        template_entry_price = PositionPatrol._to_price(template_entry) or 0.0
        stop = PositionPatrol._to_price(stop_loss) or 0.0
        target = PositionPatrol._to_price(take_profit) or 0.0
        translated_stop: float | None = None
        translated_target: float | None = None
        if live_entry_price <= 0 or template_entry_price <= 0 or direction not in {"BUY", "SELL"}:
            return {"stop_loss": None, "take_profit": None}
        if direction == "BUY":
            if stop > 0 and stop < template_entry_price:
                translated_stop = live_entry_price - (template_entry_price - stop)
            if target > 0 and target > template_entry_price:
                translated_target = live_entry_price + (target - template_entry_price)
        else:
            if stop > 0 and stop > template_entry_price:
                translated_stop = live_entry_price + (stop - template_entry_price)
            if target > 0 and target < template_entry_price:
                translated_target = live_entry_price - (template_entry_price - target)
        return {
            "stop_loss": translated_stop if translated_stop and translated_stop > 0 else None,
            "take_profit": translated_target if translated_target and translated_target > 0 else None,
        }

    def _refresh_protection_targets_cache(self) -> None:
        """从执行日志刷新最近成功开仓的 SL/TP 目标。"""
        try:
            journal_mtime = JOURNAL_FILE.stat().st_mtime
        except FileNotFoundError:
            journal_mtime = 0.0
        except Exception as exc:
            logger.debug(f"[巡检] 读取保护单 journal mtime 失败: {exc}")
            journal_mtime = self._protection_targets_mtime

        try:
            runtime_mtime = RUNTIME_STATE_FILE.stat().st_mtime
        except FileNotFoundError:
            runtime_mtime = 0.0
        except Exception as exc:
            logger.debug(f"[巡检] 读取 runtime_state mtime 失败: {exc}")
            runtime_mtime = self._protection_runtime_mtime

        if journal_mtime <= self._protection_targets_mtime and runtime_mtime <= self._protection_runtime_mtime:
            return

        cache: dict[tuple[str, str, str, str], dict[str, float | None]] = {}
        if journal_mtime > 0:
            with JOURNAL_FILE.open("r", encoding="utf-8") as handle:
                for raw_line in handle:
                    line = raw_line.strip()
                    if not line:
                        continue
                    try:
                        payload = json.loads(line)
                    except Exception:
                        continue
                    if payload.get("type") != "OPEN_ORDER":
                        continue
                    if not payload.get("success") and str(payload.get("status") or "").upper() != "DUPLICATE_SKIPPED":
                        continue
                    snapshot = payload.get("action_snapshot") if isinstance(payload.get("action_snapshot"), dict) else {}
                    symbol = str(snapshot.get("symbol") or "").upper()
                    side = self._normalize_trade_side(snapshot.get("side"))
                    if not symbol or side not in {"BUY", "SELL"}:
                        continue
                    self._cache_protection_targets(
                        cache,
                        symbol=symbol,
                        side=side,
                        strategy=snapshot.get("strategy"),
                        timeframe=(
                            snapshot.get("signal_timeframe")
                            or snapshot.get("management_timeframe")
                            or snapshot.get("reference_timeframe")
                            or snapshot.get("timeframe")
                        ),
                        entry_price=snapshot.get("entry_price") or snapshot.get("entry"),
                        stop_loss=snapshot.get("stop_loss") or snapshot.get("sl"),
                        take_profit=snapshot.get("take_profit") or snapshot.get("tp"),
                    )
        if runtime_mtime > 0:
            try:
                runtime_payload = json.loads(RUNTIME_STATE_FILE.read_text(encoding="utf-8"))
                position_seeds = runtime_payload.get("position_seeds") if isinstance(runtime_payload, dict) else {}
                if isinstance(position_seeds, dict):
                    for seed in position_seeds.values():
                        if not isinstance(seed, dict):
                            continue
                        self._cache_protection_targets(
                            cache,
                            symbol=seed.get("symbol"),
                            side=seed.get("direction") or seed.get("side"),
                            strategy=seed.get("strategy"),
                            timeframe=(
                                seed.get("signal_timeframe")
                                or seed.get("management_timeframe")
                                or seed.get("reference_timeframe")
                                or seed.get("timeframe")
                            ),
                            entry_price=seed.get("entry_price") or seed.get("entry"),
                            stop_loss=seed.get("stop_loss") or seed.get("sl"),
                            take_profit=seed.get("take_profit") or seed.get("tp"),
                        )
            except Exception as exc:
                logger.warning(f"[巡检] 读取 runtime_state 保护模板失败: {exc}")
        self._protection_targets_cache = cache
        self._protection_targets_mtime = journal_mtime
        self._protection_runtime_mtime = runtime_mtime

    def _lookup_protection_targets(self, pos) -> dict[str, float | None]:
        """返回当前持仓最近一次成功开仓的保护单目标。"""
        self._refresh_protection_targets_cache()
        side = self._normalize_trade_side(getattr(pos, "side", ""))
        symbol = self.executor._norm_position_key(str(pos.symbol).upper())
        strategy = self._normalize_cache_marker(getattr(pos, "strategy", None))
        timeframe = self._normalize_cache_marker(getattr(pos, "timeframe", None))
        lookup_keys = [
            (symbol, side, strategy, timeframe),
            (symbol, side, strategy, ""),
            (symbol, side, "", timeframe),
            (symbol, side, "", ""),
        ]
        for key in lookup_keys:
            matched = self._protection_targets_cache.get(key)
            if isinstance(matched, dict):
                return matched
        return {}

    async def _fix_position_protection(self, pos, alloc, needs_stop_fix: bool, needs_take_profit_fix: bool) -> bool:
        """为缺保护单的持仓补挂原生止损/止盈。"""
        try:
            # V3.4: 冷却期检查 — 同一品种 5 分钟内不重复
            now = datetime.now(timezone.utc)
            protection_key = self._protection_key(pos)
            last_fix = self._sl_fix_timestamps.get(protection_key)
            if last_fix and (now - last_fix).total_seconds() < 300:
                return False

            entry = pos.entry_price
            if entry <= 0:
                return False

            targets = self._lookup_protection_targets(pos)
            template_entry = self._to_price(targets.get("entry_price"))
            sl_price = self._to_price(targets.get("stop_loss"))
            tp_price = self._to_price(targets.get("take_profit"))
            side = self._normalize_trade_side(getattr(pos, "side", ""))
            translated = self._translate_protection_targets(side, entry, template_entry, sl_price, tp_price)
            template_entry_mismatch = bool(
                template_entry
                and abs(template_entry - entry) > max(abs(entry) * 1e-6, 1e-8)
            )
            if template_entry_mismatch:
                if needs_stop_fix and translated.get("stop_loss") is not None:
                    logger.info(
                        "[巡检] 保护模板与真实成交价不一致，平移止损后补挂: %s template_entry=%s live_entry=%s old_sl=%s new_sl=%s",
                        pos.symbol,
                        template_entry,
                        entry,
                        sl_price,
                        translated.get("stop_loss"),
                    )
                    sl_price = translated.get("stop_loss")
                if needs_take_profit_fix and translated.get("take_profit") is not None:
                    logger.info(
                        "[巡检] 保护模板与真实成交价不一致，平移止盈后补挂: %s template_entry=%s live_entry=%s old_tp=%s new_tp=%s",
                        pos.symbol,
                        template_entry,
                        entry,
                        tp_price,
                        translated.get("take_profit"),
                    )
                    tp_price = translated.get("take_profit")

            if needs_stop_fix and sl_price is None:
                logger.warning(
                    "[巡检] 缺少同源止损模板，跳过补挂: %s strategy=%s timeframe=%s",
                    pos.symbol,
                    getattr(pos, "strategy", None),
                    getattr(pos, "timeframe", None),
                )
                needs_stop_fix = False
            if needs_take_profit_fix and tp_price is None:
                logger.warning(
                    "[巡检] 缺少同源止盈模板，跳过补挂: %s strategy=%s timeframe=%s",
                    pos.symbol,
                    getattr(pos, "strategy", None),
                    getattr(pos, "timeframe", None),
                )
                needs_take_profit_fix = False
            if needs_stop_fix and not self._protection_geometry_valid(side, entry, stop_loss=sl_price):
                logger.warning(
                    "[巡检] 止损模板与真实持仓几何不一致，跳过补挂: %s entry=%s sl=%s template_entry=%s",
                    pos.symbol,
                    entry,
                    sl_price,
                    template_entry,
                )
                needs_stop_fix = False
            if needs_take_profit_fix and not self._protection_geometry_valid(side, entry, take_profit=tp_price):
                logger.warning(
                    "[巡检] 止盈模板与真实持仓几何不一致，跳过补挂: %s entry=%s tp=%s template_entry=%s",
                    pos.symbol,
                    entry,
                    tp_price,
                    template_entry,
                )
                needs_take_profit_fix = False
            if not needs_stop_fix and not needs_take_profit_fix:
                return False

            if self.executor.exchange_name == "ctrader":
                native_result = self.executor.exchange.modify_position(
                    pos.symbol,
                    stop_loss=sl_price if needs_stop_fix else pos.stop_loss,
                    take_profit=tp_price if needs_take_profit_fix else pos.take_profit,
                    position_id=getattr(pos, "position_id", None),
                )
                if native_result.get("success"):
                    if needs_stop_fix and pos.symbol in self._sl_placed:
                        del self._sl_placed[pos.symbol]
                        self._save_sl_placed()
                    self._sl_fix_timestamps[protection_key] = now
                    logger.warning(
                        f"[巡检] cTrader 原生保护单已设: {pos.symbol} "
                        f"sl={sl_price if needs_stop_fix else '-'} "
                        f"tp={tp_price if needs_take_profit_fix else '-'}"
                    )
                    return True

                if needs_stop_fix and sl_price is not None:
                    # 仅在原生止损失败时保留软件兜底。
                    self._sl_placed[pos.symbol] = sl_price
                    self._save_sl_placed()
                self._sl_fix_timestamps[protection_key] = now
                logger.warning(
                    f"[巡检] cTrader 原生保护单失败: {pos.symbol} "
                    f"error={native_result.get('message') or native_result.get('error')}"
                )
                return bool(needs_stop_fix)

            stop_ok = True
            tp_ok = True
            if needs_stop_fix and sl_price is not None:
                stop_result = await self.executor.modify_stop_loss(pos.symbol, sl_price)
                stop_ok = bool(stop_result.get("success"))
                if stop_ok:
                    logger.warning(f"[巡检] 原生止损已设: {pos.symbol} 止损={sl_price}")
                else:
                    self._sl_placed[pos.symbol] = sl_price
                    self._save_sl_placed()
                    logger.warning(
                        f"[巡检] 原生止损失败，回退软件止损: {pos.symbol} "
                        f"止损={sl_price} error={stop_result.get('message') or stop_result.get('error')}"
                    )
            if needs_take_profit_fix and tp_price is not None:
                tp_result = await self.executor.modify_take_profit(pos.symbol, tp_price)
                tp_ok = bool(tp_result.get("success"))
                if tp_ok:
                    logger.warning(f"[巡检] 原生止盈已设: {pos.symbol} 止盈={tp_price}")
                else:
                    logger.warning(
                        f"[巡检] 原生止盈失败: {pos.symbol} "
                        f"止盈={tp_price} error={tp_result.get('message') or tp_result.get('error')}"
                    )
            self._sl_fix_timestamps[protection_key] = now
            return stop_ok or tp_ok
        except Exception as e:
            logger.error(
                f"[巡检] 保护单设置失败 {pos.symbol}: {e}")
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

            # V7.1: 清理该品种所有委托单（修复 Testnet reduce_only 残留问题）
            try:
                await self.executor.cancel_all_orders(pos.symbol)
                logger.info(f"[巡检] 软件止损后取消 {pos.symbol} 所有挂单")
            except Exception as e:
                logger.warning(f"[巡检] 取消挂单失败 {pos.symbol}: {e}")

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
        if getattr(pos, "stop_loss", None):
            current_sl = pos.stop_loss
        elif stop_orders:
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

        try:
            native_result = await self.executor.modify_stop_loss(sym, new_sl)
            if native_result.get("success"):
                if sym in self._sl_placed:
                    del self._sl_placed[sym]
                    self._save_sl_placed()
            else:
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

    async def _cleanup_stale_orders(self, active_symbols: set, open_orders: list) -> int:
        """
        自动清理残留委托单。

        规则：
        1. 没有对应持仓的保护单（reduce_only / SL / TP）全部清理
        2. 有持仓时，保护单同侧同类型只保留最新一张
        3. 没有持仓的普通首仓挂单，同价同向同类型只保留最新一张
        """
        protection_types = {'STOP_MARKET', 'TAKE_PROFIT_MARKET', 'STOP', 'TAKE_PROFIT'}
        active_symbol_bases = {
            self.executor._norm_symbol_base(str(symbol))
            for symbol in active_symbols
            if symbol
        }

        stale_orders: dict[str, object] = {}
        protection_groups: dict[tuple[str, str, str], list] = {}
        entry_groups: dict[tuple[str, str, str, str, str], list] = {}
        now_ts = datetime.now(timezone.utc).timestamp()

        def _order_ts(order) -> float:
            created_at = getattr(order, "created_at", None)
            if isinstance(created_at, datetime):
                return created_at.timestamp()
            if isinstance(created_at, str) and created_at:
                try:
                    return datetime.fromisoformat(created_at.replace("Z", "+00:00")).timestamp()
                except Exception:
                    return 0.0
            return 0.0

        def _price_key(order) -> str:
            price = getattr(order, "price", None)
            if price in (None, "", 0):
                price = getattr(order, "stop_price", None)
            try:
                return f"{float(price or 0.0):.8f}"
            except Exception:
                return "0.00000000"

        def _protection_kind(order) -> str:
            order_type = str(getattr(order, "order_type", "") or "").upper()
            if "TAKE_PROFIT" in order_type:
                return "TAKE_PROFIT"
            return "STOP"

        for order in open_orders:
            order_id = str(getattr(order, "order_id", "") or "")
            if not order_id:
                continue
            symbol_base = self.executor._norm_symbol_base(str(getattr(order, "symbol", "") or ""))
            order_type = str(getattr(order, "order_type", "") or "").upper()
            is_protection = bool(getattr(order, "reduce_only", False) or order_type in protection_types)

            if is_protection:
                if symbol_base not in active_symbol_bases:
                    stale_orders[order_id] = order
                    continue
                group_key = (
                    symbol_base,
                    str(getattr(order, "side", "") or "").upper(),
                    _protection_kind(order),
                )
                protection_groups.setdefault(group_key, []).append(order)
                continue

            group_key = (
                symbol_base,
                str(getattr(order, "side", "") or "").upper(),
                order_type,
                _price_key(order),
                str(getattr(order, "bot_id", "") or ""),
            )
            entry_groups.setdefault(group_key, []).append(order)

        for grouped_orders in protection_groups.values():
            if len(grouped_orders) <= 1:
                continue
            ordered = sorted(
                grouped_orders,
                key=lambda item: (_order_ts(item), str(getattr(item, "order_id", "") or "")),
                reverse=True,
            )
            for stale in ordered[1:]:
                stale_orders[str(getattr(stale, "order_id", "") or "")] = stale

        for grouped_orders in entry_groups.values():
            ordered = sorted(
                grouped_orders,
                key=lambda item: (_order_ts(item), str(getattr(item, "order_id", "") or "")),
                reverse=True,
            )
            for stale in ordered[1:]:
                stale_orders[str(getattr(stale, "order_id", "") or "")] = stale
            newest = ordered[0]
            if now_ts - _order_ts(newest) >= self.ENTRY_ORDER_STALE_SECS:
                stale_orders[str(getattr(newest, "order_id", "") or "")] = newest

        if not stale_orders:
            return 0

        cleaned = 0
        order_map_dirty = False
        for order in stale_orders.values():
            try:
                ccxt_symbol = self.executor._normalize_symbol_for_ccxt(str(getattr(order, "symbol", "") or ""))
                self.executor._call_with_time_sync(
                    "cancel_stale_order",
                    self.executor.exchange.cancel_order,
                    getattr(order, "order_id"),
                    ccxt_symbol,
                )
                cleaned += 1
                if getattr(order, "reduce_only", False) or str(getattr(order, "order_type", "") or "").upper() in protection_types:
                    self.executor._drop_registered_protection_order(getattr(order, "order_id"))
                if getattr(self.executor, "_order_bot_map", None) and self.executor._order_bot_map.pop(str(getattr(order, "order_id")), None) is not None:
                    order_map_dirty = True
                logger.info(
                    "[巡检] 自动清理残留委托单: %s %s %s",
                    getattr(order, "symbol", ""),
                    getattr(order, "order_type", ""),
                    getattr(order, "order_id", ""),
                )
            except Exception as e:
                logger.warning(
                    "[巡检] 清理失败 %s %s: %s",
                    getattr(order, "symbol", ""),
                    getattr(order, "order_id", ""),
                    e,
                )

        if order_map_dirty:
            self.executor._save_order_bot_map()

        return cleaned
