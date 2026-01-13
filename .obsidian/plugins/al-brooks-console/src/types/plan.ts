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
    strategies: string[]; // e.g., ["Trend Pullback", "Wedge"]
    riskLimit: number; // Max loss for the day (R倍数)
    maxTrades: number; // 最大交易数
    notes: string; // 计划备注
    checklist: PlanChecklistItem[]; // 检查清单
}
