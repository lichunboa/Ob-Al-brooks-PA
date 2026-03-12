import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_QUERY_BASE = 'http://127.0.0.1:8086';
const DEFAULT_EXECUTION_BASE = 'http://127.0.0.1:8092';
const DEFAULT_CRYPTO_EXECUTION_BASE = 'http://127.0.0.1:8094';

const PROJECT_ROOT = path.join(process.cwd(), '..');
const AGENT_ROOT = path.join(PROJECT_ROOT, 'AB Patrol-Agent');

type RuntimeConfig = {
  key: 'primary' | 'secondary';
  label: string;
  botId: string;
  dataRoot: string;
  defaultQueryBase: string;
  defaultExecutionBase: string;
  allowQuery: boolean;
};

type RuntimeFiles = {
  stateDir: string;
  cyclesDir: string;
  journalDir: string;
  decisionLog: string;
  executionLog: string;
  requestFile: string;
  sessionFile: string;
  runtimeState: string;
  nextScan: string;
};

const RUNTIME_CONFIGS: RuntimeConfig[] = [
  {
    key: 'primary',
    label: '多资产主栈',
    botId: 'claude-pa',
    dataRoot: path.join(AGENT_ROOT, 'data', 'pa_trader'),
    defaultQueryBase: DEFAULT_QUERY_BASE,
    defaultExecutionBase: DEFAULT_EXECUTION_BASE,
    allowQuery: true,
  },
  {
    key: 'secondary',
    label: 'Binance Demo',
    botId: 'al-brooks',
    dataRoot: path.join(AGENT_ROOT, 'data', 'pa_trader_crypto'),
    defaultQueryBase: '',
    defaultExecutionBase:
      process.env.AB_PATROL_EXECUTION_CRYPTO_BASE ||
      process.env.NEXT_PUBLIC_EXECUTION_CRYPTO_API_URL ||
      DEFAULT_CRYPTO_EXECUTION_BASE,
    allowQuery: false,
  },
];

type UnknownRecord = Record<string, unknown>;

function runtimeFiles(dataRoot: string): RuntimeFiles {
  const stateDir = path.join(dataRoot, 'state');
  const journalDir = path.join(dataRoot, 'journal');

  return {
    stateDir,
    cyclesDir: path.join(dataRoot, 'cycles'),
    journalDir,
    decisionLog: path.join(journalDir, 'decision_log.jsonl'),
    executionLog: path.join(journalDir, 'execution_log.jsonl'),
    requestFile: path.join(dataRoot, 'logs', 'decision', 'last_request.md'),
    sessionFile: path.join(stateDir, 'decision_session.json'),
    runtimeState: path.join(stateDir, 'runtime_state.json'),
    nextScan: path.join(stateDir, 'next_scan.json'),
  };
}

function hasRuntimeData(files: RuntimeFiles): boolean {
  return [files.runtimeState, files.cyclesDir, files.decisionLog, files.executionLog].some((filePath) => fs.existsSync(filePath));
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => asString(item)).filter(Boolean);
}

function looksLikeTrackedSymbol(value: string): boolean {
  return Boolean(value) && !value.startsWith('_') && value.length <= 24 && /^[A-Z0-9/:\- ]+$/.test(value);
}

function readJson(filePath: string): UnknownRecord {
  try {
    if (!fs.existsSync(filePath)) return {};
    return asRecord(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch {
    return {};
  }
}

function readJsonlTail(filePath: string, limit = 5): UnknownRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter((line) => line.trim());
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return asRecord(JSON.parse(line));
        } catch {
          return {};
        }
      })
      .filter((item) => Object.keys(item).length > 0)
      .reverse();
  } catch {
    return [];
  }
}

function readText(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

function latestCycle(files: RuntimeFiles): { cyclePath: string | null; cycle: UnknownRecord; cycleAgeSeconds: number | null } {
  try {
    if (!fs.existsSync(files.cyclesDir)) {
      return { cyclePath: null, cycle: {}, cycleAgeSeconds: null };
    }
    const cycleFiles = fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort();
    const latest = cycleFiles.at(-1);
    if (!latest) {
      return { cyclePath: null, cycle: {}, cycleAgeSeconds: null };
    }
    const cyclePath = path.join(files.cyclesDir, latest);
    const stat = fs.statSync(cyclePath);
    const cycleAgeSeconds = Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000));
    return {
      cyclePath,
      cycle: readJson(cyclePath),
      cycleAgeSeconds,
    };
  } catch {
    return { cyclePath: null, cycle: {}, cycleAgeSeconds: null };
  }
}

function recentCycles(files: RuntimeFiles, limit = 5): UnknownRecord[] {
  try {
    if (!fs.existsSync(files.cyclesDir)) return [];
    return fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort()
      .slice(-limit)
      .reverse()
      .map((file) => {
        const payload = readJson(path.join(files.cyclesDir, file));
        const decision = asRecord(payload.decision);
        return {
          cycle_id: asString(payload.cycle_id) || file.replace(/\.json$/, ''),
          phase: asString(decision.phase) || asString(payload.phase),
          focus_symbols: asStringArray(decision.focus_symbols),
          next_scan_seconds: asNumber(decision.next_scan_seconds),
          market_summary: decision.market_summary,
        };
      });
  } catch {
    return [];
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function summarizeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => summarizeValue(item)).filter(Boolean).join(' / ');
  }

  if (!isRecord(value)) {
    return '';
  }

  const preferredKeys = ['summary', 'decision', 'daily_context', 'intraday_context', 'risk', 'reason'];
  const preferredParts = preferredKeys.map((key) => summarizeValue(value[key])).filter(Boolean);
  if (preferredParts.length > 0) {
    return preferredParts.join(' ');
  }

  const genericParts = Object.values(value).map((item) => summarizeValue(item)).filter(Boolean);
  return genericParts.slice(0, 4).join(' ');
}

function formatPreSignal(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!isRecord(value)) return '';

  const side = asString(value.side);
  const kind = asString(value.kind);
  const active = asBoolean(value.active);
  const parts = [
    active === null ? '' : active ? '激活' : '未激活',
    side,
    kind,
  ].filter(Boolean);
  return parts.join(' / ');
}

function formatEntryAction(action: UnknownRecord, plannedTrade: UnknownRecord): string {
  const actionSide = asString(action.side);
  const actionEntry = asNumber(action.entry) ?? asNumber(action.entry_price);
  const actionOrderType = asString(action.order_type);
  if (actionSide || actionEntry !== null || actionOrderType) {
    const bits = [
      actionSide,
      actionOrderType,
      actionEntry !== null ? `@${actionEntry}` : '',
    ].filter(Boolean);
    return bits.join(' / ');
  }

  const plannedSide = asString(plannedTrade.side);
  const plannedOrderType = asString(plannedTrade.order_type);
  const plannedEntry = asNumber(plannedTrade.entry_price);
  const entryZone = asArray(plannedTrade.entry_zone)
    .map((item) => (typeof item === 'number' ? `${item}` : ''))
    .filter(Boolean)
    .join(' - ');

  return [
    plannedSide,
    plannedOrderType,
    plannedEntry !== null ? `@${plannedEntry}` : entryZone,
  ]
    .filter(Boolean)
    .join(' / ');
}

function normalizeSymbolCard(
  symbol: string,
  patchValue: unknown,
  actionMap: Map<string, UnknownRecord>,
  fallbackValue: unknown,
) {
  const fallback = asRecord(fallbackValue);
  const current = asRecord(patchValue);
  const patch: UnknownRecord = {
    ...fallback,
    ...current,
    planned_trade: {
      ...asRecord(fallback.planned_trade),
      ...asRecord(current.planned_trade),
    },
    entry_idea: {
      ...asRecord(fallback.entry_idea),
      ...asRecord(current.entry_idea),
    },
    evaluation: {
      ...asRecord(fallback.evaluation),
      ...asRecord(current.evaluation),
    },
    brooks_filter: {
      ...asRecord(fallback.brooks_filter),
      ...asRecord(current.brooks_filter),
    },
  };
  const plannedTrade = asRecord(patch.planned_trade);
  const executionSemantics = asRecord(plannedTrade.execution_semantics);
  const entryIdea = asRecord(patch.entry_idea);
  const evaluation = asRecord(patch.evaluation);
  const brooksFilter = asRecord(patch.brooks_filter);

  const candidateStage =
    asString(plannedTrade.candidate_stage_cn) ||
    asString(entryIdea.candidate_stage_cn) ||
    asString(evaluation.candidate_stage) ||
    asString(patch.status);
  const executionMode =
    asString(plannedTrade.execution_mode_cn) ||
    asString(entryIdea.execution_mode_cn) ||
    asString(evaluation.execution_mode);
  const executionSummary = [candidateStage, executionMode].filter(Boolean).join(' | ');

  return {
    symbol,
    status: asString(patch.status) || asString(plannedTrade.status) || 'watch',
    stage: asString(patch.stage),
    ai_direction: asString(patch.ai_direction),
    market_state: asString(patch.market_state),
    thesis:
      asString(patch.thesis) ||
      asString(patch.running_narrative) ||
      asString(patch.structure_summary) ||
      asString(patch.market_state) ||
      asString(patch.stage),
    structure_summary:
      asString(patch.structure_summary) ||
      asString(patch.market_state) ||
      asString(patch.stage),
    pre_signal: formatPreSignal(patch.pre_signal),
    execution_summary: executionSummary,
    brooks_label:
      asString(brooksFilter.label) ||
      asString(plannedTrade.brooks_label) ||
      asString(patch.brooks_label),
    upgrade_condition:
      asString(plannedTrade.upgrade_condition) ||
      asString(entryIdea.upgrade_condition) ||
      asString(patch.upgrade_condition),
    planned_action: formatEntryAction(actionMap.get(symbol) ?? {}, plannedTrade),
    refs: asStringArray(patch.refs).length > 0
      ? asStringArray(patch.refs)
      : asStringArray(plannedTrade.source_refs).length > 0
        ? asStringArray(plannedTrade.source_refs)
        : asStringArray(entryIdea.source_refs),
    risk: asString(evaluation.risk),
    order_type: asString(plannedTrade.order_type),
    entry_price: asNumber(plannedTrade.entry_price),
    execution_mode: asString(executionSemantics.execution_mode_cn) || executionMode,
  };
}

function topThemes(value: unknown): Array<{ label: string; count: number }> {
  const entries = Object.entries(asRecord(value))
    .map(([label, count]) => ({ label, count: asNumber(count) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
  return entries;
}

function normalizePayload(
  raw: UnknownRecord,
  source: 'query-service' | 'fallback',
  queryUrl: string | null,
  runtimeConfig: RuntimeConfig,
) {
  const snapshot = asRecord(raw.snapshot);
  const runtime = asRecord(snapshot.runtime);
  const nextScan = asRecord(snapshot.next_scan);
  const monitoring = asRecord(snapshot.monitoring);
  const execution = asRecord(snapshot.execution);
  const decisionBlock = asRecord(raw.decision);
  const decision = asRecord(decisionBlock.decision);
  const latestCycle = asRecord(snapshot.latest_cycle);
  const latestCycleDecision = Object.keys(decision).length > 0 ? decision : asRecord(latestCycle.decision);
  const latestCycleAnalysisBoard = asRecord(latestCycle.analysis_board);

  const focusSymbols = asStringArray(runtime.focus_symbols);
  const actionMap = new Map<string, UnknownRecord>();
  asArray(latestCycleDecision.actions).forEach((action) => {
    const item = asRecord(action);
    const symbol = asString(item.symbol);
    if (symbol) {
      actionMap.set(symbol, item);
    }
  });

  const symbolUpdates = asRecord(latestCycleDecision.symbol_updates);
  const runtimeSymbols = asRecord(runtime.symbols);
  const symbolKeys = Array.from(
    new Set([
      ...focusSymbols,
      ...Object.keys(symbolUpdates).filter((key) => looksLikeTrackedSymbol(key)),
      ...Object.keys(runtimeSymbols).filter((key) => looksLikeTrackedSymbol(key)),
    ]),
  );

  const symbols = symbolKeys.map((symbol) =>
    normalizeSymbolCard(
      symbol,
      symbolUpdates[symbol],
      actionMap,
      runtimeSymbols[symbol],
    ),
  );

  const primaryReadingTargetSymbol =
    focusSymbols.find((symbol) => isRecord(latestCycleAnalysisBoard[symbol])) ||
    Object.keys(latestCycleAnalysisBoard).find((symbol) => isRecord(latestCycleAnalysisBoard[symbol])) ||
    '';
  const primaryReadingBoard = asRecord(latestCycleAnalysisBoard[primaryReadingTargetSymbol]);
  const readingTargets = asRecord(primaryReadingBoard.reading_targets);

  const positions = asArray(execution.positions);
  const orders = asArray(execution.orders);
  const canTrade = asRecord(execution.can_trade);
  const health = asRecord(execution.health);
  const funnel = asRecord(asRecord(raw.funnel).data);

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
      phase: asString(runtime.current_phase) || asString(latestCycleDecision.phase) || asString(latestCycle.phase),
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
      cycleId: asString(latestCycle.cycle_id) || asString(runtime.last_cycle_id) || null,
      marketSummary: summarizeValue(latestCycleDecision.market_summary) || summarizeValue(runtime.last_scan_decision),
      explanation: summarizeValue(latestCycleDecision.explanation),
      actionsCount: asArray(latestCycleDecision.actions).length,
      positionManagementCount: asArray(latestCycleDecision.position_management).length,
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
      positionsCount: positions.length,
      ordersCount: orders.length,
      healthStatus: asString(health.status),
    },
    timestamps: {
      latestCycleAt: asString(latestCycle.time_utc) || null,
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
      sessionTurnCount: asNumber(monitoring.session_turn_count),
      sessionModel: asString(monitoring.session_model) || null,
    },
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
    symbols,
    recentCycles: (asArray(asRecord(raw.recent).items).length > 0
      ? asArray(asRecord(raw.recent).items)
      : asArray(snapshot.recent_cycles)
    ).map((item) => {
      const cycle = asRecord(item);
      return {
        cycleId: asString(cycle.cycle_id),
        phase: asString(cycle.phase),
        nextScanSeconds: asNumber(cycle.next_scan_seconds),
        focusSymbols: asStringArray(cycle.focus_symbols),
        summary: summarizeValue(cycle.market_summary),
      };
    }),
    recentDecisions: asArray(snapshot.decision_tail).map((item) => {
      const decisionItem = asRecord(item);
      return {
        loggedAt: asString(decisionItem.logged_at) || asString(decisionItem.timestamp),
        cycleId: asString(decisionItem.cycle_id),
        summary: summarizeValue(decisionItem.decision_summary) || summarizeValue(decisionItem.reason),
        actionsCount: asArray(decisionItem.actions).length,
        focusSymbols: asStringArray(decisionItem.focus_symbols),
      };
    }),
    recentExecutions: asArray(snapshot.execution_tail).map((item) => {
      const executionItem = asRecord(item);
      return {
        loggedAt: asString(executionItem.logged_at) || asString(executionItem.timestamp),
        cycleId: asString(executionItem.cycle_id),
        symbol: asString(executionItem.symbol),
        status: asString(executionItem.status),
        message: summarizeValue(executionItem.message),
        success: asBoolean(executionItem.success),
      };
    }),
    funnel: {
      counts: {
        filled: asNumber(asRecord(funnel.counts).filled) ?? 0,
        candidateExecutionFailed: asNumber(asRecord(funnel.counts).candidate_execution_failed) ?? 0,
        candidateGateRejected: asNumber(asRecord(funnel.counts).candidate_gate_rejected) ?? 0,
        preSignalOnly: asNumber(asRecord(funnel.counts).pre_signal_only) ?? 0,
      },
      topThemes: topThemes(asRecord(funnel.themes)),
    },
  };
}

async function buildFallbackPayload(runtimeConfig: RuntimeConfig, queryBase: string | null): Promise<UnknownRecord> {
  const files = runtimeFiles(runtimeConfig.dataRoot);
  const runtime = readJson(files.runtimeState);
  const nextScan = readJson(files.nextScan);
  const latest = latestCycle(files);
  const requestText = readText(files.requestFile);
  const session = readJson(files.sessionFile);
  const queryHealth = queryBase ? await fetchJson(`${queryBase.replace(/\/$/, '')}/health`) : null;

  const executionBase = runtimeConfig.defaultExecutionBase.replace(/\/$/, '');
  const executionHealth = await fetchJson(`${executionBase}/health`);
  const positions = await fetchJson(`${executionBase}/positions`);
  const orders = await fetchJson(`${executionBase}/orders/open`);
  const canTrade = await fetchJson(`${executionBase}/trading/can-trade/${runtimeConfig.botId}`);
  const sessionBootstrappedAt = asNumber(session.bootstrapped_at);

  const runtimeStatAgeSeconds = (() => {
    try {
      const stat = fs.statSync(files.runtimeState);
      return Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000));
    } catch {
      return null;
    }
  })();

  const cycleFresh = latest.cycleAgeSeconds === null ? null : latest.cycleAgeSeconds <= 900;
  const patrolLive = runtimeStatAgeSeconds !== null ? runtimeStatAgeSeconds <= 600 : false;
  const queryLive = isRecord(queryHealth) && Object.keys(queryHealth).length > 0;
  const executionPortOpen = isRecord(executionHealth);

  return {
    snapshot: {
      runtime,
      next_scan: Object.keys(nextScan).length > 0 ? nextScan : runtime.next_scan,
      latest_cycle_path: latest.cyclePath,
      latest_cycle: latest.cycle,
      recent_cycles: recentCycles(files, 5),
      decision_tail: readJsonlTail(files.decisionLog, 5),
      execution_tail: readJsonlTail(files.executionLog, 5),
      monitoring: {
        knowledge_chars: asNumber(asRecord(runtime.knowledge_loading).knowledge_chars),
        refs_count: asNumber(asRecord(runtime.knowledge_loading).refs_count) ?? 0,
        full_refs_count: asNumber(asRecord(runtime.knowledge_loading).full_reference_count) ?? 0,
        brief_refs_count: asNumber(asRecord(runtime.knowledge_loading).brief_reference_count) ?? 0,
        request_chars: requestText.length,
        request_size_bytes: Buffer.byteLength(requestText),
        session_age_seconds:
          sessionBootstrappedAt === null ? null : Math.max(0, Math.floor(Date.now() / 1000 - sessionBootstrappedAt)),
        session_turn_count: asNumber(session.turn_count),
        session_model: asString(session.model),
      },
      execution: {
        health: executionHealth,
        positions,
        orders,
        can_trade: canTrade,
      },
      overall_health:
        patrolLive && executionPortOpen && cycleFresh !== false ? 'HEALTHY' : patrolLive || executionPortOpen ? 'DEGRADED' : 'DOWN',
      cycle_fresh: cycleFresh,
      latest_cycle_age_seconds: latest.cycleAgeSeconds,
      last_success_at: runtime.last_success_at,
      last_failure_at: runtime.last_failure_at,
      last_failure_reason: runtime.last_failure_reason,
      patrol_live: patrolLive,
      query_live: queryLive,
      execution_port_open: executionPortOpen,
    },
    recent: { items: recentCycles(files, 5) },
    decision: {
      cycle_path: latest.cyclePath,
      decision: asRecord(latest.cycle.decision),
    },
    funnel: {
      data: {},
    },
    query_base: queryBase,
  };
}

export async function GET() {
  const runtimeResults = await Promise.all(
    RUNTIME_CONFIGS.map(async (runtimeConfig) => {
      const files = runtimeFiles(runtimeConfig.dataRoot);
      if (!hasRuntimeData(files)) {
        return null;
      }

      const runtime = readJson(files.runtimeState);
      const configuredQueryBase =
        runtimeConfig.allowQuery
          ? asString(runtime.query_service_base) || process.env.AB_PATROL_QUERY_BASE || runtimeConfig.defaultQueryBase
          : null;
      const queryUrl = configuredQueryBase
        ? `${configuredQueryBase.replace(/\/$/, '')}/api/v1/runtime/full`
        : null;

      if (queryUrl) {
        const remote = await fetchJson(queryUrl);
        if (isRecord(remote) && isRecord(remote.snapshot)) {
          return normalizePayload(remote, 'query-service', queryUrl, runtimeConfig);
        }
      }

      const fallback = await buildFallbackPayload(runtimeConfig, configuredQueryBase);
      return normalizePayload(fallback, 'fallback', queryUrl, runtimeConfig);
    }),
  );

  const runtimes = runtimeResults.filter((item): item is NonNullable<(typeof runtimeResults)[number]> => item !== null);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    primary: runtimes.find((item) => asString(item.runtimeKey) === 'primary') ?? null,
    secondary: runtimes.find((item) => asString(item.runtimeKey) === 'secondary') ?? null,
    runtimes,
  });
}
