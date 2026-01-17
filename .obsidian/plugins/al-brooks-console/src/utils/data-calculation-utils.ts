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
    netMoney: number;
    netR: number;
    losingStreak: number;
} {
    const todayTrades = trades.filter((t) => t.dateIso === todayIso);
    const total = todayTrades.length;
    let wins = 0;
    let losses = 0;
    let netMoney = 0;
    let netR = 0;

    for (const t of todayTrades) {
        const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
        netMoney += pnl;

        let r = 0;
        if (typeof t.r === "number" && Number.isFinite(t.r)) {
            r = t.r;
        } else if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
            r = pnl / t.initialRisk;
        }
        netR += r;

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

    // Calculate Losing Streak (from latest to earliest)
    // Assuming trades are somewhat chronological, but we should traverse from end.
    // If trades are not sorted by time, this might be inaccurate, but usually they are app-managed lists.
    let currentLosingStreak = 0;
    // We iterate backwards to find the current active streak
    for (let i = todayTrades.length - 1; i >= 0; i--) {
        const t = todayTrades[i];
        const outcome = (t.outcome ?? "").toString().trim().toLowerCase();

        if (outcome === "loss") {
            currentLosingStreak++;
        } else if (outcome === "win" || outcome === "scratch") {
            // Streak broken
            break;
        } else {
            // 'Open' or 'Unknown'? 
            // If it's open, it shouldn't count towards realized streak?
            // Usually we only count closed trades.
            // If pnl < 0 but open? 
            // Let's stick to explicit 'loss' outcome for now.
            if (outcome !== "open") {
                // If it has a result but not loss, break.
                if (t.pnl && t.pnl > 0) break; // Win
                if (t.pnl && t.pnl < 0) currentLosingStreak++; // Assume loss if pnl < 0
                else break; // Scratch or 0
            }
        }
    }

    return {
        todayTrades,
        todayWins: wins,
        todayLosses: losses,
        todayPnl: netMoney,
        total,
        wins,
        losses,
        winRatePct,
        netMoney,
        netR,
        losingStreak: currentLosingStreak
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
