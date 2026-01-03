import type { StrategyIndex } from "./strategy-index";
import { matchStrategies } from "./strategy-matcher";

export type TodaySnapshot = {
  marketCycle?: string;
  strategyPicks: Array<{ strategyName: string; strategyPath?: string }>;
};

export function buildTodaySnapshot(args: {
  todayMarketCycle?: string;
  strategyIndex: StrategyIndex;
  limit?: number;
}): TodaySnapshot | undefined {
  const marketCycle = args.todayMarketCycle?.trim();
  if (!marketCycle) return undefined;

  const picks = matchStrategies(args.strategyIndex, {
    marketCycle,
    limit: args.limit ?? 6,
  });

  return {
    marketCycle,
    strategyPicks: picks.map((c) => ({
      strategyName: c.name,
      strategyPath: c.path,
    })),
  };
}
