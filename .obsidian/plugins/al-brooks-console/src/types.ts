import type { TradeRecord } from "./core/contracts";

// Temporary alias/re-export
export type TradeData = TradeRecord; // or any if strictly needed, but better typed

export interface TradeIndexStats {
	totalTrades: number;
	lastScan: number;
	dirty: boolean;
}

export interface PaTagSnapshot {
	files: number;
	tagMap: Record<string, number>;
}

export interface SchemaIssueItem {
	path: string;
	key: string;
	issue?: string;
	name?: string;
	type?: string;
	val?: string;
	expected?: string;
	actual?: string;
}

export type StrategyStatsProps = {
	total: number;
	activeCount: number;
	learningCount: number;
	totalUses: number;
	onFilter?: (filter: string) => void;
};

export type StrategyCardData = {
	id: string;
	name: string;
	path?: string;
	tags?: string[];
	status?: 'active' | 'learning' | 'archived' | string;
	rr?: string;
	winRate?: number;
	uses?: number;
	lastUsed?: string | null;
	marketCycle?: string | null;
	description?: string;
};

export type PerformanceRow = {
	strategyId: string;
	name: string;
	wins: number;
	losses: number;
	netPnl: number;
	trades: number;
	winRate: number;
};
