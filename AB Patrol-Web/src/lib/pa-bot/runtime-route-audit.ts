import fs from 'fs';
import path from 'path';

import { loadMonitoringConfig, normalizeExchange as normalizeMonitoringExchange } from './live-monitoring';
import { fallbackStrategyLabel } from './runtime-contract';
import {
  canonicalStrategyLabel as canonicalStrategyLabelFromSchema,
  detectStrategyFamily as detectStrategyFamilyFromSchema,
  familyLabelFromText as familyLabelFromTextFromSchema,
  inferFamilyFromSignals as inferFamilyFromSignalsFromSchema,
  looksLikeStrategyText as looksLikeStrategyTextFromSchema,
} from './runtime-schema';
import { readJson, type RuntimeFiles } from './runtime-files';
import { asArray, asBoolean, asNumber, asRecord, asString, asStringArray, type UnknownRecord } from './runtime-route-shared';

type RuntimeConfig = {
  defaultExecutionBase: string;
};

function marketBucketForSymbol(symbol: string): string {
  const normalized = asString(symbol).toUpperCase();
  if (normalized.endsWith('USDT') || normalized.endsWith('USDTPERP')) return 'crypto';
  if (normalized.includes('USD') || normalized.includes('EUR') || normalized.includes('JPY') || normalized.includes('CHF')) return 'fx';
  return 'other';
}

function incrementCounter(counter: Map<string, number>, key: string, step = 1) {
  const normalized = asString(key).trim();
  if (!normalized) return;
  counter.set(normalized, (counter.get(normalized) || 0) + step);
}

function counterToList(counter: Map<string, number>, limit = 12) {
  return Array.from(counter.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function normalizeSignalLabel(value: unknown): string {
  const raw = asString(value).trim().toUpperCase();
  if (!raw) return '';
  return raw
    .replace(/@.+$/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function familyLabelFromText(value: unknown): string {
  return familyLabelFromTextFromSchema(value) || normalizeSignalLabel(value) || '';
}

function inferFamilyFromSignals(values: unknown[]): string {
  return inferFamilyFromSignalsFromSchema(values) || '';
}

function looksLikeStrategyText(value: unknown): boolean {
  return looksLikeStrategyTextFromSchema(value);
}

function fallbackStrategyText(value: unknown): string {
  return fallbackStrategyLabel(value);
}

function canonicalStrategyLabel(input: {
  strategy?: unknown;
  playbookId?: unknown;
  playbookFamily?: unknown;
}): string {
  return (
    canonicalStrategyLabelFromSchema({
      strategy: input.strategy,
      playbookId: input.playbookId,
      playbookFamily: input.playbookFamily,
    }) || ''
  );
}

function detectAuditSignalFamily(input: {
  signalType: unknown;
  brooksLabel: unknown;
  managementTemplate: unknown;
  playbookFamily: unknown;
  playbookId: unknown;
  strategyHint: unknown;
  rawSignals: string[];
}): string {
  const detected =
    detectStrategyFamilyFromSchema({
      signalType: input.signalType,
      brooksLabel: input.brooksLabel,
      managementTemplate: input.managementTemplate,
      playbookFamily: input.playbookFamily,
      playbookId: input.playbookId,
      strategyHint: input.strategyHint,
      rawSignals: input.rawSignals,
    }) || '';
  if (detected) return detected;

  for (const candidate of [
    input.playbookFamily,
    input.managementTemplate,
    input.strategyHint,
    input.brooksLabel,
    input.signalType,
    ...input.rawSignals,
  ]) {
    const text = familyLabelFromText(candidate);
    if (text) return text;
  }

  for (const candidate of [input.strategyHint, input.playbookFamily, input.playbookId]) {
    if (looksLikeStrategyText(candidate)) {
      return fallbackStrategyText(candidate);
    }
  }

  return canonicalStrategyLabel({
    strategy: input.strategyHint,
    playbookId: input.playbookId,
    playbookFamily: input.playbookFamily,
  });
}

function auditFlagText(status: string, candidateStage: string, executionMode: string): string {
  return [status, candidateStage, executionMode].filter(Boolean).join(' | ').toLowerCase();
}

export function buildAuditSummary(
  files: RuntimeFiles,
  runtimeConfig: RuntimeConfig,
  runtime: UnknownRecord,
  cycleLimit = 120,
): UnknownRecord {
  try {
    if (!fs.existsSync(files.cyclesDir)) {
      return {};
    }

    const primaryExchange = normalizeMonitoringExchange(runtime.exchange || 'ctrader');
    const primaryBase = asString(runtime.execution_base) || runtimeConfig.defaultExecutionBase;
    const monitoringConfig = loadMonitoringConfig(primaryExchange, primaryBase);
    const symbolRoutes = new Map<string, string>();
    for (const account of monitoringConfig.accounts.filter((item) => item.enabled)) {
      const exchange = normalizeMonitoringExchange(account.exchange);
      for (const symbol of account.symbols || []) {
        const normalized = asString(symbol).trim().toUpperCase();
        if (normalized) {
          symbolRoutes.set(normalized, exchange);
        }
      }
    }

    const cycleFiles = fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort()
      .slice(-cycleLimit);

    const marketBuckets = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    const candidateStages = new Map<string, number>();
    const brooksRules = new Map<string, number>();
    const signalFamilies = new Map<string, number>();
    const timeframeSignals = new Map<string, number>();
    const exchangeCounts = new Map<string, number>();
    const symbolStats = new Map<string, UnknownRecord>();
    const timelineLimit = 8;
    const longWatchingThreshold = 24;

    let totalReadySignals = 0;
    let totalExecutableSignals = 0;
    let totalOpenOrderActions = 0;
    let totalExecutionEvents = 0;
    let preSignalExpiredSignals = 0;
    let expiredActivePreSignals = 0;
    let staleTimeoutSignals = 0;
    let candidateOpenOrderAttempts = 0;
    let duplicateInCycleActions = 0;
    let multiStrategySameSymbolActions = 0;

    for (const file of cycleFiles) {
      const cycle = readJson(path.join(files.cyclesDir, file));
      const decision = asRecord(cycle.decision);
      const symbolUpdates = asRecord(decision.symbol_updates);
      const actions = asArray(decision.actions);
      const executionResults = asArray(cycle.execution_results);
      const openActionsBySymbolStrategy = new Map<string, number>();
      const openActionCountBySymbol = new Map<string, number>();
      const strategiesBySymbol = new Map<string, Set<string>>();

      for (const action of actions) {
        const item = asRecord(action);
        const actionType = asString(item.action_type || item.type).toUpperCase();
        const symbol = asString(item.symbol).trim().toUpperCase();
        if (actionType !== 'OPEN_ORDER') {
          continue;
        }
        totalOpenOrderActions += 1;
        const candidateStage = asString(item.candidate_stage).toUpperCase();
        if (candidateStage.startsWith('CANDIDATE_')) {
          candidateOpenOrderAttempts += 1;
        }
        if (!symbol) continue;
        const strategyKey =
          asString(item.strategy) ||
          asString(item.playbook_id) ||
          asString(item.playbook_family) ||
          asString(item.source_chain) ||
          'UNKNOWN';
        const symbolStrategyKey = `${symbol}::${strategyKey}`;
        openActionsBySymbolStrategy.set(symbolStrategyKey, (openActionsBySymbolStrategy.get(symbolStrategyKey) || 0) + 1);
        openActionCountBySymbol.set(symbol, (openActionCountBySymbol.get(symbol) || 0) + 1);
        if (!strategiesBySymbol.has(symbol)) {
          strategiesBySymbol.set(symbol, new Set<string>());
        }
        strategiesBySymbol.get(symbol)?.add(strategyKey);
        const current = asRecord(symbolStats.get(symbol));
        symbolStats.set(symbol, {
          ...current,
          symbol,
          openOrderCount: (asNumber(current.openOrderCount) || 0) + 1,
        });
      }

      for (const count of Array.from(openActionsBySymbolStrategy.values())) {
        if (count > 1) {
          duplicateInCycleActions += count - 1;
        }
      }
      for (const [symbol, strategySet] of Array.from(strategiesBySymbol.entries())) {
        if (strategySet.size > 1) {
          multiStrategySameSymbolActions += Math.max(0, (openActionCountBySymbol.get(symbol) || 0) - 1);
        }
      }

      for (const result of executionResults) {
        const item = asRecord(result);
        const status = asString(item.status).toUpperCase();
        if (!status || ['LOG_ONLY', 'NO_ACTION', 'SKIPPED', 'PASS'].includes(status)) {
          continue;
        }
        totalExecutionEvents += 1;
        const symbol = asString(item.symbol).trim().toUpperCase();
        if (!symbol) continue;
        const current = asRecord(symbolStats.get(symbol));
        symbolStats.set(symbol, {
          ...current,
          symbol,
          executionEventCount: (asNumber(current.executionEventCount) || 0) + 1,
        });
      }

      for (const [rawSymbol, rawPatch] of Object.entries(symbolUpdates)) {
        const symbol = asString(rawSymbol).trim().toUpperCase();
        if (!symbol) continue;
        const patch = asRecord(rawPatch);
        const entryIdea = asRecord(patch.entry_idea);
        const plannedTrade = asRecord(patch.planned_trade);
        const preSignal = asRecord(patch.pre_signal);
        const timeframes = asRecord(patch.timeframes);
        const status = asString(patch.status) || asString(patch.stage) || 'watching';
        const lastPassReason = asString(patch.last_pass_reason).toUpperCase();
        const candidateStage =
          asString(plannedTrade.candidate_stage_cn) ||
          asString(entryIdea.candidate_stage_cn) ||
          asString(entryIdea.candidate_stage);
        const executionMode =
          asString(plannedTrade.execution_mode_cn) ||
          asString(entryIdea.execution_mode_cn) ||
          asString(entryIdea.execution_mode);
        const brooksRule =
          asString(entryIdea.brooks_rule) ||
          asString(plannedTrade.brooks_rule) ||
          asString(patch.brooks_label);
        const signalType =
          asString(patch.signal_type) ||
          asString(patch.signal) ||
          asString(preSignal.type) ||
          asString(plannedTrade.signal_type) ||
          asString(entryIdea.signal_type);
        const brooksLabel =
          asString(plannedTrade.brooks_label) ||
          asString(entryIdea.brooks_label) ||
          asString(patch.brooks_label);
        const managementTemplate =
          asString(plannedTrade.management_template) ||
          asString(entryIdea.management_template);
        const playbookFamily =
          asString(plannedTrade.playbook_family) ||
          asString(entryIdea.playbook_family);
        const playbookId =
          asString(plannedTrade.playbook_id) ||
          asString(entryIdea.playbook_id);
        const strategyHint =
          asString(plannedTrade.strategy) ||
          asString(patch.strategy) ||
          asString(patch.latest_strategy_family) ||
          asString(entryIdea.style) ||
          asString(entryIdea.filter_summary);
        const staleNarrativeText = [
          asString(patch.structure_summary),
          asString(patch.thesis),
          asString(patch.running_narrative),
        ].join(' ');
        const staleModelTimeout =
          staleNarrativeText.includes('本轮模型超时') ||
          staleNarrativeText.toLowerCase().includes('stale_model_timeout');
        const allowExecutable = asBoolean(plannedTrade.allow_executable);

        if (lastPassReason === 'PRE_SIGNAL_EXPIRED') {
          preSignalExpiredSignals += 1;
          if (asBoolean(preSignal.active) === true) {
            expiredActivePreSignals += 1;
          }
        }
        if (staleModelTimeout) {
          staleTimeoutSignals += 1;
        }

        const exchange = symbolRoutes.get(symbol) || normalizeMonitoringExchange(runtime.exchange || 'binance');
        const bucket = marketBucketForSymbol(symbol);
        incrementCounter(exchangeCounts, exchange);
        incrementCounter(marketBuckets, bucket);
        incrementCounter(statusCounts, status);
        incrementCounter(candidateStages, candidateStage);
        incrementCounter(brooksRules, brooksRule);

        const flagText = auditFlagText(status, candidateStage, executionMode);
        const readyLike = ['entry_ready', 'entry ready', '可挂单', '候选单', '准备挂单'].some((token) => flagText.includes(token));
        const executableLike = ['executable', '可执行'].some((token) => flagText.includes(token));
        if (readyLike) totalReadySignals += 1;
        if (executableLike) totalExecutableSignals += 1;

        const current = asRecord(symbolStats.get(symbol));
        const latestSignals = asRecord(current.latestSignals);
        const timeline = asArray(current.timeline).map((item) => asRecord(item));
        const signalSnapshot: UnknownRecord = {};
        const rawSignals: string[] = [];
        if (asString(patch.signal)) rawSignals.push(asString(patch.signal));
        if (asString(preSignal.type)) rawSignals.push(asString(preSignal.type));
        for (const [timeframe, timeframeRaw] of Object.entries(timeframes)) {
          const timeframeRecord = asRecord(timeframeRaw);
          const rawSignal = asString(timeframeRecord.signal);
          if (rawSignal) rawSignals.push(rawSignal);
          const signalLabel = normalizeSignalLabel(rawSignal);
          if (signalLabel) incrementCounter(timeframeSignals, `${timeframe} · ${signalLabel}`);
          if (rawSignal && ['5m', '15m', '1h'].includes(timeframe)) {
            latestSignals[timeframe] = rawSignal;
            signalSnapshot[timeframe] = rawSignal;
          }
        }
        const strategyFamily =
          detectAuditSignalFamily({
            signalType,
            brooksLabel,
            managementTemplate,
            playbookFamily,
            playbookId,
            strategyHint,
            rawSignals,
          }) ||
          inferFamilyFromSignals([
            patch.latest_strategy_family,
            patch.strategy_family,
            patch.playbook_family,
            patch.signal,
            preSignal.type,
            ...Object.values(signalSnapshot),
            ...Object.values(latestSignals),
          ]);
        if (strategyFamily) incrementCounter(signalFamilies, strategyFamily);

        timeline.push({
          cycleId: asString(cycle.cycle_id) || file.replace(/\.json$/, ''),
          time: asString(cycle.time_utc),
          status,
          candidateStage,
          signals: signalSnapshot,
        });
        while (timeline.length > timelineLimit) {
          timeline.shift();
        }

        const ruleCounts = new Map<string, number>(
          Array.from(Object.entries(asRecord(current.ruleCounts))).map(([label, count]) => [label, asNumber(count) || 0]),
        );
        incrementCounter(ruleCounts, brooksRule);

        symbolStats.set(symbol, {
          ...current,
          symbol,
          exchange,
          bucket,
          appearances: (asNumber(current.appearances) || 0) + 1,
          watchingCount: (asNumber(current.watchingCount) || 0) + (status.toLowerCase().includes('watch') ? 1 : 0),
          nonWatchingCount: (asNumber(current.nonWatchingCount) || 0) + (status.toLowerCase().includes('watch') ? 0 : 1),
          candidateSeenCount: (asNumber(current.candidateSeenCount) || 0) + (candidateStage ? 1 : 0),
          readyCount: (asNumber(current.readyCount) || 0) + (readyLike ? 1 : 0),
          executableCount: (asNumber(current.executableCount) || 0) + (executableLike ? 1 : 0),
          latestStatus: status,
          latestCandidateStage: candidateStage,
          latestMarketState: asString(patch.market_state),
          latestBrooksRule: brooksRule,
          latestStrategyFamily: strategyFamily,
          latestLastPassReason: lastPassReason,
          latestAllowExecutable: allowExecutable,
          allowExecutableTrueCount: (asNumber(current.allowExecutableTrueCount) || 0) + (allowExecutable === true ? 1 : 0),
          allowExecutableFalseCount: (asNumber(current.allowExecutableFalseCount) || 0) + (allowExecutable === false ? 1 : 0),
          latestSignals,
          timeline,
          ruleCounts: Object.fromEntries(ruleCounts),
        });
      }
    }

    const symbols = Array.from(symbolStats.values())
      .map((raw) => {
        const item = asRecord(raw);
        const ruleCounts = new Map<string, number>(
          Array.from(Object.entries(asRecord(item.ruleCounts))).map(([label, count]) => [label, asNumber(count) || 0]),
        );
        return {
          symbol: asString(item.symbol),
          exchange: asString(item.exchange),
          bucket: asString(item.bucket),
          appearances: asNumber(item.appearances) || 0,
          watchingCount: asNumber(item.watchingCount) || 0,
          nonWatchingCount: asNumber(item.nonWatchingCount) || 0,
          candidateSeenCount: asNumber(item.candidateSeenCount) || 0,
          readyCount: asNumber(item.readyCount) || 0,
          executableCount: asNumber(item.executableCount) || 0,
          openOrderCount: asNumber(item.openOrderCount) || 0,
          executionEventCount: asNumber(item.executionEventCount) || 0,
          latestStatus: asString(item.latestStatus),
          latestCandidateStage: asString(item.latestCandidateStage),
          latestMarketState: asString(item.latestMarketState),
          latestBrooksRule: asString(item.latestBrooksRule),
          latestStrategyFamily: asString(item.latestStrategyFamily),
          latestLastPassReason: asString(item.latestLastPassReason),
          latestAllowExecutable: asBoolean(item.latestAllowExecutable),
          allowExecutableTrueCount: asNumber(item.allowExecutableTrueCount) || 0,
          allowExecutableFalseCount: asNumber(item.allowExecutableFalseCount) || 0,
          latestSignals: asRecord(item.latestSignals),
          timeline: asArray(item.timeline).map((point) => {
            const entry = asRecord(point);
            return {
              cycleId: asString(entry.cycleId),
              time: asString(entry.time),
              status: asString(entry.status),
              candidateStage: asString(entry.candidateStage),
              signals: asRecord(entry.signals),
            };
          }),
          topRules: counterToList(ruleCounts, 3).map((entry) => entry.label),
        };
      })
      .map((item) => {
        const timeline = item.timeline || [];
        let watchStreak = 0;
        for (let index = timeline.length - 1; index >= 0; index -= 1) {
          const point = item.timeline[index];
          const isWatching = (point.status || '').toLowerCase().includes('watch');
          const hasUpgrade = Boolean(point.candidateStage);
          if (!isWatching || hasUpgrade) {
            break;
          }
          watchStreak += 1;
        }
        const longWatching =
          item.appearances >= longWatchingThreshold &&
          item.readyCount === 0 &&
          item.executableCount === 0 &&
          item.openOrderCount === 0 &&
          item.executionEventCount === 0 &&
          item.nonWatchingCount === 0 &&
          item.candidateSeenCount === 0;
        return {
          ...item,
          watchStreak,
          longWatching,
        };
      })
      .sort((left, right) => {
        const leftScore = left.readyCount * 10 + left.executableCount * 20 + left.openOrderCount * 30 + left.appearances;
        const rightScore = right.readyCount * 10 + right.executableCount * 20 + right.openOrderCount * 30 + right.appearances;
        return rightScore - leftScore || left.symbol.localeCompare(right.symbol);
      });

    const alwaysExecutableSymbols = symbols
      .filter((item) => item.appearances > 0 && item.allowExecutableTrueCount === item.appearances)
      .sort((left, right) => right.appearances - left.appearances || left.symbol.localeCompare(right.symbol))
      .slice(0, 12)
      .map((item) => ({
        symbol: item.symbol,
        exchange: item.exchange,
        count: item.appearances,
      }));

    const neverExecutableSymbols = symbols
      .filter((item) => item.appearances > 0 && item.allowExecutableFalseCount === item.appearances)
      .sort((left, right) => right.appearances - left.appearances || left.symbol.localeCompare(right.symbol))
      .slice(0, 12)
      .map((item) => ({
        symbol: item.symbol,
        exchange: item.exchange,
        count: item.appearances,
      }));

    return {
      lookbackCycles: cycleFiles.length,
      totalSymbolsObserved: symbols.length,
      totalReadySignals,
      totalExecutableSignals,
      totalOpenOrderActions,
      totalExecutionEvents,
      preSignalExpiredSignals,
      expiredActivePreSignals,
      staleTimeoutSignals,
      candidateOpenOrderAttempts,
      duplicateInCycleActions,
      multiStrategySameSymbolActions,
      exchanges: counterToList(exchangeCounts, 8),
      marketBuckets: counterToList(marketBuckets, 8),
      statuses: counterToList(statusCounts, 8),
      candidateStages: counterToList(candidateStages, 12),
      brooksRules: counterToList(brooksRules, 12),
      signalFamilies: counterToList(signalFamilies, 12),
      timeframeSignals: counterToList(timeframeSignals, 16),
      alwaysExecutableSymbols,
      neverExecutableSymbols,
      stuckWatchingSymbols: symbols
        .filter((item) => item.longWatching)
        .sort((left, right) => right.watchStreak - left.watchStreak || right.appearances - left.appearances)
        .slice(0, 12),
      symbols,
    };
  } catch {
    return {};
  }
}

function normalizeCounterEntries(value: unknown) {
  return asArray(value).map((item) => {
    const entry = asRecord(item);
    return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
  });
}

function normalizeAuditSymbols(value: unknown) {
  return asArray(value).map((item) => {
    const entry = asRecord(item);
    return {
      symbol: asString(entry.symbol),
      exchange: asString(entry.exchange),
      bucket: asString(entry.bucket),
      appearances: asNumber(entry.appearances) ?? 0,
      watchingCount: asNumber(entry.watchingCount) ?? 0,
      nonWatchingCount: asNumber(entry.nonWatchingCount) ?? 0,
      candidateSeenCount: asNumber(entry.candidateSeenCount) ?? 0,
      readyCount: asNumber(entry.readyCount) ?? 0,
      executableCount: asNumber(entry.executableCount) ?? 0,
      openOrderCount: asNumber(entry.openOrderCount) ?? 0,
      executionEventCount: asNumber(entry.executionEventCount) ?? 0,
      latestStatus: asString(entry.latestStatus),
      latestCandidateStage: asString(entry.latestCandidateStage),
      latestMarketState: asString(entry.latestMarketState),
      latestBrooksRule: asString(entry.latestBrooksRule),
      latestStrategyFamily: asString(entry.latestStrategyFamily),
      latestLastPassReason: asString(entry.latestLastPassReason),
      latestAllowExecutable: asBoolean(entry.latestAllowExecutable),
      allowExecutableTrueCount: asNumber(entry.allowExecutableTrueCount) ?? 0,
      allowExecutableFalseCount: asNumber(entry.allowExecutableFalseCount) ?? 0,
      latestSignals: asRecord(entry.latestSignals),
      timeline: asArray(entry.timeline).map((point) => {
        const pointEntry = asRecord(point);
        return {
          cycleId: asString(pointEntry.cycleId),
          time: asString(pointEntry.time),
          status: asString(pointEntry.status),
          candidateStage: asString(pointEntry.candidateStage),
          signals: asRecord(pointEntry.signals),
        };
      }),
      watchStreak: asNumber(entry.watchStreak) ?? 0,
      longWatching: asBoolean(entry.longWatching) ?? false,
      topRules: asStringArray(entry.topRules),
    };
  });
}

export function normalizeAudit(value: UnknownRecord) {
  return {
    lookbackCycles: asNumber(value.lookbackCycles) ?? 0,
    totalSymbolsObserved: asNumber(value.totalSymbolsObserved) ?? 0,
    totalReadySignals: asNumber(value.totalReadySignals) ?? 0,
    totalExecutableSignals: asNumber(value.totalExecutableSignals) ?? 0,
    totalOpenOrderActions: asNumber(value.totalOpenOrderActions) ?? 0,
    totalExecutionEvents: asNumber(value.totalExecutionEvents) ?? 0,
    preSignalExpiredSignals: asNumber(value.preSignalExpiredSignals) ?? 0,
    expiredActivePreSignals: asNumber(value.expiredActivePreSignals) ?? 0,
    staleTimeoutSignals: asNumber(value.staleTimeoutSignals) ?? 0,
    candidateOpenOrderAttempts: asNumber(value.candidateOpenOrderAttempts) ?? 0,
    duplicateInCycleActions: asNumber(value.duplicateInCycleActions) ?? 0,
    multiStrategySameSymbolActions: asNumber(value.multiStrategySameSymbolActions) ?? 0,
    exchanges: normalizeCounterEntries(value.exchanges),
    marketBuckets: normalizeCounterEntries(value.marketBuckets),
    statuses: normalizeCounterEntries(value.statuses),
    candidateStages: normalizeCounterEntries(value.candidateStages),
    brooksRules: normalizeCounterEntries(value.brooksRules),
    signalFamilies: normalizeCounterEntries(value.signalFamilies),
    timeframeSignals: normalizeCounterEntries(value.timeframeSignals),
    alwaysExecutableSymbols: asArray(value.alwaysExecutableSymbols).map((item) => {
      const entry = asRecord(item);
      return {
        symbol: asString(entry.symbol),
        exchange: asString(entry.exchange),
        count: asNumber(entry.count) ?? 0,
      };
    }),
    neverExecutableSymbols: asArray(value.neverExecutableSymbols).map((item) => {
      const entry = asRecord(item);
      return {
        symbol: asString(entry.symbol),
        exchange: asString(entry.exchange),
        count: asNumber(entry.count) ?? 0,
      };
    }),
    symbols: normalizeAuditSymbols(value.symbols),
    stuckWatchingSymbols: normalizeAuditSymbols(value.stuckWatchingSymbols),
  };
}
