/**
 * 策略相关工具函数
 * 用于策略名称解析和处理
 */

import type { TradeRecord } from "../core/contracts";

/**
 * 解析交易记录的规范策略名称
 * 优先使用strategyName,其次使用patternsObserved
 */
export function resolveCanonicalStrategy(
    t: TradeRecord,
    strategyIndex: any // StrategyIndex类型未导出,暂用any
): string | null {
    // 首先尝试从strategyName解析
    const raw = typeof t.strategyName === "string" ? t.strategyName.trim() : "";
    if (raw && raw !== "Unknown") {
        const looked = strategyIndex.lookup ? strategyIndex.lookup(raw) : undefined;
        return looked?.canonicalName || raw;
    }

    // 其次尝试从patternsObserved解析
    const pats = (t.patternsObserved ?? [])
        .map((p) => String(p).trim())
        .filter(Boolean);
    for (const p of pats) {
        const card = strategyIndex.byPattern
            ? strategyIndex.byPattern(p)
            : undefined;
        if (card?.canonicalName) return card.canonicalName;
    }

    return null;
}

/**
 * 规范化标签
 * 移除#前缀并转小写
 */
export function normalizeTag(tag: string): string {
    const t = String(tag ?? "").trim();
    return t.startsWith("#") ? t.slice(1).toLowerCase() : t.toLowerCase();
}
