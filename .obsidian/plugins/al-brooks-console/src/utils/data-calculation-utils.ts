/**
 * 数据计算工具函数
 * 用于交易数据的计算和分析
 */

import type { TradeRecord } from "../core/contracts";

/**
 * 计算所有交易的日期范围
 */
export function calculateDateRange(trades: TradeRecord[]): {
    minDate: string;
    maxDate: string;
} {
    if (trades.length === 0) {
        return { minDate: "", maxDate: "" };
    }

    let minDate = "";
    let maxDate = "";

    for (const t of trades) {
        const d = (t.dateIso ?? "").toString().trim();
        if (!d) continue;
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
    }

    return { minDate, maxDate };
}

/**
 * 计算今日KPI数据
 */
export function calculateTodayKpi(
    trades: TradeRecord[],
    todayIso: string
): {
    todayTrades: TradeRecord[];
    todayWins: number;
    todayLosses: number;
    todayPnl: number;
} {
    const todayTrades = trades.filter((t) => t.dateIso === todayIso);
    let todayWins = 0;
    let todayLosses = 0;
    let todayPnl = 0;

    for (const t of todayTrades) {
        const outcome = (t.outcome ?? "").toString().trim().toLowerCase();
        if (outcome === "win") todayWins++;
        if (outcome === "loss") todayLosses++;
        if (typeof t.pnl === "number" && Number.isFinite(t.pnl)) {
            todayPnl += t.pnl;
        }
    }

    return { todayTrades, todayWins, todayLosses, todayPnl };
}

/**
 * 策略统计数据计算
 */
export function calculateStrategyStats(
    strategies: any[],
    strategyPerf: Map<string, { total: number; wins: number; pnl: number; lastDateIso: string }>
): {
    total: number;
    activeCount: number;
    learningCount: number;
    totalUses: number;
} {
    const total = strategies.length;
    const activeCount = strategies.filter((s) => {
        const statusRaw = (s as any).statusRaw;
        return statusRaw === "Active" || statusRaw === "active";
    }).length;
    const learningCount = Math.max(0, total - activeCount);

    let totalUses = 0;
    strategyPerf.forEach((p) => (totalUses += p.total));

    return { total, activeCount, learningCount, totalUses };
}

/**
 * 计算所有交易的日期范围(使用calculateDateRange的结果)
 * 返回min和max字段
 */
export function calculateAllTradesDateRange(trades: TradeRecord[]): {
    min: string | undefined;
    max: string | undefined;
} {
    const { minDate, maxDate } = calculateDateRange(trades);
    return {
        min: minDate || undefined,
        max: maxDate || undefined,
    };
}
