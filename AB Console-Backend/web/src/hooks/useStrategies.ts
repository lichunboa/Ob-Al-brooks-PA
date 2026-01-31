'use client';

import { useState, useEffect, useCallback } from 'react';

export interface StrategyCard {
  id: string;
  name: string;
  canonical_name?: string;
  category?: string;
  setup_type?: string;
  path: string;
  description?: string;
  rules?: string[];
  examples?: string[];
  trade_count?: number;
  win_count?: number;
  tags?: string[];
  raw_frontmatter?: Record<string, unknown>;
}

interface UseStrategiesOptions {
  apiUrl: string; // api-service (8088)
  syncApiUrl?: string; // sync-service (8089)
  autoRefresh?: boolean;
  refreshInterval?: number; // 秒
}

interface UseStrategiesResult {
  strategies: StrategyCard[];
  isLoading: boolean;
  error: string | null;
  lastFetch: Date | null;
  refresh: () => Promise<void>;
}

export function useStrategies(options: UseStrategiesOptions): UseStrategiesResult {
  const { apiUrl, syncApiUrl, autoRefresh = false, refreshInterval = 60 } = options;

  const [strategies, setStrategies] = useState<StrategyCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchStrategies = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 优先尝试 sync-service (8089)，如果失败则尝试 api-service
      const urls = [
        ...(syncApiUrl ? [`${syncApiUrl}/strategies/list`] : []),
        `${apiUrl}/api/v1/strategies/list`,
      ];

      let lastError: Error | null = null;
      for (const url of urls) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (res.ok) {
            const data = await res.json();
            // 处理不同响应格式
            const strategiesData = Array.isArray(data) ? data : data.strategies || [];
            setStrategies(strategiesData);
            setLastFetch(new Date());
            setIsLoading(false);
            return;
          }
        } catch (e) {
          lastError = e as Error;
          continue;
        }
      }

      throw lastError || new Error('All endpoints failed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStrategies([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, syncApiUrl]);

  // 初始加载
  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchStrategies, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStrategies]);

  return {
    strategies,
    isLoading,
    error,
    lastFetch,
    refresh: fetchStrategies,
  };
}

/**
 * 计算技术指标（基于价格和趋势估算）
 */
export function calculateIndicators(
  symbol: string,
  trend: 'bullish' | 'bearish' | 'neutral',
  changePercent: number
) {
  // 基于品种名称生成一致的伪随机值
  const symbolHash = symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

  // RSI 基于趋势和品种特征
  let rsi = trend === 'bullish' ? 60 : trend === 'bearish' ? 40 : 50;
  rsi += (symbolHash % 20) - 10;
  rsi = Math.max(20, Math.min(80, rsi));

  // EMA 距离
  const emaDistance = (symbolHash % 30) / 10 - 1.5; // -1.5% 到 +1.5%

  // 布林带位置
  const bbPosition = symbolHash % 3; // 0: 下轨, 1: 中轨, 2: 上轨

  // 波动率
  const volatility = Math.abs(changePercent) * 2 + (symbolHash % 10) / 5;

  return {
    rsi: Math.round(rsi * 10) / 10,
    emaDistance: Math.round(emaDistance * 100) / 100,
    bbPosition: bbPosition === 0 ? 'lower' : bbPosition === 2 ? 'upper' : 'middle',
    volatility: Math.round(volatility * 100) / 100,
  };
}

/**
 * 归一化 timeframe 字符串以便比较
 */
export function normalizeTimeframe(tf: string): string {
  const s = tf.toLowerCase().trim();
  // 统一常见格式：1h, 1H, 1hour → "1h"
  if (s === '1h' || s === '1hour' || s === '60m' || s === '60min') return '1h';
  if (s === '4h' || s === '4hour' || s === '240m') return '4h';
  if (s === '1d' || s === '1day' || s === 'daily') return '1d';
  if (s === '1w' || s === '1week' || s === 'weekly') return '1w';
  return s.replace('min', 'm');
}

// 简化的信号类型
interface SimpleSignal {
  signal_name?: string;
  pattern?: string;
  direction?: string;
  symbol?: string;
  timeframe?: string;
}

/**
 * 基于信号和当前市场条件匹配策略
 */
export function matchStrategies(
  strategies: StrategyCard[],
  signals: SimpleSignal[],
  marketConditions: {
    trend: 'bullish' | 'bearish' | 'neutral';
    price?: number;
    changePercent?: number;
    timeframe?: string;
  }
): Array<StrategyCard & { matchScore: number; matchedSignals: string[] }> {
  if (!strategies.length) return [];

  // 如果没有信号，不做匹配（避免所有品种显示相同策略）
  if (signals.length === 0) return [];

  const currentTimeframe = marketConditions.timeframe || '5m';

  const scored = strategies.map((strategy) => {
    let score = 0;
    const matchedSignals: string[] = [];

    const strategyName = strategy.name?.toLowerCase() || '';
    const setupType = strategy.setup_type?.toLowerCase() || '';
    const frontmatter = strategy.raw_frontmatter || {};

    // 从 frontmatter 获取匹配字段
    const patterns = (frontmatter['观察到的形态/patterns_observed'] as string[]) || [];
    const directions = (frontmatter['方向/direction'] as string[]) || [];
    const marketCycles = (frontmatter['市场周期/market_cycle'] as string[]) || [];
    const timeframes = (frontmatter['时间周期/timeframe'] as string[]) || [];

    // 1. 信号匹配 (核心权重)
    for (const signal of signals) {
      const signalName = signal.signal_name?.toLowerCase() || '';
      const pattern = signal.pattern?.toLowerCase() || '';
      const signalDirection = signal.direction?.toLowerCase() || '';
      const signalTimeframe = signal.timeframe?.toLowerCase() || '';

      // 信号名称与策略名称直接匹配（最强信号）
      if (signalName && strategyName.includes(signalName)) {
        score += 40;
        matchedSignals.push(signal.signal_name || '');
      }

      // 信号 pattern 与策略名称匹配
      if (pattern && strategyName.toLowerCase().includes(pattern.toLowerCase())) {
        score += 35;
        matchedSignals.push(signal.pattern || '');
      }

      // 信号 pattern 与策略 patterns_observed 匹配
      if (pattern && patterns.some((p) => p.toLowerCase().includes(pattern.toLowerCase()))) {
        score += 30;
        if (!matchedSignals.includes(signal.pattern || '')) {
          matchedSignals.push(signal.pattern || '');
        }
      }

      // 方向匹配
      if (signalDirection) {
        const directionMatches = directions.some((d) => {
          const dl = d.toLowerCase();
          return (
            (signalDirection === 'buy' && (dl.includes('long') || dl.includes('多'))) ||
            (signalDirection === 'sell' && (dl.includes('short') || dl.includes('空')))
          );
        });
        if (directionMatches) {
          score += 15;
          matchedSignals.push(signalDirection === 'buy' ? '方向:做多' : '方向:做空');
        }
      }

      // 信号 timeframe 与策略 timeframe 匹配
      if (signalTimeframe && timeframes.length > 0) {
        const tfMatches = timeframes.some(
          (tf) => normalizeTimeframe(tf) === normalizeTimeframe(signalTimeframe)
        );
        if (tfMatches) {
          score += 10;
          matchedSignals.push(`周期:${signalTimeframe}`);
        }
      }
    }

    // 2. 当前图表周期与策略适用周期匹配
    if (timeframes.length > 0) {
      const tfMatch = timeframes.some(
        (tf) => normalizeTimeframe(tf) === normalizeTimeframe(currentTimeframe)
      );
      if (tfMatch) {
        score += 8;
      } else {
        // 策略有明确周期要求但和当前图表不匹配，直接排除
        score = 0;
      }
    }

    // 3. 市场周期匹配（额外加分）
    if (marketConditions.trend === 'bullish') {
      if (
        marketCycles.some((m) => {
          const ml = m.toLowerCase();
          return ml.includes('bull') || ml.includes('strong trend') || ml.includes('强趋势');
        })
      ) {
        score += 8;
        matchedSignals.push('趋势:看涨');
      }
    } else if (marketConditions.trend === 'bearish') {
      if (
        marketCycles.some((m) => {
          const ml = m.toLowerCase();
          return ml.includes('bear') || ml.includes('strong trend') || ml.includes('强趋势');
        })
      ) {
        score += 8;
        matchedSignals.push('趋势:看跌');
      }
    }

    return {
      ...strategy,
      matchScore: score,
      matchedSignals: Array.from(new Set(matchedSignals.filter(Boolean))),
    };
  });

  // 只返回有实际信号匹配的策略（score > 0 表示有信号命中）
  return scored
    .filter((s) => s.matchScore >= 20)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}
