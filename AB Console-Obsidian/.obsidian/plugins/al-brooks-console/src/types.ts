export type { TradeRecord as TradeData } from "./core/contracts";

// 兼容旧字段：当前 UI 只需要总数/扫描时间等可在后续迁移中移除。
export interface TradeIndexStats {
	totalTrades: number;
	lastScan: number;
	dirty: boolean;
}

// PA Tag Snapshot 类型
export interface PaTagSnapshot {
	files: number;
	tagMap: Record<string, number>;
	generatedAtIso?: string;
}

// Schema Issue 类型
export interface SchemaIssueItem {
	path: string;
	name: string;
	key: string;
	type: string;
	val?: string;
}

// Strategy Stats Props 类型
export interface StrategyStatsProps {
	total: number;
	activeCount: number;
	learningCount: number;
	totalUses: number;
	onFilter?: (filter: string) => void;
}
