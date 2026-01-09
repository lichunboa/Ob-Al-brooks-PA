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
    total: number;
    wins: number;
    losses: number;
    winRatePct: number;
    netR: number;
} {
    const todayTrades = trades.filter((t) => t.dateIso === todayIso);
    const total = todayTrades.length;
    let wins = 0;
    let losses = 0;
    let netR = 0;

    for (const t of todayTrades) {
        const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
        netR += pnl;

        const outcome = (t.outcome ?? "").toString().trim().toLowerCase();
        if (outcome === "win") {
            wins++;
        } else if (outcome === "loss") {
            losses++;
        } else if (!outcome || outcome === "unknown") {
            if (pnl > 0) wins++;
            else if (pnl < 0) losses++;
        }
    }

    const winRatePct = total > 0 ? Math.round((wins / total) * 100) : 0;

    return {
        todayTrades,
        todayWins: wins,
        todayLosses: losses,
        todayPnl: netR,
        total,
        wins,
        losses,
        winRatePct,
        netR,
    };
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

/**
 * 计算最大学费错误的百分比
 * @param topError 最大错误项
 * @param totalTuitionR 总学费R
 * @returns 百分比,如果无法计算则返回undefined
 */
export function calculateTopTuitionErrorPct(
    topError: { costR: number } | undefined,
    totalTuitionR: number
): number | undefined {
    return topError && totalTuitionR > 0
        ? Math.round((topError.costR / totalTuitionR) * 100)
        : undefined;
}
