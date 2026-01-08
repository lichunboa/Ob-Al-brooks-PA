/**
 * 策略性能分析工具函数
 * 用于计算和处理策略相关的性能数据
 */

import type { TradeRecord } from "../core/contracts";

/**
 * 计算策略性能数据
 * 返回每个策略的总交易数、胜率、盈亏等信息
 */
export function calculateStrategyPerformance(
    trades: TradeRecord[],
    resolveCanonical: (t: TradeRecord) => string | null
): Map<string, { total: number; wins: number; pnl: number; lastDateIso: string }> {
    const perf = new Map<
        string,
        { total: number; wins: number; pnl: number; lastDateIso: string }
    >();

    for (const t of trades) {
        const canonical = resolveCanonical(t);
        if (!canonical) continue;

        const p = perf.get(canonical) ?? {
            total: 0,
            wins: 0,
            pnl: 0,
            lastDateIso: "",
        };

        p.total += 1;
        if (typeof t.pnl === "number" && Number.isFinite(t.pnl) && t.pnl > 0) {
            p.wins += 1;
        }
        if (typeof t.pnl === "number" && Number.isFinite(t.pnl)) {
            p.pnl += t.pnl;
        }
        if (t.dateIso && (!p.lastDateIso || t.dateIso > p.lastDateIso)) {
            p.lastDateIso = t.dateIso;
        }

        perf.set(canonical, p);
    }

    return perf;
}

/**
 * 生成策略手册性能行数据
 */
export function generatePlaybookPerfRows(
    strategyPerf: Map<string, { total: number; wins: number; pnl: number; lastDateIso: string }>,
    strategyIndex: any, // StrategyIndex类型未导出
    safePct: (a: number, b: number) => number
): Array<{
    canonical: string;
    path?: string;
    total: number;
    wins: number;
    pnl: number;
    winRate: number;
}> {
    const rows = [...strategyPerf.entries()]
        .map(([canonical, p]) => {
            const card = strategyIndex?.byName
                ? strategyIndex.byName(canonical)
                : undefined;
            return {
                canonical,
                path: card?.path,
                total: p.total,
                wins: p.wins,
                pnl: p.pnl,
                winRate: safePct(p.wins, p.total),
            };
        })
        .sort((a, b) => (b.pnl || 0) - (a.pnl || 0));

    return rows;
}
