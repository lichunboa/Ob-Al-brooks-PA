/**
 * 策略信号 Hook - 从后端获取策略计算结果
 * 
 * 这是与 Obsidian 的主要区别：
 * - Obsidian: useStrategyMarkers.ts 在本地计算策略
 * - Web: useStrategySignals.ts 从后端 API 获取策略结果
 * 
 * 好处：
 * 1. 策略逻辑只在一处（后端 Python），修改只需改一处
 * 2. 计算能力更强（Python 更适合数值计算）
 * 3. 可以复用历史数据，不需要重复下载
 */

import { useState, useEffect, useCallback } from 'react';
import { ChartSignal, TimeFrame } from '@/types';

interface StrategySignal {
  type: 'BUY' | 'SELL' | 'NEUTRAL';
  name: string;
  description: string;
  confidence: number;
  timestamp: number;
  symbol: string;
  interval: string;
  metadata: Record<string, any>;
}

interface UseStrategySignalsOptions {
  symbol: string;
  interval: TimeFrame;
  enabled?: boolean;
}

export function useStrategySignals({
  symbol,
  interval,
  enabled = true,
}: UseStrategySignalsOptions) {
  const [signals, setSignals] = useState<ChartSignal[]>([]);
  const [rawSignals, setRawSignals] = useState<StrategySignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSignals = useCallback(async () => {
    if (!symbol || !interval || !enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(
        `${apiUrl}/api/v1/signals/analyze?symbol=${symbol}&interval=${interval}`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const signalsData: StrategySignal[] = data.signals || [];
      
      setRawSignals(signalsData);

      // 转换为图表标记格式
      const chartSignals: ChartSignal[] = signalsData.map((signal) => ({
        time: signal.timestamp,
        position: signal.type === 'BUY' ? 'belowBar' : 'aboveBar',
        color: signal.type === 'BUY' ? '#10B981' : '#EF4444',
        shape: signal.type === 'BUY' ? 'arrowUp' : 'arrowDown',
        text: `${signal.name} (${signal.confidence}%)`,
        size: Math.max(1, Math.min(3, signal.confidence / 30)), // 根据置信度调整大小
      }));

      setSignals(chartSignals);
    } catch (err) {
      console.error('Failed to fetch strategy signals:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSignals([]);
    } finally {
      setIsLoading(false);
    }
  }, [symbol, interval, enabled]);

  // 初始加载和定时刷新
  useEffect(() => {
    fetchSignals();

    // 每 30 秒刷新一次策略信号
    const interval_id = setInterval(fetchSignals, 30000);

    return () => clearInterval(interval_id);
  }, [fetchSignals]);

  return {
    signals,
    rawSignals,
    isLoading,
    error,
    refresh: fetchSignals,
  };
}

// 获取可用策略列表
export function useAvailableStrategies() {
  const [strategies, setStrategies] = useState<{ id: string; name: string; enabled: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchStrategies = async () => {
      setIsLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
        const response = await fetch(`${apiUrl}/api/v1/strategies`);
        
        if (response.ok) {
          const data = await response.json();
          setStrategies(data.strategies || []);
        }
      } catch (err) {
        console.error('Failed to fetch strategies:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStrategies();
  }, []);

  const updateEnabledStrategies = async (strategyIds: string[]) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/v1/strategies/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(strategyIds),
      });

      if (response.ok) {
        // 刷新列表
        const data = await response.json();
        setStrategies(prev => 
          prev.map(s => ({ ...s, enabled: data.enabled_strategies.includes(s.id) }))
        );
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to update strategies:', err);
      return false;
    }
  };

  return { strategies, isLoading, updateEnabledStrategies };
}
