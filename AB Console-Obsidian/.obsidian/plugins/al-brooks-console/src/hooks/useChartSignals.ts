import { useState, useEffect, useCallback } from "react";
import { BackendSettings } from "../settings";

export interface ChartSignal {
  time: number; // Unix timestamp in seconds
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
  size?: number;
}

interface UseChartSignalsOptions {
  backend: BackendSettings;
  symbol: string;
  interval: string;
  limit?: number;
}

export function useChartSignals(options: UseChartSignalsOptions) {
  const { backend, symbol, interval, limit = 100 } = options;
  const [signals, setSignals] = useState<ChartSignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchSignals = useCallback(async () => {
    if (!backend.enabled || !symbol) return;

    setIsLoading(true);
    try {
      // Fetch trading signals from backend
      const url = `${backend.baseUrl}/api/v1/signals/${symbol}?limit=${limit}`;
      const headers: Record<string, string> = {};
      if (backend.apiToken) {
        headers["Authorization"] = `Bearer ${backend.apiToken}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      
      // Convert to chart signals
      const chartSignals: ChartSignal[] = (data.signals || []).map((s: Record<string, unknown>) => {
        const timestamp = new Date(s.timestamp as string).getTime() / 1000;
        const direction = s.direction as "BUY" | "SELL" | "ALERT";
        
        return {
          time: timestamp,
          position: direction === "BUY" ? "belowBar" : direction === "SELL" ? "aboveBar" : "inBar",
          color: direction === "BUY" ? "#10B981" : direction === "SELL" ? "#EF4444" : "#F59E0B",
          shape: direction === "BUY" ? "arrowUp" : direction === "SELL" ? "arrowDown" : "circle",
          text: s.signal_name as string,
          size: 2,
        };
      });

      setSignals(chartSignals);
    } catch (err) {
      console.error("Failed to fetch chart signals:", err);
      setSignals([]);
    } finally {
      setIsLoading(false);
    }
  }, [backend.enabled, backend.baseUrl, backend.apiToken, symbol, limit]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  return {
    signals,
    isLoading,
    refresh: fetchSignals,
  };
}

// Mock signals for testing (when backend is not available)
export function useMockChartSignals(symbol: string): ChartSignal[] {
  return [
    {
      time: Date.now() / 1000 - 3600,
      position: "belowBar",
      color: "#10B981",
      shape: "arrowUp",
      text: "买入",
      size: 2,
    },
    {
      time: Date.now() / 1000 - 1800,
      position: "aboveBar",
      color: "#EF4444",
      shape: "arrowDown",
      text: "卖出",
      size: 2,
    },
  ];
}
