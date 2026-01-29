export const FORM_LOGIC_MAP: Record<string, {
    visible?: string[];
    highlight?: string[];
}> = {
    "趋势突破": {
        highlight: ["patterns_observed", "market_cycle"]
    },
    "Trend Breakout": {
        highlight: ["patterns_observed", "market_cycle"]
    },
    "趋势回调": {
        highlight: ["signal_bar_quality", "entry_price"]
    },
    "Trend Pullback": {
        highlight: ["signal_bar_quality", "entry_price"]
    },
    "趋势反转": {
        highlight: ["signal_bar_quality", "patterns_observed"]
    },
    "Reversal": {
        highlight: ["signal_bar_quality", "patterns_observed"]
    },
    "区间逆势": {
        highlight: ["signal_bar_quality", "order_type"]
    },
    "TR Fade": {
        highlight: ["signal_bar_quality", "order_type"]
    }
};

export const FIELD_LABELS: Record<string, string> = {
    accountType: "账户类型/account_type",
    ticker: "品种/ticker",
    timeframe: "时间周期/timeframe",
    marketCycle: "市场周期/market_cycle",
    alwaysIn: "总是方向/always_in",
    dayType: "日内类型/day_type",
    probability: "概率/probability",
    confidence: "信心/confidence",
    managementPlan: "管理计划/management_plan",
    direction: "方向/direction",
    setupCategory: "设置类别/setup_category",
    patternsObserved: "观察到的形态/patterns_observed",
    signalBarQuality: "信号K/signal_bar_quality",
    orderType: "订单类型/order_type",
    entryPrice: "入场/entry_price",
    stopLoss: "止损/stop_loss",
    takeProfit: "目标位/take_profit",
    initialRisk: "初始风险/initial_risk",
    pnl: "净利润/net_profit ($)",
    outcome: "结果/outcome",
    executionQuality: "执行评价/execution_quality",
    strategyName: "策略名称/strategy_name",
    cover: "封面/cover"
};
