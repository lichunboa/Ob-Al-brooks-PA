"""
回测报告 — 统计分析与输出
"""

import json
from dataclasses import dataclass, field
from typing import Optional


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

    # 信号统计
    signals_generated: int = 0
    signals_passed: int = 0
    signals_blocked_bg: int = 0
    signals_blocked_score: int = 0
    signals_blocked_rr: int = 0

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
                      signals_blocked_rr: int = 0, days: int = 0) -> "BacktestResult":
        """从 SimExchange 生成结果"""
        trades = exchange.closed_trades
        if not trades:
            return cls(symbol=symbol, threshold=threshold, days=days,
                       signals_generated=signals_generated)

        wins = [t for t in trades if t.result == "WIN"]
        losses = [t for t in trades if t.result == "LOSS"]
        scratches = [t for t in trades if t.result == "SCRATCH"]

        total_pnl = sum(t.pnl_pct for t in trades)
        win_rate = len(wins) / len(trades) * 100 if trades else 0

        # 最大回撤
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

        # 按维度分组
        by_strategy = {}
        by_background = {}
        by_direction = {}
        by_exit_reason = {}

        for t in trades:
            for group, key in [(by_strategy, t.strategy), (by_background, t.background),
                               (by_direction, t.direction), (by_exit_reason, t.exit_reason)]:
                if key not in group:
                    group[key] = {"trades": 0, "wins": 0, "pnl": 0.0}
                group[key]["trades"] += 1
                if t.result == "WIN":
                    group[key]["wins"] += 1
                group[key]["pnl"] += t.pnl_pct

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
            signals_generated=signals_generated,
            signals_passed=signals_passed,
            signals_blocked_bg=signals_blocked_bg,
            signals_blocked_score=signals_blocked_score,
            signals_blocked_rr=signals_blocked_rr,
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

        print(f"\n  === 信号统计 ===")
        print(f"  信号生成: {self.signals_generated}")
        print(f"  信号通过: {self.signals_passed}")
        print(f"  背景拦截: {self.signals_blocked_bg}")
        print(f"  评分拦截: {self.signals_blocked_score}")
        print(f"  盈亏比拦截: {self.signals_blocked_rr}")
        print(f"  评分阈值: {self.threshold}")

        print(f"\n  === 交易统计 ===")
        print(f"  总交易: {self.total_trades}")
        print(f"  胜: {self.wins} | 负: {self.losses} | 平: {self.scratches}")
        print(f"  胜率: {self.win_rate:.1f}%")
        print(f"  总盈亏: {self.total_pnl:+.2f}%")
        print(f"  平均盈利: +{self.avg_win:.2f}%")
        print(f"  平均亏损: {self.avg_loss:.2f}%")
        print(f"  最佳: +{self.best_trade:.2f}% | 最差: {self.worst_trade:.2f}%")
        print(f"  最大回撤: {self.max_drawdown:.2f}%")
        print(f"  盈亏因子: {self.profit_factor:.2f}")

        if self.by_direction:
            print(f"\n  === 按方向 ===")
            for d, s in self.by_direction.items():
                wr = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
                print(f"  {d}: {s['trades']}笔 | 胜率{wr:.0f}% | PnL {s['pnl']:+.2f}%")

        if self.by_background:
            print(f"\n  === 按背景 ===")
            for bg, s in sorted(self.by_background.items()):
                wr = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
                print(f"  {bg}: {s['trades']}笔 | 胜率{wr:.0f}% | PnL {s['pnl']:+.2f}%")

        if self.by_strategy:
            print(f"\n  === 按策略 ===")
            for strat, s in sorted(self.by_strategy.items(), key=lambda x: x[1]["pnl"], reverse=True):
                wr = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
                print(f"  {strat}: {s['trades']}笔 | 胜率{wr:.0f}% | PnL {s['pnl']:+.2f}%")

        if self.by_exit_reason:
            print(f"\n  === 按平仓原因 ===")
            for reason, s in self.by_exit_reason.items():
                wr = s["wins"] / s["trades"] * 100 if s["trades"] > 0 else 0
                print(f"  {reason}: {s['trades']}笔 | 胜率{wr:.0f}% | PnL {s['pnl']:+.2f}%")

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
            },
            "signals": {
                "generated": self.signals_generated,
                "passed": self.signals_passed,
                "blocked_bg": self.signals_blocked_bg,
                "blocked_score": self.signals_blocked_score,
                "blocked_rr": self.signals_blocked_rr,
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
