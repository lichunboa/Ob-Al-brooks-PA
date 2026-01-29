/**
 * 策略卡片数据 Hook
 * 从后端 sync-service 获取策略仓库中的策略卡片
 */

import { useState, useEffect, useCallback } from "react";
import type { BackendSettings } from "../settings";

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
  backend: BackendSettings;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useStrategies(options: UseStrategiesOptions) {
  const { backend, autoRefresh = false, refreshInterval = 60 } = options;

  const [strategies, setStrategies] = useState<StrategyCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchStrategies = useCallback(async () => {
    if (!backend.enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {};
      if (backend.apiToken) {
        headers["Authorization"] = `Bearer ${backend.apiToken}`;
      }

      // 尝试从 sync-service (port 8089) 获取策略
      const urls = [
        `${backend.baseUrl.replace(':8088', ':8089')}/strategies/list`,
        `${backend.baseUrl}/api/v1/strategies/list`,
      ];

      let lastError: Error | null = null;
      for (const url of urls) {
        try {
          const res = await fetch(url, { 
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            // 处理不同响应格式
            const strategiesData = Array.isArray(data) ? data : data.strategies || [];
            setStrategies(strategiesData);
            setLastFetch(Date.now());
            setIsLoading(false);
            return;
          }
        } catch (e) {
          lastError = e as Error;
          continue;
        }
      }

      throw lastError || new Error("All endpoints failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStrategies([]);
    } finally {
      setIsLoading(false);
    }
  }, [backend.enabled, backend.baseUrl, backend.apiToken]);

  // 初始加载
  useEffect(() => {
    fetchStrategies();
  }, [fetchStrategies]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !backend.enabled) return;

    const interval = window.setInterval(fetchStrategies, refreshInterval * 1000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, backend.enabled, refreshInterval, fetchStrategies]);

  return {
    strategies,
    isLoading,
    error,
    lastFetch,
    refresh: fetchStrategies,
  };
}

/**
 * 基于信号和当前市场条件匹配策略
 */
export function matchStrategies(
  strategies: StrategyCard[],
  signals: Array<{
    signal_name?: string;
    pattern?: string;
    direction?: string;
    symbol?: string;
  }>,
  marketConditions: {
    trend: "bullish" | "bearish" | "neutral";
    price?: number;
    changePercent?: number;
  }
): Array<StrategyCard & { matchScore: number; matchedSignals: string[] }> {
  if (!strategies.length) return [];

  const scored = strategies.map((strategy) => {
    let score = 0;
    const matchedSignals: string[] = [];

    const strategyName = strategy.name?.toLowerCase() || "";
    const strategyCategory = strategy.category?.toLowerCase() || "";
    const setupType = strategy.setup_type?.toLowerCase() || "";
    const rules = (strategy.rules || []).join(" ").toLowerCase();
    const frontmatter = strategy.raw_frontmatter || {};
    
    // 从 frontmatter 获取更多匹配字段
    const patterns = (frontmatter["观察到的形态/patterns_observed"] as string[]) || [];
    const directions = (frontmatter["方向/direction"] as string[]) || [];
    const marketCycles = (frontmatter["市场周期/market_cycle"] as string[]) || [];
    const signalBarTypes = (frontmatter["信号K/signal_bar_quality"] as string[]) || [];

    // 1. 信号名称匹配 (最高权重)
    for (const signal of signals) {
      const signalName = signal.signal_name?.toLowerCase() || "";
      const pattern = signal.pattern?.toLowerCase() || "";
      const signalDirection = signal.direction?.toLowerCase() || "";

      // 信号名称与策略名称匹配
      if (signalName && strategyName.includes(signalName)) {
        score += 40;
        matchedSignals.push(`name:${signal.signal_name}`);
      }
      
      // 信号形态与策略名称匹配
      if (pattern && strategyName.includes(pattern)) {
        score += 35;
        matchedSignals.push(`pattern:${signal.pattern}`);
      }

      // 信号形态与策略观察形态匹配
      if (pattern && patterns.some(p => p.toLowerCase().includes(pattern))) {
        score += 30;
        matchedSignals.push(`observed:${signal.pattern}`);
      }

      // 方向匹配
      if (signalDirection) {
        const directionMatches = directions.some(d => 
          d.toLowerCase().includes(signalDirection) ||
          (signalDirection === "buy" && d.toLowerCase().includes("long")) ||
          (signalDirection === "sell" && d.toLowerCase().includes("short"))
        );
        if (directionMatches) {
          score += 20;
          matchedSignals.push(`direction:${signal.direction}`);
        }
      }
    }

    // 2. 市场周期匹配
    if (marketConditions.trend === "bullish") {
      if (marketCycles.some(m => m.toLowerCase().includes("bull") || m.toLowerCase().includes("趋势"))) {
        score += 15;
      }
    } else if (marketConditions.trend === "bearish") {
      if (marketCycles.some(m => m.toLowerCase().includes("bear") || m.toLowerCase().includes("区间"))) {
        score += 15;
      }
    } else {
      // neutral - 匹配区间交易
      if (marketCycles.some(m => m.toLowerCase().includes("range") || m.toLowerCase().includes("区间"))) {
        score += 15;
      }
    }

    // 3. 基于涨跌幅的额外匹配
    if (marketConditions.changePercent !== undefined) {
      const change = Math.abs(marketConditions.changePercent);
      if (change > 2 && setupType.includes("突破")) {
        score += 10;
      }
      if (change < 0.5 && setupType.includes("区间")) {
        score += 10;
      }
    }

    // 4. 规则内容匹配
    if (rules.includes("突破") && signals.some(s => s.pattern?.toLowerCase().includes("突破"))) {
      score += 10;
    }
    if (rules.includes("反转") && signals.some(s => s.pattern?.toLowerCase().includes("反转"))) {
      score += 10;
    }

    return {
      ...strategy,
      matchScore: score,
      matchedSignals: [...new Set(matchedSignals)],
    };
  });

  // 过滤并排序（至少要有一些匹配）
  return scored
    .filter((s) => s.matchScore > 10)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}
