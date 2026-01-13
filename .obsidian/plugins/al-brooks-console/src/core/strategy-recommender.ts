/**
 * 策略推荐引擎
 * 
 * 功能:
 * 1. 根据已选择的属性,智能推荐下一步应填写的属性
 * 2. 基于策略仓库统计,按评分排序推荐值
 * 3. 支持渐进式填写流程
 */

import type { StrategyCard, StrategyIndex } from "./strategy-index";

/**
 * 推荐输入(已选择的属性)
 */
export interface RecommendationInput {
    marketCycle?: string;       // 市场周期
    alwaysIn?: string;          // 总是方向
    setupCategory?: string;     // 设置类别
    patterns?: string[];        // 观察到的形态
    signalBarQuality?: string[]; // 信号K
    direction?: string;         // 方向
    timeframe?: string;         // 时间周期
}

/**
 * 属性推荐结果
 */
export interface AttributeRecommendation {
    attribute: string;      // 属性名
    value: string;          // 属性值
    score: number;          // 评分(出现次数)
    count: number;          // 出现次数
    percentage: number;     // 百分比
    strategies: string[];   // 关联策略名称
}

/**
 * 推荐结果
 */
export interface RecommendationResult {
    nextAttribute: string;                  // 建议填写的下一个属性
    nextAttributeLabel: string;             // 属性中文标签
    recommendations: AttributeRecommendation[]; // 推荐值列表
    filteredCount: number;                  // 当前筛选后的策略数量
    totalCount: number;                     // 策略仓库总数
}

/**
 * 属性填写顺序定义
 */
const FILL_ORDER = [
    { key: 'marketCycle', label: '市场周期', field: 'marketCycles' },
    { key: 'alwaysIn', label: '总是方向', field: 'alwaysIn' },
    { key: 'setupCategory', label: '设置类别', field: 'setupCategories' },
    { key: 'patterns', label: '观察到的形态', field: 'patternsObserved' },
    { key: 'signalBarQuality', label: '信号K', field: 'signalBarQuality' },
    { key: 'direction', label: '方向', field: 'direction' },
] as const;

/**
 * 规范化字符串用于匹配
 */
function normalizeKey(v: string): string {
    const base = v.includes("(") ? v.split("(")[0].trim() : v.trim();
    return base.toLowerCase();
}

/**
 * 检查策略是否匹配指定的市场周期
 */
function matchMarketCycle(card: StrategyCard, value: string): boolean {
    if (!card.marketCycles || card.marketCycles.length === 0) return false;
    const normalizedValue = normalizeKey(value);
    return card.marketCycles.some(c => {
        const ck = normalizeKey(String(c));
        return ck.includes(normalizedValue) || normalizedValue.includes(ck);
    });
}

/**
 * 检查策略是否匹配指定的总是方向
 */
function matchAlwaysIn(card: StrategyCard, value: string): boolean {
    const cardValue = (card as any).alwaysIn || (card as any)["总是方向/always_in"];
    if (!cardValue) return false;
    const normalizedValue = normalizeKey(value);
    const cardStr = Array.isArray(cardValue)
        ? cardValue.join(" ").toLowerCase()
        : String(cardValue).toLowerCase();
    return cardStr.includes(normalizedValue) || normalizedValue.includes(cardStr);
}

/**
 * 检查策略是否匹配指定的设置类别
 */
function matchSetupCategory(card: StrategyCard, value: string): boolean {
    if (!card.setupCategories || card.setupCategories.length === 0) return false;
    const normalizedValue = normalizeKey(value);
    return card.setupCategories.some(c => {
        const ck = normalizeKey(String(c));
        return ck.includes(normalizedValue) || normalizedValue.includes(ck);
    });
}

/**
 * 检查策略是否匹配指定的形态
 */
function matchPatterns(card: StrategyCard, values: string[]): boolean {
    if (!card.patternsObserved || card.patternsObserved.length === 0) return false;
    return values.some(value => {
        const normalizedValue = normalizeKey(value);
        return card.patternsObserved!.some(p => {
            const pk = normalizeKey(String(p));
            return pk.includes(normalizedValue) || normalizedValue.includes(pk);
        });
    });
}

/**
 * 检查策略是否匹配指定的信号K
 */
function matchSignalBarQuality(card: StrategyCard, values: string[]): boolean {
    const cardValue = (card as any).signalBarQuality || (card as any)["信号K/signal_bar_quality"];
    if (!cardValue) return false;
    const cardArray = Array.isArray(cardValue) ? cardValue : [cardValue];
    return values.some(value => {
        const normalizedValue = normalizeKey(value);
        return cardArray.some(s => {
            const sk = normalizeKey(String(s));
            return sk.includes(normalizedValue) || normalizedValue.includes(sk);
        });
    });
}

/**
 * 检查策略是否匹配指定的方向
 */
function matchDirection(card: StrategyCard, value: string): boolean {
    const cardValue = (card as any).direction || (card as any)["方向/direction"];
    if (!cardValue) return false;
    const normalizedValue = normalizeKey(value);
    const cardStr = Array.isArray(cardValue)
        ? cardValue.join(" ").toLowerCase()
        : String(cardValue).toLowerCase();
    return cardStr.includes(normalizedValue) || normalizedValue.includes(cardStr);
}

/**
 * 根据输入筛选策略
 */
function filterStrategies(
    index: StrategyIndex,
    input: RecommendationInput
): StrategyCard[] {
    return index.list().filter(card => {
        // 市场周期匹配
        if (input.marketCycle && !matchMarketCycle(card, input.marketCycle)) {
            return false;
        }

        // 总是方向匹配
        if (input.alwaysIn && !matchAlwaysIn(card, input.alwaysIn)) {
            return false;
        }

        // 设置类别匹配
        if (input.setupCategory && !matchSetupCategory(card, input.setupCategory)) {
            return false;
        }

        // 形态匹配
        if (input.patterns && input.patterns.length > 0 && !matchPatterns(card, input.patterns)) {
            return false;
        }

        // 信号K匹配
        if (input.signalBarQuality && input.signalBarQuality.length > 0 && !matchSignalBarQuality(card, input.signalBarQuality)) {
            return false;
        }

        // 方向匹配
        if (input.direction && !matchDirection(card, input.direction)) {
            return false;
        }

        return true;
    });
}

/**
 * 确定下一个应填写的属性
 */
function determineNextAttribute(input: RecommendationInput): typeof FILL_ORDER[number] | null {
    for (const attr of FILL_ORDER) {
        const value = input[attr.key as keyof RecommendationInput];
        if (!value || (Array.isArray(value) && value.length === 0)) {
            return attr;
        }
    }
    return null; // 所有属性已填写
}

/**
 * 提取策略的属性值
 */
function extractAttributeValue(card: StrategyCard, fieldName: string): string[] {
    const value = (card as any)[fieldName];
    if (!value) return [];
    if (Array.isArray(value)) return value.map(String);
    return [String(value)];
}

/**
 * 智能推荐下一个属性及其值
 */
export function recommendNextAttribute(
    index: StrategyIndex,
    input: RecommendationInput
): RecommendationResult | null {
    // 1. 确定下一个应填写的属性
    const nextAttr = determineNextAttribute(input);
    if (!nextAttr) {
        return null; // 所有属性已填写
    }

    // 2. 根据已选择的属性筛选策略
    const filteredStrategies = filterStrategies(index, input);

    // 3. 统计该属性的值分布
    const distribution = new Map<string, { count: number; strategies: string[] }>();

    for (const card of filteredStrategies) {
        const values = extractAttributeValue(card, nextAttr.field);
        for (const value of values) {
            if (!value || value === 'undefined' || value === 'null') continue;

            const existing = distribution.get(value);
            if (existing) {
                existing.count++;
                existing.strategies.push(card.name);
            } else {
                distribution.set(value, {
                    count: 1,
                    strategies: [card.name]
                });
            }
        }
    }

    // 4. 转换为推荐列表并排序
    const totalCount = filteredStrategies.length;
    const recommendations: AttributeRecommendation[] = Array.from(distribution.entries())
        .map(([value, data]) => ({
            attribute: nextAttr.key,
            value,
            score: data.count,
            count: data.count,
            percentage: totalCount > 0 ? Math.round((data.count / totalCount) * 100) : 0,
            strategies: data.strategies
        }))
        .sort((a, b) => b.score - a.score);

    return {
        nextAttribute: nextAttr.key,
        nextAttributeLabel: nextAttr.label,
        recommendations,
        filteredCount: filteredStrategies.length,
        totalCount: index.list().length
    };
}
