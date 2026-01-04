export interface StrategyCard {
  path: string;
  name: string;
  canonicalName: string;
  /** Raw status text from frontmatter (e.g. "实战中", "Active"). Optional for backward-compat. */
  statusRaw?: string;
  /** Optional risk/reward field from frontmatter (legacy Playbook: riskReward). */
  riskReward?: string;
  /** Optional source field from frontmatter (legacy Playbook: source). */
  source?: string;
  marketCycles: string[];
  setupCategories: string[];
  patternsObserved: string[];
  signalBarQuality?: string[];
  entryCriteria?: string[];
  riskAlerts?: string[];
  stopLossRecommendation?: string[];
  takeProfitRecommendation?: string[];
}

export interface StrategyIndex {
  initialize(): Promise<void>;
  list(): StrategyCard[];
  byName(name: string): StrategyCard | undefined;
  lookup(alias: string): StrategyCard | undefined;
  byPattern(pattern: string): StrategyCard | undefined;
}
