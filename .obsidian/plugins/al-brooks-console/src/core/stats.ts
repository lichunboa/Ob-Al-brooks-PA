import type {
  AccountType,
  TradeOutcome,
  TradeRecord,
  TradeStats,
} from "./contracts";

export function classifyOutcome(trade: TradeRecord): TradeOutcome {
  if (typeof trade.pnl === "number") {
    if (trade.pnl > 0) return "win";
    if (trade.pnl < 0) return "loss";
    return "scratch";
  }
  return trade.outcome ?? "unknown";
}

export function computeTradeStats(trades: TradeRecord[]): TradeStats {
  let countTotal = 0;
  let countCompleted = 0;
  let countWins = 0;
  let countLosses = 0;
  let countScratch = 0;
  let netProfit = 0;

  for (const trade of trades) {
    countTotal += 1;
    if (typeof trade.pnl === "number") netProfit += trade.pnl;

    const outcome = classifyOutcome(trade);
    const isCompleted =
      outcome === "win" || outcome === "loss" || outcome === "scratch";
    if (isCompleted) countCompleted += 1;
    if (outcome === "win") countWins += 1;
    if (outcome === "loss") countLosses += 1;
    if (outcome === "scratch") countScratch += 1;
  }

  const winRatePct =
    countCompleted === 0 ? 0 : Math.round((countWins / countCompleted) * 100);

  let netR = 0;
  for (const trade of trades) {
    if (typeof trade.r === "number") netR += trade.r;
  }

  const expectancy = countCompleted > 0 ? Number((netR / countCompleted).toFixed(2)) : 0;
  netR = Number(netR.toFixed(2));

  return { countTotal, countCompleted, countWins, countLosses, countScratch, winRatePct, netProfit, netR, expectancy };
}

export type StatsByAccountType = Record<AccountType | "All", TradeStats>;

export function computeTradeStatsByAccountType(
  trades: TradeRecord[]
): StatsByAccountType {
  const by: Record<AccountType, TradeRecord[]> = {
    Live: [],
    Demo: [],
    Backtest: [],
  };

  for (const trade of trades) {
    const at = trade.accountType;
    if (at === "Live" || at === "Demo" || at === "Backtest") by[at].push(trade);
  }

  return {
    All: computeTradeStats(trades),
    Live: computeTradeStats(by.Live),
    Demo: computeTradeStats(by.Demo),
    Backtest: computeTradeStats(by.Backtest),
  };
}
