import * as React from "react";
import type { AccountType, TradeRecord } from "../../core/contracts";
import type { StrategyIndex } from "../../core/strategy-index";
import type { TodayContext } from "../../core/today-context";
import {
    computeDailyAgg,
    computeEquityCurve,
    computeStrategyAttribution,
    filterTradesByScope,
    type DailyAgg,
    type AnalyticsScope,
} from "../../core/analytics";
import { computeTradeStatsByAccountType } from "../../core/stats";
import { buildReviewHints } from "../../core/review-hints";
import { matchStrategies } from "../../core/strategy-matcher";

function toLocalDateIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getLastLocalDateIsos(days: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < Math.max(1, days); i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        out.push(toLocalDateIso(d));
    }
    return out;
}

function sumPnlR(trades: TradeRecord[]): number {
    let sum = 0;
    for (const t of trades) {
        if (typeof t.pnl === "number" && Number.isFinite(t.pnl)) sum += t.pnl;
    }
    return sum;
}

export function getRColorByAccountType(accountType: AccountType): string {
    switch (accountType) {
        case "Live":
            return "var(--text-success)";
        case "Demo":
            return "var(--text-warning)";
        case "Backtest":
            return "var(--text-accent)";
    }
}

function computeWindowRByAccountType(
    trades: TradeRecord[],
    windowSize: number
): Record<AccountType, number> {
    const by: Record<AccountType, TradeRecord[]> = {
        Live: [],
        Demo: [],
        Backtest: [],
    };
    for (const t of trades.slice(0, windowSize)) {
        const at = t.accountType;
        if (at === "Live" || at === "Demo" || at === "Backtest") by[at].push(t);
    }
    return {
        Live: sumPnlR(by.Live),
        Demo: sumPnlR(by.Demo),
        Backtest: sumPnlR(by.Backtest),
    };
}

export function useDashboardData(
    index: {
        getAll: () => TradeRecord[];
        onChanged: (cb: () => void) => () => void;
        getStatus?: () => any;
        onStatusChanged?: (cb: () => void) => () => void;
        rebuild?: () => Promise<void>;
    },
    strategyIndex: StrategyIndex,
    todayContext?: TodayContext
) {
    const [trades, setTrades] = React.useState(index.getAll());
    const [strategies, setStrategies] = React.useState<any[]>(() =>
        strategyIndex && (strategyIndex.list ? strategyIndex.list() : [])
    );
    const [status, setStatus] = React.useState<any>(() =>
        index.getStatus ? index.getStatus() : { phase: "ready" }
    );
    const [todayMarketCycle, setTodayMarketCycle] = React.useState<
        string | undefined
    >(() => todayContext?.getTodayMarketCycle());
    const [analyticsScope, setAnalyticsScope] = React.useState<AnalyticsScope>("Live");

    React.useEffect(() => {
        const onUpdate = () => setTrades(index.getAll());
        const unsubscribe = index.onChanged(onUpdate);
        onUpdate();
        return unsubscribe;
    }, [index]);

    React.useEffect(() => {
        if (!strategyIndex) return;
        const update = () => {
            try {
                const list = strategyIndex.list ? strategyIndex.list() : [];
                setStrategies(list);
            } catch (e) {
                console.warn("[al-brooks-console] strategyIndex.list() failed", e);
                setStrategies([]);
            }
        };
        update();
        if (strategyIndex.onChanged) return strategyIndex.onChanged(update);
        return () => { };
    }, [strategyIndex]);

    React.useEffect(() => {
        if (!todayContext?.onChanged) return;
        const onUpdate = () =>
            setTodayMarketCycle(todayContext.getTodayMarketCycle());
        const unsubscribe = todayContext.onChanged(onUpdate);
        onUpdate();
        return unsubscribe;
    }, [todayContext]);

    React.useEffect(() => {
        if (!index.onStatusChanged) return;
        const onStatus = () =>
            setStatus(index.getStatus ? index.getStatus() : { phase: "ready" });
        const unsubscribe = index.onStatusChanged(onStatus);
        onStatus();
        return unsubscribe;
    }, [index]);

    const onRebuild = React.useCallback(async () => {
        if (!index.rebuild) return;
        try {
            await index.rebuild();
        } catch (e) {
            console.warn("[al-brooks-console] Rebuild failed", e);
        }
    }, [index]);

    const summary = React.useMemo(
        () => computeTradeStatsByAccountType(trades),
        [trades]
    );
    const all = summary.All;

    const strategyStats = React.useMemo(() => {
        const total = strategies.length;
        const activeCount = strategies.filter((s) => s.status === "active")
            .length;
        const learningCount = strategies.filter((s) => s.status === "learning")
            .length;
        const totalUses = strategies.reduce((acc, s) => acc + (s.uses || 0), 0);
        return { total, activeCount, learningCount, totalUses };
    }, [strategies]);

    const latestTrade = trades.length > 0 ? trades[0] : undefined;
    const todayIso = React.useMemo(() => toLocalDateIso(new Date()), []);
    const todayTrades = React.useMemo(
        () => trades.filter((t) => t.dateIso === todayIso),
        [trades, todayIso]
    );
    const todaySummary = React.useMemo(
        () => computeTradeStatsByAccountType(todayTrades),
        [todayTrades]
    );
    const todayLatestTrade = todayTrades.length > 0 ? todayTrades[0] : undefined;

    const rLast10 = React.useMemo(
        () => computeWindowRByAccountType(trades, 10),
        [trades]
    );
    const rLast30 = React.useMemo(
        () => computeWindowRByAccountType(trades, 30),
        [trades]
    );
    const r10MaxAbs = React.useMemo(
        () =>
            Math.max(
                Math.abs(rLast10.Live),
                Math.abs(rLast10.Demo),
                Math.abs(rLast10.Backtest),
                0
            ),
        [rLast10]
    );
    const r30MaxAbs = React.useMemo(
        () =>
            Math.max(
                Math.abs(rLast30.Live),
                Math.abs(rLast30.Demo),
                Math.abs(rLast30.Backtest),
                0
            ),
        [rLast30]
    );
    const reviewHints = React.useMemo(() => {
        if (!latestTrade) return [];
        return buildReviewHints(latestTrade);
    }, [latestTrade]);

    const analyticsTrades = React.useMemo(
        () => filterTradesByScope(trades, analyticsScope),
        [trades, analyticsScope]
    );
    const analyticsDaily = React.useMemo(
        () => computeDailyAgg(analyticsTrades, 90),
        [analyticsTrades]
    );
    const analyticsDailyByDate = React.useMemo(() => {
        const m = new Map<string, DailyAgg>();
        for (const d of analyticsDaily) m.set(d.dateIso, d);
        return m;
    }, [analyticsDaily]);

    const calendarDays = 35;
    const calendarDateIsos = React.useMemo(
        () => getLastLocalDateIsos(calendarDays),
        []
    );
    const calendarCells = React.useMemo(() => {
        return calendarDateIsos.map(
            (dateIso) =>
                analyticsDailyByDate.get(dateIso) ?? { dateIso, netR: 0, count: 0 }
        );
    }, [calendarDateIsos, analyticsDailyByDate]);

    const equitySeries = React.useMemo(() => {
        const dateIsosAsc = [...calendarDateIsos].reverse();
        const filled: DailyAgg[] = dateIsosAsc.map(
            (dateIso) =>
                analyticsDailyByDate.get(dateIso) ?? { dateIso, netR: 0, count: 0 }
        );
        return computeEquityCurve(filled);
    }, [calendarDateIsos, analyticsDailyByDate]);

    const strategyAttribution = React.useMemo(() => {
        return computeStrategyAttribution(analyticsTrades, strategyIndex, 8);
    }, [analyticsTrades, strategyIndex]);

    const strategyPicks = React.useMemo(() => {
        return matchStrategies({
            todayContext,
            recentTrades: trades.slice(0, 5),
            strategyIndex,
        });
    }, [todayContext, trades, strategyIndex]);

    return {
        trades,
        strategies,
        status,
        todayMarketCycle,
        analyticsScope,
        setAnalyticsScope,
        onRebuild,
        summary,
        all,
        strategyStats,
        latestTrade,
        todayIso,
        todayTrades,
        todaySummary,
        todayLatestTrade,
        rLast10,
        rLast30,
        r10MaxAbs,
        r30MaxAbs,
        reviewHints,
        calendarCells,
        equitySeries,
        strategyAttribution,
        strategyPicks,
    };
}
