import type { StatsByAccountType } from "./stats";
import type { TradeRecord } from "./contracts";
import type { StrategyCard } from "./strategy-index";

export type ConsoleExportMeta = {
	/** Schema version for forward compatibility. */
	schemaVersion: 1;
	/** ISO timestamp of export. */
	exportedAt: string;
	/** Plugin version at time of export. */
	pluginVersion: string;
};

export type ConsoleExportSnapshot = {
	meta: ConsoleExportMeta;
	trades: TradeRecord[];
	statsByAccountType: StatsByAccountType;
	strategyIndex?: {
		count: number;
		cards: StrategyCard[];
	};
};

export function buildConsoleExportSnapshot(args: {
	exportedAt: string;
	pluginVersion: string;
	trades: TradeRecord[];
	statsByAccountType: StatsByAccountType;
	strategyCards?: StrategyCard[];
}): ConsoleExportSnapshot {
	const trades = args.trades ?? [];
	const statsByAccountType = args.statsByAccountType;
	const cards = args.strategyCards;

	return {
		meta: {
			schemaVersion: 1,
			exportedAt: args.exportedAt,
			pluginVersion: args.pluginVersion,
		},
		trades,
		statsByAccountType,
		strategyIndex: cards
			? {
				count: cards.length,
				cards,
			}
			: undefined,
	};
}
