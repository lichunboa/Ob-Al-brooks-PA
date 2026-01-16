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
  let netMoney = 0;
  let netR = 0;

  for (const trade of trades) {
    countTotal += 1;
    const pnl = typeof trade.pnl === "number" && Number.isFinite(trade.pnl) ? trade.pnl : 0;
    netMoney += pnl;

    // Calculate R
    let r = 0;
    if (typeof trade.r === "number" && Number.isFinite(trade.r)) {
      r = trade.r;
    } else if (pnl !== 0 && trade.initialRisk && trade.initialRisk > 0) {
      r = pnl / trade.initialRisk;
    }
    netR += r;

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

  return {
    countTotal,
    countCompleted,
    countWins,
    countLosses,
    countScratch,
    winRatePct,
    netMoney,
    netR,
    netProfit: netMoney
  };
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
