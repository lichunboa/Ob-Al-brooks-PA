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

export type GalleryItem = {
  tradePath: string;
  coverPath: string;
  url?: string;
};
