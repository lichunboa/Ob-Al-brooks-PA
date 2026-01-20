export type { TradeRecord as TradeData } from "./core/contracts";

// 兼容旧字段：当前 UI 只需要总数/扫描时间等可在后续迁移中移除。
export interface TradeIndexStats {
	totalTrades: number;
	lastScan: number;
	dirty: boolean;
}

// PA Tag 快照
export type PaTagSnapshot = {
	files: number;
	tagMap: Record<string, number>;
	generatedAtIso?: string;
};

// 模式问题项
export type SchemaIssueItem = {
	path: string;
	name: string;
	key: string;
	type: string;
	val?: string;
};

// 策略统计属性
export interface StrategyStatsProps {
	total: number;
	activeCount: number;
	learningCount: number;
	totalUses: number;
	onFilter?: (filter: string) => void;
}
