import type { StrategyCard, StrategyIndex } from "./strategy-index";
import { matchStrategies } from "./strategy-matcher";

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
