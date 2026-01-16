/**
 * 计划检查项
 */
export interface PlanChecklistItem {
    text: string;
    done: boolean;
}

/**
 * 每日计划数据结构
 */
export interface DailyPlan {
    date: string; // YYYY-MM-DD
    focusSymbols: string[]; // e.g., ["BTCUSDT", "ETHUSDT"]
    focusTimeframes?: string[]; // e.g., ["M5", "H1"]
    marketCycle?: string; // e.g., "Bull Trend", "Trading Range"
    dayType?: string; // e.g., "Trend Day", "Trading Range Day"
    alwaysIn?: string; // e.g., "Long", "Short", "Neutral"
    strategies: string[]; // e.g., ["Trend Pullback", "Wedge"]
    riskLimit: number; // Max loss for the day (R倍数)
    maxTrades: number; // 最大交易数
    notes: string; // 计划备注
    checklist: PlanChecklistItem[]; // 检查清单
}
