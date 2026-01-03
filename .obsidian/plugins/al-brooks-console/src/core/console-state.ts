import type { StrategyCard, StrategyIndex } from "./strategy-index";
import { matchStrategies } from "./strategy-matcher";
import type { TradeRecord } from "./contracts";

export type TodaySnapshot = {
  marketCycle?: string;
  strategyPicks: Array<{ strategyName: string; strategyPath?: string }>;
};

export function computeTodayStrategyPicks(args: {
  todayMarketCycle?: string;
  strategyIndex: StrategyIndex;
  limit?: number;
}): StrategyCard[] {
  const marketCycle = args.todayMarketCycle?.trim();
  if (!marketCycle) return [];
  return matchStrategies(args.strategyIndex, {
    marketCycle,
    limit: args.limit ?? 6,
  });
}

export function computeTradeBasedStrategyPicks(args: {
  trade: TradeRecord | undefined;
  todayMarketCycle?: string;
  strategyIndex: StrategyIndex;
  limit?: number;
}): StrategyCard[] {
  const t = args.trade;
  if (!t) return [];

  const patterns = (t.patternsObserved ?? [])
    .map((p) => String(p).trim())
    .filter(Boolean);
  const setupCategory = t.setupCategory?.trim();
  const marketCycle = (args.todayMarketCycle ?? t.marketCycle)?.trim();

  return matchStrategies(args.strategyIndex, {
    marketCycle,
    setupCategory,
    patterns,
    limit: args.limit ?? 6,
  });
}

export function computeOpenTradePrimaryStrategy(args: {
  openTrade: TradeRecord | undefined;
  todayMarketCycle?: string;
  strategyIndex: StrategyIndex;
}): StrategyCard | undefined {
  const picks = computeTradeBasedStrategyPicks({
    trade: args.openTrade,
    todayMarketCycle: args.todayMarketCycle,
    strategyIndex: args.strategyIndex,
    limit: 3,
  });
  return picks[0];
}

export function buildTodaySnapshot(args: {
  todayMarketCycle?: string;
  strategyIndex: StrategyIndex;
  limit?: number;
}): TodaySnapshot | undefined {
  const marketCycle = args.todayMarketCycle?.trim();
  if (!marketCycle) return undefined;

  const picks = computeTodayStrategyPicks(args);

  return {
    marketCycle,
    strategyPicks: picks.map((c) => ({
      strategyName: c.name,
      strategyPath: c.path,
    })),
  };
}
