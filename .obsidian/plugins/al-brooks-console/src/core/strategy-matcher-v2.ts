/**
 * 策略匹配引擎 v2
 * 
 * 相比v1的改进:
 * 1. 多维度评分 (5个维度)
 * 2. 方向冲突检测
 * 3. 时间周期匹配
 * 4. 历史表现权重
 * 5. 推荐理由生成
 */

import type { StrategyCard, StrategyIndex } from "./strategy-index";
import type { TradeRecord } from "./contracts";

/**
 * 策略匹配输入 v2
 */
export interface StrategyMatchInputV2 {
    // 现有字段 (来自v1)
    marketCycle?: string;
    setupCategory?: string;
    patterns?: string[];

    // 新增字段
    direction?: "Long" | "Short"; // 交易方向
    timeframe?: string; // 时间周期
    includeHistoricalPerf?: boolean; // 是否考虑历史表现

    limit?: number;
}

/**
 * 评分细分
 */
export interface ScoreBreakdown {
    direction: number;      // 方向匹配 (0-5分)
    timeframe: number;      // 时间周期 (0-3分)
    historical: number;     // 历史表现 (0-4分)
    marketCycle: number;    // 市场周期 (0-2分)
    setupCategory: number;  // 设置类别 (0-1分)
    pattern: number;        // 形态匹配 (0-10分,精确匹配时给高分)
}

/**
 * 策略匹配结果 v2
 */
export interface StrategyMatchResult {
    card: StrategyCard;
    score: number; // 总分
    breakdown: ScoreBreakdown;
    reason: string; // 推荐理由
}

/**
 * 辅助函数: 规范化字符串用于匹配
 */
function normalizeKey(v: string): string {
    const base = v.includes("(") ? v.split("(")[0].trim() : v.trim();
    return base.toLowerCase();
}

/**
 * 辅助函数: 计算策略历史表现
 */
function calculateStrategyPerformance(
    strategyName: string,
    trades: TradeRecord[]
): { winRate: number; totalTrades: number } {
    const strategyTrades = trades.filter(t => {
        const tName = t.strategyName?.toLowerCase() || "";
        const sName = strategyName.toLowerCase();
        return tName.includes(sName) || sName.includes(tName);
    });

    if (strategyTrades.length === 0) {
        return { winRate: 0, totalTrades: 0 };
    }

    const wins = strategyTrades.filter(t => {
        const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
        return pnl > 0;
    }).length;

    return {
        winRate: (wins / strategyTrades.length) * 100,
        totalTrades: strategyTrades.length
    };
}

/**
 * 辅助函数: 评分方向匹配
 */
function scoreDirection(
    card: StrategyCard,
    direction?: "Long" | "Short"
): number {
    if (!direction) return 0;

    // 优先使用direction字段(标准化数据)
    const cardDirection = (card as any).direction || (card as any)["方向/direction"];
    if (cardDirection) {
        const dirStr = Array.isArray(cardDirection)
            ? cardDirection.join(" ").toLowerCase()
            : String(cardDirection).toLowerCase();

        // 双向策略
        if (dirStr.includes("both") || dirStr.includes("双向")) {
            return 3; // 双向策略给中等分数
        }

        // 方向匹配
        if (direction === "Long") {
            if (dirStr.includes("long") || dirStr.includes("做多")) {
                return 5; // 完全匹配
            }
            if (dirStr.includes("short") || dirStr.includes("做空")) {
                return 0; // 方向冲突
            }
        } else if (direction === "Short") {
            if (dirStr.includes("short") || dirStr.includes("做空")) {
                return 5; // 完全匹配
            }
            if (dirStr.includes("long") || dirStr.includes("做多")) {
                return 0; // 方向冲突
            }
        }

        // 有字段但未匹配,给保守分数
        return 2;
    }

    // 回退到关键词匹配(兼容旧数据)
    const cardName = card.name?.toLowerCase() || "";
    const cardPatterns = (card.patternsObserved || []).map((t: string) => t.toLowerCase()).join(" ");
    const cardSetups = (card.setupCategories || []).map((t: string) => t.toLowerCase()).join(" ");
    const combined = `${cardName} ${cardPatterns} ${cardSetups}`;

    // 检查是否是双向策略
    const isBidirectional =
        combined.includes("双向") ||
        combined.includes("bidirectional") ||
        (combined.includes("long") && combined.includes("short"));

    if (isBidirectional) {
        return 3; // 双向策略给中等分数
    }

    // 检查方向匹配
    if (direction === "Long") {
        if (combined.includes("long") || combined.includes("多") || combined.includes("买")) {
            return 5; // 完全匹配
        }
        if (combined.includes("short") || combined.includes("空") || combined.includes("卖")) {
            return 0; // 方向冲突
        }
    } else if (direction === "Short") {
        if (combined.includes("short") || combined.includes("空") || combined.includes("卖")) {
            return 5; // 完全匹配
        }
        if (combined.includes("long") || combined.includes("多") || combined.includes("买")) {
            return 0; // 方向冲突
        }
    }

    return 2; // 未明确方向,给保守分数
}

/**
 * 辅助函数: 评分时间周期匹配
 */
function scoreTimeframe(
    card: StrategyCard,
    timeframe?: string
): number {
    if (!timeframe) return 0;

    // 从策略卡片中提取时间周期信息
    const cardName = card.name?.toLowerCase() || "";
    const cardPatterns = (card.patternsObserved || []).map((t: string) => t.toLowerCase()).join(" ");
    const cardSetups = (card.setupCategories || []).map((t: string) => t.toLowerCase()).join(" ");
    const combined = `${cardName} ${cardPatterns} ${cardSetups}`;

    const tfLower = timeframe.toLowerCase();

    // 精确匹配
    if (combined.includes(tfLower)) {
        return 3;
    }

    // 跨周期兼容性
    // 5m可以用15m策略 (降权)
    if (tfLower === "5m" && (combined.includes("15m") || combined.includes("1m"))) {
        return 1;
    }
    // 15m可以用5m或1h策略 (降权)
    if (tfLower === "15m" && (combined.includes("5m") || combined.includes("1h"))) {
        return 1;
    }

    return 0;
}

/**
 * 辅助函数: 评分历史表现
 */
function scoreHistorical(
    winRate: number,
    totalTrades: number
): number {
    if (totalTrades === 0) {
        return 2; // 无历史数据,给中等分数
    }

    if (totalTrades < 5) {
        return 1; // 样本太小,降权
    }

    if (winRate >= 60) {
        return 4; // 高胜率
    } else if (winRate >= 40) {
        return 2; // 中等胜率
    } else {
        return 0; // 低胜率
    }
}

/**
 * 辅助函数: 生成推荐理由
 */
function generateReason(
    card: StrategyCard,
    breakdown: ScoreBreakdown,
    perf?: { winRate: number; totalTrades: number }
): string {
    const reasons: string[] = [];

    // 形态匹配
    if (breakdown.pattern > 0) {
        reasons.push("形态精确匹配");
    }

    // 方向匹配
    if (breakdown.direction === 5) {
        reasons.push("方向完全匹配");
    } else if (breakdown.direction === 3) {
        reasons.push("双向策略");
    }

    // 时间周期
    if (breakdown.timeframe === 3) {
        reasons.push("时间周期匹配");
    } else if (breakdown.timeframe > 0) {
        reasons.push("跨周期适用");
    }

    // 历史表现
    if (perf && perf.totalTrades >= 5) {
        if (breakdown.historical === 4) {
            reasons.push(`历史胜率${perf.winRate.toFixed(0)}% (优秀)`);
        } else if (breakdown.historical === 2) {
            reasons.push(`历史胜率${perf.winRate.toFixed(0)}% (中等)`);
        }
    }

    // 市场周期
    if (breakdown.marketCycle > 0) {
        reasons.push("市场周期匹配");
    }

    // 设置类别
    if (breakdown.setupCategory > 0) {
        reasons.push("设置类别匹配");
    }

    if (reasons.length === 0) {
        return "基础推荐";
    }

    return reasons.join(", ");
}

/**
 * 策略匹配引擎 v2
 */
export function matchStrategiesV2(
    index: StrategyIndex,
    input: StrategyMatchInputV2,
    trades?: TradeRecord[]
): StrategyMatchResult[] {
    const limit = Math.min(6, Math.max(1, input.limit ?? 6));
    const patterns = (input.patterns ?? []).map((p) => p.trim()).filter(Boolean);
    const results: StrategyMatchResult[] = [];
    const seen = new Set<string>();

    // Phase 1: 形态精确匹配 (最高优先级)
    for (const p of patterns) {
        const card = index.byPattern(p);
        if (!card) continue;
        if (seen.has(card.path)) continue;

        const breakdown: ScoreBreakdown = {
            pattern: 10, // 精确匹配给高分
            direction: scoreDirection(card, input.direction),
            timeframe: scoreTimeframe(card, input.timeframe),
            historical: 0,
            marketCycle: 0,
            setupCategory: 0
        };

        // 计算历史表现
        let perf: { winRate: number; totalTrades: number } | undefined;
        if (input.includeHistoricalPerf && trades && trades.length > 0) {
            perf = calculateStrategyPerformance(card.name, trades);
            breakdown.historical = scoreHistorical(perf.winRate, perf.totalTrades);
        }

        const score =
            breakdown.pattern +
            breakdown.direction +
            breakdown.timeframe +
            breakdown.historical +
            breakdown.marketCycle +
            breakdown.setupCategory;

        seen.add(card.path);
        results.push({
            card,
            score,
            breakdown,
            reason: generateReason(card, breakdown, perf)
        });

        if (results.length >= limit) return results;
    }

    // Phase 2: 上下文评分 (回退)
    const wantSetup = input.setupCategory?.trim();
    const wantCycle = input.marketCycle?.trim();

    const wantSetupKey = wantSetup ? normalizeKey(wantSetup) : undefined;
    const wantCycleKey = wantCycle ? normalizeKey(wantCycle) : undefined;

    // 计算用户选择的属性数量,用于动态调整门槛
    const selectedCount = [
        input.marketCycle,
        input.setupCategory,
        input.direction,
        input.timeframe
    ].filter(Boolean).length;

    // 动态门槛: 选择的属性越多,要求越严格
    const minScore = selectedCount >= 4 ? 8 :  // 4个属性: 至少8分
        selectedCount >= 3 ? 6 :  // 3个属性: 至少6分
            selectedCount >= 2 ? 4 :  // 2个属性: 至少4分
                2;                         // 1个属性: 至少2分

    const candidates: StrategyMatchResult[] = [];

    for (const card of index.list()) {
        if (seen.has(card.path)) continue;

        const breakdown: ScoreBreakdown = {
            pattern: 0,
            direction: scoreDirection(card, input.direction),
            timeframe: scoreTimeframe(card, input.timeframe),
            historical: 0,
            marketCycle: 0,
            setupCategory: 0
        };

        // 必选项验证: 如果用户提供了这些字段,策略必须匹配
        // 市场周期必选
        if (input.marketCycle && breakdown.marketCycle === 0) {
            // 检查市场周期匹配
            if (wantCycleKey && card.marketCycles && card.marketCycles.some(c => {
                const ck = normalizeKey(String(c));
                return ck.includes(wantCycleKey) || wantCycleKey.includes(ck);
            })) {
                breakdown.marketCycle = 2;
            } else {
                continue; // 跳过不匹配的策略
            }
        } else if (wantCycleKey && card.marketCycles && card.marketCycles.some(c => {
            const ck = normalizeKey(String(c));
            return ck.includes(wantCycleKey) || wantCycleKey.includes(ck);
        })) {
            breakdown.marketCycle = 2;
        }

        // 设置类别必选
        if (input.setupCategory && breakdown.setupCategory === 0) {
            // 检查设置类别匹配
            if (wantSetupKey && card.setupCategories && card.setupCategories.some(c => {
                const ck = normalizeKey(String(c));
                return ck.includes(wantSetupKey) || wantSetupKey.includes(ck);
            })) {
                breakdown.setupCategory = 1;
            } else {
                continue; // 跳过不匹配的策略
            }
        } else if (wantSetupKey && card.setupCategories && card.setupCategories.some(c => {
            const ck = normalizeKey(String(c));
            return ck.includes(wantSetupKey) || wantSetupKey.includes(ck);
        })) {
            breakdown.setupCategory = 1;
        }

        // 方向必选 (如果方向冲突,直接跳过)
        if (input.direction && breakdown.direction === 0) {
            continue; // 方向冲突,跳过
        }

        // 计算历史表现
        let perf: { winRate: number; totalTrades: number } | undefined;
        if (input.includeHistoricalPerf && trades && trades.length > 0) {
            perf = calculateStrategyPerformance(card.name, trades);
            breakdown.historical = scoreHistorical(perf.winRate, perf.totalTrades);
        }

        const score =
            breakdown.direction +
            breakdown.timeframe +
            breakdown.historical +
            breakdown.marketCycle +
            breakdown.setupCategory;

        // 只保留达到动态门槛的候选
        if (score >= minScore) {
            candidates.push({
                card,
                score,
                breakdown,
                reason: generateReason(card, breakdown, perf)
            });
        }
    }

    // 按分数降序排序
    candidates.sort((a, b) => b.score - a.score);

    // 填充剩余槽位
    for (const cand of candidates) {
        if (results.length >= limit) break;
        results.push(cand);
    }

    return results;
}
