
import * as React from "react";
import { App, TFile } from "obsidian";
import { DailyPlan, PlanChecklistItem } from "../types/plan";
import { TodayContext } from "../core/today-context";
import { ObsidianTodayContext } from "../platforms/obsidian/obsidian-today-context";
import { DailyPlanService } from "../core/daily-plan-service";

export interface UseDailyPlanReturn {
    plan: DailyPlan | null;
    loading: boolean;
    savePlan: (newPlan: DailyPlan) => Promise<void>;
    toggleChecklistItem: (index: number) => Promise<void>;
    refresh: () => void;
}

export function useDailyPlan(app: App, todayContext?: TodayContext): UseDailyPlanReturn {
    const [plan, setPlan] = React.useState<DailyPlan | null>(null);
    const [loading, setLoading] = React.useState(false);

    // Service
    const service = React.useMemo(() => new DailyPlanService(app), [app]);

    // Helpers
    const getFile = React.useCallback((): TFile | undefined => {
        if (todayContext instanceof ObsidianTodayContext) {
            return todayContext.getTodayFile();
        }
        return undefined;
    }, [todayContext]);

    // Load Plan
    const loadPlan = React.useCallback(async () => {
        const file = getFile();
        if (!file) {
            setPlan(null);
            return;
        }

        setLoading(true);
        try {
            // 1. Read Frontmatter
            const cache = app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter || {};

            // 2. Read Checklist from Content (Source of Truth)
            const checklist = await service.getChecklist(file);

            // 3. Construct DailyPlan Object
            const dailyPlan: DailyPlan = {
                date: fm.date || file.basename, // fallback
                focusSymbols: fm.plan_focus_symbols || [],
                strategies: fm.plan_strategies || [],
                riskLimit: fm.plan_risk_limit ?? 3,
                maxTrades: fm.plan_max_trades ?? 5,
                notes: fm.plan_notes || "",
                checklist: checklist.length > 0 ? checklist : (fm.plan_checklist || [])
            };

            setPlan(dailyPlan);
        } catch (e) {
            console.error("Failed to load daily plan", e);
        } finally {
            setLoading(false);
        }
    }, [app, getFile, service]);

    // Initial Load & Subscribe
    React.useEffect(() => {
        loadPlan();

        // Subscribe to changes
        const onFileChange = (changedFile: TFile) => {
            const currentFile = getFile();
            if (currentFile && changedFile.path === currentFile.path) {
                // Throttle? Or just reload
                loadPlan();
            }
        };

        const eventRef = app.metadataCache.on("changed", onFileChange);
        // Also listen to todayContext changes (e.g. day changed)
        const unsubContext = todayContext?.onChanged ? todayContext.onChanged(loadPlan) : undefined;

        return () => {
            app.metadataCache.offref(eventRef);
            if (unsubContext) unsubContext();
        };
    }, [loadPlan, todayContext, app]);

    // Actions
    const savePlan = async (newPlan: DailyPlan) => {
        const file = getFile();
        if (!file) return;

        // Update props in Frontmatter
        await app.fileManager.processFrontMatter(file, (fm) => {
            fm.plan_focus_symbols = newPlan.focusSymbols;
            fm.plan_strategies = newPlan.strategies;
            fm.plan_risk_limit = newPlan.riskLimit;
            fm.plan_max_trades = newPlan.maxTrades;
            fm.plan_notes = newPlan.notes;

            // Explicitly remove deprecated Plan attributes if they exist
            delete fm.plan_focus_timeframes;
            delete fm.focusTimeframes;
            delete fm["时间周期/timeframe"];

            delete fm.marketCycle;
            delete fm["市场周期/market_cycle"];

            delete fm.dayType;
            delete fm["日内类型/day_type"];

            delete fm.alwaysIn;
            delete fm["总是方向/always_in"];

            // Update legacy checklist frontmatter just in case? 
            // Or leave it drifting? 
            // Let's update it to ensure "PlanWidget" in Read Mode (if it reads from FM) works.
            // But we can't easily sync "done" status from here without complex logic.
            // Let's skip updating plan_checklist in FM to avoid fighting with Content.
        });

        // Reload to reflect changes
        loadPlan();
    };

    const toggleChecklistItem = async (index: number) => {
        const file = getFile();
        if (!file) return;

        // Optimistic UI update
        setPlan(prev => {
            if (!prev) return null;
            const newChecklist = [...prev.checklist];
            if (newChecklist[index]) {
                newChecklist[index] = { ...newChecklist[index], done: !newChecklist[index].done };
            }
            return { ...prev, checklist: newChecklist };
        });

        // Write to file
        await service.toggleChecklistItem(file, index, !plan?.checklist[index]?.done);

        // Eventually reload (the listener will catch the file mod)
    };

    return {
        plan,
        loading,
        savePlan,
        toggleChecklistItem,
        refresh: loadPlan
    };
}
