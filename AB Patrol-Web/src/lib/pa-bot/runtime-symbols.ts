import {
  canonicalStrategyLabel,
  detectStrategyFamily,
  familyLabelFromText,
  inferFamilyFromSignals,
} from './runtime-schema';
import type { UnknownRecord } from './runtime-contract';

type NormalizeSymbolCardInput = {
  symbol: string;
  patchValue: unknown;
  fallbackValue: unknown;
  actionMap: Map<string, UnknownRecord>;
};

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

function looksLikeMagIdentity(value: unknown): boolean {
  const text = asString(value).trim().toUpperCase();
  return Boolean(text) && (text.includes('MAG 20/20') || text.includes('T3_MAG_2020_SETUP') || text === 'MAG');
}

function looksLikeExecutableStage(value: unknown): boolean {
  const text = asString(value).trim().toUpperCase();
  return text.startsWith('EXECUTABLE_');
}

function normalizeDisplayStatus(status: unknown, candidateStage: string, executionMode: string): string {
  const normalizedStatus = asString(status).trim();
  if (looksLikeExecutableStage(candidateStage) || executionMode.includes('可执行')) {
    if (!normalizedStatus || normalizedStatus === 'watching' || normalizedStatus === 'pre_signal') {
      return 'entry_ready';
    }
  }
  return normalizedStatus || 'watch';
}

export function normalizeSymbolKey(value: string): string {
  return asString(value)
    .trim()
    .toUpperCase()
    .replace(/:USDT$/g, '')
    .replace(/:USD$/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

export function looksLikeTrackedSymbol(value: string): boolean {
  return Boolean(value) && !value.startsWith('_') && value.length <= 24 && /^[A-Z0-9/:\- ]+$/.test(value);
}

export function extractTimeframeSignalsFromPatch(patchValue: unknown): string[] {
  const patch = asRecord(patchValue);
  const timeframes = asRecord(patch.timeframes);
  const signals = new Set<string>();

  for (const [timeframe, payload] of Object.entries(timeframes)) {
    const record = asRecord(payload);
    const signal = asString(record.signal);
    if (signal) {
      signals.add(`${timeframe}:${signal}`);
    }
  }

  const signalMap = asRecord(patch.signals);
  for (const [timeframe, payload] of Object.entries(signalMap)) {
    const record = asRecord(payload);
    const signalType = asString(record.signal_type) || asString(record.type);
    const entry = asString(record.entry);
    if (signalType && entry) {
      signals.add(`${timeframe}:${signalType}@${entry}`);
      continue;
    }
    if (signalType) {
      signals.add(`${timeframe}:${signalType}`);
    }
  }

  return Array.from(signals);
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

export function normalizeSymbolCard({
  symbol,
  patchValue,
  fallbackValue,
  actionMap,
}: NormalizeSymbolCardInput) {
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
  const chartContext = asRecord(patch.chart_context);
  const signalSnapshot = extractTimeframeSignalsFromPatch(patch);

  const candidateStage =
    asString(plannedTrade.candidate_stage_cn) ||
    asString(entryIdea.candidate_stage_cn) ||
    asString(evaluation.candidate_stage) ||
    asString(patch.status);
  const executionMode =
    asString(plannedTrade.execution_mode_cn) ||
    asString(entryIdea.execution_mode_cn) ||
    asString(evaluation.execution_mode);
  const detectedStrategyFamily =
    detectStrategyFamily({
      signalType:
        asString(patch.signal_type) ||
        asString(asRecord(patch.pre_signal).type),
      brooksLabel:
        asString(brooksFilter.label) ||
        asString(plannedTrade.brooks_label) ||
        asString(patch.brooks_label),
      managementTemplate:
        asString(plannedTrade.management_template) ||
        asString(entryIdea.management_template),
      playbookFamily:
        asString(plannedTrade.playbook_family) ||
        asString(entryIdea.playbook_family) ||
        asString(patch.playbook_family) ||
        asString(patch.strategy_family) ||
        asString(patch.latest_strategy_family),
      playbookId:
        asString(plannedTrade.playbook_id) ||
        asString(entryIdea.playbook_id) ||
        asString(patch.playbook_id),
      strategyHint:
        asString(plannedTrade.strategy) ||
        asString(patch.strategy) ||
        asString(patch.latest_strategy_family),
      rawSignals: signalSnapshot,
    }) ||
    inferFamilyFromSignals([
      patch.latest_strategy_family,
      patch.strategy_family,
      patch.playbook_family,
        patch.playbook_id,
        patch.signal,
        asRecord(patch.pre_signal).type,
        ...signalSnapshot,
    ]);
  const fallbackStrategyFamily =
    inferFamilyFromSignals([
      patch.latest_strategy_family,
      patch.strategy_family,
      patch.playbook_family,
      patch.playbook_id,
      patch.signal,
      asRecord(patch.pre_signal).type,
      ...signalSnapshot,
    ]);
  const primaryPlaybookId =
    asString(plannedTrade.playbook_id) ||
    asString(entryIdea.playbook_id) ||
    asString(patch.playbook_id);
  const primaryFamilyHint = inferFamilyFromSignals([
    primaryPlaybookId,
    patch.strategy,
    patch.strategy_family,
    patch.latest_strategy_family,
    patch.signal_type,
    ...signalSnapshot,
  ]);
  const hlPrimaryFamily = ['H1', 'H2', 'L1', 'L2'].includes(primaryFamilyHint) ? primaryFamilyHint : '';
  const strategyFamily =
    hlPrimaryFamily ||
    (detectedStrategyFamily === 'MAG' &&
    ['H1', 'H2', 'L1', 'L2'].includes(fallbackStrategyFamily) &&
    !primaryPlaybookId
      ? fallbackStrategyFamily
      : detectedStrategyFamily || fallbackStrategyFamily);
  const rawStrategyHint =
    asString(plannedTrade.strategy) ||
    asString(patch.strategy) ||
    asString(patch.latest_strategy_family) ||
    asString(patch.strategy_family);
  const strategyHint =
    primaryPlaybookId ||
    (hlPrimaryFamily
      ? rawStrategyHint || hlPrimaryFamily
      :
    looksLikeMagIdentity(rawStrategyHint) &&
    ['H1', 'H2', 'L1', 'L2'].includes(strategyFamily) &&
    !primaryPlaybookId
      ? strategyFamily
      : rawStrategyHint);
  const strategyLabel = canonicalStrategyLabel({
    strategy: strategyHint,
    signalType:
      asString(patch.signal_type) ||
      asString(asRecord(patch.pre_signal).type),
    brooksLabel:
      asString(brooksFilter.label) ||
      asString(plannedTrade.brooks_label) ||
      asString(patch.brooks_label),
    managementTemplate:
      asString(plannedTrade.management_template) ||
      asString(entryIdea.management_template),
    playbookFamily:
      asString(plannedTrade.playbook_family) ||
      asString(entryIdea.playbook_family) ||
      asString(patch.playbook_family) ||
      strategyFamily,
    playbookId: primaryPlaybookId,
    rawSignals: signalSnapshot,
  });
  const executionSummary = [strategyLabel, candidateStage, executionMode].filter(Boolean).join(' / ');

  return {
    symbol,
    status: normalizeDisplayStatus(
      patch.status ?? plannedTrade.status,
      candidateStage,
      asString(executionSemantics.execution_mode_cn) || executionMode,
    ),
    stage: candidateStage || asString(patch.stage),
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
    strategy_family: strategyFamily,
    latest_strategy_family: strategyFamily,
    strategy_label: strategyLabel,
    playbook_id:
      asString(plannedTrade.playbook_id) ||
      asString(entryIdea.playbook_id) ||
      asString(patch.playbook_id),
    ema_gap_variant:
      asString(plannedTrade.ema_gap_variant) ||
      asString(entryIdea.ema_gap_variant) ||
      asString(patch.ema_gap_variant),
    primary_chart_path:
      asString(patch.primary_chart_path) ||
      asString(chartContext.primary_chart_path),
    primary_chart_api_path:
      asString(patch.primary_chart_api_path) ||
      asString(chartContext.primary_chart_api_path),
    chart_api_paths:
      asStringArray(patch.chart_api_paths).length > 0
        ? asStringArray(patch.chart_api_paths)
        : asStringArray(chartContext.chart_api_paths),
    chart_note:
      asString(patch.chart_note) ||
      asString(chartContext.chart_note),
    chart_generated_at:
      asString(patch.latest_generated_at) ||
      asString(chartContext.latest_generated_at),
  };
}

export function buildLightStrategyFamilies(symbols: UnknownRecord[]) {
  const counter = new Map<string, number>();
  for (const item of symbols) {
    const family =
      asString(item.strategy_family) ||
      asString(item.latest_strategy_family) ||
      familyLabelFromText(item.strategy_label) ||
      familyLabelFromText(item.playbook_id);
    if (!family) {
      continue;
    }
    counter.set(family, (counter.get(family) || 0) + 1);
  }
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 8);
}
