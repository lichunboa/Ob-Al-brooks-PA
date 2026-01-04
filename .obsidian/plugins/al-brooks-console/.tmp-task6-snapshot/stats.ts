import type { TradeOutcome, TradeRecord, TradeStats } from "./contracts";

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
	let netProfit = 0;

	for (const trade of trades) {
		countTotal += 1;
		if (typeof trade.pnl === "number") netProfit += trade.pnl;

		const outcome = classifyOutcome(trade);
		const isCompleted = outcome === "win" || outcome === "loss" || outcome === "scratch";
		if (isCompleted) countCompleted += 1;
		if (outcome === "win") countWins += 1;
	}

	const winRatePct = countCompleted === 0 ? 0 : Math.round((countWins / countCompleted) * 100);
	return { countTotal, countCompleted, countWins, winRatePct, netProfit };
}
