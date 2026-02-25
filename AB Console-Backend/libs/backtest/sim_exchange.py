"""
SimExchange — 模拟交易所

接收信号 → 创建订单 → 每根 K 线检查 SL/TP → 统计交易结果

与真实交易所的接口:
  真实: trading-service → Binance API
  回测: sim_exchange    → 内存记录
"""

import math
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

# 周期缩放因子（基于 5m = 1）
TF_SCALE = {"1m": 0.2, "5m": 1, "15m": 3, "30m": 6, "1h": 12}


@dataclass
class Trade:
    """模拟交易"""
    symbol: str
    direction: str
    strategy: str
    entry_price: float
    stop_loss: float
    take_profit: float
    entry_time: datetime
    exit_time: Optional[datetime] = None
    exit_price: float = 0.0
    pnl_pct: float = 0.0
    result: str = ""          # WIN / LOSS / SCRATCH
    score: int = 0
    background: str = ""
    cycle: str = ""
    exit_reason: str = ""     # TP / SL / TIMEOUT / END
    timeframe: str = "5m"
    bars_held: int = 0


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
        self.closed_trades: list[Trade] = []
        self.daily_losses: dict[str, int] = {}  # {symbol: 今日止损次数}
        self.strategy_history: dict[str, dict] = {}  # {strategy: {trades, wins, losses, pnl}}
        self._current_date: str = ""

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

        # 同品种不重复开仓
        if any(t.symbol == signal.symbol for t in self.open_trades):
            return

        trade = Trade(
            symbol=signal.symbol,
            direction=signal.direction,
            strategy=getattr(signal, "signal_type", "unknown"),
            entry_price=signal.price,
            stop_loss=signal.stop_loss,
            take_profit=signal.take_profit,
            entry_time=ts,
            score=score,
            background=background,
            cycle=getattr(signal, "cycle", ""),
            timeframe=getattr(signal, "timeframe", "5m"),
        )
        self.open_trades.append(trade)

    def on_candle(self, candle):
        """
        每根 K 线检查所有持仓的 SL/TP

        Args:
            candle: K 线对象（需要 .high, .low, .close, .timestamp）
        """
        still_open = []
        for trade in self.open_trades:
            trade.bars_held += 1
            closed = False

            # 保本止损: 浮盈达 0.7R 时移到保本位
            # Al Brooks: 尽早保护本金，减少被完整止损扫出的概率
            if trade.direction == "BUY":
                unrealized = candle.high - trade.entry_price
                sl_dist = trade.entry_price - trade.stop_loss
                if sl_dist > 0 and unrealized >= sl_dist * 0.7:
                    new_sl = trade.entry_price * 1.0001
                    trade.stop_loss = max(trade.stop_loss, new_sl)
            elif trade.direction == "SELL":
                unrealized = trade.entry_price - candle.low
                sl_dist = trade.stop_loss - trade.entry_price
                if sl_dist > 0 and unrealized >= sl_dist * 0.7:
                    new_sl = trade.entry_price * 0.9999
                    trade.stop_loss = min(trade.stop_loss, new_sl)

            # 周期缩放因子（15m信号需要3x时间，1h需要12x）
            scale = TF_SCALE.get(trade.timeframe, 1)
            sqrt_s = math.sqrt(scale)

            # 计算此交易的风险百分比（SL 距离）— ZOMBIE 和 SCALP 都需要
            if trade.direction == "BUY":
                risk_pct = (trade.entry_price - trade.stop_loss) / trade.entry_price * 100
            else:
                risk_pct = (trade.stop_loss - trade.entry_price) / trade.entry_price * 100
            risk_pct = max(risk_pct, 0.05)  # 防止除零

            # 僵尸止损: 只抓真正"死钱"交易
            # Al Brooks: 如果交易 premise 已经不成立（长时间无动能），就退出
            # 两阶段:
            #   1. 早期 ZOMBIE (20 bars): 只抓接近平本的 (-0.3R ~ +0.2R)
            #   2. 晚期 ZOMBIE (35 bars): 抓所有未盈利的 (< +0.1R)
            base_zbar = 20 if trade.strategy == "突破回调" else 16
            zombie_bar = int(base_zbar * scale)
            late_zombie = int(zombie_bar * 2)  # 晚期阈值

            if not closed and trade.bars_held >= zombie_bar:
                if trade.direction == "BUY":
                    zpnl = (candle.close - trade.entry_price) / trade.entry_price * 100
                else:
                    zpnl = (trade.entry_price - candle.close) / trade.entry_price * 100

                # 早期: 只抓紧贴平本的无方向交易
                early_exit = (
                    trade.bars_held < late_zombie
                    and -risk_pct * 0.3 < zpnl < risk_pct * 0.2
                )
                # 晚期: 所有未盈利交易都退出（保住资金）
                late_exit = (
                    trade.bars_held >= late_zombie
                    and zpnl < risk_pct * 0.1
                    and zpnl > -risk_pct * 0.8  # 深亏还是让 SL 处理
                )

                if early_exit or late_exit:
                    trade.exit_price = candle.close
                    trade.pnl_pct = self._calc_pnl(
                        trade.entry_price, trade.exit_price, trade.direction)
                    if trade.pnl_pct > -0.05:
                        trade.result = "SCRATCH"
                    else:
                        trade.result = "LOSS"
                    trade.exit_reason = "ZOMBIE"
                    closed = True

            # Al Brooks 风格 Scalp: 最低 1:1 R:R，然后时间衰减
            scalp_start = max(3, int(3 * scale))
            if not closed and trade.bars_held >= scalp_start:
                if trade.direction == "BUY":
                    scalp_pnl = (candle.close - trade.entry_price) / trade.entry_price * 100
                else:
                    scalp_pnl = (trade.entry_price - candle.close) / trade.entry_price * 100
                # Al Brooks: Scalp 门槛随时间衰减
                # 早期: 要求至少 1.2:1 R:R (让赢利跑)
                # 中期: 降到 0.8:1 (锁利)
                # 晚期: 0.3:1 (任何盈利都拿)
                b = trade.bars_held
                if b <= int(5 * scale):
                    threshold = max(risk_pct * 1.2, 0.4 * sqrt_s)
                elif b <= int(10 * scale):
                    threshold = max(risk_pct * 0.8, 0.25 * sqrt_s)
                elif b <= int(18 * scale):
                    threshold = max(risk_pct * 0.5, 0.15 * sqrt_s)
                else:
                    threshold = max(risk_pct * 0.25, 0.08 * sqrt_s)
                if scalp_pnl >= threshold:
                    trade.exit_price = candle.close
                    trade.pnl_pct = self._calc_pnl(
                        trade.entry_price, trade.exit_price, trade.direction)
                    trade.result = "WIN"
                    trade.exit_reason = "SCALP"
                    closed = True

            if trade.direction == "BUY":
                sl_hit = candle.low <= trade.stop_loss
                tp_hit = candle.high >= trade.take_profit
                if sl_hit and tp_hit:
                    # 距离优先判定：哪个离 entry 更近就先触发
                    sl_dist = abs(trade.entry_price - trade.stop_loss)
                    tp_dist = abs(trade.take_profit - trade.entry_price)
                    if sl_dist <= tp_dist:
                        trade.exit_price = trade.stop_loss
                        trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "BUY")
                        trade.result = "LOSS"
                        trade.exit_reason = "SL"
                    else:
                        trade.exit_price = trade.take_profit
                        trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "BUY")
                        trade.result = "WIN"
                        trade.exit_reason = "TP"
                    closed = True
                elif sl_hit:
                    trade.exit_price = trade.stop_loss
                    trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "BUY")
                    trade.result = "LOSS"
                    trade.exit_reason = "SL"
                    closed = True
                elif tp_hit:
                    trade.exit_price = trade.take_profit
                    trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "BUY")
                    trade.result = "WIN"
                    trade.exit_reason = "TP"
                    closed = True

            elif trade.direction == "SELL":
                sl_hit = candle.high >= trade.stop_loss
                tp_hit = candle.low <= trade.take_profit
                if sl_hit and tp_hit:
                    sl_dist = abs(trade.stop_loss - trade.entry_price)
                    tp_dist = abs(trade.entry_price - trade.take_profit)
                    if sl_dist <= tp_dist:
                        trade.exit_price = trade.stop_loss
                        trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "SELL")
                        trade.result = "LOSS"
                        trade.exit_reason = "SL"
                    else:
                        trade.exit_price = trade.take_profit
                        trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "SELL")
                        trade.result = "WIN"
                        trade.exit_reason = "TP"
                    closed = True
                elif sl_hit:
                    trade.exit_price = trade.stop_loss
                    trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "SELL")
                    trade.result = "LOSS"
                    trade.exit_reason = "SL"
                    closed = True
                elif tp_hit:
                    trade.exit_price = trade.take_profit
                    trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, "SELL")
                    trade.result = "WIN"
                    trade.exit_reason = "TP"
                    closed = True

            # 超时平仓（周期感知动态持仓时间）
            max_bars = int(self._get_max_bars(trade.strategy) * scale)
            if not closed and trade.bars_held >= max_bars:
                trade.exit_price = candle.close
                trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, trade.direction)
                trade.result = "WIN" if trade.pnl_pct > 0 else "LOSS" if trade.pnl_pct < -0.1 else "SCRATCH"
                trade.exit_reason = "TIMEOUT"
                closed = True

            if closed:
                trade.exit_time = candle.timestamp
                self._record_close(trade)
                self.closed_trades.append(trade)
            else:
                still_open.append(trade)

        self.open_trades = still_open

    def force_close_all(self, candle):
        """强制平仓所有持仓（回测结束时调用）"""
        for trade in self.open_trades:
            trade.exit_price = candle.close
            trade.pnl_pct = self._calc_pnl(trade.entry_price, trade.exit_price, trade.direction)
            trade.result = "WIN" if trade.pnl_pct > 0 else "LOSS" if trade.pnl_pct < -0.1 else "SCRATCH"
            trade.exit_time = candle.timestamp
            trade.exit_reason = "END"
            self._record_close(trade)
            self.closed_trades.append(trade)
        self.open_trades = []

    def _calc_pnl(self, entry: float, exit_price: float, direction: str) -> float:
        """计算 PnL%（含双边手续费）"""
        if entry == 0:
            return 0.0
        if direction == "BUY":
            raw = (exit_price - entry) / entry * 100
        else:
            raw = (entry - exit_price) / entry * 100
        fee = self.fee_rate * 2 * 100  # 双边手续费百分比
        return raw - fee

    def _record_close(self, trade: Trade):
        """记录平仓统计"""
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

    def _get_max_bars(self, strategy: str) -> int:
        """根据策略类型返回最大持仓K线数"""
        rush_strats = {"收线追进"}
        reversal_strats = {"双重顶", "双重底", "楔形顶", "楔形底",
                           "急速通道", "末端旗形"}
        if strategy in rush_strats:
            return 24  # 2h（动能衰竭快）
        elif strategy in reversal_strats:
            return 72  # 6h（反转需更多时间）
        return self.max_holding_bars  # 默认 48（4h）

    def has_position(self, symbol: str) -> bool:
        """检查是否有持仓"""
        return any(t.symbol == symbol for t in self.open_trades)
