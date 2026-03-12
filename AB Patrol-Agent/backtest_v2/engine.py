"""
Al Brooks 回测引擎主循环

100% 遵循 Brooks 哲学：
- 止损在结构位外侧
- P×R > (1-P)
- Premise Check + Strength Check
- 不考虑人性化规则（连亏停止等）
"""

from typing import List, Dict
from datetime import datetime, timedelta
from ..models import (
    Candle, Signal, Position, Trade, BacktestResult,
    MarketState, AIDirection, Direction
)
from ..indicators.ema import calculate_ema
from ..indicators.structure import identify_swing_points
from ..indicators.market_state import MarketStateDetector
from ..core.stop_calculator import StopCalculator
from ..core.trader_equation import TraderEquation


class BrooksBacktestEngine:
    """Brooks 回测引擎"""

    def __init__(self):
        self.state_detector = MarketStateDetector()
        self.stop_calculator = StopCalculator()
        self.trader_equation = TraderEquation()

        self.strategies = []  # 策略列表
        self.open_positions: List[Position] = []
        self.closed_trades: List[Trade] = []

        self.initial_capital = 10000.0
        self.current_capital = 10000.0
        self.position_size_pct = 0.003  # 每笔0.3%风险

    def add_strategy(self, strategy):
        """添加策略"""
        self.strategies.append(strategy)

    def run(
        self,
        candles: List[Candle],
        symbol: str,
        timeframe: str
    ) -> BacktestResult:
        """
        运行回测

        流程：
        1. 计算所有指标
        2. 逐根K线遍历
        3. 每根K线：
           a. 更新持仓（检查止损/止盈）
           b. 判断市场状态
           c. 扫描信号
           d. 评估P×R
           e. 开仓
        """
        print(f"\n{'='*60}")
        print(f"开始回测: {symbol} {timeframe}")
        print(f"K线数量: {len(candles)}")
        print(f"时间范围: {candles[0].timestamp} ~ {candles[-1].timestamp}")
        print(f"{'='*60}\n")

        # 1. 计算指标
        print("计算指标...")
        ema_values = calculate_ema(candles, period=20)
        swing_points = identify_swing_points(candles, lookback=5)
        print(f"  EMA: {len(ema_values)} 个值")
        print(f"  Swing Points: {len(swing_points)} 个\n")

        # 2. 逐根遍历
        print("开始逐根扫描...\n")

        for i in range(100, len(candles)):  # 前100根用于初始化
            current_candles = candles[:i+1]
            current_ema = ema_values[:i+1]
            current_swings = [sp for sp in swing_points if sp.index <= i]

            # a. 更新持仓
            self._update_positions(current_candles, i)

            # b. 判断市场状态
            market_state = self.state_detector.detect(current_candles, current_ema)
            ai_direction = self.state_detector.detect_ai_direction(
                current_candles, current_ema, current_swings
            )

            # c. 扫描信号
            for strategy in self.strategies:
                signal = strategy.detect_signal(
                    current_candles,
                    current_ema,
                    market_state,
                    ai_direction
                )

                if signal is None:
                    continue

                # d. 计算止损
                stop_price = self.stop_calculator.calculate_stop(
                    signal, current_candles, current_swings, market_state
                )

                if stop_price is None:
                    continue

                # e. 计算目标（简化：2R）
                risk = abs(signal.entry_price - stop_price)
                target_price = signal.entry_price + (2 * risk if signal.direction == Direction.LONG else -2 * risk)

                # f. 评估P×R
                passed, P, R, te_value = self.trader_equation.evaluate(
                    signal, stop_price, target_price, market_state
                )

                if not passed:
                    continue

                # g. 开仓
                self._open_position(signal, stop_price, target_price, i)

        # 3. 平掉所有剩余持仓
        for pos in self.open_positions[:]:
            self._close_position(pos, candles[-1], "回测结束")

        # 4. 生成报告
        return self._generate_report(symbol, timeframe, candles)

    def _update_positions(self, candles: List[Candle], idx: int):
        """更新持仓（检查止损/止盈）"""
        current = candles[idx]

        for pos in self.open_positions[:]:
            # 检查止损
            if pos.direction == Direction.LONG:
                if current.low <= pos.stop_loss:
                    self._close_position(pos, current, "止损", pos.stop_loss)
                    continue
                if current.high >= pos.take_profit:
                    self._close_position(pos, current, "止盈", pos.take_profit)
                    continue
            else:
                if current.high >= pos.stop_loss:
                    self._close_position(pos, current, "止损", pos.stop_loss)
                    continue
                if current.low <= pos.take_profit:
                    self._close_position(pos, current, "止盈", pos.take_profit)
                    continue

    def _open_position(self, signal: Signal, stop_price: float, target_price: float, idx: int):
        """开仓"""
        # 计算仓位（固定风险百分比）
        risk = abs(signal.entry_price - stop_price)
        risk_amount = self.current_capital * self.position_size_pct
        size = risk_amount / risk

        position = Position(
            entry_time=signal.timestamp,
            entry_price=signal.entry_price,
            direction=signal.direction,
            size=size,
            stop_loss=stop_price,
            take_profit=target_price,
            signal_type=signal.type,
            entry_state=signal.market_state,
            entry_ai_direction=signal.ai_direction,
            premise=signal.reason
        )

        self.open_positions.append(position)

        print(f"[{signal.timestamp}] 开仓: {signal.type} {signal.direction.value}")
        print(f"  入场: {signal.entry_price:.2f} | 止损: {stop_price:.2f} | 止盈: {target_price:.2f}")
        print(f"  风险: {risk:.2f} ({risk/signal.entry_price*100:.2f}%) | 仓位: {size:.4f}")

    def _close_position(self, position: Position, candle: Candle, reason: str, exit_price: float = None):
        """平仓"""
        if exit_price is None:
            exit_price = candle.close

        # 计算盈亏
        if position.direction == Direction.LONG:
            pnl = (exit_price - position.entry_price) * position.size
        else:
            pnl = (position.entry_price - exit_price) * position.size

        pnl_pct = pnl / (position.entry_price * position.size)

        # 更新资金
        self.current_capital += pnl

        # 记录交易
        trade = Trade(
            entry_time=position.entry_time,
            exit_time=candle.timestamp,
            entry_price=position.entry_price,
            exit_price=exit_price,
            direction=position.direction,
            size=position.size,
            pnl=pnl,
            pnl_pct=pnl_pct,
            signal_type=position.signal_type,
            exit_reason=reason,
            bars_held=0  # TODO: 计算持仓K线数
        )

        self.closed_trades.append(trade)
        self.open_positions.remove(position)

        print(f"[{candle.timestamp}] 平仓: {position.signal_type} {position.direction.value}")
        print(f"  原因: {reason} | 盈亏: {pnl:.2f} ({pnl_pct*100:.2f}%)")
        print(f"  当前资金: {self.current_capital:.2f}\n")

    def _generate_report(self, symbol: str, timeframe: str, candles: List[Candle]) -> BacktestResult:
        """生成回测报告"""
        if not self.closed_trades:
            print("没有交易记录")
            return None

        winning_trades = [t for t in self.closed_trades if t.pnl > 0]
        losing_trades = [t for t in self.closed_trades if t.pnl <= 0]

        total_win = sum(t.pnl for t in winning_trades)
        total_loss = abs(sum(t.pnl for t in losing_trades))

        win_rate = len(winning_trades) / len(self.closed_trades)
        profit_factor = total_win / total_loss if total_loss > 0 else 999

        avg_win = total_win / len(winning_trades) if winning_trades else 0
        avg_loss = total_loss / len(losing_trades) if losing_trades else 0

        total_pnl = self.current_capital - self.initial_capital
        total_pnl_pct = total_pnl / self.initial_capital

        # 计算最大回撤
        max_dd = self._calculate_max_drawdown()

        result = BacktestResult(
            symbol=symbol,
            timeframe=timeframe,
            start_date=candles[0].timestamp,
            end_date=candles[-1].timestamp,
            total_trades=len(self.closed_trades),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            win_rate=win_rate,
            profit_factor=profit_factor,
            total_pnl=total_pnl,
            total_pnl_pct=total_pnl_pct,
            avg_win=avg_win,
            avg_loss=avg_loss,
            max_drawdown=max_dd,
            trades=self.closed_trades
        )

        self._print_report(result)

        return result

    def _calculate_max_drawdown(self) -> float:
        """计算最大回撤"""
        capital = self.initial_capital
        peak = capital
        max_dd = 0

        for trade in self.closed_trades:
            capital += trade.pnl
            if capital > peak:
                peak = capital
            dd = (peak - capital) / peak
            if dd > max_dd:
                max_dd = dd

        return max_dd

    def _print_report(self, result: BacktestResult):
        """打印报告"""
        print(f"\n{'='*60}")
        print(f"回测报告: {result.symbol} {result.timeframe}")
        print(f"{'='*60}")
        print(f"时间范围: {result.start_date} ~ {result.end_date}")
        print(f"总交易数: {result.total_trades}")
        print(f"盈利交易: {result.winning_trades} ({result.win_rate*100:.1f}%)")
        print(f"亏损交易: {result.losing_trades}")
        print(f"盈利因子: {result.profit_factor:.2f}")
        print(f"总盈亏: ${result.total_pnl:.2f} ({result.total_pnl_pct*100:.2f}%)")
        print(f"平均盈利: ${result.avg_win:.2f}")
        print(f"平均亏损: ${result.avg_loss:.2f}")
        print(f"最大回撤: {result.max_drawdown*100:.2f}%")
        print(f"{'='*60}\n")
