export type { TradeRecord as TradeData } from "./core/contracts";

// 兼容旧字段：当前 UI 只需要总数/扫描时间等可在后续迁移中移除。
export interface TradeIndexStats {
	totalTrades: number;
	lastScan: number;
	dirty: boolean;
}

export type PaTagSnapshot = {
	files: number;
	tagMap: Record<string, number>;
};

export type SchemaIssueItem = {
	path: string;
	name: string;
	key: string;
	type: string;
	val?: string;
};
