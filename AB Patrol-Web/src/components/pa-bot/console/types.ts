import type {
  RuntimeExecutionEventRecord,
  RuntimeOrderRecord,
  RuntimePositionRecord,
  StrategyCatalogItem,
} from '../../../lib/pa-bot/runtime-contract';

export type ConsoleView = 'overview' | 'accounts' | 'orders' | 'audit' | 'system' | 'settings';

export type MonitoringAccount = {
  id: string;
  label: string;
  exchange: string;
  enabled: boolean;
  role: 'primary' | 'monitor';
  base_url: string;
  symbols: string[];
};

export type MonitoringConfig = {
  version: number;
  accounts: MonitoringAccount[];
};

export type RuntimeBundle = {
  generatedAt: string;
  primary: RuntimeData | null;
  runtimes: RuntimeData[];
};

export type RuntimeData = {
  runtimeLabel: string;
  health: {
    overall: string;
    freshnessLabel: string;
    cycleAgeSeconds: number | null;
    patrolLive: boolean;
    queryLive: boolean;
  };
  runtime: {
    botId: string;
    phase: string;
    focusSymbols: string[];
    activeSymbols: string[];
    dryRun: boolean;
    tradeReadiness: string;
    bestCandidate?: string;
    bestCandidateStatus?: string;
  };
  summary: {
    cycleId: string | null;
    marketSummary: string;
    explanation: string;
    actionsCount: number;
    positionManagementCount: number;
    strategyFamilies: Array<{ label: string; count: number }>;
    strategyCatalog: StrategyCatalogItem[];
    promptReferences: string[];
  };
  system: {
    sourceLabel: string;
    accounts: Array<{
      exchange: string;
      label?: string;
      accountId?: string;
      role?: string;
      baseUrl?: string;
      configuredSymbols?: string[];
      stale?: boolean;
      exchangeBlocked?: boolean;
      exchangeBlockCode?: string;
      exchangeBlockReason?: string;
      healthStatus: string;
      canTrade: boolean | null;
      canTradeReason: string;
      accountAsset: string;
      balanceTotal: number | null;
      balanceAvailable: number | null;
      positionsCount: number;
      ordersCount: number;
    }>;
  };
  positions: RuntimePositionRecord[];
  orders: RuntimeOrderRecord[];
  execution: {
    exchange: string;
    accountAsset: string;
    canTrade: boolean | null;
    canTradeReason: string;
    positionsCount: number;
    ordersCount: number;
    healthStatus: string;
    exchangeBlocked?: boolean;
    exchangeBlockCode?: string;
    exchangeBlockReason?: string;
    exchangeBlockUpdatedAt?: string | null;
  };
  profiling: {
    totalMs: number | null;
    stages: Array<{
      key: string;
      label: string;
      ms: number;
    }>;
  };
  monitoring: {
    knowledgeChars: number | null;
    refsCount: number;
    fullRefsCount: number;
    briefRefsCount: number;
    requestChars: number | null;
    requestSizeBytes: number | null;
    sessionAgeSeconds: number | null;
    uptimeSeconds: number | null;
    sessionTurnCount: number | null;
    sessionModel: string | null;
  };
  nextScan: {
    inSeconds: number | null;
    requestedSeconds: number | null;
    reasonText: string;
    bucketRule: string;
  };
  capacity: {
    maxPositions: number;
    currentPositions: number;
    currentEntryOrders: number;
    currentProtectionOrders: number;
    uniqueActiveSymbols: number;
    trackedSymbols: number;
    remainingPositionSlots: number;
    remainingSymbolSlots: number;
    baseRiskPercent: number;
    addOnRiskPercent: number;
    pyramidRiskPercent: number;
    perOrderCostLimitPct: number;
    totalSymbolRiskCapPct: number;
    rejectionSummary: Array<{ label: string; count: number }>;
    rejectionDetails: Array<{
      label: string;
      count: number;
      entries: Array<{
        loggedAt: string;
        symbol: string;
        exchange: string;
        status: string;
        type: string;
        message: string;
      }>;
    }>;
    occupiedSymbols: Array<{
      symbol: string;
      exchange: string;
      hasPosition: boolean;
      hasEntryOrder: boolean;
      hasProtectionOrder: boolean;
      blockedConflictCount: number;
      occupiedBy: string[];
    }>;
  };
  symbols: Array<{
    symbol: string;
    status: string;
    stage: string;
    market_state: string;
    thesis: string;
    execution_summary: string;
    brooks_label: string;
    upgrade_condition: string;
    planned_action: string;
    risk: string;
    strategy_family: string;
    latest_strategy_family: string;
    strategy_label: string;
    playbook_id: string;
    ema_gap_variant: string;
    primary_chart_path?: string;
    primary_chart_api_path?: string;
    chart_api_paths?: string[];
    chart_note?: string;
    chart_generated_at?: string;
  }>;
  recentCycles: Array<{
    cycleId: string;
    phase: string;
    nextScanSeconds: number | null;
    focusSymbols: string[];
    summary: string;
  }>;
  recentExecutions: RuntimeExecutionEventRecord[];
  managementActions: RuntimeExecutionEventRecord[];
  historicalOrders: RuntimeExecutionEventRecord[];
  audit: {
    lookbackCycles: number;
    totalSymbolsObserved: number;
    totalReadySignals: number;
    totalExecutableSignals: number;
    totalOpenOrderActions: number;
    totalExecutionEvents: number;
    preSignalExpiredSignals: number;
    expiredActivePreSignals: number;
    staleTimeoutSignals: number;
    candidateOpenOrderAttempts: number;
    duplicateInCycleActions: number;
    multiStrategySameSymbolActions: number;
    exchanges: Array<{ label: string; count: number }>;
    marketBuckets: Array<{ label: string; count: number }>;
    statuses: Array<{ label: string; count: number }>;
    candidateStages: Array<{ label: string; count: number }>;
    brooksRules: Array<{ label: string; count: number }>;
    signalFamilies: Array<{ label: string; count: number }>;
    timeframeSignals: Array<{ label: string; count: number }>;
    alwaysExecutableSymbols: Array<{
      symbol: string;
      exchange: string;
      count: number;
    }>;
    neverExecutableSymbols: Array<{
      symbol: string;
      exchange: string;
      count: number;
    }>;
    stuckWatchingSymbols: Array<{
      symbol: string;
      exchange: string;
      bucket: string;
      appearances: number;
      watchingCount: number;
      nonWatchingCount: number;
      candidateSeenCount: number;
      readyCount: number;
      executableCount: number;
      openOrderCount: number;
      executionEventCount: number;
      latestStatus: string;
      latestCandidateStage: string;
      latestMarketState: string;
      latestBrooksRule: string;
      latestStrategyFamily: string;
      latestLastPassReason: string;
      latestAllowExecutable: boolean | null;
      allowExecutableTrueCount: number;
      allowExecutableFalseCount: number;
      latestSignals: Record<string, string>;
      timeline: Array<{
        cycleId: string;
        time: string;
        status: string;
        candidateStage: string;
        signals: Record<string, string>;
      }>;
      watchStreak: number;
      longWatching: boolean;
      topRules: string[];
    }>;
    symbols: Array<{
      symbol: string;
      exchange: string;
      bucket: string;
      appearances: number;
      watchingCount: number;
      nonWatchingCount: number;
      candidateSeenCount: number;
      readyCount: number;
      executableCount: number;
      openOrderCount: number;
      executionEventCount: number;
      latestStatus: string;
      latestCandidateStage: string;
      latestMarketState: string;
      latestBrooksRule: string;
      latestStrategyFamily: string;
      latestLastPassReason: string;
      latestAllowExecutable: boolean | null;
      allowExecutableTrueCount: number;
      allowExecutableFalseCount: number;
      latestSignals: Record<string, string>;
      timeline: Array<{
        cycleId: string;
        time: string;
        status: string;
        candidateStage: string;
        signals: Record<string, string>;
      }>;
      watchStreak: number;
      longWatching: boolean;
      topRules: string[];
    }>;
  };
  timestamps: {
    latestCycleAt: string | null;
    lastSuccessAt?: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
  };
};

export type AccountSnapshot = RuntimeData['system']['accounts'][number];
export type AuditSymbol = RuntimeData['audit']['symbols'][number];
export type SymbolCard = RuntimeData['symbols'][number];
export type FocusCard = SymbolCard & { audit?: AuditSymbol };

export type BucketCount = {
  label: string;
  count: number;
};

export type SymbolGroup = {
  label: string;
  symbols: string[];
};

export type AccountPanel = {
  account: AccountSnapshot;
  configuredSymbols: string[];
  bucketCounts: BucketCount[];
  groupedSymbols: SymbolGroup[];
  scopedStates: SymbolCard[];
  scopedFocus: string[];
  scopedCandidateCount: number;
  scopedWatchingCount: number;
  topStates: FocusCard[];
};
