/**
 * 市场周期和性能分析工具函数
 * 用于计算市场周期相关的性能数据
 */

import type { TradeRecord } from "../core/contracts";
import { normalizeCycle } from "./market-cycle-utils";

/**
 * 计算Live账户按市场周期的性能
 */
export function calculateLiveCyclePerformance(
    trades: TradeRecord[]
): Array<{ name: string; pnl: number }> {
    const byCycle = new Map<string, number>();

    for (const t of trades) {
        if (t.accountType !== "Live") continue;
        const cycle = normalizeCycle(t.marketCycle ?? "Unknown");
        const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;
        byCycle.set(cycle, (byCycle.get(cycle) ?? 0) + pnl);
    }

    return [...byCycle.entries()]
        .map(([name, pnl]) => ({ name, pnl }))
        .sort((a, b) => b.pnl - a.pnl);
}

/**
 * 按日期和时间排序交易记录(降序)
 */
export function sortTradesByDateDesc(trades: TradeRecord[]): TradeRecord[] {
    return [...trades].sort((a, b) => {
        const da = a.dateIso ?? "";
        const db = b.dateIso ?? "";
        if (da !== db) return da < db ? 1 : -1;
        const ma = typeof a.mtime === "number" ? a.mtime : 0;
        const mb = typeof b.mtime === "number" ? b.mtime : 0;
        return ma < mb ? 1 : -1;
    });
}

/**
 * 获取最近N条交易(降序)
 */
export function getRecentTrades(
    trades: TradeRecord[],
    count: number = 30
): TradeRecord[] {
    return sortTradesByDateDesc(trades).slice(0, count);
}
