import { useState, useEffect, useCallback } from "react";
import { BackendSettings } from "../settings";
import { DataSource } from "../services/data-source";

interface DataSourceStatus {
  source: DataSource;
  isAvailable: boolean;
  lastCheck: number;
  error?: string;
}

export function useDataSourceStatus(backend: BackendSettings) {
  const [statusMap, setStatusMap] = useState<Record<DataSource, DataSourceStatus>>({
    BINANCE: { source: "BINANCE", isAvailable: false, lastCheck: 0 },
    YAHOO: { source: "YAHOO", isAvailable: false, lastCheck: 0 },
    ALPHA_VANTAGE: { source: "ALPHA_VANTAGE", isAvailable: false, lastCheck: 0 },
    POLYGON: { source: "POLYGON", isAvailable: false, lastCheck: 0 },
  });

  const checkStatus = useCallback(async () => {
    if (!backend.enabled) return;

    // Check Binance (via backend health)
    try {
      const res = await fetch(`${backend.baseUrl}/health`);
      const isHealthy = res.ok;
      
      setStatusMap((prev) => ({
        ...prev,
        BINANCE: {
          source: "BINANCE",
          isAvailable: isHealthy,
          lastCheck: Date.now(),
        },
        YAHOO: {
          source: "YAHOO",
          isAvailable: isHealthy, // For now, assume YAHOO is available if backend is healthy
          lastCheck: Date.now(),
        },
      }));
    } catch {
      setStatusMap((prev) => ({
        ...prev,
        BINANCE: {
          source: "BINANCE",
          isAvailable: false,
          lastCheck: Date.now(),
          error: "Backend unavailable",
        },
        YAHOO: {
          source: "YAHOO",
          isAvailable: false,
          lastCheck: Date.now(),
          error: "Backend unavailable",
        },
      }));
    }
  }, [backend.enabled, backend.baseUrl]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [checkStatus]);

  return {
    statusMap,
    checkStatus,
  };
}

/**
 * Check if a specific symbol has data available
 */
export function useSymbolAvailability(symbol: string, exchange: DataSource, backend: BackendSettings) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkAvailability = useCallback(async () => {
    if (!backend.enabled) {
      setIsAvailable(false);
      return;
    }

    setIsChecking(true);
    try {
      const res = await fetch(
        `${backend.baseUrl}/api/v1/candles/${symbol}?limit=1&interval=1m`
      );
      const data = await res.json();
      setIsAvailable(Array.isArray(data) && data.length > 0);
    } catch {
      setIsAvailable(false);
    } finally {
      setIsChecking(false);
    }
  }, [symbol, backend.enabled, backend.baseUrl]);

  useEffect(() => {
    checkAvailability();
  }, [checkAvailability]);

  return { isAvailable, isChecking, checkAvailability };
}
