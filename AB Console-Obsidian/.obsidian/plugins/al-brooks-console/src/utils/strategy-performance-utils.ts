/**
 * 策略性能分析工具函数
 * 用于计算和处理策略相关的性能数据
 */

import type { TradeRecord, AccountType } from "../core/contracts";
import { sortTradesByDateAsc } from "./trade-utils";

/**
 * 计算策略性能数据
 * 返回每个策略的总交易数、胜率、盈亏等信息
 */
/**
 * 计算策略性能数据
 * 返回每个策略的总交易数、胜率、盈亏等信息
 */
export function calculateStrategyPerformance(
    trades: TradeRecord[],
    resolveCanonical: (t: TradeRecord) => string | null
): Map<string, { total: number; wins: number; pnlMoney: number; pnlR: number; lastDateIso: string }> {
    const perf = new Map<
        string,
        { total: number; wins: number; pnlMoney: number; pnlR: number; lastDateIso: string }
    >();

    for (const t of trades) {
        const canonical = resolveCanonical(t);
        if (!canonical) continue;

        const p = perf.get(canonical) ?? {
            total: 0,
            wins: 0,
            pnlMoney: 0,
            pnlR: 0,
            lastDateIso: "",
        };

        const pnl = typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

        let r = 0;
        if (typeof t.r === "number" && Number.isFinite(t.r)) {
            r = t.r;
        } else if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
            r = pnl / t.initialRisk;
        }

        p.total += 1;
        if (pnl > 0) {
            p.wins += 1;
        }

        p.pnlMoney += pnl;
        p.pnlR += r;

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
    strategyPerf: Map<string, { total: number; wins: number; pnlMoney: number; pnlR: number; lastDateIso: string }>,
    strategyIndex: any, // StrategyIndex类型未导出
    safePct: (a: number, b: number) => number
): Array<{
    canonical: string;
    path?: string;
    total: number;
    wins: number;
    pnlMoney: number; // 主要展示 Money
    pnlR: number;    // 次要展示 R
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
                pnlMoney: p.pnlMoney,
                pnlR: p.pnlR,
                winRate: safePct(p.wins, p.total),
            };
        })
        .sort((a, b) => (b.pnlMoney || 0) - (a.pnlMoney || 0)); // 按 Money 排序

    return rows;
}

/**
 * 计算策略实验室数据
 * @param trades 交易记录数组
 * @param identifyStrategy 策略识别函数
 * @returns 策略实验室数据(资金曲线、累计盈亏、Top策略、建议)
 */
export function computeStrategyLab(
    trades: TradeRecord[],
    identifyStrategy: (t: TradeRecord) => { name: string | null }
): {
    curves: Record<AccountType, number[]>;
    curvesR: Record<AccountType, number[]>;
    cumMoney: Record<AccountType, number>;
    cumR: Record<AccountType, number>;
    topSetups: Array<{ name: string; total: number; wr: number }>;
    suggestion: string;
} {
    const tradesAsc = sortTradesByDateAsc(trades);

    const curves: Record<AccountType, number[]> = {
        Live: [0],
        Demo: [0],
        Backtest: [0],
    };
    const curvesR: Record<AccountType, number[]> = {
        Live: [0],
        Demo: [0],
        Backtest: [0],
    };

    const cumMoney: Record<AccountType, number> = {
        Live: 0,
        Demo: 0,
        Backtest: 0,
    };
    const cumR: Record<AccountType, number> = {
        Live: 0,
        Demo: 0,
        Backtest: 0,
    };

    const stats = new Map<string, { win: number; total: number }>();

    for (const t of tradesAsc) {
        const pnl =
            typeof t.pnl === "number" && Number.isFinite(t.pnl) ? t.pnl : 0;

        let r = 0;
        if (typeof t.r === "number" && Number.isFinite(t.r)) {
            r = t.r;
        } else if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
            r = pnl / t.initialRisk;
        }

        // Safety check for account type
        let acct = (t.accountType ?? "Live") as AccountType;
        if (!["Live", "Demo", "Backtest"].includes(acct)) {
            acct = "Live";
        }

        // 资金曲线:按账户分别累加
        cumMoney[acct] += pnl;
        curves[acct].push(cumMoney[acct]);

        cumR[acct] += r;
        curvesR[acct].push(cumR[acct]);

        // 策略排行
        const key = identifyStrategy(t).name ?? "Unknown";

        const prev = stats.get(key) ?? { win: 0, total: 0 };
        prev.total += 1;
        if (pnl > 0) prev.win += 1;
        stats.set(key, prev);
    }

    const topSetups = [...stats.entries()]
        .map(([name, v]) => ({
            name,
            total: v.total,
            wr: v.total > 0 ? Math.round((v.win / v.total) * 100) : 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    const mostUsed = topSetups[0]?.name ?? "无";
    const keepIn = cumMoney.Live < 0 ? "回测" : "实盘";

    return {
        curves,
        curvesR,
        cumMoney,
        cumR,
        topSetups,
        suggestion: `当前最常用的策略是 ${mostUsed}。建议在 ${keepIn} 中继续保持执行一致性。`,
    };
}
