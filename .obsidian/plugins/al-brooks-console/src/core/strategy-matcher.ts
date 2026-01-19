/**
 * 策略匹配器 (兼容层)
 * 
 * 此文件已废弃，所有调用会转发到 strategy-matcher-v2.ts
 * 保留此文件仅为向后兼容
 */

import type { StrategyCard, StrategyIndex } from "./strategy-index";
import { matchStrategiesV2 } from "./strategy-matcher-v2";

export interface StrategyMatchInput {
  marketCycle?: string;
  setupCategory?: string;
  patterns?: string[];
  limit?: number;
}

/**
 * @deprecated 请使用 matchStrategiesV2
 * 此函数为兼容层，内部调用 V2 版本
 */
export function matchStrategies(
  index: StrategyIndex,
  input: StrategyMatchInput
): StrategyCard[] {
  // 转发到 V2，只返回 StrategyCard 数组（兼容旧接口）
  const results = matchStrategiesV2(index, {
    marketCycle: input.marketCycle,
    setupCategory: input.setupCategory,
    patterns: input.patterns,
    limit: input.limit
  });

  return results.map(r => r.card);
}
