export const LIVE_CHART_DEFAULT_TIMEFRAME = '15m' as const;

export const LIVE_CHART_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;

export type LiveChartTimeframe = (typeof LIVE_CHART_TIMEFRAMES)[number];

export function normalizeLiveChartTimeframe(value: unknown): LiveChartTimeframe {
  const text = String(value || '').trim().toLowerCase();
  for (const candidate of LIVE_CHART_TIMEFRAMES) {
    if (text.startsWith(candidate)) {
      return candidate;
    }
  }
  return LIVE_CHART_DEFAULT_TIMEFRAME;
}

export function resolveLiveChartTimeframe(): LiveChartTimeframe {
  return LIVE_CHART_DEFAULT_TIMEFRAME;
}

export function listLiveChartTimeframes(): readonly LiveChartTimeframe[] {
  return LIVE_CHART_TIMEFRAMES;
}
