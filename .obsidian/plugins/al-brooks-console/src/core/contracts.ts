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

  // 用于“智能联动”的规范字段（由索引层归一化填充）
  marketCycle?: string;
  setupCategory?: string;
  patternsObserved?: string[];
  signalBarQuality?: string[];
  timeframe?: string;
  direction?: string;
  strategyName?: string;
  managementPlan?: string[];
  executionQuality?: string;
  cover?: string;

  mtime?: number;
  tags?: NormalizedTag[];
  // 原始 frontmatter 仅用于回退/调试；业务口径不应依赖其结构。
  rawFrontmatter?: Record<string, unknown>;
}

export interface TradeStats {
  countTotal: number;
  countCompleted: number;
  countWins: number;
  countLosses: number;
  countScratch: number;
  winRatePct: number;
  netProfit: number;
}
