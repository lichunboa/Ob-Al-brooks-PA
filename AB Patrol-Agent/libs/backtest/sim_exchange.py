"""
SimExchange — 模拟交易所

接收信号 → 创建订单 → 每根 K 线检查 SL/TP → 统计交易结果

与真实交易所的接口:
  真实: trading-service → Binance API
  回测: sim_exchange    → 内存记录
"""

import sys
from importlib import import_module
from pathlib import Path

from .models import PendingOrder, Trade
from .strategy_filters import normalize_management_style

# 周期缩放因子（基于 5m = 1）
TF_SCALE = {"1m": 0.2, "5m": 1, "15m": 3, "30m": 6, "1h": 12}
_RUNTIME_POSITION_MANAGER = None
BROOKS_MANAGED_STYLES = {
    "brooks_swing",
    "brooks_breakout",
    "brooks_mtr_reversal",
    "brooks_hs_reversal",
    "brooks_dt_db_reversal",
    "brooks_climax_reversal",
    "brooks_t4_wedge_pullback",
    "brooks_r3_channel_line_fade",
    "brooks_tr4_daily_tr_fade",
    "brooks_s1_htf_sr_reversal",
    "brooks_s2_micro_channel",
}
BROOKS_REENTRY_STYLES = BROOKS_MANAGED_STYLES | {"brooks_tr_blshs"}
BROOKS_REVERSAL_STYLES = {
    "brooks_mtr_reversal",
    "brooks_climax_reversal",
    "brooks_r3_channel_line_fade",
    "brooks_s1_htf_sr_reversal",
    "brooks_s2_micro_channel",
}
BROOKS_TREND_STYLES = {
    "brooks_swing",
    "brooks_breakout",
    "brooks_t4_wedge_pullback",
}
BROOKS_TR_SCALP_STYLES = {
    "brooks_scalp",
    "brooks_tr_blshs",
    "brooks_tr4_daily_tr_fade",
}


class SimExchange:
    """模拟交易所"""

    def __init__(self, fee_rate: float = 0.0004, max_holding_bars: int = 48):
        """
        Args:
            fee_rate: 手续费率（单边，开仓+平仓各扣一次）
            max_holding_bars: 最大持仓 K 线数（5m 下 48 根 = 4h）
        """
        self.fee_rate = fee_rate
        self.max_holding_bars = max_holding_bars
        self.open_trades: list[Trade] = []
        self.pending_orders: list[PendingOrder] = []
        self.closed_trades: list[Trade] = []
        self.daily_losses: dict[str, int] = {}  # {symbol: 今日止损次数}
        self.strategy_history: dict[str, dict] = {}  # {strategy: {trades, wins, losses, pnl}}
        self.reentry_watch: dict[str, dict] = {}  # {symbol: 被止损后的重入观察窗口}
        self._current_date: str = ""

    @staticmethod
    def _market_cost_profile(symbol: str) -> str:
        """按交易品种归类成本模型。"""
        key = str(symbol or "").strip().upper()
        if key.endswith("USDT") or key.endswith("-USDT-SWAP") or key.endswith("USDTPERP"):
            return "crypto_futures"
        if key in {"XAUUSD", "XAGUSD"}:
            return "metals_cfd"
        if key.startswith("US ") or "TECH" in key or "NAS" in key or "SPX" in key:
            return "index_cfd"
        return "forex_cfd"

    def _cost_rates(self, trade: Trade, *, is_entry: bool, exit_reason: str = "") -> tuple[float, float]:
        """返回 (手续费率, 滑点率)。"""
        profile = str(trade.market_cost_profile or self._market_cost_profile(trade.symbol))
        entry_type = str(trade.entry_type or "STOP").upper()
        profit_exit_type = str(trade.profit_exit_type or "")
        reason = str(exit_reason or "").upper()

        if profile == "crypto_futures":
            maker_fee = min(float(self.fee_rate or 0.0), 0.0002)
            taker_fee = max(float(self.fee_rate or 0.0), maker_fee)
            maker_slippage = 0.00002
            taker_slippage = 0.00008
        elif profile == "forex_cfd":
            maker_fee = 0.00002
            taker_fee = 0.00004
            maker_slippage = 0.00001
            taker_slippage = 0.00003
        elif profile == "metals_cfd":
            maker_fee = 0.00004
            taker_fee = 0.00007
            maker_slippage = 0.00002
            taker_slippage = 0.00005
        else:
            maker_fee = 0.00005
            taker_fee = 0.00008
            maker_slippage = 0.00002
            taker_slippage = 0.00005

        if is_entry:
            is_maker = entry_type == "LIMIT"
        else:
            is_maker = reason == "TP" or (reason == "PARTIAL" and profit_exit_type in {"full_tp", "tp_after_scaleout"})
        if is_maker:
            return maker_fee, maker_slippage
        return taker_fee, taker_slippage

    @staticmethod
    def _update_stop_loss(trade: Trade, new_stop_loss: float) -> None:
        """在真正发生变化时记录止损调整次数。"""
        value = float(new_stop_loss or 0.0)
        if abs(value - float(trade.stop_loss or 0.0)) > 1e-9:
            trade.stop_adjust_count += 1
            trade.stop_loss = value

    @staticmethod
    def _update_take_profit(trade: Trade, new_take_profit: float) -> None:
        """在真正发生变化时记录止盈调整次数。"""
        value = float(new_take_profit or 0.0)
        if abs(value - float(trade.take_profit or 0.0)) > 1e-9:
            trade.take_profit_adjust_count += 1
            trade.take_profit = value

    @staticmethod
    def _style_key(management_style: str) -> str:
        """把历史管理模板名归并成当前族级模板。"""
        return normalize_management_style(management_style)

    def _family_key(self, trade: Trade) -> str:
        """把管理模板归并到更稳定的 Brooks 管理家族。"""
        style_key = self._style_key(trade.management_style)
        if style_key in {"brooks_swing", "brooks_t4_wedge_pullback"}:
            return "trend_recovery"
        if style_key in {
            "brooks_mtr_reversal",
            "brooks_r3_channel_line_fade",
            "brooks_s1_htf_sr_reversal",
            "brooks_s2_micro_channel",
        }:
            return "mtr_reversal"
        if style_key == "brooks_climax_reversal":
            return "climax_reversal"
        if style_key == "brooks_breakout":
            return "breakout_follow"
        if style_key in BROOKS_TR_SCALP_STYLES:
            return "tr_scalp"
        return "other"

    @staticmethod
    def _market_state_key(trade: Trade, market_data: dict | None) -> str:
        """优先读取当前运行态市场状态，否则退回信号生成时记录的状态。"""
        if isinstance(market_data, dict):
            ab_state = market_data.get("ab_state", {}) if isinstance(market_data.get("ab_state"), dict) else {}
            state = str(ab_state.get("state", "") or "").strip().lower()
            if state:
                return state
        return str(trade.market_state or "").strip().lower()

    def _trend_recovery_detail(self, trade: Trade, market_data: dict | None) -> str:
        """把趋势恢复族进一步细分成更贴近 Brooks 的管理情景。"""
        market_state = self._market_state_key(trade, market_data)
        route_style = str(trade.route_style or "").strip().lower()
        prior_leg = str(trade.prior_leg_context or "").strip().lower()
        if (
            market_state in {"tr", "tight_range", "broad_range"}
            or "tr_" in route_style
            or prior_leg in {"tr_second_leg", "tr_recovery"}
        ):
            return "channel_to_tr"
        if trade.strategy in {"高1", "低1"}:
            return "first_entry_be"
        return "second_entry_profit"

    def _trend_recovery_protective_profile(
        self,
        trade: Trade,
        market_data: dict | None,
        *,
        reason: str,
        profit_r: float,
    ) -> dict[str, float | str]:
        """根据趋势恢复单所处阶段，决定保护性 scalp 的节奏。"""
        detail = self._trend_recovery_detail(trade, market_data)
        if detail == "channel_to_tr":
            return {
                "detail": detail,
                "target_r": self._protective_target_r(trade, default_r=0.45),
                "partial_fraction": 0.40 if profit_r > 0.02 and trade.remaining_size > 0.45 else 0.0,
                "protect_r": 0.0,
                "loss_cap_r": -0.06 if profit_r >= 0 else -0.10,
            }
        if detail == "first_entry_be":
            return {
                "detail": detail,
                "target_r": self._protective_target_r(trade, default_r=0.35),
                "partial_fraction": 0.25 if profit_r > 0.05 and trade.remaining_size > 0.50 else 0.0,
                "protect_r": 0.0,
                "loss_cap_r": -0.05 if reason == "WEAK_SCALP" else -0.08,
            }
        return {
            "detail": detail,
            "target_r": self._protective_target_r(trade, default_r=0.80),
            "partial_fraction": 0.25 if profit_r > 0.12 and trade.remaining_size > 0.5 else 0.0,
            "protect_r": 0.10,
            "loss_cap_r": -0.12 if reason == "WEAK_SCALP" else -0.15,
        }

    def _family_protective_profile(
        self,
        trade: Trade,
        market_data: dict | None,
        *,
        reason: str,
        profit_r: float,
    ) -> dict[str, float | str]:
        """按 Brooks 家族统一生成保护性管理 profile。"""
        family_key = self._family_key(trade)
        market_state = self._market_state_key(trade, market_data)
        route_style = str(trade.route_style or "").strip().lower()
        tr_context = market_state in {"tr", "tight_range", "broad_range", "bc"} or "tr_" in route_style
        strong_follow = bool(trade.follow_through or trade.higher_follow_through)
        reversal_confirmed = bool(trade.trendline_break_confirmed or trade.failed_breakout_evidence)
        target_path_clear = bool(trade.target_path_clear)

        if family_key == "trend_recovery":
            return self._trend_recovery_protective_profile(
                trade,
                market_data,
                reason=reason,
                profit_r=profit_r,
            )
        if family_key == "mtr_reversal":
            cautious_context = tr_context or not reversal_confirmed
            return {
                "detail": "reversal_protect",
                "target_r": self._protective_target_r(
                    trade,
                    default_r=0.70 if cautious_context else 0.95,
                ),
                "partial_fraction": 0.30
                if profit_r > (0.08 if cautious_context else 0.16) and trade.remaining_size > 0.55
                else 0.0,
                "protect_r": 0.05 if profit_r > 0.12 else 0.0,
                "loss_cap_r": -0.10 if cautious_context else -0.16,
            }
        if family_key == "climax_reversal":
            cautious_context = tr_context or not reversal_confirmed
            return {
                "detail": "reversal_protect",
                "target_r": self._protective_target_r(
                    trade,
                    default_r=0.60 if cautious_context else 0.85,
                ),
                "partial_fraction": 0.35
                if profit_r > (0.06 if cautious_context else 0.12) and trade.remaining_size > 0.52
                else 0.0,
                "protect_r": 0.03 if profit_r > 0.08 else 0.0,
                "loss_cap_r": -0.08 if cautious_context else -0.12,
            }
        if family_key == "breakout_follow":
            weak_breakout = (not strong_follow) or (not target_path_clear)
            return {
                "detail": "breakout_protect",
                "target_r": self._protective_target_r(
                    trade,
                    default_r=0.60 if weak_breakout else 0.95,
                ),
                "partial_fraction": 0.25
                if profit_r > (0.06 if weak_breakout else 0.12) and trade.remaining_size > 0.55
                else 0.0,
                "protect_r": 0.04 if profit_r > 0.10 else 0.0,
                "loss_cap_r": -0.08 if reason == "FAILED_FT" else -0.12,
            }
        if family_key == "tr_scalp":
            return {
                "detail": "tr_scalp_protect",
                "target_r": self._protective_target_r(trade, default_r=0.40),
                "partial_fraction": 0.25 if profit_r > 0.04 and trade.remaining_size > 0.50 else 0.0,
                "protect_r": 0.0,
                "loss_cap_r": -0.04 if reason == "WEAK_SCALP" else -0.06,
            }
        return {
            "detail": "generic_protect",
            "target_r": self._protective_target_r(trade, default_r=0.60),
            "partial_fraction": 0.20 if profit_r > 0.10 and trade.remaining_size > 0.55 else 0.0,
            "protect_r": 0.0,
            "loss_cap_r": -0.10,
        }

    @staticmethod
    def _protective_release_threshold(detail: str) -> tuple[int, float]:
        """不同保护性 scalp 子状态允许的观察时长与最低收益。

        修复：原阈值太紧，导致 PREMISE REDUCE 重复触发后快速平仓。
        Brooks: 保护性管理应该让 SL 决定退出，不是时间。
        """
        if detail == "channel_to_tr":
            return 5, -0.02
        if detail == "first_entry_be":
            return 6, -0.05
        if detail == "second_entry_profit":
            return 7, 0.00
        if detail == "breakout_protect":
            return 4, -0.03
        if detail == "reversal_protect":
            return 5, -0.02
        if detail == "tr_scalp_protect":
            return 4, 0.00
        if detail == "generic_protect":
            return 8, -0.05
        return 8, -0.05

    @staticmethod
    def _protective_detail_plan(detail: str) -> dict[str, float]:
        """把 Brooks 的保护性 scalp 细分成更明确的动作计划。

        修复：原参数 force_exit_bars 太短、loss_exit_r 太低，导致交易
        进入 protective_scalp 后几乎必死。Brooks 理论中保护性管理应该
        让 SL 来决定退出，而不是用时间强制杀死。
        """
        if detail == "channel_to_tr":
            return {
                "stale_bars": 2.0,
                "force_exit_bars": 6.0,
                "profit_exit_r": 0.03,
                "loss_exit_r": -0.05,
                "extra_partial_r": 0.15,
                "extra_partial_fraction": 0.33,
                "protect_r": 0.0,
            }
        if detail == "first_entry_be":
            return {
                "stale_bars": 2.0,
                "force_exit_bars": 7.0,
                "profit_exit_r": 0.02,
                "loss_exit_r": -0.06,
                "extra_partial_r": 0.12,
                "extra_partial_fraction": 0.25,
                "protect_r": 0.0,
            }
        if detail == "second_entry_profit":
            return {
                "stale_bars": 2.0,
                "force_exit_bars": 7.0,
                "profit_exit_r": 0.08,
                "loss_exit_r": -0.03,
                "extra_partial_r": 0.25,
                "extra_partial_fraction": 0.25,
                "protect_r": 0.05,
            }
        # P0: BO 失败后，大多数会回到 TR。Brooks 更像 scratch/scalp，而不是继续等保护性止损。
        if detail == "breakout_protect":
            return {
                "stale_bars": 2.0,
                "force_exit_bars": 5.0,
                "profit_exit_r": 0.03,
                "loss_exit_r": -0.03,
                "extra_partial_r": 0.18,
                "extra_partial_fraction": 0.25,
                "protect_r": 0.0,
            }
        # P0: 大多数 MTR 只是 minor reversal；一旦没跟进，更像快速降级成 scalp/scratch。
        if detail == "reversal_protect":
            return {
                "stale_bars": 2.0,
                "force_exit_bars": 5.0,
                "profit_exit_r": 0.04,
                "loss_exit_r": -0.02,
                "extra_partial_r": 0.18,
                "extra_partial_fraction": 0.25,
                "protect_r": 0.0,
            }
        # P0: TR scalp 退化后更不该留到保护性止损，优先按 scratch/scalp 处理。
        if detail == "tr_scalp_protect":
            return {
                "stale_bars": 1.5,
                "force_exit_bars": 4.0,
                "profit_exit_r": 0.02,
                "loss_exit_r": 0.0,
                "extra_partial_r": 0.12,
                "extra_partial_fraction": 0.33,
                "protect_r": 0.0,
            }
        # generic fallback
        return {
            "stale_bars": 3.0,
            "force_exit_bars": 8.0,
            "profit_exit_r": 0.05,
            "loss_exit_r": -0.06,
            "extra_partial_r": 0.40,
            "extra_partial_fraction": 0.15,
            "protect_r": 0.0,
        }

    @staticmethod
    def _classify_stop_exit_type(trade: Trade) -> str:
        """把止损退出细分成保护性止损与真正余仓 trailing。"""
        adjusted = abs(float(trade.stop_loss or 0.0) - float(trade.initial_stop_loss or 0.0)) > 1e-9
        adjusted = adjusted or int(trade.stop_adjust_count or 0) > 0
        if not adjusted:
            return ""
        if bool(trade.protective_runner_kept):
            return "runner_trailing"
        if str(trade.management_state or "") == "protective_scalp":
            return "protective_stop"
        if bool(trade.tp1_done) or bool(trade.tp2_done) or int(trade.partial_close_count or 0) > 0:
            return "runner_trailing"
        return "adjusted_stop"

    @staticmethod
    def _classify_tp_exit_type(trade: Trade) -> str:
        """把止盈退出细分成整体止盈与缩放后止盈。"""
        if bool(trade.tp1_done) or bool(trade.tp2_done) or int(trade.partial_close_count or 0) > 0:
            return "tp_after_scaleout"
        return "full_tp"

    def place_order(self, signal, score: int, background: str):
        """
        接收信号并开仓

        Args:
            signal: SignalEvent 或 PASignal（需要 .symbol, .direction,
                    .signal_type, .price, .stop_loss, .take_profit, .timestamp, .cycle）
            score: 评分
            background: 背景描述
        """
        # 每日重置
        ts = signal.timestamp
        date_str = ts.strftime("%Y-%m-%d") if hasattr(ts, "strftime") else str(ts)[:10]
        if date_str != self._current_date:
            self._current_date = date_str
            self.daily_losses = {}

        intent = self._signal_intent(signal)
        existing_trade = self._find_open_trade(signal.symbol)
        if intent in {"ADD_ON", "SCALE_IN", "PYRAMID_ADD"} and existing_trade is not None:
            if self._can_scale_winner(existing_trade, signal):
                self._apply_scale_in(existing_trade, signal)
            return

        # 同品种不重复暴露（已持仓或已有挂单）
        if self._has_symbol_exposure(signal.symbol):
            return

        if self._should_queue_order(signal):
            self.pending_orders.append(self._build_pending_order(signal, score, background))
            return

        self.open_trades.append(self._build_trade(signal, score, background))
        self.reentry_watch.pop(signal.symbol, None)

    def on_candle(self, candle, market_data: dict | None = None):
        """
        每根 K 线检查所有持仓的 SL/TP

        Args:
            candle: K 线对象（需要 .high, .low, .close, .timestamp）
        """
        self._process_pending_orders(candle)
        still_open = []
        self._decay_reentry_watch(candle.symbol)
        for trade in self.open_trades:
            if trade.symbol != candle.symbol:
                still_open.append(trade)
                continue
            if trade.entry_time == candle.timestamp:
                still_open.append(trade)
                continue
            trade.bars_held += 1
            self._update_extremes(trade, candle)
            closed = False

            # 默认模板保留老逻辑；Brooks swing / reversal 交给 2R/3R 分批和结构保护。
            if trade.management_style not in BROOKS_MANAGED_STYLES:
                be_trigger = self._breakeven_trigger(trade.management_style)
                if trade.direction == "BUY":
                    unrealized = candle.high - trade.entry_price
                    sl_dist = trade.entry_price - trade.stop_loss
                    if sl_dist > 0 and unrealized >= sl_dist * be_trigger:
                        new_sl = trade.entry_price * 1.0001
                        self._update_stop_loss(trade, max(trade.stop_loss, new_sl))
                elif trade.direction == "SELL":
                    unrealized = trade.entry_price - candle.low
                    sl_dist = trade.stop_loss - trade.entry_price
                    if sl_dist > 0 and unrealized >= sl_dist * be_trigger:
                        new_sl = trade.entry_price * 0.9999
                        self._update_stop_loss(trade, min(trade.stop_loss, new_sl))

            scale = TF_SCALE.get(trade.timeframe, 1)

            exit_price, exit_reason = self._check_stop_target_hits(trade, candle)
            if exit_reason:
                self._close_trade(trade, exit_price, exit_reason, candle.timestamp)
                closed = True

            if not closed:
                self._apply_brooks_management(trade, candle, market_data)

            if not closed and market_data:
                closed = self._apply_runtime_management(trade, candle, market_data)

            if not closed and trade.management_state == "protective_scalp":
                closed = self._manage_protective_scalp(trade, candle, market_data)

            # 僵尸单: 只抓“长时间没有推进、回到保本附近”的死钱交易。
            # 先降级成保护性 scalp；如果仍然毫无推进，再真正退出。
            style_key = self._style_key(trade.management_style)

            if style_key == "brooks_swing":
                base_zbar = 28
            elif style_key == "brooks_mtr_reversal":
                base_zbar = 20
            elif style_key == "brooks_t4_wedge_pullback":
                base_zbar = 24
            elif style_key == "brooks_r3_channel_line_fade":
                base_zbar = 22
            elif style_key == "brooks_tr4_daily_tr_fade":
                base_zbar = 12
            elif style_key == "brooks_s1_htf_sr_reversal":
                base_zbar = 26
            elif style_key == "brooks_s2_micro_channel":
                base_zbar = 24
            elif style_key == "brooks_climax_reversal":
                base_zbar = 16
            elif style_key == "brooks_breakout":
                base_zbar = 18
            elif style_key == "brooks_tr_blshs":
                base_zbar = 10
            else:
                base_zbar = 20 if trade.strategy == "突破回调" else 16
            zombie_bar = int(base_zbar * scale)
            late_zombie = int(zombie_bar * 2)

            if not closed and trade.bars_held >= zombie_bar:
                current_r = self._profit_in_r(trade, candle.close)
                best_r = self._profit_in_r(trade, trade.best_price)
                bars_without_progress = max(0, trade.bars_held - int(trade.best_price_bar or 0))
                early_best_r, late_best_r = self._zombie_best_r_threshold(style_key)
                early_exit = (
                    trade.bars_held < late_zombie
                    and bars_without_progress >= max(4, int(2 * scale))
                    and best_r < early_best_r
                    and -0.15 < current_r < 0.15
                    and trade.partial_close_count == 0
                )
                late_exit = (
                    trade.bars_held >= late_zombie
                    and bars_without_progress >= max(8, int(4 * scale))
                    and best_r < late_best_r
                    and current_r < 0.15
                    and current_r > -0.60
                )

                if early_exit or late_exit:
                    if trade.management_state == "protective_scalp" and trade.management_reason == "ZOMBIE":
                        self._close_trade(trade, candle.close, "ZOMBIE", candle.timestamp)
                        closed = True
                    else:
                        detail = ""
                        target_r = self._protective_target_r(trade, default_r=0.7)
                        protect_r_override = None
                        loss_cap_override = None
                        if self._family_key(trade) == "trend_recovery":
                            profile = self._trend_recovery_protective_profile(
                                trade,
                                market_data,
                                reason="ZOMBIE",
                                profit_r=current_r,
                            )
                            detail = str(profile["detail"])
                            target_r = float(profile["target_r"])
                            protect_r_override = float(profile["protect_r"])
                            loss_cap_override = float(profile["loss_cap_r"])
                        self._activate_protective_scalp(
                            trade,
                            candle,
                            reason="ZOMBIE",
                            target_r=target_r,
                            partial_fraction=0.0,
                            detail=detail,
                            protect_r_override=protect_r_override,
                            loss_cap_override=loss_cap_override,
                        )

            # 显式 scalp 风格只按结构化 scalp 目标出场，不再用工程化时间衰减阈值。
            scalp_start = max(3, int(3 * scale))
            scalp_enabled = self._scalp_exit_enabled(trade.management_style)
            if scalp_enabled and not closed and trade.bars_held >= scalp_start:
                scalp_r = self._profit_in_r(trade, candle.close)
                best_r = self._profit_in_r(trade, trade.best_price)
                bars_without_progress = max(0, trade.bars_held - int(trade.best_price_bar or 0))
                if scalp_r >= self._scalp_target_r(trade):
                    self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                    closed = True
                elif (
                    trade.bars_held >= max(6, int(6 * scale))
                    and bars_without_progress >= max(2, int(2 * scale))
                    and best_r >= 0.6
                    and scalp_r > -0.05
                ):
                    self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                    closed = True

            # 超时平仓（周期感知动态持仓时间）
            max_bars = int(self._get_max_bars(trade) * scale)
            if not closed and trade.bars_held >= max_bars:
                self._close_trade(trade, candle.close, "TIMEOUT", candle.timestamp)
                closed = True

            if closed:
                self._record_close(trade)
                self.closed_trades.append(trade)
            else:
                still_open.append(trade)

        self.open_trades = still_open

    def force_close_all(self, candle):
        """强制平仓所有持仓（回测结束时调用）"""
        for trade in self.open_trades:
            self._close_trade(trade, candle.close, "END", candle.timestamp)
            self._record_close(trade)
            self.closed_trades.append(trade)
        self.open_trades = []
        self.pending_orders = []

    def _has_symbol_exposure(self, symbol: str) -> bool:
        """同一品种只允许一笔持仓或一张挂单。"""
        return any(trade.symbol == symbol for trade in self.open_trades) or any(
            order.symbol == symbol for order in self.pending_orders
        )

    def _find_open_trade(self, symbol: str) -> Trade | None:
        """查找当前品种的活跃持仓。"""
        return next((trade for trade in self.open_trades if trade.symbol == symbol), None)

    @staticmethod
    def _signal_intent(signal) -> str:
        """统一提取信号意图。"""
        extra = getattr(signal, "extra", {}) or {}
        return str(getattr(signal, "intent", "") or extra.get("intent") or "").upper()

    def _signal_risk_percent(self, signal) -> float:
        """按 S7 梯度提取回测侧的单笔风险。"""
        extra = getattr(signal, "extra", {}) or {}
        explicit = float(extra.get("risk_percent", 0.0) or getattr(signal, "risk_percent", 0.0) or 0.0)
        if explicit > 0:
            return explicit
        intent = self._signal_intent(signal)
        if intent == "PYRAMID_ADD":
            return 0.4
        if intent in {"ADD_ON", "SCALE_IN"}:
            return 0.3
        return 0.3

    def _trade_open_r(self, trade: Trade, mark_price: float) -> float:
        """按初始风险计算当前持仓已走出的有利 R。"""
        risk = max(float(trade.initial_risk or 0.0), 1e-9)
        if trade.direction == "BUY":
            return (float(mark_price or 0.0) - float(trade.entry_price or 0.0)) / risk
        return (float(trade.entry_price or 0.0) - float(mark_price or 0.0)) / risk

    def _can_scale_winner(self, trade: Trade, signal) -> bool:
        """只允许向盈利仓位加仓，对齐 Brooks 的 winner scaling。"""
        if trade.direction != getattr(signal, "direction", ""):
            return False
        intent = self._signal_intent(signal)
        signal_price = float(getattr(signal, "price", trade.best_price or trade.entry_price) or trade.entry_price)
        open_r = self._trade_open_r(trade, signal_price)
        if intent == "PYRAMID_ADD":
            if open_r < 1.25:
                return False
            if trade.direction == "BUY" and trade.stop_loss + 1e-9 < trade.entry_price:
                return False
            if trade.direction == "SELL" and trade.stop_loss - 1e-9 > trade.entry_price:
                return False
            return True
        if open_r < 0.75:
            return False
        if trade.tp1_done:
            return True
        if trade.direction == "BUY":
            return trade.stop_loss + 1e-9 >= trade.entry_price
        return trade.stop_loss - 1e-9 <= trade.entry_price

    def _apply_scale_in(self, trade: Trade, signal) -> None:
        """把同方向加仓并入现有持仓，并限制总风险不超过 1%。"""
        if trade.direction != getattr(signal, "direction", ""):
            return
        requested_risk = self._signal_risk_percent(signal)
        remaining = max(0.0, 1.0 - float(trade.risk_percent or 0.0))
        add_risk = min(requested_risk, remaining)
        if add_risk <= 0:
            return

        total_risk = max(float(trade.risk_percent or 0.0), 0.0) + add_risk
        leg_entry = float(getattr(signal, "price", trade.entry_price) or trade.entry_price)
        if total_risk > 0:
            current_weight = max(float(trade.risk_percent or 0.0), 0.0)
            trade.entry_price = (
                trade.entry_price * current_weight + leg_entry * add_risk
            ) / total_risk
        leg_stop = float(getattr(signal, "stop_loss", trade.stop_loss) or trade.stop_loss)
        leg_tp = float(getattr(signal, "take_profit", trade.take_profit) or trade.take_profit)
        if trade.direction == "BUY":
            self._update_stop_loss(trade, min(trade.stop_loss, leg_stop))
            self._update_take_profit(trade, max(trade.take_profit, leg_tp))
        else:
            self._update_stop_loss(trade, max(trade.stop_loss, leg_stop))
            self._update_take_profit(trade, min(trade.take_profit, leg_tp))
        trade.risk_percent = total_risk
        trade.scale_legs += 1
        trade.initial_risk = abs(trade.entry_price - trade.stop_loss)
        trade.intent = self._signal_intent(signal) or trade.intent

    @staticmethod
    def _should_queue_order(signal) -> bool:
        """Brooks 回测默认按真实执行语义处理挂单确认。"""
        entry_type = str(getattr(signal, "entry_type", "STOP") or "STOP").upper()
        return bool(getattr(signal, "confirmation_needed", False)) or entry_type in {"STOP", "LIMIT"}

    def _build_trade(self, signal, score: int, background: str, fill_price: float | None = None) -> Trade:
        """从信号或挂单构建实际成交记录。"""
        extra = getattr(signal, "extra", {}) or {}
        entry_price = float(fill_price if fill_price is not None else (getattr(signal, "price", 0.0) or 0.0))
        stop_loss = float(getattr(signal, "stop_loss", 0.0) or 0.0)
        take_profit = float(getattr(signal, "take_profit", 0.0) or 0.0)
        original_entry = float(extra.get("original_entry_price", getattr(signal, "price", entry_price)) or entry_price)
        original_risk = abs(original_entry - stop_loss)
        reward_multiple = 0.0
        if original_risk > 0:
            reward_multiple = abs(take_profit - original_entry) / original_risk
        if fill_price is not None and reward_multiple > 0 and abs(entry_price - stop_loss) > 0:
            if getattr(signal, "direction", "") == "BUY":
                take_profit = entry_price + abs(entry_price - stop_loss) * reward_multiple
            else:
                take_profit = entry_price - abs(entry_price - stop_loss) * reward_multiple

        trade = Trade(
            symbol=signal.symbol,
            direction=signal.direction,
            strategy=getattr(signal, "signal_type", "unknown"),
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            entry_time=signal.timestamp,
            score=score,
            background=background,
            cycle=getattr(signal, "cycle", ""),
            timeframe=getattr(signal, "timeframe", "5m"),
            entry_type=str(getattr(signal, "entry_type", "STOP") or "STOP").upper(),
            entry_trigger=float(getattr(signal, "entry_trigger", entry_price) or entry_price),
            signal_bar_high=float(getattr(signal, "signal_bar_high", 0.0) or 0.0),
            signal_bar_low=float(getattr(signal, "signal_bar_low", 0.0) or 0.0),
            market_state=str(extra.get("market_state", "") or ""),
            higher_timeframe=str(extra.get("higher_timeframe", "") or ""),
            higher_market_state=str(extra.get("higher_market_state", "") or ""),
            follow_through=bool(extra.get("follow_through", False)),
            higher_follow_through=bool(extra.get("higher_follow_through", False)),
            trendline_break_confirmed=bool(extra.get("trendline_break_confirmed", False)),
            failed_breakout_evidence=bool(extra.get("failed_breakout_evidence", False)),
            signal_bar_quality=float(extra.get("signal_bar_quality", 0.0) or 0.0),
            signal_bar_tail_ratio=float(extra.get("signal_bar_tail_ratio", 0.0) or 0.0),
            signal_bar_close_position=float(extra.get("signal_bar_close_position", 0.0) or 0.0),
            reclaimed_prior_close=bool(extra.get("reclaimed_prior_close", False)),
            broke_micro_extreme=bool(extra.get("broke_micro_extreme", False)),
            requires_second_entry=bool(extra.get("requires_second_entry", False)),
            acceptance_ready=bool(extra.get("acceptance_ready", False)),
            executable_signal_ready=bool(extra.get("executable_signal_ready", False)),
            candidate_stage=str(extra.get("candidate_stage", "") or ""),
            nearest_support=float(extra.get("nearest_support", 0.0) or 0.0),
            nearest_resistance=float(extra.get("nearest_resistance", 0.0) or 0.0),
            target_path_clear=bool(extra.get("target_path_clear", True)),
            stop_structure_ok=bool(extra.get("stop_structure_ok", True)),
            actual_to_perfect_risk_ratio=float(extra.get("actual_to_perfect_risk_ratio", 1.0) or 1.0),
            first_target_distance_r=float(extra.get("first_target_distance_r", 0.0) or 0.0),
            blocking_magnet_distance_r=float(extra.get("blocking_magnet_distance_r", 0.0) or 0.0),
            trapped_side=str(extra.get("trapped_side", "") or ""),
            prior_leg_context=str(extra.get("prior_leg_context", "") or ""),
            prior_leg_bars=int(extra.get("prior_leg_bars", 0) or 0),
            prior_leg_overlap_ratio=float(extra.get("prior_leg_overlap_ratio", 0.0) or 0.0),
            playbook_id=str(extra.get("playbook_id", "") or ""),
            playbook_family=str(extra.get("playbook_family", "") or ""),
            order_bias=str(extra.get("order_bias", "") or ""),
            route_style=str(extra.get("route_style", "") or ""),
            management_style=extra.get("management_style", "default"),
            recommended_target=float(extra.get("recommended_target", 0.0) or 0.0),
            primary_magnet_kind=str(extra.get("primary_magnet_kind", "") or ""),
            blocking_magnet_kind=str(extra.get("blocking_magnet_kind", "") or ""),
            magnet_cluster_count=int(extra.get("magnet_cluster_count", 0) or 0),
            magnet_cluster_strength=float(extra.get("magnet_cluster_strength", 0.0) or 0.0),
            signal_stage=str(extra.get("signal_stage", "") or ""),
            signal_stage_reason=str(extra.get("signal_stage_reason", "") or ""),
            intent=self._signal_intent(signal),
            risk_percent=self._signal_risk_percent(signal),
            original_entry_price=original_entry,
            reentry_attempt=int(extra.get("reentry_attempt", 0) or 0),
            market_cost_profile=self._market_cost_profile(signal.symbol),
        )
        trade.initial_stop_loss = stop_loss
        trade.initial_risk = abs(entry_price - stop_loss)
        trade.best_price = entry_price
        trade.worst_price = entry_price
        return trade

    def _build_pending_order(self, signal, score: int, background: str) -> PendingOrder:
        """把信号转成等待成交的挂单。"""
        extra = getattr(signal, "extra", {}) or {}
        entry_price = float(getattr(signal, "price", 0.0) or 0.0)
        trigger_price = float(getattr(signal, "entry_trigger", entry_price) or entry_price)
        entry_type = str(getattr(signal, "entry_type", "STOP") or "STOP").upper()
        return PendingOrder(
            symbol=signal.symbol,
            direction=signal.direction,
            strategy=getattr(signal, "signal_type", "unknown"),
            order_price=entry_price,
            trigger_price=trigger_price,
            stop_loss=float(getattr(signal, "stop_loss", 0.0) or 0.0),
            take_profit=float(getattr(signal, "take_profit", 0.0) or 0.0),
            submitted_time=signal.timestamp,
            timeframe=getattr(signal, "timeframe", "5m"),
            entry_type=entry_type,
            score=score,
            background=background,
            cycle=getattr(signal, "cycle", ""),
            expires_after=self._pending_window_bars(signal),
            market_state=str(extra.get("market_state", "") or ""),
            higher_timeframe=str(extra.get("higher_timeframe", "") or ""),
            higher_market_state=str(extra.get("higher_market_state", "") or ""),
            follow_through=bool(extra.get("follow_through", False)),
            higher_follow_through=bool(extra.get("higher_follow_through", False)),
            trendline_break_confirmed=bool(extra.get("trendline_break_confirmed", False)),
            failed_breakout_evidence=bool(extra.get("failed_breakout_evidence", False)),
            signal_bar_quality=float(extra.get("signal_bar_quality", 0.0) or 0.0),
            signal_bar_tail_ratio=float(extra.get("signal_bar_tail_ratio", 0.0) or 0.0),
            signal_bar_close_position=float(extra.get("signal_bar_close_position", 0.0) or 0.0),
            reclaimed_prior_close=bool(extra.get("reclaimed_prior_close", False)),
            broke_micro_extreme=bool(extra.get("broke_micro_extreme", False)),
            requires_second_entry=bool(extra.get("requires_second_entry", False)),
            acceptance_ready=bool(extra.get("acceptance_ready", False)),
            executable_signal_ready=bool(extra.get("executable_signal_ready", False)),
            candidate_stage=str(extra.get("candidate_stage", "") or ""),
            nearest_support=float(extra.get("nearest_support", 0.0) or 0.0),
            nearest_resistance=float(extra.get("nearest_resistance", 0.0) or 0.0),
            target_path_clear=bool(extra.get("target_path_clear", True)),
            stop_structure_ok=bool(extra.get("stop_structure_ok", True)),
            actual_to_perfect_risk_ratio=float(extra.get("actual_to_perfect_risk_ratio", 1.0) or 1.0),
            first_target_distance_r=float(extra.get("first_target_distance_r", 0.0) or 0.0),
            blocking_magnet_distance_r=float(extra.get("blocking_magnet_distance_r", 0.0) or 0.0),
            trapped_side=str(extra.get("trapped_side", "") or ""),
            prior_leg_context=str(extra.get("prior_leg_context", "") or ""),
            prior_leg_bars=int(extra.get("prior_leg_bars", 0) or 0),
            prior_leg_overlap_ratio=float(extra.get("prior_leg_overlap_ratio", 0.0) or 0.0),
            playbook_id=str(extra.get("playbook_id", "") or ""),
            playbook_family=str(extra.get("playbook_family", "") or ""),
            order_bias=str(extra.get("order_bias", "") or ""),
            route_style=str(extra.get("route_style", "") or ""),
            management_style=extra.get("management_style", "default"),
            recommended_target=float(extra.get("recommended_target", 0.0) or 0.0),
            primary_magnet_kind=str(extra.get("primary_magnet_kind", "") or ""),
            blocking_magnet_kind=str(extra.get("blocking_magnet_kind", "") or ""),
            magnet_cluster_count=int(extra.get("magnet_cluster_count", 0) or 0),
            magnet_cluster_strength=float(extra.get("magnet_cluster_strength", 0.0) or 0.0),
            signal_stage=str(extra.get("signal_stage", "") or ""),
            signal_stage_reason=str(extra.get("signal_stage_reason", "") or ""),
            intent=self._signal_intent(signal),
            risk_percent=self._signal_risk_percent(signal),
            original_entry_price=float(extra.get("original_entry_price", entry_price) or entry_price),
            reentry_attempt=int(extra.get("reentry_attempt", 0) or 0),
            signal_bar_high=float(getattr(signal, "signal_bar_high", 0.0) or 0.0),
            signal_bar_low=float(getattr(signal, "signal_bar_low", 0.0) or 0.0),
            confirmation_needed=bool(getattr(signal, "confirmation_needed", False)),
        )

    @staticmethod
    def _load_runtime_position_manager():
        """懒加载交易域持仓管理模块，复用真实链的 premise/strength 规则。"""
        global _RUNTIME_POSITION_MANAGER
        if _RUNTIME_POSITION_MANAGER is not None:
            return _RUNTIME_POSITION_MANAGER

        project_root = Path(__file__).resolve().parents[2]
        if str(project_root) not in sys.path:
            sys.path.insert(0, str(project_root))
        _RUNTIME_POSITION_MANAGER = import_module("trading.position_management")
        return _RUNTIME_POSITION_MANAGER

    @staticmethod
    def _market_state_to_trend_label(market_state: str) -> str:
        """把回测市场状态映射成 runtime 侧可读的趋势标签。"""
        key = str(market_state or "")
        if "bull" in key:
            return "bull"
        if "bear" in key:
            return "bear"
        return "neutral"

    @staticmethod
    def _market_state_to_ai_direction(current_state: str, higher_state: str, side: str) -> str:
        """把当前/更高周期状态映射成 premise_check 可消费的方向。"""
        for key in (higher_state, current_state):
            if "bull" in str(key or ""):
                return "long"
            if "bear" in str(key or ""):
                return "short"
        return "long" if side == "BUY" else "short"

    def _build_runtime_market_data(self, trade: Trade, market_data: dict, candle) -> tuple[dict, dict]:
        """构造运行时持仓管理需要的 position / market_data。"""
        timeframe_states = dict(market_data.get("timeframe_states", {}) or {})
        timeframe_trends = dict(market_data.get("timeframes", {}) or {})
        timeframe_recent_bars = dict(market_data.get("timeframe_recent_bars", {}) or {})
        timeframe_sr = dict(market_data.get("timeframe_sr", {}) or {})
        timeframe_ema = dict(market_data.get("timeframe_ema", {}) or {})
        recent_bars = list(timeframe_recent_bars.get(trade.timeframe, market_data.get("recent_bars", [])) or [])
        ab_sr = dict(timeframe_sr.get(trade.timeframe, market_data.get("ab_sr", {})) or {})
        ab_ema_value = timeframe_ema.get(trade.timeframe, market_data.get("ab_ema", {}).get("ema20", 0.0))
        ab_ema = {"ema20": float(ab_ema_value or 0.0)}
        ab_patterns = dict(market_data.get("ab_patterns", {}) or {})

        current_state = str(timeframe_states.get(trade.timeframe, trade.market_state) or trade.market_state or "")
        higher_tf = str(trade.higher_timeframe or "")
        higher_state = str(
            timeframe_states.get(higher_tf, trade.higher_market_state)
            or trade.higher_market_state
            or ""
        )
        ai_direction = self._market_state_to_ai_direction(current_state, higher_state, trade.direction)

        position = {
            "symbol": trade.symbol,
            "side": trade.direction,
            "entry_price": trade.entry_price,
            "entry_time": trade.entry_time,
            "entry_market_state": trade.market_state,
            "timeframe": trade.timeframe,
            "higher_timeframe": trade.higher_timeframe,
            "management_style": trade.management_style,
            "stop_loss": trade.stop_loss,
            "initial_stop_loss": trade.initial_stop_loss or trade.stop_loss,
            "signal_price": trade.entry_trigger or trade.entry_price,
            "signal_high": trade.signal_bar_high or max(trade.entry_price, trade.entry_trigger or trade.entry_price),
            "signal_low": trade.signal_bar_low or min(trade.entry_price, trade.entry_trigger or trade.entry_price),
            "tp1": trade.take_profit,
        }
        runtime_market = {
            "current_price": float(getattr(candle, "close", 0.0) or 0.0),
            "ai_direction": ai_direction,
            "recent_bars": recent_bars,
            "ab_state": {"state": current_state},
            "ab_sr": ab_sr,
            "ab_ema": ab_ema,
            "ab_patterns": ab_patterns,
            "timeframes": timeframe_trends,
            "account_info": {"margin_ratio": 999.0, "equity": 1.0, "used_margin": 0.0},
        }
        return position, runtime_market

    def _apply_runtime_management(self, trade: Trade, candle, market_data: dict) -> bool:
        """复用真实链 premise/strength 规则处理持仓中的失效与弱跟进。"""
        module = self._load_runtime_position_manager()
        position, runtime_market = self._build_runtime_market_data(trade, market_data, candle)
        recent_bars = list(runtime_market.get("recent_bars", []) or [])
        if len(recent_bars) < 10:
            return False
        premise = module.premise_check(position, runtime_market)
        profit_r = self._profit_in_r(trade, candle.close)
        scale = TF_SCALE.get(trade.timeframe, 1)
        style_key = self._style_key(trade.management_style)
        family_key = self._family_key(trade)

        if premise.get("action") == "CLOSE":
            self._close_trade(trade, candle.close, "PREMISE", candle.timestamp)
            return True

        if premise.get("action") == "REDUCE":
            if (
                trade.management_state == "protective_scalp"
                and trade.management_reason == "PREMISE"
            ):
                wait_bars, min_profit = self._protective_release_threshold(str(trade.management_reason_detail or ""))
                if trade.bars_held >= max(wait_bars, int(wait_bars * scale)) and profit_r < min_profit:
                    self._close_trade(trade, candle.close, "PREMISE", candle.timestamp)
                    return True
            if trade.management_reason != "PREMISE":
                profile = self._family_protective_profile(
                    trade,
                    market_data,
                    reason="PREMISE",
                    profit_r=profit_r,
                )
                trade.premise_reduce_count += 1
                self._activate_protective_scalp(
                    trade,
                    candle,
                    reason="PREMISE",
                    target_r=float(profile["target_r"]),
                    partial_fraction=float(profile["partial_fraction"]),
                    detail=str(profile["detail"]),
                    protect_r_override=float(profile["protect_r"]),
                    loss_cap_override=float(profile["loss_cap_r"]),
                )
            return False

        strength = module.strength_check(position, runtime_market, management_style=trade.management_style)
        strength_score = int(strength.get("strength_score", 0) or 0)

        if (
            trade.management_style == "brooks_breakout"
            and trade.bars_held >= max(3, int(3 * scale))
            and strength_score <= 1
            and profit_r < 0.35
        ):
            if (
                trade.management_state == "protective_scalp"
                and trade.management_reason == "FAILED_FT"
                and trade.bars_held >= max(5, int(5 * scale))
                and profit_r < 0.15
            ):
                self._close_trade(trade, candle.close, "FAILED_FT", candle.timestamp)
                return True
            profile = self._family_protective_profile(
                trade,
                market_data,
                reason="FAILED_FT",
                profit_r=profit_r,
            )
            self._activate_protective_scalp(
                trade,
                candle,
                reason="FAILED_FT",
                target_r=float(profile["target_r"]),
                partial_fraction=float(profile["partial_fraction"]),
                detail=str(profile["detail"]),
                protect_r_override=float(profile["protect_r"]),
                loss_cap_override=float(profile["loss_cap_r"]),
            )
            return False

        if (
            family_key == "trend_recovery"
            and trade.bars_held >= max(4, int(4 * scale))
            and strength_score <= 1
            and profit_r < 0.35
            and max(0, trade.bars_held - int(trade.best_price_bar or 0)) >= max(2, int(2 * scale))
        ):
            if (
                trade.management_state == "protective_scalp"
                and trade.management_reason == "WEAK_SCALP"
            ):
                wait_bars, min_profit = self._protective_release_threshold(str(trade.management_reason_detail or ""))
                if trade.bars_held >= max(wait_bars, int(wait_bars * scale)) and profit_r < min_profit:
                    self._close_trade(trade, candle.close, "WEAK_SCALP", candle.timestamp)
                    return True
            profile = self._family_protective_profile(
                trade,
                market_data,
                reason="WEAK_SCALP",
                profit_r=profit_r,
            )
            self._activate_protective_scalp(
                trade,
                candle,
                reason="WEAK_SCALP",
                target_r=float(profile["target_r"]),
                partial_fraction=float(profile["partial_fraction"]),
                detail=str(profile["detail"]),
                protect_r_override=float(profile["protect_r"]),
                loss_cap_override=float(profile["loss_cap_r"]),
            )
            return False

        if (
            family_key in {"mtr_reversal", "climax_reversal"}
            and trade.bars_held >= max(4, int(4 * scale))
            and strength_score <= 1
            and profit_r < 0.35
            and max(0, trade.bars_held - int(trade.best_price_bar or 0)) >= max(2, int(2 * scale))
        ):
            if (
                trade.management_state == "protective_scalp"
                and trade.management_reason == "WEAK_SCALP"
            ):
                wait_bars, min_profit = self._protective_release_threshold(str(trade.management_reason_detail or ""))
                if trade.bars_held >= max(wait_bars, int(wait_bars * scale)) and profit_r < min_profit:
                    self._close_trade(trade, candle.close, "WEAK_SCALP", candle.timestamp)
                    return True
            profile = self._family_protective_profile(
                trade,
                market_data,
                reason="WEAK_SCALP",
                profit_r=profit_r,
            )
            self._activate_protective_scalp(
                trade,
                candle,
                reason="WEAK_SCALP",
                target_r=float(profile["target_r"]),
                partial_fraction=float(profile["partial_fraction"]),
                detail=str(profile["detail"]),
                protect_r_override=float(profile["protect_r"]),
                loss_cap_override=float(profile["loss_cap_r"]),
            )
            return False

        if (
            style_key in {"brooks_tr_blshs", "brooks_tr4_daily_tr_fade", "brooks_scalp"}
            and trade.bars_held >= max(3, int(3 * scale))
            and strength_score <= 1
            and profit_r < 0.20
        ):
            if (
                trade.management_state == "protective_scalp"
                and trade.management_reason == "WEAK_SCALP"
                and trade.bars_held >= max(6, int(6 * scale))
                and profit_r < 0.10
            ):
                self._close_trade(trade, candle.close, "WEAK_SCALP", candle.timestamp)
                return True
            profile = self._family_protective_profile(
                trade,
                market_data,
                reason="WEAK_SCALP",
                profit_r=profit_r,
            )
            self._activate_protective_scalp(
                trade,
                candle,
                reason="WEAK_SCALP",
                target_r=float(profile["target_r"]),
                partial_fraction=float(profile["partial_fraction"]),
                detail=str(profile["detail"]),
                protect_r_override=float(profile["protect_r"]),
                loss_cap_override=float(profile["loss_cap_r"]),
            )
            return False

        return False

    def _process_pending_orders(self, candle) -> None:
        """处理当前 K 线上的挂单成交、失效与超时。"""
        remaining_orders: list[PendingOrder] = []
        for order in self.pending_orders:
            if order.symbol != candle.symbol:
                remaining_orders.append(order)
                continue
            order.bars_waited += 1
            if self._pending_invalidated(order, candle):
                continue
            fill_price = 0.0
            if order.entry_type == "LIMIT":
                fill_price = self._fill_limit_order(order, candle)
            else:
                fill_price = self._fill_stop_order(order, candle)
            if fill_price > 0:
                signal_stub = type("PendingSignal", (), {})()
                signal_stub.symbol = order.symbol
                signal_stub.direction = order.direction
                signal_stub.signal_type = order.strategy
                signal_stub.price = order.order_price
                signal_stub.stop_loss = order.stop_loss
                signal_stub.take_profit = order.take_profit
                signal_stub.timestamp = candle.timestamp
                signal_stub.cycle = order.cycle
                signal_stub.timeframe = order.timeframe
                signal_stub.entry_type = order.entry_type
                signal_stub.entry_trigger = order.trigger_price
                signal_stub.signal_bar_high = order.signal_bar_high
                signal_stub.signal_bar_low = order.signal_bar_low
                signal_stub.intent = order.intent
                signal_stub.risk_percent = order.risk_percent
                signal_stub.extra = {
                    "market_state": order.market_state,
                    "higher_timeframe": order.higher_timeframe,
                    "higher_market_state": order.higher_market_state,
                    "follow_through": order.follow_through,
                    "higher_follow_through": order.higher_follow_through,
                    "trendline_break_confirmed": order.trendline_break_confirmed,
                    "failed_breakout_evidence": order.failed_breakout_evidence,
                    "signal_bar_quality": order.signal_bar_quality,
                    "signal_bar_tail_ratio": order.signal_bar_tail_ratio,
                    "signal_bar_close_position": order.signal_bar_close_position,
                    "reclaimed_prior_close": order.reclaimed_prior_close,
                    "broke_micro_extreme": order.broke_micro_extreme,
                    "requires_second_entry": order.requires_second_entry,
                    "acceptance_ready": order.acceptance_ready,
                    "executable_signal_ready": order.executable_signal_ready,
                    "candidate_stage": order.candidate_stage,
                    "nearest_support": order.nearest_support,
                    "nearest_resistance": order.nearest_resistance,
                    "target_path_clear": order.target_path_clear,
                    "stop_structure_ok": order.stop_structure_ok,
                    "actual_to_perfect_risk_ratio": order.actual_to_perfect_risk_ratio,
                    "first_target_distance_r": order.first_target_distance_r,
                    "blocking_magnet_distance_r": order.blocking_magnet_distance_r,
                    "trapped_side": order.trapped_side,
                    "prior_leg_context": order.prior_leg_context,
                    "prior_leg_bars": order.prior_leg_bars,
                    "prior_leg_overlap_ratio": order.prior_leg_overlap_ratio,
                    "playbook_id": order.playbook_id,
                    "playbook_family": order.playbook_family,
                    "order_bias": order.order_bias,
                    "route_style": order.route_style,
                    "management_style": order.management_style,
                    "recommended_target": order.recommended_target,
                    "primary_magnet_kind": order.primary_magnet_kind,
                    "blocking_magnet_kind": order.blocking_magnet_kind,
                    "magnet_cluster_count": order.magnet_cluster_count,
                    "magnet_cluster_strength": order.magnet_cluster_strength,
                    "signal_stage": order.signal_stage,
                    "signal_stage_reason": order.signal_stage_reason,
                    "original_entry_price": order.original_entry_price,
                    "reentry_attempt": order.reentry_attempt,
                    "risk_percent": order.risk_percent,
                    "intent": order.intent,
                }
                self.open_trades.append(self._build_trade(signal_stub, order.score, order.background, fill_price))
                self.reentry_watch.pop(order.symbol, None)
                continue
            if order.bars_waited >= order.expires_after:
                continue
            remaining_orders.append(order)
        self.pending_orders = remaining_orders

    @staticmethod
    def _fill_stop_order(order: PendingOrder, candle) -> float:
        """按 stop 语义检查挂单是否被触发。"""
        if order.direction == "BUY" and candle.high >= order.trigger_price:
            return max(order.trigger_price, float(candle.open))
        if order.direction == "SELL" and candle.low <= order.trigger_price:
            return min(order.trigger_price, float(candle.open))
        return 0.0

    @staticmethod
    def _fill_limit_order(order: PendingOrder, candle) -> float:
        """按 limit 语义检查挂单是否成交。"""
        if order.direction == "BUY" and candle.low <= order.order_price:
            return min(order.order_price, float(candle.open))
        if order.direction == "SELL" and candle.high >= order.order_price:
            return max(order.order_price, float(candle.open))
        return 0.0

    @staticmethod
    def _pending_invalidated(order: PendingOrder, candle) -> bool:
        """信号棒被否定后，挂单直接失效。"""
        if order.direction == "BUY" and order.signal_bar_low > 0:
            return float(candle.close) < order.signal_bar_low * 0.998
        if order.direction == "SELL" and order.signal_bar_high > 0:
            return float(candle.close) > order.signal_bar_high * 1.002
        return False

    @staticmethod
    def _pending_window_bars(signal) -> int:
        """不同订单类型的挂单有效期。"""
        timeframe = str(getattr(signal, "timeframe", "5m") or "5m")
        entry_type = str(getattr(signal, "entry_type", "STOP") or "STOP").upper()
        management_style = str((getattr(signal, "extra", {}) or {}).get("management_style", "default") or "default")
        if timeframe == "15m":
            base = 2
        elif timeframe == "1h":
            base = 1
        else:
            base = 3
        if entry_type == "LIMIT":
            base += 2
        if management_style == "brooks_tr_blshs":
            base += 2
        if bool(getattr(signal, "confirmation_needed", False)):
            base = max(base, 2)
        return max(1, base)

    @staticmethod
    def _raw_move_pct(entry: float, exit_price: float, direction: str) -> float:
        """计算未扣成本的价格变动百分比。"""
        if entry == 0:
            return 0.0
        if direction == "BUY":
            return (exit_price - entry) / entry * 100
        return (entry - exit_price) / entry * 100

    def _calc_trade_leg_pnl(self, trade: Trade, exit_price: float, exit_reason: str) -> tuple[float, float, float]:
        """计算单笔/单腿净收益，并返回成本拆分。"""
        raw = self._raw_move_pct(trade.entry_price, exit_price, trade.direction)
        entry_fee, entry_slippage = self._cost_rates(trade, is_entry=True)
        exit_fee, exit_slippage = self._cost_rates(trade, is_entry=False, exit_reason=exit_reason)
        entry_cost_pct = (entry_fee + entry_slippage) * 100
        exit_cost_pct = (exit_fee + exit_slippage) * 100
        total_cost_pct = entry_cost_pct + exit_cost_pct
        return raw - total_cost_pct, entry_cost_pct, exit_cost_pct

    def _record_close(self, trade: Trade):
        """记录平仓统计"""
        if trade.exit_reason == "SL":
            self._register_reentry_watch(trade)
        if trade.result == "LOSS":
            self.daily_losses[trade.symbol] = self.daily_losses.get(trade.symbol, 0) + 1

        strat = trade.strategy
        if strat not in self.strategy_history:
            self.strategy_history[strat] = {"trades": 0, "wins": 0, "losses": 0, "pnl": 0.0}
        self.strategy_history[strat]["trades"] += 1
        if trade.result == "WIN":
            self.strategy_history[strat]["wins"] += 1
        elif trade.result == "LOSS":
            self.strategy_history[strat]["losses"] += 1
        self.strategy_history[strat]["pnl"] += trade.pnl_pct

    @staticmethod
    def _update_extremes(trade: Trade, candle) -> None:
        """更新交易期间的有利/不利极值。"""
        if trade.direction == "BUY":
            previous_best = trade.best_price or trade.entry_price
            trade.best_price = max(previous_best, candle.high)
            if trade.best_price > previous_best + 1e-9:
                trade.best_price_bar = trade.bars_held
            trade.worst_price = min(trade.worst_price or trade.entry_price, candle.low)
        else:
            previous_best = trade.best_price or trade.entry_price
            trade.best_price = min(previous_best, candle.low)
            if trade.best_price < previous_best - 1e-9:
                trade.best_price_bar = trade.bars_held
            trade.worst_price = max(trade.worst_price or trade.entry_price, candle.high)

    def _check_stop_target_hits(self, trade: Trade, candle) -> tuple[float, str]:
        """检测当前 K 线是否先触发止损或最终止盈。"""
        allow_fixed_tp = not (
            trade.management_style in BROOKS_MANAGED_STYLES
            and trade.management_state != "protective_scalp"
            and not trade.tp2_done
        )

        if trade.direction == "BUY":
            sl_hit = candle.low <= trade.stop_loss
            tp_hit = allow_fixed_tp and candle.high >= trade.take_profit
            sl_dist = abs(trade.entry_price - trade.stop_loss)
            tp_dist = abs(trade.take_profit - trade.entry_price)
        else:
            sl_hit = candle.high >= trade.stop_loss
            tp_hit = allow_fixed_tp and candle.low <= trade.take_profit
            sl_dist = abs(trade.stop_loss - trade.entry_price)
            tp_dist = abs(trade.entry_price - trade.take_profit)

        if sl_hit and tp_hit:
            if sl_dist <= tp_dist:
                trade.trailing_exit_type = self._classify_stop_exit_type(trade)
                return trade.stop_loss, "SL"
            trade.profit_exit_type = self._classify_tp_exit_type(trade)
            return trade.take_profit, "TP"
        if sl_hit:
            trade.trailing_exit_type = self._classify_stop_exit_type(trade)
            return trade.stop_loss, "SL"
        if tp_hit:
            trade.profit_exit_type = self._classify_tp_exit_type(trade)
            return trade.take_profit, "TP"
        return 0.0, ""

    def _apply_brooks_management(self, trade: Trade, candle, market_data: dict | None = None) -> None:
        """Brooks 风格持仓管理：2R/3R 分批、保护性移损与余仓 trailing。"""
        plan = self._management_plan(trade.management_style)
        if (
            not plan
            or trade.initial_risk <= 0
            or trade.remaining_size <= 0
            or trade.management_state == "protective_scalp"
        ):
            return

        tp1_r = plan["tp1_r"]
        tp2_r = plan["tp2_r"]
        magnet_take_r = self._magnet_take_r(trade)
        first_entry_signal = trade.strategy in {"高1", "低1"}
        tp1_fraction = 0.50
        tp2_fraction = 0.25
        # P3: H1/L1 按入场时上下文分级管理
        # Brooks S6-channel: Spike 后 H1 = 最强入场，不该压低
        # BC/TR 中 H1 才该保守
        if self._family_key(trade) == "trend_recovery" and first_entry_signal:
            entry_state = str(trade.market_state or "").strip().lower()
            if entry_state in ("spike", "bo", "strong_bo"):
                # Spike/BO 后的 H1 = 最高概率趋势入场，按正常 swing 管理
                pass  # 保留 plan 原始 tp1_r/tp2_r
            elif entry_state in ("tc", "tight_channel"):
                # 强 TC 中 H1 有效性中高，稍微收紧
                tp1_r = min(tp1_r, 1.0)
                tp2_r = min(tp2_r, 2.0)
            else:
                # BC/TR/弱趋势中的 H1 才保守管理
                tp1_r = min(tp1_r, 0.8)
                tp2_r = min(tp2_r, 1.6)
                tp1_fraction = 0.60
                tp2_fraction = 0.15
        if magnet_take_r > 0 and self._family_key(trade) == "trend_recovery":
            if magnet_take_r < tp1_r:
                tp1_r = max(0.8, magnet_take_r)
            elif magnet_take_r < tp2_r:
                tp2_r = max(tp1_r + 0.15, magnet_take_r)
        elif magnet_take_r > 0 and trade.magnet_cluster_count >= 2:
            if magnet_take_r < tp1_r:
                tp1_r = max(0.8, magnet_take_r)
            elif magnet_take_r < tp2_r:
                tp2_r = max(tp1_r + 0.15, magnet_take_r)

        profit_r = self._profit_in_r(trade, candle.close)
        bars_without_progress = max(0, trade.bars_held - int(trade.best_price_bar or 0))
        style_key = self._style_key(trade.management_style)

        # 趋势恢复族一旦已经走出接近 1R，又长时间无推进，就先保护到保本，
        # 避免把原本接近成功的 PB 重新吐回成满损。
        # P3: Spike/BO 后的 H1 不该过早移保本 — Brooks: "过早移到保本 → 正常 PB 把你扫出去"
        entry_state_for_be = str(trade.market_state or "").strip().lower()
        if first_entry_signal and entry_state_for_be in ("spike", "bo", "strong_bo"):
            be_threshold = 0.85  # Spike 后 H1 给更多空间
        elif first_entry_signal:
            be_threshold = 0.55
        else:
            be_threshold = 0.75
        if (
            style_key in {"brooks_swing", "brooks_t4_wedge_pullback"}
            and not trade.tp1_done
            and profit_r >= be_threshold
            and bars_without_progress >= max(2, int(2 * TF_SCALE.get(trade.timeframe, 1)))
        ):
            self._update_stop_loss(trade, self._protective_stop(trade, 0.0))

        # Brooks 在 PB/通道里更强调把止损抬到 Major HL/LH，而不是死等固定 2R/3R。
        # 一旦已经有足够利润，优先让结构位接管保护。
        structure_stop = self._structure_stop_from_market(
            trade,
            candle,
            market_data,
            min_profit_r=0.50 if first_entry_signal else 0.65,
        )
        if structure_stop > 0:
            self._update_stop_loss(trade, structure_stop)

        # MTR 家族更符合“2R 兑现一半，余仓转保护”的语义。
        if style_key == "brooks_mtr_reversal" and not trade.tp1_done and profit_r >= 1.1:
            self._update_stop_loss(trade, self._protective_stop(trade, 0.15))

        if not trade.tp1_done and profit_r >= tp1_r:
            self._realize_partial(trade, self._price_at_r(trade, tp1_r), tp1_fraction, reason="TP")
            trade.tp1_done = True
            self._update_stop_loss(trade, self._protective_stop(trade, plan["protect1_r"]))

        trend_detail = ""
        if self._family_key(trade) == "trend_recovery":
            trend_detail = self._trend_recovery_detail(trade, market_data)
            if (
                trend_detail == "channel_to_tr"
                and trade.tp1_done
                and not trade.tp2_done
                and profit_r >= max(0.9, tp1_r)
                and bars_without_progress >= max(2, int(2 * TF_SCALE.get(trade.timeframe, 1)))
                and trade.remaining_size > 0.3
            ):
                self._realize_partial(trade, candle.close, 0.20, reason="REDUCE")
                trade.tp2_done = True
                self._update_stop_loss(trade, self._protective_stop(trade, 0.05))

        if not trade.tp2_done and profit_r >= tp2_r:
            self._realize_partial(trade, self._price_at_r(trade, tp2_r), tp2_fraction, reason="TP")
            trade.tp2_done = True
            self._update_stop_loss(trade, self._protective_stop(trade, plan["protect2_r"]))

        if trade.tp2_done and trade.remaining_size > 0:
            self._update_stop_loss(trade, self._trail_stop(trade, plan["trail_r"], plan["protect2_r"]))

        if style_key == "brooks_mtr_reversal" and trade.tp1_done and trade.remaining_size > 0:
            # MTR 本来就允许 2R 兑现；一旦兑现后没有继续形成顺畅延续，
            # 余仓应更快转成保护利润，而不是重新把优势吐回去。
            if bars_without_progress >= max(2, int(2 * TF_SCALE.get(trade.timeframe, 1))):
                self._update_stop_loss(trade, self._protective_stop(trade, 0.35))
                if (
                    profit_r >= 2.2
                    and not trade.tp2_done
                    and trade.remaining_size > 0.30
                ):
                    self._realize_partial(trade, candle.close, 0.15, reason="SCALP")
                    trade.tp2_done = True
                    self._update_stop_loss(trade, self._protective_stop(trade, 0.60))

    @staticmethod
    def _management_plan(management_style: str) -> dict[str, float] | None:
        """不同 Brooks 管理模板的分批参数。"""
        style_key = normalize_management_style(management_style)
        if style_key == "brooks_mtr_reversal":
            return {"tp1_r": 2.0, "tp2_r": 3.0, "protect1_r": 0.75, "protect2_r": 1.60, "trail_r": 1.05}
        if style_key == "brooks_t4_wedge_pullback":
            return {"tp1_r": 1.2, "tp2_r": 2.4, "protect1_r": 0.25, "protect2_r": 1.15, "trail_r": 0.95}
        if style_key == "brooks_r3_channel_line_fade":
            return {"tp1_r": 1.4, "tp2_r": 2.6, "protect1_r": 0.4, "protect2_r": 1.4, "trail_r": 0.95}
        if style_key == "brooks_tr4_daily_tr_fade":
            return {"tp1_r": 1.0, "tp2_r": 1.8, "protect1_r": 0.25, "protect2_r": 0.9, "trail_r": 0.7}
        if style_key == "brooks_s1_htf_sr_reversal":
            return {"tp1_r": 1.8, "tp2_r": 3.0, "protect1_r": 0.6, "protect2_r": 1.7, "trail_r": 1.1}
        if style_key == "brooks_s2_micro_channel":
            return {"tp1_r": 1.6, "tp2_r": 2.8, "protect1_r": 0.5, "protect2_r": 1.5, "trail_r": 1.0}
        if style_key == "brooks_climax_reversal":
            return {"tp1_r": 1.0, "tp2_r": 1.8, "protect1_r": 0.2, "protect2_r": 0.9, "trail_r": 0.75}
        if style_key == "brooks_swing":
            return {"tp1_r": 1.0, "tp2_r": 2.0, "protect1_r": 0.15, "protect2_r": 1.0, "trail_r": 1.0}
        if style_key == "brooks_breakout":
            return {"tp1_r": 2.0, "tp2_r": 3.5, "protect1_r": 0.8, "protect2_r": 2.0, "trail_r": 1.4}
        return None

    def _magnet_take_r(self, trade: Trade) -> float:
        """把最近推荐磁体换算成 R，用于多磁体簇提前部分止盈。"""
        target = float(trade.recommended_target or 0.0)
        if target <= 0 or trade.initial_risk <= 0:
            return 0.0
        distance = abs(target - trade.entry_price)
        if distance <= 0:
            return 0.0
        return distance / max(trade.initial_risk, 1e-9)

    def _profit_in_r(self, trade: Trade, price: float) -> float:
        """按初始风险计算当前浮盈的 R 倍数。"""
        risk = max(trade.initial_risk, 1e-9)
        if trade.direction == "BUY":
            return (price - trade.entry_price) / risk
        return (trade.entry_price - price) / risk

    def _protective_target_r(self, trade: Trade, default_r: float = 1.0) -> float:
        """前提转弱后，把余仓目标收回到更符合 Brooks 的保护性 scalp 目标。"""
        style_key = self._style_key(trade.management_style)
        target_r = default_r
        if style_key in BROOKS_TR_SCALP_STYLES:
            target_r = 0.8
        elif style_key in BROOKS_REVERSAL_STYLES:
            target_r = 1.0
        elif style_key == "brooks_breakout":
            target_r = 1.25
        elif style_key in BROOKS_TREND_STYLES:
            target_r = 1.1
        magnet_r = self._magnet_take_r(trade)
        if magnet_r > 0:
            target_r = min(target_r, max(0.55, magnet_r))
        return max(0.45, target_r)

    def _protective_lock_r(self, trade: Trade) -> float:
        """弱化管理下允许保护住的最小利润。"""
        family_key = self._family_key(trade)
        if family_key == "tr_scalp":
            return 0.05
        if family_key in {"mtr_reversal", "climax_reversal"}:
            return 0.15
        if family_key == "breakout_follow":
            return 0.20
        return 0.25

    def _protective_loss_cap_r(self, trade: Trade, reason: str) -> float:
        """弱化管理后允许保留的最大负向 R。"""
        family_key = self._family_key(trade)
        reason_key = str(reason or "").upper()
        if family_key == "trend_recovery":
            if reason_key == "FAILED_FT":
                return -0.15
            if reason_key == "WEAK_SCALP":
                return -0.20
            return -0.25
        if family_key == "mtr_reversal":
            if reason_key == "WEAK_SCALP":
                return -0.25
            return -0.35
        if family_key == "climax_reversal":
            return -0.30
        if family_key == "breakout_follow":
            if reason_key == "FAILED_FT":
                return -0.12
            return -0.20
        if family_key == "tr_scalp":
            return -0.15
        return -0.30

    def _update_take_profit_tighter(self, trade: Trade, new_take_profit: float) -> None:
        """只允许把目标收紧，不把目标无理由放远。"""
        candidate = float(new_take_profit or 0.0)
        if candidate <= 0:
            return
        current = float(trade.take_profit or 0.0)
        if trade.direction == "BUY":
            if current <= 0 or candidate < current:
                self._update_take_profit(trade, candidate)
            return
        if current <= 0 or candidate > current:
            self._update_take_profit(trade, candidate)

    def _manage_protective_scalp(self, trade: Trade, candle, market_data: dict | None) -> bool:
        """对保护性 scalp 进行更细的 Brooks 式管理。"""
        detail = str(trade.management_reason_detail or "")
        if not detail:
            return False
        current_reason = str(trade.management_reason or "").upper()
        scale = TF_SCALE.get(trade.timeframe, 1)
        profit_r = self._profit_in_r(trade, candle.close)
        best_r = self._profit_in_r(trade, trade.best_price or trade.entry_price)
        bars_without_progress = max(0, trade.bars_held - int(trade.best_price_bar or 0))
        bars_in_state = max(0, trade.bars_held - int(trade.management_state_bar or 0))
        plan = self._protective_detail_plan(detail)

        stale_bars = max(int(plan["stale_bars"] * scale), 1)
        force_exit_bars = max(int(plan["force_exit_bars"] * scale), stale_bars + 1)
        profit_exit_r = float(plan["profit_exit_r"])
        loss_exit_r = float(plan["loss_exit_r"])
        extra_partial_r = float(plan["extra_partial_r"])
        extra_partial_fraction = float(plan["extra_partial_fraction"])
        protect_r = float(plan["protect_r"])
        market_state = self._market_state_key(trade, market_data)
        route_style = str(trade.route_style or "").strip().lower()
        tr_context = market_state in {"tr", "tight_range", "broad_range", "bc"} or "tr_" in route_style
        strong_follow = bool(trade.follow_through or trade.higher_follow_through)
        reversal_confirmed = bool(trade.trendline_break_confirmed or trade.failed_breakout_evidence)
        allow_runner = (
            detail == "second_entry_profit"
            and strong_follow
            and bool(trade.target_path_clear)
            and not tr_context
        )

        # Brooks: first entry 失败更像 scratch；通道退化成 TR 更像把 swing 降成小 scalp。
        # 这两类都不该继续拖到保护性止损去决定结果。
        if detail == "first_entry_be":
            if bars_in_state >= stale_bars and bars_without_progress >= stale_bars and best_r >= 0.08 and profit_r >= -0.02:
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
        elif detail == "channel_to_tr":
            if bars_in_state >= stale_bars and bars_without_progress >= stale_bars and best_r >= 0.05 and profit_r >= 0.0:
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
        elif detail == "tr_scalp_protect":
            if (
                current_reason in {"PREMISE", "WEAK_SCALP"}
                and bars_in_state >= stale_bars
                and bars_without_progress >= stale_bars
                and best_r >= 0.03
                and profit_r >= -0.03
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if (
                bars_in_state >= stale_bars
                and best_r >= 0.08
                and profit_r >= 0.01
                and bars_without_progress >= stale_bars
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if bars_in_state >= stale_bars and bars_without_progress >= stale_bars and best_r >= 0.04 and profit_r >= -0.01:
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
        elif detail == "reversal_protect":
            if (
                current_reason in {"PREMISE", "WEAK_SCALP"}
                and not reversal_confirmed
                and bars_in_state >= stale_bars
                and bars_without_progress >= max(1, stale_bars - 1)
                and best_r >= 0.04
                and profit_r >= -0.04
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if (
                not reversal_confirmed
                and bars_in_state >= stale_bars
                and best_r >= 0.10
                and profit_r >= 0.0
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if bars_in_state >= stale_bars and bars_without_progress >= stale_bars and best_r >= 0.06 and profit_r >= -0.01:
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
        elif detail == "breakout_protect":
            if (
                current_reason == "FAILED_FT"
                and bars_in_state >= stale_bars
                and bars_without_progress >= stale_bars
                and best_r >= 0.04
                and profit_r >= -0.04
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if (
                (not strong_follow or not bool(trade.target_path_clear))
                and bars_in_state >= stale_bars
                and best_r >= 0.10
                and profit_r >= 0.0
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if bars_in_state >= stale_bars and bars_without_progress >= stale_bars and best_r >= 0.05 and profit_r >= -0.01:
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
        elif detail == "second_entry_profit":
            if (
                current_reason in {"PREMISE", "WEAK_SCALP"}
                and (tr_context or not strong_follow)
                and bars_in_state >= stale_bars
                and bars_without_progress >= stale_bars
                and best_r >= 0.08
                and profit_r >= -0.03
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if (
                (tr_context or not strong_follow)
                and bars_in_state >= stale_bars
                and best_r >= 0.18
                and profit_r >= 0.03
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True
            if bars_in_state >= stale_bars and bars_without_progress >= stale_bars and best_r >= 0.18 and profit_r >= 0.02:
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True

        if (
            profit_r >= extra_partial_r
            and bars_without_progress >= stale_bars
            and trade.remaining_size > 0.35
        ):
            self._realize_partial(trade, candle.close, extra_partial_fraction, reason="SCALP")
            self._update_stop_loss(trade, self._protective_stop(trade, protect_r))

        if (
            allow_runner
            and not trade.protective_runner_kept
            and bars_without_progress >= stale_bars
            and profit_r >= max(profit_exit_r, 0.18)
            and best_r >= max(extra_partial_r, 0.80)
            and trade.remaining_size > 0.22
        ):
            trim_size = max(0.0, trade.remaining_size - 0.18)
            if trim_size > 0.02:
                self._realize_partial(trade, candle.close, trim_size, reason="SCALP")
            trade.protective_runner_kept = True
            self._update_stop_loss(trade, self._protective_stop(trade, max(protect_r, 0.18)))
            structure_stop = self._structure_stop_from_market(
                trade,
                candle,
                market_data,
                min_profit_r=0.12,
            )
            if structure_stop > 0:
                self._update_stop_loss(trade, structure_stop)
            return False

        if trade.protective_runner_kept:
            structure_stop = self._structure_stop_from_market(
                trade,
                candle,
                market_data,
                min_profit_r=0.10,
            )
            if structure_stop > 0:
                self._update_stop_loss(trade, structure_stop)
            else:
                self._update_stop_loss(trade, self._trail_stop(trade, 0.85, max(protect_r, 0.18)))
            if (
                bars_in_state >= force_exit_bars * 2
                and bars_without_progress >= stale_bars * 2
                and profit_r < max(profit_exit_r, 0.15)
            ):
                self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
                return True

        if (
            bars_without_progress >= stale_bars
            and profit_r >= profit_exit_r
            and best_r >= max(profit_exit_r, extra_partial_r)
        ):
            self._close_trade(trade, candle.close, "SCALP", candle.timestamp)
            return True

        if (
            bars_in_state >= force_exit_bars
            and bars_without_progress >= stale_bars
            and profit_r < loss_exit_r
        ):
            exit_reason = str(trade.management_reason or "PREMISE")
            self._close_trade(trade, candle.close, exit_reason, candle.timestamp)
            return True

        if detail == "channel_to_tr":
            structure_stop = self._structure_stop_from_market(
                trade,
                candle,
                market_data,
                min_profit_r=0.20,
            )
            if structure_stop > 0:
                self._update_stop_loss(trade, structure_stop)
        return False

    def _activate_protective_scalp(
        self,
        trade: Trade,
        candle,
        *,
        reason: str,
        target_r: float = 0.0,
        partial_fraction: float = 0.0,
        detail: str = "",
        protect_r_override: float | None = None,
        loss_cap_override: float | None = None,
    ) -> None:
        """把原本的 swing / reversal 降级成保护性 scalp，而不是直接一刀切。"""
        already_protective = trade.management_state == "protective_scalp"
        # P0: 按家族自动补 detail，确保 _manage_protective_scalp 不会因 detail 为空而跳过。
        if not detail:
            family = self._family_key(trade)
            if family == "breakout_follow":
                detail = "breakout_protect"
            elif family in ("mtr_reversal", "climax_reversal"):
                detail = "reversal_protect"
            elif family == "tr_scalp":
                detail = "tr_scalp_protect"
            else:
                detail = "generic_protect"
        if not already_protective and partial_fraction > 0 and trade.remaining_size > 0.34:
            self._realize_partial(trade, candle.close, partial_fraction, reason="REDUCE")
        profit_r = self._profit_in_r(trade, candle.close)
        protect_r = self._protective_lock_r(trade)
        if target_r <= 0:
            target_r = self._protective_target_r(trade)
        self._update_take_profit_tighter(trade, self._price_at_r(trade, target_r))
        if protect_r_override is not None and profit_r >= protect_r_override:
            self._update_stop_loss(trade, self._protective_stop(trade, protect_r_override))
        elif profit_r >= max(protect_r, 0.15):
            self._update_stop_loss(trade, self._protective_stop(trade, protect_r))
        elif profit_r >= 0:
            self._update_stop_loss(trade, self._protective_stop(trade, 0.0))
        else:
            loss_cap_r = loss_cap_override if loss_cap_override is not None else self._protective_loss_cap_r(trade, reason)
            self._update_stop_loss(trade, self._protective_stop(trade, loss_cap_r))
        trade.management_state = "protective_scalp"
        if not already_protective:
            trade.management_state_bar = trade.bars_held
        elif int(trade.management_state_bar or 0) <= 0:
            trade.management_state_bar = trade.bars_held

        current_detail = str(trade.management_reason_detail or "")
        if not current_detail or current_detail == "generic_protect" or detail != "generic_protect":
            trade.management_reason_detail = detail
        current_reason = str(trade.management_reason or "")
        if not current_reason or current_reason == "ZOMBIE" or reason in {"FAILED_FT", "PREMISE"}:
            trade.management_reason = reason
        if not already_protective:
            trade.protective_runner_kept = False

    @staticmethod
    def _zombie_best_r_threshold(style_key: str) -> tuple[float, float]:
        """不同家族允许的最小推进幅度。"""
        if style_key in BROOKS_TR_SCALP_STYLES:
            return 0.25, 0.50
        if style_key in BROOKS_REVERSAL_STYLES:
            return 0.40, 0.80
        if style_key in BROOKS_TREND_STYLES:
            return 0.60, 1.00
        return 0.35, 0.70

    def _scalp_target_r(self, trade: Trade) -> float:
        """显式 scalp 风格只用结构化 scalp 目标，不再用时间衰减阈值。"""
        style_key = self._style_key(trade.management_style)
        target_r = 1.5 if style_key == "brooks_scalp" else 1.0
        magnet_r = self._magnet_take_r(trade)
        if magnet_r > 0:
            target_r = min(target_r, max(0.6, magnet_r))
        return max(0.6, target_r)

    def _price_at_r(self, trade: Trade, multiple: float) -> float:
        """把 R 倍数转成具体价格。"""
        risk = max(trade.initial_risk, 1e-9)
        if trade.direction == "BUY":
            return trade.entry_price + risk * multiple
        return trade.entry_price - risk * multiple

    def _protective_stop(self, trade: Trade, multiple: float) -> float:
        """生成保护性止损位，不再过早移到保本。"""
        target = self._price_at_r(trade, multiple)
        if trade.direction == "BUY":
            return max(trade.stop_loss, target)
        return min(trade.stop_loss, target)

    def _trail_stop(self, trade: Trade, trail_multiple: float, floor_multiple: float) -> float:
        """余仓使用有利方向极值做 trailing。"""
        risk = max(trade.initial_risk, 1e-9)
        floor_price = self._price_at_r(trade, floor_multiple)
        if trade.direction == "BUY":
            candidate = max(floor_price, trade.best_price - risk * trail_multiple)
            return max(trade.stop_loss, candidate)
        candidate = min(floor_price, trade.best_price + risk * trail_multiple)
        return min(trade.stop_loss, candidate)

    def _structure_stop_from_market(
        self,
        trade: Trade,
        candle,
        market_data: dict | None,
        *,
        min_profit_r: float,
    ) -> float:
        """趋势恢复优先用 Major HL/LH 保护利润。"""
        if not market_data or self._profit_in_r(trade, candle.close) < min_profit_r:
            return 0.0
        ab_sr = market_data.get("ab_sr", {}) if isinstance(market_data, dict) else {}
        major_hl = float((ab_sr or {}).get("major_hl") or 0.0)
        major_lh = float((ab_sr or {}).get("major_lh") or 0.0)
        if trade.direction == "BUY":
            if major_hl > trade.stop_loss and major_hl < candle.close:
                return major_hl
            return 0.0
        if major_lh < trade.stop_loss and major_lh > candle.close:
            return major_lh
        return 0.0

    def _realize_partial(self, trade: Trade, exit_price: float, size_fraction: float, *, reason: str = "PARTIAL") -> None:
        """按固定比例做部分止盈。"""
        size = min(max(size_fraction, 0.0), trade.remaining_size)
        if size <= 0:
            return
        trade.partial_close_count += 1
        pnl_pct, entry_cost_pct, exit_cost_pct = self._calc_trade_leg_pnl(trade, exit_price, reason)
        trade.realized_pnl_pct += pnl_pct * size
        trade.entry_cost_pct += entry_cost_pct * size
        trade.exit_cost_pct += exit_cost_pct * size
        trade.total_cost_pct += (entry_cost_pct + exit_cost_pct) * size
        trade.remaining_size = max(0.0, trade.remaining_size - size)

    def _close_trade(self, trade: Trade, exit_price: float, reason: str, exit_time) -> None:
        """把剩余仓位全部平掉并结算净收益。"""
        if trade.remaining_size > 0:
            remaining_pnl, entry_cost_pct, exit_cost_pct = self._calc_trade_leg_pnl(trade, exit_price, reason)
            trade.realized_pnl_pct += remaining_pnl * trade.remaining_size
            trade.entry_cost_pct += entry_cost_pct * trade.remaining_size
            trade.exit_cost_pct += exit_cost_pct * trade.remaining_size
            trade.total_cost_pct += (entry_cost_pct + exit_cost_pct) * trade.remaining_size
            trade.remaining_size = 0.0
        trade.exit_price = exit_price
        trade.pnl_pct = trade.realized_pnl_pct
        trade.exit_time = exit_time
        trade.exit_reason = reason
        if reason == "SCALP":
            if str(trade.management_state or "") == "protective_scalp":
                trade.profit_exit_type = "protective_scalp_runner" if trade.protective_runner_kept else "protective_scalp"
            else:
                trade.profit_exit_type = "plain_scalp"
        elif reason == "TP" and not trade.profit_exit_type:
            trade.profit_exit_type = self._classify_tp_exit_type(trade)
        elif reason == "SL" and not trade.trailing_exit_type:
            trade.trailing_exit_type = self._classify_stop_exit_type(trade)
        if trade.pnl_pct > 0.05:
            trade.result = "WIN"
        elif trade.pnl_pct < -0.05:
            trade.result = "LOSS"
        else:
            trade.result = "SCRATCH"

    def _get_max_bars(self, trade: Trade) -> int:
        """根据策略类型返回最大持仓K线数"""
        strategy = trade.strategy
        style_key = self._style_key(trade.management_style)
        if style_key == "brooks_t4_wedge_pullback":
            return max(self.max_holding_bars, 72)
        if style_key == "brooks_r3_channel_line_fade":
            return max(self.max_holding_bars, 84)
        if style_key == "brooks_tr4_daily_tr_fade":
            return max(self.max_holding_bars, 36)
        if style_key == "brooks_s1_htf_sr_reversal":
            return max(self.max_holding_bars, 96)
        if style_key == "brooks_s2_micro_channel":
            return max(self.max_holding_bars, 84)
        if style_key == "brooks_swing":
            return max(self.max_holding_bars, 96)
        if style_key == "brooks_mtr_reversal":
            return max(self.max_holding_bars, 72)
        if style_key == "brooks_climax_reversal":
            return max(self.max_holding_bars, 48)
        if style_key == "brooks_breakout":
            return max(self.max_holding_bars, 60)
        if style_key == "brooks_tr_blshs":
            return 24
        rush_strats = {"收线追进"}
        reversal_strats = {"双重顶", "双重底", "楔形顶", "楔形底",
                           "急速通道", "末端旗形"}
        if strategy in rush_strats:
            return 24  # 2h（动能衰竭快）
        elif strategy in reversal_strats:
            return 72  # 6h（反转需更多时间）
        return self.max_holding_bars  # 默认 48（4h）

    @staticmethod
    def _breakeven_trigger(management_style: str) -> float:
        """不同管理模板的保本触发倍数。"""
        style_key = normalize_management_style(management_style)
        if style_key == "brooks_mtr_reversal":
            return 0.7
        if style_key == "brooks_t4_wedge_pullback":
            return 0.8
        if style_key == "brooks_r3_channel_line_fade":
            return 0.75
        if style_key == "brooks_tr4_daily_tr_fade":
            return 0.55
        if style_key == "brooks_s1_htf_sr_reversal":
            return 0.9
        if style_key == "brooks_s2_micro_channel":
            return 0.8
        if style_key in {"brooks_climax_reversal", "brooks_tr_blshs"}:
            return 0.6
        if style_key in {"brooks_swing", "brooks_breakout"}:
            return 1.0
        return 0.7

    @staticmethod
    def _scalp_exit_enabled(management_style: str) -> bool:
        """只有显式 scalp 家族才允许使用结构化 scalp 出场。"""
        return normalize_management_style(management_style) in {"brooks_scalp", "brooks_tr_blshs"}

    def match_reentry(self, signal) -> dict | None:
        """检查当前信号是否满足同方向重入条件。"""
        watch = self.reentry_watch.get(signal.symbol)
        if not watch:
            return None
        if str(getattr(signal, "direction", "") or "") != str(watch.get("direction", "") or ""):
            return None
        if str(getattr(signal, "timeframe", "") or "") != str(watch.get("timeframe", "") or ""):
            return None
        extra = dict(getattr(signal, "extra", {}) or {})
        market_state = str(extra.get("market_state", "") or "")
        if not self._same_market_state_family(market_state, str(watch.get("market_state", "") or "")):
            return None
        return watch

    @staticmethod
    def _same_market_state_family(current: str, previous: str) -> bool:
        """强/弱同向趋势和宽/紧区间允许视作同一前提族。"""
        if not current or not previous or current == previous:
            return True
        bull_family = {"strong_trend_bull", "weak_trend_bull"}
        bear_family = {"strong_trend_bear", "weak_trend_bear"}
        range_family = {"tight_range", "broad_range"}
        return (
            (current in bull_family and previous in bull_family)
            or (current in bear_family and previous in bear_family)
            or (current in range_family and previous in range_family)
        )

    def _register_reentry_watch(self, trade: Trade) -> None:
        """止损后保留一次有限时间的同方向重入观察窗口。"""
        if trade.reentry_attempt >= 1:
            self.reentry_watch.pop(trade.symbol, None)
            return
        if trade.management_style not in BROOKS_REENTRY_STYLES:
            return
        # 只给“曾经证明过 premise”的交易保留重入窗口，
        # 避免把纯粹失败的入场反复重做成摊损。
        best_r = self._profit_in_r(trade, trade.best_price or trade.entry_price)
        if best_r < 0.25 and not trade.tp1_done:
            return
        self.reentry_watch[trade.symbol] = {
            "direction": trade.direction,
            "timeframe": trade.timeframe,
            "market_state": trade.market_state,
            "bars_remaining": self._reentry_window_bars(trade.timeframe),
            "next_attempt": trade.reentry_attempt + 1,
        }

    def _decay_reentry_watch(self, symbol: str) -> None:
        """每根 K 线推进一次重入窗口。"""
        watch = self.reentry_watch.get(symbol)
        if not watch:
            return
        watch["bars_remaining"] = int(watch.get("bars_remaining", 0) or 0) - 1
        if watch["bars_remaining"] <= 0:
            self.reentry_watch.pop(symbol, None)

    @staticmethod
    def _reentry_window_bars(timeframe: str) -> int:
        """对齐 patrol-l1 的重入观察窗口。"""
        if timeframe == "15m":
            return 3
        if timeframe == "1h":
            return 2
        return 5

    def has_position(self, symbol: str) -> bool:
        """检查是否有持仓"""
        return any(t.symbol == symbol for t in self.open_trades)
