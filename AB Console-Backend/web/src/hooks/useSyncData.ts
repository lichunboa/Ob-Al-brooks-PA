'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  syncApi, 
  TradeStats, 
  StrategyPerformance, 
  SyncStatus,
  TradeRecord 
} from '@/lib/syncApi';

interface UseSyncDataReturn {
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  status: SyncStatus | null;
  tradeStats: TradeStats | null;
  strategies: StrategyPerformance[];
  recentTrades: TradeRecord[];
  refresh: () => void;
}

export function useSyncData(): UseSyncDataReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [tradeStats, setTradeStats] = useState<TradeStats | null>(null);
  const [strategies, setStrategies] = useState<StrategyPerformance[]>([]);
  const [recentTrades, setRecentTrades] = useState<TradeRecord[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check health first
      const health = await syncApi.checkHealth();
      setIsConnected(health.status === 'healthy');

      if (health.status === 'healthy') {
        // Fetch all data in parallel
        const [statusData, stats, strategyPerf, trades] = await Promise.all([
          syncApi.getStatus(),
          syncApi.getTradeStats(),
          syncApi.getStrategyPerformance(),
          syncApi.getRecentTrades(5),
        ]);

        setStatus(statusData);
        setTradeStats(stats);
        setStrategies(strategyPerf);
        setRecentTrades(trades);
      }
    } catch (err) {
      setIsConnected(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    
    // Auto refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return {
    isConnected,
    isLoading,
    error,
    status,
    tradeStats,
    strategies,
    recentTrades,
    refresh: fetchData,
  };
}
