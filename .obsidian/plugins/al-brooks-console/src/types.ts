export interface TradeData {
    path: string;
    filename: string;
    date: string;
    ticker: string;
    direction: "Long" | "Short" | "Unknown";
    setup: string;
    market_cycle: string;
    outcome: "Win" | "Loss" | "Scratch" | "Open";
    pnl: number;
    r: number;
    tf: string;
    entry_price?: number;
    stop_price?: number;
    exit_price?: number;
    tags: string[];
    // raw frontmatter for fallback
    frontmatter: Record<string, any>;
}

export interface TradeIndexStats {
    totalTrades: number;
    lastScan: number;
    dirty: boolean;
}
