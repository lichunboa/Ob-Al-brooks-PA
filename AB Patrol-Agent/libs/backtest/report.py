"""
回测报告 — 统计分析与输出
"""

import json
from dataclasses import dataclass, field
from typing import Any


def build_group_stats(trades: list[Any], key_getter) -> dict:
    """按指定维度构造分组统计。"""
    grouped: dict[str, dict[str, float | int]] = {}
    for trade in trades:
        key = str(key_getter(trade) or "UNKNOWN")
        bucket = grouped.setdefault(
            key,
            {
                "trades": 0,
                "wins": 0,
                "losses": 0,
                "scratches": 0,
                "pnl": 0.0,
                "gross_profit": 0.0,
                "gross_loss": 0.0,
            },
        )
        bucket["trades"] += 1
        bucket["pnl"] += trade.pnl_pct
        if trade.result == "WIN":
            bucket["wins"] += 1
            bucket["gross_profit"] += max(0.0, float(trade.pnl_pct))
        elif trade.result == "LOSS":
            bucket["losses"] += 1
            bucket["gross_loss"] += abs(min(0.0, float(trade.pnl_pct)))
        else:
            bucket["scratches"] += 1

    for bucket in grouped.values():
        trades_count = int(bucket["trades"])
        wins = int(bucket["wins"])
        gross_profit = float(bucket["gross_profit"])
        gross_loss = float(bucket["gross_loss"])
        bucket["win_rate"] = wins / trades_count * 100 if trades_count else 0.0
        bucket["profit_factor"] = gross_profit / gross_loss if gross_loss > 0 else (999.0 if gross_profit > 0 else 0.0)

    return grouped


@dataclass
class BacktestResult:
    """回测结果"""
    symbol: str
    total_trades: int = 0
    wins: int = 0
    losses: int = 0
    scratches: int = 0
    win_rate: float = 0.0
    total_pnl: float = 0.0
    avg_win: float = 0.0
    avg_loss: float = 0.0
    best_trade: float = 0.0
    worst_trade: float = 0.0
    max_drawdown: float = 0.0
    profit_factor: float = 0.0
    initial_capital: float = 10000.0
    ending_equity: float = 10000.0
    account_return_pct: float = 0.0
    account_max_drawdown: float = 0.0
    account_total_pnl_amount: float = 0.0

    # 信号统计
    signals_generated: int = 0
    signals_passed: int = 0
    signals_blocked_bg: int = 0
    signals_blocked_score: int = 0
    signals_blocked_rr: int = 0
    signals_blocked_strategy: int = 0
    signals_blocked_route: int = 0
    route_block_reasons: dict = field(default_factory=dict)
    entry_block_reasons: dict = field(default_factory=dict)
    route_block_by_strategy: dict = field(default_factory=dict)
    entry_block_by_strategy: dict = field(default_factory=dict)
    signals_generated_by_strategy: dict = field(default_factory=dict)
    signals_passed_by_strategy: dict = field(default_factory=dict)
    signals_blocked_strategy_by_strategy: dict = field(default_factory=dict)

    # 配置
    threshold: int = 80
    days: int = 0

    # 分组统计
    by_strategy: dict = field(default_factory=dict)
    by_background: dict = field(default_factory=dict)
    by_direction: dict = field(default_factory=dict)
    by_exit_reason: dict = field(default_factory=dict)

    # 交易列表
    trades: list = field(default_factory=list)

    @classmethod
    def from_exchange(cls, exchange, symbol: str, threshold: int = 80,
                      signals_generated: int = 0, signals_passed: int = 0,
                      signals_blocked_bg: int = 0, signals_blocked_score: int = 0,
                      signals_blocked_rr: int = 0, signals_blocked_strategy: int = 0,
                      signals_blocked_route: int = 0,
                      route_block_reasons: dict | None = None,
                      route_block_by_strategy: dict | None = None,
                      entry_block_reasons: dict | None = None,
                      entry_block_by_strategy: dict | None = None,
                      signals_generated_by_strategy: dict | None = None,
                      signals_passed_by_strategy: dict | None = None,
                      signals_blocked_strategy_by_strategy: dict | None = None,
                      days: int = 0,
                      initial_capital: float = 10000.0) -> "BacktestResult":
        """从 SimExchange 生成结果"""
        trades = sorted(
            exchange.closed_trades,
            key=lambda trade: (str(trade.exit_time or ""), str(trade.entry_time or "")),
        )
        if not trades:
            return cls(
                symbol=symbol,
                threshold=threshold,
                days=days,
                signals_generated=signals_generated,
                initial_capital=initial_capital,
                ending_equity=initial_capital,
                route_block_reasons=dict(route_block_reasons or {}),
                route_block_by_strategy=dict(route_block_by_strategy or {}),
                entry_block_reasons=dict(entry_block_reasons or {}),
                entry_block_by_strategy=dict(entry_block_by_strategy or {}),
                signals_generated_by_strategy=dict(signals_generated_by_strategy or {}),
                signals_passed_by_strategy=dict(signals_passed_by_strategy or {}),
                signals_blocked_strategy_by_strategy=dict(signals_blocked_strategy_by_strategy or {}),
            )

        wins = [t for t in trades if t.result == "WIN"]
        losses = [t for t in trades if t.result == "LOSS"]
        scratches = [t for t in trades if t.result == "SCRATCH"]

        total_pnl = sum(t.pnl_pct for t in trades)
        win_rate = len(wins) / len(trades) * 100 if trades else 0

        # 价格口径最大回撤
        equity_curve = []
        running = 0.0
        peak = 0.0
        max_dd = 0.0
        for t in trades:
            running += t.pnl_pct
            equity_curve.append(running)
            if running > peak:
                peak = running
            dd = peak - running
            if dd > max_dd:
                max_dd = dd

        # 盈亏因子
        gross_profit = sum(t.pnl_pct for t in wins) if wins else 0
        gross_loss = abs(sum(t.pnl_pct for t in losses)) if losses else 0
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float("inf") if gross_profit > 0 else 0

        # 账户口径权益曲线
        equity = float(initial_capital or 0.0)
        peak_equity = equity
        account_max_dd = 0.0
        for trade in trades:
            price_risk_pct = (
                abs(float(trade.initial_risk or 0.0)) / float(trade.entry_price or 1.0) * 100
                if float(trade.entry_price or 0.0) > 0
                else 0.0
            )
            risk_percent = max(float(trade.risk_percent or 0.0), 0.0)
            trade.equity_before = equity
            trade.risk_amount = equity * risk_percent / 100
            trade.position_size_estimate = (
                trade.risk_amount / abs(float(trade.initial_risk or 0.0))
                if abs(float(trade.initial_risk or 0.0)) > 0
                else 0.0
            )
            trade.position_notional_estimate = trade.position_size_estimate * float(trade.entry_price or 0.0)
            trade.r_multiple = float(trade.pnl_pct or 0.0) / price_risk_pct if price_risk_pct > 0 else 0.0
            trade.account_pnl_pct = trade.r_multiple * risk_percent
            trade.account_pnl_amount = equity * trade.account_pnl_pct / 100
            equity += trade.account_pnl_amount
            trade.equity_after = equity
            if equity > peak_equity:
                peak_equity = equity
            drawdown_pct = (peak_equity - equity) / peak_equity * 100 if peak_equity > 0 else 0.0
            if drawdown_pct > account_max_dd:
                account_max_dd = drawdown_pct

        account_total_pnl_amount = equity - initial_capital
        account_return_pct = account_total_pnl_amount / initial_capital * 100 if initial_capital > 0 else 0.0

        # 按维度分组
        by_strategy = build_group_stats(trades, lambda trade: trade.strategy)
        by_background = build_group_stats(trades, lambda trade: trade.background)
        by_direction = build_group_stats(trades, lambda trade: trade.direction)
        by_exit_reason = build_group_stats(trades, lambda trade: trade.exit_reason)

        return cls(
            symbol=symbol,
            total_trades=len(trades),
            wins=len(wins),
            losses=len(losses),
            scratches=len(scratches),
            win_rate=win_rate,
            total_pnl=total_pnl,
            avg_win=sum(t.pnl_pct for t in wins) / len(wins) if wins else 0,
            avg_loss=sum(t.pnl_pct for t in losses) / len(losses) if losses else 0,
            best_trade=max(t.pnl_pct for t in trades),
            worst_trade=min(t.pnl_pct for t in trades),
            max_drawdown=max_dd,
            profit_factor=profit_factor,
            initial_capital=initial_capital,
            ending_equity=equity,
            account_return_pct=account_return_pct,
            account_max_drawdown=account_max_dd,
            account_total_pnl_amount=account_total_pnl_amount,
            signals_generated=signals_generated,
            signals_passed=signals_passed,
            signals_blocked_bg=signals_blocked_bg,
            signals_blocked_score=signals_blocked_score,
            signals_blocked_rr=signals_blocked_rr,
            signals_blocked_strategy=signals_blocked_strategy,
            signals_blocked_route=signals_blocked_route,
            route_block_reasons=dict(route_block_reasons or {}),
            route_block_by_strategy=dict(route_block_by_strategy or {}),
            entry_block_reasons=dict(entry_block_reasons or {}),
            entry_block_by_strategy=dict(entry_block_by_strategy or {}),
            signals_generated_by_strategy=dict(signals_generated_by_strategy or {}),
            signals_passed_by_strategy=dict(signals_passed_by_strategy or {}),
            signals_blocked_strategy_by_strategy=dict(signals_blocked_strategy_by_strategy or {}),
            threshold=threshold,
            days=days,
            by_strategy=by_strategy,
            by_background=by_background,
            by_direction=by_direction,
            by_exit_reason=by_exit_reason,
            trades=[{
                "symbol": t.symbol, "direction": t.direction, "strategy": t.strategy,
                "entry_price": t.entry_price, "exit_price": t.exit_price,
                "pnl_pct": round(t.pnl_pct, 4), "result": t.result,
                "score": t.score, "background": t.background,
                "exit_reason": t.exit_reason, "bars_held": t.bars_held,
                "entry_type": t.entry_type,
                "entry_trigger": t.entry_trigger,
                "signal_bar_high": t.signal_bar_high,
                "signal_bar_low": t.signal_bar_low,
                "market_state": t.market_state,
                "higher_timeframe": t.higher_timeframe,
                "higher_market_state": t.higher_market_state,
                "follow_through": t.follow_through,
                "higher_follow_through": t.higher_follow_through,
                "trendline_break_confirmed": t.trendline_break_confirmed,
                "failed_breakout_evidence": t.failed_breakout_evidence,
                "signal_bar_quality": round(t.signal_bar_quality, 4),
                "signal_bar_tail_ratio": round(t.signal_bar_tail_ratio, 4),
                "signal_bar_close_position": round(t.signal_bar_close_position, 4),
                "reclaimed_prior_close": t.reclaimed_prior_close,
                "broke_micro_extreme": t.broke_micro_extreme,
                "requires_second_entry": t.requires_second_entry,
                "acceptance_ready": t.acceptance_ready,
                "executable_signal_ready": t.executable_signal_ready,
                "candidate_stage": t.candidate_stage,
                "nearest_support": t.nearest_support,
                "nearest_resistance": t.nearest_resistance,
                "target_path_clear": t.target_path_clear,
                "stop_structure_ok": t.stop_structure_ok,
                "actual_to_perfect_risk_ratio": round(t.actual_to_perfect_risk_ratio, 4),
                "first_target_distance_r": round(t.first_target_distance_r, 4),
                "blocking_magnet_distance_r": round(t.blocking_magnet_distance_r, 4),
                "trapped_side": t.trapped_side,
                "prior_leg_context": t.prior_leg_context,
                "prior_leg_bars": t.prior_leg_bars,
                "prior_leg_overlap_ratio": round(t.prior_leg_overlap_ratio, 4),
                "playbook_id": t.playbook_id,
                "playbook_family": t.playbook_family,
                "order_bias": t.order_bias,
                "signal_stage": t.signal_stage,
                "signal_stage_reason": t.signal_stage_reason,
                "management_style": t.management_style, "route_style": t.route_style,
                "reentry_attempt": t.reentry_attempt,
                "risk_percent": round(t.risk_percent, 4),
                "initial_risk": round(t.initial_risk, 6),
                "r_multiple": round(t.r_multiple, 4),
                "account_pnl_pct": round(t.account_pnl_pct, 4),
                "account_pnl_amount": round(t.account_pnl_amount, 4),
                "equity_before": round(t.equity_before, 4),
                "equity_after": round(t.equity_after, 4),
                "risk_amount": round(t.risk_amount, 4),
                "position_size_estimate": round(t.position_size_estimate, 8),
                "position_notional_estimate": round(t.position_notional_estimate, 4),
                "entry_time": str(t.entry_time), "exit_time": str(t.exit_time),
            } for t in trades],
        )

    def print_report(self):
        """打印回测报告"""
        print(f"\n{'='*60}")
        print(f"  回测报告 — {self.symbol}")
        print(f"{'='*60}")

        if self.total_trades == 0:
            print("  无交易记录")
            print(f"  信号生成: {self.signals_generated}")
            return

        print("\n  === 信号统计 ===")
        print(f"  信号生成: {self.signals_generated}")
        print(f"  信号通过: {self.signals_passed}")
        print(f"  背景拦截: {self.signals_blocked_bg}")
        print(f"  评分拦截: {self.signals_blocked_score}")
        print(f"  入场/管理拦截: {self.signals_blocked_rr}")
        print(f"  策略过滤拦截: {self.signals_blocked_strategy}")
        print(f"  路由拦截: {self.signals_blocked_route}")
        if self.route_block_reasons:
            print("  路由主因:")
            for reason, count in sorted(self.route_block_reasons.items(), key=lambda item: (-item[1], item[0]))[:5]:
                print(f"    - {reason}: {count}")
        if self.entry_block_reasons:
            print("  入场主因:")
            for reason, count in sorted(self.entry_block_reasons.items(), key=lambda item: (-item[1], item[0]))[:5]:
                print(f"    - {reason}: {count}")
        if self.signals_generated_by_strategy:
            print("  策略机会:")
            ranked = sorted(
                self.signals_generated_by_strategy.items(),
                key=lambda item: (-item[1], item[0]),
            )
            for strategy, generated in ranked[:8]:
                passed = int(self.signals_passed_by_strategy.get(strategy, 0) or 0)
                filtered = int(self.signals_blocked_strategy_by_strategy.get(strategy, 0) or 0)
                print(f"    - {strategy}: 生成{generated} | 通过{passed} | 过滤{filtered}")
        print(f"  评分阈值: {self.threshold}")

        print("\n  === 交易统计 ===")
        print(f"  总交易: {self.total_trades}")
        print(f"  胜: {self.wins} | 负: {self.losses} | 平: {self.scratches}")
        print(f"  胜率: {self.win_rate:.1f}%")
        print(f"  总盈亏: {self.total_pnl:+.2f}%")
        print(f"  平均盈利: +{self.avg_win:.2f}%")
        print(f"  平均亏损: {self.avg_loss:.2f}%")
        print(f"  最佳: +{self.best_trade:.2f}% | 最差: {self.worst_trade:.2f}%")
        print(f"  最大回撤: {self.max_drawdown:.2f}%")
        print(f"  盈亏因子: {self.profit_factor:.2f}")
        print(f"  初始资金: ${self.initial_capital:,.2f} | 期末权益: ${self.ending_equity:,.2f}")
        print(f"  账户收益: {self.account_return_pct:+.2f}% | 账户最大回撤: {self.account_max_drawdown:.2f}%")

        if self.by_direction:
            print("\n  === 按方向 ===")
            for d, s in self.by_direction.items():
                print(
                    f"  {d}: {s['trades']}笔 | 胜率{s['win_rate']:.0f}% | "
                    f"PF {s['profit_factor']:.2f} | PnL {s['pnl']:+.2f}%"
                )

        if self.by_background:
            print("\n  === 按背景 ===")
            for bg, s in sorted(self.by_background.items()):
                print(
                    f"  {bg}: {s['trades']}笔 | 胜率{s['win_rate']:.0f}% | "
                    f"PF {s['profit_factor']:.2f} | PnL {s['pnl']:+.2f}%"
                )

        if self.by_strategy:
            print("\n  === 按策略 ===")
            for strat, s in sorted(self.by_strategy.items(), key=lambda x: x[1]["pnl"], reverse=True):
                print(
                    f"  {strat}: {s['trades']}笔 | 胜率{s['win_rate']:.0f}% | "
                    f"PF {s['profit_factor']:.2f} | PnL {s['pnl']:+.2f}%"
                )

        if self.by_exit_reason:
            print("\n  === 按平仓原因 ===")
            for reason, s in self.by_exit_reason.items():
                print(
                    f"  {reason}: {s['trades']}笔 | 胜率{s['win_rate']:.0f}% | "
                    f"PF {s['profit_factor']:.2f} | PnL {s['pnl']:+.2f}%"
                )

        print(f"\n{'='*60}")

    def to_json(self, filepath: str = None) -> str:
        """导出 JSON"""
        data = {
            "symbol": self.symbol,
            "threshold": self.threshold,
            "days": self.days,
            "summary": {
                "total_trades": self.total_trades,
                "wins": self.wins,
                "losses": self.losses,
                "win_rate": round(self.win_rate, 2),
                "total_pnl": round(self.total_pnl, 4),
                "avg_win": round(self.avg_win, 4),
                "avg_loss": round(self.avg_loss, 4),
                "best_trade": round(self.best_trade, 4),
                "worst_trade": round(self.worst_trade, 4),
                "max_drawdown": round(self.max_drawdown, 4),
                "profit_factor": round(self.profit_factor, 2),
                "initial_capital": round(self.initial_capital, 4),
                "ending_equity": round(self.ending_equity, 4),
                "account_return_pct": round(self.account_return_pct, 4),
                "account_max_drawdown": round(self.account_max_drawdown, 4),
                "account_total_pnl_amount": round(self.account_total_pnl_amount, 4),
            },
            "signals": {
                "generated": self.signals_generated,
                "passed": self.signals_passed,
                "blocked_bg": self.signals_blocked_bg,
                "blocked_score": self.signals_blocked_score,
                "blocked_rr": self.signals_blocked_rr,
                "blocked_strategy": self.signals_blocked_strategy,
                "blocked_route": self.signals_blocked_route,
                "route_block_reasons": self.route_block_reasons,
                "route_block_by_strategy": self.route_block_by_strategy,
                "entry_block_reasons": self.entry_block_reasons,
                "entry_block_by_strategy": self.entry_block_by_strategy,
                "generated_by_strategy": self.signals_generated_by_strategy,
                "passed_by_strategy": self.signals_passed_by_strategy,
                "blocked_strategy_by_strategy": self.signals_blocked_strategy_by_strategy,
            },
            "by_strategy": self.by_strategy,
            "by_background": self.by_background,
            "by_direction": self.by_direction,
            "by_exit_reason": self.by_exit_reason,
            "trades": self.trades,
        }
        json_str = json.dumps(data, indent=2, ensure_ascii=False, default=str)
        if filepath:
            with open(filepath, "w") as f:
                f.write(json_str)
            print(f"  结果已保存到: {filepath}")
        return json_str
