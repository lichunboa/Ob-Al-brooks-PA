"""
回测公共数据模型。
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class Candle:
    """K 线数据。"""

    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0
    timeframe: str = "5m"


@dataclass
class PASignal:
    """价格行为信号。"""

    symbol: str
    signal_type: str
    direction: str
    strength: int
    message: str
    timestamp: datetime = field(default_factory=datetime.now)
    timeframe: str = "5m"
    price: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    probability: float = 0.6
    cycle: str = ""
    entry_trigger: float = 0.0
    entry_type: str = "STOP"
    extra: dict = field(default_factory=dict)


@dataclass
class BackgroundContext:
    """大周期背景。"""

    daily_trend: str
    h4_trend: str
    background: str
    daily_slope: float
    h4_slope: float


@dataclass
class MarketState:
    """Al Brooks 四状态市场模型。"""

    always_in: str
    cycle: str
    trend_strength: float
    range_high: float = 0.0
    range_low: float = 0.0
    ema_slope: float = 0.0
    bar_count_from_ema: int = 0
    channel_type: str = "none"
    is_ttr: bool = False
    follow_through: bool = False
    pullback_ratio: float = 0.0


@dataclass
class Trade:
    """模拟交易记录。"""

    symbol: str
    direction: str
    strategy: str
    entry_price: float
    stop_loss: float
    take_profit: float
    entry_time: datetime
    exit_time: datetime | None = None
    exit_price: float = 0.0
    pnl_pct: float = 0.0
    result: str = ""
    score: int = 0
    background: str = ""
    cycle: str = ""
    exit_reason: str = ""
    timeframe: str = "5m"
    bars_held: int = 0
    entry_type: str = "STOP"
    entry_trigger: float = 0.0
    signal_bar_high: float = 0.0
    signal_bar_low: float = 0.0
    market_state: str = ""
    higher_timeframe: str = ""
    higher_market_state: str = ""
    follow_through: bool = False
    higher_follow_through: bool = False
    trendline_break_confirmed: bool = False
    failed_breakout_evidence: bool = False
    signal_bar_quality: float = 0.0
    signal_bar_tail_ratio: float = 0.0
    signal_bar_close_position: float = 0.0
    reclaimed_prior_close: bool = False
    broke_micro_extreme: bool = False
    requires_second_entry: bool = False
    acceptance_ready: bool = False
    executable_signal_ready: bool = False
    candidate_stage: str = ""
    nearest_support: float = 0.0
    nearest_resistance: float = 0.0
    target_path_clear: bool = True
    stop_structure_ok: bool = True
    actual_to_perfect_risk_ratio: float = 1.0
    first_target_distance_r: float = 0.0
    blocking_magnet_distance_r: float = 0.0
    trapped_side: str = ""
    prior_leg_context: str = ""
    prior_leg_bars: int = 0
    prior_leg_overlap_ratio: float = 0.0
    playbook_id: str = ""
    playbook_family: str = ""
    order_bias: str = ""
    route_style: str = ""
    management_style: str = "default"
    recommended_target: float = 0.0
    primary_magnet_kind: str = ""
    blocking_magnet_kind: str = ""
    magnet_cluster_count: int = 0
    magnet_cluster_strength: float = 0.0
    signal_stage: str = ""
    signal_stage_reason: str = ""
    intent: str = ""
    risk_percent: float = 0.0
    scale_legs: int = 1
    initial_stop_loss: float = 0.0
    initial_risk: float = 0.0
    original_entry_price: float = 0.0
    reentry_attempt: int = 0
    remaining_size: float = 1.0
    realized_pnl_pct: float = 0.0
    r_multiple: float = 0.0
    account_pnl_pct: float = 0.0
    account_pnl_amount: float = 0.0
    equity_before: float = 0.0
    equity_after: float = 0.0
    risk_amount: float = 0.0
    position_size_estimate: float = 0.0
    position_notional_estimate: float = 0.0
    tp1_done: bool = False
    tp2_done: bool = False
    partial_close_count: int = 0
    stop_adjust_count: int = 0
    take_profit_adjust_count: int = 0
    premise_reduce_count: int = 0
    management_state: str = "normal"
    management_reason: str = ""
    management_reason_detail: str = ""
    management_state_bar: int = 0
    best_price: float = 0.0
    best_price_bar: int = 0
    worst_price: float = 0.0


@dataclass
class PendingOrder:
    """回测挂单。"""

    symbol: str
    direction: str
    strategy: str
    order_price: float
    trigger_price: float
    stop_loss: float
    take_profit: float
    submitted_time: datetime
    timeframe: str = "5m"
    entry_type: str = "STOP"
    score: int = 0
    background: str = ""
    cycle: str = ""
    bars_waited: int = 0
    expires_after: int = 0
    market_state: str = ""
    higher_timeframe: str = ""
    higher_market_state: str = ""
    follow_through: bool = False
    higher_follow_through: bool = False
    trendline_break_confirmed: bool = False
    failed_breakout_evidence: bool = False
    signal_bar_quality: float = 0.0
    signal_bar_tail_ratio: float = 0.0
    signal_bar_close_position: float = 0.0
    reclaimed_prior_close: bool = False
    broke_micro_extreme: bool = False
    requires_second_entry: bool = False
    acceptance_ready: bool = False
    executable_signal_ready: bool = False
    candidate_stage: str = ""
    nearest_support: float = 0.0
    nearest_resistance: float = 0.0
    target_path_clear: bool = True
    stop_structure_ok: bool = True
    actual_to_perfect_risk_ratio: float = 1.0
    first_target_distance_r: float = 0.0
    blocking_magnet_distance_r: float = 0.0
    trapped_side: str = ""
    prior_leg_context: str = ""
    prior_leg_bars: int = 0
    prior_leg_overlap_ratio: float = 0.0
    playbook_id: str = ""
    playbook_family: str = ""
    order_bias: str = ""
    route_style: str = ""
    management_style: str = "default"
    recommended_target: float = 0.0
    primary_magnet_kind: str = ""
    blocking_magnet_kind: str = ""
    magnet_cluster_count: int = 0
    magnet_cluster_strength: float = 0.0
    signal_stage: str = ""
    signal_stage_reason: str = ""
    intent: str = ""
    risk_percent: float = 0.0
    original_entry_price: float = 0.0
    reentry_attempt: int = 0
    signal_bar_high: float = 0.0
    signal_bar_low: float = 0.0
    confirmation_needed: bool = False
