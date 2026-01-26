/**
 * useBackendData Hook
 *
 * React hooks for fetching data from the TradeCat backend services.
 * Provides real-time market data, indicators, signals, and AI analysis.
 */

import * as React from "react";
import {
  BackendClient,
  getBackendClient,
  CandleData,
  IndicatorData,
  SignalData,
  MarketCycleData,
  PatternData,
  AnalysisResponse,
  SystemStatus,
} from "../services/backend-client";
import type { BackendSettings } from "../settings";

// ============================================================
// Types
// ============================================================

export interface BackendDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
}

export interface UseBackendConnectionReturn {
  isConnected: boolean;
  isChecking: boolean;
  status: SystemStatus | null;
  error: string | null;
  checkConnection: () => Promise<void>;
}

export interface UseMarketDataReturn {
  candles: BackendDataState<CandleData[]>;
  indicators: BackendDataState<IndicatorData[]>;
  fetchCandles: (symbol: string, interval?: string, limit?: number) => Promise<void>;
  fetchIndicators: (symbol: string, interval?: string, limit?: number) => Promise<void>;
}

export interface UseSignalsReturn {
  signals: BackendDataState<SignalData[]>;
  fetchSignals: (symbol: string, limit?: number) => Promise<void>;
  fetchAllSignals: (limit?: number, direction?: string) => Promise<void>;
}

export interface UseMarketCycleReturn {
  cycle: BackendDataState<MarketCycleData>;
  patterns: BackendDataState<PatternData>;
  fetchCycle: (symbol: string, interval?: string) => Promise<void>;
  fetchPatterns: (symbol: string, interval?: string, limit?: number) => Promise<void>;
}

export interface UseAIAnalysisReturn {
  analysis: BackendDataState<AnalysisResponse>;
  analyze: (symbol: string, prompt?: string, interval?: string) => Promise<void>;
}

// ============================================================
// Helper Functions
// ============================================================

function createInitialState<T>(): BackendDataState<T> {
  return {
    data: null,
    loading: false,
    error: null,
    lastUpdated: null,
  };
}

function getClient(settings: BackendSettings): BackendClient {
  return getBackendClient({
    baseUrl: settings.baseUrl,
    apiToken: settings.apiToken || undefined,
    timeout: settings.timeout,
  });
}

// ============================================================
// Hooks
// ============================================================

/**
 * Hook for checking backend connection status
 */
export function useBackendConnection(settings: BackendSettings): UseBackendConnectionReturn {
  const [isConnected, setIsConnected] = React.useState(false);
  const [isChecking, setIsChecking] = React.useState(false);
  const [status, setStatus] = React.useState<SystemStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const checkConnection = React.useCallback(async () => {
    if (!settings.enabled) {
      setIsConnected(false);
      setStatus(null);
      setError(null);
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const client = getClient(settings);
      const isAvailable = await client.isAvailable();

      if (isAvailable) {
        const systemStatus = await client.getStatus();
        setStatus(systemStatus);
        setIsConnected(true);
      } else {
        setIsConnected(false);
        setError("服务不可用");
      }
    } catch (err) {
      setIsConnected(false);
      setError((err as Error).message);
    } finally {
      setIsChecking(false);
    }
  }, [settings]);

  // Check connection on mount and when settings change
  React.useEffect(() => {
    if (settings.enabled) {
      checkConnection();
    }
  }, [settings.enabled, settings.baseUrl, checkConnection]);

  return { isConnected, isChecking, status, error, checkConnection };
}

/**
 * Hook for fetching market data (candles and indicators)
 */
export function useMarketData(settings: BackendSettings): UseMarketDataReturn {
  const [candles, setCandles] = React.useState<BackendDataState<CandleData[]>>(
    createInitialState()
  );
  const [indicators, setIndicators] = React.useState<BackendDataState<IndicatorData[]>>(
    createInitialState()
  );

  const fetchCandles = React.useCallback(
    async (symbol: string, interval = "1h", limit = 100) => {
      if (!settings.enabled) return;

      setCandles((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const client = getClient(settings);
        const data = await client.getCandles(symbol, interval, limit);
        setCandles({
          data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        setCandles((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    [settings]
  );

  const fetchIndicators = React.useCallback(
    async (symbol: string, interval = "1h", limit = 100) => {
      if (!settings.enabled) return;

      setIndicators((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const client = getClient(settings);
        const data = await client.getIndicators(symbol, interval, limit);
        setIndicators({
          data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        setIndicators((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    [settings]
  );

  return { candles, indicators, fetchCandles, fetchIndicators };
}

/**
 * Hook for fetching trading signals
 */
export function useSignals(settings: BackendSettings): UseSignalsReturn {
  const [signals, setSignals] = React.useState<BackendDataState<SignalData[]>>(
    createInitialState()
  );

  const fetchSignals = React.useCallback(
    async (symbol: string, limit = 50) => {
      if (!settings.enabled) return;

      setSignals((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const client = getClient(settings);
        const data = await client.getSignals(symbol, limit);
        setSignals({
          data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        setSignals((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    [settings]
  );

  const fetchAllSignals = React.useCallback(
    async (limit = 100, direction?: string) => {
      if (!settings.enabled) return;

      setSignals((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const client = getClient(settings);
        const result = await client.getAllSignals(limit, direction);
        setSignals({
          data: result.signals,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        setSignals((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    [settings]
  );

  return { signals, fetchSignals, fetchAllSignals };
}

/**
 * Hook for Al Brooks specific data (market cycle and patterns)
 */
export function useMarketCycle(settings: BackendSettings): UseMarketCycleReturn {
  const [cycle, setCycle] = React.useState<BackendDataState<MarketCycleData>>(
    createInitialState()
  );
  const [patterns, setPatterns] = React.useState<BackendDataState<PatternData>>(
    createInitialState()
  );

  const fetchCycle = React.useCallback(
    async (symbol: string, interval = "5m") => {
      if (!settings.enabled) return;

      setCycle((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const client = getClient(settings);
        const data = await client.getMarketCycle(symbol, interval);
        setCycle({
          data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        setCycle((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    [settings]
  );

  const fetchPatterns = React.useCallback(
    async (symbol: string, interval = "5m", limit = 10) => {
      if (!settings.enabled) return;

      setPatterns((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const client = getClient(settings);
        const data = await client.getPatterns(symbol, interval, limit);
        setPatterns({
          data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        setPatterns((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    [settings]
  );

  return { cycle, patterns, fetchCycle, fetchPatterns };
}

/**
 * Hook for AI market analysis
 */
export function useAIAnalysis(settings: BackendSettings): UseAIAnalysisReturn {
  const [analysis, setAnalysis] = React.useState<BackendDataState<AnalysisResponse>>(
    createInitialState()
  );

  const analyze = React.useCallback(
    async (symbol: string, prompt = "market_analysis", interval = "1h") => {
      if (!settings.enabled) return;

      setAnalysis((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const client = getClient(settings);
        const data = await client.analyze({ symbol, prompt, interval });
        setAnalysis({
          data,
          loading: false,
          error: null,
          lastUpdated: Date.now(),
        });
      } catch (err) {
        setAnalysis((prev) => ({
          ...prev,
          loading: false,
          error: (err as Error).message,
        }));
      }
    },
    [settings]
  );

  return { analysis, analyze };
}

/**
 * Combined hook for all backend data with auto-refresh
 */
export function useBackendDataAll(settings: BackendSettings) {
  const connection = useBackendConnection(settings);
  const marketData = useMarketData(settings);
  const signals = useSignals(settings);
  const marketCycle = useMarketCycle(settings);
  const aiAnalysis = useAIAnalysis(settings);

  // Auto-refresh effect
  React.useEffect(() => {
    if (!settings.enabled || !connection.isConnected || settings.autoRefreshInterval <= 0) {
      return;
    }

    const intervalMs = settings.autoRefreshInterval * 1000;
    const symbol = settings.defaultSymbol;
    const interval = settings.defaultInterval;

    const refreshData = () => {
      marketData.fetchCandles(symbol, interval);
      marketData.fetchIndicators(symbol, interval);
      signals.fetchSignals(symbol);
      marketCycle.fetchCycle(symbol, interval);
      marketCycle.fetchPatterns(symbol, interval);
    };

    const timerId = setInterval(refreshData, intervalMs);
    return () => clearInterval(timerId);
  }, [
    settings.enabled,
    settings.autoRefreshInterval,
    settings.defaultSymbol,
    settings.defaultInterval,
    connection.isConnected,
    marketData,
    signals,
    marketCycle,
  ]);

  return {
    connection,
    marketData,
    signals,
    marketCycle,
    aiAnalysis,
  };
}
