import { buildStrategyCatalog } from './runtime-contract';
import { buildCapacitySummary as buildRuntimeCapacitySummary, emptyCapacitySummary as emptyRuntimeCapacitySummary } from './runtime-capacity';
import { buildRuntimeExecutionContext, emptyRuntimeExecutionContext } from './runtime-execution-context';
import { aggregateExecutionEntries, normalizeExecutionAccounts, normalizeOpenOrders, normalizeOpenPositions } from './runtime-accounts';
import { normalizeProfiling } from './runtime-profiling';
import { buildLightStrategyFamilies, looksLikeTrackedSymbol, normalizeSymbolCard } from './runtime-symbols';
import { latestCycle, readJsonlRecent, runtimeFiles, type RuntimeFiles } from './runtime-files';
import { normalizeAudit } from './runtime-route-audit';
import type { RuntimeView } from './runtime-execution-fallback';
import { asArray, asBoolean, asNumber, asRecord, asString, asStringArray, hasContent, summarizeValue, type UnknownRecord } from './runtime-route-shared';

export type RuntimeConfig = {
  key: string;
  label: string;
  botId: string;
  dataRoot: string;
  defaultExecutionBase: string;
};

type CapacityDetailLevel = 'summary' | 'full';

type NormalizePayloadOptions = {
  readProcessUptimeSeconds: (pidFilePath: string) => number | null;
  buildExecutionContextCached: (
    files: RuntimeFiles,
    openPositions: UnknownRecord[],
    openOrders: UnknownRecord[],
  ) => ReturnType<typeof buildRuntimeExecutionContext>;
  buildCapacitySummaryCached: (
    files: RuntimeFiles,
    execution: UnknownRecord,
    positions: UnknownRecord[],
    orders: UnknownRecord[],
    trackedSymbols: string[],
    level: CapacityDetailLevel,
  ) => UnknownRecord;
  shouldIncludeAudit: (view: RuntimeView) => boolean;
  shouldIncludeSymbols: (view: RuntimeView) => boolean;
  shouldIncludeExposure: (view: RuntimeView) => boolean;
  shouldIncludeExecutionHistory: (view: RuntimeView) => boolean;
  shouldIncludeCapacity: (view: RuntimeView) => boolean;
  shouldIncludeSystemHistory: (view: RuntimeView) => boolean;
  capacityDetailLevel: (view: RuntimeView) => CapacityDetailLevel;
  patrolPidFile: string;
};

function topThemes(value: unknown): Array<{ label: string; count: number }> {
  return Object.entries(asRecord(value))
    .map(([label, count]) => ({ label, count: asNumber(count) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
}

function inferActionExchange(symbol: string, exchange: string): string {
  const normalizedExchange = exchange.trim().toLowerCase();
  if (normalizedExchange) return normalizedExchange;
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol.endsWith('USDT')) return 'binance';
  return 'ctrader';
}

function hasLiveOrderOrPositionForSymbol(symbol: string, rows: UnknownRecord[]): boolean {
  const target = symbol.trim().toUpperCase();
  if (!target) return false;
  return rows.some((item) => asString(item.symbol).trim().toUpperCase() === target);
}

function matchExecutionRowForAction(
  cycleId: string,
  symbol: string,
  type: string,
  executionRows: UnknownRecord[],
): UnknownRecord {
  const normalizedCycleId = cycleId.trim();
  const normalizedSymbol = symbol.trim().toUpperCase();
  const normalizedType = type.trim().toUpperCase();
  if (!normalizedSymbol) return {};

  const exactMatches = executionRows
    .filter((row) => {
      const rowSymbol = asString(row.symbol).trim().toUpperCase();
      const rowType = asString(row.type).trim().toUpperCase();
      const rowCycleId = asString(row.cycle_id).trim();
      if (rowSymbol !== normalizedSymbol) return false;
      if (normalizedCycleId && rowCycleId && rowCycleId !== normalizedCycleId) return false;
      return !normalizedType || !rowType || rowType === normalizedType;
    })
    .sort((left, right) => asString(right.logged_at).localeCompare(asString(left.logged_at)));
  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  const symbolMatches = executionRows
    .filter((row) => {
      const rowSymbol = asString(row.symbol).trim().toUpperCase();
      const rowCycleId = asString(row.cycle_id).trim();
      if (rowSymbol !== normalizedSymbol) return false;
      return !normalizedCycleId || !rowCycleId || rowCycleId === normalizedCycleId;
    })
    .sort((left, right) => asString(right.logged_at).localeCompare(asString(left.logged_at)));
  return symbolMatches[0] || {};
}

function normalizeCurrentActions(
  actions: unknown[],
  executionRows: UnknownRecord[],
  currentCycleId: string,
  livePositions: UnknownRecord[],
  liveOrders: UnknownRecord[],
) {
  return actions
    .map((action) => {
      const item = asRecord(action);
      const symbol = asString(item.symbol).trim().toUpperCase();
      const strategy = asString(item.strategy).trim();
      const reason = summarizeValue(item.reason);
      const message = summarizeValue(item.message);
      const candidateStage = asString(item.candidate_stage).trim();
      const executionMode = asString(item.execution_mode).trim();
      const type = asString(item.type).trim();
      if (!symbol && !reason && !message) {
        return null;
      }
      const matchedExecution = matchExecutionRowForAction(currentCycleId, symbol, type, executionRows);
      const finalStatusFromLog = asString(matchedExecution.status).trim();
      const finalMessageFromLog = summarizeValue(matchedExecution.message) || summarizeValue(matchedExecution.reason);
      const isGateRejected = `${reason}\n${message}`.includes('[TRADE_GATE_PRECHECK]');
      const livePosition = hasLiveOrderOrPositionForSymbol(symbol, livePositions);
      const liveOrder = hasLiveOrderOrPositionForSymbol(symbol, liveOrders);
      const finalStatus =
        finalStatusFromLog ||
        (livePosition ? 'LIVE_POSITION' : '') ||
        (liveOrder ? 'LIVE_ORDER' : '') ||
        (isGateRejected ? 'TRADE_GATE_REJECTED' : '');
      const finalMessage =
        finalMessageFromLog ||
        (livePosition ? '交易所当前存在真实持仓' : '') ||
        (liveOrder ? '交易所当前存在真实活动挂单' : '') ||
        (isGateRejected ? compactGateRejectMessage(reason, message) : '');
      const { bucket: failureBucket, label: failureLabel } = classifyCurrentActionFailure(
        candidateStage,
        executionMode,
        finalStatus,
        finalMessage,
        reason,
        message,
      );
      return {
        symbol: symbol || '系统事件',
        exchange: inferActionExchange(symbol, asString(item.exchange)),
        type,
        status: asString(item.status).trim(),
        strategy,
        marketState: asString(item.market_state).trim(),
        timeframe: asString(item.timeframe).trim(),
        candidateStage,
        executionMode,
        entryPrice: asNumber(item.entry_price),
        stopLoss: asNumber(item.stop_loss),
        takeProfit: asNumber(item.take_profit),
        reason,
        message,
        finalStatus,
        finalMessage,
        failureBucket,
        failureLabel,
        executionAttempted: Object.keys(matchedExecution).length > 0 || type.trim().toUpperCase() === 'OPEN_ORDER',
        livePosition,
        liveOrder,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function classifyCurrentActionFailure(
  candidateStage: string,
  executionMode: string,
  finalStatus: string,
  finalMessage: string,
  reason: string,
  message: string,
): { bucket: string; label: string } {
  const text = [
    candidateStage,
    executionMode,
    finalStatus,
    finalMessage,
    reason,
    message,
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

  if (!text) return { bucket: '', label: '' };
  if (text.includes('exchange_blocked') || text.includes('binance_region_restricted') || text.includes('交易所阻断')) {
    return { bucket: 'exchange_blocked', label: '交易所阻断' };
  }
  if (text.includes('exchange_not_confirmed') || text.includes('交易所未确认')) {
    return { bucket: 'exchange_not_confirmed', label: '交易所未确认' };
  }
  if (text.includes('would_immediately_trigger') || text.includes('immediately trigger') || text.includes('立即触发')) {
    return { bucket: 'immediate_trigger', label: '立即触发拦截' };
  }
  if (text.includes('backtest_template_missing_protection') || text.includes('缺少同源止损止盈')) {
    return { bucket: 'missing_protection', label: '保护位缺失' };
  }
  if (text.includes('[semantic_precheck]') || text.includes('[semantic_block]')) {
    return { bucket: 'semantic_precheck', label: '语义预检拦截' };
  }
  if (text.includes('[trade_gate_precheck]') || text.includes('trade_gate_rejected') || text.includes('validation_rejected')) {
    return { bucket: 'trade_gate', label: 'Trade Gate 拒绝' };
  }
  if (text.includes('[live_entry_conflict]')) {
    return { bucket: 'live_entry_conflict', label: '同品种冲突' };
  }
  if (text.includes('[duplicate_in_cycle]') || text.includes('duplicate_skipped')) {
    return { bucket: 'duplicate_in_cycle', label: '同轮重复拦截' };
  }
  return { bucket: 'other', label: '其他失败' };
}

function compactGateRejectMessage(reason: string, message: string): string {
  const text = `${reason}\n${message}`.trim();
  if (!text) return '';
  const picked = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes('R:R=') || line.includes('下单被拒绝') || line.includes('[TRADE_GATE_PRECHECK]'));
  return (picked.length > 0 ? picked : text.split('\n').filter(Boolean).slice(0, 2)).join(' / ');
}

function isCandidateLikeSymbolCard(value: UnknownRecord): boolean {
  const status = asString(value.status).trim().toLowerCase();
  const stage = asString(value.stage).trim();
  return (
    status === 'pre_signal' ||
    status === 'entry_ready' ||
    stage.includes('候选') ||
    stage.includes('可执行')
  );
}

function isExecutableLikeSymbolCard(value: UnknownRecord): boolean {
  const status = asString(value.status).trim().toLowerCase();
  const stage = asString(value.stage).trim();
  const summary = asString(value.execution_summary).trim();
  return status === 'entry_ready' || stage.includes('可执行') || summary.includes('可执行');
}

function summarizeCurrentActionCounts(actions: ReturnType<typeof normalizeCurrentActions>) {
  const candidateSymbols = new Set<string>();
  const executableSymbols = new Set<string>();
  const gateRejectedSymbols = new Set<string>();
  const livePositionSymbols = new Set<string>();
  const liveOrderSymbols = new Set<string>();

  actions.forEach((item) => {
    const stage = asString(item.candidateStage).trim().toUpperCase();
    const reason = `${asString(item.reason)} ${asString(item.message)} ${asString(item.finalMessage)}`.trim();
    const hasCandidateStage = Boolean(stage);
    const isOpenOrder = asString(item.type).trim().toUpperCase() === 'OPEN_ORDER';
    const isExecutable = stage.startsWith('EXECUTABLE');
    const isGateRejected = reason.includes('[TRADE_GATE_PRECHECK]');
    const symbol = asString(item.symbol).trim().toUpperCase();

    if (symbol && (isOpenOrder || hasCandidateStage || isGateRejected)) {
      candidateSymbols.add(symbol);
    }
    if (symbol && (isOpenOrder || isExecutable) && !isGateRejected) {
      executableSymbols.add(symbol);
    }
    if (symbol && isGateRejected) {
      gateRejectedSymbols.add(symbol);
    }
    if (symbol && item.livePosition) {
      livePositionSymbols.add(symbol);
    }
    if (symbol && item.liveOrder) {
      liveOrderSymbols.add(symbol);
    }
  });

  return {
    candidateCount: candidateSymbols.size,
    executableCount: executableSymbols.size,
    gateRejectedCount: gateRejectedSymbols.size,
    livePositionCount: livePositionSymbols.size,
    liveOrderCount: liveOrderSymbols.size,
  };
}

export function normalizePayload(
  raw: UnknownRecord,
  source: 'query-service' | 'fallback',
  queryUrl: string | null,
  runtimeConfig: RuntimeConfig,
  view: RuntimeView,
  options: NormalizePayloadOptions,
) {
  const files = runtimeFiles(runtimeConfig.dataRoot);
  const snapshot = asRecord(raw.snapshot);
  const runtime = asRecord(snapshot.runtime);
  const nextScan = asRecord(snapshot.next_scan);
  const monitoring = asRecord(snapshot.monitoring);
  const patrolUptimeSeconds = options.readProcessUptimeSeconds(options.patrolPidFile);
  const execution = asRecord(snapshot.execution);
  const decisionBlock = asRecord(raw.decision);
  const decision = asRecord(decisionBlock.decision);
  const latestCycleSnapshot = asRecord(snapshot.latest_cycle);
  const latestCycleDisk = latestCycle(files, {
    preferredCycleId: asString(runtime.last_cycle_id) || null,
  });
  const latestCycleDiskPayload = asRecord(latestCycleDisk.cycle);
  const effectiveLatestCycle = hasContent(latestCycleSnapshot) ? latestCycleSnapshot : latestCycleDiskPayload;
  const snapshotDecision = hasContent(latestCycleSnapshot.decision) ? asRecord(latestCycleSnapshot.decision) : {};
  const diskDecision = hasContent(latestCycleDiskPayload.decision) ? asRecord(latestCycleDiskPayload.decision) : {};
  const latestCycleDecision =
    Object.keys(snapshotDecision).length > 0
      ? snapshotDecision
      : Object.keys(diskDecision).length > 0
        ? diskDecision
        : decision;
  const latestCycleAnalysisBoard = hasContent(latestCycleSnapshot.analysis_board)
    ? asRecord(latestCycleSnapshot.analysis_board)
    : asRecord(latestCycleDiskPayload.analysis_board);
  const includeAudit = options.shouldIncludeAudit(view);
  const includeSymbols = options.shouldIncludeSymbols(view);
  const includeExposure = options.shouldIncludeExposure(view);
  const includeExecutionHistory = options.shouldIncludeExecutionHistory(view);
  const includeCapacity = options.shouldIncludeCapacity(view);
  const includeSystemHistory = options.shouldIncludeSystemHistory(view);
  const capacityLevel = options.capacityDetailLevel(view);

  const focusSymbols = asStringArray(runtime.focus_symbols);
  const actionMap = new Map<string, UnknownRecord>();
  const symbolUpdates = asRecord(latestCycleDecision.symbol_updates);
  const runtimeSymbols = asRecord(runtime.symbols);
  const symbols = includeSymbols
    ? (() => {
        asArray(latestCycleDecision.actions).forEach((action) => {
          const item = asRecord(action);
          const symbol = asString(item.symbol);
          if (symbol) {
            actionMap.set(symbol, item);
          }
        });

        const symbolKeys = Array.from(
          new Set([
            ...focusSymbols,
            ...Object.keys(symbolUpdates).filter((key) => looksLikeTrackedSymbol(key)),
            ...Object.keys(runtimeSymbols).filter((key) => looksLikeTrackedSymbol(key)),
          ]),
        );

        return symbolKeys.map((symbol) =>
          normalizeSymbolCard({
            symbol,
            patchValue: {
              ...asRecord(symbolUpdates[symbol]),
              chart_context: asRecord(asRecord(latestCycleAnalysisBoard[symbol]).chart_context),
              ...asRecord(asRecord(latestCycleAnalysisBoard[symbol]).chart_context),
            },
            actionMap,
            fallbackValue: runtimeSymbols[symbol],
          }),
        );
      })()
    : [];
  const summaryStrategyFamilies = buildLightStrategyFamilies(symbols);

  const primaryReadingTargetSymbol =
    focusSymbols.find((symbol) => typeof latestCycleAnalysisBoard[symbol] === 'object' && latestCycleAnalysisBoard[symbol] !== null) ||
    Object.keys(latestCycleAnalysisBoard).find((symbol) => typeof latestCycleAnalysisBoard[symbol] === 'object' && latestCycleAnalysisBoard[symbol] !== null) ||
    '';
  const primaryReadingBoard = asRecord(latestCycleAnalysisBoard[primaryReadingTargetSymbol]);
  const readingTargets = asRecord(primaryReadingBoard.reading_targets);

  const positions = aggregateExecutionEntries(execution, 'positions');
  const orders = aggregateExecutionEntries(execution, 'orders');
  const canTrade = asRecord(execution.can_trade);
  const health = asRecord(execution.health);
  const funnel = asRecord(asRecord(raw.funnel).data);
  const accounts = normalizeExecutionAccounts({
    execution,
    runtime,
    defaultExecutionBase: runtimeConfig.defaultExecutionBase,
  });
  const openPositions = includeExposure || includeCapacity ? normalizeOpenPositions(execution) : [];
  const openOrders = includeExposure || includeCapacity ? normalizeOpenOrders(execution) : [];
  const executionContext = includeExecutionHistory
    ? options.buildExecutionContextCached(files, openPositions, openOrders)
    : emptyRuntimeExecutionContext(includeExposure ? openPositions : [], includeExposure ? openOrders : []);
  const profiling = normalizeProfiling(
    hasContent(latestCycleSnapshot) ? latestCycleSnapshot : latestCycleDiskPayload,
    runtime,
  );
  const trackedSymbols = Array.from(
    new Set([
      ...focusSymbols,
      ...asStringArray(runtime.active_symbols),
      ...accounts.flatMap((item) => item.configuredSymbols || []),
    ].filter(Boolean).map((item) => asString(item).trim().toUpperCase())),
  );
  const capacity = includeCapacity
    ? options.buildCapacitySummaryCached(
        files,
        execution,
        executionContext.positions,
        executionContext.orders,
        trackedSymbols,
        capacityLevel,
      )
    : emptyRuntimeCapacitySummary(trackedSymbols.length);
  const audit = includeAudit ? normalizeAudit(asRecord(snapshot.audit)) : normalizeAudit({});
  const recentExecutionRows = readJsonlRecent(files.executionLog, 800);
  const currentCycleId = asString(effectiveLatestCycle.cycle_id) || asString(runtime.last_cycle_id);
  const currentActions = normalizeCurrentActions(
    asArray(latestCycleDecision.actions),
    recentExecutionRows,
    currentCycleId,
    executionContext.positions,
    executionContext.orders,
  );
  const currentActionCounts = summarizeCurrentActionCounts(currentActions);
  const candidateCount = currentActionCounts.candidateCount;
  const executableCount = currentActionCounts.executableCount;
  const tradingPerformance = asRecord(snapshot.trading_performance);
  const recentCycles = includeSystemHistory
    ? (asArray(asRecord(raw.recent).items).length > 0 ? asArray(asRecord(raw.recent).items) : asArray(snapshot.recent_cycles)).map((item) => {
        const cycle = asRecord(item);
        return {
          cycleId: asString(cycle.cycle_id),
          phase: asString(cycle.phase),
          nextScanSeconds: asNumber(cycle.next_scan_seconds),
          focusSymbols: asStringArray(cycle.focus_symbols),
          summary: summarizeValue(cycle.market_summary),
        };
      })
    : [];

  return {
    runtimeKey: runtimeConfig.key,
    runtimeLabel: runtimeConfig.label,
    source,
    queryUrl,
    health: {
      overall: asString(snapshot.overall_health) || 'UNKNOWN',
      cycleFresh: snapshot.cycle_fresh ?? null,
      freshnessLabel:
        snapshot.cycle_fresh === true ? '新鲜' : snapshot.cycle_fresh === false ? '陈旧' : '待确认',
      cycleAgeSeconds: asNumber(snapshot.latest_cycle_age_seconds),
      patrolLive: asBoolean(snapshot.patrol_live) ?? false,
      queryLive: asBoolean(snapshot.query_live) ?? false,
      executionPortOpen: asBoolean(snapshot.execution_port_open) ?? false,
    },
    runtime: {
      botId: asString(runtime.bot_id) || runtimeConfig.botId,
      exchange: asString(runtime.exchange) || asString(health.exchange),
      marketProfile: asString(runtime.market_profile),
      phase: asString(runtime.current_phase) || asString(latestCycleDecision.phase) || asString(effectiveLatestCycle.phase),
      focusSymbols,
      activeSymbols: asStringArray(runtime.active_symbols),
      dryRun: asBoolean(runtime.dry_run) ?? true,
      bestCandidate: asString(runtime.best_candidate),
      bestCandidateStatus: asString(runtime.best_candidate_status),
      tradeReadiness: asString(runtime.trade_readiness),
      lastScanDecision: summarizeValue(runtime.last_scan_decision),
      decisionEngine: asString(runtime.decision_engine) || 'RULE_ENGINE',
      riskMode: asString(runtime.risk_mode),
    },
    summary: {
      cycleId: asString(effectiveLatestCycle.cycle_id) || asString(runtime.last_cycle_id) || null,
      marketSummary: summarizeValue(latestCycleDecision.market_summary) || summarizeValue(runtime.last_scan_decision),
      explanation: summarizeValue(latestCycleDecision.explanation),
      actionsCount: asArray(latestCycleDecision.actions).length,
      candidateCount,
      executableCount,
      gateRejectedCount: currentActionCounts.gateRejectedCount,
      livePositionCount: currentActionCounts.livePositionCount,
      liveOrderCount: currentActionCounts.liveOrderCount,
      positionManagementCount: asArray(latestCycleDecision.position_management).length,
      strategyFamilies: summaryStrategyFamilies,
      strategyCatalog: buildStrategyCatalog(),
      readingTargets: {
        barCountTotal: asNumber(readingTargets.bar_count_total),
        browseTargetBars: asNumber(readingTargets.browse_target_bars),
        closeReadTargetBars: asNumber(readingTargets.close_read_target_bars),
      },
      promptReferences: asStringArray(asRecord(latestCycleDecision.state_patch).prompt_references),
    },
    execution: {
      exchange: asString(health.exchange),
      accountAsset: asString(health.account_asset),
      canTrade: asBoolean(canTrade.can_trade),
      canTradeReason: asString(canTrade.reason),
      exchangeBlocked:
        asBoolean(asRecord(canTrade.exchange_block).blocked) ?? asBoolean(health.exchange_blocked) ?? false,
      exchangeBlockCode: asString(asRecord(canTrade.exchange_block).code) || asString(health.exchange_block_code),
      exchangeBlockReason:
        asString(asRecord(canTrade.exchange_block).reason) || asString(health.exchange_block_reason),
      exchangeBlockUpdatedAt:
        asString(asRecord(canTrade.exchange_block).updated_at) || asString(health.exchange_block_updated_at),
      positionsCount: positions.length,
      ordersCount: orders.length,
      healthStatus: asString(health.status),
    },
    system: {
      latestCyclePath: asString(snapshot.latest_cycle_path) || null,
      sourceLabel: source,
      accounts,
    },
    positions: executionContext.positions,
    orders: executionContext.orders,
    profiling,
    timestamps: {
      latestCycleAt: asString(effectiveLatestCycle.time_utc) || null,
      lastSuccessAt: asString(snapshot.last_success_at) || null,
      lastFailureAt: asString(snapshot.last_failure_at) || null,
      lastFailureReason: asString(snapshot.last_failure_reason) || null,
    },
    monitoring: {
      knowledgeChars: asNumber(monitoring.knowledge_chars),
      refsCount: asNumber(monitoring.refs_count) ?? 0,
      fullRefsCount: asNumber(monitoring.full_refs_count) ?? 0,
      briefRefsCount: asNumber(monitoring.brief_refs_count) ?? 0,
      requestChars: asNumber(monitoring.request_chars),
      requestSizeBytes: asNumber(monitoring.request_size_bytes),
      sessionAgeSeconds: asNumber(monitoring.session_age_seconds),
      uptimeSeconds: asNumber(monitoring.uptime_seconds) ?? patrolUptimeSeconds,
      sessionTurnCount: asNumber(monitoring.session_turn_count),
    },
    performance: {
      rangeLabel: asString(tradingPerformance.rangeLabel),
      startAt: asString(tradingPerformance.startAt) || null,
      endAt: asString(tradingPerformance.endAt) || null,
      total: {
        tradeRows: asNumber(asRecord(tradingPerformance.total).tradeRows) ?? 0,
        realizedTradeCount: asNumber(asRecord(tradingPerformance.total).realizedTradeCount) ?? 0,
        wins: asNumber(asRecord(tradingPerformance.total).wins) ?? 0,
        losses: asNumber(asRecord(tradingPerformance.total).losses) ?? 0,
        winRatePct: asNumber(asRecord(tradingPerformance.total).winRatePct) ?? 0,
        grossProfit: asNumber(asRecord(tradingPerformance.total).grossProfit) ?? 0,
        grossLoss: asNumber(asRecord(tradingPerformance.total).grossLoss) ?? 0,
        profitFactor: asNumber(asRecord(tradingPerformance.total).profitFactor),
        commission: asNumber(asRecord(tradingPerformance.total).commission) ?? 0,
        netRealized: asNumber(asRecord(tradingPerformance.total).netRealized) ?? 0,
        cleanup: {
          partialClosed: asNumber(asRecord(asRecord(tradingPerformance.total).cleanup).partialClosed) ?? 0,
          closeSuccess: asNumber(asRecord(asRecord(tradingPerformance.total).cleanup).closeSuccess) ?? 0,
          sizeFailed: asNumber(asRecord(asRecord(tradingPerformance.total).cleanup).sizeFailed) ?? 0,
          notFound: asNumber(asRecord(asRecord(tradingPerformance.total).cleanup).notFound) ?? 0,
          modifyFailed: asNumber(asRecord(asRecord(tradingPerformance.total).cleanup).modifyFailed) ?? 0,
          modifySkipped: asNumber(asRecord(asRecord(tradingPerformance.total).cleanup).modifySkipped) ?? 0,
        },
      },
      exchanges: asArray(tradingPerformance.exchanges).map((item) => {
        const record = asRecord(item);
        const cleanup = asRecord(record.cleanup);
        return {
          exchange: asString(record.exchange),
          label: asString(record.label),
          startAt: asString(record.startAt) || null,
          endAt: asString(record.endAt) || null,
          tradeRows: asNumber(record.tradeRows) ?? 0,
          realizedTradeCount: asNumber(record.realizedTradeCount) ?? 0,
          wins: asNumber(record.wins) ?? 0,
          losses: asNumber(record.losses) ?? 0,
          winRatePct: asNumber(record.winRatePct) ?? 0,
          grossProfit: asNumber(record.grossProfit) ?? 0,
          grossLoss: asNumber(record.grossLoss) ?? 0,
          profitFactor: asNumber(record.profitFactor),
          commission: asNumber(record.commission) ?? 0,
          netRealized: asNumber(record.netRealized) ?? 0,
          cleanup: {
            partialClosed: asNumber(cleanup.partialClosed) ?? 0,
            closeSuccess: asNumber(cleanup.closeSuccess) ?? 0,
            sizeFailed: asNumber(cleanup.sizeFailed) ?? 0,
            notFound: asNumber(cleanup.notFound) ?? 0,
            modifyFailed: asNumber(cleanup.modifyFailed) ?? 0,
            modifySkipped: asNumber(cleanup.modifySkipped) ?? 0,
          },
        };
      }),
    },
    audit,
    nextScan: {
      inSeconds: asNumber(nextScan.in_seconds),
      requestedSeconds: asNumber(nextScan.requested_seconds),
      modelSuggestedSeconds: asNumber(nextScan.model_suggested_seconds),
      modelSuggestedReason: summarizeValue(nextScan.model_suggested_reason),
      reasonCode: asString(nextScan.reason_code),
      reasonText: summarizeValue(nextScan.reason_text),
      bucketRule: summarizeValue(nextScan.bucket_rule),
      bucketSourceRefs: asStringArray(nextScan.bucket_source_refs),
    },
    capacity,
    symbols,
    recentCycles,
    recentDecisions: includeSystemHistory
      ? asArray(snapshot.decision_tail).map((item) => {
          const decisionItem = asRecord(item);
          return {
            loggedAt: asString(decisionItem.logged_at) || asString(decisionItem.timestamp),
            cycleId: asString(decisionItem.cycle_id),
            summary: summarizeValue(decisionItem.decision_summary) || summarizeValue(decisionItem.reason),
            actionsCount: asArray(decisionItem.actions).length,
            focusSymbols: asStringArray(decisionItem.focus_symbols),
          };
        })
      : [],
    recentExecutions: includeExecutionHistory ? executionContext.recentExecutions : [],
    managementActions: includeExecutionHistory ? executionContext.managementActions : [],
    historicalOrders: includeExecutionHistory ? executionContext.historicalOrders : [],
    currentActions,
    funnel: includeSystemHistory
      ? {
          counts: {
            filled: asNumber(asRecord(funnel.counts).filled) ?? 0,
            candidateExecutionFailed: asNumber(asRecord(funnel.counts).candidate_execution_failed) ?? 0,
            candidateGateRejected: asNumber(asRecord(funnel.counts).candidate_gate_rejected) ?? 0,
            preSignalOnly: asNumber(asRecord(funnel.counts).pre_signal_only) ?? 0,
          },
          topThemes: topThemes(asRecord(funnel.themes)),
        }
      : {
          counts: {
            filled: 0,
            candidateExecutionFailed: 0,
            candidateGateRejected: 0,
            preSignalOnly: 0,
          },
          topThemes: [],
        },
  };
}
