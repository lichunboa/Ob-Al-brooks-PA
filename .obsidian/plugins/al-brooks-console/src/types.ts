
export interface PaTagSnapshot {
	[key: string]: number;
}

export interface SchemaIssueItem {
	path: string;
	key: string;
	issue: string; // inferred
	expected?: string;
	actual?: string;
}

// Temporary alias to fix build if TradeData is not found
export type TradeData = any;
