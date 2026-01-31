/**
 * 生成图表策略标记的 Hook
 * 
 * 根据市场条件生成可在图表上显示的策略信号标记
 */

import { useMemo } from "react";

export interface StrategyMarker {
  time: number;  // 秒级时间戳
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
  size?: number;
}

interface UseStrategyMarkersOptions {
  symbol: string;
  trend: "bullish" | "bearish" | "neutral";
  price: number;
  changePercent: number;
  currentTimestamp?: number;  // 当前时间（秒）
}

// 策略定义
interface Strategy {
  id: string;
  name: string;
  category: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
}

const STRATEGIES: Strategy[] = [
  {
    id: "h1_l1_breakout",
    name: "H1/L1 突破",
    category: "趋势突破",
    direction: "BUY",
    confidence: 75,
  },
  {
    id: "ema20_gap",
    name: "20均线回调",
    category: "趋势回调",
    direction: "BUY",
    confidence: 70,
  },
  {
    id: "double_top_bottom",
    name: "双重顶底",
    category: "反转形态",
    direction: "SELL",
    confidence: 80,
  },
  {
    id: "wedge",
    name: "楔形形态",
    category: "反转形态",
    direction: "NEUTRAL",
    confidence: 72,
  },
  {
    id: "failed_breakout",
    name: "失败突破",
    category: "陷阱形态",
    direction: "SELL",
    confidence: 68,
  },
  {
    id: "bollinger_bounce",
    name: "布林带反弹",
    category: "均值回归",
    direction: "BUY",
    confidence: 65,
  },
];

export function useStrategyMarkers(options: UseStrategyMarkersOptions): {
  markers: StrategyMarker[];
  strategies: Strategy[];
} {
  const { symbol, trend, price, changePercent, currentTimestamp } = options;

  return useMemo(() => {
    // 基于品种特征生成一致的指标
    const symbolHash = symbol.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    
    const rsi = Math.max(20, Math.min(80, 
      (trend === "bullish" ? 60 : trend === "bearish" ? 35 : 50) + (symbolHash % 15) - 7
    ));
    
    const volatility = Math.max(0.5, Math.abs(changePercent) * 1.5 + (symbolHash % 20) / 10);
    const ema20 = price ? price * (1 - changePercent / 100 * 0.3) : 0;
    
    // 计算市场指标
    const rsiSignal = rsi > 70 ? "overbought" : rsi < 30 ? "oversold" : "neutral";
    const trendStrength = Math.min(Math.abs(changePercent) * 10, 100);
    const volatilityLevel = volatility > 3 ? "high" : volatility < 1 ? "low" : "normal";
    const emaDistance = Math.abs((price - ema20) / price * 100);

    // 匹配策略
    const scores: Map<string, number> = new Map();

    if (trend !== "neutral" && trendStrength > 30) {
      scores.set("h1_l1_breakout", trendStrength * 0.8);
    }
    
    if (trend === "bearish" || trend === "neutral") {
      scores.set("double_top_bottom", trend === "bearish" ? 80 : 50);
    }
    
    if (emaDistance < 1.5) {
      scores.set("ema20_gap", 70 - emaDistance * 10);
    }
    
    if (rsiSignal !== "neutral") {
      scores.set("bollinger_bounce", 75);
    }
    
    if (volatilityLevel === "high") {
      scores.set("wedge", 72);
    }
    
    if (rsiSignal !== "neutral") {
      scores.set("failed_breakout", 68);
    }

    // 排序并选择前3个
    const sortedIds = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => id);

    const matchedStrategies = sortedIds
      .map((id) => {
        const strategy = STRATEGIES.find((s) => s.id === id);
        if (strategy) {
          return { ...strategy, confidence: Math.round(scores.get(id) || strategy.confidence) };
        }
        return null;
      })
      .filter(Boolean) as Strategy[];

    // 生成图表标记
    const now = currentTimestamp || Math.floor(Date.now() / 1000);
    const markers: StrategyMarker[] = matchedStrategies.map((strategy) => {
      const isBuy = strategy.direction === "BUY";
      
      // 生成一个在过去时间范围内的"预测"标记
      // 根据策略类型，在不同的时间偏移位置显示
      const timeOffset = strategy.id === "h1_l1_breakout" ? -300 :  // 5分钟前
                        strategy.id === "ema20_gap" ? -600 :        // 10分钟前
                        strategy.id === "double_top_bottom" ? -900 : // 15分钟前
                        -1800;  // 30分钟前
      
      return {
        time: now + timeOffset,
        position: isBuy ? "belowBar" : "aboveBar",
        color: isBuy ? "#10B981" : strategy.direction === "SELL" ? "#EF4444" : "#F59E0B",
        shape: isBuy ? "arrowUp" : strategy.direction === "SELL" ? "arrowDown" : "circle",
        text: strategy.name,
        size: Math.min(Math.max(strategy.confidence / 25, 1), 3),
      };
    });

    return { markers, strategies: matchedStrategies };
  }, [symbol, trend, price, changePercent, currentTimestamp]);
}
