"""
回测引擎

独立的回测引擎，不依赖 sim_server，直接使用规则引擎。
可以快速验证策略参数和持仓管理逻辑。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from utils import safe_float, utc_now


@dataclass
class BacktestBar:
    """回测 K 线"""
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    
    @property
    def is_bull(self) -> bool:
        return self.close > self.open
    
    @property
    def is_bear(self) -> bool:
        return self.close < self.open
    
    @property
    def body_size(self) -> float:
        return abs(self.close - self.open)
    
    @property
    def range(self) -> float:
        return self.high - self.low
    
    @property
    def body_ratio(self) -> float:
        return self.body_size / self.range if self.range > 0 else 0


@dataclass
class BacktestPosition:
    """回测持仓"""
    symbol: str
    side: str  # BUY/SELL
    entry_price: float
    stop_loss: float
    take_profit: float
    quantity: float
    entry_time: str
    style: str  # Scalp/Swing/反转试探
    premise: str
    playbook: str
    
    # 分批止盈标记
    tp1_executed: bool = False
    tp2_executed: bool = False
    tp3_executed: bool = False
    
    # 持仓管理
    current_sl: float = 0.0
    current_quantity: float = 0.0
    
    def __post_init__(self):
        if self.current_sl == 0.0:
            self.current_sl = self.stop_loss
        if self.current_quantity == 0.0:
            self.current_quantity = self.quantity


@dataclass
class BacktestTrade:
    """回测交易记录"""
    symbol: str
    side: str
    entry_price: float
    exit_price: float
    quantity: float
    entry_time: str
    exit_time: str
    pnl: float
    pnl_pct: float
    style: str
    playbook: str
    premise: str
    exit_reason: str  # TP/SL/PREMISE_FAIL/MANUAL
    duration_minutes: int


@dataclass
class BacktestState:
    """回测状态"""
    balance: float = 10000.0
    equity: float = 10000.0
    positions: list[BacktestPosition] = field(default_factory=list)
    trades: list[BacktestTrade] = field(default_factory=list)
    
    # 统计
    total_signals: int = 0
    total_entries: int = 0
    total_exits: int = 0
    
    # 分类统计
    scalp_count: int = 0
    swing_count: int = 0
    reversal_count: int = 0
    
    wins: int = 0
    losses: int = 0
    
    # Premise Check 统计
    premise_failures: int = 0
    trailing_sl_count: int = 0
    partial_close_count: int = 0


class BacktestEngine:
    """回测引擎"""
    
    def __init__(self, initial_balance: float = 10000.0, risk_pct: float = 0.3):
        self.state = BacktestState(balance=initial_balance, equity=initial_balance)
        self.risk_pct = risk_pct
        self.bars: list[BacktestBar] = []
        self.current_time = ""
    
    def load_bars(self, bars_data: list[dict[str, Any]]):
        """加载 K 线数据"""
        self.bars = []
        for b in bars_data:
            bar = BacktestBar(
                time=b.get("time", ""),
                open=safe_float(b.get("O", b.get("open")), 0),
                high=safe_float(b.get("H", b.get("high")), 0),
                low=safe_float(b.get("L", b.get("low")), 0),
                close=safe_float(b.get("C", b.get("close")), 0),
                volume=safe_float(b.get("V", b.get("volume")), 0),
            )
            self.bars.append(bar)
    
    def calculate_position_size(self, entry_price: float, stop_loss: float) -> float:
        """计算仓位大小"""
        risk_amount = self.state.balance * (self.risk_pct / 100)
        price_risk = abs(entry_price - stop_loss)
        if price_risk <= 0:
            return 0.0
        
        # 数量 = 风险金额 / 价格风险
        quantity = risk_amount / price_risk
        return quantity
    
    def open_position(
        self,
        symbol: str,
        side: str,
        entry_price: float,
        stop_loss: float,
        take_profit: float,
        style: str,
        premise: str,
        playbook: str,
    ) -> bool:
        """开仓"""
        # 检查是否已有持仓
        if self.state.positions:
            return False
        
        # 计算仓位
        quantity = self.calculate_position_size(entry_price, stop_loss)
        if quantity <= 0:
            return False
        
        # 创建持仓
        position = BacktestPosition(
            symbol=symbol,
            side=side,
            entry_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            quantity=quantity,
            entry_time=self.current_time,
            style=style,
            premise=premise,
            playbook=playbook,
        )
        
        self.state.positions.append(position)
        self.state.total_entries += 1
        
        # 统计
        if style == "Scalp":
            self.state.scalp_count += 1
        elif style == "Swing":
            self.state.swing_count += 1
        elif style == "反转试探":
            self.state.reversal_count += 1
        
        return True
    
    def close_position(
        self,
        position: BacktestPosition,
        exit_price: float,
        exit_reason: str,
        partial_ratio: float = 1.0,
    ):
        """平仓（支持部分平仓）"""
        close_quantity = position.current_quantity * partial_ratio
        
        # 计算盈亏
        if position.side == "BUY":
            pnl = (exit_price - position.entry_price) * close_quantity
        else:
            pnl = (position.entry_price - exit_price) * close_quantity
        
        pnl_pct = pnl / (position.entry_price * close_quantity) * 100
        
        # 计算持续时间
        try:
            entry_dt = datetime.fromisoformat(position.entry_time.replace("Z", "+00:00"))
            exit_dt = datetime.fromisoformat(self.current_time.replace("Z", "+00:00"))
            duration = int((exit_dt - entry_dt).total_seconds() / 60)
        except:
            duration = 0
        
        # 记录交易
        trade = BacktestTrade(
            symbol=position.symbol,
            side=position.side,
            entry_price=position.entry_price,
            exit_price=exit_price,
            quantity=close_quantity,
            entry_time=position.entry_time,
            exit_time=self.current_time,
            pnl=pnl,
            pnl_pct=pnl_pct,
            style=position.style,
            playbook=position.playbook,
            premise=position.premise,
            exit_reason=exit_reason,
            duration_minutes=duration,
        )
        
        self.state.trades.append(trade)
        self.state.total_exits += 1
        
        # 更新余额
        self.state.balance += pnl
        
        # 统计
        if pnl > 0:
            self.state.wins += 1
        else:
            self.state.losses += 1
        
        # 更新持仓
        if partial_ratio >= 1.0:
            # 全部平仓
            self.state.positions.remove(position)
        else:
            # 部分平仓
            position.current_quantity -= close_quantity
            self.state.partial_close_count += 1
    
    def check_sl_tp(self, bar: BacktestBar):
        """检查止损/止盈"""
        for position in self.state.positions[:]:  # 复制列表，避免修改时出错
            if position.side == "BUY":
                # 做多：检查止损和止盈
                if bar.low <= position.current_sl:
                    self.close_position(position, position.current_sl, "SL")
                elif bar.high >= position.take_profit:
                    self.close_position(position, position.take_profit, "TP")
            else:
                # 做空：检查止损和止盈
                if bar.high >= position.current_sl:
                    self.close_position(position, position.current_sl, "SL")
                elif bar.low <= position.take_profit:
                    self.close_position(position, position.take_profit, "TP")
    
    def update_equity(self, current_price: float):
        """更新权益"""
        unrealized_pnl = 0.0
        for position in self.state.positions:
            if position.side == "BUY":
                pnl = (current_price - position.entry_price) * position.current_quantity
            else:
                pnl = (position.entry_price - current_price) * position.current_quantity
            unrealized_pnl += pnl
        
        self.state.equity = self.state.balance + unrealized_pnl
    
    def run(
        self,
        signal_generator,
        position_manager=None,
        start_index: int = 100,
    ) -> dict[str, Any]:
        """
        运行回测
        
        Args:
            signal_generator: 信号生成器函数，接收 bars 返回信号
            position_manager: 持仓管理器函数，接收 position 和 market_data 返回管理决策
            start_index: 从第几根 K 线开始（需要足够的历史数据）
        """
        if len(self.bars) < start_index:
            return {"error": "K 线数据不足"}
        
        for i in range(start_index, len(self.bars)):
            current_bar = self.bars[i]
            self.current_time = current_bar.time
            
            # 1. 检查止损/止盈
            self.check_sl_tp(current_bar)
            
            # 2. 持仓管理
            if self.state.positions and position_manager:
                for position in self.state.positions[:]:
                    market_data = {
                        "current_price": current_bar.close,
                        "recent_bars": self.bars[max(0, i-20):i+1],
                        # 这里可以添加更多市场数据
                    }
                    
                    decision = position_manager(position, market_data)
                    action = decision.get("action", "HOLD")
                    
                    if action == "CLOSE":
                        self.close_position(position, current_bar.close, "PREMISE_FAIL")
                        self.state.premise_failures += 1
                    elif action == "REDUCE":
                        self.close_position(position, current_bar.close, "REDUCE", 0.5)
                    elif action == "TRAIL_SL":
                        new_sl = decision.get("params", {}).get("new_sl")
                        if new_sl:
                            position.current_sl = new_sl
                            self.state.trailing_sl_count += 1
                    elif action == "PARTIAL_CLOSE":
                        ratio = decision.get("params", {}).get("close_ratio", 0.5)
                        self.close_position(position, current_bar.close, "PARTIAL_TP", ratio)
            
            # 3. 寻找新信号（只在无持仓时）
            if not self.state.positions:
                bars_window = self.bars[max(0, i-100):i+1]
                signal = signal_generator(bars_window)
                
                if signal:
                    self.state.total_signals += 1
                    
                    # 开仓
                    self.open_position(
                        symbol=signal.get("symbol", "BTCUSDT"),
                        side=signal["side"],
                        entry_price=current_bar.close,
                        stop_loss=signal["sl"],
                        take_profit=signal["tp"],
                        style=signal.get("style", "Swing"),
                        premise=signal.get("premise", ""),
                        playbook=signal.get("playbook", ""),
                    )
            
            # 4. 更新权益
            self.update_equity(current_bar.close)
        
        # 强制平仓所有持仓
        for position in self.state.positions[:]:
            self.close_position(position, self.bars[-1].close, "END_OF_BACKTEST")
        
        return self.get_statistics()
    
    def get_statistics(self) -> dict[str, Any]:
        """获取统计数据"""
        total_trades = len(self.state.trades)
        win_rate = self.state.wins / total_trades * 100 if total_trades > 0 else 0
        
        gross_profit = sum(t.pnl for t in self.state.trades if t.pnl > 0)
        gross_loss = abs(sum(t.pnl for t in self.state.trades if t.pnl <= 0))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else float('inf')
        
        total_pnl = self.state.balance - 10000.0
        total_pnl_pct = total_pnl / 10000.0 * 100
        
        return {
            "final_balance": self.state.balance,
            "total_pnl": total_pnl,
            "total_pnl_pct": total_pnl_pct,
            "total_signals": self.state.total_signals,
            "total_entries": self.state.total_entries,
            "total_trades": total_trades,
            "wins": self.state.wins,
            "losses": self.state.losses,
            "win_rate": win_rate,
            "gross_profit": gross_profit,
            "gross_loss": gross_loss,
            "profit_factor": profit_factor,
            "scalp_count": self.state.scalp_count,
            "swing_count": self.state.swing_count,
            "reversal_count": self.state.reversal_count,
            "premise_failures": self.state.premise_failures,
            "trailing_sl_count": self.state.trailing_sl_count,
            "partial_close_count": self.state.partial_close_count,
            "trades": [
                {
                    "symbol": t.symbol,
                    "side": t.side,
                    "entry_price": t.entry_price,
                    "exit_price": t.exit_price,
                    "pnl": t.pnl,
                    "pnl_pct": t.pnl_pct,
                    "style": t.style,
                    "playbook": t.playbook,
                    "exit_reason": t.exit_reason,
                    "duration_minutes": t.duration_minutes,
                }
                for t in self.state.trades
            ],
        }


def print_backtest_results(stats: dict[str, Any]):
    """打印回测结果"""
    print("\n" + "="*70)
    print("  回测结果")
    print("="*70)
    
    print(f"\n  最终余额: ${stats['final_balance']:.2f}")
    print(f"  总盈亏: ${stats['total_pnl']:.2f} ({stats['total_pnl_pct']:.2f}%)")
    
    print(f"\n  === 交易统计 ===")
    print(f"  信号总数: {stats['total_signals']}")
    print(f"  开仓次数: {stats['total_entries']}")
    print(f"  完成交易: {stats['total_trades']}")
    print(f"  胜率: {stats['win_rate']:.1f}% ({stats['wins']}W / {stats['losses']}L)")
    print(f"  盈亏比 (PF): {stats['profit_factor']:.2f}")
    print(f"  总盈利: ${stats['gross_profit']:.2f}")
    print(f"  总亏损: ${stats['gross_loss']:.2f}")
    
    print(f"\n  === 风格分布 ===")
    print(f"  Scalp: {stats['scalp_count']}")
    print(f"  Swing: {stats['swing_count']}")
    print(f"  反转试探: {stats['reversal_count']}")
    
    print(f"\n  === 持仓管理 ===")
    print(f"  Premise 失效: {stats['premise_failures']}")
    print(f"  Trailing SL: {stats['trailing_sl_count']}")
    print(f"  分批止盈: {stats['partial_close_count']}")
    
    if stats['trades']:
        print(f"\n  === 交易详情 ===")
        for i, t in enumerate(stats['trades'][:10], 1):  # 只显示前 10 笔
            pnl_str = f"+${t['pnl']:.2f}" if t['pnl'] > 0 else f"-${abs(t['pnl']):.2f}"
            emoji = "✅" if t['pnl'] > 0 else "❌"
            print(f"  {i}. {emoji} {t['side']} @{t['entry_price']:.2f} → @{t['exit_price']:.2f} "
                  f"| {pnl_str} ({t['pnl_pct']:.1f}%) | {t['playbook']} | {t['exit_reason']}")
        
        if len(stats['trades']) > 10:
            print(f"  ... 还有 {len(stats['trades']) - 10} 笔交易")
    
    print("\n" + "="*70 + "\n")
