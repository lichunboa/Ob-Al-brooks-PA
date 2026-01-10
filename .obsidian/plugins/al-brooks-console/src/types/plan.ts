export interface DailyPlan {
    date: string; // YYYY-MM-DD
    focusSymbols: string[]; // e.g., ["BTCUSDT", "ETHUSDT"]
    strategies: string[]; // e.g., ["Trend Pullback", "Wedge"]
    riskLimit: number; // Max loss for the day
    notes: string;
}
