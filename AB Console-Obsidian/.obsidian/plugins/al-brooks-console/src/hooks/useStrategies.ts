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
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const res = await fetch(url, { 
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
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
 * 计算技术指标（基于价格和趋势估算）
 */
export function calculateIndicators(
  symbol: string,
  trend: "bullish" | "bearish" | "neutral",
  changePercent: number
) {
  // 基于品种名称生成一致的伪随机值
  const symbolHash = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // RSI 基于趋势和品种特征
  let rsi = trend === "bullish" ? 60 : trend === "bearish" ? 40 : 50;
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
    bbPosition: bbPosition === 0 ? "lower" : bbPosition === 2 ? "upper" : "middle",
    volatility: Math.round(volatility * 100) / 100,
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

  const indicators = calculateIndicators("", marketConditions.trend, marketConditions.changePercent || 0);

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
    const riskLevel = (frontmatter["风险等级/risk_level"] as string) || "";

    // 1. 基础分：每个策略都有基础分
    score += 5;

    // 2. 信号名称匹配 (最高权重)
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

    // 3. 技术指标驱动的匹配（当没有信号时）
    if (signals.length === 0) {
      // RSI 超卖 + 做多策略
      if (indicators.rsi < 35) {
        if (directions.some(d => d.toLowerCase().includes("long") || d.toLowerCase().includes("多"))) {
          score += 20;
          matchedSignals.push("RSI超卖-适合做多");
        }
      }
      // RSI 超买 + 做空策略
      if (indicators.rsi > 65) {
        if (directions.some(d => d.toLowerCase().includes("short") || d.toLowerCase().includes("空"))) {
          score += 20;
          matchedSignals.push("RSI超买-适合做空");
        }
      }
      // EMA 接近（震荡市场）+ 区间策略
      if (Math.abs(indicators.emaDistance) < 0.5) {
        if (setupType.includes("区间") || marketCycles.some(m => m.toLowerCase().includes("range") || m.toLowerCase().includes("区间"))) {
          score += 15;
          matchedSignals.push("EMA靠近-震荡策略");
        }
      }
      // EMA 偏离（趋势市场）+ 趋势策略
      if (Math.abs(indicators.emaDistance) > 1) {
        if (setupType.includes("趋势") || marketCycles.some(m => m.toLowerCase().includes("trend") || m.toLowerCase().includes("趋势"))) {
          score += 15;
          matchedSignals.push("EMA偏离-趋势策略");
        }
      }
      // 布林带下轨 + 反弹策略
      if (indicators.bbPosition === "lower") {
        if (patterns.some(p => p.toLowerCase().includes("反弹") || p.toLowerCase().includes("反转"))) {
          score += 15;
          matchedSignals.push("布林带下轨-反弹策略");
        }
      }
      // 布林带上轨 + 回调策略
      if (indicators.bbPosition === "upper") {
        if (patterns.some(p => p.toLowerCase().includes("回调") || p.toLowerCase().includes("缺口"))) {
          score += 15;
          matchedSignals.push("布林带上轨-回调策略");
        }
      }
    }

    // 4. 市场周期匹配
    if (marketConditions.trend === "bullish") {
      if (marketCycles.some(m => m.toLowerCase().includes("bull") || m.toLowerCase().includes("趋势"))) {
        score += 12;
        matchedSignals.push("trend:看涨");
      }
    } else if (marketConditions.trend === "bearish") {
      if (marketCycles.some(m => m.toLowerCase().includes("bear") || m.toLowerCase().includes("区间"))) {
        score += 12;
        matchedSignals.push("trend:看跌");
      }
    } else {
      // neutral - 匹配区间交易
      if (marketCycles.some(m => m.toLowerCase().includes("range") || m.toLowerCase().includes("区间"))) {
        score += 12;
        matchedSignals.push("trend:震荡");
      }
    }

    // 5. 基于涨跌幅的额外匹配
    if (marketConditions.changePercent !== undefined) {
      const change = Math.abs(marketConditions.changePercent);
      if (change > 2 && (setupType.includes("突破") || patterns.some(p => p.toLowerCase().includes("突破")))) {
        score += 10;
        matchedSignals.push("大波动-突破");
      }
      if (change < 0.5 && setupType.includes("区间")) {
        score += 10;
        matchedSignals.push("低波动-区间");
      }
    }

    // 6. 风险等级偏好：中等风险优先
    if (riskLevel.toLowerCase().includes("中")) {
      score += 3;
    }

    return {
      ...strategy,
      matchScore: score,
      matchedSignals: [...new Set(matchedSignals)],
    };
  });

  // 过滤并排序（只要有基础分就显示，最多5个）
  return scored
    .filter((s) => s.matchScore >= 5)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 5);
}
