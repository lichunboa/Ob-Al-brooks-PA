export type AccountType = "Live" | "Demo" | "Backtest";

export type NormalizedTag = string;
export type TradeId = string;

export type TradeOutcome = "win" | "loss" | "scratch" | "open" | "unknown";

export interface ReviewHint {
  id: string;
  zh: string;
  en: string;
}

export interface TradeRecord {
  path: string;
  name: string;
  dateIso: string;
  ticker?: string;
  pnl?: number;
  outcome?: TradeOutcome;
  accountType?: AccountType;
  mtime?: number;
  tags?: NormalizedTag[];
  // 原始 frontmatter 仅用于回退/调试；业务口径不应依赖其结构。
  rawFrontmatter?: Record<string, unknown>;
}

export interface TradeStats {
  countTotal: number;
  countCompleted: number;
  countWins: number;
  winRatePct: number;
  netProfit: number;
}
