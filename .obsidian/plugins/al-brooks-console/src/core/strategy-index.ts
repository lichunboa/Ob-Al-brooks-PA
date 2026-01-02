export interface StrategyCard {
	path: string;
	name: string;
	canonicalName: string;
	marketCycles: string[];
	setupCategories: string[];
	patternsObserved: string[];
}

export interface StrategyIndex {
	initialize(): Promise<void>;
	list(): StrategyCard[];
	byName(name: string): StrategyCard | undefined;
	lookup(alias: string): StrategyCard | undefined;
	byPattern(pattern: string): StrategyCard | undefined;
}
