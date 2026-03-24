import { buildStrategyCatalog } from './runtime-contract';
import { buildCapacitySummary as buildRuntimeCapacitySummary, emptyCapacitySummary as emptyRuntimeCapacitySummary } from './runtime-capacity';
import { buildRuntimeExecutionContext, emptyRuntimeExecutionContext } from './runtime-execution-context';
import { aggregateExecutionEntries, normalizeExecutionAccounts, normalizeOpenOrders, normalizeOpenPositions } from './runtime-accounts';
import { normalizeProfiling } from './runtime-profiling';
import { buildLightStrategyFamilies, looksLikeTrackedSymbol, normalizeSymbolCard } from './runtime-symbols';
import { latestCycle, runtimeFiles, type RuntimeFiles } from './runtime-files';
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
  const latestCycleDecision =
    Object.keys(decision).length > 0
      ? decision
      : hasContent(latestCycleSnapshot.decision)
        ? asRecord(latestCycleSnapshot.decision)
        : asRecord(latestCycleDiskPayload.decision);
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
      llmProvider: asString(runtime.llm_provider),
      decisionModel: asString(runtime.decision_model),
      decisionSessionId: asString(runtime.decision_session_id),
      riskMode: asString(runtime.risk_mode),
    },
    summary: {
      cycleId: asString(effectiveLatestCycle.cycle_id) || asString(runtime.last_cycle_id) || null,
      marketSummary: summarizeValue(latestCycleDecision.market_summary) || summarizeValue(runtime.last_scan_decision),
      explanation: summarizeValue(latestCycleDecision.explanation),
      actionsCount: asArray(latestCycleDecision.actions).length,
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
      sessionModel: asString(monitoring.session_model) || null,
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
