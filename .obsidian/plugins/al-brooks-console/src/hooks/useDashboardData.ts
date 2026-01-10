/**
 * useDashboardData Hook
 * 管理 Dashboard 的核心数据状态
 */

import * as React from "react";
import type { TradeIndex, TradeIndexStatus } from "../core/trade-index";
import type { TradeRecord } from "../core/contracts";
import type { StrategyIndex } from "../core/strategy-index";
import type { TodayContext } from "../core/today-context";

export interface UseDashboardDataProps {
    index: TradeIndex;
    strategyIndex: StrategyIndex;
    todayContext?: TodayContext;
    settings: any; // Using any to avoid circular dependency for now, or import AlBrooksConsoleSettings
    onSaveSettings: (settings: any) => Promise<void>;
}

export interface UseDashboardDataReturn {
    // 数据
    trades: TradeRecord[];
    strategies: any[];
    status: TradeIndexStatus;
    todayMarketCycle: string | undefined;

    // Journal Data
    journalLogs: any[];
    tradingPlans: any[];

    // 方法
    refreshTrades: () => void;
    refreshStrategies: () => void;
    saveJournalLog: (entry: any) => Promise<void>;
    saveTradingPlan: (plan: any) => Promise<void>;
}

/**
 * 管理 Dashboard 的核心数据状态
 * - 订阅 trades 变化
 * - 订阅 strategies 变化
 * - 订阅 todayContext 变化
 */
export function useDashboardData({
    index,
    strategyIndex,
    todayContext,
    settings,
    onSaveSettings,
}: UseDashboardDataProps): UseDashboardDataReturn {
    // State
    const [trades, setTrades] = React.useState<TradeRecord[]>(() => index.getAll());
    const [strategies, setStrategies] = React.useState<any[]>(
        () => strategyIndex && (strategyIndex.list ? strategyIndex.list() : [])
    );
    const [status, setStatus] = React.useState<TradeIndexStatus>(() =>
        index.getStatus ? index.getStatus() : { phase: "ready" }
    );
    const [todayMarketCycle, setTodayMarketCycle] = React.useState<string | undefined>(
        () => todayContext?.getTodayMarketCycle()
    );

    // Journal Data Accessors
    const journalLogs = React.useMemo(() => settings?.journalLogs ?? [], [settings]);
    const tradingPlans = React.useMemo(() => settings?.tradingPlans ?? [], [settings]);

    const saveJournalLog = React.useCallback(async (entry: any) => {
        if (!settings) return;
        const logs = settings.journalLogs ? [...settings.journalLogs] : [];
        const existingIdx = logs.findIndex((l: any) => l.date === entry.date);
        if (existingIdx >= 0) {
            logs[existingIdx] = entry;
        } else {
            logs.push(entry);
        }
        await onSaveSettings({ ...settings, journalLogs: logs });
    }, [settings, onSaveSettings]);

    const saveTradingPlan = React.useCallback(async (plan: any) => {
        if (!settings) return;
        const plans = settings.tradingPlans ? [...settings.tradingPlans] : [];
        const existingIdx = plans.findIndex((p: any) => p.date === plan.date);
        if (existingIdx >= 0) {
            plans[existingIdx] = plan;
        } else {
            plans.push(plan);
        }
        await onSaveSettings({ ...settings, tradingPlans: plans });
    }, [settings, onSaveSettings]);

    // 订阅 trades 变化
    React.useEffect(() => {
        const onUpdate = () => setTrades(index.getAll());
        const unsubscribe = index.onChanged(onUpdate);
        onUpdate();
        return unsubscribe;
    }, [index]);

    // 订阅 strategies 变化
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
        const unsubscribe = strategyIndex.onChanged
            ? strategyIndex.onChanged(update)
            : undefined;
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, [strategyIndex]);

    // 订阅 todayContext 变化
    React.useEffect(() => {
        if (!todayContext?.onChanged) return;
        const onUpdate = () =>
            setTodayMarketCycle(todayContext.getTodayMarketCycle());
        const unsubscribe = todayContext.onChanged(onUpdate);
        onUpdate();
        return unsubscribe;
    }, [todayContext]);

    // 方法
    const refreshTrades = React.useCallback(() => {
        setTrades(index.getAll());
    }, [index]);

    const refreshStrategies = React.useCallback(() => {
        if (strategyIndex && strategyIndex.list) {
            setStrategies(strategyIndex.list());
        }
    }, [strategyIndex]);

    return {
        trades,
        strategies,
        status,
        todayMarketCycle,
        refreshTrades,
        refreshStrategies,
        journalLogs,
        tradingPlans,
        saveJournalLog,
        saveTradingPlan,
    };
}
